# LoboDeals 3.2 — Runner diario y precertificación 007

Fecha: 2026-08-01, America/Lima

## Alcance

Paquete local y remoto read-only correspondiente al Texto 3.2-0024-R1. No se
aplicó la migración 007, no se abrió Edge, no se ejecutaron collectors ni RPCs
mutables, no se refrescó cache y no hubo push o deploy.

## Git

- HEAD inicial: `532fd107d2460180d7f501bea0e1b847a8a2af43`.
- Rama: `main`.
- Divergencia inicial sin fetch: 85 delante / 0 detrás.
- Checkpoints de código:
  - `03ed523 Harden safe demotion migration 007`.
  - `dcf04b6 Add single daily refresh runner`.
  - `1912f29 Pin daily live authorization identity`.

## Migración 007

- Archivo: `sql/007-lobodeals-3-safe-demotion-hardening.sql`.
- SHA inicial: `3ebd7366b1cf26e71f494389d63d4e7759f404c23f468e1fba8153829646f00a`.
- Tamaño inicial: 8.263 bytes.
- SHA final: `d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`.
- Tamaño final: 9.977 bytes.
- Cambios: lock exclusivo para serializar el gate before-use, verificación de
  owner/`SECURITY DEFINER`/`search_path` vacío/ACL de v1, ausencia de ciclos y
  receipts, columnas requeridas y recovery simétrico fail-closed.
- Sin `CASCADE`; no modifica 005 ni 006.

Artefactos:

- Precheck diagnóstico: SHA
  `e54726427b58a6d57773f751b3f96c452f4b07005e531a2e8243f2ff9bbb00f2`.
- Certificado one-statement: SHA
  `b6ebbc3f46b2ee052a02bfea52bbfc811be38786a4e993f4d51e8996ef277e73`.
- Postcheck: SHA
  `51bd098128476dde501864540485b5066c299dfb20030a84c0e7ad67eb4ed6b7`.
- Recovery before-use: SHA
  `eb76722164a3929d9a78ad0ddce6220e0240bfb04c4a6019171ed36bd0b235f8`.

## Certificado remoto read-only

- Proyecto: `vlxkoprpobfevxefizwr`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Intentos SQL read-only: 2; diagnóstico y certificado, ambos exitosos.
- Checks: 23/23 passed; blocker failures: 0.
- Backend PID: `2583358`.
- Snapshot: `296320:296320:`.
- Checked at: `2026-08-01 20:51:34.826027+00`.
- 004/005/006 registradas; 007 ausente.
- Cycles: 0; receipts: 0; regular/Plus candidates: 0; minima: 0.
- Stage/cache: 32.890/32.890; Monthly: 7, activas: 4.
- Locks en targets: 0 granted / 0 waiting; actividad relevante: 0.

## Runner

- Entrypoint: `scripts/run-psdeals-daily-refresh-v3.mjs`.
- Comando único: `npm run refresh:daily`.
- Modos: `validate`, `replay`, `live`.
- 22 etapas y 22 adapters obligatorios.
- Gates live: project/action/autorización/cycle/dry-run/entorno, HEAD real, SHA
  exacto de 007 y certificado, 007 aplicada, preflight vigente, Vercel, Edge y
  captcha. Falla antes de enlazar adapters si falta cualquiera.
- Safe demotion usa únicamente `apply_psdeals_ended_deals_v2`; cache usa
  únicamente `refresh_catalog_public_cache_v16`.
- Ended se analiza, los ambiguos se revalidan y el análisis anterior se
  descarta antes de reanalysis y demotion.

## Replays y validación

- 15/15 escenarios con resultado de seguridad esperado y `executed_writes=0`.
- Mayo 18: 7.593/7.593; mayo 20: retry único recuperado; junio:
  5.531/5.552 bloqueado.
- Hollow Knight y PS Plus ambiguo no entran en candidates de demotion.
- Timeout exige reconciliación; duplicación y restart son deterministas.
- `npm test`: 486/486.
- `node --check`: 113/113 `.mjs`.
- Lint: 0 errores, 6 warnings preexistentes.
- Build omitido: no cambió Next.js/TypeScript de producción.

## Vercel read-only

- Proyecto: `prj_xi25eHLsj4DNb9zy7P0v64xM4W1I`.
- Deployment latest production: `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`, `READY`.
- Git SHA: `4f826ac873850d3e61ceb68721512099625f1515`.
- Últimas 24 h: 0 errores runtime; 4.349 respuestas 200 observadas.
- La lectura no expuso ni aprobó capacidad/cuota; el gate
  `vercel_margin_not_approved` permanece cerrado.

## Resultado

- `DAILY_RUNNER_CODE_READY=true`.
- `RECOVERY_REFRESH_COMMAND_READY=true`.
- `SAFE_DEMOTION_RUNNER_INTEGRATED=true`.
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=true`.
- `MIGRATION_007_LOCAL_APPROVED=true`.
- `MIGRATION_007_PRECERTIFICATION_READY=true`.
- `MIGRATION_007_REMOTE_CERTIFIED=true`.
- `RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY=false` por capacidad Vercel no
  aprobada explícitamente; que 007 siga ausente es el estado intencional previo
  a la Autorización A, no un fallo de la precertificación 007.
- `MIGRATION_007_APPLIED=false`.
- `RECOVERY_REFRESH_EXECUTED=false`.
- `PUBLIC_DATA_CURRENT=false`.
- `DAILY_RUNNER_READY=false`.
- `COMPACT_MINIMA_READY=false`.
- `LIVE_CYCLE_READY=false`.
- `THIRTY_DAY_TRIAL_READY=false`.
