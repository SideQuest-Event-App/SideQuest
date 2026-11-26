// Tag new listings with the AI, by hand (like instagram.js): 1 to 3 of the app's 21 vibes, plus a format and a
// setting, for listings it hasn't read yet (or that changed). Answers go to data/event-tags.json; commit that file
// and the next scheduled import applies them. The scheduled import itself never runs this.
//   node tag.js                 (from events/; Claude Code on your plan, so no API bill)
//   TAG_MAX=200 node tag.js     (tag at most 200 listings this run; default 120)
//   TAG_WITH_API=1 node tag.js  (use the paid API key in .env instead; only when you mean to)
//   DRY=1 node tag.js           (print what would be tagged and the first prompt; no AI call)

const fs = require("fs");
const path = require("path");

require("./lib/paths").loadEnv();
// Claude Code unless the API was asked for by name. In GitHub Actions this script refuses to run at all.
if (process.env.GITHUB_ACTIONS) {
  console.error("tag.js is a hand-run step; the scheduled import stays AI-off.");
  process.exit(1);
}
process.env.AI = process.env.TAG_WITH_API === "1" ? "api" : "claude-code";

const tags = require("./lib/tags");
const { mode, askJSON } = require("./lib/ai");
const store = require("./lib/store");

const MAX = Number(process.env.TAG_MAX || 120);
const BATCH = 30;
const OUT = require("./lib/paths").EVENTS_FILE;

(async () => {
  // The latest import: Supabase Storage when it's set up (that's where the scheduled run puts it), else the seed file
  let file = null;
  try {
    file = await store.get("events.json");
  } catch (err) {
    console.log(`Couldn't read the import from Supabase Storage (${err.message}); using data/events.json`);
  }
  file = file || JSON.parse(fs.readFileSync(OUT, "utf8"));
  const now = Date.now();
  const saved = tags.load();
  // One date per recurring night (lib/series.js shares its tags with the other dates on the next import), the one
  // that says the most; dates already given a sibling's tags are skipped
  const { unlend } = require("./lib/series");
  const tagged = new Set(file.events.filter((e) => e.series && saved.tags[e.id]).map((e) => e.series.id));
  const pool = file.events.map(unlend).map((e, i) => ({ ...e, series: file.events[i].series }))
    .filter((e) => Date.parse(e.startsAt) >= now && tags.needsTag(e, saved) && !(e.series && tagged.has(e.series.id)))
    .sort((a, b) => `${b.description || ""}${b.details || ""}`.length - `${a.description || ""}${a.details || ""}`.length);
  const seen = new Set();
  const todo = pool.filter((e) => !e.series || (!seen.has(e.series.id) && seen.add(e.series.id))).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, MAX);
  console.log(`${todo.length} listings to tag (one date per recurring night) (${Object.keys(saved.tags).length} already tagged). AI: ${mode()}`);
  if (process.env.DRY) {
    if (todo.length) console.log(tags.prompt(todo.slice(0, BATCH)));
    return;
  }
  if (mode() === "keywords") {
    console.log("No AI available (is `claude` installed?). Nothing tagged; keyword vibes stay in place.");
    return;
  }
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      done += tags.record(saved, batch, await askJSON(tags.prompt(batch), 4000));
      tags.save(saved); // after every batch, so stopping halfway keeps what's done
      console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length} read, ${done} tagged`);
    } catch (err) {
      console.error(`  batch ${i / BATCH + 1}: ${err.message}`);
    }
  }
  console.log(`\nDone: ${done} listings tagged in data/event-tags.json. Commit it; the next scheduled import applies the tags.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
