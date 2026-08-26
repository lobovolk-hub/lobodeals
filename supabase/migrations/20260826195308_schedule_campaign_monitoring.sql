do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
    where jobname = 'campaign-monitoring-every-4-hours';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'campaign-monitoring-every-4-hours',
    '0 */4 * * *',
    $cron$
      select net.http_post(
        url := 'https://vlxkoprpobfevxefizwr.supabase.co/functions/v1/campaign-monitoring',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-campaign-monitor-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'campaign_monitor_token'
          )
        ),
        body := '{"mode":"persist"}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
    $cron$
  );
end
$$;
