-- Sketch 2: run once in the same Supabase project as Sketch 1, after Sketch 1's supabase/schema.sql.
-- Sketch 2 keeps its own listings table and row 2 of app_state, and shares analytics_events
-- (queries: ../sketch-1/supabase/analytics-queries.sql).
create table if not exists sketch2_events (id bigint primary key, data jsonb not null);
alter table sketch2_events enable row level security;
