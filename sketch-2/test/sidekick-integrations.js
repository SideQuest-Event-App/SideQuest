// Tests for the paid integrations, with Google and ElevenLabs faked, so nothing is spent:
//  1. Usage caps: searches stop at the daily and monthly limits and never go past them
//  2. Google places join a call: the plan-type question, opening hours, place picks with attribution
//  3. ElevenLabs: the session route respects its minute cap, moves become cues, unused minutes come back,
//     and the agent's tool routes need the secret and never return private answers
//
//   node test/sidekick-integrations.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-usage-"));
Object.assign(process.env, {
  SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"),
  ANTHROPIC_API_KEY: "",
  GOOGLE_MAPS_API_KEY: "test-key",
  GOOGLE_PLACES_FREE_PER_MONTH: "10", GOOGLE_PLACES_STOP_AT: "0.8", GOOGLE_PLACES_DAILY_MAX: "5", // stops at 5 a day, 8 a month
  ELEVENLABS_API_KEY: "test-key", ELEVENLABS_AGENT_FRIEND: "agent_friend", ELEVENLABS_AGENT_CONCIERGE: "agent_concierge",
  ELEVENLABS_MINUTES_PER_MONTH: "30", ELEVENLABS_STOP_AT: "0.8", ELEVENLABS_DAILY_MINUTES: "20", ELEVENLABS_MAX_CALL_MINUTES: "10",
  SIDEKICK_TOOL_SECRET: "s3cret",
});
delete process.env.SUPABASE_URL;

const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "sketch-1", "seed", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));

// ---------- fake Google and ElevenLabs ----------
const calls = { google: 0, eleven: 0 };
const fakePlace = (n, lat, lng, types, opts = {}) => ({
  id: `place_${n}`, displayName: { text: `Test Spot ${n}` }, formattedAddress: `${n} Queen St W, Toronto`, location: { latitude: lat, longitude: lng },
  types, primaryType: types[0], priceLevel: opts.level || "PRICE_LEVEL_MODERATE", rating: opts.rating || 4.5, userRatingCount: 300, googleMapsUri: `https://maps.google.com/?cid=${n}`,
  regularOpeningHours: opts.closed ? { periods: [{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }] } : { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 16 }, close: { day: (d + 1) % 7, hour: 2 } })) },
});
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith("https://places.googleapis.com/")) {
    calls.google++;
    calls.lastBody = JSON.parse(opts.body);
    assert(opts.headers["x-goog-fieldmask"].includes("places.regularOpeningHours"), "asks for opening hours");
    assert.strictEqual(opts.headers["x-goog-api-key"], "test-key");
    return { ok: true, json: async () => ({ places: [
      fakePlace(1, 43.6466, -79.405, ["karaoke", "bar"]),
      fakePlace(2, 43.6545, -79.4005, ["bar"], { level: "PRICE_LEVEL_INEXPENSIVE", rating: 4.7 }),
      fakePlace(3, 43.663, -79.333, ["night_club"], { level: "PRICE_LEVEL_EXPENSIVE" }),
      fakePlace(4, 43.65, -79.39, ["art_gallery"], { closed: true }),
    ] }) };
  }
  if (url.startsWith("https://api.elevenlabs.io/")) {
    calls.eleven++;
    assert.strictEqual(opts.headers["xi-api-key"], "test-key");
    return { ok: true, json: async () => ({ signed_url: "wss://example.test/convai?token=abc" }) };
  }
  throw new Error(`Unexpected fetch in test: ${url}`);
};

const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
const places = require(path.join(ROOT, "lib", "sidekick", "places"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
R.init({ events: () => events });
const T = R._test;

// A tiny stand-in for the HTTP layer
function call(method, pathname, body = {}, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(pathname, "http://test");
    R.handle({ method, headers, on() {} }, {}, url, { readBody: async () => body, sendJSON: (_r, status, data) => resolve({ status, data }) });
  });
}

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}

const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date());
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const FRI = days.find((d) => new Date(d + "T12:00:00").getDay() === 5);
const SAT = days.find((d) => d > FRI && new Date(d + "T12:00:00").getDay() === 6);

(async () => {
  await test("Places: each search is counted, and searching stops at the daily limit", async () => {
    usage._reset();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await places.search("music"));
    assert.strictEqual(calls.google, 5, `Google was called ${calls.google} times, expected 5`);
    assert.strictEqual(results.filter((r) => r.places.length).length, 5);
    assert.strictEqual(results[6].capped, "daily limit");
  });

  await test("Places: the monthly limit (80% of the free allowance) is never passed", async () => {
    usage._reset();
    process.env.GOOGLE_PLACES_DAILY_MAX = "100";
    const before = calls.google;
    for (let i = 0; i < 12; i++) await places.search("games");
    assert.strictEqual(calls.google - before, 8, `expected 8 searches, got ${calls.google - before}`);
    assert.strictEqual(await places.available(), false);
    const st = await usage.status();
    assert.strictEqual(st.places_text_search.used.month, 8);
  });

  await test("Places: the count survives a restart (saved to disk)", async () => {
    const saved = JSON.parse(fs.readFileSync(process.env.SIDEKICK_USAGE_FILE, "utf8"));
    const month = Object.keys(saved.month).pop();
    assert.strictEqual(saved.month[month].places_text_search, 8);
  });

  await test("Places: the kill switch turns places off without a search", async () => {
    usage._reset();
    process.env.SIDEKICK_PLACES_OFF = "1";
    const before = calls.google;
    const out = await places.search("music");
    assert.strictEqual(calls.google, before);
    assert.strictEqual(out.places.length, 0);
    delete process.env.SIDEKICK_PLACES_OFF;
  });

  await test("Places: opening hours, price and travel are read correctly", async () => {
    const c = places.toCandidate(fakePlace(9, 43.6466, -79.405, ["karaoke"]), "games");
    assert.strictEqual(c.type, "place");
    assert(c.id < 0, "place ids are negative");
    assert.strictEqual(c.price, 30);
    assert(c.vibes.includes("Games & social"));
    assert(c.travel && c.travel.from.union.minutes > 0);
    assert.strictEqual(places.openAt(c.hours, 6, 21), true, "open Saturday 9 PM");
    assert.strictEqual(places.openAt(c.hours, 6, 1), true, "still open at 1 AM after midnight");
    assert.strictEqual(places.openAt(places.toCandidate(fakePlace(8, 43.65, -79.39, ["art_gallery"], { closed: true }), "arts").hours, 6, 21), false);
    assert.match(places.closesLabel(c.hours, 6, 21), /Open until 2 AM/);
  });

  await test("Call: places join the pool, a closed place is left out, and a place pick carries Google attribution", async () => {
    usage._reset();
    process.env.GOOGLE_PLACES_DAILY_MAX = "5";
    const { room: rid } = T.createRoom({ crew: "Test", planner: "Asia", nights: [FRI, SAT], persona: "friend" });
    const room = T.rooms.get(rid);
    room.mode = "lead";
    const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
    const people = [room.people[0], maya];
    for (const p of people) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "budget", "50", "call_card"); T.setAnswer(room, p, "origin", "union", "call_card"); T.setAnswer(room, p, "vibe", ["games"], "call_card"); }
    await T.think(room);
    assert(room.places.length === 4, `expected 4 places loaded, got ${room.places.length}`);
    assert(calls.google >= 1);
    const f = P.facts(room);
    const fit = P.filterEvents(room.places, room, f).map((x) => x.title);
    assert(!fit.includes("Test Spot 4"), "the gallery that's closed in the evening is filtered out");
    // Everyone says "just somewhere good"
    for (const p of people) T.setAnswer(room, p, "kind", "places", "call_card");
    room.lastSaidAt = 0;
    await T.decide(room, { forcePicks: true });
    assert(room.picks && room.picks.length === 2, "two picks");
    assert(room.picks.every((x) => x.kind === "place"), "both picks are places");
    assert(room.picks.every((x) => x.attribution === "Google Maps" && /maps\.google/.test(x.url)), "attribution and a maps link");
    T.endRoom(room, "test");
  });

  await test("Places: searched near the crew's starting points, not always downtown", async () => {
    const down = places.nearCrew([]);
    assert.strictEqual(down.radius, 15000, "no starting points: all of Toronto");
    const east = places.nearCrew(["kennedy"]);
    assert(east.center.longitude > -79.3 && east.radius === 5000, "one person at Kennedy: a 5 km circle around Scarborough");
    const split = places.nearCrew(["kipling", "kennedy"]);
    assert(Math.abs(split.center.longitude - (-79.4)) < 0.05, "Kipling + Kennedy: centred in between");
    assert(split.radius > 5000 && split.radius <= 15000);
    usage._reset();
    await places.search("music", { origins: ["finch", "finch"] });
    assert(calls.lastBody.locationBias.circle.center.latitude > 43.75, "the request itself is biased to Finch");
  });

  await test("Call: unless the crew picks one kind, the two picks are one event and one place", async () => {
    usage._reset();
    const { room: rid } = T.createRoom({ crew: "Test", planner: "Asia", nights: [FRI, SAT], persona: "concierge" });
    const room = T.rooms.get(rid);
    room.mode = "lead";
    const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
    const people = [room.people[0], maya];
    for (const p of people) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "budget", "50", "call_card"); T.setAnswer(room, p, "origin", "union", "call_card"); T.setAnswer(room, p, "vibe", ["games", "music"], "call_card"); T.setAnswer(room, p, "time", ["evening", "late"], "call_card"); T.setAnswer(room, p, "kind", "either", "call_card"); }
    await T.think(room);
    assert(room.places.length > 0, "places loaded");
    room.lastSaidAt = 0;
    await T.decide(room, { forcePicks: true });
    assert(room.picks && room.picks.length === 2, "two picks");
    assert.deepStrictEqual(room.picks.map((x) => x.kind).sort(), ["event", "place"], `got ${room.picks.map((x) => x.kind)}`);
    T.endRoom(room, "test");
  });

  await test("Call: with places off, the plan-type question is never asked", async () => {
    process.env.SIDEKICK_PLACES_OFF = "1";
    const { room: rid } = T.createRoom({ crew: "Test", planner: "Asia", nights: [FRI, SAT], persona: "concierge" });
    const room = T.rooms.get(rid);
    room.mode = "lead";
    const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
    for (const p of [room.people[0], maya]) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "budget", "50", "call_card"); T.setAnswer(room, p, "vibe", ["music"], "call_card"); }
    for (let i = 0; i < 6 && !room.picks; i++) { room.lastSaidAt = 0; await T.think(room); if (room.card) for (const p of [room.people[0], maya]) T.setAnswer(room, p, room.card.slot, P.SLOTS[room.card.slot].multi ? [P.optionsFor(room.card.slot, room)[0][0]] : P.optionsFor(room.card.slot, room)[0][0], "call_card"); }
    assert(!room.asked.includes("kind"), "never asks events vs places");
    assert(room.places.length === 0);
    delete process.env.SIDEKICK_PLACES_OFF;
    T.endRoom(room, "test");
  });

  await test("Voice agent: only the planner can start it, it reserves minutes, and moves become cues", async () => {
    usage._reset();
    const { room: rid, person: planner } = (await call("POST", "/api/sk/rooms", { crew: "Test", name: "Asia", nights: [FRI, SAT], persona: "friend" })).data;
    const { person: maya } = (await call("POST", `/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice" })).data;
    assert.strictEqual((await call("POST", `/api/sk/rooms/${rid}/voice-agent`, { p: maya })).status, 403);
    const start = await call("POST", `/api/sk/rooms/${rid}/voice-agent`, { p: planner });
    assert.strictEqual(start.status, 200, JSON.stringify(start.data));
    assert.match(start.data.signedUrl, /^wss:/);
    assert.strictEqual(start.data.dynamicVariables.room_id, rid);
    assert(!JSON.stringify(start.data.dynamicVariables).match(/budget|\$/i), "no private answers in the agent's variables");
    assert.strictEqual((await usage.status()).elevenlabs_minutes.used.month, 10);
    const room = T.rooms.get(rid);
    room.lastSaidAt = 0;
    await T.think(room);
    const cue = room.cues[room.cues.length - 1];
    assert(cue && cue.text.startsWith("[app]"), "a cue was queued for the agent");
    assert(!room.said.some((x) => x.move !== "form" && !x.system && x.move !== "agent"), "Sidekick didn't speak with the built-in voice");
    // The agent's actual words come back as Sidekick's line
    await call("POST", `/api/sk/rooms/${rid}/agent-said`, { p: planner, text: "Hey y'all! Friday or Saturday?" });
    assert.strictEqual(room.said[room.said.length - 1].text, "Hey y'all! Friday or Saturday?");
    // Ending after 3 minutes gives back the other 7
    await call("POST", `/api/sk/rooms/${rid}/voice-agent/end`, { p: planner, seconds: 150 });
    assert.strictEqual((await usage.status()).elevenlabs_minutes.used.month, 3);
    assert.strictEqual(room.agentMode, false);
    T.endRoom(room, "test");
  });

  await test("Voice agent: sessions stop being handed out at the minute cap", async () => {
    usage._reset();
    const { room: rid, person: planner } = (await call("POST", "/api/sk/rooms", { crew: "Test", name: "Asia", nights: [FRI, SAT], persona: "concierge" })).data;
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await call("POST", `/api/sk/rooms/${rid}/voice-agent`, { p: planner })).status);
    }
    // Cap: 80% of 30 = 24 minutes a month, 20 a day; each session reserves 10, so only 2 fit
    assert.deepStrictEqual(statuses, [200, 200, 429, 429]);
    T.endRoom(T.rooms.get(rid), "test");
  });

  await test("Agent tools: need the secret, and never return private answers", async () => {
    const { room: rid, person: planner } = (await call("POST", "/api/sk/rooms", { crew: "Test", name: "Asia", nights: [FRI, SAT], persona: "friend" })).data;
    const { person: jay } = (await call("POST", `/api/sk/rooms/${rid}/join`, { name: "Jay", mode: "text", answers: { budget: "20", nos: ["West End"] } })).data;
    assert.strictEqual((await call("POST", "/api/sk/agent/get_plan_state", { room_id: rid })).status, 401);
    assert.strictEqual((await call("POST", "/api/sk/agent/get_plan_state", { room_id: rid }, { "x-sidekick-secret": "nope" })).status, 401);
    const ok = await call("POST", "/api/sk/agent/get_plan_state", { room_id: rid }, { "x-sidekick-secret": "s3cret" });
    assert.strictEqual(ok.status, 200);
    const text = JSON.stringify(ok.data);
    assert(!/West End/.test(text), "dealbreakers never returned");
    assert(!/\$?20\b/.test(text.replace(/2026|20\d\d/g, "")), "Jay's budget number never returned");
    const rec = await call("POST", "/api/sk/agent/record_facts", { room_id: rid, updates: [{ person: "Jay", slot: "night", values: [SAT], confidence: 0.9 }] }, { "x-sidekick-secret": "s3cret" });
    assert.strictEqual(rec.status, 200);
    assert(P.facts(T.rooms.get(rid)).night.supporters[SAT].includes("Jay"));
    T.endRoom(T.rooms.get(rid), "test");
    void planner; void jay;
  });

  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
