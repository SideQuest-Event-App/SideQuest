// Venue calendars made with Elfsight's "Event Calendar" widget (the Black Eagle's, and many small venues' on Squarespace
// or Wix). The widget loads its events from Elfsight's public endpoint core.service.elfsight.com/p/boot/, which its
// robots.txt allows ("Allow: /p/*"); the venue's own site is never crawled. The list is config/elfsight-calendars.json:
// the widget's id (in the page's "elfsight-app-<id>" div), the page it's on, and the venue.
//
// A calendar entry is often a repeating night ("4th Thursday of the month", "every other Sunday") with skipped dates.
// expand() turns each rule into its dates in the import window, and every date carries the entry's seriesKey, so the
// app knows they're one night that keeps happening (lib/series.js). The calendar's tags hold the details venues put
// nowhere else: "HOSTED BY t.k.k.", "9PM / NO COVER", "A NIGHT OF PUPPY PLAY". They become the host, the price and
// the description.

const fs = require("fs");
const { get } = require("../lib/fetch");
const { torontoISO } = require("../lib/posters");
const { venueIndex } = require("./known-venues");

const LIST = require("../lib/paths").config("elfsight-calendars.json");
const DAY = 86400000;
const WEEKDAYS = ["su", "mo", "tu", "we", "th", "fr", "sa"];
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function list() {
  try {
    return JSON.parse(fs.readFileSync(LIST, "utf8")).calendars || [];
  } catch {
    return [];
  }
}

const strip = (h) => String(h || "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

// Calendar dates as plain "YYYY-MM-DD" arithmetic (no time zones until the very end)
const ymd = (d) => d.toISOString().slice(0, 10);
const asDate = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => ymd(new Date(asDate(s).getTime() + n * DAY));
const weekday = (s) => asDate(s).getUTCDay();
const nthOf = (s) => Math.ceil(Number(s.slice(8, 10)) / 7);
const isLastOf = (s) => addDays(s, 7).slice(0, 7) !== s.slice(0, 7);
function monthPlus(s, n) {
  const d = asDate(s.slice(0, 8) + "01");
  d.setUTCMonth(d.getUTCMonth() + n);
  return ymd(d).slice(0, 7);
}
// The nth (or last) given weekday of a month ("2026-12"), or null when that month has no 5th one
function nthWeekdayIn(month, wd, n) {
  if (n === "last") {
    let d = addDays(monthPlus(`${month}-01`, 1) + "-01", -1);
    while (weekday(d) !== wd) d = addDays(d, -1);
    return d;
  }
  let d = `${month}-01`;
  while (weekday(d) !== wd) d = addDays(d, 1);
  d = addDays(d, 7 * (n - 1));
  return d.slice(0, 7) === month ? d : null;
}

// Every date of an entry from its start to `until` (inclusive), before skips and the end rule
function* rawDates(e, until) {
  const start = e.start.date;
  const period = e.repeatPeriod || "noRepeat";
  const every = Math.max(1, Number(e.repeatInterval) || 1);
  if (period === "noRepeat") return yield start;
  const freq = period === "custom" ? e.repeatFrequency : "monthly";
  // Monthly: which day of the month. nthDayInMonth is "the 4th Thursday"; lastDayInMonth "the last Saturday".
  const onDay = period === "nthDayInMonth" ? "nthDay" : period === "lastDayInMonth" ? "lastDay" : e.repeatMonthlyOnDay || "sameDay";
  if (freq === "daily") {
    for (let d = start; d <= until; d = addDays(d, every)) yield d;
  } else if (freq === "weekly") {
    const days = (e.repeatWeeklyOnDays || []).map((x) => WEEKDAYS.indexOf(x)).filter((x) => x >= 0);
    const on = days.length ? days : [weekday(start)];
    // Weeks counted from the start's own week (Sunday first, as the widget shows them)
    for (let wk = addDays(start, -weekday(start)), i = 0; wk <= until; wk = addDays(wk, 7), i++) {
      if (i % every) continue;
      for (const wd of on.sort()) { const d = addDays(wk, wd); if (d >= start && d <= until) yield d; }
    }
  } else if (freq === "monthly") {
    const wd = weekday(start);
    for (let i = 0; ; i += every) {
      const month = monthPlus(start, i);
      if (`${month}-01` > until) break;
      const d = onDay === "sameDay" ? (asDate(`${month}-${start.slice(8, 10)}`).toISOString().slice(0, 7) === month ? `${month}-${start.slice(8, 10)}` : null)
        : nthWeekdayIn(month, wd, onDay === "lastDay" || (onDay === "nthDay" && nthOf(start) === 5 && isLastOf(start)) ? "last" : nthOf(start));
      if (d && d >= start && d <= until) yield d;
    }
  } else if (freq === "yearly") {
    for (let y = Number(start.slice(0, 4)); `${y}` <= until.slice(0, 4); y += every) { const d = `${y}${start.slice(4)}`; if (d <= until) yield d; }
  }
}

// The dates in [from, to] (Toronto calendar dates), after the end rule and the skipped dates
function expand(e, from, to) {
  const skip = new Set((e.exceptions || []).filter((x) => x.type === "skip" && x.originalDate).map((x) => new Date(x.originalDate).toLocaleDateString("sv-SE", { timeZone: "America/Toronto" })));
  const endOn = e.repeatEnds === "onDate" && e.repeatEndsDate && e.repeatEndsDate.date ? e.repeatEndsDate.date : null;
  const maxN = e.repeatEnds === "afterOccurrences" ? Math.max(1, Number(e.repeatEndsOccurrences) || 1) : Infinity;
  const until = endOn && endOn < to ? endOn : to;
  const out = [];
  let n = 0;
  for (const d of rawDates(e, until)) {
    if (++n > maxN) break;
    if (d >= from && d <= until && !skip.has(d)) out.push(d);
  }
  return out;
}

// "4th Thursday of the month", "Every other Sunday", "Last Saturday of the month": how the app names the repeat
function ruleLabel(e) {
  const p = e.repeatPeriod || "noRepeat";
  if (p === "noRepeat") return null;
  const s = e.start.date;
  const every = Math.max(1, Number(e.repeatInterval) || 1);
  const wd = DAY_NAMES[weekday(s)];
  const often = (unit) => (every === 1 ? `of the ${unit}` : every === 2 ? `of every other ${unit}` : `every ${every} ${unit}s`);
  if (p === "nthDayInMonth") return `${ORD[nthOf(s)] || "Last"} ${wd} of the month`;
  if (p === "lastDayInMonth") return `Last ${wd} of the month`;
  const f = e.repeatFrequency;
  if (f === "daily") return every === 1 ? "Every day" : `Every ${every} days`;
  if (f === "weekly") {
    const days = (e.repeatWeeklyOnDays || []).map((x) => DAY_NAMES[WEEKDAYS.indexOf(x)]).filter(Boolean);
    const names = (days.length ? days : [wd]).join(" and ");
    return every === 1 ? `Every ${names}` : every === 2 ? `Every other ${names}` : `Every ${every} weeks on ${names}`;
  }
  if (f === "monthly") {
    if (e.repeatMonthlyOnDay === "sameDay") return every === 1 ? `Monthly on the ${Number(s.slice(8, 10))}th` : `Every ${every} months`;
    const which = e.repeatMonthlyOnDay === "lastDay" ? "Last" : ORD[nthOf(s)];
    return `${which} ${wd} ${often("month")}`;
  }
  if (f === "yearly") return "Every year";
  return null;
}

// What the calendar's tags say. Bullet-only tags are decoration.
function readTags(e) {
  const tags = (e.tags || []).map((t) => strip(t.tagName || t.name || "")).filter((t) => /[a-z0-9]/i.test(t));
  let host = null, price = null, time = null;
  const lines = [];
  for (const t of tags) {
    const h = t.match(/^(?:hosted|presented|curated|organi[sz]ed|run)\s+by\s+(.+)$/i) || t.match(/^with\s+(?:resident\s+)?(?:dj\s+)?(.+)$/i);
    if (h && !host && /^(hosted|presented|curated|organi|run)/i.test(t)) host = h[1].replace(/\s*[.•]+\s*$/, "").trim();
    if (/no cover|free( entry| admission)?\b/i.test(t)) price = 0;
    const cost = t.match(/\$\s?(\d+)/);
    if (cost && price == null) price = Number(cost[1]);
    const tm = t.match(/\b(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
    if (tm && !time) time = `${String((Number(tm[1]) % 12) + (/pm/i.test(tm[3]) ? 12 : 0)).padStart(2, "0")}:${tm[2] || "00"}`;
    lines.push(t);
  }
  return { host, price, time, lines };
}

// The tags, then whatever the entry's own text adds (venues often repeat the tags there, or just write "JUNE 7.")
function describeIt(lines, desc) {
  const seen = new Set(lines.map((l) => l.toLowerCase().replace(/\W+/g, "")));
  const extra = desc.split("\n").map((l) => l.trim()).filter((l) => l && !/^[A-Z]+ \d{1,2}\.?$/.test(l) && !seen.has(l.toLowerCase().replace(/\W+/g, "")));
  return [lines.map(calmTags).join(" · "), ...extra].filter(Boolean).join("\n");
}
// "A NIGHT FOR DADDIES · WITH DJ DWAYNE MINARD" → "A night for daddies · With DJ Dwayne Minard": sentence case, names kept
function calmTags(s) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6 || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.7) return s;
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  let name = false, first = true;
  // Only all-caps words change; a name's own spelling ("t.k.k.") is kept. After "with" or "by" come names.
  return s.replace(/[A-Za-z][A-Za-z'.]*|[·•/\n]/g, (w) => {
    if (/^[·•/\n]$/.test(w)) { name = false; return w; }
    let o = w;
    if (w === w.toUpperCase()) {
      const low = w.toLowerCase();
      if (/^(dj|djs|lgbtq|am|pm|bbq)$/.test(low)) o = w;
      else if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(low)) o = cap(low);
      else if (name && !/^(and|of|the|x|resident|special|guest|guests|their|our|your)$/.test(low)) o = cap(low);
      else o = first ? cap(low) : low;
    }
    first = false;
    if (/^(with|by|featuring|ft\.?)$/i.test(w)) name = true;
    return o;
  });
}

// The name before an edition's subtitle: "DADDY NEXT DOOR - DENIM & LEATHER" → "daddy next door"
const coreOf = (t) => String(t).toLowerCase().split(/\s+[-–—:|•]\s+|\s*[:•]\s+/)[0].replace(/[^a-z0-9]+/g, " ").trim();

// A venue's generic picture (its logo) isn't a poster for the night
const GENERIC = /logo|placeholder|default/i;
const imageOf = (e) => {
  const c = e.coverImage && e.coverImage.url ? e.coverImage.url : (e.images || []).map((i) => i && i.url).find(Boolean);
  return c && !GENERIC.test(c) ? c : null;
};

// One calendar entry → its dates in the window, as raw listings
function toRaws(e, cal, coords, start, end) {
  if (e.visible === false || !e.name || !e.start || !e.start.date) return [];
  const from = start.toLocaleDateString("sv-SE", { timeZone: "America/Toronto" });
  const to = end.toLocaleDateString("sv-SE", { timeZone: "America/Toronto" });
  const { host, price, time, lines } = readTags(e);
  const desc = strip(e.description);
  // Its own time, unless it's marked all-day (the widget then hides the time it has); a time in its tags wins
  const at = time || (!e.isAllDay && e.start.time) || e.start.time || cal.usualStart || "21:00";
  const timeGiven = Boolean(time || (!e.isAllDay && e.start.time));
  const endAt = !e.isAllDay && e.end && e.end.time && e.end.time !== e.start.time ? e.end.time : null;
  const rule = ruleLabel(e);
  const title = strip(e.name).replace(/\s*[•*:]\s*$/, "");
  return expand(e, from, to).map((d) => {
    const startsAt = torontoISO(`${d}T${at}`);
    const endsAt = endAt ? torontoISO(`${endAt < at ? addDays(d, 1) : d}T${endAt}`) : null;
    return {
      source: cal.name,
      sourceId: `${e.id}:${d}`,
      url: cal.page,
      title,
      startsAt,
      endsAt,
      venue: { name: cal.venue.name, address: cal.venue.address, ...coords, city: "Toronto" },
      price,
      priceNote: price === 0 ? "No cover" : null,
      description: describeIt(lines, desc),
      organizer: host || cal.venue.name,
      image: imageOf(e),
      categories: cal.categories || [],
      seriesKey: rule ? `elfsight:${cal.widget}:${e.id}` : null,
      repeats: rule,
      ...(timeGiven ? {} : { details: `Start time not on the calendar (shown at ${at}, ${cal.venue.name}'s usual start)` }),
    };
  });
}

async function fetchElfsight({ start, end, max = 3000, log = () => {}, previous = [] }) {
  const cals = list();
  if (!cals.length) return { skipped: "No Elfsight calendars listed yet (config/elfsight-calendars.json)" };
  const known = venueIndex(previous);
  const out = [];
  for (const cal of cals) {
    try {
      const url = `https://core.service.elfsight.com/p/boot/?page=${encodeURIComponent(cal.page)}&w=${encodeURIComponent(cal.widget)}`;
      const data = await get(url, { json: true });
      const w = data && data.data && data.data.widgets && data.data.widgets[cal.widget];
      const events = (w && w.data && w.data.settings && w.data.settings.events) || [];
      const k = cal.venue.lat != null ? { lat: Number(cal.venue.lat), lng: Number(cal.venue.lng) } : known.find(cal.venue.name) || { lat: null, lng: null };
      const coords = { lat: k.lat, lng: k.lng };
      // Venues sometimes add one edition as its own entry on top of the repeating one ("DADDY NEXT DOOR - DENIM &
      // LEATHER" and "DADDY NEXT DOOR"): one date per night, the entry made for that date (the nearer start) winning
      const byNight = new Map();
      for (const e of events) {
        for (const r of toRaws(e, cal, coords, start, end)) {
          const key = `${r.startsAt.slice(0, 10)}|${coreOf(r.title)}`;
          const was = byNight.get(key);
          const gap = Math.abs(Date.parse(r.startsAt) - Date.parse(`${e.start.date}T12:00Z`));
          if (!was || gap < was.gap) byNight.set(key, { r, gap });
        }
      }
      let n = 0;
      for (const { r } of byNight.values()) if (out.length < max) { out.push(r); n++; }
      log(`  ${cal.name}: ${n} dates from ${events.length} calendar entries`);
    } catch (err) {
      log(`  ${cal.name}: ${err.message}`);
    }
  }
  return out;
}

module.exports = { fetchElfsight, expand, ruleLabel, readTags, toRaws, list };
