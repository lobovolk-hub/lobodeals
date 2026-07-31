# LoboDeals 3.2 — Certificación y retirada restrictiva del histórico

Fecha local: 2026-07-30 (America/Lima)

Resultado local: `PREPARED_NOT_APPLIED`

## Baseline

- rama: `main`;
- HEAD inicial: `169c5870fce05f92fd9554a435cf22e6b5688ce4`;
- divergencia inicial: 45 delante y 0 detrás de la referencia local `origin/main`;
- worktree inicial: limpio;
- baseline: 311/311 pruebas aprobadas;
- evidencia remota heredada de Texto 3.2-0002: history con 841.549 filas y 273.907.712 bytes; 0 cycles, 0 receipts y 0 mínimos compactos.

No se consultó Supabase en esta sesión.

## Riesgo cerrado localmente

El contrato 003 podía combinar `listing_last_seen_at` nuevo con precios o clasificación conservados. El builder de listing omite una tupla comercial insegura, pero sí conserva identidad, título, `raw_listing_json` y el timestamp de presencia. Por eso el timestamp no demostraba por sí solo que precio, porcentaje, tipo y plataforma hubieran sido observados juntos.

El detalle tenía el mismo riesgo por propiedad parcial: `detail_last_synced_at` y `raw_detail_json` podían avanzar mientras campos inseguros se omitían. Además, una ausencia o fallo del marcador PS Plus terminaba representándose como `false`, sin distinguirlo de una observación negativa segura.

## Alternativas evaluadas

| Alternativa | Resultado |
|---|---|
| Solo columnas de procedencia sobre los precios públicos | Rechazada: seguiría permitiendo mezclar un valor público conservado con una marca nueva. |
| Tupla candidata separada en la misma fila | Seleccionada: separa precio público conservado de candidato certificable y mantiene crecimiento acotado por ítem. |
| Tabla de observaciones por ciclo | Rechazada para este alcance: recrearía crecimiento por observación y exigiría una retención/limpieza operativa adicional. |
| Solo hashes ligados al ciclo | Rechazada: el hash identifica bytes, pero no conserva el tuple comercial que SQL debe validar. |

## Contrato seleccionado

La migración local 005 añade dos slots sobrescribibles en `psdeals_stage_items`:

- regular:
  - `regular_certification_cycle_id`;
  - `regular_certification_observed_at`;
  - `regular_certification_evidence_sha256`;
  - `regular_certification_candidate`;
- PS Plus:
  - `ps_plus_certification_cycle_id`;
  - `ps_plus_certification_observed_at`;
  - `ps_plus_certification_evidence_sha256`;
  - `ps_plus_certification_candidate`.

Cada grupo es todo-null o completo, referencia `price_refresh_cycles(id)` con retirada restrictiva, limita el JSON a 4.096 bytes y tiene un índice parcial por ciclo. Un slot antiguo puede permanecer, pero nunca es elegible para un ciclo diferente.

No es una tabla histórica. El número de filas no crece por observación. El máximo estructural es dos candidatos por fila stage; los builders producen JSON pequeños, normalmente muy por debajo del límite. Con 32.890 filas, el crecimiento real esperado es de decenas de MiB si con el tiempo todos los ítems reciben ambos candidatos; el techo teórico de los dos JSON es aproximadamente 257 MiB antes de overhead, pero no representa el tamaño esperado. Debe medirse tras una aplicación futura antes del primer ciclo.

## Flujo regular

1. El collector conserva el porcentaje fuente negativo, normaliza precios/porcentaje y clasifica tipo/plataformas.
2. El upsert de listing recibe explícitamente `remote_cycle_id`, el timestamp único y el SHA-256 del artefacto listing.
3. El builder crea el candidato únicamente si el tuple completo es seguro.
4. Un tuple inválido conserva los precios públicos anteriores y no escribe candidato nuevo.
5. `certify_price_refresh_cycle_v3` solo lee el candidato cuyo cycle ID y timestamp coinciden, y cuyo hash coincide con un receipt `listing_validation` committed y complete.

Regular exige:

- US, PlayStation y USD;
- plataformas exclusivamente PS4/PS5;
- pares de tipo `game/game`, `bundle/bundle` o `dlc/addon`;
- no free-to-play;
- precios positivos, original mayor que actual;
- porcentaje entero 1–99;
- igualdad exacta con `round(100 * (original - current) / original)`;
- oferta observada como activa;
- tuple, clasificación, timestamp, ciclo y hash pertenecientes a la misma evidencia.

`-100%`, cero, FREE, demo, tipo ambiguo, plataforma legacy/desconocida y porcentaje incoherente quedan excluidos.

## Flujo PS Plus

El importer calcula SHA-256 sobre los bytes HTML de cada detalle y usa un único instante para `detail_last_synced_at` e `imported_at`. `raw_detail_json.ps_plus_evidence` distingue:

- `parsed_current_discount`;
- `parsed_not_discount`;
- `buy_box_absent`;
- `buy_box_unparseable`;
- parser de chart `parsed`, `absent` o `invalid`;
- coherencia entre buy box y chart.

Solo `parsed_current_discount` con fuentes coherentes crea candidato. Ausencia, HTML inesperado, precio ilegible o discrepancia no escriben `is_ps_plus_discount=false` ni candidato nuevo.

V3 exige además ciclo, ventana de detalle, hash válido, receipt detail committed sin fallos pendientes, USD, tipo/plataforma seguros, no free-to-play, Plus positivo y menor que el precio regular de la misma tupla, oferta activa y ausencia de monthly activo en el instante observado.

## Migración 005

Archivo:

`sql/005-lobodeals-3-cycle-bound-price-certification.sql`

La función nueva es `certify_price_refresh_cycle_v3(uuid, uuid, text, text, timestamptz)`.

Conserva:

- receipt `certify`;
- idempotencia;
- reconciliación de receipt existente;
- advisory lock;
- rollback del subbloque de mínimos antes de registrar un receipt fallido;
- monotonicidad;
- primera observación;
- preservación ante null o candidato inválido.

No delega a v1/v2. V1/v2 permanecen para compatibilidad histórica, pero 005 retira de `service_role` la ejecución de v2 y concede v3. Los adaptadores locales y allowlist futuros apuntan a v3. La migración 004 no fue editada.

## Migración 006

Archivo:

`sql/006-lobodeals-3-restrictive-price-history-retirement.sql`

Es transaccional, fija timeouts, toma `ACCESS EXCLUSIVE`, valida:

- identidad exacta de tabla persistente en `public`;
- ocho columnas y `numeric(10,2)`;
- cuatro constraints y cuatro índices;
- FK saliente verificada y cero FKs entrantes;
- cero triggers de usuario, reglas, vistas, materialized views, rutinas o publicaciones externas;
- cero dependencias externas después de excluir únicamente objetos propiedad de la tabla;
- RLS habilitado;
- policy pública de lectura exacta;
- grants amplios previamente observados.

Después retira intencionalmente la policy y grants verificados y finaliza con `DROP TABLE public.psdeals_stage_price_history RESTRICT`.

No contiene `CASCADE`, mutación masiva por filas, `TRUNCATE`, `VACUUM`, copia, backup, exportación ni backfill. No altera stage, cycles, receipts, monthly, cache, perfiles o tracked.

Las consultas futuras de precheck/postcheck están separadas en `sql/validation/` y son solo `SELECT`. No se ejecutaron.

## Caché

`catalog_public_cache` no contiene los cuatro mínimos; refresh v15/v16 no los propaga y el slug los consulta directamente desde stage. Esto no bloquea retirar history. Sí bloquea construir en home una fila pública “Lowest price ever” o un filtro equivalente en deals hasta una tarea posterior.

## Commits técnicos

- `9d10089806ea86f090210d86cb67a2bfb34ae6ca` — `Bind price certification evidence to refresh cycles`;
- `00ea4c74142388aeb54ffb158f32f459a3d1ab36` — `Prepare restrictive PSDeals history retirement`.

Ninguna migración fue aplicada.

## Validación local final

- `npm test`: 352/352;
- suites enfocadas de certificación, receipts, normalización, listing, payload, parser, compact minima y retirada: 122/122;
- `node --check`: todos los MJS modificados o creados;
- lint: 0 errores y las seis advertencias preexistentes;
- `git diff --check` y `git diff --cached --check`: aprobados;
- búsqueda de secretos y contratos PS Plus antiguos: sin hallazgos;
- búsqueda de operaciones prohibidas en 006: sin hallazgos;
- build omitido por instrucción.

## Gates

- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `HISTORY_RETIREMENT_PREFLIGHT_READY=true` solo como diseño local revisable;
- `CERTIFICATION_FIX_REQUIRED=true` en remoto.

## Siguiente gate

Revisión humana exacta de 005 y 006, seguida de una autorización separada para:

1. precheck remoto de solo lectura;
2. aplicar primero 005;
3. postcheck de 005;
4. repetir precheck de retirada y comprobar locks/actividad;
5. aplicar 006;
6. verificar ausencia de history y capacidad.

Eso no autoriza todavía un ciclo real, caché ni prueba de 30 días.
