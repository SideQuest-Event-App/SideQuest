// The imported events as rows in a Supabase table (one row per event), next to the Storage file during the switch.
// The importer (run.js, UPLOAD=1) calls sync(); Sketch 2's server calls upcoming().
// The table is made by sketch-2/supabase/schema.sql ("listings": the name "events" is already Sketch 1's table).
// Talks to Supabase's REST API (PostgREST) with Node's built-in fetch, like lib/store.js. Needs SUPABASE_URL and
// SUPABASE_SECRET_KEY; without them every call does nothing. Error messages carry the status and Supabase's answer,
// never the key.
//
//   sync(file)   upserts the events that changed since the last run (Prefer: resolution=merge-duplicates, in
//                batches), deletes upcoming rows that are no longer in the import (cancelled, or gone from the
//                source), and records the run in event_imports. Returns counts for the log.
//   upcoming()   { importedAt, updatedAt, events } for events that haven't ended, or null when the table is
//                missing or empty (the caller then falls back to the Storage file, then the seed).

const crypto = require("crypto");

const TABLE = () => process.env.EVENTS_TABLE || "listings";
const RUNS = () => process.env.EVENT_IMPORTS_TABLE || "event_imports";
const BATCH = () => Number(process.env.EVENTS_BATCH || 500);
const PAGE = 1000;
const GRACE_MS = 3 * 3600 * 1000; // an event with no end time counts as upcoming until 3 hours after it starts

const configured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
function headers(extra = {}) {
  const key = process.env.SUPABASE_SECRET_KEY;
  return { apikey: key, ...(key.startsWith("eyJ") && { Authorization: `Bearer ${key}` }), "content-type": "application/json", ...extra };
}
// A short, key-free description of a failed answer
async function failure(res, what) {
  let text = "";
  try {
    text = (await res.text()).slice(0, 200);
  } catch {}
  const err = new Error(`Supabase ${what} ${res.status}: ${text}`);
  err.status = res.status;
  // PostgREST answers 404 / PGRST205 (or Postgres 42P01) when the table doesn't exist yet
  err.missingTable = res.status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(text);
  return err;
}
async function rest(route, { method = "GET", body, prefer, what = route.split("?")[0] } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${route}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw await failure(res, `${method} ${what}`);
  if (method !== "GET") return null;
  return res.json();
}
// Every row a GET matches, 1,000 at a time
async function all(route) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await rest(`${route}&limit=${PAGE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const iso = (s) => (s && !isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);
// One event (as lib/normalize.js makes it) -> one row. raw keeps the whole event, so the app gets back exactly
// what the Storage file would have given it; the columns are for filtering and for reading in the Table Editor.
// Half a character (a lone surrogate, from text cut mid-emoji anywhere upstream) makes PostgREST reject the whole
// batch as "invalid json"; every string is made whole before it's sent
const whole = (v) => (typeof v === "string" ? v.toWellFormed() : Array.isArray(v) ? v.map(whole) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, whole(x)])) : v);
function toRow(e) {
  e = whole(e);
  const venue = e.venue || {};
  const row = {
    source: e.source,
    source_id: String(e.sourceId != null ? e.sourceId : e.id),
    id: e.id,
    title: e.title || "",
    starts_at: iso(e.startsAt),
    ends_at: iso(e.endsAt),
    runs_until: iso(e.runsUntil),
    venue: venue.name || null,
    neighbourhood: e.neighbourhood || null,
    area: e.area || null,
    lat: num(venue.lat),
    lng: num(venue.lng),
    price: num(e.price),
    price_note: e.priceNote || null,
    vibes: Array.isArray(e.vibes) ? e.vibes : [],
    tags: Array.isArray(e.tags) ? e.tags : [],
    url: e.sourceUrl || e.url || null,
    image: e.image || null,
    raw: e,
  };
  row.content_hash = crypto.createHash("sha1").update(JSON.stringify(e)).digest("hex");
  return row;
}

// PostgREST's in.(...) list, every value double-quoted so commas and brackets in ids are safe
const inList = (values) => `in.(${values.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
const keyOf = (source, sourceId) => `${source}\u0000${sourceId}`;

async function sync(file, { log = console.log, now = new Date() } = {}) {
  if (!configured()) return null;
  const table = TABLE();
  const rows = file.events.filter((e) => e && e.source && e.startsAt).map(toRow);
  // What's there now, for upcoming rows only (past ones are never re-sent and are cleaned up by the nightly SQL)
  const since = new Date(now.getTime() - GRACE_MS).toISOString();
  const existing = await all(`${table}?select=source,source_id,content_hash&or=(starts_at.gte.${since},ends_at.gte.${since},runs_until.gte.${since})&order=source,source_id`);
  const have = new Map(existing.map((r) => [keyOf(r.source, r.source_id), r.content_hash]));
  const stamp = now.toISOString();
  const changed = rows.filter((r) => have.get(keyOf(r.source, r.source_id)) !== r.content_hash).map((r) => ({ ...r, updated_at: stamp }));

  // Upsert in batches: a new (source, source_id) is inserted, an existing one is overwritten with the new values
  let batches = 0;
  for (let i = 0; i < changed.length; i += BATCH()) {
    await rest(`${table}?on_conflict=source,source_id`, { method: "POST", body: changed.slice(i, i + BATCH()), prefer: "resolution=merge-duplicates,return=minimal", what: table });
    batches++;
  }

  // Upcoming rows the import no longer has: the import file is the whole truth for the window it covers
  const keep = new Set(rows.map((r) => keyOf(r.source, r.source_id)));
  const gone = {};
  for (const r of existing) if (!keep.has(keyOf(r.source, r.source_id))) (gone[r.source] = gone[r.source] || []).push(r.source_id);
  let removed = 0;
  for (const [source, ids] of Object.entries(gone)) {
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      await rest(`${table}?source=eq.${encodeURIComponent(source)}&source_id=${encodeURIComponent(inList(part))}`, { method: "DELETE", prefer: "return=minimal", what: table });
      removed += part.length;
    }
  }

  const counts = { total: rows.length, inserted: changed.filter((r) => !have.has(keyOf(r.source, r.source_id))).length, updated: 0, unchanged: rows.length - changed.length, removed, batches };
  counts.updated = changed.length - counts.inserted;
  // One row per run, so the server knows when the last import was (and the dashboard shows each run's numbers)
  try {
    await rest(RUNS(), { method: "POST", body: [{ imported_at: file.importedAt || stamp, total: counts.total, changed: changed.length, removed, sources: file.sources || {} }], prefer: "return=minimal", what: RUNS() });
  } catch (err) {
    log(`  events table: couldn't record the run in ${RUNS()} (${err.message})`);
  }
  log(`Events table "${table}": ${counts.total} events: ${counts.inserted} new, ${counts.updated} changed, ${counts.unchanged} unchanged, ${counts.removed} removed (${counts.batches} upsert batch${counts.batches === 1 ? "" : "es"} of up to ${BATCH()})`);
  return counts;
}

// When the last import ran (the newest event_imports row), or null: a cheap check before re-reading every row
async function latestImport() {
  if (!configured()) return null;
  const [run] = await rest(`${RUNS()}?select=imported_at&order=imported_at.desc&limit=1`);
  return run && run.imported_at ? new Date(run.imported_at).toISOString() : null;
}

// Events that haven't ended, straight from the table, with when the last import ran
async function upcoming({ now = new Date() } = {}) {
  if (!configured()) return null;
  const table = TABLE();
  const since = new Date(now.getTime() - GRACE_MS).toISOString();
  const rows = await all(`${table}?select=raw,updated_at&or=(starts_at.gte.${since},ends_at.gte.${now.toISOString()},runs_until.gte.${now.toISOString()})&order=starts_at,source,source_id`);
  if (!rows.length) return null;
  const updatedAt = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), "");
  let importedAt = null;
  try {
    importedAt = await latestImport();
  } catch {} // no event_imports table: the newest row's change is the next best clock
  return { importedAt: importedAt || updatedAt, updatedAt, events: rows.map((r) => r.raw) };
}

module.exports = { sync, upcoming, latestImport, toRow, configured, inList };
