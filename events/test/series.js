// Tests for recurring nights and the venue calendars that announce them:
//  - Elfsight calendars (the Black Eagle's): each repeat rule ("4th Thursday of the month", "every other Sunday",
//    "2nd Saturday of every other month", "last Saturday") gives the right dates, skipped dates and end rules hold,
//    and the tags become the host, the price and the time
//  - series (lib/series.js): dates of one night are linked by the source's id, by name at one venue (whatever the
//    venue is called) or by name and host across venues; a presenter's prefix ("TSO - …") and a library system's
//    same-named clubs at different branches are not one night; a thin date gets what its siblings or earlier runs
//    knew, says so, and gives it back before the next run links again
// Made-up calendar entries in Elfsight's shape; nothing here makes a real request.
//
//   node test/series.js        (from events/)

const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");

process.env.AI = "off";
process.env.SUPABASE_URL = process.env.SUPABASE_SECRET_KEY = "";
process.env.SERIES_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "series-")), "series.json");
global.fetch = async (url) => { throw new Error(`Unexpected real fetch in test: ${url}`); };

const ROOT = path.join(__dirname, "..");
const E = require(path.join(ROOT, "sources", "elfsight"));
const S = require(path.join(ROOT, "lib", "series"));
const { toEvent, NA } = require(path.join(ROOT, "lib", "normalize"));
const { describe } = require(path.join(ROOT, "lib", "qualities"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); } catch (err) { failed++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}

const entry = (o) => ({ id: "x", name: "NIGHT", start: { date: "2026-04-23", time: "21:00" }, end: { date: "2026-04-23", time: "21:00" }, repeatPeriod: "noRepeat", repeatFrequency: "daily", repeatInterval: 1, repeatWeeklyOnDays: [], repeatMonthlyOnDay: "nthDay", repeatEnds: "never", exceptions: [], tags: [], visible: true, ...o });
const FROM = "2026-11-26", TO = "2027-02-26";
const torontoMs = (date, time) => Date.parse(new Date(`${date}T${time}:00-05:00`).toISOString());

test("elfsight: the 4th Thursday of every month, with a skipped date", () => {
  const e = entry({ repeatPeriod: "nthDayInMonth", start: { date: "2026-04-23", time: "21:00" } });
  assert.deepStrictEqual(E.expand(e, FROM, TO), ["2026-11-26", "2026-12-24", "2027-01-28", "2027-02-25"]);
  assert.strictEqual(E.ruleLabel(e), "4th Thursday of the month");
  const skipped = { ...e, exceptions: [{ type: "skip", originalDate: torontoMs("2026-12-24", "21:00") }] };
  assert.deepStrictEqual(E.expand(skipped, FROM, TO), ["2026-11-26", "2027-01-28", "2027-02-25"]);
});

test("elfsight: every other Sunday, the last Saturday, every other month's 2nd Saturday, and end rules", () => {
  const sun = entry({ repeatPeriod: "custom", repeatFrequency: "weekly", repeatInterval: 2, repeatWeeklyOnDays: ["su"], start: { date: "2026-10-18", time: "21:00" } });
  assert.deepStrictEqual(E.expand(sun, FROM, "2027-01-10"), ["2026-11-29", "2026-12-13", "2026-12-27", "2027-01-10"]);
  assert.strictEqual(E.ruleLabel(sun), "Every other Sunday");
  const last = entry({ repeatPeriod: "lastDayInMonth", start: { date: "2026-10-31", time: "21:00" } });
  assert.deepStrictEqual(E.expand(last, FROM, TO), ["2026-11-28", "2026-12-26", "2027-01-30"]);
  assert.strictEqual(E.ruleLabel(last), "Last Saturday of the month");
  const dnd = entry({ repeatPeriod: "custom", repeatFrequency: "monthly", repeatInterval: 2, start: { date: "2026-12-12", time: "21:00" } });
  assert.deepStrictEqual(E.expand(dnd, FROM, TO), ["2026-12-12", "2027-02-13"]);
  assert.strictEqual(E.ruleLabel(dnd), "2nd Saturday of every other month");
  assert.deepStrictEqual(E.expand({ ...sun, repeatEnds: "onDate", repeatEndsDate: { date: "2026-12-14" } }, FROM, TO), ["2026-11-29", "2026-12-13"]);
  assert.deepStrictEqual(E.expand({ ...sun, start: { date: "2026-11-29", time: "21:00" }, repeatEnds: "afterOccurrences", repeatEndsOccurrences: 2 }, FROM, TO), ["2026-11-29", "2026-12-13"]);
  // A one-off past the window isn't in it
  assert.deepStrictEqual(E.expand(entry({ start: { date: "2027-03-08", time: "21:00" } }), FROM, TO), []);
});

test("elfsight: tags give the host, the price and the time; a logo isn't a poster; dates carry the series", () => {
  const cal = { name: "Black Eagle", widget: "w1", page: "https://example.com/", venue: { name: "Black Eagle", address: "457 Church St" } };
  const e = entry({ id: "bd", name: "BAD DOG", repeatPeriod: "nthDayInMonth", isAllDay: true, start: { date: "2026-04-23", time: "20:00" },
    tags: [{ tagName: "• • • •" }, { tagName: "A NIGHT OF PUPPY PLAY" }, { tagName: "HOSTED BY t.k.k." }, { tagName: "9PM / NO COVER" }],
    coverImage: { url: "https://files.example.com/Black-Eagle-round-logo.png" } });
  const raws = E.toRaws(e, cal, { lat: 43.66, lng: -79.38 }, new Date("2026-11-26T05:00Z"), new Date("2027-02-26T05:00Z"));
  assert.strictEqual(raws.length, 4);
  const r = raws[0];
  assert.strictEqual(r.organizer, "t.k.k");
  assert.strictEqual(r.price, 0);
  assert.strictEqual(r.startsAt, "2026-11-27T02:00:00.000Z", "9 PM Toronto, from the tag (the entry is all-day)");
  assert.strictEqual(r.image, null);
  assert.strictEqual(r.seriesKey, "elfsight:w1:bd");
  assert.strictEqual(r.repeats, "4th Thursday of the month");
  assert.strictEqual(r.description, "A night of puppy play · Hosted by t.k.k. · 9PM / no cover");
  const ev = toEvent(r);
  assert.strictEqual(ev.seriesKey, "elfsight:w1:bd");
  assert.strictEqual(ev.repeats, "4th Thursday of the month");
});

test("series: the name without dates, editions or subtitles", () => {
  const cases = { "Lost Signal : Lost X Ampm": "lost signal", "DADDY NEXT DOOR - DENIN & LEATHER EDITION": "daddy next door", "Trivia Night #12": "trivia",
    "The Riptides w/ The Huntingtons": "the riptides", "Comedy Night: Dec 4": "comedy night", "Concert: Jazz Trio": "concert jazz trio", "SLUR (Sold Out)": "slur" };
  for (const [t, want] of Object.entries(cases)) assert.strictEqual(S.coreTitle(t), want, t);
});

let n = 0;
const mk = (title, date, venue = "Buddies in Bad Times Theatre", o = {}) => ({ id: ++n, title, startsAt: `${date}T02:00:00.000Z`, venue: { name: venue, lat: 43.6632, lng: -79.383 }, organizer: { name: NA }, description: NA, tags: [], vibes: [], source: "Test", ...o });

test("series: one night under two venue names is linked, with its rule from the dates", () => {
  const evs = [mk("SLUR", "2026-12-05"), mk("Slur", "2026-12-12", "Buddies in Bad Times"), mk("SLUR", "2026-12-19", "Buddies in Bad Times", { venue: { name: "Buddies in Bad Times", lat: 43.66325, lng: -79.38301 } }), mk("Other Show", "2026-12-06")];
  const { events, stats } = S.link(evs);
  assert.strictEqual(stats.series, 1);
  const ids = events.map((e) => e.series && e.series.id);
  assert.ok(ids[0] && ids[0] === ids[1] && ids[1] === ids[2]);
  assert.strictEqual(events[3].series, undefined, "a one-off isn't a series");
  assert.strictEqual(events[0].series.rule, "Every Friday");
  assert.strictEqual(events[0].series.count, 3);
});

test("series: a touring party links across venues by its host; a library system's clubs at two branches don't", () => {
  const party = [mk("Lost Signal : Lost X Ampm", "2026-12-05", "Venue A", { organizer: { name: "Lost Signal" }, venue: { name: "Venue A", lat: 43.64, lng: -79.4 } }),
    mk("Lost Signal: Winter", "2027-01-09", "Venue B", { organizer: { name: "Lost Signal" }, venue: { name: "Venue B", lat: 43.67, lng: -79.35 } })];
  const lib = [1, 2, 3, 4, 5, 6].map((i) => mk("Book Club", `2026-12-0${i}`, `Branch ${i}`, { organizer: { name: "Toronto Public Library" }, venue: { name: `Branch ${i}`, lat: 43.6 + i / 100, lng: -79.4 } }));
  const { events } = S.link([...party, ...lib]);
  assert.ok(events[0].series && events[0].series.id === events[1].series.id);
  assert.ok(events.slice(2).every((e) => !e.series), "different branches' book clubs are different nights");
});

test("series: a presenter's prefix with different shows isn't one night", () => {
  const evs = ["TSO - Messiah", "TSO - Elf in Concert", "TSO - Ehnes Plays Tchaikovsky", "TSO - Messiah"].map((t, i) => mk(t, `2026-12-0${i + 2}`, "Roy Thomson Hall", { venue: { name: "Roy Thomson Hall", lat: 43.646, lng: -79.386 } }));
  const { events } = S.link(evs);
  assert.ok(events[0].series && events[0].series.id === events[3].series.id, "the two Messiahs are one run");
  assert.ok(!events[1].series && !events[2].series);
});

test("series: a thin date gets its siblings' description and AI reading, says so, and gives it back", () => {
  const rich = mk("BAD DOG", "2026-11-27", "Black Eagle", { description: "A night of puppy play hosted by t.k.k. Pups, handlers and the curious welcome; gear encouraged, no cover, all night on the main floor.", premise: "Monthly puppy-play social", aiQualities: ["Kink & leather"], tagSource: "ai", vibes: ["Queer"], image: "https://x/p.jpg", organizer: { name: "t.k.k" } });
  const thin = mk("BAD DOG", "2026-12-25", "Black Eagle", { description: "9PM / no cover" });
  const { events } = S.link([rich, thin]);
  const t = events[1];
  assert.deepStrictEqual(t.shared.sort(), ["aiQualities", "description", "host", "image", "premise", "vibes"]);
  assert.match(t.details, /puppy play/);
  assert.strictEqual(t.premise, "Monthly puppy-play social");
  assert.ok(describe(t).qualities.includes("Kink & leather"));
  assert.strictEqual(events[0].shared, undefined, "the date that said the most lends, it doesn't borrow");
  const back = S.unlend(t);
  assert.strictEqual(back.description, "9PM / no cover");
  for (const k of ["details", "premise", "aiQualities", "image", "series", "shared", "own"]) assert.ok(!(k in back) || back[k] == null, k);
  assert.strictEqual(back.organizer.name, NA);
});

test("series: the memory gives a lone new date what earlier runs knew", () => {
  const rich = mk("Jockstrap", "2026-12-06", "Black Eagle", { description: "Jockstrap attire optional, clothes check onsite, men only, nine until close with a ten dollar cover before ten.", organizer: { name: "Black Eagle" } });
  const first = S.link([rich, mk("Jockstrap", "2027-01-03", "Black Eagle")]);
  const memory = S.remember(first.events, { series: {} }, new Date("2026-11-26T12:00Z"), first.keys);
  S.saveMemory(memory);
  const later = S.link([mk("JOCKSTRAP", "2027-03-07", "Black Eagle")], S.readMemory());
  const e = later.events[0];
  assert.ok(e.series, "linked by memory");
  assert.strictEqual(e.series.id, first.events[0].series.id);
  assert.match(e.details, /clothes check/);
  assert.strictEqual(e.series.since, "2026-11-26");
});

test("series: the dates' own pattern wins over one entry's rule (two alternating every-other-Sunday entries)", () => {
  const evs = ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"].map((d, i) => mk("Studio 457", d, "Black Eagle", { seriesKey: i % 2 ? "b" : "a", repeats: "Every other Sunday" }));
  const { events } = S.link(evs);
  assert.ok(events.every((e) => e.series && e.series.id === events[0].series.id));
  assert.strictEqual(events[0].series.rule, "Every Sunday");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
