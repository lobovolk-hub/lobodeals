# LoboDeals 3.2 — Operaciones

Fecha de corte: 2026-08-01

Estado general: `AUDITED_BUT_NOT_REAUTHORIZED`.

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

Estado: `AUDITED_BUT_NOT_REAUTHORIZED`.

- Usar Microsoft Edge con remote debugging en `127.0.0.1:9222`.
- Johan resuelve el challenge/captcha en la pestaña visible.
- El runner descubre `/json/version` o `DevToolsActivePort`.
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

## Recovery Refresh — Awaiting Authorization

Estado: `NO_GO_AWAITING_INTEGRATION_AND_AUTHORIZATION`.

- `RECOVERY_REFRESH_GO=false`
- `RECOVERY_REFRESH_EXECUTED=false`
- `DAILY_RUNNER_READY=false`
- `DAILY_REFRESH_SAFE_FOR_VERCEL=false`

Este plan no es autorización. Los comandos y targets remotos son referencias
auditadas; no deben ejecutarse hasta que exista un runner operacional probado,
se cierren todas las gates y Johan emita permisos visibles y acotados.

### Identidad e inputs fijos

- Repositorio: `D:\Proyectos\lobodeals`, rama `main`.
- Supabase project ref esperado: `vlxkoprpobfevxefizwr`.
- Vercel project: `prj_xi25eHLsj4DNb9zy7P0v64xM4W1I`.
- Edge/CDP esperado: `http://127.0.0.1:9222/json/version` o el archivo
  `DevToolsActivePort` del perfil visible de Edge.
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

No existe `-Mode Operational`. `run-psdeals-cycle.mjs` declara expresamente que
ningún comando ejecuta red, collectors o efectos remotos. Por tanto, el
comando exacto del recovery productivo es hoy:

```text
BLOCKED — NO OPERATIONAL COMMAND EXISTS
```

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
| 3 | `CODEX` | Integrar el runner real y adapters faltantes | Código local; commit separado | no operación hasta tests end-to-end |
| 4 | `CHATGPT REVIEW` | Read-only de Supabase: project ref, esquema, RPCs, ACL, counts, cycles/receipts y cache | Ninguna escritura | proyecto/esquema dudoso = abort |
| 5 | `CODEX` | Evaluar facts redactados con `preflight-psdeals-remote-readonly.mjs` | JSON local `wx` | clasificación distinta de ready = abort |
| 6 | `CHATGPT REVIEW` | Read-only de Vercel: uso, errores, rutas y deployment | Ningún cambio Vercel | riesgo inmediato de pausa = abort |
| 7 | `MANUAL GATE` | Revisar/aplicar migración 007, si sigue siendo before-use | Cambio de esquema aditivo, solo con autorización separada | ciclos/receipts existentes o drift = abort |
| 8 | `CHATGPT REVIEW` | Confirmar v2 y que `service_role` no ejecuta v1 | Read-only | ACL incorrecta = abort |
| 9 | `JOHAN` | Emitir autorización stage-specific con expiración | Permiso, no efecto remoto por sí solo | falta/ambigüedad/expiración = abort |

La aplicación futura de 007 usa exclusivamente
`sql/007-lobodeals-3-safe-demotion-hardening.sql`. Su único recovery permitido
es `sql/recovery/007-lobodeals-3-safe-demotion-hardening-before-use.sql`, solo
si siguen vacías las tablas de ciclos y receipts. No usa `CASCADE`. Después de
uso, no existe rollback destructivo autorizado.

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
| 13 | `AUTOMATIC` | adapter Monthly aún faltante | evidence/receipt Monthly del mismo ciclo | ausencia o ambigüedad = no demotion |
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
- ofertas regulares y PS Plus activas, Monthly separado;
- cero descuentos `>=100`, cero precios incoherentes y cero expirados activos;
- cero mínimos no certificados o pertenecientes a otro ciclo;
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
- Prohibidos `CASCADE`, borrado de histórico, refresh v15, warm-up de slugs,
  push y deploy.

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

Al 2026-08-01 existen cuatro NO-GO independientes: runner operacional ausente,
migración 007 no aplicada, safe demotion no integrada y Vercel sin gate de
seguridad. El recovery no debe ejecutarse.
