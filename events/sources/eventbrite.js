// Eventbrite: every in-person Toronto listing in the window (the same public "all events" pages
// search engines index), then each event's page for its price, organizer and full description.
// No public search API exists, and /api/v3/destination/events/ is off-limits in robots.txt.
// A listing query stops at 49 pages (980 events), so busy date ranges are split until each fits.

// Prices (only 18 of 1,608 listings had one in the 15 Oct import): the event pages were read one after another, and
// the first 429 from www.eventbrite.com blocked the host for the rest of the run, so ~1,590 pages were never read.
// Now (1) the listing's own ticket_availability gives a price before any event page is read, (2) a 429 on an event
// page waits and tries again instead of blocking the host, and (3) every JSON-LD event on the page is read for
// offers (nested AggregateOffers, "CA$25.00" strings), with the page's own "is free" flag as a last resort.

// Blocked since 19 Oct 2026 (Nov 2026 finding): every listing page answers HTTP 405 within a quarter of a second, from
// GitHub's servers. 405 to a plain GET is what AWS WAF sends for its CAPTCHA action (with an x-amzn-waf-action: captcha
// header), so Eventbrite's bot protection is asking data-centre visitors to solve a CAPTCHA. We don't get around a
// CAPTCHA. So the first blocked page now stops the source with one clear line (instead of 14 failed weeks), the run
// keeps last run's Eventbrite events if it has any, and the listing page's JSON-LD is read when __SERVER_DATA__ is
// missing. What works instead: run it from a home connection (UPLOAD=1 ONLY=Eventbrite MERGE=1 node import/run.js),
// or set EVENTBRITE=off. Eventbrite's official API has no public event search (removed in 2020).

const { get, jsonLdEvents, embeddedObject, sleep } = require("../fetch");
const { parsePrice, offersPrice, toCad } = require("../price");
const PAGE_CAP = 49;
const PAGE_SIZE = 20;

// "2026-10-03" + "22:00" in Toronto → ISO with the right offset (EDT/EST)
function torontoISO(date, time = "19:00") {
  for (const off of ["-04:00", "-05:00"]) {
    const d = new Date(`${date}T${time}:00${off}`);
    const back = d.toLocaleString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 16).replace(" ", "T");
    if (back === `${date}T${time}`) return d.toISOString();
  }
  return new Date(`${date}T${time}:00-05:00`).toISOString();
}

const ymd = (d) => d.toLocaleDateString("sv-SE", { timeZone: "America/Toronto" });
const addDays = (s, n) => ymd(new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// The price on a listing card, when Eventbrite includes it (ticket_availability, or an is_free flag)
function listingPrice(r) {
  const ta = (r && r.ticket_availability) || {};
  if (ta.is_free === true || r.is_free === true) return { low: 0, high: 0, currency: null };
  const low = parsePrice(ta.minimum_ticket_price);
  if (low == null) return null;
  const high = parsePrice(ta.maximum_ticket_price);
  const cur = (ta.minimum_ticket_price && ta.minimum_ticket_price.currency) || null;
  return { low, high: high != null ? high : low, currency: cur && String(cur).toUpperCase() };
}

// A listing page's events: the page's __SERVER_DATA__ search results, or, when that's missing, the schema.org
// events in its JSON-LD (turned into the same shape). Returns { results, pagination } or null.
function parseListing(html) {
  const data = embeddedObject(html, "window.__SERVER_DATA__");
  const found = data && data.search_data && data.search_data.events;
  if (found && Array.isArray(found.results)) return found;
  const lds = jsonLdEvents(html).filter((x) => x.url && x.startDate);
  if (!lds.length) return null;
  const results = lds.map(fromJsonLd).filter(Boolean);
  // JSON-LD has no page count: keep paging while pages come back full (an empty page stops the loop)
  return { results, pagination: { object_count: results.length, page_count: results.length >= PAGE_SIZE ? PAGE_CAP : 1 } };
}
// "2026-11-27T19:00:00-05:00" -> ["2026-11-27", "19:00"] (Eventbrite writes local Toronto time with its offset)
const localParts = (s) => {
  const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return m ? [m[1], m[2] || null] : [null, null];
};
function fromJsonLd(x) {
  const id = (String(x.url).match(/-(\d{6,})(?:[/?#]|$)/) || [])[1];
  const [startDate, startTime] = localParts(x.startDate);
  if (!id || !startDate) return null;
  const [endDate, endTime] = localParts(x.endDate);
  const loc = [].concat(x.location || [])[0] || {};
  const addr = loc.address || {};
  const geo = loc.geo || {};
  const online = /OnlineEventAttendanceMode/.test(x.eventAttendanceMode || "") || loc["@type"] === "VirtualLocation";
  const address = typeof addr === "string" ? addr : [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ");
  const offers = [].concat(x.offers || []);
  const low = offers.map((o) => parseFloat(o.lowPrice != null ? o.lowPrice : o.price)).filter((n) => Number.isFinite(n));
  return {
    id,
    name: x.name,
    url: x.url,
    summary: x.description || "",
    start_date: startDate,
    start_time: startTime || "19:00",
    end_date: endDate,
    end_time: endTime,
    is_online_event: online,
    is_cancelled: /EventCancelled/.test(x.eventStatus || ""),
    primary_venue: online ? null : { name: loc.name, address: { localized_address_display: address, latitude: geo.latitude != null ? Number(geo.latitude) : undefined, longitude: geo.longitude != null ? Number(geo.longitude) : undefined, city: typeof addr === "object" ? addr.addressLocality : undefined } },
    image: x.image ? { image_sizes: { large: [].concat(x.image)[0] } } : null,
    ticket_availability: low.length ? { minimum_ticket_price: { major_value: String(Math.min(...low)), currency: (offers[0] && offers[0].priceCurrency) || "CAD" } } : undefined,
    tags: [],
  };
}

// An error from fetch.get that means "blocked by a bot check", not "this page is missing"
const isBotBlock = (err) => !!err && (err.status === 405 || err.status === 403 || /captcha|challenge/i.test(err.wafAction || ""));
const BLOCKED_NOTE = (err) => `blocked by Eventbrite's bot protection (HTTP ${err.status}${err.wafAction ? `, x-amzn-waf-action: ${err.wafAction}` : ", the AWS WAF CAPTCHA answer"}) from this network. GitHub's servers have been blocked since 19 Oct 2026. Not working around a CAPTCHA: run it from a home connection with \`UPLOAD=1 ONLY=Eventbrite MERGE=1 node import/run.js\` (from sketch-1/), or set EVENTBRITE=off`;

// Only what we use from an event page, so the cache stays small
function eventPageInfo(html) {
  const lds = jsonLdEvents(html);
  const ld = lds.find((x) => x.offers || x.organizer) || {};
  // Offers from this page's own event first, then any other event object on the page that carries them
  let price = offersPrice(ld.offers);
  if (!price) for (const x of lds) if (!price && x.offers && (!x.name || !ld.name || x.name === ld.name)) price = offersPrice(x.offers);
  if (!price) {
    // The page's app data: an explicit free flag, or a minimum ticket price object
    if (/"(?:is_free|isFree)"\s*:\s*true/.test(html)) price = { low: 0, high: 0, currency: null };
    else {
      const m = html.match(/"(?:minimum_ticket_price|minimumTicketPrice|minPrice)"\s*:\s*\{[^{}]*?"(?:major_value|majorValue|value)"\s*:\s*"?([\d.]+)"?[^{}]*?\}/);
      const cur = m && (m[0].match(/"currency"\s*:\s*"([A-Z]{3})"/) || [])[1];
      const n = m && parsePrice(m[1]);
      // "value" (no "major") is in cents on Eventbrite's own objects
      if (n != null) price = { low: /"value"/.test(m[0]) && !/major/i.test(m[0]) ? n / 100 : n, high: null, currency: cur || null };
      if (price && price.high == null) price.high = price.low;
    }
  }
  const org = ld.organizer && (ld.organizer.name || (ld.organizer[0] && ld.organizer[0].name));
  return {
    price,
    organizer: org || null,
    description: ld.description || "",
    image: [].concat(ld.image || [])[0] || null,
  };
}

// An event page, waiting out rate limits (1, 2, 4 minutes) instead of giving up on Eventbrite for the whole run
async function readEventPage(url, log) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await get(url, { extract: eventPageInfo, rateLimit: "throw" });
    } catch (err) {
      if (!err.rateLimited || attempt >= 4) throw err;
      if (log) log(`  eventbrite: event pages rate limited, waiting ${2 ** (attempt - 1)} min`);
      await sleep(2 ** (attempt - 1) * 60000);
    }
  }
}

async function fetchEventbrite({ start, end, max, log }) {
  if (/^(off|0|false)$/i.test(process.env.EVENTBRITE || "")) return { skipped: "turned off (EVENTBRITE=off)" };
  const listed = new Map();
  let blockedBy = null; // the first bot-check error: stops every other listing request this run
  const listingUrl = (s, e, page) => `https://www.eventbrite.ca/d/canada--toronto/all-events/?start_date=${s}&end_date=${e}&page=${page}`;
  // Listing pages rate-limit after a while: back off for a few minutes rather than leave a gap
  const readPage = async (s, e, page) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return parseListing(await get(listingUrl(s, e, page)));
      } catch (err) {
        if (isBotBlock(err)) throw Object.assign(err, { botBlock: true });
        if (!/^429/.test(err.message) || attempt >= 6) throw err;
        log(`  eventbrite: rate limited, waiting ${attempt} min`);
        await sleep(attempt * 60000);
      }
    }
  };
  const keep = (res) => {
    for (const r of res.results) {
      if (r.is_online_event || r.is_cancelled || !r.primary_venue || listed.has(r.id)) continue;
      const cats = (r.tags || []).filter((t) => /EventbriteCategory|EventbriteSubCategory|EventbriteFormat|OrganizerTag/.test(t.prefix)).map((t) => t.display_name);
      listed.set(r.id, { r, cats });
    }
  };

  // Read a date range, splitting it in half while it holds more than one query can show
  async function readRange(s, e) {
    if (listed.size >= max || blockedBy) return;
    let first;
    try {
      first = await readPage(s, e, 1);
    } catch (err) {
      if (err.botBlock) {
        blockedBy = err;
        return;
      }
      log(`  eventbrite ${s}..${e}: ${err.message}`);
      return;
    }
    if (!first || !first.results) return;
    const total = first.pagination.object_count;
    const days = daysBetween(s, e);
    if (total > PAGE_CAP * PAGE_SIZE && days >= 1) {
      const mid = addDays(s, Math.floor(days / 2));
      await readRange(s, mid);
      await readRange(addDays(mid, 1), e);
      return;
    }
    keep(first);
    const pages = Math.min(PAGE_CAP, first.pagination.page_count);
    for (let page = 2; page <= pages && listed.size < max; page++) {
      try {
        const res = await readPage(s, e, page);
        if (!res || !res.results.length) break;
        keep(res);
      } catch (err) {
        if (err.botBlock) blockedBy = err;
        else log(`  eventbrite ${s}..${e} p${page}: ${err.message}`);
        break;
      }
    }
    log(`  eventbrite ${s}..${e}: ${total} listed, ${listed.size} in-person so far`);
  }

  // A week at a time keeps most queries under the cap without splitting
  const last = ymd(end);
  for (let s = ymd(start); s <= last && listed.size < max && !blockedBy; s = addDays(s, 7)) {
    const e = addDays(s, 6) > last ? last : addDays(s, 6);
    await readRange(s, e);
  }
  if (blockedBy && !listed.size) {
    log(`  eventbrite: ${BLOCKED_NOTE(blockedBy)}`);
    return { skipped: `Eventbrite ${BLOCKED_NOTE(blockedBy)}` };
  }
  if (blockedBy) log(`  eventbrite: stopped early, ${BLOCKED_NOTE(blockedBy)}; keeping the ${listed.size} listings read before that`);

  const chosen = [...listed.values()].slice(0, max);
  log(`  eventbrite: ${chosen.length} in-person listings, reading each event page for price and organizer`);

  const out = [];
  for (const [n, { r, cats }] of chosen.entries()) {
    let price = null;
    let priceHigh = null;
    let priceNote = null;
    let organizer = (r.primary_organizer && r.primary_organizer.name) || null;
    let description = r.summary || "";
    let image = r.image && r.image.image_sizes && (r.image.image_sizes.large || r.image.image_sizes.medium);
    const fromListing = listingPrice(r);
    if (fromListing) ({ price, priceHigh, priceNote } = toCad(fromListing));
    try {
      const info = await readEventPage(r.url, log);
      if (info) {
        // Older cached pages kept a list of offers; newer ones keep the price itself
        const p = info.price || (info.offers && offersPrice(info.offers.map((o) => ({ lowPrice: o.low, highPrice: o.high, priceCurrency: o.currency }))));
        if (p && price == null) ({ price, priceHigh, priceNote } = toCad(p));
        organizer = info.organizer || organizer;
        if (info.description.length > description.length) description = info.description;
        image = image || info.image;
      }
    } catch (err) {
      log(`  eventbrite event ${r.id}: ${err.message}`);
    }
    if ((n + 1) % 100 === 0) log(`  eventbrite: ${n + 1}/${chosen.length} event pages read`);
    const v = r.primary_venue;
    out.push({
      source: "Eventbrite",
      sourceId: r.id,
      url: r.url.replace("www.eventbrite.com", "www.eventbrite.ca"),
      title: r.name,
      startsAt: torontoISO(r.start_date, r.start_time),
      endsAt: r.end_date ? torontoISO(r.end_date, r.end_time || "23:00") : null,
      venue: { name: v.name, address: v.address && v.address.localized_address_display, lat: v.address && v.address.latitude, lng: v.address && v.address.longitude, city: v.address && v.address.city },
      price,
      priceHigh,
      priceNote,
      description,
      categories: cats,
      organizer,
      image: image || null,
    });
  }
  return out;
}

module.exports = { fetchEventbrite, torontoISO, eventPageInfo, listingPrice, parseListing, isBotBlock };
