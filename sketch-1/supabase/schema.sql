-- Run once in your Supabase project's SQL Editor before starting the server with Supabase keys.
create table if not exists events (id bigint primary key, data jsonb not null);
create table if not exists app_state (id int primary key default 1, data jsonb not null, updated_at timestamptz default now());
-- Only server.js (with the secret key) reads and writes; nobody else can
alter table events enable row level security;
alter table app_state enable row level security;

-- Launch analytics (lib/analytics.js): one row per tap, screen view or AI call.
-- Ids and numbers only: no names, emails, chat or search text. Queries: supabase/analytics-queries.sql
create table if not exists analytics_events (
  id bigserial primary key,
  time timestamptz not null default now(),
  name text not null,          -- an app action ('accept', 'rate', 'publish'...), 'screen_view', 'ai_feed'...
  user_id text,
  host_id text,
  session_id text,             -- one browser tab's visit
  event_id bigint,             -- the quest it was about, if any (join to events.id)
  props jsonb not null default '{}'
);
create index if not exists analytics_events_name_time on analytics_events (name, time);
create index if not exists analytics_events_user_time on analytics_events (user_id, time);
alter table analytics_events enable row level security;
