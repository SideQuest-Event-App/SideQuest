// Read new Instagram posts by hand: downloads the recent posts of the accounts in
// events/config/instagram-accounts.md, has the AI read the ones it hasn't yet, and saves the events they
// announce to data/instagram-events.json and Supabase Storage, where the next `node run.js` picks them up.
//   node instagram.js           (from events/; uses Claude Code, so it costs nothing beyond your plan)
//   IG_MAX_CALLS=80 node instagram.js     (allow more AI calls this run; default 40)
// It also updates the numbers in instagram-accounts.md. Run it once or twice a week, before Monday's import.

const fs = require("fs");
const path = require("path");

require("./lib/paths").loadEnv();
process.env.AI = process.env.AI || "claude-code";

const { buildInstagram } = require("./sources/instagram");
const { mode } = require("./lib/ai");

const DAYS = Number(process.env.DAYS || 92);

(async () => {
  if (mode() !== "claude-code") console.log(`Note: the AI is "${mode()}", not Claude Code${mode() === "keywords" ? ", so no posts will be read (is `claude` installed?)" : ""}.`);
  const start = new Date();
  const end = new Date(start.getTime() + DAYS * 86400000);
  const file = await buildInstagram({ start, end, log: console.log });
  console.log(`\nDone: ${file.events.length} Instagram events from now to ${end.toDateString()}. The next `node run.js` adds them.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
