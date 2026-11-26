// Sidekick conversation judge: does the planning call sound like a conversation, not a form?
// Runs every scripted call from sidekick-eval.js, for both personas, twice: with keyword reading
// (no AI anywhere) and with a fake AI (a stand-in model that follows the prompt's instructions and
// draft line, and sometimes breaks the rules so the line checks have to catch it). Then scores the
// transcripts:
//   (a) question turns that reflect what was just said (a name or a fact value)    target >= 80%
//   (b) repeated lines (the same line, or the same opener within 3 turns)           target 0
//   (c) average words per turn                                                       target < 25
//       and turns over 2 sentences                                                   target 0
//   (d) turns with more than one question                                            target 0
//   (e) turns that use at least one name (people are always present here)            target >= 50%
//   (f) picks lines: a venue or time detail, a name-linked reason, no raw clutter    target 100%
//   (g) private budget amounts or avoided areas said                                 target 0
//   (h) the opener uses the crew name or the nights                                  target 100%
//
//   node test/sidekick-conversation.js                  score the current code against the baseline
//   node test/sidekick-conversation.js --save-baseline  save the current scores as the "before"
//   node test/sidekick-conversation.js --lines          also print every transcript

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
Object.assign(process.env, { AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1" });
const seed = require(path.join(ROOT, "..", "events", "data", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const claude = require(path.join(ROOT, "lib", "sidekick", "claude"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
const T = R._test;
R.init({ events: () => events });
const BASELINE = path.join(__dirname, "sidekick-conversation.baseline.json");
// The line book picks among versions at random: a fixed seed makes before and after comparable
let seedN = 20261124;
Math.random = () => { seedN = (seedN + 0x6d2b79f5) | 0; let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date());
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const FRI = days.find((d) => new Date(d + "T12:00:00").getDay() === 5);
const SAT = days.find((d) => d > FRI && new Date(d + "T12:00:00").getDay() === 6);

// The same scripted calls as sidekick-eval.js
const SCRIPTS = [
  { name: "Easy agreement", people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "50", origin: "kennedy" }], lines: [["Maya", "Saturday works for me, anything after 6"], ["Jay", "sat is good, after 6 too"], ["Asia", "same, I'd love live music"], ["Jay", "live music works"]], taps: { night: [SAT], time: ["evening"], vibe: ["music"] } },
  { name: "A private tight budget", people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "20", origin: "kennedy" }], lines: [["Asia", "Saturday? after 6"], ["Maya", "saturday works"], ["Jay", "saturday after 8 is better for me, I'm broke till friday"]], taps: { night: [SAT], time: ["evening", "late"], vibe: ["music", "games"] } },
  { name: "Someone rules a night out", people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "30", origin: "finch" }, { name: "Jay", budget: "any", origin: "union" }, { name: "Sam", budget: "30", origin: "union", nos: ["West End"] }], lines: [["Maya", "friday or saturday both work"], ["Jay", "friday is bad for me, sat works"], ["Asia", "saturday then, after 6"], ["Sam", "not the west end please"]], taps: { night: [SAT], time: ["evening"], vibe: ["comedy", "music"] } },
  { name: "A quiet member who only taps", people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "30", origin: "union" }, { name: "Sam", budget: "30", origin: "kipling", quiet: true }], lines: [["Asia", "how about friday after 6"], ["Maya", "friday works, something chill like games"]], taps: { night: [FRI], time: ["evening"], vibe: ["games"] } },
  { name: "Mind changed mid-call", people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }], lines: [["Asia", "friday works"], ["Maya", "friday works for me"], ["Maya", "actually friday is bad, saturday works"], ["Asia", "saturday is fine, after 8, dancing"]], taps: { night: [SAT], time: ["late"], vibe: ["dance"] } },
  { name: "Off-topic chatter, then asks Sidekick", people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "30", origin: "union" }], lines: [["Jay", "did you see the leafs game lol"], ["Maya", "ugh don't"], ["Asia", "saturday after 6?"], ["Maya", "yes saturday"], ["Jay", "sat works"], ["Asia", "Sidekick, what do you think?"]], taps: { night: [SAT], time: ["evening"], vibe: ["music", "comedy"] } },
];

// ---------- The fake AI ----------
// Extraction: keyword reading of the NEW lines in the prompt. Lines: the draft line if the prompt
// gives one, else the question the move spells out. Every 6th reply breaks a rule (three sentences,
// two questions) so the line checks must swap it for the line book.
let current = null;
let replies = 0;
function fakeSay(system, user) {
  replies++;
  const draft = (user.match(/^(?:Draft line|Suggested line)[^:\n]*:\s*(.+)$/m) || [])[1];
  if (replies % 6 === 0) return `${draft || "Okay"}. Also, quick thing. What else? Anything?`;
  if (draft) return draft.replace(/^"|"$/g, "");
  const move = (user.match(/Your move: ([\s\S]*)$/) || [])[1] || "";
  const q = (move.match(/Ask the group: ([^(]+?\?)/) || move.match(/ask:? ([^(]+?\?)/i) || [])[1];
  if (/^Introduce these two picks/.test(move)) {
    const picks = [...move.matchAll(/^\d\) (.+?) \(/gm)].map((m) => m[1]);
    return `Here are two: ${picks[0]} or ${picks[1]}. Which one?`;
  }
  if (/first time you speak/i.test(move) && /lead the planning/.test(move)) return "Welcome to SideQuest! Should I lead the planning or sit back?";
  if (q) return q.charAt(0).toUpperCase() + q.slice(1);
  return "";
}
function fakeTool(system, user) {
  const lines = [...user.matchAll(/^NEW ([^:]+): (.+)$/gm)].map((m) => ({ name: m[1], text: m[2] }));
  return T.extractKeywords(current, lines);
}
const realClaude = { available: claude.available, say: claude.say, tool: claude.tool };
function useAI(on) {
  if (on) {
    claude.available = () => true;
    claude.say = async (s, u) => fakeSay(s, u);
    claude.tool = async (s, u) => fakeTool(s, u);
  } else Object.assign(claude, realClaude);
}

// ---------- Running a call and keeping a timeline ----------
const WEEKDAY = { fri: "friday", sat: "saturday", sun: "sunday", thu: "thursday" };
// The fact words a human turn contains: weekdays, times, vibes, stations
function factWords(text) {
  const t = String(text).toLowerCase();
  const out = new Set();
  for (const [s, full] of Object.entries(WEEKDAY)) if (new RegExp(`\\b(${full}|${s})\\b`).test(t)) out.add(full);
  for (const m of t.matchAll(/after (\d+|six|eight|five|seven)/g)) out.add(m[1]);
  for (const w of ["afternoon", "evening", "late", "music", "jazz", "comedy", "games", "danc", "art", "film", "union", "finch", "kennedy", "kipling"]) if (t.includes(w)) out.add(w);
  return [...out];
}
const NUM = { 6: "six", 8: "eight", 5: "five", 7: "seven" };
function reflects(line, inputs) {
  const t = line.toLowerCase();
  for (const x of inputs) {
    if (t.includes(x.name.toLowerCase())) return true;
    for (const w of x.words) if (t.includes(w) || (NUM[w] && t.includes(NUM[w]))) return true;
  }
  return false;
}

async function run(script, persona, ai) {
  useAI(ai);
  replies = 0;
  const { room: rid } = T.createRoom({ crew: "Test crew", planner: script.people[0].name, nights: [FRI, SAT], persona });
  const room = T.rooms.get(rid);
  current = room;
  room.mode = "lead";
  const people = [room.people[0]];
  for (const p of script.people.slice(1)) people.push(T.addPerson(room, { name: p.name, mode: p.quiet ? "text" : "voice" }));
  script.people.forEach((p, i) => {
    if (p.budget) T.setAnswer(room, people[i], "budget", p.budget, "call_card");
    if (p.origin) T.setAnswer(room, people[i], "origin", p.origin, "call_card");
    if (p.nos) T.setAnswer(room, people[i], "nos", p.nos, "call_card");
  });
  const timeline = [];
  const seen = new Set();
  const collect = () => { for (const s of room.said) if (!seen.has(s.id)) { seen.add(s.id); if (!s.system) timeline.push({ sk: true, text: s.text, move: s.move }); } };
  await T.think(room);
  collect();
  for (const [name, text] of script.lines) {
    T.addLine(room, people[script.people.findIndex((p) => p.name === name)], text, "spoken");
    timeline.push({ human: true, name, text, words: factWords(text) });
    room.lastSaidAt = 0;
    await T.think(room);
    collect();
  }
  for (let round = 0; round < 8 && !room.picks; round++) {
    const slot = room.card && room.card.slot;
    if (!slot) { await T.decide(room, { forcePicks: round > 5 }); collect(); continue; }
    for (const person of people) if (script.taps[slot]) {
      T.setAnswer(room, person, slot, P.SLOTS[slot].multi ? script.taps[slot] : script.taps[slot][0], "call_card");
      const labels = [].concat(script.taps[slot]).map((v) => P.labelOf(slot, v, room));
      timeline.push({ human: true, name: person.name, text: `(tapped ${labels.join(", ")})`, words: slot === "budget" ? [] : factWords(labels.join(" ")) });
    }
    room.lastSaidAt = 0;
    await T.think(room);
    collect();
  }
  if (!room.picks) { room.addressed = { name: "Asia", text: "Sidekick, what do you suggest?" }; await T.decide(room, { forcePicks: true }); collect(); }
  const picks = (room.picks || []).map((p) => ({ title: p.title, where: p.where, when: p.when }));
  T.endRoom(room, "eval");
  useAI(false);
  return { script, persona, ai, timeline, picks, names: script.people.map((p) => p.name) };
}

// ---------- Scoring ----------
const sentences = (t) => String(t).replace(/\.\.\.|…/g, ",").split(/(?<=[.!?])\s+(?=\S)/).filter((s) => /\w/.test(s)).length;
const questions = (t) => (String(t).match(/\?/g) || []).length;
const wordsIn = (t) => String(t).split(/\s+/).filter(Boolean).length;
const opener = (t) => String(t).toLowerCase().replace(/[^a-z' ]+/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
const CLUTTER = /\bw\/|Free event\.|\s@\s|\(RETURN/i;

function score(calls) {
  const s = { qTurns: 0, reflected: 0, repeats: 0, turns: 0, words: 0, long: 0, multiQ: 0, named: 0, picksLines: 0, picksOk: 0, leaks: 0, openers: 0, openersOk: 0, misses: [] };
  for (const c of calls) {
    const sk = c.timeline.filter((x) => x.sk);
    const priv = c.script.people.flatMap((p) => [p.budget && p.budget !== "any" ? p.budget : null, ...(p.nos || [])]).filter(Boolean);
    let since = [];
    const recent = [];
    let first = true;
    for (const x of c.timeline) {
      if (x.human) { since.push(x); continue; }
      s.turns++;
      s.words += wordsIn(x.text);
      if (sentences(x.text) > 2) { s.long++; s.misses.push(`(c) over 2 sentences [${c.persona}${c.ai ? "/AI" : ""}]: ${x.text}`); }
      if (questions(x.text) > 1) { s.multiQ++; s.misses.push(`(d) two questions: ${x.text}`); }
      if (c.names.some((n) => new RegExp(`\\b${n}\\b`).test(x.text))) s.named++;
      if (recent.some((r) => r.text === x.text || r.op === opener(x.text))) { s.repeats++; s.misses.push(`(b) repeat: ${x.text}`); }
      recent.push({ text: x.text, op: opener(x.text) });
      if (recent.length > 3) recent.shift();
      if (questions(x.text) && since.length) {
        s.qTurns++;
        if (reflects(x.text, since)) s.reflected++;
        else s.misses.push(`(a) no reflection [${c.persona}${c.ai ? "/AI" : ""}] after ${since.map((h) => `${h.name}: ${h.text}`).join(" / ")} -> ${x.text}`);
      }
      if (["picks", "fallback"].includes(x.move)) {
        s.picksLines++;
        const detail = c.picks.some((p) => p.where && p.where.split(",").some((w) => w.trim().length > 3 && x.text.includes(w.trim()))) || /\b(at|doors at|starts at|from) \d{1,2}(:\d\d)?\b|\bfree\b|\bbucks\b|\bdollars\b/i.test(x.text);
        const named = c.names.some((n) => new RegExp(`\\b${n}\\b`).test(x.text));
        if (detail && named && !CLUTTER.test(x.text)) s.picksOk++;
        else s.misses.push(`(f) picks line${detail ? "" : " (no venue/time detail)"}${named ? "" : " (no name)"}${CLUTTER.test(x.text) ? " (clutter)" : ""}: ${x.text}`);
      }
      for (const v of priv) {
        const re = /^\d+$/.test(v) ? new RegExp(`\\$\\s?${v}\\b|\\b${v} (bucks|dollars)\\b`, "i") : new RegExp(v, "i");
        if (re.test(x.text) && !/for the group/.test(x.text)) { s.leaks++; s.misses.push(`(g) private: ${x.text}`); }
      }
      if (first) {
        first = false;
        s.openers++;
        if (/test crew|friday|saturday/i.test(x.text)) s.openersOk++;
        else s.misses.push(`(h) opener: ${x.text}`);
      }
      since = [];
    }
    void sk;
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
  return {
    a_reflect_pct: pct(s.reflected, s.qTurns),
    b_repeats: s.repeats,
    c_avg_words: Math.round((s.words / (s.turns || 1)) * 10) / 10,
    c_over_2_sentences: s.long,
    d_multi_question: s.multiQ,
    e_named_pct: pct(s.named, s.turns),
    f_picks_ok_pct: pct(s.picksOk, s.picksLines),
    g_private_leaks: s.leaks,
    h_opener_ok_pct: pct(s.openersOk, s.openers),
    turns: s.turns,
    misses: s.misses,
  };
}
const PASS = { a_reflect_pct: (v) => v >= 80, b_repeats: (v) => v === 0, c_avg_words: (v) => v < 25, c_over_2_sentences: (v) => v === 0, d_multi_question: (v) => v === 0, e_named_pct: (v) => v >= 50, f_picks_ok_pct: (v) => v === 100, g_private_leaks: (v) => v === 0, h_opener_ok_pct: (v) => v === 100 };

// The check-in opener, for both personas (the real calls start there, not with the welcome)
async function checkinOpeners() {
  const out = [];
  for (const persona of ["friend", "concierge"]) {
    const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [FRI, SAT], persona });
    const room = T.rooms.get(rid);
    T.addPerson(room, { name: "Maya", mode: "voice" });
    T.addPerson(room, { name: "Jay", mode: "voice" });
    await T.think(room);
    const line = (room.said.find((s) => s.move === "checkin") || {}).text || "";
    out.push({ persona, line, ok: /sat squad|friday|saturday/i.test(line) && sentences(line) <= 2 && questions(line) <= 1 });
    clearTimeout(room.modeTimer);
    T.endRoom(room, "eval");
  }
  return out;
}

(async () => {
  const logs = console.error;
  console.error = () => {}; // the fake AI's broken replies are logged by the engine; keep the output readable
  const calls = [];
  for (const ai of [false, true]) for (const persona of ["friend", "concierge"]) for (const s of SCRIPTS) calls.push(await run(s, persona, ai));
  const openers = await checkinOpeners();
  console.error = logs;
  const groups = { keywords: calls.filter((c) => !c.ai), "fake AI": calls.filter((c) => c.ai), all: calls };
  const now = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, score(v)]));
  now.all.checkin_opener_ok = openers.every((o) => o.ok);
  const save = process.argv.includes("--save-baseline");
  let before = null;
  try { before = JSON.parse(fs.readFileSync(BASELINE, "utf8")); } catch {}
  if (process.argv.includes("--lines")) {
    for (const c of calls) {
      console.log(`\n[${c.persona}${c.ai ? " · fake AI" : " · keywords"}] ${c.script.name}`);
      for (const x of c.timeline) console.log(x.sk ? `    Sidekick (${x.move}): ${x.text}` : `    ${x.name}: ${x.text}`);
    }
    console.log("\nCheck-in openers:");
    for (const o of openers) console.log(`    [${o.persona}] ${o.line}`);
    console.log("");
  }
  console.log(`Nights: ${FRI} and ${SAT}. ${calls.length} calls (${SCRIPTS.length} scripts × 2 personas × keywords and fake AI).\n`);
  const keys = Object.keys(PASS);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("metric", 22)}${pad("target", 12)}${pad("before", 10)}${pad("after", 10)}after (keywords / fake AI)`);
  const TARGET = { a_reflect_pct: ">= 80%", b_repeats: "0", c_avg_words: "< 25", c_over_2_sentences: "0", d_multi_question: "0", e_named_pct: ">= 50%", f_picks_ok_pct: "100%", g_private_leaks: "0", h_opener_ok_pct: "100%" };
  for (const k of keys) {
    const b = before && before.all ? before.all[k] : "-";
    console.log(`${pad(k, 22)}${pad(TARGET[k], 12)}${pad(b, 10)}${pad(`${now.all[k]}${PASS[k](now.all[k]) ? "" : " ✗"}`, 10)}${now.keywords[k]} / ${now["fake AI"][k]}`);
  }
  console.log(`${pad("checkin opener", 22)}${pad("crew/nights", 12)}${pad(before && before.all ? before.all.checkin_opener_ok : "-", 10)}${now.all.checkin_opener_ok}`);
  const misses = now.all.misses;
  if (misses.length) {
    console.log(`\nMisses (${misses.length}, first 12):`);
    for (const m of misses.slice(0, process.argv.includes("--all") ? 1e9 : 12)) console.log(`  ${m}`);
  }
  if (save) {
    const strip = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "misses"));
    const sample = (persona) => calls.filter((c) => c.persona === persona && !c.ai && c.script.name === "Easy agreement")[0].timeline.map((x) => (x.sk ? `Sidekick: ${x.text}` : `${x.name}: ${x.text}`));
    fs.writeFileSync(BASELINE, JSON.stringify({ savedAt: new Date().toISOString(), keywords: strip(now.keywords), fakeAI: strip(now["fake AI"]), all: strip(now.all), samples: { friend: sample("friend"), concierge: sample("concierge") }, openers }, null, 2) + "\n");
    console.log(`\nSaved the baseline to ${path.relative(process.cwd(), BASELINE)}`);
    process.exit(0);
  }
  const pass = keys.every((k) => PASS[k](now.all[k])) && now.all.checkin_opener_ok;
  console.log(pass ? "\nPASS" : "\nFAIL");
  process.exit(pass ? 0 : 1);
})();
