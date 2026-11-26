// The AI tagger: reads listings it hasn't read yet (or that changed) and saves its vibes, format, setting, premise,
// qualities and keywords to data/event-tags.json (lib/tags.js applies them). It runs at the end of every
// `node run.js` on your Mac, and on its own with `node tag.js`. Claude Code only (lib/ai.js): your Claude plan, never
// an API key. Never on GitHub's servers.
//
// One date per recurring night is read (lib/series.js shares its tags with the other dates), the date that says the
// most. Answers are saved after every batch of 30, so stopping halfway keeps what's done.

const tags = require("./tags");
const { mode, askJSON } = require("./ai");
const { unlend } = require("./series");

const BATCH = 30;

// The listings to read, soonest first
function todoFor(events, saved, max = Infinity, now = Date.now()) {
  const tagged = new Set(events.filter((e) => e.series && saved.tags[e.id]).map((e) => e.series.id));
  const pool = events.map((e) => ({ ...unlend(e), series: e.series }))
    .filter((e) => Date.parse(e.startsAt) >= now && tags.needsTag(e, saved) && !(e.series && tagged.has(e.series.id)))
    .sort((a, b) => `${b.description || ""}${b.details || ""}`.length - `${a.description || ""}${a.details || ""}`.length);
  const seen = new Set();
  return pool.filter((e) => !e.series || (!seen.has(e.series.id) && seen.add(e.series.id)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, max);
}

// Why it can't run here, or null when it can
function unavailable() {
  if (process.env.GITHUB_ACTIONS) return "the AI tagger only runs on your own computer";
  if (process.env.TAG === "0") return "TAG=0";
  if (mode() === "keywords") return process.env.AI === "off" ? "AI=off" : "Claude Code isn't installed or signed in (`claude` on your PATH)";
  return null;
}

// Tag what's new. Returns { asked, done, skipped }.
async function tagNew(events, { max = Infinity, log = console.log, saved = tags.load() } = {}) {
  const todo = todoFor(events, saved, max);
  const why = unavailable();
  if (why) return { asked: todo.length, done: 0, skipped: why };
  if (!todo.length) return { asked: 0, done: 0 };
  log(`AI tagger: ${todo.length} listings to read (one date per recurring night), with Claude Code on your plan`);
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      done += tags.record(saved, batch, await askJSON(tags.prompt(batch), 4000));
      tags.save(saved);
      log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length} read, ${done} tagged`);
    } catch (err) {
      log(`  batch ${i / BATCH + 1}: ${err.message}`);
      // A plan's usage limit (or Claude Code signed out) won't fix itself within this run
      if (/limit|quota|rate|log ?in|auth/i.test(err.message)) { log("  stopping here; the next run picks up where this left off"); break; }
    }
  }
  return { asked: todo.length, done };
}

module.exports = { tagNew, todoFor, unavailable, BATCH };
