// Discover's For you as vibe collections: a few rows, each built from one of the person's strongest taste vibes,
// with events and places mixed in one row ("Comedy, then late eats": a comedy show, then a skewer place nearby).
// Plain code, no AI and no extra place searches: it ranks what the map already has.
//
//   collections(user, events, places, opts) -> [{ vibe, title, match, items: [{ kind: "event" | "place", id, match }] }]
//
// - vibes: the person's top taste vibes (lib/search/taste.js weights: sign-up picks nudged by saves, ratings, "more
//   like this" and "not for me"), at most `n` of them;
// - events: those with the vibe, each event in one row only, ranked with places by mixed.score (lib/search/mixed.js);
// - places: those Google tagged with the vibe; a row whose vibe has none gets a food or drink place to pair with
//   ("then late eats"), as the night would go;
// - match: the event's match from the feed when it has one, else the taste fit, as a percentage. A row's match is the
//   average of its first three.
// Private answers (budget, avoided areas, location) are never inputs here.

const taste = require("./taste");
const mixed = require("./mixed");

const FOOD = ["Food & drink", "Markets"];
const EATS = /restaurant|food|cafe|bakery|bar|pub|night|dessert|ice cream|noodle|pizza|ramen/i;
const pct = (n) => Math.max(5, Math.min(99, Math.round(n)));

function topVibes(user, w, n) {
  const ranked = Object.entries(w.vibes || {}).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([v]) => v);
  for (const v of user.vibes || []) if (!ranked.includes(v)) ranked.push(v);
  return ranked.slice(0, n);
}

// One title per show: the same show on several nights counts once (the app shows its dates on one card)
const showKey = (e) => `${String(e.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}@${(e.venue && e.venue.name) || ""}`;

function collections(user, events = [], places = [], { n = 4, per = 8, now = Date.now() } = {}) {
  if (!user) return [];
  const w = taste.weights(user, now);
  const picks = (user.feed && user.feed.picks) || {};
  const evMatch = (e) => (picks[e.id] && picks[e.id].match != null ? picks[e.id].match : pct(35 + taste.fit(w, e).fit * 60));
  const plMatch = (p, own) => pct(40 + taste.fit(w, p).fit * 50 + (own ? 5 : 0));
  const usedShows = new Set();
  const usedPlaces = new Set();
  const out = [];
  for (const vibe of topVibes(user, w, n)) {
    const seen = new Set();
    const evs = events
      .filter((e) => (e.vibes || []).includes(vibe) && !usedShows.has(showKey(e)))
      .map((e) => ({ id: e.id, match: evMatch(e), event: e }))
      .sort((a, b) => b.match - a.match || String(a.event.startsAt).localeCompare(String(b.event.startsAt)))
      .filter((m) => { const k = showKey(m.event); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, per);
    let pls = places.filter((p) => !usedPlaces.has(p.id) && (p.vibes || []).includes(vibe));
    let paired = false;
    if (!pls.length && evs.length && !FOOD.includes(vibe)) {
      pls = places.filter((p) => !usedPlaces.has(p.id) && ((p.vibes || []).some((v) => FOOD.includes(v)) || EATS.test(`${p.type || ""} ${p.title || ""}`)));
      paired = pls.length > 0;
    }
    pls = pls.slice(0, 3).map((p) => ({ ...p, relevance: paired ? 0.55 : 0.75, match: plMatch(p, !paired) }));
    const merged = mixed.merge(evs, pls, { weights: w });
    // Events keep their own order by match; a place goes second, so every row shows both kinds when it has both
    const evItems = merged.filter((x) => x.kind === "event").sort((a, b) => b.m.match - a.m.match);
    const plItems = merged.filter((x) => x.kind === "place");
    const items = [];
    for (const x of evItems) {
      items.push({ kind: "event", id: x.id, match: x.m.match });
      if (items.length === 1 && plItems.length) { const p = plItems.shift(); items.push({ kind: "place", id: p.id, match: p.p.match }); }
      if (items.length === 4 && plItems.length) { const p = plItems.shift(); items.push({ kind: "place", id: p.id, match: p.p.match }); }
    }
    for (const p of plItems) items.push({ kind: "place", id: p.id, match: p.p.match });
    if (items.length < 2) continue;
    for (const m of evs) usedShows.add(showKey(m.event));
    for (const p of pls) usedPlaces.add(p.id);
    const top3 = items.slice(0, 3);
    out.push({
      vibe,
      title: paired ? `${vibe}, then late eats` : items.some((x) => x.kind === "place") ? `${vibe}, out and about` : `${vibe} this week`,
      match: pct(top3.reduce((t, x) => t + x.match, 0) / top3.length),
      items,
    });
  }
  return out;
}

module.exports = { collections, topVibes, showKey };
