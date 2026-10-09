// Sketch 1 database, started from the files in seed/. Zero dependencies.
// With SUPABASE_URL and SUPABASE_SECRET_KEY in .env it lives in Supabase (through its REST API and
// Node's built-in fetch), so it survives deploys; without them it's one JSON file, data/db.json.
// Every change is written back, so the server can restart without losing anything. "Reset data" starts over.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const readSeed = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "seed", name), "utf8"));
// seed/events.json is written by `node import/run.js`: real listings plus when they were imported
function seedEvents() {
  const file = readSeed("events.json");
  return Array.isArray(file) ? { importedAt: "sample", events: file } : file;
}

// Sample friends you can add to a party (not real people), with the taste profile Crew Blend reads.
const FRIENDS = {
  Aiko: { vibes: ["Live music", "Jazz", "Film nights", "Records & vinyl"], origin: "union", budget: 20 },
  Priya: { vibes: ["Climbing", "Run & ride", "Art & making"], origin: "kipling", budget: 40 },
  Sam: { vibes: ["Comedy", "Games & social", "Climbing"], origin: "finch", budget: 10 },
  Leila: { vibes: ["Zines & print", "Art & making", "Writing & poetry"], origin: "union", budget: 20 },
  Zoe: { vibes: ["Dance", "Indie gigs", "Live music"], origin: "kennedy", budget: 20 },
  Ben: { vibes: ["Outdoors", "Photography", "Run & ride"], origin: "finch", budget: 0 },
};

function seed() {
  const { importedAt, events } = seedEvents();
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    eventsImportedAt: importedAt,
    users: {}, // attendees, keyed by id
    hosts: {}, // host accounts, keyed by id
    parties: {}, // one party per attendee for now
    events, // real imported listings plus anything hosts publish
    requests: readSeed("requests.json"), // Quest Requests
    hostMessages: [], // announcements and live updates
    eventChat: {}, // eventId -> attendee group chat
    checkins: {}, // eventId -> names checked in at the door
    logs: {
      searches: [], // every Discover search, with interests nothing matched (Demand Signals)
      going: [], // "Accept quest" taps: intent, not attendance
      attended: [], // "Did you go?" answers and ratings: what the north star counts
      feedback: [], // "Not for me" taps
    },
  };
}

// ---------- Supabase over REST ----------
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const useSupabase = Boolean(SB_URL && SB_KEY);

async function sb(route, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, "Content-Type": "application/json" };
  if (SB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SB_KEY}`; // older service_role keys
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${route}`, { method, headers, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return method === "GET" ? res.json() : null;
}
const upsert = (table, rows) => sb(table, { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });

let data = null;
let replaceEvents = false; // set after a reset or a fresh import, so old listings get deleted
const savedEvents = new Map(); // event id -> the JSON last written, so only changed events are re-sent

async function load() {
  if (useSupabase) {
    const [row] = await sb("app_state?id=eq.1&select=data");
    if (row) {
      const events = [];
      for (let from = 0; ; from += 1000) {
        const page = await sb(`events?select=data&order=id&limit=1000&offset=${from}`);
        events.push(...page.map((r) => r.data));
        if (page.length < 1000) break;
      }
      data = { ...row.data, events };
      for (const e of events) savedEvents.set(e.id, JSON.stringify(e));
    }
  } else {
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {}
  }
  if (!data) {
    data = seed();
    replaceEvents = true;
    await write();
    return data;
  }
  // A fresh import replaces the listings but keeps accounts, logs, requests and host-published quests
  const fresh = seedEvents();
  if (data.eventsImportedAt !== fresh.importedAt) {
    data.events = [...fresh.events, ...data.events.filter((e) => e.publishedBy)];
    data.eventsImportedAt = fresh.importedAt;
    replaceEvents = true;
    await write();
  }
  return data;
}

async function write() {
  if (!useSupabase) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, DB_PATH); // atomic, so a crash never leaves half a file
    return;
  }
  const { events, ...rest } = data;
  await upsert("app_state", [{ id: 1, data: rest, updated_at: new Date().toISOString() }]);
  if (replaceEvents) {
    replaceEvents = false;
    savedEvents.clear();
    await sb("events?id=gte.0", { method: "DELETE" });
  }
  const changed = [];
  for (const e of events) {
    const json = JSON.stringify(e);
    if (savedEvents.get(e.id) !== json) changed.push([e, json]);
  }
  for (let i = 0; i < changed.length; i += 500) {
    const batch = changed.slice(i, i + 500);
    await upsert("events", batch.map(([e]) => ({ id: e.id, data: e })));
    for (const [e, json] of batch) savedEvents.set(e.id, json);
  }
}

// Writes happen in the background, one at a time, batching changes made within half a second
let timer = null;
let writing = Promise.resolve();
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    writing = writing.then(write).catch((err) => console.error("Save failed:", err.message));
  }, 500);
}

function reset() {
  data = seed();
  replaceEvents = true;
  save();
  return data;
}

module.exports = {
  get data() {
    return data;
  },
  load,
  save,
  reset,
  FRIENDS,
};
