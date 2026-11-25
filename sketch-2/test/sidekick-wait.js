// Tests for "Wait for everyone, or show me now?": when the planner has answered everything, nobody else has,
// and people they invited haven't joined or answered, Sidekick asks once (two buttons, or say it). Wait turns the
// call into the form (Decide by, invites held in quiet hours, picks when everyone's in, a note to vote); Show me
// now goes to the confirmation and the picks. Keyword reading (no AI), the real listings, a stand-in database.
//
//   node test/sidekick-wait.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-wait-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_SOLO_MS: "0", AI: "off" });

const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "sketch-1", "seed", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
const personas = require(path.join(ROOT, "lib", "sidekick", "personas"));
// A stand-in database, so the in-app invites and vote notes have somewhere to go
const users = {
  maya: { id: "maya", name: "Maya", settings: { notifications: { quiet: false } } },
  kai: { id: "kai", name: "Kai", settings: { notifications: { quiet: true, quietFrom: "00:00", quietTo: "23:59" } } }, // always in quiet hours
  asia: { id: "asia", name: "Asia", settings: { notifications: { quiet: false } } },
};
require(path.join(ROOT, "lib", "sidekick", "planflow")).init({ db: { data: { users, events: [] }, save() {} } });
R.init({ events: () => events });
const T = R._test;

const upcoming = events.filter((e) => e.startsAt && new Date(e.startsAt) > new Date(Date.now() + 2 * 86400000));
const days = [...new Set(upcoming.map((e) => P.localDay(e.startsAt)))].sort();
const SAT = days.find((d) => new Date(d + "T12:00:00").getDay() === 6) || days[0];
const PRIVATE = /\$|\bunder\b|budget|bucks|dollars|twenty|thirty|fifty|Etobicoke|Scarborough|North York/i;

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack.split("\n").slice(0, 3).join("\n      ")}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const said = (room) => room.said.filter((x) => !x.system);
const last = (room) => said(room)[said(room).length - 1];
function answerAll(room, person) {
  T.setAnswer(room, person, "night", [SAT], "call_card");
  T.setAnswer(room, person, "time", ["evening", "late"], "call_card");
  T.setAnswer(room, person, "vibe", ["music", "comedy", "games"], "call_card");
  T.setAnswer(room, person, "origin", "union", "call_card");
  T.setAnswer(room, person, "budget", "any", "call_card");
  T.setAnswer(room, person, "nos", ["Etobicoke"], "call_card");
}
// A planner alone on a call, with these people invited from the app, who has answered everything
async function soloCall({ persona = "friend", members = ["Maya", "Kai"], invite = ["u:maya", "u:kai"] } = {}) {
  const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [SAT], persona, members, invite, user: "asia" });
  const room = T.rooms.get(rid);
  answerAll(room, room.people[0]);
  await T.think(room);
  return { room, planner: room.people[0] };
}
// The route the planner's tap goes to
async function tap(room, person, choice) {
  let out;
  await R.handle({ method: "POST" }, {}, new URL(`http://x/api/sk/rooms/${room.id}/wait`), { readBody: async () => ({ p: person.id, choice }), sendJSON: (res, status, body) => { out = { status, body }; } });
  return out;
}
const fakeStream = (room, pid) => room.streams.set(pid, { write() {}, end() {} });
function noPrivate(room) {
  for (const l of said(room)) assert(!PRIVATE.test(l.text), `a line carries a private answer: "${l.text}"`);
}

(async () => {
  await test("The question comes up when the planner has answered everything and the invited people haven't (Friend)", async () => {
    const { room, planner } = await soloCall();
    assert.strictEqual(room.wait && room.wait.state, "asked");
    assert.strictEqual(last(room).move, "wait_ask");
    assert.strictEqual(last(room).text, "Awesome, now that I know what you're after, I've already got a couple of ideas. Want me to show you now, or wait until Maya and Kai add theirs?");
    assert(!room.picks && !room.confirm, "no picks or confirmation yet");
    const v = T.viewFor(room, planner.id);
    assert.deepStrictEqual({ state: v.wait.state, list: v.wait.list }, { state: "asked", list: "Maya and Kai" });
    assert.strictEqual(v.card, null, "the question has the card area");
    assert(room.wait.closeAt > Date.now(), "a silence timer is running");
    noPrivate(room);
    T.endRoom(room, "test");
  });

  await test("The Concierge's line, with four invited: \"Maya, Kai and 2 others\"", async () => {
    const { room } = await soloCall({ persona: "concierge", members: ["Maya", "Kai", "Sam", "Lee"], invite: [] });
    assert.strictEqual(last(room).text, "Thank you, I have what I need from you, and I already have some recommendations in mind. Shall I share them now, or wait until Maya, Kai and 2 others have added their preferences?");
    assert.strictEqual(T.namesList(["Maya", "Kai", "Sam"]), "Maya, Kai and Sam");
    assert.strictEqual(T.namesList(["Maya"]), "Maya");
    T.endRoom(room, "test");
  });

  await test("Nobody invited (\"I'll decide later\"): no question, straight to the picks", async () => {
    const { room } = await soloCall({ members: [], invite: [] });
    assert.strictEqual(room.wait, null);
    assert(room.picks && room.picks.length === 2, "the picks, as today");
    assert(!said(room).some((l) => /^wait_/.test(l.move)));
    T.endRoom(room, "test");
  });

  await test("Skipped once someone invited has answered, and when everyone has", async () => {
    // Maya joined and answered, Kai hasn't: the planner isn't the only one, so no question
    const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [SAT], persona: "friend", members: ["Maya", "Kai"] });
    const room = T.rooms.get(rid);
    const maya = T.addPerson(room, { name: "Maya", mode: "voice" });
    room.mode = "lead"; room.modeHow = "test";
    answerAll(room, room.people[0]);
    T.setAnswer(room, maya, "vibe", ["music"], "call_card");
    T.setAnswer(room, maya, "budget", "any", "call_card");
    await T.think(room);
    assert.strictEqual(room.wait, null, "no question with Maya's answers in");
    assert(room.picks, "picks as today");
    T.endRoom(room, "test");
    // Everyone invited has answered
    const { room: rid2 } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [SAT], persona: "concierge", members: ["Maya"] });
    const room2 = T.rooms.get(rid2);
    const m2 = T.addPerson(room2, { name: "Maya", mode: "voice" });
    room2.mode = "lead"; room2.modeHow = "test";
    answerAll(room2, room2.people[0]);
    answerAll(room2, m2);
    await T.think(room2);
    assert.strictEqual(room2.wait, null);
    assert(room2.picks);
    T.endRoom(room2, "test");
  });

  await test("The voice study skips it", async () => {
    const { room: rid } = T.createRoom({ crew: "Study", planner: "Asia", nights: [SAT], persona: "friend", members: ["Maya"] });
    const room = T.rooms.get(rid);
    room.noWait = true;
    answerAll(room, room.people[0]);
    await T.think(room);
    assert.strictEqual(room.wait, null);
    assert(room.picks);
    T.endRoom(room, "test");
  });

  await test("\"Wait for everyone\" tapped: the form with a 6 PM Decide by, invites (held in quiet hours), the line, and Form sent", async () => {
    const { room, planner } = await soloCall();
    const out = await tap(room, planner, "wait");
    assert.strictEqual(out.status, 200, JSON.stringify(out.body));
    assert.strictEqual(room.wait.state, "wait");
    assert(room.form, "the call is now the form");
    assert.strictEqual(room.mode, "sidelines");
    // 6 PM Toronto the evening before Saturday, or 2 hours from now if that's past
    const sixPM = T.torontoAt(new Date(new Date(`${SAT}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10), 18);
    const want = sixPM > Date.now() + 60000 ? sixPM : null;
    if (want) assert.strictEqual(room.deadline, want);
    else assert(Math.abs(room.deadline - (Date.now() + 7200000)) < 5000, "two hours from now");
    assert(room.deadlineTimer, "the form closes at the deadline");
    assert.strictEqual(T.spokenDeadline(T.torontoAt("2026-11-27", 18)), "Friday at 6 PM");
    const line = last(room);
    assert.strictEqual(line.move, "wait_yes");
    assert.strictEqual(line.text, `Love it. I'll send Maya and Kai a quick form so they can add theirs. Once everyone's in, or by ${T.spokenDeadline(room.deadline)}, whichever comes first, I'll pick the top two and let you all know. Talk soon!`);
    // In-app invites: Maya now, Kai held for the end of quiet hours
    assert(users.maya.notifications.some((n) => n.kind === "plan_form" && n.room === room.id), "Maya gets the form");
    assert(users.kai.notifyQueue.some((n) => n.kind === "plan_form" && n.room === room.id), "Kai's waits for quiet hours to end");
    assert(!(users.kai.notifications || []).some((n) => n.kind === "plan_form"), "nothing for Kai during quiet hours");
    // The planner's view: "Waiting on…" for a moment, then Form sent (view.form)
    const v = T.viewFor(room, planner.id);
    assert.strictEqual(v.wait.state, "wait");
    assert.strictEqual(v.wait.list, "Maya and Kai");
    assert.strictEqual(v.wait.deadline, room.deadline);
    assert(v.wait.until > Date.now(), "the Waiting card shows until then");
    assert(v.wait.options.includes(room.deadline), "Change the deadline offers other times, the current one included");
    assert(v.form && v.me.planner, "then the Form sent screen");
    noPrivate(room);
    // Maya and Kai answer by form: Sidekick picks, and everyone gets a note to vote
    for (const name of ["Maya", "Kai"]) {
      let res;
      await R.handle({ method: "POST" }, {}, new URL(`http://x/api/sk/rooms/${room.id}/join`), { readBody: async () => ({ name, mode: "form", user: name.toLowerCase(), answers: { time: ["evening"], vibe: ["music"], origin: "union", budget: "any" } }), sendJSON: (r, s, b) => { res = { s, b }; } });
      assert.strictEqual(res.s, 200, JSON.stringify(res.b));
    }
    for (let i = 0; i < 40 && !room.picks; i++) await wait(100);
    assert(room.picks && room.picks.length === 2, "picks once everyone's in");
    assert(users.asia.notifications.some((n) => n.kind === "plan_vote"), "the planner is told to vote");
    assert(users.maya.notifications.some((n) => n.kind === "plan_vote"), "and Maya");
    assert(users.kai.notifyQueue.some((n) => n.kind === "plan_vote"), "Kai's note waits for quiet hours");
    T.endRoom(room, "test");
  });

  await test("\"Wait\" said out loud works too (Concierge), and a second answer changes nothing", async () => {
    const { room, planner } = await soloCall({ persona: "concierge", invite: [] });
    T.addLine(room, planner, "Let's wait for everyone", "spoken");
    await wait(50);
    assert.strictEqual(room.wait.state, "wait");
    assert(room.form && room.deadline);
    assert.strictEqual(last(room).text, `Very good. I'll invite Maya and Kai to add their preferences with a short form. Once everyone has replied, or by ${T.spokenDeadline(room.deadline)}, I'll choose the two best options and notify you all.`);
    assert.strictEqual((await tap(room, planner, "now")).status, 409, "already answered");
    assert.strictEqual(T.waitFromText("hold off till they're in"), "wait");
    assert.strictEqual(T.waitFromText("no, show me now"), "now");
    assert.strictEqual(T.waitFromText("don't wait, go ahead"), "now");
    assert.strictEqual(T.waitFromText("hmm good question"), null);
    noPrivate(room);
    T.endRoom(room, "test");
  });

  await test("\"Show me now\": the line, then the \"I've got everything\" confirmation, then the picks", async () => {
    process.env.SIDEKICK_CONFIRM_MS = "300";
    const { room, planner } = await soloCall();
    fakeStream(room, planner.id); // someone's watching, so the confirmation shows
    const out = await tap(room, planner, "now");
    assert.strictEqual(out.status, 200);
    assert.strictEqual(room.wait.state, "now");
    assert.strictEqual(last(room).text, "On it. Here's what I'd do…");
    assert(!room.form, "not a form");
    for (let i = 0; i < 80 && !room.confirm && !room.picks; i++) await wait(100);
    assert(room.confirm, "the confirmation card, after the line has been said");
    assert.strictEqual(last(room).move, "confirm");
    for (let i = 0; i < 80 && !(room.picks && room.picks.length); i++) await wait(100);
    assert(room.picks && room.picks.length === 2, "then the picks");
    delete process.env.SIDEKICK_CONFIRM_MS;
    T.endRoom(room, "test");
  });

  await test("\"Show me now\" said out loud (Concierge line), with nobody watching goes straight to the picks", async () => {
    const { room, planner } = await soloCall({ persona: "concierge", invite: [] });
    T.addLine(room, planner, "show me now please", "spoken");
    for (let i = 0; i < 40 && !room.picks; i++) await wait(50);
    assert(said(room).some((l) => l.text === "Certainly. Here are my two recommendations…"));
    assert(room.picks && room.picks.length === 2);
    noPrivate(room);
    T.endRoom(room, "test");
  });

  await test("No answer for about 8 s after the line means wait", async () => {
    process.env.SIDEKICK_WAIT_MS = "400";
    const { room } = await soloCall({ invite: [] });
    const lineMs = 600 + room.wait.line.split(/\s+/).length * 380;
    assert(Math.abs(room.wait.closeAt - (room.wait.at + lineMs + 400)) < 200, "the line's length plus the wait");
    delete process.env.SIDEKICK_WAIT_MS;
    const { room: r8 } = await soloCall({ invite: [] });
    assert(Math.abs(r8.wait.closeAt - (r8.wait.at + 600 + r8.wait.line.split(/\s+/).length * 380 + 8000)) < 200, "8 s by default");
    T.endRoom(r8, "test");
    await wait(room.wait.closeAt - Date.now() + 300);
    assert.strictEqual(room.wait.state, "wait");
    assert.strictEqual(room.wait.how, "silence");
    assert(room.form && room.deadline);
    assert.strictEqual(last(room).move, "wait_yes");
    T.endRoom(room, "test");
  });

  await test("The live voice agent asks it and records the answer with choose_wait", async () => {
    // Wait
    const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [SAT], persona: "friend", members: ["Maya", "Kai"] });
    const room = T.rooms.get(rid);
    room.agent = { startedAt: Date.now(), reserved: 0, live: true };
    room.agentMode = true;
    answerAll(room, room.people[0]);
    let mv = (await T.runTool(room, "get_next_move", {})).body;
    assert.strictEqual(mv.next_move, "ask_wait");
    assert.strictEqual(mv.example_line, "Awesome, now that I know what you're after, I've already got a couple of ideas. Want me to show you now, or wait until Maya and Kai add theirs?");
    assert(/choose_wait/.test(mv.what_to_do));
    assert(!room.said.some((x) => x.move === "wait_ask"), "the agent speaks, not the built-in voice");
    assert.strictEqual((await T.runTool(room, "choose_wait", { choice: "maybe" })).status, 400);
    const out = (await T.runTool(room, "choose_wait", { choice: "wait" })).body;
    assert.strictEqual(out.chosen, "wait");
    assert.strictEqual(out.next_move, "wait_for_everyone");
    assert(out.example_line.includes(T.spokenDeadline(room.deadline)) && out.example_line.includes("Maya and Kai"));
    assert(room.form && room.deadline);
    assert(!PRIVATE.test(JSON.stringify(out.example_line + mv.example_line)));
    mv = (await T.runTool(room, "get_next_move", {})).body;
    assert.strictEqual(mv.next_move, "stay_quiet");
    T.endRoom(room, "test");
    // Show me now: the line to say first, then the confirmation
    const { room: rid2 } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [SAT], persona: "concierge", members: ["Maya"] });
    const room2 = T.rooms.get(rid2);
    room2.agent = { startedAt: Date.now(), reserved: 0, live: true };
    room2.agentMode = true;
    answerAll(room2, room2.people[0]);
    await T.runTool(room2, "get_next_move", {});
    const now2 = (await T.runTool(room2, "choose_wait", { choice: "now" })).body;
    assert.strictEqual(now2.chosen, "now");
    assert.strictEqual(now2.say_first, "Certainly. Here are my two recommendations…");
    assert.strictEqual(now2.next_move, "confirm");
    T.endRoom(room2, "test");
  });

  await test("Every wait line, in both personas, is free of budgets and areas", async () => {
    for (const p of ["friend", "concierge"]) for (const k of ["wait_ask", "wait_yes", "wait_now"]) {
      const line = personas.fallbackLine(p, k, { names: "Maya and Kai", deadline: "Friday at 6 PM" });
      assert(!PRIVATE.test(line), line);
      assert(!/\{/.test(line), `filled: ${line}`);
    }
  });

  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
