# LoboDeals 3.2 — Mapa del sistema

Fecha de corte: 2026-08-01

## Sistema productivo actual

- **App pública:** Next.js App Router en Vercel. Rutas principales `/`,
  `/catalog`, `/deals`, `/tracked`, `/profile`, `/login` y
  `/us/playstation/[slug]`; route handler `/auth/callback`; `robots` y
  `sitemap` generados por la app.
- **Supabase:** base de datos, Auth/RLS y RPCs. `psdeals_stage_items` conserva
  el estado comercial; `catalog_public_cache` alimenta la app; tablas de ciclos,
  receipts y candidates protegen el flujo certificado; `ps_plus_monthly_games`
  separa Monthly de ofertas comerciales. La migración 007 está aplicada:
  `apply_psdeals_ended_deals_v2` es el único entrypoint de demotion ejecutable
  por `service_role`; v1 quedó interno a `postgres`.
- **Caché pública:** materialización de stage y datos relacionados. El camino
  legacy directo v15 está bloqueado en código; el futuro camino v16 exige ciclo,
  certificación y receipt.
- **Runner diario único:** `scripts/run-psdeals-daily-refresh-v3.mjs`, expuesto
  solo como `npm run refresh:daily`. `validate` y `replay` son offline; `live`
  valida simultáneamente proyecto, acción, autorización, cycle, entorno, HEAD,
  SHA de 007, SHA del certificado, preflight, Vercel, Edge y captcha antes de
  enlazar cualquier adapter.
- **Autenticación:** Supabase Auth, email/password y Google OAuth; callback en la
  app. Google Sign-In sigue como prioridad visible pendiente.
- **Vercel/deploy:** producción se despliega desde GitHub `main`. El local está
  adelantado y no equivale a producción. El SHA productivo observado es
  `4f826ac`: home es ISR 1h; catalog/deals son dinámicos; slugs son estáticos
  bajo demanda con TTL 24h; sitemap contiene tres URLs.
- **Analítica:** metadata, sitemap/robots y la instrumentación visible en el
  repositorio; el detalle remoto debe verificarse antes de afirmar cobertura.

## Flujo operativo histórico que debe revalidarse

1. Edge con CDP y challenge de PSDeals resuelto manualmente.
2. Listing `recently-added` para Games, Bundles y DLC de PS4/PS5 US.
3. Análisis de nuevos e importador de detalle.
4. Refresh de caché pública.
5. Listing completo de discounts.
6. Fast refresh: must-refresh, PS Plus recheck y stale.
7. Import de detalles y un retry.
8. Analyzer de ended deals.
9. Detail refresh de candidatos dudosos y safe demotion.
10. Caché final, invariantes y reporte.

`PSDeals` es la fuente de listing/detalle. `Edge/CDP` es el transporte local
para atravesar el challenge con intervención humana; no es un servicio de
producción. Los PowerShell son wrappers del collector, analyzers e importer.

## Tooling y runner actual

- Validadores de manifest y evidence envelopes.
- Workspace, ledger y state machine de ciclo.
- Orquestador integral local determinista.
- Builders de payload, clasificación, normalización comercial y mínimos.
- Puertos fake/operativos separados y gates explícitas de ejecución remota.
- Selector puro de ended deals compartido con el analyzer real.
- State machine diaria de 22 etapas con recently-added, discounts, retry,
  Monthly aislado, doble análisis ended, safe demotion v2, candidates,
  certificación v3, mínimos, cache v16 y finalización.
- Contrato operacional y fakes comparten las mismas 22 firmas; toda etapa
  acepta el receipt anterior exacto y una acción externa sin receipt válido
  termina fail-closed o en reconciliación.

Este tooling prueba contratos, orden y replays integrales. La aplicación
aislada de 007 no demuestra una operación live: Edge/captcha no fueron abiertos
y no se ejecutó ningún collector, import, RPC operacional mutable o cache.

## Componentes históricos

- `psdeals_stage_price_history`: retirado; no existe como relación activa.
- Funciones directas legacy de demotion y caché v15: conservadas solo como
  superficie histórica bloqueada.
- Worker PlayStation/Cloudflare y colas oficiales antiguas: referencia, no flujo
  principal.
- Documentos v1.9, STATE 2.x y la identidad 3.0: historia en Git, no fuentes.

## Componentes futuros

- Caché final v16 y validación pública ligada al ciclo.
- Mínimos prospectivos poblados por ciclos certificados.
- Automatización diaria, alertas, analítica comercial y monetización.

La relación esencial es: recently-added → discounts completo → detalles/retry
→ Monthly aislado → ended → detail revalidation → ended reanalysis → safe
demotion → candidates/certificación/mínimos → cache v16 → validación pública.
Ningún paso posterior se abre si la evidencia o el receipt anterior es parcial,
ambiguo o incompatible.

Supabase y Vercel no comparten invalidación: actualizar
`catalog_public_cache` no regenera páginas. Catalog/deals leen en sus requests;
home y cada slug cambian cuando una visita provoca su regeneración. Está
prohibido calentar o invalidar masivamente los slugs durante una recuperación.
