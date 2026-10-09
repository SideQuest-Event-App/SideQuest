// Eventbrite: every in-person Toronto listing in the window (the same public "all events" pages
// search engines index), then each event's page for its price, organizer and full description.
// No public search API exists, and /api/v3/destination/events/ is off-limits in robots.txt.
// A listing query stops at 49 pages (980 events), so busy date ranges are split until each fits.

const { get, jsonLdEvents, embeddedObject, sleep } = require("../fetch");

const USD_TO_CAD = 1.37; // Eventbrite sometimes shows prices converted to USD; convert back
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

// Only what we use from an event page, so the cache stays small
function eventPageInfo(html) {
  const ld = jsonLdEvents(html).find((x) => x.offers || x.organizer) || {};
  const offers = [].concat(ld.offers || []);
  const org = ld.organizer && (ld.organizer.name || (ld.organizer[0] && ld.organizer[0].name));
  return {
    offers: offers.map((o) => ({ low: o.lowPrice != null ? o.lowPrice : o.price, high: o.highPrice != null ? o.highPrice : o.price, currency: o.priceCurrency })),
    organizer: org || null,
    description: ld.description || "",
    image: [].concat(ld.image || [])[0] || null,
  };
}

async function fetchEventbrite({ start, end, max, log }) {
  const listed = new Map();
  const listingUrl = (s, e, page) => `https://www.eventbrite.ca/d/canada--toronto/all-events/?start_date=${s}&end_date=${e}&page=${page}`;
  // Listing pages rate-limit after a while: back off for a few minutes rather than leave a gap
  const readPage = async (s, e, page) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const data = embeddedObject(await get(listingUrl(s, e, page)), "window.__SERVER_DATA__");
        return data && data.search_data && data.search_data.events;
      } catch (err) {
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
    if (listed.size >= max) return;
    let first;
    try {
      first = await readPage(s, e, 1);
    } catch (err) {
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
        log(`  eventbrite ${s}..${e} p${page}: ${err.message}`);
        break;
      }
    }
    log(`  eventbrite ${s}..${e}: ${total} listed, ${listed.size} in-person so far`);
  }

  // A week at a time keeps most queries under the cap without splitting
  const last = ymd(end);
  for (let s = ymd(start); s <= last && listed.size < max; s = addDays(s, 7)) {
    const e = addDays(s, 6) > last ? last : addDays(s, 6);
    await readRange(s, e);
  }

  const chosen = [...listed.values()].slice(0, max);
  log(`  eventbrite: ${chosen.length} in-person listings, reading each event page for price and organizer`);

  const out = [];
  for (const [n, { r, cats }] of chosen.entries()) {
    let price = null;
    let priceHigh = null;
    let priceNote = null;
    let organizer = null;
    let description = r.summary || "";
    let image = r.image && r.image.image_sizes && (r.image.image_sizes.large || r.image.image_sizes.medium);
    try {
      const info = await get(r.url, { extract: eventPageInfo });
      if (info) {
        const lows = info.offers.map((o) => Number(o.low)).filter(Number.isFinite);
        const highs = info.offers.map((o) => Number(o.high)).filter(Number.isFinite);
        const usd = info.offers.some((o) => o.currency === "USD");
        if (lows.length) {
          price = Math.min(...lows) * (usd ? USD_TO_CAD : 1);
          priceHigh = Math.max(...highs) * (usd ? USD_TO_CAD : 1);
          if (usd && price > 0) priceNote = `About $${Math.ceil(price)}${priceHigh > price + 1 ? "+" : ""} (converted)`;
        }
        organizer = info.organizer;
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

module.exports = { fetchEventbrite, torontoISO };
