-- LoboDeals 3.2
-- Recovery for migration 007 before any real cycle exists.
-- This restores service-role access to v1 and removes only the unused v2 RPC.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

lock table public.price_refresh_cycles in access exclusive mode;
lock table public.psdeals_cycle_action_receipts in access exclusive mode;

do $preflight$
declare
  v1_oid oid;
  v2_oid oid;
  v2_owner text;
  v2_security_definer boolean;
  v2_proconfig text[];
begin
  if current_user <> 'postgres' then
    raise exception 'PSDEALS_007_RECOVERY_POSTGRES_OWNER_REQUIRED';
  end if;

  v1_oid := to_regprocedure(
    'public.apply_psdeals_ended_deals_v1(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  );
  v2_oid := to_regprocedure(
    'public.apply_psdeals_ended_deals_v2(uuid,uuid,text,text,text,text,text,bigint[],integer,timestamp with time zone)'
  );

  if v1_oid is null then
    raise exception 'PSDEALS_007_RECOVERY_V1_FUNCTION_MISSING';
  end if;

  if v2_oid is null then
    raise exception 'PSDEALS_007_RECOVERY_V2_FUNCTION_MISSING';
  end if;

  if exists (select 1 from public.price_refresh_cycles)
    or exists (select 1 from public.psdeals_cycle_action_receipts) then
    raise exception 'PSDEALS_007_RECOVERY_FORBIDDEN_AFTER_USE';
  end if;

  select
    owner_role.rolname,
    procedure.prosecdef,
    coalesce(procedure.proconfig, array[]::text[])
  into v2_owner, v2_security_definer, v2_proconfig
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where procedure.oid = v2_oid;

  if v2_owner <> 'postgres'
    or v2_security_definer is distinct from true
    or v2_proconfig <> array['search_path=""']::text[]
    or not pg_catalog.has_function_privilege('service_role', v2_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v2_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v2_oid, 'EXECUTE') then
    raise exception 'PSDEALS_007_RECOVERY_V2_CONTRACT_MISMATCH';
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
