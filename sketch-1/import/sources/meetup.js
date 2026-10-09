// Meetup: the public "find events" pages for in-person events within 25 miles of Toronto, one day
// at a time (each page shows a day's top events, so it's read twice: by relevance and by time),
// plus the Toronto city page. Then each event's page for the venue's coordinates, fee and photo.
// Meetup's official API needs a paid Pro account, and /meetup_api is off-limits in robots.txt.

const { get, jsonLdEvents, nextData } = require("../fetch");

const ymd = (d) => d.toLocaleDateString("sv-SE", { timeZone: "America/Toronto" });
const addDays = (s, n) => ymd(new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000));
// Toronto's UTC offset on a given day, as "-04:00" or "-05:00"
const offsetOn = (s) => (new Date(`${s}T12:00:00-04:00`).toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", hour12: false }) === "12" ? "-04:00" : "-05:00");

const eventLinks = (html) => jsonLdEvents(html).filter((e) => e.url && /meetup\.com\/[^/]+\/events\/\d+/.test(e.url) && !/Online/.test(e.eventAttendanceMode || "")).map((e) => e.url.split("?")[0]);

// Only what we use from an event page, so the cache stays small
function eventPageInfo(html) {
  const ld = jsonLdEvents(html).find((x) => x.startDate) || {};
  const nd = nextData(html);
  const ap = (nd && nd.props && nd.props.pageProps && nd.props.pageProps.__APOLLO_STATE__) || {};
  const ev = Object.entries(ap).find(([k]) => k.startsWith("Event:"));
  const e = ev ? ev[1] : {};
  const ref = (r) => (r && r.__ref ? ap[r.__ref] : r) || null;
  const venue = ref(e.venue) || {};
  const photo = ref(e.featuredEventPhoto) || ref(e.displayPhoto);
  const group = ref(e.group) || {};
  const fee = e.feeSettings || null;
  return {
    title: e.title || ld.name,
    startsAt: e.dateTime || ld.startDate,
    endsAt: e.endTime || ld.endDate || null,
    status: e.status || "",
    type: e.eventType || "",
    description: e.description || ld.description || "",
    venue: { name: venue.name || (ld.location && ld.location.name), address: [venue.address, venue.city].filter(Boolean).join(", "), lat: venue.lat, lng: venue.lon, city: venue.city },
    fee: fee ? { amount: fee.amount, currency: fee.currency } : null,
    group: group.name || (ld.organizer && ld.organizer.name) || null,
    image: (photo && photo.highResUrl) || [].concat(ld.image || [])[0] || null,
  };
}

async function fetchMeetup({ start, end, max, log }) {
  const urls = new Set();
  const find = (day, sort) => {
    const off = offsetOn(day);
    const q = new URLSearchParams({ location: "ca--on--Toronto", source: "EVENTS", eventType: "inPerson", distance: "twentyFiveMiles", dateRange: "custom", customStartDate: `${day}T00:00:00${off}`, customEndDate: `${day}T23:59:00${off}` });
    if (sort) q.set("sortField", sort);
    return `https://www.meetup.com/find/?${q}`;
  };
  try {
    for (const u of eventLinks(await get("https://www.meetup.com/cities/ca/on/toronto/"))) urls.add(u);
  } catch (err) {
    log(`  meetup city page: ${err.message}`);
  }
  const last = ymd(end);
  for (let day = ymd(start); day <= last && urls.size < max; day = addDays(day, 1)) {
    for (const sort of [null, "DATETIME"]) {
      try {
        for (const u of eventLinks(await get(find(day, sort)))) urls.add(u);
      } catch (err) {
        log(`  meetup ${day}: ${err.message}`);
      }
    }
    if (day.endsWith("01") || day.endsWith("15")) log(`  meetup: through ${day}, ${urls.size} events found`);
  }
  const list = [...urls].slice(0, max);
  log(`  meetup: ${list.length} in-person events, reading each event page`);

  const out = [];
  for (const [n, url] of list.entries()) {
    try {
      const info = await get(url, { extract: eventPageInfo });
      if (!info || !info.startsAt || info.type === "ONLINE" || /CANCEL/.test(info.status)) continue;
      const fee = info.fee && Number(info.fee.amount);
      out.push({
        source: "Meetup",
        sourceId: url.match(/events\/(\d+)/)[1],
        url,
        title: info.title,
        startsAt: info.startsAt,
        endsAt: info.endsAt,
        venue: info.venue,
        // No Meetup fee doesn't mean free: many groups charge through another site, so it's unknown
        price: Number.isFinite(fee) ? fee : null,
        priceHigh: null,
        priceNote: Number.isFinite(fee) && info.fee.currency && info.fee.currency !== "CAD" ? `${info.fee.currency} ${fee}` : null,
        description: info.description,
        categories: ["meetup"],
        organizer: info.group,
        image: info.image,
      });
    } catch (err) {
      log(`  meetup ${url}: ${err.message}`);
    }
    if ((n + 1) % 100 === 0) log(`  meetup: ${n + 1}/${list.length} event pages read`);
  }
  return out;
}

module.exports = { fetchMeetup };
