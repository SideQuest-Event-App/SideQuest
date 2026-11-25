// Profile > Stats, Badges, Passport and Rewind, from real data only: confirmed nights out (said "I went", rated or
// checked in), hosted events that happened, ratings, check-ins and squads. Counts, never goals: no streaks, no
// targets, no "x of y" progress, and badges only from things that happened (they never expire). Neighbourhoods come
// from the event listings, never from anyone's location.

const TZ = "America/Toronto";
// The ten vibe tiles the app shows (public/js/screens-attendee.js TILES), for "kinds of nights"
const KINDS = [
  ["Live music", ["Live music", "Jazz", "Indie gigs"]], ["Food pop-ups", ["Food & drink"]], ["Art nights", ["Art & making", "Photography"]],
  ["Markets", ["Markets", "Zines & print", "Records & vinyl"]], ["Comedy", ["Comedy"]], ["Dance nights", ["Dance", "Electronic"]],
  ["Wellness", ["Wellness", "Run & ride", "Climbing"]], ["Film", ["Film nights"]], ["Games", ["Games & social", "Tech & coding", "Anime & cosplay"]], ["Outdoors", ["Outdoors"]],
];
const kindOf = (e) => {
  const v = (e.vibes || [])[0];
  const k = KINDS.find(([, vs]) => vs.includes(v));
  return k ? k[0] : e.type === "place" ? "Places" : "Other";
};
const parts = (iso) => {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "long" }).formatToParts(d);
  const g = (t) => (f.find((p) => p.type === t) || {}).value;
  return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")), h: Number(g("hour")), date: `${g("year")}-${g("month")}-${g("day")}`, weekday: g("weekday") };
};
const SEASONS = [["winter", [12, 1, 2]], ["spring", [3, 4, 5]], ["summer", [6, 7, 8]], ["autumn", [9, 10, 11]]];
// "autumn-2026" (December counts toward the next year's winter)
function seasonOf(y, m) {
  const [name] = SEASONS.find(([, ms]) => ms.includes(m));
  return { name, year: m === 12 ? y + 1 : y, key: `${name}-${m === 12 ? y + 1 : y}` };
}
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const venueName = (e) => (e.venue && e.venue.name && e.venue.name !== "N/A" ? e.venue.name : null);
const count = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

// user, findEvent(id), squads: [{ id, name, members, names, locked }], hostedIds: [eventId], now: ms
function build(user, { findEvent, squads = [], hostedIds = [], now = Date.now() }) {
  const nowP = parts(new Date(now).toISOString());
  const season = seasonOf(nowP.y, nowP.m);
  // Every confirmed night: attended (went, rated or checked in) and hosted events that have started
  const nights = [];
  for (const [id, l] of Object.entries(user.log || {})) {
    const e = findEvent(id);
    if (!e || Date.parse(e.startsAt) > now) continue;
    if (l.status === "went" || l.rating || l.checkedIn) nights.push({ e, l, hosted: false });
  }
  for (const id of hostedIds) {
    const e = findEvent(id);
    if (e && Date.parse(e.startsAt) <= now && !nights.some((n) => n.e.id === e.id)) nights.push({ e, l: (user.log || {})[e.id] || {}, hosted: true });
  }
  for (const n of nights) {
    n.p = parts(n.e.startsAt);
    n.season = seasonOf(n.p.y, n.p.m);
    n.place = n.e.type === "place";
    n.squads = squads.filter((s) => s.locked === n.e.id || (n.l.with || []).some((w) => (s.names || []).includes(w)) || (n.e.friends || []).some((f) => (s.members || []).includes(f)) || (s.main && (n.l.crewSize || 1) > 1)).map((s) => s.name);
  }
  nights.sort((a, b) => a.e.startsAt.localeCompare(b.e.startsAt));
  // The first night at each venue, for "new venues"
  const firstAt = {};
  for (const n of nights) {
    const v = venueName(n.e);
    if (v && !(v in firstAt)) firstAt[v] = n.e.startsAt;
  }
  const bySeason = count(nights.map((n) => n.season.key));
  function period(key) {
    const inP = key === "season" ? (n) => n.season.key === season.key : (n) => n.p.y === nowP.y;
    const list = nights.filter(inP);
    const start = list.length ? list[0].e.startsAt : null;
    const venues = [...new Set(list.map((n) => venueName(n.e)).filter(Boolean))];
    const newVenues = venues.filter((v) => list.some((n) => n.e.startsAt === firstAt[v] && venueName(n.e) === v)).length;
    const squadNights = list.filter((n) => n.squads.length);
    const squadNames = count(list.flatMap((n) => n.squads));
    // Months: the last six (season) or this year's so far (year), busiest in black
    const months = [];
    const span = key === "season" ? 6 : nowP.m;
    for (let i = span - 1; i >= 0; i--) {
      const m = ((nowP.m - 1 - i) % 12 + 12) % 12 + 1;
      const y = nowP.y - (nowP.m - 1 - i < 0 ? 1 : 0);
      months.push({ label: MONTH[m - 1], n: nights.filter((x) => x.p.y === y && x.p.m === m).length });
    }
    const maxM = Math.max(0, ...months.map((x) => x.n));
    const kinds = count(list.map((n) => kindOf(n.e))).slice(0, 4).map(([name, n]) => ({ name, n, pct: Math.round((100 * n) / list.length) }));
    const days = count(list.map((n) => n.p.weekday));
    const lateShare = list.filter((n) => n.p.h >= 20).length;
    const hoods = count(list.map((n) => n.e.neighbourhood).filter((h) => h && h !== "N/A")).slice(0, 3).map(([h]) => h);
    const rated = list.filter((n) => n.l.rating).sort((a, b) => b.l.rating - a.l.rating || b.e.startsAt.localeCompare(a.e.startsAt));
    const prior = bySeason.filter(([k]) => k !== season.key);
    return {
      nights: list.length,
      attended: list.filter((n) => !n.hosted).length,
      hosted: list.filter((n) => n.hosted).length,
      newVenues,
      withSquads: squadNights.length,
      squadsWent: squadNames.length,
      busiest: key === "season" && list.length > 0 && prior.length > 0 && list.length > Math.max(...prior.map(([, n]) => n)),
      first: !prior.length,
      since: start,
      months: months.map((x) => ({ ...x, top: x.n > 0 && x.n === maxM })),
      busiestMonth: maxM ? months.filter((x) => x.n === maxM).pop().label : null,
      kinds,
      topSquad: squadNames[0] ? { name: squadNames[0][0], n: squadNames[0][1], members: (squads.find((s) => s.name === squadNames[0][0]) || {}).names || [] } : null,
      topDay: days[0] ? { day: days[0][0], n: days[0][1] } : null,
      afterEight: lateShare,
      hoods,
      best: rated[0] ? { title: rated[0].e.title, stars: rated[0].l.rating, venue: venueName(rated[0].e) } : null,
      topKind: kinds[0] ? kinds[0].name : null,
    };
  }
  // Badges: earned from what happened, dated by the night (or action) that earned them; unearned ones say how, no counts
  const at = (n) => (n ? n.e.startsAt : null);
  const nth = (list, k) => (list.length >= k ? list[k - 1] : null);
  const venueSeen = {};
  let regular = null;
  for (const n of nights) {
    const v = venueName(n.e);
    if (!v) continue;
    venueSeen[v] = (venueSeen[v] || 0) + 1;
    if (!regular && venueSeen[v] === 3) regular = n;
  }
  const distinct = (fn) => {
    const seen = new Set();
    return nights.filter((n) => {
      const k = fn(n);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const ratedNights = nights.filter((n) => n.l.ratedAt).sort((a, b) => a.l.ratedAt.localeCompare(b.l.ratedAt));
  const checked = nights.filter((n) => n.l.checkedIn).sort((a, b) => a.l.checkedIn.localeCompare(b.l.checkedIn));
  const BADGES = [
    ["first", "First night out", "Confirm a night you went to.", at(nights[0])],
    ["owl", "Night owl", "Go to something that starts at 10 PM or later.", at(nights.find((n) => n.p.h >= 22 || n.p.h < 4))],
    ["early", "Early bird", "Go to something that starts before 5 PM.", at(nights.find((n) => n.p.h >= 6 && n.p.h < 17))],
    ["squad", "Squad night", "Go out with one of your squads.", at(nights.find((n) => n.squads.length))],
    ["host", "Host", "Host an event on SideQuest.", at(nights.find((n) => n.hosted))],
    ["regular", "Regular", "Go back to a venue you love.", at(regular)],
    ["explorer", "Explorer", "Try lots of different venues.", at(nth(distinct((n) => venueName(n.e)), 5))],
    ["hopper", "Neighbourhood hopper", "Go out in different parts of town.", at(nth(distinct((n) => n.e.neighbourhood), 3))],
    ["door", "At the door", "Check in at a night out.", checked[0] ? checked[0].l.checkedIn : null],
    ["story", "Storyteller", "Rate the nights you go to.", ratedNights.length >= 5 ? ratedNights[4].l.ratedAt : null],
    ["tuner", "Taste tuner", "Retune or edit your taste.", user.tunedAt || null],
  ];
  const badges = BADGES.map(([id, name, how, earned]) => ({ id, name, how, earned: earned || null }));
  const earned = badges.filter((b) => b.earned).sort((a, b) => b.earned.localeCompare(a.earned));
  const stamps = [...new Set(nights.map((n) => venueName(n.e)).filter(Boolean))].map((v) => {
    const n = nights.find((x) => venueName(x.e) === v);
    return { venue: v, hood: n.e.neighbourhood || "", first: firstAt[v], nights: venueSeen[v] || 1, kind: n.place ? "place" : "event" };
  });
  return {
    seasonName: season.name,
    seasonLabel: `${season.name[0].toUpperCase()}${season.name.slice(1)} ${season.year}`,
    year: nowP.y,
    // How far through the season we are (time, not a goal)
    seasonThrough: (() => {
      const [, ms] = SEASONS.find(([n]) => n === season.name);
      const i = ms.indexOf(nowP.m);
      return Math.round(((i + (nowP.d - 1) / 30) / 3) * 100);
    })(),
    season: period("season"),
    yearly: period("year"),
    all: nights.length,
    days: nights.map((n) => ({ date: n.p.date, kind: n.place ? "place" : "event", title: n.e.title, id: n.e.id })),
    badges,
    latest: earned[0] || null,
    stamps,
  };
}

module.exports = { build, KINDS, seasonOf, parts };
