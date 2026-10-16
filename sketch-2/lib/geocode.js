// Venue name or street address → map coordinates, for events read off posters that name a venue we
// don't know yet. Uses OpenStreetMap's free Nominatim service within its usage policy (an honest
// user agent, at most one request a second, every answer cached in data/geocode.json).

const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, "..", "data", "geocode.json");
const UA = "SidequestSketch/1.0 (university student prototype; occasional venue lookups)";
// Greater Toronto, so "The Garrison" finds the one on Dundas
const VIEWBOX = "-80.1,44.15,-78.8,43.35";

let cache = null;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function load() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    } catch {
      cache = {};
    }
  }
  return cache;
}

// Returns { lat, lng, address } or null if nothing in the GTA matches
async function geocode(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const c = load();
  const key = q.toLowerCase();
  if (key in c) return c[key];
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let hit = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: /toronto|ontario|\bon\b/i.test(q) ? q : `${q}, Toronto, Ontario`, format: "jsonv2", limit: "1", countrycodes: "ca", viewbox: VIEWBOX, bounded: "1", addressdetails: "1" })}`;
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-CA" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null; // not cached, so it's tried again later
    const [r] = await res.json();
    if (r) {
      const a = r.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(" ");
      hit = { lat: Number(r.lat), lng: Number(r.lon), address: [street, a.city || a.town || "Toronto"].filter(Boolean).join(", ") };
    }
  } catch {
    return null;
  }
  c[key] = hit;
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(c));
  return hit;
}

module.exports = { geocode };
