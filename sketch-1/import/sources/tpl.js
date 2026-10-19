// Toronto Public Library: every branch's programs, from TPL's own open-data feed on open.toronto.ca
// ("Library Branch Programs and Events Feed"), placed at the branch's address from the "Library Branch General
// Information" dataset. Two files, no scraping. Programs are free; the feed has no descriptions, so the listing
// says what kind of program it is and who it's for.
// Only outings for adults are kept: arts, crafts, games, book clubs, writing, film and the like (not storytime,
// computer basics or support services), and a weekly program shows its next few dates rather than three months'.

const { get } = require("../fetch");
const { torontoISO } = require("../../lib/posters");

const FEED = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fb343332-03cd-40b9-a1c8-c03a4a85ca1e/resource/aa5e1425-77f4-4cb4-a8ea-eb5ce7d4f34c/download/tpl-events-feed.json";
const BRANCHES = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/f5aa9b07-da35-45e6-b31f-d6790eb9bd9b/resource/0a48b601-9a07-4de6-ae73-b955527b3e70/download/tpl-branch-general-information-2023.json";
const ADULTS = /\bAdults\b/;
const OUTINGS = /Culture|Arts|Crafts|Hobbies|Games|Book Clubs|Writ|Film|Music|Science|Garden|Cook|History|Author/i;
const NOT_OUTINGS = /Computer Basics|Conversation Circles|Settlement|Housing|Recovery|WRAP|Tax|Legal|Employment|Job/i;
const PER_PROGRAM = 4; // dates of one recurring program at one branch

// The feed is several MB; keep only what we use
const slim = (body) => JSON.parse(body).map((r) => ({ id: r.EventID, title: r.Title, start: r.StartTime, end: r.EndTime, branch: r.LocationName, audiences: r.Audiences, types: r.EventTypes, status: r.Status, full: r.IsFull === "True" || r.RegistrationIsFull === "True", image: r.FeaturedImageUrl }));

async function fetchTPL({ start, end, max, log }) {
  const branches = new Map();
  for (const b of await get(BRANCHES, { extract: (body) => JSON.parse(body).map((x) => ({ name: x.BranchName, address: x.Address, lat: Number(x.Lat), lng: Number(x.Long) })) })) branches.set(b.name, b);
  const rows = (await get(FEED, { extract: slim, timeoutMs: 120000 })).sort((a, b) => String(a.start).localeCompare(String(b.start))); // soonest first, so a program keeps its next dates
  const out = [];
  const dates = new Map(); // "title|branch" -> dates kept
  let noBranch = 0;
  for (const r of rows) {
    if (out.length >= max) break;
    const startsAt = torontoISO(r.start);
    if (!startsAt || Date.parse(startsAt) < start.getTime() || Date.parse(startsAt) > end.getTime()) continue;
    if (r.status === "ENDED" || r.full || !ADULTS.test(r.audiences || "") || !OUTINGS.test(r.types || "") || NOT_OUTINGS.test(`${r.types} ${r.title}`)) continue;
    const key = `${r.title}|${r.branch}`;
    if ((dates.get(key) || 0) >= PER_PROGRAM) continue;
    const b = branches.get(r.branch); // closed branches ("Cedarbrae - Closed") and "None" aren't on the map
    if (!b || !Number.isFinite(b.lat)) {
      noBranch++;
      continue;
    }
    dates.set(key, (dates.get(key) || 0) + 1);
    const types = String(r.types || "").split(/,\s*/).filter(Boolean);
    out.push({
      source: "Toronto Public Library",
      sourceId: `${r.id}:${r.start}`, // recurring programs share an id, one listing per date
      url: `https://tpl.bibliocommons.com/events/${r.id}`,
      title: r.title,
      startsAt,
      endsAt: torontoISO(r.end),
      venue: { name: `${b.name} Library`, address: b.address, lat: b.lat, lng: b.lng },
      price: 0,
      description: `A free Toronto Public Library program at the ${b.name} branch${types.length ? `: ${types.join(", ").toLowerCase()}` : ""}. For ${String(r.audiences).toLowerCase()}. Some programs need registration; check the library's listing.`,
      categories: ["library", ...types],
      organizer: "Toronto Public Library",
      image: r.image || null,
    });
  }
  if (noBranch) log(`  tpl: ${noBranch} programs left out (at a closed branch or no branch)`);
  return out;
}

module.exports = { fetchTPL };
