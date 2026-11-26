// City of Toronto: the official Festivals & Events calendar, published as open data
// (open.toronto.ca, "Festivals and events json feed"). Every festival, exhibit, performance and
// market approved for the City's calendar, with venues, prices and images. One file, no scraping.

const { get, sleep } = require("../fetch");

const FEED = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/9201059e-43ed-4369-885e-0b867652feac/resource/8900fdb2-7f6c-4f50-8581-b463311ff05d/download/file.json";
const IMAGE = "https://secure.toronto.ca/c3api_upload/retrieve/festivals_events/";
const CALENDAR = "https://www.toronto.ca/explore-enjoy/festivals-events/festivals-events-calendar/";

const num = (v) => (v == null || v === "" ? NaN : Number(String(v).replace(/[^0-9.-]/g, "")));
// Some entries drop the minus sign on longitude (79.5 for -79.5)
const fixLng = (v) => (v > 78 && v < 81 ? -v : v);
const link = (u) => (!u ? null : /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, "")}`);
const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// The feed is over 200 MB; keep only upcoming events, and only the fields we use
function slim(body) {
  const now = Date.now() - 86400000;
  return (JSON.parse(body).value || [])
    .filter((e) => e.event_status !== "Cancelled" && Date.parse(e.event_enddate || e.event_startdate) >= now)
    .map((e) => {
      const loc = (e.event_locations || [])[0] || {};
      const gps = (parse(loc.location_gps) || [])[0] || {};
      return {
        id: e.id,
        name: e.event_name,
        dates: (e.event_dates || []).map((d) => d.date).filter(Number.isFinite),
        start: e.event_startdate,
        end: e.event_enddate,
        allDay: e.calendar_time_of_day,
        venue: { name: loc.location_name || "", address: loc.location_address || "", lat: num(gps.gps_lat != null ? gps.gps_lat : loc.geo_lat), lng: fixLng(num(gps.gps_lng != null ? gps.gps_lng : loc.geo_long)) },
        free: e.free_event === "Yes",
        low: num(e.event_price_low != null ? e.event_price_low : e.event_price),
        high: num(e.event_price_high),
        pwyc: e.event_price_pwyc,
        costNotes: e.cost_notes,
        description: e.event_description || e.short_description || "",
        categories: [...(e.event_category || []), ...(e.event_theme || [])],
        presenter: ((e.partnerships || []).find((p) => p.value === "event_presented_by") || {}).text || null,
        image: ((e.event_image || []).find((i) => i.bin_id && i.status === "success") || {}).bin_id || null,
        website: link(e.event_website),
        tickets: link(e.ticket_website),
      };
    });
}

async function fetchToronto({ start, end, max, log }) {
  // The open data server sometimes answers 502 for a while; give it a few tries
  let events;
  for (let attempt = 1; !events; attempt++) {
    try {
      events = await get(FEED, { extract: slim, timeoutMs: 600000 });
    } catch (err) {
      if (attempt >= 5) throw err;
      log(`  toronto: ${err.message.slice(0, 40)}…, retrying in ${attempt * 30}s`);
      await sleep(attempt * 30000);
    }
  }
  log(`  toronto: ${events.length} upcoming events on the City's calendar`);
  const out = [];
  for (const e of events) {
    // The next date it's on in our window; long runs (exhibits) without listed dates start today
    let when = e.dates.map((d) => new Date(d)).find((d) => d >= start && d <= end);
    if (!when) {
      const s = new Date(e.start);
      const f = new Date(e.end || e.start);
      if (s >= start && s <= end) when = s;
      else if (s < start && f >= start) when = new Date(Math.max(start.getTime(), s.getTime()));
      else continue;
    }
    const finish = e.end && new Date(e.end);
    const sameDay = finish && finish.toDateString() === when.toDateString() && finish > when;
    const low = Number.isFinite(e.low) ? e.low : null;
    out.push({
      source: "City of Toronto",
      sourceId: e.id,
      url: e.website || e.tickets || CALENDAR,
      ticketUrl: e.tickets || e.website || null,
      title: e.name,
      startsAt: when.toISOString(),
      endsAt: sameDay ? finish.toISOString() : null,
      runsUntil: !sameDay && finish && finish > when ? finish.toISOString() : null,
      venue: { ...e.venue, city: (e.venue.address.match(/,\s*([A-Za-z .'-]+),\s*ON/) || [])[1] || "Toronto" },
      price: e.free ? 0 : low,
      priceHigh: Number.isFinite(e.high) ? e.high : null,
      priceNote: e.pwyc === "Yes" || e.pwyc === true ? "Pay what you can" : null,
      description: e.description,
      categories: e.categories,
      organizer: e.presenter,
      image: e.image ? IMAGE + e.image : null,
    });
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { fetchToronto };
