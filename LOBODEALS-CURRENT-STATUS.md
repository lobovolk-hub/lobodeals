# LoboDeals 3.2 — Estado actual

Fecha de corte: 2026-08-01, America/Lima

## Git y producción

- Rama: `main`.
- HEAD técnico inicial auditado: `f0ec1899166c08cf4049d763faeb7e5ca095f6bc`.
- Divergencia inicial sin fetch: 77 commits delante y 0 detrás de la referencia
  local `origin/main`.
- Worktree al inicio: limpio.
- Los commits locales recientes no están desplegados.
- Último deployment productivo previamente documentado:
  `dpl_FHhLSmHv6C1m1GYCtk3TwPXeCWz4`, SHA
  `d81418b35c41a8950a3d3d639ba43a73090d78c7`. Requiere revalidación read-only.

## Datos y migraciones

- Migraciones 005 y 006 aplicadas y postchecks aprobados.
- Histórico detallado retirado con `RESTRICT`; no se creará respaldo ni
  backfill.
- Database Size verificado post-006: 166.841.491 bytes.
- Stage y caché pública conocidos: 32.890 filas cada uno.
- Mínimos compactos: esquema listo, valores aún vacíos.
- Datos públicos de precios: desactualizados desde el 6 de junio de 2026.

## Código y operación

- Baseline: 452/452 pruebas; 45/45 enfocadas de Bloque 4; 107 archivos pasan
  `node --check`; lint con 0 errores y 6 warnings preexistentes.
- `BLOCK_4_CODE_READY=true`, incluido el orquestador offline sin efectos.
- Los runners reales están detenidos y no se han revalidado post-006.
- No existe un ciclo remoto real, certificación real, mínimo inicializado ni
  runner diario certificado.

## Vercel

Métricas aportadas por Johan para los últimos 30 días al 2026-08-01:

- ISR Writes: 304K / 200K;
- Fluid Active CPU: 3h22m / 4h;
- ISR Reads: 233K / 1M;
- Function Invocations: 160K / 1M.

ISR Writes está sobre la cuota visible y Active CPU está cerca del límite. La
causa y la seguridad de un refresh diario siguen bajo auditoría; no debe
ejecutarse un refresh de recuperación antes de cerrar esas gates.

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

Siguiente prioridad: terminar la auditoría del refresh diario y de Vercel y
dejar el refresh de recuperación preparado, sin ejecutarlo.
