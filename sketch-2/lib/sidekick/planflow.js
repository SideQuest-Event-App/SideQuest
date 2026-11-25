// The Plan tab's step-by-step setup (public/js/sidekick.js): the intro greeting, who's coming (a squad,
// SideQuest friends, or a link), when (who's free each night for the next three weeks) and how (a call or
// a form). Rooms themselves are made in rooms.js; this file only reads the app's people and keeps each
// account's availability.
//
// Availability, per account (stored on the user, so it's saved with the account like everything else):
//   user.availability = { free: ["YYYY-MM-DD", ...], updatedAt }   nights the person marked free
//   plus nights they're already going to something, read from their Quest Log (status "going").
// What anyone else sees is only free, busy or not set for each night, never why.

const crypto = require("crypto");
const P = require("./plan");
const personas = require("./personas");

const WINDOW_DAYS = 21; // the "who's free" calendar: today and the next three weeks
const KEEP_DAYS = 90; // free nights further out than this aren't kept
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

// Signed out: sample squads and friends (the sample friends in lib/db.js). The demo account has its own (its party).
const DEMO_SQUADS = [
  { id: "friday-crew", name: "Friday Crew", members: ["Maya", "Kai"] },
  { id: "board-game-sundays", name: "Board game Sundays", members: ["Sam", "Priya", "Leila"] },
  { id: "uni-friends", name: "Uni friends", members: ["Leila", "Priya"] },
];
const DEMO_FRIENDS = ["Maya", "Sam", "Priya", "Kai", "Leila"];
// The sample friends aren't real people, so their free nights are made up the same way every time.
// Leila has none, so the demo shows what "not set" looks like.
const SAMPLE_RATE = { Maya: 0.45, Kai: 0.4, Sam: 0.35, Priya: 0.3 };

let ctx = null; // { db, friendList, person } from server.js
function init(c) { ctx = c; }

const today = () => P.localDay(new Date().toISOString());
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
};
const weekday = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const unit = (s) => crypto.createHash("md5").update(s).digest().readUInt32BE(0) / 2 ** 32;
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The window's nights with how many events each has
function nights() {
  const start = today();
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i));
  const want = new Set(dates);
  const counts = {};
  const t = Date.now();
  for (const e of ctx.db.data.events || []) {
    if (!e.startsAt || e.ended) continue;
    const end = e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt) + 2 * 3600000;
    if (end < t) continue;
    const day = P.localDay(e.startsAt);
    if (want.has(day)) counts[day] = (counts[day] || 0) + 1;
  }
  return dates.map((date) => {
    const [, m, d] = date.split("-").map(Number);
    return { date, label: P.nightLabel(date), dow: DOW[weekday(date)], day: d, mon: MON[m - 1], events: counts[date] || 0 };
  });
}

// Nights someone is already going to something (their Quest Log), inside the window
function goingNights(u, dates) {
  const want = new Set(dates);
  const out = new Set();
  for (const [id, l] of Object.entries(u.log || {})) {
    if (!l || l.status !== "going") continue;
    const e = ctx.db.data.events.find((x) => x.id === Number(id));
    if (e && e.startsAt && want.has(P.localDay(e.startsAt))) out.add(P.localDay(e.startsAt));
  }
  return out;
}

// One person's nights: { set, nights: { date: "free" | "busy" | "unset" } }. Busy never says why.
function availabilityOfUser(u, dates) {
  const marked = u.availability && Array.isArray(u.availability.free) ? new Set(u.availability.free) : null;
  const going = goingNights(u, dates);
  const out = {};
  for (const d of dates) out[d] = going.has(d) ? "busy" : marked ? (marked.has(d) ? "free" : "busy") : "unset";
  return { set: Boolean(marked) || going.size > 0, nights: out };
}
function sampleAvailability(name, dates) {
  const rate = SAMPLE_RATE[name];
  const out = {};
  for (const d of dates) {
    if (rate == null) { out[d] = "unset"; continue; }
    const wd = weekday(d);
    const bump = wd === 6 ? 0.6 : wd === 5 ? 0.25 : wd === 0 ? 0.15 : 0;
    out[d] = unit(`${name}|${d}`) < rate + bump ? "free" : "busy";
  }
  return { set: rate != null, nights: out };
}
// The demo's own free nights until it marks some: Fridays, Saturdays and a few others
function demoFree(dates, seed) {
  return dates.filter((d) => [5, 6].includes(weekday(d)) || unit(`${seed}|${d}`) < 0.25);
}

function availabilityOf(key, dates) {
  if (ctx.db.FRIENDS[key]) return sampleAvailability(key, dates);
  const u = key.startsWith("u:") && ctx.db.data.users[key.slice(2)];
  return u ? availabilityOfUser(u, dates) : { set: false, nights: Object.fromEntries(dates.map((d) => [d, "unset"])) };
}

// A user's squads, as the Squads tab keeps them (lib/tabs/squads.js): their first party (id = their user id),
// then every squad in db.data.squads they own or are in. Members are friend keys; I'm never one of my own members.
function squadsOf(u) {
  if (!u) return DEMO_SQUADS.map((s) => ({ ...s }));
  const me = `u:${u.id}`;
  const out = [];
  const add = (s) => {
    if (!s || !s.name) return;
    const members = [...new Set([...(s.owner && s.owner !== u.id ? [`u:${s.owner}`] : []), ...(s.members || []).map((m) => (typeof m === "string" ? m : m && (m.key || m.name)))])].filter((k) => k && k !== me);
    const id = String(s.id || slug(s.name));
    if (!out.some((x) => x.id === id)) out.push({ id, name: String(s.name).slice(0, 40), members });
  };
  const party = ctx.db.data.parties[u.id];
  if (party) add({ id: party.id, name: party.name, members: party.members });
  const more = Object.values(ctx.db.data.squads || {}).filter((s) => s && (s.owner === u.id || (s.members || []).includes(me)));
  for (const s of more.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))) add(s);
  return out;
}
// ?squad=<id> matches a squad by id, or by its name as a slug ("friday-crew")
const findSquad = (squads, want) => (want ? squads.find((s) => s.id === want || slug(s.name) === slug(want)) || null : null);

function personOf(key) {
  const p = ctx.person(key);
  if (p) return { key, name: p.name, full: p.full || p.name };
  return null;
}

function setup(q) {
  const u = (q.user && ctx.db.data.users[q.user]) || null;
  const signedIn = Boolean(u && u.registered);
  const demo = !signedIn || Boolean(u.demo);
  const list = nights();
  const dates = list.map((n) => n.date);
  const squads = signedIn ? squadsOf(u) : squadsOf(null);
  const friendKeys = signedIn ? ctx.friendList(u).map((f) => f.key) : DEMO_FRIENDS.slice();
  const people = {};
  for (const key of new Set([...friendKeys, ...squads.flatMap((s) => s.members)])) {
    const p = personOf(key);
    if (p) people[key] = { ...p, initial: p.name.charAt(0).toUpperCase(), avail: availabilityOf(key, dates) };
  }
  for (const s of squads) s.members = s.members.filter((k) => people[k]);
  // My own nights: the account's (the demo starts with sample ones), or, signed out, what this phone kept
  let mine;
  if (signedIn && !(u.demo && !u.availability)) mine = availabilityOfUser(u, dates);
  else {
    const kept = String(q.free || "").split(",").filter((d) => DATE.test(d));
    const free = new Set(q.free != null && q.free !== "" ? kept : demoFree(dates, signedIn ? u.id : "guest"));
    const going = signedIn ? goingNights(u, dates) : new Set();
    mine = { set: true, nights: Object.fromEntries(dates.map((d) => [d, going.has(d) ? "busy" : free.has(d) ? "free" : "busy"])) };
  }
  const first = signedIn ? String(u.name || "").trim().split(/\s+/)[0] : String(q.name || "").trim().split(/\s+/)[0].slice(0, 24);
  const persona = q.persona ? personas.resolve(q.persona) : personas.PERSONA_IDS[crypto.randomInt(personas.PERSONA_IDS.length)];
  const name = first || (persona === "friend" ? "there" : "");
  return {
    signedIn,
    demo,
    me: { name: first || "", initial: (first || "Y").charAt(0).toUpperCase() },
    persona,
    voiceLabel: personas.PERSONAS[persona].label.replace(/^The /, ""),
    intro: personas.fallbackLine(persona, "intro", { name }),
    nights: list,
    people,
    friends: friendKeys.filter((k) => people[k]),
    squads,
    squad: (findSquad(squads, q.squad) || {}).id || null,
    mine,
    goingNights: signedIn ? [...goingNights(u, dates)] : [], // your own nights out, which can't be marked free
  };
}

// Mark your free nights. Only dates from today on are kept (busy is read from the Quest Log, not stored).
function saveFree(userId, free) {
  const u = userId && ctx.db.data.users[userId];
  if (!u || !u.registered) return null;
  const from = today();
  const until = addDays(from, KEEP_DAYS);
  const dates = [...new Set((Array.isArray(free) ? free : []).map(String).filter((d) => DATE.test(d) && d >= from && d <= until))].sort().slice(0, KEEP_DAYS);
  u.availability = { free: dates, updatedAt: new Date().toISOString() };
  ctx.db.save();
  return availabilityOfUser(u, nights().map((n) => n.date));
}

async function handle(req, res, url, { readBody, sendJSON }) {
  const action = url.pathname.split("/")[4];
  try {
    if (req.method === "GET" && action === "setup") {
      const q = Object.fromEntries(url.searchParams);
      if (q.user) await ctx.db.refresh(q.user).catch(() => {});
      return sendJSON(res, 200, setup(q));
    }
    if (req.method === "POST" && action === "free") {
      const body = await readBody(req);
      if (body.user) await ctx.db.refresh(body.user).catch(() => {});
      const mine = saveFree(body.user, body.free);
      if (!mine) return sendJSON(res, 400, { error: "Sign in to save your free nights to your account.", local: true });
      return sendJSON(res, 200, { mine });
    }
    return sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: "Something went wrong. Try again in a moment." });
  }
}

module.exports = { init, handle, _test: { setup, saveFree, nights, squadsOf, DEMO_SQUADS } };
