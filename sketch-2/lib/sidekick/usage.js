// Hard spending caps for paid services. Every paid call must reserve() first; when a meter is near
// its free allowance, reserve() says no and the feature switches off for the rest of the month
// (or day), so the app never runs up a bill. Counts survive restarts: they're written to
// data/sidekick-usage.json, and to Supabase Storage when it's configured (Render's disk is wiped on deploy).
//
// Meters (all numbers can be changed in .env / Render):
//   Google's free allowances are per SKU and per month (since March 2025): Text Search Pro 5,000, Text Search
//   Enterprise 1,000, Text Search Enterprise + Atmosphere 1,000. Every Google meter stops at 80% of its allowance
//   (GOOGLE_*_STOP_AT, default 0.8: never set it above 0.8) and has a daily ceiling so one busy day can't use the month.
//   places_text_search  Google Places Text Search (Enterprise fields: rating, price, hours), for planning calls.
//                       Stops at 800 a month and 60 a day (was 40). Env: GOOGLE_PLACES_FREE_PER_MONTH,
//                       GOOGLE_PLACES_STOP_AT, GOOGLE_PLACES_DAILY_MAX.
//   places_search_atmosphere  A call's search for what someone asked for ("Chinese skewers"): Enterprise fields
//                       plus the editorial summary (Enterprise + Atmosphere SKU), so picks can be checked against
//                       the request. Stops at 800 a month and 40 a day. Env: GOOGLE_PLACES_ATMOS_FREE_PER_MONTH,
//                       GOOGLE_PLACES_ATMOS_STOP_AT, GOOGLE_PLACES_ATMOS_DAILY_MAX.
//   places_search_pro   Google Places searches with only Pro fields (no rating, price or hours): the map and Discover
//                       searches. Stops at 4,000 a month and 250 a day (was 150). Env: GOOGLE_PLACES_PRO_FREE_PER_MONTH,
//                       GOOGLE_PLACES_PRO_STOP_AT, GOOGLE_PLACES_PRO_DAILY_MAX. Confirm the allowances on Google's
//                       pricing sheet before raising anything.
//   foursquare_places   Foursquare Places search (Pro fields only). Foursquare's pricing page lists 10,000 free Pro
//                       calls a month; we stop at 80% (8,000) and 300 a day. Env: FOURSQUARE_FREE_PER_MONTH,
//                       FOURSQUARE_STOP_AT, FOURSQUARE_DAILY_MAX.
//   elevenlabs_minutes  ElevenLabs agent minutes. Each call reserves its maximum length up front and
//                       gives back what it didn't use when it ends.
//   elevenlabs_tts_chars  ElevenLabs text-to-speech characters (Sidekick's lines in its own voices, lib/sidekick/tts.js).
//                       A conservative 10,000 a month (the free plan's credits), stopping at 80% and at 2,000 a day;
//                       repeated lines come from memory and aren't counted. Env: ELEVENLABS_TTS_CHARS_PER_MONTH,
//                       ELEVENLABS_TTS_STOP_AT, ELEVENLABS_TTS_DAILY_CHARS.
//
// This is a second line of defence. Also set quota caps in Google Cloud and usage limits in ElevenLabs:
// those stop spending even if this app has a bug or the key leaks.

const fs = require("fs");
const path = require("path");

const FILE = process.env.SIDEKICK_USAGE_FILE || path.join(__dirname, "..", "..", "data", "sidekick-usage.json");
const STORE_NAME = "sidekick-usage.json";
const num = (v, d) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

function meters() {
  return {
    places_text_search: {
      label: "Google Places searches",
      off: process.env.SIDEKICK_PLACES_OFF === "1",
      monthlyFree: num(process.env.GOOGLE_PLACES_FREE_PER_MONTH, 1000),
      stopAt: num(process.env.GOOGLE_PLACES_STOP_AT, 0.8),
      dailyMax: num(process.env.GOOGLE_PLACES_DAILY_MAX, 60),
    },
    places_search_atmosphere: {
      label: "Google Places searches for what people asked for (Enterprise + Atmosphere)",
      off: process.env.SIDEKICK_PLACES_OFF === "1",
      monthlyFree: num(process.env.GOOGLE_PLACES_ATMOS_FREE_PER_MONTH, 1000),
      stopAt: num(process.env.GOOGLE_PLACES_ATMOS_STOP_AT, 0.8),
      dailyMax: num(process.env.GOOGLE_PLACES_ATMOS_DAILY_MAX, 40),
    },
    foursquare_places: {
      label: "Foursquare Places searches",
      off: process.env.FOURSQUARE_OFF === "1",
      monthlyFree: num(process.env.FOURSQUARE_FREE_PER_MONTH, 10000),
      stopAt: num(process.env.FOURSQUARE_STOP_AT, 0.8),
      dailyMax: num(process.env.FOURSQUARE_DAILY_MAX, 300),
    },
    places_search_pro: {
      label: "Google Places searches (map, Pro fields)",
      off: process.env.SIDEKICK_PLACES_OFF === "1",
      monthlyFree: num(process.env.GOOGLE_PLACES_PRO_FREE_PER_MONTH, 5000),
      stopAt: num(process.env.GOOGLE_PLACES_PRO_STOP_AT, 0.8),
      dailyMax: num(process.env.GOOGLE_PLACES_PRO_DAILY_MAX, 250),
    },
    elevenlabs_minutes: {
      label: "ElevenLabs agent minutes",
      off: process.env.SIDEKICK_ELEVENLABS_OFF === "1",
      monthlyFree: num(process.env.ELEVENLABS_MINUTES_PER_MONTH, 15),
      stopAt: num(process.env.ELEVENLABS_STOP_AT, 0.8),
      dailyMax: num(process.env.ELEVENLABS_DAILY_MINUTES, 10),
    },
    elevenlabs_tts_chars: {
      label: "ElevenLabs text-to-speech characters",
      off: process.env.SIDEKICK_ELEVENLABS_OFF === "1" || process.env.ELEVENLABS_TTS_OFF === "1",
      monthlyFree: num(process.env.ELEVENLABS_TTS_CHARS_PER_MONTH, 10000),
      stopAt: Math.min(0.8, num(process.env.ELEVENLABS_TTS_STOP_AT, 0.8)),
      dailyMax: num(process.env.ELEVENLABS_TTS_DAILY_CHARS, 2000),
    },
  };
}

// Months and days in Pacific time, close to how Google and ElevenLabs bill
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const today = () => fmt.format(new Date());
const month = () => today().slice(0, 7);

let data = null; // { month: { "2026-11": { meter: n } }, day: { "2026-11-24": { meter: n } } }
let store = null;
try { store = require("../../../sketch-1/lib/store"); } catch {}

async function load() {
  if (data) return data;
  let fromFile = null;
  let fromStore = null;
  try { fromFile = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  try { if (store && store.configured()) fromStore = await store.get(STORE_NAME); } catch (err) { console.warn("Couldn't read usage counts from Supabase:", err.message); }
  // Take the higher count of the two for every meter, so a lost copy never lowers the total
  data = { month: {}, day: {} };
  for (const src of [fromFile, fromStore]) {
    if (!src) continue;
    for (const scope of ["month", "day"]) for (const [k, m] of Object.entries(src[scope] || {})) {
      data[scope][k] = data[scope][k] || {};
      for (const [meter, n] of Object.entries(m)) data[scope][k][meter] = Math.max(data[scope][k][meter] || 0, Number(n) || 0);
    }
  }
  return data;
}

async function save() {
  // Keep only the current and previous month, and the last 7 days
  const months = Object.keys(data.month).sort().slice(-2);
  const days = Object.keys(data.day).sort().slice(-7);
  data = { month: Object.fromEntries(months.map((k) => [k, data.month[k]])), day: Object.fromEntries(days.map((k) => [k, data.day[k]])) };
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch (err) {
    console.error("Couldn't save usage counts:", err.message);
  }
  try { if (store && store.configured()) await store.put(STORE_NAME, data); } catch (err) { console.error("Couldn't save usage counts to Supabase:", err.message); }
}

function used(meter) {
  return { month: (data.month[month()] || {})[meter] || 0, day: (data.day[today()] || {})[meter] || 0 };
}
function limits(meter) {
  const m = meters()[meter];
  return { month: Math.floor(m.monthlyFree * m.stopAt), day: m.dailyMax };
}

// Reserve `amount` before a paid call. Returns { ok, reason }. Never lets the count pass the limit.
async function reserve(meter, amount = 1) {
  await load();
  const m = meters()[meter];
  if (!m) throw new Error(`Unknown usage meter: ${meter}`);
  if (m.off) return { ok: false, reason: "switched off" };
  const u = used(meter);
  const lim = limits(meter);
  if (u.month + amount > lim.month) { warnOnce(meter, "month", u, lim); return { ok: false, reason: "monthly limit" }; }
  if (u.day + amount > lim.day) { warnOnce(meter, "day", u, lim); return { ok: false, reason: "daily limit" }; }
  const mo = (data.month[month()] = data.month[month()] || {});
  const dy = (data.day[today()] = data.day[today()] || {});
  mo[meter] = (mo[meter] || 0) + amount;
  dy[meter] = (dy[meter] || 0) + amount;
  await save();
  return { ok: true, used: used(meter), limits: lim };
}

// Give back part of a reservation (e.g. an agent call that ended early)
async function release(meter, amount) {
  await load();
  if (!(amount > 0)) return;
  const mo = data.month[month()] || {};
  const dy = data.day[today()] || {};
  mo[meter] = Math.max(0, (mo[meter] || 0) - amount);
  dy[meter] = Math.max(0, (dy[meter] || 0) - amount);
  await save();
}

async function available(meter, amount = 1) {
  await load();
  const m = meters()[meter];
  if (!m || m.off) return false;
  const u = used(meter);
  const lim = limits(meter);
  return u.month + amount <= lim.month && u.day + amount <= lim.day;
}

async function status() {
  await load();
  return Object.fromEntries(Object.entries(meters()).map(([k, m]) => [k, { label: m.label, off: m.off, used: used(k), limits: limits(k), freeAllowance: m.monthlyFree }]));
}

const warned = new Set();
function warnOnce(meter, scope, u, lim) {
  const key = `${meter}:${scope}:${scope === "month" ? month() : today()}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`Usage cap reached for ${meter} (${scope}): ${u[scope]} of ${lim[scope]}. Switched off until the ${scope} resets.`);
}

// For tests
function _reset() { data = { month: {}, day: {} }; warned.clear(); }

module.exports = { reserve, release, available, status, _reset };
