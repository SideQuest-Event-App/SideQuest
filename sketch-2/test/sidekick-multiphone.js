// Several phones on one call: the same sentence heard by more than one phone, Sidekick's voice heard
// by the other phones, and the in-app audio settings. Keyword reading only (no AI).
//
//   node test/sidekick-multiphone.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-multi-"));
Object.assign(process.env, { SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1" });

const ROOT = path.join(__dirname, "..");
const seed = require(path.join(ROOT, "..", "events", "data", "events.json"));
const events = Array.isArray(seed) ? seed : seed.events;
const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
R.init({ events: () => events });
const T = R._test;

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}
function call() {
  const { room: rid } = T.createRoom({ crew: "Sat squad", planner: "Asia", nights: [], persona: "friend" });
  const room = T.rooms.get(rid);
  room.mode = "lead"; // skip the check-in for these tests
  const [asia, maya, jay] = [room.people[0], T.addPerson(room, { name: "Maya", mode: "voice" }), T.addPerson(room, { name: "Jay", mode: "voice" })];
  return { room, asia, maya, jay };
}
const back = (room, ms) => { for (const l of room.lines) l.at -= ms; for (const s of room.said) s.at -= ms; };

test("The same sentence from a second phone within 4 s is dropped; the first speaker keeps it", () => {
  const { room, asia, maya } = call();
  assert(T.addLine(room, asia, "I could do Saturday after eight", "spoken").id);
  const out = T.addLine(room, maya, "I could do Saturday after 8.", "spoken");
  assert.strictEqual(out.dropped, "duplicate");
  assert.strictEqual(room.lines.length, 1);
  assert.strictEqual(room.lines[0].pid, asia.id);
  T.endRoom(room, "test");
});

test("A slightly different transcript of the same sentence still counts as a duplicate", () => {
  const { room, asia, maya } = call();
  T.addLine(room, asia, "honestly I'm down for some live music on Friday", "spoken");
  assert.strictEqual(T.addLine(room, maya, "honestly I'm down for live music on Friday", "spoken").dropped, "duplicate");
  T.endRoom(room, "test");
});

test("The same sentence after 4 s is kept (someone agreeing out loud)", () => {
  const { room, asia, maya } = call();
  T.addLine(room, asia, "I could do Saturday after eight", "spoken");
  back(room, 4500);
  assert(T.addLine(room, maya, "I could do Saturday after eight", "spoken").id);
  assert.strictEqual(room.lines.length, 2);
  T.endRoom(room, "test");
});

test("Different sentences at the same moment are both kept", () => {
  const { room, asia, maya } = call();
  T.addLine(room, asia, "Saturday works for me", "spoken");
  assert(T.addLine(room, maya, "Friday is better for me honestly", "spoken").id);
  T.endRoom(room, "test");
});

test("Short answers: two people saying 'yeah' are both kept unless they arrive almost together", () => {
  const { room, asia, maya, jay } = call();
  T.addLine(room, asia, "Yeah", "spoken");
  assert.strictEqual(T.addLine(room, maya, "yeah", "spoken").dropped, "duplicate"); // within 1.5 s: one voice, two phones
  back(room, 2000);
  assert(T.addLine(room, jay, "yeah", "spoken").id);
  T.endRoom(room, "test");
});

test("Typed lines are never dropped as duplicates", () => {
  const { room, asia, maya } = call();
  T.addLine(room, asia, "Saturday after eight works", "spoken");
  assert(T.addLine(room, maya, "Saturday after eight works", "typed").id);
  T.endRoom(room, "test");
});

test("The same person's own repeat isn't a duplicate", () => {
  const { room, asia } = call();
  T.addLine(room, asia, "Saturday after eight works", "spoken");
  assert(T.addLine(room, asia, "Saturday after eight works", "spoken").id);
  T.endRoom(room, "test");
});

test("Echo: a phone captioning Sidekick's spoken line is dropped", () => {
  const { room, maya } = call();
  room.said.push({ id: "s1", text: "Love it. So what kind of night are we after, music, comedy or games?", move: "ask", at: Date.now() });
  assert.strictEqual(T.addLine(room, maya, "so what kind of night are we after", "spoken").dropped, "echo");
  assert.strictEqual(T.addLine(room, maya, "music comedy or games", "spoken").dropped, "echo");
  assert.strictEqual(room.lines.length, 0);
  T.endRoom(room, "test");
});

test("Echo: a real one-word answer to Sidekick's question is kept", () => {
  const { room, maya, jay } = call();
  room.said.push({ id: "s1", text: "Which works better, Friday or Saturday?", move: "ask", at: Date.now() });
  assert(T.addLine(room, maya, "Saturday", "spoken").id);
  assert(T.addLine(room, jay, "Saturday works for me", "spoken").id);
  T.endRoom(room, "test");
});

test("Echo: Sidekick's words after 12 s (plus the time to say them) are kept", () => {
  const { room, maya } = call();
  room.said.push({ id: "s1", text: "So what kind of night are we after?", move: "ask", at: Date.now() - 20000 });
  assert(T.addLine(room, maya, "so what kind of night are we after", "spoken").id);
  T.endRoom(room, "test");
});

test("A dropped line doesn't set facts or mark the person as talking", () => {
  const { room, asia, maya } = call();
  T.addLine(room, asia, "I can do Saturday after eight", "spoken");
  T.addLine(room, maya, "I can do Saturday after eight", "spoken");
  assert.strictEqual(room.pending.length, 1);
  assert.strictEqual(maya.lastSpokeAt, 0);
  T.endRoom(room, "test");
});

test("ICE servers: public STUN by default, TURN only when it's set", () => {
  const saved = { ...process.env };
  delete process.env.SIDEKICK_STUN_URL;
  delete process.env.SIDEKICK_TURN_URL;
  assert.deepStrictEqual(T.iceServers(), [{ urls: ["stun:stun.l.google.com:19302"] }]);
  Object.assign(process.env, { SIDEKICK_TURN_URL: "turn:a.example:80,turns:a.example:443?transport=tcp", SIDEKICK_TURN_USER: "u", SIDEKICK_TURN_PASS: "p" });
  const ice = T.iceServers();
  assert.strictEqual(ice.length, 2);
  assert.deepStrictEqual(ice[1], { urls: ["turn:a.example:80", "turns:a.example:443?transport=tcp"], username: "u", credential: "p" });
  process.env.SIDEKICK_STUN_URL = "off";
  assert.strictEqual(T.iceServers().length, 1);
  process.env = saved;
});

test("The view shows who's online and in in-app audio, and the server's boot id", () => {
  const { room, asia, maya } = call();
  maya.audio = true;
  const v = T.viewFor(room, asia.id);
  assert.strictEqual(v.audioRoom, true);
  assert.strictEqual(v.people.find((p) => p.id === maya.id).audio, true);
  assert.strictEqual(v.people.find((p) => p.id === asia.id).online, false);
  assert.strictEqual(v.boot, R.BOOT);
  T.endRoom(room, "test");
});

test("Link previews carry only the crew name and nights", () => {
  const { room } = call();
  const p = R.preview(room.id);
  assert.deepStrictEqual(Object.keys(p).sort(), ["crew", "nights", "status"]);
  assert.strictEqual(p.crew, "Sat squad");
  assert(p.nights.every((n) => /^[A-Z][a-z]{2}$/.test(n)), p.nights.join(","));
  assert.strictEqual(R.preview("nope"), null);
  T.endRoom(room, "test");
});

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
