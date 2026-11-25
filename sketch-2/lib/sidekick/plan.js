// Sidekick's plan engine: plain code, no AI. It works out what the crew has agreed, which events
// still fit, which question would narrow them most, and when to stop asking and show picks.
// Everything here runs against the real imported listings, so it can be tested without a model.

// The facts Sidekick collects. "private" ones are never shown with a name attached.
const SLOTS = {
  night: { label: "Night", multi: true, private: false },
  time: { label: "Time", multi: true, private: false, options: [["early", "Afternoon"], ["evening", "After 6"], ["late", "After 8"]] },
  origin: { label: "Starting from", multi: false, private: false, options: [["union", "Union"], ["finch", "Finch"], ["kennedy", "Kennedy"], ["kipling", "Kipling"]] },
  // Suggestions, not the full menu: anything else someone says or types goes into "want" in their words
  vibe: { label: "Vibe", multi: true, private: false, options: [["music", "Live music"], ["comedy", "Comedy"], ["games", "Games & social"], ["dance", "Dancing"], ["arts", "Art & film"], ["food", "Food & drink"], ["drinks", "Bars"], ["karaoke", "Karaoke"], ["outdoors", "Outdoors"], ["markets", "Markets"]] },
  budget: { label: "Budget", multi: false, private: true, options: [["20", "Under $20"], ["30", "Under $30"], ["50", "Under $50"], ["any", "Doesn't matter"]] },
  nos: { label: "Avoid", multi: true, private: true, options: [["West End", "West End"], ["Downtown", "Downtown"], ["East End", "East End"], ["North York", "North York"], ["Scarborough", "Scarborough"], ["Etobicoke", "Etobicoke"]] },
  // Only asked when the call has places as well as events (Google Places on, and under its usage cap)
  kind: { label: "Plan", multi: false, private: false, options: [["events", "A ticketed event"], ["places", "Just somewhere good"], ["either", "Either works"]] },
  // What people asked for in their own words ("Chinese skewers", "karaoke with private rooms"): free text, never
  // asked as a question, public (cleaned by lib/search/want.js so no amount, number or area gets through)
  want: { label: "Looking for", multi: true, private: false, free: true },
};
const placesOpen = require("./places").openAt;
const rank = require("../search/rank");
const want = require("../search/want");
// A representative hour for each time of night, to check a place is open then
const BUCKET_HOUR = { early: 15, evening: 19, late: 21 };
// Asked in this order of importance when nothing else decides it; nos is only asked on the join card
const ASKABLE = ["night", "time", "budget", "origin", "vibe", "kind"];
// What shows a listing is each kind of night, from facts only: an event's vibes (tags), a place's Google types,
// and words in a listing's name, title or summary. A place's own search ("arcade bar or board game cafe") is never
// evidence on its own: Google can return a speakeasy for it.
const KINDS = {
  music: { tags: ["Live music", "Jazz", "Indie gigs"], types: ["live_music_venue", "concert_hall"], words: ["live music", "jazz", "blues", "gig", "gigs", "concert", "band", "bands", "open mic", "music hall", "music venue"] },
  comedy: { tags: ["Comedy"], types: ["comedy_club"], words: ["comedy", "stand-up", "standup", "improv"] },
  games: { tags: ["Games & social"], types: ["bowling_alley", "video_arcade", "amusement_center", "karaoke"], words: ["arcade", "barcade", "board game", "board games", "games", "game night", "bowling", "bowl", "pinball", "billiards", "pool hall", "snooker", "escape room", "axe throwing", "mini golf", "minigolf", "trivia", "ping pong", "karaoke", "noraebang"] },
  dance: { tags: ["Dance", "Electronic"], types: ["night_club", "dance_hall"], words: ["dance", "dancing", "nightclub", "club night", "disco"] },
  arts: { tags: ["Art & making", "Film nights", "Photography"], types: ["art_gallery", "museum", "movie_theater"], words: ["gallery", "museum", "cinema", "film", "films", "exhibition"] },
  food: { tags: ["Food & drink"], food: true, words: ["restaurant", "dinner", "supper", "food", "noodle", "noodles", "dumpling", "dumplings", "bbq", "kitchen", "eatery"] },
  drinks: { tags: [], types: ["bar", "pub", "wine_bar", "cocktail_bar", "brewery", "beer_hall", "brewpub"], words: ["bar", "pub", "brewery", "taproom", "cocktail", "cocktails", "wine bar", "speakeasy", "tavern"] },
  karaoke: { tags: [], types: ["karaoke"], words: ["karaoke", "noraebang", "ktv"] },
  outdoors: { tags: ["Outdoors", "Run & ride"], types: ["park", "hiking_area", "garden"], words: ["park", "trail", "outdoor", "outdoors", "garden", "beach"] },
  markets: { tags: ["Markets"], types: ["market", "farmers_market", "flea_market"], words: ["market", "night market", "flea", "bazaar"] },
};
const VIBES = Object.fromEntries(Object.entries(KINDS).map(([k, d]) => [k, d.tags]));
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KIND_RE = Object.fromEntries(Object.entries(KINDS).map(([k, d]) => [k, new RegExp(`(?<![\\p{L}])(${d.words.map(escRe).join("|")})(?![\\p{L}])`, "iu")]));
// Does a listing show this kind of night? Events: their vibes, or the words in their title and tags. Places: their
// Google types (or Foursquare categories), name or summary; never the vibe of the search that found them.
function vibeMatch(e, v) {
  const k = KINDS[v];
  if (!e || !k) return false;
  if (e.type === "place") {
    const types = [...(e.tags || []), e.primaryType].filter(Boolean);
    if (k.food && want.isFood({ types })) return true;
    if (k.types && types.some((t) => k.types.includes(t))) return true;
    const cats = (e.categories || []).map((c) => (typeof c === "string" ? c : c.name || "")).join(" | ");
    return KIND_RE[v].test(`${e.title || ""} | ${e.summary || ""} | ${cats}`);
  }
  if ((e.vibes || []).some((t) => k.tags.includes(t))) return true;
  return KIND_RE[v].test(`${e.title || ""} | ${(e.tags || []).join(" | ")}`);
}
// The kinds a listing shows, in option order
const kindsOf = (e) => Object.keys(KINDS).filter((v) => vibeMatch(e, v));
const MAX_TRIP = 60; // minutes; an event further than this from anyone's start is out

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" });
const localDay = (iso) => dayFmt.format(new Date(iso));
const localHour = (iso) => Number(hourFmt.format(new Date(iso)));
const bucket = (h) => (h >= 20 || h < 4 ? "late" : h >= 17 ? "evening" : h >= 11 ? "early" : null);

function optionsFor(slot, room) {
  if (slot === "night") return room.nights.map((d) => [d, nightLabel(d)]);
  return SLOTS[slot].options || [];
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
  if (slot === "want") {
    // Everyone's specifics, the most-asked first ("Chinese skewers" from two people beats "rooftop" from one)
    for (const x of got) for (const v of [].concat(x.a.value)) out.supporters[v] = [...(out.supporters[v] || []), x.person.name];
    out.value = Object.entries(out.supporters).sort((a, b) => b[1].length - a[1].length).map(([v]) => v).slice(0, 3);
    out.known = out.value.length > 0;
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
// The search plan for the crew's want (memoised per wording), or null when nobody said anything specific
const wantPlans = new Map();
function wantPlan(f) {
  const w = f.want && f.want.known ? f.want.value : null;
  if (!w || !w.length) return null;
  const key = w.join("|");
  if (!wantPlans.has(key)) { wantPlans.set(key, want.plan(w)); if (wantPlans.size > 200) wantPlans.delete(wantPlans.keys().next().value); }
  return wantPlans.get(key);
}
// How well a listing matches the want, 0 to 1 (events by their title, tags and description words)
function wantFit(e, f) {
  const wanted = wantPlan(f);
  if (!wanted) return 0;
  if (e.type === "place") return want.relevance(e, wanted);
  return want.relevance({ title: e.title, types: [], categories: [...(e.tags || []), ...(e.vibes || [])], summary: e.description || "" }, { ...wanted, food: false });
}
function filterEvents(events, room, f) {
  const relax = f.relax || new Set();
  const nights = f.night.known && !relax.has("night") ? f.night.value : room.nights;
  const times = f.time.known && !relax.has("time") ? f.time.value : null;
  let max = f.budget.value != null && f.budget.value !== "any" ? f.budget.value : null;
  if (max != null && relax.has("budget")) max = TIERS.find((t) => t > max) || null;
  const avoid = relax.has("area") ? [] : f.nos.value || [];
  const origins = Array.isArray(f.origin.value) ? f.origin.value : [];
  const kinds = f.kind && f.kind.known ? f.kind.value : ["events", "places"];
  const wanted = wantPlan(f);
  return events.filter((e) => {
    if (e.type === "place") {
      if (!kinds.includes("places") || e.area === "Beyond Toronto") return false;
      // A specific want: a place has to show it (types, name, summary), so a skewer request can't return a cocktail bar
      if (wanted && want.relevance(e, wanted) < want.MIN_RELEVANCE) return false;
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

// How well an event suits one person, 0 to 1: their vibe answers (a full match for the vibe they asked for, a little
// more for matching several), or their own taste weights when the room has them (person.fit, from lib/search/taste)
function personFit(e, room, x) {
  const p = x.person;
  if (typeof p.fit === "function") return p.fit(e);
  const asked = x.a ? [].concat(x.a.value) : [];
  const hit = asked.filter((v) => vibeMatch(e, v)).length;
  // What they asked for in their own words counts as a full match for them ("Chinese skewers")
  const own = room.answers[p.id] && room.answers[p.id].want;
  const wantHit = own && [].concat(own.value).length && ownWantFit(e, [].concat(own.value)) >= want.MIN_RELEVANCE;
  return { fit: wantHit ? 1 : hit ? 0.75 + (0.25 * hit) / asked.length : 0, strongDislike: false };
}
function ownWantFit(e, wants) {
  const pl = want.plan(wants);
  if (!pl) return 0;
  if (e.type === "place") return want.relevance(e, pl);
  return want.relevance({ title: e.title, types: [], categories: [...(e.tags || []), ...(e.vibes || [])], summary: e.description || "" }, { ...pl, food: false });
}
// Everyone's fit for an event: { avg, fits: { personId: 0..1 }, misery }. Average without misery: anyone's strong
// dislike takes it out of the running (see score); otherwise the crew's fit is the average.
// withWant: everyone who said a vibe or a want (for "who it's for" on a pick card); else the vibe answers only
function crewFits(e, room, { withWant = false } = {}) {
  const xs = withWant ? crew(room).map((p) => ({ person: p, a: room.answers[p.id] && room.answers[p.id].vibe })).filter((x) => x.a || (room.answers[x.person.id] && room.answers[x.person.id].want)) : answersFor(room, "vibe");
  const members = xs.map((x) => ({ id: x.person.id, name: x.person.name, fit: () => personFit(e, room, x) }));
  return rank.blend(e, members);
}

// How well an event suits the crew: vibes people asked for (each person's fit, averaged), a fair trip for everyone,
// good reviews, plus small context bonuses (weather, crew size; lib/search/rank.js) and a penalty for picks this
// crew was already shown and passed on (room.shown)
function score(e, room, f) {
  const vibeAnswers = answersFor(room, "vibe");
  const b = crewFits(e, room);
  let s = b.avg * vibeAnswers.length * 10;
  if (b.misery) s -= 25;
  const origins = Array.isArray(f.origin.value) && f.origin.value.length ? f.origin.value : ["union"];
  const trips = origins.map((o) => (e.travel && e.travel.from && e.travel.from[o] ? e.travel.from[o].minutes : 30));
  s -= Math.max(...trips) / 6;
  // Ratings and popularity only break ties: together at most 2.5 points, never as much as one person's vibe match
  // (7.5 to 10) or a want match, so a well-rated bar nobody asked for can't win on its stars
  s += ratingTie(e) + (e.type === "place" ? (e.hours ? 0 : -1) : Math.min(e.going || 0, 20) / 20);
  if (e.price == null && f.budget.value != null && f.budget.value !== "any") s -= 4;
  if (room.context) s += rank.contextBonus(e, { ...room.context, crewSize: crew(room).length, night: f.night.known && f.night.value.length ? f.night.value[0] : room.nights[0] }).bonus;
  if (room.shown) s += rank.seenPenalty(e.id, room.shown, room.now || Date.now());
  // What they asked for, in their words: a place that shows it ranks well above one that only clears the bar;
  // an event that matches it ("karaoke night") gets a lift too
  const w = wantFit(e, f);
  if (w) s += w * (e.type === "place" ? 30 : 12);
  return s;
}

// A rating as a tiebreaker: 0 at 4 stars or less, up to 1.5 at 5 stars
const ratingTie = (e) => Math.max(0, Math.min(1, ((e.rating || 0) - 4) / 1)) * 1.5;

// Does a listing fit at least one person's vibe or what someone asked for (want)? When nobody has said either yet,
// everything fits. A pick that fits nobody is only ever shown as "Closest we found".
function fitsSomeone(e, room, f) {
  const asked = answersFor(room, "vibe");
  const wanted = wantPlan(f);
  if (!asked.length && !wanted) return true;
  if (wanted && wantFit(e, f) >= want.MIN_RELEVANCE) return true;
  return asked.some((x) => [].concat(x.a.value).some((v) => vibeMatch(e, v)));
}
// Who it fits and why, from facts only: { vibes: [{ v, names }], wants: [{ text, names }] }. Names are public
// (vibes and wants are shown on the board with names); budgets and areas never come into it.
function fitReasons(e, room, f) {
  const vibes = [];
  for (const x of answersFor(room, "vibe")) for (const v of [].concat(x.a.value)) {
    if (!vibeMatch(e, v)) continue;
    const hit = vibes.find((y) => y.v === v);
    if (hit) { if (!hit.names.includes(x.person.name)) hit.names.push(x.person.name); } else vibes.push({ v, names: [x.person.name] });
  }
  const wants = [];
  const wanted = wantPlan(f);
  if (wanted && wantFit(e, f) >= want.MIN_RELEVANCE && f.want && f.want.value) {
    for (const w of f.want.value) {
      const fit = e.type === "place" ? want.relevance(e, want.plan([w])) : want.relevance({ title: e.title, types: [], categories: [...(e.tags || []), ...(e.vibes || [])], summary: e.description || "" }, { ...want.plan([w]), food: false });
      if (fit >= want.MIN_RELEVANCE) wants.push({ text: w, names: f.want.supporters[w] || [] });
    }
  }
  return { vibes, wants };
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

// The list in the order picks are made from. The top is re-ordered so the two picks aren't near-duplicates and
// don't leave anyone out: pick one is the best match; pick two trades score against similarity to pick one (MMR)
// and gets a boost for whoever pick one (and this crew's earlier picks, room.history) served least.
const HEAD = 30;
// Listings that fit someone's vibe or want always come before ones that don't (those are only "Closest we found").
function ranked(events, room, f) {
  const scored = filterEvents(events, room, f)
    .map((e) => ({ e, s: score(e, room, f), fit: fitsSomeone(e, room, f) }))
    .sort((a, b) => b.s - a.s || a.e.id - b.e.id);
  const fitting = scored.filter((x) => x.fit);
  const rest = scored.filter((x) => !x.fit);
  if (fitting.length >= 2) return [...order(fitting, room), ...rest.map((x) => x.e)];
  if (fitting.length === 1) return [fitting[0].e, ...order(rest, room)];
  return order(rest, room);
}
function order(scored, room) {
  if (scored.length < 3) return scored.map((x) => x.e);
  const head = scored.slice(0, HEAD);
  const sOf = new Map(head.map((x) => [x.e, x.s]));
  const lo = Math.min(...head.map((x) => x.s));
  const hi = Math.max(...head.map((x) => x.s));
  // Scaled over at least 10 points (one person's full vibe match), so a pick a few points behind isn't treated as worst
  const span = Math.max(hi - lo, 10);
  const norm = (e) => Math.max(0, (sOf.get(e) - (hi - span)) / span);
  const first = head[0].e;
  const members = answersFor(room, "vibe").map((x) => ({ id: x.person.id, name: x.person.name }));
  const fitsOf = (e) => crewFits(e, room).fits;
  const least = rank.leastServed(members, [...(room.history || []), { fits: fitsOf(first) }]);
  let second = null;
  let best = -Infinity;
  for (const { e } of head.slice(1)) {
    const v = 0.65 * norm(e) - 0.35 * rank.similarity(e, first) + (least ? 0.3 * (fitsOf(e)[least.id] || 0) : 0);
    if (v > best + 1e-9) { best = v; second = e; }
  }
  const rest = rank.mmr(head.map((x) => x.e).filter((e) => e !== first && e !== second), (e) => sOf.get(e), { lambda: 0.7, range: 10 });
  return [first, second, ...rest, ...scored.slice(HEAD).map((x) => x.e)];
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
      if (slot === "vibe") return filterEvents(events, room, g).filter((e) => vibeMatch(e, v)).length;
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

module.exports = { SLOTS, VIBES, KINDS, vibeMatch, kindsOf, fitsSomeone, fitReasons, ASKABLE, optionsFor, labelOf, nightLabel, facts, groupFact, filterEvents, ranked, nextQuestion, readiness, budgetLabel, bestRelax, RELAX_WORDS, answersFor, crew, need, localDay, crewFits, score, wantPlan, wantFit };
