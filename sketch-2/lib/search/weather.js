// Tonight's weather for Toronto from Open-Meteo (free, no key; non-commercial use, which a class project is).
// One request covers the next 7 days hour by hour, kept in memory for at most an hour. If Open-Meteo can't be
// reached, weather is simply skipped: nothing waits on it for long, and nothing fails because of it.
// WEATHER_OFF=1 turns it off. Only the city centre is asked about: no one's location is ever sent.

const URL_ = "https://api.open-meteo.com/v1/forecast?latitude=43.65&longitude=-79.38&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timezone=America%2FToronto&forecast_days=7";
const TTL_MS = 3600 * 1000; // at most one request an hour
const RETRY_MS = 10 * 60 * 1000; // after a failure, don't ask again for 10 minutes
const TIMEOUT_MS = 2500;

let cache = null; // { at, hours: Map("YYYY-MM-DDTHH" -> { temp, pop, mm, code }) }
let failedAt = null;
let inflight = null;

const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const RAIN = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

function parse(json) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error("Open-Meteo answer had no hourly data");
  const hours = new Map();
  h.time.forEach((t, i) => hours.set(String(t).slice(0, 13), { temp: h.temperature_2m && h.temperature_2m[i], pop: h.precipitation_probability && h.precipitation_probability[i], mm: h.precipitation && h.precipitation[i], code: h.weather_code && h.weather_code[i] }));
  return hours;
}

// Refresh the cache if it's older than an hour. Never throws; resolves to true when weather is available.
async function refresh({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (process.env.WEATHER_OFF === "1") return false;
  if (cache && now - cache.at < TTL_MS) return true;
  if (failedAt != null && now - failedAt < RETRY_MS) return !!cache;
  if (!inflight) {
    inflight = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(URL_, { signal: ctrl.signal, headers: { "user-agent": "SideQuest class prototype" } });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        cache = { at: now, hours: parse(await res.json()) };
        return true;
      } catch (err) {
        failedAt = now;
        console.warn(`Weather skipped: ${err.message}`);
        return false;
      } finally {
        clearTimeout(timer);
        inflight = null;
      }
    })();
  }
  return inflight;
}

const localHourKey = (iso) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}`;
};

// What it'll be like at a time: { wet, cold, nice, label } or null when we don't know (no cache, out of range).
// A date ("2026-11-28") means 8 PM that night.
function at(when) {
  if (!cache) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(when) ? `${when}T20:00:00-05:00` : when;
  const h = cache.hours.get(localHourKey(iso));
  if (!h) return null;
  return describe(h);
}

function describe(h) {
  const snow = SNOW.has(h.code);
  const wet = snow || RAIN.has(h.code) || (h.pop != null && h.pop >= 60) || (h.mm != null && h.mm >= 0.5);
  const cold = h.temp != null && h.temp <= -8;
  const nice = !wet && h.temp != null && h.temp >= 15 && h.temp <= 28;
  const t = h.temp != null ? `${Math.round(h.temp)}°` : "";
  const label = snow ? "Snow is forecast" : wet ? "Rain is forecast" : cold ? `It's ${t} tonight` : nice ? `It's ${t} and dry` : `${t}`;
  return { wet, cold, nice, temp: h.temp, label };
}

// For tests and simulations: set the forecast directly ({ "YYYY-MM-DDTHH": { temp, pop, mm, code } })
function _set(hours, now = Date.now()) {
  cache = hours ? { at: now, hours: new Map(Object.entries(hours)) } : null;
  failedAt = null;
}
function _reset() {
  cache = null;
  failedAt = null;
  inflight = null;
}

module.exports = { refresh, at, describe, localHourKey, _set, _reset, TTL_MS };
