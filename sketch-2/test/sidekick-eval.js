// Sidekick eval: scripted planning calls with known answers, run through the real engine and the
// real event listings. Checks that every pick obeys every person's limits, that private answers never
// leak into what Sidekick says, and how many questions it took. Runs both personas.
//
//   node test/sidekick-eval.js            (uses the AI if ANTHROPIC_API_KEY is set, else keyword reading)
//   node test/sidekick-eval.js --keywords (force keyword reading, no AI calls for understanding speech)
//
// Pass: 100% of picks obey every hard limit, 0 privacy leaks, median questions before picks <= 4.

const path = require("path");
const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "sketch-1", "seed", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
const T = R._test;
R.init({ events: () => events });
if (process.argv.includes("--keywords")) process.env.ANTHROPIC_API_KEY = "";

// Pick the next Friday and Saturday that have listings, so the scripts keep working as dates pass
const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date());
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const FRI = days.find((d) => new Date(d + "T12:00:00").getDay() === 5);
const SAT = days.find((d) => d > FRI && new Date(d + "T12:00:00").getDay() === 6);

// Each script: people (with private limits given on the join card), lines, and taps on the open card
const SCRIPTS = [
  {
    name: "Easy agreement",
    people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "50", origin: "kennedy" }],
    lines: [["Maya", "Saturday works for me, anything after 6"], ["Jay", "sat is good, after 6 too"], ["Asia", "same, I'd love live music"], ["Jay", "live music works"]],
    taps: { night: [SAT], time: ["evening"], vibe: ["music"] },
  },
  {
    name: "A private tight budget",
    people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "20", origin: "kennedy" }],
    lines: [["Asia", "Saturday? after 6"], ["Maya", "saturday works"], ["Jay", "saturday after 8 is better for me, I'm broke till friday"]],
    taps: { night: [SAT], time: ["evening", "late"], vibe: ["music", "games"] },
  },
  {
    name: "Someone rules a night out",
    people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "30", origin: "finch" }, { name: "Jay", budget: "any", origin: "union" }, { name: "Sam", budget: "30", origin: "union", nos: ["West End"] }],
    lines: [["Maya", "friday or saturday both work"], ["Jay", "friday is bad for me, sat works"], ["Asia", "saturday then, after 6"], ["Sam", "not the west end please"]],
    taps: { night: [SAT], time: ["evening"], vibe: ["comedy", "music"] },
  },
  {
    name: "A quiet member who only taps",
    people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "30", origin: "union" }, { name: "Sam", budget: "30", origin: "kipling", quiet: true }],
    lines: [["Asia", "how about friday after 6"], ["Maya", "friday works, something chill like games"]],
    taps: { night: [FRI], time: ["evening"], vibe: ["games"] },
  },
  {
    name: "Mind changed mid-call",
    people: [{ name: "Asia", budget: "50", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }],
    lines: [["Asia", "friday works"], ["Maya", "friday works for me"], ["Maya", "actually friday is bad, saturday works"], ["Asia", "saturday is fine, after 8, dancing"]],
    taps: { night: [SAT], time: ["late"], vibe: ["dance"] },
  },
  {
    name: "Off-topic chatter, then asks Sidekick",
    people: [{ name: "Asia", budget: "30", origin: "union" }, { name: "Maya", budget: "50", origin: "union" }, { name: "Jay", budget: "30", origin: "union" }],
    lines: [["Jay", "did you see the leafs game lol"], ["Maya", "ugh don't"], ["Asia", "saturday after 6?"], ["Maya", "yes saturday"], ["Jay", "sat works"], ["Asia", "Sidekick, what do you think?"]],
    taps: { night: [SAT], time: ["evening"], vibe: ["music", "comedy"] },
  },
];

const hourBucket = (iso) => {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  return h >= 20 || h < 4 ? "late" : h >= 17 ? "evening" : "early";
};

async function run(script, persona) {
  const { room: rid } = T.createRoom({ crew: "Test crew", planner: script.people[0].name, nights: [FRI, SAT], persona });
  const room = T.rooms.get(rid);
  const people = [room.people[0]];
  for (const p of script.people.slice(1)) people.push(T.addPerson(room, { name: p.name, mode: p.quiet ? "text" : "voice" }));
  script.people.forEach((p, i) => {
    if (p.budget) T.setAnswer(room, people[i], "budget", p.budget, "call_card");
    if (p.origin) T.setAnswer(room, people[i], "origin", p.origin, "call_card");
    if (p.nos) T.setAnswer(room, people[i], "nos", p.nos, "call_card");
  });
  await T.think(room);
  for (const [name, text] of script.lines) {
    T.addLine(room, people[script.people.findIndex((p) => p.name === name)], text, "spoken");
    room.lastSaidAt = 0;
    await T.think(room);
  }
  // Then everyone taps whatever card is open, until picks appear (at most 8 rounds)
  for (let round = 0; round < 8 && !room.picks; round++) {
    const slot = room.card && room.card.slot;
    if (!slot) { await T.decide(room, { forcePicks: round > 5 }); continue; }
    for (const person of people) if (script.taps[slot]) T.setAnswer(room, person, slot, P.SLOTS[slot].multi ? script.taps[slot] : script.taps[slot][0], "call_card");
    room.lastSaidAt = 0;
    await T.think(room);
  }
  if (!room.picks) { room.addressed = { name: "Asia", text: "Sidekick, what do you suggest?" }; await T.decide(room, { forcePicks: true }); }

  // Checks
  const min = Math.min(...script.people.map((p) => (p.budget === "any" ? Infinity : Number(p.budget))));
  const avoid = script.people.flatMap((p) => p.nos || []);
  const relaxed = room.relax || new Set();
  const violations = [];
  for (const pk of room.picks || []) {
    const e = events.find((x) => x.id === pk.id);
    if (!relaxed.has("budget") && e.price != null && e.price > min) violations.push(`${e.title}: $${e.price} > $${min}`);
    if (!relaxed.has("area") && avoid.includes(e.area)) violations.push(`${e.title}: in ${e.area}`);
    if (!relaxed.has("night") && ![FRI, SAT].includes(P.localDay(e.startsAt))) violations.push(`${e.title}: wrong night`);
    const agreed = P.facts(room).night.value;
    if (!relaxed.has("night") && agreed && !agreed.includes(P.localDay(e.startsAt))) violations.push(`${e.title}: not the agreed night`);
  }
  // Privacy: no Sidekick line may state a dollar amount someone gave privately, or name a dealbreaker
  const privateAmounts = script.people.map((p) => p.budget).filter((b) => b && b !== "any");
  const leaks = room.said.filter((s) => privateAmounts.some((a) => new RegExp(`\\$\\s?${a}\\b`).test(s.text) && !/for the group/.test(s.text)) || avoid.some((a) => s.text.includes(a))).map((s) => s.text);
  const out = {
    name: script.name,
    persona,
    picks: (room.picks || []).map((p) => `${p.title} (${p.price}, ${p.when})`),
    questions: room.asked.length,
    relaxed: [...relaxed],
    violations,
    leaks,
    lines: room.said.map((s) => `(${s.move}) ${s.text}`),
  };
  T.endRoom(room, "eval");
  return out;
}

(async () => {
  console.log(`Nights: ${FRI} and ${SAT}. Understanding speech with: ${process.env.ANTHROPIC_API_KEY ? "AI" : "keywords"}\n`);
  const results = [];
  for (const persona of ["friend", "concierge"])
    for (const s of SCRIPTS) {
      const r = await run(s, persona);
      results.push(r);
      const ok = r.picks.length === 2 && !r.violations.length && !r.leaks.length;
      console.log(`${ok ? "PASS" : "FAIL"}  [${persona}] ${r.name}: ${r.questions} questions${r.relaxed.length ? `, loosened ${r.relaxed.join(", ")}` : ""}`);
      r.picks.forEach((p) => console.log(`        pick: ${p}`));
      r.violations.forEach((v) => console.log(`        VIOLATION: ${v}`));
      r.leaks.forEach((v) => console.log(`        LEAK: ${v}`));
      if (process.argv.includes("--lines")) r.lines.forEach((l) => console.log(`        ${l}`));
    }
  const qs = results.map((r) => r.questions).sort((a, b) => a - b);
  const median = qs[Math.floor(qs.length / 2)];
  const allPicks = results.every((r) => r.picks.length === 2);
  const clean = results.every((r) => !r.violations.length);
  const private0 = results.every((r) => !r.leaks.length);
  console.log(`\nPicks made in every call: ${allPicks ? "yes" : "no"} · hard limits obeyed: ${clean ? "100%" : "NO"} · privacy leaks: ${private0 ? 0 : "SOME"} · median questions: ${median}`);
  const pass = allPicks && clean && private0 && median <= 4;
  console.log(pass ? "PASS" : "FAIL");
  process.exit(pass ? 0 : 1);
})();
