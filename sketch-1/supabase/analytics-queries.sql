-- Sidequest launch analytics. Paste one query at a time into Supabase's SQL Editor (Save it there
-- to reuse it). Run the "analytics" view first: every query below reads from it.
--
-- What's recorded (lib/analytics.js, from server.js and public/js/app.js):
--   app actions:  name = the action ('signup', 'setProfile', 'accept', 'attended', 'rate', 'notForMe',
--                 'postRequest', 'upvote', 'claim', 'publish', 'hostMessage', ...), with ids, choices and counts
--   screen_view:  every screen reached, props.screen and props.from (the screen before it)
--   ai_feed, ai_search, ai_blend, ai_draft:  props.ms, props.mode (api / claude-code / keywords),
--                 props.fresh (false = a cached result), props.results, props.unmet
--   server_start: each time the server starts

-- ============================================================================================
-- 0. The view the queries use: real use only (no demo shortcuts, no failed taps).
--    security_invoker keeps it private like the table (only the secret key can read it).
create or replace view analytics with (security_invoker = true) as
select * from analytics_events
where coalesce(props->>'demo', 'false') <> 'true'
  and coalesce(props->>'ok', 'true') = 'true';

-- ============================================================================================
-- 1. NORTH STAR: confirmed attendance and satisfaction, by week
select date_trunc('week', time)::date as week,
  count(*) filter (where name = 'attended' and props->>'attended' = 'true') as confirmed_attended,
  count(*) filter (where name = 'attended' and props->>'attended' = 'false') as said_didnt_go,
  count(*) filter (where name = 'rate') as ratings,
  round(avg((props->>'stars')::numeric) filter (where name = 'rate'), 2) as avg_stars
from analytics
group by 1 order by 1 desc;

-- 2. Intent vs. attendance: of the quests accepted each week, how many people confirmed going
with accepted as (
  select distinct on (user_id, event_id) user_id, event_id, time
  from analytics where name in ('accept', 'lockPoll') and event_id is not null
  order by user_id, event_id, time
),
went as (
  select distinct user_id, event_id from analytics
  where name = 'attended' and props->>'attended' = 'true'
)
select date_trunc('week', a.time)::date as week,
  count(*) as accepted,
  count(w.user_id) as confirmed_attended,
  round(100.0 * count(w.user_id) / nullif(count(*), 0), 1) as pct_attended
from accepted a left join went w using (user_id, event_id)
group by 1 order by 1 desc;

-- 3. What people liked: rating tags
select tag, count(*) as times, round(avg((props->>'stars')::numeric), 2) as avg_stars_when_tagged
from analytics, jsonb_array_elements_text(props->'tags') as tag
where name = 'rate'
group by 1 order by 2 desc;

-- ============================================================================================
-- 4. FUNNEL: people reaching each step (all time; add "and time > now() - interval '30 days'" to narrow)
select step, people from (
  select 1 as n, 'Signed up' as step, count(distinct user_id) as people from analytics where name in ('signup', 'demoLogin')
  union all select 2, 'Finished onboarding', count(distinct user_id) from analytics where name = 'setProfile' and props->>'registered' = 'true'
  union all select 3, 'Saw For You', count(distinct user_id) from analytics where name = 'screen_view' and props->>'screen' = 'discover'
  union all select 4, 'Opened a quest', count(distinct user_id) from analytics where name = 'screen_view' and props->>'screen' = 'quest'
  union all select 5, 'Accepted a quest', count(distinct user_id) from analytics where name in ('accept', 'lockPoll')
  union all select 6, 'Confirmed they went', count(distinct user_id) from analytics where name = 'attended' and props->>'attended' = 'true'
  union all select 7, 'Rated it', count(distinct user_id) from analytics where name = 'rate'
) f order by n;

-- ============================================================================================
-- 5. RETENTION: weekly active questers (accepted, went, or rated something that week)
select date_trunc('week', time)::date as week, count(distinct user_id) as active_questers
from analytics
where name in ('accept', 'lockPoll', 'attended', 'rate')
group by 1 order by 1 desc;

-- 6. Retention by signup week: of the people who signed up that week, how many came back
--    (opened the app in a later session) 1, 2, 3 and 4 weeks later
with cohort as (
  select user_id, min(time) as joined from analytics
  where name = 'signup' and user_id is not null group by 1
),
active as (
  select distinct c.user_id, date_trunc('week', c.joined) as cohort_week,
    floor(extract(epoch from (a.time - c.joined)) / 604800)::int as weeks_later
  from cohort c join analytics a using (user_id)
  where a.name = 'screen_view' and a.time > c.joined
)
select cohort_week::date,
  (select count(*) from cohort where date_trunc('week', joined) = active.cohort_week) as signed_up,
  count(distinct user_id) filter (where weeks_later = 1) as week_1,
  count(distinct user_id) filter (where weeks_later = 2) as week_2,
  count(distinct user_id) filter (where weeks_later = 3) as week_3,
  count(distinct user_id) filter (where weeks_later = 4) as week_4
from active group by cohort_week order by cohort_week desc;

-- 7. Repeat attendance: how many people have confirmed going to 1, 2, 3+ quests
select case when n >= 3 then '3+' else n::text end as quests_attended, count(*) as people
from (select user_id, count(distinct event_id) as n from analytics
      where name = 'attended' and props->>'attended' = 'true' group by 1) t
group by 1 order by 1;

-- ============================================================================================
-- 8. RECOMMENDATIONS: where opened quests came from, and how often an open led to an accept
--    (props.from = 'discover' is the For You feed, 'search' is search results, 'party' is Crew Blend)
with opens as (
  select user_id, event_id, props->>'from' as source, time from analytics
  where name = 'screen_view' and props->>'screen' = 'quest' and event_id is not null
),
accepts as (
  select user_id, event_id, min(time) as time from analytics
  where name in ('accept', 'lockPoll') group by 1, 2
)
select coalesce(o.source, 'direct') as opened_from,
  count(*) as opens,
  count(a.user_id) as then_accepted,
  round(100.0 * count(a.user_id) / nullif(count(*), 0), 1) as pct_accepted
from opens o left join accepts a on a.user_id = o.user_id and a.event_id = o.event_id and a.time >= o.time
group by 1 order by 2 desc;

-- 9. "Not for me" taps per For You visit, by week (rising = the taste avatar is missing)
select date_trunc('week', time)::date as week,
  count(*) filter (where name = 'notForMe') as not_for_me,
  count(*) filter (where name = 'screen_view' and props->>'screen' = 'discover') as feed_views,
  round(1.0 * count(*) filter (where name = 'notForMe')
    / nullif(count(*) filter (where name = 'screen_view' and props->>'screen' = 'discover'), 0), 2) as per_feed_view
from analytics group by 1 order by 1 desc;

-- 10. The AI: calls, fallbacks to keywords, and speed (fresh calls only; cached results are instant)
select name as job, props->>'mode' as backend, count(*) as calls,
  percentile_cont(0.5) within group (order by (props->>'ms')::int) as median_ms,
  percentile_cont(0.95) within group (order by (props->>'ms')::int) as p95_ms,
  round(avg((props->>'results')::numeric), 1) as avg_results
from analytics
where name like 'ai\_%' and props->>'fresh' = 'true'
group by 1, 2 order by 1, 3 desc;

-- 11. AI failures (these are hidden from the "analytics" view, so read the table)
select date_trunc('day', time)::date as day, name, props->>'error' as error, count(*)
from analytics_events
where name like 'ai\_%' and props->>'ok' = 'false'
group by 1, 2, 3 order by 1 desc, 4 desc;

-- ============================================================================================
-- 12. DEMAND AND SUPPLY: searches that found nothing, and what happened to Quest Requests
select date_trunc('week', time)::date as week,
  count(*) as searches,
  count(*) filter (where (props->>'results')::int = 0) as found_nothing,
  sum((props->>'unmet')::int) as unmet_interests
from analytics where name = 'ai_search' group by 1 order by 1 desc;

select date_trunc('week', time)::date as week,
  count(*) filter (where name = 'postRequest' and props->>'merged' = 'false') as new_requests,
  count(*) filter (where name = 'postRequest' and props->>'merged' = 'true') as asked_again,
  count(*) filter (where name = 'upvote') as upvotes,
  count(*) filter (where name = 'claim') as claimed_by_hosts,
  count(*) filter (where name = 'publish' and props->>'requesters' <> '0') as published_from_requests
from analytics group by 1 order by 1 desc;

-- 13. Hosts: active hosts, quests published, and confirmed attendance at their quests
select date_trunc('week', time)::date as week,
  count(distinct host_id) filter (where host_id is not null) as active_hosts,
  count(*) filter (where name = 'publish') as quests_published,
  count(*) filter (where name = 'hostMessage') as updates_sent
from analytics group by 1 order by 1 desc;

-- 14. Which scenes and areas people actually go to (joins to the events table)
select e.data->>'scene' as scene, e.data->>'area' as area,
  count(*) filter (where a.name in ('accept', 'lockPoll')) as accepts,
  count(*) filter (where a.name = 'attended' and a.props->>'attended' = 'true') as attended,
  round(avg((a.props->>'stars')::numeric) filter (where a.name = 'rate'), 2) as avg_stars
from analytics a join events e on e.id = a.event_id
group by 1, 2 order by 4 desc, 3 desc;

-- ============================================================================================
-- 15. Privacy: delete everything recorded about one attendee (replace the id)
-- delete from analytics_events where user_id = 'their-user-id';
-- Retention: drop raw rows older than 12 months
-- delete from analytics_events where time < now() - interval '12 months';
