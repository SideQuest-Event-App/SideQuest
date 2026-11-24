// Ticketmaster: the official Discovery API (free key from developer.ticketmaster.com).
// Put TICKETMASTER_API_KEY=... in sketch-1/.env. Without a key this source is skipped.
// Prices: every priceRanges entry in the search result; when a search result has none, the event's own detail
// endpoint is asked (it sometimes has them when search doesn't), up to TICKETMASTER_DETAIL_MAX calls a run
// (default 400, well inside the 5,000-a-day allowance; each is cached for 12 hours like every request).

const { get } = require("../fetch");
const { ticketmasterPrice } = require("../price");

const DETAIL_MAX = () => Number(process.env.TICKETMASTER_DETAIL_MAX || 400);

// One Discovery API event -> a raw listing (null for add-ons, sports, cancelled or undated events)
function toRaw(e) {
  const c = (e.classifications || [])[0] || {};
  if (c.segment && /Sports/i.test(c.segment.name)) return null; // outside our three scenes
  if (/\b(upgrade|parking|voucher|gift card)\b|not a concert ticket/i.test(e.name)) return null; // add-ons, not events
  if (!e.dates || !e.dates.start || !e.dates.start.dateTime) return null;
  if (e.dates.status && /cancel|postpone/i.test(e.dates.status.code)) return null;
  const v = ((e._embedded && e._embedded.venues) || [])[0] || {};
  const pr = ticketmasterPrice(e);
  const img = (e.images || []).filter((i) => i.ratio === "16_9" && i.width >= 600).sort((a, b) => a.width - b.width)[0];
  return {
    source: "Ticketmaster",
    sourceId: e.id,
    url: e.url,
    title: e.name,
    startsAt: e.dates.start.dateTime,
    endsAt: null,
    venue: { name: v.name, address: [v.address && v.address.line1, v.city && v.city.name].filter(Boolean).join(", "), lat: v.location && v.location.latitude, lng: v.location && v.location.longitude, city: v.city && v.city.name },
    price: pr ? pr.low : null,
    priceHigh: pr ? pr.high : null,
    description: e.info || e.pleaseNote || "",
    categories: [c.segment, c.genre, c.subGenre].map((x) => x && x.name).filter((n) => n && n !== "Undefined"),
    organizer: (e.promoter && e.promoter.name) || v.name,
    image: img && img.url,
  };
}

// Fill missing prices from each event's detail endpoint (getDetail is injectable for tests)
async function fillPrices(list, { key, log, max = DETAIL_MAX(), getDetail } = {}) {
  const ask = getDetail || ((id) => get(`https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?${new URLSearchParams({ apikey: key, locale: "*" })}`, { json: true }));
  let asked = 0;
  let found = 0;
  // Soonest Toronto events first: those are the ones people see this week (out-of-town listings are dropped anyway)
  const inCity = (r) => r.venue && r.venue.lat > 43.58 && r.venue.lat < 43.86 && r.venue.lng > -79.64 && r.venue.lng < -79.11;
  const todo = list.filter((r) => r.price == null && inCity(r)).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  for (const r of todo) {
    if (asked >= max) break;
    asked++;
    try {
      const pr = ticketmasterPrice(await ask(r.sourceId));
      if (pr) {
        r.price = pr.low;
        r.priceHigh = pr.high;
        found++;
      }
    } catch (err) {
      if (log) log(`  ticketmaster detail ${r.sourceId}: ${String(err.message).replace(key || "\u0000", "***")}`);
    }
  }
  if (log) log(`  ticketmaster: asked ${asked} event pages for a missing price, found ${found}`);
  return { asked, found };
}

async function fetchTicketmaster({ start, end, max, log }) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) {
    log("  ticketmaster: skipped (no TICKETMASTER_API_KEY in .env)");
    return { skipped: "No TICKETMASTER_API_KEY in .env" };
  }
  const out = new Map();
  // The API stops at 1,000 results per query, so ask a week at a time
  for (let from = new Date(start); from < end && out.size < max; from = new Date(from.getTime() + 7 * 86400000)) {
    const to = new Date(Math.min(end.getTime(), from.getTime() + 7 * 86400000));
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({
        apikey: key,
        latlong: "43.6532,-79.3832",
        radius: "60",
        unit: "km",
        startDateTime: from.toISOString().slice(0, 19) + "Z",
        endDateTime: to.toISOString().slice(0, 19) + "Z",
        size: "200",
        page: String(page),
        sort: "date,asc",
        locale: "*",
      });
      let data;
      try {
        data = await get(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, { json: true });
      } catch (err) {
        log(`  ticketmaster: ${err.message.replace(key, "***")}`);
        break;
      }
      const evs = (data._embedded && data._embedded.events) || [];
      for (const e of evs) {
        const r = toRaw(e);
        if (r) out.set(e.id, r);
      }
      log(`  ticketmaster ${from.toISOString().slice(0, 10)} page ${page}: ${out.size} so far`);
      const pages = data.page ? data.page.totalPages : 0;
      if (page + 1 >= pages) break;
    }
  }
  const list = [...out.values()].slice(0, max);
  await fillPrices(list, { key, log });
  return list;
}

module.exports = { fetchTicketmaster, toRaw, fillPrices };
