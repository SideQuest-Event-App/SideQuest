// Showpass: the ticketing site many Toronto venues and promoters sell through (Buddies in Bad Times, Burdock, Hugh's
// Room, comedy rooms, kink and queer parties). Its public events API (www.showpass.com/api/public/events/, which
// robots.txt allows) filters by the location's city; we ask for each GTA city and keep in-person events in the window.

const { get } = require("../lib/fetch");

const API = "https://www.showpass.com/api/public/events/";
const CITIES = ["Toronto", "North York", "Scarborough", "Etobicoke", "East York", "York", "Mississauga", "Brampton", "Markham", "Vaughan", "Richmond Hill", "Oakville", "Pickering", "Ajax"];
const strip = (h) => String(h || "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

// Lowest and highest ticket price (CAD), from the ticket types on sale
function prices(e) {
  const ps = (e.ticket_types || []).filter((t) => t && t.visibility !== 0 && !t.is_donation).map((t) => Number(t.price)).filter((n) => Number.isFinite(n) && n >= 0);
  if (!ps.length) return { price: null, priceHigh: null };
  return { price: Math.min(...ps), priceHigh: Math.max(...ps) };
}

function toRaw(e) {
  const loc = e.location || {};
  const [lat, lng] = String(loc.position || "").split(",").map(Number);
  const text = strip(e.description || e.description_without_html || "");
  const { price, priceHigh } = prices(e);
  return {
    source: "Showpass",
    sourceId: String(e.id),
    url: e.frontend_details_url,
    title: e.name,
    startsAt: e.starts_on,
    endsAt: e.ends_on || null,
    venue: { name: loc.name || (e.venue && e.venue.name) || "", address: [loc.street_name, loc.city].filter(Boolean).join(", "), lat, lng, city: loc.city },
    price,
    priceHigh,
    priceNote: e.inventory_sold_out || e.sold_out ? "Sold out" : null,
    description: e.subtitle ? `${e.subtitle}. ${text}` : text,
    details: text,
    categories: [],
    organizer: (e.venue && e.venue.name) || null,
    image: e.image_banner || e.image || null,
  };
}

async function fetchShowpass({ start, end, max, log }) {
  const out = [];
  const seen = new Set();
  for (const city of CITIES) {
    let url = `${API}?${new URLSearchParams({ location__city: city, page_size: "100", ordering: "starts_on", starts_on__gte: start.toISOString() })}`;
    for (let page = 0; url && page < 30 && out.length < max; page++) {
      const data = await get(url, { json: true });
      for (const e of data.results || []) {
        if (seen.has(e.id) || e.is_password_protected || !e.is_published || (e.virtual_event_type && e.virtual_event_type !== "none" && !e.location)) continue;
        seen.add(e.id);
        const s = new Date(e.starts_on);
        if (isNaN(s) || s < start || s > end) continue;
        out.push(toRaw(e));
      }
      url = data.next || null;
    }
  }
  log(`  showpass: ${out.length} GTA events in the window`);
  return out;
}

module.exports = { fetchShowpass, toRaw };
