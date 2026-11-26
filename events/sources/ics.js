// Venue calendars: iCalendar (.ics) feeds that venues and groups publish for anyone to subscribe to.
// The list is config/ics-feeds.json ({ name, url, venue: { name, address, lat, lng }, terms }), like meetup-groups.json.
// A feed is only added once someone has opened it, checked it's a public calendar meant for subscribing, and noted
// where its terms say so ("terms"). The list ships empty: no feed could be checked from the session that wrote this.
// Each feed is read through lib/fetch.js, so robots.txt, caching and the polite pace all apply.

const fs = require("fs");
const path = require("path");
const { get } = require("../lib/fetch");
const { torontoISO } = require("../lib/posters");

const LIST = require("../lib/paths").config("ics-feeds.json");

// RFC 5545: lines starting with a space or tab continue the previous one; text escapes \, \; \n
function unfold(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}
const unescape = (s) => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

// "20261128T200000Z", "20261128T200000" with TZID=America/Toronto (or floating), "20261128" (all day)
function icsTime(value, params = {}) {
  const m = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h) return { iso: torontoISO(`${y}-${mo}-${d}T00:00`), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString(), allDay: false };
  const tz = params.TZID || "America/Toronto";
  if (!/Toronto|Eastern|New_York|EST|EDT/i.test(tz)) return null; // another zone: not a GTA listing we can place in time
  return { iso: torontoISO(`${y}-${mo}-${d}T${h}:${mi}`), allDay: false };
}

// Every VEVENT as { uid, summary, description, location, url, start, end, allDay, status }
function parseICS(text) {
  const out = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
    if (!m) continue;
    const key = m[1].toUpperCase();
    const params = Object.fromEntries(m[2].split(";").filter(Boolean).map((p) => p.split("=")).map(([k, v]) => [k.toUpperCase(), v]));
    const val = m[3];
    if (key === "UID") cur.uid = val.trim();
    else if (key === "SUMMARY") cur.summary = unescape(val);
    else if (key === "DESCRIPTION") cur.description = unescape(val);
    else if (key === "LOCATION") cur.location = unescape(val);
    else if (key === "URL") cur.url = val.trim();
    else if (key === "STATUS") cur.status = val.trim().toUpperCase();
    else if (key === "DTSTART") { const t = icsTime(val.trim(), params); if (t) { cur.start = t.iso; cur.allDay = t.allDay; } }
    else if (key === "DTEND") { const t = icsTime(val.trim(), params); if (t) cur.end = t.iso; }
  }
  return out;
}

// One feed's events as raw listings at the feed's venue (all-day entries are left out: no time to plan around)
function toRaw(feed, events, { start, end }) {
  return events
    .filter((e) => e.start && !e.allDay && e.summary && e.status !== "CANCELLED")
    .filter((e) => Date.parse(e.start) >= start.getTime() && Date.parse(e.start) <= end.getTime())
    .map((e) => ({
      source: feed.name,
      sourceId: e.uid || `${e.summary}|${e.start}`,
      url: e.url || feed.page || feed.url,
      title: e.summary,
      startsAt: e.start,
      endsAt: e.end || null,
      venue: { ...feed.venue, city: feed.venue.city || "Toronto" },
      price: null,
      description: e.description || "",
      categories: feed.categories || [],
      organizer: feed.organizer || feed.venue.name,
      image: null,
    }));
}

function feeds() {
  try {
    return JSON.parse(fs.readFileSync(LIST, "utf8")).feeds || [];
  } catch {
    return [];
  }
}

async function fetchICS({ start, end, max, log }) {
  const list = feeds().filter((f) => f.url && f.venue && Number.isFinite(f.venue.lat) && Number.isFinite(f.venue.lng));
  if (!list.length) return { skipped: "No venue calendars listed yet (config/ics-feeds.json)" };
  const out = [];
  for (const f of list) {
    try {
      const events = parseICS(await get(f.url));
      const raw = toRaw(f, events, { start, end });
      out.push(...raw);
      log(`  ics ${f.name}: ${events.length} entries, ${raw.length} in the window`);
    } catch (err) {
      log(`  ics ${f.name}: ${err.message}`);
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

module.exports = { fetchICS, parseICS, toRaw, icsTime, unfold };
