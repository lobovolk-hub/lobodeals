alter table public.sales_campaigns
  add column artwork_url text null;

alter table public.sales_campaigns
  add constraint sales_campaigns_artwork_url_https
  check (
    artwork_url is null
    or artwork_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?$'
  );

comment on column public.sales_campaigns.artwork_url is
  'Optional official campaign artwork URL discovered from campaign-specific page metadata; HTTPS and credential-free.';

notify pgrst, 'reload schema';
