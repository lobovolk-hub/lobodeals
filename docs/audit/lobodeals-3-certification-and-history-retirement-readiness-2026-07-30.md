# LoboDeals 3.2 — Certificación y retirada restrictiva del histórico

Fecha local: 2026-07-30 (America/Lima)

Resultado de esta sesión local del 2026-07-30: `PREPARED_NOT_APPLIED`

> Nota posterior: el contrato definitivo conserva Games, Bundles y
> DLC/Add-ons, admite descuentos coherentes de 1% a 99%, excluye 100% y limita
> cada candidate a 1.024 bytes. El contrato vigente está en
> `lobodeals-3-005-006-adversarial-review-2026-07-30.md`.
>
> Resolución remota posterior, 2026-07-31: 005 fue aplicada y verificada con
> resultado `GO`; 006 continúa sin aplicar, history sigue intacta y no se
> ejecutó ningún ciclo. Las referencias posteriores a migraciones pendientes
> describen el estado histórico al cierre de esta sesión local.

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

Cada grupo es todo-null o completo, referencia `price_refresh_cycles(id)` con retirada restrictiva, limita el JSON a 1.024 bytes y tiene un índice parcial por ciclo. Un slot antiguo puede permanecer, pero nunca es elegible para un ciclo diferente.

No es una tabla histórica. El número de filas no crece por observación. El máximo estructural es dos candidatos por fila stage. Con 32.890 filas, el techo textual conjunto es aproximadamente 64,24 MiB antes de overhead; las muestras combinadas proyectan aproximadamente 41,97 MiB. Debe medirse tras una aplicación futura antes del primer ciclo.

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

Al cierre de esta sesión local del 2026-07-30, ninguna migración había sido
aplicada.

## Validación local final

- `npm test`: 352/352;
- suites enfocadas de certificación, receipts, normalización, listing, payload, parser, compact minima y retirada: 122/122;
- `node --check`: todos los MJS modificados o creados;
- lint: 0 errores y las seis advertencias preexistentes;
- `git diff --check` y `git diff --cached --check`: aprobados;
- búsqueda de secretos y contratos PS Plus antiguos: sin hallazgos;
- búsqueda de operaciones prohibidas en 006: sin hallazgos;
- build omitido por instrucción.

## Gates al cierre local del 2026-07-30

- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `HISTORY_RETIREMENT_PREFLIGHT_READY=true` solo como diseño local revisable;
- `CERTIFICATION_FIX_REQUIRED=true` en remoto.

## Secuencia planeada al 2026-07-30

Revisión humana exacta de 005 y 006, seguida de una autorización separada para:

1. precheck remoto de solo lectura;
2. aplicar primero 005;
3. postcheck de 005;
4. repetir precheck de retirada y comprobar locks/actividad;
5. aplicar 006;
6. verificar ausencia de history y capacidad.

Eso no autoriza todavía un ciclo real, caché ni prueba de 30 días.

## Resolución remota posterior — 2026-07-31

Texto 3.2-0007 aplicó únicamente 005 al proyecto
`vlxkoprpobfevxefizwr`. Quedó registrada como versión `20260731052531`, nombre
`lobodeals_3_cycle_bound_price_certification`, fecha
`2026-07-31 05:25:31 UTC` y SHA-256
`2e631ebaabe809d8828690f25de4ae8b0b598f6faf0519e114e71f7bde2b7b96`.
El resultado transaccional y el postcheck fueron exitosos.

El postcheck verificó las ocho columnas candidatas completamente null, cuatro
constraints, dos FKs `RESTRICT`, dos índices parciales, el helper SHA y v3.
V1/v2 quedaron solo para `postgres`; v3 quedó solo para `service_role` y
`postgres`, con `SECURITY DEFINER` y `search_path=''`.

Database Size pasó de 440.683.667 a 440.741.011 bytes: crecimiento total
57.344 bytes. Stage/public creció 16.384 bytes por dos índices vacíos de 8.192
bytes; heap y TOAST de stage no crecieron. El margen aproximado frente a 500 MB
decimales es 59.258.989 bytes.

Stage conserva 32.890 filas; history conserva 841.549 filas y su tamaño
previamente medido de 273.907.712 bytes. Cycles, receipts, mínimos y candidates
siguen en cero. Monthly conserva 7 filas, 4 activas. La caché no fue
refrescada.

006 no fue aplicada ni registrada. History conserva sus cuatro índices, policy
y grants. No se ejecutó `DROP` ni ningún ciclo.

Readiness vigente:

- `MIGRATION_005_APPLIED=true`;
- `MIGRATION_005_POSTCHECK_PASSED=true`;
- `MIGRATION_006_UNTOUCHED=true`;
- `NO_CYCLE_EXECUTED=true`;
- `COMPACT_MINIMA_SCHEMA_READY=true`;
- `COMPACT_MINIMA_READY=false`;
- `STORAGE_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `CERTIFICATION_FIX_REQUIRED=false`;
- `REMOTE_006_READY_TO_APPLY=false`.

`CERTIFICATION_FIX_REQUIRED=false` significa únicamente que v3 está instalada
y verificada; no significa updater completo, ciclo listo, certificación
ejecutada, mínimos inicializados ni sistema operativo. No debe poblarse ningún
candidate mientras history siga presente. El siguiente gate es exclusivamente
el precheck remoto read-only de 006.

## Corrección local posterior al precheck 006 — 2026-07-31

El precheck remoto read-only del Texto 3.2-0009 terminó `NO-GO`, sin aplicar
006. Confirmó estructura exacta, cero dependencias externas y producción
compatible, pero encontró tres defectos en la preparación local:

1. consulta de dependencias inválida por cast de alias en `ORDER BY`;
2. ACL PostgreSQL 17 real de 32 entradas, con `MAINTAIN`, frente al contrato
   incompleto de 28;
3. postcheck sin cobertura integral de objetos 005 y datos conservados.

El commit local
`f6403701b18068bda6b3ba5daba241c38abf5469`
(`Harden restrictive history retirement validation`) corrige esos puntos.
006 ahora exige exactamente cuatro roles por ocho privilegios, grantor
`postgres`, cero grant options y cero drift. El precheck expone
`information_schema` y `aclexplode` por separado. El postcheck comprueba la
retirada completa, el registro de 006, los objetos 005, conteos operativos,
first-seen, candidates, monthly activas, cache `max(updated_at)` y capacidad.

Nuevo SHA-256 local de 006:

`e754bbd0beb5f1790f72d8e219fca239477bd25853fdee61758139fec9d96c34`

La validación local aprobó 375/375 pruebas y 84/84 enfocadas; lint mantuvo cero
errores y seis advertencias preexistentes. No hubo SQL remoto ni mutaciones.

Readiness:

- `MIGRATION_006_DESTRUCTIVE_SCOPE_EXACT=true`;
- `MIGRATION_006_FAIL_CLOSED=true`;
- `POSTCHECK_006_COMPLETE=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_006_READY_TO_APPLY=false`;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`.

La siguiente tarea debe repetir exclusivamente el precheck remoto read-only
con los archivos corregidos. No existe autorización para aplicar 006.

## Resolución del error 42803 del precheck — 2026-07-31

Texto 3.2-0011 confirmó nuevamente toda la superficie esperada de history,
ACL, dependencias, producción y datos, pero terminó `NO-GO` porque la consulta
canónica 14 agrupaba el alias `grantee` sin materializar primero la expresión
basada en `grantee_role.rolname`. PostgreSQL 17 devolvió `42803`. No se aplicó
006 ni se realizó ninguna mutación.

Texto 3.2-0012 materializó las entradas en un CTE `effective_acl` y el SELECT
exterior agrupa ahora por `effective_acl.grantee`. El resultado conserva el
conteo y evidencia ordenada de los ocho privilegios, incluido `MAINTAIN`, así
como grantor, grant option y PUBLIC. Las 20 consultas canónicas permanecen
estrictamente read-only.

El commit técnico es `50d244c9d1eb0e82082992f9ea3e82708966b044`
(`Fix PostgreSQL 17 ACL precheck grouping`). La migración 006 no cambió y
mantiene SHA-256
`e754bbd0beb5f1790f72d8e219fca239477bd25853fdee61758139fec9d96c34`.
La validación aprobó 377/377 pruebas y 83/83 enfocadas; lint conservó cero
errores y seis advertencias preexistentes.

`HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`, pero
`REMOTE_006_READY_TO_APPLY=false`, `STORAGE_READY=false`,
`HISTORY_RETIRED=false` y `LIVE_CYCLE_READY=false`. Debe repetirse el precheck
remoto DB READ-ONLY completo antes de considerar una autorización DB WRITE
separada.

## Certificado machine-readable para MCP — 2026-07-31

Texto 3.2-0014 terminó `NO-GO` técnico porque Supabase MCP devolvió únicamente
el último result set del lote. La transacción read-only sí terminó sin errores
SQL o de transporte y la identidad de history permaneció estable, pero no era
posible auditar las veinte salidas intermedias desde la respuesta del conector.

El commit `9da0c16` (`Add machine-readable history retirement certificate`)
crea un certificado canónico de un único statement y un único snapshot:

`sql/validation/006-price-history-retirement-precheck-certificate-readonly.sql`

Devuelve veinte filas con `check_id` 1–20, `passed`, severidad, JSON observado
y esperado, backend PID, snapshot y timestamp comunes. Los checks consultan
directamente el catálogo y las tablas actuales y fallan cerrados ante drift.

Validación local: 389/389 globales, 31/31 de retirement, `node --check`, diff
checks y lint con cero errores/seis advertencias preexistentes. 006 no cambió,
no fue aplicada y no existe autorización DB WRITE. La ejecución remota del
certificado permanece pendiente en este checkpoint documental.

- `PRECHECK_CERTIFICATE_SINGLE_RESULT_SET=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_006_READY_TO_APPLY=false`;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`.

## Corrección estructural de los índices 006 — 2026-07-31

La corrida remota posterior demostró un falso positivo del certificado por
nombres. Sus 20 checks aprobaron, pero 006 abortó dentro de la transacción con
`PSDEALS_006_HISTORY_INDEXES_MISMATCH`; el rollback dejó las 841.549 filas y
273.907.712 bytes de history intactos, junto con policy, 32 ACL y cero registro
de 006.

La causa era local: los índices de búsqueda son compuestos y la migración
solo esperaba su primera key. El contrato corregido exige:

- pkey btree sobre `id`, primary/unique, `ASC NULLS LAST`;
- unique btree sobre `item_id`, `price_kind`, `observed_at`, `price_amount`,
  todo `ASC NULLS LAST`;
- item btree sobre `item_id ASC NULLS LAST`, `observed_at DESC NULLS FIRST`;
- kind btree sobre `price_kind ASC NULLS LAST`,
  `observed_at DESC NULLS FIRST`;
- todos valid/ready, sin INCLUDE, expresiones ni predicado.

El commit `462e7a343e762179fd39a74f69f60e9dabf1770a` protege la migración,
prechecks, certificado, postcheck y fixtures de drift. El SHA nuevo de 006 es
`e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4`
y reemplaza completamente el SHA autorizado anteriormente. La validación
local aprobó 392/392 y 34/34; lint mantuvo cero errores y seis advertencias
preexistentes.

Estado: `HISTORY_RETIRED=false`, `STORAGE_READY=false`,
`COMPACT_MINIMA_READY=false`, `LIVE_CYCLE_READY=false` y
`REMOTE_006_READY_TO_APPLY=false`. La próxima operación debe ser solo el
certificado remoto read-only corregido. No existe autorización para aplicar
este nuevo SHA.

## Corrección local posterior al error PostgreSQL 42883 — 2026-07-31

El certificado read-only con SHA
`a374d12f337cbe9c2cd80bc6cf1cfe65ee838e26c021fbafcf88876f18a92df`
fue rechazado antes de devolver sus veinte filas: `pg_attribute.attname`
produjo `name[]` mediante `array_agg`, mientras el check 5 comparaba contra
contratos `text[]`. La corrida no mutó datos y no aplicó 006.

La corrección local usa `attribute.attname::text` en keys e INCLUDE tanto en
el certificado como en el precheck diagnóstico. Mantiene arrays vacíos
`array[]::text[]`, los cuatro contratos compuestos y todas las gates del
check 5. El postcheck no contenía la incompatibilidad.

- commit técnico: `1c0186fff4ad85d1743d1d77817a38cfeb4d11ef`;
- certificado nuevo: SHA-256
  `986efa7ef4948329c3d08e2df5d0632c9a2dbb1afcc34ed4e45b5f09a8475f1a`,
  39.632 bytes;
- migración 006 intacta: SHA-256
  `e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4`,
  16.757 bytes;
- pruebas: 394/394 globales, 36/36 retirement y 100/100 migraciones
  enfocadas;
- lint: cero errores y seis advertencias preexistentes;
- Supabase/SQL remoto durante la corrección: ninguno.

Readiness local:

- `PRECHECK_CERTIFICATE_SINGLE_STATEMENT=true`;
- `PRECHECK_CERTIFICATE_STRICTLY_READ_ONLY=true`;
- `PRECHECK_CERTIFICATE_INDEX_ARRAY_TYPES_SAFE=true`;
- `PRECHECK_CERTIFICATE_INDEX_CONTRACT_COMPLETE=true`;
- `MIGRATION_006_LOCAL_HASH_MATCH=true`;
- `MIGRATION_006_UNCHANGED=true`;
- `POSTCHECK_006_COMPLETE=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_006_READY_TO_APPLY=false`;
- `HISTORY_RETIRED=false`;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `LIVE_CYCLE_READY=false`.

La siguiente operación debe ejecutar exclusivamente el certificado remoto
read-only con el SHA nuevo y detenerse. No existe autorización destructiva
vigente.
