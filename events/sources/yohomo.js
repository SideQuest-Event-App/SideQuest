// YOHOMO (yohomo.ca): "Toronto's online community dedicated to queer arts, culture, and nightlife". Its events page
// lists upcoming 2SLGBTQ+ events (Black Eagle nights, Buddies, drag, comedy, parties) that are often on no ticketing
// site at all. robots.txt allows everything (it only names the sitemap). Each listing is read from its own page:
// title, time, venue and address, price, ticket link, poster and write-up. Every listing links back to YOHOMO.
// Pages give the weekday and date but no year: the next such date on or after today (within the window) is used.

const { get } = require("../lib/fetch");
const { venueIndex } = require("./known-venues");

const BASE = "https://www.yohomo.ca";
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/‍/g, "");
const text = (h) => decode(String(h || "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const ps = (h) => [...String(h || "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1])).filter(Boolean);

// The links on the events page: /event/<slug>
function eventLinks(html) {
  return [...new Set([...String(html).matchAll(/href="(\/event\/[a-z0-9-]+)"/gi)].map((m) => m[1]))];
}

// "Nov 29" + "4:30 pm" → the next Toronto date-time on or after `today` (null if it doesn't parse)
function whenOf(dateText, timeText, today = new Date()) {
  const m = String(dateText || "").match(/([A-Za-z]{3,4})\.?\s+(\d{1,2})/);
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  const t = String(timeText || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  let h = t ? Number(t[1]) % 12 + (/pm/i.test(t[3]) ? 12 : 0) : 20;
  const mi = t && t[2] ? Number(t[2]) : 0;
  const y0 = Number(today.toLocaleString("en-US", { year: "numeric", timeZone: "America/Toronto" }));
  for (const y of [y0, y0 + 1]) {
    const local = `${y}-${String(MONTHS[m[1].toLowerCase()] + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    const iso = torontoISO(local);
    // Allow an event that started earlier today
    if (Date.parse(iso) >= today.getTime() - 12 * 3600000) return iso;
  }
  return null;
}
// A Toronto wall-clock time → ISO (handles daylight time)
function torontoISO(local) {
  const guess = new Date(`${local}:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: "America/Toronto" }) + " UTC");
  return new Date(guess.getTime() + (guess.getTime() - shown.getTime())).toISOString();
}

// One event page → a listing (null when it lacks a title or a date)
function parsePage(html, url, today = new Date()) {
  const s = String(html);
  const title = text((s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const date = ps((s.match(/class="item-event-date"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]).filter((x) => x !== ".");
  const hours = ps((s.match(/class="item-event-hours"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]).filter((x) => x !== "→");
  const loc = ps((s.match(/class="event-item-location"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
  const priceBlock = (s.match(/>PRICE<\/p>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
  const priceText = ps(priceBlock).join(" ");
  const tickets = (s.match(/<a href="(https?:[^"]+)"[^>]*class="button w-button"[^>]*>\s*GET[\s\u00a0]+TICKETS/i) || [])[1] || null;
  const image = (s.match(/class="event-image-wrapper"[\s\S]*?<img src="([^"]+)"/i) || [])[1] || (s.match(/property="og:image" content="([^"]+)"/i) || [])[1] || null;
  const body = text((s.match(/class="text-rich-text events w-richtext"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
  const date0 = date.find((x) => /\d/.test(x));
  if (!title || !date0) return null;
  const startsAt = whenOf(date0, hours[0], today);
  if (!startsAt) return null;
  let endsAt = hours[1] ? whenOf(date0, hours[1], today) : null;
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = new Date(Date.parse(endsAt) + 86400000).toISOString(); // past midnight
  const nums = (priceText.match(/\d+(\.\d+)?/g) || []).map(Number);
  const price = /free|pwyc|no cover/i.test(priceText) && !nums.length ? 0 : nums.length ? Math.min(...nums) : null;
  return {
    source: "YOHOMO",
    sourceId: url.split("/event/")[1],
    url,
    ticketUrl: tickets,
    title,
    startsAt,
    endsAt,
    venue: { name: loc[0] || "", address: loc.slice(1).join(", "), lat: null, lng: null, city: "Toronto" },
    price,
    priceHigh: nums.length ? Math.max(...nums) : null,
    priceNote: priceText || null,
    description: body.split("\n")[0] || "",
    details: body,
    categories: ["queer"], // everything YOHOMO lists is a 2SLGBTQ+ event
    organizer: null,
    image,
  };
}

async function fetchYohomo({ start, end, max, log, previous = [] }) {
  const known = venueIndex(previous);
  const links = eventLinks(await get(BASE)); // the homepage lists the upcoming events
  const out = [];
  for (const link of links.slice(0, max)) {
    const url = BASE + link;
    let e = null;
    try {
      e = parsePage(await get(url), url, start);
    } catch (err) {
      log(`  yohomo ${link}: ${err.message}`);
    }
    if (!e || new Date(e.startsAt) < start || new Date(e.startsAt) > end) continue;
    const k = known.find(e.venue.name);
    if (k) Object.assign(e.venue, { lat: k.lat, lng: k.lng, address: e.venue.address || k.address || "" });
    out.push(e);
  }
  log(`  yohomo: ${links.length} listings linked, ${out.length} in the window`);
  return out;
}

module.exports = { fetchYohomo, parsePage, eventLinks, whenOf };
