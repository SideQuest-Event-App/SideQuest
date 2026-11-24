// Import real GTA events for the next three months into seed/events.json (and, with UPLOAD=1, Supabase Storage,
// where the apps' servers pick it up). Runs every week by itself (.github/workflows/import-events.yml).
//   node import/run.js            (from sketch-1/)
//   ONLY=Ticketmaster,Instagram MERGE=1 node import/run.js
//                                 (fetch just those sources and keep everyone else's events from last time)
// Sources, in the order they win a tie between duplicates:
//   Ticketmaster (official Discovery API, needs TICKETMASTER_API_KEY), Instagram (the events saved by the last
//   `node import/instagram.js`; this never calls the AI), then the sites: DICE (published sitemaps + event pages),
//   Meetup (Toronto groups' event pages), Luma (Toronto discover list), City of Toronto and Toronto Public Library
//   (open data), Eventbrite (listing + event pages).
// Every site is read within its robots.txt (import/fetch.js). Not imported: see NOT_IMPORTED.
//
// Guardrails: a source that fails, or brings back under half of last run's events, keeps last run's events
// instead; nothing here uses the AI (AI=off in the scheduled run); only events in the window are kept.
// Left out: listings outside Toronto ("Beyond Toronto") and appointment-style ones (in-store sales consultations),
// counted in the summary. AI vibes come only from import/event-tags.json, written by the hand-run `node import/tag.js`.

const fs = require("fs");
const path = require("path");

// Load .env for the Ticketmaster and Supabase keys (the scheduled run gets them from GitHub's secrets)
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { toEvent, dropReason, retag, NA } = require("./normalize");
const tags = require("./tags");
const { dedupe } = require("./dedupe");
const store = require("../lib/store");
const eventsTable = require("../lib/events-table");
const { fetchDice } = require("./sources/dice");
const { fetchEventbrite } = require("./sources/eventbrite");
const { fetchTicketmaster } = require("./sources/ticketmaster");
const { fetchMeetup } = require("./sources/meetup");
const { fetchLuma } = require("./sources/luma");
const { fetchToronto } = require("./sources/toronto");
const { fetchTPL } = require("./sources/tpl");
const { fetchInstagram } = require("./sources/instagram");
const { fetchICS } = require("./sources/ics");
const { fetchOntario } = require("./sources/ontario");

const DAYS = Number(process.env.DAYS || 92);
const OUT = path.join(__dirname, "..", "seed", "events.json");
const log = (...a) => console.log(...a);

// In priority order. Each source works on a different site, so they run side by side; limits mean "all"
const SOURCES = [
  ["Ticketmaster", fetchTicketmaster, Number(process.env.TICKETMASTER_MAX || 5000)],
  ["Instagram", fetchInstagram, Number(process.env.INSTAGRAM_MAX || 5000)],
  ["DICE", fetchDice, Number(process.env.DICE_MAX || 5000)],
  ["Meetup", fetchMeetup, Number(process.env.MEETUP_MAX || 10000)],
  ["Luma", fetchLuma, Number(process.env.LUMA_MAX || 2000)],
  ["City of Toronto", fetchToronto, Number(process.env.TORONTO_MAX || 10000)],
  ["Toronto Public Library", fetchTPL, Number(process.env.TPL_MAX || 3000)],
  ["Eventbrite", fetchEventbrite, Number(process.env.EVENTBRITE_MAX || 20000)],
  // Venues' own calendar feeds (import/ics-feeds.json; empty until a feed's format and terms are checked)
  ["Venue calendars", fetchICS, Number(process.env.ICS_MAX || 3000)],
  // Ontario's open data: off unless ONTARIO_EVENTS=1 (format not yet checked against the live file)
  ["Ontario open data", fetchOntario, Number(process.env.ONTARIO_MAX || 2000)],
];
const RUN = SOURCES.filter(([name]) => !process.env.ONLY || process.env.ONLY.toLowerCase().split(",").includes(name.toLowerCase()));
const NOT_IMPORTED = {
  "Resident Advisor": "ra.co answers automated visitors with a 403 and a captcha, its robots.txt disallows its API, and it blocks AI crawlers (including Anthropic's) from the whole site, so it isn't imported.",
  Partiful: "Partiful's robots.txt only admits search engines and link-preview bots, and its events are mostly private invites with no public Toronto listing, so it isn't imported.",
  blogTO: "blogTO's terms and robots.txt prohibit scraping and building datasets from its content, so it isn't imported.",
  "NOW Toronto": "nowtoronto.com turns automated visitors away (403) even though its robots.txt allows them, so it isn't imported.",
};
const SHRUNK = 0.5; // under half of last run's events counts as broken
const MIN_FOR_CHECK = 20; // sources this small vary too much week to week to judge

async function previousImport() {
  try {
    const stored = await store.get("events.json");
    if (stored) return stored;
  } catch (err) {
    log(`Couldn't read last import from Supabase Storage (${err.message}); using seed/events.json`);
  }
  return fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
}

(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + DAYS * 86400000);
  const inWindow = (e) => Date.parse(e.startsAt) >= start.getTime() && Date.parse(e.startsAt) <= end.getTime();
  log(`Importing GTA events from ${start.toDateString()} to ${end.toDateString()}`);

  const previous = await previousImport();
  const prevEvents = previous ? previous.events.filter((e) => inWindow(e) && !dropReason(e)) : [];
  const prevOf = (name) => prevEvents.filter((e) => e.source === name);
  const report = {};
  const dropped = {}; // why listings were left out ("beyond-toronto", "appointment") -> count
  const found = {}; // source -> events, put together in priority order below
  await Promise.all(
    RUN.map(async ([name, fn, max]) => {
      log(`${name}: starting`);
      let events = [];
      let note = null;
      let fetched = 0;
      try {
        const raw = await fn({ start, end, max, log, previous: prevEvents });
        if (Array.isArray(raw)) {
          fetched = raw.length;
          events = raw.map(toEvent).filter((e) => e && inWindow(e) && e.venue.lat > 43.35 && e.venue.lat < 44.15 && e.venue.lng > -80.1 && e.venue.lng < -78.8);
          // Outside Toronto, or an appointment rather than an event: counted, then left out
          for (const e of events) {
            const why = dropReason(e);
            if (why) dropped[why] = (dropped[why] || 0) + 1;
          }
          events = events.filter((e) => !dropReason(e));
        } else note = raw.skipped;
      } catch (err) {
        note = (err && err.message) || String(err);
        log(`${name} failed: ${note}`);
      }
      // A source that broke this week keeps last week's events rather than vanishing from the app
      const before = prevOf(name);
      const shrank = before.length >= MIN_FOR_CHECK && events.length < before.length * SHRUNK;
      if ((note || shrank) && before.length) {
        report[name] = { fetched, kept: before.length, note: `kept last run's ${before.length} events: ${note || `only ${events.length} this time`}` };
        found[name] = before;
      } else {
        report[name] = { fetched, kept: events.length, ...(note && { note }) };
        found[name] = events;
      }
      log(`${name}: done, ${fetched} fetched, ${report[name].kept} in-person GTA events kept${report[name].note ? ` (${report[name].note})` : ""}`);
    })
  );
  // MERGE=1: the sources not fetched this time keep their events from last time
  if (process.env.MERGE) for (const [name] of SOURCES) if (!found[name] && prevOf(name).length) {
    found[name] = prevOf(name);
    report[name] = { ...((previous.sources || {})[name] || {}), kept: found[name].length, note: "from last run" };
  }

  // The same event listed twice (on two sites, or twice on one) becomes one listing; on a tie, the earlier source wins
  // Last run's events (kept for a source that broke) go through today's filters too
  const all = SOURCES.flatMap(([name]) => found[name] || []).filter((e) => !dropReason(e));
  const deduped = dedupe(all).events;
  // Vibes, format and setting saved by the last hand-run `node import/tag.js` (never the AI here)
  const saved = tags.load();
  const events = deduped.map((e) => tags.apply(retag(e), saved)); // retag: last run's kept events get today's keyword rules
  if (!events.length) {
    log("\nNo events imported; leaving the last import as it was.");
    process.exit(1);
  }

  const file = { importedAt: new Date().toISOString(), window: { from: start.toISOString(), to: end.toISOString() }, sources: report, notImported: NOT_IMPORTED, events };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
  let where = "seed/events.json";
  let tableLine = null;
  if (process.env.UPLOAD) {
    await store.put("events.json", file);
    where += " and Supabase Storage";
    // The events table (sketch-2/supabase/schema.sql): only the events that changed are sent. The Storage file above
    // stays the fallback during the switch, so a missing table or a failed upsert never fails the import.
    try {
      const counts = await eventsTable.sync(file, { log });
      if (counts) {
        where += " and the events table";
        tableLine = `  Events table: ${counts.inserted} new, ${counts.updated} changed, ${counts.unchanged} unchanged, ${counts.removed} removed`;
      }
    } catch (err) {
      tableLine = err.missingTable ? "  Events table: not there yet; run sketch-2/supabase/schema.sql once in Supabase's SQL Editor (the Storage file was still uploaded)" : `  Events table: upsert failed (${err.message}); the Storage file was still uploaded`;
      log(tableLine.trim());
    }
  }
  const lines = [`Wrote ${events.length} events (${all.length - events.length} duplicates merged${previous ? `, ${events.length - prevEvents.length >= 0 ? "+" : ""}${events.length - prevEvents.length} since last run` : ""}) to ${where}`];
  if (tableLine) lines.push(tableLine);
  for (const [name] of SOURCES) if (report[name]) lines.push(`  ${name}: ${report[name].kept} kept${report[name].note ? ` (${report[name].note})` : ""}`);
  const missing = { price: events.filter((e) => e.price == null).length, image: events.filter((e) => !e.image).length, description: events.filter((e) => e.description === NA).length };
  lines.push(`  N/A counts: ${Object.entries(missing).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  lines.push(`  With a price: ${events.length - missing.price} of ${events.length} (${Math.round((100 * (events.length - missing.price)) / events.length)}%); no vibe: ${events.filter((e) => !e.vibes.length).length}`);
  if (Object.keys(dropped).length) lines.push(`  Left out: ${Object.entries(dropped).map(([k, n]) => `${n} ${k}`).join(", ")}`);
  const tagged = events.filter((e) => e.tagSource === "ai").length;
  lines.push(`  AI tags applied from import/event-tags.json: ${tagged}; untagged listings: ${events.length - tagged} (run \`node import/tag.js\` by hand to tag them)`);
  log(`\n${lines.join("\n")}`);
  // In GitHub Actions, the same summary shows on the run's page
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Event import\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  if (!process.env.UPLOAD) log("\nRestart `node server.js` to load them (or run with UPLOAD=1 to send them to Supabase).");
})();
