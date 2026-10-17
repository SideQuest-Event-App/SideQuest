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
