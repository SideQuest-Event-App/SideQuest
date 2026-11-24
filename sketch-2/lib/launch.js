// The launch map (Discover, map first): the "You · <neighbourhood>" label, and the places shown beside events.
//
// Location: the app sends a point already rounded to 2 decimals (about 1 km); we round again, name the
// neighbourhood with Sketch 1's place() helper, and keep nothing.
//
// Places come from Google Places (lib/sidekick/places.js): at most one search per map session. The map asks only for
// Pro fields (name, pin, link: no rating, price or hours), so it's counted on its own meter (places_search_pro, the
// larger Pro allowance); it still steps aside when the planning calls' Enterprise meter is near its cap (we leave
// LAUNCH_PLACES_HEADROOM searches for planning calls, which need them more). The search uses the person's strongest
// vibe, mapped to Google place types or a query for every one of the app's 21 vibes (places.js VIBE_PLACES). Google's terms
// don't let us keep ratings, hours or prices, so results live in this process's memory for the session
// only (SESSION_MS) and are never written anywhere. When places are off or capped, the map shows events only.

const places = require("./sidekick/places");
const usage = require("./sidekick/usage");
const { place } = require("../../sketch-1/import/normalize");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const okPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng);
const DOWNTOWN = { lat: 43.65, lng: -79.38 };

// "Kensington Market", or "outside Toronto"
function where(latIn, lngIn) {
  const lat = round2(latIn), lng = round2(lngIn);
  if (!okPoint(lat, lng)) return { label: null };
  const p = place(lat, lng, "Toronto");
  return { label: p.area === "Beyond Toronto" ? "Outside Toronto" : p.neighbourhood, area: p.area };
}

// Sidekick's broad vibe for a person's vibes (kept for callers that use it)
const VIBE_QUERY = [
  ["music", ["Live music", "Jazz", "Indie gigs", "Records & vinyl"]], ["comedy", ["Comedy"]], ["games", ["Games & social", "Anime & cosplay"]],
  ["dance", ["Dance", "Electronic"]], ["arts", ["Art & making", "Zines & print", "Photography", "Film nights", "Writing & poetry"]], ["food", ["Food & drink", "Markets"]],
];
const queryFor = (vibes) => {
  for (const v of vibes || []) {
    const hit = VIBE_QUERY.find(([, list]) => list.includes(v));
    if (hit) return hit[0];
  }
  return "default";
};

const SESSION_MS = 3 * 3600 * 1000;
const sessions = new Map(); // map session id -> { at, out (a promise) }
const HEADROOM = () => Math.max(0, Number(process.env.LAUNCH_PLACES_HEADROOM || 10));
function sweep() {
  const cut = Date.now() - SESSION_MS;
  for (const [k, v] of sessions) if (v.at < cut) sessions.delete(k);
}

// Toronto's weekday (0 = Sunday) and hour right now, for "Open until 1 AM"
function torontoNow() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday").value);
  return { day, hour: Number(parts.find((p) => p.type === "hour").value) % 24 };
}

function card(c, loc, now) {
  const open = places.openAt(c.hours, now.day, now.hour);
  const hours = open == null ? "Hours on Google Maps" : open ? `${places.closesLabel(c.hours, now.day, now.hour)} · drop in any time` : "Closed right now";
  const price = c.priceNote && c.price != null ? `${c.priceNote} · about $${c.price} each` : c.priceNote || (c.price != null ? `About $${c.price} each` : "Price not listed");
  return {
    id: `p${String(c.id).replace(/\D/g, "")}`,
    kind: "place",
    title: c.title,
    type: places.placeType(c.tags),
    hood: c.neighbourhood,
    lat: loc.latitude,
    lng: loc.longitude,
    open,
    hours,
    price,
    url: c.mapsUrl,
    attribution: "Google Maps",
  };
}

async function search({ lat, lng, vibes }) {
  if (!places.configured()) return { places: [], reason: "off" };
  if (!(await usage.available("places_text_search", 1 + HEADROOM()))) return { places: [], reason: "capped" };
  if (!(await usage.available("places_search_pro", 1))) return { places: [], reason: "capped" };
  // Keep each result's location (places.js leaves it out of what it returns), matched up by place id
  const raw = new Map();
  const fetchImpl = async (url, opts) => {
    const res = await fetch(url, opts);
    if (!res.ok) return res;
    const data = await res.json();
    for (const p of data.places || []) if (p.id && p.location) raw.set(p.id, p.location);
    return { ok: true, json: async () => data };
  };
  const at = okPoint(lat, lng) ? { lat, lng } : DOWNTOWN;
  // The person's first vibe that has a place search of its own (every app vibe does), else Sidekick's broad query
  const vibe = (vibes || []).find((v) => places.VIBE_PLACES[v]) || queryFor(vibes);
  const out = await places.search(vibe, { fetchImpl, origins: [at], tier: "pro" });
  const now = torontoNow();
  const list = out.places.filter((c) => raw.has(c.placeId)).map((c) => card(c, raw.get(c.placeId), now))
    .sort((a, b) => (b.open === true) - (a.open === true)); // open now first
  return { places: list.slice(0, 10), reason: out.capped || (out.error ? "unavailable" : null) };
}

// Places near a point, once per map session. Never throws: any trouble is just "no places".
async function nearby({ sessionId, lat, lng, vibes } = {}) {
  sweep();
  const key = String(sessionId || "").slice(0, 40);
  if (!/^[\w-]{6,40}$/.test(key)) return { places: [], reason: "no session" };
  const hit = sessions.get(key);
  if (hit) return hit.out;
  const out = search({ lat: round2(lat), lng: round2(lng), vibes: Array.isArray(vibes) ? vibes.slice(0, 20).map(String) : [] })
    .catch(() => ({ places: [], reason: "unavailable" }));
  sessions.set(key, { at: Date.now(), out });
  return out;
}

module.exports = { where, nearby, queryFor, _sessions: sessions };
