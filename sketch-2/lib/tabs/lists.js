// Profile > Taste > Lists: your own lists of events and places ("+ New"), stored on the account (user.lists) like the
// rest of the profile. Each has a name, who can see it (Private, or Friends) and the ids it holds, newest first.
// Lists never feed the taste model on their own; saving or opening an event still does that.

const crypto = require("crypto");

const MAX_LISTS = 30;
const MAX_ITEMS = 200;
const PRIVACY = ["private", "friends"];

const store = (user) => (user.lists = Array.isArray(user.lists) ? user.lists : []);
const cleanName = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 40);
function find(user, id) {
  const l = store(user).find((x) => x.id === id);
  if (!l) throw new Error("That list isn't there anymore.");
  return l;
}

function create(user, { name, privacy, eventId } = {}, { findEvent, now = Date.now() } = {}) {
  const n = cleanName(name);
  if (!n) throw new Error("Give the list a name.");
  const lists = store(user);
  if (lists.length >= MAX_LISTS) throw new Error(`You can have up to ${MAX_LISTS} lists.`);
  if (lists.some((l) => l.name.toLowerCase() === n.toLowerCase())) throw new Error(`You already have a list called ${n}.`);
  const l = { id: `ls_${crypto.randomBytes(4).toString("hex")}`, name: n, privacy: PRIVACY.includes(privacy) ? privacy : "private", items: [], createdAt: new Date(now).toISOString() };
  if (eventId != null && findEvent && findEvent(eventId)) l.items.push(Number(eventId));
  lists.push(l);
  return l;
}
function rename(user, { list, name }) {
  const l = find(user, list);
  const n = cleanName(name);
  if (!n) throw new Error("Give the list a name.");
  if (store(user).some((x) => x !== l && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`You already have a list called ${n}.`);
  l.name = n;
  return l;
}
function setPrivacy(user, { list, privacy }) {
  const l = find(user, list);
  if (!PRIVACY.includes(privacy)) throw new Error("Pick Private or Friends.");
  l.privacy = privacy;
  return l;
}
function remove(user, { list }) {
  const l = find(user, list);
  user.lists = store(user).filter((x) => x !== l);
  return l;
}
// on: true adds, false takes out, undefined toggles
function item(user, { list, eventId, on }, { findEvent } = {}) {
  const l = find(user, list);
  const id = Number(eventId);
  if (!findEvent || !findEvent(id)) throw new Error("That event isn't on SideQuest anymore.");
  const has = l.items.includes(id);
  const want = on === undefined ? !has : Boolean(on);
  if (want && !has) {
    if (l.items.length >= MAX_ITEMS) throw new Error(`A list can hold up to ${MAX_ITEMS}.`);
    l.items.unshift(id);
  }
  if (!want) l.items = l.items.filter((x) => x !== id);
  return { list: l, on: want };
}

// What the Taste page reads: each list with counts of events and places still on SideQuest
function view(user, { findEvent }) {
  return store(user).map((l) => {
    const items = l.items.map(findEvent).filter(Boolean);
    const places = items.filter((e) => e.type === "place").length;
    return { id: l.id, name: l.name, privacy: l.privacy, items: items.map((e) => e.id), events: items.length - places, places, createdAt: l.createdAt };
  });
}

// For someone else: only the lists shared with friends, and only when they are friends
function forFriend(user, viewerKey) {
  if (!(user.friends || []).includes(viewerKey)) return [];
  return store(user).filter((l) => l.privacy === "friends").map((l) => ({ id: l.id, name: l.name, items: l.items.slice() }));
}

module.exports = { create, rename, setPrivacy, remove, item, view, forFriend, PRIVACY, MAX_LISTS };
