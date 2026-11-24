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
const places = require("./places");
const usage = require("./usage");
const { track } = require("../analytics");

const rooms = new Map();
const SUMMARY_FILE = path.join(__dirname, "..", "..", "data", "sidekick-summaries.jsonl");
const QUIET_MS = 900; // wait this long after the last line before thinking, so Sidekick never cuts in
const MIN_GAP_MS = 5000; // at least this long between Sidekick's lines, unless someone asks it something
const NUDGE_AFTER_MS = 20000;
const IDLE_MS = 3 * 3600 * 1000;
const PROMPTS = { night: "Which night works?", time: "What time works?", origin: "Where are you starting from?", vibe: "What kind of night?", budget: "Your max for the night?", nos: "Anything that's a no?", kind: "A ticketed event, or just somewhere good to go?" };

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
    cues: [], // moves sent to the ElevenLabs voice agent on the planner's phone
    agentMode: false,
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
  const line = { id: id(4), pid: person.id, name: person.name, text, kind: kind === "typed" ? "typed" : "spoken", at: now() };
  room.lines.push(line);
  if (room.lines.length > 40) room.lines.shift();
  room.pending.push(line);
  person.lastSpokeAt = now();
  if (/\bside ?kick\b/i.test(text)) room.addressed = line;
  const slot = room.card && room.card.slot;
  if (slot && !P.SLOTS[slot].private && FLEX.test(text) && P.SLOTS[slot].multi) {
    setAnswer(room, person, slot, P.optionsFor(slot, room).map(([v]) => v), kind === "typed" ? "call_text" : "call_speech");
    line.flex = true;
  } else if (slot && UNSURE.test(text)) room.wantGuide = slot;
  if (room.offer && /\b(yes|yeah|yep|sure|ok(ay)?|show (us|me)|do it|go for it|sounds good)\b/i.test(text)) acceptOffer(room);
}

function acceptOffer(room) {
  if (!room.offer) return false;
  room.relax.add(room.offer);
  track("sk_relaxed", { sessionId: room.id, persona: room.persona, kind: room.offer });
  room.offer = null;
  return true;
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
  const ctx = lineContext(room, f, c);
  if (room.agentMode) {
    // The voice agent speaks; we send it the move with a suggested line from the line book
    const key = move === "welcome" ? "hello" : move === "ask" ? `ask_${c.slot}` : move === "conflict" ? "clash" : move === "none" ? "loosen" : move;
    const suggestion = personas.fallbackLine(room.persona, key, ctx, room.said.filter((x) => !x.system).slice(-3).map((x) => x.text));
    room.cues.push({ id: id(4), text: cueFor(room, move, c, suggestion), move, at: now() });
    if (room.cues.length > 20) room.cues.shift();
    room.lastSaidAt = now();
    track("sk_said", { sessionId: room.id, persona: room.persona, move, ai: false, agent: true });
    return { id: id(4), text: suggestion, move, at: now() };
  }
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
      guide: `People seem unsure about this: ${PROMPTS[c.slot]} Help them answer by offering these concrete options from what's actually on: ${c.options}. Keep it light and end with a question.`,
      locked: `The planner just locked the plan: ${c.pick}. Confirm it warmly in one short sentence.`,
      wrap: `Point everyone to the two quick survey questions on their screen, in one short sentence.`,
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
  const lineKey = move === "welcome" ? "hello" : move === "ask" ? `ask_${c.slot}` : move === "conflict" ? "clash" : move === "none" ? "loosen" : move;
  if (!text) text = personas.fallbackLine(room.persona, lineKey, ctx, room.said.filter((s) => !s.system).slice(-3).map((s) => s.text));
  const line = { id: id(4), text, move, at: now() };
  room.said.push(line);
  if (room.said.length > 20) room.said.shift();
  room.lastSaidAt = now();
  track("sk_said", { sessionId: room.id, persona: room.persona, move, ai: usedAI, words: text.split(/\s+/).length });
  return line;
}

const DAY = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const spokenDay = (label) => DAY[String(label).slice(0, 3)] || label;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const cleanTitle = (t) => String(t || "").replace(/^Free event\.\s*/i, "").replace(/\s+[|@]\s.*$/, "").trim();

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
    pick1: c.short && c.short[0], pick2: c.short && c.short[1], why1: c.why && c.why[0], why2: c.why && c.why[1], pick: c.pick,
    missing: missing.length ? missing.slice(0, 2).join(" and ") : null,
    options: c.options,
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

// ---------- ElevenLabs voice agent (optional) ----------
// The planner's phone can run an ElevenLabs agent as Sidekick's voice. Our engine stays the brain:
// each move becomes a cue the phone passes to the agent, which says it in the persona's voice.
const AGENTS = () => ({ friend: process.env.ELEVENLABS_AGENT_FRIEND, concierge: process.env.ELEVENLABS_AGENT_CONCIERGE });
const agentIdFor = (room) => (process.env.ELEVENLABS_API_KEY && process.env.SIDEKICK_ELEVENLABS_OFF !== "1" ? AGENTS()[room.persona] || null : null);
const AGENT_MAX_MIN = () => Number(process.env.ELEVENLABS_MAX_CALL_MINUTES || 10);
const MOVE_HINT = {
  welcome: "Welcome the crew, then ask the first question",
  ask: "Ask the group this one question",
  conflict: "Name this clash kindly, without taking sides, and offer a way forward",
  nudge: "Gently invite this person in",
  guide: "People seem unsure. Offer these ideas and ask which sounds good",
  picks: "Present these two picks, with a reason for each, and ask everyone to vote",
  none: "Nothing fits everything. Offer to loosen one thing, without saying whose limit it is",
  answer: "Reply briefly to what was just asked",
  locked: "Confirm the locked plan warmly",
  wrap: "Point everyone to the two quick survey questions on their screen",
};
function cueFor(room, move, c, suggestion) {
  const opts = c.slot && c.slot !== "budget" ? P.optionsFor(c.slot, room).map(([, l]) => l).join(", ") : "";
  const detail = move === "ask" || move === "welcome" ? `${PROMPTS[c.slot] || ""}${opts ? ` Options on screen: ${opts}.` : ""}${c.slot === "budget" ? " Everyone answers privately on their own screen." : ""}`
    : move === "picks" ? (c.picks || []).map((x, i) => `${i + 1}) ${x}`).join(" ")
    : move === "guide" ? `Ideas: ${c.options}.`
    : move === "conflict" ? `${c.a} vs ${c.b}.`
    : move === "nudge" ? `Person: ${c.person}. Question: ${PROMPTS[c.slot] || ""}`
    : move === "none" && c.relax ? `${c.relax} would open up ${c.n} options.`
    : move === "answer" ? `${c.person} asked: "${redact(c.question || "")}"`
    : move === "locked" ? `Plan: ${c.pick}.` : "";
  return `[app] ${MOVE_HINT[move] || "Say this"}. ${detail} Say it your way, in one breath, for example: "${suggestion}"`.replace(/\s+/g, " ").trim();
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
      if (room.card && !P.SLOTS[room.card.slot].private) {
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
async function ensurePlaces(room, f) {
  if (room.placesTried) return;
  if (!(room.nights.length === 1 || f.night.known)) return;
  if (!(f.vibe.answered > 0 || room.asked.includes("vibe") || room.asked.length >= 3)) return;
  room.placesTried = true;
  if (!(await places.available())) return;
  const out = await places.forCall(f.vibe.value || []);
  room.places = out.places;
  track("sk_places_loaded", { sessionId: room.id, persona: room.persona, n: out.places.length, capped: out.capped || null });
}

async function decide(room, { forcePicks = false } = {}) {
  if (room.status !== "live" || room.picks) return;
  await ensurePlaces(room, factsOf(room));
  const events = [...upcoming(), ...(room.places || [])];
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
    const plain = (v) => (slot === "night" ? spokenDay(P.labelOf(slot, v, room)) : P.labelOf(slot, v, room).toLowerCase());
    await speak(room, "conflict", { slot, a: label(c[0]), b: label(c[1]), aLabel: plain(c[0]), bLabel: plain(c[1]), aCount: (f[slot].supporters[c[0]] || []).length, bCount: (f[slot].supporters[c[1]] || []).length });
    return;
  }

  if (room.wantGuide && room.card && room.card.slot === room.wantGuide && !room.card.guided) {
    room.card.guided = true;
    room.wantGuide = null;
    const options = ideasFor(room, f, room.card.slot, events);
    if (options) {
      track("sk_guided", { sessionId: room.id, persona: room.persona, slot: room.card.slot });
      await speak(room, "guide", { slot: room.card.slot, options });
      return;
    }
  }
  room.wantGuide = null;

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
    if (P.SLOTS[slot].private) continue;
    if (!got.length) {
      const quietSince = Math.max(room.card.at, ...room.lines.map((l) => l.at));
      if (!room.card.guided && now() - quietSince > 30000) { room.wantGuide = slot; schedule(room, 10); }
      continue;
    }
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
    if (e.type === "place") {
      const night = f.night.known && f.night.value.length ? f.night.value[0] : room.nights[0];
      const b = f.time.known && f.time.value.length ? f.time.value[0] : "evening";
      const hours = places.closesLabel(e.hours, new Date(night + "T12:00:00").getDay(), { early: 15, evening: 19, late: 21 }[b]);
      return { id: e.id, kind: "place", title: e.title, when: `${spokenDay(P.nightLabel(night))} · ${hours}`, stretch: [...room.relax].map((k) => P.RELAX_WORDS[k]), price: e.price === 0 ? "Free" : e.price != null ? `${e.priceNote ? `${e.priceNote} · ` : ""}about $${e.price} each` : e.priceNote || "Price not listed", where: [e.neighbourhood, e.rating ? `rated ${e.rating}` : null].filter(Boolean).join(" · "), reason: m.reason || "", fits: m.fits || {}, url: e.mapsUrl, attribution: "Google Maps" };
    }
    return { id: e.id, kind: "event", title: e.title, when: e.date, stretch: [...room.relax].map((k) => P.RELAX_WORDS[k]), price: e.price === 0 ? "Free" : e.price != null ? `$${e.price}` : "Price not listed", where: [e.venue && e.venue.name, e.neighbourhood].filter(Boolean).join(", "), reason: m.reason || "", fits: m.fits || {}, url: e.sourceUrl || null };
  });
  room.card = null;
  track("call_facts_complete", { sessionId: room.id, persona: room.persona, secs: Math.round((now() - room.createdAt) / 1000), questions: room.asked.length });
  track("picks_shown", { sessionId: room.id, persona: room.persona, pool: list.length });
  const whyOf = (p) => {
    const e = pool.find((x) => x.id === p.id);
    if (e.type === "place") return [e.rating ? `rated ${e.rating}` : null, e.neighbourhood && `in ${e.neighbourhood}`, e.price != null ? `about ${e.price} dollars each` : null].filter(Boolean).join(", ");
    const vibe = (e.vibes || [])[0];
    return [[vibe && vibe.toLowerCase(), e.neighbourhood && `in ${e.neighbourhood}`].filter(Boolean).join(" "), e.price === 0 ? "and it's free" : e.price != null ? `about ${e.price} dollars` : null].filter(Boolean).join(", ");
  };
  await speak(room, "picks", { why: room.picks.map(whyOf), short: room.picks.map((p) => cleanTitle(p.title)), picks: room.picks.map((p) => `${p.title} (${p.when}, ${p.price || "price TBC"}, ${p.where})`), events: pool.filter((e) => room.picks.some((p) => p.id === e.id)) });
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
  return ["night", "time", "budget", "origin", "vibe", ...(room.places && room.places.length ? ["kind"] : [])].map((slot) => {
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
    captions: room.lines.slice(-5).map((l) => ({ id: l.id, pid: l.pid, name: l.name, text: l.text, kind: l.kind })),
    cues: me && me.role === "planner" && room.agentMode ? room.cues.slice(-6) : [],
    voiceAgent: Boolean(me && me.role === "planner" && agentIdFor(room)),
    agentOn: room.agentMode,
    sidekick: room.said.slice(-3),
    picks: room.picks,
    votes,
    myVote: me ? room.votes[me.id] || null : null,
    locked: room.locked,
    surveyed: Boolean(me && room.surveys[me.id]),
    // Read-aloud settings. `slot` lets the planner's phone give each persona its own voice; it's never shown (blind test)
    voice: room.persona === "friend" ? { slot: "friend", rate: 1.02, pitch: 1.04 } : { slot: "concierge", rate: 0.95, pitch: 1 },
  };
}

function broadcast(room) {
  for (const [pid, res] of room.streams) res.write(`data: ${JSON.stringify(viewFor(room, pid))}\n\n`);
}

// ---------- HTTP ----------

async function handle(req, res, url, { readBody, sendJSON }) {
  const parts = url.pathname.split("/").filter(Boolean); // api, sk, rooms, :id, action
  try {
    if (req.method === "GET" && parts[2] === "nights") return sendJSON(res, 200, { nights: suggestNights(), ai: claude.available(), places: places.configured() && (await places.available()) });
    if (parts[2] === "agent") return agentTool(req, res, parts[3], { readBody, sendJSON });
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
    if (action === "voice-agent" && !parts[5]) {
      if (person.role !== "planner") return sendJSON(res, 403, { error: "Only the planner's phone runs Sidekick's voice." });
      const agentId = agentIdFor(room);
      if (!agentId) return sendJSON(res, 400, { error: "Sidekick's voice agent isn't set up yet." });
      const minutes = AGENT_MAX_MIN();
      const ok = await usage.reserve("elevenlabs_minutes", minutes);
      if (!ok.ok) return sendJSON(res, 429, { error: "Sidekick's voice has hit its usage limit for now. The built-in voice will carry on." });
      try {
        const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } });
        if (!r.ok) throw new Error(`ElevenLabs refused the session (${r.status})`);
        const { signed_url: signedUrl } = await r.json();
        room.agentMode = true;
        room.agent = { startedAt: now(), reserved: minutes };
        room.cues = [{ id: id(4), text: room.said.length ? "[app] You've just joined this call as Sidekick. Say a short hi. The app will tell you what to ask next." : "[app] You've just joined. Stay quiet for now; the app will cue your welcome.", move: "join", at: now() }];
        track("sk_voice_agent", { sessionId: room.id, persona: room.persona, on: true });
        const nights = room.nights.map((d) => spokenDay(P.nightLabel(d)));
        broadcast(room);
        schedule(room, 500);
        return sendJSON(res, 200, {
          signedUrl,
          maxMinutes: minutes,
          dynamicVariables: { room_id: room.id, crew_name: room.crew, planner_name: person.name, people: P.crew(room).map((p) => `${p.name} (${p.mode})`).join(", "), nights_spoken: nights.length > 1 ? `${nights.slice(0, -1).join(", ")} or ${nights[nights.length - 1]}` : nights[0] },
        });
      } catch (err) {
        await usage.release("elevenlabs_minutes", minutes);
        const why = /fetch failed|abort|ENOTFOUND|ECONN/i.test(err.message) ? "Couldn't reach ElevenLabs" : err.message;
        return sendJSON(res, 502, { error: `${why}. The built-in voice will carry on.` });
      }
    }
    if (action === "voice-agent" && parts[5] === "end") {
      if (room.agent) {
        const usedMin = Math.min(room.agent.reserved, Math.ceil(Math.max(0, Number(body.seconds) || 0) / 60));
        await usage.release("elevenlabs_minutes", room.agent.reserved - usedMin);
        track("sk_voice_agent", { sessionId: room.id, persona: room.persona, on: false, minutes: usedMin });
      }
      room.agentMode = false;
      room.agent = null;
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
    if (action === "agent-said") {
      if (person.role !== "planner" || !room.agentMode) return sendJSON(res, 403, { error: "Not allowed." });
      const text = String(body.text || "").trim().slice(0, 400);
      if (text) {
        room.said.push({ id: id(4), text, move: "agent", at: now() });
        if (room.said.length > 20) room.said.shift();
        room.lastSaidAt = now();
        broadcast(room);
      }
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
      speak(room, "locked", { pick: cleanTitle(room.locked.title) }).then(() => {
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

// POST /api/sk/agent/<tool>, header X-Sidekick-Secret. Returns public data only: never anyone's
// private answers, and no tool can vote, lock, book or pay.
async function agentTool(req, res, tool, { readBody, sendJSON }) {
  const secret = process.env.SIDEKICK_TOOL_SECRET;
  if (!secret || req.headers["x-sidekick-secret"] !== secret) return sendJSON(res, 401, { error: "Missing or wrong X-Sidekick-Secret." });
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Use POST." });
  const body = await readBody(req);
  const room = rooms.get(String(body.room_id || ""));
  if (!room) return sendJSON(res, 404, { error: "No live call with that room_id." });
  room.touched = now();
  const state = () => {
    const f = factsOf(room);
    return {
      people: P.crew(room).map((p) => ({ name: p.name, joined: p.mode })),
      board: rows(room, f).map((r) => ({ fact: r.label, value: r.value, said_by: P.SLOTS[r.slot].private ? undefined : r.who, state: r.state })),
      open_question: room.card ? { slot: room.card.slot, question: PROMPTS[room.card.slot], private: P.SLOTS[room.card.slot].private, options: P.SLOTS[room.card.slot].private ? undefined : P.optionsFor(room.card.slot, room).map(([, l]) => l) } : null,
      picks: room.picks ? room.picks.map((x) => ({ title: x.title, when: x.when, price: x.price, where: x.where, reason: x.reason })) : null,
      locked: room.locked ? room.locked.title : null,
    };
  };
  if (tool === "get_plan_state") return sendJSON(res, 200, state());
  if (tool === "get_next_move") {
    const cue = room.cues[room.cues.length - 1];
    return sendJSON(res, 200, { ...state(), next_move: cue ? cue.move : "wait", say: cue ? cue.text : "Nothing needed right now. Stay quiet (skip_turn)." });
  }
  if (tool === "record_facts") {
    const lines = [{ pid: null, at: now(), kind: "spoken" }];
    applyUpdates(room, { updates: Array.isArray(body.updates) ? body.updates : [] }, lines);
    broadcast(room);
    schedule(room, 300);
    return sendJSON(res, 200, state());
  }
  if (tool === "get_picks") {
    if (!room.picks) await decide(room, { forcePicks: true });
    broadcast(room);
    return sendJSON(res, 200, room.picks ? state() : { ...state(), note: "Not enough to suggest picks yet." });
  }
  if (tool === "send_private_card") {
    if (body.slot !== "budget") return sendJSON(res, 400, { error: "Only the budget card can be sent." });
    room.card = { slot: "budget", at: now() };
    broadcast(room);
    return sendJSON(res, 200, { sent: true });
  }
  if (tool === "accept_relax") {
    const ok = acceptOffer(room);
    if (ok) await decide(room);
    broadcast(room);
    return sendJSON(res, 200, { loosened: ok, ...state() });
  }
  return sendJSON(res, 404, { error: `Unknown tool: ${tool}` });
}

function init({ events }) {
  eventsSource = events;
}

module.exports = { init, handle, _test: { rooms, createRoom, addPerson, setAnswer, addLine, think, decide, extractKeywords, viewFor, endRoom } };
