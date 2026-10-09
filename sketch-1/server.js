// Sketch 1 — Sidequest at higher fidelity: the proposal's attendee and host apps, on a real server.
// Zero dependencies: needs Node 18+ only. Run with `node server.js`.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

// --- Load .env (so the API key never lives in the code). Must run before lib/ai.js loads. ---
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const db = require("./lib/db");
const ai = require("./lib/ai");
const { track, flush: flushAnalytics } = require("./lib/analytics");

const PORT = process.env.PORT || 3000;

// ---------- Shared vocabulary (sent to the app so both sides agree) ----------
const VIBES = ["Live music", "Jazz", "Indie gigs", "Comedy", "Dance", "Electronic", "Records & vinyl", "Film nights", "Zines & print", "Art & making", "Photography", "Writing & poetry", "Tech & coding", "Anime & cosplay", "Outdoors", "Run & ride", "Climbing", "Games & social"];
const ORIGINS = { union: "Downtown (Union)", finch: "North York (Finch)", kennedy: "Scarborough (Kennedy)", kipling: "Etobicoke (Kipling)" };
const AREAS = ["West End", "Downtown", "East End", "Midtown", "North York", "Scarborough", "Etobicoke"];
const WHEN = ["Weeknights", "Fridays", "Saturdays", "Sundays", "Any time"];
const CREW_SIZES = ["Solo", "2 to 4", "5+"];
const TRANSIT = ["TTC", "Bike", "Walk", "Drive", "Rideshare"];
const RATE_TAGS = ["The people", "The vibe", "The price", "Easy to get to", "My crew"];
const HOST_TYPES = [
  ["Venue", "You run a bar, club, gallery, or space"],
  ["Promoter or organizer", "You put on nights at other venues"],
  ["Artist or collective", "You perform, DJ, or curate"],
  ["Community group", "You organize for a community or cause"],
  ["Brand", "You host activations and pop-ups"],
];
const PAST_SUGGESTIONS = ["Nuit Blanche 2025", "Toronto Zine Fair", "Hot Docs screening", "Night market at Stackt", "Comedy Bar open mic", "Field Trip Festival", "Bloor St Culture Corridor walk", "Fan Expo Canada"];

// Where host-published events are, and how long they take to reach from each starting point
const AREA_TRAVEL = {
  "West End": ["Dundas West", [25, 1], [40, 1], [50, 1], [20, 0]],
  Downtown: ["Osgoode", [10, 0], [30, 0], [40, 1], [35, 0]],
  "East End": ["Broadview", [20, 1], [40, 1], [25, 0], [45, 0]],
  Midtown: ["St Clair", [15, 0], [20, 0], [45, 1], [45, 1]],
  "North York": ["North York Centre", [30, 0], [5, 0], [50, 1], [55, 1]],
  Scarborough: ["Scarborough Centre", [45, 1], [50, 1], [10, 0], [70, 1]],
  Etobicoke: ["Kipling", [35, 0], [55, 1], [65, 0], [5, 0]],
};
function travelFor(area) {
  const [stop, ...t] = AREA_TRAVEL[area] || AREA_TRAVEL.Downtown;
  return { stop, from: Object.fromEntries(Object.keys(ORIGINS).map((o, i) => [o, { minutes: t[i][0], transfers: t[i][1] }])) };
}

// ---------- The sketch's clock ----------
// Real time: an event has passed once it ends (or, with no end time listed, 2 hours after it starts).
const now = () => new Date();
const endsAt = (e) => (e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt) + 2 * 3600 * 1000);
const isOver = (e) => now().getTime() > endsAt(e);

// ---------- Helpers ----------
const newId = () => crypto.randomBytes(6).toString("hex");
const clean = (s, max = 120) => String(s == null ? "" : s).trim().slice(0, max);
const toggle = (arr, v) => {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
  return i < 0;
};
const findEvent = (id) => db.data.events.find((e) => e.id === Number(id));
const findRequest = (id) => db.data.requests.find((r) => r.id === Number(id));
const hostEvents = (host) => db.data.events.filter((e) => e.organizer && e.organizer.name === host.name);
const budgetOf = (v) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null);

function notify(user, title, body, extra = {}) {
  user.notifications.push({ id: newId(), time: now().toISOString(), title, body, read: false, ...extra });
}
// Everyone who posted or upvoted a request hears first
function notifyRequesters(r, title, body, extra) {
  for (const u of Object.values(db.data.users)) {
    if (u.myRequests.includes(r.id) || u.votedRequests.includes(r.id)) notify(u, title, body, extra);
  }
}

function newUser(fields = {}) {
  const user = {
    id: newId(),
    createdAt: new Date().toISOString(),
    name: "",
    email: "",
    registered: false,
    vibes: [],
    past: [],
    contactsSynced: false,
    origin: "",
    transit: "",
    budget: null,
    maxMinutes: 45,
    following: [],
    saved: [],
    log: {}, // eventId -> { status: going | went | missed, acceptedAt, rating, tags, over }
    notForMe: [],
    myRequests: [],
    votedRequests: [],
    notifications: [],
    feed: null, // cached taste-avatar picks
    ...fields,
  };
  db.data.users[user.id] = user;
  // Everyone starts with the party from the proposal, already mid-plan
  const members = ["Aiko", "Priya", "Sam"];
  db.data.parties[user.id] = {
    id: user.id,
    name: "Friday Crew",
    members,
    votes: {}, // voter -> event id
    poll: [], // quests in the group vote
    locked: null,
    chat: [
      { from: "Aiko", text: "Friday? I need live music.", time: new Date().toISOString() },
      { from: "Sam", text: "Down if it's cheap. Comedy also works.", time: new Date().toISOString() },
    ],
    blend: null,
  };
  return user;
}

// ---------- Limits: budget and travel time apply before any matching ----------
// Nothing over budget, too far away or already over can be picked, by the AI or by keywords.
function applyLimits({ budget, origins, maxMinutes }) {
  const excluded = {}; // event id -> "price" | "travel"
  const pool = db.data.events.filter((e) => {
    if (isOver(e)) return false;
    // No listed price counts as over a free-only budget, and within any other
    if (budget != null && (e.price == null ? budget === 0 : e.price > budget)) {
      excluded[e.id] = "price";
      return false;
    }
    if (origins.length && maxMinutes) {
      const tooFar = origins.some((o) => !e.travel.from[o] || e.travel.from[o].minutes > maxMinutes);
      if (tooFar) {
        excluded[e.id] = "travel";
        return false;
      }
    }
    return true;
  });
  return { pool, excluded };
}

// Why was an interest unmet? If matching events exist but were cut by the limits,
// hosts learn the demand is there and the barrier is price or distance.
function unmetReason(interest, excluded) {
  const words = ai.wordsOf(interest);
  const cut = db.data.events.filter((e) => excluded[e.id] && words.some((w) => ai.haystack(e).includes(w)));
  if (!cut.length) return "none";
  return cut.some((e) => excluded[e.id] === "price") ? "price" : "travel";
}

// What the taste avatar knows, gathered from onboarding, ratings and "not for me"
function tasteProfile(user) {
  const party = db.data.parties[user.id];
  const rated = Object.entries(user.log).filter(([, l]) => l.rating);
  const titleOf = (id) => (findEvent(id) || {}).title;
  return {
    name: user.name || "You",
    vibes: user.vibes,
    past: user.past,
    loved: rated.filter(([, l]) => l.rating >= 4).map(([id, l]) => ({ title: titleOf(id), tags: l.tags || [], vibes: (findEvent(id) || {}).vibes || [] })),
    disliked: [...user.notForMe.map(titleOf), ...rated.filter(([, l]) => l.rating <= 2).map(([id]) => titleOf(id))].filter(Boolean),
    party: party ? party.members : [],
    origin: user.origin,
    budget: user.budget,
  };
}
// When any of this changes, the feed is re-scored
function feedKey(user) {
  const { pool } = applyLimits({ budget: user.budget, origins: user.origin ? [user.origin] : [], maxMinutes: user.maxMinutes });
  const key = JSON.stringify([tasteProfile(user), user.maxMinutes, pool.map((e) => e.id)]);
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 12);
}

function crewPeople(user) {
  const party = db.data.parties[user.id];
  const me = tasteProfile(user);
  return [
    { name: user.name || "You", interests: [...me.vibes, ...me.loved.map((l) => l.title)].join(", ") || "anything fun", origin: user.origin, budget: user.budget },
    ...party.members.map((m) => ({ name: m, interests: db.FRIENDS[m].vibes.join(", "), origin: db.FRIENDS[m].origin, budget: db.FRIENDS[m].budget })),
  ];
}
function blendKey(user) {
  return crypto.createHash("md5").update(JSON.stringify([crewPeople(user), user.maxMinutes, db.data.events.length])).digest("hex").slice(0, 12);
}

// Hosts with the most upcoming listings, for "sign in as a host"
function organizerList() {
  const counts = {};
  for (const e of db.data.events) if (e.organizer && e.organizer.name && !isOver(e)) counts[e.organizer.name] = (counts[e.organizer.name] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60).map(([n]) => n);
}

// ---------- Shortlists: the AI reads the best few dozen candidates, not hundreds of listings ----------
function shortlist(pool, score, n) {
  return pool
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.startsAt.localeCompare(b.e.startsAt))
    .slice(0, n)
    .map((x) => x.e);
}
const vibeOverlap = (e, vibes) => (e.vibes || []).filter((v) => vibes.includes(v)).length;
const wordHits = (e, words) => {
  const hay = ai.haystack(e);
  return words.filter((w) => hay.includes(w)).length;
};
// Spread picks over the window: a small bonus for sooner events, so the feed isn't all one weekend
const soonness = (e) => Math.max(0, 1 - (Date.parse(e.startsAt) - now().getTime()) / (30 * 86400000));

// ---------- What the app sees ----------
// ---------- Events: thousands of listings, so they're sent separately and only when they change ----------
// The version moves when listings are imported, published or ended, someone accepts a quest,
// or every 10 minutes (so events that have started drop off the feed).
function eventsVersion() {
  const d = db.data;
  const ended = d.events.reduce((n, e) => n + (e.ended ? 1 : 0), 0);
  return [d.createdAt, d.eventsImportedAt, d.events.length, ended, d.logs.going.length, Math.floor(now().getTime() / 600000)].join("|");
}
let eventsCache = { version: null, json: null, gzip: null };
function eventsPayload() {
  const version = eventsVersion();
  if (eventsCache.version !== version) {
    const d = db.data;
    const goingCounts = {};
    for (const g of d.logs.going) if (!g.sample) goingCounts[g.eventId] = (goingCounts[g.eventId] || 0) + 1;
    // Passed events are left out, except ones someone has in their Quest Log or a host published (for ratings and recaps)
    const kept = new Set(Object.values(d.users).flatMap((u) => Object.keys(u.log || {})).map(Number));
    const json = JSON.stringify({ version, events: d.events.filter((e) => !isOver(e) || e.ended || e.publishedBy || kept.has(e.id)).map((e) => ({ ...e, going: (e.going || 0) + (goingCounts[e.id] || 0), over: isOver(e), ended: !!e.ended })) });
    eventsCache = { version, json, gzip: zlib.gzipSync(json) };
  }
  return eventsCache;
}

function view(userId, hostId) {
  const d = db.data;
  const user = d.users[userId] || null;
  const host = d.hosts[hostId] || null;
  return {
    now: now().toISOString(),
    mode: ai.mode(),
    model: ai.MODEL,
    vocab: { VIBES, ORIGINS, AREAS, WHEN, CREW_SIZES, TRANSIT, RATE_TAGS, HOST_TYPES, PAST_SUGGESTIONS },
    friends: db.FRIENDS,
    user: user && { ...user, feedKey: feedKey(user) },
    party: user && { ...d.parties[user.id], blendKey: blendKey(user) },
    host,
    organizers: organizerList(),
    eventsVersion: eventsVersion(), // the events themselves come from /api/events, only when this changes
    requests: [...d.requests].sort((a, b) => b.votes - a.votes),
    hostMessages: d.hostMessages,
    eventChat: d.eventChat,
    checkins: d.checkins,
  };
}

// ---------- Actions: every change the app makes goes through here ----------
// Each is (ctx, args) => optional result. ctx has the attendee (user), their party, and the host.
const A = {};
const needUser = (ctx) => {
  if (!ctx.user) throw new Error("Sign up first.");
  return ctx.user;
};
const needHost = (ctx) => {
  if (!ctx.host) throw new Error("Register as a host first.");
  return ctx.host;
};

// --- attendee account and onboarding ---
A.signup = (ctx, { name, email }) => {
  const user = ctx.user || newUser();
  user.name = clean(name, 30) || "Alex";
  user.email = clean(email, 80);
  return { userId: user.id };
};
A.demoLogin = () => {
  const user = newUser({ name: "Alex", email: "alex@email.com", registered: true, contactsSynced: true, vibes: ["Live music", "Jazz", "Zines & print", "Comedy"], past: ["Nuit Blanche 2025", "Toronto Zine Fair"], origin: "union", transit: "TTC", budget: 20 });
  return { userId: user.id };
};
A.setProfile = (ctx, args) => {
  const u = needUser(ctx);
  if (args.toggleVibe && VIBES.includes(args.toggleVibe)) toggle(u.vibes, args.toggleVibe);
  if (args.togglePast) toggle(u.past, clean(args.togglePast, 60));
  if (args.contactsSynced) u.contactsSynced = true;
  if (args.origin !== undefined && (args.origin === "" || ORIGINS[args.origin])) u.origin = args.origin;
  if (args.transit !== undefined && TRANSIT.includes(args.transit)) u.transit = args.transit;
  if (args.budget !== undefined) u.budget = budgetOf(args.budget);
  if (args.maxMinutes !== undefined) u.maxMinutes = Number(args.maxMinutes) || null;
  if (args.name !== undefined) u.name = clean(args.name, 30) || u.name;
  if (args.registered) {
    if (u.vibes.length < 3) throw new Error("Pick at least 3 vibes first.");
    u.registered = true;
  }
};
A.toggleMember = (ctx, { name }) => {
  const u = needUser(ctx);
  if (!db.FRIENDS[name]) throw new Error("Unknown friend.");
  const p = ctx.party;
  if (!toggle(p.members, name)) {
    delete p.votes[name];
  } else if (p.members.length > 3) {
    toggle(p.members, name);
    throw new Error("A party can have up to 4 people, including you.");
  }
  u.contactsSynced = true;
};

// --- discover and quests ---
A.follow = (ctx, { host }) => ({ following: toggle(needUser(ctx).following, clean(host, 60)) });
A.save = (ctx, { eventId }) => {
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  return { saved: toggle(needUser(ctx).saved, e.id) };
};
// "Accept quest" is intent only. Attendance is asked after the event ("Did you go?").
A.accept = (ctx, { eventId }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (u.log[e.id]) return;
  const crewSize = 1 + ctx.party.members.filter((m) => ctx.party.votes[m] === e.id || (e.friends || []).includes(m)).length;
  u.log[e.id] = { status: "going", acceptedAt: now().toISOString(), crewSize };
  db.data.logs.going.push({ time: new Date().toISOString(), eventId: e.id, crewSize, userId: u.id });
};
A.unaccept = (ctx, { eventId }) => {
  const u = needUser(ctx);
  delete u.log[Number(eventId)];
};
// "Not for me": the person correcting the AI. Hides the pick and re-tunes the feed.
A.notForMe = (ctx, { eventId, person }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (!person || person === u.name) {
    if (!u.notForMe.includes(e.id)) u.notForMe.push(e.id);
  }
  db.data.logs.feedback.push({ time: new Date().toISOString(), eventId: e.id, person: clean(person, 30), userId: u.id });
};
A.undoNotForMe = (ctx, { eventId }) => {
  const u = needUser(ctx);
  u.notForMe = u.notForMe.filter((id) => id !== Number(eventId));
};

// --- parties ---
A.sendToParty = (ctx, { eventId }) => {
  needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (!ctx.party.poll.includes(e.id)) ctx.party.poll.push(e.id);
  ctx.party.locked = null;
};
A.vote = (ctx, { eventId }) => {
  const u = needUser(ctx);
  const p = ctx.party;
  const id = Number(eventId);
  const me = u.name || "You";
  if (p.votes[me] === id) delete p.votes[me];
  else p.votes[me] = id;
  p.locked = null;
};
A.lockPoll = (ctx) => {
  const u = needUser(ctx);
  const p = ctx.party;
  const tally = {};
  for (const [voter, id] of Object.entries(p.votes)) if (voter === (u.name || "You") || p.members.includes(voter)) tally[id] = (tally[id] || 0) + 1;
  const [top] = p.poll.map((id) => [id, tally[id] || 0]).sort((a, b) => b[1] - a[1]);
  if (!top || !top[1]) throw new Error("Nobody has voted yet.");
  p.locked = top[0];
  A.accept(ctx, { eventId: top[0] });
  if (u.log[top[0]]) u.log[top[0]].crewSize = p.members.length + 1;
  p.chat.push({ from: "Sidequest", text: `Locked in: ${findEvent(top[0]).title}. It's in everyone's Quest Log.`, time: now().toISOString() });
  return { eventId: top[0] };
};
A.partyChat = (ctx, { text }) => {
  const u = needUser(ctx);
  const t = clean(text, 300);
  if (!t) return;
  const p = ctx.party;
  p.chat.push({ from: u.name || "You", text: t, time: now().toISOString() });
  // A friend answers, so the chat doesn't feel empty in the sketch
  if (p.members.length) {
    const who = p.members[p.chat.length % p.members.length];
    const lines = ["I'm in 🙌", "Works for me if we eat first.", "Who's buying the first round?", "Voted!", "Can we meet at the station?"];
    p.chat.push({ from: who, text: lines[p.chat.length % lines.length], time: now().toISOString() });
  }
};

// --- Quest Requests ---
A.postRequest = (ctx, args) => {
  const u = needUser(ctx);
  const text = clean(args.text, 120);
  if (!text) throw new Error("Say what kind of quest you'd go to.");
  const list = db.data.requests;
  // Asking for something already requested counts as an upvote, so demand isn't split
  const key = ai.coreWords(text).sort().join(" ");
  const same = list.find((r) => r.status !== "live" && ai.coreWords(r.text).sort().join(" ") === key);
  if (same) {
    if (!u.votedRequests.includes(same.id) && !u.myRequests.includes(same.id)) {
      same.votes++;
      u.votedRequests.push(same.id);
    }
    return { requestId: same.id, merged: true, votes: same.votes };
  }
  const size = CREW_SIZES.includes(args.size) ? args.size : "Solo";
  const r = {
    id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    time: new Date().toISOString(),
    text,
    origin: ORIGINS[args.origin] ? args.origin : u.origin || "",
    when: WHEN.includes(args.when) ? args.when : "Any time",
    size,
    budget: budgetOf(args.budget),
    source: args.source === "gap" ? "gap" : "manual", // "gap" = came from a search nothing fit
    votes: 1,
    parties: size === "Solo" ? 0 : 1,
    status: "open", // open -> claimed -> live
    claimedBy: null,
    eventId: null,
  };
  list.push(r);
  u.myRequests.push(r.id);
  return { requestId: r.id, merged: false, votes: 1 };
};
A.upvote = (ctx, { requestId }) => {
  const u = needUser(ctx);
  const r = findRequest(requestId);
  if (!r) throw new Error("Unknown request.");
  if (u.myRequests.includes(r.id)) return;
  const on = toggle(u.votedRequests, r.id);
  r.votes = Math.max(0, r.votes + (on ? 1 : -1));
};
A.readNotifications = (ctx) => {
  for (const n of needUser(ctx).notifications) n.read = true;
};

// --- Quest Log: did you go, rating, event day ---
A.skipToAfter = (ctx, { eventId }) => {
  const l = needUser(ctx).log[Number(eventId)];
  if (l) l.over = true;
};
A.attended = (ctx, { eventId, attended }) => {
  const u = needUser(ctx);
  const l = u.log[Number(eventId)];
  if (!l) throw new Error("This quest isn't in your log.");
  l.status = attended ? "went" : "missed";
  if (!attended) db.data.logs.attended.push({ time: new Date().toISOString(), eventId: Number(eventId), attended: false, userId: u.id });
};
A.rate = (ctx, { eventId, stars, tags }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  const l = u.log[Number(eventId)];
  if (!e || !l) throw new Error("This quest isn't in your log.");
  const n = Math.round(Number(stars));
  if (!(n >= 1 && n <= 5)) throw new Error("Tap a star rating first.");
  Object.assign(l, { status: "went", rating: n, tags: (Array.isArray(tags) ? tags : []).filter((t) => RATE_TAGS.includes(t)), ratedAt: now().toISOString() });
  db.data.logs.attended.push({ time: new Date().toISOString(), eventId: e.id, attended: true, rating: n, tags: l.tags, userId: u.id });
  // A great night teaches the taste avatar
  const learned = n >= 4 ? (e.vibes || []).filter((v) => !u.vibes.includes(v)) : [];
  u.vibes.push(...learned);
  return { learned };
};
A.eventChat = (ctx, { eventId, text }) => {
  const u = needUser(ctx);
  const t = clean(text, 300);
  if (!t || !findEvent(eventId)) return;
  (db.data.eventChat[eventId] = db.data.eventChat[eventId] || []).push({ from: u.name || "You", text: t, time: now().toISOString() });
};

// --- host registration ---
A.hostSet = (ctx, args) => {
  let h = ctx.host;
  if (!h) {
    h = { id: newId(), createdAt: new Date().toISOString(), type: "", name: "", email: "", bio: "", vibes: [], area: "", social: "", ticketing: "", ticketLink: "", team: [{ email: "", role: "Editor" }], verification: "none", registered: false };
    db.data.hosts[h.id] = h;
  }
  if (args.type && HOST_TYPES.some(([t]) => t === args.type)) h.type = args.type;
  for (const k of ["email", "bio", "social", "ticketLink"]) if (args[k] !== undefined) h[k] = clean(args[k], k === "bio" ? 300 : 120);
  if (args.name !== undefined) {
    const name = clean(args.name, 60);
    if (name && Object.values(db.data.hosts).some((x) => x !== h && x.name === name)) throw new Error("A host with that name already exists.");
    h.name = name;
  }
  if (args.toggleVibe && VIBES.includes(args.toggleVibe)) toggle(h.vibes, args.toggleVibe);
  if (args.area !== undefined && AREAS.includes(args.area)) h.area = args.area;
  if (args.ticketing !== undefined) h.ticketing = clean(args.ticketing, 40);
  if (Array.isArray(args.team)) h.team = args.team.slice(0, 8).map((m) => ({ email: clean(m.email, 80), role: ["Owner", "Editor", "Door staff"].includes(m.role) ? m.role : "Editor" }));
  if (args.submit) {
    if (!h.name) throw new Error("Add your host name first.");
    h.verification = "pending";
  }
  return { hostId: h.id };
};
A.hostApprove = (ctx) => {
  const h = needHost(ctx);
  h.verification = "approved";
  h.registered = true;
};
// Demo: act as one of the organizers already in the sample events
A.hostLoginAs = (ctx, { name }) => {
  const evs = db.data.events.filter((e) => e.organizer && e.organizer.name === name);
  if (!evs.length) throw new Error("Unknown host.");
  let h = Object.values(db.data.hosts).find((x) => x.name === name);
  if (!h) {
    h = { id: newId(), createdAt: new Date().toISOString(), type: "Promoter or organizer", name, email: "", bio: evs[0].organizer.review, vibes: [...new Set(evs.flatMap((e) => e.vibes))], area: evs[0].area, social: "", ticketing: "Eventbrite", ticketLink: "", team: [], verification: "approved", registered: true };
    db.data.hosts[h.id] = h;
  }
  return { hostId: h.id };
};

// --- host: quests and requests ---
A.claim = (ctx, { requestId }) => {
  const h = needHost(ctx);
  const r = findRequest(requestId);
  if (!r) throw new Error("Unknown request.");
  if (r.status !== "open") throw new Error(`Already claimed by ${r.claimedBy}.`);
  Object.assign(r, { status: "claimed", claimedBy: h.name, claimedAt: new Date().toISOString() });
  notifyRequesters(r, `${h.name} is on it`, `A host claimed your request "${r.text}". You'll hear first when it's live.`, { requestId: r.id });
  return { told: r.votes };
};
A.unclaim = (ctx, { requestId }) => {
  const h = needHost(ctx);
  const r = findRequest(requestId);
  if (r && r.claimedBy === h.name && r.status === "claimed") Object.assign(r, { status: "open", claimedBy: null, claimedAt: null });
};
A.publish = (ctx, { draft }) => {
  const h = needHost(ctx);
  const d = draft || {};
  const title = clean(d.title, 60);
  if (!title) throw new Error("Give your quest a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) throw new Error("Pick a day.");
  const time = /^\d{2}:\d{2}$/.test(d.time || "") ? d.time : "20:00";
  const start = new Date(`${d.date}T${time}:00-04:00`);
  const price = budgetOf(d.price) || 0;
  const area = AREAS.includes(h.area) ? h.area : "Downtown";
  const vibes = (d.vibes || []).filter((v) => VIBES.includes(v));
  const [hh, mm] = time.split(":").map(Number);
  const label = `${start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).replace(",", "")}, ${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
  const travel = travelFor(area);
  const e = {
    id: db.data.events.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    title,
    date: label,
    startsAt: start.toISOString(),
    neighbourhood: area,
    area,
    scene: "New on Sidequest",
    price,
    priceNote: price ? `$${price}` : "Free",
    description: clean(d.description, 300) || `A new quest from ${h.name}.`,
    tags: vibes.map((v) => v.toLowerCase()),
    vibes,
    rating: null,
    reviews: [],
    going: 0,
    attendees: [],
    organizer: { name: h.name, rating: null, review: "" },
    friends: [],
    travel,
    ticketLink: clean(d.ticketLink, 200) || h.ticketLink,
    dayInfo: {
      entrance: clean((d.dayInfo || {}).entrance, 120) || "Main door",
      transit: clean((d.dayInfo || {}).transit, 120),
      home: clean((d.dayInfo || {}).home, 120) || "Subway runs until about 1:30 AM",
      coat: clean((d.dayInfo || {}).coat, 120) || "Ask at the door",
    },
    fromRequest: null,
    publishedBy: h.id,
    publishedAt: new Date().toISOString(),
  };
  db.data.events.push(e);
  const r = d.fromRequest && findRequest(d.fromRequest);
  if (r) {
    Object.assign(r, { status: "live", claimedBy: h.name, eventId: e.id });
    e.fromRequest = r.id;
    notifyRequesters(r, "Your Quest Request is live", `${h.name} made "${r.text}" happen. You get first dibs.`, { eventId: e.id });
  }
  let followers = 0;
  for (const u of Object.values(db.data.users)) {
    if (u.following.includes(h.name) && !(r && (u.myRequests.includes(r.id) || u.votedRequests.includes(r.id)))) {
      notify(u, `New quest from ${h.name}`, `${e.title}, ${e.date}.`, { eventId: e.id });
      followers++;
    }
  }
  return { eventId: e.id, requesters: r ? r.votes : 0, followers };
};
A.hostMessage = (ctx, { eventId, text, audience }) => {
  const h = needHost(ctx);
  const t = clean(text, 300);
  if (!t) throw new Error("Write an update first.");
  const e = findEvent(eventId);
  if (!e || e.organizer.name !== h.name) throw new Error("Pick one of your quests.");
  db.data.hostMessages.push({ id: newId(), host: h.name, eventId: e.id, text: t, audience, time: now().toISOString() });
  (db.data.eventChat[e.id] = db.data.eventChat[e.id] || []).push({ from: h.name, host: true, text: t, time: now().toISOString() });
  let reached = 0;
  for (const u of Object.values(db.data.users)) {
    const hit = audience === "followers" ? u.following.includes(h.name) : !!u.log[e.id];
    if (hit) {
      notify(u, `Update from ${h.name}`, t, { eventId: e.id });
      reached++;
    }
  }
  return { reached };
};
A.checkin = (ctx, { eventId, name }) => {
  needHost(ctx);
  const list = (db.data.checkins[eventId] = db.data.checkins[eventId] || []);
  toggle(list, clean(name, 40));
};
A.endEvent = (ctx, { eventId }) => {
  const h = needHost(ctx);
  const e = findEvent(eventId);
  if (!e || e.organizer.name !== h.name) throw new Error("Pick one of your quests.");
  e.ended = true;
  // Attendees who accepted get asked "Did you go?"
  for (const u of Object.values(db.data.users)) {
    if (u.log[e.id] && u.log[e.id].status === "going") {
      u.log[e.id].over = true;
      notify(u, `How was ${e.title}?`, "Tell us if you went and rate it. It trains your taste avatar.", { eventId: e.id, rate: true });
    }
  }
};

A.reset = () => {
  db.reset();
  return { reset: true };
};

// ---------- Host report: Demand Insights, recaps and audience, from real logs ----------
function hostReport(host) {
  const d = db.data;
  const mine = host ? hostEvents(host) : [];
  const ids = new Set(mine.map((e) => e.id));

  const perEvent = {};
  const row = (id) => (perEvent[id] = perEvent[id] || { id, interested: 0, crews: 0, went: 0, didntGo: 0, ratings: [], tags: {}, notForMe: 0, saves: 0 });
  for (const g of d.logs.going) if (ids.has(g.eventId)) {
    row(g.eventId).interested++;
    if (g.crewSize > 1) row(g.eventId).crews++;
  }
  for (const a of d.logs.attended) if (ids.has(a.eventId)) {
    if (a.attended) {
      row(a.eventId).went++;
      if (a.rating) row(a.eventId).ratings.push(a.rating);
      for (const t of a.tags || []) row(a.eventId).tags[t] = (row(a.eventId).tags[t] || 0) + 1;
    } else row(a.eventId).didntGo++;
  }
  for (const f of d.logs.feedback) if (ids.has(f.eventId)) row(f.eventId).notForMe++;
  for (const u of Object.values(d.users)) for (const id of u.saved) if (ids.has(id)) row(id).saves++;
  const events = mine.map((e) => {
    const r = row(e.id);
    const { ratings, tags, ...rest } = r;
    return {
      ...rest,
      title: e.title,
      rated: ratings.length,
      avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      topTags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
      checkedIn: (d.checkins[e.id] || []).length,
    };
  });
  const sum = (k) => events.reduce((a, e) => a + e[k], 0);

  // Requests that fit this host: shared words with their vibes, or near them
  const hostWords = new Set([...(host ? host.vibes : []), ...mine.flatMap((e) => e.tags)].flatMap((v) => ai.wordsOf(v)));
  const matching = d.requests
    .filter((r) => r.status === "open")
    .map((r) => ({ r, score: ai.wordsOf(r.text).filter((w) => hostWords.has(w) || [...hostWords].some((h) => h.startsWith(w.slice(0, 5)))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.votes - a.r.votes)
    .map((x) => x.r.id);

  // Heatmap: when and where people asked to go out (request votes by starting point and day)
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daysOf = { Weeknights: [0, 1, 2, 3], Fridays: [4], Saturdays: [5], Sundays: [6], "Any time": [0, 1, 2, 3, 4, 5, 6] };
  const heat = Object.keys(ORIGINS).map((o) => ({ origin: o, days: DAYS.map(() => 0) }));
  for (const r of d.requests) {
    const rowH = heat.find((h) => h.origin === r.origin);
    if (!rowH) continue;
    const days = daysOf[r.when] || daysOf["Any time"];
    for (const i of days) rowH.days[i] += r.votes / days.length;
  }

  // Searches nothing fit, with similar wording merged ("vegan", "vegans" and "vegan food" are one row)
  const byInterest = new Map();
  for (const s of d.logs.searches) {
    for (const u of s.unmet || []) {
      const key = ai.coreWords(u.interest).sort().join(" ") || u.interest;
      const r = byInterest.get(key) || { wordings: {}, asks: 0, reasons: { none: 0, price: 0, travel: 0 } };
      r.asks++;
      r.wordings[u.interest] = (r.wordings[u.interest] || 0) + 1;
      r.reasons[u.reason] = (r.reasons[u.reason] || 0) + 1;
      byInterest.set(key, r);
    }
  }
  const unmet = [...byInterest.values()]
    .sort((a, b) => b.asks - a.asks)
    .slice(0, 10)
    .map((r) => {
      const phrasings = Object.entries(r.wordings).sort((a, b) => b[1] - a[1]).map(([w]) => w);
      return { interest: phrasings[0], alsoAs: phrasings.slice(1), asks: r.asks, reasons: r.reasons };
    });

  // Audience: followers, taste segments of people who showed interest, party vs solo, repeat attendance
  const users = Object.values(d.users);
  const followers = users.filter((u) => host && u.following.includes(host.name)).length;
  const interestedPeople = [
    ...users.filter((u) => Object.keys(u.log).some((id) => ids.has(Number(id))) || (host && u.following.includes(host.name))).map((u) => u.vibes),
    ...mine.flatMap((e) => (e.friends || []).filter((f) => db.FRIENDS[f]).map((f) => db.FRIENDS[f].vibes)),
  ];
  const segCounts = {};
  for (const vibes of interestedPeople) for (const v of vibes) segCounts[v] = (segCounts[v] || 0) + 1;
  const segments = Object.entries(segCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([vibe, n]) => ({ vibe, pct: Math.round((n / interestedPeople.length) * 100) }));
  const repeat = users.filter((u) => Object.entries(u.log).filter(([id, l]) => ids.has(Number(id)) && l.status === "went").length > 1).length;
  const interested = sum("interested");

  return {
    totals: { interested, crews: sum("crews"), went: sum("went"), didntGo: sum("didntGo"), notForMe: sum("notForMe"), saves: sum("saves"), fulfilled: d.requests.filter((r) => r.status === "live" && host && r.claimedBy === host.name).length },
    events,
    matching,
    heat,
    unmet,
    searches: d.logs.searches.length,
    audience: { followers, baseFollowers: mine.reduce((a, e) => a + (e.going || 0), 0), segments, people: interestedPeople.length, partyShare: interested ? Math.round((sum("crews") / interested) * 100) : null, repeat },
  };
}

// ---------- AI endpoints ----------
async function apiFeed({ userId, force }) {
  const user = db.data.users[userId];
  if (!user) throw new Error("Sign up first.");
  const key = feedKey(user);
  if (!force && user.feed && user.feed.key === key) return user.feed;
  const { pool } = applyLimits({ budget: user.budget, origins: user.origin ? [user.origin] : [], maxMinutes: user.maxMinutes });
  const visible = pool.filter((e) => !user.notForMe.includes(e.id));
  const profile = tasteProfile(user);
  const lovedVibes = profile.loved.flatMap((l) => l.vibes || []);
  const candidates = shortlist(visible, (e) => vibeOverlap(e, profile.vibes) * 3 + vibeOverlap(e, lovedVibes) + (e.friends || []).filter((f) => profile.party.includes(f)).length * 2 + (e.price === 0 ? 0.5 : 0) + soonness(e) - (profile.disliked.includes(e.title) ? 5 : 0), 45);
  const result = candidates.length ? await ai.feed(profile, candidates) : { mode: ai.mode(), picks: {}, avatar: "" };
  // The user may have changed while the AI was thinking; save against the key it was built for
  user.feed = { key, time: new Date().toISOString(), ...result, eligible: visible.map((e) => e.id) };
  db.save();
  return user.feed;
}

async function apiSearch({ userId, query }) {
  const user = db.data.users[userId];
  if (!user) throw new Error("Sign up first.");
  const interests = clean(query, 300);
  if (!interests) throw new Error("Say what you're in the mood for.");
  const origins = user.origin ? [user.origin] : [];
  const { pool, excluded } = applyLimits({ budget: user.budget, origins, maxMinutes: user.maxMinutes });
  const people = [{ name: user.name || "You", interests, origin: user.origin }];
  const words = ai.wordsOf(interests);
  const candidates = shortlist(pool, (e) => wordHits(e, words) * 3 + vibeOverlap(e, user.vibes) * 0.5 + soonness(e) * 0.2, 35);
  const result = candidates.length ? await ai.match(people, candidates) : { mode: ai.mode(), matches: [], unmet: ai.phrasesOf(interests).map((i) => ({ person: people[0].name, interest: i })) };
  const unmet = result.unmet.map((u) => ({ ...u, reason: unmetReason(u.interest, excluded) }));
  db.data.logs.searches.push({ time: new Date().toISOString(), mode: result.mode, userId, interests, budget: user.budget, origins, maxMinutes: user.maxMinutes, matchedIds: result.matches.map((m) => m.id), unmet });
  db.save();
  return { ...result, unmet, limits: limitsSummary(user.budget, pool, excluded) };
}

async function apiBlend({ userId, force }) {
  const user = db.data.users[userId];
  if (!user) throw new Error("Sign up first.");
  const party = db.data.parties[user.id];
  const key = blendKey(user);
  if (!force && party.blend && party.blend.key === key) return party.blend;
  const people = crewPeople(user);
  const budgeted = people.filter((p) => p.budget != null);
  // The party's budget is the lowest budget anyone set
  const budget = budgeted.length ? Math.min(...budgeted.map((p) => p.budget)) : null;
  const budgetSetBy = budgeted.length && new Set(people.map((p) => p.budget)).size > 1 ? budgeted.find((p) => p.budget === budget).name : null;
  const origins = [...new Set(people.map((p) => p.origin).filter(Boolean))];
  const { pool, excluded } = applyLimits({ budget, origins, maxMinutes: user.maxMinutes });
  const crewVibes = people.map((p) => ai.wordsOf(p.interests));
  const candidates = shortlist(pool, (e) => crewVibes.filter((w) => wordHits(e, w) > 0).length * 3 + crewVibes.reduce((a, w) => a + wordHits(e, w), 0) * 0.3 + soonness(e) * 0.2, 35);
  const result = candidates.length ? await ai.match(people, candidates) : { mode: ai.mode(), matches: [], unmet: [] };
  const unmet = result.unmet.map((u) => ({ ...u, reason: unmetReason(u.interest, excluded) }));
  db.data.logs.searches.push({ time: new Date().toISOString(), mode: result.mode, userId, crew: people.length, interests: people.map((p) => p.interests).join(" | "), budget, origins, maxMinutes: user.maxMinutes, matchedIds: result.matches.map((m) => m.id), unmet });
  party.blend = { key, time: new Date().toISOString(), ...result, unmet, limits: { ...limitsSummary(budget, pool, excluded), budgetSetBy } };
  db.save();
  return party.blend;
}

function limitsSummary(budget, pool, excluded) {
  const excludedPrice = Object.values(excluded).filter((r) => r === "price").length;
  return { budget, fit: pool.length, total: db.data.events.length, excludedPrice, excludedTravel: Object.keys(excluded).length - excludedPrice };
}

async function apiDraft({ hostId, requestId }) {
  const host = db.data.hosts[hostId];
  const r = findRequest(requestId);
  if (!host || !r) throw new Error("Unknown host or request.");
  return ai.draft(r, host, VIBES);
}

// ---------- Tiny web server ----------
// ---------- Analytics: what each action records (ids, choices and counts; never names, emails or text) ----------
const SAFE_ARGS = ["eventId", "requestId", "stars", "tags", "attended", "audience", "size", "when", "source", "origin", "transit", "budget", "maxMinutes", "registered", "toggleVibe", "type", "area", "submit"];
const SAFE_RESULT = ["eventId", "requestId", "merged", "votes", "learned", "told", "reached", "requesters", "followers"];
const DEMO_ACTIONS = ["demoLogin", "hostLoginAs", "hostApprove", "skipToAfter", "reset"]; // sketch shortcuts, left out of real numbers
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));
function trackAction(type, { userId, hostId, sessionId, args, result, error }) {
  const props = { ...pick(args, SAFE_ARGS), ...pick(result, SAFE_RESULT), ok: !error };
  if (error) props.error = error;
  if (DEMO_ACTIONS.includes(type)) props.demo = true;
  const user = db.data.users[userId];
  const id = Number(props.eventId);
  if (user && user.log[id] && (type === "accept" || type === "lockPoll")) props.crewSize = user.log[id].crewSize;
  track(type, { userId, hostId, sessionId, ...props });
}
// What the AI was asked for, how long it took, and which backend answered
function trackAI(route, body, started, out, error) {
  const fresh = !out || !out.time || Date.parse(out.time) >= started; // false when a cached result was reused
  track(`ai_${route}`, {
    userId: body.userId,
    hostId: body.hostId,
    sessionId: body.sessionId,
    ok: !error,
    ...(error ? { error } : {}),
    ms: Date.now() - started,
    fresh,
    mode: out && out.mode,
    results: out ? (out.matches || Object.keys(out.picks || {})).length : 0,
    unmet: out && out.unmet ? out.unmet.length : 0,
  });
}
// Screens the app reports from the browser (anything else is ignored)
const SCREEN_ID = /^[a-z0-9-]{1,40}$/;

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
// Responses carry hundreds of listings, so compress them when the browser allows
let currentReq = null;
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (body.length > 20000 && currentReq && /gzip/.test(currentReq.headers["accept-encoding"] || "")) {
    res.writeHead(status, { ...headers, "content-encoding": "gzip" });
    return res.end(zlib.gzipSync(body));
  }
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  currentReq = req;
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJSON(res, 200, view(url.searchParams.get("user"), url.searchParams.get("host")));
    }
    if (req.method === "POST" && url.pathname === "/api/act") {
      const { user: userId, host: hostId, sessionId, type, args } = await readBody(req);
      const fn = Object.prototype.hasOwnProperty.call(A, type) && A[type];
      if (!fn) return sendJSON(res, 400, { error: `Unknown action: ${type}` });
      const user = db.data.users[userId] || null;
      const ctx = { user, party: user && db.data.parties[user.id], host: db.data.hosts[hostId] || null };
      let result;
      try {
        result = fn(ctx, args || {}) || {};
      } catch (err) {
        trackAction(type, { userId, hostId, sessionId, args, error: err.message });
        return sendJSON(res, 400, { error: err.message });
      }
      trackAction(type, { userId: result.userId || userId, hostId: result.hostId || hostId, sessionId, args, result });
      db.save();
      return sendJSON(res, 200, { result, state: view(result.userId || userId, result.hostId || hostId) });
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      const { json, gzip } = eventsPayload();
      const zipped = /gzip/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", ...(zipped ? { "content-encoding": "gzip" } : {}) });
      return res.end(zipped ? gzip : json);
    }
    if (req.method === "GET" && url.pathname === "/api/host-report") {
      return sendJSON(res, 200, hostReport(db.data.hosts[url.searchParams.get("host")] || null));
    }
    const ROUTES = { "/api/feed": apiFeed, "/api/search": apiSearch, "/api/blend": apiBlend, "/api/draft": apiDraft };
    if (req.method === "POST" && ROUTES[url.pathname]) {
      const body = await readBody(req);
      const route = url.pathname.slice("/api/".length);
      const started = Date.now();
      try {
        const out = await ROUTES[url.pathname](body);
        trackAI(route, body, started, out);
        return sendJSON(res, 200, out);
      } catch (err) {
        trackAI(route, body, started, null, err.message);
        throw err;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/track") {
      const { user: userId, host: hostId, sessionId, screen, from, eventId } = await readBody(req);
      if (SCREEN_ID.test(screen || "")) track("screen_view", { userId, hostId, sessionId, eventId, screen, from: SCREEN_ID.test(from || "") ? from : null });
      res.writeHead(204);
      return res.end();
    }
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }

  // Static files from public/
  const file = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = path.join(__dirname, "public", path.normalize(file));
  if (!filePath.startsWith(path.join(__dirname, "public")) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
  res.writeHead(200, { "content-type": types[path.extname(filePath)] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

// Load the database (from Supabase or data/db.json) before taking requests
db.load().then(() => server.listen(PORT, () => {
  console.log(`Sketch 1 running at http://localhost:${PORT}`);
  console.log(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? "Database: Supabase" : "Database: data/db.json (no Supabase keys in .env)");
  const m = ai.mode();
  if (m === "api") console.log(`Matching with AI via the Anthropic API (${ai.MODEL})`);
  else if (m === "claude-code") console.log("Matching with AI via Claude Code (your Claude subscription)");
  else console.log("Claude Code not found and no API key — using keyword matching (not AI)");
  const upcoming = db.data.events.filter((e) => !isOver(e));
  console.log(`${upcoming.length} upcoming events in the database (imported ${db.data.eventsImportedAt})`);
  track("server_start", { aiMode: m, events: db.data.events.length });
})).catch((err) => {
  console.error("Could not load the database:", err.message);
  process.exit(1);
});

// Send any analytics still waiting before the server stops (Ctrl+C, or a host redeploying)
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    const done = () => process.exit(0);
    flushAnalytics().then(done, done);
    setTimeout(done, 3000).unref();
  });
}
