// Tests for search and personalisation: the importer's tagging rules, price parsing and source parsers (on fixtures),
// MMR variety, fair crew blending, taste weights learning and fading, weather skipping when unreachable, the Places
// vibe mapping and spending caps, and that private budgets never appear in explanations. No real network calls:
// every fetch is a fake, and a real Google, Open-Meteo or event-site request fails the test run.
//
//   node test/search.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sq-search-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", AI: "off", GOOGLE_MAPS_API_KEY: "test-key", EVENT_TAGS_FILE: path.join(tmp, "event-tags.json") });
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SECRET_KEY = "";
delete process.env.SIDEKICK_PLACES_OFF;
delete process.env.WEATHER_OFF;

// Any real request is a bug in a test: fail loudly
global.fetch = async (url) => { throw new Error(`Unexpected real fetch in test: ${url}`); };

const ROOT = path.join(__dirname, "..");
const EV = path.join(ROOT, "..", "events");
const N = require(path.join(EV, "lib", "normalize"));
const price = require(path.join(EV, "lib", "price"));
const tags = require(path.join(EV, "lib", "tags"));
const tm = require(path.join(EV, "sources", "ticketmaster"));
const eb = require(path.join(EV, "sources", "eventbrite"));
const tpl = require(path.join(EV, "sources", "tpl"));
const ics = require(path.join(EV, "sources", "ics"));
const ontario = require(path.join(EV, "sources", "ontario"));
const taste = require(path.join(ROOT, "lib", "search", "taste"));
const rank = require(path.join(ROOT, "lib", "search", "rank"));
const weather = require(path.join(ROOT, "lib", "search", "weather"));
const discover = require(path.join(ROOT, "lib", "search", "discover"));
const places = require(path.join(ROOT, "lib", "sidekick", "places"));
const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack.split("\n").slice(0, 3).join("\n      ")}`); }
}
const DAY = 86400000;
const ev = (id, vibes, extra = {}) => ({ id, title: `Event ${id}`, vibes, venue: { name: `Venue ${id}`, lat: 43.65, lng: -79.4 }, organizer: { name: `Org ${id}` }, startsAt: "2026-11-28T01:00:00Z", travel: { from: { union: { minutes: 20 } } }, area: "Downtown", price: 15, ...extra });
const raw = (title, description = "", extra = {}) => ({ source: "Test", sourceId: title, url: "https://example.test/e", title, startsAt: "2026-11-28T01:00:00Z", venue: { name: "The Garrison", address: "1197 Dundas St W", lat: 43.649, lng: -79.422, city: "Toronto" }, description, categories: [], ...extra });

(async () => {
  // ---------- 1. Tagging rules ----------
  await test("Tagging: \"meetup\" no longer makes a listing Games & social", async () => {
    assert.deepStrictEqual(N.vibesOf("Free English classes meetup for newcomers"), []);
    assert.deepStrictEqual(N.vibesOf("Annual general meeting of our meetup group"), []);
    assert(N.vibesOf("Board game night at the bar").includes("Games & social"));
    assert(N.vibesOf("Trivia and karaoke meetup").includes("Games & social"), "a real games word still counts");
  });
  await test("Tagging: Food & drink, Markets, Wellness and Climbing have rules", async () => {
    assert(N.vibesOf("Ramen pop-up dinner with natural wine").includes("Food & drink"));
    assert(N.vibesOf("Holiday night market with 60 vendors").includes("Markets"));
    assert(N.vibesOf("Sunday sound bath and yoga").includes("Wellness"));
    assert(N.vibesOf("Beginner bouldering social").includes("Climbing"));
    assert.deepStrictEqual(N.vibesOf("Rock climbing intro"), ["Climbing"], "rock climbing is climbing, not rock music");
    assert(!N.vibesOf("Digital marketing workshop").includes("Markets"), "marketing isn't a market");
  });
  await test("Tagging: a vibe named in the title comes first", async () => {
    const v = N.vibesOf("Jazz trio with a three-course dinner and art on the walls", "Supper club: three courses");
    assert.strictEqual(v[0], "Food & drink");
    assert(v.length <= 3);
  });
  await test("Tagging: retag keeps AI and host vibes, and fixes old keyword tags", async () => {
    const old = { id: 1, title: "Free English Classes", description: "Join our meetup", tags: ["meetup", "games & social"], vibes: ["Games & social"], scene: "Active & social" };
    const fixed = N.retag(old);
    assert.deepStrictEqual(fixed.vibes, []);
    assert.strictEqual(fixed.scene, "Other");
    assert(!fixed.tags.includes("games & social"));
    const ai = { ...old, tagSource: "ai" };
    assert.strictEqual(N.retag(ai), ai, "AI tags are kept");
  });
  await test("Filters: Beyond Toronto and appointment-style listings are dropped", async () => {
    assert.strictEqual(N.dropReason({ title: "Gig", area: "Beyond Toronto", venue: { name: "X" } }), "beyond-toronto");
    assert.strictEqual(N.dropReason({ title: "Leaside - Samsung Home Theatre Appointment Based Sales Consultation", area: "Midtown", venue: { name: "Best Buy" } }), "appointment");
    assert.strictEqual(N.dropReason({ title: "Coffee masterclass", area: "Midtown", venue: { name: "Best Buy" } }), "appointment");
    assert.strictEqual(N.dropReason({ title: "Jazz at the Rex", area: "Downtown", venue: { name: "The Rex" } }), null);
    const e = N.toEvent(raw("Out of town gig", "", { venue: { name: "Hall", lat: 43.59, lng: -79.64, city: "Mississauga" } }));
    assert(e && !N.keepListing(e));
  });
  await test("AI tags: only the fixed vocabulary is kept, and saved tags apply only to an unchanged listing", async () => {
    assert.strictEqual(tags.validate({ vibes: ["Poetry slam", "Nonsense"] }), null);
    assert.deepStrictEqual(tags.validate({ vibes: ["Jazz", "Jazz", "Food & drink", "Live music", "Comedy"], format: "show", setting: "small room" }), { vibes: ["Jazz", "Food & drink", "Live music"], format: "show", setting: "small room" });
    assert.strictEqual(tags.validate({ vibes: ["Jazz"], format: "rave", setting: "moon" }).format, null);
    const e = N.toEvent(raw("Late jazz set", "A trio in the back room"));
    const saved = { tags: {} };
    const n = tags.record(saved, [e], { tags: [{ id: e.id, vibes: ["Jazz", "Live music"], format: "show", setting: "small room" }, { id: 999, vibes: ["Comedy"] }] });
    assert.strictEqual(n, 1, "answers about listings that weren't asked are ignored");
    const tagged = tags.apply(e, saved);
    assert.strictEqual(tagged.tagSource, "ai");
    assert.deepStrictEqual(tagged.vibes, ["Jazz", "Live music"]);
    assert.strictEqual(tagged.setting, "small room");
    assert.strictEqual(tags.needsTag(e, saved), false);
    const changed = { ...e, description: "Now a DJ night" };
    assert.strictEqual(tags.apply(changed, saved), changed, "a changed listing keeps keyword tags until it's read again");
    assert.strictEqual(tags.needsTag(changed, saved), true);
    assert(/exact list/.test(tags.prompt([e])) && tags.prompt([e]).includes("Wellness"));
  });
  await test("AI tags: the hand-run step refuses to run inside GitHub Actions", async () => {
    const { execFileSync } = require("child_process");
    let out = "";
    try { execFileSync(process.execPath, [path.join(EV, "tag.js")], { env: { ...process.env, GITHUB_ACTIONS: "true" }, stdio: "pipe" }); } catch (err) { out = String(err.stderr); }
    assert(/hand-run step/.test(out), out);
  });

  // ---------- 2. Prices ----------
  await test("Prices: parsing the shapes sites use", async () => {
    assert.strictEqual(price.parsePrice("CA$25.00"), 25);
    assert.strictEqual(price.parsePrice("$1,250"), 1250);
    assert.strictEqual(price.parsePrice("Free"), 0);
    assert.strictEqual(price.parsePrice("TBA"), null);
    assert.strictEqual(price.parsePrice(-3), null);
    assert.strictEqual(price.parsePrice({ currency: "CAD", major_value: "15.00", value: 1500 }), 15);
    assert.strictEqual(price.parsePrice({ value: 1500 }), 15, "Eventbrite's value is in cents");
  });
  await test("Prices: schema.org offers, nested and as strings", async () => {
    assert.deepStrictEqual(price.offersPrice([{ "@type": "AggregateOffer", lowPrice: "CA$25.00", highPrice: "40", priceCurrency: "cad" }]), { low: 25, high: 40, currency: "CAD" });
    assert.deepStrictEqual(price.offersPrice({ "@type": "AggregateOffer", offers: [{ price: "30" }, { price: "18.5" }] }), { low: 18.5, high: 30, currency: null });
    assert.deepStrictEqual(price.offersPrice({ isAccessibleForFree: true }), { low: 0, high: 0, currency: null });
    assert.strictEqual(price.offersPrice([]), null);
    assert.strictEqual(price.toCad({ low: 10, high: 10, currency: "USD" }).priceNote, "About $14 (converted)");
  });
  await test("Prices: Ticketmaster price ranges, standard first", async () => {
    assert.deepStrictEqual(price.ticketmasterPrice({ priceRanges: [{ type: "standard including fees", currency: "CAD", min: 45.5, max: 89 }, { type: "platinum", min: 250, max: 400 }] }), { low: 45.5, high: 89, currency: "CAD" });
    assert.strictEqual(price.ticketmasterPrice({}), null);
    const e = { id: "G5v", name: "Indie band", url: "https://tm.test/e", dates: { start: { dateTime: "2026-11-28T01:00:00Z" } }, _embedded: { venues: [{ name: "History", location: { latitude: "43.665", longitude: "-79.327" }, city: { name: "Toronto" } }] }, classifications: [{ segment: { name: "Music" } }] };
    const r = tm.toRaw(e);
    assert.strictEqual(r.price, null);
    const asked = [];
    const out = await tm.fillPrices([r], { getDetail: async (id) => { asked.push(id); return { priceRanges: [{ type: "standard", min: 39, max: 59, currency: "CAD" }] }; } });
    assert.deepStrictEqual(asked, ["G5v"]);
    assert.deepStrictEqual(out, { asked: 1, found: 1 });
    assert.strictEqual(r.price, 39);
    assert.strictEqual(tm.toRaw({ ...e, classifications: [{ segment: { name: "Sports" } }] }), null, "sports are left out");
  });
  await test("Prices: Eventbrite listing cards and event pages", async () => {
    assert.deepStrictEqual(eb.listingPrice({ ticket_availability: { minimum_ticket_price: { currency: "CAD", major_value: "15.00" }, maximum_ticket_price: { major_value: "30.00" } } }), { low: 15, high: 30, currency: "CAD" });
    assert.deepStrictEqual(eb.listingPrice({ ticket_availability: { is_free: true } }), { low: 0, high: 0, currency: null });
    assert.strictEqual(eb.listingPrice({}), null);
    const page = `<script type="application/ld+json">{"@type":"SocialEvent","name":"Night","organizer":{"name":"Collective"},"offers":[{"@type":"AggregateOffer","lowPrice":"CA$20.00","highPrice":"CA$35.00","priceCurrency":"CAD"}]}</script>`;
    assert.deepStrictEqual(eb.eventPageInfo(page).price, { low: 20, high: 35, currency: "CAD" });
    assert.strictEqual(eb.eventPageInfo(page).organizer, "Collective");
    assert.deepStrictEqual(eb.eventPageInfo(`<script>window.__SERVER_DATA__ = {"event":{"is_free":true}}</script>`).price, { low: 0, high: 0, currency: null });
  });
  await test("Prices: a listing that says \"free admission\" is free; \"free before 11\" is not", async () => {
    assert.strictEqual(price.saysFree("Free admission, all ages"), true);
    assert.strictEqual(price.saysFree("Ladies free entry before 11pm"), false);
    assert.strictEqual(price.saysFree("Free for members only"), false);
    const e = N.toEvent(raw("Gallery opening", "Free admission. Drinks for sale."));
    assert.strictEqual(e.price, 0);
    assert.strictEqual(N.toEvent(raw("Gallery opening", "Tickets at the door.")).price, null);
  });

  // ---------- 3. Sources on fixtures ----------
  await test("Toronto Public Library: both spellings of the feed become listings, with reasons for what's left out", async () => {
    const start = new Date("2026-11-24T00:00:00Z");
    const end = new Date("2027-02-20T00:00:00Z");
    const branches = tpl.branchRows(JSON.stringify([{ BranchName: "Fort York", Address: "190 Fort York Blvd", Lat: "43.6386", Long: "-79.4006" }, { "Branch Name": "Toronto Reference Library", Address: "789 Yonge St", Latitude: 43.6719, Longitude: -79.3867 }]));
    const pascal = tpl.slim(JSON.stringify([{ EventID: "1", Title: "Knitting circle", StartTime: "2026-11-26 18:30:00", EndTime: "2026-11-26 20:00:00", LocationName: "Fort York", Audiences: "Adults", EventTypes: "Arts and Crafts", Status: "SCHEDULED" }, { EventID: "2", Title: "Storytime", StartTime: "2026-11-26T10:30", LocationName: "Fort York", Audiences: "Children", EventTypes: "Stories" }]));
    const lower = tpl.slim(JSON.stringify({ events: [{ eventid: "3", title: "Author talk", startdate: "2026-12-02", starttime: "7:00 pm", library: "Toronto Reference", agegroup1: "Adult", eventtype1: "Author Visits" }, { eventid: "4", title: "Film club", startdate: "2026-12-03", starttime: "19:00", library: "Nowhere Branch", agegroup1: "Adults", eventtype1: "Film" }] }));
    const { listings, why } = tpl.toListings([...pascal, ...lower], branches, { start, end });
    assert.deepStrictEqual(listings.map((l) => l.title).sort(), ["Author talk", "Knitting circle"]);
    assert.strictEqual(why.notForAdults, 1);
    assert.strictEqual(why.noBranch, 1);
    const knit = listings.find((l) => l.title === "Knitting circle");
    assert.strictEqual(knit.startsAt, "2026-11-26T23:30:00.000Z");
    assert.strictEqual(knit.price, 0);
    const e = N.toEvent(knit);
    assert(e && N.keepListing(e) && e.vibes.includes("Art & making"), "a TPL program reaches the app as a tagged Toronto listing");
  });
  await test("Venue calendars (iCal): events are read with the right times, all-day and cancelled ones skipped", async () => {
    const text = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nSUMMARY:Jazz jam\\, every Thursday\r\nDTSTART;TZID=America/Toronto:20261126T210000\r\nDTEND;TZID=America/Toronto:20261126T235900\r\nDESCRIPTION:House trio\\nall welcome\r\nURL:https://venue.test/jam\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:a2\r\nSUMMARY:Closed for a private\r\n  event\r\nDTSTART;VALUE=DATE:20261127\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:a3\r\nSUMMARY:Cancelled show\r\nSTATUS:CANCELLED\r\nDTSTART:20261128T020000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const parsed = ics.parseICS(text);
    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].summary, "Jazz jam, every Thursday");
    assert.strictEqual(parsed[0].start, "2026-11-27T02:00:00.000Z");
    assert.strictEqual(parsed[1].summary, "Closed for a private event", "folded lines are joined");
    const feed = { name: "Test venue", url: "https://venue.test/cal.ics", venue: { name: "Test venue", lat: 43.65, lng: -79.4 } };
    const out = ics.toRaw(feed, parsed, { start: new Date("2026-11-24"), end: new Date("2027-01-01") });
    assert.deepStrictEqual(out.map((r) => r.title), ["Jazz jam, every Thursday"]);
  });
  await test("Ontario open data (off by default): CSV rows with a Toronto venue and a start time only", async () => {
    const rows = ontario.parseCSV('Event Name,Municipality,Start Date,Start Time,Venue,Address\n"Winter Lights, Night 1",Toronto,2026-12-05,18:00,Distillery District,55 Mill St\nRiver Fest,Ottawa,2026-12-06,12:00,Park,\nAll-day fair,Toronto,2026-12-07,,Hall,\n');
    assert.strictEqual(rows.length, 3);
    const { listings, why } = await ontario.toListings(rows, { start: new Date("2026-11-24"), end: new Date("2027-02-01"), geocode: async () => ({ lat: 43.6503, lng: -79.3596, address: "55 Mill St" }) });
    assert.deepStrictEqual(listings.map((l) => l.title), ["Winter Lights, Night 1"]);
    assert.deepStrictEqual([why.notToronto, why.noTime], [1, 1]);
    assert.deepStrictEqual(await ontario.fetchOntario({ start: new Date(), end: new Date(), max: 10, log: () => {} }), { skipped: "Off (set ONTARIO_EVENTS=1 after checking the live file's columns)" });
  });

  // ---------- 4. Taste weights ----------
  await test("Taste: onboarding seeds the weights; saves, accepts and ratings move them", async () => {
    const u = { vibes: ["Jazz", "Comedy"] };
    const t0 = Date.parse("2026-11-01T00:00:00Z");
    assert.deepStrictEqual(taste.weights(u, t0).vibes, { Jazz: 3, Comedy: 3 });
    taste.record(u, "save", ev(1, ["Food & drink"]), t0);
    taste.record(u, "accept", ev(2, ["Jazz", "Live music"]), t0);
    taste.record(u, "love", ev(3, ["Markets"]), t0);
    const w = taste.weights(u, t0).vibes;
    assert.strictEqual(w["Food & drink"], 2);
    assert.strictEqual(w.Jazz, 4.5);
    assert.strictEqual(w["Live music"], 1.5);
    assert.strictEqual(w.Markets, 4);
    assert(taste.fit(taste.weights(u, t0), ev(4, ["Jazz"])).fit > taste.fit(taste.weights(u, t0), ev(5, ["Electronic"])).fit);
  });
  await test("Taste: nudges fade (half-life 30 days); onboarding doesn't", async () => {
    const u = { vibes: ["Jazz"] };
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    taste.record(u, "more", ev(1, ["Climbing"]), t0);
    assert.strictEqual(taste.weights(u, t0).vibes.Climbing, 3);
    assert.strictEqual(taste.weights(u, t0 + 30 * DAY).vibes.Climbing, 1.5);
    assert(Math.abs(taste.weights(u, t0 + 90 * DAY).vibes.Climbing - 0.375) < 0.01);
    assert.strictEqual(taste.weights(u, t0 + 90 * DAY).vibes.Jazz, 3);
  });
  await test("Taste: \"not for me\" counts against the vibes and the organizer, so their other nights fall too", async () => {
    const u = { vibes: ["Live music"] };
    const t = Date.now();
    const bad = ev(1, ["Electronic"], { organizer: { name: "Loud Promotions" } });
    taste.record(u, "notForMe", bad, t);
    taste.record(u, "notForMe", ev(2, ["Electronic"], { organizer: { name: "Loud Promotions" } }), t);
    const w = taste.weights(u, t);
    assert(w.vibes.Electronic < 0 && w.organizers["Loud Promotions"] === -6);
    const sameOrg = taste.fit(w, ev(3, ["Live music"], { organizer: { name: "Loud Promotions" } }));
    assert.strictEqual(sameOrg.strongDislike, true, "the organizer's other nights count as a strong dislike");
    assert(taste.fit(w, ev(4, ["Live music"])).fit > 0.5);
    assert(taste.undo(u, "notForMe", bad));
    assert.strictEqual(taste.weights(u, t).organizers["Loud Promotions"], -3);
  });
  await test("Taste: Profile edits replace a vibe's weight, and 0 takes it out of your taste", async () => {
    const u = { vibes: ["Jazz", "Comedy"] };
    taste.record(u, "accept", ev(1, ["Comedy"]));
    taste.edit(u, "Comedy", 0);
    taste.edit(u, "Wellness", 4);
    const w = taste.weights(u).vibes;
    assert(!("Comedy" in w), "excluded even after an accept");
    assert.strictEqual(w.Wellness, 4);
    assert.strictEqual(taste.edit(u, "Not a vibe", 3), false);
    taste.edit(u, "Comedy", null);
    assert(taste.weights(u).vibes.Comedy > 3, "back to automatic");
    const sum = taste.summary(u);
    assert(sum.rows.some((r) => r.vibe === "Wellness" && r.edited === 4));
  });

  // ---------- 5. Variety ----------
  await test("MMR: the best match stays first, and near-duplicates move down", async () => {
    const list = [ev(1, ["Live music", "Indie gigs"]), ev(2, ["Live music", "Indie gigs"]), ev(3, ["Live music"]), ev(4, ["Comedy"])];
    const score = { 1: 10, 2: 9.8, 3: 9.5, 4: 9.2 };
    const out = rank.mmr(list, (e) => score[e.id], { lambda: 0.6, range: 2 });
    assert.strictEqual(out[0].id, 1);
    assert.strictEqual(out[1].id, 4, "the comedy show comes before a second near-identical gig");
    assert.strictEqual(out.length, 4);
    assert.deepStrictEqual(rank.mmr(list, (e) => score[e.id], { lambda: 1 }).map((e) => e.id), [1, 2, 3, 4], "lambda 1 is plain relevance");
    assert.strictEqual(rank.similarity(ev(5, ["Jazz"], { venue: { name: "The Rex" } }), ev(6, ["Comedy"], { venue: { name: "The Rex" } })), 1, "same venue counts as the same");
  });
  await test("Seen penalty: shown and ignored things drop a little, and fade over a week", async () => {
    const shown = {};
    const t = Date.now();
    rank.noteShown(shown, [1, 2], t);
    rank.noteShown(shown, [1], t);
    assert.strictEqual(rank.seenPenalty(1, shown, t), -1.5);
    assert.strictEqual(rank.seenPenalty(2, shown, t), -0.75);
    assert.strictEqual(rank.seenPenalty(3, shown, t), 0);
    assert(Math.abs(rank.seenPenalty(1, shown, t + 7 * DAY) + 0.75) < 1e-9);
  });
  await test("Sidekick: the two picks aren't near-duplicates when something different fits", async () => {
    const night = "2026-11-28";
    const events = [
      ev(1, ["Live music", "Indie gigs"], { startsAt: "2026-11-29T01:00:00Z" }),
      ev(2, ["Live music", "Indie gigs"], { startsAt: "2026-11-29T01:30:00Z" }),
      ev(3, ["Live music"], { startsAt: "2026-11-29T01:00:00Z" }),
      ev(4, ["Comedy"], { startsAt: "2026-11-29T01:00:00Z" }),
    ];
    const room = { people: [{ id: "a", name: "Asia" }, { id: "b", name: "Ben" }], nights: [night], places: [], answers: { a: { night: { value: [night] }, vibe: { value: ["music", "comedy"] }, budget: { value: "any" } }, b: { night: { value: [night] }, vibe: { value: ["music", "comedy"] }, budget: { value: "any" } } } };
    const top = P.ranked(events, room, P.facts(room)).slice(0, 2).map((e) => e.id);
    assert.strictEqual(top[0], 1);
    assert.strictEqual(top[1], 4);
  });

  // ---------- 6. Fair crew blending ----------
  await test("Crew blending: average without misery, and the least-served member gets their turn", async () => {
    const members = [{ id: "a", name: "Asia", fit: (e) => ({ fit: e.vibes.includes("Jazz") ? 1 : 0, strongDislike: false }) }, { id: "b", name: "Ben", fit: (e) => ({ fit: e.vibes.includes("Comedy") ? 1 : 0, strongDislike: e.vibes.includes("Electronic") }) }];
    assert.strictEqual(rank.blend(ev(1, ["Jazz", "Comedy"]), members).avg, 1);
    assert.strictEqual(rank.blend(ev(2, ["Jazz", "Electronic"]), members).misery, true);
    const least = rank.leastServed(members, [{ fits: { a: 1, b: 0 } }]);
    assert.strictEqual(least.id, "b");
    // Sidekick: a jazz fan and a comedy fan; the top-scored listings are all jazz, but pick two serves the comedy fan
    const night = "2026-11-28";
    const room = { people: [{ id: "a", name: "Asia" }, { id: "b", name: "Ben" }], nights: [night], places: [], answers: { a: { night: { value: [night] }, vibe: { value: ["music"] }, budget: { value: "any" } }, b: { night: { value: [night] }, vibe: { value: ["comedy"] }, budget: { value: "any" } } } };
    const events = [1, 2, 3, 4, 5].map((i) => ev(i, ["Jazz"], { startsAt: "2026-11-29T01:00:00Z" })).concat([ev(9, ["Comedy"], { startsAt: "2026-11-29T01:00:00Z", travel: { from: { union: { minutes: 45 } } } })]);
    const top = P.ranked(events, room, P.facts(room)).slice(0, 2);
    assert(top.some((e) => e.vibes.includes("Comedy")), `every member gets a pick: ${top.map((e) => e.vibes)}`);
  });
  await test("Crew blending: who it's for and the crew match % come from names and fits only", async () => {
    const members = [{ id: "0", name: "You" }, { id: "1", name: "Maya" }, { id: "2", name: "Kai" }];
    assert.strictEqual(rank.whoFor({ 0: 0.3, 1: 0.9, 2: 0.7 }, members, "0"), "Maya + Kai love this; You would like it");
    assert.strictEqual(rank.whoFor({ 0: 0.9, 1: 0.9, 2: 0.9 }, members, "0"), "Everyone loves this");
    assert(rank.crewMatch({ 0: 1, 1: 1, 2: 0 }) < rank.crewMatch({ 0: 0.7, 1: 0.7, 2: 0.6 }), "a crew match drops when someone is left out");
    const out = discover.fairOrder([{ name: "Maya", weights: discover.weightsFromVibes(["Jazz"]) }, { name: "Kai", weights: discover.weightsFromVibes(["Comedy"]) }], [ev(1, ["Jazz"]), ev(2, ["Jazz"]), ev(3, ["Comedy"])], { n: 2 });
    assert.deepStrictEqual(out.map((e) => e.id).sort(), [1, 3]);
  });
  await test("Privacy: budgets never appear in who-it's-for, crew lines or context reasons", async () => {
    const people = [{ name: "You", isMe: true, weights: discover.weightsFromVibes(["Jazz"]), budget: 10 }, { name: "Maya", weights: discover.weightsFromVibes(["Jazz", "Food & drink"]), budget: 20 }];
    const matches = discover.crewView(people, [{ id: 1, reason: "" }, { id: 2, reason: "" }], new Map([[1, ev(1, ["Jazz"], { price: 18 })], [2, ev(2, ["Food & drink"], { price: 9 })]]));
    const text = JSON.stringify(matches) + JSON.stringify(rank.contextBonus(ev(3, ["Jazz"]), { crewSize: 2, whenOut: ["Evenings"], at: { lat: 43.65, lng: -79.4 } }));
    assert(!/\$|budget|under \d|10|20\b/i.test(text.replace(/"id":\d+|"crewMatch":\d+/g, "")), text);
    assert(matches.every((m) => typeof m.who === "string" && Number.isInteger(m.crewMatch)));
    // Sidekick's group-facing budget line never names anyone
    const room = { people: [{ id: "a", name: "Asia" }, { id: "b", name: "Ben" }], nights: ["2026-11-28"], answers: { a: { budget: { value: "20" } }, b: { budget: { value: "50" } } } };
    const label = P.budgetLabel(P.facts(room), room);
    assert(!/Asia|Ben|\$20/.test(label), label);
  });

  // ---------- 7. Context and weather ----------
  await test("Weather: an unreachable Open-Meteo is skipped, not an error, and isn't asked again for 10 minutes", async () => {
    weather._reset();
    let calls = 0;
    const down = async () => { calls++; throw new Error("getaddrinfo ENOTFOUND api.open-meteo.com"); };
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.strictEqual(await weather.refresh({ fetchImpl: down, now: 1000 }), false);
      assert.strictEqual(weather.at("2026-11-28T01:00:00Z"), null);
      assert.strictEqual(await weather.refresh({ fetchImpl: down, now: 1000 + 60000 }), false);
      assert.strictEqual(calls, 1, "no retry within 10 minutes");
      const slow = () => new Promise((resolve, reject) => setTimeout(() => reject(new Error("aborted")), 50));
      weather._reset();
      assert.strictEqual(await weather.refresh({ fetchImpl: slow, now: 5000 }), false);
    } finally { console.warn = warn; }
    // Ranking with no weather is the same as before
    const e = ev(1, ["Outdoors"], { title: "Ravine walk" });
    assert.strictEqual(rank.contextBonus(e, { weather: weather.at }).bonus, 0);
  });
  await test("Weather: fetched at most once an hour, and rain puts indoor picks first with a reason", async () => {
    weather._reset();
    let calls = 0;
    const key = weather.localHourKey("2026-11-29T01:00:00Z");
    const ok = async () => { calls++; return { ok: true, json: async () => ({ hourly: { time: [key.replace("T", "T") + ":00"], temperature_2m: [4], precipitation_probability: [80], precipitation: [1.2], weather_code: [63] } }) }; };
    assert.strictEqual(await weather.refresh({ fetchImpl: ok, now: 0 }), true);
    assert.strictEqual(await weather.refresh({ fetchImpl: ok, now: 30 * 60000 }), true);
    assert.strictEqual(calls, 1, "cached for the hour");
    await weather.refresh({ fetchImpl: ok, now: 61 * 60000 });
    assert.strictEqual(calls, 2);
    const outdoor = rank.contextBonus(ev(1, ["Outdoors"], { title: "Night market in the park", startsAt: "2026-11-29T01:00:00Z" }), { weather: weather.at });
    const indoor = rank.contextBonus(ev(2, ["Jazz"], { title: "Jazz at the Rex", venue: { name: "The Rex Hotel Jazz & Blues Bar" }, startsAt: "2026-11-29T01:00:00Z" }), { weather: weather.at });
    assert(outdoor.bonus < 0 && indoor.bonus > 0);
    assert.match(outdoor.why[0], /Rain is forecast, so indoor picks first/);
    weather._reset();
  });
  await test("Context: distance, crew size and time of day are small bonuses, each with a why", async () => {
    const near = rank.contextBonus(ev(1, ["Jazz"], { title: "Listening session", venue: { name: "Studio", lat: 43.651, lng: -79.401 } }), { at: { lat: 43.65, lng: -79.4 }, crewSize: 2, whenOut: ["Evenings", "Late nights"] });
    assert(near.bonus > 0 && near.bonus <= 5);
    assert(near.why.includes("near you") && near.why.includes("good for two"));
    const big = rank.contextBonus(ev(2, ["Live music"], { title: "Arena concert" }), { crewSize: 6 });
    assert.deepStrictEqual(big.why, ["room for a big crew"]);
    assert.strictEqual(rank.settingOf({ title: "Ravine walk", vibes: ["Outdoors"] }), "outdoors");
    assert.strictEqual(rank.settingOf({ title: "Jazz night", venue: { name: "The Rex Bar" }, vibes: ["Jazz"] }), "indoors");
    assert.strictEqual(rank.settingOf({ title: "X", setting: "outdoors" }), "outdoors");
  });

  // ---------- 8. Places: mapping and caps ----------
  await test("Places: every one of the app's 21 vibes maps to place types or a search", async () => {
    for (const v of taste.VIBES) {
      const plan = places.planFor(v);
      assert(plan && (plan.query || (plan.types && plan.types.length)), `no place search for ${v}`);
      assert(plan.tags.includes(v) || v === "Tech & coding", `results for ${v} carry its vibe`);
    }
    assert.strictEqual(places.planFor("music").query, "live music bar", "Sidekick's broad vibes keep their queries");
  });
  await test("Places: the map uses Pro fields (no rating, price or hours) on its own meter; planning calls keep Enterprise", async () => {
    usage._reset();
    const reqs = [];
    const fake = async (url, opts) => {
      reqs.push({ url, mask: opts.headers["x-goog-fieldmask"], body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ places: [{ id: "p1", displayName: { text: "Arcade" }, location: { latitude: 43.65, longitude: -79.4 }, types: ["video_arcade"] }] }) };
    };
    const pro = await places.search("Games & social", { fetchImpl: fake, tier: "pro" });
    assert.strictEqual(pro.places.length, 1);
    assert(reqs[0].url.endsWith(":searchNearby") && reqs[0].body.includedTypes.includes("bowling_alley"), "a vibe with exact types uses Nearby Search");
    assert(!/rating|regularOpeningHours|priceLevel|priceRange/.test(reqs[0].mask), reqs[0].mask);
    await places.search("music", { fetchImpl: fake });
    assert(reqs[1].url.endsWith(":searchText") && /regularOpeningHours/.test(reqs[1].mask), "planning calls still ask for hours");
    const st = await usage.status();
    assert.strictEqual(st.places_search_pro.used.month, 1);
    assert.strictEqual(st.places_text_search.used.month, 1);
    assert.strictEqual(st.places_search_pro.limits.month, 4000, "80% of the Pro allowance");
    assert.deepStrictEqual(places.seenIds("Games & social", undefined), ["p1"], "place IDs are the only thing kept");
  });
  await test("Places: Google rejecting a type falls back to a text search; caps stop searching", async () => {
    usage._reset();
    const reqs = [];
    const fake = async (url, opts) => {
      reqs.push(url);
      if (url.endsWith(":searchNearby")) return { ok: false, status: 400, text: async () => "INVALID_ARGUMENT: unsupported type" };
      return { ok: true, json: async () => ({ places: [] }) };
    };
    const err = console.error;
    console.error = () => {};
    try { await places.search("Dance", { fetchImpl: fake, tier: "pro" }); } finally { console.error = err; }
    assert.deepStrictEqual(reqs.map((u) => u.split(":").pop()), ["searchNearby", "searchText"]);
    process.env.GOOGLE_PLACES_PRO_DAILY_MAX = "2";
    const out = await places.search("Jazz", { fetchImpl: fake, tier: "pro" });
    assert.strictEqual(out.capped, "daily limit");
    assert.strictEqual(reqs.length, 2, "no request past the cap");
    delete process.env.GOOGLE_PLACES_PRO_DAILY_MAX;
  });

  // ---------- 9. Wildcard and data age ----------
  await test("Wildcard: Thompson sampling tries untried vibes, and stays outside the person's usual", async () => {
    const cands = [ev(1, ["Jazz"]), ev(2, ["Climbing"]), ev(3, ["Markets"]), ev(4, ["Wellness"])];
    const picks = {};
    for (let s = 1; s <= 200; s++) {
      const w = rank.wildcard(cands, { avoid: ["Jazz"], counts: { Markets: { shown: 40, accepted: 0 } }, rand: rank.rng(s) });
      picks[w.vibe] = (picks[w.vibe] || 0) + 1;
      assert.notStrictEqual(w.vibe, "Jazz");
      assert.match(w.why, /^A wildcard/);
    }
    assert((picks.Markets || 0) < 10, `a vibe shown 40 times and never taken is rarely drawn: ${JSON.stringify(picks)}`);
    assert(picks.Climbing > 40 && picks.Wellness > 40);
  });
  await test("Data age: more than 8 days old is flagged for the server log and the admin side", async () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    assert.strictEqual(discover.dataHealth("2026-11-23T09:00:00Z", now).stale, false);
    const old = discover.dataHealth("2026-10-15T04:29:11Z", now);
    assert.deepStrictEqual([old.days, old.stale], [40, true]);
    assert.match(discover.staleLine(old), /40 days old/);
    assert.strictEqual(discover.staleLine(discover.dataHealth("sample", now)), null);
  });

  console.log(failures ? `\n${failures} failed` : "\nAll search tests passed");
  process.exit(failures ? 1 : 0);
})();
