// Tests for knowing what an event is like, and for the new sources that find the nights the big sites miss:
//  - qualities: the rules tag the premise ("phones down" → Phone-free), the crowd, the rules and the feel, from the
//    title, description, full text and venue; a search names qualities ("offline no-phone dance party");
//    a listing that says almost nothing is flagged "thin", never guessed
//  - Eventbrite: the event page's full write-up (structuredContent) is read, not only its one-line summary
//  - TOREVENT, Showpass, YOHOMO, venue websites (WordPress calendars, schema.org pages): their formats map to listings
// Fixtures are small made-up pages in each site's shape; nothing here makes a real request.
//
//   node test/vibe-sources.js        (from events/)

const path = require("path");
const assert = require("assert");

process.env.AI = "off";
process.env.SUPABASE_URL = process.env.SUPABASE_SECRET_KEY = "";
global.fetch = async (url) => { throw new Error(`Unexpected real fetch in test: ${url}`); };

const ROOT = path.join(__dirname, "..");
const Q = require(path.join(ROOT, "lib", "qualities"));
const { toEvent } = require(path.join(ROOT, "lib", "normalize"));
const { eventPageInfo } = require(path.join(ROOT, "sources", "eventbrite"));
const torevent = require(path.join(ROOT, "sources", "torevent"));
const showpass = require(path.join(ROOT, "sources", "showpass"));
const yohomo = require(path.join(ROOT, "sources", "yohomo"));
const wp = require(path.join(ROOT, "sources", "wordpress"));
const pages = require(path.join(ROOT, "sources", "venue-pages"));
const { venueIndex } = require(path.join(ROOT, "sources", "known-venues"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); } catch (err) { failed++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}

const ev = (o) => ({ title: "", description: "", tags: [], venue: { name: "Somewhere" }, startsAt: "2026-12-04T01:00:00.000Z", ...o });

test("qualities: a phones-down club night gets Phone-free, Dress code, 19+, DJ sets, Late night and Dance floor", () => {
  const e = ev({ title: "Static Night", description: "buzz", startsAt: "2026-12-04T03:00:00.000Z",
    details: "// LINEUP\nAAA × BBB\n// GOOD TO KNOW\nDress code: black\nPhones down is encouraged. Live it in person.\n[19+ with valid government ID]" });
  const q = Q.qualitiesOf(e);
  for (const l of ["Phone-free", "Dress code", "19+", "DJ sets", "Late night", "Dance floor"]) assert(q.includes(l), `${l} in ${q}`);
});

test("qualities: a night at a queer venue is queer even when the listing doesn't say so; drag implies queer", () => {
  assert(Q.qualitiesOf(ev({ title: "Retro Dance Party", venue: { name: "The Black Eagle", address: "457 Church St" } })).includes("Queer & 2SLGBTQ+"));
  const d = Q.qualitiesOf(ev({ title: "Sunday Drag Brunch", description: "Our queens serve looks." }));
  assert(d.includes("Drag") && d.includes("Queer & 2SLGBTQ+"), d);
});

test("qualities: figures of speech and placeholders don't count (put your phone down, Regent Park Blvd, an 11:59 PM start)", () => {
  assert(!Q.qualitiesOf(ev({ description: "A good reason to put your phone down and meet people." })).includes("Phone-free"));
  assert(!Q.qualitiesOf(ev({ description: "63 Regent Park Boulevard, Toronto" })).includes("Outdoors"));
  assert(!Q.qualitiesOf(ev({ title: "Arena tour", startsAt: "2026-12-19T04:59:00.000Z" })).includes("Late night"));
});

test("qualities: vendor calls are labelled For vendors (they aren't nights out)", () => {
  assert(Q.qualitiesOf(ev({ title: "CHRISTMAS POP-UP MARKET - CALLING ALL VENDORS" })).includes("For vendors"));
});

test("qualities: searches name qualities, and their words make the event findable", () => {
  const asked = Q.askedQualities("offline no-phone dance party");
  assert(asked.includes("Phone-free") && asked.includes("Dance floor"), asked);
  assert(Q.askedQualities("queer vogue night").includes("Ballroom & vogue"));
  assert(/offline/.test(Q.wordsFor(["Phone-free"])));
});

test("info: a title-and-slogan listing is thin; one that explains itself is enough; the AI premise counts", () => {
  assert.strictEqual(Q.infoOf(ev({ description: "buzzzzzz" })), "thin");
  assert.strictEqual(Q.infoOf(ev({ description: "A monthly vogue night with open categories, a cash prize, commentators and the best DJs in the ballroom scene." })), "enough");
  assert.strictEqual(Q.describe(ev({ description: "buzz", premise: "A phones-down club night." })).info, "ai");
});

test("eventbrite: the full write-up comes from structuredContent, beyond the one-line summary", () => {
  const html = `<script type="application/ld+json">{"@type":"SocialEvent","name":"X","description":"buzz","organizer":{"name":"@ORG"}}</script>
    <script>{"structuredContent":{"modules":[{"type":"text","text":"\\u003cp\\u003eYOU LOST SIGNAL.\\u003c/p\\u003e\\u003cp\\u003ePhones down is encouraged.\\u003c/p\\u003e"}]}}</script>`;
  const i = eventPageInfo(html);
  assert.strictEqual(i.description, "buzz");
  assert(/Phones down is encouraged/.test(i.details), i.details);
  const e = toEvent({ source: "Eventbrite", sourceId: "1", url: "u", title: "X", startsAt: "2026-12-04T03:00:00.000Z", venue: { name: "V", lat: 43.65, lng: -79.4, city: "Toronto" }, description: i.description, details: i.details, categories: [] });
  assert(/Phones down/.test(e.details), JSON.stringify(e));
});

test("torevent: the calendar file parses; genres kept, venue categories dropped; address split from the venue", () => {
  const file = `window.TOREVENT_DATA = ${JSON.stringify({ stamp: "x", events: [{ id: "TKF/1", start: "2026-12-05T02:00:00Z", end: "2026-12-05T07:00:00Z", isAllDay: false, title: "Retro Dance Party", venue: "Black Eagle", location: "Black Eagle, 457 Church St, Toronto, ON M4Y 2C5, Canada", categories: ["DJ/Club/Rave", "Black-Eagle"], labels: ["19+"], image: "https://img/x.jpg", url: "https://tockify.com/torevent/detail/1/2", actionUrl: "", externalLinks: ["https://instagram.com/x", "https://tickets.example/1"], description: "Retro hits all night\n\nMore info" }] })};`;
  const d = torevent.parseFile(file);
  assert.strictEqual(d.events.length, 1);
  assert.deepStrictEqual(torevent.splitLocation("Black Eagle", d.events[0].location), { address: "457 Church St, Toronto, ON M4Y 2C5", city: "Toronto" });
});

test("showpass: an event maps to a listing with coordinates, lowest and highest price, and the banner image", () => {
  const r = showpass.toRaw({ id: 7, name: "Just Feel It: Vogue Nights", starts_on: "2026-12-04T02:00:00Z", ends_on: "2026-12-04T06:00:00Z", location: { name: "Buddies in Bad Times Theatre", street_name: "12 Alexander St", city: "Toronto", position: "43.6633,-79.3813" }, venue: { name: "Buddies" }, description: "<p>Monthly vogue night</p>", ticket_types: [{ price: "15.00" }, { price: "25.00" }], image_banner: "https://img/b.jpg", frontend_details_url: "https://www.showpass.com/x/" });
  assert.strictEqual(r.venue.lat, 43.6633);
  assert.strictEqual(r.price, 15);
  assert.strictEqual(r.priceHigh, 25);
  assert.strictEqual(r.image, "https://img/b.jpg");
  assert(/Monthly vogue night/.test(r.details));
});

test("yohomo: an event page gives title, the next such date, venue, price, tickets, poster and write-up", () => {
  const html = `<h1 class="heading-style-h1">Daddy Next Door </h1>
    <div class="item-event-date"><p>Sat</p><p>.</p><p>Dec 12</p></div><div class="item-event-hours"><p>10:00 pm</p><p>→</p><p>2:00 am</p></div>
    <div class="event-item-location"><p>The Black Eagle</p><p class="address">457 Church Street</p></div>
    <div class="blog-item-data"><p>PRICE</p></div><div class="div-block-25"><p>$10 before 10:30pm</p></div>
    <a href="https://tickets.example/dnd" target="_blank" class="button w-button">GET TICKETS</a>
    <div class="event-image-wrapper"><div><img src="https://cdn/poster.jpg"/></div></div>
    <div class="text-rich-text events w-richtext"><p>The monthly party for daddies and their admirers.</p></div>`;
  const e = yohomo.parsePage(html, "https://www.yohomo.ca/event/daddy-next-door", new Date("2026-11-26T12:00:00Z"));
  assert.strictEqual(e.title, "Daddy Next Door");
  assert.strictEqual(e.startsAt, "2026-12-13T03:00:00.000Z"); // 10 PM Toronto
  assert.strictEqual(e.endsAt, "2026-12-13T07:00:00.000Z"); // past midnight
  assert.strictEqual(e.venue.name, "The Black Eagle");
  assert.strictEqual(e.price, 10);
  assert.strictEqual(e.ticketUrl, "https://tickets.example/dnd");
  assert.strictEqual(e.image, "https://cdn/poster.jpg");
  assert.deepStrictEqual(e.categories, ["queer"]);
  // A date earlier in the year than today is next year's
  assert(yohomo.whenOf("Jan 9", "9:00 pm", new Date("2026-11-26T12:00:00Z")).startsWith("2027-01-10"));
});

test("venue websites: WordPress costs and times; schema.org dates without a time use the venue's usual start", () => {
  assert.deepStrictEqual(wp.costOf({ cost: "$15 + fees" }), { price: 15, priceHigh: 15, note: "$15 + fees" });
  assert.strictEqual(wp.costOf({ cost: "Free" }).price, 0);
  assert.strictEqual(wp.torontoTime("2026-11-26 21:00:00", "2026-11-27 02:00:00"), "2026-11-27T02:00:00.000Z");
  const s = pages.startOf("November 26, 2026", "20:00");
  assert.deepStrictEqual(s, { iso: "2026-11-27T01:00:00.000Z", timeGiven: false });
  assert.strictEqual(pages.startOf("2026-11-26T21:30:00-05:00").timeGiven, true);
  assert.deepStrictEqual(pages.priceOf({ price: "$25.00" }), { price: 25, priceHigh: 25 });
});

test("venue websites: events nested under mainEntity are found; a time without a zone is Toronto time", () => {
  const html = `<script type="application/ld+json">{"@type":"WebPage","mainEntity":[{"@type":"Event","name":"Emo Night","startDate":"2026-12-04T21:00:00"}]}</script>`;
  const found = pages.deepEvents(html);
  assert.strictEqual(found.length, 1);
  assert.deepStrictEqual(pages.startOf(found[0].startDate), { iso: "2026-12-05T02:00:00.000Z", timeGiven: true });
});

test("dedupe: the same night under a room's name and the building's name is one listing", () => {
  const { dedupe } = require(path.join(ROOT, "lib", "dedupe"));
  const mk = (source, venue, lat) => toEvent({ source, sourceId: source, url: `https://${source}.example/x`, title: "Just Feel It: Toronto Vogue Nights", startsAt: "2026-11-27T02:00:00.000Z", venue: { name: venue, lat, lng: -79.383, city: "Toronto" }, description: "Monthly vogue night", categories: [] });
  const out = dedupe([mk("Showpass", "Tallulah's Cabaret", 43.66344), mk("Buddies", "Buddies in Bad Times Theatre", 43.66321)]).events;
  assert.strictEqual(out.length, 1);
  // Different nights in one building stay apart
  const other = { ...mk("Buddies", "Buddies in Bad Times Theatre", 43.66321), id: 5, title: "SLUR" };
  assert.strictEqual(dedupe([mk("Showpass", "Tallulah's Cabaret", 43.66344), other]).events.length, 2);
});

test("known venues: one venue by name whatever its 'The', so new sources reuse coordinates", () => {
  const k = venueIndex([{ venue: { name: "Black Eagle", lat: 43.66, lng: -79.38, address: "457 Church St" } }]);
  assert.deepStrictEqual(k.find("The Black Eagle"), { lat: 43.66, lng: -79.38, address: "457 Church St" });
  assert.strictEqual(k.find("Nowhere"), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
