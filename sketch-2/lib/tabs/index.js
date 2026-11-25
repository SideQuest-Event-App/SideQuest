// The redesigned tabs (designs TB2 Squads, TB2 Sidequests, TB3 Profile D1 "Bento"): the server side.
// server.js calls register(A, deps) once to add the actions, view(user) for what each tab reads, and the hooks
// below for the taste signals. Everything is stored on the account (user.*) or in db.data.squads, like the rest
// of the app's data, so it lives in data/db.json or the account's sketch2_accounts row.

const taste = require("../search/taste");
const discover = require("../search/discover");
const settings = require("./settings");
const stats = require("./stats");
const squads = require("./squads");
const tastepage = require("./tastepage");
const notify = require("./notify"); // quiet hours: notify(user, n) holds alerts back, deliver() lets them through after
const lists = require("./lists"); // Taste > Lists: your own lists of events and places
const join = require("./join"); // "Asking to join" for events you host
const authuser = require("./authuser"); // Delete account also removes the Supabase Auth user

const DAY = 86400000;
const UNDO_KEEP = 12;

let D = null; // deps from server.js: { db, findEvent, isOver, now, person, friendKeys, poolFor, clean, edited }

// ---------- Hosting: events this person added or published ----------
function hostedIds(user) {
  const { db } = D;
  const hostIds = new Set(Object.values(db.data.hosts).filter((h) => h.email && user.email && h.email.trim().toLowerCase() === user.email.trim().toLowerCase()).map((h) => h.id));
  return db.data.events.filter((e) => e.submittedBy === user.id || e.importedBy === user.id || (e.publishedBy && hostIds.has(e.publishedBy))).map((e) => e.id);
}
function hosting(user) {
  const { db } = D;
  const going = {};
  for (const g of db.data.logs.going) if (!g.sample && g.userId !== user.id) going[g.eventId] = (going[g.eventId] || 0) + 1;
  return hostedIds(user).map((id) => {
    const e = D.findEvent(id);
    const requests = join.forHost(e);
    return { id, guests: (e.going || 0) + (going[id] || 0), approval: !!e.approval, asking: requests.filter((r) => r.status === "asking").length, requests };
  });
}

// ---------- One-off fixes to stored accounts ----------
// The old rating bug: a 4-5 star rating pushed the event's vibes into user.vibes (the sign-up picks), on top of the
// fading +4, so they never faded and the Taste page called them "From sign-up". Take those vibes back out (the
// trailing ones that only came from great nights), and make sure each great night has its fading "love" action.
function migrate(user) {
  const m = (user.migrations = user.migrations || {});
  if (m.rateVibes) return false;
  m.rateVibes = new Date(D.now()).toISOString();
  const t = taste.ensure(user);
  const loved = Object.entries(user.log || {}).filter(([, l]) => l.rating >= 4).map(([id, l]) => ({ e: D.findEvent(id), l })).filter((x) => x.e);
  if (!loved.length) return true;
  const fromNights = new Set(loved.flatMap((x) => x.e.vibes || []));
  const vibes = user.vibes || [];
  // The pushed vibes were appended after sign-up, so they're a run at the end; sign-up kept at least 2
  let cut = vibes.length;
  while (cut > 2 && fromNights.has(vibes[cut - 1])) cut--;
  const removed = vibes.slice(cut);
  if (removed.length) {
    user.vibes = vibes.slice(0, cut);
    m.rateVibesRemoved = removed;
  }
  for (const { e, l } of loved) {
    const has = t.events.some((x) => x.k === "love" && (x.id === e.id || (x.id == null && x.v.join("|") === (e.vibes || []).slice(0, 3).join("|"))));
    if (!has) taste.record(user, "love", e, Date.parse(l.ratedAt || e.startsAt) || D.now());
  }
  t.events.sort((a, b) => a.t - b.t);
  return true;
}

// ---------- Taste signals the server records (hooks from server.js) ----------
// Going to a night, confirmed (said "I went" or checked in): +3, fading over about 90 days. A rating replaces it.
function went(user, e) {
  if (!e) return;
  const t = taste.ensure(user);
  if (t.events.some((x) => (x.k === "went" || x.k === "love" || x.k === "dislike") && x.id === e.id)) return;
  taste.record(user, "went", e, D.now());
}
// A rating: 4-5 stars "love" (+4), 1-2 stars "dislike" (-4), both replacing the "went"; 3 stars keeps the "went"
function rated(user, e, stars) {
  const t = taste.ensure(user);
  t.events = t.events.filter((x) => !((x.k === "love" || x.k === "dislike") && x.id === e.id));
  if (stars === 3) return went(user, e);
  t.events = t.events.filter((x) => !(x.k === "went" && x.id === e.id));
  taste.record(user, stars >= 4 ? "love" : "dislike", e, D.now());
}
// Opened an event's details: +0.5, at most once a day per event
function opened(user, e) {
  if (!user || !e) return false;
  const t = taste.ensure(user);
  const now = D.now();
  if (t.events.some((x) => x.k === "open" && x.id === e.id && now - x.t < DAY)) return false;
  return taste.record(user, "open", e, now);
}

// ---------- Undo: a snapshot before every taste change ----------
const snap = (user) => JSON.parse(JSON.stringify({ taste: taste.ensure(user), maxMinutes: user.maxMinutes, budget: user.budget, following: user.following || [], followKinds: user.followKinds || {} }));
function remember(user, label) {
  user.tasteUndo = [...(user.tasteUndo || []), { label, at: D.now(), ...snap(user) }].slice(-UNDO_KEEP);
  user.tunedAt = user.tunedAt || new Date(D.now()).toISOString();
}
function restore(user, s) {
  user.taste = s.taste;
  user.maxMinutes = s.maxMinutes;
  user.budget = s.budget;
  user.following = s.following;
  user.followKinds = s.followKinds;
}

// ---------- Ranking, for "N picks changed" ----------
function topIds(user, n = 20) {
  const pool = D.poolFor(user).filter((e) => !(user.notForMe || []).includes(e.id));
  const ctx = { weights: taste.weights(user), savedEvents: (user.saved || []).map(D.findEvent).filter(Boolean) };
  return pool.map((e) => [e.id, discover.shortlistScore(user, e, ctx).s]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, n).map(([id]) => id);
}

// ---------- Quick retune: pairs of real upcoming events that differ on one thing ----------
function retunePairs(user) {
  const now = D.now();
  const w = taste.weights(user);
  const pool = D.poolFor(user).filter((e) => !(user.notForMe || []).includes(e.id) && (e.vibes || []).length && Date.parse(e.startsAt) - now < 21 * DAY && Date.parse(e.startsAt) > now);
  const tops = Object.entries(w.vibes).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 6);
  const used = new Set();
  const pairs = [];
  const take = (a, b, why) => {
    if (!a || !b || used.has(a.id) || used.has(b.id) || a.title === b.title) return;
    used.add(a.id);
    used.add(b.id);
    pairs.push({ a: a.id, b: b.id, why });
  };
  const soonFirst = (xs) => xs.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  // Same vibe, different energy
  for (const v of tops) {
    const same = soonFirst(pool.filter((e) => e.vibes[0] === v && !used.has(e.id) && taste.energyOf(e) != null));
    const chill = same.filter((e) => taste.energyOf(e) <= -0.1)[0];
    const loud = same.filter((e) => taste.energyOf(e) >= 0.35)[0];
    if (chill && loud) take(chill, loud, "Same vibe, different energy.");
    if (pairs.length >= 3) break;
  }
  // A host you know against one you don't, same vibe
  const known = (e) => (w.organizers[taste.organizerOf(e)] || 0) > 0 || (w.venues[taste.venueOf(e)] || 0) > 0;
  for (const v of tops) {
    if (pairs.length >= 4) break;
    const same = soonFirst(pool.filter((e) => e.vibes[0] === v && !used.has(e.id)));
    take(same.find(known), same.find((e) => !known(e)), "A host you know, or someone new.");
  }
  // Two of your vibes, head to head
  for (let i = 0; i + 1 < tops.length && pairs.length < 6; i++) {
    const a = soonFirst(pool.filter((e) => e.vibes[0] === tops[i] && !used.has(e.id)))[0];
    const b = soonFirst(pool.filter((e) => e.vibes[0] === tops[i + 1] && !used.has(e.id)))[0];
    take(a, b, "Two things you're into. Which wins?");
  }
  // Something familiar against something new
  for (let i = 0; pairs.length < 5 && i < 4; i++) {
    const fam = soonFirst(pool.filter((e) => tops.includes(e.vibes[0]) && !used.has(e.id)))[0];
    const fresh = soonFirst(pool.filter((e) => !(e.vibes || []).some((v) => (w.vibes[v] || 0) > 0) && !used.has(e.id)))[0];
    if (!fam || !fresh) break;
    take(fam, fresh, "Your usual, or something new?");
  }
  return pairs.slice(0, 6);
}

// ---------- Quiet hours: deliver what's due, then send held ones as read (no badge) ----------
function notifyView(user, now) {
  notify.deliver(user, { now });
  return notify.forApp(user.notifications);
}
// Lists friends shared with you (privacy: Friends), from accounts that are your friends
function friendLists(user) {
  const me = `u:${user.id}`;
  const out = [];
  for (const k of user.friends || []) {
    const other = String(k).startsWith("u:") && D.db.data.users[k.slice(2)];
    if (!other) continue;
    for (const l of lists.forFriend(other, me)) out.push({ ...l, owner: (other.name || "A friend").split(" ")[0], items: l.items.filter((id) => D.findEvent(id)) });
  }
  return out.slice(0, 20);
}
// Live Sidekick calls, for the Squads tab's "Live call · N in" (lib/sidekick/rooms.js liveCalls)
function liveCalls() {
  try {
    return require("../sidekick/rooms").liveCalls() || [];
  } catch {
    return [];
  }
}

// ---------- What each tab reads ----------
function view(user) {
  if (!user) return {};
  migrate(user);
  const now = D.now();
  const sq = squads.view(D.db, user, { people: D.person, findEvent: D.findEvent, isOver: D.isOver, now, calls: liveCalls() });
  const hostedList = hosting(user);
  const st = stats.build(user, { findEvent: D.findEvent, squads: sq.map((s) => ({ ...s, members: s.members })), hostedIds: hostedList.map((h) => h.id), now });
  return {
    vibes: user.vibes, // after migrate(), which may have fixed them
    settings: settings.of(user),
    squads: sq,
    hosting: hostedList,
    stats: st,
    tastePage: tastepage.build(user, { findEvent: D.findEvent, squads: sq, now }),
    lists: lists.view(user, { findEvent: D.findEvent }),
    friendLists: friendLists(user),
    joins: join.mine(user, D.db.data.events), // eventId -> asking | approved | declined, for "Ask to join"
    notifications: notifyView(user, now),
  };
}

// ---------- Your data: everything stored about this account, as JSON ----------
function exportData(user) {
  const { db } = D;
  const mine = (rows) => (rows || []).filter((r) => r.userId === user.id);
  const { feed, shown, ...account } = user; // feed and shown are caches of what the app showed, not your data
  return {
    exportedAt: new Date(D.now()).toISOString(),
    note: "Everything SideQuest stores about your account. SideQuest doesn't save your location.",
    account,
    squads: squads.all(db, user).map((s) => ({ id: s.id, name: s.name, members: s.members, chat: (s.chat || []).filter((m) => m.from === (user.name || "You")) })),
    requests: db.data.requests.filter((r) => user.myRequests.includes(r.id)).map((r) => ({ id: r.id, text: r.text, time: r.time, status: r.status })),
    activity: { going: mine(db.data.logs.going), attended: mine(db.data.logs.attended), notForMe: mine(db.data.logs.feedback), searches: mine(db.data.logs.searches).map(({ time, interests }) => ({ time, interests })), views: mine(db.data.logs.views).length },
    eventsYouAdded: db.data.events.filter((e) => e.submittedBy === user.id || e.importedBy === user.id).map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt })),
  };
}

// ---------- Delete account (real accounts only): the account and what's stored about it ----------
async function deleteAccount(user) {
  const { db } = D;
  const id = user.id;
  const key = `u:${id}`;
  delete db.data.users[id];
  delete db.data.parties[id];
  squads.forgetUser(db, id);
  for (const u of Object.values(db.data.users)) {
    if (u.friends) u.friends = u.friends.filter((k) => k !== key);
    if (u.friendRequests) u.friendRequests = u.friendRequests.filter((x) => x !== id);
    u.notifications = (u.notifications || []).filter((n) => n.friendFrom !== id);
  }
  for (const k of Object.keys(db.data.logs)) if (Array.isArray(db.data.logs[k])) db.data.logs[k] = db.data.logs[k].filter((r) => r.userId !== id);
  for (const r of db.data.requests) if (user.votedRequests.includes(r.id) || user.myRequests.includes(r.id)) r.votes = Math.max(0, r.votes - 1);
  for (const e of db.data.events) {
    if (e.submittedBy === id) delete e.submittedBy;
    if (e.importedBy === id) delete e.importedBy;
    if (e.verification) for (const k of ["opened", "real", "fake"]) e.verification[k] = (e.verification[k] || []).filter((x) => x !== id);
    if (e.flags) e.flags = e.flags.filter((f) => f.userId !== id);
  }
  for (const list of Object.values(db.data.eventChat || {})) for (let i = list.length - 1; i >= 0; i--) if (list[i].userId === id) list.splice(i, 1);
  join.forgetUser(db.data.events, id);
  await db.forget(id);
  // Then the Supabase Auth user (when Supabase is set up); never fails the deletion
  return authuser.deleteAuthUser(user, { fetchImpl: D.fetch || global.fetch });
}

// ---------- Actions ----------
function register(A, deps) {
  D = deps;
  const { needUser } = deps;
  const findOr = (id) => {
    const e = D.findEvent(id);
    if (!e) throw new Error("That event isn't on SideQuest anymore.");
    return e;
  };

  A.saveSettings = (ctx, { change }) => ({ settings: settings.apply(needUser(ctx), change || {}) });

  A.createSquad = (ctx, { name, members }) => {
    const u = needUser(ctx);
    const s = squads.create(D.db, u, { name, members }, { friendKeys: D.friendKeys, people: D.person, settingsOf: settings.of });
    return { squadId: s.id };
  };
  A.renameSquad = (ctx, { squad, name }) => {
    const u = needUser(ctx);
    const s = squads.find(D.db, u, squad);
    const n = D.clean(name, 40);
    if (!s || !n) throw new Error("Give the squad a name.");
    s.name = n;
  };
  A.leaveSquad = (ctx, { squad }) => {
    const u = needUser(ctx);
    const s = squads.find(D.db, u, squad);
    if (!s || s === D.db.data.parties[u.id]) throw new Error("Your first squad stays. Change who's in it instead.");
    if (s.owner === u.id) delete D.db.data.squads[s.id];
    else s.members = s.members.filter((k) => k !== `u:${u.id}`);
  };

  // --- taste: every change keeps a snapshot, so the toast's Undo can put it back ---
  const LEVEL = { Less: 1, Some: 3, Lots: 5, Off: 0 };
  A.tasteLevel = (ctx, { vibe, level }) => {
    const u = needUser(ctx);
    if (!taste.VIBES.includes(vibe)) throw new Error("Unknown vibe.");
    remember(u, `${vibe} set to ${level === "Auto" ? "automatic" : level}`);
    taste.edit(u, vibe, level === "Auto" ? null : LEVEL[level] != null ? LEVEL[level] : null);
    if (level === "Auto") taste.pause(u, vibe, null);
    return { label: `${vibe} ${level === "Auto" ? "back to automatic" : `set to ${level}`}` };
  };
  A.tastePause = (ctx, { vibe, on }) => {
    const u = needUser(ctx);
    if (!taste.VIBES.includes(vibe)) throw new Error("Unknown vibe.");
    remember(u, `${vibe} paused`);
    taste.pause(u, vibe, on ? D.now() + 30 * DAY : null);
    return { label: on ? `${vibe} paused for a month` : `${vibe} is back` };
  };
  A.tastePrefs = (ctx, args) => {
    const u = needUser(ctx);
    const p = args || {};
    const label = p.label ? D.clean(p.label, 60) : "Taste updated";
    remember(u, label);
    const keys = ["energy", "surprise", "days", "times", "never", "access"].filter((k) => k in p);
    if (keys.length) taste.setPrefs(u, Object.fromEntries(keys.map((k) => [k, p[k]])));
    if ("maxMinutes" in p) u.maxMinutes = [15, 30, 45, 60].includes(Number(p.maxMinutes)) ? Number(p.maxMinutes) : null;
    if ("budget" in p) u.budget = p.budget === "" || p.budget == null ? null : Math.max(0, Math.min(500, Number(p.budget) || 0));
    return { label };
  };
  A.tasteDealbreaker = (ctx, { kind, value }) => {
    const u = needUser(ctx);
    const t = taste.ensure(u);
    remember(u, `${value} removed from dealbreakers`);
    if (kind === "vibe") delete t.edits[value];
    else if (kind === "organiser") {
      for (const x of t.events) if (x.o === value && (x.k === "notForMe" || x.k === "dislike")) x.o = null;
      u.notForMe = (u.notForMe || []).filter((id) => {
        const e = D.findEvent(id);
        return !(e && taste.organizerOf(e) === value);
      });
    } else taste.setPrefs(u, { never: (t.prefs.never || []).filter((x) => x !== value) });
    return { label: `${value} removed` };
  };
  A.tasteFollow = (ctx, { name, kind, on }) => {
    const u = needUser(ctx);
    const n = D.clean(name, 60);
    if (!n) throw new Error("Type a name to follow.");
    remember(u, on ? `Following ${n}` : `Unfollowed ${n}`);
    u.following = (u.following || []).filter((x) => x !== n);
    u.followKinds = u.followKinds || {};
    if (on) {
      u.following.push(n);
      u.followKinds[n] = ["artist", "venue", "organiser"].includes(kind) ? kind : "organiser";
    } else delete u.followKinds[n];
    return { label: on ? `Following ${n}` : `Unfollowed ${n}` };
  };
  // "Don't count this": one action out of the taste log (the night stays in your history)
  A.tasteForget = (ctx, { t, id, follow }) => {
    const u = needUser(ctx);
    if (follow) return A.tasteFollow(ctx, { name: follow, on: false });
    remember(u, "One action not counted");
    if (!taste.forget(u, t, id)) throw new Error("That one has already faded out.");
    return { label: "Not counted any more" };
  };
  A.tasteUndo = (ctx) => {
    const u = needUser(ctx);
    const last = (u.tasteUndo || []).pop();
    if (!last) throw new Error("Nothing to undo.");
    restore(u, last);
    return { label: `Undone: ${last.label}` };
  };
  // Start fresh: learned taste cleared; follows, saves, tickets, history and private settings kept; 24-hour undo
  A.tasteFresh = (ctx) => {
    const u = needUser(ctx);
    const t = taste.ensure(u);
    u.tasteFresh = { at: D.now(), ...snap(u) };
    u.taste = { events: [], edits: {}, pauses: {}, prefs: { ...(t.prefs.never ? { never: t.prefs.never } : {}), ...(t.prefs.access ? { access: t.prefs.access } : {}) } };
    u.tasteUndo = [];
    return { label: "Started fresh. Picks will feel more general for a while." };
  };
  A.tasteFreshUndo = (ctx) => {
    const u = needUser(ctx);
    const f = u.tasteFresh;
    if (!f || D.now() - f.at > DAY) throw new Error("Start fresh can only be undone within 24 hours.");
    restore(u, f);
    delete u.tasteFresh;
    return { label: "Your taste is back as it was" };
  };
  A.retunePairs = (ctx) => ({ pairs: retunePairs(needUser(ctx)) });
  A.retuneDone = (ctx, { answers }) => {
    const u = needUser(ctx);
    const before = topIds(u);
    remember(u, "Quick retune");
    for (const a of Array.isArray(answers) ? answers.slice(0, 8) : []) {
      const ea = D.findEvent(a.a);
      const eb = D.findEvent(a.b);
      if (!ea || !eb) continue;
      if (a.choice === "a" || a.choice === "both") taste.record(u, "pick", ea, D.now());
      if (a.choice === "b" || a.choice === "both") taste.record(u, "pick", eb, D.now());
      if (a.choice === "neither") (taste.record(u, "pass", ea, D.now()), taste.record(u, "pass", eb, D.now()));
    }
    u.tunedAt = u.tunedAt || new Date(D.now()).toISOString();
    const after = topIds(u);
    const changed = after.filter((id) => !before.includes(id)).length;
    return { changed, label: `${changed} of your picks changed` };
  };

  A.exportData = (ctx) => ({ data: exportData(needUser(ctx)) });
  A.deleteCallHistory = (ctx) => {
    const u = needUser(ctx);
    u.calls = [];
    u.callHistoryClearedAt = new Date(D.now()).toISOString(); // Sidekick reads this to leave older calls out
    return { cleared: true };
  };
  A.deleteAccount = async (ctx, { confirm }) => {
    const u = needUser(ctx);
    if (u.demo || D.isDemo(u)) throw new Error("The demo account can't be deleted. Exit the demo instead.");
    if (confirm !== "DELETE") throw new Error("Type DELETE to confirm.");
    const auth = await deleteAccount(u);
    return { deleted: true, auth };
  };

  // --- Taste > Lists ---
  const listDeps = { findEvent: D.findEvent };
  A.listCreate = (ctx, { name, privacy, eventId }) => {
    const l = lists.create(needUser(ctx), { name, privacy, eventId }, { ...listDeps, now: D.now() });
    return { listId: l.id, label: eventId != null && l.items.length ? `Added to ${l.name}` : `${l.name} is ready` };
  };
  A.listRename = (ctx, args) => ({ label: `Renamed to ${lists.rename(needUser(ctx), args).name}` });
  A.listPrivacy = (ctx, args) => {
    const l = lists.setPrivacy(needUser(ctx), args);
    return { label: l.privacy === "friends" ? `Friends can see ${l.name}` : `${l.name} is private` };
  };
  A.listDelete = (ctx, args) => ({ label: `Deleted ${lists.remove(needUser(ctx), args).name}` });
  A.listItem = (ctx, args) => {
    const r = lists.item(needUser(ctx), args, listDeps);
    return { on: r.on, label: r.on ? `Added to ${r.list.name}` : `Removed from ${r.list.name}` };
  };

  // --- Asking to join (events you host) ---
  const joinDeps = () => ({ findEvent: D.findEvent, hostedIds, users: D.db.data.users, now: D.now, accept: (guest, e) => accept({ user: guest, party: D.db.data.parties[guest.id] || { members: [], votes: {} } }, { eventId: e.id }) });
  const accept = A.accept;
  // "I'm going" on an event that needs the host's OK only works once they've said yes
  A.accept = (ctx, args) => {
    const e = D.findEvent(args && args.eventId);
    if (e && e.approval && ctx.user && !hostedIds(ctx.user).includes(e.id)) {
      const r = (e.joinRequests || []).find((x) => x.userId === ctx.user.id);
      if (!r || r.status !== "approved") throw new Error("This one needs the host's OK. Ask to join instead.");
    }
    return accept(ctx, args);
  };
  A.hostApproval = (ctx, { eventId, on }) => {
    const e = join.setApproval(needUser(ctx), { eventId, on }, joinDeps());
    if (D.edited) D.edited(); // the events feed carries e.approval
    return { label: e.approval ? "Guests now ask to join" : "Anyone can say they're going" };
  };
  A.askJoin = (ctx, { eventId }) => {
    join.ask(needUser(ctx), { eventId }, joinDeps());
    return { label: "Asked. You'll hear when the host answers." };
  };
  A.cancelJoin = (ctx, { eventId }) => {
    join.cancel(needUser(ctx), { eventId }, joinDeps());
    return { label: "Request taken back" };
  };
  A.joinDecide = (ctx, { eventId, userId, approve }) => {
    const r = join.decide(needUser(ctx), { eventId, userId: String(userId || ""), approve: Boolean(approve) }, joinDeps());
    return { label: approve ? `${r.name} is in` : `Declined ${r.name}` };
  };
}

module.exports = { register, view, migrate, went, rated, opened, hostedIds, retunePairs, topIds, exportData, settings, squads, notify, lists, join, authuser };
