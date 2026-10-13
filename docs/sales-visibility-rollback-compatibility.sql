-- MANUAL RECOVERY ARTIFACT, NOT A MIGRATION. Separate production approval required.
-- Run before restoring adapter 18; no campaign/history data is updated or deleted.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Drain database writers while fencing later visibility RPC calls.
lock table public.sales_source_health, public.sales_campaigns in access exclusive mode;
revoke execute on function public.reserve_sales_visibility_scan(text) from public, anon, authenticated, service_role;
revoke execute on function public.finalize_sales_visibility_scan(text,text,text,jsonb,text[],text[],timestamptz) from public, anon, authenticated, service_role;
-- Adapter 18 cannot clear operational metadata when confirming a date/Upcoming/END.
-- Retain those fields as recovery history without blocking its legitimate writes.
alter table public.sales_campaigns drop constraint if exists sales_campaigns_absence_scope;
notify pgrst, 'reload schema';
commit;
