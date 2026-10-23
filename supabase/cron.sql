-- Runs the "avisar-cuidador" Edge Function every 5 minutes (caregiver email alert).
-- Run in Supabase → SQL Editor after deploying the function and setting its secrets.
-- Replace:
--   SEU-PROJETO     → your project ref (the part before .supabase.co in the project URL)
--   SEU_CRON_SECRET → the same value set with: npx supabase secrets set CRON_SECRET=...
-- Never commit the real secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the job instead of creating a duplicate
select cron.unschedule('avisar-cuidador')
where exists (select 1 from cron.job where jobname = 'avisar-cuidador');

select cron.schedule(
  'avisar-cuidador',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/avisar-cuidador',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'SEU_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- To check the runs:   select * from cron.job_run_details order by start_time desc limit 10;
-- To stop the alerts:  select cron.unschedule('avisar-cuidador');
