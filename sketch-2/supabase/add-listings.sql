-- SideQuest: add the events tables (listings, event_imports). Safe to run on the existing project:
-- it only creates things that don't exist yet and never deletes or changes existing tables or data.
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Running it again is harmless.

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
