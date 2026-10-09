// Ticketmaster: the official Discovery API (free key from developer.ticketmaster.com).
// Put TICKETMASTER_API_KEY=... in sketch-1/.env. Without a key this source is skipped.

const { get } = require("../fetch");

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
        const c = (e.classifications || [])[0] || {};
        if (c.segment && /Sports/i.test(c.segment.name)) continue; // outside our three scenes
        const v = ((e._embedded && e._embedded.venues) || [])[0] || {};
        const pr = (e.priceRanges || [])[0];
        const img = (e.images || []).filter((i) => i.ratio === "16_9" && i.width >= 600).sort((a, b) => a.width - b.width)[0];
        if (!e.dates || !e.dates.start || !e.dates.start.dateTime) continue;
        if (e.dates.status && /cancel|postpone/i.test(e.dates.status.code)) continue;
        out.set(e.id, {
          source: "Ticketmaster",
          sourceId: e.id,
          url: e.url,
          title: e.name,
          startsAt: e.dates.start.dateTime,
          endsAt: null,
          venue: { name: v.name, address: [v.address && v.address.line1, v.city && v.city.name].filter(Boolean).join(", "), lat: v.location && v.location.latitude, lng: v.location && v.location.longitude, city: v.city && v.city.name },
          price: pr ? pr.min : null,
          priceHigh: pr ? pr.max : null,
          description: e.info || e.pleaseNote || "",
          categories: [c.segment, c.genre, c.subGenre].map((x) => x && x.name).filter((n) => n && n !== "Undefined"),
          organizer: (e.promoter && e.promoter.name) || v.name,
          image: img && img.url,
        });
      }
      log(`  ticketmaster ${from.toISOString().slice(0, 10)} page ${page}: ${out.size} so far`);
      const pages = data.page ? data.page.totalPages : 0;
      if (page + 1 >= pages) break;
    }
  }
  return [...out.values()].slice(0, max);
}

module.exports = { fetchTicketmaster };
