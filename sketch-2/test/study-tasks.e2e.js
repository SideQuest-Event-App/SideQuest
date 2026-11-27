// The study's private profile and its five feature tasks (public/study.html, public/js/study-task.js,
// lib/sidekick/study.js). Starts its own server on a random port, with its own study file, and drives one tester
// with Playwright at 375 x 667: consent, the questionnaire, the private study profile (not the demo, seeded with
// Study crew and two practice friends), each task's detection in the app, the task bar (pinned, not over the
// back buttons), I'm stuck / I'm done, the ease sheet, task 2's questions from the saved event, no form step,
// the last questions, the export and aggregate (tasks, ids only), and End and erase deleting the profile.
//
//   node test/study-tasks.e2e.js
//   TASK_SHOTS=/some/dir node test/study-tasks.e2e.js   # also saves 375 px screenshots there (study-*.png)
//
// Needs Playwright (NODE_PATH=/opt/node-tools/node_modules if it isn't installed locally).

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const KEY = "tasks-test-key";
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let skipRest = false;
async function test(name, fn) {
  if (skipRest) { failures++; console.log(`FAIL  ${name}\n      skipped: an earlier step failed`); return; }
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split("\n").slice(0, 4).join("\n      ")}`); }
}
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const CONSENT = { age: true, gta: true, phone: true, agree: true };
const TZ = "America/Toronto";
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
const costLabel = (p) => (p == null ? "Not listed" : p === 0 ? "Free" : p < 30 ? "Under $30" : p <= 60 ? "$30–60" : "More than $60");
const PLACES = [
  { id: "p9001", kind: "place", title: "Night Owl Noodles", type: "Restaurant", hood: "Kensington", lat: 43.6545, lng: -79.4005, open: true, hours: "Open until 2 AM · drop in any time", price: "About $15 each", url: "https://maps.google.com/?cid=1", attribution: "Google Maps", vibes: ["Food & drink"] },
  { id: "p9002", kind: "place", title: "Late Dumpling House", type: "Restaurant", hood: "Chinatown", lat: 43.6532, lng: -79.3975, open: true, hours: "Open until 3 AM · drop in any time", price: "About $12 each", url: "https://maps.google.com/?cid=2", attribution: "Google Maps", vibes: ["Food & drink"] },
];

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-tasks-"));
  const STUDY_FILE = path.join(tmp, "sidekick-study.json");
  const env = { ...process.env, PORT: String(port), SIDEKICK_STUDY_FILE: STUDY_FILE, SIDEKICK_SYNTHETIC_FILE: path.join(tmp, "synth.json"), SIDEKICK_STUDY_KEY: KEY, SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" };
  delete env.SIDEKICK_STUDY_DELETE_AFTER;
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, stdio: "ignore" });
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const getJSON = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const stateOf = async (id) => (await getJSON(`/api/state?user=${encodeURIComponent(id)}&host=`)).body;
  const studyFile = () => { try { return JSON.parse(fs.readFileSync(STUDY_FILE, "utf8")); } catch { return null; } };
  const fileUntil = async (fn, what) => { for (let i = 0; i < 50; i++) { const d = studyFile(); try { if (d && fn(d)) return d; } catch {} await wait(100); } throw new Error(`The study file never showed ${what}`); };
  const shots = process.env.TASK_SHOTS || null;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const shot = async (page, name) => { if (shots) { await wait(400); await page.screenshot({ path: path.join(shots, name) }); } };
  let browser = null;

  // An API tester: consent, the questionnaire (Q2 answered), and the private profile it makes
  async function apiTester({ synthetic = false, q2 = ["comedy", "jazz"] } = {}) {
    const s = (await post("/api/sk/study/sessions", { consent: { ...CONSENT, synthetic } })).body;
    const sp = (a, b) => post(`/api/sk/study/${s.sid}/${a}`, { t: s.tid, ...b });
    let view = null;
    for (const part of [1, 2, 3, 4]) {
      const answers = { 1: { q1: "3-4", q2, q3: 4 }, 2: { q4: 2, q5: ["fri"], q6: "6-8" }, 3: { q7: "30", q8: "20-40", q9: "3-4" }, 4: { q10: "we-vote", q11: "timing", q12: { kind: "comedy", cost: "20-40", travel: "15" } } }[part];
      view = (await sp("questionnaire", { part, answers })).body;
    }
    return { ...s, sp, view };
  }
  // Both calls over the API (started, surveyed; the planner's survey ends each call), so the last questions open
  async function bothCalls(sp, nights) {
    const c1 = await sp("call", { n: 1, name: "Tess", crew: "Calls crew", nights });
    assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
    assert.strictEqual((await sp("survey", { n: 1, natural: 4, decide: 4, trust: 4, again: 4 })).status, 200);
    let c2 = null;
    for (let i = 0; i < 20; i++) { c2 = await sp("call", { n: 2, name: "Tess", crew: "Calls crew" }); if (c2.status === 200) break; await wait(300); }
    assert.strictEqual(c2.status, 200, JSON.stringify(c2.body));
    assert.strictEqual((await sp("survey", { n: 2, natural: 5, decide: 4, trust: 4, again: 5 })).status, 200);
  }

  // Layout at 375 x 667: no sideways scroll, 44 px targets
  async function layoutCheck(page, where, scope = "#app button, #app a.btn, .study-sheet button, .task-bar button") {
    const r = await page.evaluate((sel) => {
      const bad = [];
      const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden],.sr,.sr-only"); };
      for (const el of document.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.height < 43.5 || b.width < 43.5) bad.push(`target under 44px: "${(el.textContent || el.id).trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(-3).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      return { bad, scroll: document.documentElement.scrollWidth, width: innerWidth, wide };
    }, scope);
    assert(r.scroll <= r.width, `${where}: sideways scroll (${r.scroll} > ${r.width}): ${r.wide.join(", ")}`);
    assert(!r.bad.length, `${where}: ${r.bad.slice(0, 5).join("; ")}`);
  }
  // The task bar is pinned at the top and nothing tappable on the screen sits under it (back buttons included)
  async function barCheck(page, where, n, title) {
    await page.waitForSelector("#task-bar .tk-b");
    const r = await page.evaluate(() => {
      const bar = document.getElementById("task-bar").getBoundingClientRect();
      const backs = [...document.querySelectorAll("#screen [data-back]")].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0);
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sq-top")) || 0;
      const scr = document.querySelector("#screen > .screen");
      return { bar: { top: bar.top, bottom: bar.bottom }, backs: backs.map((b) => ({ top: b.top, bottom: b.bottom })), top, screenTop: scr ? scr.getBoundingClientRect().top : null, text: document.getElementById("task-bar").innerText };
    });
    assert(norm(r.text).toLowerCase().includes(`task ${n} of 5`), `${where}: "${r.text}"`);
    assert(norm(r.text).includes(title), `${where}: no title in "${r.text}"`);
    assert(Math.abs(r.bar.top) < 1, `${where}: the bar isn't at the top`);
    assert(Math.abs(r.top - r.bar.bottom) <= 1.5, `${where}: --sq-top ${r.top} isn't the bar's height ${r.bar.bottom}`);
    assert(r.screenTop != null && r.screenTop >= r.bar.bottom - 1, `${where}: the screen starts under the bar (${r.screenTop} < ${r.bar.bottom})`);
    for (const b of r.backs) assert(b.top >= r.bar.bottom - 1, `${where}: a back button (${b.top}) is under the task bar (${r.bar.bottom})`);
    return r;
  }

  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/sk/nights`)).ok) break; } catch {} await wait(250); }
    assert(chromium, "Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)");
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, timezoneId: TZ });
    await ctx.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== "localhost") return r.abort();
      if (u.pathname === "/api/places") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: PLACES, reason: null }) });
      return r.continue();
    });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    let sid = null, tid = null, profile = null, savedId = null;
    const view = async () => (await getJSON(`/api/sk/study/${sid}?t=${tid}`)).body;
    // The tester's record in the study file (written 200 ms after a change): once it shows what's expected
    const record = async (fn = () => true) => Object.values((await fileUntil((d) => d.sessions[sid] && fn(Object.values(d.sessions[sid].testers)[0]), "the tester's record")).sessions[sid].testers)[0];

    await test("The consent shows the new text (20–25 minutes, the five tasks, task data, the private profile line) and no account step", async () => {
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      const heads = (await page.locator("#app h1, #app h2").allInnerTexts()).map(norm);
      assert(heads.includes("What you'll be asked to do (about 20–25 minutes)"), JSON.stringify(heads));
      const lis = (await page.locator("#app .cbl li").allInnerTexts()).map(norm);
      for (const b of ["Try SideQuest's main features with five short tasks (finding an event, the map, your profile, Squads).", "Whether you finished each task, how long it took, and how easy it felt.", "You don't need an account. We set up a private study profile for you, with no name or email, and delete it with your answers."]) assert(lis.includes(b), `missing: ${b}`);
      const text = norm(await page.locator("#app").innerText());
      assert(!/15–20 minutes/.test(text), "the old time is still there");
      assert(!/If you create an account to test with/.test(text), "the account line is still there");
      await layoutCheck(page, "consent at 375x667");
      await shot(page, "study-consent.png");
      for (const k of ["age", "gta", "phone", "agree"]) await page.check(`#c-${k}`);
      await page.click("#start");
      await page.waitForSelector("#qNext");
      assert.strictEqual(await page.locator("#skipAccount, #acctCreate, #acctSignin").count(), 0, "an account step");
      sid = new URL(page.url()).searchParams.get("s");
      tid = await page.evaluate((s) => JSON.parse(localStorage.getItem(`study:${s}:tid`)), sid);
    });

    await test("The questionnaire leads straight into the private study profile: a real account, not the demo, with Q2's vibes, Study crew and two practice friends", async () => {
      await page.click("[data-chip=q2][data-value=jazz]");
      await page.click("[data-chip=q2][data-value=markets]");
      for (let part = 1; part <= 4; part++) { await page.waitForSelector(`#qPartT:has-text("Part ${part} of 4")`); await page.click("#qNext"); }
      await page.waitForSelector(".steps");
      const v = await view();
      profile = v.you.profile;
      assert(profile, "no profile id");
      assert.strictEqual(v.you.account, "study");
      const st = await stateOf(profile);
      assert(st.user, "the profile isn't an account");
      assert.notStrictEqual(st.user.demo, true, "the profile is the demo account");
      assert.strictEqual(st.user.registered, true);
      assert.strictEqual(st.user.email, "", "the profile has an email");
      assert.strictEqual(st.user.name, "You");
      assert.deepStrictEqual([...st.user.vibes].sort(), ["Jazz", "Markets"], `vibes ${JSON.stringify(st.user.vibes)}`);
      const friends = (st.user.friendList || []).map((f) => f.full);
      assert.deepStrictEqual(friends.sort(), ["Jules (practice)", "Robin (practice)"], JSON.stringify(friends));
      const crew = (st.user.squads || []).find((s) => s.name === "Study crew");
      assert(crew, `no Study crew: ${JSON.stringify((st.user.squads || []).map((s) => s.name))}`);
      assert.deepStrictEqual([...crew.names].sort(), ["Jules", "Robin"]);
      const t = await record();
      assert.strictEqual(t.account.made, true, "flagged as a study test account");
      assert.strictEqual(t.account.friends.length, 2);
      assert(studyFile().accounts.includes(profile), "listed for the deletion sweeps");
      // No form step, no account step; seven rows: five tasks and two calls
      assert(!v.steps.includes("form") && !v.steps.includes("discover"), JSON.stringify(v.steps));
      assert.deepStrictEqual(await page.locator(".steps > li").evaluateAll((els) => els.map((e) => e.id)), ["step-task1", "step-task2", "step-task3", "step-task4", "step-task5", "step-call1", "step-call2"]);
      const text = norm(await page.locator("#app").innerText());
      assert(!/Just answer|no call|form/i.test(text), "the form step is still on the checklist");
      assert.strictEqual((await post(`/api/sk/study/${sid}/form`, { t: tid })).status, 404, "the form route is gone");
      // The practice friends are study accounts: nobody else finds them in people search
      const other = (await post("/api/act", { user: null, type: "signup", args: { name: "Pat", email: `pat.${Date.now()}@example.com`, username: "" } })).body.result.userId;
      await post("/api/act", { user: other, type: "setProfile", args: { vibes: ["Comedy", "Jazz"], registered: true } });
      const found = (await post("/api/act", { user: other, type: "findPeople", args: { q: "practice" } })).body.result.people;
      assert.strictEqual(found.length, 0, `people search finds ${JSON.stringify(found)}`);
      await layoutCheck(page, "checklist at 375x667");
      await shot(page, "study-checklist.png");
    });

    await test("Task 1 in the app: the task bar is pinned above the screen (back buttons below it); opening an event and saving it is detected", async () => {
      await page.click("#panel-task1 [data-task-start='1']");
      await page.waitForURL((u) => u.pathname === "/");
      await page.waitForSelector("#screen [data-act=openQuest]");
      assert.strictEqual(await page.evaluate(() => SQ.userId()), profile, "the app opened as the study profile");
      assert.strictEqual(await page.evaluate(() => SQ.d.user.demo || false), false);
      await barCheck(page, "Discover", 1, "Find something to do");
      await layoutCheck(page, "the app with the task bar", ".task-bar button");
      const id = await page.locator("#screen [data-act=openQuest]").first().getAttribute("data-arg");
      await page.locator("#screen [data-act=openQuest]").first().click();
      await page.waitForSelector(".qd-nav [data-act=save]");
      await barCheck(page, "the event page", 1, "Find something to do");
      await shot(page, "study-taskbar.png");
      savedId = Number(id);
      await page.click(".qd-nav [data-act=save]");
      await page.waitForSelector("#task-bar .tk-ok");
      assert.strictEqual(norm(await page.locator("#task-bar .tk-ok").innerText()), "Nice, done");
      await page.waitForURL((u) => u.pathname === "/study", { timeout: 8000 });
      await page.waitForSelector(".task-sheet #easeNext");
      const t = await record((t) => t.tasks[1] && t.tasks[1].outcome);
      assert.strictEqual(t.tasks[1].outcome, "auto");
      assert.strictEqual(t.tasks[1].eventId, savedId, "the saved event is remembered for task 2");
      assert(Number.isInteger(t.tasks[1].secs) && t.tasks[1].secs >= 0);
    });

    await test("The ease sheet: How easy was that? (1–7) and an optional comment (max 300) are saved", async () => {
      assert.strictEqual(norm(await page.locator(".task-sheet .sheet-t").innerText()), "How easy was that?");
      assert.strictEqual(await page.locator(".task-sheet [data-ease]").count(), 7);
      assert.strictEqual(await page.getAttribute("#easeWhy", "maxlength"), "300");
      assert(await page.locator("#easeNext").isDisabled(), "Next waits for a rating");
      await page.click(".task-sheet [data-ease='6']");
      await page.fill("#easeWhy", "Took a while to spot the save button, call me at 416 555 0199");
      await layoutCheck(page, "the ease sheet at 375x667");
      await shot(page, "study-ease.png");
      await page.click("#easeNext");
      await page.waitForSelector(".task-sheet", { state: "detached" });
      const t = await record((t) => t.tasks[1].ease);
      assert.strictEqual(t.tasks[1].ease, 6);
      assert(/save button/.test(t.tasks[1].comment) && !/555/.test(t.tasks[1].comment), `comment: ${t.tasks[1].comment}`);
      await page.waitForSelector("#step-task1.done");
    });

    await test("Task 2: I'm done, then its two questions use the saved event's real start time and price, and record whether each matched", async () => {
      await page.click("#panel-task2 [data-task-start='2']");
      await page.waitForURL((u) => u.pathname === "/");
      await page.waitForSelector("#task-bar .tk-b");
      const ev = await page.evaluate((id) => { const x = SQ.d.events.find((y) => y.id === id); return x && { startsAt: x.startsAt, price: x.price, title: x.title }; }, savedId);
      assert(ev, "the saved event");
      await page.evaluate((id) => { SQ.u.quest = id; SQ.go("quest"); }, savedId);
      await page.waitForSelector(".qd-nav [data-back]");
      await barCheck(page, "the saved event's page", 2, "Explore the event page");
      await page.click("#task-bar [data-task=done]");
      await page.waitForURL((u) => u.pathname === "/study");
      await page.waitForSelector(".task-sheet #quizNext");
      const times = (await page.locator(".task-sheet [data-qtime]").allInnerTexts()).map(norm);
      const costs = (await page.locator(".task-sheet [data-qcost]").allInnerTexts()).map(norm);
      const real = timeLabel(ev.startsAt);
      assert.strictEqual(times.length, 4, JSON.stringify(times));
      assert(times.includes(real), `the real time ${real} isn't an option: ${JSON.stringify(times)}`);
      assert.strictEqual(times[3], "Not sure");
      assert.strictEqual(new Set(times).size, 4, "two different distractors");
      assert.deepStrictEqual(costs, ["Free", "Under $30", "$30–60", "More than $60", "Not listed", "Not sure"]);
      assert(norm(await page.locator(".task-sheet").innerText()).includes(ev.title), "the questions name the saved event");
      await page.click(`.task-sheet [data-qtime="${real}"]`);
      const wrongCost = costs.find((c) => c !== costLabel(ev.price) && c !== "Not sure");
      await page.click(`.task-sheet [data-qcost="${wrongCost}"]`);
      await layoutCheck(page, "task 2's questions at 375x667");
      await shot(page, "study-task2-questions.png");
      await page.click("#quizNext");
      await page.waitForSelector(".task-sheet #easeNext");
      let t = await record((t) => t.tasks[2] && t.tasks[2].quiz);
      assert.deepStrictEqual({ time: t.tasks[2].quiz.time, timeOk: t.tasks[2].quiz.timeOk, costOk: t.tasks[2].quiz.costOk }, { time: "correct", timeOk: true, costOk: false });
      assert.strictEqual(t.tasks[2].eventId, savedId);
      assert.strictEqual(t.tasks[2].outcome, "auto", "answering both is what makes task 2 done");
      // The server checks the answers itself: the right price, over the API, counts as right
      const qz = (await getJSON(`/api/sk/study/${sid}/quiz?t=${tid}`)).body;
      assert(!("answer" in qz), "the answers aren't sent to the page");
      await page.click(".task-sheet [data-ease='5']");
      await page.click("#easeNext");
      await page.waitForSelector("#step-task2.done");
    });

    await test("Task 3: dragging the Discover sheet down to the map's height and opening a place's card is detected", async () => {
      await page.click("#panel-task3 [data-task-start='3']");
      await page.waitForURL((u) => u.pathname === "/");
      await page.waitForSelector("#lx-sheet .lx-head");
      await barCheck(page, "Discover", 3, "Use the map");
      if ((await page.locator("#lx-sheet").getAttribute("data-stop")) === "peek") {
        // start from the list, so the drag is a real one
        await page.evaluate(() => { SQ.lx.state().stop = "half"; SQ.render(); });
      }
      let t = await record();
      assert(!t.tasks[3].outcome, "not done before the drag");
      const head = await page.locator("#lx-sheet .lx-grab").boundingBox();
      const x = head.x + head.width / 2, y = head.y + head.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(x, y + i * 30); await wait(16); }
      await page.mouse.up();
      await page.waitForSelector("#lx-sheet[data-stop=peek]");
      await wait(300);
      t = await record();
      assert(!t.tasks[3].outcome, "the drag alone isn't the task");
      // A place's pin on the map
      await page.waitForSelector("[data-act=lxPin][data-arg^=p]", { state: "attached", timeout: 10000 });
      await page.evaluate(() => document.querySelector("[data-act=lxPin][data-arg^=p]").click());
      await page.waitForURL((u) => u.pathname === "/study", { timeout: 8000 });
      await page.waitForSelector(".task-sheet #easeNext");
      t = await record((t) => t.tasks[3] && t.tasks[3].outcome);
      assert.strictEqual(t.tasks[3].outcome, "auto");
      await page.click(".task-sheet [data-ease='4']");
      await page.click("#easeNext");
      await page.waitForSelector("#step-task3.done");
    });

    await test("Task 4: I'm stuck records stuck and moves on (the ease sheet still asks)", async () => {
      await page.click("#panel-task4 [data-task-start='4']");
      await page.waitForURL((u) => u.pathname === "/");
      await page.waitForSelector("#task-bar [data-task=stuck]");
      await page.click("#task-bar [data-task=stuck]");
      await page.waitForURL((u) => u.pathname === "/study");
      await page.waitForSelector(".task-sheet #easeNext");
      assert(/moving on/i.test(await page.locator(".task-sheet .mono-k").innerText()));
      await page.click(".task-sheet [data-ease='2']");
      await page.click("#easeNext");
      await page.waitForSelector("#step-task4.done");
      const t = await record((t) => t.tasks[4] && t.tasks[4].ease);
      assert.strictEqual(t.tasks[4].outcome, "stuck");
      assert.strictEqual(t.tasks[4].ease, 2);
      assert.strictEqual(norm(await page.locator("#step-task4 .step-t .small").innerText()), "Moved on");
    });

    await test("Task 4 again from its row (any order): opening Your taste and changing one thing is detected", async () => {
      // A stuck task can't be redone, so this runs as a second tester's task 4 over the same app, using the API for the setup
      const b = await apiTester();
      assert(b.view.you.profile, "the second tester's profile");
      const p2 = await ctx.newPage();
      await p2.goto(`${base}/study`);
      await p2.evaluate(({ sid, tid }) => { localStorage.setItem(`study:${sid}:tid`, JSON.stringify(tid)); localStorage.setItem("study:last", JSON.stringify(sid)); }, { sid: b.sid, tid: b.tid });
      await p2.goto(`${base}/study?s=${b.sid}`);
      await p2.click("[data-step=task4]");
      await p2.click("#panel-task4 [data-task-start='4']");
      await p2.waitForURL((u) => u.pathname === "/");
      await p2.waitForSelector("#screen [data-go=profile]");
      assert.strictEqual(await p2.evaluate(() => SQ.userId()), b.view.you.profile);
      await p2.click("#screen [data-go=profile]");
      await p2.click("#screen [data-go=taste]");
      await p2.waitForSelector("#screen [data-act=tasteEditAt]");
      await barCheck(p2, "Your taste", 4, "Check your profile");
      await p2.locator("#screen [data-act=tasteEditAt]").first().click();
      await p2.waitForSelector("#screen .te-seg [data-act=tasteLevel]");
      await barCheck(p2, "Edit taste", 4, "Check your profile");
      await p2.locator("#screen .te-seg [data-act=tasteLevel][aria-pressed=false]").first().click();
      await p2.waitForURL((u) => u.pathname === "/study", { timeout: 8000 });
      await p2.waitForSelector(".task-sheet #easeNext");
      const rec = Object.values((await fileUntil((d) => Object.values(d.sessions[b.sid].testers)[0].tasks[4], "task 4")).sessions[b.sid].testers)[0];
      assert.strictEqual(rec.tasks[4].outcome, "auto");
      await p2.close();
    });

    await test("Task 5: a message in the squad's chat and a new squad with a practice friend are detected", async () => {
      await page.click("#panel-task5 [data-task-start='5']");
      await page.waitForURL((u) => u.pathname === "/");
      await page.waitForSelector("#screen [data-go=squads]");
      await page.click("#screen [data-go=squads]");
      await page.waitForSelector("#screen [data-act=openSquad], #screen .sq-hero [data-act=openSquad]");
      assert(norm(await page.locator("#screen").innerText()).includes("Study crew"), "Study crew is on Squads");
      await page.locator("#screen [data-act=openSquad]").first().click();
      await page.waitForSelector("#screen .sq-top [data-back]");
      await barCheck(page, "the squad page", 5, "Try Squads");
      await page.fill("#screen .sq-compose input", "Hi crew!");
      await page.click("#screen .sq-compose [type=submit]");
      await page.waitForSelector("#screen .sq-msg.me");
      let t = await record();
      assert(!t.tasks[5].outcome, "a message alone isn't the task");
      await page.click("#screen .sq-top [data-back]");
      await page.click("#screen [data-act=newSquad]");
      await page.waitForSelector("#screen .sq-new-form");
      await barCheck(page, "New squad", 5, "Try Squads");
      await page.fill("#screen [data-bind='newSquad.name']", "Robin and me");
      await page.locator("#screen .sq-pick").first().click();
      await page.click("#screen [data-act=createSquad]");
      await page.waitForURL((u) => u.pathname === "/study", { timeout: 8000 });
      await page.waitForSelector(".task-sheet #easeNext");
      t = await record((t) => t.tasks[5] && t.tasks[5].outcome);
      assert.strictEqual(t.tasks[5].outcome, "auto");
      await page.click(".task-sheet [data-ease='7']");
      await page.click("#easeNext");
      await page.waitForSelector("#step-task5.done");
      const st = await stateOf(profile);
      assert((st.user.squads || []).some((s) => s.name === "Robin and me"), "the new squad");
    });

    await test("I'm done without the app seeing it records self (a skipped task can be tried again)", async () => {
      const c = await apiTester();
      assert.strictEqual((await c.sp("task", { n: 3, outcome: "skipped" })).status, 200);
      const p3 = await ctx.newPage();
      await p3.goto(`${base}/study`);
      await p3.evaluate(({ sid, tid }) => { localStorage.setItem(`study:${sid}:tid`, JSON.stringify(tid)); localStorage.setItem("study:last", JSON.stringify(sid)); }, { sid: c.sid, tid: c.tid });
      await p3.goto(`${base}/study?s=${c.sid}`);
      await p3.waitForSelector("#step-task3.done");
      assert.strictEqual(norm(await p3.locator("#step-task3 .step-t .small").innerText()), "Skipped");
      await p3.click("[data-step=task3]");
      await p3.click("#panel-task3 [data-task-start='3']");
      await p3.waitForURL((u) => u.pathname === "/");
      await p3.click("#task-bar [data-task=done]");
      await p3.waitForURL((u) => u.pathname === "/study");
      await p3.waitForSelector(".task-sheet #easeNext");
      const rec = Object.values((await fileUntil((d) => Object.values(d.sessions[c.sid].testers)[0].tasks[3].outcome === "self", "self")).sessions[c.sid].testers)[0];
      assert.strictEqual(rec.tasks[3].outcome, "self");
      assert(rec.tasks[3].secs != null);
      await p3.close();
    });

    await test("The last questions: the voice, overall ease, Which part would you use most? and One thing you'd change? are saved", async () => {
      const nights = (await getJSON("/api/sk/nights")).body.nights.filter((n) => n.events > 0).slice(0, 2).map((n) => n.date);
      await bothCalls((a, b) => post(`/api/sk/study/${sid}/${a}`, { t: tid, ...b }), nights);
      await page.goto(`${base}/study?s=${sid}`);
      await page.waitForSelector("form[data-final]");
      assert.strictEqual(norm(await page.locator(".final-t").innerText()), "Last few questions");
      assert(await page.locator("#endSession").isVisible(), "End session is on the last questions");
      assert.deepStrictEqual((await page.locator("[data-use]").allInnerTexts()).map(norm), ["Discover", "Map", "Squads", "Plan with Sidekick", "Profile"]);
      assert.strictEqual(await page.getAttribute("#change", "maxlength"), "300");
      await page.click("[data-keep='2']");
      await page.click("[data-seq='6']");
      assert(await page.locator("form[data-final] [type=submit]").isDisabled(), "Send waits for which part");
      await page.click("[data-use='squads']");
      await page.fill("#change", "More late-night food places, $20 or less");
      await layoutCheck(page, "the last questions at 375x667");
      await shot(page, "study-final.png");
      await page.click("form[data-final] [type=submit]");
      await page.waitForSelector("#requestRemoval");
      const t = await record((t) => t.final);
      assert.strictEqual(t.final.use, "squads");
      assert(/late-night food/.test(t.final.change) && /\[amount\]/.test(t.final.change), t.final.change);
      assert.notStrictEqual(await page.evaluate(() => localStorage.getItem("sq2.user")), profile, "signed out of the study profile when finished");
    });

    await test("The export has a tasks table (one row per tester per task, ids only) and the summary and aggregate have the tasks as group totals", async () => {
      const ex = (await getJSON(`/api/sk/study/export?key=${KEY}&format=json`)).body;
      const rows = ex.tasks.filter((r) => r.session === sid);
      assert.strictEqual(rows.length, 5, "one row per task");
      assert.deepStrictEqual(rows.map((r) => r.outcome), ["auto", "auto", "auto", "stuck", "auto"]);
      assert.deepStrictEqual(rows.map((r) => r.task_id), ["find", "event", "map", "profile", "squads"]);
      assert.deepStrictEqual(rows.map((r) => r.ease), [6, 5, 4, 2, 7]);
      assert.strictEqual(rows[1].time_correct, true);
      assert.strictEqual(rows[1].cost_correct, false);
      for (const r of rows) assert.deepStrictEqual(Object.keys(r).filter((k) => /name|email|title|event|user|account/i.test(k)), [], `not ids only: ${Object.keys(r)}`);
      const csv = await (await fetch(`${base}/api/sk/study/export?key=${KEY}&table=tasks`)).text();
      assert(csv.startsWith("session,session_index,tester,task,task_id,outcome,"), csv.split("\n")[0]);
      const all = csv + JSON.stringify(ex.tasks);
      for (const bad of ["Robin", "Jules", "Study crew", "You", "Night Owl"]) assert(!new RegExp(`\\b${bad}\\b`).test(all), `the tasks export has "${bad}"`);
      const pref = ex.preferences.find((r) => r.session === sid);
      assert.strictEqual(pref.use_most, "squads");
      const sum = (await getJSON(`/api/sk/study/summary?key=${KEY}`)).body;
      assert.strictEqual(sum.tasks.length, 5);
      const t2 = sum.tasks.find((x) => x.task === 2);
      assert(t2.answered >= 1 && t2.time_correct >= 1, JSON.stringify(t2));
      for (const x of sum.tasks) for (const k of ["completion_rate", "median_secs", "mean_ease"]) assert(k in x, `summary task ${x.task} has no ${k}`);
      assert.strictEqual(sum.use_most.squads, 1);
      // The aggregate: nothing under 10 consenting finishers, then group totals only
      const agg0 = await getJSON(`/api/sk/study/aggregate?key=${KEY}`);
      assert.strictEqual(agg0.status, 409);
      const nights = (await getJSON("/api/sk/nights")).body.nights.filter((n) => n.events > 0).slice(0, 2).map((n) => n.date);
      const ids = [];
      for (let i = 0; i < 10; i++) {
        const a = await apiTester({ synthetic: true });
        ids.push(a.sid, a.tid, a.view.you.profile);
        assert.strictEqual((await a.sp("task", { n: 1, start: true })).status, 200);
        assert.strictEqual((await a.sp("task", { n: 1, outcome: i % 2 ? "auto" : "self" })).status, 200);
        assert.strictEqual((await a.sp("taskRate", { n: 1, ease: 5 })).status, 200);
        assert.strictEqual((await a.sp("task", { n: 2, outcome: "stuck" })).status, 200);
        assert.strictEqual((await a.sp("final", { keep: 1, seq: 5, use: "map" })).status, 200);
      }
      const agg = await getJSON(`/api/sk/study/aggregate?key=${KEY}`);
      assert.strictEqual(agg.status, 200, JSON.stringify(agg.body));
      const a1 = agg.body.tasks.find((x) => x.task === 1);
      assert.strictEqual(a1.attempted, 10);
      assert.strictEqual(a1.completion_rate, 1);
      assert.strictEqual(a1.ease["5"], 10);
      assert.strictEqual(agg.body.tasks.find((x) => x.task === 2).stuck, 10);
      assert.strictEqual(agg.body.use_most.map, 10);
      const text = JSON.stringify(agg.body);
      for (const id of ids) assert(!text.includes(id), "an id in the aggregate");
      assert(!/"(session|tester|rows|people|comment)"/.test(text), "per-person rows in the aggregate");
    });

    await test("End and erase deletes the private study profile, its practice friends, its squads and the session", async () => {
      const d = await apiTester();
      const me = d.view.you.profile;
      const friendIds = Object.values((await fileUntil((x) => x.sessions[d.sid], "d")).sessions[d.sid].testers)[0].account.friends;
      const st = await stateOf(me);
      const made = await post("/api/act", { user: me, type: "createSquad", args: { name: "Erase me", members: [st.user.friendList[0].key] } });
      assert.strictEqual(made.status, 200, JSON.stringify(made.body));
      const squadId = made.body.result.squadId;
      await post("/api/act", { user: me, type: "partyChat", args: { text: "hello there" } });
      const p4 = await ctx.newPage();
      await p4.goto(`${base}/study`);
      await p4.evaluate(({ sid, tid, me }) => { localStorage.setItem(`study:${sid}:tid`, JSON.stringify(tid)); localStorage.setItem("study:last", JSON.stringify(sid)); localStorage.setItem("sq2.user", me); }, { sid: d.sid, tid: d.tid, me });
      await p4.goto(`${base}/study?s=${d.sid}`);
      await p4.waitForSelector(".steps");
      await p4.click("#endSession");
      await p4.click(".study-sheet [data-danger]");
      await p4.waitForSelector("#byeT");
      for (const id of [me, ...friendIds]) assert.strictEqual((await stateOf(id)).user, null, `account ${id} still exists`);
      const db = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "db.json"), "utf8"));
      const raw = JSON.stringify(db);
      assert(!raw.includes(squadId), "the new squad is still stored");
      assert(!raw.includes(me), "the profile (or its Study crew) is still stored");
      for (const id of friendIds) assert(!raw.includes(id), "a practice friend is still stored");
      assert(!raw.includes("hello there"), "its chat is still stored");
      const after = studyFile();
      assert(!after.sessions[d.sid]);
      for (const id of [me, ...friendIds]) assert(!after.accounts.includes(id), "still listed as a study account");
      assert.strictEqual(await p4.evaluate(() => localStorage.getItem("sq2.user")), null, "signed out of the deleted profile");
      await p4.close();
    });

    await test("No location is stored in the study file or the tasks export", async () => {
      const raw = fs.readFileSync(STUDY_FILE, "utf8");
      assert(!/"(origin|lat|lng|latitude|longitude|address|location|coords)"\s*:/i.test(raw), "a location key in the study file");
      const ex = JSON.stringify((await getJSON(`/api/sk/study/export?key=${KEY}&format=json`)).body);
      assert(!/"(origin|lat|lng|latitude|longitude|address|location|coords)"\s*:/i.test(ex), "a location key in the export");
    });
  } finally {
    server.kill();
    if (browser) await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
