# LoboDeals 3.2 — Estado actual

Fecha de corte: 2026-08-01, America/Lima

## Checkpoint Texto 3.2-0024-R1

- HEAD inicial: `532fd107d2460180d7f501bea0e1b847a8a2af43`; checkpoint de
  código anterior a esta actualización documental: `1912f29`.
- Runner único: `npm run refresh:daily`, con modos `validate`, `replay` y
  `live`; 22 adapters obligatorios y receipt chain estricta.
- Migración 007 final local: 9.977 bytes; SHA-256
  `d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`.
- Certificado canónico 007: 18.144 bytes; SHA-256
  `b6ebbc3f46b2ee052a02bfea52bbfc811be38786a4e993f4d51e8996ef277e73`;
  ejecutado read-only contra producción con 23/23 checks y 0 blockers.
- Supabase sigue con 004, 005 y 006 aplicadas, 007 ausente, 0 ciclos y 0
  receipts. No hubo mutación remota.
- Vercel conserva el deployment productivo conocido en `READY`, con el SHA
  productivo esperado y 0 errores runtime observados en 24 h. La API consultada
  no demuestra margen/capacidad explícitamente aprobado; ese gate sigue cerrado.
- Baseline actual: 486/486 pruebas; 113/113 `.mjs` pasan `node --check`; lint
  con 0 errores y los mismos 6 warnings preexistentes; 15/15 replays y 0 writes.

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
- El flujo histórico está mapeado. Los wrappers siguen incompatibles como flujo
  principal; el runner diario único integra las 22 firmas operativas y conserva
  el binding de credenciales/procesos detrás de los gates live.
- Safe demotion v2 está endurecida, probada e integrada obligatoriamente en el
  runner; la migración 007 todavía no está aplicada.
- No existe un ciclo remoto real, certificación real ni mínimo inicializado. El
  runner está listo en código, pero no está listo para ejecución live.

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
- `DAILY_RUNNER_CODE_READY=true`
- `RECOVERY_REFRESH_COMMAND_READY=true`
- `DAILY_REFRESH_FLOW_MAPPED=true`
- `SAFE_DEMOTION_AUDITED=true`
- `SAFE_DEMOTION_CODE_READY=true`
- `SAFE_DEMOTION_RUNNER_INTEGRATED=true`
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=true`
- `MIGRATION_007_LOCAL_APPROVED=true`
- `MIGRATION_007_PRECERTIFICATION_READY=true`
- `MIGRATION_007_REMOTE_CERTIFIED=true`
- `MIGRATION_007_APPLIED=false`
- `RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY=false`
- `RECOVERY_REFRESH_EXECUTED=false`
- `PUBLIC_CACHE_REFRESH_AUDITED=true`
- `ISR_WRITE_SOURCE_IDENTIFIED=true`
- `ACTIVE_CPU_SOURCE_IDENTIFIED=true`
- `DAILY_REFRESH_SAFE_FOR_VERCEL=false`
- `CACHE_STRATEGY_APPROVED_LOCALLY=true`
- `DEPLOY_FIX_REQUIRED_BEFORE_REFRESH=false`

## Validación final local

- `npm test`: 486/486.
- Recheck final Bloque 4 + ended/demotion: 14/14.
- Suites enfocadas de runners, fast refresh, ended/demotion y cache: todas
  aprobadas.
- `node --check`: 113/113 archivos `.mjs`.
- Lint: 0 errores y los mismos 6 warnings conocidos.
- Secret scan, referencias activas, paths documentales y diff checks: limpios.
- Build no ejecutado porque no cambió Next.js/TypeScript de producción.

El recovery sigue en NO-GO live en `LOBODEALS-OPERATIONS.md`. Siguiente paso:
Johan debe emitir la Autorización A exacta para aplicar solo 007 y su postcheck.
Después se repiten los gates read-only y se prepara, sin reutilizar permiso, la
Autorización B para un único refresh supervisado. Antes de B debe existir una
aprobación explícita de capacidad Vercel y la intervención visible de Johan en
Edge/captcha.
