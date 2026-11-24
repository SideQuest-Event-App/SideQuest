// Discover's ranking, learning from behaviour: what server.js calls for the For You feed, the crew blend and the
// data-age warning. Plain code, no AI (the AI, when on, still writes the scores and reasons; this decides which
// listings it reads, the order they're shown in, and the Wildcard).
//   shortlistScore(user, e, ctx)   how promising a listing is for this person before any AI reads it
//   order(user, picks, events, ctx) the feed's order: score, minus "seen and ignored", then MMR for variety
//   wildcardFor(user, pool, ...)   one labelled exploration pick (Thompson sampling over vibes)
//   crewView(people, matches, ...) per-person fits, "who it's for" and a crew match % (no budgets, ever)
//   dataHealth(importedAt, now)    { days, stale } when the event import is more than 8 days old

const taste = require("./taste");
const rank = require("./rank");

const STALE_DAYS = 8;
const DAY = 86400000;

// Areas people chose at onboarding -> a point near the middle of each (for the "near your areas" bonus)
const AREA_POINTS = { "West End": [43.651, -79.43], Downtown: [43.651, -79.383], "East End": [43.668, -79.335], Midtown: [43.698, -79.397], "North York": [43.765, -79.412], Scarborough: [43.775, -79.257], Etobicoke: [43.64, -79.53] };

function context(user, extra = {}) {
  return { whenOut: user.whenOut || [], ...extra };
}

// Taste fit (weighted vibes, learned from actions) does most of the work; areas the person goes to, the times they
// go out, and similarity to what they saved add a little. Returns { s, why: [..] }.
function shortlistScore(user, e, ctx = {}) {
  const w = ctx.weights || taste.weights(user);
  const f = taste.fit(w, e);
  let s = f.fit * 9 - (f.strongDislike ? 6 : 0);
  const why = [];
  const because = taste.because(w, e);
  if (because.length) why.push(`you're into ${because.join(" and ").toLowerCase()}`);
  if ((user.areas || []).includes(e.area)) { s += 1.2; why.push(`in ${e.area}, where you go out`); }
  const saved = ctx.savedEvents || [];
  if (saved.length && saved.some((x) => x.id !== e.id && rank.similarity(x, e) >= 0.5)) { s += 1; why.push("like something you saved"); }
  const c = rank.contextBonus(e, context(user, ctx.context));
  s += c.bonus;
  why.push(...c.why);
  return { s, fit: f.fit, why, setting: c.setting };
}

// The feed's order: the AI's (or keyword) match, the shortlist score as a tie-breaker, "seen and ignored" penalty,
// then MMR over the top 40 so the top of Discover isn't five gigs in a row. Returns ids, best first.
function order(user, picks, byId, ctx = {}) {
  const ids = Object.keys(picks).map(Number).filter((id) => byId.has(id));
  const now = ctx.now || Date.now();
  const val = (id) => picks[id].match + (ctx.scores && ctx.scores.has(id) ? ctx.scores.get(id) * 0.5 : 0) + rank.seenPenalty(id, user.shown, now) * 4;
  const sorted = ids.sort((a, b) => val(b) - val(a) || a - b);
  const head = sorted.slice(0, 40).map((id) => byId.get(id));
  const mixed = rank.mmr(head, (e) => val(e.id), { lambda: 0.72 });
  return [...mixed.map((e) => e.id), ...sorted.slice(40)];
}

// Exploration counts kept server-side ({ vibe: { shown, accepted } }), ids and vibe names only
function noteWildcard(store, vibe, kind) {
  if (!vibe) return;
  const c = (store[vibe] = store[vibe] || { shown: 0, accepted: 0 });
  if (kind === "shown") c.shown++;
  else c.accepted++;
}

// One labelled Wildcard from the eligible pool, outside the person's top vibes and not already in the top of the feed
function wildcardFor(user, pool, { counts = {}, exclude = new Set(), seed } = {}) {
  const w = taste.weights(user);
  const top = Object.entries(w.vibes).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v);
  // Exploring means new ground, not things they've passed on: no vibe or organizer they've marked down
  const cands = pool.filter((e) => !exclude.has(e.id) && (e.vibes || []).length && taste.fit(w, e).score >= 0 && !(e.vibes || []).some((v) => (w.vibes[v] || 0) < 0));
  const rand = rank.rng(seed != null ? seed : Math.floor(Date.now() / 3600000)); // a new draw each hour
  const soon = (e) => -Math.max(0, (Date.parse(e.startsAt) - Date.now()) / DAY);
  const out = rank.wildcard(cands, { counts, avoid: top, scoreOf: (e) => soon(e) + (e.price === 0 ? 1 : 0), rand });
  return out && { id: out.event.id, vibe: out.vibe, why: out.why };
}

// people: [{ name, isMe, weights }] (weights from taste.weights, or a friend's vibes). matches: [{ id, ... }].
// Adds { who, crewMatch, fits } to each match from fits only; budgets never enter this.
function crewView(people, matches, byId) {
  const members = people.map((p, i) => ({ id: String(i), name: p.isMe ? "You" : p.name, w: p.weights }));
  const history = [];
  return matches.map((m) => {
    const e = byId.get(m.id);
    if (!e) return m;
    const b = rank.blend(e, members.map((x) => ({ id: x.id, fit: (ev) => taste.fit(x.w, ev) })));
    history.push({ fits: b.fits });
    const viewer = members.find((x) => people[Number(x.id)].isMe);
    return { ...m, who: rank.whoFor(b.fits, members, viewer ? viewer.id : null), crewMatch: rank.crewMatch(b.fits), misery: b.misery || undefined };
  });
}

// Fair crew order for the shortlist: average fit with strong dislikes out, then each next pick boosted for whoever
// the picks so far have served least (round-robin "equality", as Spotify describes Blend)
function fairOrder(people, pool, { n = 35, extra = () => 0 } = {}) {
  const members = people.map((p, i) => ({ id: String(i), name: p.name, fit: (ev) => taste.fit(p.weights, ev) }));
  const scored = pool.map((e) => ({ e, b: rank.blend(e, members) })).filter((x) => !x.b.misery);
  const out = [];
  const history = [];
  const left = scored.slice();
  while (out.length < n && left.length) {
    const least = rank.leastServed(members, history);
    let best = 0;
    let bv = -Infinity;
    for (let i = 0; i < left.length; i++) {
      const x = left[i];
      const red = out.length ? Math.max(...out.slice(-3).map((o) => rank.similarity(o, x.e))) : 0;
      const v = x.b.avg + (least ? 0.35 * (x.b.fits[least.id] || 0) : 0) - 0.15 * red + extra(x.e);
      if (v > bv) { bv = v; best = i; }
    }
    const pick = left.splice(best, 1)[0];
    out.push(pick.e);
    history.push({ fits: pick.b.fits });
  }
  return out;
}

// A friend's taste from their vibes (sample friends have no actions)
const weightsFromVibes = (vibes) => taste.weights({ vibes: vibes || [], taste: { events: [], edits: {} } });

function dataHealth(importedAt, now = Date.now()) {
  const t = Date.parse(importedAt);
  if (!Number.isFinite(t)) return { importedAt: importedAt || null, days: null, stale: false };
  const days = Math.floor((now - t) / DAY);
  return { importedAt, days, stale: days > STALE_DAYS, limit: STALE_DAYS };
}
function staleLine(h) {
  return h && h.stale ? `WARNING: the event data is ${h.days} days old (imported ${h.importedAt}); more than ${h.limit} days means the scheduled import may not be reaching this server.` : null;
}

module.exports = { shortlistScore, order, wildcardFor, noteWildcard, crewView, fairOrder, weightsFromVibes, dataHealth, staleLine, context, AREA_POINTS, STALE_DAYS };
