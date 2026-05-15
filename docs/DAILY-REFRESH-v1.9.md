# DAILY REFRESH v1.9 — LoboDeals

## Flujo diario actual

1. Abrir Edge con remote debugging.
2. Correr PSDeals recently-added.
3. Ejecutar refresh manual en Supabase.
4. Correr PSDeals discounts fast refresh.
5. Ejecutar refresh manual en Supabase.
6. Validar counts.
7. Revisar producción.

---

## 1. Abrir Edge

```powershell
cd D:\Proyectos\lobodeals

Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force

$recentlyAddedUrl = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc"

Start-Process "msedge.exe" -ArgumentList @(
  "--remote-debugging-port=9222",
  "--remote-allow-origins=*",
  $recentlyAddedUrl
)

Start-Sleep -Seconds 8
```

---

## 2. Recently-added

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos\lobodeals\scripts\run-psdeals-edge-live-recently-added.ps1" -Pages 8
```

Uso:
- nuevos ingresos
- latest releases
- upcoming
- cambios recientes del catálogo

---

## 3. Refresh manual en Supabase

```sql
set statement_timeout = '10min';

select public.refresh_catalog_public_cache_v15();
```

Validación:

```sql
select
  count(*) as total_rows,
  count(*) filter (where has_deal = true) as active_regular_deals,
  count(*) filter (where has_ps_plus_deal = true) as active_ps_plus_deals,
  count(*) filter (where is_ps_plus_monthly_game = true) as active_monthly_games,
  count(*) filter (
    where deal_ends_at is not null
      and deal_ends_at <= now()
      and (has_deal = true or has_ps_plus_deal = true)
  ) as expired_deals_still_marked_active,
  count(*) filter (
    where discount_percent >= 100
      and (has_deal = true or has_ps_plus_deal = true)
  ) as deals_with_100_percent_or_more,
  count(*) filter (
    where best_price_amount is null
  ) as null_best_price_amount
from public.catalog_public_cache;
```

Obligatorio:
- expired_deals_still_marked_active = 0
- deals_with_100_percent_or_more = 0
- null_best_price_amount = 0

---

## 4. Discounts fast refresh

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos\lobodeals\scripts\run-psdeals-edge-live-discounts-fast-refresh.ps1" -Pages 1000 -StaleHours 24 -StaleLimit 500
```

Uso:
- actualizar ofertas activas
- detectar cambios de precio
- actualizar PS Plus deals
- refrescar detalles viejos por rotación

---

## 5. Refresh manual después de discounts

Ejecutar otra vez:

```sql
set statement_timeout = '10min';

select public.refresh_catalog_public_cache_v15();
```

Luego repetir la validación de counts.

---

## 6. Casos clave

```sql
select
  title,
  slug,
  current_price_amount,
  original_price_amount,
  ps_plus_price_amount,
  best_price_amount,
  best_price_type,
  discount_percent,
  has_deal,
  has_ps_plus_deal,
  metacritic_score,
  deal_ends_at
from public.catalog_public_cache
where slug in (
  'mixtape',
  'like-a-dragon-gaiden-the-man-who-erased-his-name-ps4-ps5',
  'red-dead-redemption-2'
)
order by slug;
```

Esperado:
- Mixtape mantiene PS Plus price.
- Like a Dragon mantiene regular deal.
- Red Dead Redemption 2 mantiene Metacritic.

---

## 7. Revisión visual

Revisar:
- https://lobodeals.com/
- https://lobodeals.com/deals
- https://lobodeals.com/deals?tab=games&sort=metacritic
- https://lobodeals.com/catalog
- https://lobodeals.com/us/playstation/mixtape
- https://lobodeals.com/us/playstation/like-a-dragon-gaiden-the-man-who-erased-his-name-ps4-ps5

---

## Reglas críticas

- No usar Chrome/local Playwright para PSDeals.
- Usar Edge live/CDP.
- No ejecutar refresh de cache desde PowerShell si falla.
- Refresh de cache se hace manual en Supabase SQL Editor.
- PSDeals importer no debe tocar Metacritic.
- Metacritic viene de su propio collector/backfill.
- PlayStation Store official mixed deals está descartado por ahora para deals masivos.
- Fast refresh es el flujo normal.
- Full refresh queda como fallback.
