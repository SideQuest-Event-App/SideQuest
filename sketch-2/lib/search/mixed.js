// Search as one list: events and places for the same words, each labelled Event or Place, ranked by one score.
// Plain code, no AI (the AI, when it's on, only ranks the events shortlist; see server.js apiSearch).
//
//   eventCandidates(pool, text, opts)   the events worth ranking for a typed search: words in the title, tags and
//                                       description, plus what the words mean ("skewers" also finds "chuan'r",
//                                       "yakitori", "kebab"; lib/search/want.js)
//   eventRelevance(e, text)             0 to 1, how well an event shows the words (for events without a match %)
//   score(item, { relevance, weights }) one number for events and places alike: how well it matches the words (80%)
//                                       plus the person's taste (20%, lib/search/taste.js fit on its vibes)
//   merge(events, places)               one list, best first, each { kind: "event" | "place", score, ... }
//   only(list, kind)                    the All / Events / Places filter
//
// Private answers (budget, avoided areas, location) are never inputs here.

const taste = require("./taste");
const want = require("./want");
const ai = require("../ai");

const DAY = 86400000;

// What an event looks like to the want matcher (no Google types: its tags and vibes stand in for categories)
const asListing = (e) => ({ title: e.title, types: [], categories: [...(e.tags || []), ...(e.vibes || [])], summary: `${e.description || ""} ${e.venue && e.venue.name ? e.venue.name : ""}` });

// The plan for a typed search's specifics ("Chinese skewers"), or null when it names nothing the lexicon knows
function planOf(text) {
  const w = want.find(text);
  const wants = w.length ? w : [want.loose(text)].filter(Boolean);
  const pl = wants.length ? want.plan(wants) : null;
  return pl && pl.terms.length ? pl : null; // words the lexicon doesn't know ("jazz") are matched as words only
}

function eventRelevance(e, text, pl = planOf(text)) {
  const words = ai.wordsOf(text);
  const hay = ai.haystack({ tags: [], scene: "", description: "", ...e });
  const phrase = String(text || "").toLowerCase().trim();
  const hit = words.length ? words.filter((w) => hay.includes(w)).length / words.length : 0;
  const meaning = pl ? want.relevance(asListing(e), { ...pl, food: false }) : 0;
  const title = phrase && String(e.title || "").toLowerCase().includes(phrase) ? 1 : 0;
  return Math.max(title, meaning, hit * 0.9);
}

// The events shortlist for a typed search (at most n), best first
function eventCandidates(pool, text, { vibes = [], now = Date.now(), n = 35 } = {}) {
  const words = ai.wordsOf(text);
  const pl = planOf(text);
  const phrase = String(text || "").toLowerCase();
  const soon = (e) => Math.max(0, 1 - (Date.parse(e.startsAt) - now) / (30 * DAY));
  return pool
    .map((e) => {
      const hay = ai.haystack({ tags: [], scene: "", description: "", ...e });
      const hits = words.filter((w) => hay.includes(w)).length;
      const meaning = pl ? want.relevance(asListing(e), { ...pl, food: false }) : 0;
      const s = (String(e.title || "").toLowerCase().includes(phrase) ? 20 : 0) + hits * 3 + (meaning >= want.MIN_RELEVANCE ? 6 + meaning * 6 : 0)
        + (e.vibes || []).filter((v) => vibes.includes(v)).length * 0.5 + soon(e) * 0.2;
      return { e, s, rel: hits || meaning >= want.MIN_RELEVANCE };
    })
    // Events that show the words or their meaning first; the rest only fill the shortlist (the AI may still see a
    // fit the words miss, like "something chill")
    .sort((a, b) => Number(Boolean(b.rel)) - Number(Boolean(a.rel)) || b.s - a.s || String(a.e.startsAt).localeCompare(String(b.e.startsAt)))
    .slice(0, n)
    .map((x) => x.e);
}

// The events part of a search, one page: the shortlist, ranked by the AI (or keywords when it's off), plus events
// that show what the words mean when keyword matching missed them. people: [{ name, interests, origin }].
async function searchEvents(pool, text, { people, vibes = [], now = Date.now(), page = 10 } = {}) {
  const candidates = eventCandidates(pool, text, { vibes, now });
  if (!candidates.length) return { candidates, result: null };
  const result = await ai.match(people || [{ name: "You", interests: text }], candidates, page);
  if (result.mode === "keywords") {
    for (const e of candidates) {
      if (result.matches.length >= page) break;
      if (result.matches.some((m) => m.id === e.id)) continue;
      const r = eventRelevance(e, text);
      if (r >= 0.5) result.matches.push({ id: e.id, match: Math.round(40 + r * 40), reason: "Matches what you searched for" });
    }
  }
  return { candidates, result };
}

function score(item, { relevance = 0, weights = null } = {}) {
  const t = weights && weights.vibes ? taste.fit(weights, item).fit : 0;
  return Math.round((Math.max(0, Math.min(1, relevance)) * 80 + t * 20) * 10) / 10;
}

// events: [{ id, match (0-100), event }]; places: launch.js cards with a relevance (0-1) and vibes
function merge(events = [], places = [], { weights = null } = {}) {
  const ev = events.map((m) => ({ kind: "event", id: m.id, score: m.score != null ? m.score : score(m.event || {}, { relevance: (m.match || 0) / 100, weights }), m }));
  const pl = places.map((p) => ({ kind: "place", id: p.id, score: p.score != null ? p.score : score(p, { relevance: p.relevance || 0, weights }), p }));
  return [...ev, ...pl].sort((a, b) => b.score - a.score);
}
const only = (list, kind) => (kind === "events" ? list.filter((x) => x.kind === "event") : kind === "places" ? list.filter((x) => x.kind === "place") : list);

module.exports = { planOf, eventRelevance, eventCandidates, searchEvents, score, merge, only, asListing };
