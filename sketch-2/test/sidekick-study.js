// The voice A/B study, end to end, against the real server on a random port, plus a Playwright run of
// one solo tester through the whole guided path (needs Playwright, pre-installed).
//   (a) four study sessions get AB, BA, AB, BA, and the arm counts are balanced
//   (b) call 1 uses the session's assigned persona and call 2 the other: from the room's persona (what
//       the call serves to phones) and from the line book phrasing Sidekick actually said
//   (c) the tester-facing pages never show "Concierge" or "Friend" as persona names
//   (d) a solo tester with practice friends reaches picks in both calls
//   (e) the export has one row per call with arm, order and metrics, and no names or private answers
//   (f) the export is refused without the key
//   (g) all the existing Sidekick tests still pass
//
//   node test/sidekick-study.js
//   STUDY_SHOTS=/some/dir node test/sidekick-study.js   # also saves 375px screenshots there

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const personas = require(path.join(ROOT, "lib", "sidekick", "personas"));
const KEY = "study-test-key";
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split("\n").slice(0, 3).join("\n      ")}`); }
}

// Which persona's line book a line comes from (null if neither or both)
const norm = (t) => String(t || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BOOK = Object.fromEntries(Object.entries(personas.LINES).map(([id, moves]) => [id, Object.values(moves).flat().map((tpl) => new RegExp(`^${tpl.split(/(\{\w+\})/).map((x) => (/^\{\w+\}$/.test(x) ? ".*" : escRe(norm(x)))).filter(Boolean).join("\\s*")}$`))]));
const bookOf = (text) => { const hits = Object.keys(BOOK).filter((id) => BOOK[id].some((re) => re.test(norm(text)))); return hits.length === 1 ? hits[0] : null; };
const ARM = { A: "concierge", B: "friend" };
const CONSENT = { age: true, gta: true, phone: true, agree: true, synthetic: false }; // the consent screen's boxes
// Persona names as a tester could see them
const BLIND = [/concierge/i, /plugged-?in/i, /\bFriend\b/];
const blindCheck = (text, where) => { for (const re of BLIND) assert(!re.test(text), `${where} shows ${re}: "${(text.match(new RegExp(`.{0,40}${re.source}.{0,40}`, re.flags)) || [""])[0]}"`); };

(async () => {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-study-"));
  const STUDY_FILE = path.join(tmp, "sidekick-study.json");
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(port), SIDEKICK_STUDY_FILE: STUDY_FILE, SIDEKICK_STUDY_KEY: KEY, SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off" },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
  // A phone's live stream: keeps the latest view, and every Sidekick line seen
  function stream(room, person) {
    const ctrl = new AbortController();
    const s = { view: null, said: new Map(), close: () => ctrl.abort() };
    fetch(`${base}/api/sk/rooms/${room}/stream?p=${person}`, { signal: ctrl.signal }).then(async (r) => {
      const dec = new TextDecoder();
      let buf = "";
      for await (const chunk of r.body) {
        buf += dec.decode(chunk);
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (/^event:/m.test(block)) continue;
          const m = /^data: (.*)$/m.exec(block);
          if (!m) continue;
          s.view = JSON.parse(m[1]);
          for (const l of s.view.sidekick || []) if (!l.system) s.said.set(l.id, l.text);
        }
      }
    }).catch(() => {});
    return s;
  }
  const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(300); } throw new Error(`Timed out waiting for ${what}`); };

  // A solo tester's phone over the API: vote lead, answer each card, vote and lock the picks
  async function playCall(room, person, s) {
    const t0 = Date.now();
    const answered = new Set();
    while (Date.now() - t0 < 150000) {
      await wait(400);
      const v = s.view;
      if (!v) continue;
      if (v.picks && v.picks.length) {
        await post(`/api/sk/rooms/${room}/vote`, { p: person, eventId: v.picks[0].id });
        await wait(300);
        const lock = await post(`/api/sk/rooms/${room}/lock`, { p: person });
        assert.strictEqual(lock.status, 200, JSON.stringify(lock.body));
        return Date.now() - t0;
      }
      const card = v.card;
      if (!card) continue;
      const key = `${card.slot}:${v.rows.map((r) => r.state).join()}`;
      if (card.slot === "mode") { if (!card.options.some((o) => o.mine)) await post(`/api/sk/rooms/${room}/answer`, { p: person, slot: "mode", value: "lead" }); continue; }
      if (card.waiting || card.form || !card.options || card.options.some((o) => o.mine) || answered.has(key)) continue;
      answered.add(key);
      const pref = { time: "evening", budget: "50", origin: "union", kind: "either" }[card.slot];
      const value = pref && card.options.some((o) => o.value === pref) ? pref : card.options[0].value;
      await post(`/api/sk/rooms/${room}/answer`, { p: person, slot: card.slot, value: card.multi ? [value] : value });
    }
    throw new Error("No picks within 150 seconds");
  }

  const exitCodes = {};
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/sk/nights`)).ok) break; } catch {} await wait(250); }
    const nights = (await (await fetch(`${base}/api/sk/nights`)).json()).nights.filter((n) => n.events > 0).slice(0, 2).map((n) => n.date);
    const sessions = [];

    await test("(a) Four study sessions get AB, BA, AB, BA, and the arms are balanced", async () => {
      assert.strictEqual((await post("/api/sk/study/sessions", {})).status, 400, "a session needs consent");
      assert.strictEqual((await post("/api/sk/study/sessions", { consent: true })).status, 400, "a session needs the four required boxes");
      for (let i = 0; i < 4; i++) sessions.push((await post("/api/sk/study/sessions", { consent: CONSENT })).body);
      const saved = await until(() => { try { return JSON.parse(fs.readFileSync(STUDY_FILE, "utf8")); } catch { return null; } }, 5000, "the study file");
      const orders = sessions.map((s) => saved.sessions[s.sid].order);
      assert.deepStrictEqual(orders, ["AB", "BA", "AB", "BA"]);
      const first = orders.map((o) => o[0]);
      assert.strictEqual(first.filter((a) => a === "A").length, 2);
      assert.strictEqual(first.filter((a) => a === "B").length, 2);
      // The tester's view never carries the order, the arm or a persona
      blindCheck(JSON.stringify(sessions[0].view), "the tester API");
      assert(!/"order"|"arm"|"persona"|"AB"|"BA"/.test(JSON.stringify(sessions[0].view)), "the tester API leaks the assignment");
    });

    await test("(b, d) A BA crew: call 1 is the Friend, call 2 the Concierge (room persona and lines said), and a solo tester with practice friends reaches picks in both", async () => {
      const s = sessions[1];
      const c1 = (await post(`/api/sk/study/${s.sid}/call`, { t: s.tid, n: 1, name: "Maya", crew: "Booth crew", nights })).body;
      assert(c1.room && c1.person, JSON.stringify(c1));
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/call`, { t: s.tid, n: 2, name: "Maya" })).status, 409, "call 2 waits for call 1");
      const st1 = stream(c1.room, c1.person);
      await until(() => st1.view, 5000, "the first view");
      assert.strictEqual(st1.view.voice.slot, "friend", "call 1's room persona");
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/practice`, { t: s.tid, room: c1.room, p: c1.person })).body.added, 2);
      await playCall(c1.room, c1.person, st1);
      const lines1 = [...st1.said.values()];
      const books1 = lines1.map(bookOf).filter(Boolean);
      assert(books1.length >= 3, `only ${books1.length} line-book lines in call 1`);
      assert(books1.every((b) => b === "friend"), `call 1 said a concierge line: ${lines1.find((l) => bookOf(l) === "concierge")}`);
      st1.close();
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/survey`, { t: s.tid, n: 1, natural: 3, decide: 4, trust: 4, again: 3 })).status, 200);
      const c2 = (await post(`/api/sk/study/${s.sid}/call`, { t: s.tid, n: 2, name: "Maya", crew: "Booth crew" })).body;
      const st2 = stream(c2.room, c2.person);
      await until(() => st2.view, 5000, "the call 2 view");
      assert.strictEqual(st2.view.voice.slot, "concierge", "call 2's room persona");
      await until(() => st2.view && st2.view.people.length === 3, 10000, "the practice friends to come back for call 2");
      await playCall(c2.room, c2.person, st2);
      const books2 = [...st2.said.values()].map(bookOf).filter(Boolean);
      assert(books2.length >= 2 && books2.every((b) => b === "concierge"), `call 2 lines: ${JSON.stringify([...st2.said.values()])}`);
      st2.close();
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/survey`, { t: s.tid, n: 2, natural: 4, decide: 4, trust: 5, again: 4 })).status, 200);
      assert.strictEqual((await post(`/api/sk/study/${s.sid}/final`, { t: s.tid, keep: 2, seq: 6, why: "Maya thought it was calmer, under $30 too" })).status, 200);
      // The room ended when the planner answered the questions: its transcript is gone
      const info = await (await fetch(`${base}/api/sk/rooms/${c2.room}/info?p=${c2.person}`)).json();
      assert.strictEqual(info.status, "ended");
    });

    // ---------- The guided path in a browser: one solo tester, a new crew (the 5th: AB) ----------
    let chromium;
    try { ({ chromium } = require("playwright")); } catch { chromium = null; }
    const shots = process.env.STUDY_SHOTS || null;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    const seen = { lines: [], rooms: {} };
    await test("(b, c, d) In the browser: a solo tester follows the checklist through both calls and the surveys, blind to the voices", async () => {
      assert(chromium, "Playwright isn't installed");
      const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
      try {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        page.on("dialog", (d) => d.accept());
        const visible = async (where) => blindCheck(await page.evaluate(() => document.body.innerText), where);
        const shot = async (name, full = true) => {
          if (!shots) return;
          if (await page.locator(".toast.show").count()) await wait(3300); // let a toast fade, so it doesn't cover the shot
          await page.screenshot({ path: path.join(shots, name), fullPage: full });
        };
        const collectSay = async () => { for (const t of await page.locator(".say p").allInnerTexts()) if (!seen.lines.includes(t)) seen.lines.push(t); };

        // 1. Consent and intro: the four required boxes
        await page.goto(`${base}/study`);
        await page.waitForSelector("#c-age");
        await visible("the intro");
        await shot("1-study-hub.png");
        for (const k of ["age", "gta", "phone", "agree"]) await page.check(`#c-${k}`);
        await page.click("#start");
        // The account step: this tester skips it and uses the shared demo account
        await page.waitForSelector("#skipAccount");
        await visible("the account step");
        await page.click("#skipAccount");
        // The questionnaire: four parts, this tester skips through them
        for (let part = 1; part <= 4; part++) {
          await page.waitForSelector(`#qPartT:has-text("Part ${part} of 4")`);
          await visible(`questionnaire part ${part}`);
          await page.click("#qNext");
        }
        await page.waitForSelector(".steps");
        const sid = new URL(page.url()).searchParams.get("s");
        const html = await page.content();
        assert(!/concierge|plugged/i.test(html), "the hub's page source names a persona");

        // 2. Discover: the app opens, then mark done
        const app = await ctx.newPage();
        await app.goto(`${base}/`);
        await app.waitForLoadState("domcontentloaded");
        await app.close();
        await page.click("[data-mark=discover]");
        await page.waitForSelector("#step-discover.done");

        // 3. Open Plan from the checklist
        await page.click("[data-step=plan]");
        await page.click("#panel-plan a.btn.pri");
        await page.waitForSelector("#go");
        await visible("the Plan start screen");
        await page.fill("#name", "Asia");
        await page.fill("#crew", "Study crew");
        await page.click("#go");

        // 4. The link card with share buttons, then practice friends
        await page.waitForSelector(".invite #copy");
        assert(await page.locator('.invite a[href^="https://wa.me/"]').count(), "no WhatsApp share button");
        await page.click(".invite #copy");
        await visible("the invite card");
        const room1 = page.url().split("/sk/")[1].split("?")[0];
        await shot("5-call-invite.png", false);
        await page.click("#practice");

        // 5. Call 1: check-in vote, board, private card, picks
        const playUI = async (label) => {
          const t0 = Date.now();
          while (Date.now() - t0 < 150000) {
            await collectSay();
            if (await page.locator(".pick").count()) break;
            const lead = page.locator('.vote-opt[data-answer=lead][aria-pressed=false]');
            if (await lead.count()) { await lead.click().catch(() => {}); await wait(400); continue; }
            const priv = page.locator('.priv .ans[data-private][data-answer="50"]');
            if (await priv.count()) { if (label === "Voice 1") await shot("7-call-private-card.png", false); await priv.click().catch(() => {}); await wait(600); continue; }
            const q = page.locator(".q").first();
            if (await q.count() && !(await q.locator('[aria-pressed=true]').count())) {
              const evening = q.locator('.ans[data-answer=evening], .ans[data-answer=union], .ans[data-answer=either]');
              await (await evening.count() ? evening.first() : q.locator(".ans").first()).click().catch(() => {});
              await wait(600);
              continue;
            }
            await wait(400);
          }
          assert(await page.locator(".pick").count(), `${label}: no picks within 150 seconds`);
          if (label === "Voice 1") await shot("6-call-picks.png", false);
          await collectSay();
          await visible(`${label} picks`);
          await page.locator(".pick").first().click();
          await page.waitForSelector("#lock:not([disabled])");
          await page.click("#lock");
          await page.waitForSelector("text=Answer 4 quick questions");
          await visible(`${label} done`);
        };
        // The persona this call's room serves, read the way a phone gets it
        const personaOf = async (room) => {
          const me = await page.evaluate((r) => JSON.parse(localStorage.getItem(`sk:${r}`)), room);
          const st = stream(room, me.person);
          await until(() => st.view, 5000, "a view");
          st.close();
          return st.view.voice.slot;
        };
        seen.rooms[1] = await personaOf(room1);
        await playUI("Voice 1");
        const lines1 = seen.lines.splice(0);
        seen.byCall = { 1: lines1 };
        await page.click("text=Answer 4 quick questions");
        await page.waitForSelector("form[data-survey='1']");
        await visible("the Voice 1 questions");
        for (const q of ["natural", "decide", "trust", "again"]) await page.click(`form[data-survey='1'] [data-q=${q}][data-n="4"]`);
        await page.click("form[data-survey='1'] [type=submit]");
        await page.waitForSelector("#step-call1.done");

        // Share: mark done (the buttons were used above)
        await page.click("[data-step=share]");
        await page.click("[data-mark=share]");
        await page.waitForSelector("#step-share.done");
        await shot("2-checklist.png");

        // 6. Just answer, no call
        await page.click("[data-step=form]");
        await page.click("#tryForm");
        await page.waitForSelector("#formMode");
        await page.fill("#name", "Asia");
        await page.click(".chips[data-name=budget] .chip[data-value='50']");
        await page.click("#formMode");
        await page.click(".chips[data-name=time] .chip[data-value=evening]");
        await page.click(".chips[data-name=vibe] .chip[data-value=music]");
        await page.click("#formMode");
        await page.waitForSelector("text=Answered by form");
        await visible("the form practice call");
        await page.click("text=Study checklist");
        await page.waitForSelector("#step-form.done", { timeout: 10000 });

        // 7. Voice 2: a short call
        await page.click("[data-step=call2]");
        await page.click("#startCall2");
        await page.waitForURL(/\/sk\/.+v=2/);
        const room2 = page.url().split("/sk/")[1].split("?")[0];
        seen.rooms[2] = await personaOf(room2);
        await playUI("Voice 2");
        seen.byCall[2] = seen.lines.splice(0);
        await page.click("text=Answer 4 quick questions");
        await page.waitForSelector("form[data-survey='2']");
        for (const q of ["natural", "decide", "trust", "again"]) await page.click(`form[data-survey='2'] [data-q=${q}][data-n="5"]`);
        await page.click("form[data-survey='2'] [type=submit]");
        await page.waitForSelector("#step-call2.done");

        // 8. The comparison survey
        await page.waitForSelector("form[data-final]");
        await page.click("[data-keep='1']");
        await page.fill("#why", "Asia here: it felt calmer, Robin agreed");
        await page.click("[data-seq='6']");
        await visible("the comparison survey");
        await page.locator("#step-survey").scrollIntoViewIfNeeded();
        await shot("3-comparison-survey.png");
        await page.click("form[data-final] [type=submit]");
        await page.waitForSelector("#requestRemoval");
        await visible("the thank-you");
        await shot("4-done.png");

        const saved = JSON.parse(fs.readFileSync(STUDY_FILE, "utf8"));
        const order = saved.sessions[sid].order;
        assert.strictEqual(order, "AB", "the 5th crew is AB");
        assert.strictEqual(seen.rooms[1], ARM[order[0]], "call 1's room persona");
        assert.strictEqual(seen.rooms[2], ARM[order[1]], "call 2's room persona");
        for (const n of [1, 2]) {
          const books = seen.byCall[n].map(bookOf).filter(Boolean);
          assert(books.length >= 1, `no line-book lines seen in call ${n}: ${JSON.stringify(seen.byCall[n])}`);
          assert(books.every((b) => b === ARM[order[n - 1]]), `call ${n} showed lines from the other voice: ${JSON.stringify(seen.byCall[n])}`);
        }
      } finally {
        await browser.close();
      }
    });

    await test("(f) The export and summary are refused without the key, or with a wrong one", async () => {
      assert.strictEqual((await get("/api/sk/study/export")).status, 401);
      assert.strictEqual((await get("/api/sk/study/export?key=nope")).status, 401);
      assert.strictEqual((await get("/api/sk/study/summary")).status, 401);
      assert.strictEqual((await fetch(`${base}/api/sk/study/export`, { headers: { "x-study-key": "study-test-keX" } })).status, 401);
    });

    await test("(e) The export has one row per call with arm, order and metrics, and no names or private answers", async () => {
      const json = JSON.parse((await get(`/api/sk/study/export?key=${KEY}&format=json`)).text);
      const csvCalls = (await get(`/api/sk/study/export?key=${KEY}`)).text;
      const csvPrefs = (await get(`/api/sk/study/export?key=${KEY}&table=preferences`)).text;
      const saved = JSON.parse(fs.readFileSync(STUDY_FILE, "utf8"));
      const started = Object.values(saved.sessions).reduce((n, s) => n + Object.keys(s.calls).length, 0);
      assert.strictEqual(json.calls.length, started, "one row per call");
      assert.strictEqual(csvCalls.trim().split("\n").length, started + 1, "CSV: a header and one row per call");
      for (const r of json.calls) {
        for (const k of ["session", "order", "call", "arm", "persona", "questions_asked", "secs_to_picks", "picks_accepted", "checkin_mode", "natural", "decide", "trust", "again"]) assert(k in r, `missing ${k}`);
        assert.strictEqual(r.persona, ARM[r.arm]);
        assert.strictEqual(r.arm, r.order[r.call - 1]);
        assert.strictEqual(r.practice_friends, 2, "practice friends are logged");
        assert.strictEqual(r.humans, 1, "practice friends aren't counted as testers");
        assert.strictEqual(r.picks_shown, true);
        assert.strictEqual(r.picks_accepted, true);
        assert(r.secs_to_picks > 0 && Number.isInteger(r.questions_asked));
        assert.strictEqual(r.checkin_mode, "lead");
        assert.strictEqual(r.lines_from_other_book, 0);
        assert(r.lines_from_assigned_book > 0);
      }
      assert.strictEqual(json.preferences.length, 2);
      const all = csvCalls + csvPrefs + JSON.stringify(json);
      for (const bad of ["Asia", "Maya", "Robin", "Jules", "Sam", "Study crew", "Booth crew", "budget", "West End", "Under"]) assert(!new RegExp(`\\b${bad}\\b`).test(all), `the export contains "${bad}"`);
      assert(!/\$\s?\d/.test(all), "the export contains an amount");
      assert(json.preferences.some((p) => /\[name\]/.test(p.why) && /\[amount\]/.test(p.why)), "free text keeps no names or amounts");
      const summary = JSON.parse((await get(`/api/sk/study/summary?key=${KEY}`)).text);
      assert.strictEqual(summary.preference.testers, 2);
      assert.strictEqual(summary.first_call.A.calls + summary.first_call.B.calls, 2);
    });
  } finally {
    server.kill();
  }

  await test("(g) All the existing Sidekick tests still pass", async () => {
    const out = [];
    for (const t of ["sidekick-eval", "sidekick-integrations", "sidekick-modes", "sidekick-share", "sidekick-multiphone"]) {
      const r = spawnSync(process.execPath, [path.join(__dirname, `${t}.js`)], { encoding: "utf8", timeout: 600000, env: { ...process.env, ANTHROPIC_API_KEY: "" } });
      exitCodes[t] = r.status;
      const fails = (r.stdout || "").split("\n").filter((l) => /^FAIL/.test(l));
      console.log(`      ${t}: ${r.status === 0 && !fails.length ? "passed" : `FAILED (exit ${r.status})`}`);
      if (r.status !== 0 || fails.length) out.push(`${t}: exit ${r.status} ${fails.join("; ")}`);
    }
    assert(!out.length, out.join("\n"));
  });

  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
