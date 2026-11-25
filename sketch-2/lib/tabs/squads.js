// Squads: the friend groups you go out with. The app's first party (db.data.parties[userId], "Friday Crew") is your
// first squad, so Crew Blend, the vote and Sidekick keep working as before; more squads live in db.data.squads,
// keyed by id, shared by everyone in them: { id, owner, name, members: [friend keys], votes, poll, locked, chat }.
// Members are friend keys: a sample friend's first name ("Maya") or another account ("u:<id>").
// The fair Crew Blend % is the lowest member's fit for a pick, never an average, from taste weights only: no budgets,
// areas, locations or private call answers ever enter a squad.

const taste = require("../search/taste");
const discover = require("../search/discover");

const DAY = 86400000;
const MAX_SQUADS = 12;
const MAX_MEMBERS = 11;

const store = (db) => (db.data.squads = db.data.squads || {});
// Every squad this person is in: their first party, then the ones they made or were added to
function all(db, user) {
  if (!user) return [];
  const main = db.data.parties[user.id];
  const key = `u:${user.id}`;
  const extra = Object.values(store(db)).filter((s) => s.owner === user.id || (s.members || []).includes(key)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return [...(main ? [main] : []), ...extra];
}
const find = (db, user, id) => all(db, user).find((s) => s.id === id) || null;

// people: (key) => { name, full } or null; friendUser: (key) => the account behind a "u:" key or null
function weightsOf(key, { db, people }) {
  if (db.FRIENDS[key]) return discover.weightsFromVibes(db.FRIENDS[key].vibes);
  const u = String(key).startsWith("u:") && db.data.users[key.slice(2)];
  return u ? taste.weights(u) : null; // weights only: never their budget, areas or log
}
// Everyone else in the squad, seen from this person (the owner shows up as a member for the others)
function othersIn(s, user) {
  const me = `u:${user.id}`;
  const keys = (s.members || []).filter((k) => k !== me);
  if (s.owner && s.owner !== user.id) keys.unshift(`u:${s.owner}`);
  return [...new Set(keys)];
}

// The fair blend for one event: the lowest fit across everyone in the squad, as a percentage
function fairFor(e, crew) {
  if (!e || !crew.length) return null;
  const fits = crew.map((w) => taste.fit(w, e));
  if (fits.some((f) => f.strongDislike)) return 0;
  return Math.round(100 * Math.min(...fits.map((f) => f.fit)));
}

const blendCache = new Map(); // squad id -> { key, best }
// A live Sidekick call belongs to a squad when it was started from it (call.squad), or it carries the squad's name
// and someone on it is an account in the squad (or it's yours). calls: lib/sidekick/rooms.js liveCalls().
function liveFor(s, user, others, calls) {
  const ids = new Set([user.id, s.owner, ...others.filter((k) => String(k).startsWith("u:")).map((k) => k.slice(2))].filter(Boolean));
  const myName = String(user.name || "").trim().toLowerCase();
  const c = (calls || []).find((x) => x.squad === s.id || (!x.squad && x.crew === s.name && ((x.users || []).some((id) => ids.has(id)) || (myName && x.people.some((n) => String(n).trim().toLowerCase() === myName)))));
  return c ? { id: c.id, on: c.on.length, names: c.on.slice(0, 4), startedAt: c.startedAt } : null;
}

function view(db, user, { people, findEvent, isOver, now = Date.now(), calls = [] }) {
  const myW = taste.weights(user);
  return all(db, user).map((s) => {
    const others = othersIn(s, user);
    const crew = [myW, ...others.map((k) => weightsOf(k, { db, people })).filter(Boolean)];
    const nameOf = (k) => (people(k) || { name: String(k).replace(/^u:.*/, "Someone") }).name;
    const names = others.map(nameOf);
    const myName = user.name || "You";
    // The open vote: anything sent to the squad that hasn't happened, with who voted for it
    const open = (s.poll || []).map(findEvent).filter((e) => e && !isOver(e));
    const voters = (id) => Object.entries(s.votes || {}).filter(([, v]) => v === id).map(([who]) => (who === myName ? "You" : who));
    const options = open.map((e) => ({ id: e.id, voters: voters(e.id), fair: fairFor(e, crew) }));
    const locked = s.locked && findEvent(s.locked);
    // The vote's pink deadline: kept once set, so it doesn't move; 48 hours, or 3 hours before the first option starts
    if (!locked && options.length) {
      if (!s.closes || Date.parse(s.closes) < now - DAY) {
        const first = Math.min(...open.map((e) => Date.parse(e.startsAt)));
        s.closes = new Date(Math.max(now + 3600000, Math.min(now + 2 * DAY, first - 3 * 3600000))).toISOString();
      }
    } else if (s.closes) delete s.closes;
    // The next plan: the locked pick, else the soonest night you're going to that someone in the squad is going to
    const going = Object.entries(user.log || {}).filter(([, l]) => l.status === "going").map(([id]) => findEvent(id)).filter((e) => e && !isOver(e));
    const shared = going.filter((e) => (e.friends || []).some((f) => others.includes(f))).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const next = locked && !isOver(locked) ? locked : shared || null;
    // The squad's blend: the next plan's fair %, else the best open option, else the best fair % this fortnight
    let fair = next ? fairFor(next, crew) : options.length ? Math.max(...options.map((o) => o.fair || 0)) : null;
    let bestId = null;
    if (fair == null && others.length) {
      const key = JSON.stringify([others, Object.entries(myW.vibes).map(([v, x]) => [v, Math.round(x)]), Math.floor(now / 3600000)]);
      const hit = blendCache.get(s.id);
      if (hit && hit.key === key) ({ fair, bestId } = hit.best);
      else {
        const soon = db.data.events.filter((e) => !isOver(e) && Date.parse(e.startsAt) - now < 14 * DAY);
        let best = { fair: 0, bestId: null };
        for (const e of soon) {
          const f = fairFor(e, crew);
          if (f > best.fair) best = { fair: f, bestId: e.id };
        }
        blendCache.set(s.id, { key, best });
        ({ fair, bestId } = best);
      }
    }
    // Shared themes: vibes at least two of you are into (taste overlap only)
    const tops = crew.map((w) => Object.entries(w.vibes).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v]) => v));
    const themes = taste.VIBES.map((v) => [v, tops.filter((t) => t.includes(v)).length]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
    const chat = (s.chat || []).map((m) => ({ from: m.from === myName ? "You" : String(m.from).startsWith("u:") ? nameOf(m.from) : m.from, text: m.text, time: m.time }));
    const mineAt = [...(s.chat || [])].reverse().find((m) => m.from === myName);
    const fresh = (s.chat || []).filter((m) => m.from !== myName && m.from !== "Sidequest" && (!mineAt || m.time > mineAt.time)).length;
    return {
      id: s.id,
      main: s === db.data.parties[user.id],
      mine: s === db.data.parties[user.id] || s.owner === user.id,
      name: s.name,
      members: others,
      names,
      locked: locked ? locked.id : null,
      next: next ? next.id : null,
      options,
      myVote: (s.votes || {})[myName] || null,
      closes: s.closes || null,
      fair,
      bestId,
      themes,
      chat: chat.slice(-4),
      fresh,
      createdAt: s.createdAt || null,
      live: liveFor(s, user, others, calls), // { id, on, names, startedAt } while a call is going
    };
  });
}

// A new squad from a name and friend keys. Accounts that only take squad invites from friends (or none) are checked.
function create(db, user, { name, members }, { friendKeys, people, settingsOf }) {
  const n = String(name || "").trim().slice(0, 40);
  if (!n) throw new Error("Give the squad a name.");
  if (all(db, user).length >= MAX_SQUADS) throw new Error(`You can be in up to ${MAX_SQUADS} squads.`);
  const mine = friendKeys(user);
  const keys = [...new Set((Array.isArray(members) ? members : []).map((k) => String(k).slice(0, 40)))].filter((k) => people(k) && k !== `u:${user.id}`);
  if (!keys.length) throw new Error("Pick at least one friend.");
  if (keys.length > MAX_MEMBERS) throw new Error(`A squad can have up to ${MAX_MEMBERS + 1} people, including you.`);
  for (const k of keys) {
    const other = k.startsWith("u:") && db.data.users[k.slice(2)];
    if (!other) {
      if (!mine.includes(k)) throw new Error("You can add friends to a squad.");
      continue;
    }
    const rule = settingsOf(other).privacy.squadAdd;
    const theirFriend = (other.friends || []).includes(`u:${user.id}`);
    if (rule === "nobody" || (rule === "friends" && !theirFriend) || settingsOf(other).privacy.blocked.includes(`u:${user.id}`)) throw new Error(`${people(k).name} doesn't take squad invites from you.`);
  }
  const id = `sq_${require("crypto").randomBytes(5).toString("hex")}`;
  const s = { id, owner: user.id, name: n, members: keys, votes: {}, poll: [], locked: null, chat: [{ from: "Sidequest", text: `${user.name || "Someone"} made ${n}.`, time: new Date().toISOString() }], createdAt: new Date().toISOString() };
  store(db)[id] = s;
  return s;
}

// Leave or delete: the owner's squads go, and they leave everyone else's (account deletion)
function forgetUser(db, userId) {
  const key = `u:${userId}`;
  for (const [id, s] of Object.entries(store(db))) {
    if (s.owner === userId) delete store(db)[id];
    else s.members = (s.members || []).filter((k) => k !== key);
  }
}

module.exports = { all, find, view, create, forgetUser, fairFor, liveFor };
