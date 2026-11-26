// Event details from an Instagram caption by plain rules (no AI), for the daily automated Instagram import.
// Careful on purpose: a post becomes an event only when its caption gives a date (or "tonight"/"tomorrow"/a weekday)
// AND looks like an event (a time, "doors", "tickets", "live", "presents"...). Everything it can't find stays empty,
// as with the other sources (price, end time). The by-hand AI reader (import/instagram.js) is still better: it reads
// the posters too, and what it has read always wins over these rules.
//
//   parseCaption(caption, postedAt) -> [{ title, start: "YYYY-MM-DDTHH:MM" (Toronto time), end: null, price,
//                                         ticketUrl, description, venue: null }]   (empty when it isn't an event)

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const DAYS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";
const EVENTY = /\b(doors?|tickets?|tix|live|presents|show|gig|lineup|line-up|dj|set|comedy|stand-?up|open mic|party|night|showcase|screening|workshop|market|festival|fest|launch|opening|reception|exhibition|tour|concert|rsvp|cover|admission|pwyc|all ages|19\+|18\+)\b/i;
const NOT_EVENT = /\b(giveaway|now hiring|we'?re hiring|closed (?:today|tonight)|recap|thank you (?:to )?(?:everyone|all) who|throwback|tbt|last night was)\b/i;

const pad = (n) => String(n).padStart(2, "0");
// The post's date in Toronto, as [year, month, day, weekday]
function torontoDate(iso) {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(d).map((p) => [p.type, p.value]));
  return [Number(parts.year), Number(parts.month), Number(parts.day), DAYS[parts.weekday.toLowerCase().slice(0, 3)]];
}
const addDays = ([y, m, d], n) => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
};
const valid = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// The first date the caption names, worked out from the post date (a date that already passed means next year)
function findDate(text, posted) {
  const [py, pm, pd, pw] = posted;
  const yearFor = (m, d) => {
    const days = (Date.UTC(py, m - 1, d) - Date.UTC(py, pm - 1, pd)) / 86400000;
    return days < -7 ? py + 1 : py; // "Jan 9" posted in December is next January
  };
  let m;
  // "Nov 27", "November 27th", "Fri Nov 27"
  if ((m = text.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?::|am|pm))`, "i")))) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3)] || MONTHS[m[1].toLowerCase().slice(0, 3)];
    const day = Number(m[2]);
    if (valid(yearFor(mon, day), mon, day)) return [yearFor(mon, day), mon, day];
  }
  // "27 November", "27th Nov"
  if ((m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, "i")))) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    const day = Number(m[1]);
    if (valid(yearFor(mon, day), mon, day)) return [yearFor(mon, day), mon, day];
  }
  // "11/27" or "11.27" (North American month first), not a time or a price
  if ((m = text.match(/(?<![\d$:.])(1[0-2]|0?[1-9])[/.](3[01]|[12]\d|0?[1-9])(?![\d:%])/))) {
    const mon = Number(m[1]);
    const day = Number(m[2]);
    if (valid(yearFor(mon, day), mon, day)) return [yearFor(mon, day), mon, day];
  }
  if (/\btonight\b|\btonite\b|\btoday\b/i.test(text)) return [py, pm, pd];
  if (/\btomorrow\b/i.test(text)) return addDays([py, pm, pd], 1);
  // "this Friday", "Saturday": the next one on or after the post date
  if ((m = text.match(new RegExp(`\\b(?:this\\s+|next\\s+)?${DAY_RE}\\b`, "i")))) {
    const want = DAYS[m[1].toLowerCase().replace(/day$/, "").slice(0, 3)];
    if (want != null) {
      let ahead = (want - pw + 7) % 7;
      if (/^next\s/i.test(m[0]) && ahead < 7) ahead += ahead === 0 ? 7 : 0;
      return addDays([py, pm, pd], ahead);
    }
  }
  return null;
}

// "8pm", "8:30 PM", "doors 7", "20:00" -> "HH:MM" (doors / show times prefer the show)
function findTime(text) {
  const times = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi)) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    if (h < 24) times.push({ at: m.index, hm: `${pad(h)}:${m[2] || "00"}` });
  }
  for (const m of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m|p\.?m))/gi)) times.push({ at: m.index, hm: `${pad(Number(m[1]) > 0 && Number(m[1]) < 10 ? Number(m[1]) + 12 : Number(m[1]))}:${m[2]}` }); // "8:30" with no am/pm: evening
  if (!times.length) return null;
  times.sort((a, b) => a.at - b.at);
  const show = times.find((t) => /\b(show|music|starts?|set)\b[^\n]{0,12}$/i.test(text.slice(Math.max(0, t.at - 14), t.at)));
  return (show || times[0]).hm;
}

function findPrice(text) {
  if (/\b(free|no cover|free entry|free admission)\b/i.test(text) && !/\bfree\s+(?:shot|drink|merch|gift|tote)/i.test(text)) return 0;
  const m = text.match(/\$\s?(\d{1,3}(?:\.\d{2})?)/);
  return m ? Number(m[1]) : null;
}

// The first line that reads like a name: no hashtags, mentions, emoji or links, at most 90 characters
function findTitle(caption) {
  for (let line of caption.split(/\n+/)) {
    line = line.replace(/https?:\/\/\S+/g, "").replace(/[#@][\w.]+/g, "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
    line = line.replace(/^[-–—•*|:.,!\s]+|[-–—•*|:,\s]+$/g, "");
    if (line.length >= 4 && /[a-z]/i.test(line)) return line.length > 90 ? `${line.slice(0, 87).replace(/\s+\S*$/, "")}…` : line;
  }
  return null;
}

function parseCaption(caption, postedAt) {
  const text = String(caption || "");
  if (!text.trim() || !postedAt || NOT_EVENT.test(text)) return [];
  const posted = torontoDate(postedAt);
  const date = findDate(text, posted);
  const time = findTime(text);
  if (!date || (!time && !EVENTY.test(text))) return [];
  const title = findTitle(text);
  if (!title) return [];
  const ticket = (text.match(/https?:\/\/\S+/) || [])[0] || "";
  return [{ title, start: `${date[0]}-${pad(date[1])}-${pad(date[2])}T${time || "19:00"}`, end: null, venue: null, address: "", price: findPrice(text), organizer: "", ticketUrl: ticket, description: text.replace(/\s+/g, " ").trim().slice(0, 600), timeGuessed: !time }];
}

module.exports = { parseCaption, findDate, findTime, findPrice, findTitle, torontoDate };
