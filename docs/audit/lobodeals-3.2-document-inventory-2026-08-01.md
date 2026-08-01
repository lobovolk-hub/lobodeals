# LoboDeals 3.2 — Inventario documental completo

Fecha: 2026-08-01

Clasificación: esta auditoría es evidencia, no instrucciones operativas.
`O/H/R` indica valor operativo, histórico y de recovery (`alto`, `medio`,
`bajo` o `ninguno`). Las referencias entrantes se midieron antes de consolidar;
ningún documento activo tenía referencias por nombre desde otro archivo.

## Documentos presentes al inicio

| Ruta | Título / versión | Propósito y referencias | Información única | Contradicciones | O/H/R | Clasificación y acción |
|---|---|---|---|---|---|---|
| `AGENTS.md` | Reglas operativas / sin versión | Guardrails; 0 entrantes | Restricciones de ejecución | No fijaba identidad ni fuentes | alto/medio/medio | `ACTIVE`: transformar en entrada 3.2 |
| `README.md` | Create Next App / sin versión | Onboarding genérico; 0 | Ninguna de producto | Presentaba un starter genérico | bajo/bajo/ninguno | `MERGE_THEN_DELETE`: reemplazar por puntero 3.2 |
| `CLAUDE.md` | `@AGENTS.md` | Compatibilidad de agente; 0 | Delegación a guardrails | Ninguna | medio/bajo/bajo | `PRESERVE_SECURITY_CONTRACT` |
| `LOBODEALS-3-CONTINUITY.md` | Continuidad 3.2 | Fuente anterior; 0 | Decisiones, incidentes y checkpoints | Diario de 2.675 líneas; estados vencidos | alto/alto/alto | `MERGE_THEN_DELETE`: condensar como `LOBODEALS-CONTINUITY.md` |
| `LOBODEALS-3-BLOCK-4-UPDATER-READINESS.md` | Readiness 3.2 | Estado Bloque 4; 0 | Mapa de 25 capacidades | Se volvería status paralelo | medio/medio/medio | `MERGE_THEN_DELETE`: migrar a status/system/continuity |
| `LOBODEALS-3-UPDATER-OFFLINE-SIMULATION.md` | Simulación 3.2 | Guía offline; 0 | Contrato y límites del simulador | Podía parecer operación paralela | bajo/medio/medio | `MERGE_THEN_DELETE`: migrar a system/operations |
| `docs/audit/lobodeals-3-005-006-adversarial-review-2026-07-30.md` | Revisión 005/006, 3.2 | Evidencia forense; 0 | Defectos, hashes, aplicación y postchecks | Checkpoints intermedios vencidos | bajo/alto/alto | `PRESERVE_HISTORICAL_EVIDENCE`; añadir banner histórico |
| `docs/audit/lobodeals-3-certification-and-history-retirement-readiness-2026-07-30.md` | Readiness history, 3.2 | Dossier paralelo; 0 | Secuencia evolutiva duplicada | Gates intermedias falsas hoy | ninguno/medio/bajo | `MERGE_THEN_DELETE`: migrar hechos finales a continuidad/auditoría 005/006 |
| `docs/audit/lobodeals-3-compact-price-retention-readiness-2026-07-30.md` | Retención compacta, 3.2 | Decisión irreversible; 0 | No backup/backfill y ownership | Resultado `NO-GO` es histórico | bajo/alto/medio | `PRESERVE_HISTORICAL_EVIDENCE`; marcar histórico |
| `docs/audit/lobodeals-3-cycle-migration-004-application-plan-2026-07-29.md` | Plan 004, 3.0 | Plan/aplicación; 0 | Orden y resultado 004 | Nombre 3.0 y comandos ya ejecutados | ninguno/medio/alto | `PRESERVE_RECOVERY`; bytes inmutables, clasificado por `docs/audit/README.md` |
| `docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30/README.md` | Recovery 004, 3.0 | Bundle de recuperación; 0 | Condiciones e integridad del recovery | Nombre 3.0; recovery no autorizado | bajo/alto/alto | `PRESERVE_RECOVERY`; bytes inmutables, clasificado por `docs/audit/README.md` |
| `docs/audit/lobodeals-3-price-history-retention-audit-2026-07-29.md` | Auditoría history, 3.0 | Evidencia read-only; 0 | Dependencias y consultas forenses | Describe tabla ya retirada | ninguno/alto/alto | `PRESERVE_HISTORICAL_EVIDENCE`; bytes inmutables, clasificado por `docs/audit/README.md` |

## Documentos ya eliminados pero relevantes en Git

Los ocho documentos v1.9 fueron eliminados por `4f826ac`. Git es su archivo;
no se restauran físicamente.

| Ruta histórica | Título / versión | Propósito, único y contradicción | O/H/R | Clasificación / reemplazo |
|---|---|---|---|---|
| `docs/DAILY-REFRESH-v1.9.md` | Daily Refresh 1.9 | Flujo de mayo y URLs; usa cache v15 y omite safe demotion | medio/alto/medio | `DELETE`; flujo migrado a Operations y auditoría |
| `docs/DB-SNAPSHOT-v1.9.md` | DB Snapshot 1.9 | Conteos/esquema de mayo; history y estados ya cambiaron | ninguno/medio/medio | `DELETE`; facts finales en Status/Continuity |
| `docs/HANDOFF-v1.9.md` | Handoff 1.9 | Dossier de contexto; duplica todos los documentos y está vencido | ninguno/bajo/bajo | `DELETE`; Continuity |
| `docs/NEW-CHAT-PROMPT-v1.9.md` | Prompt 1.9 | Reinicio de chat; identidad obsoleta | ninguno/bajo/ninguno | `DELETE`; AGENTS + Continuity |
| `docs/OPERATIONS-v1.9.md` | Operations 1.9 | Comandos históricos; cache v15, deploy y runners no autorizados | medio/medio/medio | `DELETE`; Operations 3.2 |
| `docs/ROADMAP-v1.9.md` | Roadmap 1.9 | Prioridades antiguas y history pendiente | ninguno/bajo/ninguno | `DELETE`; Roadmap 3.2 |
| `docs/STATUS-v1.9.md` | Status 1.9 | Estado de mayo; conteos y producción vencidos | ninguno/bajo/ninguno | `DELETE`; Current Status |
| `docs/SYSTEM-MAP-v1.9.md` | System Map 1.9 | Mapa histórico y componentes hoy retirados | bajo/medio/medio | `DELETE`; System Map 3.2 |

## Falsos positivos históricos

| Ruta | Versión / propósito | Referencias y contradicción | O/H/R | Clasificación |
|---|---|---|---|---|
| `STATE-v2.52l.md` | Steam/PC 2.52l | Sin referencias actuales; producto anterior | ninguno/bajo/ninguno | `FALSE_POSITIVE`; Git solamente |
| `STATE-v2.52n.md` | Estado transitorio 2.52n | Sin referencias actuales; producto anterior | ninguno/bajo/ninguno | `FALSE_POSITIVE`; Git solamente |
| `STATE-v2.52o.md` | Estado transitorio 2.52o | Sin referencias actuales; producto anterior | ninguno/bajo/ninguno | `FALSE_POSITIVE`; Git solamente |
| `STATE-v2.52p.md` | Steam/PC rotulado 2.52l | Sin referencias actuales; contradice PlayStation US | ninguno/bajo/ninguno | `FALSE_POSITIVE`; Git solamente |

## Resultado esperado

Activos: los siete documentos listados por `AGENTS.md`. `README.md` y
`CLAUDE.md` son punteros/contratos, no fuentes adicionales. Las auditorías
preservadas llevan una advertencia visible. No se crea `docs/archive`: Git ya
preserva los eliminados y las evidencias necesarias permanecen en
`docs/audit`.
