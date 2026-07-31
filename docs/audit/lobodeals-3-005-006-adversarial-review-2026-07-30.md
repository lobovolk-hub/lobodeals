# LoboDeals 3.2 — Revisión adversarial de migraciones 005 y 006

Fecha local: 2026-07-30 (America/Lima)

Resultado: `LOCAL_APPROVED_REMOTE_NOT_APPLIED`

Este dossier reemplaza, para 005/006, las conclusiones de tamaño, tipos y ACL
del informe de preparación anterior. No autoriza ni registra una aplicación
remota.

Commit técnico:

- `3b89f1e` — `Harden PSDeals certification and history retirement`.

## 1. Baseline y alcance

- rama: `main`;
- HEAD inicial: `88732b037551ffcb491e0f1833d4f8b632834e79`;
- divergencia inicial: 48 delante y 0 detrás de la referencia local
  `origin/main`;
- worktree inicial: limpio;
- baseline: 352/352 pruebas;
- estado remoto heredado: 32.890 stage items, 841.549 filas de history,
  273.907.712 bytes de history, cero cycles, cero receipts y cero mínimos
  compactos;
- capacidad aportada previamente por Johan: 0,456/0,5 GB; no fue medida de
  nuevo en esta revisión.

No se ejecutó SQL remoto, RPC, Supabase, collector, importer, runner, ciclo,
certificación, caché, monthly, democión, push ni deploy.

## 2. Defectos encontrados y correcciones

La revisión adversarial encontró defectos reales en los borradores originales:

1. dos JSON de 4.096 bytes por 32.890 filas permitían 269.434.880 bytes
   teóricos antes de overhead;
2. los JSON aceptaban claves adicionales, incluido contenido raw;
3. el hash guardado identificaba el artefacto fuente, no el tuple candidato;
4. PS Plus no ligaba el candidato al hash exacto de la cola importada;
5. `dlc/addon` agrupaba contenido auxiliar heterogéneo;
6. el check SQL de plataformas aceptaba duplicados y orden inverso;
7. 005 no reafirmaba todas las ACL legacy contra drift;
8. JavaScript calculaba el porcentaje con importes binarios, no cents;
9. SQL no repetía el límite certificado de relación 20:1;
10. 005 no tenía timeouts ni pre/postchecks separados;
11. 006 verificaba nombres de índices, no su estructura completa;
12. 006 no rechazaba grants o propietario inesperados ni verificaba el DROP
    dentro de la misma transacción.

Las correcciones son locales y están cubiertas por pruebas. 003 y 004 no se
modificaron.

## 3. Las ocho columnas de 005

Todas son nullable, sin default y viven en una sola fila por item. No existe
una fila por observación.

| Columna | Tipo | Constraint e índice | Propietario/escritor | Sustitución | Tamaño |
|---|---|---|---|---|---|
| `regular_certification_cycle_id` | uuid | grupo todo-null/completo, FK a cycles `ON DELETE RESTRICT`, índice parcial | listing/upsert | siguiente candidato regular seguro | 16 bytes |
| `regular_certification_observed_at` | timestamptz | grupo y coincidencia exacta con JSON | listing/upsert | siguiente candidato regular seguro | 8 bytes |
| `regular_certification_evidence_sha256` | varchar(64) | hex lowercase de 64 caracteres y coincidencia con JSON | listing/upsert | siguiente candidato regular seguro | ~65 bytes |
| `regular_certification_candidate` | jsonb | objeto, claves exactas, hash propio, identidad de item y máximo 1.024 bytes de texto | listing/upsert | siguiente candidato regular seguro | típico 588; máximo 1.024 bytes |
| `ps_plus_certification_cycle_id` | uuid | grupo todo-null/completo, FK a cycles `ON DELETE RESTRICT`, índice parcial | detail importer | siguiente candidato Plus seguro | 16 bytes |
| `ps_plus_certification_observed_at` | timestamptz | grupo y coincidencia exacta con JSON | detail importer | siguiente candidato Plus seguro | 8 bytes |
| `ps_plus_certification_evidence_sha256` | varchar(64) | hex lowercase de 64 caracteres y coincidencia con JSON | detail importer | siguiente candidato Plus seguro | ~65 bytes |
| `ps_plus_certification_candidate` | jsonb | objeto, claves exactas, hash propio, identidad de item, hash de cola y máximo 1.024 bytes | detail importer | siguiente candidato Plus seguro | típico 750; máximo 1.024 bytes |

No existe proceso automático de limpieza. Un candidato seguro posterior
sobrescribe el slot. Una observación insegura omite las ocho claves afectadas y
conserva el candidato anterior, pero v3 solo acepta cycle ID, timestamp y hashes
del ciclo exacto; por ello conservarlo no lo convierte en evidencia nueva.

Los candidatos no admiten HTML, `raw_listing_json`, `raw_detail_json`, páginas,
trayectorias, arrays históricos ni claves adicionales. El único array es
`platforms`, de cardinalidad canónica uno o dos. No crecen con retries.

## 4. Capacidad

Techo textual de ambos JSON:

`32.890 × (1.024 + 1.024) = 67.358.720 bytes`, aproximadamente 64,24 MiB.

El tuple representativo medido ocupa 588 bytes regular y 750 bytes PS Plus:

`32.890 × (588 + 750) = 44.006.820 bytes`, aproximadamente 41,97 MiB si todos
los items tuvieran ambos candidatos. UUID, timestamps, hashes, headers JSONB e
índices parciales añaden overhead; una reserva operativa razonable es del orden
de 50–60 MiB con población completa.

Aplicar 005 con cero candidatos tiene un coste inmediato pequeño. No debe
ejecutarse un ciclo entre 005 y 006: primero se verifica 005 y luego 006 libera
aproximadamente 261,2 MiB de history. El precheck futuro debe volver a medir
capacidad antes de cualquier mutación.

## 5. Tuples exactos

Regular contiene únicamente:

`contract_version`, `kind`, `cycle_id`, `observed_at`, `evidence_sha256`,
`psdeals_id`, `region_code`, `storefront`, `currency_code`,
`current_price_amount`, `original_price_amount`, `discount_percent`,
`is_active_discount`, `is_free_to_play`, `content_type`, `item_type_label`,
`platforms`, `candidate_sha256`.

PS Plus contiene únicamente:

`contract_version`, `kind`, `cycle_id`, `observed_at`, `evidence_sha256`,
`input_artifact_sha256`, `psdeals_id`, `region_code`, `storefront`,
`currency_code`, `current_price_amount`, `ps_plus_price_amount`,
`is_active_discount`, `is_ps_plus_discount`, `is_free_to_play`,
`parser_status`, `source_consistent`, `content_type`, `item_type_label`,
`platforms`, `candidate_sha256`.

El hash propio usa SHA-256 sobre una secuencia de campos cerrada y ordenada,
separada por U+001F; null se representa como `<null>` y plataformas como la
lista canónica separada por coma. SQL y JavaScript implementan el mismo orden.
Cambiar un valor del tuple cambia `candidate_sha256`.

Regular proviene de una sola observación del listing. PS Plus proviene de un
solo parseo de detalle; `evidence_sha256` identifica los bytes HTML y
`input_artifact_sha256` la cola exacta consumida. El timestamp nunca basta por
sí solo.

## 6. Porcentaje, tipos y plataformas

La fórmula en PostgreSQL numeric y en JavaScript sobre cents enteros es:

`round(100 × (original - current) / original)`.

La tolerancia es cero. Se probaron 19,99→14,99=25, 14,99→9,99=33,
9,99→9,89=1 y 9,99→0,10=99. El 99 es matemáticamente coherente, pero no puede
certificarse porque excede la relación máxima 20:1. Cien queda excluido.

Tipos certificables:

- `content_type=game`, `item_type_label=game`;
- `content_type=bundle`, `item_type_label=bundle`.

No se certifica `dlc/addon`. La evidencia local demuestra que ese bucket
incluye Add-On, Season Pass, Avatar, Costume, Character, Vehicle, Weapons,
Soundtrack, Theme, Map e Item. Hace falta una política de subtipos explícita
antes de abrirlo.

Plataformas SQL/JavaScript:

- `["PS4"]`;
- `["PS5"]`;
- `["PS5","PS4"]`.

PS3, PS Vita, PSP, legacy mixto, unknown, null, vacío, duplicados y orden
inverso no certifican.

## 7. Funciones y ACL después de 005

Aplicar 005 exige `current_user=postgres`, por lo que el propietario nuevo es
determinista.

| Función | Seguridad / search_path | EXECUTE final |
|---|---|---|
| `certify_price_refresh_cycle(uuid)` v1 | invoker; `public, pg_temp` heredado de 003 | solo `postgres` |
| `certify_price_refresh_cycle_v2(uuid,uuid,text,text,timestamptz)` | definer; `''` | solo `postgres` |
| `certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamptz)` | definer; `''` | `service_role`, `postgres` |
| `_psdeals_certification_candidate_sha256_v1(jsonb)` | invoker; `''` | `service_role`, `postgres` |

PUBLIC, anon y authenticated no pueden ejecutar v1/v2/v3. Service role no
puede ejecutar v1/v2. Los helpers internos y entrypoints de 004 conservan sus
ACL verificadas; 005 no cambia sus firmas.

No hay nombres dinámicos. Las referencias dentro de v3 están calificadas por
schema. El modelo 004 no almacena campos independientes `actor` o `intent`;
la identidad autorizada se expresa por ACL de `service_role`, `action_kind`,
parent receipt, idempotency key, request hash, input hash y manifest hash.
Por tanto, no debe afirmarse una validación de actor/intent que el esquema no
representa.

## 8. Compatibilidad con 004, receipts e idempotencia

Orden futuro:

1. create cycle;
2. producir y validar listing/detail;
3. escribir candidatos ligados al ciclo;
4. completar receipts requeridos;
5. mark succeeded;
6. abrir receipt `certify` con parent mark-succeeded;
7. validar ciclo, timestamps, hashes, candidatos y monthly;
8. actualizar mínimos monotónicamente;
9. terminar receipt committed y marcar cycle certified.

V3 recibe cycle UUID, mark receipt UUID, idempotency key, request hash y
started_at. `_begin_psdeals_cycle_action_v1` rechaza contradicciones de cycle,
action, parent, attempt, request hash, input hash o key. Un receipt ajeno,
no committed o de otra acción falla. Una llamada repetida exacta devuelve el
receipt existente; una repetición contradictoria falla.

El subbloque de actualización captura errores: los cambios de mínimos se
revierten antes de registrar el receipt failed. Los estados failed no se
convierten en committed. Las doce funciones 004 permanecen sin modificación.

## 9. FKs y retención de cycles

Ambos `*_certification_cycle_id` referencian
`public.price_refresh_cycles(id) ON DELETE RESTRICT`; ON UPDATE usa el default
`NO ACTION`. Los dos campos tienen índice parcial.

Un item que no cambie puede retener indefinidamente un cycle antiguo. Política:

- conservar cycles referenciados;
- limpiar solo cycles no referenciados;
- si en el futuro se retiran cycles antiguos, invalidar o reemplazar primero
  sus candidatos mediante una operación explícita y auditada;
- no debilitar RESTRICT por conveniencia.

## 10. Coste y locks de 005

Secuencia:

1. `BEGIN`;
2. lock timeout 5 s y statement timeout 120 s;
3. preflight de owner, tablas, columnas y funciones;
4. ALTER TABLE para ocho columnas nullable sin default;
5. crear helper hash y ACL;
6. ALTER TABLE para dos FKs y dos checks;
7. crear dos índices parciales;
8. comentarios;
9. crear v3 y fijar ACL v1/v2/v3;
10. `COMMIT`.

Las columnas son metadata-only y no fuerzan rewrite. Checks y FKs validados
escanean unas 32.890 filas; todos los candidatos existentes deben ser null.
Los índices parciales empiezan vacíos. ALTER TABLE requiere ACCESS EXCLUSIVE;
los índices normales requieren SHARE. La tabla es pequeña y se prefirió una
transacción simple a `NOT VALID`/`VALIDATE` o índices concurrentes.
`CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de esta transacción.
WAL y espacio temporal esperados son bajos.

## 11. Revisión sentencia por sentencia de 006

Secuencia:

1. `BEGIN`;
2. lock timeout 5 s y statement timeout 60 s;
3. `LOCK TABLE public.psdeals_stage_price_history IN ACCESS EXCLUSIVE MODE`;
4. preflight fail-closed;
5. eliminar la policy pública exacta;
6. revocar todos los grants verificados;
7. `DROP TABLE public.psdeals_stage_price_history RESTRICT`;
8. postcondición dentro de la transacción;
9. `COMMIT`.

El preflight exige:

- sesión y owner `postgres`;
- tabla ordinaria persistente exacta en `public`;
- ocho columnas exactas y `numeric(10,2)`;
- cuatro constraints, FK saliente CASCADE a stage y cero FKs entrantes;
- cuatro índices con nombres, unicidad, keys, ausencia de expresiones/predicados
  y estados valid/ready exactos;
- cero triggers de usuario, reglas, vistas, materialized views, funciones,
  publicaciones o dependencias externas;
- RLS habilitado;
- una policy exacta de SELECT público;
- 28 grants directos exactos entre anon, authenticated, service_role y
  postgres; ningún grantee adicional.

La postcondición comprueba antes del commit que tabla, índices, policies y
grants desaparecieron. No hay `CASCADE`, DML por filas, `TRUNCATE`, `VACUUM`,
backup, copia, exportación, CTAS, SELECT INTO ni backfill. Las palabras DELETE
y TRUNCATE solo aparecen como nombres de privilegios inspeccionados.

ACCESS EXCLUSIVE debe durar poco porque DROP es de catálogo y unlink de
archivos. El timeout de 5 s evita espera indefinida; no se terminan sesiones.
El precheck separado muestra locks y sesiones activas antes de una autorización.

## 12. Deployment público

Vercel read-only identificó:

- project: `lobodeals` (`prj_xi25eHLsj4DNb9zy7P0v64xM4W1I`);
- deployment: `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`;
- estado: `READY`, target `production`;
- creado: 2026-07-27T05:38:08.090Z;
- Git SHA: `4f826ac873850d3e61ceb68721512099625f1515`;
- aliases: `lobodeals.com`, `www.lobodeals.com`, `lobodeals.vercel.app`,
  alias del proyecto y alias Git main.

El SHA existe localmente y es ancestro de HEAD. La inspección del árbol exacto
desplegado —home, catalog, deals, slug, API routes, componentes y clientes
Supabase— no encontró `psdeals_stage_price_history`, price-history, gráfica,
RPC ni consulta dinámica que consuma history.

- `PRODUCTION_HISTORY_CONSUMERS_COUNT=0`;
- `PRODUCTION_HISTORY_CONSUMERS=[]`;
- `PRODUCTION_SAFE_AFTER_006=true`.

## 13. Prechecks, postchecks y orden remoto futuro

Archivos read-only preparados:

- `sql/validation/005-cycle-bound-price-certification-precheck-readonly.sql`;
- `sql/validation/005-cycle-bound-price-certification-postcheck-readonly.sql`;
- `sql/validation/006-price-history-retirement-precheck-readonly.sql`;
- `sql/validation/006-price-history-retirement-postcheck-readonly.sql`.

Orden obligatorio, en operaciones separadas:

1. ejecutar precheck 005 read-only y medir capacidad;
2. aplicar solo 005;
3. ejecutar postcheck 005;
4. verificar ocho columnas, constraints, índices, owner, firmas y ACL;
5. confirmar cero candidatos, mínimos, cycles y receipts;
6. reconfirmar deployment de producción;
7. ejecutar precheck 006 read-only;
8. comprobar sesiones y locks;
9. aplicar solo 006;
10. ejecutar postcheck 006;
11. medir Database Size;
12. confirmar que stage, cycles, receipts, monthly y cache se conservan.

Debe existir una pausa de validación entre migraciones. No ejecutar un ciclo
entre 005 y 006. No agrupar ambas en una única aplicación.

Criterios automáticos de aborto: owner/sesión inesperados, falta o presencia
parcial de objetos, capacidad insuficiente, candidates/minima/cycles/receipts
no cero, ACL drift, definición/index/policy/grant/dependency drift, sesiones o
locks incompatibles, producción no identificable, timeout o postcheck anómalo.

## 14. Recuperación

- Si 005 falla, su transacción revierte columnas, constraints, índices,
  funciones y ACL.
- Si una assertion de 006 falla, no se retira nada.
- Si no se obtiene el lock en 5 s, la transacción falla sin terminar sesiones.
- Si DROP encuentra dependencia, RESTRICT falla y revierte policy/grants.
- Si la postcondición interna falla, revierte el DROP.
- Si un postcheck externo posterior al commit detecta anomalía, detenerse y
  escalar; no recrear datos por suposición.

Después del commit confirmado de 006, las 841.549 filas son irrecuperables por
decisión expresa de Johan. Eso es el resultado aprobado de una autorización
futura, no un error.

## 15. Validación local

- `npm test`: 358/358;
- suites enfocadas de commercial state, evidencia, migración 005 y retirement:
  63/63;
- `node --check`: todos los MJS modificados;
- lint: 0 errores, seis advertencias preexistentes;
- `git diff --check`: aprobado;
- búsquedas de secretos, raw payloads, HTML, arrays no acotados, PUBLIC
  EXECUTE, SECURITY DEFINER/search_path y operaciones prohibidas: sin hallazgo
  nuevo;
- build: no ejecutado;
- migraciones: no ejecutadas.

## 16. Readiness

- `CERTIFICATION_MIGRATION_LOCAL_APPROVED=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `PRODUCTION_SAFE_AFTER_006=true`;
- `REMOTE_005_READY_TO_APPLY=false` hasta precheck remoto actual de capacidad,
  estado y cero filas operativas;
- `REMOTE_006_READY_TO_APPLY=false` hasta aplicar y verificar 005, repetir
  compatibilidad de producción y aprobar precheck 006;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `CERTIFICATION_FIX_REQUIRED=true` remotamente.

Posición: 005 y 006 están corregidas y aprobadas localmente, pero no aplicadas.
El Bloque 4 no está cerrado y la prueba de 30 días no comenzó.
