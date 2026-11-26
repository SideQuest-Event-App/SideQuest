// How fresh the event import is. Imports are run by hand (`cd events && UPLOAD=1 GEOCODE=1 node run.js`), so this
// warns once the newest one is more than a week old, in the server log, /api/health and the admin side.
// (lib/search/discover.js keeps its own 8-day "dataHealth" for the feed.)

const STALE_HOURS = 7 * 24;
const HOUR = 3600000;

// importedAt: an ISO time, or "sample" / missing for the bundled seed with no date
function importAge(importedAt, now = Date.now()) {
  const t = Date.parse(importedAt);
  if (!Number.isFinite(t)) return { importedAt: importedAt || null, hours: null, stale: false, limitHours: STALE_HOURS };
  const hours = Math.max(0, Math.floor((now - t) / HOUR));
  return { importedAt, hours, stale: hours > STALE_HOURS, limitHours: STALE_HOURS };
}

function staleWarning(age, from) {
  if (!age || !age.stale) return null;
  const when = age.hours >= 48 ? `${Math.floor(age.hours / 24)} days` : `${age.hours} hours`;
  return `WARNING: the newest event import is ${when} old (imported ${age.importedAt}${from ? `, read from the ${from}` : ""}); time to run the import again: cd events && UPLOAD=1 GEOCODE=1 node run.js`;
}

module.exports = { importAge, staleWarning, STALE_HOURS };
