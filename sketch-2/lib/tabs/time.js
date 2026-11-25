// Toronto wall-clock time to a real instant, right on both sides of daylight saving.
// The add-from-a-link form used to glue a fixed "-04:00" (summer time) onto every date, so a winter 2 PM start
// (Toronto is -05:00 from November to March) was saved as 1 PM. This asks Intl for the offset on that day instead.

const TZ = "America/Toronto";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Toronto's offset from UTC at the instant t (ms), in ms: -4 h in summer, -5 h in winter
function offsetAt(t) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return wall - Math.floor(t / 1000) * 1000;
}

// "2026-12-05", "14:00" -> the Date when Toronto's clocks read that. A time skipped by the spring change
// (2:30 AM on the second Sunday of March) comes out an hour later, the way clocks read it.
function torontoDate(date, time = "00:00") {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
  if (!d || !t) return new Date(NaN);
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const want = `${t[1].padStart(2, "0")}:${t[2]}`;
  // The offsets a day either side; on a normal day they're the same
  const before = wall - offsetAt(wall - 86400000);
  const after = wall - offsetAt(wall + 86400000);
  const ok = [before, after].filter((c) => torontoParts(c).time === want).sort((a, b) => a - b);
  // Both read right on the fall-back night (1:30 AM happens twice): the first one. Neither, in the spring gap: clocks jump ahead.
  return new Date(ok.length ? ok[0] : before);
}

// The instant -> { date: "2026-12-05", time: "14:00" } on Toronto's clocks
function torontoParts(t) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}` };
}

module.exports = { TZ, offsetAt, torontoDate, torontoParts };
