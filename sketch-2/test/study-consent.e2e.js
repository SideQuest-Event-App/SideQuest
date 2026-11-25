// The study's consent screen, questionnaire, End session, removal requests and automatic deletion
// (public/study.html, lib/sidekick/study.js; design ST1). Starts its own server on a random port, with its
// own study file, and drives it with Playwright at 375 and 1280 px. The 24-hour and deletion-date sweeps
// run against the study module in this process with a fake clock, and once more against a real server.
//
//   node test/study-consent.e2e.js
//   CONSENT_SHOTS=/some/dir node test/study-consent.e2e.js   # also saves 375 px screenshots there
//
// Needs Playwright (NODE_PATH=/opt/node-tools/node_modules if it isn't installed locally).

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");
const { EventEmitter } = require("events");

const ROOT = path.join(__dirname, "..");
const KEY = "consent-test-key";
const EMAIL = "asiatheperson@gmail.com";
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split("\n").slice(0, 4).join("\n      ")}`); }
}
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const CONSENT = { age: true, gta: true, phone: true, agree: true };

// ---------- The approved text, word for word ----------
const INTRO = "SideQuest is a student project for a university course. It helps groups of friends in Toronto find and plan nights out, with a planning assistant called Sidekick.";
const HEADINGS = ["Help us test SideQuest", "Why we're doing this", "What you'll be asked to do (about 15–20 minutes)", "Why you were invited", "What we collect", "What we don't collect", "Your choices", "How long we keep it", "How we use it", "Questions?", "Please confirm"];
const BULLETS = [
  "To learn whether SideQuest makes planning a night out with friends easier.",
  "To find out which of two Sidekick voices people prefer.",
  "To improve the app and finish our class project.",
  "Answer a few short questions about how you usually go out (2–3 minutes).",
  "Try the app: look around, start a plan, and have a short planning call with Sidekick.",
  "Try a second, shorter call with a different Sidekick voice. This is an A/B test: you won't be told which voice is which.",
  "Answer a few quick questions about each call.",
  "Your answers to the questions.",
  "What you do in the app during the test, such as what you tap, save, plan and pick.",
  "Your ratings of each call.",
  "We don't record or keep your voice or call transcripts.",
  "We don't save your location.",
  "Your answers are stored with a random code, not your name or email.",
  "If you create an account to test with, your account details are kept separate from your study answers.",
  "Taking part is completely voluntary.",
  "You can skip any question you don't want to answer.",
  "You can leave or end the session at any time, for any reason.",
  "If you leave or drop the session before finishing, everything you've shared in this session will be erased.",
  "If you finish and later want your answers removed sooner, you can submit a request and we'll make sure they aren't included in our study.",
  "We will automatically delete all study data after December 31, 2026.",
  "This includes test accounts made for the study.",
  "You don't need to do anything.",
  "Results are only reported as group totals (for example, \"6 in 10 testers preferred Voice 1\").",
  "We never report one person's answers.",
];
const ELIGIBLE = ["are 18 or older;", "live in the Greater Toronto Area;", "have a mobile phone you can use for the test."];
const BOXES = ["I am 18 or older. (required)", "I live in the Greater Toronto Area. (required)", "I'm using, or have access to, a mobile phone for this test. (required)", "I've read the above and agree to take part. (required)", 'My anonymous answers can be used to create made-up "synthetic" test users that help us test the app. No synthetic user will be a copy of me. (optional)'];
const ERROR = "Please tick the four required boxes to start. The optional one is up to you.";
// Keys or values that would mean a location was stored
const LOCATION = /"(origin|origins|lat|lng|lon|latitude|longitude|address|postal|postcode|neighbou?rhood|location|geo|coords|home|city)"\s*:/i;

// The study module in this process, with a fake clock: its own file, no Supabase
function loadStudyModule(file, synth) {
  for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) delete process.env[k];
  process.env.SIDEKICK_STUDY_FILE = file;
  process.env.SIDEKICK_SYNTHETIC_FILE = synth;
  delete process.env.SIDEKICK_STUDY_DELETE_AFTER;
  process.env.SIDEKICK_STUDY_KEY = KEY;
  const p = path.join(ROOT, "lib", "sidekick", "study.js");
  delete require.cache[require.resolve(p)];
  return require(p);
}
async function inproc(S, method, p, body) {
  let out = null;
  const req = new EventEmitter();
  req.method = method;
  req.headers = {};
  const res = { writeHead(status) { out = { status }; }, end(text) { out.text = text; } };
  await S.handle(req, res, new URL(p, "http://study"), { readBody: async () => body || {}, sendJSON: (r, status, data) => { out = { status, body: data }; } });
  return out;
}

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-consent-"));
  const STUDY_FILE = path.join(tmp, "sidekick-study.json");
  const SYNTH_FILE = path.join(tmp, "sidekick-synthetic.json");
  const env = { ...process.env, SIDEKICK_STUDY_FILE: STUDY_FILE, SIDEKICK_SYNTHETIC_FILE: SYNTH_FILE, SIDEKICK_STUDY_KEY: KEY, SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" };
  delete env.SIDEKICK_STUDY_DELETE_AFTER;
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...env, PORT: String(port) }, stdio: "ignore" });
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const getJSON = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const exportJSON = async () => (await getJSON(`/api/sk/study/export?key=${KEY}&format=json`)).body;
  const studyFile = () => { try { return JSON.parse(fs.readFileSync(STUDY_FILE, "utf8")); } catch { return null; } };
  // The server writes the study file 200 ms after a change: wait until it shows what's expected
  const fileUntil = async (fn, what) => { for (let i = 0; i < 40; i++) { const d = studyFile(); try { if (d && fn(d)) return d; } catch {} await wait(100); } throw new Error(`The study file never showed ${what}`); };
  const shots = process.env.CONSENT_SHOTS || null;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  let browser = null;

  // A tester over the API: consent, an account, the questionnaire, and (optionally) the final survey
  async function apiTester({ synthetic = false, finish = true, account = "demo" } = {}) {
    const s = (await post("/api/sk/study/sessions", { consent: { ...CONSENT, synthetic } })).body;
    const sp = (a, b) => post(`/api/sk/study/${s.sid}/${a}`, { t: s.tid, ...b });
    if (account === "demo") await sp("account", { kind: "demo" });
    for (const part of [1, 2, 3, 4]) {
      const answers = { 1: { q1: "3-4", q2: ["comedy", "jazz"], q3: 4 }, 2: { q4: 2, q5: ["fri", "sat"], q6: "6-8" }, 3: { q7: "30", q8: "20-40", q9: "3-4" }, 4: { q10: "we-vote", q11: "timing", q12: { kind: "comedy", cost: "20-40", travel: "15" } } }[part];
      await sp("questionnaire", { part, answers });
    }
    if (finish) assert.strictEqual((await sp("final", { keep: 1, seq: 6 })).status, 200);
    return { ...s, sp };
  }
  async function makeAccount(name) {
    const r = await post("/api/act", { user: null, type: "signup", args: { name, email: `${name.toLowerCase()}.${Date.now()}@example.com`, username: "" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const id = r.body.result.userId;
    await post("/api/act", { user: id, type: "setProfile", args: { vibes: ["Comedy", "Jazz"], registered: true } });
    return id;
  }
  const accountExists = async (id) => Boolean((await getJSON(`/api/state?user=${encodeURIComponent(id)}&host=`)).body.user);

  // Layout: no sideways scroll, text 12 px or larger, weights 400/500/600, 44 px targets
  async function layoutCheck(page, where) {
    const r = await page.evaluate(() => {
      const bad = [];
      const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden],.sr,.peek.away"); };
      for (const el of document.querySelectorAll("#app *, .study-sheet *")) {
        if (!vis(el)) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const cs = getComputedStyle(el);
        if (own && parseFloat(cs.fontSize) < 12) bad.push(`text under 12px: "${el.textContent.trim().slice(0, 30)}" (${cs.fontSize})`);
        if (own && !["400", "500", "600"].includes(cs.fontWeight)) bad.push(`weight ${cs.fontWeight}: "${el.textContent.trim().slice(0, 30)}"`);
      }
      const targets = document.querySelectorAll("#app button, #app a.btn, #app label.cb, #app .ro, #app input[type=range], #app .contact a, .study-sheet button");
      for (const el of targets) {
        if (!vis(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.height < 43.5 || b.width < 43.5) bad.push(`target under 44px: "${(el.textContent || el.id).trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      return { bad, scroll: document.documentElement.scrollWidth, width: innerWidth };
    });
    assert(r.scroll <= r.width, `${where}: sideways scroll (${r.scroll} > ${r.width})`);
    assert(!r.bad.length, `${where}: ${r.bad.slice(0, 5).join("; ")}`);
  }
  const shot = async (page, name, full = false) => { if (shots) { await wait(350); await page.screenshot({ path: path.join(shots, name), fullPage: full }); } };

  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/sk/nights`)).ok) break; } catch {} await wait(250); }
    assert(chromium, "Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)");
    browser = await chromium.launch();
    const phone = () => browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });

    await test("The consent screen shows the approved text word for word: the intro as a paragraph, the bullets, the boxes and the contact line", async () => {
      const ctx = await phone();
      const page = await ctx.newPage();
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      const intro = page.locator("#app p.intro");
      assert.strictEqual(norm(await intro.innerText()), INTRO);
      assert.strictEqual(await intro.evaluate((el) => Boolean(el.closest("ul,ol"))), false, "the intro must be a paragraph, not bullets");
      const lis = (await page.locator("#app .cbl li").allInnerTexts()).map(norm);
      for (const old of ["SideQuest is a student project for a university course.", "It helps groups of friends in Toronto find and plan nights out.", "It has a planning assistant called Sidekick."]) assert(!lis.includes(old), `the intro is still a bullet: ${old}`);
      for (const b of BULLETS) assert(lis.includes(b), `missing bullet: ${b}`);
      const heads = (await page.locator("#app h1, #app h2").allInnerTexts()).map(norm);
      for (const h of HEADINGS) assert(heads.includes(h), `missing heading: ${h} (have ${JSON.stringify(heads)})`);
      assert.deepStrictEqual((await page.locator("#app .elig li > span:last-child").allInnerTexts()).map(norm), ELIGIBLE);
      assert(norm(await page.locator("#app").innerText()).includes("You can take part if you:"));
      assert.strictEqual(norm(await page.locator("#app p.contact").innerText()), `Contact Asia at ${EMAIL}.`);
      assert.strictEqual(await page.locator(`#app a[href="mailto:${EMAIL}"]`).count(), 1);
      assert.deepStrictEqual((await page.locator("#app label.cb").allInnerTexts()).map(norm), BOXES);
      assert.strictEqual(await page.locator("#app label.cb input[type=checkbox]").count(), 5, "five real checkboxes");
      assert.strictEqual(norm(await page.locator("#app fieldset.opt legend").innerText()).toLowerCase(), "optional");
      assert.strictEqual(norm(await page.locator("#start").innerText()), "Start the test");
      assert.strictEqual(norm(await page.locator("#notNow").innerText()), "Not now");
      assert.deepStrictEqual((await page.locator("#app .tl .tl-t").allInnerTexts()).map(norm), ["Questions", "Try the app", "Call 1", "Call 2"]);
      await layoutCheck(page, "consent at 375");
      await shot(page, "1-consent-top.png");
      await ctx.close();
    });

    await test("Start is blocked until the 4 required boxes are ticked: the error shows and focus goes to the first unticked box", async () => {
      const ctx = await phone();
      const page = await ctx.newPage();
      const posts = [];
      page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/sk/study")) posts.push(r.url()); });
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      assert.strictEqual(await page.getAttribute("#start", "aria-disabled"), "true");
      assert.strictEqual(await page.locator("#start").evaluate((b) => b.disabled), false, "Start stays focusable (aria-disabled, not disabled)");
      assert(await page.locator("#consentErr").isHidden());
      await page.click("#start", { force: true });
      assert.strictEqual(norm(await page.locator("#consentErr").innerText()), ERROR);
      assert.strictEqual(await page.getAttribute("#consentErr", "role"), "alert");
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "c-age");
      await page.check("#c-age");
      await page.check("#c-gta");
      await page.check("#c-synthetic"); // the optional box doesn't count
      await page.click("#start", { force: true });
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "c-phone");
      await page.check("#c-phone");
      assert.strictEqual(await page.getAttribute("#start", "aria-disabled"), "true");
      await page.click("#start", { force: true });
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "c-agree");
      await page.locator("#c-agree").scrollIntoViewIfNeeded();
      await shot(page, "2-consent-confirm-error.png");
      assert.strictEqual(posts.length, 0, "nothing is sent before the four boxes are ticked");
      await page.check("#c-agree");
      assert.strictEqual(await page.getAttribute("#start", "aria-disabled"), "false");
      assert(await page.locator("#consentErr").isHidden(), "the error clears once all four are ticked");
      await shot(page, "3-consent-confirm-ready.png");
      // The server refuses a session without all four, and a bare "true"
      assert.strictEqual((await post("/api/sk/study/sessions", { consent: true })).status, 400);
      assert.strictEqual((await post("/api/sk/study/sessions", { consent: { age: true, gta: true, phone: true } })).status, 400);
      await ctx.close();
    });

    await test("\"Not now\" leaves without creating any data", async () => {
      const before = (await exportJSON()).testers.length;
      const fileBefore = fs.existsSync(STUDY_FILE) ? fs.readFileSync(STUDY_FILE, "utf8") : null;
      const ctx = await phone();
      const page = await ctx.newPage();
      const posts = [];
      page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/api/sk/study")) posts.push(r.url()); });
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      for (const k of ["age", "gta", "phone", "agree", "synthetic"]) await page.check(`#c-${k}`);
      await page.click("#notNow");
      await page.waitForURL((u) => !u.pathname.startsWith("/study"));
      await wait(600);
      assert.strictEqual(posts.length, 0, `requests sent: ${posts.join(", ")}`);
      assert.strictEqual((await exportJSON()).testers.length, before);
      assert.strictEqual(fs.existsSync(STUDY_FILE) ? fs.readFileSync(STUDY_FILE, "utf8") : null, fileBefore, "the study file changed");
      assert.strictEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("study:")).length), 0);
      await ctx.close();
    });

    let uiSid = null;
    await test("In the browser: consent, the account step, then the questionnaire as grouped cards (3 per part, Skip on each), then the checklist; answers and skips are saved and exported id-only", async () => {
      const ctx = await phone();
      const page = await ctx.newPage();
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      for (const k of ["age", "gta", "phone", "agree", "synthetic"]) await page.check(`#c-${k}`);
      await page.click("#start");
      await page.waitForSelector("#skipAccount");
      assert(await page.locator("#endSession").isVisible(), "the End session bar is on the account step");
      uiSid = new URL(page.url()).searchParams.get("s");
      await page.click("#skipAccount");
      // Part 1
      await page.waitForSelector("#qNext");
      assert.strictEqual(norm(await page.locator("#qPartT").innerText()).toLowerCase(), "part 1 of 4 · about your nights out");
      assert.strictEqual(await page.locator("#app .qc").count(), 3);
      assert.strictEqual(await page.locator("#app .qc [data-skip]").count(), 3, "Skip on every card");
      assert(await page.locator("#endSession").isVisible());
      assert.strictEqual(await page.locator("#card-q1 [role=radiogroup] input[type=radio]").count(), 4, "single answers are radio groups");
      await page.click("#card-q1 label.ro:has-text('1–2')");
      for (const v of ["live-music", "comedy", "markets"]) await page.click(`[data-chip=q2][data-value=${v}]`);
      assert.strictEqual(await page.getAttribute("[data-chip=q2][data-value=comedy]", "aria-pressed"), "true", "chips are toggle buttons");
      assert.strictEqual(norm(await page.locator("#q2-n").innerText()), "3 of 5 picked");
      assert.strictEqual(await page.locator("#q3-r").getAttribute("type"), "range");
      await page.locator("#q3-r").focus();
      await page.keyboard.press("ArrowLeft");
      assert.strictEqual(await page.getAttribute("#q3-r", "aria-valuetext"), "Mostly chill");
      assert.strictEqual(norm(await page.locator("#q3-v").innerText()), "Mostly chill");
      await layoutCheck(page, "questions part 1 at 375");
      await shot(page, "4-questionnaire-part1.png", true);
      await page.click("#qNext");
      // Part 2: skip Q4, pick nights, leave Q6 blank
      await page.waitForSelector("#card-q4");
      await page.click("[data-skip=q4]");
      assert.strictEqual(await page.getAttribute("[data-skip=q4]", "aria-pressed"), "true");
      await page.click("[data-chip=q5][data-value=fri]");
      await page.click("[data-chip=q5][data-value=sat]");
      await page.click("#qNext");
      // Part 3: skip all three
      await page.waitForSelector("#card-q7");
      for (const q of ["q7", "q8", "q9"]) await page.click(`[data-skip=${q}]`);
      await page.click("#qNext");
      // Part 4: answer Q10, part of Q12
      await page.waitForSelector("#card-q10");
      await page.click("#card-q10 label.ro:has-text('We vote')");
      await page.click("#card-q12 [role=radiogroup][aria-labelledby=q12-cost-t] label.ro:has-text('$20–40')");
      await layoutCheck(page, "questions part 4 at 375");
      await page.click("#qNext");
      await page.waitForSelector(".steps");
      // Saved on the session, by id only, and in the export: one row per tester
      const saved = (await fileUntil((d) => Object.values(d.sessions[uiSid].testers)[0].questionnaire.doneAt, "the questionnaire")).sessions[uiSid];
      const t = Object.values(saved.testers)[0];
      assert.deepStrictEqual(Object.keys(t.consent).sort(), ["age", "agree", "at", "gta", "phone", "synthetic"]);
      assert.strictEqual(t.consent.synthetic, true);
      assert(Number.isFinite(t.consent.at));
      const q = t.questionnaire;
      assert.strictEqual(q.q1, "1-2");
      assert.deepStrictEqual(q.q2, ["live-music", "comedy", "markets"]);
      assert.strictEqual(q.q3, 2);
      assert.strictEqual(q.q4, "skipped");
      assert.deepStrictEqual(q.q5, ["fri", "sat"]);
      assert.strictEqual(q.q6, "skipped", "a question left blank counts as skipped");
      for (const k of ["q7", "q8", "q9", "q11"]) assert.strictEqual(q[k], "skipped");
      assert.strictEqual(q.q10, "we-vote");
      assert.deepStrictEqual(q.q12, { kind: "skipped", cost: "20-40", travel: "skipped" });
      const ex = await exportJSON();
      const rows = ex.questionnaire.filter((r) => r.session === uiSid);
      assert.strictEqual(rows.length, 1, "one row per tester");
      const row = rows[0];
      assert.strictEqual(row.q1, "1-2");
      assert.strictEqual(row.q2, "live-music+comedy+markets");
      assert.strictEqual(row.q4, "skipped");
      assert.strictEqual(row.q12_cost, "20-40");
      assert.strictEqual(row.q12_kind, "skipped");
      assert.strictEqual(row.consent_synthetic, "yes");
      assert.deepStrictEqual(Object.keys(row).filter((k) => /name|email|account|phone/i.test(k)), [], "the questionnaire export is id-only");
      const csv = await (await fetch(`${base}/api/sk/study/export?key=${KEY}&table=questionnaire`)).text();
      assert(csv.split("\n")[0].startsWith("session,session_index,tester,"), csv.split("\n")[0]);
      assert(!/@/.test(csv), "an email in the questionnaire CSV");
      const testerRow = ex.testers.find((r) => r.session === uiSid);
      assert.strictEqual(testerRow.consent_agree, "yes");
      assert.strictEqual(testerRow.consent_synthetic, "yes");
      await ctx.close();
    });

    await test("End session: the sheet starts on Keep going, traps focus, closes with Escape; End and erase deletes the session and its study test account", async () => {
      const ctx = await phone();
      const page = await ctx.newPage();
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      for (const k of ["age", "gta", "phone", "agree"]) await page.check(`#c-${k}`);
      await page.click("#start");
      // Create a quick account in the account step: a study test account
      await page.waitForSelector("#acctCreate");
      await page.fill("#a-name", "Erin");
      await page.fill("#a-email", `erin.${Date.now()}@example.com`);
      await page.click("[data-vibe='Comedy']");
      await page.click("[data-vibe='Film']");
      await page.click("#acctCreate [type=submit]");
      await page.waitForSelector("#qNext");
      const sid = new URL(page.url()).searchParams.get("s");
      const accountId = await page.evaluate(() => localStorage.getItem("sq2.user"));
      assert(await accountExists(accountId), "the account exists");
      const saved = await fileUntil((d) => Object.values(d.sessions[sid].testers)[0].account, "the account");
      assert(saved.sessions[sid], "the session exists");
      assert.strictEqual(Object.values(saved.sessions[sid].testers)[0].account.made, true, "marked as a study test account");
      await page.click("[data-chip=q2][data-value=comedy]");
      await page.click("#qNext");
      await page.waitForSelector("#card-q4");
      // The sheet
      await page.click("#endSession");
      await page.waitForSelector(".study-sheet [role=dialog]");
      assert.strictEqual(norm(await page.locator("#sheetT").innerText()), "End the session?");
      assert.strictEqual(norm(await page.locator("#sheetB").innerText()), "Everything you've shared in this session will be erased.");
      assert.strictEqual(norm(await page.evaluate(() => document.activeElement.textContent)), "Keep going");
      await page.keyboard.press("Tab");
      assert.strictEqual(norm(await page.evaluate(() => document.activeElement.textContent)), "End and erase");
      await page.keyboard.press("Tab");
      assert.strictEqual(norm(await page.evaluate(() => document.activeElement.textContent)), "Keep going", "focus stays in the sheet");
      await page.keyboard.press("Shift+Tab");
      assert.strictEqual(norm(await page.evaluate(() => document.activeElement.textContent)), "End and erase");
      await layoutCheck(page, "End session sheet at 375");
      await shot(page, "5-end-session.png");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator(".study-sheet").count(), 0, "Escape closes the sheet");
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "endSession", "focus goes back to End session");
      assert(studyFile().sessions[sid], "Keep going / Escape erases nothing");
      await page.click("#endSession");
      await page.click(".study-sheet [data-danger]");
      await page.waitForSelector("#byeT");
      assert.strictEqual(norm(await page.locator("#byeT").innerText()), "Session ended");
      const after = studyFile();
      assert(!after.sessions[sid], "the session is gone");
      assert.strictEqual(after.erased[sid].why, "ended");
      assert(!JSON.stringify(after.sessions).includes(sid));
      assert(!(after.accounts || []).includes(accountId));
      assert.strictEqual(await accountExists(accountId), false, "the study test account is deleted");
      assert.strictEqual(await page.evaluate(() => localStorage.getItem("sq2.user")), null, "signed out of the deleted account");
      assert.strictEqual((await exportJSON()).testers.filter((r) => r.session === sid).length, 0);
      await ctx.close();
    });

    await test("End and erase over the API: the session's call metrics, its live call and practice friends, and the test account all go", async () => {
      const nights = (await getJSON("/api/sk/nights")).body.nights.filter((n) => n.events > 0).slice(0, 2).map((n) => n.date);
      const s = (await post("/api/sk/study/sessions", { consent: CONSENT })).body;
      const accountId = await makeAccount("Pax");
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/account`, { t: s.tid, kind: "own", user: accountId, made: true })).status, 200);
      const c1 = (await post(`/api/sk/study/${s.sid}/call`, { t: s.tid, n: 1, name: "Pax", crew: "Erase crew", nights })).body;
      assert(c1.room, JSON.stringify(c1));
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/practice`, { t: s.tid, room: c1.room, p: c1.person })).body.added, 2);
      await wait(800);
      assert(studyFile().sessions[s.sid].calls[1], "call metrics exist");
      await wait(500);
      // An account the tester already had (not made in the study) is never deleted
      const theirs = await makeAccount("Quinn");
      await wait(1500);
      const s2 = (await post("/api/sk/study/sessions", { consent: CONSENT })).body;
      assert.strictEqual((await post(`/api/sk/study/${s2.sid}/account`, { t: s2.tid, kind: "own", user: theirs, made: true })).status, 200);
      const r = await post(`/api/sk/study/${s.sid}/end`, { t: s.tid });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const info = await getJSON(`/api/sk/rooms/${c1.room}/info?p=${c1.person}`);
      assert(info.status === 404 || info.body.status === "ended", `the call is still on: ${JSON.stringify(info.body)}`);
      assert(!studyFile().sessions[s.sid], "the session is gone");
      assert.strictEqual(await accountExists(accountId), false, "the test account is deleted");
      assert.strictEqual((await exportJSON()).calls.filter((c) => c.session === s.sid).length, 0, "the call metrics are gone");
      assert.strictEqual((await getJSON(`/api/sk/study/${s.sid}?t=${s.tid}`)).status, 404);
      // Quinn signed in with an account made before the session: ending that session keeps the account
      const made2 = Object.values((await fileUntil((d) => Object.values(d.sessions[s2.sid].testers)[0].account, "Quinn's account")).sessions[s2.sid].testers)[0].account.made === true;
      await post(`/api/sk/study/${s2.sid}/end`, { t: s2.tid });
      assert.strictEqual(made2, false, "an account older than the session isn't a study test account");
      assert.strictEqual(await accountExists(theirs), true, "an existing account is never deleted");
    });

    // ---------- Removal requests and the aggregate ----------
    const finishers = [];
    await test("The aggregate refuses under 10 consenting testers, then gives distributions only (no per-person rows)", async () => {
      for (let i = 0; i < 9; i++) finishers.push(await apiTester({ synthetic: true }));
      await apiTester({ synthetic: false }); // didn't tick the synthetic box: never counted
      await apiTester({ synthetic: true, finish: false }); // not finished: never counted
      assert.strictEqual((await getJSON("/api/sk/study/aggregate")).status, 401, "key-protected");
      assert.strictEqual((await getJSON("/api/sk/study/aggregate?key=wrong")).status, 401);
      const under = await getJSON(`/api/sk/study/aggregate?key=${KEY}`);
      assert.strictEqual(under.status, 409, JSON.stringify(under.body));
      assert.deepStrictEqual(Object.keys(under.body), ["error"], "refuses to produce anything");
      finishers.push(await apiTester({ synthetic: true }));
      const agg = await getJSON(`/api/sk/study/aggregate?key=${KEY}`);
      assert.strictEqual(agg.status, 200, JSON.stringify(agg.body));
      assert.strictEqual(agg.body.testers, 10);
      assert.strictEqual(agg.body.questions.q1.counts["3-4"], 10);
      assert.strictEqual(agg.body.questions.q2.counts.comedy, 10);
      assert.strictEqual(agg.body.questions.q12.cost["20-40"], 10);
      const text = JSON.stringify(agg.body);
      for (const f of finishers) { assert(!text.includes(f.sid), "a session id in the aggregate"); assert(!text.includes(f.tid), "a tester id in the aggregate"); }
      assert(!/"(session|tester|rows|people)"/.test(text), "per-person rows in the aggregate");
    });

    await test("Request removal: Thank you, the sheet (starts on Cancel), Request received with a code; the session is excluded from the export and aggregate, deleted, and the code is listed by code and date only", async () => {
      const f = finishers[0];
      const ctx = await phone();
      const page = await ctx.newPage();
      await page.goto(`${base}/study`);
      await page.evaluate(({ sid, tid }) => { localStorage.setItem(`study:${sid}:tid`, JSON.stringify(tid)); localStorage.setItem("study:last", JSON.stringify(sid)); }, { sid: f.sid, tid: f.tid });
      await page.goto(`${base}/study?s=${f.sid}`);
      await page.waitForSelector("#requestRemoval");
      assert.strictEqual(await page.locator("#endSession").count(), 0, "no End session bar after finishing");
      const lis = (await page.locator("#app .cbl li").allInnerTexts()).map(norm);
      assert.deepStrictEqual(lis, ["Your answers are saved with a random code.", "We'll automatically delete them after December 31, 2026.", "Want them gone sooner? Submit a request and we'll make sure they aren't included in our study."]);
      assert.strictEqual(norm(await page.locator("#app h1").innerText()), "Thank you!");
      assert.strictEqual(norm(await page.locator("#app p.contact").innerText()), `Questions? ${EMAIL}`);
      await layoutCheck(page, "Thank you at 375");
      await shot(page, "6-thank-you.png");
      await page.click("#requestRemoval");
      await page.waitForSelector(".study-sheet [role=dialog]");
      assert.strictEqual(norm(await page.locator("#sheetT").innerText()), "Request removal?");
      assert.deepStrictEqual((await page.locator("#sheetB li").allInnerTexts()).map(norm), ["Your answers will be taken out of our study results.", "They'll be deleted."]);
      assert.strictEqual(norm(await page.evaluate(() => document.activeElement.textContent)), "Cancel");
      await shot(page, "7-request-removal-sheet.png");
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator(".study-sheet").count(), 0);
      assert((await exportJSON()).testers.some((r) => r.session === f.sid), "still included before the request");
      await page.click("#requestRemoval");
      await page.click(".study-sheet [data-danger]");
      await page.waitForSelector("#refCode");
      assert.strictEqual(norm(await page.locator("#recvT").innerText()), "Request received");
      const code = norm(await page.locator("#refCode").innerText()).replace(/^#/, "");
      assert(/^[ACDEFHJKMNPRTUVWXY3479]{4,6}$/.test(code), `code "${code}"`);
      assert.deepStrictEqual((await page.locator("#app .cbl li").allInnerTexts()).map(norm), ["Your answers won't be included in our study.", `Your reference code is #${code}, in case you contact us.`]);
      await layoutCheck(page, "Request received at 375");
      await shot(page, "8-request-received.png");
      // Excluded from everything, and deleted
      const ex = await exportJSON();
      for (const table of ["calls", "preferences", "testers", "questionnaire"]) assert(!ex[table].some((r) => r.session === f.sid), `still in the ${table} export`);
      const summary = (await getJSON(`/api/sk/study/summary?key=${KEY}`)).body;
      assert(summary.removals.some((r) => r.code === code));
      for (const r of summary.removals) assert.deepStrictEqual(Object.keys(r).sort(), ["code", "date"], "removals list code and date only");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(summary.removals.find((r) => r.code === code).date));
      const agg = await getJSON(`/api/sk/study/aggregate?key=${KEY}`);
      assert.strictEqual(agg.status, 409, "9 consenting testers left: the aggregate refuses again");
      const saved = studyFile();
      assert(!saved.sessions[f.sid], "the session is deleted");
      assert(saved.removals.some((r) => r.code === code), "the code is stored");
      assert.strictEqual(saved.erased[f.sid].code, code, "the code finds the session if they get in touch");
      // The researcher's results page lists it
      const rp = await ctx.newPage();
      await rp.goto(`${base}/study/results`);
      await rp.fill("#key", KEY);
      await rp.click("#keyForm [type=submit]");
      await rp.waitForSelector("#removals");
      const listed = norm(await rp.locator("#removals").innerText());
      assert(listed.includes(`#${code}`), listed);
      // A reload of the study page still shows the code until Done
      await page.reload();
      await page.waitForSelector("#refCode");
      await page.click("#doneRemoved");
      await ctx.close();
      // The server refuses a removal before finishing
      const unfinished = await apiTester({ finish: false });
      assert.strictEqual((await unfinished.sp("remove", {})).status, 409);
    });

    await test("Layout at 1280: a centred column, collect cards side by side, and a sticky confirm box that steps aside at the real one; 375 stacks the cards", async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/study`);
      await page.waitForSelector("#c-age");
      const m = await page.locator("main").boundingBox();
      assert(m.width <= 640 && m.width >= 560, `column width ${m.width}`);
      assert(Math.abs(m.x - (1280 - m.x - m.width)) <= 2, "centred");
      const [a, b] = await page.locator(".ccard").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
      assert(Math.abs(a.y - b.y) < 2 && b.x > a.x, "side by side on desktop");
      assert(await page.locator("#peek").isVisible(), "the sticky confirm box shows while reading");
      assert.strictEqual(norm(await page.locator("#peekN").textContent()), "0 of 4 required ticked");
      await layoutCheck(page, "consent at 1280");
      await page.locator("#confirm").scrollIntoViewIfNeeded();
      await page.check("#c-age");
      await wait(400);
      assert(await page.locator("#peek.away").count(), "the sticky box steps aside at the confirm block");
      assert.strictEqual(norm(await page.locator("#peekN").textContent()), "1 of 4 required ticked");
      await page.evaluate(() => scrollTo(0, 0));
      await wait(400);
      await page.click("#peek [data-start]", { force: true });
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "c-gta", "the sticky Start sends focus to the first unticked box");
      for (const k of ["gta", "phone", "agree"]) await page.check(`#c-${k}`);
      await page.click("#start");
      await page.click("#skipAccount");
      await page.waitForSelector("#qNext");
      await layoutCheck(page, "questions at 1280");
      await ctx.close();
      const p2 = await (await phone()).newPage();
      await p2.goto(`${base}/study`);
      await p2.waitForSelector("#c-age");
      const [c, d] = await p2.locator(".ccard").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
      assert(d.y > c.y + 20 && Math.abs(c.x - d.x) < 2, "stacked on phones");
      assert(await p2.locator("#peek").isHidden(), "no sticky box on phones");
      for (const w of [375, 414, 768, 1024, 1280]) {
        await p2.setViewportSize({ width: w, height: 800 });
        const sw = await p2.evaluate(() => document.documentElement.scrollWidth);
        assert(sw <= w, `sideways scroll at ${w}px`);
      }
    });

    await test("No location is stored anywhere: the study file, the exports and the aggregate", async () => {
      const raw = fs.readFileSync(STUDY_FILE, "utf8");
      assert(!LOCATION.test(raw), `the study file has a location key: ${(raw.match(LOCATION) || [])[0]}`);
      const ex = JSON.stringify(await exportJSON());
      assert(!LOCATION.test(ex), "the export has a location key");
      for (const s of Object.values(JSON.parse(raw).sessions)) for (const t of Object.values(s.testers)) {
        assert.deepStrictEqual(Object.keys(t.consent).sort(), ["age", "agree", "at", "gta", "phone", "synthetic"], "consent is yes/no flags and a time");
        for (const k of ["age", "gta", "phone", "agree", "synthetic"]) assert.strictEqual(typeof t.consent[k], "boolean");
      }
      assert(!/\bunion\b|\bfinch\b|\bkipling\b/i.test(raw), "a starting point in the study file");
    });

    // ---------- Sweeps with a fake clock (the study module in this process) ----------
    const T0 = Date.parse("2026-11-20T12:00:00-05:00");
    await test("An abandoned session (not finished, no activity for 24 hours) is erased by the sweep, with its study test account; a finished one is kept", async () => {
      const file = path.join(tmp, "inproc-abandon.json");
      const S = loadStudyModule(file, path.join(tmp, "inproc-synth.json"));
      let t = T0;
      S._test.setClock(() => t);
      const deleted = [];
      await S.init({ deleteAccount: async (id) => { deleted.push(id); } });
      const a = (await inproc(S, "POST", "/api/sk/study/sessions", { consent: CONSENT })).body;
      const b = (await inproc(S, "POST", "/api/sk/study/sessions", { consent: CONSENT })).body;
      const data = S._test.data();
      Object.values(data.sessions[a.sid].testers)[0].account = { kind: "own", id: "acct-made-1", made: true };
      data.accounts.push("acct-made-1");
      await inproc(S, "POST", `/api/sk/study/${b.sid}/final`, { t: b.tid, keep: 2, seq: 5 });
      t = T0 + 23 * 3600000;
      await S.sweep();
      assert(S._test.data().sessions[a.sid], "kept before 24 hours");
      await inproc(S, "POST", `/api/sk/study/${a.sid}/step`, { t: a.tid, step: "discover" }); // activity at 23 h
      t = T0 + 46 * 3600000;
      await S.sweep();
      assert(S._test.data().sessions[a.sid], "activity resets the 24 hours");
      t = T0 + 47 * 3600000 + 60000;
      await S.sweep();
      assert(!S._test.data().sessions[a.sid], "erased after 24 hours without activity");
      assert.strictEqual(S._test.data().erased[a.sid].why, "abandoned");
      assert.deepStrictEqual(deleted, ["acct-made-1"], "its study test account is deleted");
      assert(S._test.data().sessions[b.sid], "a finished session is kept");
      assert(!fs.readFileSync(file, "utf8").includes(`"${a.sid}":{"id"`), "gone from the file");
      // A session marked excluded (a removal whose deletion didn't finish) is left out at once, then the sweep deletes it
      S._test.data().sessions[b.sid].excluded = true;
      assert(!S._test.testerRows().some((r) => r.session === b.sid), "excluded at once");
      await S.sweep();
      assert(!S._test.data().sessions[b.sid], "then deleted");
      S._test.setClock(null);
    });

    await test("The date sweep: after 2026-12-31 23:59 Toronto time everything goes (study data, test accounts, synthetic data); nothing before", async () => {
      const file = path.join(tmp, "inproc-date.json");
      const synth = path.join(tmp, "inproc-date-synth.json");
      const S = loadStudyModule(file, synth);
      assert.strictEqual(S._test.deleteAfter(), Date.parse("2026-12-31T23:59:59-05:00"), "the default cutoff");
      let t = T0;
      S._test.setClock(() => t);
      const deleted = [];
      await S.init({ deleteAccount: async (id) => { deleted.push(id); } });
      const a = (await inproc(S, "POST", "/api/sk/study/sessions", { consent: CONSENT })).body;
      await inproc(S, "POST", `/api/sk/study/${a.sid}/final`, { t: a.tid, keep: 1, seq: 4 });
      const b = (await inproc(S, "POST", "/api/sk/study/sessions", { consent: { ...CONSENT, synthetic: true } })).body;
      Object.values(S._test.data().sessions[b.sid].testers)[0].account = { kind: "own", id: "acct-b", made: true };
      await inproc(S, "POST", `/api/sk/study/${b.sid}/final`, { t: b.tid, keep: 1, seq: 4 });
      S._test.data().accounts.push("acct-b", "acct-removed-earlier");
      S._test.data().removals.push({ code: "AC34", at: t });
      fs.writeFileSync(synth, JSON.stringify({ users: [{ made: true }] }));
      t = Date.parse("2026-12-31T23:58:30-05:00");
      await S.sweep();
      assert.strictEqual(Object.keys(S._test.data().sessions).length, 2, "nothing is deleted before the cutoff");
      assert(fs.existsSync(synth));
      assert.strictEqual((await inproc(S, "GET", `/api/sk/study/${a.sid}?t=${a.tid}`)).status, 200);
      t = Date.parse("2027-01-01T00:00:30-05:00");
      await S.sweep();
      const d = S._test.data();
      assert.deepStrictEqual(d.sessions, {}, "all sessions deleted");
      assert.deepStrictEqual(d.removals, [], "removal records deleted");
      assert.deepStrictEqual(d.accounts, []);
      assert.deepStrictEqual(deleted.sort(), ["acct-b", "acct-removed-earlier"], "every study test account deleted");
      assert(!fs.existsSync(synth), "synthetic data deleted");
      const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.deepStrictEqual(onDisk.sessions, {});
      assert.strictEqual((await inproc(S, "POST", "/api/sk/study/sessions", { consent: CONSENT })).status, 410, "no new sessions after the cutoff");
      assert.strictEqual((await inproc(S, "GET", `/api/sk/study/export?key=${KEY}&format=json`)).status, 410);
      S._test.setClock(null);
    });

    await test("The date sweep runs on server start, with the cutoff from SIDEKICK_STUDY_DELETE_AFTER", async () => {
      server.kill();
      await wait(500);
      const before = studyFile();
      assert(Object.keys(before.sessions).length > 0, "there's data to delete");
      const port2 = await freePort();
      const s2 = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...env, PORT: String(port2), SIDEKICK_STUDY_DELETE_AFTER: new Date(Date.now() - 60000).toISOString() }, stdio: "ignore" });
      try {
        fs.writeFileSync(SYNTH_FILE, "{}");
        let after = null;
        for (let i = 0; i < 80; i++) { await wait(250); after = studyFile(); if (after && after.purgedAt && !Object.keys(after.sessions).length) break; }
        assert(after.purgedAt, "purged on start");
        assert.deepStrictEqual(after.sessions, {});
        assert.deepStrictEqual(after.removals, []);
        const r = await fetch(`http://localhost:${port2}/api/sk/study/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: CONSENT }) });
        assert.strictEqual(r.status, 410);
      } finally {
        s2.kill();
      }
    });
  } finally {
    server.kill();
    if (browser) await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
