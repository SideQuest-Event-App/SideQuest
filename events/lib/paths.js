// Where the importer keeps things, and its .env loader. Every script and source gets its paths from here.
//   events/config/  what to read: venue calendars, Instagram accounts, Meetup groups, ICS feeds (edit these by hand)
//   events/data/    what the importer writes: events.json (the import), event-tags.json (AI tags), series.json,
//                   the geocode cache, Instagram downloads, the page cache (data/.cache, git-ignored)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const config = (name) => path.join(ROOT, "config", name);
const data = (name) => path.join(ROOT, "data", name);

// Keys come from events/.env, else the apps' .env files (the scheduled run gets them from GitHub's secrets).
// Only unset variables are filled: a test that blanks a key ("") keeps it blank.
function loadEnv() {
  for (const p of [path.join(ROOT, ".env"), path.join(ROOT, "..", "sketch-2", ".env"), path.join(ROOT, "..", "sketch-1", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// EVENTS_FILE: a test or a preview can point the apps at another import file
module.exports = { ROOT, config, data, loadEnv, EVENTS_FILE: process.env.EVENTS_FILE || data("events.json") };
