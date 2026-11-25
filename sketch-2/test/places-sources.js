// The second place source and the shared map rules, on fixtures (no real network: a real request fails the test):
//  1. Foursquare Places: off without FOURSQUARE_API_KEY (no request); with it, the current API (host, Bearer key,
//     version header, Pro fields only) mapped to the app's place shape with Foursquare attribution
//  2. its usage meter stops at the daily and monthly caps (80% of the free allowance)
//  3. Google and Foursquare results for the same place are merged into one (Google's copy wins, with Foursquare's
//     categories), and a want search uses both
//  4. the key never reaches a log line
//  5. the map's lake and GTA numbers (public/js/map.js) are the import's (sketch-1/lib/gta.js), and the map drops
//     pins in the lake or outside the GTA
//
//   node test/places-sources.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-places-src-"));
const FSQ_KEY = "fsq_TEST_KEY_never_log_me_314";
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", AI: "off", GOOGLE_MAPS_API_KEY: "test-key", FOURSQUARE_FREE_PER_MONTH: "10", FOURSQUARE_STOP_AT: "0.8", FOURSQUARE_DAILY_MAX: "5" });
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SIDEKICK_PLACES_OFF", "FOURSQUARE_API_KEY", "FOURSQUARE_OFF"]) delete process.env[k];

const logs = [];
for (const m of ["log", "warn", "error"]) {
  const orig = console[m];
  console[m] = (...a) => { logs.push(a.join(" ")); if (m === "log" && /^(PASS|FAIL|\s{6}|All|\d+ failed)/.test(String(a[0]))) orig(...a); };
}

const ROOT = path.join(__dirname, "..");
const calls = { fsq: [], google: [] };
// Foursquare's /places/search answer (the 2025-06-17 API shape)
const FSQ = { results: [
  { fsq_place_id: "4b0588f1f964a52063d822e3", name: "Chuan Skewers House", latitude: 43.65352, longitude: -79.39851, categories: [{ fsq_category_id: "4bf58dd8d48988d145941735", name: "Chinese Restaurant" }, { fsq_category_id: "x1", name: "Xinjiang Restaurant" }], location: { formatted_address: "12 Spadina Ave, Toronto ON" }, link: "/places/4b0588f1f964a52063d822e3" },
  { fsq_place_id: "5a1", name: "Lamb Kebab King", latitude: 43.6561, longitude: -79.4102, categories: [{ fsq_category_id: "x2", name: "Kebab Restaurant" }], location: { formatted_address: "300 College St, Toronto ON" } },
  { fsq_place_id: "5a2", name: "No Coordinates", categories: [] },
] };
const GOOGLE = { places: [
  { id: "g_chuan", displayName: { text: "Chuan Skewers House" }, formattedAddress: "12 Spadina Ave, Toronto", location: { latitude: 43.6535, longitude: -79.3985 }, types: ["chinese_restaurant", "restaurant"], primaryType: "chinese_restaurant", rating: 4.3, userRatingCount: 400, googleMapsUri: "https://maps.google.com/?cid=1" },
] };
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://places-api.foursquare.com/places/search")) {
    calls.fsq.push({ url: u, headers: opts.headers });
    return { ok: true, json: async () => FSQ };
  }
  if (u.startsWith("https://places.googleapis.com/")) {
    calls.google.push({ url: u, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => GOOGLE };
  }
  throw new Error(`Unexpected real fetch in test: ${u}`);
};

const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
const fsq = require(path.join(ROOT, "lib", "sidekick", "foursquare"));
const places = require(path.join(ROOT, "lib", "sidekick", "places"));

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack.split("\n").slice(0, 3).join("\n      ")}`); }
}

(async () => {
  await test("1a. Foursquare is off without its key: no request, places stay Google-only", async () => {
    usage._reset();
    assert.strictEqual(fsq.configured(), false);
    const out = await fsq.search("Chinese skewers", {});
    assert.deepStrictEqual(out, { places: [], capped: "not configured" });
    await places.searchWant(["Chinese skewers"], {});
    assert.strictEqual(calls.fsq.length, 0);
    assert.strictEqual(calls.google.length, 1);
  });

  await test("1b. With the key: the current host, Bearer key, version header, Pro fields; mapped with attribution", async () => {
    usage._reset();
    process.env.FOURSQUARE_API_KEY = FSQ_KEY;
    const out = await fsq.search("Chinese skewers restaurant", { center: { latitude: 43.7806, longitude: -79.4155 }, radius: 5000 });
    const c = calls.fsq[calls.fsq.length - 1];
    const q = new URL(c.url).searchParams;
    assert.strictEqual(new URL(c.url).host, "places-api.foursquare.com");
    assert.strictEqual(c.headers.authorization, `Bearer ${FSQ_KEY}`);
    assert.strictEqual(c.headers["x-places-api-version"], "2025-06-17");
    assert.strictEqual(q.get("query"), "Chinese skewers restaurant");
    assert.strictEqual(q.get("ll"), "43.7806,-79.4155");
    assert.strictEqual(q.get("radius"), "5000");
    assert.deepStrictEqual(q.get("fields").split(","), ["fsq_place_id", "name", "latitude", "longitude", "categories", "location", "link"], "Pro fields only (no rating, hours, price, photos)");
    assert.strictEqual(out.places.length, 2, "a result with no coordinates is skipped");
    const p = out.places[0];
    assert.strictEqual(p.type, "place");
    assert(p.id < 0, "negative ids, like Google places");
    assert.strictEqual(p.placeId, "fsq:4b0588f1f964a52063d822e3");
    assert.strictEqual(p.title, "Chuan Skewers House");
    assert.strictEqual(p.attribution, "Foursquare");
    assert.strictEqual(p.source, "Foursquare");
    assert.deepStrictEqual(p.categories.map((x) => x.name), ["Chinese Restaurant", "Xinjiang Restaurant"]);
    assert(p.tags.includes("restaurant"), "categories become types the app reads");
    assert(/^https:\/\/foursquare\.com\/v\//.test(p.mapsUrl));
    assert(p.travel && p.travel.from.union.minutes > 0);
    assert.strictEqual(p.rating, null, "no premium fields");
  });

  await test("2. Foursquare's meter: stops at the daily cap, and at 80% of the monthly allowance", async () => {
    usage._reset();
    const before = calls.fsq.length;
    const res = [];
    for (let i = 0; i < 7; i++) res.push(await fsq.search("karaoke", {}));
    assert.strictEqual(calls.fsq.length - before, 5);
    assert.strictEqual(res[6].capped, "daily limit");
    usage._reset();
    process.env.FOURSQUARE_DAILY_MAX = "100";
    const b2 = calls.fsq.length;
    for (let i = 0; i < 12; i++) await fsq.search("karaoke", {});
    assert.strictEqual(calls.fsq.length - b2, 8, "8 of a 10 free allowance");
    assert.strictEqual(await fsq.available(), false);
    const st = await usage.status();
    assert.strictEqual(st.foursquare_places.used.month, 8);
    process.env.FOURSQUARE_DAILY_MAX = "5";
    process.env.FOURSQUARE_OFF = "1";
    assert.strictEqual(fsq.configured(), false, "FOURSQUARE_OFF switches it off");
    delete process.env.FOURSQUARE_OFF;
  });

  await test("3. Google + Foursquare: one place each, the twin merged (Google's copy, Foursquare's categories)", async () => {
    usage._reset();
    const out = await places.searchWant(["Chinese skewers"], {});
    const titles = out.places.map((p) => p.title).sort();
    assert.deepStrictEqual(titles, ["Chuan Skewers House", "Lamb Kebab King"]);
    const chuan = out.places.find((p) => p.title === "Chuan Skewers House");
    assert.strictEqual(chuan.source, "Google Maps", "Google's copy wins (it has hours and prices)");
    assert(chuan.categories.some((c) => c.name === "Xinjiang Restaurant"), "with Foursquare's categories");
    assert(out.places.every((p) => p.wantQuery === "Chinese skewers restaurant"));
    // Not the same place: different names, or the same name far apart
    const a = { id: -1, title: "Bar Raval", lat: 43.656, lng: -79.411, source: "Google Maps" };
    const b = { id: -2, title: "Bar Raval", lat: 43.70, lng: -79.40, source: "Foursquare" };
    assert.strictEqual(places.dedupePlaces([[a], [b]]).length, 2);
    // Foursquare alone (Google capped or off) still answers
    process.env.SIDEKICK_PLACES_OFF = "1";
    const alone = await places.searchWant(["Chinese skewers"], {});
    assert(alone.places.length === 2 && alone.places.every((p) => p.source === "Foursquare"));
    delete process.env.SIDEKICK_PLACES_OFF;
    assert.strictEqual(await places.available(), true, "places are available when only Foursquare can search");
  });

  await test("4. The Foursquare key never reaches a log line", async () => {
    const real = global.fetch;
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await fsq.search("ramen", {});
    global.fetch = real;
    assert(logs.some((l) => /Foursquare search failed \(401\)/.test(l)));
    for (const l of logs) assert(!l.includes(FSQ_KEY), l);
  });

  await test("5. The map's lake and GTA numbers match the import's, and the map drops pins in the lake or outside the GTA", async () => {
    const win = { SQ: { esc: (s) => String(s).replace(/"/g, "&quot;"), icon: () => "", u: {} } };
    win.window = win;
    vm.createContext(win);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "public", "js", "map.js"), "utf8"), win);
    const gta = require(path.join(ROOT, "..", "sketch-1", "lib", "gta"));
    assert.strictEqual(JSON.stringify(win.SQ.GEO.LAKE), JSON.stringify(gta.LAKE), "same lake polygon");
    assert.strictEqual(JSON.stringify(win.SQ.GEO.GTA), JSON.stringify(gta.GTA), "same GTA box");
    const pts = [[43.65, -79.38, true], [43.6, -79.38, false], [43.45, -79.5, false], [42.88, -78.87, false], [null, null, false], [0, 0, false], [43.6205, -79.3786, true], [43.663, -79.307, true]];
    for (const [lat, lng, ok] of pts) {
      assert.strictEqual(win.SQ.onMap(lat, lng), ok, `${lat},${lng}`);
      assert.strictEqual(gta.onMap(lat, lng), ok, `${lat},${lng} (import)`);
    }
    const html = win.SQ.mapView("t", { pins: pts.map(([lat, lng], i) => ({ lat, lng, kind: "event", label: `p${i}` })) });
    const shown = [...html.matchAll(/aria-label="Event: (p\d)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(shown, ["p0", "p6", "p7"]);
  });

  console.log(failures ? `\n${failures} failed` : "\nAll place-source checks passed");
  process.exit(failures ? 1 : 0);
})();
