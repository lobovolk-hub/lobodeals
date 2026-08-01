# LoboDeals 3.2 — Inventario de scripts

Fecha: 2026-08-01

Esta auditoría cubre todos los entrypoints de `scripts/` al inicio del paquete.
Se buscaron llamadas desde `package.json`, PowerShell, imports, documentación y
tests. La ausencia de una referencia literal no bastó para borrar un script: se
evaluó también su valor operativo, diagnóstico, de seguridad o recovery.

| Script | Acción | Razón | Reemplazo o contrato vigente |
|---|---|---|---|
| `analyze-active-deals-missing-from-discounts-v2.mjs` | ELIMINADO | 0 package, 0 PowerShell, 0 imports, 0 tests; consultaba cache activa sin evidencia cycle-bound | ended analyzer + selector puro `psdeals-ended-discounts.mjs` |
| `analyze-psdeals-discounts-refresh-candidates-v2.mjs` | ELIMINADO | 0 package, 0 PowerShell, 0 imports, 0 tests; refrescaba todo el listing y fue superado | `analyze-psdeals-discounts-fast-refresh-v1.mjs` |
| `analyze-psdeals-discounts-fast-refresh-v1.mjs` | CONSERVADO | Llamado por el wrapper discounts y cubierto por suites de fast refresh | vigente para colas acotadas; requiere integración certificada |
| `analyze-psdeals-ended-discounts-from-listing-v1.mjs` | CONSERVADO | Productor actual de evidencia ended; usa selector puro probado | integrar obligatoriamente en el runner |
| `analyze-psdeals-listing-new-v2.mjs` | CONSERVADO | Llamado por recently-added | vigente, pendiente de revalidación real |
| `apply-psdeals-ended-discounts-safe-demotion-v1.mjs` | CONSERVADO | Superficie histórica de preview; apply directo bloqueado y probado | RPC endurecido `apply_psdeals_ended_deals_v2`; v1 queda interno |
| `audit-price-history-dependencies-local.mjs` | CONSERVADO | Auditoría local reproducible de una decisión irreversible | `price-history-dependency-audit.mjs` |
| `audit-psdeals-listing-classification-local.mjs` | CONSERVADO | Diagnóstico offline de familias/plataformas | clasificadores compartidos actuales |
| `backfill-metacritic-score-v2.mjs` | CONSERVADO | Llamado por el PowerShell semanal; flujo separado de precios | `run-metacritic-weekly-14d.ps1` |
| `build-psdeals-migration-004-recovery-bundle.mjs` | CONSERVADO | Recovery verificable de migración aplicada; no forma parte del runner | bundle 004 preservado |
| `collect-psdeals-listing-edge-live-cdp.mjs` | CONSERVADO | Collector común de ambos wrappers; productor de evidencia probado | único collector listing vigente |
| `collect-psstore-official-deals-edge-live.mjs` | CONSERVADO | Diagnóstico/fuente oficial histórica; no está en el runner principal | revisión futura de disponibilidad/deals oficiales |
| `debug-psdeals-relations-block.mjs` | CONSERVADO | 0 llamadas, pero diagnóstico local único de bloques de relaciones HTML | no hay reemplazo demostrado; no cumple regla de borrado |
| `dry-run-psdeals-updater-local.mjs` | CONSERVADO | Script npm y suite integral sin efectos | dry-run canónico local |
| `import-psdeals-detail-local.mjs` | CONSERVADO | Llamado por tres pasos PowerShell; productor/importer actual con gate | puerto operativo cycle-bound pendiente |
| `preflight-psdeals-block4-local.mjs` | CONSERVADO | Script npm; demuestra readiness local sin conexiones | preflight canónico Bloque 4 |
| `preflight-psdeals-remote-readonly.mjs` | CONSERVADO | Evalúa facts remotos redacted sin abrir conexiones | preflight read-only futuro |
| `probe-edge-live-cdp.mjs` | CONSERVADO | Diagnóstico de sesión CDP necesario para recovery operativo | sin reemplazo demostrado |
| `probe-edge-live-direct-cdp.mjs` | CONSERVADO | Diagnóstico directo de CDP/challenge | sin reemplazo demostrado |
| `probe-psdeals-detail-edge-live-cdp.mjs` | CONSERVADO | Diagnóstico acotado del parser de detalle | importer real |
| `reconcile-psdeals-detail-batch.mjs` | CONSERVADO | Recovery read-only de lotes interrumpidos; no es runner normal | reconciliación cycle-bound futura |
| `record-psdeals-monthly-evidence-offline.mjs` | CONSERVADO | Registra evidencia mensual sin aplicar cambios | etapa monthly del ciclo |
| `refresh-catalog-public-cache-v15.mjs` | CONSERVADO | Superficie legacy bloqueada antes de cliente; tests la exigen | cache v16 receipt-bound |
| `run-metacritic-weekly-14d.ps1` | CONSERVADO | Wrapper semanal separado de precios | flujo Metacritic existente |
| `run-psdeals-certified-cycle.ps1` | CONSERVADO | Wrapper seguro para comandos locales/fixture; probado | runner certificado futuro |
| `run-psdeals-cycle.mjs` | CONSERVADO | Runner reanudable probado con adapters fake/operational gates | núcleo del runner futuro |
| `run-psdeals-edge-live-discounts-fast-refresh.ps1` | CONSERVADO | Wrapper histórico funcional; auditado, no reautorizado | debe conectarse al ciclo y quitar cache v15 |
| `run-psdeals-edge-live-recently-added.ps1` | CONSERVADO | Wrapper histórico funcional; auditado, no reautorizado | debe conectarse al ciclo y quitar cache v15 |
| `run-psdeals-updater-orchestrator-local.mjs` | CONSERVADO | Script npm; simulación canónica sin efectos | no es runner operativo |
| `validate-psdeals-cycle-offline.mjs` | CONSERVADO | Validador de manifest y gates | validación previa a efectos remotos |

Resultado: 2 eliminados, 28 conservados. Los eliminados tenían reemplazo
identificado y cero función de recovery; Git conserva su historial. Los scripts
con cero llamadas pero valor diagnóstico/recovery permanecen hasta demostrar un
reemplazo y pruebas equivalentes.
