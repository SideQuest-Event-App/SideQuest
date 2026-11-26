// Toronto Public Library: every branch's programs, from TPL's own open-data feed on open.toronto.ca
// ("Library Branch Programs and Events Feed"), placed at the branch's address from the "Library Branch General
// Information" dataset. Two files, no scraping. Programs are free; the feed has no descriptions, so the listing
// says what kind of program it is and who it's for.
// Only outings for adults are kept: arts, crafts, games, book clubs, writing, film and the like (not storytime,
// computer basics or support services), and a weekly program shows its next few dates rather than three months'.
//
// Why it imported 0 listings: every row was dropped before it reached the app. The parser only knew one spelling of
// the feed's fields (StartTime, Audiences, EventTypes, LocationName as "YYYY-MM-DDTHH:MM"), only matched the audience
// word "Adults", and needed the branch name to match the branch file exactly. Now it reads either spelling of the
// feed (PascalCase, or the older lowercase startdate + starttime / agegroup1.. / eventtype1.. / library), accepts
// "2026-11-24 18:30" and "2026-11-24T18:30", matches "adult"/"Adults"/"Adult 19+", matches branch names loosely,
// finds the current download link through the CKAN API (the old resource ids still work as a fallback), and logs how
// many rows each rule dropped, so a zero is explained in the run's summary.
// Not checked against the live file from this session (open.toronto.ca was unreachable); tested on fixtures.

const { get } = require("../fetch");
const { torontoISO } = require("../../lib/posters");

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=";
const FEED_PACKAGE = "library-branch-programs-and-events-feed";
const BRANCH_PACKAGE = "library-branch-general-information";
const FEED = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fb343332-03cd-40b9-a1c8-c03a4a85ca1e/resource/aa5e1425-77f4-4cb4-a8ea-eb5ce7d4f34c/download/tpl-events-feed.json";
const BRANCHES = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/f5aa9b07-da35-45e6-b31f-d6790eb9bd9b/resource/0a48b601-9a07-4de6-ae73-b955527b3e70/download/tpl-branch-general-information-2023.json";
const ADULTS = /\badults?\b/i;
const OUTINGS = /Culture|Arts|Crafts|Hobbies|Games|Book Clubs|Writ|Film|Music|Science|Garden|Cook|History|Author|Performance|Concert|Lecture|Talk/i;
const NOT_OUTINGS = /Computer Basics|Conversation Circles|Settlement|Housing|Recovery|WRAP|Tax|Legal|Employment|Job|ESL|Citizenship|Technology Help/i;
const PER_PROGRAM = 4; // dates of one recurring program at one branch

// First field present under any of these names
const pick = (r, ...names) => {
  for (const n of names) if (r[n] != null && r[n] !== "") return r[n];
  return null;
};
// All numbered fields with this prefix (agegroup1, agegroup2, ...) joined
const numbered = (r, prefix) => Object.keys(r).filter((k) => new RegExp(`^${prefix}\\d+$`, "i").test(k)).sort().map((k) => r[k]).filter(Boolean).join(", ");

// "2026-11-24 18:30:00", "2026-11-24T18:30", or a date and a time in two fields ("18:30" or "6:30 pm")
function localStamp(date, time) {
  let s = String(date || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(s)) s = s.replace(" ", "T");
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) {
    const t = String(time || "").trim().toLowerCase();
    const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    s = `${s.slice(0, 10)}T${String(h).padStart(2, "0")}:${m[2]}`;
  } else return null;
  s = s.replace(/^(\d{4}-\d{2}-\d{2}T)(\d):/, "$10$2:");
  return torontoISO(s.slice(0, 16));
}

// One feed row, whichever spelling the feed uses
function slimRow(r) {
  return {
    id: pick(r, "EventID", "eventid", "EventId", "id"),
    title: pick(r, "Title", "title"),
    start: localStamp(pick(r, "StartTime", "StartDate", "startdate", "start_date"), pick(r, "starttime", "start_time")),
    end: localStamp(pick(r, "EndTime", "EndDate", "enddate", "end_date", "StartDate", "startdate"), pick(r, "endtime", "end_time")),
    branch: pick(r, "LocationName", "library", "Library", "location", "BranchName"),
    audiences: pick(r, "Audiences", "audiences", "AgeGroups") || numbered(r, "agegroup"),
    types: pick(r, "EventTypes", "eventtypes", "EventType") || numbered(r, "eventtype"),
    status: pick(r, "Status", "status"),
    full: [pick(r, "IsFull", "isfull"), pick(r, "RegistrationIsFull", "registrationisfull")].some((v) => v === true || /^true$/i.test(String(v))),
    image: pick(r, "FeaturedImageUrl", "featuredimageurl", "image"),
  };
}
const rowsOf = (j) => (Array.isArray(j) ? j : (j && (j.events || j.records || j.result || j.data)) || []);
// The feed is several MB; keep only what we use
const slim = (body) => rowsOf(JSON.parse(body)).map(slimRow);

// "Toronto Reference Library", "Fort York Branch", "Agincourt" -> "toronto reference", "fort york", "agincourt"
const branchKey = (s) => String(s || "").toLowerCase().replace(/\b(library|branch|public|tpl)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
function branchRows(body) {
  return rowsOf(JSON.parse(body)).map((x) => ({
    name: pick(x, "BranchName", "Branch Name", "branchname", "name"),
    address: pick(x, "Address", "address"),
    lat: Number(pick(x, "Lat", "Latitude", "lat", "latitude")),
    lng: Number(pick(x, "Long", "Longitude", "Lng", "lng", "long", "longitude")),
  }));
}

// The current download link for a dataset's JSON resource, or the known one
async function resourceUrl(pkg, fallback, want) {
  try {
    const meta = await get(CKAN + pkg, { json: true });
    const res = ((meta && meta.result && meta.result.resources) || []).filter((r) => /json/i.test(r.format || r.url || "") && want.test(r.name || r.url || ""));
    return (res[0] && res[0].url) || fallback;
  } catch {
    return fallback;
  }
}

// rows (slimmed) + branches -> raw listings; why: counts of rows each rule dropped
function toListings(rows, branchList, { start, end, max = 3000 }) {
  const branches = new Map(branchList.filter((b) => b.name).map((b) => [branchKey(b.name), b]));
  const out = [];
  const dates = new Map(); // "title|branch" -> dates kept
  const why = { noDate: 0, outsideWindow: 0, notForAdults: 0, notAnOuting: 0, endedOrFull: 0, noBranch: 0, repeats: 0 };
  for (const r of [...rows].sort((a, b) => String(a.start).localeCompare(String(b.start)))) {
    if (out.length >= max) break;
    if (!r.start || !r.title) { why.noDate++; continue; }
    if (Date.parse(r.start) < start.getTime() || Date.parse(r.start) > end.getTime()) { why.outsideWindow++; continue; }
    if (/ended|cancel/i.test(r.status || "") || r.full) { why.endedOrFull++; continue; }
    if (!ADULTS.test(r.audiences || "")) { why.notForAdults++; continue; }
    if (!OUTINGS.test(r.types || "") || NOT_OUTINGS.test(`${r.types} ${r.title}`)) { why.notAnOuting++; continue; }
    const key = `${r.title}|${r.branch}`;
    if ((dates.get(key) || 0) >= PER_PROGRAM) { why.repeats++; continue; }
    const b = branches.get(branchKey(r.branch)); // closed branches ("Cedarbrae - Closed") and "None" aren't on the map
    if (!b || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) { why.noBranch++; continue; }
    dates.set(key, (dates.get(key) || 0) + 1);
    const types = String(r.types || "").split(/,\s*/).filter(Boolean);
    out.push({
      source: "Toronto Public Library",
      sourceId: `${r.id}:${r.start}`, // recurring programs share an id, one listing per date
      url: `https://tpl.bibliocommons.com/events/${r.id}`,
      title: r.title,
      startsAt: r.start,
      endsAt: r.end && r.end !== r.start ? r.end : null,
      venue: { name: `${b.name.replace(/\s+library$/i, "")} Library`, address: b.address, lat: b.lat, lng: b.lng, city: "Toronto" },
      price: 0,
      description: `A free Toronto Public Library program at the ${b.name.replace(/\s+library$/i, "")} branch${types.length ? `: ${types.join(", ").toLowerCase()}` : ""}. For ${String(r.audiences).toLowerCase()}. Some programs need registration; check the library's listing.`,
      categories: ["library", ...types],
      organizer: "Toronto Public Library",
      image: r.image || null,
    });
  }
  return { listings: out, why };
}

async function fetchTPL({ start, end, max, log }) {
  const branchUrl = await resourceUrl(BRANCH_PACKAGE, BRANCHES, /branch/i);
  const feedUrl = await resourceUrl(FEED_PACKAGE, FEED, /event|program|feed/i);
  const branchList = await get(branchUrl, { extract: branchRows });
  const rows = await get(feedUrl, { extract: slim, timeoutMs: 120000 });
  const { listings, why } = toListings(rows, branchList, { start, end, max });
  log(`  tpl: ${rows.length} feed rows, ${branchList.length} branches -> ${listings.length} kept; left out: ${Object.entries(why).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}`);
  return listings;
}

module.exports = { fetchTPL, toListings, slimRow, branchRows, slim, localStamp, branchKey };
