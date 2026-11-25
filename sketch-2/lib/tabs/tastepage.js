// Profile > Taste: what the page shows, built from the taste model (lib/search/taste.js) and the person's own history.
// Read-only parts say what was learned in words (top vibes, go-to hosts, patterns), and every learned item can show
// "where this came from": its recent actions, each with "Don't count this". Never shown: exact weights, logs of what
// was shown, friends' private data, or anyone's location. Labels are honest: "From sign-up" only for sign-up picks.

const taste = require("../search/taste");

const KIND_LABEL = { save: "Saved", open: "Opened", accept: "Going to", went: "Went to", more: "More like this", pick: "Picked in a retune", pass: "Passed on in a retune", love: "Rated", dislike: "Rated", notForMe: "Not for me" };
const dateLabel = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" });
const levelOf = (w) => (w <= 0 ? "Less" : w < 2.5 ? "Less" : w < 4.5 ? "Some" : "Lots");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sourceLine(counts, { picked, past, edited }) {
  if (edited != null) return "you set this";
  const bits = [];
  if (counts.nights) bits.push(plural(counts.nights, "night"));
  if (counts.saves) bits.push(plural(counts.saves, "save"));
  if (counts.taps) bits.push(plural(counts.taps, "tap"));
  if (counts.picks) bits.push(plural(counts.picks, "retune pick"));
  if (picked) bits.unshift("sign-up");
  else if (past) bits.unshift("places you've been");
  return bits.length ? `from ${bits.join(", ")}` : "";
}

// user, { findEvent, squads (from squads.view), now }
function build(user, { findEvent, squads = [], now = Date.now() }) {
  const t = taste.ensure(user);
  const w = taste.weights(user, now);
  const log = user.log || {};
  const ev = (id) => (id == null ? null : findEvent(id));
  const titleOf = (x) => {
    const e = ev(x.id);
    return e ? e.title : null;
  };
  const labelOf = (x) => {
    const title = titleOf(x);
    const l = x.id != null ? log[x.id] : null;
    const head = x.k === "love" || x.k === "dislike" ? `Rated ${l && l.rating ? `${l.rating}★` : x.k === "love" ? "4–5★" : "1–2★"}` : KIND_LABEL[x.k] || "Did something";
    return title ? `${head}: ${title}` : `${head} (an older night)`;
  };
  // Per vibe: what counted, newest first
  const per = {};
  const counts = {};
  for (const x of [...t.events].reverse()) {
    for (const v of x.v) {
      (per[v] = per[v] || []).push({ t: x.t, id: x.id == null ? null : x.id, kind: x.k, label: labelOf(x), date: dateLabel(x.t) });
      const c = (counts[v] = counts[v] || { nights: 0, saves: 0, taps: 0, picks: 0 });
      if (x.k === "went" || x.k === "love" || x.k === "dislike") c.nights++;
      else if (x.k === "save") c.saves++;
      else if (x.k === "pick" || x.k === "pass") c.picks++;
      else c.taps++;
    }
  }
  const picked = new Set(user.vibes || []);
  const signupAt = user.createdAt ? dateLabel(Date.parse(user.createdAt)) : "";
  const vibeRows = taste.VIBES.map((v) => {
    const edited = t.edits[v] != null ? t.edits[v] : null;
    const paused = t.pauses[v] && t.pauses[v] > now ? t.pauses[v] : null;
    const weight = w.vibes[v] || 0;
    const sources = (per[v] || []).slice(0, 6);
    if (picked.has(v)) sources.push({ t: null, kind: "signup", label: "Picked at sign-up", date: signupAt });
    else if (w.past[v]) sources.push({ t: null, kind: "past", label: "From places you said you've been, at sign-up", date: signupAt });
    return { vibe: v, weight: Math.max(0, Math.round(weight * 10) / 10), level: edited === 0 ? "Off" : levelOf(edited != null ? edited : weight), edited, paused, picked: picked.has(v), source: sourceLine(counts[v] || {}, { picked: picked.has(v), past: !!w.past[v], edited }), sources };
  }).filter((r) => r.weight > 0 || r.picked || r.edited != null || r.paused || (per[r.vibe] || []).length);
  vibeRows.sort((a, b) => b.weight - a.weight || a.vibe.localeCompare(b.vibe));
  const positive = vibeRows.filter((r) => r.weight > 0 && !r.paused && r.edited !== 0);
  const total = positive.reduce((a, r) => a + r.weight, 0);
  const donut = positive.slice(0, 5).map((r) => ({ vibe: r.vibe, share: total ? Math.round((100 * r.weight) / total) : 0 }));

  // Confirmed nights (went, rated or checked in) and what they say
  const nights = Object.entries(log).map(([id, l]) => ({ e: findEvent(id), l })).filter((x) => x.e && Date.parse(x.e.startsAt) <= now && (x.l.status === "went" || x.l.rating || x.l.checkedIn));
  // Go-to hosts: venues and organisers from nights out (and the ones they follow)
  const follows = taste.follows(user);
  const hostMap = {};
  const addHost = (name, kind, night) => {
    if (!name || name === "N/A") return;
    const h = (hostMap[`${kind}:${name}`] = hostMap[`${kind}:${name}`] || { name, kind, nights: 0, followed: false, sources: [] });
    if (night) {
      h.nights++;
      h.sources.push({ t: null, id: night.e.id, kind: "night", label: `${night.l.rating ? `Rated ${night.l.rating}★` : "Went to"}: ${night.e.title}`, date: dateLabel(Date.parse(night.e.startsAt)) });
    }
  };
  for (const n of nights) {
    addHost(n.e.venue && n.e.venue.name, "venue", n);
    addHost(n.e.organizer && n.e.organizer.name, "organiser", n);
  }
  for (const f of follows) {
    addHost(f.name, f.kind, null);
    const h = hostMap[`${f.kind}:${f.name}`];
    h.followed = true;
    h.sources.unshift({ t: null, kind: "follow", label: `You follow ${f.name}`, date: "" });
  }
  // Rating-based scene affinity, with "Don't count this" on the ratings that made it
  for (const x of t.events) {
    for (const [name, kind] of [[x.o, "organiser"], [x.n, "venue"]]) {
      const h = name && hostMap[`${kind}:${name}`];
      if (h && (x.k === "love" || x.k === "dislike")) {
        const s = h.sources.find((y) => y.id === x.id && y.t == null && y.kind === "night");
        if (s) Object.assign(s, { t: x.t, kind: x.k });
      }
    }
  }
  const hosts = Object.values(hostMap).filter((h) => h.nights >= 1 || h.followed).sort((a, b) => b.nights + (b.followed ? 1.5 : 0) - (a.nights + (a.followed ? 1.5 : 0)) || a.name.localeCompare(b.name)).slice(0, 8);

  // Patterns in plain words: days, start time, trip length; and the "why" behind good nights
  const patterns = [];
  if (nights.length >= 2) {
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dows = nights.map((n) => DOW.indexOf(taste.dayIn(n.e.startsAt)));
    const common = DOW.map((d, i) => [i, dows.filter((x) => x === i).length]).filter(([, c]) => c > 0);
    const topDays = common.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i).sort((a, b) => a - b);
    const run = topDays.length >= 3 && topDays[2] - topDays[0] === 2 ? `${DOW[topDays[0]]}–${DOW[topDays[2]]}` : topDays.map((i) => DOW[i]).join(", ");
    const hours = nights.map((n) => taste.hourIn(n.e.startsAt)).sort((a, b) => a - b);
    const mid = hours[Math.floor(hours.length / 2)];
    const at = `${mid % 12 || 12} ${mid < 12 ? "AM" : "PM"}`;
    const trips = nights.map((n) => user.origin && n.e.travel && n.e.travel.from && n.e.travel.from[user.origin]).filter(Boolean).map((x) => x.minutes).sort((a, b) => a - b);
    const trip = trips.length ? trips[Math.floor(trips.length * 0.8)] : null;
    patterns.push({ icon: "cal", text: `${run}, around ${at}${trip ? `, trips under ${Math.ceil(trip / 5) * 5} min` : ""}`, from: `From your ${plural(nights.length, "night")} out` });
  }
  const rated = nights.filter((n) => n.l.rating);
  const crewTagged = rated.filter((n) => (n.l.tags || []).includes("My crew"));
  if (crewTagged.length >= 2) patterns.push({ icon: "crew", text: "You rate nights higher with your crew", from: `From the "My crew" tag in ${plural(crewTagged.length, "rating")}` });
  const priceTagged = rated.filter((n) => (n.l.tags || []).includes("The price"));
  if (priceTagged.length) patterns.push({ icon: "cash", text: "Price comes up in your ratings", from: "Private · cheaper nights get a small lift" });
  const easy = rated.filter((n) => (n.l.tags || []).includes("Easy to get to"));
  if (easy.length) patterns.push({ icon: "train", text: "Easy trips matter to you", from: "Private · shorter trips get a small lift" });

  // Lists, each with who can see it
  const going = Object.entries(log).filter(([id, l]) => l.status === "going" && findEvent(id) && Date.parse(findEvent(id).startsAt) > now - 3 * 3600000).length;
  const kinds = { artist: 0, venue: 0, organiser: 0 };
  for (const f of follows) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  // Dealbreakers: vibes taken out, organisers marked down, and their own "never" list; private, only used to filter
  const deal = [
    ...Object.entries(t.edits).filter(([, x]) => x === 0).map(([v]) => ({ kind: "vibe", value: v, label: v })),
    ...Object.entries(w.organizers).filter(([, x]) => x <= -2.5).map(([o]) => ({ kind: "organiser", value: o, label: o })),
    ...(t.prefs.never || []).map((x) => ({ kind: "never", value: x, label: x })),
  ];
  const trips = nights.map((n) => user.origin && n.e.travel && n.e.travel.from && n.e.travel.from[user.origin]).filter(Boolean).map((x) => x.minutes).sort((a, b) => a - b);
  const compare = squads.filter((s) => s.members.length).map((s) => ({ id: s.id, name: s.name, names: s.names, fair: s.fair, themes: s.themes }));
  return {
    counts: { nights: nights.length, saves: (user.saved || []).length, notForMe: (user.notForMe || []).length },
    donut,
    vibes: vibeRows,
    hosts,
    patterns,
    lists: { going, saved: (user.saved || []).length, following: follows.length, followKinds: kinds, dealbreakers: deal.length },
    prefs: {
      energy: w.energy,
      energySet: t.prefs.energy != null,
      surprise: w.surprise,
      surpriseSet: t.prefs.surprise != null,
      days: t.prefs.days || [],
      times: t.prefs.times || [],
      maxMinutes: user.maxMinutes || null,
      travelUsual: trips.length >= 2 ? trips[Math.floor(trips.length / 2)] : null,
      budget: user.budget == null ? null : user.budget,
      access: t.prefs.access || [],
      never: t.prefs.never || [],
    },
    dealbreakers: deal,
    follows,
    fresh: user.tasteFresh && now - user.tasteFresh.at < 86400000 ? { at: user.tasteFresh.at, until: user.tasteFresh.at + 86400000 } : null,
    undo: (user.tasteUndo || []).length ? (user.tasteUndo[user.tasteUndo.length - 1] || {}).label || "your last change" : null,
    compare,
    actions: t.events.length,
  };
}

module.exports = { build, levelOf };
