-- LoboDeals 3.2
-- Recovery for migration 007 before any real cycle exists.
-- This restores service-role access to v1 and removes only the unused v2 RPC.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'PSDEALS_007_RECOVERY_POSTGRES_OWNER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.apply_psdeals_ended_deals_v2(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  ) is null then
    raise exception 'PSDEALS_007_RECOVERY_V2_FUNCTION_MISSING';
  end if;

  if exists (select 1 from public.price_refresh_cycles)
    or exists (select 1 from public.psdeals_cycle_action_receipts) then
    raise exception 'PSDEALS_007_RECOVERY_FORBIDDEN_AFTER_USE';
  end if;
end;
$preflight$;

revoke all on function public.apply_psdeals_ended_deals_v2(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) from public, anon, authenticated, service_role;

drop function public.apply_psdeals_ended_deals_v2(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
);

grant execute on function public.apply_psdeals_ended_deals_v1(
  uuid, uuid, text, text, text, text, text, bigint[], integer, timestamptz
) to service_role;

commit;

