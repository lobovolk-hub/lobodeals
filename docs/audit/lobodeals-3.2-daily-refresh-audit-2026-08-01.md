# LoboDeals 3.2 — Auditoría del refresh diario

Fecha de corte: 2026-08-01, America/Lima
Alcance: reconstrucción local y read-only; no se ejecutaron collectors,
importadores, runners, Edge/CDP, captcha, SQL ni operaciones remotas.

## Dictamen

- `DAILY_REFRESH_FLOW_MAPPED=true`
- `RECENTLY_ADDED_FLOW_AUDITED=true`
- `DISCOUNTS_FLOW_AUDITED=true`
- `ENDED_DEALS_FLOW_AUDITED=true`
- `PUBLIC_CACHE_FLOW_AUDITED=true`
- `DAILY_RUNNER_READY=false`
- `RECOVERY_REFRESH_EXECUTED=false`

El flujo histórico puede reconstruirse, pero no existe hoy un comando real,
integrado y certificado que lo ejecute de principio a fin. Los wrappers de
PowerShell conservan la secuencia previa a los contratos de ciclo: llaman a
importadores sin identidad/evidencia/autorización de ciclo, no integran safe
demotion y todavía imprimen el refresh directo v15. El código moderno sí
contiene manifest, evidence envelopes, receipts, gates y RPCs v16, pero el CLI
real no está conectado: `run-psdeals-cycle.mjs` es deliberadamente offline y
`run-psdeals-certified-cycle.ps1` solo permite plan, preflight, status y resume
de fixture.

Por tanto, una autorización para “correr el wrapper antiguo” no produciría un
ciclo 3.2 válido. Antes de cualquier refresh real hay que unir el runner con los
adaptadores operativos y validar esa unión localmente.

## Fuentes examinadas

- Wrappers y scripts actuales bajo `scripts/`.
- Plan de 17 etapas en `scripts/lib/psdeals-cycle-plan.mjs`.
- Especificaciones de cinco productores en
  `scripts/lib/psdeals-producer-process-specs.mjs`.
- Fixtures, manifests, evidence envelopes, receipts y pruebas del Bloque 4.
- Artefactos acotados bajo `data/import/` y checkpoints bajo `config/`.
- Historia local de Git, sin fetch, incluidos los commits `9031ece`, `4cbe2f7`,
  `46699b2`, `91e0159`, `e5c0b2b`, `51cd55d`, `bf5077a` y `8483fb9`.
- Procedimiento histórico v1.9 recuperado desde Git.

No se usó la fecha del nombre de un archivo como prueba de ejecución. Cada
conclusión exige contenido, log, conteos, hashes o referencias explícitas.

## Secuencia operativa reconstruida

Los comandos indicados son referencias auditadas, no autorización para
ejecutarlos.

| # | Etapa | Implementación o referencia | Entrada | Salida / efecto | Gate y retry | Dependencia | Estado actual |
|---:|---|---|---|---|---|---|---|
| 1 | Cerrar Edge anterior | Paso manual histórico | Proceso Edge/CDP anterior | Cierre de proceso | Confirmar target exacto | Edge | `UNKNOWN` |
| 2 | Abrir Edge con CDP | Edge visible, puerto 9222 | URL canónica | Endpoint `/json/version` o `DevToolsActivePort` | Edge visible y perfil correcto | Edge | `PARTIAL` |
| 3 | Resolver challenge | Intervención de Johan | Pestaña visible | Sesión apta para PSDeals | Nunca automatizar captcha | Edge/captcha | `UNKNOWN` |
| 4 | Recolectar recently-added | `run-psdeals-edge-live-recently-added.ps1` → `collect-psdeals-listing-edge-live-cdp.mjs` | URL recently-added; cap 100; stop 3 páginas sin nuevos | Listing JSON/TXT local | Collector con stop incremental; sesión no verificada | Edge/CDP, PSDeals | `PARTIAL` |
| 5 | Detectar nuevos | `analyze-psdeals-recently-added-new-v1.mjs` | Listing + stage actual | Lista de URLs nuevas | Bloquea más de 200 faltantes | Supabase read-only | `PARTIAL` |
| 6 | Importar nuevos | `import-psdeals-detail-local.mjs` | Lista de URLs | Escrituras de detalle/stage | Hoy exige ciclo, parent evidence y autorización | Edge/Playwright, Supabase write | `BROKEN` en el wrapper |
| 7 | Caché intermedia histórica | Refresh v15 impreso por el wrapper | Stage actualizado | Mutación de `catalog_public_cache` | v15 directo está bloqueado; v16 exige receipt | Supabase write | `REPLACED` |
| 8 | Recolectar discounts | `run-psdeals-edge-live-discounts-fast-refresh.ps1` → collector | URL discounts; cap 1000 | Listing completo JSON/TXT | Debe producir evidencia fuerte de completitud | Edge/CDP, PSDeals | `PARTIAL` |
| 9 | Validar completitud | Manifest/evidence moderno | Listing, páginas, total, stop | Gate `listing_complete` | Fail-closed; no inferir por página repetida | Local | `READY`, no integrado al wrapper |
| 10 | Analizar discrepancias | `analyze-psdeals-discounts-fast-refresh-v1.mjs` | Listing + stage | Resumen y colas | Requiere listing enlazado | Supabase read-only | `READY` |
| 11 | Seleccionar must-refresh | Analyzer fast refresh | Cambios comerciales inequívocos | `must-refresh.txt` | Prioridad alta | Local/read-only | `READY` |
| 12 | Seleccionar PS Plus/stale | Analyzer fast refresh | Ambigüedad PS Plus + antigüedad | `ps-plus-recheck.txt`, `stale.txt`, `skipped.txt`, `combined.txt` | Límites 500/500 actuales | Local/read-only | `READY` |
| 13 | Refrescar detalles | `import-psdeals-detail-local.mjs` | `combined.txt` | Upserts + summary + failures | Exige remote cycle UUID, parent evidence y permiso acotado | PSDeals, Supabase write | `BROKEN` en el wrapper |
| 14 | Reintentar detalles | Mismo importer, una vez | Failures del intento inicial | Retry summary + pendientes | Un retry; pendientes cierran el ciclo | PSDeals, Supabase write | `BROKEN` en el wrapper |
| 15 | Analizar ended deals | `analyze-psdeals-ended-discounts-from-listing-v1.mjs` | Listing completo enlazado + stage con descuento | Candidates + evidence | Gate `listing_complete` | Supabase read-only | `READY`, no integrado |
| 16 | Reconsultar dudosos | Importador de detalle histórico/manual | Candidates ambiguos | Estado comercial actualizado | No demover sin resolución | PSDeals, Supabase write | `PARTIAL` |
| 17 | Safe demotion | RPC local `apply_psdeals_ended_deals_v2` (migración 007 aún no aplicada) vía adapter operativo | Candidates confirmados + ciclo | Demotion receipt-bound | Gate `can_demote`; idempotencia/reconciliación | Supabase write | `READY_NOT_APPLIED`, no integrado |
| 18 | Validar/certificar ciclo | Validadores y RPCs de ciclo | Evidencias y receipts completos | Estado succeeded/certified | `can_mark_succeeded`, `can_certify` | Supabase | `READY` en código, no integrado |
| 19 | Refresh final de caché | Camino v16 receipt-bound | Ciclo certificado | Nueva caché pública | Gate `can_refresh_cache`; v15 prohibido | Supabase producción | `READY` en código, no integrado |
| 20 | Postchecks y reporte | Invariantes DB + rutas públicas + métricas | Cache/ciclo final | Resultado verificable | Reconciliar timeout antes de retry | Supabase/Vercel read-only | `PARTIAL` |

## URLs canónicas reconstruidas

Recently-added:

```text
https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
```

Discounts:

```text
https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
```

## Evidencia local: recently-added

Último listing encontrado:

`data/import/psdeals-edge-live-recently-added-readonly-2026-07-03-13-04-15-2026-07-03T18-09-51-857Z.json`

- `collected_at`: 2026-07-03T18:09:51.858Z.
- Modo: `edge_live_authorized_direct_cdp`.
- 100 páginas pedidas y procesadas; 0 fallidas.
- Stop: `safety_cap_reached: safety_cap=100`.
- 33.041 resultados declarados; 3.600 items únicos recolectados.
- El analyzer generó 341 URLs nuevas en
  `psdeals-edge-live-recently-added-catchup-new-2026-07-03-13-04-15.txt`.
- El 4 de julio se partieron en siete archivos de 50, 50, 50, 50, 50, 50 y 41
  URLs.
- No se encontró log, receipt, summary ni referencia que pruebe que esos siete
  lotes fueron importados.

Clasificación: `COLLECTED=true`, `ANALYZED=true`, `IMPORTED=UNKNOWN`,
`APPLIED=UNKNOWN`, `VERIFIED=false`.

La recolección de 100 páginas no representa todo el catálogo, pero eso no es
por sí solo un defecto del flujo incremental recently-added. El defecto
probatorio es la ausencia de evidencia posterior de importación.

## Evidencia local: discounts del 6 de junio

Listing:

`data/import/psdeals-edge-live-discounts-fast-refresh-2026-06-06-15-59-53-2026-06-06T21-08-52-280Z.json`

- `collected_at`: 2026-06-06T21:08:52.281Z.
- Modo: `edge_live_authorized_direct_cdp`.
- 1.000 páginas pedidas, 160 procesadas, 5.531 items únicos y 5.552
  resultados declarados.
- Las páginas 156–160 repitieron la página activa 155; hubo 40 equivalentes
  duplicados y seis discrepancias de página activa.
- El formato antiguo deja `stop_reason` y `pages_failed` en `null`. Por ello no
  satisface la evidencia fuerte moderna aunque históricamente se tratara como
  final de listing.

Fast refresh:

- 5.531 recolectados, únicos y ya existentes.
- 0 nuevos; 31 `must`; 500 `stale`; 531 combinados; 5.000 skipped.
- Import inicial: 531 vistos, 441 actualizados, 90 fallidos, 0 insertados.
- Retry único: 90 vistos, 90 actualizados, 0 fallidos.

Ended deals:

- El analyzer encontró 23 candidatos entre 5.334 filas de stage con señal de
  descuento.
- Un import posterior vio y actualizó los 23 sin fallos.
- No se encontró un apply de safe demotion posterior para esos 23 candidatos.

Clasificación: `COLLECTED=true`, `STRONG_COMPLETENESS=false`, `ANALYZED=true`,
`DETAILS_IMPORTED=true`, `DETAIL_RETRY_COMPLETE=true`,
`ENDED_CANDIDATES_ANALYZED=true`, `ENDED_CANDIDATES_DETAIL_REFRESHED=true`,
`ENDED_DEMOTION_APPLIED=false`, `CYCLE_CERTIFIED=false`.

## Última safe demotion demostrable

El log
`data/import/psdeals-ended-discounts-safe-demotion-apply-2026-06-01-02-56-38.log`
registra modo apply, 1.406 candidatos seguros, 1.406 actualizados y 0 fallos.
Esa evidencia es histórica y anterior al bloqueo del camino directo; no
autoriza ni valida una ejecución actual. El script directo actual aborta con
`LEGACY_DIRECT_DEMOTION_DISABLED` antes de abrir el cliente.

## Caché pública

No existe un log standalone que pruebe por sí solo el último refresh. La
evidencia convergente en el checkpoint post-006 y los facts read-only previos
registra:

- 32.890 filas en `catalog_public_cache`.
- `max(updated_at) = 2026-06-06T21:52:17.916997Z`.
- La verificación posterior a 006 confirmó que ese valor seguía sin cambiar.

Conclusión: el último estado de caché demostrable corresponde al 6 de junio de
2026 a las 21:52:17Z. Los nombres de artefactos de julio no prueban un refresh
posterior. `PUBLIC_DATA_CURRENT=false`.

## Diferencia entre mayo y el código actual

El flujo de mayo era procedural: wrapper → collector/analyzer → importer →
SQL manual de caché. La recolección discounts se endureció, se añadió fast
refresh y retry, y la safe demotion apareció como paso manual separado. No
existían una identidad de ciclo obligatoria, cadena de evidence, receipts,
certificación ni mínimos compactos.

El código actual invierte la autoridad: los efectos remotos requieren ciclo,
permiso acotado y evidencia enlazada; la demotion y la caché son receipt-bound;
un listing parcial cierra las gates. Esa dirección es correcta, pero los
wrappers no fueron migrados y el runner certificado solo simula/inspecciona.
La brecha no está en un algoritmo aislado sino en la integración operativa.

## Riesgos y abortos obligatorios

- Listing discounts sin completitud fuerte: no upsert, no demotion, no
  certificación y no caché.
- Más de 200 nuevos en recently-added: detener y auditar antes de importar.
- Fallos después del único retry: ciclo no exitoso.
- Monthly, PS Plus ambiguo, deal futuro, precio original ausente/incoherente,
  identidad dudosa o candidato sin listing enlazado: no demover.
- Timeout de RPC/import/cache: reconciliar receipt y estado antes de reintentar;
  nunca asumir éxito ni fallo por el timeout.
- Vercel fuera de gate de cuota o estrategia ISR no aprobada: no refrescar
  caché pública.
- Cualquier diferencia de proyecto, revisión, run token, manifest o parent
  evidence: fail-closed.

## Trabajo requerido antes de autorizar un refresh

1. Conectar las 17 etapas del plan con los adapters reales, manteniendo los
   cinco process specs con `shell=false`, ambiente allowlisted y límites.
2. Incorporar recently-added al workspace/evidence del mismo ciclo o definir
   explícitamente su relación y receipt con el ciclo discounts.
3. Sustituir ambos wrappers históricos por una única entrada operacional que
   propague cycle ID, run token, code revision, parent evidence y permisos.
4. Integrar analyzer ended → refresh dudosos → reanálisis → selector puro → RPC v2 de demotion.
5. Integrar validación, certificación, caché v16, postchecks y reconciliación.
6. Probar reanudación, doble ejecución, timeouts ambiguos, límites de output y
   cada gate negativa con fakes; después hacer preflight remoto read-only.
7. Obtener una autorización separada y visible para collector, import/write,
   demotion, certificación y caché. Este informe no concede ninguna.
