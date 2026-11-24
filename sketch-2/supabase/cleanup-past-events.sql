-- Nightly cleanup of past events in the "listings" table. NOT switched on: run it by hand in the SQL Editor, or
-- schedule it with pg_cron once you're happy with it (steps below).
--
-- What it deletes: events that ended (or, with no end time, started) more than 7 days ago, and installations whose
-- runs_until passed more than 7 days ago. The week's grace keeps last weekend's events for ratings and recaps.
-- The app never shows past events anyway; this only keeps the table small. Import-run rows older than 90 days go too.

delete from listings
where coalesce(runs_until, ends_at, starts_at + interval '3 hours') < now() - interval '7 days';

delete from event_imports
where imported_at < now() - interval '90 days';

-- To run it every night at 08:41 UTC (about 3:41 AM in Toronto), later:
--   1. Supabase dashboard > Database > Extensions: turn on "pg_cron".
--   2. SQL Editor, run:
--        select cron.schedule(
--          'sidequest-cleanup-past-events',
--          '41 8 * * *',
--          $$delete from listings where coalesce(runs_until, ends_at, starts_at + interval '3 hours') < now() - interval '7 days';
--            delete from event_imports where imported_at < now() - interval '90 days';$$
--        );
--   3. Check it: select * from cron.job;   and after a night: select * from cron.job_run_details order by start_time desc limit 5;
--   To stop it: select cron.unschedule('sidequest-cleanup-past-events');
