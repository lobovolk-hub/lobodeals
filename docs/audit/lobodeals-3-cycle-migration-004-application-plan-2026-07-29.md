# LoboDeals 3.0 — Plan de aplicación de la migración 004

Fecha de preparación: 2026-07-29

Proyecto remoto verificado: `vlxkoprpobfevxefizwr`

Migración: `sql/004-lobodeals-3-reconciliable-cycle-actions.sql`

SHA-256 de los bytes revisados: `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf`

Este documento prepara una sesión futura expresamente autorizada. La migración no se aplicó al redactarlo.

## Resultado que se busca

La migración 004 añade identidad local inmutable a `price_refresh_cycles`, una tabla acotada de receipts y RPC versionadas para reconciliar create-cycle, listing, monthly, democión, mark-succeeded, certificación, caché, validación pública y métricas.

El diseño elegido usa una sola tabla de receipts porque todos los efectos comparten identidad, idempotencia, hashes, estado, timestamps, conteos y relación padre. El `action_kind` es un enum cerrado y el JSON queda limitado a 16 KiB. Se descartó:

- guardar receipts en `metrics`, porque no ofrece unicidad, encadenamiento ni reconciliación por batch;
- crear una tabla por acción, porque multiplica esquemas y consultas sin mejorar la identidad común;
- guardar el `run_token` crudo, porque basta su SHA-256 y el token no debe salir del workspace;
- modificar silenciosamente las funciones antiguas, porque rompería consumidores y dificultaría comparar el contrato verificado;
- confiar solo en `(local_cycle_id, run_token)`, porque cada valor debe ser globalmente no reutilizable por separado.

La migración conserva las implementaciones `certify_price_refresh_cycle(uuid)` y `refresh_catalog_public_cache_v15()`, pero revoca su ejecución operativa directa. `certify_price_refresh_cycle_v2` y `refresh_catalog_public_cache_v16` son los wrappers reconciliables futuros.

## Precheck obligatorio

La sesión futura debe mostrar exactamente cada consulta o mutación y su efecto antes de ejecutarla. Abortar ante cualquier diferencia.

1. Confirmar repositorio local:

   - rama `main`;
   - HEAD exacto autorizado para esa sesión;
   - worktree limpio;
   - archivo 004 idéntico al commit revisado;
   - SHA-256 exacto `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf`.

2. Confirmar recuperabilidad antes de cualquier DDL mediante una de estas dos rutas demostradas:

   - backup administrado o punto de restauración vigente y comprobado; o
   - recuperación acotada de la superficie exacta de 004, protegida en un commit anterior a la aplicación, únicamente mientras ciclos y receipts permanezcan en cero y no exista uso operativo;
   - exportación separada del esquema, definiciones, grants y políticas de `price_refresh_cycles` y de las dos funciones legacy;
   - registro de conteos y hashes en un artefacto redactado;
   - responsable y procedimiento de recuperación identificados.

   Sin una recuperación demostrable, el resultado es `ABORT`.

3. Repetir el preflight read-only:

   - proyecto `vlxkoprpobfevxefizwr` en estado saludable;
   - cero `price_refresh_cycles` y cero ciclos activos;
   - ausencia total de columnas, tabla, índices y funciones de 004;
   - definición SHA-256 de certify v1: `3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88`;
   - definición SHA-256 de cache v15: `1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc`;
   - firmas, owner, RLS y grants sin cambios;
   - conteos base capturados de stage, import runs, monthly, cache y mínimos compactos.

4. Ventana de mantenimiento:

   - ningún collector, importer, runner, demoter ni llamada manual de lifecycle activo;
   - ningún cliente autorizado para crear un ciclo durante la ventana;
   - duración acotada y responsable disponible para abortar;
   - no combinar esta migración con otro DDL, corrección de datos o cambio de grants.

La propia migración vuelve a comprobar los objetos, las 21 columnas base, las 12 columnas usadas por democión, cero ciclos, ausencia de la huella 004 y los dos hashes legacy. Toma un lock `ACCESS EXCLUSIVE` con `lock_timeout=10s` y limita la sentencia a 120 segundos. Cualquier discrepancia revierte la transacción completa.

## Aplicación futura exacta

Esta operación es crítica y requiere autorización nueva y explícita.

1. Herramienta: operación `apply_migration` del canal Supabase autorizado, proyecto exacto `vlxkoprpobfevxefizwr`.
2. Nombre de migración: `lobodeals_3_reconciliable_cycle_actions`.
3. Entrada: contenido exacto de `sql/004-lobodeals-3-reconciliable-cycle-actions.sql`, sin editar ni concatenar instrucciones.
4. Rol: propietario administrativo `postgres`; no usar `anon`, `authenticated` ni `service_role` para aplicar DDL.
5. Transacción: usar el `BEGIN`/`COMMIT` del archivo; no reintentar automáticamente si la respuesta es ambigua.
6. Timeouts: conservar `lock_timeout=10s` y `statement_timeout=120s` incluidos en el archivo.
7. Captura: guardar el resultado completo de la herramienta, hora, project ID, nombre, checksum y estado; nunca keys, cookies o variables de entorno.
8. Prohibición: no ejecutar una segunda sentencia mutante, no crear ciclos y no probar RPC con efectos en esta misma aplicación.

Si la respuesta de la herramienta se pierde, no repetir. Ejecutar solo los postchecks read-only para clasificar el resultado como no aplicado, aplicado completo, parcial o incompatible.

## Postcheck read-only

El archivo incluye consultas de inventario después del `COMMIT`; adicionalmente debe regenerarse un facts file redactado y evaluarse con el preflight local.

El resultado esperado es `MIGRATION_READY`, nunca `LIVE_CYCLE_READY` por la sola aplicación del DDL.

Comprobar:

1. `price_refresh_cycles` sigue con cero filas y ahora tiene las diez columnas 004, constraints e índices separados para `local_cycle_id` y `run_token_sha256`.
2. `psdeals_cycle_action_receipts` existe con 16 columnas, dos FKs `ON DELETE RESTRICT`, índices esperados, RLS habilitado y cero filas.
3. Las doce funciones nuevas tienen firma exacta; las once `SECURITY DEFINER` fijan `search_path=''` y el trigger es `SECURITY INVOKER`.
4. `anon` y `authenticated` no tienen ejecución sobre RPC operativas ni escritura sobre receipts.
5. `service_role` tiene solo `SELECT` sobre receipts y ejecución de los entrypoints versionados.
6. Los helpers internos son ejecutables solo por `postgres`.
7. `certify_price_refresh_cycle(uuid)` y `refresh_catalog_public_cache_v15()` conservan definición y hash, pero ya no son ejecutables directamente por `service_role`; v15 tampoco por `anon` o `authenticated`.
8. No aparecieron filas, ciclos, mínimos, cambios mensuales ni mutaciones de cache como consecuencia del DDL.
9. `node scripts/preflight-psdeals-remote-readonly.mjs --facts=<facts-redactado>` devuelve código 2 y `MIGRATION_READY`.

Una huella parcial o contrato distinto es fallo. No crear un ciclo para “probar” una instalación dudosa.

## Rollback y recuperación

No existe un down migration automático. Ningún rollback usa `CASCADE`.

### Fallo antes de `COMMIT`

PostgreSQL revierte la transacción. Confirmar read-only que no exista ninguna parte de la huella 004. Si queda una huella parcial, clasificar `MIGRATION_PARTIALLY_APPLIED` y no reintentar hasta explicar la causa.

### Aplicación completa, todavía sin ciclos ni receipts

Solo con autorización separada, backup confirmado y conteos exactos en cero puede prepararse una reversión manual específica:

1. adquirir el mismo lock y volver a comprobar cero ciclos y cero receipts;
2. revocar ejecución de todos los entrypoints 004;
3. retirar triggers y funciones en orden inverso de dependencias, con firmas exactas;
4. retirar tabla de receipts únicamente después de comprobar cero filas;
5. retirar índices, constraints y columnas 004 de `price_refresh_cycles` uno por uno;
6. restaurar los grants legacy exactos solo si también se revierte el cliente operativo;
7. confirmar que las definiciones v1/v15 nunca cambiaron;
8. repetir inventario y preflight read-only.

La recuperación acotada está versionada fuera de la ruta normal de migraciones en `sql/recovery/004-lobodeals-3-reconciliable-cycle-actions-before-use.sql` y su bundle reproducible está en `docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30/`. El script no está autorizado para ejecución: primero debe validar la huella post-004 exacta, cero ciclos, cero receipts, hashes y grants legacy, firmas, RLS, constraints, índices y triggers. Cualquier discrepancia obliga a corregir hacia adelante. No usa `CASCADE` ni borrado de filas.

El registro creado por `apply_migration` en el historial de Supabase se trata como una operación del plano de control separada. Una recuperación futura debe obtener primero la versión exacta registrada y solo después, con autorización independiente y una recuperación SQL ya confirmada, usar el procedimiento documentado `supabase migration repair --status reverted <version-exacta>`. Nunca debe editar directamente `supabase_migrations.schema_migrations`.

### Después de crear un ciclo o cualquier receipt

No retirar columnas, tabla ni evidence. Revocar temporalmente la ejecución de los nuevos entrypoints al rol operativo, conservar todos los receipts y corregir hacia adelante con otra migración versionada. La identidad local y los receipts son parte de la auditoría.

### Después de certificación

No intentar “descertificar” borrando receipts ni mínimos. Detener nuevas acciones, conservar el ciclo certificado y sus mínimos, revocar entrypoints afectados y corregir hacia adelante. La función v1 permanece físicamente disponible para inspección, no para bypass operativo.

### Después de cache refresh

No reconstruir automáticamente la cache anterior: v15 reemplaza la cache completa y no conserva una copia previa. Preservar el receipt, validar públicamente el estado, detener nuevas invocaciones y decidir una recuperación específica desde las fuentes vigentes. Nunca repetir v16 tras un receipt `committed` con otro request hash.

## Retención de receipts

004 no implementa borrado automático. Política propuesta para una migración futura separada:

- conservar todos los receipts durante el piloto y la prueba operativa;
- conservar al menos 400 días los receipts terminales de ciclos certificados;
- conservar receipts `failed` o `indeterminate` hasta reconciliación y luego aplicar la misma ventana;
- exportar y hashear antes de cualquier purga;
- purgar por ciclos cerrados y lotes acotados, con receipt de mantenimiento propio;
- nunca borrar un ciclo mientras tenga receipts ni usar la FK para propagación.

La política debe revisarse con volumen real. Hasta entonces, retención indefinida es la opción fail-closed.

## Limitación de validación local

No había `psql`, servidor PostgreSQL, Docker, Podman ni Supabase CLI local disponibles. WSL estaba presente como ejecutable, pero el subsistema no estaba instalado. Por ello, 004 tuvo análisis estático, pruebas contractuales y ensayo integral con clientes falsos; no se ejecutó en un motor PostgreSQL real. La primera aplicación autorizada debe tratar esta limitación como criterio de cautela adicional y capturar toda la salida.

## Resultado de la sesión autorizada por Texto 0005

La sesión del 2026-07-29 recibió autorización expresa para aplicar exclusivamente 004, pero terminó `PRECHECK_BLOCKED`; no llamó `apply_migration`.

Los prechecks técnicos read-only aprobaron:

- proyecto exacto `vlxkoprpobfevxefizwr`, `ACTIVE_HEALTHY`, PostgreSQL 17.6;
- cero migraciones registradas por el canal, cero ciclos y cero sesiones activas relevantes;
- huella 004 completamente ausente, sin columnas, tabla ni funciones parciales;
- hashes legacy v1/v15 exactamente iguales a los auditados;
- conteos operativos coherentes y cero mínimos certificados;
- checksum local de 004 exactamente `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf`;
- 277/277 pruebas locales y 35/35 pruebas específicas antes de decidir; la validación final amplió la selección a 37/37, incluido el ensayo operacional con adaptadores falsos.

El criterio de recuperación no aprobó. La organización remota está en plan Free y la documentación oficial vigente reserva los backups diarios administrados para Pro, Team y Enterprise; tampoco se demostró PITR ni un punto de restauración. Se capturaron definiciones, hashes y metadatos read-only, pero eso no sustituye el backup o restore point obligatorio de este plan.

Por tanto:

- `apply_migration` invocaciones: 0;
- SQL mutante remoto: 0;
- RPC operativas: 0;
- estado remoto: `MIGRATION_NOT_APPLIED`;
- clasificación de sesión: `PRECHECK_BLOCKED`.

No debe relajarse este gate por tratarse de una migración aditiva. La siguiente sesión solo puede retomar la aplicación cuando exista una recuperación demostrable y autorizada sin contradecir la decisión vigente de no exportar el historial detallado.

La validación final conservó 277/277 pruebas aprobadas, lint con cero errores y seis advertencias preexistentes, cinco JSON parseables, checksum exacto y cero archivos SQL modificados. Los únicos ajustes de prueba eliminaron instantes fijos caducables en dos fixtures de CLI; no se modificó el runner ni código operativo.

## Resultado de la aplicación autorizada por Texto 0006

El 2026-07-30 se demostró `SCOPED_RECOVERY_PROVEN` sin exportar el histórico: 004 no lo referencia ni lo muta, la tabla de ciclos seguía vacía, receipts no existía y las definiciones/ACL legacy estaban capturadas. El recovery exacto quedó fuera de la ruta automática, sin `CASCADE`, protegido en el commit `4127875931172285241445331c2fdc8c3a01fa11` y no autorizado para ejecución.

El precheck repetido confirmó proyecto, PostgreSQL, huella ausente, cero ciclos, cero sesiones relevantes, hashes y ACL v1/v15, conteos y checksum. Se invocó `apply_migration` exactamente una vez con el nombre `lobodeals_3_reconciliable_cycle_actions`; respondió éxito y registró la versión `20260730010927`.

El postcheck read-only confirmó la huella completa: diez columnas, nueve constraints y tres índices nuevos en cycles; receipts con 16 columnas, 14 constraints, cuatro índices, RLS y cero filas; doce funciones y dos triggers con firmas/permisos esperados; v1/v15 con hashes intactos e internalizados. Stage, import runs, monthly, caché, históricos, mínimos y timestamps permanecieron iguales. El preflight offline terminó `MIGRATION_READY` con código 2. No se creó un ciclo, no se invocó ninguna RPC nueva y no se ejecutó el recovery.
