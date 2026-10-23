-- NOT a migration to apply automatically. Only after separate rollback approval.
-- Pause/drain invocations as described in P1-STABILIZATION.md before an Edge rollback.
-- Leaves data, additive admission columns/RPCs, job ID and active state intact.
do $rollback$
declare existing_job bigint; existing_command text;
begin
  select jobid,command into strict existing_job,existing_command from cron.job
    where jobname='campaign-monitoring-every-4-hours' and schedule='0 */4 * * *';
  if position('campaign-monitoring.dispatch-prepared' in existing_command)=0 then
    raise exception 'Unexpected scheduler; inspect before rollback';
  end if;
  perform cron.alter_job(existing_job, command := $cron$
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
    $cron$);
end;
$rollback$;
