-- Sketch 2: run once in the same Supabase project as Sketch 1, after Sketch 1's supabase/schema.sql.
-- Sketch 2 keeps its own listings table and row 2 of app_state, and shares analytics_events
-- (queries: ../sketch-1/supabase/analytics-queries.sql).
create table if not exists sketch2_events (id bigint primary key, data jsonb not null);
alter table sketch2_events enable row level security;

-- Every finished account (attendees and hosts), one row each. The server writes a row when onboarding is done or a host
-- is approved, and again whenever that account changes; data holds the whole profile. Only the server's secret key and
-- the dashboard can read it (row level security is on, with no policies).
drop view if exists sketch2_accounts;
create table if not exists sketch2_accounts (
  id text primary key,
  role text not null,          -- attendee or host
  email text,
  username text,
  name text,
  phone text,
  created_at timestamptz,
  data jsonb not null
);
alter table sketch2_accounts enable row level security;

-- ---------------------------------------------------------------------------------------------------------------------
-- Imported events as real rows (added Nov 2026). Safe to run again: every statement checks before it creates.
-- The scheduled importer (sketch-1/import/run.js with UPLOAD=1) upserts one row per event; the server reads the
-- upcoming ones (starts_at after now) and falls back to the Storage file, then the seed, when this table is missing
-- or empty. The table is called "listings" because Sketch 1 already has a table called "events" (id, data), and
-- "create table if not exists events" would silently keep that one. sketch2_events is left exactly as it was.
create table if not exists listings (
  source text not null,              -- 'Ticketmaster', 'City of Toronto', 'Instagram', ...
  source_id text not null,           -- the listing's id at its source (or the app's stable id for it)
  id bigint not null,                -- the app's id for the event (the same one sketch2_events and Quest Logs use)
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  runs_until timestamptz,            -- installations and exhibits that run for weeks
  venue text,
  neighbourhood text,
  area text,
  lat double precision,
  lng double precision,
  price numeric,                     -- lowest price in CAD; null when the listing doesn't say
  price_note text,
  vibes text[] not null default '{}',
  tags text[] not null default '{}',
  url text,
  image text,
  raw jsonb not null,                -- the whole event, as the app uses it
  content_hash text,                 -- lets the importer re-send only events that changed
  updated_at timestamptz not null default now(),
  primary key (source, source_id)
);
create index if not exists listings_starts_at on listings (starts_at);
create index if not exists listings_id on listings (id);
alter table listings enable row level security;  -- server-only, like every other table here (no policies)

-- One row per import run: when it ran and how many events changed. The server reads the newest imported_at.
create table if not exists event_imports (
  id bigserial primary key,
  imported_at timestamptz not null default now(),
  total int,
  changed int,
  removed int,
  sources jsonb not null default '{}'
);
create index if not exists event_imports_imported_at on event_imports (imported_at desc);
alter table event_imports enable row level security;

-- Nightly cleanup of past events: see supabase/cleanup-past-events.sql (written, not switched on).
