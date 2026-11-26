// TOREVENT (torevent.ca): a free, hand-curated Toronto arts and nightlife calendar (concerts, club nights, comedy, film,
// queer nights at the Black Eagle and Cafeteria...). The site publishes its whole calendar as one file, events.js
// (window.TOREVENT_DATA = {...}), which its own pages load; robots.txt allows everything and its terms
// (torevent.ca/terms-disclaimer/) don't restrict reuse. It's one person's work, so every listing links back to its
// TOREVENT page, and "Also listed on" credits it when the same event comes from another source too.
// No coordinates in the file: known venues are matched by name, the rest are looked up by lib/locate.js.

const { get } = require("../lib/fetch");
const { venueIndex } = require("./known-venues");

const URL_ = "https://torevent.ca/events.js";
// Its categories are genres plus one per venue ("Comedy-Bar-Bloor"); only the genres are kept
const GENRES = new Set(["Concert", "DJ/Club/Rave", "Comedy", "Film", "Dance - Performance - Theatre", "Dance---Performance---Theatre", "History", "Karaoke", "Art", "Market", "Literary", "Workshop", "Talk", "Drag", "Queer", "Festival", "Food & Drink", "Games", "Poetry", "Open Mic", "Burlesque", "Jazz", "Classical", "Theatre"]);

function parseFile(text) {
  const m = String(text).match(/window\.TOREVENT_DATA\s*=\s*([\s\S]*?);?\s*$/);
  if (!m) throw new Error("TOREVENT's calendar file isn't in the expected shape");
  const data = JSON.parse(m[1]);
  if (!Array.isArray(data.events)) throw new Error("TOREVENT's calendar file has no events");
  return data;
}

// "DROM Taberna, 458 Queen St W, Toronto, ON M5V 2A8, Canada" → address and city
function splitLocation(venue, location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && venue && parts[0].toLowerCase() === String(venue).toLowerCase()) parts.shift();
  const city = (parts.find((p) => /^(toronto|north york|scarborough|etobicoke|east york|york|mississauga|brampton|markham|vaughan|richmond hill|oakville|pickering|ajax)$/i.test(p)) || "Toronto");
  return { address: parts.filter((p) => !/^canada$/i.test(p)).join(", "), city };
}

async function fetchTorevent({ start, end, max, log, previous = [] }) {
  const text = await get(URL_, { timeoutMs: 60000 });
  const data = parseFile(text);
  const known = venueIndex(previous);
  const out = [];
  let matched = 0;
  for (const x of data.events) {
    if (out.length >= max) break;
    const s = new Date(x.start);
    if (isNaN(s) || s < start || s > end || !x.title) continue;
    if (/\b(online|virtual|livestream|zoom)\b/i.test(`${x.venue} ${x.location}`)) continue;
    const { address, city } = splitLocation(x.venue, x.location);
    const k = known.find(x.venue);
    if (k) matched++;
    const desc = String(x.description || "").replace(/\r/g, "");
    // Ticket link: the listing's own action link, else the first outside link that isn't social media
    const ticket = x.actionUrl || (x.externalLinks || []).find((u) => !/instagram|facebook|soundcloud|tiktok|twitter|x\.com|youtube/i.test(u)) || null;
    const labels = (x.labels || []).join(" ");
    out.push({
      source: "TOREVENT",
      sourceId: String(x.id),
      url: x.url,
      ticketUrl: ticket,
      title: x.title,
      startsAt: s.toISOString(),
      endsAt: x.end && !x.isAllDay ? new Date(x.end).toISOString() : null,
      venue: { name: x.venue || "", address: address || (k && k.address) || "", lat: k ? k.lat : null, lng: k ? k.lng : null, city },
      price: /\bfree\b/i.test(`${labels} ${desc.slice(0, 200)}`) ? 0 : null,
      priceNote: null,
      description: desc.split(/\n\s*\n/)[0] || "",
      details: [labels, desc].filter(Boolean).join("\n"),
      categories: (x.categories || []).filter((c) => GENRES.has(c)).map((c) => c.replace(/-+/g, " ").replace(/\s+/g, " ")),
      organizer: null,
      image: x.image || null,
    });
  }
  log(`  torevent: ${out.length} events in the window (${matched} at venues we already had coordinates for)`);
  return out;
}

module.exports = { fetchTorevent, parseFile, splitLocation };
