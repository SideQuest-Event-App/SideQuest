// Picks eval: about 20 fixed planning situations, built from fixture events and places (no network, no AI), run
// through the real engine (lib/sidekick/plan.js ranking and rooms.js pickTwo). Each lists the kinds of listing its
// picks may be; anything else is an off-vibe pick. Pass means zero off-vibe picks across every scenario, every pick
// has a "why" line, and a pick that fits nobody is only ever shown labelled "Closest we found".
//
// The fixtures are built to tempt the old engine: highly rated speakeasies and pubs next to every vibe, and the
// off-vibe events rated higher than the on-vibe ones.
//
//   node test/picks-eval.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-picks-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", AI: "off" });
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "GOOGLE_MAPS_API_KEY", "FOURSQUARE_API_KEY", "ELEVENLABS_API_KEY"]) delete process.env[k];
global.fetch = async (url) => { throw new Error(`Unexpected fetch in test: ${url}`); };

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
const places = require(path.join(ROOT, "lib", "sidekick", "places"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
const T = R._test;

// ---------- Fixtures: next Saturday, 8 PM Toronto ----------
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
let SAT = null;
for (let i = 2; i < 12 && !SAT; i++) {
  const d = dayFmt.format(new Date(Date.now() + i * 86400000));
  if (new Date(d + "T12:00:00").getDay() === 6) SAT = d;
}
const at = (hour) => new Date(`${SAT}T${String(hour).padStart(2, "0")}:00:00-05:00`).toISOString();
const trip = (m) => ({ from: { union: { minutes: m }, finch: { minutes: m + 15 }, kennedy: { minutes: m + 18 }, kipling: { minutes: m + 20 } } });
let nextId = 9000;
const ev = (cat, title, vibes, extra = {}) => ({ id: nextId++, cat, title, startsAt: at(20), date: SAT, vibes, tags: extra.tags || [], description: extra.description || "", area: "Downtown", neighbourhood: "Queen West", price: 15, rating: extra.rating || 4.2, going: 10, venue: { name: `${title} venue` }, organizer: { name: `${title} host` }, travel: trip(extra.minutes || 15), sourceUrl: "https://example.test/e" });
const EVENTS = [
  ev("gig", "Indie Rock Showcase", ["Live music", "Indie gigs"]),
  ev("jazz", "Late Jazz Trio", ["Jazz", "Live music"]),
  ev("comedy", "Stand-up Saturday", ["Comedy"]),
  ev("trivia", "Pub Trivia Night", ["Games & social"], { tags: ["trivia"] }),
  ev("boardgames", "Board Games Social", ["Games & social"]),
  ev("karaoke_ev", "Karaoke Night", ["Games & social"]),
  ev("dance", "Disco Dance Party", ["Dance", "Electronic"]),
  ev("gallery_ev", "Gallery Opening", ["Art & making"]),
  ev("film", "Midnight Film Screening", ["Film nights"]),
  ev("outdoor_ev", "Lantern Walk in the Park", ["Outdoors"]),
  // Off-vibe temptations, rated higher than everything above
  ev("cocktail_ev", "Cocktail Masterclass", [], { rating: 5, tags: ["cocktails"] }),
  ev("wine_ev", "Natural Wine Tasting", [], { rating: 5 }),
];
const hours = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 11 }, close: { day: (d + 1) % 7, hour: 2 } })) };
const PLACE_CAT = new Map();
const gp = (cat, id, name, types, rating = 4.3) => {
  const c = places.toCandidate({ id, displayName: { text: name }, formattedAddress: `${id} Queen St W, Toronto`, location: { latitude: 43.6475, longitude: -79.395 }, types, primaryType: types[0], priceLevel: "PRICE_LEVEL_MODERATE", rating, userRatingCount: 900, googleMapsUri: `https://maps.google.com/?cid=${id}`, regularOpeningHours: hours }, "Food & drink");
  c.travel = trip(12);
  PLACE_CAT.set(c.id, cat);
  return c;
};
const PLACES = [
  gp("speakeasy", "maya", "Bar Maya", ["cocktail_bar", "bar"], 4.9),
  gp("speakeasy", "civil", "Civil Liberties", ["bar"], 4.8),
  gp("pub", "wheat", "The Wheat Sheaf", ["pub", "bar"], 4.7),
  gp("arcade", "getout", "Get Out Arcade Bar", ["bar", "video_arcade"], 4.1),
  gp("boardgame_cafe", "snakes", "Snakes & Lattes Board Game Cafe", ["cafe"], 4.2),
  gp("bowling", "bowl", "Bowlerama West", ["bowling_alley"], 3.9),
  gp("karaoke", "echo", "Echo Karaoke", ["karaoke"], 4.0),
  gp("chinese", "chuan", "Chuan Skewers House", ["chinese_restaurant", "restaurant"], 4.3),
  gp("chinese", "dragon", "Golden Dragon", ["chinese_restaurant", "restaurant"], 4.6),
  gp("hotpot", "liuyishou", "Liuyishou Hot Pot", ["chinese_restaurant", "restaurant"], 4.2),
  gp("ramen", "kinton", "Kinton Ramen", ["ramen_restaurant", "japanese_restaurant", "restaurant"], 4.4),
  gp("jazz_bar", "rex", "The Rex Jazz Bar", ["bar", "live_music_venue"], 4.5),
  gp("comedy_club", "cbar", "Comedy Bar", ["comedy_club", "bar"], 4.6),
  gp("gallery", "small", "Small Gallery", ["art_gallery"], 4.4),
  gp("park", "tb", "Trinity Bellwoods Park", ["park"], 4.7),
  gp("market", "stackt", "Stackt Market", ["market"], 4.4),
  gp("club", "toybox", "Toybox", ["night_club"], 4.0),
  gp("rooftop", "thompson", "The Thompson Rooftop", ["bar"], 4.3),
];
const catOf = (id) => PLACE_CAT.get(id) || (EVENTS.find((e) => e.id === id) || {}).cat;

R.init({ events: () => EVENTS });

const GAMES = ["arcade", "boardgame_cafe", "bowling", "karaoke", "trivia", "boardgames", "karaoke_ev"];
const MUSIC = ["gig", "jazz", "jazz_bar"];
const COMEDY = ["comedy", "comedy_club"];
const FOOD = ["chinese", "hotpot", "ramen"];
const DRINKS = ["speakeasy", "pub", "arcade", "jazz_bar", "comedy_club", "rooftop", "cocktail_ev", "wine_ev", "trivia"];
// Each scenario: people (vibe and want answers), optional kind, the place fixtures on the call (all by default),
// ok: the kinds of listing a pick may be. closest: nothing fits, so picks must be labelled "Closest we found".
const S = [
  { name: "Games & social (one person)", people: [{ vibe: ["games"] }, {}], ok: GAMES },
  { name: "Games & social (everyone)", people: [{ vibe: ["games"] }, { vibe: ["games"] }, { vibe: ["games"] }], ok: GAMES },
  { name: "Games, off-vibe bars rated higher", people: [{ vibe: ["games"] }, { vibe: ["games"] }], ok: GAMES, places: ["speakeasy", "pub", "bowling", "arcade"] },
  { name: "Music + comedy, split crew", people: [{ vibe: ["music"] }, { vibe: ["comedy"] }], ok: [...MUSIC, ...COMEDY] },
  { name: "Games vs music, split crew", people: [{ vibe: ["games"] }, { vibe: ["music"] }, { vibe: ["games"] }, { vibe: ["music"] }], ok: [...GAMES, ...MUSIC] },
  { name: "Food only", people: [{ vibe: ["food"] }, { vibe: ["food"] }], ok: FOOD },
  { name: "\"Chinese skewers\" (want only)", people: [{ want: ["Chinese skewers"] }, {}], ok: ["chinese", "hotpot"] },
  { name: "\"Chinese skewers\", places only", people: [{ want: ["Chinese skewers"] }, { want: ["Chinese skewers"] }], kind: "places", ok: ["chinese", "hotpot"] },
  { name: "Music + \"hot pot\"", people: [{ vibe: ["music"] }, { want: ["hot pot"] }], ok: [...MUSIC, "hotpot", "chinese"] },
  { name: "Single vibe: dancing", people: [{ vibe: ["dance"] }, {}], ok: ["dance", "club"] },
  { name: "Single vibe: art & film", people: [{ vibe: ["arts"] }, { vibe: ["arts"] }], ok: ["gallery", "gallery_ev", "film"] },
  { name: "Single vibe: karaoke", people: [{ vibe: ["karaoke"] }, {}], ok: ["karaoke", "karaoke_ev"] },
  { name: "Single vibe: bars", people: [{ vibe: ["drinks"] }, { vibe: ["drinks"] }], ok: DRINKS },
  { name: "Single vibe: outdoors", people: [{ vibe: ["outdoors"] }, {}], ok: ["park", "outdoor_ev"] },
  { name: "Single vibe: markets", people: [{ vibe: ["markets"] }, {}], ok: ["market"] },
  { name: "Games + \"karaoke with private rooms\"", people: [{ vibe: ["games"] }, { want: ["karaoke with private rooms"] }], ok: GAMES },
  { name: "Games, places only", people: [{ vibe: ["games"] }, { vibe: ["games"] }], kind: "places", ok: ["arcade", "boardgame_cafe", "bowling", "karaoke"] },
  { name: "Comedy, events only", people: [{ vibe: ["comedy"] }, { vibe: ["comedy"] }], kind: "events", ok: ["comedy"] },
  { name: "Three people: games, games, music", people: [{ vibe: ["games"] }, { vibe: ["games"] }, { vibe: ["music"] }], ok: [...GAMES, ...MUSIC] },
  { name: "Comedy + food, split crew", people: [{ vibe: ["comedy"] }, { vibe: ["food"] }], ok: [...COMEDY, ...FOOD] },
  { name: "\"Rooftop patio\" + bars", people: [{ want: ["rooftop patio"] }, { vibe: ["drinks"] }], ok: DRINKS },
  { name: "Nothing fits: markets with no market on", people: [{ vibe: ["markets"] }, { vibe: ["markets"] }], places: ["speakeasy", "pub", "chinese"], closest: true },
];

let failures = 0;
let offVibe = 0;
let total = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}
const NAMES = ["Asia", "Maya", "Jay", "Sam"];

(async () => {
  for (const sc of S) {
    await test(sc.name, async () => {
      const { room: rid } = T.createRoom({ crew: "Eval", planner: NAMES[0], nights: [SAT], persona: "friend" });
      const room = T.rooms.get(rid);
      room.mode = "lead";
      const people = [room.people[0], ...sc.people.slice(1).map((_, i) => T.addPerson(room, { name: NAMES[i + 1], mode: "voice" }))];
      sc.people.forEach((a, i) => {
        const p = people[i];
        T.setAnswer(room, p, "night", [SAT], "call_card");
        T.setAnswer(room, p, "time", ["evening", "late"], "call_card");
        T.setAnswer(room, p, "budget", "any", "call_card");
        T.setAnswer(room, p, "origin", "union", "call_card");
        if (a.vibe) T.setAnswer(room, p, "vibe", a.vibe, "call_card");
        if (a.want) T.setAnswer(room, p, "want", a.want, "call_card");
        if (sc.kind) T.setAnswer(room, p, "kind", sc.kind, "call_card");
      });
      room.places = PLACES.filter((p) => !sc.places || sc.places.includes(PLACE_CAT.get(p.id)));
      const evs = T.upcoming();
      const f = P.facts(room);
      const list = P.ranked([...evs, ...room.places], room, f);
      await T.makePicks(room, list);
      assert(room.picks && room.picks.length === 2, `two picks (got ${room.picks ? room.picks.length : 0})`);
      // A pick labelled "Closest we found" is honest only when fewer than two listings fit anyone
      const fitCount = list.filter((e) => P.fitsSomeone(e, room, f)).length;
      const out = [];
      for (const p of room.picks) {
        total++;
        const cat = catOf(p.id);
        assert(p.why && p.why.length > 3, `"${p.title}" has a why line`);
        assert(!/\$|budget|west end|downtown|east end|scarborough|etobicoke|north york/i.test(p.why), `why line is private-safe: ${p.why}`);
        if (sc.closest) {
          if (!p.closest) { offVibe++; out.push(`${p.title} (${cat}) not labelled Closest`); }
        } else if (p.closest ? fitCount >= 2 : !sc.ok.includes(cat)) { offVibe++; out.push(`${p.title} (${cat}${p.closest ? ", labelled closest though enough fit" : ""})`); }
      }
      console.log(`      picks: ${room.picks.map((p) => `${p.title} [${catOf(p.id)}] — ${p.why}`).join(" | ")}`);
      T.endRoom(room, "test");
      assert(!out.length, `off-vibe picks: ${out.join(", ")}`);
    });
  }

  await test("Rating is a tiebreaker only: a 5-star bar nobody asked for scores below a 3.9-star bowling alley for games", async () => {
    const { room: rid } = T.createRoom({ crew: "Eval", planner: "Asia", nights: [SAT], persona: "friend" });
    const room = T.rooms.get(rid);
    const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
    for (const p of [room.people[0], maya]) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "vibe", ["games"], "call_card"); T.setAnswer(room, p, "budget", "any", "call_card"); }
    const f = P.facts(room);
    const bar = { ...PLACES.find((p) => PLACE_CAT.get(p.id) === "speakeasy"), rating: 5 };
    const bowl = PLACES.find((p) => PLACE_CAT.get(p.id) === "bowling");
    assert(P.score(bowl, room, f) > P.score(bar, room, f) + 10, `bowling ${P.score(bowl, room, f)} vs bar ${P.score(bar, room, f)}`);
    T.endRoom(room, "test");
  });

  await test("No default cocktail-bar search: one vibe, no want, no taste makes one search, for that vibe", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const asked = [];
    const out = await places.forCall(["games"], { fetchImpl: async (url, opts) => { asked.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ places: [] }) }; } });
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.strictEqual(out.used, 1, `searches: ${out.used}`);
    assert(!asked.some((b) => /cocktail/i.test(b.textQuery || "")), JSON.stringify(asked));
  });

  await test("The second search goes to the crew's taste when there's no second vibe or want", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const asked = [];
    const out = await places.forCall(["games"], { taste: ["Jazz"], fetchImpl: async (url, opts) => { asked.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ places: [] }) }; } });
    delete process.env.GOOGLE_MAPS_API_KEY;
    assert.strictEqual(out.used, 2);
    assert(asked.some((b) => /jazz bar/i.test(b.textQuery || "")), JSON.stringify(asked));
  });

  console.log(`\n${total} picks in ${S.length} scenarios · off-vibe picks: ${offVibe}`);
  console.log(failures || offVibe ? `${failures} failed` : "All picks tests passed");
  process.exit(failures || offVibe ? 1 : 0);
})();
