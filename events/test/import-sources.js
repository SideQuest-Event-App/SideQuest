// Tests for the bigger import: the SeatGeek source, OpenStreetMap geocoding for bad venue coordinates, the "no pins
// in the lake" rule, the import workflow's triggers (read by parsing the YAML), and a full run of run.js that
// writes the Storage file even when the "listings" table doesn't exist yet. Everything runs on fixtures and fakes:
// a real request to SeatGeek, Nominatim or anywhere else fails the test.
//
//   node test/import-sources.js        (from events/)

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const zlib = require("zlib");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = path.join(ROOT, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-sources-"));
Object.assign(process.env, { IMPORT_CACHE_DIR: path.join(tmp, "cache"), GAP_MS: "0", CACHE_HOURS: "0", AI: "off" });
for (const k of ["SEATGEEK_CLIENT_ID", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "UPLOAD", "GEOCODE", "ONLY", "MERGE"]) delete process.env[k];
process.env.SUPABASE_URL = process.env.SUPABASE_SECRET_KEY = ""; // blank, not missing: a missing key is filled in from .env (the real database)

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("http://127.0.0.1:")) return realFetch(url, opts);
  throw new Error(`Unexpected real fetch in test: ${u}`);
};

const logs = [];
const log = (...a) => logs.push(a.join(" "));
const SECRET_ID = "sg_client_TEST_never_log_me_42";

const { fetchSeatGeek, toRaw } = require(path.join(ROOT, "sources", "seatgeek"));
const { toEvent } = require(path.join(ROOT, "lib", "normalize"));
const { dedupe } = require(path.join(ROOT, "lib", "dedupe"));
const locate = require(path.join(ROOT, "lib", "locate"));
const gta = require(path.join(ROOT, "lib", "gta"));
const geocodeLib = require(path.join(ROOT, "lib", "geocode"));
const yaml = require(path.join(__dirname, "mini-yaml"));

// The SeatGeek fixture, with its dates moved to the coming days so it never goes stale
function fixture() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "seatgeek-events.json"), "utf8"));
  data.events.forEach((e, i) => {
    const t = new Date(Date.now() + (3 + i) * 86400000);
    t.setUTCHours(0, 30, 0, 0);
    e.datetime_utc = t.toISOString().slice(0, 19);
  });
  return data;
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.log(`not ok - ${name}\n  ${err.stack.split("\n").slice(0, 4).join("\n  ")}`);
  }
}

// A simple polygon of Lake Ontario's open water off Toronto, drawn by hand for this test, independent of lib/gta.js
const SIMPLE_LAKE = [[-79.75, 43.35], [-79.55, 43.52], [-79.45, 43.6], [-79.38, 43.6], [-79.3, 43.64], [-79.15, 43.73], [-78.9, 43.82], [-78.9, 43.35]];
function inSimpleLake(lat, lng) {
  let inside = false;
  for (let i = 0, j = SIMPLE_LAKE.length - 1; i < SIMPLE_LAKE.length; j = i++) {
    const [xi, yi] = SIMPLE_LAKE[i], [xj, yj] = SIMPLE_LAKE[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

(async () => {
  // ---------- SeatGeek ----------
  await test("seatgeek: off without SEATGEEK_CLIENT_ID (skipped, no request)", async () => {
    let asked = 0;
    const out = await fetchSeatGeek({ start: new Date(), end: new Date(Date.now() + 30 * 86400000), log, fetchPage: async () => { asked++; return fixture(); } });
    assert.deepStrictEqual(out, { skipped: "No SEATGEEK_CLIENT_ID" });
    assert.strictEqual(asked, 0);
  });

  await test("seatgeek: on with the key, fixture events map to the normalised shape (no sports, no add-ons)", async () => {
    process.env.SEATGEEK_CLIENT_ID = SECRET_ID;
    const urls = [];
    const start = new Date();
    const end = new Date(Date.now() + 92 * 86400000);
    const raw = await fetchSeatGeek({ start, end, log, fetchPage: async (u) => { urls.push(u); return fixture(); } });
    assert.strictEqual(urls.length, 1, "one page (fewer than per_page results)");
    const q = new URL(urls[0]).searchParams;
    assert.strictEqual(q.get("client_id"), SECRET_ID);
    assert.strictEqual(q.get("lat"), "43.6532");
    assert.strictEqual(q.get("lon"), "-79.3832");
    assert.ok(q.get("datetime_utc.gte") && q.get("datetime_utc.lte") && q.get("per_page") === "100");
    assert.deepStrictEqual(raw.map((r) => r.sourceId).sort(), ["9001", "9002", "9004", "9005"], "NHL game and the parking pass are left out");
    const rex = raw.find((r) => r.sourceId === "9001");
    assert.strictEqual(rex.source, "SeatGeek");
    assert.strictEqual(rex.url, "https://seatgeek.com/e/9001");
    assert.ok(rex.startsAt.endsWith("Z") && !isNaN(Date.parse(rex.startsAt)));
    assert.deepStrictEqual(rex.venue, { name: "The Rex Hotel Jazz & Blues Bar", address: "194 Queen St W, Toronto, ON M5V 1Z1", lat: 43.6504, lng: -79.3886, city: "Toronto" });
    assert.strictEqual(rex.price, 15);
    assert.strictEqual(rex.priceHigh, 25);
    const e = toEvent(rex);
    assert.strictEqual(e.source, "SeatGeek");
    assert.ok(e.vibes.includes("Jazz"), e.vibes.join(","));
    assert.strictEqual(e.neighbourhood && e.area, "Downtown");
    assert.strictEqual(toEvent(raw.find((r) => r.sourceId === "9004")).price, null, "a $0 'lowest price' (no listings yet) isn't 'free'");
  });

  await test("seatgeek: a failed request names the problem without the client id", async () => {
    process.env.SEATGEEK_CLIENT_ID = SECRET_ID;
    await assert.rejects(fetchSeatGeek({ start: new Date(), end: new Date(Date.now() + 86400000), log, fetchPage: async (u) => { throw new Error(`403 ${u}`); } }), (err) => !err.message.includes(SECRET_ID) && /403/.test(err.message));
  });

  await test("seatgeek: the same show on Ticketmaster and SeatGeek becomes one listing, Ticketmaster's", async () => {
    const sg = toEvent(toRaw(fixture().events[1]));
    const tm = { ...sg, id: 77, source: "Ticketmaster", sourceUrl: "https://ticketmaster.ca/e/1", startsAt: new Date(Date.parse(sg.startsAt) - 15 * 60000).toISOString(), title: "Coldplay Tribute Night" };
    const out = dedupe([tm, sg]).events;
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].source, "Ticketmaster");
  });

  // ---------- Nominatim ----------
  await test("nominatim: the generic User-Agent, at most one request a second (even in parallel), answers cached", async () => {
    let clock = 1_000_000;
    const times = [];
    const seen = [];
    const fake = async (url, opts) => {
      times.push(clock);
      seen.push({ url, ua: opts.headers["user-agent"] });
      const q = new URL(url).searchParams.get("q");
      return { ok: true, json: async () => (/nowhere/i.test(q) ? [] : [{ lat: "43.6504", lon: "-79.3886", address: { house_number: "194", road: "Queen Street West", city: "Toronto" } }]) };
    };
    const cacheFile = path.join(tmp, "geo", "geocode.json");
    const g = geocodeLib.create({ cacheFile, fetchImpl: fake, gapMs: 1000, now: () => clock, sleep: async (ms) => { clock += ms; } });
    const out = await Promise.all(["The Rex, 194 Queen St W", "Massey Hall", "Nowhere Place", "The Rex, 194 Queen St W"].map((q) => g.geocode(q)));
    assert.strictEqual(seen.length, 3, "the repeated query was answered from the cache");
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1000, `requests ${times[i] - times[i - 1]} ms apart`);
    assert.ok(seen.every((s) => s.ua === "SideQuest-class-project"), "the generic User-Agent");
    assert.ok(seen.every((s) => !/@|mail|student|university/i.test(`${s.ua} ${s.url}`)), "no email or personal detail in the request");
    assert.deepStrictEqual(out[0], { lat: 43.6504, lng: -79.3886, address: "194 Queen Street West, Toronto" });
    assert.strictEqual(out[2], null);
    assert.ok(seen.every((s) => /viewbox=-80\.1%2C44\.15%2C-78\.8%2C43\.35/.test(s.url) && /bounded=1/.test(s.url)), "bounded to the GTA");
    // Saved to disk (misses too), so a new process doesn't ask again
    const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    assert.ok("massey hall" in saved && saved["nowhere place"] === null);
    const g2 = geocodeLib.create({ cacheFile, fetchImpl: async () => { throw new Error("asked again"); } });
    assert.ok(await g2.geocode("Massey Hall"));
    assert.strictEqual(await g2.geocode("nowhere place"), null);
    // A failed request isn't cached
    const g3 = geocodeLib.create({ cacheFile: path.join(tmp, "geo3.json"), fetchImpl: async () => ({ ok: false, status: 503 }), gapMs: 0 });
    assert.strictEqual(await g3.geocode("Lee's Palace"), null);
    assert.ok(!fs.existsSync(path.join(tmp, "geo3.json")) || !("lee's palace" in JSON.parse(fs.readFileSync(path.join(tmp, "geo3.json"), "utf8"))));
    assert.strictEqual(geocodeLib.UA, "SideQuest-class-project");
  });

  // ---------- Coordinates and the lake ----------
  await test("locate: lake coordinates are looked up again; a plus code with nothing better stays listed with no pin; never a guess", async () => {
    const asked = [];
    const geocode = async (q) => { asked.push(q); return /queens quay/i.test(q) ? { lat: 43.6387, lng: -79.3817, address: "235 Queens Quay W, Toronto" } : null; };
    const raw = toRawAll();
    const counts = await locate.fix(raw, { geocode, log });
    const by = (id) => raw.find((r) => r.sourceId === id);
    assert.deepStrictEqual([by("9004").venue.lat, by("9004").venue.lng], [43.6387, -79.3817], "the waterfront stage gets its real point");
    assert.strictEqual(by("9005").venue.noPin, true, "the plus-code venue has no trustworthy point");
    assert.strictEqual(by("9005").venue.lat, null);
    assert.ok(!asked.some((q) => /\+/.test(q)), `a plus code is never sent as a query: ${asked.join(" | ")}`);
    assert.deepStrictEqual([by("9001").venue.lat, by("9001").venue.lng], [43.6504, -79.3886], "good coordinates are untouched");
    assert.strictEqual(counts.geocoded, 1);
    assert.strictEqual(counts.noPin, 1);
    // Swapped and zero
    const sw = [{ venue: { name: "X", lat: -79.4, lng: 43.65 } }, { venue: { name: "Y", lat: 0, lng: 0 } }];
    await locate.fix(sw, {});
    assert.deepStrictEqual([sw[0].venue.lat, sw[0].venue.lng], [43.65, -79.4]);
    assert.strictEqual(sw[1].venue.noPin, undefined, "no location at all: left for run.js to drop, not pinned");
    // Without the geocoder (GEOCODE off) a lake point is still never shown
    const off = toRawAll();
    await locate.fix(off, {});
    assert.ok(off.filter((r) => r.venue.noPin).length === 2);
    // The listed-without-a-pin event survives normalising, in the list, with no coordinates
    const e = toEvent(off.find((r) => r.sourceId === "9005"));
    assert.ok(e && e.venue.noPin && e.venue.lat === null && e.area === "Toronto");
  });

  await test("no pins in the lake: every imported event that keeps coordinates is outside a simple lake polygon", async () => {
    // The hand-drawn polygon really is water, and real waterfront venues are outside it
    for (const [lat, lng] of [[43.5, -79.5], [43.6, -79.36], [43.62, -79.1]]) assert.ok(inSimpleLake(lat, lng) && gta.inLake(lat, lng), `${lat},${lng} is lake`);
    for (const [lat, lng] of [[43.6387, -79.3817], [43.663, -79.307], [43.706, -79.232], [43.622, -79.475], [43.6205, -79.3786]]) assert.ok(gta.onMap(lat, lng), `${lat},${lng} is land`);
    // The current seed import, plus the fixture's lake venues, through locate.fix (no geocoder) and toEvent
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "events.json"), "utf8")).events;
    const raws = [...seed.map((e) => ({ source: e.source, sourceId: e.id, url: e.sourceUrl, title: e.title, startsAt: e.startsAt, venue: { ...e.venue, city: "Toronto" }, categories: e.tags })), ...toRawAll()];
    const before = raws.filter((r) => r.venue.lat != null && inSimpleLake(r.venue.lat, r.venue.lng)).length;
    assert.ok(before >= 3, `the fixture has lake points to catch (${before})`);
    await locate.fix(raws, {});
    const events = raws.map(toEvent).filter(Boolean);
    const wet = events.filter((e) => e.venue.lat != null && inSimpleLake(e.venue.lat, e.venue.lng));
    assert.deepStrictEqual(wet.map((e) => `${e.title} @ ${e.venue.lat},${e.venue.lng}`), []);
    assert.ok(events.some((e) => e.venue.noPin), "they're still in the list");
  });

  // ---------- The workflow ----------
  await test("workflow: push on this branch (import paths only), Run workflow kept, one concurrency group, SeatGeek secret", () => {
    const wf = yaml.parse(fs.readFileSync(path.join(REPO, ".github", "workflows", "import-events.yml"), "utf8"));
    const on = wf.on;
    assert.deepStrictEqual(on.push.branches, ["claude/dazzling-brahmagupta-4ldxu4"]);
    assert.deepStrictEqual(on.push.paths.sort(), ["!events/README.md", "!events/data/events.json", "!events/docs/**", "!events/test/**", ".github/workflows/import-events.yml", "events/**"]);
    assert.ok(!("main" in (on.push || {})) && !on.push.branches.includes("main"), "never triggers on main pushes");
    assert.ok(on.workflow_dispatch && on.workflow_dispatch.inputs.only, "Run workflow is still there, with its 'only' input");
    assert.deepStrictEqual(on.schedule.map((s) => s.cron), ["17 7 * * 0,2-6", "23 6 * * 1"]);
    assert.strictEqual(wf.concurrency.group, "import-events");
    assert.strictEqual(wf.concurrency["cancel-in-progress"], false, "a running import is never killed half-way");
    const step = wf.jobs.import.steps.find((s) => s.run === "node run.js");
    assert.strictEqual(step.env.SEATGEEK_CLIENT_ID, "${{ secrets.SEATGEEK_CLIENT_ID }}");
    assert.strictEqual(step.env.GEOCODE, "1");
    assert.strictEqual(step.env.UPLOAD, "1");
    // A push has no schedule and no inputs: ONLY and MERGE come out empty, so it's a full import
    const evaluate = (expr, ctx) => new Function("ctx", `return (${expr.replace(/^\$\{\{\s*|\s*\}\}$/g, "").replace(/github\.event\.schedule/g, "ctx.schedule").replace(/inputs\.only/g, "ctx.only").replace(/'([^']*)'/g, (m, s) => JSON.stringify(s)).replace(/==/g, "===")});`)(ctx) || "";
    const push = { schedule: undefined, only: undefined };
    assert.strictEqual(evaluate(step.env.ONLY, push), "");
    assert.strictEqual(evaluate(step.env.MERGE, push), "");
    assert.ok(evaluate(step.env.ONLY, { schedule: "17 7 * * 0,2-6" }).split(",").includes("SeatGeek"));
    // The geocode cache is kept between runs
    assert.ok(wf.jobs.import.steps.some((s) => s.uses && s.uses.startsWith("actions/cache@") && s.with.path === "events/data/geocode.json"));
  });

  // ---------- A full run: Storage written even without the listings table ----------
  await test("run.js: SeatGeek on fixtures, lake venues fixed, Storage file uploaded, a missing listings table doesn't fail it", async () => {
    const { createFakeSupabase } = require(path.join(__dirname, "fake-supabase"));
    const KEY = "sb_secret_TEST_KEY_sources_123";
    const fake = createFakeSupabase({ key: KEY, tables: {} }); // no listings table yet (schema.sql not run)
    await fake.start();
    const fx = path.join(tmp, "seatgeek-now.json");
    fs.writeFileSync(fx, JSON.stringify(fixture()));
    const preload = path.join(tmp, "fake-net.js");
    fs.writeFileSync(preload, `
      const fs = require("fs");
      const real = global.fetch;
      global.fetch = async (url, opts) => {
        const u = String(url);
        if (u.startsWith("http://127.0.0.1:")) return real(url, opts);
        if (u.startsWith("https://api.seatgeek.com/2/events")) return new Response(fs.readFileSync(${JSON.stringify(fx)}, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
        if (u.startsWith("https://nominatim.openstreetmap.org/search")) {
          if ((opts.headers || {})["user-agent"] !== "SideQuest-class-project") throw new Error("wrong user agent");
          const q = new URL(u).searchParams.get("q");
          const hit = /queens quay/i.test(q) ? [{ lat: "43.6387", lon: "-79.3817", address: { house_number: "235", road: "Queens Quay West", city: "Toronto" } }] : [];
          return new Response(JSON.stringify(hit), { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error("Unexpected real fetch in run.js test: " + u);
      };`);
    const out = path.join(tmp, "events.json");
    const env = { ...process.env, ONLY: "SeatGeek", SEATGEEK_CLIENT_ID: SECRET_ID, UPLOAD: "1", GEOCODE: "1", GEOCODE_CACHE: path.join(tmp, "run-geocode.json"), SUPABASE_URL: fake.url, SUPABASE_SECRET_KEY: KEY, IMPORT_OUT: out, EVENT_TAGS_FILE: path.join(tmp, "tags.json"), SERIES_FILE: path.join(tmp, "series.json") };
    const child = spawn(process.execPath, ["-r", preload, path.join(ROOT, "run.js")], { env, cwd: ROOT });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const code = await new Promise((r) => child.on("close", r));
    if (process.env.VERBOSE) console.log(text);
    try {
      assert.strictEqual(code, 0, text);
      assert.match(text, /SeatGeek: done, 4 fetched, 4 in-person GTA events kept/);
      assert.match(text, /Events table: not there yet/);
      assert.match(text, /Wrote 4 events .* to data\/events\.json and Supabase Storage/);
      assert.match(text, /Locations: 1 venues looked up on OpenStreetMap .*1 kept off the map; 1 listed without a pin/);
      assert.ok(!text.includes(SECRET_ID) && !text.includes(KEY), "no key in the log");
      const stored = JSON.parse(zlib.gunzipSync(fake.files["imports/events.json.gz"]).toString("utf8"));
      const titles = stored.events.map((e) => e.title).sort();
      assert.deepStrictEqual(titles, ["Coldplay Tribute Night", "Jazz at the Rex: Late Set", "Pop-up Comedy in the Park", "Waterfront Folk Session"]);
      assert.strictEqual(stored.events.find((e) => e.title === "Pop-up Comedy in the Park").venue.noPin, true, "listed, never pinned");
      const folk = stored.events.find((e) => e.title === "Waterfront Folk Session");
      assert.deepStrictEqual([folk.venue.lat, folk.venue.lng], [43.6387, -79.3817], "geocoded off the lake");
      assert.ok(stored.events.every((e) => e.venue.lat == null || !inSimpleLake(e.venue.lat, e.venue.lng)));
      assert.strictEqual(stored.sources.SeatGeek.kept, 4);
      assert.ok(JSON.parse(fs.readFileSync(out, "utf8")).events.length === 4, "the local file too");
    } finally {
      await fake.stop();
    }
  });

  await test("no key or client id in any log line", () => {
    for (const l of logs) assert.ok(!l.includes(SECRET_ID), l);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();

function toRawAll() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "seatgeek-events.json"), "utf8"));
  return data.events.map((e, i) => {
    const t = new Date(Date.now() + (3 + i) * 86400000);
    e.datetime_utc = t.toISOString().slice(0, 19);
    return toRaw(e);
  }).filter(Boolean);
}
