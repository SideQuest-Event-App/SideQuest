// Every notification the app makes goes through notify(user, n), so quiet hours hold.
// During the account's quiet hours (Profile > Settings > Notifications, Toronto time) a notification still goes
// into the inbox straight away, but held: no alert and no badge (the app sees it as read, with held: true). When
// quiet hours end it's delivered: it counts toward the badge and can alert. Quiet hours turned off, or moved so
// it's no longer quiet, delivers what was held on the next look.
//
// Other parts of the server (call invites, for one) call it the same way:
//   const { notify } = require("./lib/tabs/notify");
//   notify(user, { title: "Maya invited you to a call", body: "Friday Crew is planning Saturday.", roomId });
// It returns the stored notification ({ held, deliverAt } when quiet hours held it back).

const crypto = require("crypto");
const settings = require("./settings");

const MIN = 60000;
const toMin = (hm) => {
  const [h, m] = String(hm).split(":").map(Number);
  return h * 60 + m;
};
const torontoMin = (t) => {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
  return toMin(hm);
};

// When this account's quiet hours end, after the time t (ms); null when it isn't quiet at t
function quietEnds(user, t = Date.now()) {
  if (!settings.quietNow(user, t)) return null;
  const to = toMin(settings.of(user).notifications.quietTo);
  let at = Math.floor(t / MIN) * MIN + ((to - torontoMin(t) + 1440) % 1440) * MIN;
  // A daylight-saving night moves the clock an hour: step to the first minute that's no longer quiet
  for (let i = 0; i < 180 && settings.quietNow(user, at); i++) at += MIN;
  for (let i = 0; i < 180 && !settings.quietNow(user, at - MIN) && at - MIN > t; i++) at -= MIN;
  return at;
}

// n: { title, body, ...anything the inbox reads (eventId, requestId, friendFrom, roomId...) }
function notify(user, n = {}, { now = Date.now() } = {}) {
  if (!user) return null;
  user.notifications = user.notifications || [];
  const ends = quietEnds(user, now);
  const stored = { id: n.id || crypto.randomBytes(6).toString("hex"), time: new Date(now).toISOString(), read: false, ...n };
  if (ends) Object.assign(stored, { held: true, deliverAt: new Date(ends).toISOString() });
  user.notifications.push(stored);
  return stored;
}

// Deliver what quiet hours held, once they're over (or turned off). Returns how many were delivered.
function deliver(user, { now = Date.now() } = {}) {
  let n = 0;
  const quiet = settings.quietNow(user, now);
  for (const x of (user && user.notifications) || []) {
    if (!x.held) continue;
    if (quiet && Date.parse(x.deliverAt) > now) continue;
    delete x.held;
    x.deliveredAt = new Date(now).toISOString();
    n++;
  }
  return n;
}

// What the app reads: held ones show in the inbox as already read (so no badge, no alert), marked held
const forApp = (list) => (list || []).map((x) => (x.held ? { ...x, read: true, held: true } : x));

module.exports = { notify, deliver, forApp, quietEnds };
