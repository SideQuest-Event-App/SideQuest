// Sketch 1 database, started from the files in seed/. Zero dependencies.
// With SUPABASE_URL and SUPABASE_SECRET_KEY in .env it lives in Supabase (through its REST API and
// Node's built-in fetch), so it survives deploys; without them it's one JSON file, data/db.json.
// Every change is written back, so the server can restart without losing anything. "Reset data" starts over.

const fs = require("fs");
const path = require("path");
const { dedupe } = require("../../sketch-1/import/dedupe");
const store = require("../../sketch-1/lib/store");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
// Sketch 2 shares Sketch 1's imported listings (read-only), so one import feeds both
const readSeed = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "..", "sketch-1", "seed", name), "utf8"));
// The import (sketch-1/import/run.js): real listings plus when they were imported. The weekly scheduled import
// puts it in Supabase Storage; without Supabase (or before the first one) it's sketch-1/seed/events.json.
async function seedEvents() {
  try {
    const stored = await store.get("events.json");
    if (stored) return stored;
  } catch (err) {
    console.warn(`Couldn't read the import from Supabase Storage (${err.message}); using sketch-1/seed/events.json`);
  }
  const file = readSeed("events.json");
  return Array.isArray(file) ? { importedAt: "sample", events: file } : file;
}

// Sample friends you can add to a party (not real people), with the taste profile Crew Blend reads.
const FRIENDS = {
  Maya: { full: "Maya Chen", handle: "@maya.eats", vibes: ["Food & drink", "Live music", "Markets", "Jazz"], origin: "union", budget: 20 },
  Kai: { full: "Kai Okafor", handle: "@kaiokafor", vibes: ["Dance", "Electronic", "Indie gigs"], origin: "union", budget: 30 },
  Leila: { full: "Leila Haddad", handle: "@leila.h", vibes: ["Zines & print", "Art & making", "Writing & poetry"], origin: "union", budget: 20 },
  Sam: { full: "Sam Ito", handle: "@samito", vibes: ["Comedy", "Games & social", "Climbing"], origin: "finch", budget: 10 },
  Priya: { full: "Priya Nair", handle: "@priya.n", vibes: ["Climbing", "Run & ride", "Art & making"], origin: "kipling", budget: 40 },
};

function seed({ importedAt, events }) {
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
      views: [], // quest detail opens, for the host's views-to-door funnel
      votes: [], // request asks and upvotes, for "+N this week"
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
// Accounts get a row each in sketch2_accounts (once schema.sql has made that table), so the Table Editor shows them
// and a server only ever writes the accounts it changed: two servers on the same Supabase can't erase each other's sign-ups
let accountsTable = false;
let replaceAccounts = false; // set after a reset
const savedAccounts = new Map(); // account id -> the JSON last written
const accountRow = (a, role) => ({ id: a.id, role, email: a.email || null, username: a.handle || null, name: a.name || null, phone: a.phone || null, created_at: a.createdAt || null, data: a });
async function all(route) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await sb(`${route}&limit=1000&offset=${from}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function load() {
  if (useSupabase) {
    const [row] = await sb("app_state?id=eq.2&select=data");
    const accounts = { users: {}, hosts: {} };
    try {
      for (const r of await all("sketch2_accounts?select=id,role,data&order=id")) {
        accounts[r.role === "host" ? "hosts" : "users"][r.id] = r.data;
        savedAccounts.set(r.id, JSON.stringify(r.data));
      }
      accountsTable = true;
    } catch (err) {
      console.warn("No sketch2_accounts table yet, so accounts stay inside app_state. Run supabase/schema.sql to add it.", err.message);
    }
    if (row) {
      const events = (await all("sketch2_events?select=data&order=id")).map((r) => r.data);
      // Accounts from before the table existed are still in app_state; they move to the table on the next write
      data = { ...row.data, users: { ...row.data.users, ...accounts.users }, hosts: { ...row.data.hosts, ...accounts.hosts }, events };
      for (const e of events) savedEvents.set(e.id, JSON.stringify(e));
    }
  } else {
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {}
  }
  const fresh = await seedEvents();
  if (!data) {
    data = seed(fresh);
    replaceEvents = true;
    await write();
    return data;
  }
  await takeImport(fresh);
  return data;
}

// Accounts are read once at startup, so one made on another server (Render, or a teammate's computer) since then isn't
// in memory yet. Log in and sign up call this on a miss to pull that email's accounts in from sketch2_accounts.
async function fetchAccount(email) {
  if (!useSupabase || !accountsTable || !email) return;
  const rows = await sb(`sketch2_accounts?select=id,role,data&email=ilike.${encodeURIComponent(email.trim())}`);
  for (const r of rows) {
    const list = r.role === "host" ? data.hosts : data.users;
    if (list[r.id]) continue; // this server's copy is the one it's been changing
    list[r.id] = r.data;
    savedAccounts.set(r.id, JSON.stringify(r.data));
  }
}

// A fresh import replaces the listings but keeps accounts, logs, requests, the quests hosts published or claimed,
// and the events attendees added; where one of those is also in the import, it's kept as one listing
async function takeImport(fresh) {
  if (!fresh || data.eventsImportedAt === fresh.importedAt) return false;
  data.events = dedupe([...data.events.filter((e) => e.publishedBy || e.submittedBy || e.importedBy), ...fresh.events]).events;
  data.eventsImportedAt = fresh.importedAt;
  replaceEvents = true;
  await write();
  return true;
}
// The server calls this every few hours, so a new weekly import shows up without a restart
async function checkImport() {
  if (!data || !store.configured()) return false;
  return takeImport(await seedEvents());
}

// Accounts still in onboarding live in memory only: nothing about people who give up partway is stored
function finished() {
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x.registered !== false));
  const users = keep(data.users);
  return { ...data, users, hosts: keep(data.hosts), parties: Object.fromEntries(Object.entries(data.parties).filter(([id]) => users[id])) };
}

async function write() {
  if (!useSupabase) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(finished()));
    fs.renameSync(tmp, DB_PATH); // atomic, so a crash never leaves half a file
    return;
  }
  const { events, users, hosts, ...rest } = finished();
  if (accountsTable) {
    if (replaceAccounts) {
      replaceAccounts = false;
      savedAccounts.clear();
      await sb("sketch2_accounts?id=not.is.null", { method: "DELETE" });
    }
    const changed = [...Object.values(users).map((a) => accountRow(a, "attendee")), ...Object.values(hosts).map((a) => accountRow(a, "host"))]
      .map((r) => [r, JSON.stringify(r.data)]).filter(([r, json]) => savedAccounts.get(r.id) !== json);
    if (changed.length) await upsert("sketch2_accounts", changed.map(([r]) => r));
    for (const [r, json] of changed) savedAccounts.set(r.id, json);
  }
  await upsert("app_state", [{ id: 2, data: accountsTable ? rest : { ...rest, users, hosts }, updated_at: new Date().toISOString() }]);
  if (replaceEvents) {
    replaceEvents = false;
    savedEvents.clear();
    await sb("sketch2_events?id=gte.0", { method: "DELETE" });
  }
  const changed = [];
  for (const e of events) {
    const json = JSON.stringify(e);
    if (savedEvents.get(e.id) !== json) changed.push([e, json]);
  }
  for (let i = 0; i < changed.length; i += 500) {
    const batch = changed.slice(i, i + 500);
    await upsert("sketch2_events", batch.map(([e]) => ({ id: e.id, data: e })));
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

// Write now and wait for it; throws if the write fails
function saveNow() {
  clearTimeout(timer);
  const done = writing.then(write);
  writing = done.catch((err) => console.error("Save failed:", err.message));
  return done;
}

async function reset() {
  data = seed(await seedEvents());
  replaceEvents = true;
  replaceAccounts = true;
  save();
  return data;
}

module.exports = {
  get data() {
    return data;
  },
  load,
  checkImport,
  save,
  saveNow,
  reset,
  fetchAccount,
  FRIENDS,
};
