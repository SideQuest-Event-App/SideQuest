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
const STEPS = ["consent", "discover", "plan", "share", "call1", "form", "call2", "survey"];
const MANUAL_STEPS = ["discover", "plan", "share", "form"];
const BOT_NAMES = ["Robin (practice)", "Jules (practice)"];
const FORM_PLANNER = "Sam (practice)";
const WAIT_FOR_HUMANS_MS = 25000; // practice friends answer anyway if the humans haven't after this long

const now = () => Date.now();
const rid = (n = 6) => crypto.randomBytes(n).toString("base64url");
const pick = (list) => list[crypto.randomInt(list.length)];

// ---------- Storage ----------

let data = null; // { assigned: n, sessions: { id: session } }
let store = null;
try { store = require("../../../sketch-1/lib/store"); } catch {}

async function load() {
  if (data) return data;
  let fromFile = null;
  let fromStore = null;
  try { fromFile = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  try { if (store && store.configured()) fromStore = await store.get(STORE_NAME); } catch (err) { console.warn("Couldn't read the study data from Supabase:", err.message); }
  // Merge the two copies: the higher assignment count, and the newer copy of each session
  data = { assigned: 0, sessions: {} };
  for (const src of [fromFile, fromStore]) {
    if (!src) continue;
    data.assigned = Math.max(data.assigned, Number(src.assigned) || 0);
    for (const [id, s] of Object.entries(src.sessions || {})) if (!data.sessions[id] || (s.updatedAt || 0) > (data.sessions[id].updatedAt || 0)) data.sessions[id] = s;
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
// roomId -> { sid, n (1, 2 or "form"), tid, plannerPid, bots: [pid], closers: [fn], pending: Set }
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

  if (meta.n === "form") {
    const t = s.testers[meta.tid];
    if (t && !t.steps.form && humans(room).some((p) => p.mode === "form")) { t.steps.form = now(); s.formTried = true; save(s); }
    if (humans(room).length && meta.bots.length < 2 && !meta.adding) { meta.adding = true; addBots(meta, 1).then(() => { meta.adding = false; }); } // the human is in: start the call
    tickBots(room, meta);
    if (room.locked && !meta.endAt) meta.endAt = now() + 20000;
    if (meta.endAt && now() > meta.endAt && room.status !== "ended") R._test.endRoom(room, "study-practice");
    if (room.status === "ended") detach(meta);
    return;
  }

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
  const s = { id: rid(6), index: data.assigned, order, createdAt: now(), updatedAt: now(), creator: null, testers: {}, calls: {}, practice: false, formTried: false };
  data.sessions[s.id] = s;
  return s;
}
function addTester(s) {
  const tid = rid(8);
  s.testers[tid] = { n: Object.keys(s.testers).length + 1, joinedAt: now(), consent: true, steps: {}, surveys: {}, final: null };
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

// What a tester sees: progress and "Voice 1" / "Voice 2". Never the arm or the persona.
function testerView(s, tid) {
  const t = s.testers[tid];
  const calls = {};
  for (const n of [1, 2]) {
    const c = s.calls[n];
    const meta = c && [...live.values()].find((m) => m.sid === s.id && m.n === n && m.callId === c.id);
    calls[n] = { label: `Voice ${n}`, status: callStatus(s, n), room: meta ? meta.room : null, mine: Boolean(meta && meta.tid === tid), reachedPicks: Boolean(c && c.picksAt) };
  }
  const steps = {
    consent: true,
    discover: Boolean(t.steps.discover),
    plan: Boolean(t.steps.plan || s.calls[1]),
    share: Boolean(t.steps.share),
    call1: Boolean(t.surveys[1]),
    form: Boolean(t.steps.form),
    call2: Boolean(t.surveys[2]),
    survey: Boolean(t.final),
  };
  return { sid: s.id, you: { n: t.n, creator: s.creator === tid, steps, surveys: { 1: Boolean(t.surveys[1]), 2: Boolean(t.surveys[2]) }, final: Boolean(t.final) }, calls, practice: s.practice, testers: Object.keys(s.testers).length, steps: STEPS };
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

function callRows() {
  const rows = [];
  for (const s of Object.values(data.sessions).sort((a, b) => a.index - b.index)) {
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
  for (const s of Object.values(data.sessions).sort((a, b) => a.index - b.index)) {
    for (const t of Object.values(s.testers)) {
      if (!t.final) continue;
      rows.push({ session: s.id, session_index: s.index, order: s.order, tester: t.n, keep_voice: t.final.keep, keep_arm: t.final.keepArm, keep_persona: ARMS[t.final.keepArm], kept_first_heard: t.final.keep === 1, seq: t.final.seq, why: t.final.why || "" });
    }
  }
  return rows;
}
function csv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\n") + "\n";
}

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
  const sessions = Object.values(data.sessions);
  return {
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
  const parts = url.pathname.split("/").filter(Boolean); // api, sk, study, :sid | export | summary, action
  try {
    if (parts[3] === "export" || parts[3] === "summary") {
      const key = process.env.SIDEKICK_STUDY_KEY;
      const given = url.searchParams.get("key") || req.headers["x-study-key"] || "";
      if (!key) return sendJSON(res, 403, { error: "Results are locked. Set SIDEKICK_STUDY_KEY on the server to open them." });
      const a = Buffer.from(String(given));
      const b = Buffer.from(key);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return sendJSON(res, 401, { error: "Wrong or missing study key." });
      if (parts[3] === "summary") return sendJSON(res, 200, summary());
      const table = url.searchParams.get("table") === "preferences" ? preferenceRows() : callRows();
      if (url.searchParams.get("format") === "json") return sendJSON(res, 200, { calls: callRows(), preferences: preferenceRows() });
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="sidekick-study-${url.searchParams.get("table") === "preferences" ? "preferences" : "calls"}.csv"` });
      return res.end(csv(table));
    }
    if (req.method !== "GET" && req.method !== "POST") return sendJSON(res, 405, { error: "Not allowed." });
    const body = req.method === "POST" ? await readBody(req) : {};

    if (req.method === "POST" && parts[3] === "sessions" && !parts[4]) {
      if (body.consent !== true) return sendJSON(res, 400, { error: "Tick the box to agree first." });
      const s = newSession();
      const tid = addTester(s);
      save(s);
      return sendJSON(res, 200, { sid: s.id, tid, view: testerView(s, tid) });
    }
    const s = data.sessions[parts[3]];
    if (!s) return sendJSON(res, 404, { error: "This study link isn't valid anymore. Start a new one.", gone: true });
    const action = parts[4] || "";
    if (req.method === "POST" && action === "join") {
      if (body.consent !== true) return sendJSON(res, 400, { error: "Tick the box to agree first." });
      const tid = addTester(s);
      save(s);
      return sendJSON(res, 200, { sid: s.id, tid, view: testerView(s, tid) });
    }
    const tid = req.method === "GET" ? url.searchParams.get("t") : body.t;
    if (!tid || !s.testers[tid]) return sendJSON(res, 403, { error: "Open the study link and agree to take part first.", join: true });
    const t = s.testers[tid];
    if (req.method === "GET" && !action) return sendJSON(res, 200, testerView(s, tid));
    if (req.method !== "POST") return sendJSON(res, 404, { error: "Not found" });

    if (action === "step") {
      if (!MANUAL_STEPS.includes(body.step)) return sendJSON(res, 400, { error: "That step fills in by itself." });
      if (body.done === false) delete t.steps[body.step];
      else t.steps[body.step] = now();
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
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
      s.calls[n] = { id: rid(5), n, arm: s.order[n - 1], persona: room.persona, startedAt: now(), short };
      const m = { sid: s.id, n, callId: s.calls[n].id, tid, room: out.data.room, plannerPid: out.data.person, bots: [], closers: [], pending: new Set(), lines: new Set() };
      attach(m);
      if (n === 1 && !t.steps.plan) t.steps.plan = now();
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
      if (!meta || meta.sid !== s.id || meta.n === "form") return sendJSON(res, 404, { error: "Start the study call first." });
      const room = roomOf(meta.room);
      if (!room || room.status !== "live") return sendJSON(res, 400, { error: "This call has ended." });
      if (!room.people.some((p) => p.id === body.p)) return sendJSON(res, 403, { error: "Join the call first." });
      const added = await addBots(meta, 2);
      s.practice = true;
      save(s);
      update(meta);
      return sendJSON(res, 200, { ok: true, added: added.length });
    }

    if (action === "form") {
      if (!callDone(s, 1)) return sendJSON(res, 409, { error: "Do the Voice 1 call first, so the first voice you hear is the one your crew got." });
      const existing = [...live.values()].find((m) => m.sid === s.id && m.n === "form" && m.tid === tid && roomOf(m.room) && roomOf(m.room).status === "live");
      if (existing) return sendJSON(res, 200, { room: existing.room });
      const sug = await call("GET", "/api/sk/nights");
      const nights = ((sug.data && sug.data.nights) || []).filter((x) => x.events > 0).slice(0, 2).map((x) => x.date);
      // A practice call in the voice this crew already heard, planned by a practice friend
      const out = await call("POST", "/api/sk/rooms", { name: FORM_PLANNER, crew: "Practice crew", nights, persona: ARMS[s.order[0]] });
      if (out.status !== 200) return sendJSON(res, out.status, out.data);
      const room = roomOf(out.data.room);
      room.people[0].practice = true;
      const m = { sid: s.id, n: "form", tid, room: out.data.room, plannerPid: out.data.person, bots: [out.data.person], closers: [], pending: new Set(), lines: new Set() };
      m.closers.push(openStream(m.room, out.data.person));
      attach(m);
      return sendJSON(res, 200, { room: out.data.room });
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
      t.final = { keep, keepArm, seq, why: scrub(body.why, s.id), at: now() };
      save(s);
      return sendJSON(res, 200, testerView(s, tid));
    }
    return sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }
}

module.exports = { handle, flush, ARMS, ORDERS, _test: { lineBookOf, binomial, scrub, summary, callRows, preferenceRows, load, live } };
