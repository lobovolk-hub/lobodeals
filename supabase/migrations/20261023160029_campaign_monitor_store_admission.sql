-- Prepare before deploying the compatible Edge Function. Does not change cron.
-- A 10-minute admission exceeds the hosted worker's documented 400s maximum.
-- No renewal or automatic retry of a scheduled cycle. Review if runtime limits change.
alter table public.sales_source_health
  add column monitor_invocation uuid,
  add column monitor_lease_until timestamptz,
  add column monitor_last_cycle timestamptz;

create function public.claim_campaign_monitor_store(
  p_store_slug text, p_invocation uuid, p_cycle timestamptz default null
) returns text language plpgsql security invoker set search_path = '' as $$
declare h public.sales_source_health; current_time_utc timestamptz := clock_timestamp();
begin
  if p_invocation is null then raise exception 'Missing invocation'; end if;
  if p_cycle is not null and (not isfinite(p_cycle) or
    p_cycle <> date_bin(interval '4 hours', p_cycle, timestamptz '2000-01-01 00:00:00+00') or
    p_cycle > current_time_utc or current_time_utc - p_cycle > interval '15 minutes') then
    return 'stale-cycle';
  end if;
  select * into h from public.sales_source_health where store_slug=p_store_slug for update;
  if not found then raise exception 'Unknown store'; end if;
  if h.monitor_invocation = p_invocation and h.monitor_lease_until > current_time_utc then
    return 'acquired'; -- Same internal RPC retry; never a second HTTP invocation.
  end if;
  if p_cycle is not null and h.monitor_last_cycle >= p_cycle then return 'duplicate-cycle'; end if;
  if h.monitor_lease_until > current_time_utc then return 'busy'; end if;
  update public.sales_source_health set monitor_invocation=p_invocation,
    monitor_lease_until=current_time_utc + interval '10 minutes',
    monitor_last_cycle=coalesce(p_cycle,monitor_last_cycle)
    where store_slug=p_store_slug;
  return 'acquired';
end;
$$;

create function public.release_campaign_monitor_store(p_store_slug text, p_invocation uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.sales_source_health set monitor_invocation=null, monitor_lease_until=null
    where store_slug=p_store_slug and monitor_invocation=p_invocation;
  return found;
end;
$$;
revoke all on function public.claim_campaign_monitor_store(text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.release_campaign_monitor_store(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_campaign_monitor_store(text,uuid,timestamptz) to service_role;
grant execute on function public.release_campaign_monitor_store(text,uuid) to service_role;
notify pgrst, 'reload schema';
