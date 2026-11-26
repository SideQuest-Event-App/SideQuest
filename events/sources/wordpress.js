// Venue websites on WordPress with "The Events Calendar" (a very common venue calendar plugin): its public REST API,
// /wp-json/tribe/events/v1/events, gives each event's full description, price and times. The list of sites is
// config/wp-calendars.json; each entry says where the venue is, because these calendars often name a room ("The
// Cabaret") instead of the building. A site is only added after checking its robots.txt allows it (lib/fetch.js
// checks again on every request). Images missing from the API are taken from the event page's og:image.

const fs = require("fs");
const path = require("path");
const { get } = require("../lib/fetch");
const { venueIndex } = require("./known-venues");

const LIST = require("../lib/paths").config("wp-calendars.json");
const strip = (h) => String(h || "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;|&#038;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#8217;|&#8216;|&#39;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#\d+;/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const ogImage = (html) => ({ image: (String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1] || null });

function list() {
  try {
    return JSON.parse(fs.readFileSync(LIST, "utf8")).calendars || [];
  } catch {
    return [];
  }
}

// The venue's coordinates: from the list if given, else from earlier imports, else lib/locate.js looks them up
function where(v, known) {
  if (Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng)) && v.lat !== null) return { lat: Number(v.lat), lng: Number(v.lng) };
  const k = known.find(v.name);
  return k ? { lat: k.lat, lng: k.lng } : { lat: null, lng: null };
}

// "$15 + fees", "Free", "$10 – $20": the lowest number, or 0 when it says free
function costOf(e) {
  const vals = ((e.cost_details && e.cost_details.values) || []).map(Number).filter(Number.isFinite);
  if (vals.length) return { price: Math.min(...vals), priceHigh: Math.max(...vals), note: e.cost || null };
  const c = strip(e.cost);
  if (/free/i.test(c)) return { price: 0, priceHigh: 0, note: c };
  const n = (c.match(/\d+(\.\d+)?/g) || []).map(Number);
  return n.length ? { price: Math.min(...n), priceHigh: Math.max(...n), note: c } : { price: null, priceHigh: null, note: null };
}

// "2026-11-26 21:00:00" in the calendar's own zone (Toronto) → ISO
function torontoTime(local, utc) {
  if (utc) return new Date(utc.replace(" ", "T") + "Z").toISOString();
  return local ? new Date(local.replace(" ", "T") + "-05:00").toISOString() : null;
}

async function fetchWordpress({ start, end, max, log, previous = [] }) {
  const cals = list();
  if (!cals.length) return { skipped: "No WordPress venue calendars listed yet (config/wp-calendars.json)" };
  const known = venueIndex(previous);
  const out = [];
  const day = (d) => d.toISOString().slice(0, 10);
  for (const c of cals) {
    let n = 0;
    try {
      for (let page = 1; page <= 20 && out.length < max; page++) {
        const q = new URLSearchParams({ start_date: day(start), end_date: day(end), per_page: "50", page: String(page) });
        const data = await get(`${c.site.replace(/\/$/, "")}/wp-json/tribe/events/v1/events?${q}`, { json: true });
        for (const e of data.events || []) {
          if (e.is_virtual || e.hide_from_listings || e.status !== "publish") continue;
          const v = e.venue && !Array.isArray(e.venue) ? e.venue : {};
          const room = strip(v.venue || "");
          // The building from the config; a room name that isn't the building is kept in the venue name
          const venueName = c.venue.name || room; // the building, so all its nights group under one venue
          let image = e.image && e.image.url ? e.image.url : null;
          if (!image && e.url) {
            try { image = ((await get(e.url, { extract: ogImage })) || {}).image || null; } catch {}
          }
          const text = strip(e.description);
          const { price, priceHigh, note } = costOf(e);
          out.push({
            source: c.name,
            sourceId: String(e.id),
            url: e.url,
            ticketUrl: e.website || (String(e.description).match(/href="(https?:\/\/(?:www\.)?(?:showpass|eventbrite|tickettailor|dice|universe)[^"]+)"/i) || [])[1] || e.url,
            title: strip(e.title),
            startsAt: torontoTime(e.start_date, e.utc_start_date),
            endsAt: torontoTime(e.end_date, e.utc_end_date),
            venue: { name: venueName, address: c.venue.address, ...where(c.venue, known), city: "Toronto" },
            price,
            priceHigh,
            priceNote: note,
            description: strip(e.excerpt) || text,
            details: [room && room !== c.venue.name ? `Room: ${room}` : "", text].filter(Boolean).join("\n"),
            categories: [...(e.categories || []).map((x) => x.name), ...(e.tags || []).map((x) => x.name), ...(c.categories || [])],
            organizer: c.venue.name,
            image,
          });
          n++;
        }
        if (!data.total_pages || page >= data.total_pages) break;
      }
      log(`  ${c.name}: ${n} events`);
    } catch (err) {
      log(`  ${c.name}: ${err.message}`);
    }
  }
  return out;
}

module.exports = { fetchWordpress, costOf, torontoTime, list };
