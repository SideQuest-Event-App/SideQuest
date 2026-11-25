// The call's account side: who on a call is signed in to SideQuest, and what that changes.
//  - Taste: a vote on a pick ("pick", +2) and the locked plan ("accept", +3) nudge that person's vibe weights
//    (lib/search/taste.js), unless they turned on "Don't learn from this plan".
//  - Call history: a short recap of each locked or ended call is kept on the account (user.calls), never with
//    anyone else's answers. "Delete call history" (lib/tabs) empties it and sets user.callHistoryClearedAt: calls
//    from before then are never shown or saved again. With the call-history switch off
//    (user.settings.privacy.callHistory === false), nothing new is saved.
//  - Invites: friends picked in the Plan tab who are on SideQuest get an in-app notification linking to the
//    room ("Asia invited you to plan Saturday"). During their quiet hours it waits in user.notifyQueue and is
//    delivered when quiet hours end.
// In the unit tests there's no database (planflow isn't set up): everything here does nothing.

const crypto = require("crypto");
const taste = require("../search/taste");
const settings = require("../tabs/settings");
const planflow = require("./planflow");
const P = require("./plan");

const db = () => planflow._db();
const userOf = (id) => {
  const d = db();
  return (id && d && d.data && d.data.users && d.data.users[String(id)]) || null;
};
const save = () => { const d = db(); if (d && d.save) d.save(); };
const eventOf = (id) => { const d = db(); return (d && (d.data.events || []).find((e) => e.id === Number(id))) || null; };
const DAY = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const spokenNights = (room) => {
  const days = room.nights.map((d) => DAY[P.nightLabel(d).slice(0, 3)] || P.nightLabel(d));
  return days.length > 1 ? `${days.slice(0, -1).join(", ")} or ${days[days.length - 1]}` : days[0] || "a night out";
};

// ---------- Taste ----------
// kind: "pick" (a vote) or "accept" (the locked plan). Places (from Google) aren't in the listings: skipped.
function learn(room, person, kind, eventId) {
  if (!person || !person.user || person.noLearn) return false;
  const u = userOf(person.user);
  const e = eventOf(eventId);
  if (!u || !e) return false;
  taste.record(u, kind, e, Date.now());
  save();
  return true;
}

// ---------- Call history ----------
const historyOn = (u) => ((u.settings || {}).privacy || {}).callHistory !== false;
const clearedAt = (u) => Date.parse(u.callHistoryClearedAt || "") || 0;
function saveRecap(room) {
  let changed = false;
  const f = P.facts(room);
  const L = room.locked;
  for (const p of room.people) {
    const u = userOf(p.user);
    if (!u || !historyOn(u)) continue;
    if (room.createdAt <= clearedAt(u)) continue; // the call started before "Delete call history"
    u.calls = Array.isArray(u.calls) ? u.calls : [];
    const recap = {
      room: room.id,
      crew: room.crew,
      at: new Date().toISOString(),
      startedAt: new Date(room.createdAt).toISOString(),
      planner: p.role === "planner",
      nights: room.nights.slice(),
      // Only what the whole crew saw on the board: the night, time and vibes, and the budget as the group label
      facts: { night: f.night.value || null, time: f.time.value || null, vibe: f.vibe.value || null, budget: P.budgetLabel(f, room) },
      locked: L ? { id: L.id, title: L.title, when: L.when, where: L.where || "", kind: L.kind, date: L.date || null } : null,
    };
    const i = u.calls.findIndex((c) => c.room === room.id);
    if (i >= 0) u.calls[i] = recap;
    else u.calls.push(recap);
    if (u.calls.length > 50) u.calls.splice(0, u.calls.length - 50);
    changed = true;
  }
  if (changed) save();
}
// What the person sees: their recaps after the last "Delete call history", newest first
function recaps(userId) {
  const u = userOf(userId);
  if (!u) return [];
  const since = clearedAt(u);
  return (Array.isArray(u.calls) ? u.calls : []).filter((c) => (Date.parse(c.at) || 0) > since && (Date.parse(c.startedAt) || Date.parse(c.at) || 0) > since).slice().reverse().slice(0, 10);
}

// ---------- Invites ----------
// keys: the people picked in the Plan tab ("u:<id>" for SideQuest accounts; sample friends have plain names)
function invite(room, planner, keys) {
  room.notified = room.notified || new Set();
  let sent = 0;
  const first = String((planner && planner.name) || "A friend").trim().split(/\s+/)[0];
  for (const key of (Array.isArray(keys) ? keys : []).slice(0, 12)) {
    if (typeof key !== "string" || !key.startsWith("u:")) continue;
    const id = key.slice(2);
    if (room.notified.has(id) || (planner && planner.user === id)) continue;
    const u = userOf(id);
    if (!u) continue;
    room.notified.add(id);
    const n = settings.of(u).notifications;
    if (n.plans === false) continue; // "Plans and tickets" is off
    const note = {
      id: crypto.randomBytes(6).toString("hex"),
      time: new Date().toISOString(),
      title: `${first} invited you to plan ${spokenNights(room)}`,
      body: room.form ? `${room.crew}: tap your answers, it takes a minute.` : `${room.crew}: hop on the call with Sidekick.`,
      read: false,
      link: `/sk/${room.id}`,
      room: room.id,
      kind: "plan_invite",
    };
    if (settings.quietNow(u)) (u.notifyQueue = Array.isArray(u.notifyQueue) ? u.notifyQueue : []).push(note);
    else (u.notifications = Array.isArray(u.notifications) ? u.notifications : []).push(note);
    sent++;
  }
  if (sent) save();
  return sent;
}
// Held invites go out once the person's quiet hours are over
function deliverQueued(t = Date.now()) {
  const d = db();
  if (!d || !d.data || !d.data.users) return 0;
  let n = 0;
  for (const u of Object.values(d.data.users)) {
    if (!Array.isArray(u.notifyQueue) || !u.notifyQueue.length || settings.quietNow(u, t)) continue;
    u.notifications = Array.isArray(u.notifications) ? u.notifications : [];
    for (const note of u.notifyQueue) u.notifications.push({ ...note, time: new Date(t).toISOString() });
    n += u.notifyQueue.length;
    u.notifyQueue = [];
  }
  if (n) save();
  return n;
}
setInterval(() => { try { deliverQueued(); } catch (err) { console.error(err.message); } }, Number(process.env.SIDEKICK_NOTIFY_TICK_MS || 60000)).unref();

// ---------- "Plan it" from Saved: the event, for the Plan flow and the room ----------
function pickInfo(id) {
  const e = eventOf(id);
  if (!e || !e.startsAt) return null;
  return { id: e.id, title: e.title, date: P.localDay(e.startsAt), night: P.nightLabel(P.localDay(e.startsAt)), where: [e.venue && e.venue.name, e.neighbourhood].filter(Boolean).join(", "), past: Date.parse(e.startsAt) < Date.now() };
}

module.exports = { learn, saveRecap, recaps, invite, deliverQueued, pickInfo, userOf };
