// Places that don't need a ticket (bars, karaoke, arcades, galleries, late-night food), from the
// Google Places API (New). Every search reserves from the usage meter first (usage.js), so the app
// stops searching before it reaches Google's free monthly allowance.
//
// Google's terms: we may keep place IDs, and coordinates for up to 30 days, but not ratings, hours or
// prices. So results live only in the call's memory and go when the call ends. Results shown to people
// carry Google Maps attribution.
//
// Needs GOOGLE_MAPS_API_KEY (restricted to the Places API (New)). Without it, places are simply off.

const usage = require("./usage");
const { travel, place } = require("../../../sketch-1/import/normalize");

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
// Only the fields we use. Rating, price and hours put the request in Google's "Enterprise" tier,
// which is why the meter counts against that tier's free allowance.
const FIELDS = ["id", "displayName", "formattedAddress", "location", "types", "primaryType", "priceLevel", "priceRange", "rating", "userRatingCount", "regularOpeningHours", "googleMapsUri"].map((f) => `places.${f}`).join(",");
const CITY = () => process.env.SIDEKICK_CITY || "Toronto, ON";
const CENTER = { latitude: 43.6532, longitude: -79.3832 }; // downtown Toronto; 15 km covers the city
const PER_CALL = () => Number(process.env.SIDEKICK_PLACES_PER_CALL || 2); // most searches one planning call may use

// One search per vibe, worded the way people search
const QUERY = { music: "live music bar", comedy: "comedy club", games: "arcade bar or board game cafe", dance: "dance club", arts: "art gallery open late", food: "late night restaurant", default: "cocktail bar" };
const VIBE_TAGS = { music: ["Live music"], comedy: ["Comedy"], games: ["Games & social"], dance: ["Dance"], arts: ["Art & making"], food: [], default: [] };
// Google place types that tell us the vibe on their own
const TYPE_TAGS = { night_club: ["Dance"], karaoke: ["Games & social"], bowling_alley: ["Games & social"], amusement_center: ["Games & social"], video_arcade: ["Games & social"], comedy_club: ["Comedy"], art_gallery: ["Art & making"], museum: ["Art & making"], movie_theater: ["Film nights"], live_music_venue: ["Live music"], concert_hall: ["Live music"] };
// Rough per-person spend for Google's price levels (used only when there's no price range)
const LEVEL_PRICE = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 15, PRICE_LEVEL_MODERATE: 30, PRICE_LEVEL_EXPENSIVE: 60, PRICE_LEVEL_VERY_EXPENSIVE: 100 };
const LEVEL_SIGNS = { PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };

const configured = () => Boolean(process.env.GOOGLE_MAPS_API_KEY) && process.env.SIDEKICK_PLACES_OFF !== "1";
const available = async () => configured() && (await usage.available("places_text_search"));

// A stable negative number id, so places never clash with event ids (positive) and votes work the same way
function numId(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return -Math.abs(h || 1);
}

function toCandidate(p, vibe) {
  const lat = p.location && p.location.latitude;
  const lng = p.location && p.location.longitude;
  if (lat == null || lng == null) return null;
  const where = place(lat, lng, "Toronto");
  const start = p.priceRange && p.priceRange.startPrice && Number(p.priceRange.startPrice.units);
  const price = Number.isFinite(start) ? start : p.priceLevel in LEVEL_PRICE ? LEVEL_PRICE[p.priceLevel] : null;
  const tags = new Set([...(VIBE_TAGS[vibe] || []), ...(p.types || []).flatMap((t) => TYPE_TAGS[t] || [])]);
  const title = (p.displayName && p.displayName.text) || "A place nearby";
  return {
    id: numId(p.id),
    type: "place",
    placeId: p.id,
    title,
    venue: { name: title },
    address: p.formattedAddress || "",
    neighbourhood: where.neighbourhood,
    area: where.area,
    price,
    priceNote: p.priceLevel ? LEVEL_SIGNS[p.priceLevel] : null,
    vibes: [...tags],
    tags: p.types || [],
    rating: p.rating || null,
    ratingCount: p.userRatingCount || 0,
    reviews: [],
    going: 0,
    hours: (p.regularOpeningHours && p.regularOpeningHours.periods) || null,
    travel: travel(lat, lng),
    mapsUrl: p.googleMapsUri || null,
    source: "Google Maps",
  };
}

// Search once. Returns { places, capped } and never throws (a failed search just means no places).
async function search(vibe, { fetchImpl = fetch } = {}) {
  if (!configured()) return { places: [], capped: "not configured" };
  const ok = await usage.reserve("places_text_search", 1);
  if (!ok.ok) return { places: [], capped: ok.reason };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GOOGLE_MAPS_API_KEY, "x-goog-fieldmask": FIELDS },
      body: JSON.stringify({ textQuery: `${QUERY[vibe] || QUERY.default} in ${CITY()}`, pageSize: 10, locationBias: { circle: { center: CENTER, radius: 15000 } } }),
    });
    if (!res.ok) throw new Error(`Google Places search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return { places: (data.places || []).map((p) => toCandidate(p, vibe)).filter(Boolean), capped: null };
  } catch (err) {
    console.error(err.message);
    return { places: [], capped: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Places for one call: up to PER_CALL searches, one per vibe the crew wants (or a default)
async function forCall(vibes, opts) {
  const list = [...new Set([...(vibes || []), "default"])].slice(0, PER_CALL());
  const seen = new Map();
  let capped = null;
  for (const v of list) {
    const out = await search(v, opts);
    if (out.capped) capped = out.capped;
    for (const p of out.places) if (!seen.has(p.id)) seen.set(p.id, p);
    if (out.capped && out.capped !== "not configured") break; // over the limit: stop searching
  }
  return { places: [...seen.values()], capped };
}

// Is a place open at local hour `hour` on weekday `day` (0 = Sunday)? null when we don't know.
function openAt(periods, day, hour) {
  if (!periods || !periods.length) return null;
  const t = day * 24 * 60 + hour * 60;
  const WEEK = 7 * 24 * 60;
  for (const p of periods) {
    if (!p.open) continue;
    const o = p.open.day * 1440 + (p.open.hour || 0) * 60 + (p.open.minute || 0);
    if (!p.close) return true; // open around the clock
    let c = p.close.day * 1440 + (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (c <= o) c += WEEK; // closes after midnight into the next week
    if ((t >= o && t < c) || (t + WEEK >= o && t + WEEK < c)) return true;
  }
  return false;
}

// When it closes that day, for the pick card ("Open until 1 AM")
function closesLabel(periods, day, hour) {
  if (!periods) return "Check opening hours";
  const t = day * 1440 + hour * 60;
  for (const p of periods) {
    if (!p.open || !p.close) continue;
    const o = p.open.day * 1440 + (p.open.hour || 0) * 60;
    let c = p.close.day * 1440 + (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (c <= o) c += 7 * 1440;
    if (t >= o && t < c) {
      const h = (p.close.hour || 0) % 24;
      const m = p.close.minute || 0;
      return `Open until ${h === 0 ? 12 : h > 12 ? h - 12 : h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
    }
  }
  return "Open that evening";
}

module.exports = { configured, available, search, forCall, openAt, closesLabel, toCandidate, FIELDS, _numId: numId };
