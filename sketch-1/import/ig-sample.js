// Accuracy check for the Instagram import: picks 20 random events from the last by-hand run and adds them to
// sketch-2/reference/instagram-accuracy.md, each with a link to its post. Open each post, mark the row right or
// wrong, then fill in the score line. Run it after `node import/instagram.js`, and again whenever the reader changes.
//   node import/ig-sample.js          (from sketch-1/)
//   SAMPLE=30 node import/ig-sample.js

const fs = require("fs");
const path = require("path");

const EVENTS = path.join(__dirname, "instagram-events.json");
const LOG = path.join(__dirname, "..", "..", "sketch-2", "reference", "instagram-accuracy.md");
const N = Number(process.env.SAMPLE || 20);

if (!fs.existsSync(EVENTS)) {
  console.error("No import/instagram-events.json yet. Run `node import/instagram.js` first.");
  process.exit(1);
}
const file = JSON.parse(fs.readFileSync(EVENTS, "utf8"));
const events = [...file.events];
for (let i = events.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [events[i], events[j]] = [events[j], events[i]];
}
const sample = events.slice(0, N);
const when = (iso) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const rows = sample.map((e) => `| ${cell(e.title)} | ${cell(when(e.startsAt))} | ${cell(e.venue && e.venue.name)} | ${e.price == null ? "" : e.price === 0 ? "Free" : `$${e.price}`} | [Post](${e.url}) | |`);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const section = `
## ${today}

From the by-hand run of ${file.builtAt.slice(0, 10)}: ${sample.length} of ${file.events.length} events.

Score: __ of ${sample.length} right. Notes:

| Event | When | Venue | Price | Post | Right? |
|---|---|---|---|---|---|
${rows.join("\n")}
`;

if (!fs.existsSync(LOG)) {
  fs.writeFileSync(LOG, `# Instagram accuracy checks

Each check is a random sample of events from one by-hand run of \`node import/instagram.js\`, made with \`node import/ig-sample.js\`. Open each post and mark the row: right if the title, date, time, venue and price all match the post; otherwise wrong, with what was off. Then fill in the score.

Run a check after the first run, and again whenever the reader or its prompt changes, so the scores can be compared.
`);
}
fs.appendFileSync(LOG, section);
console.log(`Added ${sample.length} events to sketch-2/reference/instagram-accuracy.md. Open each post, mark Right?, then fill in the score.`);
