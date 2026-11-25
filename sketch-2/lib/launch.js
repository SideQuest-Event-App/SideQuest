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

//
// Discover's free-text search ("Chinese skewers", "karaoke with private rooms") also searches places, in the
// person's words (forQuery below): one search per distinct query per SESSION_MS, Pro fields only, on the same meters,
// with Foursquare beside Google when its key is set. Only results that match the words are returned.

const places = require("./sidekick/places");
const usage = require("./sidekick/usage");
const fsq = require("./sidekick/foursquare");
const want = require("./search/want");
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
    attribution: c.attribution || "Google Maps",
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

// Places for a typed search, in the person's words. Returns { places, want, reason }. The words are cleaned first
// (no numbers, amounts or areas go to Google), and only places that match them come back, best match first.
const queries = new Map(); // cleaned query + rounded point -> { at, out }
async function forQuery({ query, lat, lng } = {}) {
  sweep();
  const words = want.find(query);
  const wants = words.length ? words : [want.loose(query)].filter(Boolean);
  if (!wants.length) return { places: [], want: null, reason: "nothing specific" };
  if (!places.configured() && !fsq.configured()) return { places: [], want: wants, reason: "off" };
  const at = okPoint(round2(lat), round2(lng)) ? { lat: round2(lat), lng: round2(lng) } : DOWNTOWN;
  const key = `${wants.join("|").toLowerCase()}@${at.lat},${at.lng}`;
  const hit = queries.get(key);
  if (hit && Date.now() - hit.at < SESSION_MS) return hit.out;
  const out = (async () => {
    // Leave the planning calls their headroom, as the map does
    const googleOk = places.configured() && (await usage.available("places_text_search", 1 + HEADROOM())) && (await usage.available("places_search_pro", 1));
    if (!googleOk && !fsq.configured()) return { places: [], want: wants, reason: "capped" };
    const res = await (googleOk ? places.searchWant(wants, { origins: [at], tier: "pro" }) : (async () => {
      const plan = want.plan(wants);
      const f = await fsq.search(plan.query, { center: { latitude: at.lat, longitude: at.lng }, radius: 8000 });
      return { places: f.places.map((p) => ({ ...p, wantQuery: plan.query })), capped: f.capped, plan };
    })());
    const plan = res.plan || want.plan(wants);
    const now = torontoNow();
    const list = res.places.filter((c) => c.lat != null)
      .map((c) => ({ c, r: want.relevance(c, plan) }))
      .filter((x) => x.r >= want.MIN_RELEVANCE)
      .sort((a, b) => b.r - a.r)
      .map(({ c, r }) => ({ ...card(c, { latitude: c.lat, longitude: c.lng }, now), relevance: Math.round(r * 100) / 100 }));
    return { places: list.slice(0, 10), want: wants, reason: res.capped || null };
  })().catch(() => ({ places: [], want: wants, reason: "unavailable" }));
  queries.set(key, { at: Date.now(), out });
  if (queries.size > 500) queries.delete(queries.keys().next().value);
  return out;
}

// Places near a point, once per map session. Never throws: any trouble is just "no places".
// With a query (Discover's search box), the places for those words instead (forQuery).
async function nearby({ sessionId, lat, lng, vibes, query } = {}) {
  if (query) return forQuery({ query: String(query).slice(0, 120), lat, lng });
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

module.exports = { where, nearby, forQuery, queryFor, _sessions: sessions, _queries: queries };
