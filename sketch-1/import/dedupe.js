// Finding the same event listed more than once: on two sites, several times on one site under different
// titles (one poster, five Eventbrite listings), or added from a poster when it's already listed.
// Used by the importer, by the server when it loads a fresh import, and when someone adds an event.
//
// Two listings are one event when they're at the same venue (close pins, and names that don't contradict
// each other) and
//   - start within 30 minutes and share the poster plus a few title words (one poster, five titles), or
//   - start within 30 minutes and share most of the title's words, or
//   - start within 75 minutes (doors vs show time on different sites) and have nearly the same title.
// When both have a poster and the posters differ, the titles must be nearly the same: a studio's "Moon lamp"
// and "Genie lamp" workshops at the same hour are two events. One poster at the same time at different
// venues (a chain's workshop at 30 community centres) stays separate, and so do titles that differ only by a
// number ("7 kinds of sake" vs "4 kinds of sake").
//
//   node import/dedupe.js    re-checks seed/events.json in place (the server picks it up on its next start)

const fs = require("fs");
const path = require("path");
const { km, NA } = require("./normalize");

// Words that say what kind of thing it is, not which one
const COMMON = new Set(("the and for with from at in on of to a an by w feat ft featuring presents presented live night nights show shows event events party edition special guest guests tour concert tickets ticket session sessions club vol volume part pt series official best new " +
  "class classes workshop workshops course lesson lessons cooking toronto downtown gta ontario on ca mississauga vaughan markham brampton oakville scarborough etobicoke york richmond hill").split(" "));
// Words in venue names that don't tell two venues apart
const VENUE_COMMON = new Set("the and of toronto bar club lounge hall room events event venue restaurant centre center nightclub cafe theatre theater house studio space gallery".split(" "));
const words = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
function titleWords(e) {
  const venue = new Set(words(e.venue && e.venue.name));
  return new Set(words(e.title).filter((w) => !COMMON.has(w) && !venue.has(w) && !/^\d+$/.test(w)).map(stem));
}
const numbers = (s) => new Set(String(s || "").match(/\b\d{1,3}\b/g) || []);
// Share of the shorter title's words that the other title also has
function titleSim(a, b) {
  const A = titleWords(a);
  const B = titleWords(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}
function numbersDiffer(a, b) {
  const A = numbers(a.title);
  const B = numbers(b.title);
  return A.size && B.size && ![...A].some((n) => B.has(n));
}

// The poster behind an image address, ignoring resize settings and image-proxy wrappers
function imageKey(url) {
  if (!url) return null;
  let u = String(url);
  try {
    u = decodeURIComponent(u);
  } catch {}
  u = u.slice(u.lastIndexOf("http") > 0 ? u.lastIndexOf("http") : 0).split("?")[0].toLowerCase();
  return u.replace(/^https?:\/\//, "");
}

const vname = (e) => (e.venue && e.venue.name !== NA ? words(e.venue.name).filter((w) => w !== "the").join(" ") : "");
// Names that clearly point at two different places ("44 Toronto" and "Lavelle" a block apart).
// A name that's just an address, or missing, doesn't contradict anything.
function namesClash(x, y) {
  if (!x || !y || /^\d/.test(x) || /^\d/.test(y)) return false;
  const A = x.split(" ").filter((w) => !VENUE_COMMON.has(w));
  const B = new Set(y.split(" ").filter((w) => !VENUE_COMMON.has(w)));
  return A.length > 0 && B.size > 0 && !A.some((w) => B.has(w));
}
function sameVenue(a, b) {
  if (!a.venue || !b.venue || !Number.isFinite(a.venue.lat) || !Number.isFinite(b.venue.lat)) return false; // quests published before venues were asked for
  const d = km(a.venue.lat, a.venue.lng, b.venue.lat, b.venue.lng);
  const x = vname(a);
  const y = vname(b);
  if (d < 0.25) return !namesClash(x, y);
  // Sites put the same venue's pin in slightly different places; the names have to agree then
  return d < 2 && !!x && !!y && (x.includes(y) || y.includes(x));
}

function same(a, b) {
  if (a.id === b.id) return true;
  const minutes = Math.abs(Date.parse(a.startsAt) - Date.parse(b.startsAt)) / 60000;
  if (minutes > 75 || !sameVenue(a, b)) return false;
  if (numbersDiffer(a, b)) return false;
  const sim = titleSim(a, b);
  const ia = imageKey(a.image);
  const ib = imageKey(b.image);
  if (ia && ib) {
    if (ia === ib) return minutes <= 30 && sim >= 0.34;
    if (sim < 0.9) return false; // different posters: only near-identical titles
  }
  return minutes <= 30 ? sim >= 0.5 : sim >= 0.8;
}

// How much a listing tells us, to keep the fuller one of two duplicates
const fullness = (e) => (e.price != null) + !!e.image + (e.description !== NA) + (e.organizer.name !== NA) + !!e.endsAt + !!(e.venue && e.venue.address !== NA);
// Which listing of a group to keep: one a host published or claimed, then one a member added, then the fullest
const rank = (e) => (e.publishedBy ? 100 : 0) + (e.submittedBy ? 50 : 0) + fullness(e);

// Fill the kept listing's gaps from the other one, and remember where else it's listed
function mergeInto(keep, other) {
  if (keep.price == null && other.price != null) Object.assign(keep, { price: other.price, priceNote: other.priceNote });
  if (!keep.image && other.image) keep.image = other.image;
  if ((!keep.description || keep.description === NA) && other.description && other.description !== NA) keep.description = other.description;
  if (keep.organizer.name === NA && other.organizer.name !== NA) keep.organizer = other.organizer;
  if (!keep.endsAt && other.endsAt) keep.endsAt = other.endsAt;
  if (keep.venue && other.venue && keep.venue.address === NA && other.venue.address !== NA) keep.venue = { ...keep.venue, address: other.venue.address };
  for (const v of other.vibes || []) if (keep.vibes && !keep.vibes.includes(v)) keep.vibes.push(v);
  // "Also listed on" only for another site (one site can list the same event twice)
  const also = [...(keep.alsoOn || []), ...(other.alsoOn || [])];
  if (other.source && other.source !== keep.source && other.sourceUrl) also.push({ source: other.source, url: other.sourceUrl });
  const seen = new Set();
  keep.alsoOn = also.filter((o) => o.source !== keep.source && !seen.has(o.source) && seen.add(o.source));
  if (!keep.alsoOn.length) delete keep.alsoOn;
  return keep;
}

const torontoDay = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

// Merge every group of duplicates into one listing. Returns { events (sorted by start), merged }
function dedupe(list) {
  const byDay = new Map();
  list.forEach((e, i) => {
    const day = torontoDay(e.startsAt);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(i);
  });
  // Union-find over the listings that match, a day at a time
  const parent = list.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const idx of byDay.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const [i, j] = [idx[x], idx[y]];
        if (root(i) !== root(j) && same(list[i], list[j])) parent[root(i)] = root(j);
      }
    }
  }
  const groups = new Map();
  list.forEach((e, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  const events = [];
  for (const g of groups.values()) {
    g.sort((a, b) => rank(b) - rank(a));
    events.push(g.slice(1).reduce(mergeInto, g[0]));
  }
  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { events, merged: list.length - events.length };
}

// The listing in `list` that `e` duplicates, if any
function findDuplicate(e, list) {
  return list.find((x) => x !== e && same(e, x)) || null;
}

module.exports = { dedupe, findDuplicate, mergeInto, same };

if (require.main === module) {
  const OUT = path.join(__dirname, "..", "seed", "events.json");
  const file = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const { events, merged } = dedupe(file.events);
  // A new importedAt, so the running app swaps the cleaned list in on its next start
  const out = { ...file, importedAt: new Date().toISOString(), dedupedFrom: file.importedAt, events };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
  console.log(`${file.events.length} listings → ${events.length} events (${merged} duplicates merged) in seed/events.json`);
}
