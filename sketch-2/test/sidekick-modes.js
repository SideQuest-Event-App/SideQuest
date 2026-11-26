// Tests for the opening check-in: Sidekick asks whether it should lead or sit back, everyone votes,
// and the call runs in that mode. Uses keyword reading (no AI) and the real listings.
//
//   node test/sidekick-modes.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-modes-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1" });

const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "events", "data", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
R.init({ events: () => events });
const T = R._test;

const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date());
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const FRI = days.find((d) => new Date(d + "T12:00:00").getDay() === 5);
const SAT = days.find((d) => d > FRI && new Date(d + "T12:00:00").getDay() === 6);

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}
async function newCall(persona = "friend", extra = ["Maya", "Jay"]) {
  const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [FRI, SAT], persona });
  const room = T.rooms.get(rid);
  const people = [room.people[0], ...extra.map((n) => T.addPerson(room, { name: n, mode: n === "Jay" ? "text" : "voice" }))];
  await T.think(room);
  return { room, people };
}
const last = (room) => room.said[room.said.length - 1];

(async () => {
  await test("Alone, the planner waits a few seconds for a friend, then Sidekick leads instead of staying silent", async () => {
    const { room: rid } = T.createRoom({ crew: "Solo", planner: "Asia", nights: [FRI, SAT], persona: "friend" });
    const room = T.rooms.get(rid);
    await T.think(room);
    assert.strictEqual(room.mode, null, "no hello in the first seconds: a friend may be joining");
    assert.strictEqual(room.said.length, 0);
    room.createdAt -= 5000; // the short wait is over and nobody joined
    await T.think(room);
    assert.strictEqual(room.mode, "lead");
    assert.strictEqual(room.modeHow, "solo");
    assert(room.said.length > 0, "Sidekick says something");
    T.endRoom(room, "test");
  });

  await test("Alone, typing to Sidekick gets an answer straight away (no wait for a friend)", async () => {
    const { room: rid } = T.createRoom({ crew: "Solo", planner: "Asia", nights: [FRI, SAT], persona: "friend" });
    const room = T.rooms.get(rid);
    T.addLine(room, room.people[0], "Friday works, we want live music", "typed");
    await T.think(room);
    assert.strictEqual(room.mode, "lead");
    assert(room.said.length > 0, "Sidekick answers");
    T.endRoom(room, "test");
  });

  await test("A live voice that connects but stays silent hands back to the built-in voice", async () => {
    process.env.SIDEKICK_AGENT_SILENT_MS = "200";
    const { room } = await newCall("friend");
    room.agent = { startedAt: Date.now(), reserved: 0, live: true };
    room.agentMode = true;
    T.armAgentWatch(room);
    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(room.agentMode, false, "the built-in voice takes over");
    assert(room.agentSilent, "the planner's phone is told to close its session");
    assert(T.viewFor(room, room.people[0].id).agentSilent, "and it's in the view");
    // An agent that does speak keeps the call
    room.agent = { startedAt: Date.now(), reserved: 0, live: true };
    room.agentMode = true; room.agentSilent = null;
    T.armAgentWatch(room);
    room.agentSaidAt = Date.now() + 1;
    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(room.agentMode, true, "a speaking agent isn't cut off");
    delete process.env.SIDEKICK_AGENT_SILENT_MS;
    T.endRoom(room, "test");
  });

  await test("The call opens with the check-in and a vote card for everyone", async () => {
    const { room, people } = await newCall("friend");
    assert.strictEqual(room.mode, "voting");
    assert.strictEqual(last(room).move, "checkin");
    assert.match(last(room).text, /SideQuest/);
    const card = T.viewFor(room, people[1].id).card;
    assert.strictEqual(card.slot, "mode");
    assert.deepStrictEqual(card.options.map((o) => o.value), ["lead", "sidelines"]);
    assert(room.modeTimer, "a silence timer is running");
    console.log(`        Friend: "${last(room).text}"`);
    T.endRoom(room, "test");
  });

  await test("Everyone votes lead: Sidekick confirms and asks the first question in one line", async () => {
    const { room, people } = await newCall("concierge");
    for (const p of people) T.voteMode(room, p, "lead", "tap");
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(room.mode, "lead");
    assert.strictEqual(last(room).move, "mode_lead");
    assert.strictEqual(room.card.slot, "night");
    assert.match(last(room).text, /what day works best/i);
    console.log(`        Concierge: "${last(room).text}"`);
    T.endRoom(room, "test");
  });

  await test("A spoken 'nah, we've got it' counts as a sit-back vote, and a tie goes to lead", async () => {
    const { room, people } = await newCall("friend", ["Maya"]);
    T.addLine(room, people[1], "nah we've got it", "spoken");
    assert.strictEqual(room.modeVotes[people[1].id], "sidelines");
    T.addLine(room, people[0], "yeah take the lead", "spoken");
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(room.mode, "lead", "1 to 1 is a tie, and a tie means lead");
    T.endRoom(room, "test");
  });

  await test("Nobody answers: Sidekick takes the lead and says so", async () => {
    const { room } = await newCall("friend");
    await T.closeMode(room); // what the 3-second silence timer does
    assert.strictEqual(room.mode, "lead");
    assert.strictEqual(room.modeHow, "default");
    assert.strictEqual(last(room).move, "mode_default");
    console.log(`        Friend: "${last(room).text}"`);
    T.endRoom(room, "test");
  });

  await test("The silence timer really closes the vote about 3 seconds after the check-in", async () => {
    const { room } = await newCall("concierge", ["Maya"]);
    const wait = 600 + room.said[room.said.length - 1].text.split(/\s+/).length * 380 + 3000;
    await new Promise((r) => setTimeout(r, wait + 400));
    assert.strictEqual(room.mode, "lead");
    assert.strictEqual(room.modeHow, "default");
    T.endRoom(room, "test");
  }).catch(() => {});

  await test("Majority sits back: everyone gets the whole plan as a form, and Sidekick stays quiet", async () => {
    const { room, people } = await newCall("friend");
    T.voteMode(room, people[0], "sidelines", "tap");
    T.voteMode(room, people[1], "sidelines", "tap");
    T.voteMode(room, people[2], "lead", "tap");
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(room.mode, "sidelines");
    assert.strictEqual(last(room).move, "mode_sidelines");
    const card = T.viewFor(room, people[1].id).card;
    assert(card.form, "a form card");
    assert.deepStrictEqual(card.slots.map((c) => c.slot), ["night", "time", "vibe", "origin"]);
    assert(card.budget && card.budget.private, "the budget question is private to each person");
    const saidBefore = room.said.length;
    // They fill it in, with a clash on vibe; Sidekick says nothing until picks
    for (const p of people) { T.setAnswer(room, p, "night", [SAT], "call_card"); T.setAnswer(room, p, "time", ["evening", "late"], "call_card"); T.setAnswer(room, p, "origin", "union", "call_card"); }
    T.setAnswer(room, people[0], "vibe", ["music"], "call_card");
    T.setAnswer(room, people[1], "vibe", ["games"], "call_card");
    room.lastSaidAt = 0;
    await T.think(room);
    assert.strictEqual(room.said.length, saidBefore, "no questions, clashes or ideas out loud while sitting back");
    T.setAnswer(room, people[2], "vibe", ["music"], "call_card");
    for (const p of people) T.setAnswer(room, p, "budget", "50", "call_card");
    room.lastSaidAt = 0;
    await T.think(room);
    assert(room.picks && room.picks.length === 2, "picks once everyone's in");
    assert.strictEqual(last(room).move, "picks");
    T.endRoom(room, "test");
  });

  await test("'Sidekick, take over' switches from sitting back to leading", async () => {
    const { room, people } = await newCall("concierge", ["Maya"]);
    for (const p of people) T.voteMode(room, p, "sidelines", "tap");
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(room.mode, "sidelines");
    T.addLine(room, people[1], "Sidekick, can you take over?", "spoken");
    room.lastSaidAt = 0;
    await T.think(room);
    assert.strictEqual(room.mode, "lead");
    assert.strictEqual(last(room).move, "switch_lead");
    console.log(`        Concierge: "${last(room).text}"`);
    T.addLine(room, people[0], "Sidekick, step back, we've got it", "spoken");
    room.lastSaidAt = 0;
    await T.think(room);
    assert.strictEqual(room.mode, "sidelines");
    assert.strictEqual(last(room).move, "switch_sidelines");
    T.endRoom(room, "test");
  });

  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
