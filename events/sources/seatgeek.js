// SeatGeek: the official Platform API (https://platform.seatgeek.com), for Toronto-area concerts, comedy and theatre.
// Needs SEATGEEK_CLIENT_ID (a free client id: sign in at https://seatgeek.com/account/develop and register an app).
// Without it this source is skipped. In the workflow it comes from the SEATGEEK_CLIENT_ID GitHub secret.
//
//   GET https://api.seatgeek.com/2/events?client_id=...&lat=43.6532&lon=-79.3832&range=60km
//       &datetime_utc.gte=...&datetime_utc.lte=...&per_page=100&page=N
//   Response: { meta: { total, page, per_page }, events: [{ id, title, url, type, datetime_utc, datetime_local,
//     datetime_tbd, time_tbd, taxonomies: [{ name }], performers: [{ name, image }], venue: { name, address,
//     extended_address, city, state, location: { lat, lon } }, stats: { lowest_price, highest_price } }] }
//
// Terms (https://seatgeek.com/api-terms): a limited, revocable licence; wherever the app shows SeatGeek data it
// must show SeatGeek attribution (their logo, from https://seatgeek.com/press). Our listings keep source "SeatGeek"
// and link back to the event's SeatGeek page; the event page names the source. The client id never reaches a log.
//
// Sports are left out (outside our scenes), and so are parking passes and add-ons. Ticketmaster is listed before
// SeatGeek in run.js, so when both list the same show the dedupe (lib/dedupe.js) keeps Ticketmaster's.

const { get } = require("../lib/fetch");

const BASE = "https://api.seatgeek.com/2/events";
const CENTER = { lat: 43.6532, lon: -79.3832 };
const SPORTS = /^(sports|mlb|nba|nhl|nfl|mls|ncaa|minor_league|soccer|hockey|baseball|basketball|football|tennis|golf|racing|auto_racing|monster_truck|wrestling|fighting|boxing|mma)/i;

// "2026-12-05T00:30:00" (UTC, no zone) -> ISO with a Z
const utc = (s) => (s ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? new Date(s).toISOString() : new Date(`${s}Z`).toISOString()) : null);

function toRaw(e) {
  if (!e || !e.id || !e.title || !e.datetime_utc) return null;
  if (e.datetime_tbd || e.date_tbd) return null; // no date yet
  const kinds = [e.type, ...(e.taxonomies || []).map((t) => t && t.name)].filter(Boolean);
  if (kinds.some((k) => SPORTS.test(String(k)))) return null;
  if (/\b(parking|upgrade|voucher|gift card|add-on)\b/i.test(e.title)) return null;
  const v = e.venue || {};
  const loc = v.location || {};
  const st = e.stats || {};
  const performer = (e.performers || []).find((p) => p && p.image) || {};
  const low = Number(st.lowest_price);
  const high = Number(st.highest_price);
  return {
    source: "SeatGeek",
    sourceId: String(e.id),
    url: e.url,
    title: e.title,
    startsAt: utc(e.datetime_utc),
    endsAt: null,
    venue: { name: v.name || "", address: [v.address, v.extended_address].filter(Boolean).join(", "), lat: loc.lat, lng: loc.lon, city: v.city },
    price: Number.isFinite(low) && low > 0 ? Math.round(low) : null,
    priceHigh: Number.isFinite(high) && high > 0 ? Math.round(high) : null,
    description: e.description || "",
    categories: kinds.map((k) => String(k).replace(/_/g, " ")),
    organizer: v.name || "",
    image: performer.image || null,
    timeTbd: Boolean(e.time_tbd) || undefined,
  };
}

// fetchPage is injectable for tests: (url) => parsed JSON
async function fetchSeatGeek({ start, end, max = 3000, log = () => {}, fetchPage } = {}) {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) {
    log("  seatgeek: skipped (no SEATGEEK_CLIENT_ID)");
    return { skipped: "No SEATGEEK_CLIENT_ID" };
  }
  const hide = (s) => String(s).split(id).join("***");
  const ask = fetchPage || ((url) => get(url, { json: true }));
  const out = new Map();
  const perPage = 100;
  for (let page = 1; page <= 40 && out.size < max; page++) {
    const q = new URLSearchParams({
      client_id: id,
      lat: String(CENTER.lat),
      lon: String(CENTER.lon),
      range: process.env.SEATGEEK_RANGE || "60km",
      "datetime_utc.gte": start.toISOString().slice(0, 19),
      "datetime_utc.lte": end.toISOString().slice(0, 19),
      per_page: String(perPage),
      page: String(page),
      sort: "datetime_utc.asc",
    });
    let data;
    try {
      data = await ask(`${BASE}?${q}`);
    } catch (err) {
      log(`  seatgeek: ${hide(err.message)}`);
      if (!out.size) throw new Error(hide(err.message));
      break;
    }
    const evs = (data && data.events) || [];
    for (const e of evs) {
      const r = toRaw(e);
      if (r) out.set(r.sourceId, r);
    }
    log(`  seatgeek page ${page}: ${out.size} so far`);
    const total = data && data.meta ? Number(data.meta.total) : 0;
    if (evs.length < perPage || page * perPage >= total) break;
  }
  return [...out.values()].slice(0, max);
}

module.exports = { fetchSeatGeek, toRaw };
