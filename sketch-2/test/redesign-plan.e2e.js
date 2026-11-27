// The redesigned Plan flow and call (approve.html: Plan, The call; nav.html #5-8, #11, #12), end to end in a real
// browser against the real server:
//
//  a. No "Hey <name>" start screen: Plan opens straight on "Who's coming?".
//  b. The orb grows out of the tab bar (a View Transition, or a scaling circle); with reduced motion it's a fade.
//  c. No app tab bar from step 1 until the call ends; ✕ Exit leaves at once, or asks first once something's picked.
//  d. Step 1 has no ‹ (only ✕ Exit); step 2 has ‹ back.
//  e. Step 2 is a 21-night calendar: tapping picks a night (and marks you free); the free counts and tints are right.
//  f. The call: the crew's photo in full colour, as posted, the question said once (the card is only answers), the voice pill
//     in the top row between ⌄ and LIVE; at 375×667 no page scroll and 44 px targets.
//  g. "I've got everything": the facts as chips, the bar, Looks good / Change something.
//  h. Picks: four facts each, one Vote button, no jargon ("crew match", "by keyword", "Mentions").
//  i. People: one Share link button that uses navigator.share (stubbed), plus Copy; no per-app buttons then.
//  j. Chat: messages only, no answer chips, "Type a message…".
//  k. The red ✕ asks first: the planner gets End for everyone / Just leave / Keep going; a friend gets Leave call /
//     Keep going. Just leave hands the plan to the next person.
//  l. Minimized: sk:live is set while the call is live; the On call bar pushes the app down; the Plan tab says
//     "You're on a call" with no second Return button. Cleared when the call ends.
//  m. After the call: the result first, centred survey numbers, "See it in Sidequests" lands on the plan's ticket.
//  n. The join screen for a friend opening the link: photo, who's on, first name, Join by voice / Answer by tapping.
//  o. No dead ends: every screen in the flow has a way out.
//
// Screenshots (375 px, 2x) go to PLAN_SHOTS (or a temp folder) as plan-*.png. The database file is put back after.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/redesign-plan.e2e.js

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "redesign-plan-"));
const SHOTS = process.env.PLAN_SHOTS || path.join(tmp, "shots");
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

(async () => {
  const backup = fs.existsSync(DB) ? fs.readFileSync(DB) : null;
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SIDEKICK_THINK_REVEAL_MS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const get = (p) => fetch(base + p).then((r) => r.json());
  const act = async (user, type, args) => { const r = await post("/api/act", { user, type, args }); if (r.status !== 200) throw new Error(`${type}: ${r.body.error}`); return r.body.result; };
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
      const { userId } = await act(null, "signup", { name, email: `${name.split(" ")[0].toLowerCase()}.${rnd}@redesign-test.dev`, username: `${name.split(" ")[0].toLowerCase()}${rnd}` });
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
    const nights = setup0.nights;
    const fri = nights.find((n) => n.dow === "Fri");
    const sat = nights.find((n) => n.dow === "Sat");
    await post("/api/sk/plan/free", { user: ravi, free: [fri.date, sat.date] });
    await post("/api/sk/plan/free", { user: asia, free: [sat.date] });
    const busy = nights.filter((n) => ["Fri", "Sat"].includes(n.dow) && n.date > nights[0].date).sort((a, b) => b.events - a.events)[0];
    const SAT = busy.date;

    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const phone = async ({ width = 375, height = 667, user = asia, rooms = {}, reduced = false, share = false } = {}) => {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
      await ctx.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await ctx.addInitScript(([u, r, sh]) => {
        try {
          if (u) localStorage.setItem("sq2.user", u);
          localStorage.setItem("sk:voiceHint", "true");
          for (const [rid, me] of Object.entries(r)) localStorage.setItem(`sk:${rid}`, JSON.stringify(me));
          if (sh) { window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); }; }
          if (window.speechSynthesis) { window.speechSynthesis.speak = () => {}; window.speechSynthesis.cancel = () => {}; }
        } catch {}
      }, [user, rooms, share]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      return { ctx, page };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `plan-${name}.png`) });
    // A way out on screen: Exit, back, minimize + leave, the app's tabs, or the end screen's links
    const wayOut = async (page, where) => {
      const ways = await page.evaluate(() => ["#pfExit", "[data-pfback]", "#minBtn", "#leave", "#seeQuest", "#backHome", ".join-home", ".pf-nav a", "#returnCall", "#keepGoing", "#exitNo", "[data-close]", "[data-chatclose]"]
        .filter((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent || getComputedStyle(e).position === "fixed")));
      assert(ways.length, `${where}: no way out`);
      return ways;
    };
    const noTabBar = async (page, where) => assert.strictEqual(await page.locator(".pf-nav:visible, #callNav").count(), 0, `${where}: no app tab bar`);
    const newCall = async (opts = {}) => {
      const made = await post("/api/sk/rooms", { name: "Asia", crew: "Friday Crew", nights: [SAT], persona: "friend", user: asia, ...opts });
      assert.strictEqual(made.status, 200, JSON.stringify(made.body));
      const rid = made.body.room;
      const A = made.body.person;
      const R = (await post(`/api/sk/rooms/${rid}/join`, { name: "Ravi", mode: "text", user: ravi, answers: {} })).body.person;
      return { rid, A, R };
    };
    const toLead = async ({ rid, A, R }) => {
      await until(async () => (await viewOf(rid, A)).mode === "voting", 8000, "the check-in vote");
      await post(`/api/sk/rooms/${rid}/answer`, { p: A, slot: "mode", value: "lead" });
      await post(`/api/sk/rooms/${rid}/answer`, { p: R, slot: "mode", value: "lead" });
      await until(async () => (await viewOf(rid, A)).mode === "lead", 8000, "Sidekick leading");
    };
    const answerAll = async ({ rid, A, R }) => {
      for (const p of [A, R]) {
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "budget", value: "50" });
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "origin", value: "union" });
        await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "vibe", value: ["music", "comedy"] });
      }
      for (const p of [A, R]) await post(`/api/sk/rooms/${rid}/answer`, { p, slot: "time", value: ["evening", "late"] });
    };
    const callPage = async (call, opts = {}) => {
      const ph = await phone({ ...opts, rooms: { [call.rid]: { person: call.A, mode: "voice" }, ...(opts.rooms || {}) } });
      await ph.page.goto(`${base}/sk/${call.rid}?cardwait=0`);
      await ph.page.waitForSelector("#dock .ctrls");
      return ph;
    };

    await test("a. No Hey start screen: Plan opens on Who's coming?", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.waitForSelector("#pfTitle");
      assert.strictEqual((await page.textContent("#pfTitle")).trim(), "Who's coming?");
      assert.strictEqual(await page.locator("#pfGo, #pfNot").count(), 0, "no Let's plan / Not now");
      assert(!/\bHey\b|Not now|Let's plan/.test(await page.textContent("main")), "no greeting screen");
      await ctx.close();
    });

    await test("b. The orb grows out of the tab bar (transform), and reduced motion gets a fade", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.waitForTimeout(280);
      await shot(page, "orb-transition-mid");
      await page.waitForSelector("#pfTitle");
      const run = await page.evaluate(() => window.__skOrb);
      assert.strictEqual(run[0].dir, "in");
      assert(["vt", "circle"].includes(run[0].mode), `a View Transition or the circle (${run[0].mode})`);
      const props = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return getComputedStyle(document.querySelector(".pf-orbx") || document.body).viewTransitionName; });
      assert(props === "sk-orb" || props === undefined || props === "none", props);
      await page.waitForFunction(() => !document.getElementById("pfOrbX"), null, { timeout: 3000 });
      // Leaving plays it backwards
      await page.click("#pfExit");
      await page.waitForURL(`${base}/`, { timeout: 5000 });
      await ctx.close();
      const r = await phone({ reduced: true });
      await r.page.goto(`${base}/sk?persona=friend`);
      await r.page.waitForSelector("#pfTitle");
      assert.strictEqual((await r.page.evaluate(() => window.__skOrb))[0].mode, "fade", "reduced motion: a fade");
      await r.ctx.close();
    });

    await test("c+d. No tab bar in the flow; step 1 has only Exit, step 2 has back; Exit asks first once something's picked", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.waitForSelector("#pfTitle");
      await page.waitForTimeout(400);
      await noTabBar(page, "step 1");
      assert.strictEqual(await page.locator("[data-pfback]").count(), 0, "step 1: no ‹");
      assert.strictEqual((await page.textContent("#pfExit")).trim(), "✕ Exit");
      assert(await page.locator(".pf-crew .duo").count() >= 1, "squads as photo rows");
      assert.strictEqual(await page.$eval(".pf-crew .duo", (e) => getComputedStyle(e).filter), "none", "squad photos in full colour, as posted");
      const optsText = await page.textContent(".pf-opts");
      assert(/Choose people/.test(optsText) && /I'll decide later/.test(optsText) && !/Send a link/.test(optsText), "squads, Choose people, I'll decide later");
      await wayOut(page, "step 1");
      await shot(page, "step1-who");
      // Picking something: Exit asks first
      await page.click('[data-pfpath="friends"]');
      await page.waitForSelector('h1:has-text("Choose people")');
      await wayOut(page, "friends");
      await noTabBar(page, "friends");
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click("#pfExit");
      await page.waitForSelector("#exitSheet [role=dialog]");
      assert(/Leave planning\?/.test(await page.textContent("#exitSheet")) && /Your choices so far won't be saved/.test(await page.textContent("#exitSheet")));
      await page.click("#exitNo");
      assert.strictEqual(await page.locator("#exitSheet").count(), 0, "Keep planning closes it");
      await page.click("#pfNext");
      await page.waitForSelector('h1:has-text("Which nights work?")');
      assert.strictEqual(await page.locator("[data-pfback]").count(), 1, "step 2: ‹ back");
      await noTabBar(page, "step 2");
      await page.click("#pfExit");
      await page.click("#exitYes");
      await page.waitForURL(`${base}/`, { timeout: 5000 });
      await ctx.close();
    });

    await test("e. The calendar: 21 nights, tapping picks and marks you free, the free counts and tints are right", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click('[data-pfpath="friends"]');
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click(`[data-pffriend="u:${tess}"]`);
      await page.click("#pfNext");
      await page.waitForSelector(".cal");
      assert.strictEqual(await page.locator(".cal .pf-night").count(), 21, "today and 20 days");
      assert.strictEqual(await page.locator(".cal > *").count() % 7, 0, "whole weeks");
      const cell = (d) => page.locator(`.pf-night[data-date="${d}"]`);
      assert.strictEqual(await cell(sat.date).getAttribute("data-free"), "1", "Ravi is free on Saturday");
      assert(/\bl2\b/.test(await cell(sat.date).getAttribute("class")), "1 of 2 friends: the middle tint");
      assert.strictEqual(await cell(sat.date).locator(".fs i").count(), 1, "one dot per free friend");
      assert.strictEqual(await cell(nights[0].date).getAttribute("data-free"), nights[0].date === fri.date ? "1" : "0");
      const label = await cell(sat.date).getAttribute("aria-label");
      assert(/Ravi: free/.test(label) && /Tess: not set/.test(label), label);
      assert(!/going|because/i.test(label.replace(/events? that night/, "")), "never why");
      // Tap a night nobody's free: it's picked, and it's now free for Asia on the server
      const open = nights.find((n) => n.date !== sat.date && n.date !== fri.date && n.dow !== "Fri" && n.dow !== "Sat");
      await cell(open.date).click();
      assert.strictEqual(await cell(open.date).getAttribute("aria-pressed"), "true");
      assert(/\bsel\b/.test(await cell(open.date).getAttribute("class")), "filled with the gradient");
      await until(async () => (await get(`/api/sk/plan/setup?user=${asia}`)).mine.nights[open.date] === "free", 4000, "marked free for you");
      // The summary card: the picked nights and how many are free
      const picked = await page.$$eval(".pf-night[aria-pressed=true]", (b) => b.map((x) => x.dataset.date));
      assert(/\d+ things? on/.test(await page.textContent("#pfSum")), "how much is on");
      assert(/of 3 free|all free/.test(await page.textContent("#pfSum")), await page.textContent("#pfSum"));
      await wayOut(page, "step 2");
      await shot(page, "step2-nights");
      // Un-pick it: back to how it was
      await cell(open.date).click();
      await until(async () => (await get(`/api/sk/plan/setup?user=${asia}`)).mine.nights[open.date] !== "free", 4000, "not free any more");
      assert.strictEqual(picked.length >= 1, true);
      await page.click("#pfNext");
      await page.waitForSelector('h1:has-text("How do you want to decide?")');
      assert(/Starting near you/.test(await page.textContent("#pfLocT")), "live location by default, in one line");
      assert(await page.locator("#originWrap").isHidden(), "the stations are folded");
      assert.strictEqual(await page.locator("#pfLearn").count(), 0, "Don't learn moved to the call's orb sheet");
      await wayOut(page, "step 3");
      await noTabBar(page, "step 3");
      await shot(page, "step3-how");
      await page.click("#pfLocChange");
      await page.click('.chips[data-name="origin"] .chip[data-value="finch"]');
      assert(/Starting from Finch/.test(await page.textContent("#pfLocT")));
      await page.click("#pfStart");
      await page.waitForSelector("#dock .ctrls");
      await noTabBar(page, "the call");
      await ctx.close();
    });

    await test("f. The call: crew photo in full colour, the question said once, the voice pill between ⌄ and LIVE, 375×667 fit", async () => {
      const call = await newCall({ members: ["Ravi", "Maya", "Kai"] });
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.waitForSelector("#body .q .chip");
      const photo = await page.evaluate(() => {
        const p = document.querySelector("#kback .kphoto");
        return { filter: getComputedStyle(p).filter, bg: getComputedStyle(p).backgroundImage };
      });
      assert.strictEqual(photo.filter, "none", "the crew photo in full colour, as posted");
      assert(/\/assets\/photos\/[\w-]+\.jpg/.test(photo.bg), photo.bg);
      // The stage: the orb, the crew around it, invited people dashed
      assert.strictEqual(await page.locator("#stage .stage-orb").count(), 1);
      assert.strictEqual(await page.locator("#stage .av.orbit").count(), 2, "Asia and Ravi");
      assert.strictEqual(await page.locator("#stage .orbit.inv").count(), 2, "Maya and Kai, invited");
      // The question once: the caption says it; the card's question is for screen readers only
      const q = await page.evaluate(() => ({ h2: document.querySelector("#body .q h2"), visible: (() => { const c = document.querySelector("#body .q").cloneNode(true); c.querySelectorAll(".sr, [hidden]").forEach((x) => x.remove()); return c.textContent; })() }));
      const prompt = await page.$eval("#body .q h2", (h) => [h.textContent, h.className]);
      assert(/\bsr\b/.test(prompt[1]), "the card's question is hidden");
      assert(!q.visible.includes(prompt[0]), "the question isn't shown twice");
      assert(await page.locator("#say .cap-t").isVisible(), "Sidekick's line as large captions");
      // The voice pill in the top row, between ⌄ and LIVE
      await page.waitForSelector("#top .ctop #voicePill", { timeout: 6000 });
      const xs = await page.evaluate(() => ["#minBtn", "#voicePill", ".livetag"].map((s) => document.querySelector(`#top ${s}`).getBoundingClientRect().left));
      assert(xs[0] < xs[1] && xs[1] < xs[2], `⌄ · pill · LIVE (${xs})`);
      // 375×667: no page scroll, 44 px targets
      const m = await page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, small: [...document.querySelectorAll("#top button, #stage button, #dock button, #body button")].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.className, Math.min(r.width, r.height)]; }).filter(([, s]) => s < 43.5) }));
      assert(m.sh <= m.ih, `no page scroll (${m.sh} > ${m.ih})`);
      assert.deepStrictEqual(m.small, [], "44 px targets");
      assert.deepStrictEqual(await page.$$eval("#dock .ctrls button", (b) => b.map((x) => x.id)), ["mic", "chatBtn", "orbBtn", "leave"], "mic · chat · orb · leave");
      await wayOut(page, "the call");
      await wait(300);
      await shot(page, "call");
      // Chat: messages only
      await post(`/api/sk/rooms/${call.rid}/line`, { p: call.R, text: "Something with games, maybe karaoke", kind: "typed" });
      await page.click("#chatBtn");
      await page.waitForSelector("#chatSheet #chatLine");
      await page.waitForFunction(() => /karaoke/.test(document.querySelector("#chatSheet .thread").textContent));
      assert.strictEqual(await page.locator("#chatSheet .chip").count(), 0, "no answer chips in the chat");
      assert.strictEqual(await page.getAttribute("#chatLine", "placeholder"), "Type a message…");
      await wait(300);
      await shot(page, "chat");
      await page.keyboard.press("Escape");
      // sk:live while the call is live
      const live = await page.evaluate(() => JSON.parse(localStorage.getItem("sk:live")));
      assert.deepStrictEqual({ room: live.room, crew: live.crew, href: live.href }, { room: call.rid, crew: "Friday Crew", href: `/sk/${call.rid}` });
      assert(Date.now() - live.at < 60000, "a fresh timestamp");
      // Minimized: the bar pushes the app down, and the Plan tab says "You're on a call" with no second Return
      await page.click("#minBtn");
      await page.waitForSelector("#minWrap .oncall #returnCall");
      const frame = page.frameLocator("#appFrame");
      await frame.locator("#pfLive").waitFor({ timeout: 10000 });
      assert.strictEqual((await frame.locator("#pfTitle").textContent()).trim(), "You're on a call with Friday Crew");
      assert.strictEqual(await frame.locator("#pfReturn, #pfLive button").count(), 0, "no second Return button");
      assert.strictEqual(await frame.locator(".pf-livecard .duo").count(), 1, "on the crew's photo");
      assert.strictEqual(await frame.locator(".pf-livedot").count(), 1, "the Plan tab's live dot");
      const push = await page.evaluate(() => ({ bar: document.querySelector(".oncall").getBoundingClientRect().bottom, frame: document.getElementById("appFrame").getBoundingClientRect().top, bg: getComputedStyle(document.querySelector(".oncall")).backgroundColor }));
      assert(push.frame >= push.bar - 0.5, `the app starts under the bar (${push.frame} vs ${push.bar})`);
      assert.strictEqual(push.bg, "rgb(69, 40, 113)", "the violet tint");
      await wayOut(page, "minimized");
      await wait(300);
      await shot(page, "minimized");
      await page.click("#returnCall");
      await ctx.close();
    });

    await test("g+h+i+k+m. Confirmation chips, picks with 4 facts, Share link, the end confirm, and See it in Sidequests", async () => {
      const call = await newCall({ members: ["Ravi", "Maya"] });
      await toLead(call);
      const { ctx, page } = await callPage(call, { share: true });
      // People: one Share link button through the phone's share menu, plus Copy
      await page.click("#peopleBtn");
      await page.waitForSelector("#sheet [role=dialog] #share");
      assert.strictEqual((await page.textContent("#sheet #share")).trim(), "Share link");
      assert(await page.locator("#sheet #copy").isVisible());
      assert.strictEqual(await page.locator('#sheet a[href^="https://wa.me/"]').count(), 0, "no per-app buttons when the share menu exists");
      await wait(300);
      await shot(page, "people");
      await page.click("#sheet #share");
      const shared = await page.evaluate(() => window.__shared);
      assert(shared.length === 1 && shared[0].url.endsWith(`/sk/${call.rid}`), JSON.stringify(shared));
      await page.keyboard.press("Escape");
      // "I've got everything"
      await answerAll(call);
      await page.waitForSelector(".board.confirm #cfRecap .chip", { timeout: 10000 });
      assert(await page.locator("#cfOk").isVisible() && await page.locator("#cfChange").isVisible(), "Looks good / Change something");
      assert(await page.locator(".board.confirm .cd-bar").isVisible(), "the progress bar");
      assert(await page.locator(".cf-line").evaluate((e) => e.classList.contains("sr")), "the line is in the caption, not twice");
      await shot(page, "confirmation");
      await page.click("#cfOk");
      // Picks: four facts, one vote, no jargon
      await page.waitForSelector(".pick-card", { timeout: 15000 });
      await wait(400);
      const cards = await page.$$eval(".pick-card", (cs) => cs.map((c) => ({ when: !!c.querySelector(".pk-when"), t: !!c.querySelector(".pk-t"), forLine: (c.querySelector(".pk-for") || {}).textContent || "", meta: !!c.querySelector(".pk-meta"), votes: c.querySelectorAll("[data-vote]").length, vote: c.querySelector("[data-vote]").textContent, text: c.innerText, ticket: c.classList.contains("ticket") || c.classList.contains("place") })));
      assert.strictEqual(cards.length, 2);
      for (const c of cards) {
        assert(c.when && c.t && c.meta, "when, name, price · trip");
        assert(/^(For .+: .+|The closest we found.*|The one you saved)$/.test(c.forLine), `the why-line: ${c.forLine}`);
        assert.strictEqual(c.votes, 1, "one vote button");
        assert(/^Vote for this/.test(c.vote), c.vote);
        assert(!/crew match|by keyword|Mentions /i.test(c.text), `no jargon: ${c.text}`);
        assert(c.ticket, "a ticket or a place shape");
      }
      assert(/Two good ones\. Tap the one you want\.|closest/.test(await page.textContent("#say .cap-t")), "the short spoken line");
      await shot(page, "picks");
      await page.locator("[data-vote]").first().click();
      await page.waitForSelector('[data-vote][aria-pressed="true"]');
      await page.waitForFunction(() => /· 1/.test(document.querySelector('[data-vote][aria-pressed="true"]').textContent));
      // A friend's ✕: Leave call / Keep going
      const fr = await phone({ user: null, rooms: { [call.rid]: { person: call.R, mode: "text" } } });
      await fr.page.goto(`${base}/sk/${call.rid}?cardwait=0`);
      await fr.page.waitForSelector("#dock #leave");
      await fr.page.click("#leave");
      await fr.page.waitForSelector("#endSheet [role=dialog]");
      assert.deepStrictEqual(await fr.page.$$eval("#endSheet button", (b) => b.map((x) => x.textContent.trim())), ["Leave call", "Keep going"]);
      await fr.page.click("#keepGoing");
      assert.strictEqual(await fr.page.locator("#endSheet").count(), 0);
      // The planner's ✕
      await page.click("#leave");
      await page.waitForSelector("#endSheet [role=dialog]");
      assert.deepStrictEqual(await page.$$eval("#endSheet button", (b) => b.map((x) => x.textContent.trim())), ["End for everyone", "Just leave (they carry on)", "Keep going"]);
      assert(/Ravi/.test(await page.textContent("#endSheet")), "it says who else is on");
      await wayOut(page, "end confirm");
      await wait(300);
      await shot(page, "end-confirm");
      await page.click("#keepGoing");
      assert.strictEqual(await page.locator("#endSheet").count(), 0, "Keep going closes it");
      // Lock, then end for everyone
      const pickId = Number(await page.locator('[data-vote][aria-pressed="true"]').getAttribute("data-vote"));
      await page.click("#lock");
      await page.waitForSelector(".done #seeQuest", { timeout: 8000 });
      assert.strictEqual(await page.evaluate(() => localStorage.getItem("sk:live")), null, "sk:live cleared when the call's done");
      await page.click("#endCall");
      await page.click("#endAll");
      await until(async () => (await viewOf(call.rid, call.A)).status === "ended", 6000, "the call ended");
      await page.waitForSelector(".done #seeQuest");
      await page.waitForSelector("#dock", { state: "hidden" });
      const done = await page.evaluate(() => ({ mono: document.querySelector(".done .pf-mono").textContent, title: document.getElementById("recapTitle").textContent, meta: document.getElementById("doneMeta").textContent, foot: document.querySelector(".done-foot").innerText, rate: getComputedStyle(document.querySelector(".rate button")).justifyItems + "|" + getComputedStyle(document.querySelector(".rate button")).textAlign }));
      assert.strictEqual(done.mono, "Locked in");
      assert(/\d+ going/.test(done.meta), done.meta);
      assert(/See it in Sidequests/.test(done.foot) && /Back to Discover/.test(done.foot) && /The transcript has been deleted/.test(done.foot), done.foot);
      assert(/center/.test(done.rate), `centred numbers (${done.rate})`);
      assert.strictEqual(await page.locator("#callNav, .pf-nav").count(), 0, "no tab bar: the buttons say where they go");
      await wayOut(page, "call ended");
      await shot(page, "call-ended");
      // See it in Sidequests: the app opens the plan's ticket
      await Promise.all([page.waitForURL(new RegExp(`${base}/(\\?quest=${pickId})?$`)), page.click("#seeQuest")]);
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem("sq2.screen")), "questlog", "Sidequests behind it");
      await page.waitForFunction((t) => document.body.innerText.includes(t), done.title, { timeout: 15000 });
      await fr.ctx.close();
      await ctx.close();
    });

    await test("k2. Just leave: the planner goes, and the next person can lock the plan", async () => {
      const call = await newCall();
      await toLead(call);
      const { ctx, page } = await callPage(call);
      await page.click("#leave");
      await page.click("#justLeave");
      await page.waitForSelector('h1:has-text("You left the call")');
      await wayOut(page, "left the call");
      const v = await viewOf(call.rid, call.R);
      assert.strictEqual(v.status, "live", "the call carries on");
      assert.strictEqual(v.me.planner, true, "Ravi plans now");
      await ctx.close();
    });

    await test("n. The join screen: crew photo, who's on, first name, Join by voice / Answer by tapping", async () => {
      const call = await newCall();
      const { ctx, page } = await phone({ user: null });
      await page.goto(`${base}/sk/${call.rid}`);
      await page.waitForSelector(".join");
      const t = await page.textContent(".join");
      assert(/Asia invited you/.test(t), t);
      assert(/Asia and Ravi are on the call/.test(t), t);
      assert(/No app or account needed/.test(t));
      assert.strictEqual(await page.locator(".join-hero .duo").count(), 1, "the crew's photo");
      assert.deepStrictEqual(await page.$$eval("#joinBtns button", (b) => b.map((x) => x.textContent.trim())), ["Join by voice", "Answer by tapping"]);
      assert.strictEqual(await page.getAttribute("#name", "placeholder"), "Your first name");
      await wayOut(page, "join");
      await shot(page, "join");
      await page.fill("#name", "Maya");
      await page.click('[data-mode="text"]');
      await page.waitForSelector("#dock .ctrls");
      const v = await viewOf(call.rid, call.A);
      assert(v.people.some((p) => p.name === "Maya" && p.mode === "text"), "Maya is in, tapping");
      await ctx.close();
    });

    await test("o. No dead ends: I'll decide later, the form, and the Plan tab returning to a live call", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click('[data-pfpath="later"]');
      await page.waitForSelector('h1:has-text("Which nights work?")');
      await wayOut(page, "later");
      await page.click("#pfNext");
      await page.click('[data-pfhow="form"]');
      await page.click("#pfLocChange");
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForSelector(".formsent");
      await wayOut(page, "form sent");
      await noTabBar(page, "form sent");
      await ctx.close();
      // A live call in this tab: /sk goes back to it
      const call = await newCall();
      const c = await callPage(call);
      await c.page.goto(`${base}/sk`);
      await c.page.waitForURL(`${base}/sk/${call.rid}`, { timeout: 8000 });
      await c.page.waitForSelector("#dock .ctrls");
      await c.ctx.close();
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
