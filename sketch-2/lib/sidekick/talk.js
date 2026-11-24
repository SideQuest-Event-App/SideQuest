// How Sidekick talks like someone on the call, not a form. Plain code, no AI: the line book and the AI
// prompt both use it, so a slow or missing model still sounds like a conversation.
//   - heardPhrase: say back what was just said, with names ("Saturday after 6, love it, and Jay said games")
//   - handTo: who to hand the next question to, by name (someone who hasn't had a say)
//   - stories: picks told like a DJ (a hook, a vivid detail, why it fits named people)
//   - spokenTitle: listing titles cleaned for the ear ("w/", "Free event.", "@ venue", emoji, dates)
//   - shortTurn: at most 2 sentences and 1 question per turn
//   - chatText: the shorter version for the typed chat thread
//   - unclearNight / offTopic: the one thing to ask about, and chatter to answer briefly
// Private answers never pass through here: budget and places to avoid aren't public slots.

const P = require("./plan");

const PUBLIC = ["night", "time", "vibe", "origin", "kind"];
const DAY = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const dayOf = (room, v) => DAY[String(P.labelOf("night", v, room)).slice(0, 3)] || P.labelOf("night", v, room);
const VIBE_WORDS = { music: "live music", comedy: "comedy", games: "games", dance: "dancing", arts: "art and film" };
const TIME_WORDS = { early: "the afternoon", evening: "after 6", late: "after 8" };
const KIND_WORDS = { events: "a ticketed event", places: "somewhere to drop in", either: "either kind of plan" };

// What a value sounds like out loud
function say(room, slot, v) {
  if (slot === "night") return dayOf(room, v);
  if (slot === "time") return TIME_WORDS[v] || String(v);
  if (slot === "vibe") return VIBE_WORDS[v] || String(v).toLowerCase();
  if (slot === "kind") return KIND_WORDS[v] || String(v);
  if (slot === "origin") return P.labelOf("origin", v, room);
  return String(v);
}
const orList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs[0] || "");
const andList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] || "");
const valuesSaid = (room, slot, values) => orList([].concat(values).map((v) => say(room, slot, v)));
// The label a heard chip shows ("Saturday", "After 6", "Live music + Games")
const chipLabel = (room, slot, values) => [].concat(values).map((v) => (slot === "night" ? dayOf(room, v) : P.labelOf(slot, v, room))).join(slot === "vibe" ? " + " : " or ");

// ---------- Turn shape ----------
const sentences = (t) => String(t || "").replace(/\.\.\.|…/g, ",").split(/(?<=[.!?])\s+(?=\S)/).filter((s) => /\w/.test(s)).length;
const questions = (t) => (String(t || "").match(/\?/g) || []).length;
const shortTurn = (t) => sentences(t) <= 2 && questions(t) <= 1;

// ---------- Saying back what was heard ----------
// entries: room.heard since Sidekick's last line. Returns a clause without a full stop, or null.
// opts: { persona, f (facts), turn (Sidekick's turn count, for using signature moves sparingly) }
function heardPhrase(room, entries, { persona, f, turn = 0 }) {
  const fresh = (entries || []).filter((h) => !h.undone && PUBLIC.includes(h.slot) && !h.here);
  if (!fresh.length) return null;
  const friend = persona === "friend";
  const latest = new Map();
  for (const h of fresh) latest.set(`${h.pid}:${h.slot}`, h);
  const list = [...latest.values()];
  const crewN = P.crew(room).length;
  // Settled for the group (night and time read together: "Saturday after 6")
  const settled = [];
  let allIn = false;
  for (const slot of ["night", "time", "kind"]) {
    if (!list.some((h) => h.slot === slot) || !f[slot].known || !(f[slot].value || []).length) continue;
    const vals = f[slot].value;
    if (slot === "night" && vals.length > 1 && room.nights.length === vals.length) continue; // "any night" isn't news
    settled.push(slot === "time" && settled.length ? say(room, slot, vals[0]) : valuesSaid(room, slot, slot === "time" ? vals.slice(0, 1) : vals));
    const who = P.answersFor(room, slot).length;
    if (who >= 2 && who === crewN) allIn = true;
  }
  // A vibe the whole crew shares counts as settled too ("everyone's up for games")
  const vibeAll = list.filter((h) => h.slot === "vibe");
  let shared = null;
  if (vibeAll.length >= 2 && vibeAll.length === crewN) shared = [...new Set(vibeAll[0].values)].find((v) => vibeAll.every((h) => h.values.includes(v)));
  if (shared) settled.push(friend ? `everyone up for ${say(room, "vibe", shared)}` : `${say(room, "vibe", shared)} for everyone`);
  // What individuals said that isn't settled yet, one bit per person ("Asia said after 6 and comedy")
  const solo = list.filter((h) => (h.slot === "vibe" && !shared) || (["night", "time", "origin"].includes(h.slot) && !(f[h.slot].known && settled.length)));
  const byPerson = new Map();
  for (const h of solo) byPerson.set(h.pid, [...(byPerson.get(h.pid) || []), h]);
  const people = [...byPerson.values()].map((hs) => ({ pid: hs[0].pid, name: hs[0].name, slot: hs[0].slot, values: hs[0].values, hs }));
  const bits = people.slice(0, settled.length ? 1 : 2).map((x, i) => {
    const what = andList(x.hs.map((h) => (h.slot === "origin" ? `coming from ${valuesSaid(room, h.slot, h.values)}` : valuesSaid(room, h.slot, h.values))));
    if (friend) return i === 0 ? `${x.name} said ${what}` : `${x.name}'s leaning ${what}`;
    return i === 0 ? `${x.name} mentioned ${what}` : `${x.name} ${what}`;
  });
  const soloText = bits.length ? (friend ? bits.join(", ") : bits.join(" and ")) : "";
  if (!settled.length) {
    if (!soloText) return null;
    // A concierge habit, used sparingly: thank the one person who just answered by name
    if (!friend && people.length === 1 && turn % 3 === 1) return `Thank you, ${people[0].name}, ${people[0].slot === "vibe" ? "that's" : "noted:"} ${valuesSaid(room, people[0].slot, people[0].values)}`;
    return soloText;
  }
  const what = settled.join(" ");
  let head;
  if (friend) head = allIn ? `Everyone's on ${what}, love that` : turn % 2 ? `${what}, nice` : `${what}, love it`;
  else head = allIn ? `${what} works for everyone` : `${what}, noted`;
  // Who said it, when nobody else is named in the line
  if (!soloText) {
    const names = [...new Set(list.filter((h) => settled.length && ["night", "time", "kind"].includes(h.slot)).map((h) => h.name))];
    if (!allIn && names.length && names.length <= 2) head = friend ? `${what} from ${andList(names)}, love it` : `${what} for ${andList(names)}, noted`;
    return head;
  }
  return `${head}, and ${soloText}`;
}

// A concierge habit: a short sum-up of what's settled ("So far: Saturday, after 6, live music")
function summary(room, f) {
  const out = [];
  if (f.night.known && (f.night.value || []).length && f.night.value.length < room.nights.length) out.push(valuesSaid(room, "night", f.night.value));
  if (f.time.known && (f.time.value || []).length) out.push(say(room, "time", f.time.value[0]));
  if (f.vibe.known && (f.vibe.value || []).length) out.push(say(room, "vibe", f.vibe.value[0]));
  return out.length >= 2 ? `So far: ${out.join(", ")}` : null;
}

// Who to hand the next question to: someone in the call who hasn't answered it, preferring whoever's
// had the least say and wasn't handed the last question. Null when everyone's answered.
function handTo(room, slot, { skip = [] } = {}) {
  if (!slot || !P.SLOTS[slot] || P.SLOTS[slot].private) return null;
  const got = new Set(P.answersFor(room, slot).map((x) => x.person.id));
  const said = (pid) => room.lines.filter((l) => l.pid === pid).length + (room.heard || []).filter((h) => h.pid === pid).length;
  const pool = P.crew(room).filter((p) => p.mode !== "form" && !got.has(p.id) && !skip.includes(p.id));
  if (!pool.length) return null;
  pool.sort((a, b) => (a.id === room.handedTo) - (b.id === room.handedTo) || said(a.id) - said(b.id));
  return pool[0];
}

// ---------- Titles for the ear ----------
// "Free event. Bello's Birthday Bash w/karaoke @ Owl's Club" -> "Bello's Birthday Bash"
// "54.40" -> "54.40 at the Danforth Music Hall" (a title that's just a number needs its venue)
function spokenTitle(title, venue) {
  let t = String(title || "");
  t = t.replace(/^Free event\.\s*/i, "");
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "");
  t = t.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s*\([^)]*\)\s*/g, " ");
  t = t.replace(/\s+w\/.*$/i, "").replace(/\s*@\s*.*$/, "").replace(/\s+\|\s.*$/, "");
  t = t.replace(/\s+[-–—]\s+.*$/, "");
  t = t.replace(/:\s+(.*)$/, (m, tail) => (/\b(tour|live|anniversary|concert|edition)\b/i.test(tail) || tail === tail.toUpperCase() ? "" : m));
  const first = String(venue || "").replace(/^the\s+/i, "").split(/\s+/)[0];
  if (first) t = t.replace(new RegExp(`\\s+at\\s+(the\\s+)?${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "i"), "");
  t = t.replace(/[!?]/g, ""); // a title never ends a sentence or asks a question
  t = t.replace(/\s{2,}/g, " ").replace(/[\s,.:;!-]+$/, "").trim();
  if (!t) t = String(title || "").trim();
  if (!/[a-z]{2}/i.test(t) && venue) t = `${t} at ${spokenVenue(venue).replace(/^the\s+/i, "the ")}`;
  return t;
}

// ---------- Picks as a short story ----------
const startFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
const spokenTime = (iso) => startFmt.format(new Date(iso)).replace(":00", "").replace(/\s?[AP]M$/, "");
function vibesOf(e) {
  return Object.keys(P.VIBES).filter((v) => (e.vibes || []).some((t) => P.VIBES[v].includes(t)));
}
// A venue name for the ear: "Meridian Arts Centre: Lyric Theatre" -> "Meridian Arts Centre", "St." -> "St"
function spokenVenue(v) {
  return String(v || "").replace(/\s*\([^)]*\)/g, "").replace(/:.*$/, "").replace(/\s+Concert Venue$/i, "").replace(/\b(St|Ave|Mt|Dr)\./g, "$1").trim();
}
// Why it fits named people: who asked for its vibe, whose night it is, or who has a short trip.
// skip: reasons already used (so the second pick names someone else when it can)
function reasonFor(room, e, persona, f, skip = []) {
  const friend = persona === "friend";
  const out = [];
  for (const v of vibesOf(e)) {
    const names = P.answersFor(room, "vibe").filter((x) => [].concat(x.a.value).includes(v)).map((x) => x.person.name).slice(0, 2);
    if (names.length) out.push(friend ? `${andList(names)}'s ${VIBE_WORDS[v]}` : `${VIBE_WORDS[v]} for ${andList(names)}`);
  }
  const nightNames = f.night.known && (f.night.value || []).length ? (f.night.supporters[f.night.value[0]] || []).slice(0, 2) : [];
  if (nightNames.length) out.push(friend ? `on ${andList(nightNames)}'s night` : `on ${andList(nightNames)}'s night`);
  for (const p of P.crew(room)) {
    const o = (room.answers[p.id] || {}).origin;
    const t = o && !o.here && e.travel && e.travel.from && e.travel.from[o.value];
    if (t && t.minutes <= 25) out.push(friend ? `close for ${p.name}` : `a short trip for ${p.name}`);
  }
  const first = P.crew(room)[0];
  out.push(friend ? `good for ${first ? first.name : "the crew"} and the crew` : `suited to ${first ? first.name : "the crew"} and everyone`);
  return out.find((r) => !skip.includes(r)) || out[0];
}
// One pick, told in a breath: "54.40 at the Danforth Music Hall at 7, Maya's live music"
function story(room, e, persona, f, skip = []) {
  const venue = spokenVenue(e.venue && e.venue.name);
  const name = spokenTitle(e.title, venue);
  const why = reasonFor(room, e, persona, f, skip);
  story.last = why;
  if (e.type === "place") return `${name}${e.neighbourhood ? ` in ${e.neighbourhood}` : ""}${e.price === 0 ? ", free" : ""}, ${why}`;
  // One vivid detail: the venue when the name is short (a bare number already carries it), else the start time
  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  const hasVenue = venue && name.toLowerCase().includes(venue.toLowerCase().replace(/^the\s+/, ""));
  const detail = hasVenue || !venue || words(name) + words(venue) > 7 ? (e.startsAt ? ` at ${spokenTime(e.startsAt)}` : "") : ` at ${venue}`;
  return `${name}${detail}${e.price === 0 ? ", free" : ""}, ${why}`;
}
// Both picks, with different reasons where possible
function stories(room, list, persona, f) {
  const used = [];
  return list.map((e) => { const s = story(room, e, persona, f, used); used.push(story.last); return s; });
}

// ---------- The typed chat thread ----------
// A spoken line, made shorter for reading: no spoken padding at the start, no "take your time"
function chatText(text) {
  let t = String(text || "").trim();
  for (let i = 0; i < 3; i++) t = t.replace(/^(okay|alright|so|hey( hey)?( y'all)?|y'all|love it|say less|nice|ha|oh|right|wonderful|of course|lovely)[,!.]?\s+/i, "");
  t = t.replace(/\s*(Take your time|Shout it out or tap it|Either works well|No pressure)[.!]?\s*/gi, " ");
  // Spoken padding a reader doesn't need
  t = t.replace(/,\s*(love it|nice|noted|love that)(?=[,.])/gi, "").replace(/,? and (budget's sorted privately|budgets are in, privately)/gi, "");
  t = t.replace(/\bNow the fun part, ([A-Z][\w'-]*): /g, "$1, ").replace(/\bNow the fun part: /g, "").replace(/\bQuick one, ([A-Z][\w'-]*): /g, "$1, ");
  t = t.replace(/\byou can actually talk\b/g, "you can talk");
  t = t.replace(/\bVote with your thumbs!/, "Vote on the cards.").replace(/\s{2,}/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------- The one unclear thing, and chatter ----------
const HEDGE = /\b(maybe|probably|not sure|i think|might|depends|kinda|i guess|either\?)\b/i;
// "maybe friday, or saturday?" -> the two nights, so Sidekick can ask just that person about just that
function unclearNight(room, text) {
  const t = String(text).toLowerCase();
  if (!HEDGE.test(t) && !/\bor\b[^.?!]*\?/.test(t)) return null;
  if (/\b(both|either|any|all)\b(?!\?)/.test(t) && !HEDGE.test(t)) return null;
  const hits = room.nights.filter((d) => {
    const wd = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    return new RegExp(`\\b(${wd}|${wd.slice(0, 3)})\\b`).test(t);
  });
  return hits.length >= 2 ? hits : null;
}
const TOPICS = [[/\bleafs\b/i, "Leafs"], [/\braptors\b/i, "Raptors"], [/\bblue ?jays\b|\bjays game\b/i, "Jays"], [/\b(the|that) game\b|\bhockey\b|\bbasketball\b/i, "game"], [/\bwork(ing)? (today|tomorrow)|\bmy boss\b/i, "work"], [/\bweather\b|\bsnow(ing)?\b|\bfreezing\b/i, "weather"], [/\bdid you (see|watch)\b/i, "that"]];
function offTopic(text) {
  for (const [re, label] of TOPICS) if (re.test(text)) return label;
  return null;
}
// The brief reaction before steering back
function asideFor(persona, topic) {
  if (persona === "friend") return topic === "that" ? "Ha, tell me after we pick, promise" : `${topic === "game" ? "Game talk" : `${topic} talk`} after we pick, promise`;
  return topic === "that" ? "Happy to hear about it once we've picked" : `Let's save the ${topic === "game" ? "game" : topic} chat for after we pick`;
}

module.exports = { PUBLIC, say, valuesSaid, chipLabel, orList, andList, sentences, questions, shortTurn, heardPhrase, summary, handTo, spokenTitle, spokenVenue, story, stories, reasonFor, chatText, unclearNight, offTopic, asideFor, spokenTime };
