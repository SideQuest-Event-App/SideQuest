// Tag listings with the AI without importing: vibes, format, setting, premise, qualities and keywords for listings it
// hasn't read yet (or that changed), saved to data/event-tags.json. `node run.js` already does this at the end of
// every import; this is for catching up (or retrying) on its own. Claude Code on your Claude plan only; no API key.
//   node tag.js                 (from events/; everything new)
//   TAG_MAX=200 node tag.js     (at most 200 listings this time)
//   DRY=1 node tag.js           (print how many and the first prompt; no AI call)
// The tags reach the app on the next `node run.js` (UPLOAD=1 to send it to Supabase).

const fs = require("fs");
require("./lib/paths").loadEnv();
if (process.env.GITHUB_ACTIONS) {
  console.error("tag.js only runs on your own computer.");
  process.exit(1);
}

const tags = require("./lib/tags");
const store = require("./lib/store");
const { tagNew, todoFor, unavailable, BATCH } = require("./lib/tagger");

const MAX = Number(process.env.TAG_MAX) || Infinity;

(async () => {
  // The latest import: Supabase Storage when it's set up, else data/events.json
  let file = null;
  try {
    file = await store.get("events.json");
  } catch (err) {
    console.log(`Couldn't read the import from Supabase Storage (${err.message}); using data/events.json`);
  }
  file = file || JSON.parse(fs.readFileSync(require("./lib/paths").EVENTS_FILE, "utf8"));
  const saved = tags.load();
  const todo = todoFor(file.events, saved, MAX);
  console.log(`${todo.length} listings to tag (one date per recurring night; ${Object.keys(saved.tags).length} already tagged).`);
  if (process.env.DRY) {
    if (todo.length) console.log(tags.prompt(todo.slice(0, BATCH)));
    return;
  }
  const r = await tagNew(file.events, { max: MAX, saved });
  if (r.skipped) return console.log(`Not tagged: ${r.skipped}.`);
  console.log(`\nDone: ${r.done} listings tagged in data/event-tags.json. The next \`node run.js\` applies them.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
