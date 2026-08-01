# LoboDeals 3.2 — Estado actual

Fecha de corte: 2026-08-01, America/Lima

## Git y producción

- Rama: `main`.
- HEAD técnico inicial auditado: `f0ec1899166c08cf4049d763faeb7e5ca095f6bc`.
- Divergencia inicial sin fetch: 77 commits delante y 0 detrás de la referencia
  local `origin/main`.
- Worktree al inicio: limpio.
- Los commits locales recientes no están desplegados.
- Deployment productivo observado read-only:
  `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`, SHA
  `4f826ac873850d3e61ceb68721512099625f1515`, READY en `iad1`.
- Aliases: `lobodeals.com`, `www.lobodeals.com` y tres `.vercel.app`.

## Datos y migraciones

- Migraciones 005 y 006 aplicadas y postchecks aprobados.
- Histórico detallado retirado con `RESTRICT`; no se creará respaldo ni
  backfill.
- Database Size verificado post-006: 166.841.491 bytes.
- Stage y caché pública conocidos: 32.890 filas cada uno.
- Mínimos compactos: esquema listo, valores aún vacíos.
- Datos públicos de precios: desactualizados desde el 6 de junio de 2026.

## Código y operación

- Baseline inicial: 452/452 pruebas; 45/45 enfocadas de Bloque 4; 107 archivos
  pasan `node --check`; lint con 0 errores y 6 warnings preexistentes.
- `BLOCK_4_CODE_READY=true`, incluido el orquestador offline sin efectos.
- El flujo histórico está mapeado, pero los wrappers son incompatibles con los
  contratos de ciclo actuales y el runner certificado no ejecuta adaptadores
  reales.
- Safe demotion v2 está endurecida y probada localmente en la migración 007,
  aún no aplicada ni integrada a un runner.
- No existe un ciclo remoto real, certificación real, mínimo inicializado ni
  runner diario certificado.

## Vercel

Métricas aportadas por Johan para los últimos 30 días al 2026-08-01:

- ISR Writes: 304K / 200K;
- Fluid Active CPU: 3h22m / 4h;
- ISR Reads: 233K / 1M;
- Function Invocations: 160K / 1M.

La auditoría atribuye ISR Writes principalmente a la generación/regeneración
individual de `/us/playstation/[slug]` y Active CPU a catalog/deals dinámicos
más generaciones de slug. Un refresh Supabase no invalida ISR ni escribe ISR
por sí solo. Aun así, la operación diaria no se declara segura mientras la
ventana visible esté sobre la cuota. El deployment actual no registra errores
de runtime en la ventana de cinco días consultada.

## Gates

- `MIGRATION_005_APPLIED=true`
- `MIGRATION_005_POSTCHECK_PASSED=true`
- `MIGRATION_006_APPLIED=true`
- `MIGRATION_006_POSTCHECK_PASSED=true`
- `HISTORY_RETIRED=true`
- `STORAGE_READY=true`
- `COMPACT_MINIMA_SCHEMA_READY=true`
- `BLOCK_4_CODE_READY=true`
- `BLOCK_4_COMPLETE=false`
- `COMPACT_MINIMA_READY=false`
- `LIVE_CYCLE_READY=false`
- `THIRTY_DAY_TRIAL_READY=false`
- `PUBLIC_DATA_CURRENT=false`
- `DAILY_RUNNER_READY=false`
- `DAILY_REFRESH_FLOW_MAPPED=true`
- `SAFE_DEMOTION_AUDITED=true`
- `SAFE_DEMOTION_CODE_READY=true`
- `SAFE_DEMOTION_RUNNER_INTEGRATED=false`
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=false`
- `PUBLIC_CACHE_REFRESH_AUDITED=true`
- `ISR_WRITE_SOURCE_IDENTIFIED=true`
- `ACTIVE_CPU_SOURCE_IDENTIFIED=true`
- `DAILY_REFRESH_SAFE_FOR_VERCEL=false`
- `CACHE_STRATEGY_APPROVED_LOCALLY=true`
- `DEPLOY_FIX_REQUIRED_BEFORE_REFRESH=false`

El plan exacto del recovery está documentado como NO-GO en
`LOBODEALS-OPERATIONS.md`. Siguiente prioridad: integrar y probar el runner
diario real; después cerrar los NO-GO de Vercel, migración 007 y cache v16 antes
de pedir autorización para un refresh de recuperación.
