// Recurring nights. Most nightlife repeats (BAD DOG every 4th Thursday at the Black Eagle, SLUR every week at Buddies,
// Lost Signal at a different venue each time), and once we know what a night is like, a new date only needs to say
// that it's happening again. This links every date of a night into one series and shares what's known about it:
//
//   link(events, memory)   gives each event in a series `series: { id, rule, count }`, and fills a date's gaps (its
//                          description when it's thin, the AI's premise, qualities, keywords and vibes, a poster when it
//                          has none, the host) from the date that says the most, or from what earlier runs remembered.
//                          What was filled is listed in `shared`, so the app can say it's from other dates.
//   remember(events, memory)  the memory for next run: every series' best info, its keys and when it was last seen
//                          (data/series.json, and Supabase Storage with UPLOAD=1, like events.json)
//
// Dates are one series when they share any of these keys:
//   the source's own series id (an Elfsight calendar's repeating entry: seriesKey)
//   the night's name at the same venue    ("SLUR" at Buddies in Bad Times; "Daddy Next Door - Denim Edition" too),
//                                         by the venue's name or its spot on the map
//   the night's name by the same host     (a touring party at a different venue each month)
// The name is the title without dates, edition numbers or a subtitle ("Lost Signal : Lost X Ampm" → "lost signal").
// A generic word before the subtitle ("Concert: …", "Workshop: …") isn't a name, so the whole title is used then.

const crypto = require("crypto");
const fs = require("fs");
const { NA } = require("./normalize");
const { infoOf } = require("./qualities");

const FILE = process.env.SERIES_FILE || require("./paths").data("series.json");
const DAY = 86400000;

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "");
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DAYS = "mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs?|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const GENERIC = new Set(("concert workshop show shows live comedy event events class classes tour film films screening storytime talk talks tickets party night " +
  "special music exhibition market lecture performance festival meetup lunch brunch dinner tasting seminar webinar course camp program session " +
  "presents presented the a an and drop in drop-in open house info session book club guided tour").split(" "));

// "Lost Signal : Lost X Ampm" → "lost signal"; "DADDY NEXT DOOR - DENIM & LEATHER EDITION" → "daddy next door";
// "Comedy Night: Dec 4" → "comedy night"; "Concert: Jazz Trio" → "concert jazz trio"
function coreTitle(title, whole = false) {
  let t = ` ${fold(title)} `
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(new RegExp(`\\b(${MONTHS})\\.?\\s*\\d{1,2}(st|nd|rd|th)?\\b(,?\\s*20\\d\\d)?`, "g"), " ")
    .replace(new RegExp(`\\b(${DAYS})\\b,?`, "g"), " ")
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, " ")
    .replace(/\b20\d\d\b/g, " ")
    .replace(/\b\d{1,2}(:\d\d)?\s*(am|pm)\b/g, " ")
    .replace(/\b(vol(ume)?|ep(isode)?|part|pt|no|chapter|season|week|round|night)\.?\s*#?\d+\b/g, " ")
    .replace(/#\d+\b/g, " ")
    .replace(/\b\d+(st|nd|rd|th)\s+(annual|edition|anniversary)\b/g, " ")
    .replace(/\b(sold out|cancelled|postponed|new date|rescheduled|this week|tonight)\b/g, " ");
  const clean = (s) => s.replace(/[^a-z0-9&]+/g, " ").replace(/\s+/g, " ").trim();
  const head = clean(t.split(/\s+[-–—|•~]\s+|\s*[:|•]\s+|\s+(?:w\/|ft\.?|feat\.?|featuring)\s+/)[0] || "");
  // Edition words at the end of the name ("… december edition")
  const tidy = (s) => s.replace(new RegExp(`\\s+(?:(?:${MONTHS})\\s+)?(edition|special|pt)$`), "").trim();
  const name = tidy(head);
  if (whole) return tidy(clean(t));
  return name.length >= 3 && !GENERIC.has(name) && !name.split(" ").every((w) => GENERIC.has(w)) ? name : tidy(clean(t));
}

const venueKey = (e) => {
  const n = e.venue && e.venue.name && e.venue.name !== NA ? fold(e.venue.name).replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim() : "";
  if (n && !/^(location tba|tba|tbd|online|various|secret location)/.test(n)) return n;
  return e.venue && Number.isFinite(e.venue.lat) ? `${e.venue.lat.toFixed(3)},${e.venue.lng.toFixed(3)}` : "";
};
// A host worth linking by: a real name, not a ticket site's placeholder
const PLACEHOLDER = /^(n\/?a|none|unknown|tba|tbd|promoter( not defined)?|not (defined|specified)|.*\b(ticketmaster|eventbrite|livenation|showpass|universe|dice|ticketweb)\b.*)$/i;
const hostKey = (e) => {
  const n = e.organizer && e.organizer.name && e.organizer.name !== NA ? fold(e.organizer.name).replace(/[^a-z0-9]+/g, " ").trim() : "";
  return n && !PLACEHOLDER.test(n) ? n : "";
};

// whole: the whole title (for a presenter's prefix, below). bigHosts: hosts at many venues (a library system, a ticket
// company), whose same-named events at different branches are different nights, so they're only linked per venue.
function keysOf(e, { whole = false, bigHosts = new Set() } = {}) {
  const core = coreTitle(e.title, whole);
  const keys = [];
  if (e.seriesKey) keys.push(`k:${e.seriesKey}`);
  if (core) {
    const v = venueKey(e);
    if (v) keys.push(`v:${v}|${core}`);
    // The same spot (about 100 m), for one venue under two names ("Buddies in Bad Times" / "…Theatre")
    if (e.venue && Number.isFinite(e.venue.lat) && Number.isFinite(e.venue.lng)) keys.push(`p:${e.venue.lat.toFixed(3)},${e.venue.lng.toFixed(3)}|${core}`);
    const h = hostKey(e);
    if (h && !bigHosts.has(h)) keys.push(`h:${h}|${core}`);
  }
  return keys;
}

// Union-find: the members (indexes) that share any key, as groups
function groupBy(indexes, keyOf) {
  const parent = new Map(indexes.map((i) => [i, i]));
  const find = (i) => (parent.get(i) === i ? i : (parent.set(i, find(parent.get(i))), parent.get(i)));
  const firstWith = new Map();
  for (const i of indexes) for (const k of keyOf(i)) {
    if (firstWith.has(k)) parent.set(find(i), find(firstWith.get(k)));
    else firstWith.set(k, i);
  }
  const groups = new Map();
  for (const i of indexes) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()];
}

// ---------- How often: the source's rule in words, else read from the dates ----------
const ORD = ["1st", "2nd", "3rd", "4th", "5th"];
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const local = (iso) => new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Toronto" }));
function ruleFromDates(isos) {
  const days = [...new Set(isos.map((i) => local(i).toDateString()))].map((d) => new Date(d)).sort((a, b) => a - b);
  if (days.length < 3) return null;
  const wd = days[0].getDay();
  if (!days.every((d) => d.getDay() === wd)) return null;
  const gaps = days.slice(1).map((d, i) => Math.round((d - days[i]) / DAY));
  if (gaps.every((g) => g === 7)) return `Every ${NAMES[wd]}`;
  if (gaps.every((g) => g === 14)) return `Every other ${NAMES[wd]}`;
  const nth = days.map((d) => Math.ceil(d.getDate() / 7));
  const last = days.every((d) => new Date(d.getTime() + 7 * DAY).getMonth() !== d.getMonth());
  if (gaps.every((g) => g >= 28 && g <= 35)) {
    if (nth.every((n) => n === nth[0]) && nth[0] <= 4) return `${ORD[nth[0] - 1]} ${NAMES[wd]} of the month`;
    if (last) return `Last ${NAMES[wd]} of the month`;
  }
  return null;
}

// ---------- What a date can lend the others ----------
const has = (v) => v != null && v !== NA && !(Array.isArray(v) && !v.length) && v !== "";
const about = (e) => `${has(e.description) ? e.description : ""}\n${e.details || ""}`.trim();
// How much a date (or the memory) tells us: its text, the AI's reading, a poster, a host
const richness = (x) => about(x).length + (x.premise ? 400 : 0) + (x.tagSource === "ai" ? 200 : 0) + (x.image ? 50 : 0) + (hostKey(x) ? 30 : 0);
const LENT = ["premise", "aiQualities", "keywords"];

function lend(e, donor) {
  if (!donor || donor === e) return e;
  const out = { ...e };
  const shared = new Set(e.shared || []);
  // Its description, when this date's own says too little ("BAD DOG" with only "9PM / NO COVER")
  if (infoOf(e) === "thin" && about(donor).length > about(e).length + 40) {
    const theirs = about(donor);
    out.details = [has(e.description) ? e.description : "", theirs].filter(Boolean).join("\n").slice(0, 1200);
    if (!has(e.description)) out.description = (has(donor.description) ? donor.description : theirs).slice(0, 300);
    shared.add("description");
  }
  for (const k of LENT) if (!has(e[k]) && has(donor[k])) { out[k] = donor[k]; shared.add(k); }
  if (e.tagSource !== "ai" && !e.publishedBy && donor.tagSource === "ai" && has(donor.vibes)) {
    Object.assign(out, { vibes: donor.vibes, format: donor.format || e.format, setting: donor.setting || e.setting, tagSource: "ai" });
    shared.add("vibes");
  }
  if (!e.image && donor.image) { out.image = donor.image; shared.add("image"); }
  if (!hostKey(e) && hostKey(donor)) { out.organizer = { ...e.organizer, name: donor.organizer.name }; shared.add("host"); }
  if (!shared.size) return e;
  // What this date said itself, so the next run can take the lent parts back off before linking again (unlend)
  const own = {};
  for (const k of Object.keys(out)) if (out[k] !== e[k]) own[k] = k in e ? e[k] : null;
  return { ...out, shared: [...shared], own };
}

// A date as its source gave it: what other dates lent it taken back off (last run's kept events carry it)
function unlend(e) {
  if (!e || (!e.own && !e.series)) return e;
  const out = { ...e, ...(e.own || {}) };
  for (const [k, v] of Object.entries(e.own || {})) if (v === null) delete out[k];
  delete out.own;
  delete out.shared;
  delete out.series;
  return out;
}

// ---------- Linking ----------
function readMemory() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { series: {} }; }
}

function link(events, memory = { series: {} }) {
  const mem = memory.series || {};
  const memByKey = new Map();
  for (const [id, s] of Object.entries(mem)) for (const k of s.keys || []) memByKey.set(k, id);
  // Hosts with events at more than 5 venues are organizations, not a night's crew
  const venuesOf = new Map();
  for (const e of events) { const h = hostKey(e); if (h) { if (!venuesOf.has(h)) venuesOf.set(h, new Set()); venuesOf.get(h).add(venueKey(e)); } }
  const bigHosts = new Set([...venuesOf].filter(([, v]) => v.size > 5).map(([h]) => h));
  const real = events.map((e, i) => i).filter((i) => events[i].type !== "place" && events[i].title && events[i].startsAt);
  const keys = new Map(real.map((i) => [i, keysOf(events[i], { bigHosts })]));
  const groups = [];
  for (const g of groupBy(real, (i) => keys.get(i))) {
    // "TSO - Messiah", "TSO - Elf in Concert": many different names after one prefix, and no regular schedule, is a
    // presenter's prefix, not a night: those are split by their whole titles
    const wholes = new Set(g.map((i) => coreTitle(events[i].title, true)));
    const explicit = g.some((i) => events[i].seriesKey);
    if (wholes.size >= 3 && !explicit && !ruleFromDates(g.map((i) => events[i].startsAt))) {
      for (const i of g) keys.set(i, keysOf(events[i], { whole: true, bigHosts }));
      groups.push(...groupBy(g, (i) => keys.get(i)));
    } else groups.push(g);
  }

  const out = events.slice();
  let linked = 0, filled = 0, series = 0;
  const keysById = {};
  for (const members of groups) {
    const groupKeys = [...new Set(members.flatMap((i) => keys.get(i)))];
    const memId = groupKeys.map((k) => memByKey.get(k)).find(Boolean);
    const remembered = memId ? mem[memId] : null;
    // One date and never seen before isn't a series (yet)
    const days = new Set(members.map((i) => events[i].startsAt.slice(0, 10)));
    if (days.size < 2 && !(remembered && (remembered.dates || []).some((d) => !days.has(d)))) continue;
    const id = memId || `s${crypto.createHash("sha1").update(groupKeys.sort()[0]).digest("hex").slice(0, 10)}`;
    const isos = members.map((i) => events[i].startsAt);
    // The dates' own pattern first (two alternating "every other Sunday" entries are every Sunday), then the source's rule
    const rule = ruleFromDates(isos) || members.map((i) => events[i].repeats).find(Boolean) || (remembered && remembered.rule) || null;
    // The date that says the most lends to the rest; the memory lends when it says more than any date now
    const best = members.map((i) => events[i]).sort((a, b) => richness(b) - richness(a))[0];
    const donor = remembered && richness(remembered) > richness(best) ? remembered : best;
    series++;
    keysById[id] = groupKeys;
    for (const i of members) {
      const e = lend(events[i], donor);
      if (e.shared) filled++;
      out[i] = { ...e, series: { id, ...(rule ? { rule } : {}), count: members.length, ...(remembered ? { since: remembered.firstSeen } : {}) } };
      linked++;
    }
  }
  return { events: out, stats: { series, linked, filled }, keys: keysById };
}

// Next run's memory: each series' keys and the most it ever told us. Series not seen for a year are dropped.
function remember(events, memory = { series: {} }, now = new Date(), keysById = {}) {
  const mem = { ...(memory.series || {}) };
  const today = now.toISOString().slice(0, 10);
  const bySeries = new Map();
  for (const e of events) if (e.series) { if (!bySeries.has(e.series.id)) bySeries.set(e.series.id, []); bySeries.get(e.series.id).push(e); }
  for (const [id, list] of bySeries) {
    const was = mem[id] || {};
    // Only a date's own info counts (not what it was lent), so the memory never just copies itself
    const own = list.map(unlend);
    const best = own.sort((a, b) => richness(b) - richness(a))[0];
    const take = richness(best) >= richness(was) ? best : was;
    mem[id] = {
      title: list[0].title,
      keys: [...new Set([...(was.keys || []), ...(keysById[id] || [])])].slice(-20),
      venue: list[0].venue && list[0].venue.name,
      organizer: { name: (take.organizer && take.organizer.name) || NA },
      rule: list[0].series.rule || was.rule || null,
      description: has(take.description) ? take.description : NA,
      details: take.details || "",
      premise: take.premise || undefined,
      aiQualities: take.aiQualities || undefined,
      keywords: take.keywords || undefined,
      ...(take.tagSource === "ai" ? { tagSource: "ai", vibes: take.vibes, format: take.format, setting: take.setting } : {}),
      image: take.image || was.image || null,
      dates: [...new Set([...(was.dates || []), ...list.map((e) => e.startsAt.slice(0, 10))])].sort().slice(-30),
      firstSeen: was.firstSeen || today,
      lastSeen: today,
    };
  }
  for (const [id, s] of Object.entries(mem)) if (Date.parse(s.lastSeen) < now.getTime() - 365 * DAY) delete mem[id];
  return { note: "Written by events/run.js: what each recurring night is like, so a new date that says little gets it (lib/series.js).", updatedAt: now.toISOString(), series: mem };
}

function saveMemory(memory) {
  fs.mkdirSync(require("path").dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(memory, null, 1) + "\n");
}

module.exports = { link, remember, readMemory, saveMemory, coreTitle, keysOf, ruleFromDates, lend, unlend, FILE };
