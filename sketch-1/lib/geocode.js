// Venue name or street address -> map coordinates, from OpenStreetMap's Nominatim, within its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/):
//   - an honest, generic User-Agent naming the app ("SideQuest-class-project"); never a person's name or email
//   - at most one request a second, across everything in this process (a single queue, even for parallel callers)
//   - every answer cached (data/geocode.json, or GEOCODE_CACHE), misses too, so a venue is looked up once;
//     a failed request isn't cached, so it's tried again on a later run
//   - no bulk or heavy use: the import asks only for venues whose coordinates are missing or wrong (import/locate.js),
//     capped per run (GEOCODE_MAX)
// Results are bounded to the Greater Toronto Area.
//
//   const { geocode } = require("./geocode");             the shared instance (sketch-1/data/geocode.json)
//   const g = require("./geocode").create({ cacheFile, fetchImpl, gapMs });   your own (tests, sketch-2)

const fs = require("fs");
const path = require("path");

const UA = "SideQuest-class-project";
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
// Greater Toronto, so "The Garrison" finds the one on Dundas
const VIEWBOX = "-80.1,44.15,-78.8,43.35";
const DEFAULT_CACHE = () => process.env.GEOCODE_CACHE || path.join(__dirname, "..", "data", "geocode.json");

function create({ cacheFile = DEFAULT_CACHE(), fetchImpl = (...a) => fetch(...a), gapMs = 1100, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let cache = null;
  let queue = Promise.resolve();
  let last = 0;
  const stats = { requests: 0, cached: 0, failed: 0 };

  function load() {
    if (!cache) {
      try {
        cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      } catch {
        cache = {};
      }
    }
    return cache;
  }
  function save() {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
    } catch {}
  }
  // One request at a time, at least gapMs apart
  function slot() {
    const turn = queue.then(async () => {
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
    });
    queue = turn.catch(() => {});
    return turn;
  }

  // Returns { lat, lng, address } or null if nothing in the GTA matches (or the lookup failed: not cached)
  async function geocode(query) {
    const q = String(query || "").trim().replace(/\s+/g, " ");
    if (!q) return null;
    const c = load();
    const key = q.toLowerCase();
    if (key in c) {
      stats.cached++;
      return c[key];
    }
    await slot();
    if (key in c) { stats.cached++; return c[key]; } // a parallel caller asked the same thing while we waited
    stats.requests++;
    let hit = null;
    try {
      const url = `${ENDPOINT}?${new URLSearchParams({ q: /toronto|ontario|\bon\b/i.test(q) ? q : `${q}, Toronto, Ontario`, format: "jsonv2", limit: "1", countrycodes: "ca", viewbox: VIEWBOX, bounded: "1", addressdetails: "1" })}`;
      const res = await fetchImpl(url, { headers: { "user-agent": UA, "accept-language": "en-CA" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) { stats.failed++; return null; }
      const [r] = await res.json();
      if (r) {
        const a = r.address || {};
        const street = [a.house_number, a.road].filter(Boolean).join(" ");
        hit = { lat: Number(r.lat), lng: Number(r.lon), address: [street, a.city || a.town || "Toronto"].filter(Boolean).join(", ") };
      }
    } catch {
      stats.failed++;
      return null;
    }
    c[key] = hit;
    save();
    return hit;
  }
  return { geocode, stats, UA };
}

const shared = create();
module.exports = { geocode: shared.geocode, stats: shared.stats, create, UA, ENDPOINT };
