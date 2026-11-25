// "Asking to join" for events you host. The host turns on "Guests need my OK" in Manage (e.approval); then
// attendees get "Ask to join" in place of "I'm going". Requests are stored on the event, e.joinRequests:
//   [{ userId, name, at, status: "asking" | "approved" | "declined", decidedAt }]
// The public events feed leaves them out (server.js eventsPayload); the host reads them through view(), the person
// asking reads their own status. Both sides are told through notify(), so quiet hours hold.

const { notify } = require("./notify");

const MAX_REQUESTS = 500;
const list = (e) => (e.joinRequests = Array.isArray(e.joinRequests) ? e.joinRequests : []);
const firstName = (u) => String((u && u.name) || "Someone").trim().split(/\s+/)[0] || "Someone";

// deps: { findEvent, hostedIds(user), users (id -> account), accept(attendee, e), now() }
function setApproval(user, { eventId, on }, d) {
  const e = d.findEvent(eventId);
  if (!e || !d.hostedIds(user).includes(e.id)) throw new Error("Only the host can change who gets in.");
  e.approval = Boolean(on);
  return e;
}

function ask(user, { eventId }, d) {
  const e = d.findEvent(eventId);
  if (!e) throw new Error("That event isn't on SideQuest anymore.");
  if (!e.approval) throw new Error("No need to ask. Tap I'm going.");
  if (d.hostedIds(user).includes(e.id)) throw new Error("You're the host.");
  const reqs = list(e);
  const mine = reqs.find((r) => r.userId === user.id);
  if (mine && mine.status === "asking") return mine;
  if (mine && mine.status === "approved") throw new Error("You're already in.");
  if (mine && mine.status === "declined") throw new Error("The host couldn't fit you in this time.");
  if (reqs.length >= MAX_REQUESTS) throw new Error("This event has too many requests right now.");
  const r = { userId: user.id, name: firstName(user), at: new Date(d.now()).toISOString(), status: "asking" };
  reqs.push(r);
  for (const host of hostsOf(e, d)) notify(host, { title: `${r.name} is asking to join`, body: `${e.title}. Say yes or no in Manage.`, eventId: e.id, joinAsk: user.id }, { now: d.now() });
  return r;
}
function cancel(user, { eventId }, d) {
  const e = d.findEvent(eventId);
  if (!e) return;
  e.joinRequests = list(e).filter((r) => !(r.userId === user.id && r.status === "asking"));
}

function decide(user, { eventId, userId, approve }, d) {
  const e = d.findEvent(eventId);
  if (!e || !d.hostedIds(user).includes(e.id)) throw new Error("Only the host can answer requests.");
  const r = list(e).find((x) => x.userId === userId);
  if (!r) throw new Error("That request isn't there anymore.");
  r.status = approve ? "approved" : "declined";
  r.decidedAt = new Date(d.now()).toISOString();
  const guest = d.users[userId];
  if (guest) {
    if (approve) d.accept(guest, e); // in their Sidequests, like tapping I'm going
    notify(guest, approve ? { title: `You're in: ${e.title}`, body: `${firstName(user)} said yes. It's in your Sidequests.`, eventId: e.id } : { title: `No room at ${e.title}`, body: `${firstName(user)} couldn't fit you in this time.`, eventId: e.id }, { now: d.now() });
  }
  return r;
}

// Accounts that host the event (who added it), to tell them someone's asking
function hostsOf(e, d) {
  return Object.values(d.users).filter((u) => e.importedBy === u.id || e.submittedBy === u.id);
}

// For the host: requests per hosted event; for anyone: their own status per event
function forHost(e) {
  return list(e).map((r) => ({ userId: r.userId, name: r.name, at: r.at, status: r.status }));
}
function mine(user, events) {
  const out = {};
  for (const e of events) for (const r of e.joinRequests || []) if (r.userId === user.id) out[e.id] = r.status;
  return out;
}
// Account deletion: their requests go
function forgetUser(events, id) {
  for (const e of events) if (Array.isArray(e.joinRequests)) e.joinRequests = e.joinRequests.filter((r) => r.userId !== id);
}

module.exports = { setApproval, ask, cancel, decide, forHost, mine, forgetUser };
