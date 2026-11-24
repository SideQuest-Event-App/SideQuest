// Per-person taste: a weight for each of the app's 21 vibes (and for organizers someone said "not for me" to),
// seeded from onboarding and nudged by what they do, with every nudge fading over time (half-life 30 days).
// Plain code, no AI, ids and vibe names only. Stored on the user as user.taste:
//   { events: [{ k: kind, v: [vibes], o: organizer|null, t: ms }], edits: { vibe: 0..5 } }
// "edits" are what the person set on Profile > Your taste: a number replaces the onboarding weight for that vibe,
// and 0 takes the vibe out of their taste entirely (Spotify's "exclude from your taste profile").

const VIBES = ["Live music", "Jazz", "Indie gigs", "Comedy", "Dance", "Electronic", "Records & vinyl", "Film nights", "Zines & print", "Art & making", "Photography", "Writing & poetry", "Tech & coding", "Anime & cosplay", "Outdoors", "Run & ride", "Climbing", "Games & social", "Food & drink", "Markets", "Wellness"];

// How much each action moves the vibes of the event it was taken on
const ACTION = { save: 2, open: 0.5, accept: 3, more: 3, love: 4, dislike: -4, notForMe: -3 };
const ONBOARDING = 3; // each vibe picked at sign-up
const HALF_LIFE_DAYS = 30;
const MAX_EVENTS = 300; // oldest nudges are dropped beyond this (they've faded to almost nothing anyway)
const DAY = 86400000;

const decay = (t, now) => Math.pow(0.5, Math.max(0, now - t) / DAY / HALF_LIFE_DAYS);
const organizerOf = (e) => {
  const n = e && e.organizer && e.organizer.name;
  return n && n !== "N/A" ? String(n).slice(0, 80) : null;
};

function ensure(user) {
  if (!user.taste || typeof user.taste !== "object") user.taste = { events: [], edits: {} };
  user.taste.events = Array.isArray(user.taste.events) ? user.taste.events : [];
  user.taste.edits = user.taste.edits && typeof user.taste.edits === "object" ? user.taste.edits : {};
  return user.taste;
}

// Record an action on an event. kind: save | open | accept | more | love | dislike | notForMe
function record(user, kind, event, now = Date.now()) {
  if (!(kind in ACTION) || !event) return false;
  const taste = ensure(user);
  const v = (event.vibes || []).filter((x) => VIBES.includes(x)).slice(0, 3);
  // "Not for me" also counts against the organizer, so their other nights fall too (as "not interested" does on TikTok)
  const o = kind === "notForMe" || kind === "dislike" ? organizerOf(event) : null;
  if (!v.length && !o) return false;
  taste.events.push({ k: kind, v, o, t: now });
  if (taste.events.length > MAX_EVENTS) taste.events.splice(0, taste.events.length - MAX_EVENTS);
  return true;
}

// Take back the last action of a kind on an event's vibes (an unsave, or "more like this" tapped twice)
function undo(user, kind, event) {
  const taste = ensure(user);
  const v = (event && event.vibes) || [];
  for (let i = taste.events.length - 1; i >= 0; i--) {
    const x = taste.events[i];
    if (x.k === kind && x.v.join("|") === v.slice(0, 3).filter((y) => VIBES.includes(y)).join("|")) {
      taste.events.splice(i, 1);
      return true;
    }
  }
  return false;
}

// Set a vibe's weight from Profile > Your taste: 0 (out of my taste) to 5, or null to go back to automatic
function edit(user, vibe, value) {
  if (!VIBES.includes(vibe)) return false;
  const taste = ensure(user);
  if (value == null || value === "") delete taste.edits[vibe];
  else taste.edits[vibe] = Math.max(0, Math.min(5, Math.round(Number(value) * 2) / 2));
  return true;
}

// { vibes: { vibe: weight }, organizers: { name: weight }, learned: { vibe: weight } } as of `now`
function weights(user, now = Date.now()) {
  const taste = ensure(user);
  const learned = {};
  const organizers = {};
  for (const x of taste.events) {
    const d = ACTION[x.k] * decay(x.t, now);
    for (const v of x.v) learned[v] = (learned[v] || 0) + d / x.v.length;
    if (x.o) organizers[x.o] = (organizers[x.o] || 0) + d;
  }
  const picked = new Set(user.vibes || []);
  const vibes = {};
  for (const v of VIBES) {
    const e = taste.edits[v];
    if (e === 0) continue; // taken out of their taste: neither onboarding nor actions count
    const base = e != null ? e : picked.has(v) ? ONBOARDING : 0;
    const w = base + (learned[v] || 0);
    if (Math.abs(w) > 0.05) vibes[v] = Math.round(w * 100) / 100;
  }
  return { vibes, organizers, learned };
}

// How well one event fits one person, 0 to 1, and whether they'd strongly dislike it
function fit(w, event) {
  const vs = (event && event.vibes) || [];
  const top = Math.max(1, ...Object.values(w.vibes).filter((x) => x > 0));
  let s = 0;
  for (const v of vs) s += (w.vibes[v] || 0) / top;
  const o = organizerOf(event);
  const ow = o ? w.organizers[o] || 0 : 0;
  s += ow / top;
  const strongDislike = s <= -0.6 || ow <= -2.5 || vs.some((v) => (w.vibes[v] || 0) <= -2);
  return { fit: s > 0 ? Math.round((1 - Math.exp(-1.2 * s)) * 1000) / 1000 : 0, strongDislike, score: s };
}

// The vibes behind a fit, strongest first ("Jazz", "Live music")
function because(w, event, n = 2) {
  return ((event && event.vibes) || []).filter((v) => (w.vibes[v] || 0) > 0).sort((a, b) => w.vibes[b] - w.vibes[a]).slice(0, n);
}

// Profile > Your taste: each vibe with its weight now, where it came from, and whether it was set by hand
function summary(user, now = Date.now()) {
  const taste = ensure(user);
  const w = weights(user, now);
  const picked = new Set(user.vibes || []);
  const rows = VIBES.map((v) => ({
    vibe: v,
    weight: w.vibes[v] || 0,
    learned: Math.round((w.learned[v] || 0) * 100) / 100,
    picked: picked.has(v),
    edited: taste.edits[v] != null ? taste.edits[v] : null,
  }));
  return {
    rows: rows.filter((r) => r.weight !== 0 || r.picked || r.edited != null).sort((a, b) => b.weight - a.weight),
    actions: taste.events.length,
  };
}

module.exports = { VIBES, ACTION, HALF_LIFE_DAYS, record, undo, edit, weights, fit, because, summary, decay, ensure };
