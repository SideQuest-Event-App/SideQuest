// Ranking helpers shared by Discover and Sidekick. Plain code, no AI.
//   similarity(a, b)            how alike two listings are (shared vibes, same venue, same organizer)
//   mmr(list, scoreOf, opts)     Maximal Marginal Relevance: re-orders so the top isn't near-duplicates
//   seenPenalty(id, shown, now)  a small penalty for things already shown and ignored
//   settingOf(e)                 "outdoors" | "indoors" | null
//   contextBonus(e, ctx)         small bonuses for weather, distance, crew size and time of day, each with a "why"
//   blend(e, members)            fair crew fit: average fit, out if anyone strongly dislikes it
//   leastServed(members, hist)   who the crew's picks have served least so far
//   whoFor(fits, members)        "Maya + Kai love this; you'd like it", from names and fits only
//   crewMatch(fits)              one percentage for the crew
//   wildcard(cands, counts, rng) a labelled exploration pick chosen by Thompson sampling over vibes
// Private answers (budgets, areas to avoid, exact location) are never inputs to any line these produce.

const DAY = 86400000;

// ---------- Similarity and MMR ----------
const organizerOf = (e) => {
  const n = e && e.organizer && e.organizer.name;
  return n && n !== "N/A" ? n : null;
};
function similarity(a, b) {
  if (!a || !b) return 0;
  const va = new Set(a.vibes || []);
  const vb = b.vibes || [];
  const shared = vb.filter((v) => va.has(v)).length;
  const union = new Set([...va, ...vb]).size;
  let s = union ? shared / union : 0;
  // Same main vibe counts for more than a shared side vibe: "two gigs" feels the same even with different extras
  if ((a.vibes || [])[0] && (a.vibes || [])[0] === vb[0]) s = Math.max(s, 0.75);
  if (a.type === "place" && b.type === "place" && a.placeType && a.placeType === b.placeType) s = Math.max(s, 0.6);
  const vn = (e) => ((e.venue && e.venue.name) || "").toLowerCase();
  if (vn(a) && vn(a) !== "n/a" && vn(a) === vn(b)) s = 1;
  const oa = organizerOf(a);
  if (oa && oa === organizerOf(b)) s = Math.max(s, 0.7);
  return s;
}

// Keeps the single best first, then trades relevance (lambda) against similarity to what's already chosen.
// scoreOf(e) is any number; it's scaled to 0..1 over the list (over at least `range` points, so small score gaps
// stay small instead of being stretched to the full scale). Returns a new array, same items.
function mmr(list, scoreOf, { k = list.length, lambda = 0.7, sim = similarity, range = 0 } = {}) {
  if (list.length <= 1) return list.slice();
  const scores = new Map(list.map((e) => [e, scoreOf(e)]));
  const vals = [...scores.values()];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, range);
  const norm = (e) => (span > 0 ? Math.max(0, (scores.get(e) - (hi - span)) / span) : 1);
  const out = [];
  const left = list.slice();
  while (out.length < k && left.length) {
    let best = 0;
    let bv = -Infinity;
    for (let i = 0; i < left.length; i++) {
      const red = out.length ? Math.max(...out.map((o) => sim(left[i], o))) : 0;
      const v = lambda * norm(left[i]) - (1 - lambda) * red;
      if (v > bv + 1e-9) { bv = v; best = i; }
    }
    out.push(left.splice(best, 1)[0]);
  }
  return out.concat(left);
}

// shown: { id: [timesShownWithoutAction, lastShownMs] }. Up to -3 points, fading over a week.
function seenPenalty(id, shown, now = Date.now()) {
  const s = shown && shown[id];
  if (!s) return 0;
  const [n, last] = s;
  const fade = Math.pow(0.5, Math.max(0, now - last) / (7 * DAY));
  return -Math.min(3, 0.75 * n) * fade;
}
// Remember what was shown (ids only); an action on it (save, accept, "more like this") clears it
function noteShown(shown, ids, now = Date.now(), max = 400) {
  for (const id of ids) {
    const s = shown[id];
    shown[id] = [s ? s[0] + 1 : 1, now];
  }
  const keys = Object.keys(shown);
  if (keys.length > max) keys.sort((a, b) => shown[a][1] - shown[b][1]).slice(0, keys.length - max).forEach((k) => delete shown[k]);
  return shown;
}

// ---------- Context ----------
const OUTDOOR_WORDS = /\b(outdoor|outdoors|open[- ]air|in the park|park|patio|rooftop|beach|trail|ravine|hike|hiking|walk|walking tour|garden|skating rink|night market|festival grounds|square)\b/i;
const INDOOR_WORDS = /\b(theatre|theater|club|bar|pub|hall|gallery|museum|library|cinema|studio|lounge|cafe|café|restaurant|arena|centre|center|church|room|brewery|bookstore|shop|indoor)\b/i;
function settingOf(e) {
  if (!e) return null;
  if (e.setting) return e.setting === "outdoors" ? "outdoors" : "indoors";
  if (e.type === "place") {
    const t = e.tags || [];
    if (t.some((x) => /park|hiking_area|garden|beach|plaza|skateboard_park/.test(x))) return "outdoors";
    return "indoors";
  }
  const vs = e.vibes || [];
  const text = `${e.title} ${(e.venue && e.venue.name) || ""}`;
  if (vs.includes("Outdoors") || vs.includes("Run & ride") || OUTDOOR_WORDS.test(text)) return "outdoors";
  if (INDOOR_WORDS.test(text) || INDOOR_WORDS.test(`${e.description || ""}`.slice(0, 160))) return "indoors";
  return null;
}

const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2));
};
const hourIn = (iso) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
const WHEN_BUCKET = (h) => (h < 12 ? "Mornings" : h < 17 ? "Afternoons" : h < 21 ? "Evenings" : "Late nights");
const BIG_ROOM = /\b(arena|stadium|amphitheatre|hall|festival|party|club night|rave|concert)\b/i;
const SMALL_ROOM = /\b(listening|intimate|small|cozy|cosy|trio|duo|acoustic|book club|workshop|class|tasting|studio)\b/i;

// ctx: { weather: (iso) => { wet, cold, nice, label } | null, at: { lat, lng } (rounded), crewSize, whenOut: [..] }
// Each bonus is small (a few points) and comes with a short reason; nothing here filters anything out.
function contextBonus(e, ctx = {}) {
  let bonus = 0;
  const why = [];
  const setting = settingOf(e);
  const w = ctx.weather && e.startsAt ? ctx.weather(e.startsAt) : ctx.weather && e.type === "place" && ctx.night ? ctx.weather(ctx.night) : null;
  if (w && setting) {
    if ((w.wet || w.cold) && setting === "outdoors") { bonus -= 6; why.push(`${w.label}, so indoor picks first`); }
    else if ((w.wet || w.cold) && setting === "indoors") { bonus += 1.5; why.push(`indoors, and ${w.label.toLowerCase()}`); }
    else if (w.nice && setting === "outdoors") { bonus += 2; why.push(`${w.label}: good for being outside`); }
  }
  if (ctx.at && Number.isFinite(ctx.at.lat) && e.venue && Number.isFinite(e.venue.lat)) {
    const d = km([ctx.at.lat, ctx.at.lng], [e.venue.lat, e.venue.lng]);
    if (d <= 2) { bonus += 2; why.push("near you"); }
    else if (d <= 5) { bonus += 1; why.push("a short trip from you"); }
    else if (d > 15) bonus -= 1;
  }
  if (ctx.crewSize) {
    const text = `${e.title} ${(e.venue && e.venue.name) || ""}`;
    if (ctx.crewSize >= 5 && BIG_ROOM.test(text)) { bonus += 1.5; why.push("room for a big crew"); }
    else if (ctx.crewSize <= 2 && SMALL_ROOM.test(text)) { bonus += 1; why.push("good for two"); }
  }
  if (Array.isArray(ctx.whenOut) && ctx.whenOut.length && e.startsAt) {
    if (ctx.whenOut.includes(WHEN_BUCKET(hourIn(e.startsAt)))) { bonus += 1; why.push(`${WHEN_BUCKET(hourIn(e.startsAt)).toLowerCase()} suit you`); }
    else bonus -= 0.5;
  }
  return { bonus, why, setting };
}

// ---------- Crew blending ----------
// members: [{ id, name, fit: (e) => { fit, strongDislike } }]. Average without misery (Masthoff): anyone's strong
// dislike takes the event out; otherwise the crew's fit is the average of everyone's.
function blend(e, members) {
  const fits = {};
  let sum = 0;
  let misery = false;
  for (const m of members) {
    const f = m.fit(e) || { fit: 0 };
    fits[m.id] = f.fit;
    sum += f.fit;
    if (f.strongDislike) misery = true;
  }
  return { avg: members.length ? sum / members.length : 0, fits, misery };
}

// history: [{ fits: { memberId: 0..1 } }] for the picks shown to this crew so far. The member with the lowest total.
function leastServed(members, history = []) {
  if (members.length < 2) return null;
  const total = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const h of history) for (const m of members) total[m.id] += (h.fits && h.fits[m.id]) || 0;
  const sorted = [...members].sort((a, b) => total[a.id] - total[b.id]);
  if (total[sorted[0].id] === total[sorted[sorted.length - 1].id] && history.length) return null; // all even
  return sorted[0];
}

// "Maya + Kai love this; you'd like it". Names and fits only, never a budget, area or location.
// viewerId: the person reading it, called "you".
function whoFor(fits, members, viewerId = null) {
  const nameOf = (m) => (m.id === viewerId ? "you" : m.name);
  const love = members.filter((m) => (fits[m.id] || 0) >= 0.6);
  const like = members.filter((m) => (fits[m.id] || 0) >= 0.25 && (fits[m.id] || 0) < 0.6);
  const join = (list) => list.map(nameOf).join(" + ");
  const verb = (list) => (list.length === 1 && list[0].id !== viewerId ? "loves" : "love");
  const likeVerb = (list) => (list.length === 1 && list[0].id !== viewerId ? "would like" : "would like");
  const parts = [];
  if (love.length) parts.push(`${join(love)} ${verb(love)} this`.replace(/^you/, "You"));
  if (like.length) parts.push(`${join(like)} ${likeVerb(like)} it`.replace(/^you/, "You"));
  if (!parts.length) return "Something new for everyone";
  if (love.length === members.length) return members.length > 1 ? "Everyone loves this" : parts[0];
  return parts.join("; ").replace(/^./, (c) => c.toUpperCase());
}

// One number for the crew, 0-99: the average fit, pulled down when someone is left out
function crewMatch(fits) {
  const xs = Object.values(fits);
  if (!xs.length) return 0;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const min = Math.min(...xs);
  return Math.max(0, Math.min(99, Math.round(100 * (0.75 * avg + 0.25 * min))));
}

// ---------- Exploration: the Wildcard ----------
// A small seeded random number generator, so tests and simulations repeat exactly
function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// A draw from Beta(a, b) for whole-number a and b: the a-th smallest of a+b-1 uniform draws
function betaDraw(a, b, rand) {
  a = Math.max(1, Math.min(60, Math.round(a)));
  b = Math.max(1, Math.min(60, Math.round(b)));
  const u = Array.from({ length: a + b - 1 }, rand).sort((x, y) => x - y);
  return u[a - 1];
}
// candidates: listings not already picked. counts: { vibe: { shown, accepted } } from analytics.
// avoid: vibes the person already leans to (exploration means something outside them).
// Thompson sampling: each vibe's accept rate is a Beta(1 + accepted, 1 + shown - accepted) guess; draw one per vibe,
// take the highest, and pick the best-scored listing of that vibe. Untried vibes get tried often until known.
function wildcard(candidates, { counts = {}, avoid = [], scoreOf = () => 0, rand = Math.random } = {}) {
  const byVibe = new Map();
  for (const e of candidates) {
    const v = (e.vibes || [])[0];
    if (!v || avoid.includes(v)) continue;
    if (!byVibe.has(v)) byVibe.set(v, []);
    byVibe.get(v).push(e);
  }
  if (!byVibe.size) return null;
  let best = null;
  for (const v of [...byVibe.keys()].sort()) {
    const c = counts[v] || { shown: 0, accepted: 0 };
    const draw = betaDraw(1 + (c.accepted || 0), 1 + Math.max(0, (c.shown || 0) - (c.accepted || 0)), rand);
    if (!best || draw > best.draw) best = { vibe: v, draw };
  }
  const pick = byVibe.get(best.vibe).sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  return { event: pick, vibe: best.vibe, why: `A wildcard: something outside your usual, from ${best.vibe.toLowerCase()}` };
}

module.exports = { similarity, mmr, seenPenalty, noteShown, settingOf, contextBonus, blend, leastServed, whoFor, crewMatch, wildcard, rng, betaDraw, km };
