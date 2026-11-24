// Sidekick's plan engine: plain code, no AI. It works out what the crew has agreed, which events
// still fit, which question would narrow them most, and when to stop asking and show picks.
// Everything here runs against the real imported listings, so it can be tested without a model.

// The facts Sidekick collects. "private" ones are never shown with a name attached.
const SLOTS = {
  night: { label: "Night", multi: true, private: false },
  time: { label: "Time", multi: true, private: false, options: [["early", "Afternoon"], ["evening", "After 6"], ["late", "After 8"]] },
  origin: { label: "Starting from", multi: false, private: false, options: [["union", "Union"], ["finch", "Finch"], ["kennedy", "Kennedy"], ["kipling", "Kipling"]] },
  vibe: { label: "Vibe", multi: true, private: false, options: [["music", "Live music"], ["comedy", "Comedy"], ["games", "Games & social"], ["dance", "Dancing"], ["arts", "Art & film"]] },
  budget: { label: "Budget", multi: false, private: true, options: [["20", "Under $20"], ["30", "Under $30"], ["50", "Under $50"], ["any", "Doesn't matter"]] },
  nos: { label: "Avoid", multi: true, private: true, options: [["West End", "West End"], ["Downtown", "Downtown"], ["East End", "East End"], ["North York", "North York"], ["Scarborough", "Scarborough"], ["Etobicoke", "Etobicoke"]] },
  // Only asked when the call has places as well as events (Google Places on, and under its usage cap)
  kind: { label: "Plan", multi: false, private: false, options: [["events", "A ticketed event"], ["places", "Just somewhere good"], ["either", "Either works"]] },
};
const placesOpen = require("./places").openAt;
// A representative hour for each time of night, to check a place is open then
const BUCKET_HOUR = { early: 15, evening: 19, late: 21 };
// Asked in this order of importance when nothing else decides it; nos is only asked on the join card
const ASKABLE = ["night", "time", "budget", "origin", "vibe", "kind"];
const VIBES = { music: ["Live music", "Jazz", "Indie gigs"], comedy: ["Comedy"], games: ["Games & social"], dance: ["Dance", "Electronic"], arts: ["Art & making", "Film nights", "Photography"] };
const MAX_TRIP = 60; // minutes; an event further than this from anyone's start is out

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" });
const localDay = (iso) => dayFmt.format(new Date(iso));
const localHour = (iso) => Number(hourFmt.format(new Date(iso)));
const bucket = (h) => (h >= 20 || h < 4 ? "late" : h >= 17 ? "evening" : h >= 11 ? "early" : null);

function optionsFor(slot, room) {
  if (slot === "night") return room.nights.map((d) => [d, nightLabel(d)]);
  return SLOTS[slot].options;
}
function nightLabel(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" });
}
function labelOf(slot, value, room) {
  const o = optionsFor(slot, room).find(([v]) => v === value);
  return o ? o[1] : String(value);
}

// The people whose answers count: everyone who joined (call or form)
const crew = (room) => room.people.filter((p) => !p.left);
const need = (room) => Math.max(1, Math.ceil(crew(room).length / 2)); // answers needed before a fact counts as known

function answersFor(room, slot) {
  return crew(room)
    .map((p) => ({ person: p, a: room.answers[p.id] && room.answers[p.id][slot] }))
    .filter((x) => x.a && x.a.value != null && !(Array.isArray(x.a.value) && !x.a.value.length));
}

// What the group has settled for one slot: { known, value, supporters, conflict, answered }
function groupFact(room, slot) {
  const got = answersFor(room, slot);
  const out = { slot, answered: got.length, known: false, value: null, supporters: {}, conflict: null };
  if (!got.length) return out;
  if (slot === "budget") {
    const nums = got.map((x) => x.a.value).filter((v) => v !== "any").map(Number);
    out.value = nums.length ? Math.min(...nums) : "any";
    out.known = got.length >= need(room);
    out.atLimit = nums.filter((n) => n === out.value).length;
    return out;
  }
  if (slot === "nos") {
    out.value = [...new Set(got.flatMap((x) => x.a.value))];
    out.known = true;
    return out;
  }
  if (slot === "kind") {
    const sets = got.map((x) => (x.a.value === "either" ? ["events", "places"] : [x.a.value]));
    const both = ["events", "places"].filter((k) => sets.every((st) => st.includes(k)));
    got.forEach((x) => (out.supporters[x.a.value] = [...(out.supporters[x.a.value] || []), x.person.name]));
    if (!both.length) { if (got.length >= 2) out.conflict = ["events", "places"]; return out; }
    out.value = both;
    out.known = got.length >= need(room);
    return out;
  }
  if (slot === "origin") {
    out.value = [...new Set(got.map((x) => x.a.value))];
    got.forEach((x) => (out.supporters[x.a.value] = [...(out.supporters[x.a.value] || []), x.person.name]));
    out.known = got.length >= need(room);
    return out;
  }
  // night, time, vibe: count who picked each option
  for (const x of got) for (const v of [].concat(x.a.value)) out.supporters[v] = [...(out.supporters[v] || []), x.person.name];
  const ranked = Object.entries(out.supporters).sort((a, b) => b[1].length - a[1].length);
  const [top, second] = ranked;
  if (slot === "vibe") {
    out.value = ranked.map(([v]) => v);
    out.known = got.length >= need(room);
    // Two ideas with different people behind each, and nobody who picked both
    if (second && second[1].length === top[1].length && !top[1].some((n) => second[1].includes(n))) out.conflict = [top[0], second[0]];
    return out;
  }
  // night and time: the options everyone who answered can do
  const all = ranked.filter(([, who]) => who.length === got.length).map(([v]) => v);
  if (!all.length) {
    if (got.length >= 2 && second) out.conflict = [top[0], second[0]];
    return out;
  }
  out.value = all;
  out.known = got.length >= need(room);
  return out;
}

function facts(room) {
  const f = {};
  for (const s of Object.keys(SLOTS)) f[s] = groupFact(room, s);
  return f;
}

// Events that fit what's known so far. `f` can be a simulated set of facts.
// f.relax (a Set) loosens one constraint when nothing fits: "time", "night", "area" or "budget".
const TIERS = [20, 30, 50];
function filterEvents(events, room, f) {
  const relax = f.relax || new Set();
  const nights = f.night.known && !relax.has("night") ? f.night.value : room.nights;
  const times = f.time.known && !relax.has("time") ? f.time.value : null;
  let max = f.budget.value != null && f.budget.value !== "any" ? f.budget.value : null;
  if (max != null && relax.has("budget")) max = TIERS.find((t) => t > max) || null;
  const avoid = relax.has("area") ? [] : f.nos.value || [];
  const origins = Array.isArray(f.origin.value) ? f.origin.value : [];
  const kinds = f.kind && f.kind.known ? f.kind.value : ["events", "places"];
  return events.filter((e) => {
    if (e.type === "place") {
      if (!kinds.includes("places") || e.area === "Beyond Toronto") return false;
      const open = nights.some((d) => (times || ["evening"]).some((b) => placesOpen(e.hours, new Date(d + "T12:00:00").getDay(), BUCKET_HOUR[b]) !== false));
      if (!open) return false;
      if (max != null && e.price != null && e.price > max) return false;
      if (avoid.includes(e.area)) return false;
      for (const o of origins) {
        const t = e.travel && e.travel.from && e.travel.from[o];
        if (t && t.minutes > MAX_TRIP) return false;
      }
      return true;
    }
    if (!kinds.includes("events")) return false;
    if (!e.startsAt || e.area === "Beyond Toronto") return false;
    if (!nights.includes(localDay(e.startsAt))) return false;
    const b = bucket(localHour(e.startsAt));
    if (!b) return false;
    if (times && !times.includes(b)) return false;
    if (max != null && e.price != null && e.price > max) return false; // unlisted prices stay in, ranked lower and flagged
    if (avoid.includes(e.area)) return false;
    for (const o of origins) {
      const t = e.travel && e.travel.from && e.travel.from[o];
      if (t && t.minutes > MAX_TRIP) return false;
    }
    return true;
  });
}

// How well an event suits the crew: vibes people asked for, a fair trip for everyone, good reviews
function score(e, room, f) {
  const vibeAnswers = answersFor(room, "vibe");
  let s = 0;
  for (const x of vibeAnswers) if ([].concat(x.a.value).some((v) => (VIBES[v] || []).some((tag) => (e.vibes || []).includes(tag)))) s += 10;
  const origins = Array.isArray(f.origin.value) && f.origin.value.length ? f.origin.value : ["union"];
  const trips = origins.map((o) => (e.travel && e.travel.from && e.travel.from[o] ? e.travel.from[o].minutes : 30));
  s -= Math.max(...trips) / 6;
  s += e.type === "place" ? Math.max(0, (e.rating || 0) - 3.8) * 5 + (e.hours ? 0 : -3) : (e.rating || 0) * 1.5 + Math.min(e.going || 0, 20) / 10;
  if (e.price == null && f.budget.value != null && f.budget.value !== "any") s -= 4;
  return s;
}

// When nothing fits: which single constraint, loosened, opens up the most events
function bestRelax(events, room, f) {
  const kinds = [];
  if (f.time.known) kinds.push("time");
  if (f.night.known && room.nights.length > 1) kinds.push("night");
  if ((f.nos.value || []).length) kinds.push("area");
  if (f.budget.value != null && f.budget.value !== "any" && f.budget.value < 50) kinds.push("budget");
  let best = null;
  for (const k of kinds) {
    const g = { ...f, relax: new Set([...(f.relax || []), k]) };
    const n = filterEvents(events, room, g).length;
    if (n >= 2 && (!best || n > best.n)) best = { kind: k, n };
  }
  return best;
}

function ranked(events, room, f) {
  return filterEvents(events, room, f)
    .map((e) => ({ e, s: score(e, room, f) }))
    .sort((a, b) => b.s - a.s || a.e.id - b.e.id)
    .map((x) => x.e);
}

// Facts as they'd be if the whole crew gave `value` for `slot` (used to look ahead)
function simulate(room, f, slot, value) {
  const g = { ...f, [slot]: { ...f[slot], known: true } };
  if (slot === "budget") g.budget.value = value === "any" ? "any" : Number(value);
  else if (slot === "origin") g.origin.value = [value];
  else g[slot].value = [value];
  return g;
}

function openSlots(room, f) {
  if (!room.places || !room.places.length) return ASKABLE.filter((s) => s !== "kind" && !f[s].known && !(s === "night" && room.nights.length === 1));
  return ASKABLE.filter((s) => !f[s].known && !(s === "night" && room.nights.length === 1));
}

// The question that narrows the events most, on average over its possible answers
function nextQuestion(events, room, f = facts(room)) {
  const open = openSlots(room, f);
  if (!open.length) return null;
  if (open.includes("night") && room.nights.length > 1) return "night"; // every other filter depends on the night
  const base = filterEvents(events, room, f).length || 1;
  let best = null;
  for (const slot of open) {
    const opts = optionsFor(slot, room);
    const sizes = opts.map(([v]) => {
      const g = simulate(room, f, slot, v);
      if (slot === "vibe") return filterEvents(events, room, g).filter((e) => (VIBES[v] || []).some((t) => (e.vibes || []).includes(t))).length;
      return filterEvents(events, room, g).length;
    });
    const expected = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const gain = 1 - expected / base;
    if (!best || gain > best.gain + 0.02) best = { slot, gain };
  }
  return best.slot;
}

const top2 = (list) => list.slice(0, 2).map((e) => e.id).join(",");

// Ready for picks when the must-haves are in and no remaining answer would change the top two
function readiness(events, room, f = facts(room)) {
  const list = ranked(events, room, f);
  const mustHave = (room.nights.length === 1 || f.night.known) && f.budget.answered >= need(room);
  if (!mustHave) return { ready: false, reason: "must-haves", pool: list.length, list };
  if (list.length < 2) return { ready: false, reason: "too-few", pool: list.length, list };
  const open = openSlots(room, f);
  if (!open.length) return { ready: true, reason: "all-known", pool: list.length, list };
  const now = top2(list);
  for (const slot of open)
    for (const [v] of optionsFor(slot, room)) {
      const g = simulate(room, f, slot, v);
      const alt = ranked(events, room, g);
      if (alt.length >= 2 && top2(alt) !== now) return { ready: false, reason: `${slot} could change the picks`, pool: list.length, list };
    }
  return { ready: true, reason: "stable", pool: list.length, list };
}

// What the group is allowed to see about the budget: a limit with no name, and no limit at all
// when the number would give one person away (2 people, or only one answer at the lowest limit)
function budgetLabel(f, room) {
  const b = f.budget;
  if (!b.answered) return null;
  if (b.value === "any") return "Any budget";
  if (b.answered >= 3 || b.atLimit >= 2) return `Under $${b.value} for the group`;
  return "Fits everyone's budget";
}

// How Sidekick may describe a loosened constraint out loud: never names a private answer
const RELAX_WORDS = { time: "a different start time", night: "another night", area: "a wider range of areas", budget: "stretching the spend a little" };

module.exports = { SLOTS, VIBES, ASKABLE, optionsFor, labelOf, nightLabel, facts, groupFact, filterEvents, ranked, nextQuestion, readiness, budgetLabel, bestRelax, RELAX_WORDS, answersFor, crew, need, localDay };
