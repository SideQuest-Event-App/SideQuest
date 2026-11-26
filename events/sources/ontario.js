// Ontario's open data: the "Celebrate Ontario events" dataset on data.ontario.ca (CKAN), Open Government Licence –
// Ontario. OFF unless ONTARIO_EVENTS=1: the live file couldn't be opened from the session that wrote this, so the
// column names below are a best guess, tested only on fixtures. Check one real file before turning it on.
// Only Toronto rows with a venue we can place and a start time are kept: a festival listed by date alone has no time
// to plan around, and nothing here fills one in.

const { get } = require("../lib/fetch");
const { torontoISO } = require("../lib/posters");

const PACKAGE = "https://data.ontario.ca/api/3/action/package_show?id=celebrate-ontario-events";

// A small CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const col = (r, ...re) => {
  for (const k of Object.keys(r)) if (re.some((x) => x.test(k)) && r[k]) return r[k];
  return "";
};

// rows -> raw listings (geocode is injectable for tests); why: counts of rows each rule dropped
async function toListings(rows, { start, end, geocode }) {
  const out = [];
  const why = { notToronto: 0, noTime: 0, outsideWindow: 0, noVenue: 0 };
  for (const r of rows) {
    const city = col(r, /municipal|city|town/);
    if (!/toronto|north york|scarborough|etobicoke|east york/i.test(city)) { why.notToronto++; continue; }
    const date = col(r, /start.*date|^date/);
    const time = col(r, /start.*time|^time/);
    const ymd = (date.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
    const hm = (time.match(/\b(\d{1,2}):(\d{2})\b/) || []);
    if (!ymd || !hm[0]) { why.noTime++; continue; }
    const startsAt = torontoISO(`${ymd}T${hm[1].padStart(2, "0")}:${hm[2]}`);
    if (!startsAt || Date.parse(startsAt) < start.getTime() || Date.parse(startsAt) > end.getTime()) { why.outsideWindow++; continue; }
    const venueName = col(r, /venue|location|site/);
    const address = col(r, /address/);
    const where = geocode ? await geocode([venueName, address, city].filter(Boolean).join(", ")) : null;
    if (!where) { why.noVenue++; continue; }
    const title = col(r, /event.*name|^name|title|^event$/);
    out.push({
      source: "Ontario open data",
      sourceId: `${title}|${ymd}`,
      url: col(r, /website|url|link/) || "https://data.ontario.ca/dataset/celebrate-ontario-events",
      title,
      startsAt,
      endsAt: null,
      venue: { name: venueName || where.address, address: address || where.address, lat: where.lat, lng: where.lng, city },
      price: null,
      description: col(r, /description|summary/),
      categories: ["festival"],
      organizer: col(r, /organi[sz]/),
      image: null,
    });
  }
  return { listings: out, why };
}

async function fetchOntario({ start, end, max, log }) {
  if (process.env.ONTARIO_EVENTS !== "1") return { skipped: "Off (set ONTARIO_EVENTS=1 after checking the live file's columns)" };
  const meta = await get(PACKAGE, { json: true });
  const res = ((meta && meta.result && meta.result.resources) || []).find((r) => /csv/i.test(r.format || r.url || ""));
  if (!res) return { skipped: "No CSV file in the dataset" };
  const rows = parseCSV(await get(res.url));
  const { geocode } = require("../lib/geocode");
  const { listings, why } = await toListings(rows, { start, end, geocode });
  log(`  ontario: ${rows.length} rows -> ${listings.length} kept; left out: ${Object.entries(why).map(([k, n]) => `${n} ${k}`).join(", ")}`);
  return listings.slice(0, max);
}

module.exports = { fetchOntario, parseCSV, toListings };
