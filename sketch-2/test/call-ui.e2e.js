// The slimmer Sidekick call, the "I've got everything" confirmation, and the call-side features, end to end in a
// real browser against the real server (AI off, places off, the voice agent's setup present but never reached):
//
//  1. The call is full screen: the bar is exactly mic, chat, orb and leave; nothing else is visible.
//  2. The orb sheet has every control that moved there (leads / sits back, talk in the app and mute, captions,
//     natural or built-in voice, read aloud, invite friends, ask for picks, don't learn), each
//     works, focus stays inside, Escape closes it and focus goes back to the orb.
//  3. The voice-command hint shows once per phone; typed or spoken commands work, each with a short note.
//  4. The confirmation card: the persona's line and the public facts (no names, no private answers), then it
//     carries on by itself; "Change something" turns the facts into buttons and one reopens its card.
//  5. The order on screen: confirmation, then the steps, then the picks.
//  6. /sk?pick=<id> (Saved's "Plan it"): the event's night is picked, the room plans around it, and it's a pick.
//  7. "Delete call history": no recaps from before then, and nothing saved with call history switched off.
//  8. "Don't learn from this plan": that person's taste doesn't move; someone else's does.
//  9. A form's "Decide by": the pink "Closes ..." tag, and at that time the form closes and Sidekick picks.
// 10. Friends picked in the app get an in-app invite linking to the room, held during their quiet hours.
// 11. The app's tab bar is hidden during a live call and back when it ends, with "Back to SideQuest".
// 12. 375 and 1280 px: no sideways scroll, 44 px targets, text 12 px or larger, weights 400/500/600.
// 13. The People sheet (from the people row, "+N" for invited people), the chat sheet (unread dot, typing),
//     minimize ("On call · Return" over the app, the same call still live) and no page scroll at 375×667 and 390×844.
//
// Screenshots (375 px, 2x) go to CALLUI_SHOTS (or a temp folder). The database file is copied first and put back.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/call-ui.e2e.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");
const { spawn } = require("child_process");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); }

const ROOT = path.join(__dirname, "..");
const DB = path.join(ROOT, "data", "db.json");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "call-ui-"));
const SHOTS = process.env.CALLUI_SHOTS || path.join(tmp, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (err) { last = err.message; }
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
    await wait(150);
  }
}
const torontoDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const torontoHM = (t) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));

(async () => {
  const backup = fs.existsSync(DB) ? fs.readFileSync(DB) : null;
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: {
      ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "",
      SIDEKICK_PLACES_OFF: "1", SIDEKICK_STUN_URL: "off", SIDEKICK_THINK_REVEAL_MS: "0", SIDEKICK_NOTIFY_TICK_MS: "500",
      // The natural-voice switch shows when an agent is set up; the session itself is never reached (the test answers for it)
      ELEVENLABS_API_KEY: "test-key", ELEVENLABS_AGENT_FRIEND: "agent_friend", ELEVENLABS_AGENT_CONCIERGE: "agent_concierge",
      ELEVENLABS_MINUTES_PER_MONTH: "100", ELEVENLABS_STOP_AT: "1", ELEVENLABS_DAILY_MINUTES: "100", SIDEKICK_ELEVENLABS_OFF: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const get = (p) => fetch(base + p).then((r) => r.json());
  const act = async (user, type, args) => { const r = await post("/api/act", { user, type, args }); if (r.status !== 200) throw new Error(`${type}: ${r.body.error}`); return r.body.result; };
  const state = async (user) => (await get(`/api/state?user=${user}`)).user;
  // One view of a room from its live stream
  const viewOf = async (room, p) => {
    const ctrl = new AbortController();
    const r = await fetch(`${base}/api/sk/rooms/${room}/stream?p=${encodeURIComponent(p)}`, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = "";
    const reader = r.body.getReader();
    let view = null;
    while (!view) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const m = buf.match(/^data: (.+)$/m);
      if (m) view = JSON.parse(m[1]);
    }
    reader.cancel().catch(() => {});
    ctrl.abort();
    return view;
  };

  let browser;
  const pageErrors = [];
  try {
    await until(() => fetch(`${base}/api/sk/nights`).then((r) => r.ok), 30000, "the server");
    const rnd = Math.random().toString(36).slice(2, 8);
    const account = async (name) => {
      const { userId } = await act(null, "signup", { name, email: `${name.split(" ")[0].toLowerCase()}.${rnd}@callui-test.dev`, username: `${name.split(" ")[0].toLowerCase()}${rnd}` });
      await act(userId, "setProfile", { vibes: ["Live music", "Comedy"] });
      await act(userId, "setProfile", { registered: true });
      return userId;
    };
    const asia = await account("Asia Lee");
    const ravi = await account("Ravi Shah");
    const tess = await account("Tess Moreau");
    for (const f of [ravi, tess]) {
      await act(asia, "addFriend", { key: `u:${f}` });
      await act(f, "answerFriend", { id: asia, accept: true });
    }
    const setup0 = await get(`/api/sk/plan/setup?user=${asia}&persona=friend`);
    // A night with plenty on: the busiest Saturday (or Friday) in the window
    const sat = setup0.nights.filter((n) => ["Sat", "Fri"].includes(n.dow) && n.date > setup0.nights[0].date).sort((a, b) => b.events - a.events)[0];
    assert(sat && sat.events >= 4, `a night with events (${sat && sat.events})`);
    const SAT = sat.date;
    const DAYNAME = new Date(SAT + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
    const events = JSON.parse(await (await fetch(`${base}/api/events`)).text());
    const list = Array.isArray(events) ? events : events.events;
    const onSat = list.filter((e) => e.startsAt && torontoDay(e.startsAt) === SAT && Date.parse(e.startsAt) > Date.now() && (e.vibes || []).length);

    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const phone = async ({ width = 375, height = 812, user = asia, rooms = {} } = {}) => {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 });
      await ctx.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await ctx.addInitScript(([u, r]) => {
        try {
          if (u) localStorage.setItem("sq2.user", u);
          localStorage.setItem("sk:agentVoice", "false");
          for (const [rid, me] of Object.entries(r)) localStorage.setItem(`sk:${rid}`, JSON.stringify(me));
        } catch {}
      }, [user, rooms]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      return { ctx, page };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });

    // A call with Asia (planner, voice, signed in) and Ravi (typing, signed in), on SAT
    const newCall = async ({ persona = "friend", noLearn = false, pick } = {}) => {
      const made = await post("/api/sk/rooms", { name: "Asia", crew: "Test crew", nights: [SAT], persona, user: asia, noLearn, pick });
      assert.strictEqual(made.status, 200, JSON.stringify(made.body));
      const rid = made.body.room;
      const A = made.body.person;
      const R = (await post(`/api/sk/rooms/${rid}/join`, { name: "Ravi", mode: "text", user: ravi, answers: {} })).body.person;
      return { rid, A, R };
    };
    // Through the check-in vote: both say "lead"
    const toLead = async ({ rid, A, R }) => {
      await until(async () => (await viewOf(rid, A)).mode === "voting", 8000, "the check-in vote");
      await post(`/api/sk/rooms/${rid}/answer`, { p: A, slot: "mode", value: "lead" });
      await post(`/api/sk/rooms/${rid}/answer`, { p: R, slot: "mode", value: "lead" });
      await until(async () => (await viewOf(rid, A)).mode === "lead", 8000, "Sidekick leading");
    };
    // Everything Sidekick needs, by tap (Ravi also says Scarborough is a no, privately)
    const answerAll = async ({ rid, A, R }, { time = "late" } = {}) => {
      for (const p of [A, R]) {
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "budget", value: "30" });
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "origin", value: "union" });
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "vibe", value: ["music"] });
      }
      await post(`/api/sk/rooms/${rid}/answer`, { p: R, slot: "nos", value: ["Scarborough"] });
      for (const p of [A, R]) await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "time", value: [time] });
    };
    const callPage = async (call, opts = {}) => {
      const ph = await phone({ ...opts, rooms: { [call.rid]: { person: call.A, mode: "voice" } } });
      await ph.page.goto(`${base}/sk/${call.rid}?cardwait=0`);
      await ph.page.waitForSelector("#dock .ctrls");
      return ph;
    };
    const visibleIds = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent && getComputedStyle(e).visibility !== "hidden").map((e) => e.id || e.className));
    // Layout and accessibility basics for what's on screen (the call, an open sheet)
    const basics = async (page, where) => {
      const m = await page.evaluate(() => {
        const roots = [document.getElementById("app"), document.getElementById("orbSheet"), document.getElementById("sheet"), document.getElementById("chatSheet"), document.getElementById("callNav")].filter(Boolean);
        const els = roots.flatMap((r) => [...r.querySelectorAll("*")]).filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest(".sr"));
        const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
        const weights = [...new Set(els.map((e) => getComputedStyle(e).fontWeight))];
        const targets = roots.flatMap((r) => [...r.querySelectorAll("#dock button, #top button, .sheet-panel button, .board.confirm button, .pf-tab")]).filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.className || b.textContent.trim(), s: Math.min(r.width, r.height) }; });
        const dock = document.getElementById("dock");
        const dockTop = dock && !dock.hidden ? dock.getBoundingClientRect().top : innerHeight;
        window.scrollTo(0, document.scrollingElement.scrollHeight);
        // The card area scrolls inside itself in the full-screen call: measure the area, not what's inside it
        const live = document.body.classList.contains("sk-live");
        const content = [...document.querySelectorAll(live ? "#body" : "#body > *, #ticks > *")].filter((e) => e.offsetParent);
        const bottom = Math.max(0, ...content.map((e) => e.getBoundingClientRect().bottom));
        window.scrollTo(0, 0);
        return { overflow: document.scrollingElement.scrollWidth - innerWidth, minSize: Math.min(...sizes), weights, small: targets.filter((t) => t.s < 43.5), bottom, dockTop };
      });
      assert(m.overflow <= 0, `${where}: no sideways scroll (${m.overflow}px)`);
      assert(m.minSize >= 12, `${where}: text 12px or larger (${m.minSize})`);
      assert(m.weights.every((w) => ["400", "500", "600"].includes(w)), `${where}: weights 400/500/600 (${m.weights})`);
      assert.deepStrictEqual(m.small, [], `${where}: 44px targets`);
      assert(m.bottom <= m.dockTop + 0.5, `${where}: nothing under the bar (${m.bottom} vs ${m.dockTop})`);
    };

    await test("1. The bar is exactly mic, chat, orb and leave", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.waitForSelector("#body .q, #body .board");
      assert.deepStrictEqual(await visibleIds(page, "#dock button"), ["mic", "chatBtn", "orbBtn", "leave"], "four buttons in the bar");
      const order = await page.$$eval("#dock .ctrls button", (bs) => bs.map((b) => [b.id, b.getBoundingClientRect().left]));
      assert(order[3][0] === "leave" && order.every((x, i) => !i || x[1] > order[i - 1][1]), "leave is on the right");
      for (const sel of ["#audioBtn", "#agent", ".seg", "#aloud", "#kb", "#invitePill", ".invite", "#compose:not([hidden])", "#capsBtn", "#learnBtn", "#ticks .tick"]) {
        assert.strictEqual((await page.locator(sel).count()) > 0 && (await page.locator(sel).first().isVisible()), false, `${sel} isn't on screen`);
      }
      const bar = await page.$eval("#dock .ctrls", (e) => e.getBoundingClientRect().height);
      assert(bar >= 44, `the bar is 44px or taller (${bar})`);
      await basics(page, "375 slim call");
      await shot(page, "375-slim-call.png");
      await ctx.close();
    });

    await test("2. The orb sheet has every moved control, each works, and it's a proper dialog", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.click("#orbBtn");
      await page.waitForSelector("#orbSheet [role=dialog]");
      assert.strictEqual(await page.getAttribute("#orbBtn", "aria-expanded"), "true");
      for (const sel of ['[data-setmode="lead"]', '[data-setmode="sidelines"]', "#audioBtn", "#capsBtn", "#agent", "#aloud", "#inviteBtn", "#ask", "#learnBtn"]) assert(await page.locator(`#orbSheet ${sel}`).isVisible(), `${sel} is in the sheet`);
      assert(await page.evaluate(() => document.getElementById("orbSheet").contains(document.activeElement)), "focus moves into the sheet");
      await basics(page, "375 orb sheet");
      await wait(350); // the sheet's slide-up has finished
      await shot(page, "375-orb-sheet.png");
      // Focus stays inside; Escape closes and focus goes back to the orb
      for (let i = 0; i < 16; i++) await page.keyboard.press("Tab");
      assert(await page.evaluate(() => document.getElementById("orbSheet").contains(document.activeElement)), "Tab stays in the sheet");
      await page.keyboard.press("Shift+Tab");
      assert(await page.evaluate(() => document.getElementById("orbSheet").contains(document.activeElement)), "Shift+Tab stays in the sheet");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator("#orbSheet").count(), 0, "Escape closes the sheet");
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), "orbBtn", "focus back on the orb");

      // Sidekick sits back, then leads again (with a short note each time)
      await page.click("#orbBtn");
      await page.click('#orbSheet [data-setmode="sidelines"]');
      await until(async () => (await viewOf(call.rid, call.A)).mode === "sidelines", 6000, "sitting back");
      await page.waitForFunction(() => document.querySelector('#orbSheet [data-setmode="sidelines"]').getAttribute("aria-checked") === "true");
      await page.waitForFunction(() => /sitting back/i.test(document.getElementById("toast").textContent));
      await page.click('#orbSheet [data-setmode="lead"]');
      await until(async () => (await viewOf(call.rid, call.A)).mode === "lead", 6000, "leading again");
      // Talk in the app: on (status chip), mute, off
      await page.click("#orbSheet #audioBtn");
      await page.waitForFunction(() => document.querySelector("#orbSheet #audioBtn").getAttribute("aria-checked") === "true", null, { timeout: 8000 });
      await page.waitForSelector("#top #chipAudio");
      assert.strictEqual((await page.textContent("#chipAudio")).trim(), "In-app audio");
      assert.strictEqual(await page.$eval("#chipAudio", (e) => e.tagName), "SPAN", "status is a chip, not a button");
      const muted0 = await page.getAttribute("#orbSheet #muteBtn", "aria-checked");
      await page.click("#orbSheet #muteBtn");
      await page.waitForFunction((m) => document.querySelector("#orbSheet #muteBtn").getAttribute("aria-checked") !== m, muted0);
      await page.click("#orbSheet #audioBtn");
      await page.waitForFunction(() => document.querySelector("#orbSheet #audioBtn").getAttribute("aria-checked") === "false");
      assert.strictEqual(await page.locator("#chipAudio").count(), 0, "the chip goes with it");
      // Captions off and on (what's said aloud shows in the chat sheet while captions are on)
      await page.click("#orbSheet #capsBtn");
      assert.strictEqual(await page.getAttribute("#orbSheet #capsBtn", "aria-checked"), "false");
      await page.click("#orbSheet #capsBtn");
      assert.strictEqual(await page.getAttribute("#orbSheet #capsBtn", "aria-checked"), "true");
      // Read aloud
      const aloud0 = await page.getAttribute("#orbSheet #aloud", "aria-checked");
      await page.click("#orbSheet #aloud");
      assert.notStrictEqual(await page.getAttribute("#orbSheet #aloud", "aria-checked"), aloud0);
      // Don't learn from this plan (saved on the server for this person)
      await page.click("#orbSheet #learnBtn");
      await until(async () => (await viewOf(call.rid, call.A)).me.noLearn === true, 4000, "don't learn on");
      // Natural voice: the switch asks for the agent (answered here: it's resting), the call carries on with the built-in voice
      await page.route("**/voice-agent", (rt) => rt.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "resting", fallback: true, capped: true }) }));
      await page.click("#orbSheet #agent");
      await page.waitForFunction(() => /natural voice is resting/i.test(document.getElementById("toast").textContent));
      await page.waitForFunction(() => !document.querySelector("#orbSheet #agent"));
      // Invite friends: the People sheet
      await page.click("#orbSheet #inviteBtn");
      await page.waitForSelector("#sheet [role=dialog] #copy");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), "orbBtn", "focus back on the orb after the share sheet");
      await ctx.close();
    });

    await test("3. The voice-command hint shows once; commands work, each with a short note", async () => {
      const c1 = await newCall();
      await toLead(c1);
      const ph = await phone({ rooms: {} });
      await ph.page.evaluate(() => 0);
      await ph.page.goto(`${base}/`);
      await ph.page.evaluate(([rid, me]) => localStorage.setItem(`sk:${rid}`, JSON.stringify(me)), [c1.rid, { person: c1.A, mode: "voice" }]);
      await ph.page.goto(`${base}/sk/${c1.rid}?cardwait=0`);
      await ph.page.waitForSelector("#vhint");
      assert.match(await ph.page.textContent("#vhint"), /Try saying .Sidekick, sit back./);
      // Typed commands (the same path as speech), from the chat sheet's "Type a message…"
      await ph.page.click("#chatBtn");
      await ph.page.fill("#chatLine", "Sidekick, mute me");
      await ph.page.press("#chatLine", "Enter");
      await ph.page.waitForFunction(() => /Muted/.test(document.getElementById("toast").textContent));
      await ph.page.fill("#chatLine", "Sidekick, invite someone");
      await ph.page.press("#chatLine", "Enter");
      await ph.page.waitForSelector("#sheet [role=dialog] #copy");
      assert.strictEqual(await ph.page.locator("#chatSheet").count(), 0, "the chat sheet gives way to the People sheet");
      await ph.page.keyboard.press("Escape");
      await ph.page.click("#chatBtn");
      await ph.page.fill("#chatLine", "Sidekick, sit back");
      await ph.page.press("#chatLine", "Enter");
      await until(async () => (await viewOf(c1.rid, c1.A)).mode === "sidelines", 6000, "Sidekick sitting back after the command");
      await ph.page.waitForFunction(() => /sitting back/i.test(document.getElementById("toast").textContent));
      // A second call on the same phone: no hint
      const c2 = await newCall();
      await toLead(c2);
      await ph.page.evaluate(([rid, me]) => localStorage.setItem(`sk:${rid}`, JSON.stringify(me)), [c2.rid, { person: c2.A, mode: "voice" }]);
      await ph.page.goto(`${base}/sk/${c2.rid}?cardwait=0`);
      await ph.page.waitForSelector("#dock .ctrls");
      await wait(800);
      assert.strictEqual(await ph.page.locator("#vhint").count(), 0, "the hint doesn't show again");
      await ph.ctx.close();
    });

    await test("4+5. The confirmation card: public facts only, then on by itself; confirmation, steps, picks in that order", async () => {
      const call = await newCall({ persona: "friend" });
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await answerAll(call);
      await page.waitForSelector(".board.confirm", { timeout: 10000 });
      assert.strictEqual((await page.textContent(".cf-line")).trim(), "Okay, I think I've got it!");
      const recap = (await page.textContent("#cfRecap")).trim();
      assert.strictEqual(recap.replace(/\u00a0/g, " "), `${DAYNAME} after 8 · Live music · around Union · under $30 for the group`);
      const card = await page.textContent(".board.confirm");
      for (const bad of ["Asia", "Ravi", "Scarborough", "$20", "$50"]) assert(!card.includes(bad), `nothing private or named on the card (${bad})`);
      assert(await page.locator("#cfOk").isVisible() && (await page.locator("#cfChange").isVisible()), "Looks good / Change something");
      await basics(page, "375 confirmation");
      await shot(page, "375-confirmation.png");
      // Spoken (or shown) in the persona's voice too, from the line book's confirm move
      await page.waitForFunction(() => /I think I've got it/.test(document.getElementById("say").textContent));
      assert.match(await page.textContent("#say"), /after 8, Live music, around Union, under \$30 for the group/, "the spoken line recaps the plan");
      // Nobody taps: about 4 s later, the steps and then the picks
      await page.waitForSelector(".pick-card", { timeout: 12000 });
      const stages = await page.evaluate(() => window.__skStages);
      const i = (s) => stages.lastIndexOf(s);
      assert(i("confirm") >= 0 && i("thinking") > i("confirm") && i("picks") > i("thinking"), `confirmation, then steps, then picks (${stages})`);
      await ctx.close();

      // The concierge's line, and "Looks good" goes on at once
      const c2 = await newCall({ persona: "concierge" });
      await toLead(c2);
      const p2 = await callPage(c2);
      await answerAll(c2);
      await p2.page.waitForSelector(".board.confirm", { timeout: 10000 });
      assert.strictEqual((await p2.page.textContent(".cf-line")).trim(), "Thank you, I have everything I need.");
      const t0 = Date.now();
      await p2.page.click("#cfOk");
      await p2.page.waitForSelector(".pick-card", { timeout: 6000 });
      assert(Date.now() - t0 < 3500, `Looks good doesn't wait for the timer (${Date.now() - t0} ms)`);
      await p2.ctx.close();
    });

    await test("4b. Change something: the facts become buttons and one reopens its card", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await answerAll(call);
      await page.waitForSelector("#cfChange", { timeout: 10000 });
      await page.click("#cfChange");
      await page.waitForSelector('[data-reopen="time"]');
      await wait(4500);
      assert.strictEqual(await page.locator(".pick-card").count(), 0, "it waits while people change things");
      assert.deepStrictEqual(await page.$$eval("[data-reopen]", (b) => b.map((x) => x.dataset.reopen)), ["night", "time", "vibe", "origin", "budget"]);
      await page.click('[data-reopen="time"]');
      await page.waitForFunction(() => document.querySelector("#body .q h2") && /time/i.test(document.querySelector("#body .q h2").textContent), null, { timeout: 6000 });
      assert.strictEqual(await page.locator(".board.confirm").count(), 0, "the card gives way to the question");
      for (const p of [call.A, call.R]) await post(`/api/sk/rooms/${call.rid}/answer`, { p, slot: "time", value: ["evening"] });
      await page.waitForSelector(".board.confirm", { timeout: 8000 });
      assert.match(await page.textContent("#cfRecap"), /after 6/, "the new answer is in the recap");
      await ctx.close();
    });

    await test("6. /sk?pick=<id>: the event's night is picked, the room plans around it, and it's a pick", async () => {
      // One that fits the plan's hard limits from Union (in Toronto, an afternoon or evening start, not too far)
      const hour = (iso) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
      const ev = onSat.find((e) => e.area !== "Beyond Toronto" && hour(e.startsAt) >= 11 && !(e.travel && e.travel.from && e.travel.from.union && e.travel.from.union.minutes > 60));
      assert(ev, "an event on that night");
      const info = await get(`/api/sk/pick?id=${ev.id}`);
      assert.strictEqual(info.date, SAT);
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?pick=${ev.id}&persona=friend`);
      await page.waitForSelector("#pfPick");
      assert((await page.textContent("#pfPick")).includes(ev.title), "the event is on the intro");
      assert.strictEqual((await page.textContent("#pfGo")).trim(), "Plan around this event");
      await page.click("#pfGo");
      await page.click("#pfNext"); // the squad
      await page.waitForSelector(".pf-night");
      assert.deepStrictEqual(await page.$$eval('.pf-night[aria-pressed="true"]', (b) => b.map((x) => x.dataset.date)), [SAT], "that night is picked");
      await page.click("#pfNext");
      await page.click("#pfLearn"); // and don't learn from it (the planner's own switch)
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForSelector("#dock .ctrls");
      const rid = page.url().split("/sk/")[1];
      const me = await page.evaluate((r) => JSON.parse(localStorage.getItem(`sk:${r}`)), rid);
      const v = await viewOf(rid, me.person);
      assert.strictEqual(v.candidate, ev.id, "the room plans around the event");
      assert.strictEqual(v.me.noLearn, true, "Don't learn from this plan, from the last step");
      await page.waitForSelector(".cand-note");
      // Asked for picks: it's the first one
      const R = (await post(`/api/sk/rooms/${rid}/join`, { name: "Ravi", mode: "text", answers: {} })).body.person;
      await until(async () => { await post(`/api/sk/rooms/${rid}/ask`, { p: me.person }); return (await viewOf(rid, R)).picks; }, 10000, "picks");
      const picks = (await viewOf(rid, R)).picks;
      assert.strictEqual(picks[0].id, ev.id, "the saved event is a pick");
      assert.strictEqual(picks[0].candidate, true);
      await page.waitForFunction(() => /You saved this/.test(document.body.textContent));
      await ctx.close();
    });

    await test("7. Delete call history: nothing from before it, and nothing saved with call history off", async () => {
      const lockCall = async (c) => {
        await until(async () => { await post(`/api/sk/rooms/${c.rid}/ask`, { p: c.A }); return (await viewOf(c.rid, c.A)).picks; }, 10000, "picks");
        const r = await post(`/api/sk/rooms/${c.rid}/lock`, { p: c.A });
        assert.strictEqual(r.status, 200);
      };
      const first = await newCall();
      await lockCall(first);
      let calls = (await get(`/api/sk/calls?user=${asia}`)).calls;
      assert(calls.some((c) => c.room === first.rid && c.locked && c.locked.title), "a recap is saved for the planner");
      assert((await get(`/api/sk/calls?user=${ravi}`)).calls.some((c) => c.room === first.rid), "and for the friend who's signed in");
      const recapText = JSON.stringify(calls.find((c) => c.room === first.rid));
      assert(!/Ravi|Scarborough/.test(recapText), "the recap has no one else's name or private answers");
      const before = await newCall(); // started before the delete, locked after
      await act(asia, "deleteCallHistory", {});
      calls = (await get(`/api/sk/calls?user=${asia}`)).calls;
      assert.deepStrictEqual(calls, [], "nothing from before the delete");
      await lockCall(before);
      assert.deepStrictEqual((await get(`/api/sk/calls?user=${asia}`)).calls, [], "a call that started before the delete isn't saved");
      const after = await newCall();
      await lockCall(after);
      calls = (await get(`/api/sk/calls?user=${asia}`)).calls;
      assert.deepStrictEqual(calls.map((c) => c.room), [after.rid], "a call after the delete is saved");
      // The Plan tab shows the last plan
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.waitForSelector("#pfLast");
      await ctx.close();
      // Call history switched off (user.settings.privacy.callHistory = false): nothing new is saved
      const planflow = require(path.join(ROOT, "lib", "sidekick", "planflow"));
      const callside = require(path.join(ROOT, "lib", "sidekick", "callside"));
      const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
      const users = { on: { id: "on", settings: {} }, off: { id: "off", settings: { privacy: { callHistory: false } } } };
      planflow.init({ db: { data: { users, events: [] }, save() {} }, friendList: () => [], person: () => null });
      const room = { id: "r1", crew: "Crew", createdAt: Date.now(), nights: [SAT], people: [{ id: "a", name: "On", user: "on", role: "planner" }, { id: "b", name: "Off", user: "off", role: "friend" }], answers: { a: {}, b: {} }, locked: null };
      assert(P.facts(room));
      callside.saveRecap(room);
      assert.strictEqual(users.on.calls.length, 1, "saved with call history on");
      assert.strictEqual(users.off.calls, undefined, "nothing saved with call history off");
    });

    await test("8. Don't learn from this plan: that person's taste doesn't move; someone else's does", async () => {
      const call = await newCall({ noLearn: true });
      const a0 = (await state(asia)).taste;
      const r0 = (await state(ravi)).taste;
      await until(async () => { await post(`/api/sk/rooms/${call.rid}/ask`, { p: call.A }); return (await viewOf(call.rid, call.A)).picks; }, 10000, "picks");
      const pick = (await viewOf(call.rid, call.A)).picks.find((p) => p.kind === "event");
      await post(`/api/sk/rooms/${call.rid}/vote`, { p: call.A, eventId: pick.id });
      await post(`/api/sk/rooms/${call.rid}/vote`, { p: call.R, eventId: pick.id });
      await post(`/api/sk/rooms/${call.rid}/lock`, { p: call.A, eventId: pick.id });
      const a1 = (await state(asia)).taste;
      const r1 = (await state(ravi)).taste;
      assert.deepStrictEqual(a1, a0, "Asia's taste weights are unchanged");
      assert.strictEqual(r1.actions, r0.actions + 2, "Ravi's vote and the locked plan count for his taste");
    });

    await test("9. A form's Decide by: the pink Closes tag, and then the form closes and Sidekick picks", async () => {
      const at = Date.now() + 4000;
      const made = await post("/api/sk/rooms", { name: "Asia", crew: "Form crew", nights: [SAT], form: true, deadline: at, members: ["Ravi", "Tess"], user: asia });
      const rid = made.body.room;
      const A = made.body.person;
      await post(`/api/sk/rooms/${rid}/answer`, { p: A, slot: "night", value: [SAT] });
      const info = await get(`/api/sk/rooms/${rid}/info`);
      assert.strictEqual(info.deadline, at);
      const { ctx, page } = await phone({ user: ravi });
      await page.goto(`${base}/sk/${rid}`);
      await page.waitForSelector("#closesTag");
      assert.match(await page.textContent("#closesTag"), /^Closes (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}(:\d\d)? (AM|PM)$/);
      assert.strictEqual(await page.$eval("#closesTag", (e) => e.className), "tag hot", "pink, the deadline colour");
      const R = (await post(`/api/sk/rooms/${rid}/join`, { name: "Ravi", mode: "form", user: ravi, answers: { budget: "30", nightIdx: [0], time: ["evening"], vibe: ["music"] } })).body.person;
      assert(!(await viewOf(rid, A)).closed, "open before the deadline");
      await until(async () => { const v = await viewOf(rid, A); return v.closed && v.picks; }, 9000, "the form to close with picks");
      const late = await post(`/api/sk/rooms/${rid}/join`, { name: "Tess", mode: "form", answers: {} });
      assert.strictEqual(late.status, 400, "nobody new can answer");
      assert(R);
      await page.reload();
      await page.waitForFunction(() => /This form has closed/.test(document.body.textContent));
      await ctx.close();
    });

    await test("10. Friends picked in the app get an in-app invite to the room, held during quiet hours", async () => {
      // Ravi's quiet hours are now; Tess's aren't
      await act(ravi, "saveSettings", { change: { notifications: { quiet: true, quietFrom: torontoHM(Date.now() - 3600000), quietTo: torontoHM(Date.now() + 3600000) } } });
      await act(tess, "saveSettings", { change: { notifications: { quiet: false } } });
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click("#pfGo");
      await page.click('[data-pfpath="friends"]');
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click(`[data-pffriend="u:${tess}"]`);
      await page.click("#pfNext");
      await page.waitForSelector(".pf-night");
      for (const b of await page.$$('.pf-night[aria-pressed="true"]')) await b.click();
      await page.click(`.pf-night[data-date="${SAT}"]`);
      await page.click("#pfNext");
      await page.click('[data-pfhow="form"]');
      await page.waitForSelector("[data-pfdeadline]");
      assert((await page.$$("[data-pfdeadline]")).length >= 1, "Decide by choices on the form path");
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForSelector(".formsent #closesTag");
      assert.match(await page.textContent("#closesTag"), /^Closes /, "the form shows when it closes");
      const rid = page.url().split("/sk/")[1];
      const tessU = await state(tess);
      const note = tessU.notifications.find((n) => n.room === rid);
      assert(note, "Tess gets a notification");
      assert.strictEqual(note.title, `Asia invited you to plan ${DAYNAME}`);
      assert.strictEqual(note.link, `/sk/${rid}`, "it links to the room");
      const raviU = await state(ravi);
      assert(!raviU.notifications.some((n) => n.room === rid), "Ravi isn't alerted in his quiet hours");
      assert((raviU.notifyQueue || []).some((n) => n.room === rid), "his invite waits in the queue");
      await act(ravi, "saveSettings", { change: { notifications: { quiet: false } } });
      await until(async () => (await state(ravi)).notifications.some((n) => n.room === rid), 5000, "the held invite after quiet hours");
      await ctx.close();
    });

    await test("11+12. No tab bar during the call, and 375 / 1280 px checks; it's back after the call, with Back to SideQuest", async () => {
      const call = await newCall();
      await toLead(call);
      for (const [width, height] of [[375, 740], [1280, 800]]) {
        const { ctx, page } = await callPage(call, { width, height });
        await page.waitForSelector("#body .q, #body .board");
        assert.strictEqual(await page.locator("#callNav").count(), 0, `${width}: no tab bar in a live call`);
        assert(await page.evaluate(() => document.body.classList.contains("sk-live")), "full-screen call");
        await basics(page, `${width} call`);
        await page.click("#orbBtn");
        await page.waitForSelector("#orbSheet [role=dialog]");
        await basics(page, `${width} orb sheet`);
        await ctx.close();
      }
      // The planner ends the call: the tabs come back, and Back to SideQuest lands in the app (the Plan tab, signed in)
      const { ctx, page } = await callPage(call);
      page.on("dialog", (d) => d.accept());
      await page.click("#leave");
      await page.waitForSelector("#backHome");
      await page.waitForSelector("#callNav");
      assert.deepStrictEqual(await page.$$eval("#callNav .pf-tab", (as) => as.map((a) => a.textContent.trim())), ["Discover", "Squads", "Plan", "Sidequests", "Profile"]);
      assert.strictEqual((await page.textContent("#backHome")).trim(), "Back to SideQuest");
      await basics(page, "375 call ended");
      await shot(page, "375-call-ended.png");
      // Still there after the survey is sent
      for (const q of ["friend", "heard"]) await page.click(`.rate[data-q="${q}"] button[data-n="4"]`);
      await page.click("#sendSurvey");
      await page.waitForFunction(() => /Thanks/.test(document.getElementById("body").textContent));
      await page.waitForSelector("#backHome");
      await Promise.all([page.waitForURL(`${base}/sk`), page.click("#backHome")]);
      await page.waitForSelector(".pf-nav");
      await ctx.close();
      // Someone who leaves (not the planner) gets the same way back; signed out, it goes to Discover
      const c2 = await newCall();
      const ph = await phone({ user: null, rooms: { [c2.rid]: { person: c2.R, mode: "text" } } });
      await ph.page.goto(`${base}/sk/${c2.rid}?cardwait=0`);
      await ph.page.waitForSelector("#dock .ctrls");
      await ph.page.click("#leave");
      await ph.page.waitForSelector("#backHome");
      await Promise.all([ph.page.waitForURL(`${base}/`), ph.page.click("#backHome")]);
      assert.strictEqual(await ph.page.evaluate(() => sessionStorage.getItem("sq2.screen")), "discover");
      await ph.ctx.close();
    });

    await test("13a. The People sheet: from the row, in-call and invited people, the link and Copy, a proper dialog; +N is right", async () => {
      const made = await post("/api/sk/rooms", { name: "Asia", crew: "Friday Crew", nights: [SAT], persona: "friend", user: asia, members: ["Ravi", "Maya", "Kai"] });
      const call = { rid: made.body.room, A: made.body.person };
      call.R = (await post(`/api/sk/rooms/${call.rid}/join`, { name: "Ravi", mode: "text", user: ravi, answers: {} })).body.person;
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.waitForSelector("#peopleBtn");
      assert.strictEqual(await page.locator("#sheet").count(), 0, "not opened by itself when the crew isn't alone");
      assert.strictEqual((await page.textContent("#peopleBtn .plus-n")).trim(), "+2", "+2 for Maya and Kai");
      assert.strictEqual(await page.locator("#peopleBtn .av").count(), 2, "two in the call");
      await page.click("#peopleBtn");
      await page.waitForSelector("#sheet [role=dialog]");
      const rows = await page.$$eval("#sheet .pp", (ls) => ls.map((l) => `${l.querySelector(".pp-n").textContent}: ${l.querySelector(".pp-s").textContent}`));
      assert.deepStrictEqual(rows, ["Asia (you): in the call", "Ravi: in the call", "Maya: invited", "Kai: invited"]);
      assert(await page.locator("#sheet #copy").isVisible() && (await page.inputValue("#sheet input.in")).includes(`/sk/${call.rid}`), "the link and Copy");
      assert(await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement)), "focus moves into the sheet");
      for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
      assert(await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement)), "Tab stays in the sheet");
      await wait(300);
      await basics(page, "375 People sheet");
      await shot(page, "375-people-sheet.png");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator("#sheet").count(), 0, "Escape closes it");
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "peopleBtn", "focus back on the row");
      await ctx.close();
      // The planner alone right after starting: it opens once by itself, and stays closed after
      const solo = await post("/api/sk/rooms", { name: "Asia", crew: "Solo crew", nights: [SAT], persona: "friend", user: asia });
      const sp = await callPage({ rid: solo.body.room, A: solo.body.person });
      await sp.page.waitForSelector("#sheet [role=dialog] #copy");
      await sp.page.keyboard.press("Escape");
      await sp.page.reload();
      await sp.page.waitForSelector("#dock .ctrls");
      await wait(800);
      assert.strictEqual(await sp.page.locator("#sheet").count(), 0, "closed, it stays closed");
      await sp.ctx.close();
    });

    await test("13b. The chat sheet: unread dot, it scrolls inside itself, typing a message works", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.waitForSelector("#chatBtn");
      await post(`/api/sk/rooms/${call.rid}/line`, { p: call.R, text: "hello from Ravi", kind: "typed" });
      await page.waitForSelector("#chatBtn .udot");
      await page.click("#chatBtn");
      await page.waitForSelector("#chatSheet [role=dialog] #chatLine");
      assert.strictEqual(await page.locator("#chatBtn .udot").count(), 0, "the dot clears when it opens");
      assert(/hello from Ravi/.test(await page.textContent("#chatSheet .thread")), "Ravi's line is in the chat");
      assert(/Sidekick/.test(await page.textContent("#chatSheet .thread")), "Sidekick is in the chat too");
      assert.strictEqual(await page.$eval("#chatSheet .thread", (t) => getComputedStyle(t).overflowY), "auto", "the thread scrolls inside itself");
      await page.fill("#chatLine", "Saturday works for me");
      await page.press("#chatLine", "Enter");
      await until(async () => (await viewOf(call.rid, call.A)).chat.some((m) => m.text === "Saturday works for me" && m.kind === "typed"), 6000, "the typed message");
      await page.waitForFunction(() => /Saturday works for me/.test(document.querySelector("#chatSheet .thread").textContent));
      await wait(300);
      await shot(page, "375-chat-sheet.png");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator("#chatSheet").count(), 0);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "chatBtn");
      await ctx.close();
    });

    await test("13c. Minimize: the On call bar over the app, and Return reopens the same call, still live", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.waitForSelector("#minBtn");
      assert.strictEqual(await page.getAttribute("#minBtn", "aria-label"), "Minimize call");
      await page.click("#minBtn");
      await page.waitForSelector("#minWrap .oncall #returnCall");
      assert.strictEqual((await page.textContent("#onCallText")).trim(), "On call · Test crew");
      const frame = page.frameLocator("#appFrame");
      await frame.locator(".pf-nav").first().waitFor({ timeout: 10000 }); // the app's Plan tab, with its tabs
      assert(await page.evaluate(() => document.getElementById("app").hasAttribute("inert")), "the call stays mounted underneath");
      await wait(300);
      await shot(page, "375-minimized-on-call.png");
      // The call carries on while minimized
      await post(`/api/sk/rooms/${call.rid}/line`, { p: call.R, text: "still here", kind: "typed" });
      await page.click("#returnCall");
      assert.strictEqual(await page.locator("#minWrap").count(), 0);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "minBtn");
      const v = await viewOf(call.rid, call.A);
      assert(v.status === "live" && v.people.some((p) => p.id === call.A), "the same call, still live, still in it");
      await page.waitForSelector("#chatBtn .udot");
      await ctx.close();
    });

    await test("13d. No page scroll at 375×667 and 390×844 with a question card showing", async () => {
      const call = await newCall();
      await toLead(call);
      for (const [width, height] of [[375, 667], [390, 844]]) {
        const { ctx, page } = await callPage(call, { width, height });
        await page.waitForSelector("#body .q");
        await wait(400);
        const m = await page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, plan: document.getElementById("planRows") ? document.getElementById("planRows").hidden : true }));
        assert(m.sh <= m.ih, `${width}×${height}: no page scroll (${m.sh} > ${m.ih})`);
        assert(m.plan, "the full plan is folded by default");
        if (width === 375) await shot(page, "375-call-at-rest.png");
        await ctx.close();
      }
    });

    assert.deepStrictEqual(pageErrors, [], "page errors");
  } catch (err) {
    failures++;
    console.log(`FAIL  ${err.stack || err.message}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await wait(300);
    if (backup) fs.writeFileSync(DB, backup);
    if (process.env.DEBUG) console.log(log);
    console.log(`Screenshots: ${SHOTS}`);
    console.log(failures ? `${failures} failed` : "All passed");
    process.exit(failures ? 1 : 0);
  }
})();
