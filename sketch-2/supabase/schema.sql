-- Sketch 2: run once in the same Supabase project as Sketch 1, after Sketch 1's supabase/schema.sql.
-- Sketch 2 keeps its own listings table and row 2 of app_state, and shares analytics_events
-- (queries: ../sketch-1/supabase/analytics-queries.sql).
create table if not exists sketch2_events (id bigint primary key, data jsonb not null);
alter table sketch2_events enable row level security;

-- Every finished account, one row each, to browse in the Table Editor. The accounts themselves live in app_state row 2
-- (data.users and data.hosts); this view only reads them. Only the dashboard and the server's secret key can see it.
create or replace view sketch2_accounts with (security_invoker = true) as
  select u.key as id, 'attendee' as role, u.value->>'email' as email, u.value->>'phone' as phone, u.value->>'handle' as username,
         u.value->>'name' as name, (u.value->>'createdAt')::timestamptz as created_at
    from app_state, jsonb_each(data->'users') u where app_state.id = 2
  union all
  select h.key, 'host', h.value->>'email', null, null, h.value->>'name', (h.value->>'createdAt')::timestamptz
    from app_state, jsonb_each(data->'hosts') h where app_state.id = 2;
revoke all on sketch2_accounts from anon, authenticated;
