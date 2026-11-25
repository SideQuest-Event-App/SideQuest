// Sidekick planning calls: rooms in memory, live updates over server-sent events, and the loop that
// listens, updates the plan, and decides when Sidekick speaks. Transcript lines live in memory only
// and are deleted when the call ends; only a summary (facts and picks, no names, no lines) is saved.
//
// Each room gets one of two personas at random (A/B test), unless ?persona= is given when it's made.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const P = require("./plan");
const factsOf = (room) => Object.assign(P.facts(room), { relax: room.relax });
const personas = require("./personas");
const talk = require("./talk");
const claude = require("./claude");
const wantLib = require("../search/want");
const ai = require("../ai");
const places = require("./places");
const usage = require("./usage");
const { track } = require("../analytics");
const weather = require("../search/weather"); // context for the plan engine: rain or deep cold puts indoor picks first
const rank = require("../search/rank"); // who-it's-for, crew match and the Wildcard on the picks
const callside = require("./callside"); // signed-in people on a call: taste learning, call history, in-app invites

const rooms = new Map();
const SUMMARY_FILE = path.join(__dirname, "..", "..", "data", "sidekick-summaries.jsonl");
const QUIET_MS = 900; // wait this long after the last line before thinking, so Sidekick never cuts in
const QUIET_ASKED_MS = 400; // shorter when someone just spoke to Sidekick ("Sidekick, ..."): they're waiting on it
const MIN_GAP_MS = 5000; // at least this long between Sidekick's lines, unless someone asks it something
const NUDGE_AFTER_MS = 20000;
const SILENT_MS = () => Number(process.env.SIDEKICK_SILENT_MS || 20000); // quiet this long in the call: invited in by name, once
const IDLE_MS = 3 * 3600 * 1000;
const PROMPTS = { night: "Which night works?", time: "What time works?", origin: "Where are you starting from?", vibe: "What kind of night?", budget: "Your max for the night?", nos: "Anything that's a no?", kind: "A ticketed event, or just somewhere good to go?" };

const id = (n = 6) => crypto.randomBytes(n).toString("base64url");
// Changes every time the server starts. Rooms live in memory, so a phone that saw a different boot
// knows its call ended because the app restarted, not because the planner ended it.
const BOOT = id(4);
const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();
const now = () => Date.now();

let eventsSource = () => [];
const upcoming = () => eventsSource().filter((e) => e.startsAt && new Date(e.startsAt) > new Date());

// ---------- Rooms and people ----------

// members: the people the planner picked in the Plan tab's steps (a squad, or SideQuest friends), by first
// name, so the call shows who's still to join. form: "Send everyone a quick form" (the Just answer, no call
// mode): Sidekick sits back from the start and nobody is asked to talk.
const cleanNights = (nights) => (Array.isArray(nights) ? nights : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 4);
const cleanMembers = (list) => [...new Set((Array.isArray(list) ? list : []).map((m) => String(m || "").trim().slice(0, 24)).filter(Boolean))].slice(0, 12);
function asForm(room) {
  room.form = true;
  if (room.mode !== "sidelines") { room.mode = "sidelines"; room.modeHow = "form"; room.modeSetAt = now(); }
  if (!room.picks) room.card = { slot: "form", at: now() };
  room.stalledAsked = true; // nobody is on a call to hear "looks like things slowed down"
  const planner = room.people.find((p) => p.role === "planner");
  if (planner) planner.mode = "form";
}

// A form's "Decide by": the planner picks a time on the Plan tab's last step (e.g. Thu 9 PM). Then the form
// closes (nobody new can answer) and Sidekick picks with the answers it has. At most three weeks out.
function setDeadline(room, when) {
  const t = typeof when === "number" ? when : Date.parse(when);
  if (!Number.isFinite(t) || t <= now() || t > now() + 21 * 86400000) return false;
  room.deadline = t;
  clearTimeout(room.deadlineTimer);
  room.deadlineTimer = setTimeout(() => closeForm(room).catch((err) => console.error("Closing the form failed:", err)), t - now());
  if (room.deadlineTimer.unref) room.deadlineTimer.unref();
  return true;
}
async function closeForm(room) {
  if (room.closed || room.status !== "live") return;
  room.closed = true;
  clearTimeout(room.deadlineTimer);
  track("sk_form_closed", { sessionId: room.id, persona: room.persona, answered: P.crew(room).filter((p) => Object.keys(room.answers[p.id] || {}).length).length });
  if (!room.picks) {
    room.confirmed = true; // the deadline is the go-ahead: no confirmation card
    const events = [...upcoming(), ...(room.places || [])];
    const r = P.readiness(events, room, factsOf(room));
    if (r.pool >= 1) await makePicks(room, r.list);
  }
  broadcast(room);
}

function createRoom({ crew, planner, nights, persona, members, form, path: how, user, noLearn, deadline, pick, invite, squad }) {
  const room = {
    id: id(),
    crew: String(crew || "The crew").slice(0, 40),
    squad: typeof squad === "string" && squad ? squad.slice(0, 40) : null, // the Squads tab squad id, when started from one
    nights: cleanNights(nights),
    expected: cleanMembers(members),
    form: false,
    persona: persona ? personas.resolve(persona) : personas.PERSONA_IDS[crypto.randomInt(personas.PERSONA_IDS.length)],
    createdAt: now(),
    touched: now(),
    people: [],
    answers: {},
    lines: [], // { pid, name, text, kind, at } in memory only
    pending: [],
    said: [],
    card: null,
    asked: [],
    nudged: {},
    conflictsSaid: {},
    picks: null,
    votes: {},
    locked: null,
    status: "live",
    streams: new Map(),
    surveys: {},
    relax: new Set(), // constraints the crew agreed to loosen when nothing fit
    offer: null,
    places: [], // non-ticketed places from Google, for this call only (never stored)
    agentNotes: [], // things the ElevenLabs agent can't hear (joins, taps, picks on screen), passed as context
    nextMove: null, // the engine's latest move while the agent leads; the agent reads it with get_next_move
    agentMode: false, // the ElevenLabs agent is Sidekick's voice: the engine stops speaking for itself
    agent: null,
    mode: null, // null (not asked yet) | "voting" | "lead" | "sidelines"
    modeVotes: {},
    modeHow: null,
    signalQueue: new Map(), // in-app audio signalling for people whose stream is reconnecting
    heard: [], // public facts as they land, with names, for saying back and the "what I heard" chips (memory only)
    unclear: null, // one person's unclear answer ("maybe Friday, or Saturday?"), asked about by name
    aside: null, // off-topic chatter to react to briefly before steering back
    invited: {}, // people invited in by name after going quiet (once each)
    context: { weather: weather.at }, // read by plan.js score(); no forecast cached means no effect
    history: [], // each pick shown, with everyone's fit, so later picks favour whoever was served least
    wildcard: null, // one labelled pick from outside the crew's vibes (shown, not voted on)
    confirm: null, // "I've got everything": { at, until, facts, editing } between the questions and the picks
    confirmed: false,
    reopened: null, // a fact reopened from the confirmation card: { slot, at }
    deadline: null, // a form's "Decide by" (ms); the form closes and Sidekick picks then
    closed: false,
    candidate: null, // "Plan it" from Saved: the event to plan around (an id), shown as a pick when it fits
  };
  weather.refresh().catch(() => {}); // fetched at most hourly; skipped when unreachable
  if (!room.nights.length) room.nights = suggestNights().slice(0, 2).map((n) => n.date);
  rooms.set(room.id, room);
  const person = addPerson(room, { name: planner, mode: "voice", role: "planner", user });
  if (noLearn) person.noLearn = true;
  const cand = pick != null && callside.pickInfo(pick);
  if (cand && !cand.past) room.candidate = cand.id;
  if (form) asForm(room);
  if (deadline) setDeadline(room, deadline);
  if (invite) callside.invite(room, person, invite);
  track("plan_started", { sessionId: room.id, path: form ? "form" : ["squad", "friends", "link"].includes(how) ? `call_${how}` : "call", persona: room.persona, nights: room.nights.length, members: room.expected.length });
  return { room: room.id, person: person.id };
}

function addPerson(room, { name, mode, role, user }) {
  const person = { id: id(), name: String(name || "Friend").trim().slice(0, 24) || "Friend", mode: ["voice", "text", "form"].includes(mode) ? mode : "voice", role: role || "friend", joinedAt: now(), lastSpokeAt: 0 };
  if (user && /^[\w-]{1,40}$/.test(String(user))) person.user = String(user); // a SideQuest account (never in a view)
  room.people.push(person);
  room.answers[person.id] = {};
  track("sk_joined", { sessionId: room.id, persona: room.persona, mode: person.mode, role: person.role, crewSize: room.people.length });
  return person;
}

// The next Fri, Sat and Sun with how many listings each has, for the planner to choose from
function suggestNights() {
  const list = upcoming();
  const out = [];
  const d = new Date();
  for (let i = 1; out.length < 6 && i < 21; i++) {
    const day = new Date(d.getTime() + i * 86400000);
    const iso = P.localDay(day.toISOString());
    const wd = new Date(iso + "T12:00:00").getDay();
    if (![5, 6, 0].includes(wd)) continue;
    out.push({ date: iso, label: P.nightLabel(iso), events: list.filter((e) => P.localDay(e.startsAt) === iso).length });
  }
  return out;
}

// ---------- Answers and lines ----------

function setAnswer(room, person, slot, value, source) {
  const def = P.SLOTS[slot];
  if (!def) return false;
  if (slot === "origin") return setOrigin(room, person, value, source);
  if (def.free) return setWant(room, person, value, source);
  const valid = P.optionsFor(slot, room).map(([v]) => v);
  let v = def.multi ? [].concat(value).map(String).filter((x) => valid.includes(x)) : valid.includes(String(value)) ? String(value) : null;
  if (v == null || (Array.isArray(v) && !v.length && slot !== "nos")) return false;
  const prev = room.answers[person.id][slot];
  room.answers[person.id][slot] = { value: v, source, at: now() };
  noteHeard(room, person, slot, prev, source);
  track("response_submitted", { sessionId: room.id, persona: room.persona, slot, source, visibility: def.private ? "private" : "group" });
  return true;
}

// "Looking for": what someone asked for in their own words ("Chinese skewers"), cleaned so no amount, number or
// area name reaches the shared board (lib/search/want.js). Adds to what they said before, newest first, up to 3.
function setWant(room, person, value, source) {
  const fresh = [].concat(value || []).map(wantLib.clean).filter(Boolean);
  if (!fresh.length) return false;
  const prev = room.answers[person.id].want;
  const had = prev ? [].concat(prev.value) : [];
  const v = [...new Set([...fresh, ...had].map((x) => x.toLowerCase()))].map((k) => [...fresh, ...had].find((x) => x.toLowerCase() === k)).slice(0, 3);
  room.answers[person.id].want = { value: v, source, at: now() };
  track("response_submitted", { sessionId: room.id, persona: room.persona, slot: "want", source, visibility: "group" });
  return true;
}
// "Starting from": a station, or the person's own location. A location arrives as { lat, lng } and is
// rounded to 2 decimals (about 1 km) straight away. The rounded point is kept only in that person's
// private answers (answers.location), for this call: never in a view, broadcast, log, analytics event,
// summary or AI prompt, and it's deleted when the call ends. Everything else uses what it stands for:
// the nearest station (for travel times) and a neighbourhood ("near Koreatown").
// "here" re-uses a location the person already shared (a tap on "My location", or "I'm at home").
const round2 = (n) => Math.round(n * 100) / 100;
function setOrigin(room, person, value, source) {
  const mine = room.answers[person.id];
  let loc = null;
  if (value && typeof value === "object") {
    const lat = Number(value.lat), lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    const at = { lat: round2(lat), lng: round2(lng) };
    loc = mine.location = { ...at, station: places.nearestStation(at.lat, at.lng), near: places.nearLabel(at.lat, at.lng) };
  } else if (value === "here") {
    if (!mine.location) return false;
    loc = mine.location;
  } else if (!P.optionsFor("origin", room).some(([v]) => v === String(value))) return false;
  const prev = mine.origin;
  mine.origin = loc ? { value: loc.station, here: true, near: loc.near, source, at: now() } : { value: String(value), source, at: now() };
  track("response_submitted", { sessionId: room.id, persona: room.persona, slot: "origin", source, visibility: "group" });
  noteHeard(room, person, "origin", prev, source);
  return true;
}
// A public answer that changed: kept (in memory, this call only) so Sidekick can say it back with the
// person's name, and so a "what I heard" chip can show it with an undo. Private slots never get here.
function noteHeard(room, person, slot, prev, source) {
  if (!talk.PUBLIC.includes(slot)) return;
  const a = room.answers[person.id][slot];
  if (!a) return;
  if (prev && JSON.stringify(prev.value) === JSON.stringify(a.value) && Boolean(prev.here) === Boolean(a.here)) return;
  const values = [].concat(a.value);
  room.heard.push({ id: id(4), pid: person.id, name: person.name, slot, values, here: Boolean(a.here), label: a.here ? "their location" : talk.chipLabel(room, slot, values), source, at: a.at, prev: prev || null });
  if (room.heard.length > 40) room.heard.shift();
}
// Take back a heard answer (the chip's undo): the person's answer goes back to what it was
function unhear(room, h) {
  const cur = (room.answers[h.pid] || {})[h.slot];
  if (cur && cur.at === h.at) {
    if (h.prev) room.answers[h.pid][h.slot] = h.prev;
    else delete room.answers[h.pid][h.slot];
  }
  h.undone = true;
}
// A person's own answers as their phone may see them: no coordinates, just whether they shared
function ownAnswers(answers) {
  if (!answers) return answers;
  const { location, ...rest } = answers;
  return rest;
}

// ---------- Several phones in one room ----------
// Friends sitting together: every phone's mic hears everyone, so one sentence can arrive from several
// phones. And a phone reading Sidekick aloud gets captioned by the others. Both are dropped here.
const DUP_MS = 4000;
const DUP_SHORT_MS = 1500; // "yeah" from two phones: only a duplicate if it's identical and nearly at once
const ECHO_MS = 12000;
const words = (t) => String(t || "").toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z0-9$]+/g, " ").split(" ").filter(Boolean);
function overlap(a, b) { // shared words over the average length (multiset), 0 to 1
  const left = new Map();
  for (const w of a) left.set(w, (left.get(w) || 0) + 1);
  let n = 0;
  for (const w of b) { const c = left.get(w); if (c) { n++; left.set(w, c - 1); } }
  return (2 * n) / (a.length + b.length || 1);
}
function contained(a, b) { // share of a's words that appear in b
  const pool = new Map();
  for (const w of b) pool.set(w, (pool.get(w) || 0) + 1);
  let n = 0;
  for (const w of a) { const c = pool.get(w); if (c) { n++; pool.set(w, c - 1); } }
  return n / (a.length || 1);
}
// Returns "duplicate", "echo" or null
function heardElsewhere(room, person, text, kind) {
  if (kind === "typed") return null;
  const w = words(text);
  if (!w.length) return null;
  const t = now();
  for (const s of room.said) {
    if (s.system || t - s.at > ECHO_MS + speechMs(s.text)) continue;
    const sw = words(s.text);
    if (w.length >= 4 && contained(w, sw) >= 0.8) return "echo";
    if (w.length === 3 && ` ${sw.join(" ")} `.includes(` ${w.join(" ")} `)) return "echo";
  }
  for (let i = room.lines.length - 1; i >= 0; i--) {
    const l = room.lines[i];
    if (t - l.at > DUP_MS) break;
    if (l.pid === person.id || l.kind === "typed") continue;
    const lw = words(l.text);
    if (w.length < 3 || lw.length < 3) { if (t - l.at <= DUP_SHORT_MS && w.join(" ") === lw.join(" ")) return "duplicate"; continue; }
    if (overlap(w, lw) >= 0.8) return "duplicate";
  }
  return null;
}

function addLine(room, person, text, kind) {
  text = String(text || "").trim().slice(0, 300);
  if (!text) return null;
  const heard = heardElsewhere(room, person, text, kind);
  if (heard) {
    room.dropped = (room.dropped || 0) + 1;
    track("sk_line_dropped", { sessionId: room.id, why: heard });
    return { dropped: heard };
  }
  const line = { id: id(4), pid: person.id, name: person.name, text, kind: kind === "typed" ? "typed" : "spoken", at: now() };
  room.lines.push(line);
  if (room.lines.length > 40) room.lines.shift();
  room.pending.push(line);
  person.lastSpokeAt = now();
  if (/\bside ?kick\b/i.test(text)) room.addressed = line;
  if (room.mode === "voting") {
    const v = modeFromText(text);
    if (v) { room.addressed = null; voteMode(room, person, v, kind === "typed" ? "typed" : "speech"); }
    else scheduleModeClose(room, SILENCE_MS); // still talking: wait for a pause
    return line;
  }
  if (room.mode && /\bside ?kick\b/i.test(text)) {
    if (room.mode === "sidelines" && TAKE_OVER.test(text)) { room.wantMode = "lead"; room.addressed = null; }
    else if (room.mode === "lead" && STEP_BACK.test(text)) { room.wantMode = "sidelines"; room.addressed = null; }
  }
  const slot = room.card && room.card.slot;
  if (slot && P.SLOTS[slot] && !P.SLOTS[slot].private && FLEX.test(text) && P.SLOTS[slot].multi) {
    setAnswer(room, person, slot, P.optionsFor(slot, room).map(([v]) => v), kind === "typed" ? "call_text" : "call_speech");
    line.flex = true;
  } else if (slot && UNSURE.test(text)) room.wantGuide = slot;
  if (room.offer && /\b(yes|yeah|yep|sure|ok(ay)?|show (us|me)|do it|go for it|sounds good)\b/i.test(text)) acceptOffer(room);
  return line;
}

function acceptOffer(room) {
  if (!room.offer) return false;
  room.relax.add(room.offer);
  track("sk_relaxed", { sessionId: room.id, persona: room.persona, kind: room.offer });
  room.offer = null;
  return true;
}

// ---------- The check-in: should Sidekick lead, or sit back while the crew fills in the plan? ----------
// Everyone votes (tap or say it). Sidekick leads on a tie, or if nobody answers within about 3 seconds
// of the check-in finishing. People can switch later ("Sidekick, take over" / "Sidekick, step back").
const SILENCE_MS = 3000;
const VOTE_MAX_MS = 20000;
const LEAD_RE = /\b(yes|yeah|yep|yup|sure|please|lead|take the lead|run it|help( us)?|jump in|go for it|take over|you plan|do it|active)\b/i;
const SIDE_RE = /\b(no|nope|nah|sidelines?|sit back|hang back|step back|we('ve| have)? got (it|this)|we'?ll fill|ourselves|stay quiet|background|the form)\b/i;
const TAKE_OVER = /\b(take over|take the lead|jump in|help( us)?|run it|lead)\b/i;
const STEP_BACK = /\b(step back|sit back|hang back|we('ve| have)? got (it|this)|stay quiet|chill)\b/i;
function modeFromText(text) {
  const lead = LEAD_RE.test(text);
  const side = SIDE_RE.test(text);
  return lead && !side ? "lead" : side && !lead ? "sidelines" : null; // both or neither: not a clear vote
}
const voters = (room) => P.crew(room).filter((p) => p.mode !== "form");
const speechMs = (text) => 600 + String(text || "").split(/\s+/).length * 380; // about how long a line takes to say

async function startCheckIn(room) {
  room.mode = "voting";
  room.modeVotes = {};
  room.modeDeadline = now() + VOTE_MAX_MS;
  room.card = { slot: "mode", at: now() };
  const line = await speak(room, "checkin", {});
  track("sk_checkin", { sessionId: room.id, persona: room.persona, voters: voters(room).length });
  scheduleModeClose(room, speechMs(line.text) + SILENCE_MS);
}

function voteMode(room, person, value, how) {
  if (room.mode !== "voting" || !["lead", "sidelines"].includes(value)) return false;
  room.modeVotes[person.id] = value;
  track("sk_mode_vote", { sessionId: room.id, persona: room.persona, value, how });
  if (voters(room).every((p) => room.modeVotes[p.id])) { clearTimeout(room.modeTimer); closeMode(room).then(() => broadcast(room)); }
  else scheduleModeClose(room, SILENCE_MS);
  return true;
}

function scheduleModeClose(room, ms) {
  if (room.mode !== "voting") return;
  clearTimeout(room.modeTimer);
  const wait = Math.max(0, Math.min(ms, (room.modeDeadline || now()) - now()));
  room.modeCloseAt = now() + wait; // phones show a countdown to this
  room.modeTimer = setTimeout(() => closeMode(room).then(() => broadcast(room)).catch((err) => console.error(err)), wait);
}

async function closeMode(room) {
  if (room.mode !== "voting") return;
  clearTimeout(room.modeTimer);
  const votes = Object.values(room.modeVotes);
  const side = votes.filter((v) => v === "sidelines").length;
  const lead = votes.length - side;
  await setMode(room, side > lead ? "sidelines" : "lead", votes.length ? "vote" : "default");
}

// The question the crew should answer first, said out loud
const QUESTION_SPOKEN = { night: "what day works best for everyone?", time: "what time works for everyone?", origin: "where's everyone coming from?", vibe: "what kind of night are we after?", budget: "pop your budget in on your screen, it's private", kind: "a ticketed event, or just somewhere good to go?" };

async function setMode(room, mode, how) {
  const was = room.mode;
  room.mode = mode;
  room.modeHow = how;
  room.modeSetAt = now();
  clearTimeout(room.modeTimer);
  track("sk_mode", { sessionId: room.id, persona: room.persona, mode, how, votes: Object.keys(room.modeVotes).length });
  const switching = how === "switch";
  if (mode === "sidelines") {
    room.card = { slot: "form", at: now() };
    room.lastSaidAt = 0;
    await speak(room, switching ? "switch_sidelines" : "mode_sidelines", {});
    return;
  }
  // Leading: confirm and ask the first open question in the same breath
  const events = [...upcoming(), ...(room.places || [])];
  const f = factsOf(room);
  const slot = P.nextQuestion(events, room, f) || (f.budget.answered < P.need(room) ? "budget" : null);
  room.card = slot ? { slot, at: now() } : null;
  if (slot) room.asked.push(slot);
  room.lastSaidAt = 0;
  await speak(room, switching ? "switch_lead" : how === "default" ? "mode_default" : "mode_lead", { slot });
  if (!slot && was !== "lead") schedule(room, 300);
}

// "Anything works" is an answer (all options); "not sure" is a cue for Sidekick to offer ideas
const FLEX = /\b(anything|whatever|either|any of (them|those)|don'?t mind|up to you|no preference|all good|i'?m easy|i'?m down for whatever)\b/i;
const UNSURE = /\b(idk|i don'?t know|not sure|dunno|no idea|can'?t decide|no clue|hmm+)\b/i;

// ---------- Understanding what people said ----------

const FACTS_TOOL = {
  name: "update_plan_facts",
  description: "Record what people on the planning call said about the plan. Only record things a person clearly said about themselves (or clearly agreed to). Leave out anything unclear.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            person: { type: "string", description: "The first name of the person this fact is about, exactly as listed" },
            slot: { type: "string", enum: ["night", "time", "origin", "vibe", "budget", "nos", "want"] },
            values: { type: "array", items: { type: "string" }, description: "Allowed values only, from the list given for that slot. For want: the specific food, dish, cuisine or kind of place they asked for, in their own words, a few words each (\"Chinese skewers\", \"chuan'r\", \"karaoke with private rooms\", \"rooftop patio\"); never a price, an area or a person" },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["person", "slot", "values", "confidence"],
        },
      },
      unclear: {
        type: "array",
        description: "Someone gave two options for one fact and it isn't clear which they meant (\"maybe Friday, or Saturday?\"). List them here instead of in updates. \"Friday or Saturday both work\" is clear: that goes in updates.",
        items: { type: "object", properties: { person: { type: "string" }, slot: { type: "string", enum: ["night", "time"] }, values: { type: "array", items: { type: "string" } } }, required: ["person", "slot", "values"] },
      },
      addressed_sidekick: { type: "boolean", description: "True if someone spoke to Sidekick directly" },
      question: { type: "string", description: "If someone asked Sidekick something, the question in a few words; else empty" },
    },
    required: ["updates", "addressed_sidekick", "question"],
  },
};

async function extract(room, lines) {
  const names = P.crew(room).map((p) => p.name);
  const allowed = Object.keys(P.SLOTS).map((s) => (P.SLOTS[s].free ? `- ${s}: free text in their own words (a cuisine, dish or kind of place: "Chinese skewers", "karaoke with private rooms"); only when they name something more specific than the vibes` : `- ${s}: ${P.optionsFor(s, room).map(([v, l]) => `${v} (${l})`).join(", ")}`)).join("\n");
  const user = `People on the call: ${names.join(", ")}.
Allowed values per slot (night = dates; time: early is noon to 5, evening is 5 to 8, late is after 8; origin = the subway terminal nearest where they start, or "here" when they say they're starting from home or where they are now; budget = max spend in dollars; nos = areas to avoid):
${allowed}

Recent lines (earlier context, then the new lines to read):
${room.lines.slice(-12).map((l) => `${lines.includes(l) ? "NEW " : ""}${l.name}: ${l.text}`).join("\n")}

Record what the NEW lines say. If someone accepts several options (e.g. "Friday or Saturday"), list all of them. If someone rules one out ("Friday is bad"), list only the ones they can do, out of the options above.`;
  const out = await claude.tool("You turn a group's planning conversation into structured facts. Be conservative.", user, FACTS_TOOL);
  return out;
}

// "I'm at home", "where I am": the person's own location, if they shared it (else the origin card)
const HOME = /\b(i'?m at home|at home|from home|leaving from home|where i am|where i'?m at|my (location|place)|from here|i'?m here)\b/;
// No AI: simple keyword reading, good enough to test the flow
function extractKeywords(room, lines) {
  const updates = [];
  const unclear = [];
  let addressed = false;
  for (const l of lines) {
    const t = l.text.toLowerCase();
    const add = (slot, values) => values.length && updates.push({ person: l.name, slot, values, confidence: 0.7 });
    const days = room.nights.filter((d) => {
      const wd = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const re = new RegExp(`\\b(${wd}|${wd.slice(0, 3)})\\b`);
      if (!re.test(t)) return false;
      return !new RegExp(`(not|no|can'?t|bad) +(\\w+ +){0,2}(${wd}|${wd.slice(0, 3)})\\b|\\b(${wd}|${wd.slice(0, 3)}) +(\\w+ +){0,2}(is bad|doesn'?t work|no good|is out)`).test(t);
    });
    // "maybe Friday, or Saturday?": ask that person about just that, instead of guessing
    const unsure = talk.unclearNight(room, l.text);
    if (unsure) unclear.push({ person: l.name, slot: "night", values: unsure });
    else add("night", days);
    const times = [];
    if (/after (5|6|7|five|six|seven)\b|evening|dinner/.test(t)) times.push("evening");
    if (/after (8|9|10|eight|nine|ten)\b|late/.test(t)) times.push("late");
    if (/afternoon|daytime|lunch/.test(t)) times.push("early");
    add("time", times);
    const money = t.match(/\$\s?(\d+)|(\d+)\s?(bucks|dollars)/);
    if (money) { const n = Number(money[1] || money[2]); add("budget", [n <= 20 ? "20" : n <= 30 ? "30" : n <= 50 ? "50" : "any"]); }
    else if (/\bbroke\b|cheap|free/.test(t)) add("budget", ["20"]);
    const o = /union|downtown/.test(t) ? "union" : /finch|north york/.test(t) ? "finch" : /kennedy|scarborough/.test(t) ? "kennedy" : /kipling|etobicoke/.test(t) ? "kipling" : HOME.test(t) ? "here" : null;
    if (o) add("origin", [o]);
    const vibes = [];
    const tv = t.replace(/\b(leafs|raptors|jays|hockey|basketball|the|that|last night'?s?)\s+games?\b/g, " "); // "the leafs game" isn't a games night
    if (/music|jazz|band|gig|concert/.test(t)) vibes.push("music");
    if (/comedy|stand-?up/.test(t)) vibes.push("comedy");
    if (/games?|trivia|arcade/.test(tv)) vibes.push("games");
    if (/danc|club/.test(t)) vibes.push("dance");
    if (/\bart\b|gallery|film|movie/.test(t)) vibes.push("arts");
    add("vibe", vibes);
    // The specifics in their own words: "Chinese skewers", "karaoke with private rooms" (lib/search/want.js)
    add("want", wantLib.find(l.text));
    const nos = ["West End", "Downtown", "East End", "North York", "Scarborough", "Etobicoke"].filter((a) => new RegExp(`(not|no|avoid)\\W+(the\\W+)?${a.toLowerCase()}`).test(t));
    add("nos", nos);
    if (/\bside ?kick\b/.test(t)) addressed = true;
  }
  return { updates, unclear, addressed_sidekick: addressed, question: addressed ? lines[lines.length - 1].text : "" };
}

function applyUpdates(room, out, lines) {
  for (const u of out.updates || []) {
    if ((u.confidence || 0) < 0.5) continue;
    const person = P.crew(room).find((p) => p.name.toLowerCase() === String(u.person || "").toLowerCase());
    if (!person) continue;
    const line = [...lines].reverse().find((l) => l.pid === person.id);
    const def = P.SLOTS[u.slot];
    if (!def) continue;
    let values = (u.values || []).map(String);
    if (u.slot === "nos") values = [...new Set([...((room.answers[person.id].nos || {}).value || []), ...values])];
    if (u.slot === "want") values = values.map(wantLib.clean).filter(Boolean).slice(0, 3);
    const ok = setAnswer(room, person, u.slot, def.multi ? values : values[0], line && line.kind === "typed" ? "call_text" : "call_speech");
    if (!ok && u.slot === "origin" && values[0] === "here") room.askOrigin = true; // they didn't share it: ask the usual card
  }
  for (const u of out.unclear || []) {
    const person = P.crew(room).find((p) => p.name.toLowerCase() === String(u.person || "").toLowerCase());
    const values = (u.values || []).map(String).filter((v) => P.optionsFor(u.slot, room).some(([x]) => x === v));
    if (person && P.SLOTS[u.slot] && !P.SLOTS[u.slot].private && values.length >= 2) room.unclear = { pid: person.id, name: person.name, slot: u.slot, values, at: now() };
  }
}

// ---------- What Sidekick says ----------

const redact = (t) => t.replace(/\$\s?\d+|\b\d+\s?(bucks|dollars)\b/gi, "[amount]");

function publicFacts(room, f) {
  return rows(room, f).map((r) => `${r.label}: ${r.value || "not yet"}${r.who && !P.SLOTS[r.slot].private ? ` (${r.who})` : ""}${r.state === "conflict" ? " [not agreed]" : ""}`).join("; ");
}

function eventBrief(e, origins) {
  const trip = origins.map((o) => e.travel && e.travel.from && e.travel.from[o] && `${e.travel.from[o].minutes} min from ${o}`).filter(Boolean).join(", ");
  const review = (e.reviews || [])[0];
  return `${e.title} | ${e.date} | ${e.price === 0 ? "free" : e.price != null ? `$${e.price}` : "price unknown"} | ${e.venue && e.venue.name}, ${e.neighbourhood} | ${trip}${e.rating ? ` | rated ${e.rating}` : ""}${review ? ` | review: "${String(review.text || review).slice(0, 100)}"` : ""}`;
}

// c.deadline (a time): stop waiting for the AI then and use the line book, with c.lateKey if given.
// c.late: the AI already ran out of time earlier (the picks came from the engine): skip it.
async function speak(room, move, c = {}) {
  const f = factsOf(room);
  const people = P.crew(room);
  c = { ...c, ...talkFor(room, move, c, f) };
  const ctx = lineContext(room, f, c);
  const keyOf = (late) => (late && c.lateKey ? c.lateKey : move === "welcome" ? "hello" : move === "ask" ? `ask_${c.slot}` : move === "conflict" ? "clash" : move === "none" ? "loosen" : move);
  const recentSaid = room.said.filter((x) => !x.system).slice(-3).map((x) => x.text);
  if (room.agentMode) {
    // The ElevenLabs agent leads and speaks. The engine never speaks for itself: it keeps the move for
    // the agent's get_next_move tool, and passes on only what the agent can't know (picks on screen, a lock).
    const key = keyOf(c.late);
    const suggestion = personas.fallbackLine(room.persona, key, ctx, recentSaid);
    room.nextMove = { move, slot: c.slot || null, todo: moveText(room, move, c), example: suggestion, at: now() };
    if (move === "picks") agentNote(room, `[app] Two picks are on everyone's screens now. ${moveText(room, move, c)} Present them at the next natural pause.`);
    if (move === "locked") agentNote(room, `[app] The planner locked the plan: ${c.pick}. Confirm it warmly in one short sentence.`);
    if (move === "wrap") agentNote(room, "[app] Two quick survey questions are on everyone's screen now. Mention them once, briefly.");
    track("sk_said", { sessionId: room.id, persona: room.persona, move, ai: false, agent: true });
    return { id: id(4), text: suggestion, move, at: now(), agent: true };
  }
  let text = null;
  let usedAI = false;
  let late = Boolean(c.late);
  // The line book's line for this move: said as is without the AI, and given to the AI as a draft
  const draft = personas.fallbackLine(room.persona, keyOf(late), ctx, recentSaid);
  if (claude.available() && !late) {
    const origins = Array.isArray(f.origin.value) && f.origin.value.length ? f.origin.value : ["union"];
    const list = (c.events || []).slice(0, 4).map((e) => `- ${eventBrief(e, origins)}`).join("\n");
    const opts = c.slot ? P.optionsFor(c.slot, room).map(([, l]) => l).join(", ") : "";
    const moves = {
      welcome: `This is the first time you speak on this call. Open with the room (the crew name, who's here, the nights), then ask one open question: what kind of night are they after? They can answer with anything: night, time, vibe.`,
      ask: c.slot === "budget" ? `Ask everyone to tap their max spend on their own screen, and say only you see it.` : `Say back what you just heard (below) in a few words, with names, then ask${c.to ? ` ${c.to}` : " the group"}: ${PROMPTS[c.slot]} (options on screen: ${opts}).`,
      conflict: `Name this split without taking sides, with who's on each side, and offer a way forward: ${c.a} vs ${c.b}.`,
      clarify: `${c.person} gave two options and it's not clear which they meant. Ask just them, just that: ${c.aLabel} or ${c.bLabel}? One short question.`,
      nudge: `${c.person} has been quiet. Gently invite them in by name: ${PROMPTS[c.slot]}`,
      picks: `Present these two picks like a DJ, not a list: a hook, why it fits named people, one vivid detail (venue, start time, or that it's free), then invite the vote. Say which kind each one is (${c.kinds || "both fit the plan"}): a show has a start time and tickets, a place they can drop into any time it's open. Clean names and reasons to use: 1) ${(c.story || [])[0] || ""} 2) ${(c.story || [])[1] || ""}\n1) ${(c.picks || [])[0]}\n2) ${(c.picks || [])[1]}`,
      none: c.relax ? `Nothing fits everything they've said. Say that ${c.relax} would open up ${c.n} options, and ask if they want to see them. Don't say whose answer is the tight one.` : `Nothing fits everything they've said. Ask whether anyone could be flexible on the time or the night.`,
      checkin: `This is the first time you speak. Welcome ${room.crew} to SideQuest by name (who's here: ${ctx.names}), and ask whether they want you to lead the planning or sit back while they fill in the plan on their screens. Keep it to two short sentences.`,
      mode_lead: `The crew wants you to lead. Say you've got it, then ask one open question: what kind of night are they after, and what day works best for everyone?`,
      mode_default: `Nobody answered, so you're taking the lead. Say so lightly (they can tell you to step back anytime), then ask one open question: what kind of night are they after (${ctx.nights})?`,
      mode_sidelines: `The crew wants you to sit back. Say you'll stay quiet, the plan is on their screens, and they can say "Sidekick" if they need you.`,
      mode_stalled: `You're sitting back and things have gone quiet with the plan half done. Gently ask if they'd like you to jump in.`,
      switch_lead: `Someone asked you to take over. Say you're on it and ask: ${c.slot ? QUESTION_SPOKEN[c.slot] : "what's left to decide?"}`,
      switch_sidelines: `Someone asked you to step back. Say you'll stay quiet until they need you.`,
      guide: `People seem unsure about this: ${PROMPTS[c.slot]} Help them answer by offering these concrete options from what's actually on: ${c.options}. Keep it light and end with a question.`,
      locked: `The planner just locked the plan: ${c.pick}. Confirm it warmly in one short sentence.`,
      confirm: `You now have everything you need to pick. Say so in your own voice ("${CONFIRM_HEAD[personas.resolve(room.persona)]}"), then recap the plan in a few words: ${c.recap}. No names, no amounts beyond what's in the recap, and no question.`,
      wrap: `Say one warm goodbye (the plan's set for ${ctx.night || "the night"}), and point everyone to the two quick survey questions on their screen. Two short sentences at most.`,
      answer: `${c.person} just spoke to you: "${redact(c.question || "")}". Reply briefly, using only the facts and events here. If picks aren't ready yet, say what you still need.`,
    };
    const user = `Crew: ${room.crew}. On the call: ${people.map((p) => `${p.name} (${p.mode})`).join(", ")}.
What's settled so far (what the group can see): ${publicFacts(room, f)}.
Recent conversation:
${room.lines.slice(-6).map((l) => `${l.name}: ${redact(l.text)}`).join("\n") || "(nobody has spoken yet)"}
${list ? `Events that fit (the only facts you may use about places):\n${list}\n` : ""}${room.said.length ? `Your last lines (start differently from these):\n${room.said.slice(-3).map((s) => `- ${s.text}`).join("\n")}\n` : ""}${c.heardList ? `What you just heard (say it back first, briefly, with names): ${c.heardList}\n` : ""}${c.to ? `Hand the question to: ${c.to}\n` : ""}Draft line (use it, or say the same in your own words; at most 2 sentences and one question): ${draft}
Your move: ${moves[move]}`;
    try {
      const asked = claude.say(personas.systemPrompt(room.persona), user, 120);
      const out = c.deadline ? await beforeDeadline(asked, c.deadline) : await asked;
      if (out === LATE) late = true;
      else if (personas.acceptable(out, move) && (["picks", "fallback"].includes(move) || !/\$\s?\d|\b\d+\s?(bucks|dollars)\b/i.test(out))) { text = out.replace(/^["']|["']$/g, ""); usedAI = true; }
    } catch (err) {
      console.error(err.message);
    }
  }
  const lineKey = keyOf(late);
  if (!text) text = late && c.lateKey ? personas.fallbackLine(room.persona, lineKey, ctx, recentSaid) : draft;
  // The typed chat thread gets a shorter version, and quick replies for the question just asked
  const line = { id: id(4), text, move, at: now(), chat: personas.chatLine(room.persona, lineKey, ctx) || talk.chatText(text), quick: quickFor(room, move, c) };
  room.said.push(line);
  if (room.said.length > 20) room.said.shift();
  room.lastSaidAt = now();
  track("sk_said", { sessionId: room.id, persona: room.persona, move, ai: usedAI, late: late || undefined, words: text.split(/\s+/).length });
  return line;
}

const DAY = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const spokenDay = (label) => DAY[String(label).slice(0, 3)] || label;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const cleanTitle = (t) => String(t || "").replace(/^Free event\.\s*/i, "").replace(/\s+[|@]\s.*$/, "").trim();

// ---------- Talking like someone on the call ----------
// Sidekick's last real line (not a progress line): what people said since then is what it says back
function lastSaidAt(room) {
  const l = room.said.filter((x) => !x.system && !["progress", "still"].includes(x.move)).slice(-1)[0];
  return l ? l.at : 0;
}
const heardSince = (room) => { const t = lastSaidAt(room); return (room.heard || []).filter((h) => h.at >= t && !h.undone); };
const SAY_BACK = ["ask", "guide", "answer"];
// What this turn says back ({heard}), who it hands the question to ({to}), and the same for the AI prompt.
// Signature moves are used sparingly (by turn count). Never a private answer: heard holds public slots only.
function talkFor(room, move, c, f) {
  const out = {};
  const turn = room.said.filter((x) => !x.system).length;
  const fresh = heardSince(room);
  let heard = SAY_BACK.includes(move) ? talk.heardPhrase(room, fresh, { persona: room.persona, f, turn }) : null;
  if (heard && room.persona === "concierge" && turn % 3 === 2) {
    const sum = talk.summary(room, f);
    if (sum && fresh.every((h) => ["night", "time", "vibe"].includes(h.slot) && f[h.slot].known)) heard = sum;
  }
  // Nothing to ask about budget: say so once, instead of asking ("Budget's sorted, I've got everyone's privately")
  if (move === "ask" && c.slot !== "budget" && !room.sortedSaid && f.budget.answered >= P.crew(room).length) {
    room.sortedSaid = true;
    const note = room.persona === "friend" ? "budget's sorted privately" : "budgets are in, privately";
    heard = heard ? `${heard}, and ${note}` : note.charAt(0).toUpperCase() + note.slice(1);
  }
  if (room.aside && SAY_BACK.includes(move)) {
    const a = talk.asideFor(room.persona, room.aside.topic);
    heard = heard ? `${a}; ${heard}` : a;
    room.aside = null;
  }
  out.heard = heard;
  out.heardList = fresh.filter((h) => !h.here).map((h) => `${h.name}: ${h.label}`).join("; ");
  if (["ask", "guide"].includes(move) && c.slot && !c.person) {
    const got = new Set(P.answersFor(room, c.slot).map((x) => x.person.id));
    let p = null;
    if (!heard) { // someone spoke but said nothing for the plan: the question goes back to them
      const since = lastSaidAt(room);
      const pid = room.lines.filter((l) => l.at >= since && !got.has(l.pid)).map((l) => l.pid).pop();
      p = pid ? P.crew(room).find((x) => x.id === pid && x.mode !== "form") : null;
    }
    if (!p) p = talk.handTo(room, c.slot, { skip: fresh.map((h) => h.pid) });
    if (p) { out.to = p.name; room.handedTo = p.id; }
  }
  return out;
}
// Quick replies for the typed chat thread: the open question's options, or the two options in a clarify or split
function quickFor(room, move, c) {
  const label = (slot, v, l) => (slot === "night" ? spokenDay(l || P.labelOf(slot, v, room)) : l || P.labelOf(slot, v, room));
  if (["clarify", "conflict"].includes(move) && c.slot && c.values) return { slot: c.slot, options: c.values.map((v) => ({ value: v, label: label(c.slot, v) })) };
  if (!["ask", "welcome", "mode_lead", "mode_default", "switch_lead", "guide", "nudge"].includes(move)) return null;
  const slot = c.slot || (room.card && room.card.slot);
  if (!slot || !P.SLOTS[slot] || P.SLOTS[slot].private) return null;
  return { slot, options: P.optionsFor(slot, room).map(([value, l]) => ({ value, label: label(slot, value, l) })) };
}

// The facts the line book's {placeholders} need
function lineContext(room, f, c) {
  const nights = room.nights.map((d) => spokenDay(P.nightLabel(d)));
  const agreed = f.night.known && f.night.value.length ? spokenDay(P.nightLabel(f.night.value[0])) : null;
  const missing = [];
  if (!(room.nights.length === 1 || f.night.known)) missing.push("which night");
  if (f.budget.answered < P.need(room)) missing.push("everyone's budget");
  if (!f.origin.known) missing.push("where everyone's starting");
  return {
    crew: room.crew,
    nights: nights.length > 1 ? `${nights.slice(0, -1).join(", ")} or ${nights[nights.length - 1]}` : nights[0],
    night: agreed,
    name: c.person,
    a: c.aLabel, b: c.bLabel, a_count: c.aCount != null ? WORDS[c.aCount] || c.aCount : null, b_count: c.bCount != null ? WORDS[c.bCount] || c.bCount : null,
    loosen: c.relax, n: c.n != null ? WORDS[c.n] || c.n : null,
    pick1: c.short && c.short[0], pick2: c.short && c.short[1], why1: c.why && c.why[0], why2: c.why && c.why[1], pick: c.pick, kinds: c.kinds,
    missing: missing.length ? missing.slice(0, 2).join(" and ") : null,
    options: c.options,
    question: c.slot ? QUESTION_SPOKEN[c.slot] : null,
    heard: c.heard || null,
    to: c.to ? `, ${c.to}` : "",
    names: talk.andList(P.crew(room).filter((p) => p.mode !== "form").map((p) => p.name).slice(0, 4)),
    story1: c.story && c.story[0], story2: c.story && c.story[1],
    a_who: c.aWho, b_who: c.bWho,
    hot: c.hot,
    recap: c.recap || null, // the confirmation's plan in public words
  };
}

// Concrete ideas for an open question, from what's actually on (used when the group is unsure)
function ideasFor(room, f, slot, events) {
  const pool = P.filterEvents(events, room, f);
  const count = (pred) => pool.filter(pred).length;
  if (slot === "vibe") {
    const names = { music: "live music", comedy: "comedy", games: "a games night", dance: "dancing", arts: "art or a film" };
    const ranked = Object.keys(P.VIBES).map((v) => [v, count((e) => (e.vibes || []).some((t) => P.VIBES[v].includes(t)))]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => names[v]);
    return ranked.length ? (ranked.length > 1 ? `${ranked.slice(0, -1).join(", ")}, or ${ranked[ranked.length - 1]}` : ranked[0]) : null;
  }
  if (slot === "night") {
    const per = room.nights.map((d) => [spokenDay(P.nightLabel(d)), count((e) => P.localDay(e.startsAt) === d)]).sort((a, b) => b[1] - a[1]);
    return per.length ? `the most going on ${per[0][0]}${per[1] ? `, a bit less on ${per[1][0]}` : ""}` : null;
  }
  if (slot === "time") return "an early dinner-and-a-show kind of night, or a later one after eight";
  if (slot === "origin") return "Union, Finch, Kennedy or Kipling, whichever's closest";
  if (slot === "kind") return "a ticketed show, or just a good bar, arcade or karaoke spot you can drop into";
  return null;
}

// A signature move for the guide line: the Friend's opinion ("Saturday's the move"), the Concierge's two choices
function hotFor(room, f, slot, events) {
  const pool = P.filterEvents(events, room, f);
  if (slot === "night") {
    const per = room.nights.map((d) => [spokenDay(P.nightLabel(d)), pool.filter((e) => P.localDay(e.startsAt) === d).length]).sort((a, b) => b[1] - a[1]);
    if (per.length < 2) return null;
    return room.persona === "friend" ? `${per[0][0]}'s the move, it's got the most going on` : `${per[0][0]} or ${per[1][0]}`;
  }
  if (slot === "vibe") {
    const ranked = Object.keys(P.VIBES).map((v) => [v, pool.filter((e) => (e.vibes || []).some((t) => P.VIBES[v].includes(t))).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([v]) => talk.say(room, "vibe", v));
    if (ranked.length < 2) return null;
    return room.persona === "friend" ? `${ranked[0]}'s the move tonight` : `${ranked[0]} or ${ranked[1]}`;
  }
  return null;
}

// ---------- ElevenLabs voice agent (optional) ----------
// The planner's phone can run an ElevenLabs agent as Sidekick's voice. The agent leads the talk turn by
// turn, and uses client tools (run in the planner's browser, see agentTool below) to read the engine's
// next move and record what it heard. The engine stays the source of truth for facts, privacy and picks.
const AGENTS = () => ({ friend: process.env.ELEVENLABS_AGENT_FRIEND, concierge: process.env.ELEVENLABS_AGENT_CONCIERGE });
const agentIdFor = (room) => (process.env.ELEVENLABS_API_KEY && process.env.SIDEKICK_ELEVENLABS_OFF !== "1" ? AGENTS()[room.persona] || null : null);
const AGENT_MAX_MIN = () => Number(process.env.ELEVENLABS_MAX_CALL_MINUTES || 10);
const AGENT_CONNECTION = () => (process.env.ELEVENLABS_CONNECTION === "websocket" ? "websocket" : "webrtc");
// Is the ElevenLabs voice set up and under its minute cap? (Checks only; a call reserves when it starts.)
async function agentReady() {
  if (!process.env.ELEVENLABS_API_KEY || process.env.SIDEKICK_ELEVENLABS_OFF === "1") return false;
  if (!process.env.ELEVENLABS_AGENT_FRIEND && !process.env.ELEVENLABS_AGENT_CONCIERGE) return false;
  return usage.available("elevenlabs_minutes", AGENT_MAX_MIN());
}
async function endAgent(room, seconds) {
  if (room.agent) {
    const usedMin = Math.min(room.agent.reserved, Math.ceil(Math.max(0, Number(seconds) || 0) / 60));
    await usage.release("elevenlabs_minutes", room.agent.reserved - usedMin);
    track("sk_voice_agent", { sessionId: room.id, persona: room.persona, on: false, minutes: usedMin });
  }
  room.agentMode = false;
  room.agent = null;
  room.nextMove = null;
  room.agentNotes = [];
}
// The agent's first words (its first message, so it speaks the moment it connects, with no AI wait)
function openingSlot(room) {
  if (room.status !== "live" || room.picks || room.mode === "sidelines") return null;
  if (room.card && P.SLOTS[room.card.slot]) return room.card.slot;
  const events = [...upcoming(), ...(room.places || [])];
  const f = factsOf(room);
  return P.nextQuestion(events, room, f) || (f.budget.answered < P.need(room) ? "budget" : null);
}
function openingLine(room, person, slot) {
  const ctx = { ...lineContext(room, factsOf(room), { slot }), name: person.name };
  const back = room.said.some((x) => !x.system);
  const key = room.status !== "live" || (room.picks && room.picks.length) ? "agent_back_done" : back ? "agent_back" : P.crew(room).length < 2 ? "agent_solo" : "agent_hello";
  return personas.fallbackLine(room.persona, key, ctx);
}
const MOVE_HINT = {
  welcome: "Welcome the crew, then ask the first question",
  checkin: "Welcome everyone to SideQuest and ask: should you lead the planning, or sit back while they fill in the plan on their screens?",
  mode_lead: "They want you to lead. Confirm, then ask this question",
  mode_default: "Nobody answered, so take the lead lightly, then ask this question",
  mode_sidelines: "They want you to sit back. Say you'll stay quiet and they can say Sidekick if they need you",
  mode_stalled: "Things have gone quiet. Gently ask if they want you to jump in",
  switch_lead: "Someone asked you to take over. Confirm, then ask this question",
  switch_sidelines: "Someone asked you to step back. Confirm in a few words",
  ask: "Ask the group this one question",
  conflict: "Name this split kindly, with who's on each side, without taking sides, and offer a way forward",
  clarify: "Ask just this person about just the one unclear thing",
  nudge: "Gently invite this person in",
  guide: "People seem unsure. Offer these ideas and ask which sounds good",
  picks: "Present these two picks, with a reason for each, and ask everyone to vote",
  none: "Nothing fits everything. Offer to loosen one thing, without saying whose limit it is",
  answer: "Reply briefly to what was just asked",
  locked: "Confirm the locked plan warmly",
  confirm: "You have everything you need. Say so, then recap the plan in a few words; the confirmation card is on screen",
  wrap: "Point everyone to the two quick survey questions on their screen",
};
function moveText(room, move, c) {
  const opts = c.slot && c.slot !== "budget" ? P.optionsFor(c.slot, room).map(([, l]) => l).join(", ") : "";
  const detail = ["mode_lead", "mode_default", "switch_lead"].includes(move) && c.slot ? `Question: ${QUESTION_SPOKEN[c.slot]}`
    : move === "ask" || move === "welcome" ? `${PROMPTS[c.slot] || ""}${opts ? ` Options on screen: ${opts}.` : ""}${c.slot === "budget" ? " Everyone answers privately on their own screen." : ""}`
    : move === "picks" ? `${(c.story || c.picks || []).map((x, i) => `${i + 1}) ${x}`).join(" ")}${c.kinds ? ` Say which is which: ${c.kinds}.` : ""} A hook, why it fits named people, one vivid detail, then invite the vote.`
    : move === "guide" ? `Ideas: ${c.options}.`
    : move === "conflict" ? `${c.a} vs ${c.b}.`
    : move === "clarify" ? `Person: ${c.person}. ${c.aLabel} or ${c.bLabel}?`
    : move === "nudge" ? `Person: ${c.person}. Question: ${PROMPTS[c.slot] || ""}`
    : move === "none" && c.relax ? `${c.relax} would open up ${c.n} options.`
    : move === "answer" ? `${c.person} asked: "${redact(c.question || "")}"`
    : move === "locked" ? `Plan: ${c.pick}.`
    : move === "confirm" ? `Recap: ${c.recap}.` : "";
  return `${MOVE_HINT[move] || "Say this"}. ${detail}`.replace(/\s+/g, " ").trim();
}
// A note for the agent about something it can't hear: someone joined, a tap on a card, picks on screen.
// The planner's phone passes these on as contextual updates (they never make the agent reply by themselves).
function agentNote(room, text) {
  if (!room.agentMode) return;
  room.agentNotes.push({ id: id(4), text, at: now() });
  if (room.agentNotes.length > 30) room.agentNotes.shift();
}

// ---------- The loop: listen, update, decide ----------

function schedule(room, ms = QUIET_MS) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => think(room).catch((err) => console.error("Sidekick think failed:", err)), ms);
}

async function think(room) {
  if (room.thinking) return void (room.again = true);
  room.thinking = true;
  try {
    const lines = room.pending.splice(0);
    if (lines.length) {
      let out;
      try {
        out = claude.available() ? await extract(room, lines) : extractKeywords(room, lines);
      } catch (err) {
        console.error(err.message);
        out = extractKeywords(room, lines);
      }
      applyUpdates(room, out, lines);
      if (out.addressed_sidekick && !room.addressed) room.addressed = lines[lines.length - 1];
      // Chatter about something else ("did you see the leafs game"): a quick reaction, then back to the plan
      for (const l of lines) {
        const topic = talk.offTopic(l.text);
        const said = Object.values(room.answers[l.pid] || {}).some((x) => x && x.at >= l.at - 50);
        if (topic && !said && !/\bside ?kick\b/i.test(l.text)) room.aside = { topic, at: now() };
      }
      if (room.card && P.SLOTS[room.card.slot] && !P.SLOTS[room.card.slot].private) {
        const slot = room.card.slot;
        for (const l of lines) {
          const answeredSomething = Object.values(room.answers[l.pid] || {}).some((x) => x && x.at >= l.at - 50);
          if (!l.flex && !answeredSomething) room.card.idle = (room.card.idle || 0) + 1;
        }
        if (room.card.idle >= 2) room.wantGuide = slot; // two lines of chatter and nobody answered
      }
    }
    await decide(room);
  } finally {
    room.thinking = false;
    broadcast(room);
    if (room.again) { room.again = false; schedule(room, 50); }
  }
}

// Loads Google places for this call once: after the night is known and the vibe has been asked or
// answered. At most SIDEKICK_PLACES_PER_CALL searches, and none once the usage cap is near.
// Someone saying what they want ("Chinese skewers") counts as answering the vibe; a new want after the places
// loaded searches once more (within SIDEKICK_PLACES_PER_CALL searches for the whole call).
const wantKey = (f) => (f.want && f.want.known ? f.want.value.join("|").toLowerCase() : "");
const placesDue = (room, f) => (room.nights.length === 1 || f.night.known) && (f.vibe.answered > 0 || (f.want && f.want.known) || room.asked.includes("vibe") || room.asked.length >= 3)
  && (!room.placesTried || (wantKey(f) && wantKey(f) !== room.placesWant && (room.placesSearches || 0) < places.perCall()));
async function ensurePlaces(room, f) {
  if (!placesDue(room, f)) return;
  room.placesTried = true;
  if (!(await places.available())) return;
  // Near the crew: everyone's starting points so far (from the join card or the call)
  // A shared location counts as its rounded point; it goes only into the search circle, never a log
  const origins = P.crew(room).map((p) => {
    const a = room.answers[p.id] || {};
    if (!a.origin) return null;
    return a.origin.here && a.location ? { lat: a.location.lat, lng: a.location.lng } : a.origin.value;
  }).filter(Boolean);
  const wants = f.want && f.want.known ? f.want.value : [];
  room.placesWant = wantKey(f);
  const again = (room.placesSearches || 0) > 0;
  // A second round (a new want) searches just the want; the vibes' places from the first round stay
  const out = again ? await places.searchWant(wants, { origins }) : await places.forCall(f.vibe.value || [], { origins, want: wants });
  room.placesSearches = (room.placesSearches || 0) + (again ? 1 : Math.min(places.perCall(), (wants.length ? 1 : 0) + Math.max(1, new Set([...(f.vibe.value || []), ...(wants.length ? [] : ["default"])]).size)));
  if (again && !room.picks && room.status === "live") { room.places = places.dedupePlaces([out.places, room.places || []]); return; }
  if (room.picks || room.status !== "live") return; // too late: the picks went ahead without them (see decide)
  room.places = out.places;
  track("sk_places_loaded", { sessionId: room.id, persona: room.persona, n: out.places.length, capped: out.capped || null });
}

// Any "Finding your two picks" state that didn't lead to picks (the places changed the plan) goes away
async function decide(room, opts = {}) {
  try {
    return await decideNow(room, opts);
  } finally {
    if (room.think && !room.picking) { endThinking(room); broadcast(room); }
  }
}

async function decideNow(room, { forcePicks = false } = {}) {
  if (room.status !== "live" || room.picks || room.picking) return;
  if (room.confirm) return forcePicks ? finishConfirm(room, "ask") : undefined; // the confirmation card is up
  // The agent leads: no spoken check-in vote (people can still say "step back" or tap "sits back")
  if (room.agentMode && (!room.mode || room.mode === "voting")) {
    clearTimeout(room.modeTimer);
    room.mode = "lead";
    room.modeHow = "agent";
    room.modeSetAt = now();
    if (room.card && room.card.slot === "mode") room.card = null;
    track("sk_mode", { sessionId: room.id, persona: room.persona, mode: "lead", how: "agent", votes: Object.keys(room.modeVotes).length });
  }
  if (!room.mode) {
    if (room.people.length >= 2) return startCheckIn(room); // wait for a second person before saying hello
    return;
  }
  if (room.mode === "voting" && !forcePicks) return;
  if (room.wantMode) {
    const m = room.wantMode;
    room.wantMode = null;
    return setMode(room, m, "switch");
  }
  const f0 = factsOf(room);
  if (placesDue(room, f0)) {
    // The places search can take a while (up to 2 searches of 6 s). If the engine is about to make
    // picks anyway, show the steps now and give the search only a short head start.
    const pre = P.readiness([...upcoming(), ...(room.places || [])], room, f0);
    if (pre.ready || (forcePicks && pre.pool >= 2)) {
      startThinking(room, { placesPending: true });
      await beforeDeadline(ensurePlaces(room, f0).catch((err) => console.error(err.message)), now() + THINK.placesMs());
      setThinkStage(room, 1);
    } else await ensurePlaces(room, f0);
  }
  const events = [...upcoming(), ...(room.places || [])];
  const f = factsOf(room);
  const r = P.readiness(events, room, f);
  // The agent paces itself; the built-in voice keeps a gap between lines (a direct question skips it, above)
  const canSpeak = () => room.agentMode || !room.lastSaidAt || now() - room.lastSaidAt > MIN_GAP_MS;

  if (forcePicks && room.offer) { acceptOffer(room); return decideNow(room, { forcePicks }); }
  if (room.addressed) {
    const q = room.addressed;
    room.addressed = null;
    if (forcePicks || /pick|suggest|recommend|what do you think|ideas?/i.test(q.text)) {
      if (r.pool >= 2 && (room.nights.length === 1 || f.night.known)) return makePicks(room, r.list);
    }
    if (room.agentMode) return; // the agent heard the question and answers it itself
    await speak(room, "answer", { person: q.name, question: q.text, events: r.list });
    return;
  }
  if (forcePicks && r.pool >= 2) return makePicks(room, r.list);

  const quiet = room.mode === "sidelines"; // sitting back: no questions, clashes or ideas out loud
  for (const slot of quiet ? [] : ["night", "time", "vibe"]) {
    const c = f[slot].conflict;
    if (!c) continue;
    const key = `${slot}:${c.join("|")}`;
    if (room.conflictsSaid[key]) continue;
    room.conflictsSaid[key] = true;
    room.card = { slot, at: now() };
    const label = (v) => `${P.labelOf(slot, v, room)} (${(f[slot].supporters[v] || []).join(", ")})`;
    const plain = (v) => (slot === "night" ? spokenDay(P.labelOf(slot, v, room)) : P.labelOf(slot, v, room).toLowerCase());
    const who = (v) => talk.andList((f[slot].supporters[v] || []).slice(0, 2));
    await speak(room, "conflict", { slot, values: c.slice(0, 2), a: label(c[0]), b: label(c[1]), aLabel: plain(c[0]), bLabel: plain(c[1]), aWho: who(c[0]), bWho: who(c[1]), aCount: (f[slot].supporters[c[0]] || []).length, bCount: (f[slot].supporters[c[1]] || []).length });
    return;
  }

  // One person's answer was unclear ("maybe Friday, or Saturday?"): ask just them, just that
  if (!quiet && room.unclear) {
    const u = room.unclear;
    room.unclear = null;
    const a = (room.answers[u.pid] || {})[u.slot];
    if (!(a && a.at > u.at)) {
      if (!canSpeak()) { room.unclear = u; return schedule(room, MIN_GAP_MS); }
      room.card = { slot: u.slot, at: now() };
      const plain = (v) => (u.slot === "night" ? spokenDay(P.labelOf(u.slot, v, room)) : P.labelOf(u.slot, v, room).toLowerCase());
      track("sk_clarify", { sessionId: room.id, persona: room.persona, slot: u.slot });
      await speak(room, "clarify", { slot: u.slot, person: u.name, aLabel: plain(u.values[0]), bLabel: plain(u.values[1]), values: u.values.slice(0, 2) });
      return;
    }
  }

  if (!quiet && room.wantGuide && room.card && room.card.slot === room.wantGuide && !room.card.guided) {
    room.card.guided = true;
    room.wantGuide = null;
    const options = ideasFor(room, f, room.card.slot, events);
    if (options) {
      track("sk_guided", { sessionId: room.id, persona: room.persona, slot: room.card.slot });
      const turn = room.said.filter((x) => !x.system).length;
      await speak(room, "guide", { slot: room.card.slot, options, hot: turn % 3 === 0 ? hotFor(room, f, room.card.slot, events) : null });
      return;
    }
  }
  room.wantGuide = null;

  // A form waits for everyone the planner invited (or for "Pick now")
  const waitingOn = room.form && (room.expected || []).length > 0 && expectedView(room).some((x) => !x.answered && !x.link);
  if (r.ready && !waitingOn) {
    if (room.reopened && !reopenedAnswered(room)) return; // a fact reopened from the confirmation: wait for its answer
    room.reopened = null;
    return wantsConfirm(room) ? startConfirm(room) : makePicks(room, r.list);
  }
  if (r.ready && waitingOn) return;
  if (r.reason === "too-few" && (f.night.known || room.nights.length === 1) && f.budget.known) {
    const best = P.bestRelax(events, room, f);
    const key = best ? best.kind : "none";
    if (room.offerSaid !== key) {
      room.offerSaid = key;
      room.offer = best ? best.kind : null;
      await speak(room, "none", best ? { relax: P.RELAX_WORDS[best.kind], n: best.n } : {});
    }
    return;
  }

  if (quiet) {
    if (!room.card || room.card.slot !== "form") room.card = { slot: "form", at: now() };
    return;
  }
  const askOrigin = room.askOrigin && P.crew(room).some((p) => !(room.answers[p.id] || {}).origin);
  room.askOrigin = false;
  const slot = (askOrigin ? "origin" : null) || P.nextQuestion(events, room, f) || (f.budget.answered < P.need(room) ? "budget" : null);
  if (!slot) return;
  if (!room.card || room.card.slot !== slot) {
    const first = !room.said.length;
    if (!first && !canSpeak()) return schedule(room, MIN_GAP_MS);
    room.card = { slot, at: now() };
    room.asked.push(slot);
    track("sk_question_asked", { sessionId: room.id, persona: room.persona, slot, pool: r.pool, n: room.asked.length });
    // A recap that sounds spoken: "Saturday, after 6, live music", not "Sat, Nov 28, After 6, Live music"
    const spoken = (r) => (r.slot === "night" ? r.value.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+\w+\s+\d+/g, (m) => ({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" })[m.slice(0, 3)]) : r.slot === "origin" ? "" : r.value.toLowerCase());
    const recap = rows(room, f).filter((x) => x.state === "done" && !P.SLOTS[x.slot].private).map(spoken).filter(Boolean).join(", ");
    await speak(room, first ? "welcome" : "ask", { slot, recap, events: slot === "origin" ? r.list : [] });
  }
}

// Every few seconds: invite in anyone who hasn't answered the open question, once per question
function nudgeTick() {
  for (const room of rooms.values()) {
    if (now() - room.touched > IDLE_MS) { endRoom(room, "idle"); continue; }
    // The planner's phone went away without saying the agent stopped (a crash, a killed tab): after 45 s
    // with no live stream from it, give the call back to the built-in voice and return the unused minutes
    if (room.agent) {
      const planner = room.people.find((p) => p.role === "planner");
      if (planner && room.streams.has(planner.id)) room.agent.lostAt = 0;
      else if (!room.agent.lostAt) room.agent.lostAt = now();
      else if (now() - room.agent.lostAt > 45000) {
        endAgent(room, (now() - room.agent.startedAt) / 1000).then(() => { if (room.card && P.SLOTS[room.card.slot]) room.card = null; broadcast(room); schedule(room, 300); });
        continue;
      }
    }
    if (room.status !== "live" || room.picks || !room.card || room.thinking || room.agentMode) continue; // the agent does its own nudging
    if (room.mode === "sidelines") {
      const last = Math.max(room.modeSetAt || 0, ...room.lines.map((l) => l.at), ...Object.values(room.answers).flatMap((a) => Object.values(a).map((x) => x.at || 0)));
      if (!room.stalledAsked && now() - last > 60000) { room.stalledAsked = true; speak(room, "mode_stalled", {}).then(() => broadcast(room)); }
      continue;
    }
    if (room.mode !== "lead") continue;
    // Someone in the call who hasn't said or tapped anything for about 20 s, while others talk:
    // invite them in gently by name, at most once each
    if (P.SLOTS[room.card.slot] && !P.SLOTS[room.card.slot].private && (!room.lastSaidAt || now() - room.lastSaidAt > 6000) && room.lines.some((l) => now() - l.at < 60000)) {
      const lastFrom = (p) => Math.max(p.joinedAt, p.lastSpokeAt || 0, ...Object.values(room.answers[p.id] || {}).map((x) => (x && x.at) || 0));
      const silent = P.crew(room).find((p) => p.mode !== "form" && !room.invited[p.id] && (!room.streams.size || room.streams.has(p.id)) && now() - lastFrom(p) > SILENT_MS());
      if (silent) {
        room.invited[silent.id] = true;
        track("sk_invited", { sessionId: room.id, persona: room.persona });
        speak(room, "nudge", { slot: room.card.slot, person: silent.name }).then(() => broadcast(room));
        continue;
      }
    }
    const slot = room.card.slot;
    if (now() - room.card.at < NUDGE_AFTER_MS || (room.lastSaidAt && now() - room.lastSaidAt < NUDGE_AFTER_MS)) continue;
    const got = P.answersFor(room, slot).map((x) => x.person.id);
    if (!P.SLOTS[slot] || P.SLOTS[slot].private) continue;
    if (!got.length) {
      const quietSince = Math.max(room.card.at, ...room.lines.map((l) => l.at));
      if (!room.card.guided && now() - quietSince > 30000) { room.wantGuide = slot; schedule(room, 10); }
      continue;
    }
    const quiet = P.crew(room).find((p) => p.mode !== "form" && !got.includes(p.id) && !(room.nudged[slot] || []).includes(p.id) && !room.invited[p.id]);
    if (!quiet) continue;
    room.nudged[slot] = [...(room.nudged[slot] || []), quiet.id];
    room.invited[quiet.id] = true;
    speak(room, "nudge", { slot, person: quiet.name }).then(() => broadcast(room));
  }
}
setInterval(nudgeTick, 5000).unref();

// "Sat" and "7:30 PM" in Toronto time, for event picks; spoken: "7:30", "8"
const dayShortFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
const startDay = (iso) => dayShortFmt.format(new Date(iso));
function startTime(iso, spoken = false) {
  const t = timeFmt.format(new Date(iso)).replace(":00", "");
  return spoken ? t.replace(/\s?[AP]M$/, "") : t;
}

// ---------- "I've got everything": a short confirmation before the picks ----------
// When the engine has enough to pick, everyone sees a card with Sidekick's line and the plan so far in public
// words only ("Saturday after 8 · Live music · around Union · under $30 for the group"): never a name, never
// anyone's own budget or the areas they'd rather avoid. "Looks good" (or about 4 s with no tap) goes on to the
// steps and the picks; "Change something" pauses it and each fact becomes a button that reopens its card.
// Calls nobody is watching (the unit tests) and forms skip it; so does asking for picks outright.
const CONFIRM_MS = () => Number(process.env.SIDEKICK_CONFIRM_MS == null ? 4000 : process.env.SIDEKICK_CONFIRM_MS);
const CONFIRM_HEAD = { friend: "Okay, I think I've got it!", concierge: "Thank you, I have everything I need." };
const wantsConfirm = (room) => CONFIRM_MS() > 0 && !room.form && !room.confirmed && (room.streams.size > 0 || room.agentMode);
const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
function confirmFacts(room, f = factsOf(room)) {
  const out = [];
  const nights = f.night.known && f.night.value.length ? f.night.value : room.nights;
  out.push({ slot: "night", text: nights.map((d) => spokenDay(P.nightLabel(d))).join(" or ") });
  if (f.time.known && f.time.value.length) out.push({ slot: "time", text: [].concat(f.time.value).map((v) => lower(P.labelOf("time", v, room))).join(" or "), join: " " });
  // A specific cuisine or venue ("Chinese skewers"), when the crew said one (the want fact, if this build has it)
  const w = f.want || null;
  const wantText = w && w.value != null && [].concat(w.value).length ? [].concat(w.value).map((v) => { try { return P.labelOf("want", v, room) || String(v); } catch { return String(v); } }).join(", ") : typeof room.want === "string" && room.want ? room.want : null;
  if (wantText) out.push({ slot: P.SLOTS.want ? "want" : "vibe", text: wantText });
  else if (f.vibe.value && f.vibe.value.length) out.push({ slot: "vibe", text: f.vibe.value.slice(0, 2).map((v) => P.labelOf("vibe", v, room)).join(" + ") });
  if (f.kind && f.kind.known && f.kind.value.length === 1 && f.kind.value[0] !== "either" && room.places && room.places.length) out.push({ slot: "kind", text: lower(P.labelOf("kind", f.kind.value[0], room)) });
  const from = [...new Set(P.answersFor(room, "origin").map((x) => originLabel(room, x, null)))].filter(Boolean);
  if (from.length === 1) out.push({ slot: "origin", text: `around ${from[0].replace(/^near /, "")}` });
  else if (from.length > 1) out.push({ slot: "origin", text: `from ${talk.andList(from.slice(0, 3))}` });
  const budget = P.budgetLabel(f, room); // the group label only, never whose
  if (budget) out.push({ slot: "budget", text: lower(budget) });
  return out;
}
const recapText = (facts, sep = " · ") => facts.map((x, i) => (i && x.join ? x.join : i ? sep : "") + x.text).join("");
async function startConfirm(room) {
  const facts = confirmFacts(room);
  room.card = null;
  room.confirm = { at: now(), until: now() + CONFIRM_MS(), facts, editing: false };
  room.confirmTimer = setTimeout(() => finishConfirm(room, "auto").catch((err) => console.error(err)), CONFIRM_MS());
  track("sk_confirm_shown", { sessionId: room.id, persona: room.persona, facts: facts.length });
  broadcast(room);
  if (room.agentMode) agentNote(room, `[app] You have everything you need; a confirmation card is on everyone's screens with: ${recapText(facts, ", ")}. Say it in one short line, like: "${personas.fallbackLine(room.persona, "confirm", { recap: recapText(facts, ", ") })}" Then wait: the steps and picks follow on their own.`);
  await speak(room, "confirm", { recap: recapText(facts, ", "), deadline: now() + 1500, lateKey: "confirm" });
  broadcast(room);
}
// how: "ok" (Looks good), "auto" (nobody tapped), "ask" (someone asked for picks outright)
async function finishConfirm(room, how) {
  if (!room.confirm) return;
  clearTimeout(room.confirmTimer);
  room.confirm = null;
  room.confirmed = true;
  if (room.status !== "live") return;
  track("sk_confirm_done", { sessionId: room.id, persona: room.persona, how });
  const events = [...upcoming(), ...(room.places || [])];
  const r = P.readiness(events, room, factsOf(room));
  if (r.pool >= 2) {
    // The confirmation hands over to the steps: they show at once and stay up long enough to read
    const t = startThinking(room);
    t.visible = true;
    t.minUntil = now() + THINK.afterConfirmMs();
    broadcast(room);
    await makePicks(room, r.list);
  } else { room.confirmed = false; schedule(room, 300); }
  broadcast(room);
}
function changeConfirm(room) {
  if (!room.confirm) return false;
  clearTimeout(room.confirmTimer);
  room.confirm.editing = true;
  room.confirm.until = null;
  return true;
}
// A fact tapped on the card: its question comes back; the confirmation shows again once it's answered
function reopenFact(room, slot) {
  if (!room.confirm || !(P.SLOTS[slot] || slot === "want")) return false;
  clearTimeout(room.confirmTimer);
  room.confirm = null;
  room.reopened = { slot: P.SLOTS[slot] ? slot : "vibe", at: now() };
  if (room.mode !== "sidelines") room.card = { slot: room.reopened.slot, at: now() };
  track("sk_confirm_reopen", { sessionId: room.id, persona: room.persona, slot });
  return true;
}
const reopenedAnswered = (room) => room.reopened && P.answersFor(room, room.reopened.slot).some((x) => x.a && x.a.at > room.reopened.at);

// ---------- While Sidekick finds the picks: show the work ----------
// Picks can take a while (places search, the AI choosing, the AI writing the line). Instead of silence,
// the plan board turns into a short checklist with real numbers from the engine, Sidekick says how it's
// going, and after about 12 s it stops waiting for the AI and shows the engine's own top two.
// Steps and lines never carry a private answer: "everyone's budget", never an amount or an avoided area.
const THINK = {
  revealMs: () => Number(process.env.SIDEKICK_THINK_REVEAL_MS || 270), // faster than this: no checklist at all
  stepMs: () => Number(process.env.SIDEKICK_THINK_STEP_MS || 450), // the board ticks at most one step this often
  progressMs: () => Number(process.env.SIDEKICK_PROGRESS_MS || 3000), // "There's like 46 things on Saturday..."
  stillMs: () => Number(process.env.SIDEKICK_STILL_MS || 10000), // "Still looking..."
  giveUpMs: () => Number(process.env.SIDEKICK_PICKS_MAX_MS || 12000), // the engine's own top two
  placesMs: () => Number(process.env.SIDEKICK_PLACES_WAIT_MS || 3000), // most the places search may hold up picks
  afterConfirmMs: () => Number(process.env.SIDEKICK_CONFIRM_STEPS_MS || 1600), // after the confirmation card, the steps show at least this long
};
const LATE = Symbol("late");
// A promise's result, or LATE once the deadline (a time) passes. A late failure is swallowed.
function beforeDeadline(promise, deadline) {
  const p = Promise.resolve(promise);
  p.catch(() => {});
  const ms = deadline - now();
  if (ms <= 0) return Promise.resolve(LATE);
  let timer;
  return Promise.race([p, new Promise((r) => { timer = setTimeout(() => r(LATE), ms); })]).finally(() => clearTimeout(timer));
}
const STEP_KEYS = ["look", "fit", "budget", "vibe", "choose"];
const TIME_WORDS = { early: "in the afternoon", evening: "after 6", late: "after 8" };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The numbers the steps and lines use, straight from the engine
function thinkNumbers(room) {
  const f = factsOf(room);
  const events = upcoming();
  const all = [...events, ...(room.places || [])];
  // What fits the night and time alone (no budget, area or trip limits, so nothing private shows)
  const loose = { ...f, budget: { ...f.budget, value: null }, nos: { ...f.nos, value: [] }, origin: { ...f.origin, value: [] } };
  const fit = P.filterEvents(all, room, loose);
  const nights = f.night.known && f.night.value.length ? f.night.value : room.nights;
  const night = nights.length === 1 ? spokenDay(P.nightLabel(nights[0])) : nights.map((d) => spokenDay(P.nightLabel(d))).join(" or ");
  const time = f.time.known && f.time.value.length ? ["early", "evening", "late"].find((t) => f.time.value.includes(t)) : null;
  const pool = P.filterEvents(all, room, f);
  const hasPlace = pool.some((e) => e.type === "place"), hasEvent = pool.some((e) => e.type !== "place");
  const one = f.kind && f.kind.known && f.kind.value.length === 1 ? f.kind.value[0] : null;
  const mixed = hasPlace && hasEvent && one !== "events" && one !== "places";
  return { events: events.length, places: (room.places || []).length, fit: fit.length, night, when: `${night}${time ? ` ${TIME_WORDS[time]}` : ""}`, choose: mixed ? "Choosing one show and one spot" : hasPlace && !hasEvent ? "Choosing your two spots" : "Choosing your two picks" };
}
function thinkLabels(room) {
  const t = room.think;
  const n = t.n;
  const look = t.placesPending
    ? `Checking ${plural(n.events, "event", "events")} and places nearby`
    : `Checked ${plural(n.events, "event", "events")}${n.places ? ` and ${plural(n.places, "place", "places")}` : ""}`;
  return { look, fit: `${n.fit} fit ${n.when}`, budget: "Keeping what fits everyone's budget", vibe: "Matching your vibes", choose: n.choose };
}
// The real stage: 0 looking (places), 1 to 2 filtering (instant), 3 the AI matching, 4 writing the line, 5 done.
// What the board shows ("shown") follows it one step at a time, so it reads as live, never ahead of the work.
function startThinking(room, { placesPending = false } = {}) {
  if (room.think) return room.think;
  const t = (room.think = { startedAt: now(), stage: placesPending ? 0 : 3, shown: 0, visible: false, placesPending, timers: [], said: [] });
  t.n = thinkNumbers(room);
  t.timers.push(setTimeout(() => { if (room.think === t) { t.visible = true; broadcast(room); } }, THINK.revealMs()));
  t.timers.push(setInterval(() => {
    if (room.think !== t || t.shown >= Math.min(t.stage, STEP_KEYS.length - 1)) return;
    t.shown++;
    if (t.visible) broadcast(room);
  }, THINK.stepMs()));
  t.timers.push(setTimeout(() => sayProgress(room, t, "progress"), THINK.progressMs()));
  t.timers.push(setTimeout(() => sayProgress(room, t, "still"), THINK.stillMs()));
  return t;
}
function setThinkStage(room, stage) {
  const t = room.think;
  if (!t) return;
  t.stage = Math.max(t.stage, stage);
  if (t.placesPending && stage > 0) { t.placesPending = false; t.n = thinkNumbers(room); if (t.visible) broadcast(room); } // now with the places count
}
function endThinking(room) {
  const t = room.think;
  if (!t) return;
  for (const x of t.timers) { clearTimeout(x); clearInterval(x); }
  room.think = null;
}
function thinkingView(room) {
  const t = room.think;
  if (!t || !t.visible) return null;
  const labels = thinkLabels(room);
  return { steps: STEP_KEYS.map((k, i) => ({ label: labels[k], state: i < t.shown ? "done" : i === t.shown ? "now" : "next" })), startedAt: t.startedAt };
}
// "There's like 46 things on Saturday..." (about 3 s), "Still looking..." (about 10 s), in the persona's
// voice from the line book (no AI wait). With the ElevenLabs agent leading, the server doesn't speak: the
// line goes to the agent as context (and get_picks / get_next_move return it), so the agent can say it.
function progressLine(room, key, t = room.think) {
  const n = t ? t.n : thinkNumbers(room);
  return personas.fallbackLine(room.persona, key, { n: WORDS[n.fit] || String(n.fit), night: n.night }, room.said.filter((x) => !x.system).slice(-3).map((x) => x.text));
}
function sayProgress(room, t, key) {
  if (room.think !== t || room.status !== "live") return;
  const text = progressLine(room, key, t);
  t.said.push({ key, text });
  t.lastLine = text;
  track("sk_thinking_line", { sessionId: room.id, persona: room.persona, key, agent: room.agentMode, secs: Math.round((now() - t.startedAt) / 1000) });
  if (room.agentMode) {
    agentNote(room, `[app] Still finding the two picks; the steps are on everyone's screens. If nobody's talking, say one short line like: "${text}"`);
  } else {
    room.said.push({ id: id(4), text, move: key, at: now() });
    if (room.said.length > 20) room.said.shift();
    room.lastSaidAt = now();
  }
  broadcast(room);
}

async function makePicks(room, list) {
  if (room.picks || room.picking) return;
  room.picks = []; // under way: nothing else asks or picks meanwhile (the view still shows no picks)
  room.picking = true;
  const t = startThinking(room);
  const deadline = t.startedAt + THINK.giveUpMs();
  try {
    setThinkStage(room, 3);
    await pickTwo(room, list, deadline);
  } finally {
    room.picking = false;
    endThinking(room);
  }
}

async function pickTwo(room, list, deadline) {
  const f = factsOf(room);
  const people = P.crew(room).map((p) => {
    const a = room.answers[p.id];
    const vibes = [a.want ? [].concat(a.want.value).join(", ") : null, a.vibe ? a.vibe.value.map((v) => P.labelOf("vibe", v, room)).join(", ") : null].filter(Boolean).join(", ") || "anything fun";
    return { name: p.name, interests: vibes, origin: a.origin ? a.origin.value : undefined };
  });
  const pool = list.slice(0, 25);
  let matches = [];
  let late = false;
  try {
    const out = await beforeDeadline(ai.match(people, pool, 2), deadline);
    if (out === LATE) late = true; // stop waiting: the engine's own ranking (by score) decides
    else matches = (out && out.matches) || [];
  } catch (err) {
    console.error(err.message);
  }
  matches = matches.filter((m) => pool.some((e) => e.id === m.id));
  // "Plan it" from Saved: the event the planner started from goes first when it fits every hard limit
  const cand = room.candidate != null ? list.find((e) => e.id === room.candidate) : null;
  if (cand) {
    if (!pool.includes(cand)) pool.push(cand);
    matches = [{ id: cand.id, reason: "The one you saved", fits: {} }, ...matches.filter((m) => m.id !== cand.id)];
  }
  // The list is already ranked by the engine's score, and holds only what obeys every hard limit
  for (const e of pool) if (matches.length < 2 && !matches.some((m) => m.id === e.id)) matches.push({ id: e.id, reason: "", fits: {} });
  // Someone asked for something specific ("Chinese skewers"): the pick that shows it best goes first, whatever the
  // AI or keyword matcher preferred (both only see a pool that already obeys the request)
  if (P.wantPlan(f)) {
    const fit = (m) => P.wantFit(pool.find((x) => x.id === m.id) || {}, f);
    const best = pool.filter((e) => P.wantFit(e, f) >= 0.5).sort((x, y) => P.wantFit(y, f) - P.wantFit(x, f) || pool.indexOf(x) - pool.indexOf(y))[0];
    if (best && !matches.slice(0, 2).some((m) => m.id === best.id)) matches.unshift({ id: best.id, reason: "", fits: {} });
    matches = [...matches.slice(0, 2).sort((x, y) => fit(y) - fit(x)), ...matches.slice(2)];
  }
  setThinkStage(room, 4);
  // Unless the crew asked for only events or only places, show one of each when both fit: the
  // best event from the listings and the best place from Google, so the crew sees both options.
  const typeOf = (id) => ((pool.find((x) => x.id === id) || {}).type === "place" ? "place" : "event");
  const mixed = !(f.kind && f.kind.known && f.kind.value.length === 1 && f.kind.value[0] !== "either");
  if (mixed && matches.length >= 2 && typeOf(matches[0].id) === typeOf(matches[1].id)) {
    const other = list.find((e) => (e.type === "place" ? "place" : "event") !== typeOf(matches[0].id));
    if (other) {
      if (!pool.includes(other)) pool.push(other);
      matches[1] = { id: other.id, reason: "", fits: {} };
    }
  }
  const picks = matches.slice(0, 2).map((m) => {
    const e = pool.find((x) => x.id === m.id);
    if (e.type === "place") {
      const night = f.night.known && f.night.value.length ? f.night.value[0] : room.nights[0];
      const b = f.time.known && f.time.value.length ? f.time.value[0] : "evening";
      const hours = places.closesLabel(e.hours, new Date(night + "T12:00:00").getDay(), { early: 15, evening: 19, late: 21 }[b]);
      // A place: no start time and no ticket. Drop in while it's open; price is a rough spend per person.
      return { id: e.id, kind: "place", date: night, title: e.title, when: `${hours} · drop in any time`, night: spokenDay(P.nightLabel(night)), stretch: [...room.relax].map((k) => P.RELAX_WORDS[k]), price: e.price === 0 ? "Free" : e.price != null ? `${e.priceNote ? `${e.priceNote} · ` : ""}about $${e.price} each` : e.priceNote || "Price not listed", where: e.neighbourhood || "", rating: e.rating || null, ratingCount: e.ratingCount || 0, placeType: places.placeType(e.tags), reason: m.reason || "", fits: m.fits || {}, url: e.mapsUrl, attribution: "Google Maps" };
    }
    // An event: a day and a start time, and a ticket price
    return { id: e.id, kind: "event", date: e.startsAt ? P.localDay(e.startsAt) : null, title: e.title, when: e.startsAt ? `${startDay(e.startsAt)} · starts ${startTime(e.startsAt)}` : e.date, stretch: [...room.relax].map((k) => P.RELAX_WORDS[k]), price: e.price === 0 ? "Free" : e.price != null ? `$${e.price} ticket` : "Price not listed", where: [e.venue && e.venue.name, e.neighbourhood].filter(Boolean).join(", "), startsAt: e.startsAt || null, reason: m.reason || "", fits: m.fits || {}, url: e.sourceUrl || null };
  });
  const whyOf = (p) => {
    const e = pool.find((x) => x.id === p.id);
    if (e.type === "place") return [e.rating ? `rated ${e.rating}` : null, e.neighbourhood && `in ${e.neighbourhood}`, e.price != null ? `about ${e.price} dollars each` : null].filter(Boolean).join(", ");
    const vibe = (e.vibes || [])[0];
    return [[vibe && vibe.toLowerCase(), e.neighbourhood && `in ${e.neighbourhood}`].filter(Boolean).join(" "), e.price === 0 ? "and it's free" : e.price != null ? `about ${e.price} dollars` : null].filter(Boolean).join(", ");
  };
  // Say out loud which is which: "one's a show at 7:30, the other's a bar you can drop into"
  const kinds = personas.kindsLine(room.persona, picks.map((p) => ({ kind: p.kind, time: p.startsAt ? startTime(p.startsAt, true) : null, type: p.placeType })));
  // The line is written before the cards go up, so both land together. Past the deadline it's the
  // line book's plain "here's what I've got so far" with the two names.
  // Each pick as a short story: a hook, a vivid detail, why it fits named people
  const story = talk.stories(room, picks.map((p) => ({ ...pool.find((x) => x.id === p.id), placeType: p.placeType })), room.persona, f);
  const spokenName = (p) => { const e = pool.find((x) => x.id === p.id); return talk.spokenTitle(p.title, e && e.venue && e.venue.name); };
  await speak(room, "picks", { kinds, story, why: picks.map(whyOf), short: picks.map(spokenName), picks: picks.map((p) => `${p.title} (${p.when}, ${p.price || "price TBC"}, ${p.where})`), events: pool.filter((e) => picks.some((p) => p.id === e.id)), deadline, late, lateKey: "fallback" });
  if (room.status !== "live") return;
  // Who each pick is for and a crew match %, from each person's own vibe answers (never budgets or areas)
  const members = P.answersFor(room, "vibe").map((x) => ({ id: x.person.id, name: x.person.name }));
  for (const p of picks) {
    const e = pool.find((x) => x.id === p.id);
    if (!e || !members.length) continue;
    const fits = P.crewFits(e, room).fits;
    room.history.push({ fits });
    p.who = rank.whoFor(fits, members);
    p.crewMatch = rank.crewMatch(fits);
  }
  // The Wildcard: an event outside the vibes the crew asked for that still fits every hard limit, by Thompson sampling
  const asked = new Set(picks.flatMap((p) => ((pool.find((x) => x.id === p.id) || {}).vibes || []).slice(0, 1)));
  const wc = rank.wildcard(list.slice(2, 60).filter((e) => e.type !== "place" && !picks.some((p) => p.id === e.id)), { avoid: [...asked], rand: rank.rng(room.createdAt % 100000), scoreOf: (e) => -list.indexOf(e) });
  room.wildcard = wc ? { id: wc.event.id, title: wc.event.title, when: wc.event.startsAt ? `${startDay(wc.event.startsAt)} · starts ${startTime(wc.event.startsAt)}` : wc.event.date, price: wc.event.price === 0 ? "Free" : wc.event.price != null ? `$${wc.event.price} ticket` : "Price not listed", where: [wc.event.venue && wc.event.venue.name, wc.event.neighbourhood].filter(Boolean).join(", "), why: wc.why.replace("your usual", "what the crew asked for"), url: wc.event.sourceUrl || null } : null;
  // After a confirmation, the steps stay up a moment (they read as the work being done, not a flash)
  if (room.think && room.think.minUntil > now()) await new Promise((r) => setTimeout(r, room.think.minUntil - now()));
  if (room.status !== "live") return;
  if (cand) picks.forEach((p) => { if (p.id === cand.id) p.candidate = true; });
  else if (room.candidate != null) {
    // It doesn't fit everything the crew said: shown in the Wildcard's place, for a look
    const e = upcoming().find((x) => x.id === room.candidate);
    if (e) room.wildcard = { id: e.id, title: e.title, when: e.startsAt ? `${startDay(e.startsAt)} · starts ${startTime(e.startsAt)}` : e.date, price: e.price === 0 ? "Free" : e.price != null ? `$${e.price} ticket` : "Price not listed", where: [e.venue && e.venue.name, e.neighbourhood].filter(Boolean).join(", "), why: "The event you saved. It doesn't fit everything the crew said, so it's here for a look.", url: e.sourceUrl || null, candidate: true };
  }
  room.picks = picks;
  room.card = null;
  broadcast(room); // the cards replace the steps now, even when a tool started this and stopped waiting
  track("call_facts_complete", { sessionId: room.id, persona: room.persona, secs: Math.round((now() - room.createdAt) / 1000), questions: room.asked.length });
  track("picks_shown", { sessionId: room.id, persona: room.persona, pool: list.length, waitMs: room.think ? now() - room.think.startedAt : 0, engine: late || undefined });
}

// ---------- Ending, saving the summary ----------

function endRoom(room, why) {
  if (room.status === "ended") return;
  room.status = "ended";
  room.lines = []; // the transcript is never kept
  room.pending = [];
  room.heard = []; // nor what Sidekick heard, with names
  room.unclear = null;
  room.aside = null;
  for (const a of Object.values(room.answers)) delete a.location; // shared locations go with it
  const f = factsOf(room);
  const summary = {
    room: room.id,
    persona: room.persona,
    endedAt: new Date().toISOString(),
    why,
    crewSize: P.crew(room).length,
    modes: P.crew(room).map((p) => p.mode),
    secs: Math.round((now() - room.createdAt) / 1000),
    questions: room.asked,
    mode: room.mode,
    modeHow: room.modeHow,
    facts: { night: f.night.value, time: f.time.value, vibe: f.vibe.value, budget: P.budgetLabel(f, room) },
    picks: (room.picks || []).map((p) => p.id),
    locked: room.locked && room.locked.id,
    surveys: Object.values(room.surveys),
  };
  try {
    fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
    fs.appendFileSync(SUMMARY_FILE, JSON.stringify(summary) + "\n");
  } catch (err) {
    console.error("Couldn't save the Sidekick summary:", err.message);
  }
  clearTimeout(room.deadlineTimer);
  clearTimeout(room.confirmTimer);
  try { callside.saveRecap(room); } catch (err) { console.error("Couldn't save call recaps:", err.message); }
  track("sk_call_ended", { sessionId: room.id, persona: room.persona, why, secs: summary.secs, locked: Boolean(room.locked) });
  broadcast(room);
  setTimeout(() => { for (const res of room.streams.values()) res.end(); rooms.delete(room.id); }, 30 * 60 * 1000).unref();
}

// ---------- What each person sees ----------

// The board. `viewer` (a person id) sees their own shared location as "near you"; everyone else sees
// its neighbourhood ("near Koreatown"). Without a viewer (Sidekick's own prompt) it's the neighbourhood.
function originLabel(room, x, viewer) {
  if (!x.a.here) return P.labelOf("origin", x.a.value, room);
  return x.person.id === viewer ? "near you" : x.a.near || "near their spot";
}
function rows(room, f = factsOf(room), viewer = null) {
  // "Looking for: Chinese skewers" only once someone has said something specific
  return ["night", "time", "budget", "origin", "vibe", ...(f.want && f.want.known ? ["want"] : []), ...(room.places && room.places.length ? ["kind"] : [])].map((slot) => {
    const g = f[slot];
    let value = null;
    let who = "";
    if (slot === "want") { value = g.value.join(", "); who = [...new Set(Object.values(g.supporters).flat())].join(", "); }
    else if (slot === "budget") { value = P.budgetLabel(f, room); who = g.answered ? `private · ${g.answered} of ${P.crew(room).length}` : ""; }
    else if (slot === "origin" && g.value && g.value.length) { value = [...new Set(P.answersFor(room, "origin").map((x) => originLabel(room, x, viewer)))].join(", "); who = [...new Set(Object.values(g.supporters).flat())].join(", "); }
    else if (slot === "vibe") { value = g.value && g.value.length ? g.value.slice(0, 2).map((v) => P.labelOf(slot, v, room)).join(" + ") : null; who = g.value && g.value[0] ? (g.supporters[g.value[0]] || []).join(", ") : ""; }
    else if (g.value && g.value.length) { value = [].concat(g.value).map((v) => P.labelOf(slot, v, room)).join(slot === "origin" ? ", " : " or "); who = [...new Set(Object.values(g.supporters).flat())].join(", "); }
    const state = g.conflict ? "conflict" : room.card && room.card.slot === slot ? "asking" : g.known ? "done" : "todo";
    return { slot, label: P.SLOTS[slot].label, value, who, state, conflict: g.conflict ? g.conflict.map((v) => `${P.labelOf(slot, v, room)} (${(g.supporters[v] || []).join(", ")})`) : null };
  });
}

const MODE_OPTIONS = [["lead", "Take the lead"], ["sidelines", "We'll fill it in"]];
// A card's options with who picked each. "Starting from" adds "My location" for someone who shared
// theirs, and never puts a location-sharer's initial on a station chip.
function slotOptions(room, person, slot) {
  const mine = room.answers[person.id] || {};
  const voters = {};
  for (const x of P.answersFor(room, slot)) {
    if (slot === "origin" && x.a.here) { if (x.person.id === person.id) voters.here = [initial(x.person.name)]; continue; }
    for (const v of [].concat(x.a.value)) voters[v] = [...(voters[v] || []), initial(x.person.name)];
  }
  const chosen = !mine[slot] ? [] : slot === "origin" && mine.origin.here ? ["here"] : [].concat(mine[slot].value);
  const opts = slot === "origin" && mine.location ? [["here", "My location"], ...P.optionsFor(slot, room)] : P.optionsFor(slot, room);
  return opts.map(([value, label]) => ({ value, label, voters: voters[value] || [], mine: chosen.includes(value) }));
}
function cardFor(room, person) {
  const mine = room.answers[person.id] || {};
  if (room.status !== "live" || room.picks || room.think || room.confirm) return null; // no question while the picks are found
  if (room.mode === "voting") {
    const votes = {};
    for (const [pid, v] of Object.entries(room.modeVotes)) { const who = room.people.find((x) => x.id === pid); if (who) votes[v] = [...(votes[v] || []), initial(who.name)]; }
    return { slot: "mode", private: false, multi: false, prompt: "How should Sidekick help?", note: "Tap or just say it. Sidekick leads if nobody answers.", options: MODE_OPTIONS.map(([value, label]) => ({ value, label, voters: votes[value] || [], mine: room.modeVotes[person.id] === value })) };
  }
  if (room.mode === "sidelines") {
    const slotCard = (slot) => ({ slot, prompt: PROMPTS[slot], multi: P.SLOTS[slot].multi, options: slotOptions(room, person, slot) });
    const slots = [...(room.nights.length > 1 ? ["night"] : []), "time", "vibe", "origin", ...(room.places && room.places.length ? ["kind"] : [])];
    return {
      form: true,
      slots: slots.map(slotCard),
      budget: mine.budget ? { done: true } : { slot: "budget", private: true, prompt: PROMPTS.budget, options: P.optionsFor("budget", room).map(([value, label]) => ({ value, label, voters: [] })) },
    };
  }
  // Private: budget, when it's the open question and this person hasn't answered
  if (room.card && room.card.slot === "budget") {
    const reopened = room.reopened && room.reopened.slot === "budget" && !(mine.budget && mine.budget.at > room.reopened.at);
    if (mine.budget && !reopened) return { slot: "budget", private: true, waiting: true, prompt: "Thanks. Waiting on the others", options: [] };
    return { slot: "budget", private: true, prompt: PROMPTS.budget, multi: false, options: P.optionsFor("budget", room).map(([value, label]) => ({ value, label, voters: [] })) };
  }
  if (!room.card) return null;
  const slot = room.card.slot;
  return { slot, private: false, prompt: PROMPTS[slot], multi: P.SLOTS[slot].multi, options: slotOptions(room, person, slot) };
}

// The card says when it went up, so phones can wait a moment for a spoken answer before showing it
function withCardAt(room, card) {
  if (card && room.card && !card.form) { card.at = room.card.at; card.lead = room.mode === "lead"; }
  return card;
}
function viewFor(room, pid) {
  const me = room.people.find((p) => p.id === pid);
  const f = factsOf(room);
  const r = rows(room, f, pid);
  const votes = {};
  for (const [p, ev] of Object.entries(room.votes)) {
    const who = room.people.find((x) => x.id === p);
    if (who) votes[ev] = [...(votes[ev] || []), initial(who.name)];
  }
  return {
    id: room.id,
    crew: room.crew,
    status: room.status,
    nights: room.nights.map((d) => P.nightLabel(d)),
    form: Boolean(room.form),
    expected: expectedView(room),
    me: me && { id: me.id, name: me.name, mode: me.mode, planner: me.role === "planner", noLearn: Boolean(me.noLearn), signedIn: Boolean(me.user), answers: ownAnswers(room.answers[me.id]), sharedLocation: Boolean((room.answers[me.id] || {}).location) },
    people: P.crew(room).map((p) => ({ id: p.id, name: p.name, initial: initial(p.name), mode: p.mode, talking: now() - p.lastSpokeAt < 3000, spokeAt: p.lastSpokeAt || 0, planner: p.role === "planner", online: room.streams.has(p.id), audio: Boolean(p.audio), muted: Boolean(p.muted) })),
    audioRoom: room.people.some((p) => p.audio),
    boot: BOOT,
    rows: r,
    known: r.filter((x) => x.state === "done").length,
    card: me ? withCardAt(room, cardFor(room, me)) : null,
    // "What I heard": public facts that just landed from speech or typing, with an undo (never a private answer)
    heard: (room.heard || []).filter((h) => !h.undone && !h.here && (h.source === "call_speech" || h.source === "call_text") && now() - h.at < 15000).slice(-4).map((h) => ({ id: h.id, name: h.name, label: h.label, age: now() - h.at, canUndo: Boolean(me && (me.id === h.pid || me.role === "planner")) })),
    // The typed chat thread: captions and Sidekick's lines (the shorter text version), oldest first
    chat: [...room.lines.slice(-8).map((l) => ({ id: l.id, who: l.name, pid: l.pid, text: l.text, kind: l.kind, at: l.at })), ...room.said.filter((x) => !x.system && !["progress", "still"].includes(x.move)).slice(-6).map((x) => ({ id: x.id, sk: true, text: x.chat || x.text, at: x.at, quick: x.quick || null }))].sort((a, b) => a.at - b.at).slice(-8),
    captions: room.lines.slice(-5).map((l) => ({ id: l.id, pid: l.pid, name: l.name, text: l.text, kind: l.kind })),
    agentNotes: me && me.role === "planner" && room.agentMode ? room.agentNotes.slice(-8) : [],
    voiceAgent: Boolean(me && me.role === "planner" && agentIdFor(room)),
    agentOn: room.agentMode,
    mode: room.mode,
    modeCloseAt: room.mode === "voting" ? room.modeCloseAt || null : null,
    sidekick: room.said.slice(-3),
    picks: room.picks && room.picks.length ? room.picks : null, // [] while they're being found
    wildcard: room.picks && room.picks.length ? room.wildcard : null,
    thinking: thinkingView(room), // "Finding your two picks": { steps: [{ label, state }], startedAt }, or null
    // "I've got everything": the persona's line and the plan in public words (no names, no private answers)
    confirm: room.confirm ? { line: CONFIRM_HEAD[personas.resolve(room.persona)] || CONFIRM_HEAD.concierge, facts: room.confirm.facts.map(({ slot, text, join }) => ({ slot, text, join: join || null })), until: room.confirm.until, editing: room.confirm.editing } : null,
    reopened: room.reopened ? room.reopened.slot : null,
    deadline: room.deadline,
    closed: room.closed,
    candidate: room.candidate,
    votes,
    myVote: me ? room.votes[me.id] || null : null,
    locked: room.locked,
    surveyed: Boolean(me && room.surveys[me.id]),
    // Read-aloud settings. `slot` lets the planner's phone give each persona its own voice; it's never shown (blind test)
    voice: room.persona === "friend" ? { slot: "friend", rate: 1.02, pitch: 1.04 } : { slot: "concierge", rate: 0.95, pitch: 1 },
  };
}

// Who the planner invited from the app, and whether they've joined (call) or answered (form). People who
// came in by the link and weren't on the list are added at the end ("via link").
const firstKey = (n) => String(n || "").trim().split(/\s+/)[0].toLowerCase();
function expectedView(room) {
  const others = room.people.filter((p) => p.role !== "planner");
  const used = new Set();
  const out = (room.expected || []).map((name) => {
    const p = others.find((x) => !used.has(x.id) && firstKey(x.name) === firstKey(name));
    if (p) used.add(p.id);
    return { name, joined: Boolean(p), answered: Boolean(p && Object.keys(room.answers[p.id] || {}).length), link: false };
  });
  for (const p of others) if (!used.has(p.id)) out.push({ name: p.name, joined: true, answered: Object.keys(room.answers[p.id] || {}).length > 0, link: true });
  return out;
}

function broadcast(room) {
  for (const [pid, res] of room.streams) res.write(`data: ${JSON.stringify(viewFor(room, pid))}\n\n`);
}

// ---------- In-app audio (WebRTC mesh, 2 to 6 people) ----------
// The server only passes messages between phones (offers, answers, network candidates). Audio goes
// phone to phone. Messages are never logged or stored beyond a short queue for a reconnecting phone.
const AUDIO_MAX = 6;
const SIGNAL_KINDS = ["offer", "answer", "ice", "bye"];
const SIGNAL_MAX_BYTES = 20000;
const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
function iceServers() {
  const out = [];
  const stun = process.env.SIDEKICK_STUN_URL == null ? "stun:stun.l.google.com:19302" : process.env.SIDEKICK_STUN_URL;
  if (stun && stun !== "off") out.push({ urls: list(stun) });
  if (process.env.SIDEKICK_TURN_URL) out.push({ urls: list(process.env.SIDEKICK_TURN_URL), username: process.env.SIDEKICK_TURN_USER || "", credential: process.env.SIDEKICK_TURN_PASS || "" });
  return out;
}
function sendSignal(room, to, msg) {
  const payload = `event: signal\ndata: ${JSON.stringify(msg)}\n\n`;
  const res = room.streams.get(to);
  if (res) return void res.write(payload);
  const q = (room.signalQueue.get(to) || []).filter((x) => now() - x.at < 30000);
  q.push({ payload, at: now() });
  while (q.length > 60) q.shift();
  room.signalQueue.set(to, q);
}

// For the Squads tab (lib/tabs/squads.js): calls going on now, with who's on them (names, and the accounts of
// signed-in people so a squad can find its own call). Never answers.
function liveCalls() {
  return [...rooms.values()].filter((r) => r.status === "live").map((r) => {
    const on = r.people.filter((p) => r.streams.has(p.id));
    return { id: r.id, crew: r.crew, squad: r.squad || null, people: r.people.map((p) => p.name), users: r.people.map((p) => p.user).filter(Boolean), on: on.map((p) => p.name), startedAt: r.createdAt };
  }).filter((c) => c.on.length);
}

// For link previews: only the crew name and the nights, never names or answers
function preview(roomId) {
  const room = rooms.get(String(roomId || ""));
  if (!room) return null;
  return { crew: room.crew, status: room.status, nights: room.nights.map((d) => P.nightLabel(d).split(",")[0]) };
}

// ---------- HTTP ----------

async function handle(req, res, url, { readBody, sendJSON }) {
  const parts = url.pathname.split("/").filter(Boolean); // api, sk, rooms, :id, action
  try {
    if (req.method === "GET" && parts[2] === "nights") return sendJSON(res, 200, { nights: suggestNights(), ai: claude.available(), places: places.configured() && (await places.available()), voiceAgent: await agentReady() });
    if (parts[2] === "agent") return agentTool(req, res, parts[3], { readBody, sendJSON });
    // The person's saved call recaps (none from before "Delete call history"), and the event behind "Plan it"
    if (req.method === "GET" && parts[2] === "calls") return sendJSON(res, 200, { calls: callside.recaps(url.searchParams.get("user")) });
    if (req.method === "GET" && parts[2] === "pick") {
      const info = callside.pickInfo(url.searchParams.get("id"));
      return info ? sendJSON(res, 200, info) : sendJSON(res, 404, { error: "That event isn't listed any more." });
    }
    if (req.method === "POST" && parts[2] === "rooms" && !parts[3]) {
      const body = await readBody(req);
      return sendJSON(res, 200, createRoom({ crew: body.crew, planner: body.name, nights: body.nights, persona: body.persona, members: body.members, form: Boolean(body.form), path: body.path, squad: body.squad, user: body.user, noLearn: Boolean(body.noLearn), deadline: body.form ? body.deadline : null, pick: body.pick, invite: body.invite }));
    }
    const room = rooms.get(parts[3]);
    if (!room) return sendJSON(res, 404, { error: "This call has ended or the link is wrong.", gone: true, boot: BOOT });
    room.touched = now();
    const action = parts[4];
    if (req.method === "GET" && action === "stream") {
      const pid = url.searchParams.get("p");
      if (!room.people.some((p) => p.id === pid)) return sendJSON(res, 403, { error: "Join the call first." });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      // retry: how long the browser waits before reconnecting on its own
      res.write(`retry: 2000\n\n`);
      const old = room.streams.get(pid);
      if (old) old.end();
      room.streams.set(pid, res);
      for (const x of (room.signalQueue.get(pid) || []).filter((m) => now() - m.at < 30000)) res.write(x.payload);
      room.signalQueue.delete(pid);
      broadcast(room); // everyone sees this person back online (and this phone gets its first view)
      // A named heartbeat (older pages ignore it) so phones can tell a silently dead connection
      const ping = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 15000);
      req.on("close", () => {
        clearInterval(ping);
        if (room.streams.get(pid) === res) { room.streams.delete(pid); setTimeout(() => !room.streams.has(pid) && broadcast(room), 8000).unref(); }
      });
      return;
    }
    if (req.method === "GET" && action === "info") return sendJSON(res, 200, { boot: BOOT, crew: room.crew, status: room.status, form: Boolean(room.form), deadline: room.deadline, closed: room.closed, nights: room.nights.map((d) => P.nightLabel(d)), people: P.crew(room).map((p) => p.name), member: room.people.some((p) => p.id === url.searchParams.get("p")) });
    if (req.method !== "POST") return sendJSON(res, 404, { error: "Not found" });
    const body = await readBody(req);
    if (action === "join") {
      if (room.status !== "live") return sendJSON(res, 400, { error: "This call has ended." });
      if (room.closed) return sendJSON(res, 400, { error: "This form has closed. Ask whoever planned it for the plan.", closed: true });
      const person = addPerson(room, { name: body.name, mode: body.mode, user: body.user });
      const answers = { ...(body.answers || {}) };
      if (Array.isArray(answers.nightIdx)) answers.night = answers.nightIdx.map((i) => room.nights[i]).filter(Boolean); // the form sends night positions
      delete answers.nightIdx;
      for (const [slot, value] of Object.entries(answers)) setAnswer(room, person, slot, value, person.mode === "form" ? "link_form" : "call_card");
      if (person.mode === "form") {
        // Only the public parts are mentioned in the call
        const pub = ["night", "time", "vibe"].filter((s) => room.answers[person.id][s]).map((s) => [].concat(room.answers[person.id][s].value).map((v) => P.labelOf(s, v, room)).join(" or "));
        room.said.push({ id: id(4), text: `${person.name} answered by form${pub.length ? `: ${pub.join(" · ")}` : ""}.`, move: "form", at: now(), system: true });
      } else agentNote(room, `[app] ${person.name} just joined the call (${person.mode === "text" ? "typing" : "voice"}). Say a quick hi when there's a gap.`);
      broadcast(room);
      schedule(room, 300);
      return sendJSON(res, 200, { person: person.id });
    }
    const person = room.people.find((p) => p.id === body.p);
    if (!person) return sendJSON(res, 403, { error: "Join the call first." });
    // The Plan tab's steps, before anyone decides: the planner can change the nights, who's invited, the crew's
    // name, and switch to the form (a room made early for "I'll send them a link myself")
    if (action === "setup") {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner can change the plan's setup." });
      if (room.picks || room.status !== "live") return sendJSON(res, 400, { error: "The picks are already out." });
      const ns = cleanNights(body.nights);
      if (ns.length) room.nights = ns;
      if (Array.isArray(body.members)) room.expected = cleanMembers(body.members);
      if (body.crew) room.crew = String(body.crew).slice(0, 40);
      if (body.form) asForm(room);
      if (body.noLearn != null) person.noLearn = Boolean(body.noLearn);
      if (body.pick != null) { const c = callside.pickInfo(body.pick); room.candidate = c && !c.past ? c.id : null; }
      if (room.form && body.deadline) setDeadline(room, body.deadline);
      if (body.invite) callside.invite(room, person, body.invite);
      broadcast(room);
      schedule(room, 300);
      return sendJSON(res, 200, { ok: true });
    }
    // The confirmation card: "Looks good", "Change something", or a fact tapped to reopen its question
    if (action === "confirm") {
      if (!room.confirm) return sendJSON(res, 409, { error: "Sidekick has already moved on." });
      if (body.how === "change") changeConfirm(room);
      else if (body.how === "reopen") { if (!reopenFact(room, String(body.slot || ""))) return sendJSON(res, 400, { error: "That can't be changed here." }); }
      else { finishConfirm(room, "ok").catch((err) => console.error(err)); return sendJSON(res, 200, { ok: true }); }
      broadcast(room);
      schedule(room, 400);
      return sendJSON(res, 200, { ok: true });
    }
    // "Don't learn from this plan": this call's picks, votes and accepts leave this person's taste alone
    if (action === "learn") {
      person.noLearn = Boolean(body.off);
      broadcast(room);
      return sendJSON(res, 200, { ok: true, noLearn: person.noLearn });
    }
    if (action === "answer" && body.slot === "mode") {
      const ok = voteMode(room, person, body.value, "tap");
      broadcast(room);
      return sendJSON(res, ok ? 200 : 400, ok ? { ok } : { error: "The vote has closed." });
    }
    if (action === "mode") {
      if (room.mode === "voting") voteMode(room, person, body.value, "tap");
      else if (["lead", "sidelines"].includes(body.value) && body.value !== room.mode && room.mode) {
        room.wantMode = body.value;
        agentNote(room, body.value === "sidelines" ? `[app] ${person.name} tapped "Sidekick sits back". Say you'll stay quiet in a few words, then skip_turn until someone says "Sidekick".` : `[app] ${person.name} tapped "Sidekick leads". Pick the planning back up (get_next_move).`);
        schedule(room, 50);
      }
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "answer") {
      const ok = setAnswer(room, person, body.slot, body.value, body.source || "call_card");
      if (ok && room.agentMode && P.SLOTS[body.slot]) {
        // Taps the agent can't hear. A private answer is reported without its value.
        const a = room.answers[person.id][body.slot];
        const shown = P.SLOTS[body.slot].private ? "answered the private question on their screen" : `tapped ${P.SLOTS[body.slot].label.toLowerCase()}: ${body.slot === "origin" && a.here ? "their own location" : [].concat(a.value).map((v) => P.labelOf(body.slot, v, room)).join(" or ") || "none"}`;
        agentNote(room, `[app] ${person.name} ${body.slot === "budget" ? "added their budget privately" : shown}.`);
      }
      broadcast(room);
      schedule(room, 400);
      return sendJSON(res, ok ? 200 : 400, ok ? { ok } : { error: "That answer isn't one of the options." });
    }
    if (action === "unhear") {
      const h = (room.heard || []).find((x) => x.id === String(body.id || ""));
      if (!h || h.undone) return sendJSON(res, 400, { error: "That's already been taken back." });
      if (h.pid !== person.id && person.role !== "planner") return sendJSON(res, 403, { error: "Only that person or the planner can take it back." });
      unhear(room, h);
      track("sk_heard_undo", { sessionId: room.id, persona: room.persona, slot: h.slot });
      agentNote(room, `[app] ${person.name} took back what you heard: ${h.name}, ${h.label}. Don't count it.`);
      broadcast(room);
      schedule(room, 400);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "line") {
      // A quick reply under Sidekick's question in the chat thread: the answer, then the line as typed
      const q = body.quick && typeof body.quick === "object" ? body.quick : null;
      if (q && P.SLOTS[q.slot] && !P.SLOTS[q.slot].private && q.slot !== "nos") {
        const cur = ((room.answers[person.id] || {})[q.slot] || {}).value;
        setAnswer(room, person, q.slot, P.SLOTS[q.slot].multi ? [...new Set([...[].concat(cur || []), String(q.value)])] : String(q.value), "call_text");
      }
      const out = addLine(room, person, body.text, body.kind);
      if (out && out.dropped) return sendJSON(res, 200, { ok: true, dropped: out.dropped });
      broadcast(room);
      // Someone spoke to Sidekick: answer after a short pause instead of the usual one. Anyone who keeps
      // talking pushes it back again (each line restarts the wait), so Sidekick still never cuts in.
      schedule(room, room.addressed === out ? QUIET_ASKED_MS : QUIET_MS);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "audio") {
      const on = Boolean(body.on);
      if (on && !person.audio && room.people.filter((p) => p.audio).length >= AUDIO_MAX) return sendJSON(res, 400, { error: `In-app audio fits ${AUDIO_MAX} people. You can still listen on speaker in the same room, or type.` });
      if (on && !person.audio) track("sk_audio", { sessionId: room.id, on: true, inAudio: room.people.filter((p) => p.audio).length + 1 });
      person.audio = on;
      person.muted = on && Boolean(body.muted);
      broadcast(room);
      return sendJSON(res, 200, { ok: true, iceServers: on ? iceServers() : [] });
    }
    if (action === "signal") {
      const to = room.people.find((p) => p.id === body.to);
      if (!to || to.id === person.id) return sendJSON(res, 400, { error: "That person isn't on this call." });
      if (!SIGNAL_KINDS.includes(body.kind)) return sendJSON(res, 400, { error: "Unknown signal." });
      const data = body.data === undefined ? null : body.data;
      if (JSON.stringify(data).length > SIGNAL_MAX_BYTES) return sendJSON(res, 413, { error: "Signal too large." });
      const t = now();
      if (!person.sig || t - person.sig.since > 60000) person.sig = { since: t, n: 0 };
      if (++person.sig.n > 400) return sendJSON(res, 429, { error: "Too many signals. Slow down." });
      sendSignal(room, to.id, { from: person.id, kind: body.kind, data });
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "ask") {
      acceptOffer(room);
      room.addressed = { pid: person.id, name: person.name, text: "Sidekick, what do you suggest?", at: now() };
      await decide(room, { forcePicks: true });
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "voice-agent" && !parts[5]) {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner's phone runs Sidekick's voice." });
      const agentId = agentIdFor(room);
      if (!agentId) return sendJSON(res, 400, { error: "Sidekick's voice agent isn't set up yet.", fallback: true });
      const minutes = AGENT_MAX_MIN();
      const ok = await usage.reserve("elevenlabs_minutes", minutes);
      if (!ok.ok) return sendJSON(res, 429, { error: "Sidekick's voice has hit its usage limit for now. The built-in voice will carry on.", fallback: true, capped: true });
      try {
        // Both ways in, fetched at once: a WebRTC token (what ElevenLabs' own page uses) and a websocket URL
        const q = `agent_id=${encodeURIComponent(agentId)}`;
        const get = (p) => fetch(`https://api.elevenlabs.io/v1/convai/conversation/${p}?${q}`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`ElevenLabs refused the session (${r.status})`))));
        const [tok, url] = await Promise.allSettled([AGENT_CONNECTION() === "websocket" ? Promise.reject(new Error("off")) : get("token"), get("get-signed-url")]);
        if (tok.status !== "fulfilled" && url.status !== "fulfilled") throw url.reason;
        room.agent = { startedAt: now(), reserved: minutes, live: false };
        const slot = openingSlot(room);
        track("sk_voice_agent", { sessionId: room.id, persona: room.persona, on: true });
        const nights = room.nights.map((d) => spokenDay(P.nightLabel(d)));
        return sendJSON(res, 200, {
          conversationToken: tok.status === "fulfilled" ? tok.value.token : null,
          signedUrl: url.status === "fulfilled" ? url.value.signed_url : null,
          maxMinutes: minutes,
          dynamicVariables: { room_id: room.id, crew_name: room.crew, planner_name: person.name, people: P.crew(room).map((p) => `${p.name} (${p.mode})`).join(", "), nights_spoken: nights.length > 1 ? `${nights.slice(0, -1).join(", ")} or ${nights[nights.length - 1]}` : nights[0], opening: openingLine(room, person, slot) },
        });
      } catch (err) {
        await usage.release("elevenlabs_minutes", minutes);
        room.agent = null;
        const why = /fetch failed|abort|ENOTFOUND|ECONN/i.test(err.message) ? "Couldn't reach ElevenLabs" : err.message;
        return sendJSON(res, 502, { error: `${why}. The built-in voice will carry on.`, fallback: true });
      }
    }
    // The session connected on the phone: from now on the agent leads and the engine stays quiet
    if (action === "voice-agent" && parts[5] === "live") {
      if (person.role !== "planner" || !room.agent) return sendJSON(res, 409, { error: "Sidekick's voice isn't starting." });
      room.agent.live = true;
      room.agentMode = true;
      room.agentNotes = [];
      room.nextMove = null;
      // The opening line already asks this question: put its card up so taps and the board follow along
      const slot = openingSlot(room);
      if (slot && room.status === "live" && !room.picks && room.mode !== "sidelines" && (!room.card || room.card.slot === "mode")) {
        room.card = { slot, at: now() };
        room.asked.push(slot);
      }
      await decide(room);
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "voice-agent" && parts[5] === "end") {
      const wasLive = room.agentMode;
      // A page that lost track of its session (a reload) sends 0: count the time since it went live instead
      await endAgent(room, Number(body.seconds) > 0 || !wasLive ? body.seconds : (now() - room.agent.startedAt) / 1000);
      // Back to the built-in voice: let it say the open question out loud, since only the agent heard it
      if (wasLive && room.status === "live" && !room.picks && room.card && P.SLOTS[room.card.slot]) room.card = null;
      broadcast(room);
      schedule(room, 300);
      return sendJSON(res, 200, { ok: true });
    }
    // Client tools: the agent on the planner's phone calls these through the planner's browser
    if (action === "agent-tool") {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner's phone runs Sidekick's voice." });
      if (!room.agent) return sendJSON(res, 409, { error: "Sidekick's voice is off." });
      const out = await runTool(room, parts[5], body);
      return sendJSON(res, out.status, out.body);
    }
    if (action === "agent-said") {
      if (person.role !== "planner" || !room.agent) return sendJSON(res, 403, { error: "Not allowed." });
      const text = String(body.text || "").trim().slice(0, 400);
      if (text) {
        room.said.push({ id: id(4), text, move: "agent", at: now() });
        if (room.said.length > 20) room.said.shift();
        // The agent's words often reach us after other phones already captioned them: take those back out
        const aw = words(text);
        const echo = (l) => l.kind !== "typed" && now() - l.at < ECHO_MS && words(l.text).length >= 3 && contained(words(l.text), aw) >= 0.8;
        room.lines = room.lines.filter((l) => !echo(l));
        room.pending = room.pending.filter((l) => !echo(l));
        room.lastSaidAt = now();
        broadcast(room);
      }
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "vote") {
      if (!room.picks || room.locked || !room.picks.some((p) => p.id === Number(body.eventId))) return sendJSON(res, 400, { error: "Nothing to vote on yet." });
      room.votes[person.id] = Number(body.eventId);
      callside.learn(room, person, "pick", Number(body.eventId));
      track("sk_vote", { sessionId: room.id, persona: room.persona, eventId: Number(body.eventId) });
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "lock") {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner can lock the plan." });
      if (!room.picks || !room.picks.length) return sendJSON(res, 400, { error: "No picks yet." });
      const tally = {};
      for (const ev of Object.values(room.votes)) tally[ev] = (tally[ev] || 0) + 1;
      const chosen = Number(body.eventId) || Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]) || room.picks[0].id;
      room.locked = room.picks.find((p) => p.id === chosen) || room.picks[0];
      for (const p of P.crew(room)) callside.learn(room, p, "accept", room.locked.id);
      try { callside.saveRecap(room); } catch (err) { console.error("Couldn't save call recaps:", err.message); }
      speak(room, "locked", { pick: talk.spokenTitle(room.locked.title, String(room.locked.where || "").split(",")[0]) }).then(() => {
        broadcast(room);
        setTimeout(() => speak(room, "wrap", {}).then(() => broadcast(room)), 6000).unref();
      });
      room.status = "locked";
      track("plan_locked", { sessionId: room.id, persona: room.persona, eventId: room.locked.id, secs: Math.round((now() - room.createdAt) / 1000), votes: Object.keys(room.votes).length });
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "survey") {
      const clamp = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 0)));
      room.surveys[person.id] = { friend: clamp(body.friend), heard: clamp(body.heard), mode: person.mode };
      track("sk_survey", { sessionId: room.id, persona: room.persona, friend: clamp(body.friend), heard: clamp(body.heard), mode: person.mode });
      if (P.crew(room).every((p) => room.surveys[p.id])) endRoom(room, "surveyed");
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "end") {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner can end the call." });
      endRoom(room, "planner");
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }
}

// The agent's tools. Two ways in, same tools:
//  - client tools (the default): the agent calls them in the planner's browser, which POSTs to
//    /api/sk/rooms/:id/agent-tool/<tool> as the planner. No public URL or shared secret needed.
//  - server tools (optional): POST /api/sk/agent/<tool> with header X-Sidekick-Secret and room_id.
// Every tool returns public data only: never anyone's private answers (budget, places they'd rather
// avoid, a shared location) and no tool can vote, lock, book or pay.
async function agentTool(req, res, tool, { readBody, sendJSON }) {
  const secret = process.env.SIDEKICK_TOOL_SECRET;
  if (!secret || req.headers["x-sidekick-secret"] !== secret) return sendJSON(res, 401, { error: "Missing or wrong X-Sidekick-Secret." });
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Use POST." });
  const body = await readBody(req);
  const room = rooms.get(String(body.room_id || ""));
  if (!room) return sendJSON(res, 404, { error: "No live call with that room_id." });
  room.touched = now();
  const out = await runTool(room, tool === "send_private_card" ? "show_private_card" : tool, body);
  return sendJSON(res, out.status, out.body);
}

const PUBLIC_SLOTS = ["night", "time", "origin", "vibe", "kind", "want"];
// What the board says, for the agent. Budget is only the group label the crew can see anyway.
function planState(room) {
  const f = factsOf(room);
  const open = room.card && P.SLOTS[room.card.slot] ? room.card.slot : null;
  const got = open ? P.answersFor(room, open).map((x) => x.person.id) : [];
  return {
    people: P.crew(room).map((p) => ({ name: p.name, joined: p.mode, planner: p.role === "planner" || undefined })),
    board: rows(room, f).map((r) => ({ fact: r.label, value: r.value, said_by: P.SLOTS[r.slot].private ? undefined : r.who || undefined, state: r.state })),
    open_question: open ? {
      slot: open,
      question: PROMPTS[open],
      private: P.SLOTS[open].private,
      options: P.SLOTS[open].private ? undefined : P.optionsFor(open, room).map(([, l]) => l),
      // Who hasn't answered, for a public question only (who's done with their budget stays private)
      waiting_on: P.SLOTS[open].private ? undefined : P.crew(room).filter((p) => p.mode !== "form" && !got.includes(p.id)).map((p) => p.name),
    } : null,
    answer_options: Object.fromEntries(PUBLIC_SLOTS.filter((s) => (s !== "kind" || (room.places && room.places.length)) && !P.SLOTS[s].free).map((s) => [s, P.optionsFor(s, room).map(([, l]) => l)])),
    // What the crew asked for in their own words ("Chinese skewers"): record more with record_facts slot "want"
    looking_for: (f.want && f.want.known ? f.want.value : []),
    mode: room.mode === "sidelines" ? "sitting back (stay quiet unless someone says Sidekick)" : "leading",
    // What people just said (public facts, with names), so the agent can say it back before its next question
    just_heard: (room.heard || []).filter((h) => !h.undone && !h.here && now() - h.at < 60000).slice(-6).map((h) => `${h.name}: ${h.label}`),
    picks: room.picks && room.picks.length ? room.picks.map((x) => ({ title: x.title, kind: x.kind, when: x.when, price: x.price, where: x.where, reason: x.reason || undefined })) : null,
    locked: room.locked ? room.locked.title : null,
  };
}

// The move the agent should make now, from the engine (run after any lines it hasn't read yet)
// Finding the picks can take a while: tools answer within about 2.5 s with how it's going instead of
// holding the agent's turn (a note tells the agent when the picks are on screen).
const TOOL_WAIT_MS = 2500;
const settle = (p, ms) => beforeDeadline(p, now() + ms);
async function waitUntil(fn, ms) {
  const end = now() + ms;
  while (!fn() && now() < end) await new Promise((r) => setTimeout(r, 50));
}
function findingPicks(room) {
  const t = room.think;
  const labels = t ? thinkLabels(room) : null;
  return {
    next_move: "finding_picks",
    what_to_do: "The app is finding the two picks; the steps are on everyone's screens. Say one short progress line like the example (never a budget amount or an avoided area), then wait: a note tells you when the picks are on screen.",
    example_line: (t && t.lastLine) || progressLine(room, "progress"),
    progress: labels ? STEP_KEYS.map((k, i) => `${i < t.shown ? "done" : i === t.shown ? "now" : "next"}: ${labels[k]}`) : undefined,
  };
}
async function nextMove(room) {
  clearTimeout(room.timer);
  for (let i = 0; room.thinking && i < 60; i++) await new Promise((r) => setTimeout(r, 50));
  if (room.pending.length) await settle(think(room), TOOL_WAIT_MS);
  else { await settle(decide(room), TOOL_WAIT_MS); broadcast(room); }
  const st = planState(room);
  const fresh = room.nextMove && !room.nextMove.read ? room.nextMove : null;
  if (fresh) fresh.read = true;
  let move;
  if (room.confirm) move = { next_move: "confirm", what_to_do: `You have everything you need; the confirmation card is on everyone's screens. Say it in one short line with the recap (${recapText(room.confirm.facts, ", ")}), then wait: the steps and picks follow on their own, unless someone wants to change something.`, example_line: fresh && fresh.move === "confirm" ? fresh.example : personas.fallbackLine(room.persona, "confirm", { recap: recapText(room.confirm.facts, ", ") }) };
  else if (room.picking || (room.think && !(room.picks && room.picks.length))) move = findingPicks(room);
  else if (room.locked) move = { next_move: "locked", what_to_do: `The plan is locked: ${cleanTitle(room.locked.title)}. If you haven't yet, confirm it in one sentence and point to the two quick survey questions on screen. Otherwise stay quiet (skip_turn).` };
  else if (room.picks) move = { next_move: "present_picks", what_to_do: fresh && fresh.move === "picks" ? fresh.todo : "The two picks are on everyone's screens. If you haven't presented them, do it now with one reason each and ask everyone to vote in the app. Otherwise answer questions about them, using only the pick details.", example_line: fresh && fresh.move === "picks" ? fresh.example : undefined };
  else if (room.mode === "sidelines") move = { next_move: "stay_quiet", what_to_do: "The crew asked you to sit back. Stay quiet (skip_turn) unless someone says Sidekick." };
  else if (fresh && fresh.move !== "ask" && fresh.move !== "welcome") move = { next_move: fresh.move, what_to_do: fresh.todo, example_line: fresh.example };
  else if (st.open_question) {
    const q = st.open_question;
    move = q.private
      ? { next_move: "private_card", what_to_do: "The budget card is on everyone's screen. Ask them to tap their max there; it stays private. Never ask for amounts out loud, and never say who has or hasn't answered it." }
      : { next_move: "ask", what_to_do: `Ask: ${QUESTION_SPOKEN[q.slot] || q.question}${q.options ? ` Options: ${q.options.join(", ")}.` : ""}${q.waiting_on.length ? ` Still waiting on: ${q.waiting_on.join(", ")}.` : " Everyone has answered; recap it in a few words."}`, example_line: fresh ? fresh.example : undefined };
  } else move = { next_move: "wait", what_to_do: "Nothing needed from the app right now. Chat briefly if someone's talking to you, or stay quiet (skip_turn)." };
  return { ...move, ...st };
}

// "Saturday", "sat", "Sat, Nov 28", "after 8", "union": the agent may give labels, weekdays or values
function toValue(room, slot, v) {
  if (P.SLOTS[slot] && P.SLOTS[slot].free) return wantLib.clean(v) || null; // their own words, cleaned
  const t = String(v || "").trim().toLowerCase();
  if (!t) return null;
  if (slot === "origin" && /^(here|my location|home)$/.test(t)) return "here";
  for (const [value, label] of P.optionsFor(slot, room)) {
    if (t === String(value).toLowerCase() || t === String(label).toLowerCase()) return value;
    if (slot === "night") {
      const wd = new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      if (t === wd || t === wd.slice(0, 3) || t.startsWith(wd)) return value;
    }
  }
  return null;
}

async function runTool(room, tool, body) {
  const ok = (b) => ({ status: 200, body: b });
  if (tool === "get_plan_state") return ok(planState(room));
  if (tool === "get_next_move") return ok(await nextMove(room));
  if (tool === "record_facts") {
    // Public facts only: budget and dealbreakers are answered privately on screens, never by the agent
    const updates = [];
    const skipped = [];
    for (const u of Array.isArray(body.updates) ? body.updates.slice(0, 20) : []) {
      if (!PUBLIC_SLOTS.includes(u && u.slot)) { skipped.push(`${(u && u.slot) || "?"}: not something you record (private or unknown)`); continue; }
      const person = P.crew(room).find((p) => p.name.toLowerCase() === String(u.person || "").trim().toLowerCase());
      if (!person) { skipped.push(`${u.person || "?"}: not on this call`); continue; }
      const said = [].concat(u.values == null ? u.value : u.values);
      const values = said.map((v) => toValue(room, u.slot, v)).filter((v) => v != null);
      // A vibe that isn't one of the options is what they asked for in their own words ("Chinese skewers"): it goes
      // on the board as "Looking for", so the agent's existing record_facts carries it without a new slot
      const own = u.slot === "vibe" ? said.filter((v) => toValue(room, "vibe", v) == null).flatMap((v) => wantLib.find(v).length ? wantLib.find(v) : [wantLib.loose(v)]).filter(Boolean) : [];
      if (own.length) updates.push({ person: person.name, slot: "want", values: own, confidence: 1 });
      if (!values.length) { if (!own.length) skipped.push(`${u.person} ${u.slot}: none of those are options`); continue; }
      updates.push({ person: person.name, slot: u.slot, values, confidence: 1 });
    }
    applyUpdates(room, { updates }, [{ pid: null, at: now(), kind: "spoken" }]);
    const move = await nextMove(room); // the next move comes back with it, so the agent needs one call, not two
    return ok({ recorded: updates.length, skipped: skipped.length ? skipped : undefined, ...move });
  }
  if (tool === "get_picks") {
    const out = () => room.picks && room.picks.length;
    if (!out() && room.status === "live") {
      const end = now() + TOOL_WAIT_MS;
      await beforeDeadline(decide(room, { forcePicks: true }), end);
      await waitUntil(() => out() || !room.picking, end - now());
    }
    broadcast(room);
    if (out()) return ok(planState(room));
    if (room.picking || room.think) return ok({ ...planState(room), ...findingPicks(room), note: "Still finding the two picks. Say the progress line now; a note will tell you when they're on screen." });
    return ok({ ...planState(room), note: "Not enough to suggest picks yet. Ask the open question first." });
  }
  if (tool === "show_private_card") {
    if ((body.slot || "budget") !== "budget") return { status: 400, body: { error: "Only the budget card can be shown." } };
    if (room.picks || room.status !== "live") return ok({ shown: false, note: "Too late for that: the picks are out." });
    room.card = { slot: "budget", at: now() };
    if (!room.asked.includes("budget")) room.asked.push("budget");
    broadcast(room);
    return ok({ shown: true, note: "The budget card is on everyone's screen. Tell them it stays private." });
  }
  if (tool === "accept_relax") {
    const done = acceptOffer(room);
    if (done) await decide(room);
    broadcast(room);
    return ok({ loosened: done, ...planState(room) });
  }
  return { status: 404, body: { error: `Unknown tool: ${tool}` } };
}

function init({ events }) {
  eventsSource = events;
}

module.exports = { init, handle, preview, liveCalls, BOOT, _test: { rooms, createRoom, expectedView, addPerson, setAnswer, addLine, heardElsewhere, iceServers, think, decide, extractKeywords, viewFor, endRoom, voteMode, closeMode, setMode, runTool, planState, nextMove, endAgent, makePicks, thinkingView, THINK, upcoming, QUIET_MS, QUIET_ASKED_MS, nudgeTick, unhear, applyUpdates } };
