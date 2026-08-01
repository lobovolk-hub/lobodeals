# LoboDeals 3.2 — Readiness de retención compacta de precios

> Historical reference only. Do not use for current operations. El `NO-GO`
> documentado aquí es un checkpoint anterior a las migraciones ya aplicadas.

Fecha local: 2026-07-30 (America/Lima)

Resultado: `NO-GO`

## Decisión definitiva

LoboDeals no conservará respaldo de `psdeals_stage_price_history` y no usará sus 841.549 filas para reconstruir mínimos.

Quedan descartados:

- JSONL, gzip, CSV, SQL dump, `pg_dump`, ZIP, espejo o copia remota;
- cualquier backfill de `lobodeals_lowest_*`;
- mínimos legacy en columnas alternativas;
- una retirada mediante `CASCADE`.

Los cuatro mínimos certificados comienzan vacíos. Solo observaciones válidas de ciclos futuros certificados pueden inicializarlos y, después, reducirlos con un precio estrictamente menor.

La presión de capacidad comunicada (`0,456/0,5 GB`) obliga a retirar físicamente el histórico antes del primer ciclo real. Esa retirada no se autoriza en esta sesión local.

## Estado inicial demostrado

- rama: `main`;
- HEAD: `6d45b60c96295b85ac26833ca7f708082e01e7fb`;
- divergencia: 43 commits delante y 0 detrás de la referencia local `origin/main`;
- worktree inicial: limpio;
- baseline: 302/302 pruebas aprobadas;
- espacio disponible en `D:`: 874.109.935.616 bytes (814,08 GiB).

## Clasificación del worktree heredado

| Superficie | Decisión | Motivo |
|---|---|---|
| Exportador JSONL/gzip, CLI y pruebas | descartar | Contradice la decisión de no crear respaldo; eran archivos sin rastrear y nunca se ejecutaron. |
| Auditor histórico de mínimos | adaptar | Se eliminó toda reconstrucción histórica y quedó como contrato puro de observaciones futuras. |
| Importer | conservar | Deja de parsear/escribir los resúmenes legacy `lowest_*`. |
| Stage payload | conservar | Protege los dos campos legacy y los cuatro certificados frente a productores listing/detail. |
| Página de detalle | adaptar | Consume exclusivamente `lobodeals_lowest_*` y los presenta como mínimos certificados. |
| Pruebas de retención | adaptar | Verifican propiedad, ausencia de writer runtime y terminología certificada. |
| Continuidad y este informe | adaptar | Sustituyen la propuesta anterior de exportación/backfill por la decisión 3.2. |

Los tres archivos de exportación estaban sin rastrear. Su eliminación no representa la retirada de código ya publicado y no produce un commit artificial de borrado.

El código y las pruebas conservados quedaron protegidos en `90031cf` (`Preserve certified price low ownership boundaries`).

Este informe canónico está bajo una regla `docs/**` de `.gitignore`; se añadió intencionalmente con `git add -f` solo esta ruta, sin modificar la regla ni incorporar otros documentos ignorados.

## Contrato local de mínimos futuros

El propietario persistido es `public.psdeals_stage_items` mediante:

- `lobodeals_lowest_regular_price_amount`;
- `lobodeals_lowest_regular_price_first_seen_at`;
- `lobodeals_lowest_ps_plus_price_amount`;
- `lobodeals_lowest_ps_plus_price_first_seen_at`.

`scripts/lib/psdeals-compact-minima.mjs` define una evaluación pura y fail-closed:

- exige `local_cycle_id`, identidad de ítem y timestamp explícitos;
- limita scope a US, PlayStation y USD;
- exige precio positivo, oferta activa y tipo/plataforma seguros;
- regular exige productor listing, descuento normalizado 1–99 y coherencia exacta;
- PS Plus exige productor detail, señal actual explícita y exclusión mensual;
- rechaza cero, negativos, FREE, `-100%`, monthly, scope inseguro y evidencia incompleta;
- inicializa un mínimo ausente;
- conserva el anterior ante importe igual, superior o inválido;
- sustituye únicamente con un importe estrictamente menor.

El módulo no lee archivos, no abre red y no contiene backfill ni agregación de historial.

## Escritores y consumidores locales

| Superficie | Estado demostrado |
|---|---|
| Writer del commit `06edcc1` | Histórico; escribía `psdeals_stage_price_history`. |
| Commit `c2e3281` | Retiró el writer detallado y el historial de charts. |
| Runtime actual en `app/` y `scripts/` | Sin `.from('psdeals_stage_price_history')` ni writer directo ejecutable. |
| Importer actual | No parsea los resúmenes legacy `lowest_price_amount` y `lowest_ps_plus_price_amount`. |
| Stage payload | Rechaza campos legacy y certificados como propiedad de listing/detail. |
| Detalle público | Lee los cuatro `lobodeals_lowest_*`; no usa los dos resúmenes legacy. |
| Certificación 003/004 | Único productor localmente demostrado de mínimos certificados futuros. |

Las referencias que permanecen en SQL histórico, documentación y pruebas son contrato/auditoría, no writers runtime.

## Gap adversarial de certificación

La revisión local de `sql/003-lobodeals-3-certified-price-lows.sql` demuestra un riesgo que debe cerrarse antes del primer ciclo:

1. regular valida rango 1–99 y relación máxima, pero no recalcula la igualdad exacta entre precios y porcentaje;
2. la función no exige evidencia explícita de tipo y plataforma seguros;
3. el payload listing puede omitir un tuple comercial ambiguo y aun actualizar `listing_last_seen_at`;
4. por ello 003 podría combinar un timestamp nuevo con precios anteriores.

Los builders actuales reducen escrituras inseguras, pero no sustituyen una gate remota del mismo ciclo. No se modificaron 003/004 ni se diseñó una migración nueva por suposición.

## Evidencia remota disponible y límites

No se consultó Supabase durante esta sesión. La última evidencia conservada, capturada el `2026-07-30T01:11:41.826225Z`, reporta:

- 841.549 filas en `psdeals_stage_price_history`;
- 273.907.712 bytes totales;
- 32.890 filas stage;
- cero mínimos certificados.

El uso `0,456/0,5 GB` fue aportado por Johan y no se revalidó aquí.

Todavía falta demostrar de nuevo, mediante auditoría remota de solo lectura:

- esquema, índices, FK, RLS, grants, triggers y dependencias actuales;
- conteo, tamaño y capacidad actuales;
- cero writers y consumidores remotos;
- cero jobs o funciones que dependan de la tabla;
- contrato remoto efectivo de certificación;
- efecto exacto de una retirada sin `CASCADE`.

Los facts anteriores orientan la siguiente auditoría, pero no autorizan una mutación.

## Gates

- `HISTORY_REMOTE_AUDIT_READY=false`;
- `ZERO_WRITERS_CONSUMERS_PROVEN=false`;
- `CERTIFICATION_CONTRACT_READY=false`;
- `HISTORY_RETIREMENT_MIGRATION_READY=false`;
- `HISTORY_RETIRED=false`;
- `STORAGE_READY=false`;
- `LIVE_CYCLE_READY=false`.

No se ejecutó exportación, backfill, migración, índice, `DELETE`, `TRUNCATE`, `DROP`, `CASCADE`, `VACUUM` ni `VACUUM FULL`.

## Validación local

- `npm test`: 311/311;
- suites enfocadas de mínimos, retention, payload y parser: 27/27;
- `node --check`: aprobado para todos los MJS modificados o creados;
- `npm run lint`: cero errores y seis advertencias preexistentes;
- `git diff --check`: aprobado;
- búsqueda runtime de writer directo: cero coincidencias;
- búsqueda de exportador/backfill descartado en `app/`, `scripts/` y `tests/`: cero coincidencias;
- búsqueda de secretos o rutas personales nuevas: sin hallazgos;
- no se ejecutó `next build`.

## Siguiente tarea segura

Realizar una auditoría remota estrictamente de solo lectura para:

1. revalidar identidad, esquema, tamaño y dependencias de `psdeals_stage_price_history`;
2. demostrar cero writers/consumidores/jobs actuales;
3. reconstruir el contrato efectivo de certificación y el gap de timestamp/precios;
4. definir la precondición verificable de una migración de retirada;
5. preparar localmente, sin ejecutar, una migración exacta sin backup ni `CASCADE` y sus comprobaciones fail-closed.

Solo una autorización crítica posterior podrá permitir la retirada física. Después deben verificarse la ausencia de la tabla y la capacidad disponible. Únicamente entonces podrá considerarse el primer ciclo real controlado.

El Bloque 4 no está cerrado y la prueba operativa de 30 días no comenzó.
