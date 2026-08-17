# LoboDeals 3.2 — Operaciones

Fecha de corte: 2026-08-02

Estado general: `PREEXECUTION READY — PENDING MANUAL VERCEL REFRESH`.

Este documento contiene el único procedimiento operativo vigente. Hasta una
autorización visible posterior, todos los comandos reales son referencia
auditada y no permiso de ejecución.

## Preflight obligatorio

1. Confirmar proyecto, rama, HEAD, worktree y divergencia sin fetch.
2. Confirmar que el proyecto remoto, esquema y funciones esperadas coinciden.
3. Confirmar capacidad de Supabase y riesgo de cuotas Vercel.
4. Ejecutar pruebas locales, suites de runners/ended/cache, lint y checks.
5. Crear identidad de ciclo y autorización acotada solo cuando exista permiso.

Abortar ante drift, proyecto dudoso, worktree inesperado, Vercel en riesgo,
listing parcial o falta de rollback/reconciliación.

## Edge/CDP y captcha

Estado: `RUNTIME_PASSED`.

- Usar Microsoft Edge con remote debugging en `127.0.0.1:9222`; si pertenece
  a un perfil ajeno, seleccionar 9223-9232 sin terminar ni adjuntarse al dueño.
- El launcher obligatorio es `scripts/start-psdeals-edge-cdp.ps1`; usa
  `msedge.exe`, PowerShell, `--remote-debugging-port=<puerto>`,
  `--remote-allow-origins=*` y `data/edge/recovery-profile`.
- Johan resuelve el challenge/captcha en la pestaña visible; el proceso espera,
  detecta su desaparición y continúa automáticamente. No pedir `LISTO`.
- El runner consulta `/json/version` y `/json/list` por CDP.
- No automatizar captcha ni usar un perfil oculto alternativo.
- Cerrar una instancia anterior solo dentro de una operación autorizada y
  advertida previamente.

## Recently-added

Wrapper: `scripts/run-psdeals-edge-live-recently-added.ps1`.

URL canónica:

`https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc`

El wrapper recolecta, analiza nuevos, bloquea más de 200 faltantes e importa
detalles. Su texto de refresh manual v15 es histórico e incompatible con el
gate v16 actual; por ello el wrapper no está listo.

## Discounts y fast refresh

Wrapper: `scripts/run-psdeals-edge-live-discounts-fast-refresh.ps1`.

URL canónica:

`https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc`

El wrapper recolecta, genera colas `must`, `ps-plus`, `stale`, `skipped` y
`combined`, importa y reintenta una vez. No demuestra por sí solo completitud
fuerte ni integra ended deals/safe demotion; su refresh v15 final está obsoleto.

## Retry, ended deals y safe demotion

- Un único retry de detalle; pendientes después del retry cierran el ciclo.
- `analyze-psdeals-ended-discounts-from-listing-v1.mjs` solo produce evidencia
  y candidates a partir de un listing completo enlazado.
- La aplicación directa de
  `apply-psdeals-ended-discounts-safe-demotion-v1.mjs` está deshabilitada.
- La única dirección aceptable es el RPC receipt-bound del ciclo migrado.
- Monthly, PS Plus ambiguo, identidad dudosa, original ausente, precios
  incoherentes, deal futuro y listing incompleto deben bloquear demotion.

## Caché y validaciones

- No ejecutar el refresh directo v15.
- La caché v16 exige certificación y receipt del ciclo.
- Validar counts, nulls, expirados activos, descuentos extremos, muestras de
  producto, home, catalog, deals y slugs.
- Una escritura de Supabase no invalida automáticamente una página de Next.js;
  la estrategia exacta de ISR se documentará tras la auditoría de Vercel.

## Logs, doble ejecución y fallos

- Mantener outputs acotados bajo `data/import` y logs pequeños; no leer archivos
  de cientos de MB completos.
- Cada etapa debe tener evidencia hash-linked, receipt, estado y conteos.
- Timeout no equivale a fallo ni éxito: reconciliar antes de reintentar.
- Una segunda ejecución debe ser idempotente y no repetir efectos confirmados.
- Ante listing parcial, import incompleto, receipt contradictorio o cache
  fallida, detenerse y conservar evidencia; no avanzar por fecha o proximidad
  de nombres.

## Recovery Refresh — Code Ready, Awaiting Authorization

Estado: `CODE_READY_AWAITING_VERCEL_RENEWAL_AND_AUTHORIZATION`.

- `RECOVERY_REFRESH_GO=false`
- `RECOVERY_REFRESH_EXECUTED=false`
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
- `VERCEL_MANUAL_EVIDENCE_ACCEPTED=false` hasta renovar la medición
- `VERCEL_CAPACITY_WITHIN_THRESHOLD=false` hasta renovar la medición
- `RECOVERY_REFRESH_COMMAND_READY=true`
- `SAFE_DEMOTION_RUNNER_INTEGRATED=true`
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=true`
- `MIGRATION_007_REMOTE_CERTIFIED=true`
- `MIGRATION_007_APPLIED=true`
- `MIGRATION_007_POSTCHECK_PASSED=true`
- `MIGRATION_007_POSTCERTIFIED=true`
- `RECOVERY_REFRESH_REMOTE_PREFLIGHT_READY=pending_manual_vercel_refresh`
- `DAILY_REFRESH_SAFE_FOR_VERCEL=true` solo durante la ventana de evidencia manual

Este plan no es autorización. Los contratos, adapters, replays, 007 y Edge/CDP
están probados. `live-preflight` se detuvo antes de crear ciclo y conserva cero
writes. La evidencia Vercel debe renovarse inmediatamente antes de cualquier
futura autorización.

### Identidad e inputs fijos

- Repositorio: `D:\Proyectos\lobodeals`, rama `main`.
- Supabase project ref esperado: `vlxkoprpobfevxefizwr`.
- Vercel project: `prj_xi25eHLsj4DNb9zy7P0v64xM4W1I`.
- Edge/CDP esperado: `http://127.0.0.1:9222/json/version` o el archivo
  endpoint `/json/list` del perfil visible dedicado.
- Recently-added:

```text
https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
```

- Discounts:

```text
https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
```

La identidad de ciclo debe fijar `local_cycle_id`, run token hasheado, SHA
revisado, URL/fingerprint, región `us`, storefront `playstation`, fecha y
manifest hash. No usar “latest” ni elegir artefactos por nombre o mtime.

### Roles

| Rol | Responsabilidad |
|---|---|
| `CODEX` | inspección, integración, ejecución local, operación autorizada, evidencias y reconciliación |
| `JOHAN` | autorización visible por etapa, Edge visible, captcha/challenge, decisión GO/abort |
| `CHATGPT REVIEW` | revisión adversarial de SQL, gates, evidencia, cuotas y postchecks antes de abrir la etapa siguiente |
| `AUTOMATIC` | trabajo interno del futuro runner solo con permiso stage-specific vigente |
| `MANUAL GATE` | pausa obligatoria; ninguna etapa posterior puede adelantarse |

### Comandos locales existentes

Estos comandos no abren conexiones ni ejecutan collectors, SQL, Supabase,
demotion, certificación o caché. Solo podrán usarse como preparación local
cuando el alcance futuro lo autorice:

```powershell
npm run refresh:daily -- validate --json
npm run refresh:daily -- replay --scenario=all --timestamp=<ISO> --json
npm run refresh:daily -- live-preflight --remote-preflight-file=<REMOTE_PREFLIGHT_JSON> --vercel-file=<VERCEL_JSON> --run-intent-id=<local-cycle-...> --launch-edge
node scripts/run-psdeals-cycle.mjs init --cycles-root=data/cycles --code-revision=<REVIEWED_SHA> --mode=plan
node scripts/run-psdeals-cycle.mjs plan --workspace=<WORKSPACE>
node scripts/run-psdeals-cycle.mjs status --workspace=<WORKSPACE>
node scripts/run-psdeals-cycle.mjs verify --workspace=<WORKSPACE>
node scripts/preflight-psdeals-remote-readonly.mjs --facts=<REDACTED_FACTS_JSON> --output=<PREFLIGHT_JSON>
```

El wrapper equivalente solo admite `Plan`, `Preflight`, `Status` y `Resume` de
fixture:

```powershell
.\scripts\run-psdeals-certified-cycle.ps1 -Mode Plan -Workspace <WORKSPACE>
```

No existe `-Mode Operational` en el wrapper histórico. La única superficie
live es el nuevo entrypoint:

```powershell
$env:LOBODEALS_REMOTE_EXECUTION='EXPLICITLY_AUTHORIZED'
npm run refresh:daily -- live --authorization-file=<AUTHORIZATION_JSON> --remote-preflight-file=<REMOTE_PREFLIGHT_JSON> --vercel-file=<VERCEL_JSON> --edge-file=<EDGE_JSON>
```

Este bloque documenta el comando; no autoriza ejecutarlo. El argumento
`--captcha-file` ya no existe: el mismo reporte Edge contiene el estado del
challenge y la espera automática. El CLI lee el HEAD real y los SHA canónicos,
y aborta sin executor cuando no existen adapters de producción verificables.

Queda prohibido sustituirlo por
`run-psdeals-edge-live-recently-added.ps1` o
`run-psdeals-edge-live-discounts-fast-refresh.ps1`: ambos omiten el contrato de
ciclo actual e imprimen `refresh_catalog_public_cache_v15()`.

### Preflight y preparación

| # | Responsable | Acción | Efecto | Gate / aborto |
|---:|---|---|---|---|
| 0 | `CHATGPT REVIEW` | Revisar este plan, migración 007 y estrategia Vercel | Ninguno | abortar si el alcance cambia |
| 1 | `CODEX` | Confirmar HEAD, rama, divergencia y worktree sin fetch | Lectura local | worktree inesperado = abort |
| 2 | `CODEX` | Ejecutar baseline y suites enfocadas | Archivos temporales locales de test | cualquier fallo = abort |
| 3 | `CODEX` | Verificar el runner único, sus 23 contratos y adapters de producción | Lectura y tests locales | un contrato/fake/delegado no prueba binding live |
| 4 | `CHATGPT REVIEW` | Read-only de Supabase: project ref, esquema, RPCs, ACL, counts, cycles/receipts y cache | Ninguna escritura | proyecto/esquema dudoso = abort |
| 5 | `CODEX` | Evaluar facts redactados con `preflight-psdeals-remote-readonly.mjs` | JSON local `wx` | clasificación distinta de ready = abort |
| 6 | `CHATGPT REVIEW` | Read-only de Vercel: uso, errores, rutas y deployment | Ningún cambio Vercel | riesgo inmediato de pausa = abort |
| 7 | `CHATGPT REVIEW` | Confirmar que 007 sigue registrada exactamente una vez | Lectura; no reaplicar | ausencia, duplicado o drift = abort |
| 8 | `CHATGPT REVIEW` | Confirmar v2 y que `service_role` no ejecuta v1 | Read-only | ACL incorrecta = abort |
| 9 | `JOHAN` | Emitir autorización stage-specific con expiración | Permiso, no efecto remoto por sí solo | falta/ambigüedad/expiración = abort |

La 007 aplicada corresponde exclusivamente a
`sql/007-lobodeals-3-safe-demotion-hardening.sql`, versión remota
`20260801220321`, SHA-256
`d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`.
No debe reaplicarse. El recovery before-use preservado en
`sql/recovery/007-lobodeals-3-safe-demotion-hardening-before-use.sql` no está
autorizado. Después de uso, no existe rollback destructivo autorizado.

### Secuencia exacta del recovery futuro

Cada etapa remota debe ejecutarse desde el futuro entrypoint único. La tabla
indica el script/RPC exacto que debe envolver ese runner; no autoriza invocarlo
directamente.

| # | Responsable | Etapa y target exacto | Resultado exigido | Gate / aborto |
|---:|---|---|---|---|
| 1 | `AUTOMATIC` | `create_or_reconcile_price_refresh_cycle_v1` | cycle ID + receipt ligados a identidad local | permiso `allow_create_remote_cycle`; timeout se reconcilia |
| 2 | `JOHAN` | Abrir Edge visible con CDP; cargar PSDeals y resolver challenge | endpoint CDP utilizable | captcha nunca automático |
| 3 | `AUTOMATIC` | `collect-psdeals-listing-edge-live-cdp.mjs` con URL recently-added | listing + evidence en workspace | cap/stop y 0 páginas fallidas |
| 4 | `AUTOMATIC` | `analyze-psdeals-listing-new-v2.mjs` | set nuevo hash-linked | más de 200 = revisión manual |
| 5 | `AUTOMATIC` | `import-psdeals-detail-local.mjs` para nuevos | summary, receipt y failures | ciclo/parent evidence/autorización obligatorios |
| 6 | `MANUAL GATE` | Reconciliar import recently-added | 0 pendientes o decisión fail-closed | no cache intermedia por defecto |
| 7 | `AUTOMATIC` | `collect-psdeals-listing-edge-live-cdp.mjs` con URL discounts y cap 1000 | listing discounts final | completitud fuerte obligatoria |
| 8 | `AUTOMATIC` | Validación manifest/evidence | `listing_complete=true` | cualquier ambigüedad = abort sin writes posteriores |
| 9 | `AUTOMATIC` | upsert stage receipt-bound | conteos request/affected exactos | permiso `allow_stage_upsert` |
| 10 | `AUTOMATIC` | `analyze-psdeals-discounts-fast-refresh-v1.mjs` | must, PS Plus, stale, skipped, combined + evidence | mismo listing/hash/ciclo |
| 11 | `AUTOMATIC` | `import-psdeals-detail-local.mjs` sobre combined | summary + failures + receipt | permiso `allow_detail_import` |
| 12 | `AUTOMATIC` | mismo importer, una sola vez, sobre failures | retry summary + pendientes | pendientes > 0 = ciclo no successful |
| 13 | `AUTOMATIC` | rama Monthly aislada | evidence/receipt Monthly del mismo ciclo o `not_due` explícito | write sin evidencia/autorización = abort |
| 14 | `AUTOMATIC` | `analyze-psdeals-ended-discounts-from-listing-v1.mjs` | seguros + bloqueados + evidence | blockers fuerzan `partial` |
| 15 | `AUTOMATIC` | detail refresh de bloqueados con importer | detalle actualizado | no convierte candidato automáticamente |
| 16 | `AUTOMATIC` | volver a ejecutar ended analyzer sobre el mismo listing | set final canónico, hash y count | blockers restantes = no demotion/certificación |
| 17 | `AUTOMATIC` | `apply_psdeals_ended_deals_v2` | receipt committed, affected exacto | `can_demote`; v1 prohibido |
| 18 | `AUTOMATIC` | validadores locales + read-only remoto | receipts completos, invariantes y payloads | contradicción/timeout = reconciliar |
| 19 | `AUTOMATIC` | `mark_psdeals_price_refresh_cycle_succeeded_v1` | receipt committed y ciclo succeeded | `can_mark_succeeded=true` |
| 20 | `AUTOMATIC` | `certify_price_refresh_cycle_v3` | receipt de certificación; mínimos prospectivos coherentes | `can_certify=true` |
| 21 | `MANUAL GATE` | Revisión completa del ciclo antes de publicación | aprobación visible para cache | no reutilizar autorización anterior |
| 22 | `AUTOMATIC` | `refresh_catalog_public_cache_v16` | receipt terminal y cache materializada | `can_refresh_cache=true`; v15 prohibido |
| 23 | `CHATGPT REVIEW` | Postchecks Supabase read-only | counts, fechas, nulls, extremos, Monthly y ended válidos | discrepancia = no declarar éxito |
| 24 | `CODEX` | Validación pública acotada de home/catalog/deals y muestras | evidencia de contenido, sin warm-up masivo | no recorrer todos los slugs |
| 25 | `CHATGPT REVIEW` | Vercel read-only posterior | ISR Writes, CPU, errores y rutas | crecimiento incompatible = NO-GO diario |
| 26 | `AUTOMATIC` | Guardar métricas/manifest final mediante target aprobado | ledger terminal reconciliable | permiso `allow_record_metrics` |
| 27 | `JOHAN` | Aceptar o rechazar el resultado | cierre humano | nunca inicia prueba de 30 días |

El future runner debe construir process specs con `shell=false`, entorno
allowlisted, timeout y límites de stdout/stderr. Los artifacts esperados están
bajo `<WORKSPACE>/artifacts` y las evidence envelopes bajo
`<WORKSPACE>/evidence`; logs nunca sustituyen evidence.

### Autorizaciones futuras

Cada stage necesita exactamente una autorización vigente, ligada a local cycle
y hash del run token. Permisos definidos en código:

```text
allow_create_remote_cycle
allow_collect_listing
allow_stage_upsert
allow_analyze_detail_candidates
allow_detail_import
allow_detail_retry
allow_monthly_record
allow_analyze_ended_deals
allow_apply_demotion
allow_remote_cycle_validation
allow_mark_succeeded
allow_certify
allow_refresh_cache
allow_public_validation
allow_record_metrics
```

Los efectos remotos además exigen `project_ref=vlxkoprpobfevxefizwr`, modo
`operational`, `dry_run=false`, confirmación exacta por acción y ambiente
`LOBODEALS_REMOTE_EXECUTION=EXPLICITLY_AUTHORIZED`. Estos strings son gates de
código, no consentimiento del usuario.

### Postchecks y muestras

Después de cache v16, validar como mínimo:

- cycle, receipts, hashes, request/affected counts e idempotency keys;
- total de stage/cache y fecha máxima de actualización;
- ofertas regulares y PS Plus activas, con el entitlement Monthly separado sin
  vetar ofertas comerciales independientes del mismo producto;
- cero descuentos `>=100`, cero precios incoherentes y cero expirados activos;
- cero mínimos no certificados o pertenecientes a otro ciclo;
- cero mínimos PS Plus originados en entitlement Monthly, buy-box PS+ `0` o
  `temporary_free_promotion_candidate`;
- una muestra de Game, Bundle, DLC/Add-on, PS Plus, Monthly, producto sin deal,
  deal finalizado y caso de la clase Hollow Knight;
- home, catalog y deals; solo slugs de la muestra, sin crawler/warm-up;
- errores Vercel y consumo posterior read-only.

### Reconciliación, abortos y recuperación

- Timeout no significa éxito ni fallo: leer cycle y receipt por idempotency key
  antes de reintentar.
- Listing parcial, ID inválido, parent hash distinto, import pendiente,
  Monthly no verificado, blocker de ended deals o count discrepante detiene el
  ciclo.
- Antes de demotion/cache, conservar el último dato público válido; no publicar
  parcial.
- Después de una escritura stage, reanudar/reconciliar el mismo ciclo; no crear
  otro para esconder el fallo.
- Después de demotion, no ejecutar v1 ni una reversión masiva. Corregir mediante
  un ciclo certificado posterior si fuera necesario.
- Después de cache v16 terminal, un replay idéntico debe reconciliar el receipt;
  nunca repetir a ciegas.
- No hay cambio Vercel durante el recovery y no hay rollback Vercel.
- Prohibidos `CASCADE`, borrado de histórico, invocación directa de refresh v15,
  warm-up de slugs,
  push y deploy.

### Rollout pendiente de FASE 0

Las migraciones locales 008 y 009 y el frontend con `has_verified_*` no están
aplicados ni aprobados para producción. Cuando exista autorización explícita,
el orden obligatorio es:

1. aplicar 008;
2. aplicar 009;
3. ejecutar el postcheck 009 read-only;
4. ejecutar por separado el recovery de Big Walk sólo si se autoriza;
5. completar un Daily Runner nuevo con preflight v24 y cache v19;
6. verificar en live los stamps de Stage, los flags `has_verified_*` y `/deals`;
7. sólo entonces permitir commit, push o deploy del frontend.

El default `false` de `has_verified_*` no es un backfill. Desplegar el frontend
antes del nuevo Daily Runner ocultaría temporalmente las ofertas públicas.

### Condiciones GO

Todas deben ser verdaderas:

- runner único operacional integrado y probado con fakes, replay y timeout;
- recently-added y discounts usan las URLs canónicas y evidence hash-linked;
- Edge/CDP visible y captcha resuelto por Johan;
- project ref, esquema, funciones y ACL confirmados read-only;
- migración 007 aplicada y v1 no ejecutable por `service_role`;
- listing fail-closed, Monthly y safe demotion integrados;
- cache v16 integrada y postchecks aprobados;
- Vercel con margen o capacidad explícitamente aprobada, cero warm-up;
- rollback/reconciliación aplicable y autorizaciones visibles vigentes.

### Condiciones NO-GO

Cualquiera basta: Vercel en riesgo de pausa; listing incompleto; runner roto;
import inseguro; pendientes después de retry; demotion no integrada; cache
incompatible; proyecto/esquema dudoso; operación no idempotente; timeout sin
reconciliar; falta de recovery aplicable o autorización.

Al 2026-08-02 safe demotion, migración 007, identidad del ciclo, registry 23/23,
Edge/CDP runtime y polling de captcha están corregidos. Solo falta renovar la
evidencia manual Vercel y recibir una Autorización B nueva. El recovery no debe
ejecutarse con este documento.
