-- Activate ONLY after the compatible Edge release and its admission RPCs pass.
-- Alter the existing job in place: never create another scheduler.
do $migration$
declare existing_job bigint; existing_command text;
begin
  select jobid,command into strict existing_job,existing_command from cron.job
    where jobname='campaign-monitoring-every-4-hours' and active and schedule='0 */4 * * *';
  if md5(existing_command) <> 'e48e9f74aee2ebfc6944a3aad721314a' then
    raise exception 'Scheduler baseline changed; inspect before activation';
  end if;
  perform cron.alter_job(existing_job, command := $dispatch$
do $cycle$
declare
  cycle_id text := to_char(date_bin(interval '4 hours', statement_timestamp(),
    timestamptz '2000-01-01 00:00:00+00') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  store_slug text; request_id bigint; token text; dispatched integer := 0;
begin
  select decrypted_secret into strict token from vault.decrypted_secrets where name='campaign_monitor_token';
  if token is null or length(token)=0 then raise exception 'Monitor token unavailable'; end if;
  foreach store_slug in array array[
    'playstation-store','nintendo-eshop','microsoft-store','steam','epic-games-store',
    'gog','ea-app','ubisoft-store','battle-net','rockstar-store'
  ] loop
    request_id := net.http_post(
      url := 'https://vlxkoprpobfevxefizwr.supabase.co/functions/v1/campaign-monitoring',
      params := jsonb_build_object('cycle_id',cycle_id,'store',store_slug),
      headers := jsonb_build_object('Content-Type','application/json','x-campaign-monitor-token',token),
      body := jsonb_build_object('mode','persist','stores',jsonb_build_array(store_slug),'cycleId',cycle_id),
      timeout_milliseconds := 120000
    );
    dispatched := dispatched + 1;
    raise log '%', jsonb_build_object('event','campaign-monitoring.dispatch-enqueued',
      'cycleId',cycle_id,'storeSlug',store_slug,'requestId',request_id::text);
  end loop;
  if dispatched <> 10 then raise exception 'Incomplete dispatch'; end if;
  raise log '%', jsonb_build_object('event','campaign-monitoring.dispatch-prepared',
    'cycleId',cycle_id,'requests',dispatched);
end;
$cycle$;
$dispatch$);
end;
$migration$;
