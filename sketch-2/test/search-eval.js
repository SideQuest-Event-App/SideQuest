// Search eval: 15 typed searches ("Chinese skewers", "hot pot", "karaoke private rooms", "rooftop patio", "jazz"...)
// through the real search code: places from lib/launch.js forQuery (Google and Foursquare stubbed, no network) and
// events from lib/search/mixed.js searchEvents (keyword matching, no AI), merged into one list by one score.
// Each search must return 3 or more relevant results, All must show both kinds where both exist, the filter must
// split them, and a search with no exact place match must say what it found instead (never a blank list). The usage
// caps still apply, and a capped search says the daily limit was reached.
//
//   node test/search-eval.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-search-eval-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", AI: "off", GOOGLE_MAPS_API_KEY: "test-key", FOURSQUARE_API_KEY: "test-key", GOOGLE_PLACES_DAILY_MAX: "500" });
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SIDEKICK_PLACES_OFF", "FOURSQUARE_OFF"]) delete process.env[k];
process.env.SUPABASE_URL = process.env.SUPABASE_SECRET_KEY = ""; // blank, not missing: a missing key is filled in from .env (the real database)

const ROOT = path.join(__dirname, "..");

// ---------- Stubbed Google (Places API New) and Foursquare ----------
let n = 0;
const g = (name, types, extra = {}) => ({ id: `g${n++}`, displayName: { text: name }, formattedAddress: "1 Spadina Ave, Toronto", location: { latitude: 43.65 + (n % 7) * 0.002, longitude: -79.398 + (n % 5) * 0.002 }, types, primaryType: types[0], googleMapsUri: `https://maps.google.com/?cid=${n}`, ...extra });
const f = (name, cats) => ({ fsq_place_id: `f${n++}`, name, latitude: 43.66 + (n % 7) * 0.002, longitude: -79.39 + (n % 5) * 0.002, categories: cats.map((c) => ({ name: c })), location: { formatted_address: "2 Dundas St W, Toronto" } });
const BAR = g("Bar Maya", ["cocktail_bar", "bar"]); // Google's text search can slip a bar into anything
// What Google and Foursquare return for each search's words (matched on the request's text)
const STUBS = [
  [/skewer/, [g("Chuan Skewers House", ["chinese_restaurant", "restaurant"]), g("Golden Dragon", ["chinese_restaurant", "restaurant"]), g("Szechuan Garden", ["chinese_restaurant", "restaurant"]), BAR], [f("Xi'an Famous", ["Chinese Restaurant", "Kebab Restaurant"])]],
  [/hot pot/, [g("Liuyishou Hot Pot", ["chinese_restaurant", "restaurant"]), g("Happy Lamb Hot Pot", ["chinese_restaurant", "restaurant"]), g("Golden Dragon", ["chinese_restaurant", "restaurant"])], [f("Haidilao Hot Pot", ["Hotpot Restaurant", "Chinese Restaurant"])]],
  [/karaoke/, [g("Echo Karaoke", ["karaoke"]), g("Big Sing KTV", ["karaoke", "bar"]), g("Noraebang Bloor", ["karaoke"])], [f("Rock Star Karaoke", ["Karaoke Bar"])]],
  [/rooftop/, [g("The Thompson Rooftop", ["bar"]), g("Kost Rooftop Patio", ["restaurant", "bar"]), g("Lavelle", ["bar"], { editorialSummary: { text: "A rooftop patio with a pool" } })], [f("Rooftop Bar at the Broadview", ["Rooftop Bar"])]],
  [/jazz/, [g("The Rex Jazz & Blues Bar", ["bar", "live_music_venue"]), g("Jazz Bistro", ["restaurant", "live_music_venue"]), g("Poetry Jazz Cafe", ["bar"])], []],
  [/ramen/, [g("Kinton Ramen", ["ramen_restaurant", "japanese_restaurant", "restaurant"]), g("Sansotei Ramen", ["ramen_restaurant", "restaurant"]), g("Ryus Noodle Bar", ["ramen_restaurant", "restaurant"])], []],
  [/comedy/, [g("Comedy Bar", ["comedy_club", "bar"]), g("Second City", ["comedy_club"]), g("Absolute Comedy", ["comedy_club"])], []],
  [/board game/, [g("Snakes & Lattes Board Game Cafe", ["cafe"]), g("Bampot Board Game Cafe", ["cafe"]), g("Cafe Princess", ["cafe"], { editorialSummary: { text: "Board games and bubble tea" } })], []],
  [/dumpling/, [g("Mother's Dumplings", ["chinese_restaurant", "restaurant"]), g("Dumpling House", ["chinese_restaurant", "restaurant"]), g("Juicy Dumpling", ["chinese_restaurant", "restaurant"])], []],
  [/korean bbq/, [g("Korean Grill House", ["korean_restaurant", "restaurant"]), g("Gyubee", ["korean_restaurant", "restaurant"]), g("Hanwoori", ["korean_restaurant", "restaurant"])], []],
  [/live music/, [g("Horseshoe Tavern", ["bar", "live_music_venue"]), g("The Cameron House", ["bar", "live_music_venue"]), g("Lee's Palace", ["live_music_venue"])], []],
  [/tacos/, [g("Seven Lives Tacos", ["mexican_restaurant", "restaurant"]), g("La Chilaca Taqueria", ["mexican_restaurant", "restaurant"]), g("Grand Electric", ["mexican_restaurant", "bar"])], []],
  [/bowling/, [g("Bowlerama West", ["bowling_alley"]), g("The Ballroom Bowl", ["bowling_alley", "bar"]), g("Bowl Lane", ["bowling_alley"])], []],
  [/wine bar/, [g("Paris Paris", ["wine_bar", "bar"]), g("Grey Gardens", ["wine_bar", "restaurant"]), g("Midfield Wine Bar", ["wine_bar", "bar"])], []],
  [/dim sum/, [g("Rol San", ["chinese_restaurant", "restaurant"]), g("Crown Princess", ["chinese_restaurant", "restaurant"]), g("Dim Sum King", ["chinese_restaurant", "restaurant"])], []],
];
const calls = { google: 0, fsq: 0 };
// Each stubbed place's types or categories, by name, to judge relevance (the app's cards don't carry them)
const KIND_OF = new Map(STUBS.flatMap(([, gs, fs]) => [...gs.map((p) => [p.displayName.text, `${p.types.join(" ")} ${(p.editorialSummary || {}).text || ""}`]), ...fs.map((p) => [p.name, p.categories.map((c) => c.name).join(" ")])]));
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith("https://places.googleapis.com/")) {
    calls.google++;
    const q = String(JSON.parse(opts.body).textQuery || "").toLowerCase();
    const hit = STUBS.find(([re]) => re.test(q));
    return { ok: true, json: async () => ({ places: hit ? hit[1] : [BAR] }) };
  }
  if (url.startsWith("https://places-api.foursquare.com/")) {
    calls.fsq++;
    const q = new URL(url).searchParams.get("query").toLowerCase();
    const hit = STUBS.find(([re]) => re.test(q));
    return { ok: true, json: async () => ({ results: hit ? hit[2] : [] }) };
  }
  throw new Error(`Unexpected fetch in test: ${url}`);
};

const launch = require(path.join(ROOT, "lib", "launch"));
const mixed = require(path.join(ROOT, "lib", "search", "mixed"));
const want = require(path.join(ROOT, "lib", "search", "want"));
const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));

// ---------- Fixture events (Saturday, 8 PM) ----------
const SAT = new Date(Date.now() + 4 * 86400000).toISOString();
let id = 1;
const ev = (title, vibes, description = "", tags = []) => ({ id: id++, title, vibes, description, tags, scene: "", startsAt: SAT, price: 20, venue: { name: "A venue" }, organizer: { name: "A host" }, friends: [], rating: 4.2, going: 5 });
const EVENTS = [
  ev("Night Market: skewers, bao and noodles", ["Markets", "Food & drink"], "Street food stalls with lamb skewers and hand-pulled noodles."),
  ev("Yakitori pop-up", ["Food & drink"], "Charcoal-grilled chicken skewers, one night only."),
  ev("Karaoke Night at the Owl", ["Games & social"], "Sing your heart out. Private rooms available."),
  ev("Rooftop Sunset Social", ["Games & social"], "Drinks on a rooftop patio with a DJ."),
  ev("Late Jazz Trio", ["Jazz", "Live music"], "Standards and originals."),
  ev("Jazz Jam Session", ["Jazz", "Live music"], "Bring your horn."),
  ev("Big Band Swing Night", ["Jazz", "Dance"], "A twelve-piece jazz band and a dance floor."),
  ev("Stand-up Saturday", ["Comedy"], "Five comics, one mic."),
  ev("Improv Comedy Jam", ["Comedy"], "Made up on the spot."),
  ev("Board Games Social", ["Games & social"], "Hundreds of board games and new friends."),
  ev("Indie Rock Showcase", ["Live music", "Indie gigs"], "Three bands, one stage."),
  ev("Open Mic Live Music", ["Live music"], "Sign up at the door."),
  ev("Taco Tuesday Takeover", ["Food & drink"], "Birria tacos and mezcal."),
  ev("Cosmic Bowling Night", ["Games & social"], "Glow-in-the-dark bowling with a DJ."),
  ev("Natural Wine Tasting", ["Food & drink"], "Six natural wines at a wine bar."),
  ev("Pottery Class", ["Art & making"], "Wheel throwing for beginners."),
  ev("Trail Run", ["Run & ride", "Outdoors"], "5 km along the Don."),
];

// Relevant: places by their type or name; events by their words or tags
const RULES = {
  "Chinese skewers": { place: /skewer|chinese_restaurant|kebab/i, event: /skewer|yakitori/i },
  "hot pot": { place: /hot ?pot|chinese_restaurant/i, event: /hot ?pot/i },
  "karaoke private rooms": { place: /karaoke|ktv|noraebang/i, event: /karaoke/i },
  "rooftop patio": { place: /rooftop/i, event: /rooftop/i },
  jazz: { place: /jazz/i, event: /jazz/i },
  ramen: { place: /ramen/i, event: /ramen/i },
  comedy: { place: /comedy/i, event: /comedy|stand-up|improv/i },
  "board games": { place: /board game/i, event: /board game/i },
  dumplings: { place: /dumpling/i, event: /dumpling/i },
  "korean bbq": { place: /korean/i, event: /korean/i },
  "live music": { place: /live_music|music/i, event: /live music|band|gig|rock/i },
  tacos: { place: /taco|taqueria|mexican/i, event: /taco/i },
  bowling: { place: /bowl/i, event: /bowl/i },
  "wine bar": { place: /wine/i, event: /wine/i },
  "dim sum": { place: /dim sum|chinese_restaurant/i, event: /dim sum/i },
};
const QUERIES = Object.keys(RULES);

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}
const weights = { vibes: { "Food & drink": 3, Jazz: 2 }, organizers: {}, venues: {}, artists: {} };

async function searchAll(q) {
  const pl = await launch.forQuery({ query: q, lat: 43.65, lng: -79.39 });
  const places = pl.places.map((p) => ({ ...p, score: mixed.score(p, { relevance: p.relevance, weights }) }));
  const { result } = await mixed.searchEvents(EVENTS, q, { now: Date.now() });
  const byId = new Map(EVENTS.map((e) => [e.id, e]));
  const events = ((result && result.matches) || []).map((m) => ({ ...m, event: byId.get(m.id), score: mixed.score(byId.get(m.id), { relevance: m.match / 100, weights }) }));
  return { list: mixed.merge(events, places), pl };
}

(async () => {
  const summary = [];
  for (const q of QUERIES) {
    await test(`"${q}": 3+ relevant results, events and places in one list`, async () => {
      usage._reset();
      const { list, pl } = await searchAll(q);
      const rule = RULES[q];
      const relevant = (x) => (x.kind === "place" ? rule.place.test(`${x.p.title} ${KIND_OF.get(x.p.title) || ""}`) : rule.event.test(`${x.m.event.title} ${x.m.event.description} ${x.m.event.vibes.join(" ")}`));
      const good = list.filter(relevant);
      const bad = list.filter((x) => !relevant(x));
      assert(good.length >= 3, `only ${good.length} relevant: ${list.map((x) => x.kind === "place" ? x.p.title : x.m.event.title).join(", ")}`);
      assert(!list.some((x) => x.kind === "place" && x.p.title === "Bar Maya"), "the cocktail bar Google slipped in is never shown");
      // All shows both kinds where both exist; the filter splits them
      const hasEv = list.some((x) => x.kind === "event"), hasPl = list.some((x) => x.kind === "place");
      if (EVENTS.some((e) => rule.event.test(`${e.title} ${e.description}`))) assert(hasEv && hasPl, `All has both kinds (events ${hasEv}, places ${hasPl})`);
      assert(mixed.only(list, "events").every((x) => x.kind === "event") && mixed.only(list, "places").every((x) => x.kind === "place"));
      assert.strictEqual(mixed.only(list, "all").length, list.length);
      // Ranked by one score, best first
      for (let i = 1; i < list.length; i++) assert(list[i - 1].score >= list[i].score, "sorted by score");
      summary.push(`${q}: ${good.length} relevant (${list.filter((x) => x.kind === "event").length} events, ${list.filter((x) => x.kind === "place").length} places)${bad.length ? `, ${bad.length} other` : ""}${pl.note ? ` · note: ${pl.note}` : ""}`);
    });
  }

  await test("A cuisine-type match counts for a food want, ranked below a name or summary hit", async () => {
    usage._reset();
    const out = await launch.forQuery({ query: "Chinese skewers", lat: 43.66, lng: -79.4 });
    const titles = out.places.map((p) => p.title);
    assert(titles.includes("Golden Dragon"), `a Chinese restaurant without "skewer" in its name is shown: ${titles}`);
    assert(titles.indexOf("Chuan Skewers House") < titles.indexOf("Golden Dragon"), "the name hit ranks first");
  });

  await test("No exact match: the nearest relevant places with a line saying so, never a blank list", async () => {
    usage._reset();
    launch._queries.clear();
    const saved = STUBS[0][1], savedF = STUBS[0][2];
    STUBS[0][1] = [g("Golden Dragon", ["chinese_restaurant", "restaurant"]), g("Szechuan Garden", ["chinese_restaurant", "restaurant"]), BAR];
    STUBS[0][2] = [];
    const out = await launch.forQuery({ query: "Chinese skewers", lat: 43.67, lng: -79.4 });
    STUBS[0][1] = saved; STUBS[0][2] = savedF;
    assert(out.places.length >= 2, `near matches shown: ${out.places.map((p) => p.title)}`);
    assert.strictEqual(out.note, "No skewer spots found. Here are Chinese restaurants nearby.");
    assert.strictEqual(want.askedLabel(want.plan(["hot pot"])), "hot pot spots");
  });

  await test("Capped: places say the daily limit was reached; the meters still stop searching", async () => {
    usage._reset();
    launch._queries.clear();
    process.env.GOOGLE_PLACES_DAILY_MAX = "0";
    delete process.env.FOURSQUARE_API_KEY;
    const before = calls.google;
    const out = await launch.forQuery({ query: "hot pot", lat: 43.68, lng: -79.4 });
    process.env.GOOGLE_PLACES_DAILY_MAX = "500";
    process.env.FOURSQUARE_API_KEY = "test-key";
    assert.strictEqual(calls.google, before, "no Google request over the cap");
    assert.strictEqual(out.reason, "capped");
    assert(/limit was reached/i.test(out.note || ""), `note: ${out.note}`);
  });

  console.log(`\n${summary.join("\n")}`);
  console.log(failures ? `\n${failures} failed` : "\nAll search tests passed");
  process.exit(failures ? 1 : 0);
})();
