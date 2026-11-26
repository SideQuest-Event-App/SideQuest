// Tests for the event import pipeline: the workflow's schedule and its ONLY/MERGE mapping (read from the YAML),
// the events-table upsert against a fake PostgREST (batching, request shape, changed-only, removals, a missing
// table), the Eventbrite parser on fixture pages and its clear "blocked" stop, the automated Instagram path with a
// mocked Graph API and its fallback to the saved file, and that no key or token ever reaches a log line.
// No real network: every request goes to a fake (a real one fails the test).
//
//   node test/import-pipeline.js        (from sketch-1/)

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const zlib = require("zlib");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-import-"));
const FAKE_KEY = "sb_secret_TEST_KEY_never_log_me_123";
const FAKE_TOKEN = "IGQVJ_TEST_TOKEN_never_log_me_456";
Object.assign(process.env, { IMPORT_CACHE_DIR: path.join(tmp, "cache"), GAP_MS: "0", CACHE_HOURS: "0", EVENTBRITE_LIST_GAP_MS: "0", EVENTBRITE_PAGE_GAP_MS: "0", AI: "off" });
for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN", "UPLOAD", "IG_AI", "EVENTBRITE", "EVENTS_TABLE", "EVENTS_BATCH"]) delete process.env[k];

const realFetch = global.fetch;
let fakeFetch = null; // set per test: (url, opts) => Response, for non-localhost requests
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("http://127.0.0.1:")) return realFetch(url, opts);
  if (fakeFetch) return fakeFetch(u, opts);
  throw new Error(`Unexpected real fetch in test: ${u}`);
};

// Every log line, to check for secrets at the end
const logs = [];
const log = (...a) => logs.push(a.join(" "));
for (const m of ["log", "warn", "error"]) {
  const orig = console[m];
  console[m] = (...a) => {
    logs.push(a.join(" "));
    if (process.env.VERBOSE) orig(...a);
  };
}

const ROOT = path.join(__dirname, "..");
const REPO = path.join(ROOT, "..");
const { createFakeSupabase } = require("./fake-supabase");

let failures = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`ok - ${name}`);
  } catch (err) {
    failures++;
    results.push(`not ok - ${name}\n    ${(err && err.stack ? err.stack : String(err)).split("\n").slice(0, 14).join("\n    ")}`);
  }
}
const response = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

(async () => {
  // ---------- 1. Workflow: schedule and ONLY/MERGE mapping ----------
  await test("workflow: daily quick-source cron and weekly full run, off the hour, no Thursday", () => {
    const yml = fs.readFileSync(path.join(REPO, ".github", "workflows", "import-events.yml"), "utf8");
    const crons = [...yml.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
    assert.deepStrictEqual(crons, ["17 7 * * 0,2-6", "23 6 * * 1"]);
    for (const c of crons) {
      const [min, hour, dom, mon, dow] = c.split(" ");
      assert.notStrictEqual(min, "0", `${c} is on the hour`);
      assert.ok(Number(min) > 0 && Number(min) < 60 && Number(hour) < 24 && dom === "*" && mon === "*");
      assert.ok(!/(^|,)4(,|$)/.test(dow) || dow.includes("-"), "no Thursday-only line");
    }
    assert.ok(!/\* \* 4"/.test(yml), "Thursday run removed");
    // Every github.event.schedule comparison names a cron line that exists
    const compared = [...yml.matchAll(/github\.event\.schedule == '([^']+)'/g)].map((m) => m[1]);
    assert.ok(compared.length >= 2);
    for (const c of compared) assert.ok(crons.includes(c), `compared schedule ${c} is not a cron line`);
    assert.match(yml, /AI: "off"/);
    assert.match(yml, /UPLOAD: "1"/);
    assert.match(yml, /INSTAGRAM_ACCESS_TOKEN: \$\{\{ secrets\.INSTAGRAM_ACCESS_TOKEN \}\}/);
  });

  await test("workflow: ONLY/MERGE evaluate right for the daily, weekly and hand-started runs", () => {
    const yml = fs.readFileSync(path.join(REPO, ".github", "workflows", "import-events.yml"), "utf8");
    const only = yml.match(/^\s*ONLY: \$\{\{ (.+) \}\}$/m)[1];
    const merge = yml.match(/^\s*MERGE: \$\{\{ (.+) \}\}$/m)[1];
    // A tiny evaluator for GitHub's expression syntax as used here: ==, &&, ||, (), 'strings', github.event.schedule, inputs.only
    const evaluate = (expr, ctx) => {
      const js = expr
        .replace(/github\.event\.schedule/g, "ctx.schedule")
        .replace(/inputs\.only/g, "ctx.only")
        .replace(/'([^']*)'/g, (m, s) => JSON.stringify(s))
        .replace(/==/g, "===");
      // eslint-disable-next-line no-new-func
      return new Function("ctx", `return (${js});`)(ctx) || "";
    };
    const daily = { schedule: "17 7 * * 0,2-6", only: "" };
    const weekly = { schedule: "23 6 * * 1", only: "" };
    const byHand = { schedule: "", only: "Ticketmaster,City of Toronto" };
    const byHandAll = { schedule: "", only: "" };
    assert.strictEqual(evaluate(only, daily), "Ticketmaster,SeatGeek,City of Toronto,Toronto Public Library,Luma,DICE,Instagram");
    assert.strictEqual(evaluate(merge, daily), "1");
    assert.strictEqual(evaluate(only, weekly), "");
    assert.strictEqual(evaluate(merge, weekly), "");
    assert.strictEqual(evaluate(only, byHand), "Ticketmaster,City of Toronto");
    assert.strictEqual(evaluate(merge, byHand), "1");
    assert.strictEqual(evaluate(only, byHandAll), "");
    assert.strictEqual(evaluate(merge, byHandAll), "");
    // Every daily source is a real source name in run.js (case-insensitive, as run.js matches them)
    const runJs = fs.readFileSync(path.join(ROOT, "import", "run.js"), "utf8");
    const names = [...runJs.matchAll(/^\s*\["([^"]+)", fetch\w+/gm)].map((m) => m[1].toLowerCase());
    for (const n of evaluate(only, daily).split(",")) assert.ok(names.includes(n.toLowerCase()), `${n} is not a source in run.js`);
  });

  // ---------- 2. Events table upsert against a fake PostgREST ----------
  const fake = createFakeSupabase({ key: FAKE_KEY, tables: { listings: [], event_imports: [] }, primaryKeys: { listings: "source,source_id" } });
  await fake.start();
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SECRET_KEY = FAKE_KEY;
  const table = require(path.join(ROOT, "lib", "events-table"));
  const now = new Date("2026-11-24T12:00:00Z");
  const ev = (n, extra = {}) => ({ id: 1000 + n, source: n % 2 ? "Ticketmaster" : "City of Toronto", sourceUrl: `https://example.com/e/${n}`, title: `Event ${n}`, startsAt: new Date(now.getTime() + n * 86400000).toISOString(), endsAt: null, runsUntil: null, neighbourhood: "Kensington", area: "Downtown", venue: { name: `Venue ${n}`, address: "1 St", lat: 43.65, lng: -79.4 }, price: n, priceNote: `$${n}`, vibes: ["Live music"], tags: ["music"], image: null, ...extra });

  await test("events table: upserts in batches with merge-duplicates and on_conflict, and logs counts", async () => {
    process.env.EVENTS_BATCH = "2";
    fake.reset();
    const lines = [];
    const counts = await table.sync({ importedAt: now.toISOString(), sources: { Ticketmaster: { kept: 3 } }, events: [1, 2, 3, 4, 5].map((n) => ev(n)) }, { log: (s) => lines.push(s), now });
    assert.deepStrictEqual({ ...counts }, { total: 5, inserted: 5, updated: 0, unchanged: 0, removed: 0, batches: 3 });
    const posts = fake.requests.filter((r) => r.method === "POST" && r.path === "/rest/v1/listings");
    assert.strictEqual(posts.length, 3);
    assert.deepStrictEqual(posts.map((p) => p.body.length), [2, 2, 1]);
    for (const p of posts) {
      assert.match(p.headers.prefer, /resolution=merge-duplicates/);
      assert.match(p.headers.prefer, /return=minimal/);
      assert.strictEqual(new URLSearchParams(p.query).get("on_conflict"), "source,source_id");
      assert.strictEqual(p.headers.apikey, FAKE_KEY);
      assert.strictEqual(p.headers["content-type"], "application/json");
      assert.ok(!p.headers.authorization, "a new-style secret key isn't sent as a Bearer token");
    }
    const row = posts[0].body[0];
    for (const col of ["source", "source_id", "id", "title", "starts_at", "ends_at", "runs_until", "venue", "neighbourhood", "area", "lat", "lng", "price", "price_note", "vibes", "tags", "url", "image", "raw", "content_hash", "updated_at"]) assert.ok(col in row, `row has ${col}`);
    assert.strictEqual(row.source_id, "1001");
    assert.deepStrictEqual(row.vibes, ["Live music"]);
    assert.strictEqual(row.raw.title, "Event 1");
    assert.strictEqual(fake.db.listings.length, 5);
    assert.strictEqual(fake.db.event_imports.length, 1);
    assert.ok(lines.some((l) => /Events table "listings": 5 events: 5 new, 0 changed, 0 unchanged, 0 removed \(3 upsert batches of up to 2\)/.test(l)), lines.join("\n"));
  });

  await test("events table: a re-run sends only changed events and deletes upcoming ones no longer imported", async () => {
    fake.reset();
    const lines = [];
    const events = [1, 2, 3, 4].map((n) => ev(n)); // 5 is gone
    events[1] = ev(2, { title: "Event 2 (moved)" });
    events.push(ev(6));
    const counts = await table.sync({ importedAt: new Date(now.getTime() + 3600000).toISOString(), events }, { log: (s) => lines.push(s), now });
    assert.deepStrictEqual({ ...counts }, { total: 5, inserted: 1, updated: 1, unchanged: 3, removed: 1, batches: 1 });
    const posts = fake.requests.filter((r) => r.method === "POST" && r.path === "/rest/v1/listings");
    assert.deepStrictEqual(posts[0].body.map((r) => r.title).sort(), ["Event 2 (moved)", "Event 6"]);
    const del = fake.requests.find((r) => r.method === "DELETE");
    assert.ok(del, "a DELETE for the event that's gone");
    assert.strictEqual(new URLSearchParams(del.query).get("source"), "eq.Ticketmaster");
    assert.strictEqual(new URLSearchParams(del.query).get("source_id"), 'in.("1005")');
    assert.deepStrictEqual(fake.db.listings.map((r) => r.source_id).sort(), ["1001", "1002", "1003", "1004", "1006"]);
    assert.strictEqual(fake.db.listings.find((r) => r.source_id === "1002").title, "Event 2 (moved)");
  });

  await test("events table: upcoming() reads only events that haven't ended, with the last import time", async () => {
    fake.db.listings.push(table.toRow(ev(-2))); // two days ago: over
    fake.db.listings.push({ ...table.toRow(ev(-10, { runsUntil: new Date(now.getTime() + 5 * 86400000).toISOString() })), updated_at: now.toISOString() }); // an exhibit still running
    const t = await table.upcoming({ now });
    assert.deepStrictEqual(t.events.map((e) => e.id).sort((a, b) => a - b), [990, 1001, 1002, 1003, 1004, 1006]);
    assert.strictEqual(t.importedAt, new Date(now.getTime() + 3600000).toISOString());
    const get = fake.requests.filter((r) => r.method === "GET" && r.path === "/rest/v1/listings").pop();
    assert.match(new URLSearchParams(get.query).get("or"), /^\(starts_at\.gte\.[^,]+,ends_at\.gte\.[^,]+,runs_until\.gte\.[^,]+\)$/);
    assert.strictEqual(await table.latestImport(), new Date(now.getTime() + 3600000).toISOString());
  });

  await test("events table: a missing table is reported as missingTable (so run.js says to run schema.sql)", async () => {
    process.env.EVENTS_TABLE = "no_such_table";
    await assert.rejects(table.sync({ events: [ev(1)] }, { log, now }), (err) => err.missingTable === true && err.status === 404 && !err.message.includes(FAKE_KEY));
    delete process.env.EVENTS_TABLE;
  });

  await test("events table: an id with quotes and commas is quoted safely in the DELETE filter", () => {
    assert.strictEqual(table.inList(['a,b', 'c"d', "e\\f"]), 'in.("a,b","c\\"d","e\\\\f")');
  });

  // ---------- 3. Eventbrite ----------
  const eb = require(path.join(ROOT, "import", "sources", "eventbrite"));
  const fixture = (n) => fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8");

  await test("eventbrite: listing page's __SERVER_DATA__ is parsed", () => {
    const res = eb.parseListing(fixture("eventbrite-listing-serverdata.html"));
    assert.strictEqual(res.pagination.object_count, 2);
    assert.strictEqual(res.results[0].name, "Test Night: Synth Pop");
    assert.deepStrictEqual(eb.listingPrice(res.results[0]), { low: 18, high: 25, currency: "CAD" });
  });

  await test("eventbrite: listing page with only JSON-LD gives the same shape", () => {
    const res = eb.parseListing(fixture("eventbrite-listing-jsonld.html"));
    assert.strictEqual(res.results.length, 2);
    const [a, b] = res.results;
    assert.strictEqual(a.id, "1000000000003");
    assert.strictEqual(a.start_date, "2026-12-10");
    assert.strictEqual(a.start_time, "19:30");
    assert.strictEqual(a.end_time, "21:00");
    assert.strictEqual(a.primary_venue.name, "Example Comedy Club");
    assert.strictEqual(a.primary_venue.address.latitude, 43.66);
    assert.strictEqual(a.primary_venue.address.localized_address_display, "2 Example Ave, Toronto, ON");
    assert.deepStrictEqual(eb.listingPrice(a), { low: 12, high: 12, currency: "CAD" });
    assert.strictEqual(b.is_online_event, true);
    assert.strictEqual(b.primary_venue, null);
    assert.strictEqual(eb.parseListing("<html>nothing here</html>"), null);
  });

  await test("eventbrite: event page JSON-LD gives price, organizer and description", () => {
    const info = eb.eventPageInfo(fixture("eventbrite-event-page.html"));
    assert.deepStrictEqual(info.price, { low: 18, high: 25, currency: "CAD" });
    assert.strictEqual(info.organizer, "Example Collective");
    assert.match(info.description, /full description/);
  });

  await test("eventbrite: a full run on fixture pages keeps the in-person event with its price", async () => {
    let listings = 0;
    fakeFetch = async (u) => {
      if (u.endsWith("/robots.txt")) return response(200, "User-agent: *\nAllow: /\n");
      if (u.includes("/d/canada--toronto/all-events/")) {
        listings++;
        return response(200, fixture("eventbrite-listing-serverdata.html"));
      }
      if (u.includes("/e/test-night-synth-pop")) return response(200, fixture("eventbrite-event-page.html"));
      return response(404, "not found");
    };
    const out = await eb.fetchEventbrite({ start: new Date("2026-11-30T12:00:00Z"), end: new Date("2026-12-05T12:00:00Z"), max: 100, log });
    fakeFetch = null;
    assert.strictEqual(listings, 1);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, "Test Night: Synth Pop");
    assert.strictEqual(out[0].price, 18);
    assert.strictEqual(out[0].organizer, "Example Collective");
    assert.strictEqual(out[0].startsAt, "2026-12-05T01:00:00.000Z");
  });

  await test("eventbrite: a 405 CAPTCHA answer stops the source at once with one clear line", async () => {
    let listings = 0;
    const lines = [];
    fakeFetch = async (u) => {
      if (u.endsWith("/robots.txt")) return response(200, "User-agent: *\nAllow: /\n");
      listings++;
      return response(405, "<html>captcha</html>", { "x-amzn-waf-action": "captcha" });
    };
    const out = await eb.fetchEventbrite({ start: new Date("2026-11-24T12:00:00Z"), end: new Date("2027-02-24T12:00:00Z"), max: 100, log: (s) => lines.push(s) });
    fakeFetch = null;
    assert.ok(out && out.skipped, "returns { skipped } so run.js keeps last run's Eventbrite events");
    assert.match(out.skipped, /bot protection \(HTTP 405, x-amzn-waf-action: captcha\)/);
    assert.match(out.skipped, /UPLOAD=1 ONLY=Eventbrite MERGE=1 node import\/run\.js/);
    assert.ok(listings <= 2, `stopped after the first page (and its one retry), not ${listings} requests`);
    assert.strictEqual(lines.filter((l) => /bot protection/.test(l)).length, 1);
  });

  await test("eventbrite: EVENTBRITE=off skips it", async () => {
    process.env.EVENTBRITE = "off";
    const out = await eb.fetchEventbrite({ start: new Date(), end: new Date(), max: 1, log });
    delete process.env.EVENTBRITE;
    assert.deepStrictEqual(out, { skipped: "turned off (EVENTBRITE=off)" });
  });

  // ---------- 4. Instagram ----------
  // Temp copies of the account list and files, so the test never touches the repo's
  const igDir = path.join(tmp, "ig");
  fs.mkdirSync(igDir);
  Object.assign(process.env, {
    IG_LIST_FILE: path.join(igDir, "accounts.md"),
    IG_ACCOUNTS_FILE: path.join(igDir, "accounts.json"),
    IG_EVENTS_FILE: path.join(igDir, "events.json"),
    IG_RAW_FILE: path.join(igDir, "raw.json"),
    IG_EXTRACTED_FILE: path.join(igDir, "extracted.json"),
    IG_IMAGES_DIR: path.join(igDir, "images"),
  });
  fs.writeFileSync(process.env.IG_LIST_FILE, "| Account | Venue |\n|---|---|\n| [@testvenue](https://www.instagram.com/testvenue/) | Test Venue | 0 | 0 | |\n| [@testpromoter](https://www.instagram.com/testpromoter/) | Promoter | 0 | 0 | |\n");
  fs.writeFileSync(process.env.IG_ACCOUNTS_FILE, JSON.stringify({ testvenue: { venue: "Test Venue", address: "9 Test St, Toronto", lat: 43.65, lng: -79.41 } }));
  const postedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const soon = new Date(Date.now() + 10 * 86400000);
  const md = soon.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" }); // "Dec 4"
  // A post the AI read before (saved reading wins), and new ones only the rules can read
  fs.writeFileSync(process.env.IG_EXTRACTED_FILE, JSON.stringify({ p_ai: { v: 2, posterText: "", events: [{ title: "Read By AI", start: soon.toLocaleString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 16).replace(" ", "T"), end: null, venue: "Test Venue", address: "", price: 12, organizer: "", ticketUrl: "", description: "" }], image: "https://posters.example/ai.jpg" } }));
  const media = {
    testvenue: [
      { id: "p_ai", caption: "something the AI read", timestamp: postedAt, permalink: "https://www.instagram.com/p/AI/", media_type: "IMAGE", media_url: "https://cdn.example/ai.jpg" },
      { id: "p_rule", caption: `LATE NIGHT JAZZ\n${md} · doors 8pm · $10 at the door`, timestamp: postedAt, permalink: "https://www.instagram.com/p/RULE/", media_type: "IMAGE", media_url: "https://cdn.example/rule.jpg" },
      { id: "p_menu", caption: "New menu drop, come try it", timestamp: postedAt, permalink: "https://www.instagram.com/p/MENU/", media_type: "IMAGE", media_url: "https://cdn.example/menu.jpg" },
    ],
    testpromoter: [{ id: "p_promo", caption: `Warehouse Party\n${md} 10pm at Test Venue, tickets in bio`, timestamp: postedAt, permalink: "https://www.instagram.com/p/PROMO/", media_type: "CAROUSEL_ALBUM", children: { data: [{ media_type: "IMAGE", media_url: "https://cdn.example/promo1.jpg" }] } }],
  };
  const ig = require(path.join(ROOT, "import", "sources", "instagram"));
  const window = { start: new Date(), end: new Date(Date.now() + 92 * 86400000), max: 5000 };
  // No Supabase for the Instagram tests (Storage reads would go to the fake, which is fine, but keep them local)
  const sbUrl = process.env.SUPABASE_URL;

  await test("instagram: with the Graph API secrets, posts are read (saved AI reading first, then caption rules)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.INSTAGRAM_USER_ID = "17841400000000000";
    process.env.INSTAGRAM_ACCESS_TOKEN = FAKE_TOKEN;
    const calls = [];
    fakeFetch = async (u) => {
      const url = new URL(u);
      assert.strictEqual(url.host, "graph.facebook.com", `only the Graph API is called, not ${url.host}`);
      calls.push(url);
      assert.strictEqual(url.searchParams.get("access_token"), FAKE_TOKEN);
      const handle = url.searchParams.get("fields").match(/business_discovery\.username\(([^)]+)\)/)[1];
      return response(200, { business_discovery: { username: handle, name: handle === "testvenue" ? "Test Venue" : "Test Promoter", media: { data: media[handle] } }, id: "17841400000000000" });
    };
    const lines = [];
    const out = await ig.fetchInstagram({ ...window, log: (s) => lines.push(s), previous: [] });
    fakeFetch = null;
    assert.strictEqual(calls.length, 2);
    assert.ok(Array.isArray(out), JSON.stringify(out));
    const titles = out.map((e) => e.title).sort();
    assert.deepStrictEqual(titles, ["LATE NIGHT JAZZ", "Read By AI", "Warehouse Party"]);
    const jazz = out.find((e) => e.title === "LATE NIGHT JAZZ");
    assert.strictEqual(jazz.venue.name, "Test Venue");
    assert.strictEqual(jazz.price, 10);
    assert.strictEqual(new Date(jazz.startsAt).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Toronto" }), "20");
    assert.strictEqual(jazz.image, "https://cdn.example/rule.jpg");
    const promo = out.find((e) => e.title === "Warehouse Party");
    assert.strictEqual(promo.venue.name, "Test Venue", "a promoter's post placed at the known venue it names");
    assert.strictEqual(promo.image, "https://cdn.example/promo1.jpg");
    assert.strictEqual(out.find((e) => e.title === "Read By AI").image, "https://posters.example/ai.jpg");
    assert.ok(lines.some((l) => /1 read before by the AI, 3 read by the caption rules/.test(l)), lines.join("\n"));
    const saved = JSON.parse(fs.readFileSync(process.env.IG_EVENTS_FILE, "utf8"));
    assert.strictEqual(saved.auto, true);
    assert.strictEqual(saved.events.length, 3);
  });

  await test("instagram: a rejected token falls back to the saved file, and the token is never logged", async () => {
    const savedFile = { builtAt: new Date().toISOString(), events: [{ source: "Instagram", sourceId: "x:0", title: "Saved Earlier", startsAt: soon.toISOString(), venue: { name: "Test Venue", lat: 43.65, lng: -79.41 } }] };
    fs.writeFileSync(process.env.IG_EVENTS_FILE, JSON.stringify(savedFile));
    fs.writeFileSync(process.env.IG_RAW_FILE, "{}");
    fakeFetch = async (u) => response(400, { error: { message: `Error validating access token: Session has expired (token ${FAKE_TOKEN})`, type: "OAuthException", code: 190 } });
    const lines = [];
    const out = await ig.fetchInstagram({ ...window, log: (s) => lines.push(s) });
    fakeFetch = null;
    assert.deepStrictEqual(out.map((e) => e.title), ["Saved Earlier"]);
    assert.ok(lines.some((l) => /automated read failed .*using the last saved events/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /instagram @testvenue: 400 https:\/\/graph\.facebook\.com/.test(l)), "the failing request is logged (token masked or cut)");
    for (const l of lines) assert.ok(!l.includes(FAKE_TOKEN), `token in a log line: ${l}`);
    logs.push(...lines);
  });

  await test("instagram: without the secrets, the saved file is used and the setup guide is named", async () => {
    delete process.env.INSTAGRAM_USER_ID;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    const lines = [];
    const out = await ig.fetchInstagram({ ...window, log: (s) => lines.push(s) });
    assert.deepStrictEqual(out.map((e) => e.title), ["Saved Earlier"]);
    assert.ok(lines.some((l) => /README-instagram\.md/.test(l)));
    fs.unlinkSync(process.env.IG_EVENTS_FILE);
    const none = await ig.fetchInstagram({ ...window, log: (s) => lines.push(s) });
    assert.match(none.skipped, /No Instagram events saved yet/);
  });

  await test("instagram: redact masks the token anywhere, and every access_token value", () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = FAKE_TOKEN;
    const s = ig.redact(`400 https://graph.facebook.com/v21.0/1?fields=x&access_token=${FAKE_TOKEN} again ${FAKE_TOKEN} and access_token=other`);
    assert.ok(!s.includes(FAKE_TOKEN));
    assert.ok(!s.includes("other"));
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  await test("instagram rules: careful caption parsing", () => {
    const rules = require(path.join(ROOT, "import", "instagram-rules"));
    const t = "2026-11-20T15:00:00Z"; // a Friday
    assert.deepStrictEqual(rules.parseCaption("SOUTHPORT & FRIENDS!\nFri Nov 27 at The Garrison\nDoors 7pm, show 8:30pm\n$15 adv", t).map((e) => [e.title, e.start, e.price]), [["SOUTHPORT & FRIENDS!", "2026-11-27T20:30", 15]]);
    assert.strictEqual(rules.parseCaption("Comedy tonight! Free, 9pm", t)[0].start, "2026-11-20T21:00");
    assert.strictEqual(rules.parseCaption("Saturday: DJ night, 10pm", t)[0].start, "2026-11-21T22:00");
    assert.strictEqual(rules.parseCaption("Jan 9 winter market, tickets online", t)[0].start, "2027-01-09T19:00");
    assert.deepStrictEqual(rules.parseCaption("New menu drop, come try it", t), []);
    assert.deepStrictEqual(rules.parseCaption("Thank you to everyone who came out Nov 14!", t), []);
    assert.deepStrictEqual(rules.parseCaption("", t), []);
  });

  // ---------- 5. No secrets in any log ----------
  await test("no key or token in any log line", () => {
    for (const l of logs) {
      assert.ok(!l.includes(FAKE_KEY), `Supabase key in a log line: ${l}`);
      assert.ok(!l.includes(FAKE_TOKEN), `Instagram token in a log line: ${l}`);
    }
  });

  process.env.SUPABASE_URL = sbUrl;
  await fake.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const r of results) process.stdout.write(`${r}\n`);
  process.stdout.write(`\n${results.length - failures} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})();

void zlib;
