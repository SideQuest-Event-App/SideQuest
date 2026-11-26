// Meetup: each Toronto group's upcoming-events page (meetup.com/<group>/events/), then each event's page for
// the venue's coordinates, fee and photo. The groups are the ones in meetup-groups.json, the ones behind last
// run's Meetup events, and any new ones on the Toronto city page.
// Meetup's robots.txt rules out its search pages (/find/ with location, distance or date filters), and its
// official API needs a paid Pro account, so groups are found this way instead.

const fs = require("fs");
const path = require("path");
const { get, jsonLdEvents, nextData } = require("../fetch");

const GROUPS_FILE = path.join(__dirname, "..", "meetup-groups.json");
const PER_GROUP = 15; // a group's next events; weekly series repeat, so more would mostly be the same night
const groupOf = (url) => (String(url).match(/meetup\.com\/([A-Za-z0-9-]+)\/events\/\d+/) || [])[1];

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

async function fetchMeetup({ max, log, previous = [] }) {
  const urls = new Set();
  let known = [];
  try {
    known = JSON.parse(fs.readFileSync(GROUPS_FILE, "utf8"));
  } catch {}
  const groups = new Set([...known, ...previous.filter((e) => e.source === "Meetup").map((e) => groupOf(e.sourceUrl)).filter(Boolean)]);
  try {
    for (const u of eventLinks(await get("https://www.meetup.com/cities/ca/on/toronto/"))) {
      urls.add(u);
      if (groupOf(u)) groups.add(groupOf(u));
    }
  } catch (err) {
    log(`  meetup city page: ${err.message}`);
  }
  log(`  meetup: reading ${groups.size} groups' upcoming events`);
  for (const g of groups) {
    if (urls.size >= max) break;
    try {
      const html = await get(`https://www.meetup.com/${g}/events/`);
      const ids = [...new Set([...html.matchAll(new RegExp(`/${g}/events/(\\d{6,})`, "g"))].map((m) => m[1]))].slice(0, PER_GROUP);
      for (const id of ids) urls.add(`https://www.meetup.com/${g}/events/${id}/`);
    } catch (err) {
      log(`  meetup ${g}: ${err.message}`);
    }
  }
  // Keep the list of groups for next time (in CI this only lasts the run; last run's events carry them over)
  if (groups.size > known.length) fs.writeFileSync(GROUPS_FILE, JSON.stringify([...groups].sort(), null, 1) + "\n");
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
