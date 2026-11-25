// Sidekick's voice: the ElevenLabs agent leads on the planner's phone, and the built-in voice is quick.
//
//   node test/sidekick-voice.js
//   (if require("playwright") fails: NODE_PATH=/opt/node-tools/node_modules node test/sidekick-voice.js)
//
// The app runs in this process with a fake ElevenLabs API and a fake, fast AI. Live voice can't run
// here, so the browser gets a fake `Conversation` (served in place of the ElevenLabs SDK) that records
// what the page sends it and lets the test play the agent: transcripts, tool calls, errors.
//
//   (a) with keys set, the planner's one Start tap starts the agent session (no second tap)
//   (b) each client tool hits its route and returns scrubbed data (no private budget or dealbreakers)
//   (c) while the agent is on, the server never speaks for itself, but the board and cards still update
//   (d) a session error, a failed start, or the minute cap falls back to the built-in voice, quietly
//   (e) the built-in voice answers "Sidekick, ..." in under about 1.5 s server time, and still waits for quiet otherwise
//   (f) the built agent configs carry the client tools and turn settings, and the live agents match
//       (skipped, with the reason, when the ElevenLabs API can't be reached)

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");
const { spawnSync } = require("child_process");

let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); }

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-voice-"));
let failures = 0;
let skipped = 0;
async function test(name, fn) {
  try {
    const out = await fn();
    if (out && out.skip) { skipped++; console.log(`SKIP  ${name}\n      ${out.skip}`); } else console.log(`PASS  ${name}`);
  } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (err) { last = err.message; } await wait(50); }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

// The fake ElevenLabs SDK the planner's page loads instead of the real one
const FAKE_SDK = `
const el = (window.__el = window.__el || { sessions: [], ctx: [], msgs: [], starts: [] });
export const Conversation = {
  async startSession(opts) {
    el.starts.push({ connectionType: opts.connectionType, token: Boolean(opts.conversationToken), signed: Boolean(opts.signedUrl) });
    if (window.__elFail) throw new Error("fake: no connection");
    const s = {
      opts, ended: false,
      sendContextualUpdate(t) { el.ctx.push(t); },
      sendUserMessage(t) { el.msgs.push(t); },
      async endSession() { this.ended = true; },
    };
    el.sessions.push(s);
    return s;
  },
};`;
// Before any page script: record speech instead of speaking, and every toast shown
const INIT = () => {
  window.__spoken = [];
  window.__toasts = [];
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { if (u.text) window.__spoken.push(u.text); setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 20); }, 5); };
    window.speechSynthesis.cancel = () => {};
  }
  document.addEventListener("DOMContentLoaded", () => {
    const t = document.getElementById("toast");
    if (t) new MutationObserver(() => { if (t.classList.contains("show")) window.__toasts.push(t.textContent); }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
  });
};

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    SIDEKICK_PLACES_OFF: "1", SIDEKICK_STUN_URL: "off",
    ELEVENLABS_API_KEY: "test-key", ELEVENLABS_AGENT_FRIEND: "agent_friend", ELEVENLABS_AGENT_CONCIERGE: "agent_concierge",
    ELEVENLABS_MINUTES_PER_MONTH: "100", ELEVENLABS_STOP_AT: "1", ELEVENLABS_DAILY_MINUTES: "100", ELEVENLABS_MAX_CALL_MINUTES: "10",
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SIDEKICK_ELEVENLABS_OFF;

  // ---------- fakes, before the app loads ----------
  const realFetch = global.fetch;
  const eleven = [];
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.startsWith("https://api.elevenlabs.io/")) {
      eleven.push(url);
      assert.strictEqual(opts.headers["xi-api-key"], "test-key");
      if (url.includes("/conversation/token")) return { ok: true, json: async () => ({ token: "fake-webrtc-token", conversation_id: "conv_1" }) };
      return { ok: true, json: async () => ({ signed_url: "wss://example.test/convai?token=abc" }) };
    }
    return realFetch(url, opts);
  };
  // A fast fake AI (about 60 ms a reply); fact reading falls back to keywords
  const claude = require(path.join(ROOT, "lib", "sidekick", "claude"));
  const AI_MS = 60;
  claude.available = () => true;
  claude.say = async () => { await wait(AI_MS); return "Saturday has the most on, so that's where I'd look."; };
  claude.tool = async () => { await wait(AI_MS); throw new Error("fake AI: read with keywords"); };
  const ai = require(path.join(ROOT, "lib", "ai"));
  ai.match = async () => ({ matches: [] });
  for (const k of ["log", "error", "warn", "info"]) {
    const orig = console[k].bind(console);
    console[k] = (...args) => { const t = args.map(String).join(" "); if (/^(PASS|FAIL|SKIP|All passed|\d+ failed|\s)/.test(t)) orig(...args); };
  }

  require(path.join(ROOT, "server.js"));
  const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
  const T = R._test;
  const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
  const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
  const base = `http://localhost:${port}`;
  await until(() => realFetch(`${base}/api/sk/nights`).then((r) => r.ok), 30000, "the server");
  const post = (p, body) => realFetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const nightsList = (await (await realFetch(`${base}/api/sk/nights`)).json()).nights;
  const withEvents = nightsList.filter((n) => n.events > 0);
  const SAT = (withEvents.find((n) => /^Sat/.test(n.label)) || withEvents[0]).date;

  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  async function plannerPage() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@elevenlabs\/client/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: FAKE_SDK }));
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => { if (r.method() === "POST") requests.push(new URL(r.url()).pathname); });
    return { page, errors, requests, ctx };
  }
  // The planner's start screen, then ONE tap on Start
  let taps = 0;
  async function startCall(page, crew) {
    await page.goto(`${base}/sk?quick=1`); // the one-page start screen (the Plan tab's steps are in plan-flow.e2e.js)
    await page.fill("#name", "Asia");
    await page.fill("#crew", crew);
    if (!(await page.$('.chips[data-name="nights"] .chip[aria-pressed=true]'))) await page.click('.chips[data-name="nights"] .chip');
    await page.click('.chips[data-name="origin"] .chip[data-value="union"]'); // a station: no location prompt in the test
    taps++;
    await page.click("#go");
    await page.waitForURL(/\/sk\/[\w-]+$/);
    const rid = page.url().split("/sk/")[1];
    return { rid, room: T.rooms.get(rid) };
  }
  const session = (page) => page.evaluate(() => (window.__el && window.__el.sessions.length) || 0);
  const callTool = (page, name, params = {}) => page.evaluate(([n, p]) => window.__el.sessions[window.__el.sessions.length - 1].opts.clientTools[n](p).then((r) => JSON.parse(JSON.stringify(r))), [name, params]);
  const spokenByServer = (room, since) => room.said.filter((x) => x.at >= since && !x.system && x.move !== "agent");

  try {
    // ---------- (a) ----------
    let A;
    await test("(a) With keys set, the planner's one Start tap starts the agent session, with no second tap", async () => {
      A = await plannerPage();
      taps = 0;
      const { rid, room } = await startCall(A.page, "Voice test");
      A.rid = rid;
      A.room = room;
      await until(() => session(A.page), 8000, "the agent session to start");
      await until(() => room.agentMode, 4000, "the server to hear the session is live");
      assert.strictEqual(taps, 1, "one tap");
      const opts = await A.page.evaluate(() => { const s = window.__el.sessions[0].opts; return { tools: Object.keys(s.clientTools || {}).sort(), vars: s.dynamicVariables, starts: window.__el.starts }; });
      assert.deepStrictEqual(opts.tools, ["accept_relax", "choose_wait", "get_next_move", "get_picks", "get_plan_state", "record_facts", "show_private_card"]);
      assert(opts.vars && opts.vars.opening && opts.vars.room_id === rid, "the agent gets its opening line and the room");
      assert.deepStrictEqual(opts.starts[0], { connectionType: "webrtc", token: true, signed: false }, "WebRTC first, with a conversation token");
      assert(eleven.some((u) => u.includes("/conversation/token")) && eleven.some((u) => u.includes("get-signed-url")), "both ways in were fetched");
      assert(A.requests.includes(`/api/sk/rooms/${rid}/voice-agent`) && A.requests.includes(`/api/sk/rooms/${rid}/voice-agent/live`));
      // No switch: the bar shows a "Natural voice" status chip, and the orb sheet has no voice switches
      assert.strictEqual((await A.page.textContent("#chipVoice")).trim(), "Natural voice", "a status chip says the natural voice is on");
      if (await A.page.$("#sheet")) await A.page.keyboard.press("Escape"); // the People sheet a planner sees on starting alone
      await A.page.click("#orbBtn");
      await A.page.waitForSelector("#orbSheet [role=dialog]");
      for (const sel of ["#agent", "#aloud", "#audioBtn", "#muteBtn"]) assert.strictEqual(await A.page.$(`#orbSheet ${sel}`), null, `no ${sel} switch in the orb sheet`);
      assert(!/Natural voice|Read Sidekick aloud|Talk in the app/.test(await A.page.textContent("#orbSheet")), "no voice switches by name");
      await A.page.keyboard.press("Escape");
      assert.deepStrictEqual(A.errors, []);
    });

    await test("(a) An old stored 'natural voice off' or 'read aloud off' is ignored: the agent still starts, and the keys are cleared", async () => {
      const O = await plannerPage();
      await O.ctx.addInitScript(() => { if (!sessionStorage.getItem("oldKeys")) { sessionStorage.setItem("oldKeys", "1"); localStorage.setItem("sk:agentVoice", "false"); localStorage.setItem("sk:aloud", "false"); } });
      const { room } = await startCall(O.page, "Old switch test");
      await until(() => session(O.page), 8000, "the agent session to start despite sk:agentVoice=false");
      await until(() => room.agentMode, 4000, "the server to hear the session is live");
      assert.deepStrictEqual(await O.page.evaluate(() => [localStorage.getItem("sk:agentVoice"), localStorage.getItem("sk:aloud")]), [null, null], "the old keys are gone");
      assert.deepStrictEqual(O.errors, []);
      await O.ctx.close();
    });

    // ---------- (b) ----------
    await test("(b) Each client tool hits its route and returns scrubbed data: no private budget or dealbreaker text", async () => {
      const { rid, room } = A;
      const maya = (await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice", answers: { budget: "20", nos: ["Etobicoke"] } })).body.person;
      const jay = (await post(`/api/sk/rooms/${rid}/join`, { name: "Jay", mode: "text", answers: { budget: "30", nos: ["Scarborough"] } })).body.person;
      A.maya = maya;
      A.jay = jay;
      await wait(400);
      const secret = (A.secret = /Etobicoke|Scarborough|\$\s?20\b|\$\s?30\b|Under \$|twenty|thirty/i);
      const results = {};
      for (const [name, params] of [["get_plan_state", {}], ["get_next_move", {}], ["record_facts", { updates: [{ person: "Maya", slot: "night", values: ["Saturday"] }, { person: "Maya", slot: "budget", values: ["Under $20"] }] }], ["show_private_card", { slot: "budget" }], ["accept_relax", {}], ["choose_wait", { choice: "now" }]]) { // get_picks: in (c), once the plan is far enough along
        const before = A.requests.length;
        results[name] = await callTool(A.page, name, params);
        assert(A.requests.slice(before).includes(`/api/sk/rooms/${rid}/agent-tool/${name}`), `${name} went to its own route`);
        const text = JSON.stringify(results[name]);
        assert(!secret.test(text), `${name} returned private text: ${text.match(secret)}`);
      }
      assert.strictEqual(results.record_facts.recorded, 1, "the night was recorded");
      assert(results.record_facts.skipped.some((x) => /budget/.test(x)), "a budget the agent overheard is refused, not recorded");
      assert.strictEqual((room.answers[maya].budget || {}).value, "20", "Maya's private answer is untouched");
      assert(P.facts(room).night.supporters[SAT].includes("Maya"), "record_facts updated the board");
      assert(results.get_next_move.next_move && results.get_next_move.what_to_do, "get_next_move says what to do");
      assert.strictEqual(results.show_private_card.shown, true);
      assert.strictEqual(results.choose_wait.chosen, null, "choose_wait with no wait-or-now question open changes nothing");
      // The same tools without the agent on are refused (no tool calls from just anyone)
      assert.strictEqual((await post(`/api/sk/rooms/${rid}/agent-tool/get_plan_state`, { p: maya })).status, 403, "only the planner's phone");
    });

    // ---------- (c) ----------
    await test("(c) While the agent is on, the server never speaks for itself, but the board and cards still update", async () => {
      const { page, rid, room, maya, jay } = A;
      const since = room.agent.startedAt;
      // The agent hears the room and leads: its words and what it heard come back to the server
      await page.evaluate(() => { const o = window.__el.sessions[0].opts; o.onMessage({ source: "ai", message: "Hey y'all, which night works?" }); o.onMessage({ source: "user", message: "Friday is bad, Saturday works for me" }); });
      await until(() => room.said.some((x) => x.move === "agent"), 3000, "the agent's line on the board");
      // A friend taps a card and another types: the board updates, and the agent is told
      if (!room.card || P.SLOTS[room.card.slot].private) room.card = { slot: "time", at: Date.now() };
      const slot = room.card.slot;
      const value = P.optionsFor(slot, room)[0][0];
      assert.strictEqual((await post(`/api/sk/rooms/${rid}/answer`, { p: maya, slot, value: P.SLOTS[slot].multi ? [value] : value })).status, 200);
      await post(`/api/sk/rooms/${rid}/line`, { p: jay, text: "after 8 is best for me", kind: "typed" });
      await until(() => page.evaluate(() => window.__el.ctx.some((t) => /Maya tapped/.test(t))), 4000, "the tap passed to the agent as context");
      await until(() => page.evaluate(() => window.__el.msgs.some((t) => /^Jay \(typed\): after 8/.test(t))), 4000, "the typed line passed to the agent as a message");
      await wait(1500); // let the engine think about all of it
      const move = await callTool(page, "get_next_move");
      assert(move.board.some((r) => r.fact === "Night" && r.value), "the board has the night");
      // Picks: the engine makes them, the screen shows them, the agent is told, and still no server voice
      assert(!room.picks, "no picks yet");
      const before = A.requests.length;
      const picks = await callTool(page, "get_picks");
      assert(A.requests.slice(before).includes(`/api/sk/rooms/${rid}/agent-tool/get_picks`), "get_picks went to its own route");
      assert(!A.secret.test(JSON.stringify(picks)), "get_picks returned no private text");
      await until(() => room.picks, 4000, "picks");
      assert(picks.picks && picks.picks.length === 2, "two picks came back to the agent");
      await page.waitForSelector("[data-vote]", { timeout: 4000 });
      await until(() => page.evaluate(() => window.__el.ctx.some((t) => /picks are on everyone's screens/i.test(t))), 4000, "picks passed to the agent");
      assert.deepStrictEqual(spokenByServer(room, since).map((x) => x.text), [], "the server said nothing of its own");
      const spoken = await page.evaluate(() => window.__spoken.slice());
      assert.deepStrictEqual(spoken, [], "the planner's phone read nothing aloud with the built-in voice");
      const v = T.viewFor(room, maya);
      assert(v.sidekick.every((x) => x.system || x.move === "agent"), "phones only show the agent's lines and app notes");
      // A private tap is reported without its value
      await post(`/api/sk/rooms/${rid}/answer`, { p: jay, slot: "budget", value: "50" });
      await until(() => page.evaluate(() => window.__el.ctx.some((t) => /Jay added their budget privately/.test(t))), 4000, "the private tap passed on without its value");
      const told = await page.evaluate(() => window.__el.ctx.concat(window.__el.msgs).join("\n"));
      assert(!/\$\s?50|Under \$50|fifty/i.test(told), "the budget value never reaches the agent");
      assert(!A.secret.test(told), "notes to the agent carry no private answers");
      assert.deepStrictEqual(A.errors, []);
    });

    // ---------- (d) ----------
    await test("(d) A session error falls back to the built-in voice once, with at most one note and no toast storm", async () => {
      const D = await plannerPage();
      const { rid, room } = await startCall(D.page, "Drop test");
      await until(() => room.agentMode, 8000, "the agent to start");
      await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice" });
      await wait(400);
      const reserved = (await usage.status()).elevenlabs_minutes.used.month;
      // A failing tool is the agent's problem, not a reason to switch voices
      await D.page.evaluate(() => window.__el.sessions[0].opts.onError("Client tool execution failed", { clientToolName: "get_picks" }));
      await wait(300);
      assert.strictEqual(room.agentMode, true, "a tool error doesn't end the session");
      // The connection drops: error, disconnect, error again
      await D.page.evaluate(() => { const o = window.__el.sessions[0].opts; o.onError("socket closed"); o.onDisconnect({ reason: "error" }); o.onError("again"); });
      await until(() => !room.agentMode, 4000, "the server to hear the agent is off");
      await until(() => spokenByServer(room, 0).length, 5000, "the built-in voice to pick the call back up");
      await until(() => D.page.evaluate(() => window.__spoken.length), 6000, "the planner's phone to read it aloud");
      const toasts = await D.page.evaluate(() => window.__toasts.slice());
      assert(toasts.length <= 1, `at most one note, got ${JSON.stringify(toasts)}`);
      assert(await D.page.evaluate(() => window.__el.sessions[0].ended), "the session was ended");
      if (await D.page.$("#sheet")) await D.page.keyboard.press("Escape"); // the People sheet a planner sees on starting alone
      assert((await usage.status()).elevenlabs_minutes.used.month < reserved, "unused minutes came back");
      // "Try sound again" in the voice sheet retries the natural voice (there's no switch for it)
      await D.page.click("#voicePill");
      await D.page.click("#voiceRetry");
      await until(() => D.page.evaluate(() => window.__el.sessions.length >= 2), 6000, "Try sound again to start a new agent session");
      await until(() => room.agentMode, 4000, "the server to hear the agent is back");
      if (await D.page.$("#voiceSheet")) await D.page.keyboard.press("Escape");
      assert.deepStrictEqual(D.errors, []);
      await D.ctx.close();
    });

    await test("(d) A session that can't start, or the minute cap, falls back silently: no toast, built-in voice", async () => {
      // Can't connect at all (WebRTC, then websocket): the reservation comes back, nothing on screen
      const F = await plannerPage();
      await F.ctx.addInitScript(() => { window.__elFail = true; });
      const used0 = (await usage.status()).elevenlabs_minutes.used.month;
      const { rid, room } = await startCall(F.page, "Fail test");
      await until(() => F.page.evaluate(() => (window.__el && window.__el.starts.length) >= 2), 6000, "both connection attempts");
      await until(async () => (await usage.status()).elevenlabs_minutes.used.month === used0 && !room.agent, 4000, "the minutes to come back");
      assert.deepStrictEqual(await F.page.evaluate(() => window.__el.starts.map((s) => s.connectionType)), ["webrtc", "websocket"]);
      assert.deepStrictEqual(await F.page.evaluate(() => window.__toasts.slice()), [], "no toast for the automatic start");
      await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice" });
      await until(() => F.page.evaluate(() => window.__spoken.length), 6000, "the built-in voice reads the welcome");
      assert(spokenByServer(room, 0).length, "the server speaks with the built-in voice");
      await F.ctx.close();

      // The minute cap is reached between opening the page and the tap: the route says no, quietly
      const C = await plannerPage();
      await C.page.goto(`${base}/sk?quick=1`); // the one-page start screen
      await C.page.waitForSelector("#go");
      const left = (await usage.status()).elevenlabs_minutes;
      await usage.reserve("elevenlabs_minutes", left.limits.day - left.used.day); // use up the day
      await C.page.fill("#name", "Asia");
      await C.page.fill("#crew", "Cap test");
      if (!(await C.page.$('.chips[data-name="nights"] .chip[aria-pressed=true]'))) await C.page.click('.chips[data-name="nights"] .chip');
      await C.page.click('.chips[data-name="origin"] .chip[data-value="union"]');
      await C.page.click("#go");
      await C.page.waitForURL(/\/sk\/[\w-]+$/);
      const crid = C.page.url().split("/sk/")[1];
      await until(() => C.requests.includes(`/api/sk/rooms/${crid}/voice-agent`), 4000, "the session request");
      await wait(500);
      assert.strictEqual(await session(C.page), 0, "no session past the cap");
      assert.deepStrictEqual(await C.page.evaluate(() => window.__toasts.slice()), [], "no toast at the cap");
      if (await C.page.$("#sheet")) await C.page.keyboard.press("Escape"); // the People sheet a planner sees on starting alone
      await C.page.click("#orbBtn");
      await C.page.waitForSelector("#orbSheet [role=dialog]");
      assert.strictEqual(await C.page.$("#agent"), null, "no natural-voice switch");
      await C.page.keyboard.press("Escape");
      assert.strictEqual(T.rooms.get(crid).agentMode, false);
      // And a fresh start screen at the cap doesn't even try
      assert.strictEqual((await (await realFetch(`${base}/api/sk/nights`)).json()).voiceAgent, false);
      await C.ctx.close();
      usage._reset();
    });

    // ---------- (e) ----------
    await test("(e) The built-in voice answers 'Sidekick, ...' in under about 1.5 s server time, and still waits for quiet otherwise", async () => {
      const made = (await post("/api/sk/rooms", { name: "Asia", crew: "Fast test", nights: withEvents.slice(0, 2).map((n) => n.date) })).body;
      const rid = made.room;
      const room = T.rooms.get(rid);
      const maya = (await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice" })).body.person;
      const jay = (await post(`/api/sk/rooms/${rid}/join`, { name: "Jay", mode: "voice" })).body.person;
      await wait(500);
      await T.setMode(room, "lead", "vote");
      const views = [];
      const req = http.get(`${base}/api/sk/rooms/${rid}/stream?p=${made.person}`, (res) => res.on("data", (c) => { for (const part of c.toString().split("\n\n")) if (part.startsWith("data: ")) views.push({ at: Date.now(), v: JSON.parse(part.slice(6)) }); }));
      await wait(300);
      const replyAfter = async (t0, before) => {
        const hit = await until(() => views.find((x) => x.at >= t0 && (x.v.sidekick.slice(-1)[0] || {}).id !== before && !(x.v.sidekick.slice(-1)[0] || {}).system), 5000, "Sidekick's reply on the stream");
        return hit.at - t0;
      };
      const lastId = () => (room.said.slice(-1)[0] || {}).id;
      const times = [];
      for (let i = 0; i < 3; i++) {
        room.lastSaidAt = Date.now(); // Sidekick just spoke: the 5 s gap would hold back anything else
        const before = lastId();
        const t0 = Date.now();
        await post(`/api/sk/rooms/${rid}/line`, { p: maya, text: "Sidekick, which night has more going on?", kind: "spoken" });
        times.push(await replyAfter(t0, before));
        await wait(200);
      }
      console.log(`      direct question -> reply on the stream: ${times.join(", ")} ms (fake AI ${AI_MS} ms a call)`);
      assert(times.every((t) => t < 1500), `answered in under 1.5 s: ${times}`);
      assert(times.every((t) => t < T.QUIET_MS), `and sooner than the usual ${T.QUIET_MS} ms wait for quiet: ${times}`);
      // Someone keeps talking right after the question: Sidekick waits for them to finish
      let before = lastId();
      let t0 = Date.now();
      await post(`/api/sk/rooms/${rid}/line`, { p: maya, text: "Sidekick, what do you think?", kind: "spoken" });
      await wait(250);
      const t1 = Date.now();
      await post(`/api/sk/rooms/${rid}/line`, { p: jay, text: "hang on I'm still checking my calendar", kind: "spoken" });
      const waited = (await replyAfter(t0, before)) - (t1 - t0);
      assert(waited >= T.QUIET_ASKED_MS - 20, `waited for Jay to finish (${waited} ms after his line)`);
      // A line nobody addressed to Sidekick: nothing happens before the usual quiet (900 ms)
      await wait(1500);
      before = lastId();
      t0 = Date.now();
      room.lastSaidAt = 0;
      await post(`/api/sk/rooms/${rid}/line`, { p: jay, text: "I could do the later one I guess", kind: "spoken" });
      await wait(T.QUIET_MS - 150);
      assert(room.pending.length > 0, "still waiting for quiet before reading the line");
      assert.strictEqual(lastId(), before, "and nothing said yet");
      await until(() => room.pending.length === 0, 3000, "the line to be read after the quiet");
      req.destroy();
    });

    // Sentence by sentence: the built-in voice starts the first sentence without waiting for the rest
    await test("(e) The built-in voice reads a long reply sentence by sentence", async () => {
      const { page } = A;
      const parts = await page.evaluate(() => { window.__spoken = []; const u = window.SidekickVoice.say("Found two good ones. A jazz trio in Leslieville at eight. Or the night market, which is free. Vote away!", { slot: "friend" }); return { chunks: u.chunks.length, spoken: window.__spoken.slice() }; });
      assert(parts.chunks >= 3, `split into sentences (${parts.chunks})`);
      assert.strictEqual(parts.spoken[0], "Found two good ones.");
    });

    // ---------- (f) ----------
    await test("(f) The built agent configs carry the client tools and the new turn settings", async () => {
      const built = require(path.join(ROOT, "tools", "elevenlabs-agents.js"));
      for (const a of built.AGENTS) {
        const c = built.config(a);
        const p = c.conversation_config.agent.prompt;
        const client = p.tools.filter((t) => t.type === "client");
        assert.deepStrictEqual(client.map((t) => t.name).sort(), ["accept_relax", "choose_wait", "get_next_move", "get_picks", "get_plan_state", "record_facts", "show_private_card"]);
        assert(client.every((t) => t.description && t.expects_response === true), "each tool has a description and waits for the app");
        const rec = client.find((t) => t.name === "record_facts").parameters;
        assert.deepStrictEqual(rec.properties.updates.items.properties.slot.enum, ["night", "time", "origin", "vibe", "kind", "want"], "record_facts takes public slots only");
        assert(!["budget", "nos"].some((s) => rec.properties.updates.items.properties.slot.enum.includes(s)), "record_facts can't take private slots");
        assert(p.built_in_tools.skip_turn && p.ignore_default_personality === true);
        assert(!/what kind of (night|evening)/i.test(p.prompt), "the agent prompt never asks the old closed vibe question");
        // ...and no built-in line of either persona does (spoken, typed chat, or the style examples)
        const personas = require(path.join(ROOT, "lib", "sidekick", "personas"));
        const strings = JSON.stringify([personas.LINES, personas.CHAT, personas.PERSONAS, ["friend", "concierge"].map((x) => personas.systemPrompt(x))]);
        assert(!/what kind of (night|evening)/i.test(strings), "no persona line asks \"what kind of night\"");
        assert(/in the mood for/.test(JSON.stringify(personas.LINES.friend.mode_lead)) && /in the mood for/.test(JSON.stringify(personas.LINES.concierge.mode_lead)), "the opening question is the open one, for both personas");
        // The vibe is an open question; anything off the list is recorded as want and said back
        assert(/What are you in the mood for\? Could be food, a show, anything/.test(p.prompt) && /record it as want in their words and say it back/.test(p.prompt), "open vibe question in the agent prompt");
        assert.strictEqual(c.conversation_config.tts.model_id, "eleven_flash_v2");
        assert.strictEqual(c.conversation_config.turn.turn_eagerness, "normal");
        assert.strictEqual(c.conversation_config.turn.speculative_turn, true);
        assert(c.conversation_config.conversation.client_events.includes("interruption"), "interruptions on");
        assert(c.conversation_config.conversation.client_events.includes("client_tool_call"), "tool calls reach the browser");
        assert.strictEqual(c.conversation_config.agent.first_message, "{{opening}}");
        assert.strictEqual(c.platform_settings.privacy.record_voice, false);
        assert(/get_next_move/.test(p.prompt) && /one short question at a time/i.test(p.prompt));
        // "Wait for everyone, or show me now?": the agent asks it (ask_wait) and records the answer with choose_wait
        assert(/choose_wait/.test(p.prompt) && /ask_wait/.test(p.prompt), "the prompt explains the wait-or-now question");
        assert.deepStrictEqual(client.find((t) => t.name === "choose_wait").parameters.properties.choice.enum, ["wait", "now"]);
      }
      const saved = JSON.parse(fs.readFileSync(path.join(ROOT, "reference", "elevenlabs-agents.json"), "utf8"));
      assert(saved.agents.every((a) => a.conversation_config.agent.prompt.tools.some((t) => t.name === "get_next_move")), "reference/elevenlabs-agents.json is up to date");
    });

    await test("(f) The live agents were read back and match the config", async () => {
      const env = { ...process.env, NODE_USE_ENV_PROXY: "1" };
      // Use the real key from .env when there is one; in a sandbox whose proxy adds the key, any value works
      for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_FRIEND", "ELEVENLABS_AGENT_CONCIERGE"]) delete env[k];
      if (!fs.existsSync(path.join(ROOT, ".env")) && !process.env.HTTPS_PROXY) return { skip: "No ELEVENLABS_API_KEY here and no proxy that adds one: can't read the live agents." };
      if (!fs.existsSync(path.join(ROOT, ".env"))) env.ELEVENLABS_API_KEY = "proxy-adds-the-key";
      const out = spawnSync(process.execPath, [path.join(ROOT, "tools", "elevenlabs-agents.js"), "--check"], { env, encoding: "utf8", timeout: 60000 });
      const text = `${out.stdout}\n${out.stderr}`;
      if (/fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|\(401\)|\(403\)|timed out/i.test(text) || out.error) return { skip: `The ElevenLabs API couldn't be reached from here: ${(text.match(/.*(fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|401|403).*/) || [String(out.error)])[0].trim().slice(0, 160)}` };
      assert.strictEqual(out.status, 0, text);
      assert.match(text, /Both agents match the config/);
      for (const line of text.split("\n").filter((l) => /^\s+(ok|DIFF)\s/.test(l))) assert(/^\s+ok\s/.test(line), line);
    });
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? `\n${failures} failed${skipped ? `, ${skipped} skipped` : ""}` : `\nAll passed${skipped ? ` (${skipped} skipped)` : ""}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
