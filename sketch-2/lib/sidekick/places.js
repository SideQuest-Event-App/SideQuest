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
const fsq = require("./foursquare");
const want = require("../search/want");
const { travel, place } = require("../../../sketch-1/import/normalize");

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const NEARBY = "https://places.googleapis.com/v1/places:searchNearby";
// Only the fields we use. Rating, price and hours put the request in Google's "Enterprise" tier,
// which is why the meter counts against that tier's free allowance. Planning calls need hours, so they use these.
const FIELDS = ["id", "displayName", "formattedAddress", "location", "types", "primaryType", "priceLevel", "priceRange", "rating", "userRatingCount", "regularOpeningHours", "googleMapsUri"].map((f) => `places.${f}`).join(",");
// The map only needs a name, a pin and a link: no rating, price or hours keeps the request in the "Pro" tier, which
// has its own, larger free allowance (about 5,000 a month against Enterprise's 1,000; see usage.js). Check the tier of
// each field on Google's pricing sheet before changing this list.
const PRO_FIELDS = ["id", "displayName", "formattedAddress", "location", "types", "primaryType", "googleMapsUri"].map((f) => `places.${f}`).join(",");
// A search for what someone asked for adds the editorial summary, so a pick can be checked against the request
// ("Xinjiang-style lamb skewers"). That field is in Google's "Enterprise + Atmosphere" SKU, its own meter.
const WANT_FIELDS = `${FIELDS},places.editorialSummary`;
const TIERS = { enterprise: { fields: FIELDS, meter: "places_text_search" }, pro: { fields: PRO_FIELDS, meter: "places_search_pro" }, want: { fields: WANT_FIELDS, meter: "places_search_atmosphere" } };
const CITY = () => process.env.SIDEKICK_CITY || "Toronto, ON";
const CENTER = { latitude: 43.6532, longitude: -79.3832 }; // downtown Toronto; 15 km covers the city
// Where each starting point is, so places are searched near the crew rather than always downtown
const STATIONS = { union: [43.6453, -79.3806], finch: [43.7806, -79.4155], kennedy: [43.7323, -79.2637], kipling: [43.6372, -79.5361] };
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2));
};
// Someone's shared location (already rounded to about 1 km): the station whose travel times stand in
// for theirs, and the neighbourhood the crew sees ("near Koreatown"). Coordinates go no further.
function nearestStation(lat, lng) {
  return Object.entries(STATIONS).map(([k, p]) => [k, km([lat, lng], p)]).sort((a, b) => a[1] - b[1])[0][0];
}
function nearLabel(lat, lng) {
  const where = place(lat, lng, "Toronto");
  return where.area === "Beyond Toronto" ? "outside Toronto" : `near ${where.neighbourhood}`;
}
// The search circle for a crew: centred between everyone's starting points, wide enough to reach
// the middle from each of them (5 to 15 km). No known starting points: downtown, 15 km.
// An origin is a station ("union") or a shared location ({ lat, lng }, rounded).
function nearCrew(origins) {
  const pt = (o) => (o && typeof o === "object" ? (Number.isFinite(o.lat) && Number.isFinite(o.lng) ? [o.lat, o.lng] : null) : STATIONS[o]);
  const pts = [...new Map((origins || []).map(pt).filter(Boolean).map((p) => [p.join(","), p])).values()];
  if (!pts.length) return { center: CENTER, radius: 15000 };
  const mid = [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
  const reach = Math.max(...pts.map((p) => km(p, mid)));
  return { center: { latitude: mid[0], longitude: mid[1] }, radius: Math.round(Math.min(15000, Math.max(5000, reach * 1000 * 0.75))) };
}
const PER_CALL = () => Number(process.env.SIDEKICK_PLACES_PER_CALL || 2); // most searches one planning call may use

// One search per vibe, worded the way people search
const QUERY = { music: "live music bar", comedy: "comedy club", games: "arcade bar or board game cafe", dance: "dance club", arts: "art gallery open late", food: "late night restaurant", default: "cocktail bar" };
const VIBE_TAGS = { music: ["Live music"], comedy: ["Comedy"], games: ["Games & social"], dance: ["Dance"], arts: ["Art & making"], food: [], default: [] };
// Every app vibe -> how to find places for it: Google place types for Nearby Search where a type says it exactly,
// otherwise a Text Search query worded the way people search. Types are from Google's Table A (Places API New);
// the ones used for includedTypes are limited to types this code already reads back from Google (TYPE_TAGS) or
// that are long-standing (bar, cafe, park...). If Google rejects a type, the search falls back to the query.
const VIBE_PLACES = {
  "Live music": { query: "live music bar", tags: ["Live music"] },
  Jazz: { query: "jazz bar", tags: ["Jazz", "Live music"] },
  "Indie gigs": { query: "indie music venue", tags: ["Indie gigs", "Live music"] },
  Comedy: { query: "comedy club", tags: ["Comedy"] },
  Dance: { types: ["night_club"], query: "dance club", tags: ["Dance"] },
  Electronic: { types: ["night_club"], query: "techno club", tags: ["Electronic", "Dance"] },
  "Records & vinyl": { query: "record store", tags: ["Records & vinyl"] },
  "Film nights": { types: ["movie_theater"], query: "independent cinema", tags: ["Film nights"] },
  "Zines & print": { query: "independent bookstore zines", tags: ["Zines & print"] },
  "Art & making": { types: ["art_gallery"], query: "art gallery open late", tags: ["Art & making"] },
  Photography: { query: "photography gallery", tags: ["Photography", "Art & making"] },
  "Writing & poetry": { query: "independent bookstore", tags: ["Writing & poetry"] },
  "Tech & coding": { query: "board game cafe", tags: ["Tech & coding", "Games & social"] },
  "Anime & cosplay": { types: ["video_arcade"], query: "anime cafe or arcade", tags: ["Anime & cosplay", "Games & social"] },
  Outdoors: { types: ["park"], query: "park", tags: ["Outdoors"] },
  "Run & ride": { types: ["park"], query: "running trail", tags: ["Run & ride", "Outdoors"] },
  Climbing: { query: "bouldering gym", tags: ["Climbing"] },
  "Games & social": { types: ["bowling_alley", "karaoke", "video_arcade", "amusement_center"], query: "arcade bar or board game cafe", tags: ["Games & social"] },
  "Food & drink": { types: ["restaurant", "bar"], query: "late night restaurant", tags: ["Food & drink"] },
  Markets: { query: "market", tags: ["Markets"] },
  Wellness: { query: "yoga studio or spa", tags: ["Wellness"] },
};
// Sidekick's broad vibes (music, comedy...) keep their Text Search queries; an app vibe name uses VIBE_PLACES
function planFor(vibe) {
  if (VIBE_PLACES[vibe]) return VIBE_PLACES[vibe];
  return { query: QUERY[vibe] || QUERY.default, tags: VIBE_TAGS[vibe] || [] };
}
// Google place types that tell us the vibe on their own
const TYPE_TAGS = { night_club: ["Dance"], karaoke: ["Games & social"], bowling_alley: ["Games & social"], amusement_center: ["Games & social"], video_arcade: ["Games & social"], comedy_club: ["Comedy"], art_gallery: ["Art & making"], museum: ["Art & making"], movie_theater: ["Film nights"], live_music_venue: ["Live music"], concert_hall: ["Live music"] };
// Rough per-person spend for Google's price levels (used only when there's no price range)
const LEVEL_PRICE = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 15, PRICE_LEVEL_MODERATE: 30, PRICE_LEVEL_EXPENSIVE: 60, PRICE_LEVEL_VERY_EXPENSIVE: 100 };
const LEVEL_SIGNS = { PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };

const configured = () => Boolean(process.env.GOOGLE_MAPS_API_KEY) && process.env.SIDEKICK_PLACES_OFF !== "1";
// Places are on for a call when either source can still search (Google under its cap, or Foursquare)
const available = async () => (configured() && (await usage.available("places_text_search"))) || (await fsq.available());

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
  const tags = new Set([...(planFor(vibe).tags || []), ...(p.types || []).flatMap((t) => TYPE_TAGS[t] || [])]);
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
    summary: (p.editorialSummary && p.editorialSummary.text) || "",
  };
}

// Place IDs seen per search (vibe + area), the one thing Google lets us keep indefinitely. Used to tell repeat places
// from new ones (exploration, "seen before"), never to show anything: names, ratings and hours always come fresh.
const idCache = new Map(); // "vibe|lat,lng" -> { ids: [...], at }
const areaKey = (vibe, circle) => `${vibe}|${circle.center.latitude.toFixed(2)},${circle.center.longitude.toFixed(2)}`;
function rememberIds(key, places) {
  idCache.set(key, { ids: places.map((p) => p.placeId), at: Date.now() });
  if (idCache.size > 500) idCache.delete(idCache.keys().next().value);
}
const seenIds = (vibe, origins) => (idCache.get(areaKey(vibe, nearCrew(origins))) || { ids: [] }).ids;

// One request (Text Search, or Nearby Search with place types) after reserving from the tier's meter
async function request(kind, plan, circle, tier, fetchImpl, signal) {
  const ok = await usage.reserve(tier.meter, 1);
  if (!ok.ok) return { capped: ok.reason };
  const body = kind === "nearby"
    ? { includedTypes: plan.types, maxResultCount: 10, locationRestriction: { circle } }
    : { textQuery: `${plan.query} in ${CITY()}`, pageSize: 10, locationBias: { circle }, ...(plan.includedType ? { includedType: plan.includedType } : {}) };
  const res = await fetchImpl(kind === "nearby" ? NEARBY : ENDPOINT, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GOOGLE_MAPS_API_KEY, "x-goog-fieldmask": tier.fields },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`Google Places search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return { data: await res.json() };
}

// Search once. Returns { places, capped } and never throws (a failed search just means no places).
// opts.tier: "enterprise" (default; planning calls, with hours and prices) or "pro" (the map: name, pin and link).
// An app vibe with exact place types uses Nearby Search; if Google rejects the types (400) it retries once as text.
async function search(vibe, { fetchImpl = fetch, origins, tier = "enterprise" } = {}) {
  if (!configured()) return { places: [], capped: "not configured" };
  const t = TIERS[tier] || TIERS.enterprise;
  const plan = planFor(vibe);
  const circle = nearCrew(origins);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    let out;
    try {
      out = await request(plan.types ? "nearby" : "text", plan, circle, t, fetchImpl, ctrl.signal);
    } catch (err) {
      if (!plan.types || err.status !== 400) throw err;
      console.error(`${err.message} (retrying "${vibe}" as a text search)`);
      out = await request("text", plan, circle, t, fetchImpl, ctrl.signal);
    }
    if (out.capped) return { places: [], capped: out.capped };
    const list = (out.data.places || []).map((p) => toCandidate(p, vibe)).filter(Boolean);
    rememberIds(areaKey(vibe, circle), list);
    return { places: list, capped: null };
  } catch (err) {
    console.error(err.message);
    return { places: [], capped: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// The same place from Google and Foursquare (or twice from Google): same name, within about 150 m. Google's copy wins
// (it has hours and prices); a Foursquare twin lends it its categories for matching.
const sameName = (a, b) => {
  const n = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|restaurant|bar|cafe|toronto)\b/g, " ").replace(/\s+/g, " ").trim();
  const x = n(a), y = n(b);
  return Boolean(x && y && (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))));
};
function dedupePlaces(lists) {
  const out = [];
  for (const p of lists.flat()) {
    if (!p) continue;
    const twin = out.find((q) => q.id === p.id || (sameName(q.title, p.title) && q.lat != null && p.lat != null && km([q.lat, q.lng], [p.lat, p.lng]) < 0.15));
    if (!twin) { out.push(p); continue; }
    if (twin.source === "Foursquare" && p.source !== "Foursquare") { out[out.indexOf(twin)] = { ...p, categories: [...(p.categories || []), ...(twin.categories || [])], wantQuery: p.wantQuery || twin.wantQuery }; continue; }
    if (p.categories) twin.categories = [...(twin.categories || []), ...p.categories];
  }
  return out;
}

// Search for what someone asked for, in their words: "Chinese skewers restaurant in Toronto", biased to the crew,
// narrowed to the Google type that fits ("chinese_restaurant"), on the Enterprise + Atmosphere meter. Foursquare, when
// it's set up, searches the same words; the two are merged. Returns { places, capped }; never throws.
// opts.tier: "want" (calls: hours, prices, the summary) or "pro" (Discover: name, pin and link).
async function searchWant(wants, { fetchImpl = fetch, origins, tier = "want" } = {}) {
  const plan = want.plan(wants);
  if (!plan) return { places: [], capped: null };
  const circle = nearCrew(origins);
  const tagged = (list) => list.map((p) => ({ ...p, wantQuery: plan.query, vibes: [...new Set([...(p.vibes || []), ...(plan.food ? ["Food & drink"] : [])])] }));
  const google = (async () => {
    if (!configured()) return { places: [], capped: "not configured" };
    const t = TIERS[tier] || TIERS.want;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      let out;
      try {
        out = await request("text", plan, circle, t, fetchImpl, ctrl.signal);
      } catch (err) {
        if (!plan.includedType || err.status !== 400) throw err;
        console.error(`${err.message} (retrying without the place type)`);
        out = await request("text", { ...plan, includedType: null }, circle, t, fetchImpl, ctrl.signal);
      }
      if (out.capped) return { places: [], capped: out.capped };
      const raw = out.data.places || [];
      const list = raw.map((p) => {
        const c = toCandidate(p, "Food & drink");
        return c && { ...c, lat: p.location.latitude, lng: p.location.longitude };
      }).filter(Boolean);
      rememberIds(areaKey(`want:${plan.query}`, circle), list);
      return { places: list, capped: null };
    } catch (err) {
      console.error(err.message);
      return { places: [], capped: null, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  })();
  const four = fsq.configured() ? fsq.search(plan.query, { center: circle.center, radius: circle.radius, fetchImpl }) : Promise.resolve({ places: [], capped: "not configured" });
  const [g, f] = await Promise.all([google, four]);
  const capped = g.capped && g.capped !== "not configured" ? g.capped : null;
  return { places: tagged(dedupePlaces([g.places, f.places])), capped: capped || (g.capped && f.capped ? g.capped : null), plan };
}

// Places for one call: up to PER_CALL searches near the crew's starting points (opts.origins). When someone said
// what they want (opts.want: ["Chinese skewers"]), that's searched first, in their words, and the "default" cocktail
// bar search is skipped: it's what used to answer a skewer request with Bar Maya. Then one search per vibe.
async function forCall(vibes, opts = {}) {
  const wants = [].concat(opts.want || []).filter(Boolean);
  const seen = new Map();
  let capped = null;
  let used = 0;
  if (wants.length) {
    const out = await searchWant(wants, opts);
    used++;
    if (out.capped) capped = out.capped;
    for (const p of out.places) if (!seen.has(p.id)) seen.set(p.id, p);
    if (out.capped && out.capped !== "not configured") return { places: [...seen.values()], capped };
  }
  const list = [...new Set([...(vibes || []), ...(wants.length ? [] : ["default"])])].slice(0, Math.max(0, PER_CALL() - used));
  for (const v of list) {
    const out = await search(v, opts);
    if (out.capped) capped = out.capped;
    for (const p of out.places) if (!seen.has(p.id)) seen.set(p.id, p);
    if (out.capped && out.capped !== "not configured") break; // over the limit: stop searching
  }
  return { places: dedupePlaces([[...seen.values()]]), capped };
}

// What kind of place it is, in a word Sidekick can say ("a bar you can drop into")
const TYPE_WORDS = [["karaoke", "karaoke spot"], ["night_club", "club"], ["comedy_club", "comedy club"], ["live_music_venue", "music bar"], ["video_arcade", "arcade"], ["amusement_center", "arcade"], ["bowling_alley", "bowling alley"], ["art_gallery", "gallery"], ["museum", "museum"], ["movie_theater", "cinema"], ["bar", "bar"], ["pub", "pub"], ["cafe", "cafe"], ["restaurant", "restaurant"]];
function placeType(types) {
  const t = types || [];
  const hit = TYPE_WORDS.find(([k]) => t.includes(k));
  return hit ? hit[1] : "spot";
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

module.exports = { configured, available, search, searchWant, dedupePlaces, forCall, WANT_FIELDS, perCall: PER_CALL, openAt, closesLabel, toCandidate, nearCrew, nearestStation, nearLabel, placeType, planFor, seenIds, FIELDS, PRO_FIELDS, VIBE_PLACES, _numId: numId, _idCache: idCache };
