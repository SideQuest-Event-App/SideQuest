// Import real GTA events for the next four months into seed/events.json.
//   node import/run.js            (from sketch-1/)
// Sources: DICE (published sitemaps + event pages), Eventbrite (listing + event pages),
// Meetup (find pages + event pages), Luma (Toronto discover list), City of Toronto (open data feed),
// Ticketmaster (official Discovery API, needs TICKETMASTER_API_KEY in .env).
// Not imported: Resident Advisor, Partiful and blogTO (see NOT_IMPORTED).
// Restart the server afterwards; it swaps the new events into the database and keeps everything else.

const fs = require("fs");
const path = require("path");

// Load .env for TICKETMASTER_API_KEY
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { toEvent, NA } = require("./normalize");
const { fetchDice } = require("./sources/dice");
const { fetchEventbrite } = require("./sources/eventbrite");
const { fetchTicketmaster } = require("./sources/ticketmaster");
const { fetchMeetup } = require("./sources/meetup");
const { fetchLuma } = require("./sources/luma");
const { fetchToronto } = require("./sources/toronto");

const DAYS = Number(process.env.DAYS || 122);
const OUT = path.join(__dirname, "..", "seed", "events.json");
const log = (...a) => console.log(...a);

// Each source works on a different site, so they run side by side; limits are high enough to mean "all"
const SOURCES = [
  ["DICE", fetchDice, Number(process.env.DICE_MAX || 5000)],
  ["Eventbrite", fetchEventbrite, Number(process.env.EVENTBRITE_MAX || 20000)],
  ["Meetup", fetchMeetup, Number(process.env.MEETUP_MAX || 10000)],
  ["Luma", fetchLuma, Number(process.env.LUMA_MAX || 2000)],
  ["City of Toronto", fetchToronto, Number(process.env.TORONTO_MAX || 10000)],
  ["Ticketmaster", fetchTicketmaster, Number(process.env.TICKETMASTER_MAX || 5000)],
];
const NOT_IMPORTED = {
  "Resident Advisor": "ra.co answers automated visitors with a 403 and a captcha, its robots.txt disallows its API, and it blocks AI crawlers (including Anthropic's) from the whole site, so it isn't imported.",
  Partiful: "Partiful's robots.txt only admits search engines and link-preview bots, and its events are mostly private invites with no public Toronto listing, so it isn't imported.",
  blogTO: "blogTO's terms and robots.txt prohibit scraping and building datasets from its content, so it isn't imported.",
};

// Same show listed on two sites: same day, same area (about 1 km) and mostly the same title words
const dedupeKey = (e) => `${e.startsAt.slice(0, 10)}|${e.venue.lat.toFixed(2)},${e.venue.lng.toFixed(2)}|${e.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 2).slice(0, 4).sort().join(" ")}`;
// How much a listing tells us, to keep the fuller one of two duplicates
const fullness = (e) => (e.price != null) + !!e.image + (e.description !== NA) + (e.organizer.name !== NA) + !!e.endsAt;

(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + DAYS * 86400000);
  log(`Importing GTA events from ${start.toDateString()} to ${end.toDateString()}`);

  const report = {};
  const all = [];
  await Promise.all(
    SOURCES.map(async ([name, fn, max]) => {
      const say = (...a) => log(...a);
      say(`${name}: starting`);
      try {
        const raw = await fn({ start, end, max, log: say });
        if (!Array.isArray(raw)) {
          report[name] = { fetched: 0, kept: 0, note: raw.skipped };
          return;
        }
        const events = raw.map(toEvent).filter((e) => e && new Date(e.startsAt) >= start && new Date(e.startsAt) <= end && e.venue.lat > 43.35 && e.venue.lat < 44.15 && e.venue.lng > -80.1 && e.venue.lng < -78.8);
        report[name] = { fetched: raw.length, kept: events.length };
        all.push(...events);
        say(`${name}: done, ${raw.length} fetched, ${events.length} in-person GTA events kept`);
      } catch (err) {
        report[name] = { fetched: 0, kept: 0, note: (err && err.message) || String(err) };
        say(`${name} failed: ${(err && err.message) || err}`);
      }
    })
  );

  // Dedupe across sites: keep the fuller listing, and fill its N/A gaps from the other one
  const byKey = new Map();
  for (const e of all) {
    const k = dedupeKey(e);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, e);
      continue;
    }
    const [keep, other] = fullness(e) > fullness(prev) ? [e, prev] : [prev, e];
    if (keep.price == null && other.price != null) Object.assign(keep, { price: other.price, priceNote: other.priceNote });
    if (!keep.image) keep.image = other.image;
    if (keep.description === NA) keep.description = other.description;
    if (keep.organizer.name === NA) keep.organizer = other.organizer;
    if (!keep.endsAt) keep.endsAt = other.endsAt;
    // "Also listed on" only for another site (one source can list the same event twice, e.g. once per date)
    const also = [...(keep.alsoOn || []), ...(other.alsoOn || [])];
    if (other.source !== keep.source) also.push({ source: other.source, url: other.sourceUrl });
    const seen = new Set();
    keep.alsoOn = also.filter((o) => o.source !== keep.source && !seen.has(o.source) && seen.add(o.source));
    if (!keep.alsoOn.length) delete keep.alsoOn;
    byKey.set(k, keep);
  }
  const events = [...byKey.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (!events.length) {
    log("\nNo events imported; leaving seed/events.json as it was.");
    process.exit(1);
  }

  const file = { importedAt: new Date().toISOString(), window: { from: start.toISOString(), to: end.toISOString() }, sources: report, notImported: NOT_IMPORTED, events };
  fs.writeFileSync(OUT, JSON.stringify(file, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
  log(`\nWrote ${events.length} events (${all.length - events.length} duplicates merged) to seed/events.json`);
  for (const [k, v] of Object.entries(report)) log(`  ${k}: ${v.kept} kept${v.note ? ` (${v.note})` : ""}`);
  const vibes = {};
  for (const e of events) for (const v of e.vibes.length ? e.vibes : ["(no vibe: Other)"]) vibes[v] = (vibes[v] || 0) + 1;
  const missing = { price: events.filter((e) => e.price == null).length, image: events.filter((e) => !e.image).length, description: events.filter((e) => e.description === NA).length, organizer: events.filter((e) => e.organizer.name === NA).length };
  log("  N/A counts:", Object.entries(missing).map(([k, n]) => `${k} ${n}`).join(", "));
  log("  vibes:", Object.entries(vibes).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(", "));
  log("\nRestart `node server.js` to load them.");
})();
