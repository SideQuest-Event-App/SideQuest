// A second place source beside Google Places: Foursquare's Places API, for its rich categories ("Xinjiang
// Restaurant", "Karaoke Bar", "Hot Pot Restaurant"). Used for live search only (planning calls and Discover); nothing
// it returns is stored, and every result shown carries Foursquare attribution.
//
// API (Foursquare's current Places API, checked November 2026):
//   GET https://places-api.foursquare.com/places/search?query=&ll=lat,lng&radius=&limit=
//   headers: Authorization: Bearer <Service API key>, X-Places-Api-Version: 2025-06-17, Accept: application/json
//   Only Pro fields are asked for (name, coordinates, categories, address, link), which Foursquare's pricing page
//   says carry a free allowance (10,000 Pro calls a month at the time of writing; their console's Billing page is
//   the source of truth). Premium fields (rating, hours, price, tips, photos) cost more and are never asked for.
//   Docs: https://docs.foursquare.com/fsq-developers-places/reference/place-search
//   Terms: https://foursquare.com/legal/terms/enterprise-developermasterterms/  (attribution required where the data
//   is shown: we label each card "Place info from Foursquare")
//
// Needs FOURSQUARE_API_KEY (a Service API key from https://foursquare.com/developers/). Without it this is off.
// Every search reserves from the usage meter first (usage.js "foursquare_places"), like places.js.

const usage = require("./usage");
const { travel, place } = require("../../../events/lib/normalize");

const HOST = () => process.env.FOURSQUARE_HOST || "https://places-api.foursquare.com";
const VERSION = () => process.env.FOURSQUARE_API_VERSION || "2025-06-17";
const FIELDS = "fsq_place_id,name,latitude,longitude,categories,location,link";
const configured = () => Boolean(process.env.FOURSQUARE_API_KEY) && process.env.FOURSQUARE_OFF !== "1";
const available = async () => configured() && (await usage.available("foursquare_places"));

function numId(s) {
  let h = 7;
  for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) | 0;
  return -Math.abs(h || 1);
}

// Foursquare category names -> the Google types the rest of the app reads (placeType, TYPE_TAGS)
const CAT_TYPES = [[/karaoke/i, "karaoke"], [/night ?club|dance club/i, "night_club"], [/comedy/i, "comedy_club"], [/music venue|jazz|concert/i, "live_music_venue"], [/arcade/i, "video_arcade"], [/bowling/i, "bowling_alley"], [/gallery/i, "art_gallery"], [/museum/i, "museum"], [/movie|cinema/i, "movie_theater"], [/pub/i, "pub"], [/bar|lounge|speakeasy/i, "bar"], [/caf[eé]|coffee|tea/i, "cafe"], [/restaurant|joint|diner|bistro|eatery|steakhouse|food|bbq|noodle|dumpling|kebab|bakery/i, "restaurant"]];
function typesOf(cats) {
  const names = (cats || []).map((c) => c.name || "");
  return [...new Set(names.flatMap((n) => CAT_TYPES.filter(([re]) => re.test(n)).map(([, t]) => t)))];
}

function toCandidate(r) {
  const lat = Number(r.latitude != null ? r.latitude : r.geocodes && r.geocodes.main && r.geocodes.main.latitude);
  const lng = Number(r.longitude != null ? r.longitude : r.geocodes && r.geocodes.main && r.geocodes.main.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = r.fsq_place_id || r.fsq_id;
  if (!id || !r.name) return null;
  const where = place(lat, lng, "Toronto");
  const cats = (r.categories || []).map((c) => ({ id: c.fsq_category_id || c.id, name: c.name || c.short_name || "" }));
  return {
    id: numId(`fsq:${id}`),
    type: "place",
    placeId: `fsq:${id}`,
    title: r.name,
    venue: { name: r.name },
    address: (r.location && (r.location.formatted_address || r.location.address)) || "",
    neighbourhood: where.neighbourhood,
    area: where.area,
    lat, lng,
    price: null,
    priceNote: null,
    vibes: [],
    tags: typesOf(cats),
    categories: cats,
    rating: null,
    ratingCount: 0,
    reviews: [],
    going: 0,
    hours: null,
    travel: travel(lat, lng),
    mapsUrl: `https://foursquare.com/v/${encodeURIComponent(id)}`,
    source: "Foursquare",
    attribution: "Foursquare",
  };
}

// One search near a point. Returns { places, capped } and never throws.
async function search(query, { center, radius = 8000, limit = 10, fetchImpl = fetch } = {}) {
  if (!configured()) return { places: [], capped: "not configured" };
  const q = String(query || "").trim().slice(0, 80);
  if (!q) return { places: [], capped: null };
  const ok = await usage.reserve("foursquare_places", 1);
  if (!ok.ok) return { places: [], capped: ok.reason };
  const c = center || { latitude: 43.6532, longitude: -79.3832 };
  const params = new URLSearchParams({ query: q, ll: `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`, radius: String(Math.min(100000, Math.round(radius))), limit: String(limit), fields: FIELDS });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetchImpl(`${HOST()}/places/search?${params}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`, "x-places-api-version": VERSION() },
    });
    if (!res.ok) throw new Error(`Foursquare search failed (${res.status})`);
    const data = await res.json();
    return { places: (data.results || []).map(toCandidate).filter(Boolean), capped: null };
  } catch (err) {
    console.error(err.message);
    return { places: [], capped: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { configured, available, search, toCandidate, typesOf, FIELDS };
