// Read new Instagram posts by hand: downloads the recent posts of the accounts in
// sketch-2/reference/instagram-accounts.md, has the AI read the ones it hasn't yet, and saves the events they
// announce to import/instagram-events.json and Supabase Storage, where the scheduled import picks them up.
//   node import/instagram.js           (from sketch-1/; uses Claude Code, so it costs nothing beyond your plan)
//   IG_MAX_CALLS=80 node import/instagram.js     (allow more AI calls this run; default 40)
// It also updates the numbers in instagram-accounts.md. Run it once or twice a week, before Monday's import.

const fs = require("fs");
const path = require("path");

// Sketch 1's .env (Instagram and Supabase keys); the AI is Claude Code unless AI= says otherwise
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.AI = process.env.AI || "claude-code";

const { buildInstagram } = require("./sources/instagram");
const { mode } = require("../lib/ai");

const DAYS = Number(process.env.DAYS || 92);

(async () => {
  if (mode() !== "claude-code") console.log(`Note: the AI is "${mode()}", not Claude Code${mode() === "keywords" ? ", so no posts will be read (is `claude` installed?)" : ""}.`);
  const start = new Date();
  const end = new Date(start.getTime() + DAYS * 86400000);
  const file = await buildInstagram({ start, end, log: console.log });
  console.log(`\nDone: ${file.events.length} Instagram events from now to ${end.toDateString()}. The next scheduled import adds them.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
