// Launch analytics: one row per thing that happened (a tap, a screen, an AI call), for the
// questions in supabase/analytics-queries.sql. Goes to the Supabase table analytics_events when
// SUPABASE_URL and SUPABASE_SECRET_KEY are set, otherwise to data/analytics.jsonl.
// Rows hold ids and numbers only: never names, emails, chat or search text.

const fs = require("fs");
const path = require("path");

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const useSupabase = Boolean(SB_URL && SB_KEY);
const FILE = path.join(__dirname, "..", "data", "analytics.jsonl");
const MAX_QUEUE = 5000; // if Supabase is down for long, drop the oldest rows rather than run out of memory

let queue = [];
let timer = null;
let warned = false;

// track("accept_quest", { userId, eventId, crewSize: 2 })
function track(name, { userId, hostId, sessionId, eventId, ...props } = {}) {
  queue.push({
    time: new Date().toISOString(),
    name,
    user_id: userId || null,
    host_id: hostId || null,
    session_id: sessionId || null,
    event_id: eventId != null && eventId !== "" && Number.isInteger(Number(eventId)) ? Number(eventId) : null,
    props,
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  // Send in batches: within 2 seconds, or straight away once 50 rows are waiting
  if (queue.length >= 50) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}

let flushing = Promise.resolve();
function flush() {
  clearTimeout(timer);
  timer = null;
  const rows = queue;
  queue = [];
  if (!rows.length) return flushing;
  flushing = flushing.then(() => send(rows)).catch((err) => {
    queue = rows.concat(queue).slice(-MAX_QUEUE); // try again with the next batch
    if (!warned) console.error(`Analytics not saved (will retry): ${err.message}`);
    warned = true;
  });
  return flushing;
}

async function send(rows) {
  if (!useSupabase) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    return;
  }
  const headers = { apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
  if (SB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SB_KEY}`; // older service_role keys
  const res = await fetch(`${SB_URL}/rest/v1/analytics_events`, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  warned = false;
}

module.exports = { track, flush };
