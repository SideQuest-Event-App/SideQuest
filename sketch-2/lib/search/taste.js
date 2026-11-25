// Per-person taste: a weight for each of the app's 21 vibes, for organisers and for venues, seeded from onboarding
// and nudged by what people do. Plain code, no AI, ids and vibe names only. Stored on the user as user.taste:
//   { events: [{ k: kind, v: [vibes], o: organiser|null, n: venue|null, id: eventId|null, t: ms }],
//     edits: { vibe: 0..5 }, pauses: { vibe: untilMs }, prefs: { energy, surprise, days, times, never, access } }
// "edits" are what the person set on Taste > Edit: a number replaces the onboarding weight for that vibe, and 0 takes
// the vibe out of their taste entirely (Spotify's "exclude from your taste profile"). Explicit edits never fade.
//
// How fast each kind of evidence fades (research: taste-research.md 3.1):
//   taps (save, open, more like this, going, not for me, retune picks): half-life 30 days
//   attended-and-rated (went, 4-5 stars, 1-2 stars): half-life 90 days
//   explicit edits, follows, dealbreakers, sign-up picks: never
//
// The eight parts of the model (taste-research.md 3): vibes, scene (organiser and venue), energy, novelty
// ("Surprise me"), when (days and times), travel limit (user.maxMinutes, a hard filter applied before ranking),
// budget (private, user.budget) and dealbreakers or access needs (private, filters only).

const VIBES = ["Live music", "Jazz", "Indie gigs", "Comedy", "Dance", "Electronic", "Records & vinyl", "Film nights", "Zines & print", "Art & making", "Photography", "Writing & poetry", "Tech & coding", "Anime & cosplay", "Outdoors", "Run & ride", "Climbing", "Games & social", "Food & drink", "Markets", "Wellness"];

// How much each action moves the vibes of the event it was taken on
const ACTION = { save: 2, open: 0.5, accept: 3, went: 3, more: 3, pick: 2, pass: -1, love: 4, dislike: -4, notForMe: -3 };
const LONG = new Set(["went", "love", "dislike"]); // attended-and-rated evidence fades slowly
const ONBOARDING = 3; // each vibe picked at sign-up
const PAST = 1.5; // the "Been to any of these?" answers at sign-up, shared across that pick's vibes
const FOLLOW = 3; // a followed organiser, venue or artist (never fades)
const HALF_LIFE_DAYS = 30;
const LONG_HALF_LIFE_DAYS = 90;
const MAX_EVENTS = 300; // oldest nudges are dropped beyond this (they've faded to almost nothing anyway)
const DAY = 86400000;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMES = ["Before 7", "7–9 PM", "After 9"];

// The sign-up "Been to any of these?" picks, as vibes
const PAST_VIBES = {
  "Toronto Jazz Festival": ["Jazz", "Live music"], "Night It Up! Market": ["Markets", "Food & drink"], "TIFF Midnight Madness": ["Film nights"],
  "Leslieville Flea": ["Markets", "Records & vinyl"], "Nuit Blanche 2025": ["Art & making"], "Toronto Zine Fair": ["Zines & print"],
  "Hot Docs screening": ["Film nights"], "Night market at Stackt": ["Markets", "Food & drink"], "Comedy Bar open mic": ["Comedy"],
  "Field Trip Festival": ["Live music", "Indie gigs"], "Bloor St Culture Corridor walk": ["Art & making", "Outdoors"], "Fan Expo Canada": ["Anime & cosplay"],
};

// Energy, chill (-1) to wild (+1), from an event's vibes and how late it starts
const VIBE_ENERGY = {
  Dance: 1, Electronic: 1, "Indie gigs": 0.6, "Live music": 0.4, "Run & ride": 0.3, Comedy: 0.2, Climbing: 0.2, "Anime & cosplay": 0.2, "Games & social": 0.1,
  "Food & drink": 0, Markets: -0.2, "Records & vinyl": -0.2, Jazz: -0.3, Outdoors: -0.3, "Tech & coding": -0.3, "Art & making": -0.5, Photography: -0.5,
  "Film nights": -0.6, "Zines & print": -0.6, "Writing & poetry": -0.7, Wellness: -0.9,
};
const hourIn = (iso) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
const dayIn = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(new Date(iso));
function energyOf(e) {
  const vs = ((e && e.vibes) || []).filter((v) => v in VIBE_ENERGY);
  if (!vs.length) return null;
  let x = vs.reduce((a, v) => a + VIBE_ENERGY[v], 0) / vs.length;
  if (e.startsAt) {
    const h = hourIn(e.startsAt);
    if (h >= 22 || h < 4) x += 0.3;
    else if (h < 17) x -= 0.2;
  }
  return Math.max(-1, Math.min(1, x));
}
const timeBucket = (h) => (h < 19 ? "Before 7" : h < 21 ? "7–9 PM" : "After 9");

const halfLife = (k) => (LONG.has(k) ? LONG_HALF_LIFE_DAYS : HALF_LIFE_DAYS);
const decay = (t, now, days = HALF_LIFE_DAYS) => Math.pow(0.5, Math.max(0, now - t) / DAY / days);
const nameOf = (x) => {
  const n = x && x.name;
  return n && n !== "N/A" ? String(n).slice(0, 80) : null;
};
const organizerOf = (e) => nameOf(e && e.organizer);
const venueOf = (e) => nameOf(e && e.venue);

function ensure(user) {
  if (!user.taste || typeof user.taste !== "object") user.taste = { events: [], edits: {} };
  const t = user.taste;
  t.events = Array.isArray(t.events) ? t.events : [];
  t.edits = t.edits && typeof t.edits === "object" ? t.edits : {};
  t.pauses = t.pauses && typeof t.pauses === "object" ? t.pauses : {};
  t.prefs = t.prefs && typeof t.prefs === "object" ? t.prefs : {};
  return t;
}

// Record an action on an event. kind: one of ACTION's keys
function record(user, kind, event, now = Date.now()) {
  if (!(kind in ACTION) || !event) return false;
  const taste = ensure(user);
  const v = (event.vibes || []).filter((x) => VIBES.includes(x)).slice(0, 3);
  // "Not for me" and 1-2 stars count against the organiser, so their other nights fall too (as "not interested" does
  // on TikTok); 4-5 stars count for the organiser and the venue (scene affinity)
  const scene = kind === "notForMe" || kind === "dislike" || kind === "love";
  const o = scene ? organizerOf(event) : null;
  const n = kind === "love" ? venueOf(event) : null;
  if (!v.length && !o && !n) return false;
  const x = { k: kind, v, o, t: now };
  if (n) x.n = n;
  if (event.id != null) x.id = event.id;
  const en = ["went", "love", "accept", "pick"].includes(kind) ? energyOf(event) : null;
  if (en != null) x.en = Math.round(en * 100) / 100;
  taste.events.push(x);
  if (taste.events.length > MAX_EVENTS) taste.events.splice(0, taste.events.length - MAX_EVENTS);
  return true;
}

// Take back the last action of a kind on an event's vibes (an unsave, or "more like this" tapped twice)
function undo(user, kind, event) {
  const taste = ensure(user);
  const v = (event && event.vibes) || [];
  const key = v.slice(0, 3).filter((y) => VIBES.includes(y)).join("|");
  for (let i = taste.events.length - 1; i >= 0; i--) {
    const x = taste.events[i];
    if (x.k === kind && (x.id != null && event.id != null ? x.id === event.id : x.v.join("|") === key)) {
      taste.events.splice(i, 1);
      return true;
    }
  }
  return false;
}

// "Don't count this": drop one action (by its time and event) from the taste log; the night stays in their history
function forget(user, t, id) {
  const taste = ensure(user);
  const i = taste.events.findIndex((x) => x.t === Number(t) && (id == null || x.id == null || x.id === Number(id)));
  if (i < 0) return false;
  taste.events.splice(i, 1);
  return true;
}

// Set a vibe's weight: 0 (out of my taste) to 5, or null to go back to automatic
function edit(user, vibe, value) {
  if (!VIBES.includes(vibe)) return false;
  const taste = ensure(user);
  if (value == null || value === "") delete taste.edits[vibe];
  else taste.edits[vibe] = Math.max(0, Math.min(5, Math.round(Number(value) * 2) / 2));
  return true;
}
// Pause a vibe for a while (Pinterest-style), or end the pause with until = null
function pause(user, vibe, until) {
  if (!VIBES.includes(vibe)) return false;
  const taste = ensure(user);
  if (until == null) delete taste.pauses[vibe];
  else taste.pauses[vibe] = Number(until);
  return true;
}

// The person's own settings for the non-vibe parts, cleaned. Missing means "automatic".
function setPrefs(user, p = {}) {
  const prefs = ensure(user).prefs;
  const num = (x, lo, hi) => (x == null || x === "" ? null : Math.max(lo, Math.min(hi, Math.round(Number(x) * 100) / 100)));
  if ("energy" in p) prefs.energy = num(p.energy, -1, 1);
  if ("surprise" in p) prefs.surprise = num(p.surprise, 0, 1);
  if ("days" in p) prefs.days = Array.isArray(p.days) ? [...new Set(p.days.filter((d) => DAYS.includes(d)))] : [];
  if ("times" in p) prefs.times = Array.isArray(p.times) ? [...new Set(p.times.filter((d) => TIMES.includes(d)))] : [];
  if ("never" in p) prefs.never = Array.isArray(p.never) ? [...new Set(p.never.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 20) : [];
  if ("access" in p) prefs.access = Array.isArray(p.access) ? [...new Set(p.access.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 10) : [];
  for (const k of Object.keys(prefs)) if (prefs[k] == null) delete prefs[k];
  return prefs;
}

// Follows: organisers, venues and artists the person follows (user.following holds names; followKinds says which)
function follows(user) {
  const kinds = user.followKinds || {};
  return (user.following || []).map((name) => ({ name, kind: kinds[name] || "organiser" }));
}

// { vibes, organizers, venues, artists, learned, energy, surprise } as of `now`
function weights(user, now = Date.now()) {
  const taste = ensure(user);
  const learned = {};
  const organizers = {};
  const venues = {};
  for (const x of taste.events) {
    const d = (ACTION[x.k] || 0) * decay(x.t, now, halfLife(x.k));
    for (const v of x.v) learned[v] = (learned[v] || 0) + d / x.v.length;
    if (x.o) organizers[x.o] = (organizers[x.o] || 0) + d;
    if (x.n) venues[x.n] = (venues[x.n] || 0) + d;
  }
  const artists = {};
  for (const f of follows(user)) {
    if (f.kind === "venue") venues[f.name] = (venues[f.name] || 0) + FOLLOW;
    else if (f.kind === "artist") artists[f.name] = FOLLOW;
    else organizers[f.name] = (organizers[f.name] || 0) + FOLLOW;
  }
  const past = {};
  for (const p of user.past || []) {
    const vs = PAST_VIBES[p] || [];
    for (const v of vs) past[v] = (past[v] || 0) + PAST / vs.length;
  }
  const picked = new Set(user.vibes || []);
  const vibes = {};
  for (const v of VIBES) {
    const e = taste.edits[v];
    if (e === 0) continue; // taken out of their taste: neither onboarding nor actions count
    if (taste.pauses[v] && taste.pauses[v] > now) continue; // paused for a while
    const base = e != null ? e : (picked.has(v) ? ONBOARDING : 0) + (past[v] || 0);
    const w = base + (learned[v] || 0);
    if (Math.abs(w) > 0.05) vibes[v] = Math.round(w * 100) / 100;
  }
  return { vibes, organizers, venues, artists, learned, past, energy: energy(user, now), surprise: surprise(user) };
}

// Energy: the slider when set, else learned from the nights they went to, said yes to or loved (null: no effect)
function energy(user, now = Date.now()) {
  const taste = ensure(user);
  if (taste.prefs.energy != null) return taste.prefs.energy;
  let sum = 0;
  let wsum = 0;
  for (const x of taste.events) {
    if (!["went", "love", "accept", "pick"].includes(x.k) || x.en == null) continue;
    const d = decay(x.t, now, halfLife(x.k));
    sum += x.en * d;
    wsum += d;
  }
  return wsum >= 0.5 ? Math.round((sum / wsum) * 100) / 100 : null;
}
// Novelty appetite, 0 (familiar) to 1 (lots new); 0.4 when they haven't said
const surprise = (user) => {
  const s = ensure(user).prefs.surprise;
  return s == null ? 0.4 : s;
};

// How well one event fits one person, 0 to 1, and whether they'd strongly dislike it
function fit(w, event) {
  const vs = (event && event.vibes) || [];
  const top = Math.max(1, ...Object.values(w.vibes).filter((x) => x > 0));
  let s = 0;
  for (const v of vs) s += (w.vibes[v] || 0) / top;
  const o = organizerOf(event);
  const ow = o ? (w.organizers || {})[o] || 0 : 0;
  const n = venueOf(event);
  const nw = n ? (w.venues || {})[n] || 0 : 0;
  const title = String((event && event.title) || "").toLowerCase();
  const aw = Object.entries(w.artists || {}).reduce((a, [name, x]) => (name.length > 2 && title.includes(name.toLowerCase()) ? Math.max(a, x) : a), 0);
  s += (ow + Math.max(0, nw) + aw) / top;
  const strongDislike = s <= -0.6 || ow <= -2.5 || vs.some((v) => (w.vibes[v] || 0) <= -2);
  return { fit: s > 0 ? Math.round((1 - Math.exp(-1.2 * s)) * 1000) / 1000 : 0, strongDislike, score: s };
}

// The vibes behind a fit, strongest first ("Jazz", "Live music")
function because(w, event, n = 2) {
  return ((event && event.vibes) || []).filter((v) => (w.vibes[v] || 0) > 0).sort((a, b) => w.vibes[b] - w.vibes[a]).slice(0, n);
}

// The non-vibe parts of the model as a small score with reasons: energy, surprise, days and times, follows, and the
// "why" behind good nights (rating tags). ctx: { origin, tags: { tag: count } }. Never filters anything out.
function prefScore(user, w, e, ctx = {}) {
  const prefs = ensure(user).prefs;
  let bonus = 0;
  const why = [];
  const en = energyOf(e);
  if (w.energy != null && en != null) {
    const b = 1.6 - 1.6 * Math.abs(w.energy - en); // +1.6 when it matches, -1.6 at the opposite end
    bonus += b;
    if (b > 0.9 && prefs.energy != null) why.push(w.energy > 0.3 ? "the loud kind you asked for" : w.energy < -0.3 ? "a chill one, as you asked" : "mid energy, as you asked");
  }
  // Something outside their usual vibes: helped when they asked for surprises, held back when they asked for familiar
  const familiar = ((e && e.vibes) || []).some((v) => (w.vibes[v] || 0) > 0);
  if (!familiar && (e.vibes || []).length) bonus += (w.surprise - 0.4) * 4;
  if (e.startsAt) {
    const day = dayIn(e.startsAt);
    if ((prefs.days || []).length) {
      if (prefs.days.includes(day)) { bonus += 0.8; why.push(`${day}, a day you go out`); }
      else bonus -= 2;
    } else if (user.days === "Weekends") bonus += ["Fri", "Sat", "Sun"].includes(day) ? 0.5 : 0;
    else if (user.days === "Weekdays") bonus += ["Mon", "Tue", "Wed", "Thu"].includes(day) ? 0.5 : 0;
    if ((prefs.times || []).length) {
      if (prefs.times.includes(timeBucket(hourIn(e.startsAt)))) bonus += 0.6;
      else bonus -= 1.5;
    }
  }
  const o = organizerOf(e);
  const n = venueOf(e);
  const followed = follows(user).map((f) => f.name);
  if (o && followed.includes(o)) why.push(`you follow ${o}`);
  else if (n && followed.includes(n)) why.push(`at ${n}, which you follow`);
  else if ((o && ((w.organizers || {})[o] || 0) > 1.5) || (n && ((w.venues || {})[n] || 0) > 1.5)) why.push(`from a ${o && ((w.organizers || {})[o] || 0) > 1.5 ? "host" : "venue"} you rated highly`);
  const tags = ctx.tags || {};
  if (tags["The price"] && (e.price === 0 || (e.price != null && e.price <= 15))) bonus += 0.8;
  const trip = ctx.origin && e.travel && e.travel.from && e.travel.from[ctx.origin];
  if (tags["Easy to get to"] && trip && trip.minutes <= 20) bonus += 0.8;
  return { bonus, why };
}

// Taste > Your taste (the old Profile list, kept for older screens): each vibe with its weight and where it came from
function summary(user, now = Date.now()) {
  const taste = ensure(user);
  const w = weights(user, now);
  const picked = new Set(user.vibes || []);
  const rows = VIBES.map((v) => ({
    vibe: v,
    weight: w.vibes[v] || 0,
    learned: Math.round((w.learned[v] || 0) * 100) / 100,
    picked: picked.has(v),
    past: Math.round((w.past[v] || 0) * 100) / 100,
    edited: taste.edits[v] != null ? taste.edits[v] : null,
    paused: taste.pauses[v] && taste.pauses[v] > now ? taste.pauses[v] : null,
  }));
  return {
    rows: rows.filter((r) => r.weight !== 0 || r.picked || r.edited != null || r.paused).sort((a, b) => b.weight - a.weight),
    actions: taste.events.length,
  };
}

// A key that moves whenever anything ranking reads from the taste model changes (for the feed's cache)
function prefsKey(user) {
  const t = ensure(user);
  return JSON.stringify([t.prefs, t.pauses, user.following || [], user.followKinds || {}, user.past || [], user.days || ""]);
}

module.exports = { VIBES, ACTION, DAYS, TIMES, PAST_VIBES, HALF_LIFE_DAYS, LONG_HALF_LIFE_DAYS, record, undo, forget, edit, pause, setPrefs, follows, weights, fit, because, prefScore, summary, decay, ensure, energyOf, prefsKey, organizerOf, venueOf, timeBucket, hourIn, dayIn };
