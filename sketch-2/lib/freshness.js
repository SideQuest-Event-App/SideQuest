// How fresh the event import is, now that it runs every day: a warning once the newest import is more than
// 36 hours old (one missed daily run plus GitHub's usual delay), in the server log, /api/health and the admin side.
// (lib/search/discover.js keeps its own, older 8-day "dataHealth" for the feed; this one is the daily-import check.)

const STALE_HOURS = 36;
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
  return `WARNING: the newest event import is ${when} old (imported ${age.importedAt}${from ? `, read from the ${from}` : ""}); the daily import should keep it under ${STALE_HOURS} hours. Check the "Import events" workflow on GitHub's Actions tab.`;
}

module.exports = { importAge, staleWarning, STALE_HOURS };
