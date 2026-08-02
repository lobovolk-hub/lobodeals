# LoboDeals 3.2 — Estado actual

Fecha de corte: 2026-08-02, America/Lima

## Checkpoint Texto 3.2-0027

- HEAD inicial: `b00517aa8fed4c0652c9ce017b3f3c8458803fd6`, rama `main`,
  worktree limpio y divergencia local 97 delante / 0 detrás sin fetch.
- El registry productivo enlaza exactamente 23/23 adapters concretos a scripts,
  funciones y RPC canónicos; el factory fija inputs y puertos productivos, los
  writes exigen autorización de etapa y v1/v15 permanecen bloqueados.
- El launcher Edge/CDP admite handoff de PID, reentrada exclusiva al perfil
  dedicado ya verificado y fallback seguro 9223-9232 cuando 9222 pertenece a
  un perfil ajeno. Nunca termina ni se adjunta a Edge personal.
- Prueba runtime real: PID 16820, puerto 9222, perfil
  `data/edge/recovery-profile`, `/json/version` y `/json/list` válidos, pestaña
  canonical recently-added, PlayStation US y 36 cards. Estado `page_ready`,
  espera final 34 ms, confirmación por chat deshabilitada y cero collectors,
  imports o writes.
- Supabase read-only a las 17:02 UTC: proyecto `ACTIVE_HEALTHY`, 007 registrada
  una vez, postcheck aprobado y certificado post-007 23/23, con cero cycles,
  receipts, candidates, mínimos, locks y sesiones operacionales; sin drift.
- Vercel read-only: proyecto enlazado y último deployment productivo
  `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr` en `READY`. El conector no expone Usage;
  la evidencia manual de las 00:41 PET está vencida y no se renueva por código.
- `live-preflight` alcanzó `captcha_resolved` y se detuvo antes de
  `create_remote_cycle`: `RECOVERY_REFRESH_COMMAND_READY=true` y
  `RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY=pending_manual_vercel_refresh`.
  No existe autorización operativa vigente y el refresh no se ejecutó.

## Checkpoint Texto 3.2-0026

- HEAD inicial autorizado: `15bb44538c7109a27c8a3a8fe74d3b4c1bd5a917`.
- La auditoría corrigió el falso positivo de readiness: 23 contratos de etapa
  están definidos y probados, pero el repositorio no contiene todavía los 23
  adapters de producción. Un dispatcher delegado o un fake ya no puede hacer
  `LIVE_EXECUTOR_BOUND=true` ni `RECOVERY_REFRESH_COMMAND_READY=true`.
- El runner separa `run_intent_id=local-cycle-*` del UUID remoto. El UUID solo
  se acepta tras `create_or_reconcile_price_refresh_cycle_v1`, se propaga a
  receipts y etapas posteriores, y una respuesta perdida exige reconciliación
  exacta por identidad e idempotency key antes de continuar.
- El launcher dedicado usa PowerShell, `msedge.exe`, perfil
  `data/edge/recovery-profile`, `127.0.0.1:9222` y la URL canónica. El detector
  de challenge hace polling acotado, muestra
  `Waiting for Johan to complete the PSDeals challenge in Edge...` y continúa
  automáticamente; no existe confirmación `LISTO` por chat.
- La prueba real de Edge/CDP alcanzó un HARD STOP del entorno: Edge visible no
  pudo exponer CDP desde el sandbox y la elevación usada por la aplicación ocupó
  temporalmente el mismo puerto con otro perfil. El launcher rechazó adjuntarse
  o matar ese proceso. No se abrió collector ni se leyó un listing completo.
- Evidencia manual Vercel de Johan observada a las 00:41 PET: CPU 211/240,
  margen 29 minutos, ISR Writes 301K, invocations 172K, FOT 5.02 GB y Edge
  Requests 348K. El contrato la acepta por hasta 180 minutos y exige renovarla
  inmediatamente antes de cualquier ejecución live.
- Vercel read-only confirmó proyecto, aliases y deployment productivo
  `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr` en `READY`, sin errores runtime devueltos
  ni deployment concurrente observado.
- Supabase read-only confirmó `ACTIVE_HEALTHY`, migraciones 005/006/007, 007
  registrada una vez, postcheck completo y certificado posterior 23/23; cycles,
  receipts, candidates y mínimos siguen en cero, sin locks o actividad
  operacional relevante.
- Baseline del checkpoint: 507/507 pruebas; 122/122 `.mjs` pasan
  `node --check`; lint termina con 0 errores y 6 warnings conocidos. El refresh no se ejecutó y no se
  emite una nueva Autorización B mientras fallen Edge runtime y executor live.

## Checkpoint Texto 3.2-0024-R1

- HEAD inicial: `532fd107d2460180d7f501bea0e1b847a8a2af43`; checkpoint de
  código anterior a esta actualización documental: `1912f29`.
- Runner único: `npm run refresh:daily`, con modos `validate`, `replay`,
  `live-preflight` y `live`; 23 contratos obligatorios y receipt chain estricta.
- Migración 007 final local: 9.977 bytes; SHA-256
  `d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`.
- Certificado previo canónico 007: 18.144 bytes; SHA-256
  `b6ebbc3f46b2ee052a02bfea52bbfc811be38786a4e993f4d51e8996ef277e73`;
  ejecutado read-only contra producción con 23/23 checks y 0 blockers.
- La migración 007 se aplicó una sola vez en Supabase como
  `20260801220321_lobodeals_3_safe_demotion_hardening`; postcheck 7/7 y
  certificado posterior 23/23, ambos sin blockers. Siguen existiendo 0 ciclos
  y 0 receipts.
- Certificado posterior 007: 19.420 bytes; SHA-256
  `42cdef8220310d3b396685103aeb54d6881000d5b45dfb710c7c650b67c61a35`.
- Vercel conserva el deployment productivo conocido en `READY`, con el SHA
  productivo esperado y 0 errores runtime observados en 24 h. La API consultada
  no demuestra margen/capacidad explícitamente aprobado; ese gate sigue cerrado.
- Baseline del checkpoint anterior: 488/488 pruebas; 113/113 `.mjs` pasan `node --check`; lint
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
  runner; la migración 007 está aplicada y `service_role` solo puede ejecutar
  v2, no v1.
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
- `LIVE_ADAPTER_CONTRACTS_READY=true`
- `LIVE_EXECUTOR_BOUND=true`
- `PRODUCTION_ADAPTERS_TOTAL=23`
- `PRODUCTION_ADAPTERS_BOUND=23`
- `PRODUCTION_ADAPTERS_MISSING=0`
- `REMOTE_CYCLE_IDENTITY_ALIGNED=true`
- `EDGE_CDP_POWERSHELL_LAUNCH_READY=true`
- `CAPTCHA_AUTOMATIC_WAIT_READY=true`
- `CHAT_CONFIRMATION_REQUIRED=false`
- `EDGE_CDP_RUNTIME_PREFLIGHT_PASSED=true`
- `CDP_PROCESS_HANDOFF_HANDLED=true`
- `VERCEL_MANUAL_EVIDENCE_ACCEPTED=false` porque la evidencia observada venció
- `VERCEL_CAPACITY_WITHIN_THRESHOLD=false` hasta renovar el dashboard
- `RECOVERY_REFRESH_COMMAND_READY=true`
- `DAILY_REFRESH_FLOW_MAPPED=true`
- `SAFE_DEMOTION_AUDITED=true`
- `SAFE_DEMOTION_CODE_READY=true`
- `SAFE_DEMOTION_RUNNER_INTEGRATED=true`
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=true`
- `MIGRATION_007_LOCAL_APPROVED=true`
- `MIGRATION_007_PRECERTIFICATION_READY=true`
- `MIGRATION_007_REMOTE_CERTIFIED=true`
- `MIGRATION_007_APPLIED=true`
- `MIGRATION_007_POSTCHECK_PASSED=true`
- `MIGRATION_007_POSTCERTIFIED=true`
- `RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY=pending_manual_vercel_refresh`
- `RECOVERY_REFRESH_EXECUTED=false`
- `PUBLIC_CACHE_REFRESH_AUDITED=true`
- `ISR_WRITE_SOURCE_IDENTIFIED=true`
- `ACTIVE_CPU_SOURCE_IDENTIFIED=true`
- `DAILY_REFRESH_SAFE_FOR_VERCEL=true` solo para la evidencia temporal observada
- `CACHE_STRATEGY_APPROVED_LOCALLY=true`
- `DEPLOY_FIX_REQUIRED_BEFORE_REFRESH=false`

## Validación final local del checkpoint anterior

- `npm test`: 488/488.
- Recheck final Bloque 4 + ended/demotion: 14/14.
- Suites enfocadas de runners, fast refresh, ended/demotion y cache: todas
  aprobadas.
- `node --check`: 113/113 archivos `.mjs`.
- Lint: 0 errores y los mismos 6 warnings conocidos.
- Secret scan, referencias activas, paths documentales y diff checks: limpios.
- Build no ejecutado porque no cambió Next.js/TypeScript de producción.

El recovery no está autorizado y no se ha ejecutado. La Autorización A se
consumió exclusivamente en 007. La única acción pendiente de Johan antes de
considerar la nueva Autorización B propuesta es renovar los cinco valores del
dashboard Vercel en el template canónico y mantenerlos dentro del umbral.
