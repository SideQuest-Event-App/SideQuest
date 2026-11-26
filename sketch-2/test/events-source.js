// Tests for where Sketch 2's server gets its events and how fresh they are: the events table first (only upcoming
// events), then the Storage file, then the repo's seed file, each with its "Events: ..." log line; the server
// starting against a fake Supabase and reporting the source on /api/health; and the one-week staleness warning
// (server log and /api/health). Supabase is a local fake (events/test/fake-supabase.js) answering like PostgREST
// and Storage; nothing reaches the internet.
//
//   node test/events-source.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const EV = path.join(ROOT, "..", "events");
const { createFakeSupabase } = require(path.join(EV, "test", "fake-supabase"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-events-source-"));
const FAKE_KEY = "sb_secret_TEST_KEY_never_log_me_789";

const logs = [];
for (const m of ["log", "warn", "error"]) {
  const orig = console[m];
  console[m] = (...a) => {
    logs.push(a.join(" "));
    if (process.env.VERBOSE) orig(...a);
  };
}
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("http://127.0.0.1:") || u.startsWith("http://localhost:")) return realFetch(url, opts);
  throw new Error(`Unexpected real fetch in test: ${u}`);
};

let failures = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`ok - ${name}`);
  } catch (err) {
    failures++;
    results.push(`not ok - ${name}\n    ${(err && err.stack ? err.stack : String(err)).split("\n").slice(0, 12).join("\n    ")}`);
  }
}
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const since = (mark) => logs.slice(mark);

(async () => {
  const freshness = require(path.join(ROOT, "lib", "freshness"));

  // ---------- Staleness ----------
  await test("freshness: warns only when the newest import is more than a week old (imports are run by hand)", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    const fresh = freshness.importAge("2026-11-24T07:30:00Z", now);
    assert.deepStrictEqual({ hours: fresh.hours, stale: fresh.stale }, { hours: 4, stale: false });
    assert.strictEqual(freshness.staleWarning(fresh), null);
    assert.strictEqual(freshness.importAge("2026-11-17T13:00:00Z", now).stale, false); // 167 h
    const old = freshness.importAge("2026-11-17T11:00:00Z", now); // 169 h
    assert.strictEqual(old.stale, true);
    assert.match(freshness.staleWarning(old, "events table"), /^WARNING: the newest event import is 7 days old \(imported 2026-11-17T11:00:00Z, read from the events table\); time to run the import again: cd events && UPLOAD=1 GEOCODE=1 node run\.js/);
    assert.match(freshness.staleWarning(freshness.importAge("2026-10-15T04:29:11Z", now)), /40 days old/);
    assert.strictEqual(freshness.importAge("sample", now).stale, false);
    assert.strictEqual(freshness.staleWarning(freshness.importAge(undefined, now)), null);
  });

  // ---------- A fake Supabase with the events table, Storage and Sketch 2's own tables ----------
  const now = Date.now();
  const iso = (h) => new Date(now + h * 3600000).toISOString();
  const event = (n, h, extra = {}) => ({ id: 5000 + n, source: "Ticketmaster", sourceUrl: `https://example.com/${n}`, title: `Table Event ${n}`, date: "", startsAt: iso(h), endsAt: null, runsUntil: null, neighbourhood: "Kensington", area: "Downtown", venue: { name: "Example Hall", address: "1 St", lat: 43.65, lng: -79.4 }, scene: "Music", price: 10, priceNote: "$10", description: "N/A", tags: [], vibes: ["Live music"], rating: null, reviews: [], going: 0, attendees: [], organizer: { name: "Example", rating: null, review: "" }, friends: [], travel: {}, ticketLink: "", image: null, dayInfo: {}, ...extra });
  const table = require(path.join(EV, "lib", "events-table"));
  const rows = [event(1, 5), event(2, 30), event(3, 200), event(4, -48)].map((e) => ({ ...table.toRow(e), updated_at: iso(-2) }));
  const importedAt = iso(-2);
  const fake = createFakeSupabase({
    key: FAKE_KEY,
    tables: { listings: rows, event_imports: [{ id: 1, imported_at: importedAt, total: 4, changed: 4, removed: 0, sources: {} }], app_state: [], sketch2_accounts: [], sketch2_events: [], analytics_events: [] },
    primaryKeys: { listings: "source,source_id" },
  });
  await fake.start();
  const storageFile = { importedAt: iso(-30), sources: {}, events: [event(10, 3, { title: "Storage Event", source: "City of Toronto" }), event(11, -72, { title: "Old Storage Event" })] };
  fake.putFile("imports/events.json.gz", storageFile);
  Object.assign(process.env, { SUPABASE_URL: fake.url, SUPABASE_SECRET_KEY: FAKE_KEY });
  const db = require(path.join(ROOT, "lib", "db"));

  await test("events: read from the table (upcoming only) with the right log line", async () => {
    const mark = logs.length;
    const out = await db.seedEvents();
    assert.deepStrictEqual(out.events.map((e) => e.title), ["Table Event 1", "Table Event 2", "Table Event 3"]);
    assert.strictEqual(out.importedAt, importedAt);
    assert.strictEqual(db.eventsSource.from, "table");
    assert.ok(since(mark).includes(`Events: table (3 upcoming, updated ${iso(-2)})`), since(mark).join("\n"));
    const get = fake.requests.filter((r) => r.path === "/rest/v1/listings").pop();
    assert.strictEqual(get.headers.apikey, FAKE_KEY);
    assert.match(new URLSearchParams(get.query).get("or"), /starts_at\.gte\./);
  });

  await test("events: no table yet -> the Storage file, with the right log lines", async () => {
    fake.fail["/rest/v1/listings"] = { status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.listings' in the schema cache" } };
    const mark = logs.length;
    const out = await db.seedEvents();
    assert.strictEqual(out.importedAt, storageFile.importedAt);
    assert.deepStrictEqual(out.events.map((e) => e.title), ["Storage Event", "Old Storage Event"]);
    assert.strictEqual(db.eventsSource.from, "storage");
    const lines = since(mark);
    assert.ok(lines.includes("No events table yet (run sketch-2/supabase/schema.sql once); using the Storage file"), lines.join("\n"));
    assert.ok(lines.includes(`Events: Storage file (1 upcoming, imported ${storageFile.importedAt})`), lines.join("\n"));
  });

  await test("events: table and Storage both failing -> the seed file, with the right log lines", async () => {
    fake.fail["/rest/v1/listings"] = { status: 500, body: { message: "boom" } };
    fake.fail["/storage/v1/object/imports"] = { status: 500, body: { message: "storage down" } };
    const mark = logs.length;
    const out = await db.seedEvents();
    const seed = JSON.parse(fs.readFileSync(path.join(EV, "data", "events.json"), "utf8"));
    assert.strictEqual(out.importedAt, seed.importedAt);
    assert.strictEqual(db.eventsSource.from, "seed");
    const lines = since(mark);
    assert.ok(lines.some((l) => /^Couldn't read the events table \(Supabase GET listings 500: .*boom.*\); using the Storage file$/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /^Couldn't read the import from Supabase Storage \(Supabase Storage 500/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => new RegExp(`^Events: seed file \\(\\d+ upcoming, imported ${seed.importedAt.replace(/[.]/g, "\\.")}\\)$`).test(l)), lines.join("\n"));
    delete fake.fail["/rest/v1/listings"];
    delete fake.fail["/storage/v1/object/imports"];
  });

  await test("events: an empty table falls back to the Storage file", async () => {
    const saved = fake.db.listings;
    fake.db.listings = [];
    const mark = logs.length;
    await db.seedEvents();
    assert.strictEqual(db.eventsSource.from, "storage");
    assert.ok(since(mark).includes("Events table is empty; using the Storage file"));
    fake.db.listings = saved;
  });

  // ---------- The server itself, against the fake Supabase ----------
  const port = await freePort();
  Object.assign(process.env, { PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), SIDEKICK_STUDY_FILE: path.join(tmp, "study.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SIDEKICK_PLACES_OFF: "1", WEATHER_OFF: "1", GOOGLE_MAPS_API_KEY: "" });
  const mark = logs.length;
  require(path.join(ROOT, "server.js"));
  const base = `http://127.0.0.1:${port}`;
  let health = null;
  for (let i = 0; i < 200 && !health; i++) {
    try {
      const r = await realFetch(`${base}/api/health`);
      if (r.ok) health = await r.json();
    } catch {}
    if (!health) await new Promise((r) => setTimeout(r, 100));
  }

  await test("server: starts from the events table, logs it, and reports it on /api/health", async () => {
    assert.ok(health, "the server answered /api/health");
    const lines = since(mark);
    assert.ok(lines.includes("Database: Supabase"), lines.join("\n"));
    assert.ok(lines.includes(`Events: table (3 upcoming, updated ${iso(-2)})`), lines.join("\n"));
    assert.ok(!lines.some((l) => /newest event import is/.test(l)), "no staleness warning for a 2-hour-old import");
    assert.strictEqual(health.events.source, "table");
    assert.strictEqual(health.events.sourceName, "events table");
    assert.strictEqual(health.events.upcoming, 3);
    assert.strictEqual(health.events.importedAt, importedAt);
    assert.strictEqual(health.events.stale, false);
    assert.strictEqual(health.events.ageHours, 2);
    assert.strictEqual(health.events.limitHours, 168);
    // The app's state carries the same block for the admin side
    const state = await (await realFetch(`${base}/api/state`)).json();
    assert.strictEqual(state.eventsFeed.source, "table");
  });

  await test("server: an import over a week old shows the warning on /api/health", async () => {
    db.data.eventsImportedAt = iso(-200);
    const h = await (await realFetch(`${base}/api/health`)).json();
    assert.strictEqual(h.events.stale, true);
    assert.strictEqual(h.events.ageHours, 200);
    assert.match(h.events.warning, /^WARNING: the newest event import is 8 days old .*read from the events table/);
    db.data.eventsImportedAt = importedAt;
  });

  await test("server: the hourly check skips re-reading the table when there's no new import", async () => {
    const before = fake.requests.filter((r) => r.path === "/rest/v1/listings").length;
    assert.strictEqual(await db.checkImport(), false);
    assert.strictEqual(fake.requests.filter((r) => r.path === "/rest/v1/listings").length, before, "only event_imports was asked");
    // A new import: the next check takes it
    fake.db.event_imports.push({ id: 2, imported_at: iso(0), total: 4, changed: 1, removed: 0, sources: {} });
    fake.db.listings.push({ ...table.toRow(event(5, 50, { title: "New Today" })), updated_at: iso(0) });
    const mark2 = logs.length;
    assert.strictEqual(await db.checkImport(), true);
    assert.ok(db.data.events.some((e) => e.title === "New Today"));
    assert.ok(since(mark2).includes(`Events: table (4 upcoming, updated ${iso(0)})`), since(mark2).join("\n"));
  });

  await test("no Supabase key in any log line", () => {
    for (const l of logs) assert.ok(!l.includes(FAKE_KEY), `key in a log line: ${l}`);
  });

  for (const r of results) process.stdout.write(`${r}\n`);
  process.stdout.write(`\n${results.length - failures} passed, ${failures} failed\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
