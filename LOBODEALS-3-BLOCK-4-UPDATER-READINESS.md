# LoboDeals 3.2 — Readiness del actualizador del Bloque 4

Fecha: 2026-08-01

Este documento resume el estado local demostrado después de la migración 006.
No declara implementado el runner diario, no autoriza operaciones remotas y no
inicia la prueba de 30 días.

## Estado post-006

- Histórico detallado retirado con `DROP TABLE ... RESTRICT`.
- Migración 006: versión `20260801030244`.
- SHA-256: `e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4`.
- Postcheck: 13/13; cero residuos.
- Filas retiradas: 841.549.
- Tamaño: 440.741.011 → 166.841.491 bytes.
- `STORAGE_READY=true`, limitado a capacidad y retirada verificadas.
- Mínimos compactos: infraestructura lista, datos todavía vacíos.

## Mapa de capacidades

| # | Capacidad | Estado | Contrato demostrado / hueco principal |
|---:|---|---|---|
| 1 | Adquisición del listing | PARTIAL | Collector existente; falta orquestación diaria real. |
| 2 | Paginación y completitud | PARTIAL | Evidencia y gates locales; falta prueba de un listing real post-006. |
| 3 | Normalización comercial | READY | Precios, porcentajes y razones fail-closed compartidos. |
| 4 | Identidad del producto | READY | IDs, slug y URL validados en payloads parciales. |
| 5 | Tipos y plataformas | READY | Mapeo explícito; orden canónico `PS5, PS4`; ambiguos omitidos. |
| 6 | Parsing de precio regular | READY | Señales estructuradas y casos inválidos observables. |
| 7 | Parsing de PS Plus | READY | Buy box actual prevalece; histórico no se usa como oferta vigente. |
| 8 | Descuentos 1–99 | READY | Fórmula exacta, precios positivos y original mayor que actual. |
| 9 | Exclusiones inseguras | READY | 0%, 100%, FREE, null, extremos y monthly no certifican regular. |
| 10 | Fast refresh | READY | Colas independientes, limitadas y deduplicadas. |
| 11 | Recheck/import de detalle | PARTIAL | Adaptadores y gates existen; falta ejecución controlada integrada. |
| 12 | Ofertas terminadas | PARTIAL | Análisis y selección seguros; aplicación real permanece bloqueada. |
| 13 | Ciclo remoto | PARTIAL | Contratos y workspace existen; no se ha creado un ciclo real. |
| 14 | Recibos | PARTIAL | Cadena local y contratos remotos definidos; sin recibos reales post-006. |
| 15 | Candidates | PARTIAL | Builders y validaciones disponibles; tabla remota sigue vacía. |
| 16 | Certificación v3 | PARTIAL | SQL y validadores presentes; nunca ejecutada en un ciclo real. |
| 17 | Mínimos compactos | PARTIAL | Reglas estrictas probadas; cuatro columnas siguen vacías. |
| 18 | `first_seen` | PARTIAL | Contrato probado; falta primera observación certificada real. |
| 19 | Caché pública | PARTIAL | Ruta v16 enlazada a recibos preparada; refresh real no autorizado. |
| 20 | PS Plus mensual | PARTIAL | Contrato auditado; comprobación y actualización continúan manuales. |
| 21 | Finalización del ciclo | PARTIAL | Gates y transiciones puras; falta ejecución remota integrada. |
| 22 | Aislamiento de fallos | READY | Veinte escenarios adversos fail-closed, retry máximo uno. |
| 23 | Retry operativo | PARTIAL | Política demostrada; falta conexión segura al runner futuro. |
| 24 | Observabilidad | PARTIAL | Evidencia, ledger y preflight locales; faltan métricas de ciclo real. |
| 25 | Runner diario certificado | BLOCKED | No existe orquestación integral autorizada ni validada contra un ciclo real. |

Resumen: 9 `READY`, 15 `PARTIAL`, 0 `MISSING`, 1 `BLOCKED`.

El mapa anterior describe readiness operacional. De forma independiente, la
orquestación integral offline está cerrada y permite
`BLOCK_4_CODE_READY=true`; no cambia ningún `PARTIAL/BLOCKED` remoto.

## Gates de ejecución

Toda futura mutación remota debe presentar un execution intent válido con:

- modo `operational`;
- proyecto exacto;
- acción explícita y confirmada;
- autorización identificada;
- `local_cycle_id`;
- UUID remoto cuando la acción no sea creación;
- `dry_run=false`;
- entorno no-test;
- `LOBODEALS_REMOTE_EXECUTION=EXPLICITLY_AUTHORIZED`.

El importador valida antes de leer credenciales o crear el cliente. La
democión directa legacy y el refresh directo v15 están deshabilitados; la
futura caché debe recorrer el contrato v16 enlazado a recibos.

## Comprobaciones locales

- `npm run dry-run:updater`
  - 24 fixtures;
  - 4 candidatos seguros;
  - 13 señales rechazadas;
  - 20 escenarios de fallo cerrados;
  - cero escrituras, conexiones o procesos.
- `npm run simulate:updater-cycle -- --scenario=happy-path --timestamp=2026-08-01T12:00:00.000Z`
  - 33 operaciones planificadas;
  - 0 operaciones ejecutadas;
  - 4 candidates y 4 decisiones de certificación;
  - 2 mínimos inicializados y 1 reducido;
  - 1 ended deal y 4 cambios de caché planificados;
  - 0 cambios monthly.
- `npm run preflight:block4 -- --tests-passed=452`
  - resultado `LOCAL_CODE_READY`;
  - cero blockers locales;
  - warning por capacidades operativas incompletas.
- `npm test`: 452/452.
- lint: cero errores; seis warnings preexistentes.

## Orquestador offline

Arquitectura:

- `psdeals-updater-orchestration-core.mjs`: hashes, identidad, ledger, state
  machine y schema;
- `psdeals-updater-orchestrator-local.mjs`: composición de contratos reales;
- `psdeals-updater-simulation-fixtures.mjs`: cinco escenarios deterministas;
- `run-psdeals-updater-orchestrator-local.mjs`: CLI sin red;
- `psdeals-ended-discounts.mjs`: selector puro compartido con producción.

Invariants:

- modo exacto `simulation`;
- project ref ficticio y nunca productivo;
- timestamp y seed explícitos;
- SHA-256 e IDs deterministas;
- máximo un retry de detalle;
- candidate, receipt, familia e item coherentes;
- mínimos prospective-only, positivos y monotónicos;
- caché solo después de certificación simulada;
- monthly sin aplicación;
- `executed_writes=0` siempre;
- cero red, Supabase o procesos hijos.

## Próximo cambio local seguro

Auditar localmente la paridad entre las 33 operaciones del ledger de simulación
y los requests/receipts que producirían los adaptadores operativos. La
integración remota, certificación, democión y caché seguirán bloqueadas hasta
una autorización futura específica.
