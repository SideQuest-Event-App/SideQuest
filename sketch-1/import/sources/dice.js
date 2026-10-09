// DICE: the event sitemaps DICE publishes for crawlers, filtered to GTA events in the window,
// then each event page's schema.org data (start time, venue and coordinates, price, promoter).
// Each venue page also lists all its upcoming events, so venues found this way add many more.
// DICE's /api/ is off-limits in its robots.txt, so it isn't used.

const { get, jsonLdEvents } = require("../fetch");

const GTA = /-(toronto|mississauga|brampton|markham|vaughan|richmond-hill|oakville|burlington|pickering|ajax|whitby|oshawa|etobicoke|scarborough|north-york|east-york)-tickets$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

async function fetchDice({ start, end, max, log }) {
  const index = await get("https://dice.fm/sitemaps/sitemap.xml");
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // Month words that fall in the window ("3rd-oct"), to skip pages we'd only throw away
  const months = new Set();
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000 * 7)) months.add(MONTHS[d.getMonth()]);
  months.add(MONTHS[end.getMonth()]);
  const monthRe = new RegExp(`-\\d{1,2}(st|nd|rd|th)-(${[...months].join("|")})-`);

  const urls = new Set();
  for (const m of maps) {
    try {
      const xml = await get(m);
      for (const u of xml.matchAll(/<loc>([^<]+\/event\/[^<]+)<\/loc>/g)) if (GTA.test(u[1]) && monthRe.test(u[1])) urls.add(u[1]);
    } catch (err) {
      log(`  dice ${m}: ${err.message}`);
    }
  }
  const list = [...urls].slice(0, max);
  log(`  dice: ${urls.size} GTA event pages in the window's months, reading ${list.length}`);

  const out = [];
  const venues = new Set();
  const seen = new Set();
  const keyOf = (name, startDate) => `${String(name).toLowerCase()}|${String(startDate).slice(0, 16)}`;
  for (const [n, url] of list.entries()) {
    try {
      const ev = jsonLdEvents(await get(url))[0];
      if (!ev || !ev.startDate) continue;
      const startsAt = new Date(ev.startDate);
      if (startsAt < start || startsAt > end) continue;
      if (ev.eventStatus && /Cancelled|Postponed/.test(ev.eventStatus)) continue;
      const loc = ev.location || {};
      if (loc.url) venues.add(loc.url);
      seen.add(keyOf(ev.name, ev.startDate));
      const offer = [].concat(ev.offers || [])[0] || {};
      const low = Number(offer.lowPrice != null ? offer.lowPrice : offer.price);
      const high = Number(offer.highPrice);
      out.push({
        source: "DICE",
        sourceId: url.split("/event/")[1],
        url,
        title: ev.name,
        startsAt: ev.startDate,
        endsAt: ev.endDate || null,
        venue: { name: loc.name, address: loc.address && (loc.address.streetAddress || ""), lat: loc.geo && loc.geo.latitude, lng: loc.geo && loc.geo.longitude, city: loc.address && loc.address.addressLocality },
        price: Number.isFinite(low) ? low : null,
        priceHigh: Number.isFinite(high) ? high : null,
        description: ev.description || "",
        categories: ["live music", ev["@type"] === "MusicEvent" ? "concert" : "", ...[].concat(ev.performer || []).map((p) => p && p.name).filter(Boolean).slice(0, 2)].filter(Boolean),
        organizer: ev.organizer && ev.organizer.name,
        image: [].concat(ev.image || [])[0] ? `${[].concat(ev.image)[0].split("?")[0]}?w=800&h=450&fit=crop&auto=format` : null,
      });
    } catch (err) {
      log(`  dice ${url}: ${err.message}`);
    }
    if ((n + 1) % 25 === 0) log(`  dice: ${n + 1}/${list.length} event pages read`);
  }

  // Every upcoming event at those venues
  log(`  dice: reading ${venues.size} venue pages`);
  for (const vurl of venues) {
    if (out.length >= max) break;
    let place;
    try {
      place = jsonLdEvents.places(await get(vurl))[0];
    } catch (err) {
      log(`  dice ${vurl}: ${err.message}`);
      continue;
    }
    if (!place || !place.geo) continue;
    for (const ev of [].concat(place.event || [])) {
      if (!ev.startDate || seen.has(keyOf(ev.name, ev.startDate))) continue;
      const startsAt = new Date(ev.startDate);
      if (startsAt < start || startsAt > end || (ev.eventStatus && /Cancelled|Postponed/.test(ev.eventStatus))) continue;
      seen.add(keyOf(ev.name, ev.startDate));
      const offer = [].concat(ev.offers || [])[0] || {};
      const low = Number(offer.lowPrice != null ? offer.lowPrice : offer.price);
      const high = Number(offer.highPrice);
      const img = [].concat(ev.image || [])[0];
      out.push({
        source: "DICE",
        sourceId: ev.url.split("/event/")[1],
        url: ev.url,
        title: ev.name,
        startsAt: ev.startDate,
        endsAt: ev.endDate || null,
        venue: { name: place.name, address: typeof place.address === "string" ? place.address : (place.address && place.address.streetAddress) || "", lat: place.geo.latitude, lng: place.geo.longitude, city: ((String(place.address || "").match(/,\s*([A-Za-z .'-]+),\s*Ontario/) || [])[1] || "Toronto").trim() },
        price: Number.isFinite(low) ? low : null,
        priceHigh: Number.isFinite(high) ? high : null,
        description: "",
        categories: ["concert"],
        organizer: null,
        image: img ? `${img.split("?")[0]}?w=800&h=450&fit=crop&auto=format` : null,
      });
    }
  }
  return out.slice(0, max);
}

module.exports = { fetchDice };
