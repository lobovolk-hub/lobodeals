# LoboDeals 3.0 — Auditoría local y remota read-only de retención de historial de precios

Fecha: 2026-07-29

Alcance: repositorio local y metadatos/conteos remotos consultados en modo estrictamente read-only; ninguna mutación ni RPC fue ejecutada

Comando reproducible: `node scripts/audit-price-history-dependencies-local.mjs`

## Conclusión

La eliminación de históricos permanece bloqueada. La evidencia local y la inspección remota read-only demuestran cuatro contratos diferentes que no deben eliminarse como si fueran el mismo objeto:

1. `public.psdeals_stage_price_history`: histórico detallado legacy. Su DDL no está versionado localmente, pero el objeto remoto, sus columnas, índices, FK, tamaño y rango temporal ya fueron verificados read-only.
2. `public.item_price_snapshots`: tabla del esquema v1, distinta del histórico PSDeals. Su DDL local existe, pero el objeto no existe en el esquema remoto inspeccionado.
3. `lowest_price_amount` y `lowest_ps_plus_price_amount`: resúmenes legacy de PSDeals que el importer todavía escribe y la página pública de detalle todavía muestra.
4. Los cuatro campos `lobodeals_lowest_*`: mínimos compactos certificados de LoboDeals 3.0, propiedad exclusiva de `certify_price_refresh_cycle(uuid)`.

El auditor local final recorrió 162 archivos de texto y clasificó 156 referencias: 20 al histórico detallado, 23 a snapshots v1, 56 a mínimos certificados, 18 a resúmenes legacy y 39 referencias genéricas. La medición incluye documentación y el propio reporte para hacer visibles los contratos escritos; son métricas de referencias locales, no filas de base de datos.

## Objetos y dependencias demostrados localmente

### `public.psdeals_stage_price_history`

- La continuidad conservaba una medición histórica de 841,549 filas; la inspección remota read-only de esta sesión confirmó el mismo conteo exacto.
- `sql/003-lobodeals-3-certified-price-lows.sql` declara expresamente que no borra esta tabla.
- No existe DDL local que demuestre columnas, primary key, foreign keys, índices, triggers, RLS, productores o consumidores remotos.
- No existe una referencia ejecutable actual en `app/` o `scripts/` que lea o escriba directamente esa tabla.
- La ausencia de referencias locales no demuestra ausencia de vistas, funciones, jobs o dependencias remotas.

### `public.item_price_snapshots`

`sql/001-schema-v1.sql` demuestra:

- `id uuid` primary key;
- `item_id uuid not null` con FK a `public.catalog_items(id) on delete cascade`;
- `captured_at`, `price_amount`, `currency_code`, `availability_state`, `is_base_price`, `source_name`, `source_note`, `created_at`;
- checks de disponibilidad, fuente y moneda;
- índice `item_price_snapshots_item_captured_idx (item_id, captured_at desc)`.

`sql/002-manual-sample-10-template.sql` contiene un productor manual de una fila inicial. No se encontró un consumidor actual en la UI ni un productor operativo. La inspección remota confirmó que el objeto no existe en el esquema desplegado actual.

### Resúmenes legacy `lowest_*`

- `scripts/import-psdeals-detail-local.mjs` extrae `lowest_price_amount` y `lowest_ps_plus_price_amount` del detalle PSDeals.
- `scripts/lib/psdeals-stage-payload.mjs` los permite en el payload seguro de detalle.
- `app/us/playstation/[slug]/page.tsx` los selecciona de `psdeals_stage_items`, calcula el mínimo mostrado y renderiza ambos valores.
- Su DDL no está versionado localmente.

Estos campos son un resumen, no la tabla de historial detallado, pero hoy son dependencia pública demostrada. No deben eliminarse hasta decidir explícitamente si la UI migra a `lobodeals_lowest_*` y verificar cómo la caché pública los expone.

### Mínimos compactos certificados `lobodeals_lowest_*`

`sql/003-lobodeals-3-certified-price-lows.sql` añade dos pares precio/timestamp con checks de precio positivo y nulabilidad emparejada. `certify_price_refresh_cycle(uuid)` es su único productor local demostrado y solo inicializa o reduce los mínimos dentro de un ciclo válido. Los builders de listing y detalle los excluyen y el adaptador de upsert vuelve a rechazarlos.

La UI local no selecciona directamente esos cuatro campos. La definición de `refresh_catalog_public_cache_v15()` no está versionada, por lo que no puede demostrarse localmente si la caché los consume.

## Hechos remotos verificados el 2026-07-29

La inspección se realizó contra el proyecto configurado mediante metadatos y `SELECT`. El reporte seguro y redactado está en `docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json`. Se registraron cero mutaciones y cero RPC.

### `public.psdeals_stage_price_history`

- existe como tabla y permite lectura;
- 841,549 filas exactas;
- 273,907,712 bytes totales (aproximadamente 261.22 MiB): 107,372,544 bytes de tabla y 166,469,632 bytes de índices;
- columnas: `id`, `item_id`, `price_kind`, `observed_at`, `price_amount`, `currency_code`;
- rango observado: 2015-07-10T00:00:00Z a 2026-06-06T19:21:00Z;
- índices: primary key, `psdeals_stage_price_history_unique_point`, `psdeals_stage_price_history_item_idx` y `psdeals_stage_price_history_kind_idx`;
- FK `item_id` hacia `psdeals_stage_items(id)` con `ON DELETE CASCADE`;
- no se encontraron triggers, vistas, vistas materializadas ni funciones con referencia directa en las definiciones accesibles;
- `pg_cron` no está instalado en el proyecto inspeccionado.

La ausencia de consumidores encontrados reduce el riesgo conocido, pero no autoriza la eliminación. La FK con `ON DELETE CASCADE` es una propiedad histórica ya existente; no debe usarse como mecanismo de limpieza.

### Objetos relacionados

- `public.item_price_snapshots`: ausente remotamente; el DDL local v1 no describe el estado desplegado actual.
- `public.psdeals_stage_items`: 32,890 filas; los cuatro `lobodeals_lowest_*` existen, pero todavía tienen cero filas certificadas.
- `public.catalog_public_cache`: 32,890 filas. La definición verificada de `refresh_catalog_public_cache_v15()` no consulta el histórico detallado.
- `certify_price_refresh_cycle(uuid)`: definición remota verificada; tampoco consulta el histórico detallado y conserva la propiedad exclusiva de los mínimos compactos certificados.

### Hechos todavía ausentes

- no existe aún un primer ciclo real certificado que demuestre la sustitución operativa del historial;
- la UI de detalle todavía consume los resúmenes legacy `lowest_*`;
- no se ha ensayado una recuperación fuera de producción;
- no hay autorización separada para exportar, borrar o alterar ningún histórico.

## Consultas read-only de referencia

Estas consultas documentan la forma de repetir parte del inventario. Durante esta sesión se ejecutaron consultas read-only equivalentes y adicionales después de verificar cada columna; no se ejecutó ninguna sentencia mutante ni función operativa.

### 1. Inventario, tamaño y estimación

```sql
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind,
  c.reltuples::bigint as estimated_rows,
  pg_total_relation_size(c.oid) as total_bytes,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'psdeals_stage_price_history',
    'item_price_snapshots',
    'psdeals_stage_items',
    'catalog_public_cache'
  )
order by c.relname;
```

### 2. Columnas e índices, sin asumir el esquema ausente

```sql
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'psdeals_stage_price_history',
    'item_price_snapshots',
    'psdeals_stage_items'
  )
order by table_name, ordinal_position;

select schemaname, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'psdeals_stage_price_history',
    'item_price_snapshots',
    'psdeals_stage_items'
  )
order by tablename, indexname;
```

### 3. Foreign keys y triggers

```sql
select
  con.conname,
  con.conrelid::regclass as source_object,
  con.confrelid::regclass as referenced_object,
  pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_constraint as con
where con.contype = 'f'
  and (
    con.conrelid in (
      to_regclass('public.psdeals_stage_price_history'),
      to_regclass('public.item_price_snapshots')
    )
    or con.confrelid in (
      to_regclass('public.psdeals_stage_price_history'),
      to_regclass('public.item_price_snapshots')
    )
  )
order by source_object::text, con.conname;

select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'psdeals_stage_price_history',
    'item_price_snapshots'
  )
order by event_object_table, trigger_name;
```

### 4. Vistas y rutinas que mencionan los objetos

```sql
select schemaname, viewname, definition
from pg_catalog.pg_views
where schemaname = 'public'
  and (
    definition ilike '%psdeals_stage_price_history%'
    or definition ilike '%item_price_snapshots%'
  )
order by viewname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    pg_get_functiondef(p.oid) ilike '%psdeals_stage_price_history%'
    or pg_get_functiondef(p.oid) ilike '%item_price_snapshots%'
    or p.proname in (
      'refresh_catalog_public_cache_v15',
      'certify_price_refresh_cycle'
    )
  )
order by p.proname;
```

### 5. Conteos exactos solo después de confirmar existencia

```sql
select count(*)::bigint as item_price_snapshots_rows,
       min(captured_at) as oldest_capture,
       max(captured_at) as newest_capture
from public.item_price_snapshots;
```

No se propone todavía una consulta por fecha sobre `psdeals_stage_price_history`: primero deben verificarse sus columnas reales. Tampoco se propone `DELETE`, `TRUNCATE` ni `DROP`.

## Estrategia de retención y go/no-go

Retener indefinidamente:

- precios actuales y estado comercial;
- cuatro mínimos compactos `lobodeals_lowest_*` con su primera observación;
- receipts y métricas de ciclos certificados necesarios para auditoría operativa.

Evaluar para archivo y eliminación futura:

- filas del histórico detallado legacy, solo después del inventario remoto;
- `item_price_snapshots`, únicamente si se demuestra que es un rezago v1 sin consumidores;
- resúmenes `lowest_*`, únicamente después de migrar y validar la UI/caché.

Condiciones de go:

1. esquema, conteos, tamaño, rango temporal, índices, FKs, triggers, vistas, funciones y jobs verificados read-only;
2. decisión explícita sobre recuperación; una exportación recuperable con conteos y hashes sería la opción conservadora, pero no fue solicitada ni creada y su ausencia mantiene el resultado en `NO-GO`;
3. caché y UI migradas a la fuente compacta prevista;
4. runner diario real validado y ciclos certificados estables;
5. comparación pública antes/después aprobada;
6. plan de rollback ensayado fuera de producción;
7. autorización explícita de Johan para el objeto y operación exactos.

Cualquier dependencia desconocida, discrepancia de conteos, ausencia de respaldo o necesidad de `CASCADE` es `NO-GO`.

## Orden futuro seguro de limpieza y recuperación

1. Congelar productores del histórico confirmado.
2. Capturar esquema, grants, políticas, triggers, índices y dependencias.
3. Exportar esquema y datos del objeto exacto; verificar que el archivo sea legible y registrar filas/tamaño/hash.
4. Migrar consumidores y refrescar/validar caché solo con autorización.
5. Observar ciclos certificados estables; la prueba de 30 días no comienza hasta la frase exacta definida en `AGENTS.md`.
6. Retirar dependencias explícitamente, una por una.
7. Aplicar la operación aprobada al objeto exacto sin `CASCADE`.
8. Validar filas actuales, mínimos, deals, mensual, UI y caché.
9. Si falla, detener productores, recrear el objeto desde el esquema exportado, restaurar datos, revalidar conteos y revertir consumidores.

Borrar por fecha puede dejar mínimos o relaciones incoherentes y requerir un índice temporal que aún no está demostrado. Borrar toda una tabla pierde trazabilidad y puede romper dependencias ocultas. Borrar por partición solo sería planteable si el esquema remoto demuestra que existen particiones. Ninguna de esas operaciones está autorizada ahora.

## Efecto del diseño de migración 004

`certify_price_refresh_cycle_v2` no introduce otro algoritmo de mínimos: exige un cycle `succeeded` y un receipt `mark_succeeded` comprometido, y después envuelve la implementación verificada `certify_price_refresh_cycle(uuid)`. Por tanto, un primer ciclo real válido podrá inicializar o reducir los cuatro `lobodeals_lowest_*` con las mismas reglas certificadas. La migración por sí sola no crea mínimos y, mientras no se aplique ni se ejecute un ciclo, los conteos permanecen en cero.

Antes de reconsiderar la eliminación del histórico se requiere, además de las condiciones anteriores:

1. migración 004 aplicada y preflight `MIGRATION_READY`;
2. primer ciclo real completo con receipts comprometidos de mark-succeeded y certify;
3. mínimos regulares y PS Plus poblados y contrastados con precios válidos;
4. receipt comprometido de cache v16, validación pública y métricas del mismo ciclo;
5. consumidores de UI y cache verificados contra la fuente que sobrevivirá;
6. exportación recuperable del histórico con esquema, filas, rango, tamaño y SHA-256;
7. autorización independiente para el objeto y la operación exactos.

La limpieza futura necesitará su propio `action_kind` o contrato de mantenimiento; 004 no lo inventa. Ese receipt deberá registrar export hash, conteo esperado, conteo afectado, tamaño lógico antes/después y resultado, sin almacenar el histórico en JSON.

La liberación debe medirse con `count(*)`, `pg_relation_size`, `pg_indexes_size` y `pg_total_relation_size` antes y después. Una reducción lógica de filas no garantiza devolver espacio físico al sistema operativo; cualquier mantenimiento que reescriba la tabla requerirá una ventana y autorización distintas. La FK histórica `ON DELETE CASCADE` desde stage sigue siendo una amenaza de propagación, no una herramienta de limpieza: los objetos deben tratarse explícitamente y nunca eliminarse mediante el padre.

Resultado actualizado: `NO-GO`. 004 está solamente versionada localmente; no existe ciclo real certificado, los mínimos siguen vacíos, no hay exportación ni autorización de borrado.

## Migración futura del PS1 y tarea de Windows

El PS1 histórico ejecuta collector, analyzer, importer y retry; descubre el listing mediante glob/nombre, obtiene fallos parseando logs y termina imprimiendo SQL manual de caché. No crea ciclo remoto, no comprueba mensual ni ended-deals, no ensambla manifiesto, no marca succeeded ni certifica. Tampoco vuelve a comprobar fallos pendientes tras el retry. Su ruta está fijada a un directorio personal.

Plan de migración, todavía no aplicado:

1. La tarea de Windows invoca un único entrypoint estable del runner con cwd explícito y raíz de ciclos configurable.
2. `init` crea el workspace, identidad y lock; la tarea conserva la ruta exacta, no un timestamp inferido.
3. El runner pasa `local_cycle_id`, `run_token` y rutas de evidencia a cada productor.
4. Cada etapa se decide por sobres/hashes y ledger, no por globs ni regex sobre logs.
5. Windows interpreta los códigos 0–8 documentados: éxito, uso/I-O, evidencia inválida, indeterminado, bloqueado, autorización pendiente, fallo de etapa, corrupción y lock activo.
6. El lock impide dos ciclos simultáneos. Un lock stale exige takeover explícito; la tarea no mata procesos ni borra locks.
7. La tarea registra exit code, workspace y última etapa; nunca secretos ni variables de entorno completas.
8. `resume` reutiliza la identidad y verifica receipts antes de cualquier repetición externa.
9. La configuración futura de la tarea debe impedir solapamiento y ejecutar una vez al día, coherente con la promesa pública.
10. Solo después de validar operational por etapas se retirará el PS1 histórico. No se modifica todavía ni se crea la automatización diaria.
