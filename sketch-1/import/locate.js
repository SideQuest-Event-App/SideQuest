// Venue coordinates the map can trust. Some listings come with no coordinates, or with ones that put the pin in
// Lake Ontario: Meetup events whose "venue" is only a Google plus code ("JM35+VH Toronto", a point the organizer
// dropped, often on the water), a sign flipped or lat/lng swapped, or 0,0. Before this, the importer only checked
// the GTA rectangle (which includes the lake) and the map drew whatever came.
//
// For each raw listing (before normalize.toEvent):
//   - coordinates on land in the GTA: kept as they are
//   - swapped (lng, lat) that land in the GTA: swapped back
//   - missing, 0,0, or in the lake: looked up with OpenStreetMap Nominatim (lib/geocode.js: generic User-Agent,
//     one request a second, cached) from the venue's name and street address. A plus code is never sent as the
//     query: it would only find the same bad point.
//   - nothing found: a listing that had coordinates (they were just wrong) stays, with venue.noPin set and no
//     coordinates: it shows in lists but never on the map. One with no location at all is left out, as before.
// Never a guessed point. Coordinates outside the GTA (but not in the lake) are left alone: run.js drops those events.
//
// GEOCODE=1 turns the lookups on (the workflow sets it); GEOCODE_MAX caps them per run (default 300, about 5 minutes).

const { onMap, inGTA, inLake } = require("../lib/gta");

const PLUS_CODE = /^\s*[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const isPlusCode = (s) => PLUS_CODE.test(String(s || ""));

// What's wrong with a venue's coordinates: null (fine), "missing", "swapped", "lake", "outside"
function problem(venue) {
  const lat = num(venue && venue.lat), lng = num(venue && venue.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return "missing";
  if (onMap(lat, lng)) return null;
  if (onMap(lng, lat)) return "swapped";
  if (inLake(lat, lng) && inGTA(lat, lng)) return "lake";
  return "outside";
}

// raws: raw listings (mutated in place and returned). opts.geocode: (query) => { lat, lng } | null
async function fix(raws, { geocode = null, max = Number(process.env.GEOCODE_MAX || 300), log = () => {} } = {}) {
  const counts = { ok: 0, swapped: 0, geocoded: 0, noPin: 0, missing: 0, outside: 0, lookups: 0 };
  const memo = new Map();
  for (const r of raws || []) {
    if (!r || !r.venue) { if (r) r.venue = {}; }
    const v = r.venue;
    const p = problem(v);
    if (!p) { counts.ok++; continue; }
    if (p === "outside") { counts.outside++; continue; }
    if (p === "swapped") { [v.lat, v.lng] = [num(v.lng), num(v.lat)]; counts.swapped++; continue; }
    const name = isPlusCode(v.name) ? "" : String(v.name || "").trim();
    const address = isPlusCode(v.address) ? "" : String(v.address || "").trim();
    const queries = [name && address ? `${name}, ${address}` : "", address, name].filter((q, i, a) => q && q.length > 3 && a.indexOf(q) === i);
    let hit = null;
    if (geocode) {
      for (const q of queries) {
        if (memo.has(q)) { hit = memo.get(q); if (hit) break; continue; }
        if (counts.lookups >= max) break;
        counts.lookups++;
        let g = null;
        try { g = await geocode(q); } catch { g = null; }
        g = g && onMap(g.lat, g.lng) ? g : null;
        memo.set(q, g);
        if (g) { hit = g; break; }
      }
    }
    if (hit) {
      v.lat = hit.lat;
      v.lng = hit.lng;
      if (!address && hit.address) v.address = hit.address;
      counts.geocoded++;
    } else if (p === "lake") {
      v.lat = null;
      v.lng = null;
      v.noPin = true; // listed, never pinned
      counts.noPin++;
    } else counts.missing++;
  }
  if (log && (counts.geocoded || counts.noPin || counts.swapped)) log(`  locations: ${counts.geocoded} looked up, ${counts.swapped} swapped back, ${counts.noPin} kept off the map (no trustworthy point)`);
  return counts;
}

module.exports = { fix, problem, isPlusCode };
