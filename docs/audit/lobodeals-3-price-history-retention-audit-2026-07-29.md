# LoboDeals 3.0 — Auditoría local de retención de historial de precios

Fecha: 2026-07-29

Alcance: repositorio local, sin consultar ni modificar Supabase

Comando reproducible: `node scripts/audit-price-history-dependencies-local.mjs`

## Conclusión

La eliminación de históricos permanece bloqueada. El repositorio demuestra cuatro contratos diferentes que no deben eliminarse como si fueran el mismo objeto:

1. `public.psdeals_stage_price_history`: histórico detallado legacy. Solo aparece en documentación y en el comentario de `sql/003-lobodeals-3-certified-price-lows.sql`; su DDL, columnas, índices, claves y dependencias no están versionados localmente.
2. `public.item_price_snapshots`: tabla del esquema v1, distinta del histórico PSDeals. Su DDL local sí existe.
3. `lowest_price_amount` y `lowest_ps_plus_price_amount`: resúmenes legacy de PSDeals que el importer todavía escribe y la página pública de detalle todavía muestra.
4. Los cuatro campos `lobodeals_lowest_*`: mínimos compactos certificados de LoboDeals 3.0, propiedad exclusiva de `certify_price_refresh_cycle(uuid)`.

El auditor local recorrió 143 archivos de texto y clasificó 135 referencias: 15 al histórico detallado, 18 a snapshots v1, 51 a mínimos certificados, 18 a resúmenes legacy y 33 referencias genéricas. La medición incluye documentación y el propio reporte para hacer visibles los contratos escritos; son métricas de referencias locales, no filas de base de datos.

## Objetos y dependencias demostrados localmente

### `public.psdeals_stage_price_history`

- La continuidad conserva una medición histórica de 841,549 filas, pero no es una medición actual.
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

`sql/002-manual-sample-10-template.sql` contiene un productor manual de una fila inicial. No se encontró un consumidor actual en la UI ni un productor operativo. Aun así, no puede asumirse que el objeto exista, esté vacío o carezca de dependencias remotas.

### Resúmenes legacy `lowest_*`

- `scripts/import-psdeals-detail-local.mjs` extrae `lowest_price_amount` y `lowest_ps_plus_price_amount` del detalle PSDeals.
- `scripts/lib/psdeals-stage-payload.mjs` los permite en el payload seguro de detalle.
- `app/us/playstation/[slug]/page.tsx` los selecciona de `psdeals_stage_items`, calcula el mínimo mostrado y renderiza ambos valores.
- Su DDL no está versionado localmente.

Estos campos son un resumen, no la tabla de historial detallado, pero hoy son dependencia pública demostrada. No deben eliminarse hasta decidir explícitamente si la UI migra a `lobodeals_lowest_*` y verificar cómo la caché pública los expone.

### Mínimos compactos certificados `lobodeals_lowest_*`

`sql/003-lobodeals-3-certified-price-lows.sql` añade dos pares precio/timestamp con checks de precio positivo y nulabilidad emparejada. `certify_price_refresh_cycle(uuid)` es su único productor local demostrado y solo inicializa o reduce los mínimos dentro de un ciclo válido. Los builders de listing y detalle los excluyen y el adaptador de upsert vuelve a rechazarlos.

La UI local no selecciona directamente esos cuatro campos. La definición de `refresh_catalog_public_cache_v15()` no está versionada, por lo que no puede demostrarse localmente si la caché los consume.

## Consultas read-only propuestas para una futura sesión autorizada

Estas consultas se proponen, pero no fueron ejecutadas.

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
2. exportación recuperable con conteos y hashes externos;
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
