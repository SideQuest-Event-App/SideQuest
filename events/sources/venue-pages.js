// Venue websites that describe their upcoming events with schema.org Event data (JSON-LD), the same structured data
// search engines read: Horseshoe Tavern, Sneaky Dee's, DROM Taberna and others. The list is config/venue-pages.json;
// a page is added after checking its robots.txt allows it (lib/fetch.js checks again on every request).
// When a page gives a date but no time, the venue's usual start ("usualStart" in the list) is used and the listing
// says so in its details.

const fs = require("fs");
const path = require("path");
const { get } = require("../lib/fetch");
const { venueIndex } = require("./known-venues");

const LIST = require("../lib/paths").config("venue-pages.json");
const strip = (h) => String(h || "").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

// Every schema.org Event anywhere in the page's JSON-LD (sites nest them under mainEntity, subEvent, event, @graph…)
function deepEvents(html) {
  const out = [];
  const seen = new Set();
  const visit = (j, depth) => {
    if (!j || typeof j !== "object" || depth > 8 || seen.has(j)) return;
    seen.add(j);
    if (Array.isArray(j)) return j.forEach((x) => visit(x, depth + 1));
    if (typeof j["@type"] === "string" && /Event$/.test(j["@type"]) && j.name && j.startDate) out.push(j);
    for (const v of Object.values(j)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { visit(JSON.parse(m[1]), 0); } catch {}
  }
  return out;
}

function list() {
  try {
    return JSON.parse(fs.readFileSync(LIST, "utf8")).pages || [];
  } catch {
    return [];
  }
}

// A Toronto wall-clock time → ISO
function torontoISO(local) {
  const guess = new Date(`${local}:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: "America/Toronto" }) + " UTC");
  return new Date(guess.getTime() + (guess.getTime() - shown.getTime())).toISOString();
}
// "2026-11-26T20:00:00-05:00" → as is; "November 26, 2026" or "2026-11-26" → that date at the usual start (flagged)
function startOf(value, usual = "20:00") {
  const s = String(value || "").trim();
  if (!s) return null;
  if (/T\d{2}:\d{2}/.test(s)) {
    // No offset ("2026-04-24T18:30:00") means Toronto time, wherever the import runs
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return { iso: torontoISO(s.slice(0, 16)), timeGiven: true };
    return isNaN(Date.parse(s)) ? null : { iso: new Date(s).toISOString(), timeGiven: true };
  }
  const d = new Date(`${s} 12:00 UTC`);
  if (isNaN(d)) return null;
  return { iso: torontoISO(`${d.toISOString().slice(0, 10)}T${usual}`), timeGiven: false };
}
function priceOf(offers) {
  const all = [].concat(offers || []).flatMap((o) => [o.price, o.lowPrice, o.highPrice]).filter((p) => p != null && String(p).trim() !== "")
    .map((p) => Number(String(p).replace(/[^\d.]/g, ""))).filter((n) => Number.isFinite(n) && n >= 0 && String(n) !== "");
  return all.length ? { price: Math.min(...all), priceHigh: Math.max(...all) } : { price: null, priceHigh: null };
}

async function fetchVenuePages({ start, end, max, log, previous = [] }) {
  const pages = list();
  if (!pages.length) return { skipped: "No venue pages listed yet (config/venue-pages.json)" };
  const known = venueIndex(previous);
  const out = [];
  for (const p of pages) {
    let n = 0;
    try {
      const html = await get(p.url);
      for (const x of deepEvents(html)) {
        if (out.length >= max) break;
        if (/Online/.test(x.eventAttendanceMode || "") || /Cancelled|Postponed/.test(x.eventStatus || "")) continue;
        const when = startOf(x.startDate, p.usualStart);
        if (!when || new Date(when.iso) < start || new Date(when.iso) > end) continue;
        const loc = [].concat(x.location || [])[0] || {};
        const addr = loc.address && typeof loc.address === "object" ? [loc.address.streetAddress, loc.address.addressLocality].filter(Boolean).join(", ") : loc.address || "";
        const name = p.venue.name || loc.name;
        const k = known.find(name);
        const geo = loc.geo || {};
        const url = x.url ? new URL(x.url, p.url).href : (x.offers && [].concat(x.offers)[0] && [].concat(x.offers)[0].url ? new URL([].concat(x.offers)[0].url, p.url).href : p.url);
        const text = strip(x.description);
        const perf = [].concat(x.performer || []).map((y) => y && y.name).filter(Boolean);
        const img = [].concat(x.image || [])[0];
        out.push({
          source: p.name,
          sourceId: `${url}|${when.iso.slice(0, 10)}|${x.name}`,
          url,
          title: strip(x.name),
          startsAt: when.iso,
          endsAt: x.endDate && /T\d{2}:\d{2}/.test(x.endDate) ? new Date(x.endDate).toISOString() : null,
          venue: { name, address: addr || p.venue.address || (k && k.address) || "", lat: geo.latitude != null ? Number(geo.latitude) : k ? k.lat : null, lng: geo.longitude != null ? Number(geo.longitude) : k ? k.lng : null, city: "Toronto" },
          ...priceOf(x.offers),
          priceNote: null,
          description: text.split("\n")[0] || "",
          details: [text, perf.length ? `With ${perf.join(", ")}` : "", when.timeGiven ? "" : `Start time not on the venue's page (shown at ${p.usualStart || "20:00"}, its usual start)`].filter(Boolean).join("\n"),
          categories: p.categories || [],
          organizer: name,
          // The venue's generic share image isn't the event's poster
          image: img && (!p.genericImage || !String(typeof img === "string" ? img : img.url).includes(p.genericImage)) ? (typeof img === "string" ? img : img.url) : null,
        });
        n++;
      }
      log(`  ${p.name}: ${n} events`);
    } catch (err) {
      log(`  ${p.name}: ${err.message}`);
    }
  }
  return out;
}

module.exports = { fetchVenuePages, startOf, priceOf, list, deepEvents };
