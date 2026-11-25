// The Plan tab's step-by-step flow (design TB2-Plan), end to end in a real browser against the real server:
//
//  1. The intro shows the persona's line (the call's A/B persona) with the person's first name.
//  2. Step 1 has three paths: a squad (chips), SideQuest friends (picked chips, no phone contacts), and a link
//     (the share card with a real link).
//  3. /sk?squad=<id> starts with that squad picked (signed in, and signed out with the sample squads).
//  4. Step 2 shows who's free each night for in-app friends (free, busy or "not set", never why), lights the
//     night everyone's free, shows link guests as unknown, and "Mark your free nights" is saved to the account.
//  5. Step 3's call path makes a room with the chosen nights, the invited members and the intro's persona.
//  6. The form path shows "Form sent" and updates live (over the existing stream) when someone answers.
//  7. Back works on every step and keeps what was picked.
//  8. At 375 and 1280 px, every step: no sideways scroll, nothing under the tab bar, 44 px targets, text 12 px
//     or larger, weights 400/500/600 only.
//
// The database file is copied first and put back afterwards. Screenshots go to PLAN_SHOTS (or a temp folder).
//
//   NODE_PATH=/opt/node-tools/node_modules node test/plan-flow.e2e.js

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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plan-flow-"));
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
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch {}
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`);
    await wait(150);
  }
}

(async () => {
  const backup = fs.existsSync(DB) ? fs.readFileSync(DB) : null;
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const act = async (user, type, args) => { const r = await post("/api/act", { user, type, args }); if (r.status !== 200) throw new Error(`${type}: ${r.body.error}`); return r.body.result; };
  // The first view a phone gets on the room's live stream
  const firstView = async (room, p) => {
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
    // Three accounts: Asia plans; Ravi is her friend and marked free nights; Tess is her friend and marked none
    const rnd = Math.random().toString(36).slice(2, 8);
    const account = async (name) => {
      const { userId } = await act(null, "signup", { name, email: `${name.split(" ")[0].toLowerCase()}.${rnd}@plan-test.dev`, username: `${name.split(" ")[0].toLowerCase()}${rnd}` });
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
    const setup0 = (await (await fetch(`${base}/api/sk/plan/setup?user=${asia}&persona=friend`)).json());
    const nights = setup0.nights;
    // Ravi's free nights: the first Friday and Saturday in the window
    const fri = nights.find((n) => n.dow === "Fri");
    const sat = nights.find((n) => n.dow === "Sat");
    const raviSaved = await post("/api/sk/plan/free", { user: ravi, free: [fri.date, sat.date] });
    assert.strictEqual(raviSaved.status, 200);
    assert.strictEqual(raviSaved.body.mine.nights[sat.date], "free");
    assert.strictEqual(raviSaved.body.mine.nights[nights[0].date], "busy");
    // Asia marks Saturday free (through the UI, below, too)
    await post("/api/sk/plan/free", { user: asia, free: [sat.date] });

    browser = await chromium.launch();
    const phone = async ({ width = 375, height = 812, user = asia, name } = {}) => {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 });
      await ctx.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await ctx.addInitScript(([u, n]) => { try { if (u) localStorage.setItem("sq2.user", u); if (n) localStorage.setItem("sk:name", JSON.stringify(n)); } catch {} }, [user, name]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      return { ctx, page };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: true });

    await test("1. The intro: the persona's line with the person's first name, and the call gets the same persona", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.waitForSelector("#pfGo");
      assert.strictEqual((await page.textContent("#pfTitle")).trim(), "Hey Asia.");
      assert.strictEqual((await page.textContent("#pfLine")).trim(), "Your calendar's looking suspiciously free. Wanna fix that?");
      assert(await page.locator(".pf-orb").isVisible(), "the orb");
      assert(await page.locator("#pfNot").isVisible(), "Not now is there");
      await ctx.close();
      const c2 = await phone();
      await c2.page.goto(`${base}/sk?persona=concierge`);
      await c2.page.waitForSelector("#pfGo");
      assert.strictEqual((await c2.page.textContent("#pfTitle")).trim() + " " + (await c2.page.textContent("#pfLine")).trim(), "Welcome back, Asia. Tell me who's coming, and I'll take care of the rest.");
      await c2.ctx.close();
      // No ?persona=: the A/B assignment picks one, the line matches it, and it's kept for the visit
      const c3 = await phone();
      await c3.page.goto(`${base}/sk`);
      await c3.page.waitForSelector("#pfGo");
      const persona = await c3.page.evaluate(() => sessionStorage.getItem("sk:persona"));
      assert(["friend", "concierge"].includes(persona), persona);
      const text = (await c3.page.textContent(".pf-words")).replace(/\s+/g, " ");
      assert(text.includes(persona === "friend" ? "Hey Asia." : "Welcome back, Asia."), text);
      await c3.ctx.close();
    });

    await test("2. Step 1: a squad (chips), SideQuest friends (picked chips, no contacts), or a link (the share card)", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click("#pfGo");
      await page.waitForSelector('h1:has-text("Who\'s coming?")');
      const opts = await page.$$eval("[data-pfpath]", (els) => els.map((e) => e.dataset.pfpath));
      assert.deepStrictEqual(opts, ["squad", "friends", "link"]);
      assert.strictEqual(await page.getAttribute('[data-pfpath="squad"]', "aria-checked"), "true", "a squad is the default when you have one");
      assert.deepStrictEqual(await page.$$eval("[data-pfsquad]", (els) => els.map((e) => e.textContent.trim())), ["Friday Crew"]);
      // Friends: only SideQuest friends, picked ones as chips on top
      await page.click('[data-pfpath="friends"]');
      await page.waitForSelector('h1:has-text("Pick friends")');
      const listed = await page.$$eval("[data-pffriend] .grow", (els) => els.map((e) => e.textContent.trim()));
      assert(listed.includes("Ravi Shah") && listed.includes("Tess Moreau") && listed.includes("Maya Chen"), listed.join(", "));
      assert(!/contact/i.test(await page.textContent(".pf-card")), "no phone contacts");
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click(`[data-pffriend="u:${tess}"]`);
      assert.deepStrictEqual(await page.$$eval("#pfPicked .chip", (els) => els.map((e) => e.textContent.trim())), ["Ravi", "Tess"]);
      assert.strictEqual((await page.textContent("#pfNext")).trim(), "Next: when? · 2 friends");
      await page.fill("#pfSearch", "tes");
      assert.deepStrictEqual(await page.$$eval("[data-pffriend] .grow", (els) => els.map((e) => e.textContent.trim())), ["Tess Moreau"]);
      await page.fill("#pfSearch", "");
      // Link: the existing share card with a real call link
      await page.click("[data-pfback]");
      await page.click('[data-pfpath="link"]');
      await page.waitForSelector("#pfShare #copy");
      const link = await page.inputValue('#pfShare input[aria-label="Call link"]');
      assert(/\/sk\/[\w-]+$/.test(link), link);
      assert(await page.locator('#pfShare a[href^="https://wa.me/"]').count(), "the share buttons");
      const info = await (await fetch(`${base}/api/sk/rooms/${link.split("/sk/")[1]}/info`)).json();
      assert.strictEqual(info.status, "live");
      await ctx.close();
    });

    await test("3. /sk?squad=<id> picks that squad (and skips to When); Back shows it picked", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?squad=${asia}&persona=friend`);
      await page.click("#pfGo");
      await page.waitForSelector('h1:has-text("When?")');
      assert.strictEqual((await page.textContent(".pf-sum .tag")).trim(), "Friday Crew");
      await page.click("[data-pfback]");
      await page.waitForSelector('h1:has-text("Who\'s coming?")');
      assert.strictEqual(await page.getAttribute('[data-pfsquad]:has-text("Friday Crew")', "aria-checked"), "true");
      await ctx.close();
      // A squad made in the Squads tab (db.data.squads), when that tab is there: its "Start a plan" link
      const made = await post("/api/act", { user: asia, type: "createSquad", args: { name: "Board nights", members: [`u:${ravi}`, "Sam"] } });
      if (made.status === 200 && made.body.result && made.body.result.squadId) {
        const c1 = await phone();
        await c1.page.goto(`${base}/sk?squad=${made.body.result.squadId}&persona=friend`);
        await c1.page.click("#pfGo");
        await c1.page.waitForSelector('h1:has-text("When?")');
        assert.strictEqual((await c1.page.textContent(".pf-sum .tag")).trim(), "Board nights");
        assert(/Ravi: free/.test(await c1.page.getAttribute(`.pf-night[data-date="${sat.date}"]`, "aria-label")), "its members' nights");
        await c1.ctx.close();
      }
      // Signed out: the sample squads, by name
      const c2 = await phone({ user: null, name: "Asia" });
      await c2.page.goto(`${base}/sk?squad=board-game-sundays&persona=friend`);
      await c2.page.click("#pfGo");
      await c2.page.waitForSelector('h1:has-text("When?")');
      assert.strictEqual((await c2.page.textContent(".pf-sum .tag")).trim(), "Board game Sundays");
      await c2.page.click("[data-pfback]");
      assert.strictEqual(await c2.page.getAttribute('[data-pfsquad="board-game-sundays"]', "aria-checked"), "true");
      await c2.ctx.close();
    });

    let callPage = null;
    await test("4. Step 2: who's free per night (free, busy, not set), the everyone-free night, link guests unknown; marking free nights persists", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click("#pfGo");
      await page.click('[data-pfpath="friends"]');
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click(`[data-pffriend="u:${tess}"]`);
      await page.click("#pfNext");
      await page.waitForSelector('h1:has-text("When?")');
      const label = (d) => page.getAttribute(`.pf-night[data-date="${d}"]`, "aria-label");
      const satL = await label(sat.date);
      assert(/you: free/.test(satL) && /Ravi: free/.test(satL) && /Tess: not set/.test(satL) && /Link guests: unknown/.test(satL), satL);
      assert(!/going|because|event:/i.test(satL.replace(/events? that night/, "")), "never why");
      assert.strictEqual(await page.getAttribute(`.pf-night[data-date="${sat.date}"]`, "data-all"), "0", "Tess hasn't set hers: not everyone's free");
      assert(/1 not set/.test(await page.textContent(`.pf-night[data-date="${sat.date}"]`)));
      assert(/Ravi: busy/.test(await label(nights[0].date)), "an unmarked night is busy for someone who set theirs");
      assert(/\d+ events? that night/.test(await page.textContent(`.pf-night[data-date="${sat.date}"]`)), "the night's event count");
      assert(await page.locator(`.pf-night[data-date="${sat.date}"] .av.unk`).count(), "a ? for link guests");
      // Only Ravi: Saturday is lit, and picked by default
      await page.click("[data-pfback]");
      await page.click(`[data-pffriend="u:${tess}"]`);
      await page.click("#pfNext");
      await page.waitForSelector('h1:has-text("When?")');
      assert.strictEqual(await page.getAttribute(`.pf-night[data-date="${sat.date}"]`, "data-all"), "1");
      assert(/Everyone free/.test(await page.textContent(`.pf-night[data-date="${sat.date}"]`)));
      assert.strictEqual(await page.getAttribute(`.pf-night[data-date="${sat.date}"]`, "aria-pressed"), "true", "the everyone-free night is picked");
      assert.strictEqual(await page.locator(".pf-night[data-all='1']").count(), 1, "only Saturday");
      await shot(page, "375-when-everyone-free.png");
      // Mark your free nights: Friday too, saved to the account
      await page.click("#pfMark");
      await page.waitForSelector("#pfSheet [role=dialog]");
      await page.click(`#pfSheet [data-pffree="${fri.date}"]`);
      await page.click("#pfSaveFree");
      await page.waitForSelector("#pfSheet", { state: "detached" });
      assert.strictEqual(await page.getAttribute(`.pf-night[data-date="${fri.date}"]`, "data-all"), "1", "Friday is lit now");
      const fresh = await (await fetch(`${base}/api/sk/plan/setup?user=${asia}`)).json();
      assert.strictEqual(fresh.mine.nights[fri.date], "free", "saved on the server");
      assert.strictEqual(fresh.mine.nights[sat.date], "free");
      // ... and on another phone, after a reload
      const c2 = await phone();
      await c2.page.goto(`${base}/sk?persona=friend`);
      await c2.page.click("#pfGo");
      await c2.page.click('[data-pfpath="link"]');
      await c2.page.click("#pfNext");
      await c2.page.click("#pfMark");
      assert.strictEqual(await c2.page.getAttribute(`#pfSheet [data-pffree="${fri.date}"]`, "aria-pressed"), "true");
      await c2.page.click(".pf-sheet button[data-pfclose]");
      // The link path: just you, and link guests as unknown
      assert(await c2.page.locator(".pf-night .av.unk").count() >= nights.length);
      assert(/Link guests: unknown/.test(await c2.page.getAttribute(`.pf-night[data-date="${fri.date}"]`, "aria-label")));
      await c2.ctx.close();
      callPage = { ctx, page };
    });

    await test("5. Step 3, call: the room has the chosen nights, the invited members and the intro's persona", async () => {
      const { page } = callPage;
      // Two nights: Friday and Saturday
      if ((await page.getAttribute(`.pf-night[data-date="${fri.date}"]`, "aria-pressed")) !== "true") await page.click(`.pf-night[data-date="${fri.date}"]`);
      assert(/Next: how to decide · \w{3} \d+ \+1/.test(await page.textContent("#pfNext")), await page.textContent("#pfNext"));
      await page.click("#pfNext");
      await page.waitForSelector('h1:has-text("How do you want to decide?")');
      assert.strictEqual(await page.getAttribute('[data-pfhow="call"]', "aria-checked"), "true");
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      const room = page.url().split("/sk/")[1];
      const info = await (await fetch(`${base}/api/sk/rooms/${room}/info`)).json();
      assert.deepStrictEqual(info.nights, [fri, sat].sort((a, b) => a.date.localeCompare(b.date)).map((n) => n.label));
      assert.strictEqual(info.crew, "Asia's crew");
      const me = await page.evaluate((r) => JSON.parse(localStorage.getItem(`sk:${r}`)), room);
      const v = await firstView(room, me.person);
      assert.deepStrictEqual(v.expected.map((x) => x.name), ["Ravi"]);
      assert.strictEqual(v.me.name, "Asia");
      assert.strictEqual(v.voice.slot, "friend", "the intro's persona");
      // The call screen: "+1" on the people row for Ravi, and the People sheet (opened once by itself while the
      // planner is alone) lists him as invited, with the link and Copy
      await page.waitForSelector("#peopleBtn .plus-n");
      assert.strictEqual((await page.textContent("#peopleBtn .plus-n")).trim(), "+1");
      await page.waitForSelector("#sheet #copy");
      assert(/Ravi\s*invited/.test(await page.textContent("#sheet .pp-list")));
      await shot(page, "375-call.png");
      await callPage.ctx.close();
    });

    await test("6. Step 3, form: \"Form sent\" shows who's answered, and updates live when someone answers", async () => {
      const { ctx, page } = await phone();
      await page.goto(`${base}/sk?squad=${asia}&persona=concierge`);
      await page.click("#pfGo");
      await page.click("#pfNext");
      await page.click('[data-pfhow="form"]');
      assert.strictEqual((await page.textContent("#pfStart")).trim(), "Send the form");
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForSelector(".formsent");
      assert.strictEqual((await page.textContent("#pfTitle")).trim(), "1 of 3 answered");
      const rows = () => page.$$eval(".pf-ans li", (els) => els.map((e) => [...e.children].map((c) => c.textContent.trim()).join(" ").replace(/\s+/g, " ")));
      assert.deepStrictEqual(await rows(), ["M Maya Not yet", "K Kai Not yet", "A You Answered"]);
      const room = page.url().split("/sk/")[1];
      const info = await (await fetch(`${base}/api/sk/rooms/${room}/info`)).json();
      assert.strictEqual(info.form, true);
      // Maya answers from the link, with the form
      const join = await post(`/api/sk/rooms/${room}/join`, { name: "Maya", mode: "form", answers: { budget: "30", time: ["evening"], vibe: ["music"] } });
      assert.strictEqual(join.status, 200);
      await page.waitForFunction(() => document.getElementById("pfTitle").textContent.trim() === "2 of 3 answered", null, { timeout: 8000 });
      assert.deepStrictEqual(await rows(), ["M Maya Answered", "K Kai Not yet", "A You Answered"]);
      // Someone who wasn't invited, by the link
      await post(`/api/sk/rooms/${room}/join`, { name: "Jordan", mode: "form", answers: { vibe: ["comedy"] } });
      await page.waitForFunction(() => /3 of 4 answered/.test(document.getElementById("pfTitle").textContent), null, { timeout: 8000 });
      assert(/Jordan \(via link\) Answered/.test((await rows()).join("|")));
      assert(await page.locator("#pfNudge:has-text('Nudge Kai')").count(), "Nudge the one who hasn't answered");
      assert.strictEqual(await page.isEnabled("#pfPickNow"), true);
      await shot(page, "375-form-sent.png");
      // A friend opening the form link sees the questions straight away
      const f = await phone({ user: null });
      await f.page.goto(`${base}/sk/${room}`);
      await f.page.waitForSelector("#formExtra:not([hidden])");
      await f.ctx.close();
      await ctx.close();
    });

    await test("7. Back works on every step and keeps what was picked", async () => {
      const { ctx, page } = await phone();
      const title = async () => (await page.textContent("#pfTitle")).trim();
      await page.goto(`${base}/sk?persona=friend`);
      await page.click("#pfGo");
      assert.strictEqual(await title(), "Who's coming?");
      await page.click("[data-pfback]");
      assert.strictEqual(await title(), "Hey Asia.");
      await page.click("#pfGo");
      await page.click('[data-pfpath="friends"]');
      await page.click(`[data-pffriend="u:${ravi}"]`);
      await page.click("[data-pfback]");
      assert.strictEqual(await title(), "Who's coming?");
      assert.strictEqual(await page.getAttribute('[data-pfpath="friends"]', "aria-checked"), "true", "friends stays picked");
      await page.click('[data-pfpath="link"]');
      assert.strictEqual(await title(), "Send your own link");
      await page.click("[data-pfback]");
      await page.click('[data-pfpath="friends"]');
      assert.strictEqual(await page.getAttribute(`[data-pffriend="u:${ravi}"]`, "aria-checked"), "true", "Ravi stays picked");
      await page.click("#pfNext");
      assert.strictEqual(await title(), "When?");
      await page.click(`.pf-night[data-date="${nights[2].date}"]`);
      const picked = await page.$$eval(".pf-night[aria-pressed=true]", (els) => els.map((e) => e.dataset.date));
      await page.click("[data-pfback]");
      assert.strictEqual(await title(), "Pick friends", "When goes back to the friends picker");
      await page.click("#pfNext");
      assert.deepStrictEqual(await page.$$eval(".pf-night[aria-pressed=true]", (els) => els.map((e) => e.dataset.date)), picked, "the nights stay picked");
      await page.click("#pfNext");
      assert.strictEqual(await title(), "How do you want to decide?");
      await page.click('[data-pfhow="form"]');
      await page.click("[data-pfback]");
      assert.strictEqual(await title(), "When?");
      await page.click("#pfNext");
      assert.strictEqual(await page.getAttribute('[data-pfhow="form"]', "aria-checked"), "true", "the choice stays");
      await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await page.click("#pfStart");
      await page.waitForSelector(".formsent");
      await page.click(".formsent [data-pfback]");
      assert.strictEqual(await title(), "How do you want to decide?", "Form sent goes back to step 3");
      assert(/\/sk$/.test(page.url()));
      await ctx.close();
    });

    await test("8. 375 and 1280 px: every step fits, nothing under the tab bar, 44 px targets, text 12 px+, weights 400/500/600", async () => {
      for (const [width, height] of [[375, 812], [1280, 800]]) {
        const { ctx, page } = await phone({ width, height });
        const check = async (step) => {
          await page.waitForTimeout(350);
          await shot(page, `${width}-${step}.png`);
          const r = await page.evaluate(() => {
            const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], weights: [], tiny: [], under: [] };
            const nav = document.querySelector(".pf-nav").getBoundingClientRect();
            const phone = getComputedStyle(document.querySelector(".pf-nav")).position === "fixed";
            for (const el of document.querySelectorAll(".pf button, .pf a, .pf input")) {
              const b = el.getBoundingClientRect();
              if (!b.width || el.closest(".pf-nav")) continue;
              if (b.height < 44 && !el.closest(".pf-cell")) out.small.push(`${el.id || el.className || el.tagName}:${Math.round(b.height)}`);
              // scrolled to the bottom, the last controls clear the tab bar
              if (phone && b.bottom + window.scrollY > document.documentElement.scrollHeight - nav.height) out.under.push(el.id || el.className);
            }
            for (const el of document.querySelectorAll(".pf *")) {
              if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
              const cs = getComputedStyle(el);
              if (!["400", "500", "600"].includes(cs.fontWeight)) out.weights.push(`${el.className}:${cs.fontWeight}`);
              if (parseFloat(cs.fontSize) < 12) out.tiny.push(`${el.className}:${cs.fontSize}`);
            }
            for (const el of document.querySelectorAll(".pf-nav a")) if (el.getBoundingClientRect().height < 44) out.small.push(`tab:${el.textContent}`);
            return out;
          });
          assert(r.overflow <= 0, `${width} ${step}: sideways scroll ${r.overflow}px`);
          assert.deepStrictEqual(r.small, [], `${width} ${step}: targets under 44 px`);
          assert.deepStrictEqual(r.weights, [], `${width} ${step}: font weights`);
          assert.deepStrictEqual(r.tiny, [], `${width} ${step}: text under 12 px`);
          assert.deepStrictEqual(r.under, [], `${width} ${step}: under the tab bar`);
          if (width >= 900) {
            const card = await page.$eval(".pf-card", (e) => { const b = e.getBoundingClientRect(); const m = e.parentElement.getBoundingClientRect(); return { l: b.left - m.left, r: m.right - b.right }; });
            assert(Math.abs(card.l - card.r) <= 2, `${step}: the card is centred (${card.l} vs ${card.r})`);
            assert.strictEqual(await page.$eval(".pf-nav", (e) => getComputedStyle(e).position), "sticky", "the tabs are a side list");
          }
        };
        await page.goto(`${base}/sk?persona=friend`);
        await page.waitForSelector("#pfGo");
        await check("0-intro");
        await page.click("#pfGo");
        await check("1a-who-squad");
        await page.click('[data-pfpath="friends"]');
        await page.click('[data-pffriend="Maya"]');
        await page.click(`[data-pffriend="u:${ravi}"]`);
        await check("1b-friends");
        await page.click("[data-pfback]");
        await page.click('[data-pfpath="link"]');
        await page.waitForSelector("#pfShare #copy");
        await check("1c-link");
        await page.click("[data-pfback]");
        await page.click('[data-pfpath="squad"]');
        await page.click("#pfNext");
        await check("2-when");
        await page.click("#pfMark");
        await page.waitForTimeout(300);
        await shot(page, `${width}-2b-mark-free-nights.png`);
        await page.click(".pf-sheet button[data-pfclose]");
        await page.click("#pfNext");
        await check("3-how");
        await page.click('[data-pfhow="form"]');
        await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
        await page.click("#pfStart");
        await page.waitForSelector(".formsent");
        await check("4-form-sent");
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
