// Profile > Settings: one object per account (user.settings), validated here and stored with the account like the
// rest of the profile (data/db.json or the sketch2_accounts row). Anything missing falls back to DEFAULTS, so older
// accounts need no migration. Six groups, as on the D1 board: notifications (with quiet hours), privacy and data,
// calendar, display and accessibility, language, and help (no stored values).

const DEFAULTS = {
  notifications: { plans: true, squads: true, requests: true, hosts: false, quiet: true, quietFrom: "23:00", quietTo: "09:00" },
  privacy: { seeGoing: "friends", seeHosting: "everyone", squadAdd: "friends", blocked: [] },
  calendar: { app: "ask", reminder: "2h" },
  display: { theme: "dark", textSize: "default", motion: "system", captions: true },
  language: "en",
};
const CHOICES = {
  seeGoing: ["everyone", "friends", "squads", "nobody"],
  seeHosting: ["everyone", "friends", "nobody"],
  squadAdd: ["friends", "anyone", "nobody"],
  app: ["ask", "google", "apple", "outlook"],
  reminder: ["none", "1h", "2h", "1d"],
  theme: ["dark"],
  textSize: ["default", "large"],
  motion: ["system", "reduce"],
  language: ["en", "fr"],
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const clone = (o) => JSON.parse(JSON.stringify(o));
// The account's settings with every default filled in
function of(user) {
  const s = user.settings || {};
  const out = clone(DEFAULTS);
  for (const g of ["notifications", "privacy", "calendar", "display"]) Object.assign(out[g], s[g] || {});
  if (s.language) out.language = s.language;
  out.privacy.blocked = Array.isArray(out.privacy.blocked) ? out.privacy.blocked : [];
  return out;
}

// Merge a change into the account's settings; anything not on the list is ignored, and bad values throw
function apply(user, change = {}) {
  const cur = of(user);
  const bool = (v) => v === true || v === false;
  const pick = (k, v) => {
    if (!CHOICES[k].includes(v)) throw new Error("That setting isn't one of the choices.");
    return v;
  };
  const n = change.notifications || {};
  for (const k of ["plans", "squads", "requests", "hosts", "quiet"]) if (bool(n[k])) cur.notifications[k] = n[k];
  for (const k of ["quietFrom", "quietTo"]) if (n[k] !== undefined) {
    if (!TIME.test(String(n[k]))) throw new Error("Pick a time like 23:00.");
    cur.notifications[k] = n[k];
  }
  const p = change.privacy || {};
  for (const k of ["seeGoing", "seeHosting", "squadAdd"]) if (p[k] !== undefined) cur.privacy[k] = pick(k, p[k]);
  if (p.block) cur.privacy.blocked = [...new Set([...cur.privacy.blocked, String(p.block).slice(0, 40)])].slice(0, 200);
  if (p.unblock) cur.privacy.blocked = cur.privacy.blocked.filter((x) => x !== p.unblock);
  const c = change.calendar || {};
  for (const k of ["app", "reminder"]) if (c[k] !== undefined) cur.calendar[k] = pick(k, c[k]);
  const d = change.display || {};
  for (const k of ["theme", "textSize", "motion"]) if (d[k] !== undefined) cur.display[k] = pick(k, d[k]);
  if (bool(d.captions)) cur.display.captions = d.captions;
  if (change.language !== undefined) cur.language = pick("language", change.language);
  user.settings = cur;
  return cur;
}

// Is the time (ms) inside this account's quiet hours (Toronto time)?
function quietNow(user, t = Date.now()) {
  const n = of(user).notifications;
  if (!n.quiet) return false;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
  return n.quietFrom <= n.quietTo ? hm >= n.quietFrom && hm < n.quietTo : hm >= n.quietFrom || hm < n.quietTo;
}

module.exports = { DEFAULTS, CHOICES, of, apply, quietNow };
