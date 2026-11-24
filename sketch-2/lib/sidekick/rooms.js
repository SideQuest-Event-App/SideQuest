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
const claude = require("./claude");
const ai = require("../ai");
const { track } = require("../analytics");

const rooms = new Map();
const SUMMARY_FILE = path.join(__dirname, "..", "..", "data", "sidekick-summaries.jsonl");
const QUIET_MS = 900; // wait this long after the last line before thinking, so Sidekick never cuts in
const MIN_GAP_MS = 5000; // at least this long between Sidekick's lines, unless someone asks it something
const NUDGE_AFTER_MS = 20000;
const IDLE_MS = 3 * 3600 * 1000;
const PROMPTS = { night: "Which night works?", time: "What time works?", origin: "Where are you starting from?", vibe: "What kind of night?", budget: "Your max for the night?", nos: "Anything that's a no?" };

const id = (n = 6) => crypto.randomBytes(n).toString("base64url");
const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();
const now = () => Date.now();

let eventsSource = () => [];
const upcoming = () => eventsSource().filter((e) => e.startsAt && new Date(e.startsAt) > new Date());

// ---------- Rooms and people ----------

function createRoom({ crew, planner, nights, persona }) {
  const room = {
    id: id(),
    crew: String(crew || "The crew").slice(0, 40),
    nights: (Array.isArray(nights) ? nights : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 4),
    persona: personas.PERSONA_IDS.includes(persona) ? persona : personas.PERSONA_IDS[crypto.randomInt(personas.PERSONA_IDS.length)],
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
  };
  if (!room.nights.length) room.nights = suggestNights().slice(0, 2).map((n) => n.date);
  rooms.set(room.id, room);
  const person = addPerson(room, { name: planner, mode: "voice", role: "planner" });
  track("plan_started", { sessionId: room.id, path: "call", persona: room.persona, nights: room.nights.length });
  return { room: room.id, person: person.id };
}

function addPerson(room, { name, mode, role }) {
  const person = { id: id(), name: String(name || "Friend").trim().slice(0, 24) || "Friend", mode: ["voice", "text", "form"].includes(mode) ? mode : "voice", role: role || "friend", joinedAt: now(), lastSpokeAt: 0 };
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
  const valid = P.optionsFor(slot, room).map(([v]) => v);
  let v = def.multi ? [].concat(value).map(String).filter((x) => valid.includes(x)) : valid.includes(String(value)) ? String(value) : null;
  if (v == null || (Array.isArray(v) && !v.length && slot !== "nos")) return false;
  room.answers[person.id][slot] = { value: v, source, at: now() };
  track("response_submitted", { sessionId: room.id, persona: room.persona, slot, source, visibility: def.private ? "private" : "group" });
  return true;
}

function addLine(room, person, text, kind) {
  text = String(text || "").trim().slice(0, 300);
  if (!text) return;
  const line = { pid: person.id, name: person.name, text, kind: kind === "typed" ? "typed" : "spoken", at: now() };
  room.lines.push(line);
  if (room.lines.length > 40) room.lines.shift();
  room.pending.push(line);
  person.lastSpokeAt = now();
  if (/\bside ?kick\b/i.test(text)) room.addressed = line;
  if (room.offer && /\b(yes|yeah|yep|sure|ok(ay)?|show (us|me)|do it|go for it|sounds good)\b/i.test(text)) acceptOffer(room);
}

function acceptOffer(room) {
  if (!room.offer) return false;
  room.relax.add(room.offer);
  track("sk_relaxed", { sessionId: room.id, persona: room.persona, kind: room.offer });
  room.offer = null;
  return true;
}

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
            slot: { type: "string", enum: ["night", "time", "origin", "vibe", "budget", "nos"] },
            values: { type: "array", items: { type: "string" }, description: "Allowed values only, from the list given for that slot" },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["person", "slot", "values", "confidence"],
        },
      },
      addressed_sidekick: { type: "boolean", description: "True if someone spoke to Sidekick directly" },
      question: { type: "string", description: "If someone asked Sidekick something, the question in a few words; else empty" },
    },
    required: ["updates", "addressed_sidekick", "question"],
  },
};

async function extract(room, lines) {
  const names = P.crew(room).map((p) => p.name);
  const allowed = Object.keys(P.SLOTS).map((s) => `- ${s}: ${P.optionsFor(s, room).map(([v, l]) => `${v} (${l})`).join(", ")}`).join("\n");
  const user = `People on the call: ${names.join(", ")}.
Allowed values per slot (night = dates; time: early is noon to 5, evening is 5 to 8, late is after 8; origin = the subway terminal nearest where they start; budget = max spend in dollars; nos = areas to avoid):
${allowed}

Recent lines (earlier context, then the new lines to read):
${room.lines.slice(-12).map((l) => `${lines.includes(l) ? "NEW " : ""}${l.name}: ${l.text}`).join("\n")}

Record what the NEW lines say. If someone accepts several options (e.g. "Friday or Saturday"), list all of them. If someone rules one out ("Friday is bad"), list only the ones they can do, out of the options above.`;
  const out = await claude.tool("You turn a group's planning conversation into structured facts. Be conservative.", user, FACTS_TOOL);
  return out;
}

// No AI: simple keyword reading, good enough to test the flow
function extractKeywords(room, lines) {
  const updates = [];
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
    add("night", days);
    const times = [];
    if (/after (5|6|7|five|six|seven)\b|evening|dinner/.test(t)) times.push("evening");
    if (/after (8|9|10|eight|nine|ten)\b|late/.test(t)) times.push("late");
    if (/afternoon|daytime|lunch/.test(t)) times.push("early");
    add("time", times);
    const money = t.match(/\$\s?(\d+)|(\d+)\s?(bucks|dollars)/);
    if (money) { const n = Number(money[1] || money[2]); add("budget", [n <= 20 ? "20" : n <= 30 ? "30" : n <= 50 ? "50" : "any"]); }
    else if (/\bbroke\b|cheap|free/.test(t)) add("budget", ["20"]);
    const o = /union|downtown/.test(t) ? "union" : /finch|north york/.test(t) ? "finch" : /kennedy|scarborough/.test(t) ? "kennedy" : /kipling|etobicoke/.test(t) ? "kipling" : null;
    if (o) add("origin", [o]);
    const vibes = [];
    if (/music|jazz|band|gig|concert/.test(t)) vibes.push("music");
    if (/comedy|stand-?up/.test(t)) vibes.push("comedy");
    if (/games?|trivia|arcade/.test(t)) vibes.push("games");
    if (/danc|club/.test(t)) vibes.push("dance");
    if (/\bart\b|gallery|film|movie/.test(t)) vibes.push("arts");
    add("vibe", vibes);
    const nos = ["West End", "Downtown", "East End", "North York", "Scarborough", "Etobicoke"].filter((a) => new RegExp(`(not|no|avoid)\\W+(the\\W+)?${a.toLowerCase()}`).test(t));
    add("nos", nos);
    if (/\bside ?kick\b/.test(t)) addressed = true;
  }
  return { updates, addressed_sidekick: addressed, question: addressed ? lines[lines.length - 1].text : "" };
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
    setAnswer(room, person, u.slot, def.multi ? values : values[0], line && line.kind === "typed" ? "call_text" : "call_speech");
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

async function speak(room, move, c = {}) {
  const f = factsOf(room);
  const people = P.crew(room);
  const ctx = { crew: room.crew, slot: c.slot, recap: c.recap, a: c.a, b: c.b, person: c.person, picks: c.picks || [], short: c.short || [], relax: c.relax, n: c.n };
  let text = null;
  let usedAI = false;
  if (claude.available()) {
    const origins = Array.isArray(f.origin.value) && f.origin.value.length ? f.origin.value : ["union"];
    const list = (c.events || []).slice(0, 4).map((e) => `- ${eventBrief(e, origins)}`).join("\n");
    const opts = c.slot ? P.optionsFor(c.slot, room).map(([, l]) => l).join(", ") : "";
    const moves = {
      welcome: `This is the first time you speak on this call. Welcome the crew, then ask: ${PROMPTS[c.slot]} (options on screen: ${opts}).`,
      ask: c.slot === "budget" ? `Ask everyone to tap their max spend on their own screen, and say only you see it.` : `Ask the group: ${PROMPTS[c.slot]} (options on screen: ${opts}). Briefly read back what's settled first if it helps.`,
      conflict: `Name this disagreement without taking sides and offer a way forward: ${c.a} vs ${c.b}.`,
      nudge: `Gently invite ${c.person} in to answer: ${PROMPTS[c.slot]}`,
      picks: `Introduce these two picks and ask everyone to vote. You may add one local detail from the event data.\n1) ${c.picks[0]}\n2) ${c.picks[1]}`,
      none: c.relax ? `Nothing fits everything they've said. Say that ${c.relax} would open up ${c.n} options, and ask if they want to see them. Don't say whose answer is the tight one.` : `Nothing fits everything they've said. Ask whether anyone could be flexible on the time or the night.`,
      answer: `${c.person} just spoke to you: "${redact(c.question || "")}". Reply briefly, using only the facts and events here. If picks aren't ready yet, say what you still need.`,
    };
    const user = `Crew: ${room.crew}. On the call: ${people.map((p) => `${p.name} (${p.mode})`).join(", ")}.
What's settled so far (what the group can see): ${publicFacts(room, f)}.
Recent conversation:
${room.lines.slice(-6).map((l) => `${l.name}: ${redact(l.text)}`).join("\n") || "(nobody has spoken yet)"}
${list ? `Events that fit (the only facts you may use about places):\n${list}\n` : ""}${room.said.length ? `Your last lines (start differently from these):\n${room.said.slice(-3).map((s) => `- ${s.text}`).join("\n")}\n` : ""}
Your move: ${moves[move]}`;
    try {
      const out = await claude.say(personas.systemPrompt(room.persona), user, 120);
      if (personas.acceptable(out)) { text = out.replace(/^["']|["']$/g, ""); usedAI = true; }
    } catch (err) {
      console.error(err.message);
    }
  }
  if (!text) text = personas.fallbackLine(room.persona, move, ctx, room.said.filter((s) => !s.system).slice(-3).map((s) => s.text));
  const line = { id: id(4), text, move, at: now() };
  room.said.push(line);
  if (room.said.length > 20) room.said.shift();
  room.lastSaidAt = now();
  track("sk_said", { sessionId: room.id, persona: room.persona, move, ai: usedAI, words: text.split(/\s+/).length });
  return line;
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
    }
    await decide(room);
  } finally {
    room.thinking = false;
    broadcast(room);
    if (room.again) { room.again = false; schedule(room, 50); }
  }
}

async function decide(room, { forcePicks = false } = {}) {
  if (room.status !== "live" || room.picks) return;
  const events = upcoming();
  const f = factsOf(room);
  const r = P.readiness(events, room, f);
  const canSpeak = () => !room.lastSaidAt || now() - room.lastSaidAt > MIN_GAP_MS;

  if (forcePicks && room.offer) { acceptOffer(room); return decide(room, { forcePicks }); }
  if (room.addressed) {
    const q = room.addressed;
    room.addressed = null;
    if (forcePicks || /pick|suggest|recommend|what do you think|ideas?/i.test(q.text)) {
      if (r.pool >= 2 && (room.nights.length === 1 || f.night.known)) return makePicks(room, r.list);
    }
    await speak(room, "answer", { person: q.name, question: q.text, events: r.list });
    return;
  }
  if (forcePicks && r.pool >= 2) return makePicks(room, r.list);

  for (const slot of ["night", "time", "vibe"]) {
    const c = f[slot].conflict;
    if (!c) continue;
    const key = `${slot}:${c.join("|")}`;
    if (room.conflictsSaid[key]) continue;
    room.conflictsSaid[key] = true;
    room.card = { slot, at: now() };
    const label = (v) => `${P.labelOf(slot, v, room)} (${(f[slot].supporters[v] || []).join(", ")})`;
    await speak(room, "conflict", { slot, a: label(c[0]), b: label(c[1]) });
    return;
  }

  if (r.ready) return makePicks(room, r.list);
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

  const slot = P.nextQuestion(events, room, f) || (f.budget.answered < P.need(room) ? "budget" : null);
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
    if (room.status !== "live" || room.picks || !room.card || room.thinking) continue;
    const slot = room.card.slot;
    if (now() - room.card.at < NUDGE_AFTER_MS || (room.lastSaidAt && now() - room.lastSaidAt < NUDGE_AFTER_MS)) continue;
    const got = P.answersFor(room, slot).map((x) => x.person.id);
    if (!got.length || P.SLOTS[slot].private) continue;
    const quiet = P.crew(room).find((p) => p.mode !== "form" && !got.includes(p.id) && !(room.nudged[slot] || []).includes(p.id));
    if (!quiet) continue;
    room.nudged[slot] = [...(room.nudged[slot] || []), quiet.id];
    speak(room, "nudge", { slot, person: quiet.name }).then(() => broadcast(room));
  }
}
setInterval(nudgeTick, 5000).unref();

async function makePicks(room, list) {
  room.picks = [];
  const f = factsOf(room);
  const people = P.crew(room).map((p) => {
    const a = room.answers[p.id];
    const vibes = a.vibe ? a.vibe.value.map((v) => P.labelOf("vibe", v, room)).join(", ") : "anything fun";
    return { name: p.name, interests: vibes, origin: a.origin ? a.origin.value : undefined };
  });
  const pool = list.slice(0, 25);
  let matches = [];
  try {
    const out = await ai.match(people, pool, 2);
    matches = out.matches || [];
  } catch (err) {
    console.error(err.message);
  }
  for (const e of pool) if (matches.length < 2 && !matches.some((m) => m.id === e.id)) matches.push({ id: e.id, reason: "", fits: {} });
  room.picks = matches.slice(0, 2).map((m) => {
    const e = pool.find((x) => x.id === m.id);
    return { id: e.id, title: e.title, when: e.date, stretch: [...room.relax].map((k) => P.RELAX_WORDS[k]), price: e.price === 0 ? "Free" : e.price != null ? `$${e.price}` : "Price not listed", where: [e.venue && e.venue.name, e.neighbourhood].filter(Boolean).join(", "), reason: m.reason || "", fits: m.fits || {}, url: e.sourceUrl || null };
  });
  room.card = null;
  track("call_facts_complete", { sessionId: room.id, persona: room.persona, secs: Math.round((now() - room.createdAt) / 1000), questions: room.asked.length });
  track("picks_shown", { sessionId: room.id, persona: room.persona, pool: list.length });
  await speak(room, "picks", { short: room.picks.map((p) => p.title), picks: room.picks.map((p) => `${p.title} (${p.when}, ${p.price || "price TBC"}, ${p.where})`), events: pool.filter((e) => room.picks.some((p) => p.id === e.id)) });
}

// ---------- Ending, saving the summary ----------

function endRoom(room, why) {
  if (room.status === "ended") return;
  room.status = "ended";
  room.lines = []; // the transcript is never kept
  room.pending = [];
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
  track("sk_call_ended", { sessionId: room.id, persona: room.persona, why, secs: summary.secs, locked: Boolean(room.locked) });
  broadcast(room);
  setTimeout(() => { for (const res of room.streams.values()) res.end(); rooms.delete(room.id); }, 30 * 60 * 1000).unref();
}

// ---------- What each person sees ----------

function rows(room, f = factsOf(room)) {
  return ["night", "time", "budget", "origin", "vibe"].filter((s) => !(s === "night" && room.nights.length === 1 && false)).map((slot) => {
    const g = f[slot];
    let value = null;
    let who = "";
    if (slot === "budget") { value = P.budgetLabel(f, room); who = g.answered ? `private · ${g.answered} of ${P.crew(room).length}` : ""; }
    else if (slot === "vibe") { value = g.value && g.value.length ? g.value.slice(0, 2).map((v) => P.labelOf(slot, v, room)).join(" + ") : null; who = g.value && g.value[0] ? (g.supporters[g.value[0]] || []).join(", ") : ""; }
    else if (g.value && g.value.length) { value = [].concat(g.value).map((v) => P.labelOf(slot, v, room)).join(slot === "origin" ? ", " : " or "); who = [...new Set(Object.values(g.supporters).flat())].join(", "); }
    const state = g.conflict ? "conflict" : room.card && room.card.slot === slot ? "asking" : g.known ? "done" : "todo";
    return { slot, label: P.SLOTS[slot].label, value, who, state, conflict: g.conflict ? g.conflict.map((v) => `${P.labelOf(slot, v, room)} (${(g.supporters[v] || []).join(", ")})`) : null };
  });
}

function cardFor(room, person) {
  const mine = room.answers[person.id] || {};
  if (room.status !== "live" || room.picks) return null;
  // Private: budget, when it's the open question and this person hasn't answered
  if (room.card && room.card.slot === "budget") {
    if (mine.budget) return { slot: "budget", private: true, waiting: true, prompt: "Thanks. Waiting on the others", options: [] };
    return { slot: "budget", private: true, prompt: PROMPTS.budget, multi: false, options: P.optionsFor("budget", room).map(([value, label]) => ({ value, label, voters: [] })) };
  }
  if (!room.card) return null;
  const slot = room.card.slot;
  const voters = {};
  for (const x of P.answersFor(room, slot)) for (const v of [].concat(x.a.value)) voters[v] = [...(voters[v] || []), initial(x.person.name)];
  const chosen = mine[slot] ? [].concat(mine[slot].value) : [];
  return { slot, private: false, prompt: PROMPTS[slot], multi: P.SLOTS[slot].multi, options: P.optionsFor(slot, room).map(([value, label]) => ({ value, label, voters: voters[value] || [], mine: chosen.includes(value) })) };
}

function viewFor(room, pid) {
  const me = room.people.find((p) => p.id === pid);
  const f = factsOf(room);
  const r = rows(room, f);
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
    me: me && { id: me.id, name: me.name, mode: me.mode, planner: me.role === "planner", answers: room.answers[me.id] },
    people: P.crew(room).map((p) => ({ id: p.id, name: p.name, initial: initial(p.name), mode: p.mode, talking: now() - p.lastSpokeAt < 3000, planner: p.role === "planner" })),
    rows: r,
    known: r.filter((x) => x.state === "done").length,
    card: me ? cardFor(room, me) : null,
    captions: room.lines.slice(-5).map((l) => ({ name: l.name, text: l.text, kind: l.kind })),
    sidekick: room.said.slice(-3),
    picks: room.picks,
    votes,
    myVote: me ? room.votes[me.id] || null : null,
    locked: room.locked,
    surveyed: Boolean(me && room.surveys[me.id]),
    // Read-aloud settings. `slot` lets the planner's phone give each persona its own voice; it's never shown (blind test)
    voice: room.persona === "host" ? { slot: "host", rate: 1.05, pitch: 1.08 } : { slot: "facilitator", rate: 0.98, pitch: 1 },
  };
}

function broadcast(room) {
  for (const [pid, res] of room.streams) res.write(`data: ${JSON.stringify(viewFor(room, pid))}\n\n`);
}

// ---------- HTTP ----------

async function handle(req, res, url, { readBody, sendJSON }) {
  const parts = url.pathname.split("/").filter(Boolean); // api, sk, rooms, :id, action
  try {
    if (req.method === "GET" && parts[2] === "nights") return sendJSON(res, 200, { nights: suggestNights(), ai: claude.available() });
    if (req.method === "POST" && parts[2] === "rooms" && !parts[3]) {
      const body = await readBody(req);
      return sendJSON(res, 200, createRoom({ crew: body.crew, planner: body.name, nights: body.nights, persona: body.persona }));
    }
    const room = rooms.get(parts[3]);
    if (!room) return sendJSON(res, 404, { error: "This call has ended or the link is wrong." });
    room.touched = now();
    const action = parts[4];
    if (req.method === "GET" && action === "stream") {
      const pid = url.searchParams.get("p");
      if (!room.people.some((p) => p.id === pid)) return sendJSON(res, 403, { error: "Join the call first." });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(`data: ${JSON.stringify(viewFor(room, pid))}\n\n`);
      const old = room.streams.get(pid);
      if (old) old.end();
      room.streams.set(pid, res);
      const ping = setInterval(() => res.write(": ping\n\n"), 20000);
      req.on("close", () => { clearInterval(ping); if (room.streams.get(pid) === res) room.streams.delete(pid); });
      return;
    }
    if (req.method === "GET" && action === "info") return sendJSON(res, 200, { crew: room.crew, status: room.status, nights: room.nights.map((d) => P.nightLabel(d)), people: P.crew(room).map((p) => p.name), member: room.people.some((p) => p.id === url.searchParams.get("p")) });
    if (req.method !== "POST") return sendJSON(res, 404, { error: "Not found" });
    const body = await readBody(req);
    if (action === "join") {
      if (room.status !== "live") return sendJSON(res, 400, { error: "This call has ended." });
      const person = addPerson(room, { name: body.name, mode: body.mode });
      const answers = { ...(body.answers || {}) };
      if (Array.isArray(answers.nightIdx)) answers.night = answers.nightIdx.map((i) => room.nights[i]).filter(Boolean); // the form sends night positions
      delete answers.nightIdx;
      for (const [slot, value] of Object.entries(answers)) setAnswer(room, person, slot, value, person.mode === "form" ? "link_form" : "call_card");
      if (person.mode === "form") {
        // Only the public parts are mentioned in the call
        const pub = ["night", "time", "vibe"].filter((s) => room.answers[person.id][s]).map((s) => [].concat(room.answers[person.id][s].value).map((v) => P.labelOf(s, v, room)).join(" or "));
        room.said.push({ id: id(4), text: `${person.name} answered by form${pub.length ? `: ${pub.join(" · ")}` : ""}.`, move: "form", at: now(), system: true });
      }
      broadcast(room);
      schedule(room, 300);
      return sendJSON(res, 200, { person: person.id });
    }
    const person = room.people.find((p) => p.id === body.p);
    if (!person) return sendJSON(res, 403, { error: "Join the call first." });
    if (action === "answer") {
      const ok = setAnswer(room, person, body.slot, body.value, body.source || "call_card");
      broadcast(room);
      schedule(room, 400);
      return sendJSON(res, ok ? 200 : 400, ok ? { ok } : { error: "That answer isn't one of the options." });
    }
    if (action === "line") {
      addLine(room, person, body.text, body.kind);
      broadcast(room);
      schedule(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "ask") {
      acceptOffer(room);
      room.addressed = { pid: person.id, name: person.name, text: "Sidekick, what do you suggest?", at: now() };
      await decide(room, { forcePicks: true });
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "vote") {
      if (!room.picks || room.locked || !room.picks.some((p) => p.id === Number(body.eventId))) return sendJSON(res, 400, { error: "Nothing to vote on yet." });
      room.votes[person.id] = Number(body.eventId);
      track("sk_vote", { sessionId: room.id, persona: room.persona, eventId: Number(body.eventId) });
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "lock") {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner can lock the plan." });
      if (!room.picks) return sendJSON(res, 400, { error: "No picks yet." });
      const tally = {};
      for (const ev of Object.values(room.votes)) tally[ev] = (tally[ev] || 0) + 1;
      const chosen = Number(body.eventId) || Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]) || room.picks[0].id;
      room.locked = room.picks.find((p) => p.id === chosen) || room.picks[0];
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

function init({ events }) {
  eventsSource = events;
}

module.exports = { init, handle, _test: { rooms, createRoom, addPerson, setAnswer, addLine, think, decide, extractKeywords, viewFor, endRoom } };
