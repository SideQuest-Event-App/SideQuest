// The Sidekick voice A/B study (INF2573). Testers follow one guided path (public/study.html) and plan
// two nights out with Sidekick: Call 1 in their crew's assigned voice, then a short Call 2 in the other.
//
//   Arms:        A = Calm Concierge ("concierge"), B = Plugged-In Friend ("friend")
//   Assignment:  by crew (a study session), never by person: everyone on one call hears the same voice.
//                Orders alternate AB, BA, AB... so the counts stay even. Call 1 is the clean first exposure.
//   Blinding:    testers only ever see "Voice 1" and "Voice 2". Persona names appear only in the export.
//   Practice:    a solo tester can add 2 practice friends: server-side bots that join the call like a phone
//                would (same routes, same code path) and tap plausible answers and votes. They behave the
//                same in both arms, are marked practice, and are never counted as testers.
//
// What's stored (data/sidekick-study.json, or SIDEKICK_STUDY_FILE; also Supabase Storage when configured,
// the same way lib/sidekick/usage.js keeps its counts): per call, the arm, order and a few numbers
// (questions asked, time to picks, picks accepted, check-in mode), and each tester's survey taps.
// Never stored: names, transcripts, what anyone said, or anyone's private answers (budget, places to avoid).
// Free-text "why" answers have the call's names and any amounts taken out before they're saved.
//
// The private study profile: right after the questionnaire, each tester gets a real attendee account made for
// them, with no name or email ("You"), seeded with taste vibes from question 2, two practice friends (accounts
// named "Robin (practice)" and "Jules (practice)") and a squad, "Study crew", with them. The app opens as it
// for every task link, never the shared demo. It's a study test account ("made"), so it's deleted, with its
// practice friends, its squads and its chat, with the session (End and erase, abandoned, Request removal) and
// with everything else after the deletion date. The export carries the account's internal id only.
//
// Five feature tasks, in a fixed order, each timed from Start: find an event and save it, explore its page
// (two questions built from that event), use the map, check your profile, try Squads. Per task we keep the
// outcome (auto: the app saw it done, self: "I'm done", stuck: "I'm stuck", skipped), the seconds it took,
// a 1-7 ease rating and an optional comment (names, emails and amounts taken out), and for task 2 whether
// each answer matched the event.
//
// Consent (public/study.html): four required boxes and one optional one, stored as yes/no flags with a
// timestamp. Where people live is never stored (the GTA box is a yes, nothing more).
// The questionnaire: 12 questions in 4 parts, every one skippable. Answers are fixed options only (no
// free text), kept on the tester's record by its random id, and recorded as "skipped" when skipped.
//
// Deleting:
//   End and erase      a tester ends the session: the session, its call metrics, its live calls (and their
//                      practice friends) and every study profile made in it (with its practice friends,
//                      squads and chat) are deleted at once.
//   Abandoned          not finished and no activity for 24 hours: the same, by a sweep (on start, hourly).
//   Request removal    after finishing: the session is excluded at once from every export, summary and
//                      the aggregate, then deleted with its study profiles. A short reference code is kept, with the date.
//   The deletion date  after SIDEKICK_STUDY_DELETE_AFTER (default 2026-12-31 23:59:59 Toronto time) a sweep
//                      deletes all study data, every study test account and any synthetic data.
// The aggregate (/api/sk/study/aggregate): counts per answer over consenting, finished, non-removed testers,
// never per-person rows, and nothing at all under 10 such testers. The base for synthetic test users.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const R = require("./rooms");
const P = require("./plan");
const personas = require("./personas");

const FILE = process.env.SIDEKICK_STUDY_FILE || path.join(__dirname, "..", "..", "data", "sidekick-study.json");
const STORE_NAME = "sidekick-study.json";
const ARMS = { A: "concierge", B: "friend" };
const ORDERS = ["AB", "BA"];
const LIKERT = ["natural", "decide", "trust", "again"];
const TASKS = [
  { n: 1, id: "find", title: "Find something to do" },
  { n: 2, id: "event", title: "Explore the event page" },
  { n: 3, id: "map", title: "Use the map" },
  { n: 4, id: "profile", title: "Check your profile" },
  { n: 5, id: "squads", title: "Try Squads" },
];
const STEPS = ["consent", ...TASKS.map((x) => `task${x.n}`), "call1", "call2", "survey"];
const OUTCOMES = ["auto", "self", "stuck", "skipped"];
const USE_MOST = ["discover", "map", "squads", "plan", "profile"];
const BOT_NAMES = ["Robin (practice)", "Jules (practice)"];
const WAIT_FOR_HUMANS_MS = 25000; // practice friends answer anyway if the humans haven't after this long

// ---------- Retention ----------
const DEFAULT_DELETE_AFTER = "2026-12-31T23:59:59-05:00"; // the end of December 31, 2026 in Toronto (EST)
const deleteAfter = () => { const t = Date.parse(process.env.SIDEKICK_STUDY_DELETE_AFTER || ""); return Number.isFinite(t) ? t : Date.parse(DEFAULT_DELETE_AFTER); };
const ABANDON_MS = 24 * 3600000;
const SWEEP_MS = 3600000;
const SYNTH_FILE = process.env.SIDEKICK_SYNTHETIC_FILE || path.join(__dirname, "..", "..", "data", "sidekick-synthetic.json");
const SYNTH_STORE = "sidekick-synthetic.json";
const AGGREGATE_MIN = 10;
const CODE_CHARS = "ACDEFHJKMNPRTUVWXY3479"; // no 0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B, Q

// ---------- The questionnaire: fixed options only ----------
const VIBE_KEYS = ["live-music", "comedy", "markets", "board-games", "dance", "art-shows", "food-pop-ups", "theatre", "jazz", "zines"];
const SPEND = ["under-20", "20-40", "40-80", "80+", "prefer-not"];
const TRAVEL = ["15", "30", "45", "60+"];
const QUESTIONS = {
  q1: { type: "one", opts: ["0", "1-2", "3-4", "5+"] },
  q2: { type: "many", max: 5, opts: VIBE_KEYS },
  q3: { type: "scale", min: 1, max: 5 },
  q4: { type: "scale", min: 1, max: 5 },
  q5: { type: "many", max: 7, opts: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
  q6: { type: "one", opts: ["before-6", "6-8", "after-8", "after-10"] },
  q7: { type: "one", opts: TRAVEL },
  q8: { type: "one", opts: SPEND },
  q9: { type: "one", opts: ["1", "2", "3-4", "5+"] },
  q10: { type: "one", opts: ["me", "someone-else", "we-vote", "nobody"] },
  q11: { type: "one", opts: ["cost", "timing", "no-one-decides", "too-far", "nothing-appeals", "something-else"] },
  q12: { type: "parts", parts: { kind: [...VIBE_KEYS, "other"], cost: SPEND, travel: TRAVEL } },
};
const PARTS = [["q1", "q2", "q3"], ["q4", "q5", "q6"], ["q7", "q8", "q9"], ["q10", "q11", "q12"]];
const SKIPPED = "skipped";
// One answer, checked against its options: the clean value, or "skipped" for anything else
function cleanAnswer(q, v) {
  if (q.type === "one") return q.opts.includes(v) ? v : SKIPPED;
  if (q.type === "scale") { const n = Math.round(Number(v)); return v !== null && v !== "" && Number.isFinite(n) && n >= q.min && n <= q.max && String(n) === String(v).trim() ? n : SKIPPED; }
  if (q.type === "many") { const list = Array.isArray(v) ? [...new Set(v.filter((x) => q.opts.includes(x)))] : []; return list.length && list.length <= q.max ? list : SKIPPED; }
  if (q.type === "parts") {
    if (!v || typeof v !== "object") return SKIPPED;
    const out = Object.fromEntries(Object.entries(q.parts).map(([k, opts]) => [k, opts.includes(v[k]) ? v[k] : SKIPPED]));
    return Object.values(out).every((x) => x === SKIPPED) ? SKIPPED : out;
  }
  return SKIPPED;
}
// Consent: the four required boxes must all be ticked; the synthetic box is optional. Yes/no flags only.
function consentOf(c) {
  if (!c || typeof c !== "object") return null;
  if (!["age", "gta", "phone", "agree"].every((k) => c[k] === true)) return null;
  return { age: true, gta: true, phone: true, agree: true, synthetic: c.synthetic === true, at: now() };
}

let clock = () => Date.now(); // tests move time with _test.setClock
const now = () => clock();
let deleteAccountHook = null; // set by the server (init): deletes an app account and what's stored about it
let makeProfileHook = null; // set by the server (init): makes a private study profile, its practice friends and squad
const rid = (n = 6) => crypto.randomBytes(n).toString("base64url");
const pick = (list) => list[crypto.randomInt(list.length)];

// ---------- Storage ----------

let data = null; // { assigned: n, sessions: { id: session }, erased: { id: { at, why } }, removals: [{ code, at }], accounts: [study test account ids] }
let store = null;
try { store = require("../../../events/lib/store"); } catch {}

const blank = () => ({ assigned: 0, sessions: {}, erased: {}, removals: [], accounts: [], purgedAt: null });
async function load() {
  if (data) return data;
  let fromFile = null;
  let fromStore = null;
  try { fromFile = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  try { if (store && store.configured()) fromStore = await store.get(STORE_NAME); } catch (err) { console.warn("Couldn't read the study data from Supabase:", err.message); }
  // Merge the two copies: the higher assignment count, and the newer copy of each session
  // Erased sessions stay erased: one copy's tombstone wins over the other copy's older data
  data = blank();
  for (const src of [fromFile, fromStore]) {
    if (!src) continue;
    data.assigned = Math.max(data.assigned, Number(src.assigned) || 0);
    data.purgedAt = Math.max(data.purgedAt || 0, Number(src.purgedAt) || 0) || null;
    Object.assign(data.erased, src.erased || {});
    for (const r of src.removals || []) if (!data.removals.some((x) => x.code === r.code)) data.removals.push({ code: r.code, at: r.at });
    for (const id of src.accounts || []) if (!data.accounts.includes(id)) data.accounts.push(id);
  }
  for (const src of [fromFile, fromStore]) {
    if (!src) continue;
    for (const [id, s] of Object.entries(src.sessions || {})) {
      if (data.erased[id] || (data.purgedAt && (s.createdAt || 0) <= data.purgedAt)) continue;
      if (!data.sessions[id] || (s.updatedAt || 0) > (data.sessions[id].updatedAt || 0)) data.sessions[id] = s;
    }
  }
  return data;
}

let saveTimer = null;
function save(session) {
  if (session) session.updatedAt = now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
  saveTimer.unref();
}
async function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch (err) {
    console.error("Couldn't save the study data:", err.message);
  }
  try { if (store && store.configured()) await store.put(STORE_NAME, data); } catch (err) { console.error("Couldn't save the study data to Supabase:", err.message); }
}

// ---------- Talking to the call engine like a phone does ----------
// Practice friends and the study's own requests go through rooms.handle, the same routes real phones
// use, so nothing about the call behaves differently in a study.

function fakeReq(method) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = {};
  return req;
}
async function call(method, pathname, body) {
  let out = { status: 500, data: {} };
  await R.handle(fakeReq(method), {}, new URL(pathname, "http://study"), { readBody: async () => body || {}, sendJSON: (res, status, d) => { out = { status, data: d }; } });
  return out;
}
// A live stream for a practice friend, so they show as online like any phone
function openStream(roomId, pid) {
  const req = fakeReq("GET");
  const res = { writeHead() {}, write() { return true; }, end() { req.emit("close"); } };
  R.handle(req, res, new URL(`/api/sk/rooms/${roomId}/stream?p=${encodeURIComponent(pid)}`, "http://study"), { readBody: async () => ({}), sendJSON: () => {} });
  return () => req.emit("close");
}
const roomOf = (id) => R._test.rooms.get(id);
const humans = (room) => room.people.filter((p) => !p.practice && !p.left);

// ---------- Which line book a line came from (a check that each call really used its voice) ----------
const norm = (t) => String(t || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BOOK = Object.fromEntries(Object.entries(personas.LINES).map(([id, moves]) => [id, Object.values(moves).flat().map((tpl) => {
  const parts = tpl.split(/(\{\w+\})/).map((x) => (/^\{\w+\}$/.test(x) ? ".*" : escRe(norm(x)))).filter(Boolean);
  return new RegExp(`^${parts.join("\\s*")}$`);
})]));
// Returns the persona whose line book this line comes from, or null (an AI-written line, or unclear)
function lineBookOf(text) {
  const t = norm(text);
  const hits = Object.keys(BOOK).filter((id) => BOOK[id].some((re) => re.test(t)));
  return hits.length === 1 ? hits[0] : null;
}

// ---------- Live calls and practice friends ----------
// roomId -> { sid, n (1 or 2), tid, plannerPid, bots: [pid], closers: [fn], pending: Set }
const live = new Map();
const names = new Map(); // sid -> Set of names seen on its calls (memory only; used to scrub free text)

function attach(meta) {
  live.set(meta.room, meta);
  const room = roomOf(meta.room);
  if (!room) return;
  // An observer on the room's live updates: it sees every change the phones see, and keeps the study's numbers
  const key = `study:${meta.room}`;
  room.streams.set(key, { write: () => { setImmediate(() => update(meta)); return true; }, end: () => detach(meta) });
  meta.tick = setInterval(() => update(meta), 2000);
  meta.tick.unref();
}
function detach(meta) {
  clearInterval(meta.tick);
  for (const close of meta.closers.splice(0)) close();
  const room = roomOf(meta.room);
  if (room) room.streams.delete(`study:${meta.room}`);
  live.delete(meta.room);
}

async function addBots(meta, count, answersFor = () => ({})) {
  const room = roomOf(meta.room);
  if (!room) return [];
  const taken = new Set(room.people.map((p) => p.name));
  const added = [];
  for (const name of BOT_NAMES.filter((n) => !taken.has(n)).slice(0, count)) {
    const out = await call("POST", `/api/sk/rooms/${meta.room}/join`, { name, mode: "text", answers: answersFor(added.length) });
    if (out.status !== 200) break;
    const person = room.people.find((p) => p.id === out.data.person);
    person.practice = true;
    meta.bots.push(person.id);
    meta.closers.push(openStream(meta.room, person.id));
    added.push(person.id);
  }
  return added;
}

function later(meta, key, ms, fn) {
  if (meta.pending.has(key)) return;
  meta.pending.add(key);
  setTimeout(() => {
    meta.pending.delete(key);
    Promise.resolve().then(fn).catch((err) => console.error("Practice friend:", err.message));
  }, ms).unref();
}
const act = (meta, pid, action, body) => call("POST", `/api/sk/rooms/${meta.room}/${action}`, { p: pid, ...body });

// A plausible tap: go along with what the humans picked, sometimes with one more option
function botValue(room, slot, i) {
  const theirs = humans(room).map((h) => room.answers[h.id] && room.answers[h.id][slot]).filter(Boolean).map((a) => a.value);
  const opts = P.optionsFor(slot, room).map(([v]) => v);
  if (slot === "budget") { // never tighter than the humans' budgets, so a practice friend never narrows the picks
    const tiers = ["20", "30", "50", "any"];
    const floor = Math.max(1, ...theirs.map((v) => tiers.indexOf(v)));
    return pick(tiers.slice(Math.max(floor, 2)));
  }
  if (slot === "origin") return i === 0 ? "union" : theirs[0] || "union";
  if (slot === "kind") return theirs[0] || "either";
  const base = [...new Set(theirs.flat())];
  if (!base.length) return [i === 0 ? opts[0] : pick(opts)];
  if (slot === "vibe") return i === 0 ? [base[0]] : [...new Set([base[0], pick(opts)])];
  return i === 0 ? base : [...new Set([...base, pick(opts)])];
}

function tickBots(room, meta) {
  const bots = room.people.filter((p) => p.practice && meta.bots.includes(p.id));
  if (!bots.length || room.status !== "live") return;
  const people = humans(room).filter((p) => p.mode !== "form"); // humans taking part live
  const since = (t) => now() - (t || 0);

  // The check-in vote: follow the humans' vote; with no human voter (the form practice), vote "lead"
  if (room.mode === "voting") {
    const hv = people.map((h) => room.modeVotes[h.id]).filter(Boolean);
    if (people.length && !hv.length) return;
    const side = hv.filter((v) => v === "sidelines").length;
    const value = hv.length && side > hv.length - side ? "sidelines" : "lead";
    bots.forEach((b, i) => { if (!room.modeVotes[b.id]) later(meta, `mode:${b.id}`, 500 + i * 400, () => room.mode === "voting" && act(meta, b.id, "answer", { slot: "mode", value })); });
    return;
  }

  // Picks: vote once a human has (one follows them, one picks either); a practice planner then locks
  if (room.picks && room.picks.length) {
    const hv = people.map((h) => room.votes[h.id]).filter(Boolean);
    if (!room.picksSeenAt) room.picksSeenAt = now();
    const go = hv.length || !people.length || since(room.picksSeenAt) > WAIT_FOR_HUMANS_MS;
    bots.forEach((b, i) => {
      if (room.votes[b.id] == null && go) later(meta, `vote:${b.id}`, 700 + i * 600, () => !room.locked && act(meta, b.id, "vote", { eventId: i === 0 && hv.length ? hv[0] : pick(room.picks).id }));
    });
    const planner = room.people.find((p) => p.role === "planner");
    if (planner && planner.practice && bots.every((b) => room.votes[b.id] != null)) later(meta, "lock", 2500, () => !room.locked && act(meta, planner.id, "lock", {}));
    return;
  }

  // Nothing fits and Sidekick offered to loosen one thing: if the humans haven't answered in a while, one friend says yes
  if (room.offer) {
    if (meta.offer !== room.offer) { meta.offer = room.offer; meta.offerAt = now(); }
    if (since(meta.offerAt) > 12000 && meta.offerAnswered !== meta.offerAt) { meta.offerAnswered = meta.offerAt; act(meta, bots[0].id, "line", { text: "Sure, show us", kind: "typed" }); }
  }
  const answer = (slot, ready) => bots.forEach((b, i) => {
    if (!ready || (room.answers[b.id] || {})[slot]) return;
    later(meta, `ans:${slot}:${b.id}`, 900 + i * 700, () => room.status === "live" && !room.picks && !(room.answers[b.id] || {})[slot] && act(meta, b.id, "answer", { slot, value: botValue(room, slot, i), source: "call_card" }));
  });
  const humansDid = (slot) => people.every((h) => room.answers[h.id] && room.answers[h.id][slot]);

  // Leading: answer the open question once the humans have (budget too: it's private, so they never see it)
  if (room.mode === "lead" && room.card && P.SLOTS[room.card.slot]) {
    const slot = room.card.slot;
    answer(slot, humansDid(slot) || since(room.card.at) > WAIT_FOR_HUMANS_MS);
  }
  // Sitting back: fill in the same form, a row at a time after the humans
  if (room.mode === "sidelines") {
    const slots = [...(room.nights.length > 1 ? ["night"] : []), "time", "vibe", "origin", "budget", ...(room.places && room.places.length ? ["kind"] : [])];
    for (const slot of slots) answer(slot, humansDid(slot) || since(room.modeSetAt) > 40000);
  }
}

// ---------- Keeping the numbers ----------

function update(meta) {
  const room = roomOf(meta.room);
  const s = data && data.sessions[meta.sid];
  if (!s) return;
  if (!room) return detach(meta);
  const seen = names.get(meta.sid) || new Set();
  for (const p of room.people) seen.add(p.name);
  seen.add(room.crew);
  names.set(meta.sid, seen);

  const c = s.calls[meta.n];
  if (!c || c.id !== meta.callId) return detach(meta);
  if (meta.autoBots && !meta.adding && room.streams.has(meta.plannerPid)) {
    const answers = meta.autoBots;
    meta.autoBots = null;
    meta.adding = true;
    addBots(meta, 2, answers).then(() => { meta.adding = false; });
  }
  let changed = false;
  const set = (k, v) => { if (c[k] !== v) { c[k] = v; changed = true; } };
  const ppl = humans(room);
  set("humans", ppl.length);
  set("practiceFriends", room.people.filter((p) => p.practice).length);
  for (const m of ["voice", "text", "form"]) set(`${m}Joiners`, ppl.filter((p) => p.mode === m).length);
  if (!c.checkinAt && room.mode === "voting") set("checkinAt", now());
  if (!c.checkinMode && ["lead", "sidelines"].includes(room.mode) && room.modeHow !== "switch") {
    set("checkinMode", room.mode);
    set("checkinHow", room.modeHow);
    const hv = ppl.map((h) => room.modeVotes[h.id]).filter(Boolean);
    set("humanVote", hv.length ? hv.join("+") : "none");
  }
  if (room.mode === "lead" || room.mode === "sidelines") set("modeFinal", room.mode);
  if (room.modeHow === "switch") set("switched", true);
  // Which line book Sidekick's lines came from (counts only; the lines themselves aren't kept)
  for (const line of room.said) {
    if (line.system || meta.lines.has(line.id)) continue;
    meta.lines.add(line.id);
    const from = lineBookOf(line.text);
    c.sidekickLines = (c.sidekickLines || 0) + 1;
    if (from === c.persona) c.linesAssigned = (c.linesAssigned || 0) + 1;
    else if (from) c.linesOther = (c.linesOther || 0) + 1;
    changed = true;
  }
  if (room.picks && room.picks.length && !c.picksAt) {
    set("picksAt", now());
    set("questions", room.asked.length);
    set("picksShown", true);
    set("pickKinds", room.picks.map((p) => p.kind || "event").join("+")); // event+place, event+event...
    const f = P.facts(room);
    c.seed = { night: f.night.known && f.night.value.length ? f.night.value[0] : room.nights[0], time: f.time.known ? f.time.value : null };
  }
  if (room.locked && !c.lockedAt) {
    set("lockedAt", now());
    set("accepted", true);
    set("lockedPick", Math.max(0, room.picks.findIndex((p) => p.id === room.locked.id)) + 1);
    set("lockedKind", room.locked.kind || "event");
    set("votes", Object.keys(room.votes).filter((pid) => ppl.some((h) => h.id === pid)).length);
  }
  tickBots(room, meta);
  if (room.status === "ended") {
    if (!c.endedAt) { set("endedAt", now()); if (!c.lockedAt) set("accepted", false); }
    detach(meta);
  }
  if (changed) save(s);
}

// ---------- Sessions ----------

function newSession() {
  const order = ORDERS[data.assigned % ORDERS.length]; // blocks of two: AB, BA, AB, BA...
  data.assigned++;
  const s = { id: rid(6), index: data.assigned, order, createdAt: now(), updatedAt: now(), creator: null, testers: {}, calls: {}, practice: false };
  data.sessions[s.id] = s;
  return s;
}
function addTester(s, consent) {
  const tid = rid(8);
  s.testers[tid] = { n: Object.keys(s.testers).length + 1, joinedAt: now(), consent, steps: {}, surveys: {}, final: null, questionnaire: null, tasks: {} };
  if (!s.creator) s.creator = tid;
  return tid;
}

function callStatus(s, n) {
  const c = s.calls[n];
  if (!c) return "none";
  const meta = [...live.values()].find((m) => m.sid === s.id && m.n === n && m.callId === c.id);
  const room = meta && roomOf(meta.room);
  if (room && room.status !== "ended") return room.locked ? "locked" : room.picks && room.picks.length ? "picks" : "live";
  return c.lockedAt ? "locked" : c.picksAt ? "picks" : "ended";
}
const callDone = (s, n) => ["picks", "locked", "ended"].includes(callStatus(s, n)) && Boolean(s.calls[n]);

// ---------- The private study profile and the five tasks ----------

// Question 2's kinds of nights, as the app's taste vibes (the profile's starting taste)
const Q2_VIBES = { "live-music": "Live music", comedy: "Comedy", markets: "Markets", "board-games": "Games & social", dance: "Dance", "art-shows": "Art & making", "food-pop-ups": "Food & drink", theatre: "Art & making", jazz: "Jazz", zines: "Zines & print" };
const DEFAULT_VIBES = ["Live music", "Food & drink", "Comedy"];
function vibesFrom(q2) {
  const v = [...new Set((Array.isArray(q2) ? q2 : []).map((k) => Q2_VIBES[k]).filter(Boolean))];
  return v.length >= 2 ? v : [...new Set([...v, ...DEFAULT_VIBES])].slice(0, Math.max(3, v.length));
}
// Makes the tester's private study profile once (after the questionnaire). Returns its id, or null if it can't.
async function ensureProfile(s, t) {
  if (t.account && t.account.kind === "study") return t.account.id;
  if (!makeProfileHook) return null;
  const p = await makeProfileHook({ vibes: vibesFrom(t.questionnaire && t.questionnaire.q2), names: BOT_NAMES });
  if (!p || !p.id) return null;
  t.account = { kind: "study", id: p.id, friends: p.friends || [], made: true, at: now() };
  for (const id of [p.id, ...(p.friends || [])]) if (!data.accounts.includes(id)) data.accounts.push(id);
  save(s);
  return p.id;
}

// The app's events (lib/db, the module the server loads): for task 2's questions
function eventById(id) {
  try { return require("../db").data.events.find((e) => String(e.id) === String(id)) || null; } catch { return null; }
}
function profileUser(t) {
  if (!t.account || t.account.kind !== "study") return null;
  try { return require("../db").data.users[t.account.id] || null; } catch { return null; }
}
const TZ = "America/Toronto";
const timeLabel = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
const COST = [["free", "Free"], ["under-30", "Under $30"], ["30-60", "$30–60"], ["60+", "More than $60"], ["not-listed", "Not listed"], ["not-sure", "Not sure"]];
const costOf = (e) => (e.price == null || !Number.isFinite(Number(e.price)) ? "not-listed" : Number(e.price) === 0 ? "free" : Number(e.price) < 30 ? "under-30" : Number(e.price) <= 60 ? "30-60" : "60+");
// Task 2's event: the one saved in task 1, else the profile's latest save, else the soonest upcoming event
function task2Event(t) {
  const rec = t.tasks || {};
  const ids = [rec[2] && rec[2].eventId, rec[1] && rec[1].eventId];
  const u = profileUser(t);
  if (u && Array.isArray(u.saved)) ids.push(...[...u.saved].reverse());
  for (const id of ids) { const e = id != null && eventById(id); if (e) return e; }
  try {
    const soon = require("../db").data.events.filter((e) => Date.parse(e.startsAt) > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return soon[0] || null;
  } catch { return null; }
}
// The two questions, built from that event: its real start time and two plausible ones, and the price buckets
function quizFor(t) {
  const e = task2Event(t);
  if (!e) return null;
  const rec = (t.tasks[2] = t.tasks[2] || {});
  if (String(rec.eventId) !== String(e.id) || !Array.isArray(rec.offsets)) {
    rec.eventId = e.id;
    rec.offsets = pick([[-2, -1], [-1, 1], [1, 2]]);
  }
  const at = Date.parse(e.startsAt);
  const times = [...rec.offsets, 0].sort((a, b) => a - b).map((h) => timeLabel(at + h * 3600000));
  return { event: { id: e.id, title: e.title }, time: [...times, "Not sure"], cost: COST.map(([, l]) => l), answer: { time: timeLabel(at), cost: costOf(e) } };
}
const secsSince = (a) => (a ? Math.max(0, Math.round((now() - a) / 1000)) : null);

// What a tester sees: progress and "Voice 1" / "Voice 2". Never the arm or the persona.
function testerView(s, tid) {
  const t = s.testers[tid];
  t.tasks = t.tasks || {};
  const calls = {};
  for (const n of [1, 2]) {
    const c = s.calls[n];
    const meta = c && [...live.values()].find((m) => m.sid === s.id && m.n === n && m.callId === c.id);
    calls[n] = { label: `Voice ${n}`, status: callStatus(s, n), room: meta ? meta.room : null, mine: Boolean(meta && meta.tid === tid), reachedPicks: Boolean(c && c.picksAt) };
  }
  const tasks = {};
  for (const { n, title } of TASKS) {
    const r = t.tasks[n] || {};
    const ended = OUTCOMES.includes(r.outcome);
    tasks[n] = {
      title,
      outcome: r.outcome || null,
      started: Boolean(r.startedAt),
      secs: r.secs == null ? null : r.secs,
      needsQuiz: n === 2 && ended && r.outcome !== "skipped" && !r.quiz,
      needsEase: ended && r.outcome !== "skipped" && r.ease == null,
      done: ended && (r.outcome === "skipped" || r.ease != null),
    };
  }
  const e2 = task2Event(t);
  if (e2) tasks[2].event = e2.title;
  const steps = { consent: true };
  for (const { n } of TASKS) steps[`task${n}`] = tasks[n].done;
  Object.assign(steps, { call1: Boolean(t.surveys[1]), call2: Boolean(t.surveys[2]), survey: Boolean(t.final) });
  const q = t.questionnaire || {};
  const profile = t.account && t.account.kind === "study" ? t.account.id : null;
  return { sid: s.id, you: { n: t.n, creator: s.creator === tid, account: t.account ? t.account.kind : null, profile, questionnaire: { parts: q.parts || 0, done: Boolean(q.doneAt) }, steps, tasks, surveys: { 1: Boolean(t.surveys[1]), 2: Boolean(t.surveys[2]) }, final: Boolean(t.final) }, calls, practice: s.practice, testers: Object.keys(s.testers).length, steps: STEPS };
}

// ---------- Erasing: End and erase, abandoned sessions, removal requests, the deletion date ----------

const finished = (s) => Object.values(s.testers).some((t) => t.final);
const pastDeleteDate = () => now() > deleteAfter();
// The study test accounts made in a session: each private study profile and its practice friends (and, in sessions
// from before the profile, an account a tester made in the study). only "study": just the private profiles.
const madeAccounts = (s, only) => Object.values(s.testers).filter((t) => t.account && t.account.made && (only ? t.account.kind === only : true)).flatMap((t) => [t.account.id, ...(t.account.friends || [])]);

async function deleteAccount(id) {
  try {
    if (deleteAccountHook) await deleteAccountHook(id);
  } catch (err) {
    console.error("Couldn't delete a study test account:", err.message);
    return false;
  }
  return true;
}
// End the session's live calls (their practice friends leave with them, and each transcript is deleted)
function endCalls(sid) {
  for (const meta of [...live.values()].filter((m) => m.sid === sid)) {
    const room = roomOf(meta.room);
    try { if (room && room.status !== "ended") R._test.endRoom(room, "study-erased"); } catch {}
    detach(meta);
  }
  names.delete(sid);
}
// Delete one session and everything in it. withAccounts: also the study test accounts made in it (true: all
// of them; "study": the private study profiles and their practice friends only).
async function erase(s, why, { withAccounts = true } = {}) {
  endCalls(s.id);
  if (withAccounts) {
    for (const id of madeAccounts(s, withAccounts === true ? null : withAccounts)) {
      if (await deleteAccount(id)) data.accounts = data.accounts.filter((x) => x !== id);
    }
  }
  delete data.sessions[s.id];
  data.erased[s.id] = { at: now(), why };
  await flush();
}
function newCode() {
  const taken = new Set(data.removals.map((r) => r.code));
  for (let len = 4; len <= 6; len++) {
    for (let i = 0; i < 40; i++) {
      const code = Array.from({ length: len }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
      if (!taken.has(code)) return code;
    }
  }
  throw new Error("Couldn't make a reference code. Try again.");
}
// After the deletion date: all study data, every study test account and any synthetic data
async function purgeAll() {
  const ids = new Set(data.accounts);
  for (const s of Object.values(data.sessions)) { endCalls(s.id); for (const id of madeAccounts(s)) ids.add(id); }
  for (const id of ids) await deleteAccount(id);
  try { fs.rmSync(SYNTH_FILE, { force: true }); } catch {}
  try { if (store && store.configured() && store.remove) await store.remove(SYNTH_STORE); else if (store && store.configured()) await store.put(SYNTH_STORE, {}); } catch {}
  const assigned = data.assigned;
  data = blank();
  data.assigned = assigned;
  data.purgedAt = now();
  await flush();
}
let sweeping = null;
// On start and hourly: the deletion date first, then abandoned sessions (and any removal not yet deleted)
function sweep() {
  if (sweeping) return sweeping;
  sweeping = (async () => {
    await load();
    if (pastDeleteDate()) {
      if (!data.purgedAt || Object.keys(data.sessions).length || data.accounts.length || data.removals.length || fs.existsSync(SYNTH_FILE)) await purgeAll();
      return { purged: true };
    }
    let erased = 0;
    for (const s of Object.values(data.sessions)) {
      if (s.excluded) { await erase(s, "removed", { withAccounts: "study" }); erased++; continue; }
      if (!finished(s) && now() - (s.updatedAt || s.createdAt || 0) > ABANDON_MS) { await erase(s, "abandoned"); erased++; }
    }
    return { purged: false, erased };
  })().finally(() => { sweeping = null; });
  return sweeping;
}
let sweepTimer = null;
function init({ deleteAccount: del, makeProfile } = {}) {
  if (del) deleteAccountHook = del;
  if (makeProfile) makeProfileHook = makeProfile;
  clearInterval(sweepTimer);
  sweepTimer = setInterval(() => sweep().catch((err) => console.error("Study sweep:", err.message)), SWEEP_MS);
  sweepTimer.unref();
  return sweep().catch((err) => console.error("Study sweep:", err.message));
}

// Free text: no names from the calls, no emails, phone numbers or amounts
function scrub(text, sid) {
  let t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]").replace(/\$\s?\d+|\b\d+\s?(bucks|dollars)\b/gi, "[amount]");
  const known = [...(names.get(sid) || [])].flatMap((n) => [n, n.replace(/\s*\(practice\)$/, "")]).map((n) => n.trim()).filter((n) => n.length >= 2);
  for (const n of known.sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`\\b${escRe(n)}\\b`, "gi"), "[name]");
  return t;
}

// ---------- Export and results ----------

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const secs = (a, b) => (a && b ? Math.round((b - a) / 1000) : null);

// Every export, summary and aggregate leaves out removed sessions, even before they're deleted
const included = () => Object.values(data.sessions).filter((s) => !s.excluded).sort((a, b) => a.index - b.index);
function callRows() {
  const rows = [];
  for (const s of included()) {
    for (const n of [1, 2]) {
      const c = s.calls[n];
      if (!c) continue;
      const surveys = Object.values(s.testers).map((t) => t.surveys[n]).filter(Boolean);
      const finals = Object.values(s.testers).map((t) => t.final).filter(Boolean);
      rows.push({
        session: s.id,
        session_index: s.index,
        order: s.order,
        call: n,
        tester_label: `Voice ${n}`,
        arm: c.arm,
        persona: c.persona,
        first_exposure: n === 1,
        humans: c.humans || 0,
        practice_friends: c.practiceFriends || 0,
        voice_joiners: c.voiceJoiners || 0,
        text_joiners: c.textJoiners || 0,
        form_joiners: c.formJoiners || 0,
        short_call: Boolean(c.short),
        checkin_mode: c.checkinMode || null,
        checkin_how: c.checkinHow || null,
        human_vote: c.humanVote || null,
        mode_final: c.modeFinal || null,
        switched_mode: Boolean(c.switched),
        questions_asked: c.picksAt ? c.questions : null,
        secs_to_picks: secs(c.checkinAt || c.startedAt, c.picksAt),
        picks_shown: Boolean(c.picksAt),
        picks_accepted: Boolean(c.accepted),
        locked_pick: c.lockedPick || null,
        pick_kinds: c.pickKinds || null,
        locked_kind: c.lockedKind || null,
        sidekick_lines: c.sidekickLines || 0,
        lines_from_assigned_book: c.linesAssigned || 0,
        lines_from_other_book: c.linesOther || 0,
        surveys: surveys.length,
        natural: mean(surveys.map((x) => x.natural)),
        decide: mean(surveys.map((x) => x.decide)),
        trust: mean(surveys.map((x) => x.trust)),
        again: mean(surveys.map((x) => x.again)),
        keep_this_voice: finals.filter((f) => f.keep === n).length,
        keep_other_voice: finals.filter((f) => f.keep !== n).length,
        started: new Date(c.startedAt).toISOString(),
      });
    }
  }
  return rows;
}
function preferenceRows() {
  const rows = [];
  for (const s of included()) {
    for (const t of Object.values(s.testers)) {
      if (!t.final) continue;
      rows.push({ session: s.id, session_index: s.index, order: s.order, tester: t.n, ...accountCols(t), keep_voice: t.final.keep, keep_arm: t.final.keepArm, keep_persona: ARMS[t.final.keepArm], kept_first_heard: t.final.keep === 1, seq: t.final.seq, why: t.final.why || "", use_most: t.final.use || null, change: t.final.change || "" });
    }
  }
  return rows;
}
// Which account a tester used: the kind ("study" for the private study profile), and its internal id. Never a name or an email.
const accountCols = (t) => ({ account_kind: t.account ? t.account.kind : "none", account_id: t.account && (t.account.kind === "own" || t.account.kind === "study") ? t.account.id : null });
const yn = (v) => (v ? "yes" : "no");
const consentCols = (t) => {
  const c = t.consent && typeof t.consent === "object" ? t.consent : {};
  return { consent_age: yn(c.age), consent_gta: yn(c.gta), consent_phone: yn(c.phone), consent_agree: yn(c.agree), consent_synthetic: yn(c.synthetic), consent_at: c.at ? new Date(c.at).toISOString() : null };
};
function testerRows() {
  const rows = [];
  for (const s of included()) {
    for (const t of Object.values(s.testers).sort((a, b) => a.n - b.n)) {
      rows.push({ session: s.id, session_index: s.index, order: s.order, tester: t.n, ...accountCols(t), ...consentCols(t), steps_done: Object.keys(t.steps || {}).length, surveys: [1, 2].filter((n) => t.surveys && t.surveys[n]).length, finished: Boolean(t.final), joined: new Date(t.joinedAt).toISOString() });
    }
  }
  return rows;
}
// The questionnaire: one row per tester, by the session's random id and the tester's number only
const qCell = (v) => (v == null ? null : Array.isArray(v) ? v.join("+") : v);
function questionnaireRows() {
  const rows = [];
  for (const s of included()) {
    for (const t of Object.values(s.testers).sort((a, b) => a.n - b.n)) {
      const q = t.questionnaire || {};
      const last = q.q12 && typeof q.q12 === "object" ? q.q12 : {};
      const row = { session: s.id, session_index: s.index, tester: t.n, consent_synthetic: yn(t.consent && t.consent.synthetic), questionnaire_done: Boolean(q.doneAt), finished: Boolean(t.final) };
      for (const k of Object.keys(QUESTIONS)) if (k !== "q12") row[k] = qCell(q[k]);
      for (const k of ["kind", "cost", "travel"]) row[`q12_${k}`] = q.q12 === SKIPPED ? SKIPPED : qCell(last[k]);
      rows.push(row);
    }
  }
  return rows;
}
// The tasks: one row per tester per task, by the session's random id and the tester's number only
function taskRows() {
  const rows = [];
  for (const s of included()) {
    for (const t of Object.values(s.testers).sort((a, b) => a.n - b.n)) {
      if (!(t.questionnaire && t.questionnaire.doneAt)) continue;
      for (const { n, id } of TASKS) {
        const r = (t.tasks || {})[n] || {};
        const qz = n === 2 && r.quiz ? r.quiz : null;
        rows.push({ session: s.id, session_index: s.index, tester: t.n, task: n, task_id: id, outcome: OUTCOMES.includes(r.outcome) ? r.outcome : null, completed: r.outcome === "auto" || r.outcome === "self", secs: r.secs == null ? null : r.secs, ease: r.ease || null, comment: r.comment || "",
          time_answer: qz ? qz.time : null, time_correct: qz ? qz.timeOk : null, cost_answer: qz ? qz.cost : null, cost_correct: qz ? qz.costOk : null });
      }
    }
  }
  return rows;
}
const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10; };
const rate = (k, n) => (n ? Math.round((k / n) * 100) / 100 : null);
// Group totals per task: completion rate, median time, mean ease, and task 2's correctness
function taskSummary(rows) {
  return TASKS.map(({ n, id, title }) => {
    const r = rows.filter((x) => x.task === n);
    const tried = r.filter((x) => x.outcome);
    const done = tried.filter((x) => x.completed);
    const count = (o) => tried.filter((x) => x.outcome === o).length;
    const out = { task: n, task_id: id, title, testers: r.length, attempted: tried.length, auto: count("auto"), self: count("self"), stuck: count("stuck"), skipped: count("skipped"), completion_rate: rate(done.length, tried.length), median_secs: median(done.map((x) => x.secs).filter((x) => x != null)), mean_ease: mean(tried.map((x) => x.ease).filter((x) => x != null)) };
    if (n === 2) {
      const answered = r.filter((x) => x.time_answer);
      Object.assign(out, { answered: answered.length, time_correct: answered.filter((x) => x.time_correct).length, cost_correct: answered.filter((x) => x.cost_correct).length, time_correct_rate: rate(answered.filter((x) => x.time_correct).length, answered.length), cost_correct_rate: rate(answered.filter((x) => x.cost_correct).length, answered.length) });
    }
    return out;
  });
}
// The base for synthetic test users: counts per answer, over testers who ticked the synthetic box, finished
// and weren't removed. Never a per-person row, never two answers joined. Nothing under AGGREGATE_MIN testers.
function aggregate() {
  const pool = included().flatMap((s) => Object.values(s.testers)).filter((t) => t.final && t.consent && t.consent.synthetic === true && t.questionnaire && t.questionnaire.doneAt);
  if (pool.length < AGGREGATE_MIN) return null;
  const count = (opts, vals) => {
    const out = Object.fromEntries([...opts.map((o) => [String(o), 0]), [SKIPPED, 0]]);
    for (const v of vals) {
      if (v == null || v === SKIPPED) out[SKIPPED]++;
      else for (const x of Array.isArray(v) ? v : [v]) if (String(x) in out) out[String(x)]++;
    }
    return out;
  };
  const questions = {};
  for (const [k, q] of Object.entries(QUESTIONS)) {
    const vals = pool.map((t) => t.questionnaire[k]);
    if (q.type === "parts") {
      questions[k] = Object.fromEntries(Object.entries(q.parts).map(([part, opts]) => [part, count(opts, vals.map((v) => (v && typeof v === "object" ? v[part] : SKIPPED)))]));
    } else {
      const opts = q.type === "scale" ? Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i) : q.opts;
      questions[k] = { type: q.type === "many" ? "pick_many" : q.type === "scale" ? "scale" : "pick_one", counts: count(opts, vals) };
    }
  }
  // The tasks, as group totals over the same testers (no per-person rows)
  const inPool = new Set(pool);
  const tRows = taskRows().filter((r) => { const s = data.sessions[r.session]; return s && Object.values(s.testers).some((t) => inPool.has(t) && t.n === r.tester); });
  const tasks = taskSummary(tRows).map(({ testers, ...x }) => ({ ...x, ease: count([1, 2, 3, 4, 5, 6, 7], tRows.filter((r) => r.task === x.task && r.outcome).map((r) => r.ease)) }));
  const useMost = count(USE_MOST, pool.map((t) => t.final.use));
  return { testers: pool.length, kind: "distributions", note: "Counts per answer only. No per-person rows.", questions, tasks, use_most: useMost };
}
function csv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
}

const torontoDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

// Exact two-sided binomial test against 50/50
function binomial(k, n) {
  if (!n) return null;
  const lf = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  const pmf = (i) => Math.exp(lf(n) - lf(i) - lf(n - i) - n * Math.log(2));
  const pk = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) if (pmf(i) <= pk * (1 + 1e-9)) p += pmf(i);
  return Math.min(1, Math.round(p * 10000) / 10000);
}
function summary() {
  const calls = callRows();
  const prefs = preferenceRows();
  const byArm = (rows) => Object.fromEntries(["A", "B"].map((arm) => {
    const r = rows.filter((x) => x.arm === arm);
    const picked = r.filter((x) => x.picks_shown);
    return [arm, { persona: ARMS[arm], calls: r.length, reached_picks: picked.length, mean_secs_to_picks: mean(picked.map((x) => x.secs_to_picks).filter((x) => x != null)), mean_questions: mean(picked.map((x) => x.questions_asked).filter((x) => x != null)), accepted_rate: r.length ? Math.round((r.filter((x) => x.picks_accepted).length / r.length) * 100) / 100 : null, lead_rate: r.length ? Math.round((r.filter((x) => x.checkin_mode === "lead").length / r.length) * 100) / 100 : null, natural: mean(r.map((x) => x.natural).filter((x) => x != null)), decide: mean(r.map((x) => x.decide).filter((x) => x != null)), trust: mean(r.map((x) => x.trust).filter((x) => x != null)), again: mean(r.map((x) => x.again).filter((x) => x != null)) }];
  }));
  const keepA = prefs.filter((p) => p.keep_arm === "A").length;
  const keepFirst = prefs.filter((p) => p.kept_first_heard).length;
  const sessions = included();
  return {
    removals: data.removals.map((r) => ({ code: r.code, date: torontoDay(r.at) })),
    tasks: taskSummary(taskRows()),
    use_most: Object.fromEntries(USE_MOST.map((k) => [k, prefs.filter((p) => p.use_most === k).length])),
    sessions: sessions.length,
    assigned: { AB: sessions.filter((s) => s.order === "AB").length, BA: sessions.filter((s) => s.order === "BA").length },
    first_call: byArm(calls.filter((x) => x.call === 1)),
    second_call: byArm(calls.filter((x) => x.call === 2)),
    preference: { testers: prefs.length, keep_A: keepA, keep_B: prefs.length - keepA, p_value: binomial(keepA, prefs.length), mean_seq: mean(prefs.map((p) => p.seq)) },
    order_check: { kept_first_heard: keepFirst, kept_second_heard: prefs.length - keepFirst, p_value: binomial(keepFirst, prefs.length), keep_A_when_AB: prefs.filter((p) => p.order === "AB" && p.keep_arm === "A").length, keep_A_when_BA: prefs.filter((p) => p.order === "BA" && p.keep_arm === "A").length, testers_AB: prefs.filter((p) => p.order === "AB").length, testers_BA: prefs.filter((p) => p.order === "BA").length },
  };
}

// ---------- HTTP: /api/sk/study/... ----------

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

async function handle(req, res, url, { readBody, sendJSON }) {
  await load();
  const parts = url.pathname.split("/").filter(Boolean); // api, sk, study, :sid | export | summary | aggregate, action
  try {
    // After the deletion date nothing is kept or collected: the sweep deletes it all, and every route says so
    if (pastDeleteDate()) {
      await sweep();
      return sendJSON(res, 410, { error: "The study has ended, and all its data has been deleted.", ended: true });
    }
    if (parts[3] === "export" || parts[3] === "summary" || parts[3] === "aggregate") {
      const key = process.env.SIDEKICK_STUDY_KEY;
      const given = url.searchParams.get("key") || req.headers["x-study-key"] || "";
      if (!key) return sendJSON(res, 403, { error: "Results are locked. Set SIDEKICK_STUDY_KEY on the server to open them." });
      const a = Buffer.from(String(given));
      const b = Buffer.from(key);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return sendJSON(res, 401, { error: "Wrong or missing study key." });
      if (parts[3] === "summary") return sendJSON(res, 200, summary());
      if (parts[3] === "aggregate") {
        const agg = aggregate();
        if (!agg) return sendJSON(res, 409, { error: `Not enough testers yet. The aggregate needs at least ${AGGREGATE_MIN} who agreed to synthetic data and finished.` });
        return sendJSON(res, 200, agg);
      }
      const tables = { calls: callRows, preferences: preferenceRows, testers: testerRows, questionnaire: questionnaireRows, tasks: taskRows };
      const which = Object.prototype.hasOwnProperty.call(tables, url.searchParams.get("table")) ? url.searchParams.get("table") : "calls";
      const table = tables[which]();
      if (url.searchParams.get("format") === "json") return sendJSON(res, 200, { calls: callRows(), preferences: preferenceRows(), testers: testerRows(), questionnaire: questionnaireRows(), tasks: taskRows() });
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="sidekick-study-${which}.csv"` });
      return res.end(csv(table));
    }
    if (req.method !== "GET" && req.method !== "POST") return sendJSON(res, 405, { error: "Not allowed." });
    const body = req.method === "POST" ? await readBody(req) : {};

    const NEED_CONSENT = "Please tick the four required boxes to start. The optional one is up to you.";
    if (req.method === "POST" && parts[3] === "sessions" && !parts[4]) {
      const consent = consentOf(body.consent);
      if (!consent) return sendJSON(res, 400, { error: NEED_CONSENT });
      const s = newSession();
      const tid = addTester(s, consent);
      save(s);
      return sendJSON(res, 200, { sid: s.id, tid, view: testerView(s, tid) });
    }
    const s = data.sessions[parts[3]];
    if (!s) return sendJSON(res, 404, { error: "This study link isn't valid anymore. Start a new one.", gone: true });
    const action = parts[4] || "";
    if (req.method === "POST" && action === "join") {
      const consent = consentOf(body.consent);
      if (!consent) return sendJSON(res, 400, { error: NEED_CONSENT });
      const tid = addTester(s, consent);
      save(s);
      return sendJSON(res, 200, { sid: s.id, tid, view: testerView(s, tid) });
    }
    const tid = req.method === "GET" ? url.searchParams.get("t") : body.t;
    if (!tid || !s.testers[tid]) return sendJSON(res, 403, { error: "Open the study link and agree to take part first.", join: true });
    const t = s.testers[tid];
    if (req.method === "GET" && !action) return sendJSON(res, 200, testerView(s, tid));
    // Task 2's two questions, built from the event saved in task 1 (the answers stay on the server)
    if (req.method === "GET" && action === "quiz") {
      t.tasks = t.tasks || {};
      const qz = quizFor(t);
      if (!qz) return sendJSON(res, 404, { error: "There's no event to ask about yet." });
      save(s);
      return sendJSON(res, 200, { event: qz.event, time: qz.time, cost: qz.cost });
    }
    if (req.method !== "POST") return sendJSON(res, 404, { error: "Not found" });

    // The questionnaire, a part at a time (3 questions each). Anything not answered is recorded as skipped.
    if (action === "questionnaire") {
      const part = int(body.part, 1, PARTS.length);
      if (!part) return sendJSON(res, 400, { error: "Unknown part." });
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      const q = t.questionnaire || (t.questionnaire = { parts: 0 });
      for (const k of PARTS[part - 1]) q[k] = cleanAnswer(QUESTIONS[k], answers[k]);
      q.parts = Math.max(q.parts || 0, part);
      q.at = now();
      if (q.parts === PARTS.length && !q.doneAt) q.doneAt = now();
      save(s);
      // The questionnaire is done: the private study profile is made straight away
      if (q.doneAt) await ensureProfile(s, t).catch((err) => console.error("Couldn't make a study profile:", err.message));
      return sendJSON(res, 200, testerView(s, tid));
    }

    // The private study profile (made after the questionnaire; this makes it if that didn't work)
    if (action === "profile") {
      if (!(t.questionnaire && t.questionnaire.doneAt)) return sendJSON(res, 409, { error: "Answer the questions first." });
      const id = await ensureProfile(s, t);
      if (!id) return sendJSON(res, 503, { error: "Couldn't set up your study profile. Try again in a moment." });
      return sendJSON(res, 200, testerView(s, tid));
    }

    // The five tasks. start: the clock starts. outcome: auto | self | stuck | skipped (once; seconds from Start).
    if (action === "task") {
      const n = int(body.n, 1, TASKS.length);
      if (!n) return sendJSON(res, 400, { error: "Unknown task." });
      t.tasks = t.tasks || {};
      const r = (t.tasks[n] = t.tasks[n] || {});
      if (body.start === true) {
        if (!OUTCOMES.includes(r.outcome) || r.outcome === "skipped") r.startedAt = now();
      } else {
        const outcome = OUTCOMES.includes(body.outcome) ? body.outcome : null;
        if (!outcome) return sendJSON(res, 400, { error: "Unknown outcome." });
        if (!OUTCOMES.includes(r.outcome) || (r.outcome === "skipped" && outcome !== "skipped")) {
          r.outcome = outcome;
          r.endedAt = now();
          r.secs = outcome === "skipped" ? null : secsSince(r.startedAt);
          if (n === 1 && body.eventId != null && eventById(body.eventId)) r.eventId = Number(body.eventId) || body.eventId;
        }
      }
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
    }
    // After a task: how easy it was (1-7) and an optional comment
    if (action === "taskRate") {
      const n = int(body.n, 1, TASKS.length);
      const ease = int(body.ease, 1, 7);
      const r = n && t.tasks && t.tasks[n];
      if (!r || !OUTCOMES.includes(r.outcome)) return sendJSON(res, 409, { error: "Do the task first." });
      if (!ease) return sendJSON(res, 400, { error: "Pick a number from 1 to 7." });
      r.ease = ease;
      r.comment = scrub(body.comment, s.id);
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
    }
    // Task 2's answers: whether each matched the event. Answering both is what counts as done.
    if (action === "quiz") {
      t.tasks = t.tasks || {};
      const r = t.tasks[2] || {};
      if (!OUTCOMES.includes(r.outcome) || r.outcome === "skipped") return sendJSON(res, 409, { error: "Do task 2 first." });
      const qz = quizFor(t);
      if (!qz) return sendJSON(res, 404, { error: "There's no event to ask about." });
      if (!qz.time.includes(body.time) || !qz.cost.includes(body.cost)) return sendJSON(res, 400, { error: "Answer both questions." });
      const costKey = COST.find(([, l]) => l === body.cost)[0];
      const timeAns = body.time === "Not sure" ? "not-sure" : body.time === qz.answer.time ? "correct" : "wrong";
      t.tasks[2].quiz = { time: timeAns, cost: costKey, timeOk: timeAns === "correct", costOk: costKey === qz.answer.cost, at: now() };
      if (t.tasks[2].outcome === "self") t.tasks[2].outcome = "auto"; // both answered: the task is done
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
    }

    // End and erase: everything from this session, now
    if (action === "end") {
      if (finished(s)) return sendJSON(res, 409, { error: "This session is finished. To take your answers out, use Request removal." });
      await erase(s, "ended");
      return sendJSON(res, 200, { erased: true });
    }

    // Request removal, after finishing: excluded from everything at once, then deleted. The code is kept.
    if (action === "remove") {
      if (!t.final) return sendJSON(res, 409, { error: "Finish the study first, or end the session to erase it." });
      const code = newCode();
      s.excluded = true;
      s.removal = { code, at: now() };
      data.removals.push({ code, at: s.removal.at });
      await flush();
      await erase(s, "removed", { withAccounts: "study" });
      data.erased[s.id].code = code;
      await flush();
      return sendJSON(res, 200, { code });
    }

    if (action === "call") {
      const n = int(body.n, 1, 2);
      if (!n) return sendJSON(res, 400, { error: "Unknown call." });
      if (n === 2 && !callDone(s, 1)) return sendJSON(res, 409, { error: "Finish the Voice 1 call first." });
      const c = s.calls[n];
      const meta = c && [...live.values()].find((m) => m.sid === s.id && m.n === n && m.callId === c.id);
      if (meta && roomOf(meta.room) && roomOf(meta.room).status !== "ended") {
        // Already running: the planner rejoins, anyone else joins as a friend from the call link
        return sendJSON(res, 200, meta.tid === tid ? { room: meta.room, person: meta.plannerPid, n } : { room: meta.room, join: true, n });
      }
      if (c && c.picksAt) return sendJSON(res, 409, { error: `The Voice ${n} call is done. Answer its questions on the checklist.` });
      const persona = ARMS[s.order[n - 1]];
      const name = String(body.name || "").trim().slice(0, 24);
      if (!name) return sendJSON(res, 400, { error: "Add your name so your crew knows who's planning." });
      let nights = Array.isArray(body.nights) ? body.nights : [];
      const short = n === 2;
      if (short) {
        // Call 2 is short: one night (Call 1's, if it's still ahead), so only a question or two is left
        const today = P.localDay(new Date().toISOString());
        const seed = (s.calls[1] && s.calls[1].seed) || {};
        if (seed.night && seed.night >= today) nights = [seed.night];
        else {
          const sug = await call("GET", "/api/sk/nights");
          const withEvents = ((sug.data && sug.data.nights) || []).filter((x) => x.events > 0);
          nights = withEvents.length ? [withEvents[0].date] : [];
        }
      }
      const out = await call("POST", "/api/sk/rooms", { name, crew: body.crew || "The crew", nights, persona });
      if (out.status !== 200) return sendJSON(res, out.status, out.data);
      const room = roomOf(out.data.room);
      room.noWait = true; // the study's calls never ask "wait for everyone, or show me now?"
      s.calls[n] = { id: rid(5), n, arm: s.order[n - 1], persona: room.persona, startedAt: now(), short };
      const m = { sid: s.id, n, callId: s.calls[n].id, tid, room: out.data.room, plannerPid: out.data.person, bots: [], closers: [], pending: new Set(), lines: new Set() };
      attach(m);
      if (short && s.practice) {
        // The practice friends come back, with Call 1's time, a budget and a start already in, once the planner's phone is on
        const seed = s.calls[1].seed || {};
        m.autoBots = (i) => ({ budget: i ? "any" : "50", origin: "union", time: seed.time && seed.time.length ? seed.time : ["evening"] });
      }
      save(s);
      update(m);
      return sendJSON(res, 200, { room: out.data.room, person: out.data.person, n });
    }

    if (action === "practice") {
      const meta = live.get(String(body.room || ""));
      if (!meta || meta.sid !== s.id) return sendJSON(res, 404, { error: "Start the study call first." });
      const room = roomOf(meta.room);
      if (!room || room.status !== "live") return sendJSON(res, 400, { error: "This call has ended." });
      if (!room.people.some((p) => p.id === body.p)) return sendJSON(res, 403, { error: "Join the call first." });
      const added = await addBots(meta, 2);
      s.practice = true;
      save(s);
      update(meta);
      return sendJSON(res, 200, { ok: true, added: added.length });
    }

    if (action === "survey") {
      const n = int(body.n, 1, 2);
      const vals = Object.fromEntries(LIKERT.map((k) => [k, int(body[k], 1, 5)]));
      if (!n || LIKERT.some((k) => vals[k] == null)) return sendJSON(res, 400, { error: "Answer all four, 1 to 5." });
      if (!s.calls[n]) return sendJSON(res, 409, { error: `Do the Voice ${n} call first.` });
      t.surveys[n] = { ...vals, at: now() };
      save(s);
      // The planner is done with this call: end it, so its transcript is deleted now
      const meta = [...live.values()].find((m) => m.sid === s.id && m.n === n && m.callId === s.calls[n].id);
      if (meta && meta.tid === tid) {
        const room = roomOf(meta.room);
        if (room && room.status !== "ended") { await act(meta, meta.plannerPid, "end", {}); update(meta); }
      }
      return sendJSON(res, 200, testerView(s, tid));
    }

    if (action === "final") {
      const keep = int(body.keep, 1, 2);
      const seq = int(body.seq, 1, 7);
      if (!keep || !seq) return sendJSON(res, 400, { error: "Pick a voice and an answer from 1 to 7." });
      const keepArm = s.order[keep - 1];
      t.final = { keep, keepArm, seq, why: scrub(body.why, s.id), use: USE_MOST.includes(body.use) ? body.use : null, change: scrub(body.change, s.id), at: now() };
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
    }
    return sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }
}

module.exports = { handle, flush, init, sweep, ARMS, ORDERS, QUESTIONS, PARTS, TASKS, BOT_NAMES, _test: { lineBookOf, binomial, scrub, summary, callRows, preferenceRows, testerRows, questionnaireRows, taskRows, aggregate, load, vibesFrom, quizFor, live, consentOf, cleanAnswer, CODE_CHARS, deleteAfter, setClock: (fn) => { clock = fn || (() => Date.now()); }, data: () => data, reset: () => { data = null; } } };
