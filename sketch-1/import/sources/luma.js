// Luma: the public Toronto discover page's event list (api.lu.ma's discover endpoint, which the page
// itself loads and robots.txt allows), then each event's page for its full description.

const { get, jsonLdEvents } = require("../fetch");

// Only what we use from an event page, so the cache stays small
const eventPageInfo = (html) => {
  const ld = jsonLdEvents(html)[0] || {};
  return { description: ld.description || "", organizer: ld.organizer && [].concat(ld.organizer)[0] && [].concat(ld.organizer)[0].name };
};

async function fetchLuma({ start, end, max, log }) {
  const page = await get("https://luma.com/toronto");
  const place = (page.match(/discplace-[A-Za-z0-9]+/) || [])[0];
  if (!place) throw new Error("Couldn't find Luma's Toronto place id");

  const entries = [];
  let cursor = null;
  do {
    const q = new URLSearchParams({ discover_place_api_id: place, pagination_limit: "50" });
    if (cursor) q.set("pagination_cursor", cursor);
    const data = await get(`https://api.lu.ma/discover/get-paginated-events?${q}`, { json: true });
    entries.push(...(data.entries || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && entries.length < max);
  log(`  luma: ${entries.length} Toronto events listed`);

  const out = [];
  for (const x of entries.slice(0, max)) {
    const e = x.event || {};
    if (e.location_type && e.location_type !== "offline") continue;
    const startsAt = new Date(e.start_at);
    if (startsAt < start || startsAt > end) continue;
    const geo = e.geo_address_info || {};
    const coord = e.coordinate || (geo.place_coordinate && { latitude: geo.place_coordinate.latitude, longitude: geo.place_coordinate.longitude }) || {};
    const t = x.ticket_info || {};
    const cents = t.price && (t.price.cents != null ? t.price.cents : t.price.amount);
    const maxCents = t.max_price && (t.max_price.cents != null ? t.max_price.cents : t.max_price.amount);
    let info = {};
    try {
      info = (await get(`https://luma.com/${e.url}`, { extract: eventPageInfo })) || {};
    } catch (err) {
      log(`  luma ${e.url}: ${err.message}`);
    }
    out.push({
      source: "Luma",
      sourceId: e.api_id,
      url: `https://luma.com/${e.url}`,
      title: e.name,
      startsAt: e.start_at,
      endsAt: e.end_at || null,
      venue: { name: geo.address || geo.short_address || "", address: geo.full_address || geo.short_address || "", lat: coord.latitude, lng: coord.longitude, city: geo.city },
      price: t.is_free ? 0 : cents != null ? cents / 100 : null,
      priceHigh: maxCents != null ? maxCents / 100 : null,
      priceNote: t.is_sold_out ? "Sold out" : null,
      description: info.description || "",
      categories: ["luma"],
      organizer: ((x.hosts || [])[0] || {}).name || (x.calendar && x.calendar.name !== "Personal" ? x.calendar.name : null) || info.organizer || null,
      image: e.cover_url || null,
    });
  }
  return out;
}

module.exports = { fetchLuma };
