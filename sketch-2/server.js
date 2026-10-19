// Sketch 2 — Sidequest redesigned from the Figma screens, on Sketch 1's server.
// Zero dependencies: needs Node 18+ only. Run with `node server.js`.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

// --- Load .env (so the API key never lives in the code). Must run before lib/ai.js loads. ---
// Sketch 2's own .env wins; anything it leaves out (or no .env at all) comes from Sketch 1's, so one set of Supabase keys does both.
for (const envPath of [path.join(__dirname, ".env"), path.join(__dirname, "..", "sketch-1", ".env")]) if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const db = require("./lib/db");
const ai = require("./lib/ai");
const { track, flush: flushAnalytics } = require("./lib/analytics");
const posters = require("./lib/posters");
const { geocode } = require("./lib/geocode");
const { findDuplicate, mergeInto } = require("../sketch-1/import/dedupe");
const { jsonLdEvents } = require("../sketch-1/import/fetch");
const { stripHtml, trimText, place, travel: travelTo, vibesOf, NA } = require("../sketch-1/import/normalize");
const siteName = require("./public/js/sites.js"); // shared with the add-event form

const PORT = process.env.PORT || 3001; // Sketch 1 uses 3000, so both can run at once

// ---------- Shared vocabulary (sent to the app so both sides agree) ----------
const VIBES = ["Live music", "Jazz", "Indie gigs", "Comedy", "Dance", "Electronic", "Records & vinyl", "Film nights", "Zines & print", "Art & making", "Photography", "Writing & poetry", "Tech & coding", "Anime & cosplay", "Outdoors", "Run & ride", "Climbing", "Games & social", "Food & drink", "Markets", "Wellness"];
const ORIGINS = { union: "Downtown (Union)", finch: "North York (Finch)", kennedy: "Scarborough (Kennedy)", kipling: "Etobicoke (Kipling)" };
const AREAS = ["West End", "Downtown", "East End", "Midtown", "North York", "Scarborough", "Etobicoke"];
const WHEN = ["Weeknights", "Fridays", "Saturdays", "Sundays", "Any time", "Friday night", "Weekend days"];
const WHEN_OUT = ["Mornings", "Afternoons", "Evenings", "Late nights"]; // onboarding: when you go out
const DAYS = ["Weekdays", "Weekends", "Both"];
const CREW_SIZES = ["Solo", "2 to 4", "5+"];
const TRANSIT = ["TTC", "Bike", "Walk", "Drive", "Rideshare"];
const RATE_TAGS = ["The people", "The vibe", "The price", "Easy to get to", "My crew"];
const RATE_DETAILS = ["Host", "Ambience", "Venue", "Accessibility", "Vibes"];
const HOST_TYPES = [
  ["Promoter or collective", "Nights, series, pop-ups"],
  ["Venue", "A room people come back to"],
  ["Independent artist", "Shows, workshops, listening sessions"],
  ["Community group", "Run clubs, meetups, free events"],
  ["Business", "Shops, restaurants, studios"],
];
const HOST_DOCS = ["Business registration", "Government photo ID", "Proof of venue or address"];
const TEAM_ROLES = ["Owner", "Admin", "Door staff", "Chat moderator"];
const AGE_POLICIES = ["All ages", "19+", "It depends"];
const FLAG_FIELDS = ["Title", "Date or time", "Venue", "Price", "Organizer", "Description", "Not a real event", "Other"];
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
// "2026-10-20" + "19:30" -> the start (Toronto summer time, like host publishing) and its label, "Tue Oct 20, 7:30 PM"
function startOf(date, time) {
  const start = new Date(`${date}T${time}:00-04:00`);
  const [hh, mm] = time.split(":").map(Number);
  const label = `${start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).replace(",", "")}, ${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
  return { start, label };
}

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
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2)); // 23.8 -> "23.80"
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
    tickets: [], // the ticket wallet: imported tickets with their scannable codes
    feed: null, // cached taste-avatar picks
    ...fields,
  };
  db.data.users[user.id] = user;
  // Everyone starts with the party from the proposal, already mid-plan
  const members = ["Maya", "Kai"];
  db.data.parties[user.id] = {
    id: user.id,
    name: "Friday Crew",
    members,
    votes: {}, // voter -> event id
    poll: [], // quests in the group vote
    locked: null,
    chat: [
      { from: "Maya", text: "Friday? I need live music.", time: new Date().toISOString() },
      { from: "Kai", text: "Down if it's cheap. Comedy also works.", time: new Date().toISOString() },
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
    if (e.verification && e.verification.status === "reported") return false; // people who checked the listing said it isn't real
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
// The version moves when listings are imported, published, ended, verified or flagged, someone accepts a quest,
// or every 10 minutes (so events that have started drop off the feed).
function eventsVersion() {
  const d = db.data;
  const ended = d.events.reduce((n, e) => n + (e.ended ? 1 : 0), 0);
  return [d.createdAt, d.eventsImportedAt, d.events.length, ended, d.logs.going.length, d.eventEdits || 0, Math.floor(now().getTime() / 600000)].join("|");
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
  deliverDue();
  publishDue();
  const d = db.data;
  const user = d.users[userId] || null;
  const host = d.hosts[hostId] || null;
  return {
    now: now().toISOString(),
    mode: ai.mode(),
    model: ai.MODEL,
    vocab: { VIBES, ORIGINS, AREAS, WHEN, WHEN_OUT, DAYS, CREW_SIZES, TRANSIT, RATE_TAGS, HOST_TYPES, PAST_SUGGESTIONS, FLAG_FIELDS },
    friends: db.FRIENDS,
    user: user && { ...user, feedKey: feedKey(user), friendList: friendList(user), highlights: highlights(user), friendRequests: requestsFor(user), pendingFriends: sentTo(user).map(person).filter(Boolean) },
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sameEmail = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
// Usernames are unique, ignoring case and the leading @ (the sample friends' handles count as taken too)
const handleOf = (s) => clean(s, 30).replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "");
const handleTaken = (h, except) => !!h && (Object.values(db.data.users).some((u) => u !== except && handleOf(u.handle || u.username) === h) || Object.values(db.FRIENDS).some((f) => handleOf(f.handle) === h));
// Three free usernames: the taken one with a number, their name joined to it, and their name on its own
function handleIdeas(want, name, except) {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9._]+/g, ".").replace(/^\.+|\.+$/g, "");
  const full = slug(clean(name, 30)) || "sidequester";
  const [first, last] = full.split(".");
  const base = slug(handleOf(want)) || full;
  const free = (h) => h && !handleTaken(h, except);
  const numbered = (b, from = 2) => { for (let n = from; ; n++) if (free(`${b}${n}`)) return `${b}${n}`; };
  // Name + username: the part of their name the username doesn't already have, in front (first name) or behind (last name)
  const extra = [first, last].find((p) => p && !base.split(".").includes(p));
  const combo = extra === first ? `${first}.${base}` : extra ? `${base}.${extra}` : "";
  const ideas = new Set([numbered(base), free(combo) ? combo : numbered(combo || `${base}.${first}`), free(full) ? full : numbered(full)]);
  for (let n = 2; ideas.size < 3; n++) ideas.add(numbered(base, n));
  return [...ideas].map((h) => "@" + h);
}
// A phone is its digits, without a leading 1 (so "+1 416..." and "(416)..." match)
const phoneOf = (s) => String(s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const PHONE_OK = (s) => /^\d{10}$/.test(phoneOf(s));
// Which of the sign-up email or phone already belongs to another account (attendee or host)
const linkedTo = (ctx, email, phone) =>
  email && (Object.values(db.data.users).some((u) => u !== ctx.user && sameEmail(u.email, email)) || Object.values(db.data.hosts).some((h) => sameEmail(h.email, email))) ? "email"
  : phone && Object.values(db.data.users).some((u) => u !== ctx.user && phoneOf(u.phone) === phoneOf(phone)) ? "phone" : null;
A.checkSignup = (ctx, { username, name, email, phone }) => {
  const h = handleOf(username);
  return { linked: linkedTo(ctx, clean(email, 80), clean(phone, 30)), suggestions: handleTaken(h, ctx.user) ? handleIdeas(h, name, ctx.user) : null };
};
A.signup = (ctx, { name, email, username, phone }) => {
  const e = clean(email, 80);
  if (!clean(name, 30)) throw new Error("Add your name to continue.");
  if (!EMAIL.test(e)) throw new Error("Invalid email format.");
  if (clean(phone, 30) && !PHONE_OK(phone)) throw new Error("Invalid phone number.");
  const linked = linkedTo(ctx, e, clean(phone, 30));
  if (linked) throw new Error(`${linked === "email" ? "Email" : "Phone"} already linked to an account. Please log in using those credentials.`);
  if (handleTaken(handleOf(username), ctx.user)) throw new Error("That username is taken. Pick another.");
  const user = ctx.user && !ctx.user.registered ? ctx.user : newUser(); // never write over a finished account still signed in on this browser
  user.name = clean(name, 30);
  user.email = e;
  user.handle = handleOf(username) ? "@" + handleOf(username) : "";
  user.phone = clean(phone, 30);
  return { userId: user.id };
};

// --- log in: an emailed 6-digit code, for attendee and host accounts alike ---
// With Supabase set up, Supabase Auth emails the code (its "Magic Link" email template needs {{ .Token }}).
// Without it there's no email service, so the code comes back to the app and shows in the side panel.
const CODE_MINUTES = 10;
const codes = new Map(); // email -> { code, expires, tries } (demo codes only; Supabase keeps its own)
const accountsFor = (email) => ({
  user: Object.values(db.data.users).find((u) => sameEmail(u.email, email)) || null,
  host: Object.values(db.data.hosts).find((h) => sameEmail(h.email, email)) || null,
});
async function supabaseAuth(route, body) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/${route}`, { method: "POST", headers: { apikey: process.env.SUPABASE_SECRET_KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).msg || "").includes("rate") ? "Too many codes sent. Wait a minute, then resend." : "The code didn't go through. Try again.");
}
const useSupabaseAuth = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
// A finished account also goes into Supabase's Authentication > Users, with its username and role, so it's there to see
// (the full profile lives in app_state; the sketch2_accounts view lists it). An email that's already there is left as it is.
async function addAuthUser(a, role) {
  if (!useSupabaseAuth() || !a.email) return;
  const key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, "content-type": "application/json", ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, { method: "POST", headers,
    body: JSON.stringify({ email: a.email, email_confirm: true, user_metadata: { sidequest_id: a.id, role, name: a.name, username: a.handle || "", phone: a.phone || "" } }) });
  if (!res.ok && res.status !== 422) throw new Error(`Supabase Auth ${res.status}: ${await res.text()}`);
}
A.requestCode = async (ctx, { email }) => {
  const e = clean(email, 80).toLowerCase();
  if (!EMAIL.test(e)) throw new Error("Enter the email on your account.");
  const { user, host } = accountsFor(e);
  if (!user && !host) throw new Error("No account uses that email. Check it, or create an account.");
  const expires = Date.now() + CODE_MINUTES * 60000;
  if (useSupabaseAuth()) {
    await supabaseAuth("otp", { email: e, create_user: true });
    return { sent: true, expires };
  }
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  codes.set(e, { code, expires, tries: 0 });
  return { sent: true, expires, demoCode: code };
};
A.verifyCode = async (ctx, { email, code }) => {
  const e = clean(email, 80).toLowerCase();
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 6) throw new Error("Enter all 6 digits.");
  if (useSupabaseAuth()) {
    await supabaseAuth("verify", { type: "email", email: e, token: c }).catch(() => {
      throw new Error("That code isn't right, or it expired.");
    });
  } else {
    const sent = codes.get(e);
    if (!sent || Date.now() > sent.expires) throw new Error("That code expired. Send a new one.");
    if (++sent.tries > 5) throw new Error("Too many tries. Send a new code.");
    if (!crypto.timingSafeEqual(Buffer.from(sent.code), Buffer.from(c))) throw new Error("That code isn't right. Check the email and try again.");
    codes.delete(e);
  }
  const { user, host } = accountsFor(e);
  return { userId: user ? user.id : undefined, hostId: host ? host.id : undefined, role: user ? "attendee" : "host" };
};
A.demoLogin = () => {
  const user = newUser({ name: "Alex", email: "alex@email.com", registered: true, contactsSynced: true, vibes: ["Live music", "Jazz", "Zines & print", "Comedy"], past: ["Nuit Blanche 2025", "Toronto Zine Fair"], origin: "union", transit: "TTC", budget: 20 });
  return { userId: user.id };
};
A.setProfile = (ctx, args) => {
  const u = needUser(ctx);
  if (args.toggleVibe && VIBES.includes(args.toggleVibe)) toggle(u.vibes, args.toggleVibe);
  if (args.togglePast) toggle(u.past, clean(args.togglePast, 60));
  if (Array.isArray(args.vibes)) u.vibes = [...new Set(args.vibes.map((v) => clean(v, 30)).filter(Boolean))].slice(0, 40);
  if (args.addVibe && clean(args.addVibe, 30) && !u.vibes.includes(clean(args.addVibe, 30))) u.vibes.push(clean(args.addVibe, 30)); // "More vibes: jazz, ramen, pottery…"
  if (args.toggleWhen && WHEN_OUT.includes(args.toggleWhen)) toggle((u.whenOut = u.whenOut || []), args.toggleWhen);
  if (args.days !== undefined && DAYS.includes(args.days)) u.days = args.days;
  if (args.toggleArea) toggle((u.areas = u.areas || []), clean(args.toggleArea, 40));
  if (args.homeArea !== undefined) u.homeArea = clean(args.homeArea, 40);
  if (args.contactsSynced) u.contactsSynced = true;
  if (args.origin !== undefined && (args.origin === "" || ORIGINS[args.origin])) u.origin = args.origin;
  if (args.transit !== undefined && TRANSIT.includes(args.transit)) u.transit = args.transit;
  if (args.budget !== undefined) u.budget = budgetOf(args.budget);
  if (args.maxMinutes !== undefined) u.maxMinutes = Number(args.maxMinutes) || null;
  if (args.name !== undefined) u.name = clean(args.name, 30) || u.name;
  if (args.adult !== undefined) u.adult = !!args.adult;
  if (args.handle !== undefined) {
    const h = handleOf(args.handle);
    if (handleTaken(h, u)) throw new Error("That username is taken. Pick another.");
    u.handle = h ? "@" + h : "";
  }
  if (typeof args.photo === "string" && /^data:image\/jpeg;base64,/.test(args.photo) && args.photo.length < 120000) u.photo = args.photo;
  if (args.registered) {
    if (u.vibes.length < 2) throw new Error("Pick at least 2 vibes first.");
    u.registered = true;
  }
};
// --- friends: the sample friends (keyed by first name) and other people on Sidequest (keyed "u:" + their id) ---
// Until someone adds a friend themselves, their friends are their contacts (once synced) or their party
const friendKeys = (u) => u.friends || (u.contactsSynced ? Object.keys(db.FRIENDS) : [...((db.data.parties[u.id] || {}).members || [])]);
function person(key) {
  if (db.FRIENDS[key]) return { key, name: key, full: db.FRIENDS[key].full, handle: db.FRIENDS[key].handle };
  const u = key.startsWith("u:") && db.data.users[key.slice(2)];
  return u && u.registered ? { key, name: u.name.split(" ")[0], full: u.name, handle: u.handle || "", photo: u.photo } : null;
}
const friendList = (u) => friendKeys(u).map(person).filter(Boolean);
// Requests this person has sent that are still waiting (as "u:" keys), and the ones waiting on them (as people)
const sentTo = (u) => Object.values(db.data.users).filter((x) => (x.friendRequests || []).includes(u.id)).map((x) => "u:" + x.id);
const requestsFor = (u) => (u.friendRequests || []).map((id) => person("u:" + id)).filter(Boolean);
// Friends' highlights: what friends on Sidequest rated 4 stars and up, newest first
const highlights = (u) => friendKeys(u).flatMap((k) => {
  const f = k.startsWith("u:") && db.data.users[k.slice(2)];
  return f ? Object.entries(f.log).filter(([, l]) => l.rating >= 4).map(([id, l]) => ({ eventId: Number(id), friend: f.name.split(" ")[0], stars: l.rating, at: l.ratedAt || "" })) : [];
}).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
A.findPeople = (ctx, { q }) => {
  const u = needUser(ctx);
  const s = clean(q, 60).toLowerCase().replace(/^@/, "");
  if (!s) return { people: [] };
  const mine = friendKeys(u);
  const keys = [...Object.keys(db.FRIENDS), ...Object.values(db.data.users).filter((x) => x !== u && x.registered).map((x) => "u:" + x.id)];
  const hit = (k) => {
    const p = person(k);
    const x = k.startsWith("u:") && db.data.users[k.slice(2)];
    return p && ([p.full, p.handle.replace(/^@/, "")].some((v) => String(v || "").toLowerCase().includes(s)) || (x && (sameEmail(x.email, s) || (phoneOf(s).length === 10 && phoneOf(x.phone) === phoneOf(s)))));
  };
  return { people: keys.filter(hit).slice(0, 8).map((k) => ({ ...person(k), friend: mine.includes(k), pending: sentTo(u).includes(k) })) };
};
// Adding someone on Sidequest sends them a friend request; they're a friend once they accept, and pending until then.
// The sample friends aren't real people, so they're added straight away.
const befriend = (u, key) => {
  u.friends = friendKeys(u);
  if (!u.friends.includes(key)) u.friends.push(key);
};
const unfriend = (u, key) => {
  u.friends = friendKeys(u).filter((k) => k !== key);
};
A.addFriend = (ctx, { key }) => {
  const u = needUser(ctx);
  key = clean(key, 40);
  if (!person(key) || key === "u:" + u.id) throw new Error("That person isn't on Sidequest.");
  const x = key.startsWith("u:") && db.data.users[key.slice(2)];
  if (!x) return befriend(u, key);
  if ((u.friendRequests || []).includes(x.id)) return A.answerFriend(ctx, { id: x.id, accept: true }); // they asked first
  if (friendKeys(u).includes(key) || (x.friendRequests = x.friendRequests || []).includes(u.id)) return;
  x.friendRequests.push(u.id);
  notify(x, "Friend request", `${u.name || "Someone"}${u.handle ? ` (${u.handle})` : ""} wants to be friends.`, { friendFrom: u.id });
};
A.answerFriend = (ctx, { id, accept }) => {
  const u = needUser(ctx);
  u.friendRequests = (u.friendRequests || []).filter((r) => r !== id);
  const x = db.data.users[id];
  if (!accept || !x) return;
  befriend(u, "u:" + x.id);
  befriend(x, "u:" + u.id);
  notify(x, "Friend request accepted", `You and ${u.name || "your friend"} are now friends.`, { friendFrom: u.id });
};
A.removeFriend = (ctx, { key }) => {
  const u = needUser(ctx);
  unfriend(u, key);
  const x = String(key).startsWith("u:") && db.data.users[key.slice(2)];
  if (x) unfriend(x, "u:" + u.id);
};
// A friend's profile: who they are and their recent sidequests (going or went), newest first
A.friendProfile = (ctx, { key }) => {
  const u = needUser(ctx);
  if (!friendKeys(u).includes(key) || !person(key)) throw new Error("That person isn't your friend.");
  const x = key.startsWith("u:") && db.data.users[key.slice(2)];
  const recent = x
    ? Object.entries(x.log).filter(([, l]) => l.status === "going" || l.status === "went").map(([id, l]) => ({ eventId: Number(id), status: l.status }))
    : [...new Set([...Object.values(db.data.parties).map((p) => p.votes[key]), ...db.data.events.filter((e) => (e.friends || []).includes(key)).map((e) => e.id)])].filter(Boolean).map((id) => ({ eventId: id, status: "going" }));
  const at = (r) => (db.data.events.find((e) => e.id === r.eventId) || {}).startsAt || "";
  return { profile: { ...person(key), recent: recent.filter(at).sort((a, b) => at(b).localeCompare(at(a))).slice(0, 10) } };
};
A.toggleMember = (ctx, { name }) => {
  const u = needUser(ctx);
  if (!db.FRIENDS[name]) throw new Error("Unknown friend.");
  const p = ctx.party;
  if (!toggle(p.members, name)) {
    delete p.votes[name];
  } else if (p.members.length > 5) {
    toggle(p.members, name);
    throw new Error("A party can have up to 6 people, including you.");
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
// The party's cover photo (one of the design's photos), and who picked it
A.partyCover = (ctx, { cover }) => {
  const u = needUser(ctx);
  ctx.party.cover = clean(cover, 30);
  ctx.party.coverBy = u.name || "You";
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
      logVote(same, u);
    }
    return { requestId: same.id, merged: true, votes: same.votes };
  }
  const size = CREW_SIZES.includes(args.size) ? args.size : "Solo";
  const r = {
    id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    time: new Date().toISOString(),
    text,
    origin: ORIGINS[args.origin] ? args.origin : u.origin || "",
    // When and vibe can each be several picks; when and vibe keep them as one line for display
    whens: [].concat(args.when || []).filter((w) => WHEN.includes(w)),
    vibes: [].concat(args.vibe || []).map((v) => clean(v, 40)).filter(Boolean).slice(0, 6),
    area: clean(args.area, 40),
    size,
    budget: budgetOf(args.budget),
    source: args.source === "gap" ? "gap" : "manual", // "gap" = came from a search nothing fit
    votes: 1,
    parties: size === "Solo" ? 0 : 1,
    status: "open", // open -> claimed -> live
    claimedBy: null,
    eventId: null,
  };
  r.when = r.whens.join(", ") || "Any time";
  r.vibe = r.vibes.join(", ");
  list.push(r);
  u.myRequests.push(r.id);
  logVote(r, u);
  return { requestId: r.id, merged: false, votes: 1 };
};
A.upvote = (ctx, { requestId }) => {
  const u = needUser(ctx);
  const r = findRequest(requestId);
  if (!r) throw new Error("Unknown request.");
  if (u.myRequests.includes(r.id)) return;
  const on = toggle(u.votedRequests, r.id);
  r.votes = Math.max(0, r.votes + (on ? 1 : -1));
  if (on) logVote(r, u);
  else db.data.logs.votes = (db.data.logs.votes || []).filter((v) => !(v.requestId === r.id && v.userId === u.id));
};
function logVote(r, u) {
  (db.data.logs.votes = db.data.logs.votes || []).push({ time: now().toISOString(), requestId: r.id, userId: u.id });
}
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
A.rate = (ctx, { eventId, stars, tags, details, with: withWho, photos }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  const l = u.log[Number(eventId)];
  if (!e || !l) throw new Error("This quest isn't in your log.");
  const n = Math.round(Number(stars));
  if (!(n >= 1 && n <= 5)) throw new Error("Tap a star rating first.");
  Object.assign(l, { status: "went", rating: n, tags: (Array.isArray(tags) ? tags : []).filter((t) => RATE_TAGS.includes(t)), ratedAt: now().toISOString() });
  // The optional details, who you were with, and up to 3 small photos (JPEG data URLs)
  const det = details && typeof details === "object" ? details : {};
  l.details = Object.fromEntries(RATE_DETAILS.filter((k) => det[k] >= 1 && det[k] <= 5).map((k) => [k, Math.round(det[k])]));
  l.with = (Array.isArray(withWho) ? withWho : []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 12);
  l.photos = (Array.isArray(photos) ? photos : []).filter((x) => typeof x === "string" && /^data:image\/jpeg;base64,/.test(x) && x.length < 300000).slice(0, 3);
  db.data.logs.attended.push({ time: new Date().toISOString(), eventId: e.id, attended: true, rating: n, tags: l.tags, userId: u.id });
  // A great night teaches the taste avatar
  const learned = n >= 4 ? (e.vibes || []).filter((v) => !u.vibes.includes(v)) : [];
  u.vibes.push(...learned);
  return { learned };
};
A.eventChat = (ctx, { eventId, text, channel }) => {
  const u = needUser(ctx);
  const t = clean(text, 300);
  if (!t || !findEvent(eventId)) return;
  (db.data.eventChat[eventId] = db.data.eventChat[eventId] || []).push({ from: u.name || "You", text: t, channel: clean(channel, 30) || "general", time: now().toISOString() });
};
// Checked in at the door (the venue's QR, or being there)
A.checkIn = (ctx, { eventId, how }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (!u.log[e.id]) A.accept(ctx, { eventId: e.id });
  u.log[e.id].checkedIn = u.log[e.id].checkedIn || now().toISOString();
  u.log[e.id].checkInBy = how === "qr" ? "qr" : "location";
};

// --- host registration ---
A.hostSet = (ctx, args) => {
  let h = ctx.host;
  if (!h) {
    h = { id: newId(), createdAt: new Date().toISOString(), type: "", name: "", email: "", bio: "", vibes: [], area: "", social: "", ticketing: "", ticketLink: "", team: [], verification: "none", registered: false };
    db.data.hosts[h.id] = h;
  }
  if (args.type && HOST_TYPES.some(([t]) => t === args.type)) h.type = args.type;
  for (const k of ["email", "bio", "social", "ticketLink", "website", "role"]) if (args[k] !== undefined) h[k] = clean(args[k], k === "bio" ? 300 : 120);
  if (Array.isArray(args.vibes)) h.vibes = [...new Set(args.vibes.filter((v) => VIBES.includes(v)))];
  if (Array.isArray(args.areas)) h.areas = [...new Set(args.areas.map((a) => clean(a, 30)).filter(Boolean))].slice(0, 8);
  if (AGE_POLICIES.includes(args.agePolicy)) h.agePolicy = args.agePolicy;
  if (typeof args.logo === "string" && /^data:image\/jpeg;base64,/.test(args.logo) && args.logo.length < 120000) h.logo = args.logo;
  // The document itself stays on the host's device in this sketch; we keep which kind and the file name for the review
  if (args.verifyDoc && HOST_DOCS.includes(args.verifyDoc.kind)) h.verifyDoc = { kind: args.verifyDoc.kind, file: clean(args.verifyDoc.file || "", 80) };
  if (args.name !== undefined) {
    const name = clean(args.name, 60);
    if (name && Object.values(db.data.hosts).some((x) => x !== h && x.name === name)) throw new Error("A host with that name already exists.");
    h.name = name;
  }
  if (args.toggleVibe && VIBES.includes(args.toggleVibe)) toggle(h.vibes, args.toggleVibe);
  if (args.area !== undefined && AREAS.includes(args.area)) h.area = args.area;
  if (args.ticketing !== undefined) h.ticketing = clean(args.ticketing, 40);
  if (Array.isArray(args.team)) h.team = args.team.slice(0, 8).map((m) => ({ email: clean(m.email, 80), role: TEAM_ROLES.includes(m.role) ? m.role : "Admin", status: m.status === "Joined" ? "Joined" : "Invited" }));
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
    h = { id: newId(), createdAt: new Date().toISOString(), type: "Promoter or collective", name, email: "", bio: evs[0].organizer.review, vibes: [...new Set(evs.flatMap((e) => e.vibes))], area: evs[0].area, social: "", ticketing: "Eventbrite", ticketLink: "", team: [], verification: "approved", registered: true };
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
// ---------- Adding events: hosts publish quests; anyone can add one from a poster ----------
const POSTER_URL = /^(\/posters\/[0-9a-f]{20}\.(jpg|png|webp|gif)|https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/posters\/[0-9a-f]{20}\.(jpg|png|webp|gif))$/;
const inGTA = (v) => v && v.lat > 43.35 && v.lat < 44.15 && v.lng > -80.1 && v.lng < -78.8;
const normName = (s) => String(s || "").toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]/g, "");

// A venue we can put on the map: one already in our listings, else looked up by name and address
async function placeVenue(name, address) {
  name = clean(name, 80);
  address = clean(address, 120);
  if (!name && !address) return null;
  const n = normName(name);
  const known = n && db.data.events.find((e) => e.venue && normName(e.venue.name) === n && inGTA(e.venue));
  if (known) return { name: known.venue.name, address: address || known.venue.address, lat: known.venue.lat, lng: known.venue.lng };
  const hit = (name && address && (await geocode(`${name}, ${address}`))) || (address && (await geocode(address))) || (name && (await geocode(name)));
  return hit && inGTA(hit) ? { name: name || address, address: address || hit.address || NA, lat: hit.lat, lng: hit.lng } : null;
}

function dateLabelOf(start) {
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).replace(",", "");
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).replace(":00", "");
  return `${day}, ${time}`;
}

// An event from the create form (typed in, or filled from a poster). Throws with a message the app shows.
// Event day info as the host fills it in (Figma: 35 Event day info); entrance and coat stay as plain lines for older screens
const FLOOR_PLAN = /^data:image\/jpeg;base64,/;
function dayInfoOf(x = {}, venue) {
  const sw = (o) => ({ on: !!(o && o.on), note: clean(o && o.note, 80) });
  const entrances = (Array.isArray(x.entrances) ? x.entrances : [x.entrance]).map((t) => clean(t, 80)).filter(Boolean).slice(0, 4);
  const coat = sw(x.coatCheck);
  return {
    entrances,
    entrance: entrances[0] || (venue ? venue.name : "Main door"),
    transit: clean(x.transit, 120),
    home: clean(x.home, 120) || "Subway runs until about 1:30 AM",
    coatCheck: coat,
    coat: coat.on ? coat.note || "Yes" : typeof x.coat === "string" && x.coat ? clean(x.coat, 120) : "Ask at the door",
    reentry: sw(x.reentry),
    stepFree: sw(x.stepFree),
    quietRoom: sw(x.quietRoom),
    payments: (Array.isArray(x.payments) ? x.payments : []).filter((p) => ["Card", "Tap", "Cash"].includes(p)),
    floorPlan: typeof x.floorPlan === "string" && FLOOR_PLAN.test(x.floorPlan) && x.floorPlan.length < 400000 ? x.floorPlan : null,
  };
}
async function eventFromDraft(d, { organizer, fallbackArea }) {
  const title = clean(d.title, 80);
  if (!title) throw new Error("Give it a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) throw new Error("Pick a day.");
  const time = /^\d{2}:\d{2}$/.test(d.time || "") ? d.time : "20:00";
  const startsAt = posters.torontoISO(`${d.date}T${time}`);
  if (!startsAt) throw new Error("That day and time don't exist.");
  if (Date.parse(startsAt) < now().getTime() - 3600000) throw new Error("That day has already passed.");
  const endsAt = /^\d{2}:\d{2}$/.test(d.endTime || "") ? posters.torontoISO(`${d.endTime < time ? new Date(Date.parse(`${d.date}T00:00Z`) + 86400000).toISOString().slice(0, 10) : d.date}T${d.endTime}`) : null;
  const v = d.venue || {};
  const venue = await placeVenue(v.name, v.address);
  if (!venue && !fallbackArea) throw new Error("We couldn't find that venue on the map. Add its street address.");
  const price = budgetOf(d.price);
  const description = clean(d.description, 600);
  const picked = (d.vibes || []).filter((x) => VIBES.includes(x));
  const vibes = picked.length ? picked : vibesOf(`${title} ${description}`);
  const tags = [...vibes.map((x) => x.toLowerCase()), ...(d.age === "19+" ? ["19+"] : [])];
  const where = venue ? place(venue.lat, venue.lng) : { neighbourhood: fallbackArea, area: fallbackArea };
  const start = new Date(startsAt);
  return {
    id: db.data.events.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    title,
    date: dateLabelOf(start),
    startsAt,
    endsAt,
    neighbourhood: where.neighbourhood,
    area: AREAS.includes(where.area) ? where.area : "Downtown",
    venue: venue || { name: clean(v.name, 80) || NA, address: clean(v.address, 120) || NA },
    scene: "New on Sidequest",
    price,
    priceNote: price == null ? NA : price ? `$${price}` : "Free",
    description: description || NA,
    tags,
    vibes,
    rating: null,
    reviews: [],
    going: 0,
    attendees: [],
    organizer: { name: clean(organizer, 80) || NA, rating: null, review: "" },
    friends: [],
    travel: venue ? travelTo(venue.lat, venue.lng) : travelFor(fallbackArea),
    ticketLink: posters.asLink(d.ticketLink),
    image: POSTER_URL.test(d.image || "") ? d.image : null,
    dayInfo: dayInfoOf(d.dayInfo, venue),
    agePolicy: d.age === "19+" ? "19+" : "All ages",
    fromRequest: null,
    publishedAt: new Date().toISOString(),
  };
}
// An upcoming listing this one duplicates, if any
const duplicateOf = (e) => findDuplicate(e, db.data.events.filter((x) => !isOver(x)));

// A host takes over a listing that's already on Sidequest: it's theirs from now on (and survives re-imports)
function claimFor(h, e) {
  Object.assign(e, { organizer: { name: h.name, rating: null, review: "" }, publishedBy: h.id, claimedAt: new Date().toISOString() });
  edited();
}

// Drafts live on the host account: new ones, duplicates, and ones under a draft test
const DRAFT_KINDS = ["new", "duplicate", "test"];
A.saveDraft = (ctx, { draft }) => {
  const h = needHost(ctx);
  const d = draft && typeof draft === "object" ? draft : {};
  if (JSON.stringify(d).length > 500000) throw new Error("That draft is too big. Try a smaller floor plan.");
  h.drafts = h.drafts || [];
  const id = h.drafts.some((x) => x.id === d.id) ? d.id : newId();
  const keep = { ...d, id, kind: DRAFT_KINDS.includes(d.kind) ? d.kind : "new", title: clean(d.title, 80), savedAt: now().toISOString() };
  h.drafts = [keep, ...h.drafts.filter((x) => x.id !== id)].slice(0, 30);
  return { draftId: id };
};
A.deleteDraft = (ctx, { id }) => {
  const h = needHost(ctx);
  h.drafts = (h.drafts || []).filter((x) => x.id !== id);
};
// Draft test: the draft is shown to people whose taste fits for 3 days, and their saves and "I'd go" taps come back
const matchingPeople = (vibes) => Object.values(db.data.users).filter((u) => u.vibes.some((v) => vibes.includes(v))).length + Object.values(db.FRIENDS).filter((f) => f.vibes.some((v) => vibes.includes(v))).length;
A.testDraft = (ctx, { id }) => {
  const h = needHost(ctx);
  const d = (h.drafts || []).find((x) => x.id === id);
  if (!d) throw new Error("That draft is gone.");
  const r = d.fromRequest && findRequest(d.fromRequest);
  d.kind = "test";
  d.test = { startedAt: now().toISOString(), shownTo: matchingPeople(d.vibes || []) + (r ? r.votes : 0), saves: 0, wouldGo: 0, fromRequesters: 0, fromOthers: 0, simulated: false };
};
// ponytail: attendees can't see drafts yet, so a test only fills in when the host taps "Simulate 3 days of interest".
// The numbers come from how well the draft fits its request (price, day, area); real taps replace this once drafts show in feeds.
A.simulateDraft = (ctx, { id }) => {
  const h = needHost(ctx);
  const d = (h.drafts || []).find((x) => x.id === id);
  if (!d || !d.test) throw new Error("Start a draft test first.");
  const r = d.fromRequest && findRequest(d.fromRequest);
  const price = budgetOf(d.price);
  let fit = 1;
  if (r && r.budget != null && price != null && price > r.budget) fit -= 0.35;
  if (d.time && d.time >= "22:00") fit -= 0.15;
  if (!(d.vibes || []).length) fit -= 0.2;
  const shown = Math.max(d.test.shownTo, 40);
  Object.assign(d.test, {
    simulated: true,
    saves: Math.round(shown * 0.15 * fit),
    wouldGo: Math.round(shown * 0.074 * fit),
    fromRequesters: r ? Math.round(61 * fit) : 0,
    fromOthers: Math.round(22 * fit),
    startedAt: new Date(now().getTime() - 3 * 86400000).toISOString(),
  });
};

A.publish = async (ctx, { draft, publishAt }) => {
  const h = needHost(ctx);
  const d = draft || {};
  // Schedule for later: kept as a draft and published on the first app load after that time
  const at = Date.parse(publishAt || "");
  if (publishAt) {
    if (!(at > now().getTime())) throw new Error("Pick a time in the future.");
    await eventFromDraft(d, { organizer: h.name, fallbackArea: AREAS.includes(h.area) ? h.area : "Downtown" }); // catch mistakes now, not at publish time
    const { draftId } = A.saveDraft(ctx, { draft: { ...d, publishAt: new Date(at).toISOString() } });
    return { draftId, scheduled: true };
  }
  if (d.eventId) return editEvent(h, d);
  const e = await eventFromDraft(d, { organizer: h.name, fallbackArea: AREAS.includes(h.area) ? h.area : "Downtown" });
  if (d.id) h.drafts = (h.drafts || []).filter((x) => x.id !== d.id);
  if (!e.ticketLink) e.ticketLink = h.ticketLink;
  // Already listed (imported, or added by someone else): fill that listing's gaps and make it the host's
  const dup = d.fromRequest ? null : duplicateOf(e);
  if (dup) {
    mergeInto(dup, e);
    if (e.image && !dup.publishedBy) dup.image = e.image; // the host's own poster wins
    claimFor(h, dup);
    return { eventId: dup.id, merged: true, requesters: 0, followers: 0 };
  }
  Object.assign(e, { source: "Sidequest", sourceUrl: e.ticketLink, publishedBy: h.id });
  if (!e.sourceUrl) delete e.source; // nothing to link to: no "Listing details" source line
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
// Editing a published quest keeps its id, accepts and chat; only what the host changed moves
async function editEvent(h, d) {
  const e = findEvent(d.eventId);
  if (!e || e.organizer.name !== h.name) throw new Error("Pick one of your quests.");
  const fresh = await eventFromDraft({ ...d, image: d.image || e.image }, { organizer: h.name, fallbackArea: e.area });
  for (const k of ["title", "date", "startsAt", "endsAt", "neighbourhood", "area", "venue", "price", "priceNote", "description", "tags", "vibes", "travel", "dayInfo", "agePolicy", "image"]) e[k] = fresh[k];
  if (fresh.ticketLink) e.ticketLink = fresh.ticketLink;
  edited();
  return { eventId: e.id, edited: true, requesters: 0, followers: 0 };
}
let publishing = false;
async function publishDue() {
  if (publishing) return;
  publishing = true;
  try {
    for (const h of Object.values(db.data.hosts)) {
      for (const d of (h.drafts || []).filter((x) => x.publishAt && Date.parse(x.publishAt) <= now().getTime())) {
        await A.publish({ host: h }, { draft: { ...d, publishAt: null } }).catch((err) => console.error("Scheduled publish failed:", err.message));
        h.drafts = (h.drafts || []).filter((x) => x.id !== d.id);
        db.save();
      }
    }
  } finally {
    publishing = false;
  }
}

// "This is ours": a host claims a listing that's already on Sidequest instead of publishing a copy
A.claimListing = (ctx, { eventId }) => {
  const h = needHost(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("That listing is gone.");
  if (e.publishedBy && e.publishedBy !== h.id) throw new Error("Another host already runs this listing.");
  claimFor(h, e);
  return { eventId: e.id };
};
// An attendee adds an event they spotted (from a poster or screenshot). If it's already listed, the
// listing gets whatever the poster adds (the poster itself, a price) instead of a copy.
A.submitEvent = async (ctx, { draft }) => {
  const u = needUser(ctx);
  const d = draft || {};
  const v = d.venue || {};
  requireAll({ title: d.title, date: d.date, "start time": d.time, "end time": d.endTime, venue: v.name, "street address": v.address, price: d.price, organizer: d.organizer, "ticket or info link": posters.asLink(d.ticketLink), description: d.description }, d.vibes);
  const e = await eventFromDraft(d, { organizer: d.organizer });
  const dup = duplicateOf(e);
  if (dup) {
    mergeInto(dup, e);
    edited();
    return { eventId: dup.id, merged: true };
  }
  Object.assign(e, { source: "Sidequest member", sourceUrl: e.ticketLink || null, submittedBy: u.id });
  db.data.events.push(e);
  if (e.ticketLink) photoFromLink(e, e.ticketLink); // the listing's photo replaces the screenshot
  return { eventId: e.id };
};

// An announcement goes out now, or at sendAt (delivered the next time anyone loads the app after that)
A.hostMessage = (ctx, { eventId, text, audience, sendAt }) => {
  const h = needHost(ctx);
  const t = clean(text, 300);
  if (!t) throw new Error("Write an update first.");
  const e = audience === "followers" && !eventId ? null : findEvent(eventId);
  if (audience !== "followers" && (!e || e.organizer.name !== h.name)) throw new Error("Pick one of your quests.");
  const at = Date.parse(sendAt || "");
  if (sendAt && !(at > now().getTime())) throw new Error("Pick a time in the future.");
  const m = { id: newId(), host: h.name, eventId: e ? e.id : null, text: t, audience: audience === "followers" ? "followers" : "attendees", time: now().toISOString(), ...(at ? { sendAt: new Date(at).toISOString() } : {}) };
  db.data.hostMessages.push(m);
  if (!at) deliver(m);
  return { reached: m.reached || 0, scheduled: !!at };
};
function deliver(m) {
  m.sentAt = now().toISOString();
  if (m.eventId) (db.data.eventChat[m.eventId] = db.data.eventChat[m.eventId] || []).push({ from: m.host, host: true, text: m.text, time: m.sentAt });
  m.reached = 0;
  for (const u of Object.values(db.data.users)) {
    if (m.audience === "followers" ? u.following.includes(m.host) : !!u.log[m.eventId]) {
      notify(u, `Update from ${m.host}`, m.text, m.eventId ? { eventId: m.eventId } : {});
      m.reached++;
    }
  }
}
// ponytail: scheduled messages go out on the next app load after their time; a timer or cron if hosts need them to the minute
function deliverDue() {
  let sent = 0;
  for (const m of db.data.hostMessages) if (m.sendAt && !m.sentAt && Date.parse(m.sendAt) <= now().getTime()) (deliver(m), sent++);
  if (sent) db.save();
}
// After a great night: ask everyone who rated it 4 or 5 stars to follow the host
A.inviteFollow = (ctx, { eventId }) => {
  const h = needHost(ctx);
  const e = findEvent(eventId);
  if (!e || e.organizer.name !== h.name) throw new Error("Pick one of your quests.");
  let asked = 0;
  for (const u of Object.values(db.data.users)) {
    const l = u.log[e.id];
    if (l && l.rating >= 4 && !u.following.includes(h.name)) {
      notify(u, `Follow ${h.name}?`, `You rated ${e.title} ${l.rating} stars. Follow to hear about the next one first.`, { follow: h.name });
      asked++;
    }
  }
  return { asked };
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

// --- ticket wallet: tickets imported from screenshots, PDFs and Apple Wallet passes ---
// The browser decodes each code and re-draws it (checking the copy scans the same); the server only stores it.
const DATA_IMAGE = /^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/;
function cleanCode(c) {
  if (!c) return null;
  if (!/^[A-Za-z0-9]{2,20}$/.test(c.format || "")) throw new Error("Unknown code type.");
  const image = String(c.image || "");
  if (!DATA_IMAGE.test(image) || image.length > 400000) throw new Error("That code couldn't be saved.");
  return { format: c.format, text: clean(c.text, 5000), image };
}
A.addTickets = (ctx, { tickets }) => {
  const u = needUser(ctx);
  if (!Array.isArray(tickets) || !tickets.length || tickets.length > 20) throw new Error("Nothing to add.");
  u.tickets = u.tickets || [];
  for (const t of tickets) {
    const e = findEvent(t.eventId);
    u.tickets.push({
      id: newId(),
      addedAt: now().toISOString(),
      title: clean(t.title, 80) || (e && e.title) || "Ticket",
      venue: clean(t.venue, 80),
      startsAt: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t.startsAt || "") ? t.startsAt : "", // Toronto local time
      seat: clean(t.seat, 60),
      eventId: e ? e.id : null,
      source: ["image", "pdf", "pkpass"].includes(t.source) ? t.source : "image",
      code: cleanCode(t.code),
    });
  }
  return { added: tickets.length };
};
A.removeTicket = (ctx, { id }) => {
  const u = needUser(ctx);
  u.tickets = (u.tickets || []).filter((t) => t.id !== id);
};
// --- events found by attendees: from a screenshot, unverified until someone else checks the listing ---
const validUrl = (u) => {
  try {
    const url = new URL(clean(u, 300));
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const edited = () => (db.data.eventEdits = (db.data.eventEdits || 0) + 1); // so apps re-fetch events
// Events people add need every field (no N/A) and at least one vibe
function requireAll(fields, vibes) {
  const missing = Object.entries(fields).filter(([, v]) => !String(v == null ? "" : v).trim()).map(([k]) => k);
  if (missing.length) throw new Error(`Fill in every field. Missing: ${missing.join(", ")}.`);
  if (!(vibes || []).some((v) => VIBES.includes(v))) throw new Error("Pick at least one vibe.");
}
A.importEvent = (ctx, { draft, screenshot }) => {
  const u = needUser(ctx);
  const d = draft || {};
  requireAll({ "event name": d.title, date: d.date, "start time": d.time, "end time": d.endTime, venue: d.venue, address: d.address, area: AREAS.includes(d.area) ? d.area : "", "price from": d.price, organizer: d.organizer, description: d.description, link: d.sourceUrl, "found on": d.source }, d.vibes);
  const title = clean(d.title, 60);
  if (!title) throw new Error("Add the event's name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) throw new Error("Add the event's date.");
  const sourceUrl = validUrl(d.sourceUrl);
  if (!sourceUrl) throw new Error("Add a link to where you found it (the listing, ticket page or post).");
  // Already on Sidequest? Send them to that one instead of making a copy
  const same = db.data.events.find((e) => e.sourceUrl === sourceUrl || e.ticketLink === sourceUrl);
  if (same) return { eventId: same.id, existing: true };
  const time = /^\d{2}:\d{2}$/.test(d.time || "") ? d.time : "20:00";
  const { start, label } = startOf(d.date, time);
  if (isNaN(start)) throw new Error("That date doesn't look right.");
  const end = /^\d{2}:\d{2}$/.test(d.endTime || "") ? startOf(d.date, d.endTime).start : null;
  if (end && end < start) end.setDate(end.getDate() + 1); // ends after midnight
  if ((end || new Date(start.getTime() + 2 * 3600 * 1000)) < now()) throw new Error("That event has already happened.");
  const area = AREAS.includes(d.area) ? d.area : "Downtown";
  const price = budgetOf(d.price);
  const priceTo = budgetOf(d.priceTo); // optional: the top of a price range
  if (priceTo != null && priceTo < price) throw new Error("\"Price to\" can't be lower than \"Price from\".");
  const vibes = (d.vibes || []).filter((v) => VIBES.includes(v)).slice(0, 4);
  const source = clean(d.source, 40) || siteName(sourceUrl);
  const venue = clean(d.venue, 80);
  const e = {
    id: db.data.events.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    source,
    sourceUrl,
    title,
    date: label,
    startsAt: start.toISOString(),
    endsAt: end ? end.toISOString() : null,
    neighbourhood: area,
    area,
    venue: venue ? { name: venue, address: clean(d.address, 120) || "N/A" } : null,
    scene: "Found by the community",
    price,
    priceNote: `${price ? `$${money(price)}` : "Free"}${priceTo > price ? ` to $${money(priceTo)}` : ""}`,
    description: clean(d.description, 300) || "N/A",
    tags: vibes.map((v) => v.toLowerCase()),
    vibes,
    rating: null,
    reviews: [],
    going: 0,
    attendees: [],
    organizer: { name: clean(d.organizer, 60) || "N/A", rating: null, review: "" },
    friends: [],
    travel: { ...travelFor(area), estimated: true },
    ticketLink: sourceUrl,
    dayInfo: { entrance: venue || "N/A", home: "Subway runs until about 1:30 AM", coat: "N/A" },
    importedBy: u.id,
    importedAt: now().toISOString(),
    // opened: people who tapped through to the listing; only they can vote real or fake
    verification: { status: "unverified", opened: [], real: [], fake: [] },
    flags: [],
  };
  db.data.events.push(e);
  const shot = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(screenshot || ""));
  photoFromLink(e, sourceUrl, shot && Buffer.from(shot[1], "base64"));
  return { eventId: e.id };
};
// Tapping the ticket button: records that this person has seen the original listing
A.openTicket = (ctx, { eventId }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (e.verification && !e.verification.opened.includes(u.id)) {
    e.verification.opened.push(u.id);
    edited();
  }
};
// ponytail: one vote decides (the majority of people who opened the listing); add a minimum count if people game it
A.verify = (ctx, { eventId, real }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  const v = e && e.verification;
  if (!v) throw new Error("This event doesn't need verifying.");
  if (e.importedBy === u.id) throw new Error("Someone else has to verify an event you added.");
  if (!v.opened.includes(u.id)) throw new Error("Open the listing first, then tell us if it's real.");
  v.real = v.real.filter((id) => id !== u.id);
  v.fake = v.fake.filter((id) => id !== u.id);
  (real ? v.real : v.fake).push(u.id);
  edited();
  const was = v.status;
  v.status = v.real.length > v.fake.length ? "verified" : v.fake.length > v.real.length ? "reported" : "unverified";
  const finder = db.data.users[e.importedBy];
  if (finder && v.status !== was && v.status !== "unverified") {
    notify(finder, v.status === "verified" ? "Your event was verified" : "Your event was reported", v.status === "verified" ? `Someone checked the listing for "${e.title}" and confirmed it's real.` : `Someone checked the listing for "${e.title}" and says it isn't real. It's hidden from feeds for now.`, { eventId: e.id });
  }
  return { status: v.status };
};
// Anyone can flag wrong info on any event's page
A.flagInfo = (ctx, { eventId, field, note }) => {
  const u = needUser(ctx);
  const e = findEvent(eventId);
  if (!e) throw new Error("Unknown quest.");
  if (!FLAG_FIELDS.includes(field)) throw new Error("Pick what's wrong.");
  const text = clean(note, 200);
  if (!text) throw new Error("Say what's wrong, like \"It starts at 9, not 8\".");
  edited();
  (e.flags = e.flags || []).push({ id: newId(), userId: u.id, field, note: text, time: now().toISOString() });
  return { flags: e.flags.length };
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
  const daysOf = { Weeknights: [0, 1, 2, 3], Fridays: [4], "Friday night": [4], Saturdays: [5], Sundays: [6], "Weekend days": [5, 6], "Any time": [0, 1, 2, 3, 4, 5, 6] };
  const heat = Object.keys(ORIGINS).map((o) => ({ origin: o, days: DAYS.map(() => 0) }));
  for (const r of d.requests) {
    const rowH = heat.find((h) => h.origin === r.origin);
    if (!rowH) continue;
    const days = [...new Set((r.whens || [r.when]).flatMap((w) => daysOf[w] || []))];
    if (!days.length) days.push(...daysOf["Any time"]);
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

  // This week's asks, who asked (first few names), and who's planning
  const weekAgo = now().getTime() - 7 * 86400000;
  const votes = (d.logs.votes || []).filter((v) => Date.parse(v.time) >= weekAgo);
  const votesWeek = {};
  for (const v of votes) votesWeek[v.requestId] = (votesWeek[v.requestId] || 0) + 1;
  const askers = {};
  for (const u of users) for (const id of [...u.myRequests, ...u.votedRequests]) if ((askers[id] = askers[id] || []).length < 4) askers[id].push(u.name || "Someone");
  const claimed = d.requests.filter((r) => r.status === "claimed");

  // Views to the door, over the last 7, 30 and 90 days
  const funnel = {};
  for (const days of [7, 30, 90]) {
    const since = now().getTime() - days * 86400000;
    const inWindow = (x) => ids.has(x.eventId) && Date.parse(x.time) >= since;
    funnel[days] = {
      views: (d.logs.views || []).filter(inWindow).length,
      saves: sum("saves"), // ponytail: saves have no timestamp yet, so every window shows the current total
      tickets: d.logs.going.filter(inWindow).length,
      checkedIn: mine.filter((e) => Date.parse(e.startsAt) >= since).reduce((n, e) => n + (d.checkins[e.id] || []).length, 0),
    };
  }

  // Per edition: category ratings, and what its guests asked for next (open requests they posted or upvoted)
  for (const ev of events) {
    const raters = users.filter((u) => u.log[ev.id] && u.log[ev.id].rating);
    ev.details = Object.fromEntries(RATE_DETAILS.map((k) => {
      const xs = raters.map((u) => (u.log[ev.id].details || {})[k]).filter(Boolean);
      return [k, xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null];
    }).filter(([, v]) => v != null));
    const went = users.filter((u) => u.log[ev.id] && u.log[ev.id].status === "went");
    ev.asksNext = d.requests.filter((r) => r.status === "open" && went.some((u) => u.myRequests.includes(r.id) || u.votedRequests.includes(r.id))).slice(0, 4).map((r) => r.text);
  }
  const allRatings = d.logs.attended.filter((a) => ids.has(a.eventId) && a.rating).map((a) => a.rating);

  // Where the audience lives, and the regulars (3 or more of this host's quests)
  const areaCounts = {};
  const audienceUsers = users.filter((u) => Object.keys(u.log).some((id) => ids.has(Number(id))) || (host && u.following.includes(host.name)));
  for (const u of audienceUsers) if (u.homeArea) areaCounts[u.homeArea] = (areaCounts[u.homeArea] || 0) + 1;
  const topAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([area, n]) => ({ area, pct: Math.round((n / audienceUsers.length) * 100) }));
  const regulars = users.filter((u) => Object.entries(u.log).filter(([id, l]) => ids.has(Number(id)) && l.status === "went").length >= 3).map((u) => u.name || "Someone");

  return {
    week: { votes: votes.length, byRequest: votesWeek, planning: claimed.length, planningNew: claimed.filter((r) => Date.parse(r.claimedAt || 0) >= weekAgo).length },
    askers,
    funnel,
    rating: { avg: allRatings.length ? Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10 : null, count: allRatings.length },
    totals: { interested, crews: sum("crews"), went: sum("went"), didntGo: sum("didntGo"), notForMe: sum("notForMe"), saves: sum("saves"), fulfilled: d.requests.filter((r) => r.status === "live" && host && r.claimedBy === host.name).length },
    events,
    matching,
    heat,
    unmet,
    searches: d.logs.searches.length,
    audience: { followers, baseFollowers: mine.reduce((a, e) => a + (e.going || 0), 0), segments, people: interestedPeople.length, partyShare: interested ? Math.round((sum("crews") / interested) * 100) : null, repeat, topAreas, regulars },
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

// Search answers a page of picks at a time. only: the ids that pass the filters set in the app (null when none are on).
// exclude: ids already on screen, so the next page picks from the rest.
const SEARCH_PAGE = 10;
async function apiSearch({ userId, query, only, exclude }) {
  const user = db.data.users[userId];
  if (!user) throw new Error("Sign up first.");
  const interests = clean(query, 300);
  if (!interests) throw new Error("Say what you're in the mood for.");
  const origins = user.origin ? [user.origin] : [];
  const { pool, excluded } = applyLimits({ budget: user.budget, origins, maxMinutes: user.maxMinutes });
  const allowed = Array.isArray(only) ? new Set(only.map(Number)) : null;
  const seen = new Set((Array.isArray(exclude) ? exclude : []).map(Number));
  const firstPage = !seen.size;
  const left = pool.filter((e) => (!allowed || allowed.has(e.id)) && !seen.has(e.id));
  const people = [{ name: user.name || "You", interests, origin: user.origin }];
  const words = ai.wordsOf(interests);
  // Searching an event's name finds it, even when its words ("art", "con") also hit hundreds of others
  const phrase = interests.toLowerCase();
  const candidates = shortlist(left, (e) => (e.title.toLowerCase().includes(phrase) ? 20 : 0) + wordHits(e, words) * 3 + vibeOverlap(e, user.vibes) * 0.5 + soonness(e) * 0.2, 35);
  const result = candidates.length ? await ai.match(people, candidates, SEARCH_PAGE) : { mode: ai.mode(), matches: [], unmet: firstPage ? ai.phrasesOf(interests).map((i) => ({ person: people[0].name, interest: i })) : [] };
  // A full page means there are probably more good fits; a short one means the AI (or the keywords) ran out
  const more = result.matches.length >= SEARCH_PAGE && left.length > result.matches.length;
  if (!firstPage) return { mode: result.mode, error: result.error, matches: result.matches, unmet: [], more };
  const unmet = result.unmet.map((u) => ({ ...u, reason: unmetReason(u.interest, excluded) }));
  db.data.logs.searches.push({ time: new Date().toISOString(), mode: result.mode, userId, interests, budget: user.budget, origins, maxMinutes: user.maxMinutes, matchedIds: result.matches.map((m) => m.id), unmet });
  db.save();
  return { ...result, unmet, more, limits: limitsSummary(user.budget, pool, excluded) };
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

// "Add from a poster": read an uploaded poster or screenshot, keep a copy, and return form drafts for the
// events on it, each with the listing it duplicates (if it's already on Sidequest)
async function apiPoster({ image }) {
  if (ai.mode() === "keywords") throw new Error("Reading posters needs the AI (Claude Code or an API key), and neither is available right now.");
  const m = /^data:image\/[a-z+]+;base64,(.+)$/.exec(String(image || ""));
  if (!m) throw new Error("Upload a photo or screenshot (JPEG, PNG or WebP).");
  const buf = Buffer.from(m[1], "base64");
  if (!posters.imageType(buf)) throw new Error("That file isn't a JPEG, PNG, WebP or GIF image.");
  if (buf.length > 8 * 1024 * 1024) throw new Error("That image is too big (8 MB at most).");
  const tmp = path.join(require("os").tmpdir(), `sq-upload-${newId()}.${{ "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[posters.imageType(buf)] || "jpg"}`);
  fs.writeFileSync(tmp, buf);
  let read;
  try {
    read = (await posters.readPosters([{ id: "upload", images: [tmp] }])).upload || { events: [], posterText: "" };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const url = await posters.savePoster(buf);
  const upcoming = db.data.events.filter((x) => !isOver(x));
  const events = [];
  for (const ev of read.events.slice(0, 12)) {
    const [date, time] = String(ev.start || "").split("T");
    const draft = {
      title: clean(ev.title, 80),
      description: clean(ev.description, 600),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "",
      time: /^\d{2}:\d{2}/.test(time || "") ? time.slice(0, 5) : "20:00",
      endTime: /T\d{2}:\d{2}/.test(ev.end || "") ? ev.end.split("T")[1].slice(0, 5) : "",
      price: ev.price == null || ev.price === "" ? "" : String(ev.price),
      venue: { name: clean(ev.venue, 80), address: clean(ev.address, 120) },
      organizer: clean(ev.organizer, 80),
      ticketLink: posters.asLink(ev.ticketUrl),
      vibes: vibesOf(`${ev.title} ${ev.description}`),
      image: url,
    };
    // Already on Sidequest? Checked against the venue on the map when we can place it
    const venue = await placeVenue(draft.venue.name, draft.venue.address);
    const startsAt = draft.date && posters.torontoISO(`${draft.date}T${draft.time}`);
    const dup = venue && startsAt ? findDuplicate({ id: -1, title: draft.title, startsAt, venue, image: url }, upcoming) : null;
    if (venue && !draft.venue.address) draft.venue.address = venue.address === NA ? "" : venue.address;
    events.push({ draft, duplicateOf: dup ? dup.id : null, placed: !!venue });
  }
  return { mode: ai.mode(), image: url, posterText: read.posterText, events };
}

async function apiDraft({ hostId, requestId }) {
  const host = db.data.hosts[hostId];
  const r = findRequest(requestId);
  if (!host || !r) throw new Error("Unknown host or request.");
  return ai.draft(r, host, VIBES);
}

// Read a ticket's details (what, where, when, seat) from its picture or text, and find the quest it's for
async function apiReadTicket({ userId, image, text }) {
  if (!db.data.users[userId]) throw new Error("Sign up first.");
  if (image && !/^data:image\/jpeg;base64,/.test(image)) throw new Error("Send the ticket as a JPEG.");
  if ((image || "").length > 3000000) throw new Error("That picture is too big.");
  const out = await ai.readTicket({ image, text: clean(text, 8000) });
  // The quest: same day, and its title shares a word with the ticket's
  const words = ai.coreWords(out.title || "");
  const day = (out.startsAt || "").slice(0, 10);
  const match = day && words.length && db.data.events.find((e) => new Date(e.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === day && ai.coreWords(e.title).some((w) => words.includes(w)));
  return { ...out, eventId: match ? match.id : null };
}

// Screenshot -> draft event. The person checks the draft, then importEvent saves it.
async function apiExtract({ userId, image }) {
  if (!db.data.users[userId]) throw new Error("Sign up first.");
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ""));
  if (!m) throw new Error("Pick a PNG, JPEG, GIF or WebP screenshot.");
  const today = now().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
  return { time: new Date().toISOString(), ...(await ai.extractEvent(m[2], m[1], { vibes: VIBES, areas: AREAS, today })) };
}

// Shared link -> draft event. Event sites (Eventbrite, DICE, Luma, Meetup…) put the event's details in the page as
// schema.org JSON-LD, so most links need no AI; anything else (or a page that blocks us) goes to the AI.
// "2026-10-30T21:00:00-04:00" -> { date: "2026-10-30", time: "21:00" } in Toronto; a time with no zone is already local
function torontoParts(iso) {
  if (!iso || isNaN(Date.parse(iso))) return { date: "", time: "" };
  const local = /(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Toronto" }) : String(iso).replace("T", " ");
  return { date: local.slice(0, 10), time: /\d\d:\d\d/.test(local.slice(11, 16)) ? local.slice(11, 16) : "" };
}
function draftFromLd(ld, url) {
  const loc = [].concat(ld.location || [])[0] || {};
  const addr = loc.address || {};
  const street = typeof addr === "string" ? addr : addr.streetAddress || "";
  const address = addr.addressLocality && !street.includes(addr.addressLocality) ? `${street}, ${addr.addressLocality}` : street;
  const lat = Number(loc.geo && loc.geo.latitude);
  const lng = Number(loc.geo && loc.geo.longitude);
  const area = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? place(lat, lng, addr.addressLocality).area : "";
  // Only CAD prices go in the price field; others (Eventbrite sometimes shows USD) go in the note as-is
  const offers = [].concat(ld.offers || []).map((o) => ({ low: Number(o.lowPrice != null ? o.lowPrice : o.price), high: Number(o.highPrice != null ? o.highPrice : o.price), currency: o.priceCurrency || "CAD" })).filter((o) => Number.isFinite(o.low));
  const low = offers.length ? offers.reduce((a, b) => (b.low < a.low ? b : a)) : null;
  const high = Math.max(...offers.filter((o) => o.currency === "CAD" && Number.isFinite(o.high)).map((o) => o.high));
  const org = [].concat(ld.organizer || [])[0];
  const start = torontoParts(ld.startDate);
  const short = ld.endDate && Date.parse(ld.endDate) - Date.parse(ld.startDate) < 86400000; // a multi-day run has no single end time
  const description = trimText(ld.description || "", 300);
  return {
    title: stripHtml(ld.name).slice(0, 60),
    date: start.date,
    time: start.time,
    endTime: short ? torontoParts(ld.endDate).time : "",
    venue: stripHtml(loc.name).slice(0, 80),
    address: stripHtml(address).slice(0, 120),
    area: AREAS.includes(area) ? area : "",
    price: low && low.currency === "CAD" ? String(low.low) : "",
    priceTo: low && low.currency === "CAD" && high > low.low ? String(high) : "",
    organizer: stripHtml(typeof org === "string" ? org : org && org.name).slice(0, 60),
    description,
    vibes: vibesOf(`${ld.name} ${description}`).filter((v) => VIBES.includes(v)),
    sourceUrl: url,
    source: siteName(url),
  };
}
// ponytail: blocks obvious internal hosts only; a public name that resolves to a private IP still gets through. Resolve and check the IP before deploying somewhere with internal services.
const publicHost = (link) => {
  const host = new URL(link).hostname;
  return !/^(localhost|.*\.(local|internal|localhost))$/i.test(host) && !/^[\d.]+$|:/.test(host);
};
// One shared event page's HTML, or "" if it can't be read
async function fetchPage(link) {
  if (!publicHost(link)) return "";
  try {
    const res = await fetch(link, { headers: { "user-agent": "SidequestSketch/1.0 (reads one event page someone shared)", "accept-language": "en-CA,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    return res.ok ? (await res.text()).slice(0, 3000000) : "";
  } catch {
    return "";
  }
}
// The event's photo: its JSON-LD image, else the og:image sites set for link previews
function imageOf(html) {
  const ld = jsonLdEvents(html).find((x) => x.image);
  const img = ld && [].concat(ld.image)[0];
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((t) => /property=["']og:image(:url)?["']/i.test(t));
  const src = (img && (img.url || img)) || (og && (/content=["']([^"']+)/i.exec(og) || [])[1]);
  try {
    const url = new URL(String(src).replace(/&amp;/g, "&"));
    return /^https?:$/.test(url.protocol) && url.href.length < 1000 ? url.href : null;
  } catch {
    return null;
  }
}
// The event's photo from its link (a post's first image, an event page's main image), kept as our own
// copy since Instagram's image links expire within days. Arrives a moment after the event is saved.
// fallback: an image to use when the link has none (the screenshot they added it from)
async function photoFromLink(e, link, fallback) {
  let buf = null;
  try {
    const src = imageOf(await fetchPage(link));
    const res = src && (await fetch(src, { signal: AbortSignal.timeout(15000) }));
    const got = res && res.ok && Buffer.from(await res.arrayBuffer());
    if (got && got.length <= 8 * 1024 * 1024 && posters.imageType(got)) buf = got;
  } catch {}
  if (!(buf = buf || fallback)) return;
  try {
    e.image = await posters.savePoster(buf);
    edited();
    db.save();
  } catch {}
}
// The cover image a link would give an added event, for the form's preview
async function apiCover({ userId, url }) {
  if (!db.data.users[userId]) throw new Error("Sign up first.");
  const link = validUrl(url);
  return { image: link && publicHost(link) ? imageOf(await fetchPage(link)) : null };
}
async function apiFromLink({ userId, url }) {
  if (!db.data.users[userId]) throw new Error("Sign up first.");
  const link = validUrl(url);
  if (!link || !publicHost(link)) throw new Error("Paste the event's web link, like https://www.eventbrite.ca/e/…");
  const same = db.data.events.find((e) => e.sourceUrl === link || e.ticketLink === link);
  if (same) return { existingId: same.id };
  const html = await fetchPage(link);
  const ld = jsonLdEvents(html).find((e) => e.name && e.startDate);
  if (ld) return { time: new Date().toISOString(), mode: "listing", draft: { ...draftFromLd(ld, link), image: imageOf(html) } };
  // Pages we can't read (blocked, behind a login, or with nothing about the event on them)
  const unsupported = { time: new Date().toISOString(), mode: "unsupported", draft: null, error: `We can't read events from ${siteName(link)} links yet. Use a screenshot of the event, or enter the details yourself.` };
  const today = now().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" });
  const text = stripHtml(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")).slice(0, 8000);
  if (text.length < 200) return unsupported;
  const out = await ai.extractEvent(null, null, { vibes: VIBES, areas: AREAS, today, link: { url: link, text } });
  if (out.mode !== "keywords" && !(out.draft && out.draft.title)) return unsupported;
  if (out.draft) Object.assign(out.draft, { sourceUrl: link, source: out.draft.source || siteName(link), image: imageOf(html) }); // the link they shared is the source
  return { time: new Date().toISOString(), ...out };
}

// ---------- Tiny web server ----------
// ---------- Analytics: what each action records (ids, choices and counts; never names, emails or text) ----------
const SAFE_ARGS = ["real", "field", "eventId", "requestId", "stars", "tags", "attended", "audience", "size", "when", "source", "origin", "transit", "budget", "maxMinutes", "registered", "toggleVibe", "type", "area", "submit", "toggleWhen", "days", "adult"];
const SAFE_RESULT = ["added", "existing", "status", "flags", "eventId", "requestId", "merged", "votes", "learned", "told", "reached", "requesters", "followers"];
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
    results: out ? (out.matches || out.events || Object.keys(out.picks || {})).length : 0,
    unmet: out && out.unmet ? out.unmet.length : 0,
  });
}
// Screens the app reports from the browser (anything else is ignored)
const SCREEN_ID = /^[a-z0-9-]{1,40}$/;

const MAX_BODY = 8 * 1024 * 1024; // a screenshot, shrunk by the app before upload, fits easily
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > MAX_BODY) {
        body = "";
        req.destroy();
        resolve({});
      }
    });
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
        result = (await fn(ctx, args || {})) || {};
      } catch (err) {
        trackAction(type, { userId, hostId, sessionId, args, error: err.message });
        return sendJSON(res, 400, { error: err.message });
      }
      trackAction(type, { userId: result.userId || userId, hostId: result.hostId || hostId, sessionId, args, result });
      // An account is stored once onboarding is done, and written before we answer, so "done" never means "saved later, maybe"
      if ((type === "setProfile" && args && args.registered) || type === "hostApprove") {
        try {
          await db.saveNow();
          const host = type === "hostApprove";
          const a = host ? ctx.host : ctx.user;
          if (a) await addAuthUser(a, host ? "host" : "attendee").catch((err) => console.error("Auth user not added:", err.message));
        } catch (err) {
          console.error("Save failed:", err.message);
          return sendJSON(res, 500, { error: "Your account couldn't be saved. Try again in a moment." });
        }
      } else db.save();
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
    const ROUTES = { "/api/feed": apiFeed, "/api/search": apiSearch, "/api/blend": apiBlend, "/api/draft": apiDraft, "/api/poster": apiPoster, "/api/extract": apiExtract, "/api/from-link": apiFromLink, "/api/cover": apiCover, "/api/read-ticket": apiReadTicket };
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
      const seen = screen === "quest" && findEvent(eventId);
      if (seen && !(db.data.hosts[hostId] && seen.organizer.name === db.data.hosts[hostId].name)) { // a host looking at their own listing isn't a view
        (db.data.logs.views = db.data.logs.views || []).push({ time: now().toISOString(), eventId: Number(eventId), userId: userId || null });
        db.save();
      }
      res.writeHead(204);
      return res.end();
    }
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }

  // Posters people uploaded (when they're kept on this machine rather than in Supabase Storage)
  if (req.method === "GET" && url.pathname.startsWith("/posters/")) {
    const file = posters.localPoster(url.pathname.slice("/posters/".length));
    if (!file) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "content-type": { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" }[path.extname(file)] || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" });
    return fs.createReadStream(file).pipe(res);
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
  console.log(`Sketch 2 running at http://localhost:${PORT}`);
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
