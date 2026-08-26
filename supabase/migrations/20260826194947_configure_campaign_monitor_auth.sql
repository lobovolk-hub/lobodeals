create or replace function public.campaign_monitor_token_verifier()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(decrypted_secret, 'sha256'),
    'hex'
  )
  from vault.decrypted_secrets
  where name = 'campaign_monitor_token'
  limit 1
$$;

revoke all on function public.campaign_monitor_token_verifier()
  from public, anon, authenticated;
grant execute on function public.campaign_monitor_token_verifier()
  to service_role;

comment on function public.campaign_monitor_token_verifier() is
  'Returns only the one-way verifier for the Vault-held campaign monitor token to the internal service role.';

notify pgrst, 'reload schema';
