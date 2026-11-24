// Tag new listings with the AI, by hand (like import/instagram.js): 1 to 3 of the app's 21 vibes, plus a format and a
// setting, for listings it hasn't read yet (or that changed). Answers go to import/event-tags.json; commit that file
// and the next scheduled import applies them. The scheduled import itself never runs this.
//   node import/tag.js                 (from sketch-1/; Claude Code on your plan, so no API bill)
//   TAG_MAX=200 node import/tag.js     (tag at most 200 listings this run; default 120)
//   TAG_WITH_API=1 node import/tag.js  (use the paid API key in .env instead; only when you mean to)
//   DRY=1 node import/tag.js           (print what would be tagged and the first prompt; no AI call)

const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// Claude Code unless the API was asked for by name. In GitHub Actions this script refuses to run at all.
if (process.env.GITHUB_ACTIONS) {
  console.error("import/tag.js is a hand-run step; the scheduled import stays AI-off.");
  process.exit(1);
}
process.env.AI = process.env.TAG_WITH_API === "1" ? "" : "claude-code";

const tags = require("./tags");
const { mode, askJSON } = require("../lib/ai");
const store = require("../lib/store");

const MAX = Number(process.env.TAG_MAX || 120);
const BATCH = 30;
const OUT = path.join(__dirname, "..", "seed", "events.json");

(async () => {
  // The latest import: Supabase Storage when it's set up (that's where the scheduled run puts it), else the seed file
  let file = null;
  try {
    file = await store.get("events.json");
  } catch (err) {
    console.log(`Couldn't read the import from Supabase Storage (${err.message}); using seed/events.json`);
  }
  file = file || JSON.parse(fs.readFileSync(OUT, "utf8"));
  const now = Date.now();
  const saved = tags.load();
  const todo = file.events.filter((e) => Date.parse(e.startsAt) >= now && tags.needsTag(e, saved)).slice(0, MAX);
  console.log(`${todo.length} listings to tag (${Object.keys(saved.tags).length} already tagged). AI: ${mode()}`);
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
  console.log(`\nDone: ${done} listings tagged in import/event-tags.json. Commit it; the next scheduled import applies the tags.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
