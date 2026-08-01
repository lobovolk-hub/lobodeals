# LoboDeals 3.2 — Guía de simulación integral del updater

Esta guía describe un flujo estrictamente offline. No es un dry-run remoto, no
abre Supabase y no habilita el runner diario.

## Comandos

Ayuda:

`npm run simulate:updater-cycle -- --help`

Happy path:

`npm run simulate:updater-cycle -- --scenario=happy-path --timestamp=2026-08-01T12:00:00.000Z`

JSON machine-readable:

`npm run simulate:updater-cycle -- --scenario=mixed-regular-plus --timestamp=2026-08-01T12:00:00.000Z --json`

Escenarios disponibles:

- `happy-path`;
- `adversarial-listing`;
- `retry-success`;
- `ended-deals`;
- `mixed-regular-plus`.

El CLI rechaza `--live`, `--real`, `--operational`, URLs, project refs,
credenciales, tokens y connection strings. Un output opcional solo puede
crearse dentro de `data/simulations` y nunca se sobrescribe silenciosamente.

## Contrato

Entradas: fixture, listing paginado, detalles, stage inicial, precios públicos,
mínimos iniciales, configuración, timestamp, project ref ficticio y seed.

Salidas: identidad/hash, resúmenes, colas, observaciones, planes de cycle,
receipts, candidates, certificación, mínimos, first_seen, ended deals, caché,
monthly, finalización y retry; ledger, warnings, blockers y contadores.

El manifest schema es versión 1. La misma entrada y timestamp lógico producen
bytes semánticamente idénticos. `executed_writes` siempre debe ser cero.

## Seguridad

- el núcleo y orquestador no importan `@supabase`, `createClient`, `fetch`,
  `child_process`, PowerShell ni navegadores;
- producción y simulación comparten las funciones puras reales;
- el ciclo UUID es ficticio y `remote_cycle_id` permanece null;
- no se reconstruyen mínimos desde history;
- monthly solo representa evidencia soportada y nunca aplica cambios;
- timeout termina en `requires_reconciliation`, no en éxito;
- caché antes de certificación y democión sobre listing incompleto fallan de
  forma cerrada.

## Interpretación

`BLOCK_4_CODE_READY=true` confirma que la cadena local está compuesta y
probada. No confirma conectividad, contratos remotos actuales, autorización,
datos reales, operación diaria ni capacidad de iniciar la prueba de 30 días.
