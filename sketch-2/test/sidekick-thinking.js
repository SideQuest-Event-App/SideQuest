// "Show the work": while Sidekick finds the two picks, the board turns into steps with real numbers,
// Sidekick says how it's going, and it never waits more than about 12 s for the AI.
//
//   node test/sidekick-thinking.js
//   (if require("playwright") fails: NODE_PATH=/opt/node-tools/node_modules node test/sidekick-thinking.js)
//
// The app runs in this process. The AI (choosing picks, writing the line) and the Google places search
// are faked, each with a delay the test sets. Timings are real (about a minute in all).
//
//   (a) slow AI (5 s): view.thinking reaches the stream within 300 ms of the decision, with real counts, and steps advance
//   (b) the progress line is said at about 3 s with a real number; the still-going line at about 10 s
//   (c) at about 12 s the engine's own top two are shown without the AI, and obey every hard limit;
//       a slow places search can't hold up the picks
//   (d) no step or line carries a private budget amount or an avoided area
//   (e) a fast AI (100 ms) shows no checklist and says no progress line
//   (f) in agent mode the server says nothing itself, but the progress reaches the agent
//   (g) the page renders the steps at 375 px: no overflow, nothing under the dock; screenshots

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");

let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); }

const ROOT = path.join(__dirname, "..");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "sk-thinking-shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-thinking-"));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (err) { last = err.message; } await wait(25); }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}
const near = (got, want, slack, what) => assert(Math.abs(got - want) <= slack, `${what}: ${got} ms, expected about ${want} ms (±${slack})`);

// Private answers in this test: budgets of $20 and $30, and two avoided areas
const PRIVATE = /\$\s?\d|\bdollars?\b|\bbucks\b|\btwenty\b|\bthirty\b|under \$|etobicoke|scarborough/i;

(async () => {
  const port = await freePort();
  Object.assign(process.env, { PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_STUN_URL: "off", SIDEKICK_PLACES_OFF: "1" });
  delete process.env.SUPABASE_URL;
  delete process.env.ELEVENLABS_API_KEY;

  // ---------- fakes, before the app loads ----------
  const AI = { match: 100, say: 100, matchCalls: 0 };
  const claude = require(path.join(ROOT, "lib", "sidekick", "claude"));
  claude.available = () => true;
  claude.say = async () => { await wait(AI.say); return "Two good ones tonight, have a look and vote."; };
  claude.tool = async () => { await wait(30); throw new Error("fake AI: read with keywords"); };
  const ai = require(path.join(ROOT, "lib", "ai"));
  // The fake AI picks the pool's 2nd and 1st, so a result that came from it is easy to tell apart
  ai.match = async (people, pool) => { AI.matchCalls++; await wait(AI.match); return { matches: pool.slice(0, 2).reverse().map((e) => ({ id: e.id, reason: "The AI liked this one.", fits: {} })) }; };
  const places = require(path.join(ROOT, "lib", "sidekick", "places"));
  const PLACES = { ms: 200, calls: 0 };
  const googlePlace = (i, lat, lng) => ({ id: `fake-${i}`, displayName: { text: `Fake Bar ${i}` }, formattedAddress: "1 Queen St W, Toronto", location: { latitude: lat, longitude: lng }, types: ["bar"], priceLevel: "PRICE_LEVEL_INEXPENSIVE", rating: 4.5, userRatingCount: 300, googleMapsUri: `https://maps.google.com/?cid=${i}` });
  const FAKE = [googlePlace(1, 43.6487, -79.3854), googlePlace(2, 43.6555, -79.4035), googlePlace(3, 43.6629, -79.3957)].map((p) => places.toCandidate(p, "music"));
  places.available = async () => true;
  places.forCall = async () => { PLACES.calls++; await wait(PLACES.ms); return { places: FAKE.map((p) => ({ ...p })), capped: null }; };
  for (const k of ["log", "error", "warn", "info"]) {
    const orig = console[k].bind(console);
    console[k] = (...args) => { const t = args.map(String).join(" "); if (/^(PASS|FAIL|All passed|\d+ failed|\s)/.test(t)) orig(...args); };
  }

  require(path.join(ROOT, "server.js"));
  const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
  const T = R._test;
  const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
  const base = `http://localhost:${port}`;
  await until(() => fetch(`${base}/api/sk/nights`).then((r) => r.ok), 30000, "the server");
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const nightsList = (await (await fetch(`${base}/api/sk/nights`)).json()).nights;
  const SAT = (nightsList.find((n) => /^Sat/.test(n.label) && n.events > 20) || nightsList.filter((n) => n.events > 0).sort((a, b) => b.events - a.events)[0]).date;
  const SAT_SPOKEN = new Date(SAT + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

  // A call that's ready for picks: one night, everyone has answered, two private budgets and avoided areas
  async function readyRoom({ persona = "friend", places: withPlaces = true } = {}) {
    const made = (await post("/api/sk/rooms", { name: "Asia", crew: "Thinking test", nights: [SAT], persona })).body;
    const room = T.rooms.get(made.room);
    const maya = (await post(`/api/sk/rooms/${made.room}/join`, { name: "Maya", mode: "voice", answers: { budget: "20", nos: ["Etobicoke"] } })).body.person;
    const jay = (await post(`/api/sk/rooms/${made.room}/join`, { name: "Jay", mode: "text", answers: { budget: "30", nos: ["Scarborough"] } })).body.person;
    await wait(350);
    await until(() => !room.thinking, 3000, "the engine to settle");
    await wait(150);
    clearTimeout(room.timer);
    clearTimeout(room.modeTimer);
    room.mode = "lead";
    room.modeSetAt = Date.now();
    room.card = null;
    for (const p of room.people) {
      T.setAnswer(room, p, "time", ["evening", "late"], "call_card");
      T.setAnswer(room, p, "vibe", ["music"], "call_card");
      T.setAnswer(room, p, "origin", "union", "call_card");
      if (!room.answers[p.id].budget) T.setAnswer(room, p, "budget", "any", "call_card");
    }
    T.setAnswer(room, room.people[0], "kind", "either", "call_card");
    room.placesTried = !withPlaces; // places are searched when the picks are about to be made
    room.places = [];
    room.said = [];
    return { rid: made.room, room, planner: made.person, maya, jay };
  }
  // Every view a person's phone gets, with when it arrived
  function watch(rid, pid) {
    const views = [];
    let buf = "";
    const req = http.get(`${base}/api/sk/rooms/${rid}/stream?p=${pid}`, (res) => res.on("data", (c) => {
      buf += c.toString();
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) if (part.startsWith("data: ")) views.push({ at: Date.now(), v: JSON.parse(part.slice(6)) });
    }));
    return { views, stop: () => req.destroy() };
  }
  // What every hard limit allows, straight from the engine's own filter
  const allowed = (room) => new Set(P.filterEvents([...T.upcoming(), ...(room.places || [])], room, Object.assign(P.facts(room), { relax: room.relax })).map((e) => e.id));
  // The count "fits the night and time" the steps should show, worked out here independently
  function fitCount(room) {
    const f = P.facts(room);
    const loose = { ...f, relax: room.relax, budget: { ...f.budget, value: null }, nos: { ...f.nos, value: [] }, origin: { ...f.origin, value: [] } };
    return P.filterEvents([...T.upcoming(), ...(room.places || [])], room, loose).length;
  }
  const NUM_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  const spokenNum = (n) => NUM_WORDS[n] || String(n);
  // Every step label, line and agent note from every scenario, for (d). Steps, progress lines and notes
  // must carry no amount at all; the picks line names the picks (titles come from the listings), so it's
  // checked for the private answers themselves.
  const privateSeen = [];
  const collect = (views, room) => {
    for (const x of views) for (const s of (x.v.thinking && x.v.thinking.steps) || []) privateSeen.push({ text: s.label, strict: true });
    for (const s of room.said) if (["progress", "still"].includes(s.move)) privateSeen.push({ text: s.text, strict: true });
    for (const s of room.said) if (s.move === "picks") privateSeen.push({ text: s.text, strict: false });
    for (const n of room.agentNotes || []) privateSeen.push({ text: n.text, strict: !/Two picks are on/.test(n.text) });
  };
  const ANSWERS = /etobicoke|scarborough|\$\s?(20|30)\b|\b(20|30) (dollars|bucks)\b|\btwenty\b|\bthirty\b/i;

  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  try {
    // ---------- (a) and (b): a slow AI (5 s) ----------
    let A;
    await test("(a) Slow AI (5 s): view.thinking reaches the stream within 300 ms of the decision, with real counts, and the steps advance", async () => {
      AI.match = 5000; AI.say = 100; PLACES.ms = 200;
      A = await readyRoom();
      const w = watch(A.rid, A.maya);
      await wait(300);
      const t0 = Date.now();
      A.ask = post(`/api/sk/rooms/${A.rid}/ask`, { p: A.planner });
      const first = await until(() => w.views.find((x) => x.v.thinking), 1500, "view.thinking on the stream");
      const startedAt = first.v.thinking.startedAt;
      assert(startedAt - t0 < 150, `the decision came straight away (${startedAt - t0} ms after the tap)`);
      assert(first.at - startedAt <= 300, `the steps were on the stream ${first.at - startedAt} ms after the decision`);
      assert.strictEqual(first.v.picks, null, "no picks yet");
      assert.strictEqual(first.v.card, null, "no question card while it thinks");
      await until(() => A.room.picks && A.room.picks.length, 8000, "the picks");
      await A.ask;
      w.stop();
      A.views = w.views;
      A.startedAt = startedAt;
      const withSteps = w.views.filter((x) => x.v.thinking);
      const labels = withSteps[withSteps.length - 1].v.thinking.steps.map((s) => s.label);
      assert.strictEqual(labels.length, 5);
      const look = labels[0].match(/^Checked (\d+) events and (\d+) places$/);
      assert(look, `step 1 counts events and places: ${labels[0]}`);
      assert.strictEqual(Number(look[1]), T.upcoming().length, "the real number of events");
      assert.strictEqual(Number(look[2]), A.room.places.length, "the real number of places");
      assert(A.room.places.length > 0, "the places search finished in time and counted");
      const fit = labels[1].match(/^(\d+) fit (\w+) after 6$/);
      assert(fit, `step 2: how many fit the night and time: ${labels[1]}`);
      assert.strictEqual(Number(fit[1]), fitCount(A.room), "the real number that fit");
      assert.strictEqual(fit[2], SAT_SPOKEN);
      assert.deepStrictEqual(labels.slice(2), ["Keeping what fits everyone's budget", "Matching your vibes", "Choosing one show and one spot"]);
      // The steps advance: the "now" step only moves forward, through at least four steps
      const nowIdx = withSteps.map((x) => x.v.thinking.steps.findIndex((s) => s.state === "now"));
      for (let i = 1; i < nowIdx.length; i++) assert(nowIdx[i] >= nowIdx[i - 1], `steps only move forward: ${nowIdx}`);
      assert(new Set(nowIdx).size >= 4, `the steps ticked through at least four stages: ${[...new Set(nowIdx)]}`);
      const last = withSteps[withSteps.length - 1].v.thinking.steps.map((s) => s.state);
      assert.deepStrictEqual(last.slice(0, 3), ["done", "done", "done"], `looked, filtered, budget: done (${last})`);
      // Hand-off: the view after the last steps has the picks and no steps
      const after = w.views[w.views.indexOf(withSteps[withSteps.length - 1]) + 1];
      assert(after && after.v.picks && after.v.picks.length === 2 && !after.v.thinking, "the steps give way to the picks cards");
      assert.strictEqual(A.room.said.filter((s) => s.move === "picks").length, 1, "the usual picks line, said once");
      assert(A.room.picks.every((p) => allowed(A.room).has(p.id)), "picks obey every hard limit");
      collect(w.views, A.room);
    });

    await test("(b) The progress line is said at about 3 s with a real number, in the persona's voice", async () => {
      const line = A.room.said.find((s) => s.move === "progress");
      assert(line, `a progress line was said (said: ${JSON.stringify(A.room.said.map((s) => s.move))})`);
      near(line.at - A.startedAt, 3000, 400, "progress line");
      const n = fitCount(A.room);
      assert(line.text.includes(spokenNum(n)), `it has the real count (${n}): ${line.text}`);
      assert(line.text.includes(SAT_SPOKEN), `and the night: ${line.text}`);
      assert(/There's like|Okay, \d+ options/.test(line.text), `the friend's wording: ${line.text}`);
      assert(!A.room.said.some((s) => s.move === "still"), "no still-going line when it lands at about 5 s");
      // It reaches phones as Sidekick's latest line, so the planner's phone reads it aloud
      assert(A.views.some((x) => (x.v.sidekick.slice(-1)[0] || {}).move === "progress"), "on the stream");
    });

    // ---------- (b) and (c): an AI that never answers in time ----------
    let C;
    await test("(b) Still slow: the still-going line at about 10 s; (c) at about 12 s the engine's own top two, no AI, every hard limit kept", async () => {
      AI.match = 20000; AI.say = 100; PLACES.ms = 200;
      C = await readyRoom({ persona: "concierge" });
      const w = watch(C.rid, C.planner);
      await wait(300);
      const calls = AI.matchCalls;
      post(`/api/sk/rooms/${C.rid}/ask`, { p: C.planner });
      const first = await until(() => w.views.find((x) => x.v.thinking), 1500, "the steps");
      const startedAt = first.v.thinking.startedAt;
      await until(() => C.room.picks && C.room.picks.length, 15000, "the fallback picks");
      const landed = w.views.find((x) => x.v.picks);
      await wait(100);
      w.stop();
      assert.strictEqual(AI.matchCalls, calls + 1, "the AI was asked once");
      const progress = C.room.said.find((s) => s.move === "progress");
      const still = C.room.said.find((s) => s.move === "still");
      assert(progress && /I've found \d+ options for|There are \d+ options for/.test(progress.text), `the concierge's progress line: ${progress && progress.text}`);
      near(progress.at - startedAt, 3000, 400, "progress line");
      assert(still, "a still-going line");
      near(still.at - startedAt, 10000, 500, "still-going line");
      assert(/taking a little longer than usual|Thank you for your patience/i.test(still.text), `the concierge's still-going line: ${still.text}`);
      near(landed.at - startedAt, 12000, 600, "picks on screen");
      const said = C.room.said.filter((s) => s.move === "picks");
      assert.strictEqual(said.length, 1, "one picks line");
      assert(/^(Rather than keep you waiting|So you're not kept waiting), here are the two strongest so far/.test(said[0].text), `the plain fallback line: ${said[0].text}`);
      // The engine's own top two, ranked by its score (one event, one place when both fit)
      const ranked = P.ranked([...T.upcoming(), ...C.room.places], C.room, Object.assign(P.facts(C.room), { relax: C.room.relax }));
      assert.strictEqual(C.room.picks[0].id, ranked[0].id, "the engine's top pick first (not the AI's)");
      const other = ranked.find((e) => (e.type === "place") !== (ranked[0].type === "place"));
      assert.strictEqual(C.room.picks[1].id, (other || ranked[1]).id, "then its best of the other kind");
      assert(C.room.picks.every((p) => !p.reason), "no AI write-up on the cards");
      // Every hard limit: night, time, budget ($20 is the lowest), areas avoided, trip length
      const ok = allowed(C.room);
      const all = [...T.upcoming(), ...C.room.places];
      for (const p of C.room.picks) {
        assert(ok.has(p.id), `${p.title} fits every hard limit`);
        const e = all.find((x) => x.id === p.id);
        assert(e.price == null || e.price <= 20, `${p.title} is within the lowest budget (${e.price})`);
        assert(!["Etobicoke", "Scarborough"].includes(e.area), `${p.title} is not in an avoided area`);
        if (e.type !== "place") assert.strictEqual(P.localDay(e.startsAt), SAT, `${p.title} is on the night`);
      }
      collect(w.views, C.room);
    });

    await test("(c) A slow places search (8 s) can't hold up the picks: about 3 s at most, then on without it", async () => {
      AI.match = 100; AI.say = 100; PLACES.ms = 8000;
      const S = await readyRoom();
      const w = watch(S.rid, S.maya);
      await wait(300);
      const t0 = Date.now();
      await post(`/api/sk/rooms/${S.rid}/ask`, { p: S.planner });
      const took = Date.now() - t0;
      w.stop();
      assert(S.room.picks && S.room.picks.length === 2, "picks");
      assert(took < 4000, `picks in ${took} ms, not after the 8 s search`);
      const steps = w.views.filter((x) => x.v.thinking).map((x) => x.v.thinking.steps[0].label);
      assert(/^Checking \d+ events and places nearby$/.test(steps[0]), `while the search runs: ${steps[0]}`);
      assert(/^Checked \d+ events$/.test(steps[steps.length - 1]), `then on without places: ${steps[steps.length - 1]}`);
      assert(S.room.picks.every((p) => allowed(S.room).has(p.id)), "picks obey every hard limit");
      await wait(5200); // the late search finishes: it doesn't change the picks or the board
      assert.strictEqual(S.room.places.length, 0, "late places are dropped");
      collect(w.views, S.room);
      PLACES.ms = 200;
    });

    // ---------- (e) ----------
    await test("(e) A fast AI (100 ms) shows no checklist and says no progress line", async () => {
      AI.match = 100; AI.say = 100; PLACES.ms = 50;
      for (let i = 0; i < 3; i++) {
        const E = await readyRoom({ places: false });
        const w = watch(E.rid, E.maya);
        await wait(300);
        const t0 = Date.now();
        await post(`/api/sk/rooms/${E.rid}/ask`, { p: E.planner });
        const took = Date.now() - t0;
        await wait(3500); // past the progress line's time
        w.stop();
        assert(E.room.picks && E.room.picks.length === 2, "picks");
        console.log(`      fast AI: picks in ${took} ms`);
        assert(!w.views.some((x) => x.v.thinking), `no checklist on the stream (picks in ${took} ms)`);
        assert(!E.room.said.some((s) => s.move === "progress" || s.move === "still"), "no progress line");
        assert.strictEqual(E.room.said.filter((s) => s.move === "picks").length, 1, "just the picks line");
        assert(E.room.said.find((s) => s.move === "picks").text === "Two good ones tonight, have a look and vote.", "the AI's line");
      }
    });

    // ---------- (f) ----------
    await test("(f) Agent mode: the server says nothing itself, and the progress reaches the agent (get_picks, then a note)", async () => {
      AI.match = 5000; AI.say = 100; PLACES.ms = 200;
      const F = await readyRoom();
      F.room.agentMode = true;
      F.room.agent = { startedAt: Date.now(), reserved: 0, live: true };
      F.room.agentNotes = [];
      const w = watch(F.rid, F.planner); // the planner's phone relays notes to the agent as contextual updates
      await wait(300);
      const t0 = Date.now();
      const got = await T.runTool(F.room, "get_picks", {});
      const took = Date.now() - t0;
      assert(took < 3200, `get_picks answered in ${took} ms instead of holding the agent's turn`);
      assert.strictEqual(got.body.next_move, "finding_picks", JSON.stringify(got.body).slice(0, 300));
      assert(got.body.example_line && got.body.example_line.includes(spokenNum(fitCount(F.room))), `a progress line with the real count: ${got.body.example_line}`);
      assert(Array.isArray(got.body.progress) && got.body.progress.length === 5, "the steps, for the agent");
      for (const t of [got.body.example_line, ...got.body.progress]) privateSeen.push({ text: t, strict: true });
      // (The board in planState shows the group's budget label, as everyone's screen does; what's new here must not)
      const added = JSON.stringify([got.body.next_move, got.body.what_to_do, got.body.example_line, got.body.progress, got.body.note]);
      assert(!PRIVATE.test(added), `the progress for the agent says nothing private: ${added.match(PRIVATE)}`);
      assert(!/etobicoke|scarborough/i.test(JSON.stringify(got.body)), "and get_picks names no avoided area");
      await until(() => F.room.agentNotes.some((n) => /Still finding the two picks/.test(n.text)), 2500, "the progress note for the agent");
      const note = F.room.agentNotes.find((n) => /Still finding the two picks/.test(n.text));
      near(note.at - F.room.agent.startedAt, 3300, 700, "progress note");
      await until(() => F.room.picks && F.room.picks.length, 6000, "the picks");
      await wait(200);
      w.stop();
      const toPlanner = w.views.map((x) => x.v.agentNotes || []).flat();
      assert(toPlanner.some((n) => /Still finding the two picks/.test(n.text)), "the progress note went to the planner's phone, which passes it to the agent");
      assert(toPlanner.some((n) => /Two picks are on everyone's screens/.test(n.text)), "and then the picks note");
      assert(w.views.some((x) => x.v.thinking), "the steps were on screen too");
      assert.deepStrictEqual(F.room.said.filter((s) => !s.system && s.move !== "agent").map((s) => s.text), [], "the server said nothing of its own");
      const move = await T.runTool(F.room, "get_next_move", {});
      assert.strictEqual(move.body.next_move, "present_picks");
      collect(w.views, F.room);
    });

    // ---------- (d) ----------
    await test("(d) No step, line or agent note carries a private budget amount or an avoided area", async () => {
      assert(privateSeen.length > 20, `checked ${privateSeen.length} labels and lines`);
      assert(privateSeen.filter((x) => x.strict).length > 20 && privateSeen.some((x) => !x.strict), "steps, lines and notes from every scenario");
      const bad = privateSeen.filter((x) => (x.strict ? PRIVATE : ANSWERS).test(x.text)).map((x) => x.text);
      assert.deepStrictEqual(bad, [], "private text in a step, line or note");
      // The progress lines in the line book: no amounts and no areas, for both personas
      const personas = require(path.join(ROOT, "lib", "sidekick", "personas"));
      for (const id of ["friend", "concierge"]) for (const k of ["progress", "still", "fallback"]) {
        assert.strictEqual(personas.LINES[id][k].length, 2, `${id} ${k}: two versions`);
        for (const v of personas.LINES[id][k]) assert(!PRIVATE.test(v) && !/\{(budget|nos|area|loosen)\}/.test(v), `${id} ${k}: ${v}`);
      }
    });

    // ---------- (g) ----------
    await test("(g) The page renders the steps at 375 px: no overflow, nothing under the dock, readable; then the fallback picks", async () => {
      fs.mkdirSync(SHOTS, { recursive: true });
      const shoot = async (motion) => {
        AI.match = motion === "reduce" ? 6000 : 20000; AI.say = 100; PLACES.ms = 200;
        const G = await readyRoom({ persona: "friend" });
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["microphone"], reducedMotion: motion });
        await ctx.addInitScript(([rid, pid]) => {
          localStorage.setItem(`sk:${rid}`, JSON.stringify({ person: pid, mode: "voice" }));
          if (window.speechSynthesis) { window.speechSynthesis.speak = () => {}; window.speechSynthesis.cancel = () => {}; }
        }, [G.rid, G.planner]);
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${base}/sk/${G.rid}`);
        await page.waitForSelector("#dock .ctrls", { timeout: 8000 });
        post(`/api/sk/rooms/${G.rid}/ask`, { p: G.planner });
        await page.waitForSelector(".board.thinking .step", { timeout: 2000 });
        await page.waitForFunction(() => document.querySelectorAll(".step.done").length >= 2, null, { timeout: 4000 });
        await page.waitForFunction(() => /like \d+ things|options on/.test(document.querySelector("#say") ? document.querySelector("#say").textContent : ""), null, { timeout: 4000 });
        const m = await page.evaluate(() => {
          const dock = document.getElementById("dock").getBoundingClientRect();
          window.scrollTo(0, document.scrollingElement.scrollHeight);
          const board = document.querySelector(".board.thinking").getBoundingClientRect();
          const els = [...document.querySelectorAll(".board.thinking *, #say *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest(".sr"));
          const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
          const weights = [...new Set(els.map((e) => getComputedStyle(e).fontWeight))];
          const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
          const bg = lum(rgb(getComputedStyle(document.querySelector(".board.thinking")).backgroundColor));
          const contrast = [...document.querySelectorAll(".step .sl, .steps-h")].map((e) => { const l = lum(rgb(getComputedStyle(e).color)); return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05); });
          const targets = [...document.querySelectorAll("#dock button")].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); });
          return {
            overflow: document.scrollingElement.scrollWidth - window.innerWidth,
            boardBottom: board.bottom, dockTop: document.getElementById("dock").getBoundingClientRect().top, dockH: dock.height,
            steps: [...document.querySelectorAll(".step")].map((s) => s.className.replace("step ", "").trim()),
            minSize: Math.min(...sizes), weights, minContrast: Math.min(...contrast), minTarget: Math.min(...targets),
            orb: getComputedStyle(document.querySelector(".board.thinking .orb")).animationName,
            live: document.getElementById("thinkLive").textContent,
          };
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(SHOTS, `steps-midway${motion === "reduce" ? "-reduced-motion" : ""}.png`) });
        assert(m.overflow <= 0, `no horizontal overflow (${m.overflow}px)`);
        assert(m.boardBottom <= m.dockTop + 0.5, `the steps end above the dock (${m.boardBottom} vs ${m.dockTop})`);
        assert.strictEqual(m.steps.length, 5);
        assert(m.minSize >= 12, `text 12px or larger (${m.minSize})`);
        assert(m.weights.every((x) => ["400", "500", "600"].includes(x)), `weights 400/500/600 (${m.weights})`);
        assert(m.minContrast >= 4.5, `AA contrast on the steps (${m.minContrast.toFixed(2)})`);
        assert(m.minTarget >= 44, `44px targets in the dock (${m.minTarget})`);
        assert(m.live, "the current step is announced to screen readers");
        if (motion === "reduce") assert.strictEqual(m.orb, "none", "no pulse with reduced motion");
        else assert.strictEqual(m.orb, "think", "the orb pulses while it thinks");
        // Hand-off to the picks cards (the fallback at about 12 s, or the AI at 6 s with reduced motion)
        await page.waitForSelector("[data-vote]", { timeout: 15000 });
        await wait(500);
        const after = await page.evaluate(() => ({ steps: document.querySelectorAll(".step").length, cards: document.querySelectorAll("[data-vote]").length, overflow: document.scrollingElement.scrollWidth - window.innerWidth, say: document.getElementById("say").textContent }));
        assert.strictEqual(after.steps, 0, "the steps are gone");
        assert.strictEqual(after.cards, 2, "two picks cards");
        assert(after.overflow <= 0, "no overflow on the picks");
        if (motion !== "reduce") {
          assert(/Taking forever|This is slow/.test(after.say), `the fallback line is on screen: ${after.say}`);
          await page.screenshot({ path: path.join(SHOTS, "fallback-picks.png") });
          await page.screenshot({ path: path.join(SHOTS, "fallback-picks-full.png"), fullPage: true });
        }
        assert.deepStrictEqual(errors, []);
        await ctx.close();
      };
      await shoot("no-preference");
      await shoot("reduce");
      console.log(`      screenshots: ${SHOTS}`);
    });
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
