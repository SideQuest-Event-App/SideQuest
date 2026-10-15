// Import real GTA events for the next four months into seed/events.json.
//   node import/run.js            (from sketch-1/)
//   ONLY=Ticketmaster,Instagram MERGE=1 node import/run.js
//                                 (fetch just those sources and add them to the current seed/events.json)
// Sources: DICE (published sitemaps + event pages), Eventbrite (listing + event pages),
// Meetup (find pages + event pages), Luma (Toronto discover list), City of Toronto (open data feed),
// Ticketmaster (official Discovery API, needs TICKETMASTER_API_KEY in .env),
// Instagram (venues' business accounts, read by the AI; needs INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN).
// Not imported: Resident Advisor, Partiful and blogTO (see NOT_IMPORTED).
// Restart the server afterwards; it swaps the new events into the database and keeps everything else.

const fs = require("fs");
const path = require("path");

// Load .env for the Ticketmaster and Instagram keys
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { toEvent, NA } = require("./normalize");
const { dedupe } = require("./dedupe");
const { fetchDice } = require("./sources/dice");
const { fetchEventbrite } = require("./sources/eventbrite");
const { fetchTicketmaster } = require("./sources/ticketmaster");
const { fetchMeetup } = require("./sources/meetup");
const { fetchLuma } = require("./sources/luma");
const { fetchToronto } = require("./sources/toronto");
const { fetchInstagram } = require("./sources/instagram");

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
  ["Instagram", fetchInstagram, Number(process.env.INSTAGRAM_MAX || 5000)],
].filter(([name]) => !process.env.ONLY || process.env.ONLY.toLowerCase().split(",").includes(name.toLowerCase()));
// MERGE=1: keep the events already in seed/events.json and add these sources' events to them
const previous = process.env.MERGE && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
const NOT_IMPORTED = {
  "Resident Advisor": "ra.co answers automated visitors with a 403 and a captcha, its robots.txt disallows its API, and it blocks AI crawlers (including Anthropic's) from the whole site, so it isn't imported.",
  Partiful: "Partiful's robots.txt only admits search engines and link-preview bots, and its events are mostly private invites with no public Toronto listing, so it isn't imported.",
  blogTO: "blogTO's terms and robots.txt prohibit scraping and building datasets from its content, so it isn't imported.",
};


(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + DAYS * 86400000);
  log(`Importing GTA events from ${start.toDateString()} to ${end.toDateString()}`);

  const report = previous ? { ...previous.sources } : {};
  // Merging: the sources being fetched again replace their own earlier events (a re-read poster can move a date)
  const all = previous ? previous.events.filter((e) => !SOURCES.some(([name]) => name === e.source)) : [];
  if (previous) log(`Merging into the ${all.length} events already in seed/events.json`);
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

  // The same event listed twice (on two sites, or twice on one under different titles) becomes one listing
  const { events } = dedupe(all);
  if (!events.length) {
    log("\nNo events imported; leaving seed/events.json as it was.");
    process.exit(1);
  }

  const window = previous ? { from: previous.window.from, to: new Date(Math.max(Date.parse(previous.window.to), end.getTime())).toISOString() } : { from: start.toISOString(), to: end.toISOString() };
  const file = { importedAt: new Date().toISOString(), ...(previous && { mergedFrom: previous.importedAt }), window, sources: report, notImported: NOT_IMPORTED, events };
  fs.writeFileSync(OUT, JSON.stringify(file, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
  log(`\nWrote ${events.length} events (${all.length - events.length} duplicates merged${previous ? `, ${events.length - previous.events.length} new` : ""}) to seed/events.json`);
  for (const [k, v] of Object.entries(report)) log(`  ${k}: ${v.kept} kept${v.note ? ` (${v.note})` : ""}`);
  const vibes = {};
  for (const e of events) for (const v of e.vibes.length ? e.vibes : ["(no vibe: Other)"]) vibes[v] = (vibes[v] || 0) + 1;
  const missing = { price: events.filter((e) => e.price == null).length, image: events.filter((e) => !e.image).length, description: events.filter((e) => e.description === NA).length, organizer: events.filter((e) => e.organizer.name === NA).length };
  log("  N/A counts:", Object.entries(missing).map(([k, n]) => `${k} ${n}`).join(", "));
  log("  vibes:", Object.entries(vibes).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(", "));
  log("\nRestart `node server.js` to load them.");
})();
