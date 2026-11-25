// Turns raw listings from any source into Sidequest events: neighbourhood and area from the venue's
// coordinates, trip times over the real subway network, vibes and scene from the listing's own words.

const crypto = require("crypto");
const { saysFree } = require("./price");

// ---------- Subway: Line 1 (Finch → Union → Vaughan) and Line 2 (Kipling → Kennedy) ----------
const LINE1 = [
  ["Finch", 43.7806, -79.4155], ["North York Centre", 43.7684, -79.4128], ["Sheppard-Yonge", 43.7615, -79.411], ["York Mills", 43.7441, -79.4067],
  ["Lawrence", 43.7251, -79.4023], ["Eglinton", 43.7057, -79.3983], ["Davisville", 43.6977, -79.3971], ["St Clair", 43.688, -79.3934],
  ["Summerhill", 43.6822, -79.3907], ["Rosedale", 43.677, -79.3889], ["Bloor-Yonge", 43.6709, -79.3857], ["Wellesley", 43.6654, -79.3838],
  ["College", 43.6613, -79.383], ["Dundas", 43.6561, -79.3802], ["Queen", 43.6525, -79.3793], ["King", 43.6491, -79.3779], ["Union", 43.6453, -79.3806],
  ["St Andrew", 43.6476, -79.3848], ["Osgoode", 43.6507, -79.3868], ["St Patrick", 43.6548, -79.3883], ["Queen's Park", 43.66, -79.3905],
  ["Museum", 43.6671, -79.3934], ["St George", 43.6683, -79.3997], ["Spadina", 43.6672, -79.4037], ["Dupont", 43.6749, -79.407],
  ["St Clair West", 43.684, -79.4155], ["Cedarvale", 43.699, -79.4357], ["Glencairn", 43.7088, -79.4407], ["Lawrence West", 43.7159, -79.4443],
  ["Yorkdale", 43.7247, -79.4475], ["Wilson", 43.734, -79.45], ["Sheppard West", 43.7495, -79.462], ["Downsview Park", 43.7535, -79.4787],
  ["Finch West", 43.7652, -79.4911], ["York University", 43.7741, -79.4999], ["Pioneer Village", 43.7778, -79.5096], ["Highway 407", 43.7833, -79.5233],
  ["Vaughan Metropolitan Centre", 43.7942, -79.5275],
];
const LINE2 = [
  ["Kipling", 43.6372, -79.5361], ["Islington", 43.6454, -79.524], ["Royal York", 43.6481, -79.5113], ["Old Mill", 43.6501, -79.495], ["Jane", 43.6499, -79.4843],
  ["Runnymede", 43.6516, -79.476], ["High Park", 43.654, -79.4668], ["Keele", 43.6557, -79.4596], ["Dundas West", 43.6571, -79.4528], ["Lansdowne", 43.6592, -79.4423],
  ["Dufferin", 43.6602, -79.4355], ["Ossington", 43.6623, -79.4264], ["Christie", 43.6641, -79.4184], ["Bathurst", 43.666, -79.4113], ["Spadina", 43.6672, -79.4037],
  ["St George", 43.6683, -79.3997], ["Bay", 43.6702, -79.3901], ["Bloor-Yonge", 43.6709, -79.3857], ["Sherbourne", 43.6722, -79.3765], ["Castle Frank", 43.6737, -79.3687],
  ["Broadview", 43.6767, -79.3583], ["Chester", 43.6783, -79.3523], ["Pape", 43.6798, -79.3448], ["Donlands", 43.681, -79.3375], ["Greenwood", 43.6826, -79.3302],
  ["Coxwell", 43.6842, -79.3227], ["Woodbine", 43.6863, -79.3127], ["Main Street", 43.689, -79.3016], ["Victoria Park", 43.6948, -79.2886], ["Warden", 43.7114, -79.2794],
  ["Kennedy", 43.7323, -79.2637],
];
const ORIGIN_STATION = { union: "Union", finch: "Finch", kennedy: "Kennedy", kipling: "Kipling" };
const MIN_PER_STOP = 2;
const TRANSFER_MIN = 4;

// Graph nodes are "line:station"; changing lines at a shared station costs a transfer
const nodes = {};
const edges = {};
const addNode = (line, [name, lat, lng]) => (nodes[`${line}:${name}`] = { line, name, lat, lng });
const link = (a, b, w, transfer) => {
  (edges[a] = edges[a] || []).push({ to: b, w, transfer });
  (edges[b] = edges[b] || []).push({ to: a, w, transfer });
};
for (const [line, list] of [[1, LINE1], [2, LINE2]]) {
  list.forEach((s, i) => {
    addNode(line, s);
    if (i) link(`${line}:${list[i - 1][0]}`, `${line}:${s[0]}`, MIN_PER_STOP, 0);
  });
}
for (const name of ["Bloor-Yonge", "St George", "Spadina"]) link(`1:${name}`, `2:${name}`, TRANSFER_MIN, 1);

// Shortest time (and transfers) from an origin station to every station
function dijkstra(startName) {
  const start = nodes[`1:${startName}`] ? `1:${startName}` : `2:${startName}`;
  const best = { [start]: { min: 0, transfers: 0 } };
  const queue = [start];
  while (queue.length) {
    queue.sort((a, b) => best[a].min - best[b].min);
    const cur = queue.shift();
    for (const e of edges[cur] || []) {
      const cand = { min: best[cur].min + e.w, transfers: best[cur].transfers + e.transfer };
      if (!best[e.to] || cand.min < best[e.to].min) {
        best[e.to] = cand;
        queue.push(e.to);
      }
    }
  }
  return best;
}
const FROM = Object.fromEntries(Object.entries(ORIGIN_STATION).map(([o, s]) => [o, dijkstra(s)]));

function km(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Estimated door-to-door trip from each starting point: subway to the venue's best station,
// then a walk (short) or a bus/streetcar leg (longer). An estimate, not a trip planner.
function travel(lat, lng) {
  const stations = Object.entries(nodes).map(([key, s]) => ({ key, ...s, d: km(lat, lng, s.lat, s.lng) })).sort((a, b) => a.d - b.d);
  const nearest = stations[0];
  const from = {};
  for (const origin of Object.keys(ORIGIN_STATION)) {
    let bestTrip = null;
    for (const s of stations.slice(0, 4)) {
      const ride = FROM[origin][s.key];
      if (!ride) continue;
      const lastLeg = s.d <= 1.2 ? { min: Math.round(s.d * 15), transfers: 0 } : { min: Math.round(6 + s.d * 3.2), transfers: 1 };
      const trip = { minutes: 3 + ride.min + lastLeg.min, transfers: ride.transfers + lastLeg.transfers };
      if (!bestTrip || trip.minutes < bestTrip.minutes) bestTrip = trip;
    }
    from[origin] = { minutes: Math.max(5, Math.round(bestTrip.minutes / 5) * 5), transfers: bestTrip.transfers };
  }
  return { stop: nearest.name, walkKm: Math.round(nearest.d * 10) / 10, from, estimated: true };
}

// ---------- Where it is ----------
const HOODS = [
  ["Queen West", 43.6466, -79.405], ["West Queen West", 43.644, -79.419], ["Kensington Market", 43.6545, -79.4005], ["Chinatown", 43.6529, -79.3975],
  ["Entertainment District", 43.6465, -79.39], ["Financial District", 43.648, -79.3815], ["St. Lawrence", 43.6487, -79.3715], ["Distillery District", 43.6503, -79.3596],
  ["Corktown", 43.655, -79.359], ["Regent Park", 43.66, -79.362], ["Cabbagetown", 43.667, -79.366], ["Church-Wellesley", 43.666, -79.381],
  ["Yorkville", 43.671, -79.393], ["Annex", 43.67, -79.406], ["Harbord Village", 43.662, -79.404], ["Koreatown", 43.664, -79.418], ["Little Italy", 43.655, -79.414],
  ["Trinity Bellwoods", 43.647, -79.414], ["Ossington", 43.6495, -79.421], ["Little Portugal", 43.649, -79.43], ["Dufferin Grove", 43.656, -79.433],
  ["Bloordale", 43.659, -79.442], ["Parkdale", 43.639, -79.437], ["Liberty Village", 43.638, -79.42], ["Roncesvalles", 43.646, -79.449], ["High Park", 43.652, -79.463],
  ["The Junction", 43.665, -79.468], ["Leslieville", 43.663, -79.333], ["Riverside", 43.659, -79.35], ["Danforth", 43.678, -79.348], ["East Danforth", 43.684, -79.32],
  ["The Beaches", 43.672, -79.296], ["Yonge-Eglinton", 43.707, -79.398], ["St. Clair West", 43.683, -79.421], ["Midtown", 43.69, -79.395], ["North York Centre", 43.768, -79.413],
  ["Harbourfront", 43.639, -79.38], ["Exhibition Place", 43.633, -79.419], ["Fort York", 43.639, -79.406], ["Downtown Yonge", 43.656, -79.381], ["University", 43.662, -79.395],
  ["Rosedale", 43.68, -79.378], ["Forest Hill", 43.695, -79.414], ["Leaside", 43.705, -79.365], ["Don Mills", 43.735, -79.342], ["Downsview", 43.745, -79.48],
  ["Weston", 43.7, -79.516], ["Yorkdale", 43.725, -79.452], ["Scarborough", 43.776, -79.258], ["Etobicoke", 43.63, -79.52], ["Mimico", 43.616, -79.497], ["Wychwood", 43.681, -79.424],
];
const inToronto = (lat, lng) => lat > 43.58 && lat < 43.86 && lng > -79.64 && lng < -79.11;

function place(lat, lng, city) {
  if (!inToronto(lat, lng) || (city && !/toronto|north york|scarborough|etobicoke|east york|york/i.test(city))) {
    return { neighbourhood: city || "GTA", area: "Beyond Toronto" };
  }
  const near = HOODS.map(([n, a, b]) => [n, km(lat, lng, a, b)]).sort((x, y) => x[1] - y[1])[0];
  let area;
  if (lng < -79.49) area = "Etobicoke";
  else if (lat > 43.74 && lng > -79.31) area = "Scarborough";
  else if (lat > 43.735) area = "North York";
  else if (lng > -79.36) area = "East End";
  else if (lat > 43.68) area = "Midtown";
  else if (lng < -79.4) area = "West End";
  else area = "Downtown";
  return { neighbourhood: near[1] < 2.5 ? near[0] : area, area };
}

// ---------- What it is: vibes from the listing's own words ----------
// Order matters only as a tie-break: a vibe named in the title comes first (see vibesOf)
const VIBE_RULES = [
  ["Jazz", /\b(jazz|blues|bebop|big band|swing)\b/],
  ["Electronic", /\b(techno|house music|deep house|tech house|\bdj\b|djs|electronic|electro pop|electropop|rave|edm|drum (and|&|n) bass|dnb|disco|club night|afrobeats|amapiano|dubstep|trance)\b/],
  ["Indie gigs", /\b(indie|punk|shoegaze|emo|garage rock|post-punk|alt-rock|alternative|folk|singer-songwriter|grunge|hardcore|noise rock)\b/],
  // Broad words ("music", "singer") only count in the title or the listing's own categories, not the description
  ["Live music", /\b(concert|live music|live band|band|gig|orchestra|symphony|choir|recital|hip hop|hip-hop|rap|r&b|soul|funk|reggae|metal|rock|pop music|country|acoustic|open mic music|open jam|jam night|quartet|trio|classical|symphonic|chamber music|baroque|concerto|opera|operetta|pianist|violinist|cellist|soprano|tenor)\b/, /\b(music|musician|musicians|singer|songwriter|pop)\b/],
  ["Comedy", /\b(comedy|comedian|stand-up|standup|stand up|improv|sketch show|roast)\b/],
  ["Dance", /\b(dance class|dance party|salsa|bachata|kizomba|tango|swing dance|line dancing|dancehall|soca|latin night|dance|breakdance|breakdancing|breaking|b-boy|bboy|nightclub|nightlife|guestlist|guest list|bottle service)\b/],
  ["Records & vinyl", /\b(vinyl|record fair|record swap|record store|listening party|listening session|crate)\b/],
  ["Film nights", /\b(film|films|cinema|screening|movie|documentary|shorts)\b/],
  ["Zines & print", /\b(zine|zines|risograph|printmaking|letterpress|book fair|comic arts|small press)\b/],
  ["Markets", /\b(farmers'? market|night market|holiday market|christmas market|flea market|flea|bazaar|craft fair|craft show|holiday fair|artisan fair|makers'? fair|vendor fair|pop-up shop|swap meet)\b/, /\b(market|markets|marketplace)\b/],
  ["Food & drink", /\b(foodie|brunch|supper club|tasting|tastings|wine tasting|beer tasting|brewery|craft beer|mixology|ramen|chef|cooking|culinary|dumplings?|food truck|potluck|sake|whisky|whiskey|tea tasting|baking class)\b/, /\b(food|dinner|supper|wine|wines|beer|beers|cocktail|cocktails|chocolate|pizza|bbq|barbecue|tacos?|coffee)\b/],
  ["Art & making", /\b(art|arts|gallery|exhibit|exhibition|workshop|craft|crafts|painting|paint|pottery|ceramics|sewing|knitting|drawing|sketch|maker|design|candle making|floral)\b/],
  ["Photography", /\b(photo|photography|photowalk|photographer)\b/],
  ["Writing & poetry", /\b(poetry|poet|poets|spoken word|writing|writers|author|book launch|book club|reading series|literary)\b/],
  ["Tech & coding", /\b(coding|hackathon|developer|startup|tech|ai|machine learning|data science|web3|product manager)\b/],
  ["Anime & cosplay", /\b(anime|cosplay|manga|k-pop|kpop|fan expo|comic con|gaming|video game|esports)\b/],
  ["Wellness", /\b(yoga|meditation|meditate|sound bath|sound healing|wellness|breathwork|pilates|mindfulness|reiki|tai chi|qigong|self-care|healing circle|sauna|cold plunge)\b/],
  ["Outdoors", /\b(hike|hiking|outdoor|outdoors|nature walk|ravine|trail|park clean|gardening|walking tour|birding|paddleboard|paddleboarding|kayak|kayaking|canoe|canoeing|backcountry|camping)\b/, /\b(nature|garden|walk|walks|bird|beach|park)\b/],
  ["Run & ride", /\b(run club|running|5k|10k|half marathon|marathon|cycling|bike|ride)\b/],
  ["Climbing", /\b(climb|climbing|climbers|bouldering|boulder|climbing gym)\b/],
  // "meetup" used to be here, and tagged 511 of 682 Games & social listings (an AGM, English classes) by that word alone
  ["Games & social", /\b(board game|board games|trivia|game night|games night|pub quiz|quiz night|karaoke|speed dating|singles|mixer|social club|bingo|drag|escape room|bowling|billiards|pool night|mahjong|chess club|dungeons|d&d|magic the gathering|language exchange|conversation exchange)\b/],
];
// Listings that aren't in our three scenes, even if a word matches
const EXCLUDE = /\b(webinar|conference|summit|real estate|investing|investor|mortgage|career fair|job fair|recruit|networking event|church|worship|prayer|seminar|masterclass for business|nhl|nba|mlb|mls|raptors|maple leafs|blue jays|toronto fc|argonauts|marlies|hockey game|immigration|tax|crypto|forex|wealth|parenting|weight loss)\b/;

const SCENE_OF = {
  "Live music": "Music & nightlife", Jazz: "Music & nightlife", "Indie gigs": "Music & nightlife", Comedy: "Music & nightlife", Dance: "Music & nightlife",
  Electronic: "Music & nightlife", "Records & vinyl": "Music & nightlife", "Film nights": "Arts & making", "Zines & print": "Arts & making", "Art & making": "Arts & making",
  Photography: "Arts & making", "Writing & poetry": "Arts & making", "Tech & coding": "Arts & making", "Anime & cosplay": "Arts & making", Outdoors: "Active & social",
  "Run & ride": "Active & social", Climbing: "Active & social", "Games & social": "Active & social",
  "Food & drink": "Active & social", Markets: "Active & social", Wellness: "Active & social",
};

// Up to 3 vibes. Ones the title (or the listing's own categories) names come first, so the main vibe is what the
// listing is, not a word in its description. "Rock climbing" is climbing, not rock music.
function vibesOf(text, title = "") {
  // "Rock climbing" is climbing, not rock music; "photo ID required" and "VIP photo op" aren't photography
  const clean = (s) => String(s || "").toLowerCase().replace(/\brock[- ]climbing\b/g, "climbing").replace(/\bphoto\.?\s*(i\.?\s?d\b\.?|identification)|\bphoto[- ]?opp?s?\b/g, " ")
    // Ticketmaster's "Arts & Theatre" segment covers comedians, plays and Cirque: theatre, not art & making
    .replace(/\barts (&|and) theat(re|er)\b/g, "theatre");
  const t = clean(text);
  const head = clean(title || text);
  const hits = [];
  VIBE_RULES.forEach(([v, re, headOnly], i) => {
    const strong = re.test(head) || re.test(t);
    const broad = !strong && headOnly && headOnly.test(head);
    if (strong || broad) hits.push({ v, i, inTitle: re.test(head) || broad, broad });
  });
  // A DJ night or a jazz set that's "music" in its categories doesn't also need the general "Live music"
  const specific = hits.some((h) => ["Jazz", "Electronic", "Indie gigs"].includes(h.v));
  if (specific) for (let k = hits.length - 1; k >= 0; k--) if (hits[k].v === "Live music" && hits[k].broad) hits.splice(k, 1);
  hits.sort((a, b) => (b.inTitle ? 1 : 0) - (a.inTitle ? 1 : 0) || a.i - b.i);
  return hits.map((h) => h.v).slice(0, 3);
}

// Listings we don't show: outside Toronto (a quarter of the GTA feed, too far for a night out by transit) and
// appointment-style "events" (in-store sales consultations at 30 Best Buys)
const APPOINTMENT = /\b(appointments?|appointment[- ]based|sales consultations?|consultations?|by appointment|book (your|a) (slot|time)|private (session|consult)|one[- ]on[- ]one|1[:-]on[:-]1)\b/i;
const APPOINTMENT_VENUE = /^(best buy|samsung experience store)$/i;
function dropReason(e) {
  if (!e) return "invalid";
  if (e.area === "Beyond Toronto") return "beyond-toronto";
  if (APPOINTMENT.test(e.title || "") || APPOINTMENT_VENUE.test(((e.venue && e.venue.name) || "").trim())) return "appointment";
  return null;
}
const keepListing = (e) => !dropReason(e);

// ---------- Text cleanup ----------
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const stripHtml = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function tidyTitle(t) {
  t = decode(t).replace(/\s+/g, " ").trim();
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length > 6 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.75) {
    t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Dj|Ny|Usa|Uk|Tv|Edm|Rnb|Lgbtq\+?|Ii|Iii)\b/g, (w) => w.toUpperCase());
  }
  return t.length > 90 ? t.slice(0, 87).trim() + "…" : t;
}
function trimText(s, n = 300) {
  s = stripHtml(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (end > n * 0.5 ? cut.slice(0, end + 1) : cut.trim() + "…").trim();
}

function dateLabel(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).replace(",", "");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).replace(":00", "");
  return `${day}, ${time}`;
}
const hourIn = (iso) => Number(new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Toronto" }).slice(0, 2));

// Stable numeric id from source + source id, so re-imports keep the same ids
const stableId = (source, id) => parseInt(crypto.createHash("md5").update(`${source}:${id}`).digest("hex").slice(0, 8), 16);

const NA = "N/A"; // shown wherever a listing doesn't say

// raw: { source, sourceId, url, ticketUrl?, title, startsAt, endsAt, runsUntil?, venue: {name, address, lat, lng, city}, price, priceHigh, priceNote, description, categories: [], organizer, image }
// Every in-person GTA listing is kept except the off-topic ones in EXCLUDE; listings that match none
// of our vibes get the scene "Other". Anything the listing doesn't give is "N/A", never made up.
function toEvent(raw) {
  // venue.noPin (import/locate.js): its coordinates were wrong and nothing trustworthy was found. It stays listed,
  // with no coordinates (never a guessed point), so it shows in lists but not on the map.
  const noPin = Boolean(raw.venue && raw.venue.noPin);
  const lat = noPin ? null : Number(raw.venue && raw.venue.lat);
  const lng = noPin ? null : Number(raw.venue && raw.venue.lng);
  if ((!noPin && (!Number.isFinite(lat) || !Number.isFinite(lng))) || !raw.title || !raw.startsAt || isNaN(Date.parse(raw.startsAt))) return null;
  const title = tidyTitle(raw.title);
  const description = trimText(raw.description || "");
  const words = `${title} ${(raw.categories || []).join(" ")} ${description}`;
  // Judge off-topic by title and categories only: a concert "in the church hall" is still a concert
  if (EXCLUDE.test(`${title} ${(raw.categories || []).join(" ")}`.toLowerCase())) return null;
  const vibes = vibesOf(words, `${title} ${(raw.categories || []).join(" ")}`);
  const inCity = !raw.venue.city || /toronto|north york|scarborough|etobicoke|east york|york/i.test(raw.venue.city);
  const { neighbourhood, area } = noPin ? (inCity ? { neighbourhood: "Toronto", area: "Toronto" } : { neighbourhood: raw.venue.city, area: "Beyond Toronto" }) : place(lat, lng, raw.venue.city);
  const tr = noPin ? { stop: "", walkKm: null, from: {}, estimated: true, unknown: true } : travel(lat, lng);
  let price = raw.price == null || !Number.isFinite(Number(raw.price)) ? null : Math.ceil(Number(raw.price));
  // No price field, but the listing itself says entry is free ("Free admission"): that's its price
  let priceNote = raw.priceNote;
  if (price == null && saysFree(`${title}. ${description}`)) {
    price = 0;
    priceNote = "Free (the listing says so)";
  }
  const late = hourIn(raw.startsAt) >= 21 || hourIn(raw.startsAt) < 4;
  const venueName = decode(raw.venue.name || "").trim();
  const address = decode(raw.venue.address || "").trim();
  return {
    id: stableId(raw.source, raw.sourceId),
    source: raw.source,
    sourceUrl: raw.url,
    title,
    date: dateLabel(raw.startsAt),
    startsAt: new Date(raw.startsAt).toISOString(),
    endsAt: raw.endsAt && !isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null,
    runsUntil: raw.runsUntil || null,
    neighbourhood,
    area,
    venue: { name: venueName || NA, address: address || NA, lat, lng, ...(noPin ? { noPin: true } : {}) },
    scene: vibes.length ? SCENE_OF[vibes[0]] : "Other",
    price,
    priceNote: priceNote || (price == null ? NA : price === 0 ? "Free" : raw.priceHigh && raw.priceHigh > price ? `From $${price}` : `$${price}`),
    description: description || NA,
    tags: [...new Set([...(raw.categories || []).map((c) => String(c).toLowerCase()), ...vibes.map((v) => v.toLowerCase())])].slice(0, 8),
    vibes,
    rating: null,
    reviews: [],
    going: 0,
    attendees: [],
    organizer: { name: decode(raw.organizer || "").trim() || NA, rating: null, review: "" },
    friends: [],
    travel: tr,
    ticketLink: raw.ticketUrl || raw.url,
    image: raw.image || null,
    dayInfo: {
      entrance: venueName ? `${venueName}${address ? `, ${address.split(",")[0]}` : ""}. Door details: ${NA} (check the ${raw.source} listing).` : NA,
      home: late ? "Subway runs until about 1:30 AM; Blue Night buses run after that." : "Subway runs every 4 to 6 minutes in the evening.",
      coat: NA,
    },
  };
}

// An event already in the database, re-tagged with today's keyword rules. Vibes a person or the AI chose
// (tagSource "ai" or "host") are kept as they are.
function retag(e) {
  if (!e || e.type === "place" || e.tagSource === "ai" || e.publishedBy) return e;
  // Categories the listing came with; multi-word vibe names in tags are our own old tags, so they don't count
  const cats = (e.tags || []).filter((t) => !OUR_TAGS.has(t)).join(" ");
  const vibes = vibesOf(`${e.title} ${cats} ${e.description || ""}`, `${e.title} ${cats}`);
  const same = vibes.length === (e.vibes || []).length && vibes.every((v, i) => v === e.vibes[i]);
  if (same) return e;
  const tags = [...new Set([...(e.tags || []).filter((t) => !OUR_TAGS.has(t)), ...vibes.map((v) => v.toLowerCase())])].slice(0, 8);
  return { ...e, vibes, tags, scene: vibes.length ? SCENE_OF[vibes[0]] : "Other" };
}
const VIBE_NAMES = new Set(VIBE_RULES.map(([v]) => v.toLowerCase()));
// Our own old vibe tags, as opposed to a site's categories: every multi-word vibe name, plus single words no source uses
// as a category ("comedy", "jazz", "dance" and "electronic" are real Ticketmaster and Eventbrite categories, so they stay)
const OUR_TAGS = new Set([...[...VIBE_NAMES].filter((v) => /\s/.test(v)), "photography", "outdoors", "climbing", "wellness", "markets"]);

module.exports = { toEvent, stripHtml, trimText, km, travel, place, vibesOf, retag, keepListing, dropReason, VIBE_RULES, SCENE_OF, NA };
