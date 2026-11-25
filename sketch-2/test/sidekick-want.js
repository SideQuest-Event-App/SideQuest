// What people actually ask for ("Chinese skewers", "karaoke with private rooms") reaches the place search, and the
// picks are filtered and re-ranked against it. With Google, Foursquare and the AI faked: nothing real is called.
//
//  1. The "Chinese skewers" regression: a call where someone says it, with places faked, never picks a cocktail bar
//     (before the fix the words never reached Google, which got "cocktail bar in Toronto", and Bar Maya won)
//  2. `want` is captured from speech and from typed lines (keyword reader), and from the AI's understanding
//  3. it's shown on the board ("Looking for: Chinese skewers"), private-safe, and given to the voice agent's tools
//  4. pick relevance: places that don't match a specific want are filtered out and matches rank first
//  5. the Places request: the user's words, a Toronto location bias near the crew, the right includedType
//  6. Discover: a free-text search hits places too, within the usage caps
//
//   node test/sidekick-want.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-want-"));
Object.assign(process.env, {
  SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"),
  ANTHROPIC_API_KEY: "",
  GOOGLE_MAPS_API_KEY: "test-key",
  GOOGLE_PLACES_DAILY_MAX: "100",
  SIDEKICK_TOOL_SECRET: "s3cret",
});
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SIDEKICK_PLACES_OFF", "FOURSQUARE_API_KEY"]) delete process.env[k];

const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "sketch-1", "seed", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));

// ---------- fake Google ----------
const hours = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 11 }, close: { day: (d + 1) % 7, hour: 2 } })) };
const gp = (id, name, types, extra = {}) => ({
  id, displayName: { text: name }, formattedAddress: `${id} Spadina Ave, Toronto`, location: { latitude: 43.6535, longitude: -79.3985 },
  types, primaryType: types[0], priceLevel: "PRICE_LEVEL_INEXPENSIVE", rating: extra.rating || 4.4, userRatingCount: 500,
  googleMapsUri: `https://maps.google.com/?cid=${id}`, regularOpeningHours: hours, ...extra,
});
const BARS = [gp("bar_maya", "Bar Maya", ["cocktail_bar", "bar"], { rating: 4.8 }), gp("bar_raval", "Bar Raval", ["bar", "tapas_restaurant"], { rating: 4.7 }), gp("civil", "Civil Liberties", ["bar"], { rating: 4.7 })];
const SKEWERS = [
  gp("chuan", "Chuan Skewers House", ["chinese_restaurant", "restaurant", "food"], { rating: 4.3 }),
  gp("xinjiang", "Silk Road Kitchen", ["chinese_restaurant", "restaurant", "food"], { rating: 4.2, editorialSummary: { text: "Xinjiang-style lamb skewers grilled over charcoal." } }),
  gp("dragon", "Golden Dragon", ["chinese_restaurant", "restaurant"], { rating: 4.6 }),
  gp("maya2", "Bar Maya", ["cocktail_bar", "bar"], { rating: 4.8 }), // Google's text search can still slip a bar in
];
const google = [];
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith("https://places.googleapis.com/")) {
    const body = JSON.parse(opts.body);
    google.push({ url, body, fields: opts.headers["x-goog-fieldmask"] });
    const q = String(body.textQuery || "").toLowerCase();
    return { ok: true, json: async () => ({ places: /skewer|chuan/.test(q) ? SKEWERS : BARS }) };
  }
  throw new Error(`Unexpected fetch in test: ${url}`);
};

const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
const places = require(path.join(ROOT, "lib", "sidekick", "places"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
R.init({ events: () => events });
const T = R._test;

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack.split("\n").slice(0, 3).join("\n      ")}`); }
}

const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date());
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const SAT = days.find((d) => new Date(d + "T12:00:00").getDay() === 6);

// A call with two people who've settled the night, budget and start; then someone says what they want
function callRoom() {
  const { room: rid } = T.createRoom({ crew: "Test", planner: "Asia", nights: [SAT], persona: "friend" });
  const room = T.rooms.get(rid);
  room.mode = "lead";
  const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
  const people = [room.people[0], maya];
  for (const p of people) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "budget", "50", "call_card"); T.setAnswer(room, p, "origin", "union", "call_card"); T.setAnswer(room, p, "time", ["late"], "call_card"); }
  // Sidekick has just asked "What kind of night?"
  room.card = { slot: "vibe", at: Date.now() };
  room.asked.push("vibe");
  return { room, people, maya };
}
const say = async (room, person, text, kind = "spoken") => {
  room.pending.push({ pid: person.id, name: person.name, text, kind, at: Date.now() });
  room.lines.push({ pid: person.id, name: person.name, text, kind, at: Date.now() });
  await T.think(room);
};

(async () => {
  await test("1. Regression: \"Chinese skewers\" in a call never picks a cocktail bar", async () => {
    usage._reset();
    google.length = 0;
    const { room, people, maya } = callRoom();
    await say(room, maya, "I'm craving Chinese skewers tonight");
    for (const p of people) T.setAnswer(room, p, "kind", "places", "call_card");
    room.lastSaidAt = 0;
    await T.decide(room, { forcePicks: true });
    assert(room.picks && room.picks.length, "picks were made");
    const titles = room.picks.map((x) => x.title);
    assert(!titles.some((t) => /^Bar |Civil Liberties/.test(t)), `a skewer request picked a bar: ${titles.join(", ")}`);
    assert(/Chuan Skewers House|Silk Road Kitchen/.test(titles[0]), `the first pick shows skewers: ${titles.join(", ")}`);
    assert(google.some((g) => /chinese skewers/i.test(g.body.textQuery || "")), `Google was asked for the words said: ${google.map((g) => g.body.textQuery).join(" | ")}`);
    T.endRoom(room, "test");
  });

  await test("2a. want is captured from speech (keyword reader): cuisine + dish, a venue with a feature, a transliteration", async () => {
    const { room, maya } = callRoom();
    const asia = room.people[0];
    const out = T.extractKeywords(room, [
      { pid: maya.id, name: "Maya", text: "honestly I'd love Chinese skewers", kind: "spoken" },
      { pid: asia.id, name: "Asia", text: "or karaoke with private rooms after", kind: "spoken" },
    ]);
    const w = out.updates.filter((u) => u.slot === "want");
    assert.deepStrictEqual(w.map((u) => [u.person, u.values]), [["Maya", ["Chinese skewers"]], ["Asia", ["Karaoke with private rooms"]]]);
    const out2 = T.extractKeywords(room, [{ pid: maya.id, name: "Maya", text: "let's get chuan'r, somewhere with a rooftop patio", kind: "spoken" }]);
    assert.deepStrictEqual(out2.updates.find((u) => u.slot === "want").values, ["Chuan'r", "Rooftop patio"]);
    const none = T.extractKeywords(room, [{ pid: maya.id, name: "Maya", text: "Saturday works, after 8, live music", kind: "spoken" }]);
    assert(!none.updates.some((u) => u.slot === "want"), "a plain vibe answer has no want");
    T.endRoom(room, "test");
  });

  await test("2b. want is captured from a typed line, and it lands on the board", async () => {
    usage._reset();
    const { room, maya } = callRoom();
    await say(room, maya, "can we do korean bbq?", "typed");
    const f = P.facts(room);
    assert(f.want.known && f.want.value[0] === "Korean BBQ", JSON.stringify(f.want));
    assert.strictEqual(room.answers[maya.id].want.source, "call_text");
    T.endRoom(room, "test");
  });

  await test("2c. want is captured from the AI's understanding (free text slot in the facts tool)", async () => {
    const claude = require(path.join(ROOT, "lib", "sidekick", "claude"));
    const real = { available: claude.available, tool: claude.tool };
    let seen = null;
    claude.available = () => true;
    claude.tool = async (system, user, def) => {
      seen = { user, def };
      return { updates: [{ person: "Maya", slot: "want", values: ["chuan'r under $15 near Scarborough"], confidence: 0.9 }], addressed_sidekick: false, question: "" };
    };
    try {
      usage._reset();
      const { room, maya } = callRoom();
      await say(room, maya, "ooh chuan'r, that lamb stuff");
      assert(seen.def.input_schema.properties.updates.items.properties.slot.enum.includes("want"), "the tool can record want");
      assert(/want: free text/.test(seen.user), "the prompt explains the free-text slot");
      const v = P.facts(room).want.value;
      assert.deepStrictEqual(v, ["chuan'r"], `cleaned: no amount, no area: ${JSON.stringify(v)}`);
      T.endRoom(room, "test");
    } finally { Object.assign(claude, real); }
  });

  await test("3. The board says \"Looking for: Chinese skewers\", private-safe, and the agent's tools carry it", async () => {
    usage._reset();
    const { room, maya } = callRoom();
    await say(room, maya, "Chinese skewers under $20, not downtown");
    const view = T.viewFor(room, maya.id);
    const row = view.rows.find((r) => r.slot === "want");
    assert(row && row.label === "Looking for" && row.value === "Chinese skewers", JSON.stringify(row));
    assert(!/\$|20|downtown/i.test(JSON.stringify(view.rows.find((r) => r.slot === "want"))), "no amount or avoided area on the want row");
    const st = T.planState(room);
    assert.deepStrictEqual(st.looking_for, ["Chinese skewers"]);
    assert(st.board.some((b) => b.fact === "Looking for" && b.value === "Chinese skewers"));
    // The agent records a want through record_facts: as slot "want", or as a vibe that isn't one of the options
    const asia = room.people[0];
    const r1 = await T.runTool(room, "record_facts", { updates: [{ person: "Asia", slot: "want", values: ["karaoke with private rooms"] }] });
    assert.strictEqual(r1.status, 200);
    const r2 = await T.runTool(room, "record_facts", { updates: [{ person: "Asia", slot: "vibe", values: ["Live music", "hot pot"] }] });
    assert(r2.body.recorded >= 2, JSON.stringify(r2.body.skipped));
    assert.deepStrictEqual(room.answers[asia.id].want.value, ["Hot pot", "karaoke with private rooms"]);
    assert.deepStrictEqual(room.answers[asia.id].vibe.value, ["music"]);
    const after = (await T.runTool(room, "get_plan_state", {})).body;
    assert(after.looking_for.includes("Chinese skewers") && after.looking_for.includes("Hot pot"), JSON.stringify(after.looking_for));
    T.endRoom(room, "test");
  });

  await test("4. Pick relevance: with a want, places that don't show it are filtered out; matches rank first", async () => {
    const want = require(path.join(ROOT, "lib", "search", "want"));
    const room = callRoom().room;
    T.setAnswer(room, room.people[0], "want", ["Chinese skewers"], "call_card");
    const f = P.facts(room);
    const cands = [...BARS, ...SKEWERS].map((p) => places.toCandidate(p, "Food & drink"));
    const kept = P.filterEvents(cands, room, f).map((x) => x.title);
    assert(!kept.includes("Bar Maya") && !kept.includes("Bar Raval") && !kept.includes("Civil Liberties"), `bars out: ${kept}`);
    assert(kept.includes("Chuan Skewers House") && kept.includes("Silk Road Kitchen"), `skewer places in: ${kept}`);
    // A Chinese restaurant that shows no skewers still counts (its cuisine type matches), ranked below the dish
    assert(kept.includes("Golden Dragon"), "a matching cuisine type counts as relevant for a food want");
    assert(want.relevance(places.toCandidate(SKEWERS[2], "Food & drink"), ["Chinese skewers"]) < want.relevance(places.toCandidate(SKEWERS[1], "Food & drink"), ["Chinese skewers"]), "cuisine-only ranks below a summary hit");
    const tagged = places.toCandidate(SKEWERS[2], "Food & drink");
    tagged.wantQuery = want.plan(["Chinese skewers"]).query;
    assert(P.filterEvents([tagged], room, f).length === 1, "...and in when the skewer search itself returned it");
    const order = P.ranked(cands.concat([tagged]), room, f).filter((x) => x.type === "place").map((x) => x.title);
    assert.strictEqual(order[0], "Chuan Skewers House", order.join(", "));
    assert(order.indexOf("Golden Dragon") > order.indexOf("Silk Road Kitchen"), "shows-the-dish ranks above clears-the-bar");
    // No want: nothing is filtered by it
    const room2 = callRoom().room;
    assert(P.filterEvents(cands, room2, P.facts(room2)).some((x) => x.title === "Bar Maya"));
    // Relevance on its own
    assert.strictEqual(want.relevance({ title: "Bar Maya", types: ["bar"] }, ["Chinese skewers"]), 0);
    assert(want.relevance({ title: "Noraebang", types: ["karaoke"] }, ["karaoke with private rooms"]) >= 0.5);
    assert(want.relevance({ title: "The Rooftop", types: ["bar"], summary: "A rooftop patio with skyline views" }, ["rooftop patio"]) >= 0.5);
    assert(want.relevance({ name: "Xi'an Famous", categories: [{ name: "Chinese Restaurant" }, { name: "Kebab Restaurant" }] }, ["Chinese skewers"]) >= 0.9, "Foursquare categories count");
    T.endRoom(room, "test"); T.endRoom(room2, "test");
  });

  await test("5. The Places request: their words, the right includedType, biased near the crew, the summary field", async () => {
    usage._reset();
    google.length = 0;
    const out = await places.searchWant(["Chinese skewers"], { origins: ["finch"] });
    assert(out.places.length >= 3);
    const g = google[0];
    assert.strictEqual(g.body.textQuery, "Chinese skewers restaurant in Toronto, ON");
    assert.strictEqual(g.body.includedType, "chinese_restaurant");
    assert(g.body.locationBias.circle.center.latitude > 43.75, "biased to Finch");
    assert(/places\.editorialSummary/.test(g.fields), "asks for the editorial summary");
    const st = await usage.status();
    assert.strictEqual(st.places_search_atmosphere.used.month, 1, "counted on its own meter");
    // Google rejects a type: retried once without it
    const real = global.fetch;
    let n = 0;
    global.fetch = async (url, opts) => { n++; const b = JSON.parse(opts.body); if (b.includedType) return { ok: false, status: 400, text: async () => "bad type" }; return real(url, opts); };
    const again = await places.searchWant(["ramen"], {});
    global.fetch = real;
    assert.strictEqual(n, 2, "one retry");
    assert(again.places.length > 0);
    // A karaoke want: the venue type
    assert.strictEqual(require(path.join(ROOT, "lib", "search", "want")).plan(["karaoke with private rooms"]).includedType, "karaoke");
  });

  await test("5b. Usage caps: a want search stops at its meter's daily limit", async () => {
    usage._reset();
    process.env.GOOGLE_PLACES_ATMOS_DAILY_MAX = "2";
    const before = google.length;
    const res = [];
    for (let i = 0; i < 4; i++) res.push(await places.searchWant(["Chinese skewers"], {}));
    assert.strictEqual(google.length - before, 2);
    assert.strictEqual(res[3].capped, "daily limit");
    delete process.env.GOOGLE_PLACES_ATMOS_DAILY_MAX;
  });

  await test("6. Discover: a free-text search hits places too (only matching ones), once per query, within the caps", async () => {
    usage._reset();
    const launch = require(path.join(ROOT, "lib", "launch"));
    launch._queries.clear();
    const before = google.length;
    const out = await launch.nearby({ query: "chinese skewers", lat: 43.6532, lng: -79.3832 });
    assert.deepStrictEqual(out.want, ["Chinese skewers"]);
    const titles = out.places.map((p) => p.title);
    assert(titles.length >= 2 && !titles.includes("Bar Maya"), titles.join(", "));
    assert.strictEqual(titles[0], "Chuan Skewers House");
    assert(out.places.every((p) => p.kind === "place" && p.attribution && Number.isFinite(p.lat)));
    const g = google[google.length - 1];
    assert(!/editorialSummary|rating|priceLevel|regularOpeningHours/.test(g.fields), "Discover asks only for Pro fields");
    await launch.nearby({ query: "chinese skewers", lat: 43.6532, lng: -79.3832 });
    assert.strictEqual(google.length - before, 1, "the same query isn't searched twice");
    const vague = await launch.nearby({ query: "something fun this weekend", lat: 43.65, lng: -79.38 });
    assert.strictEqual(vague.places.length, 0);
    assert.strictEqual(google.length - before, 1, "nothing specific: no search");
    process.env.SIDEKICK_PLACES_OFF = "1";
    launch._queries.clear();
    const off = await launch.nearby({ query: "ramen", lat: 43.65, lng: -79.38 });
    assert.strictEqual(off.places.length, 0);
    delete process.env.SIDEKICK_PLACES_OFF;
  });

  if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
  console.log("\nAll want tests passed");
})();
