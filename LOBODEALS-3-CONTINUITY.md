# LoboDeals 3.0 — Documento canónico de continuidad

Actualizado: 2026-07-28
Proyecto local: D:\Proyectos\lobodeals
Repositorio: lobovolk-hub/lobodeals
Rama principal: main

## 1. Fuente de verdad

Este es el documento canónico para continuar LoboDeals 3.0 en un chat nuevo.

Los documentos con sufijo v1.9 están obsoletos y fueron retirados del repositorio en el commit 4f826ac873850d3e61ceb68721512099625f1515.

La prueba operativa de 30 días no ha comenzado.

Solo comienza cuando Johan diga exactamente:

Día 1 de la prueba

## 2. Reglas de trabajo

Trabajar un paso a la vez.

Antes de cada comando PowerShell usar:

Set-Location "D:\Proyectos\lobodeals"

Cuando Johan publique una salida:

1. analizarla;
2. explicar el resultado;
3. entregar exactamente un siguiente paso.

No asumir nombres de:

- tablas;
- columnas;
- funciones;
- rutas;
- scripts;
- tareas;
- variables;
- despliegues;
- comportamiento de procesos.

Verificar primero mediante código, esquema o consultas de solo lectura.

No realizar escrituras técnicas sin autorización explícita.

No ejecutar collectors, importadores, runners, SQL de modificación, tareas, builds, pushes o deploys sin autorización.

No generar ZIP, backup, CSV, SQL dump ni pg_dump del historial de precios.

## 3. Dirección de producto

LoboDeals 3.0 comienza limitado a PlayStation US.

Debe mostrar:

- precio regular actual;
- precio de oferta actual;
- precio PS Plus actual;
- mínimo regular certificado;
- primera fecha de observación del mínimo regular;
- mínimo PS Plus certificado;
- primera fecha de observación del mínimo PS Plus;
- catálogo;
- ofertas;
- perfiles;
- seguimiento de juegos.

No habrá historial detallado ni gráfica de precios.

Los mínimos compactos:

- solo aceptan precios positivos y válidos;
- se inicializan en un ciclo certificado;
- solo cambian con un precio estrictamente menor;
- no usan precios ambiguos;
- no usan juegos mensuales de PS Plus;
- no registran free-to-play permanente como mínimo de cero;
- sobreviven a fallos posteriores.

La operación objetivo:

- actualización automática una vez al día;
- detección diaria de productos nuevos;
- procesamiento semanal completo de nuevos productos;
- preservación del último precio válido ante fallos;
- registro del último ciclo certificado;
- alertas cuando falle un ciclo;
- sin participación diaria de Johan.

## 4. Roadmap vigente

Bloque 0 — Auditoría de la fuente de verdad: cerrado.

Bloque 1 — Congelación del alcance 3.0: cerrado.

Bloque 2 — Detener escritura del historial detallado: implementado y desplegado.

Bloque 3 — Retirar consumo del historial y crear mínimos compactos:
infraestructura aplicada; eliminación física del historial pendiente.

Bloque 4 — Actualizador diario de precios:
auditoría avanzada; existen correcciones locales del parser PS Plus, normalización comercial compartida y colas fast refresh endurecidas, pero el runner diario certificado todavía no está implementado.

Bloque 5 — Automatización de Windows: pendiente.

Bloques posteriores:

- comunidad;
- moderación y seguridad;
- rediseño de slugs;
- rankings;
- SEO y rendimiento;
- monetización;
- prueba operativa.

La reactivación inicial de catálogo y ofertas no necesita esperar comunidad, rankings o monetización.

## 5. Estado Git

Commits principales:

- cf5e4bed398e5f9a6d2db6dd20655cfbf820b3c9
  Plan certified PSDeals cycle transitions

- 557871c31f6f93b2c43753519af212f41d000c11
  Validate PSDeals cycle manifests offline

- cb65456748997f6bc274dce9f8208eb9d4514d31
  Fail closed on ambiguous PSDeals types

- ac4fced045f97136225a867f97781a71a0eaa54e
  Document PSDeals classification and monthly contracts

- afd773d36b2f4896ff54a8678d0520b5e513aab0
  Build safe partial PSDeals stage payloads

- a01db70a10336f87553a5800330db990cea3b117
  Classify PSDeals item types and platforms

- 91861ae0ab77b30e303fcd1c8f27b8068ad77807
  Document price normalization and runner gaps

- 44b63f595ac14341525d9e90b3cc2c0ef138269a
  Harden fast refresh queue selection

- 29bea5ff0ccd7481f9fccd35966cb0326544d40c
  Normalize PSDeals commercial price state

- e3a5565e69ed69e8c939db06a99aa5ddf97feaf0
  Update LoboDeals operational continuity

- ce10408011213627ac9287b97299c0a6bcdfd267
  Prioritize capped PS Plus revalidation

- 05b23fb1f8f9abe06357d70a9e1b8f94d68429f1
  Fix current PS Plus price detection

- 4f826ac873850d3e61ceb68721512099625f1515
  Remove obsolete LoboDeals 1.9 documentation

- e3bb9578ba0242655d77e4c20b9cbbc7a19ea0f2
  Add LoboDeals 3.0 continuity checkpoint

- 51cd55df3268401fd7c56ae6ff007f6485532072
  Improve recently added listing auto-stop

- c2e32810dd43a2be29a72d8c343bddeb14d6116b
  Remove detailed price history and add certified price lows

- b35dc6709e0d6b8197c20208467b88726b1b2383
  Upgrade Next.js and fix lint errors

- d81418b35c41a8950a3d3d639ba43a73090d78c7
  Fix Unicode slug metadata

HEAD técnico local confirmado inmediatamente antes del commit documental de esta actualización:

cf5e4bed398e5f9a6d2db6dd20655cfbf820b3c9

origin/main confirmado:

4f826ac873850d3e61ceb68721512099625f1515

La rama local main estaba doce commits por delante y cero por detrás de origin/main antes del commit documental que contiene esta actualización.

Ningún commit local posterior a origin/main se ha enviado.

## 6. Producción

Último despliegue Vercel confirmado:

- deployment: dpl_FHhLSmHv6C1m1GYCtk3TwPXeCWz4
- estado: READY
- entorno: producción
- SHA: d81418b35c41a8950a3d3d639ba43a73090d78c7

Aliases esperados:

- lobodeals.com
- www.lobodeals.com

Proyecto Vercel:

- team: team_jGoo6NusUUoD1KzoFi2rEcCj
- project: prj_xi25eHLsj4DNb9zy7P0v64xM4W1I

Durante ese despliegue no se ejecutaron:

- collectors;
- importadores;
- runners;
- SQL de precios;
- borrado de historial;
- tareas de Windows;
- refrescos manuales de caché.

## 7. Unicode y slugs

Se validaron en producción:

- %C3%B6oo
- marvel-t%C5%8Dkon-fighting-souls
- metal-gear-solid-%CE%B4-snake-eater

Los tres devolvieron HTTP 200 y metadatos correctos.

El incidente Unicode se considera cerrado de forma limitada.

La revisión de consumo debe hacerse posteriormente con varios días de datos.

## 8. Paquetes

Versiones confirmadas:

- Next.js 16.2.12
- eslint-config-next 16.2.12
- React 19.2.4
- React DOM 19.2.4

Build confirmado correcto.

ESLint:

- 0 errores;
- 6 advertencias preexistentes.

npm audit:

- 1 vulnerabilidad baja;
- 6 vulnerabilidades altas.

No ejecutar automáticamente:

- npm audit fix
- npm audit fix --force

## 9. Supabase

Proyecto:

vlxkoprpobfevxefizwr

Región:

us-east-2

PostgreSQL:

17

Estado observado:

healthy

Tamaño aproximado:

420 MB

Conteos conocidos:

- psdeals_stage_items: 32,890
- catalog_public_cache: 32,890
- psdeals_stage_price_history: 841,549
- relaciones: 21,671
- cola: 16,473
- usuarios/perfiles: 5
- tracked: 6

El historial detallado ocupa aproximadamente 261 MB.

Los precios están desactualizados desde el 6 de junio de 2026.

## 10. Historial detallado

Johan no quiere conservar ningún respaldo del historial detallado.

No crear:

- backup;
- CSV;
- SQL dump;
- ZIP;
- pg_dump.

El historial todavía no debe eliminarse.

Orden obligatorio:

1. infraestructura compacta;
2. primer ciclo real certificado;
3. producción deja de consumir historial;
4. verificación final;
5. DROP sin backup y sin CASCADE.

## 11. Mínimos compactos

La migración vigente es:

sql/003-lobodeals-3-certified-price-lows.sql

Columnas creadas en psdeals_stage_items:

- lobodeals_lowest_regular_price_amount
- lobodeals_lowest_regular_price_first_seen_at
- lobodeals_lowest_ps_plus_price_amount
- lobodeals_lowest_ps_plus_price_first_seen_at

Objetos creados:

- price_refresh_cycles
- certify_price_refresh_cycle(uuid)

Estado actual:

- ciclos: 0
- ciclos certificados: 0
- mínimos regulares inicializados: 0
- mínimos PS Plus inicializados: 0

La migración no importó mínimos desde el historial antiguo.

## 12. Certificación de ciclos

Para certificar un ciclo se exige:

- región us;
- storefront playstation;
- estado succeeded;
- finished_at presente;
- validación aprobada;
- items_seen mayor que cero;
- items_failed igual a cero;
- failure_reason nulo;
- timestamps obligatorios dentro del ciclo;
- validación posterior a todas las etapas;
- cantidad exacta de filas marcadas igual a items_seen.

Todas las filas del listado de un ciclo deben compartir exactamente el mismo timestamp:

listing_last_seen_at = listing_completed_at

La certificación usa un advisory lock y actualiza los mínimos atómicamente.

## 13. Mínimo regular

Un candidato regular certificado requiere:

- moneda USD;
- no free-to-play;
- precio actual positivo;
- precio original positivo;
- precio original mayor al actual;
- porcentaje entre 1 y 99;
- relación de precios razonable;
- oferta activa;
- marca exacta del listado del ciclo.

Solo se inicializa o reemplaza con un precio estrictamente menor.

## 14. Mínimo PS Plus

Un candidato PS Plus requiere:

- detalle sincronizado durante el ciclo;
- moneda USD;
- no free-to-play;
- is_ps_plus_discount verdadero;
- precio PS Plus positivo;
- precio PS Plus menor al precio actual;
- oferta activa;
- ausencia como juego mensual activo.

En el HEAD técnico local, el parser toma el precio PS Plus actual del buy box, conserva el dato del gráfico solo como referencia histórica y exige que el precio PS Plus sea positivo y menor al precio actual para marcar el descuento.

El analizador fast refresh también prioriza una cola acotada y configurable de filas ya marcadas con descuento PS Plus. Su límite es independiente del límite de rotación stale.

Estas correcciones todavía no convierten el parser PS Plus en suficientemente confiable: falta validación operativa y el runner certificado no está integrado.

## 15. listing_last_seen_at

La columna:

- es timestamptz;
- acepta null;
- no tiene default;
- no es identity;
- no es generada.

Existen 7,337 filas históricas marcadas con un único timestamp:

2026-05-13 22:20:58.293505+00

Todas fueron creadas antes de ese timestamp.

Ninguna conserva raw_listing_json.

El origen fue una actualización masiva externa, manual o anterior al historial Git disponible.

No provino del importador actual, del importador inicial, de un trigger actual ni de SQL versionado.

La investigación histórica se considera cerrada.

El nuevo runner creará marcas explícitas propias.

## 16. Collector de listado

Archivo:

scripts/collect-psdeals-listing-edge-live-cdp.mjs

Campos recopilados:

- psdeals_id
- psdeals_slug
- psdeals_url
- title
- platform_label
- platform_tokens
- type_label
- canonical_content_family
- platform_scope_status
- listed_in_psdeals_scope
- is_ancillary_dlc_subtype
- current_price_amount
- original_price_amount
- discount_percent
- discount_percent_normalized
- commercial_state
- image_url
- source_page_url

Para considerar un listado completo se propone exigir:

- pages_failed igual a cero;
- total_results_detected mayor que cero;
- unique_items_collected mayor o igual al total detectado;
- stop_reason iniciado por unique_items_collected_reached_total_results.

Una parada por páginas consecutivas sin novedades es heurística.

Una parada por límite de seguridad no demuestra completitud.

Un JSON parcial nunca puede demover ofertas ni certificar mínimos.

## 17. Último JSON local inspeccionado

Archivo de junio inspeccionado:

data/import/psdeals-edge-live-discounts-fast-refresh-2026-06-06-15-59-53-2026-06-06T21-08-52-280Z.json

Resultados:

- items: 5,531
- total detectado: 5,552
- faltantes: 21
- stop_reason ausente
- pages_failed ausente

Es un formato antiguo e incompleto.

No puede usarse como ciclo certificado.

## 18. Porcentajes de descuento

En el JSON inspeccionado:

- descuentos no nulos: 5,488
- descuentos negativos: 5,488
- mínimo: -100
- máximo: -1

PSDeals representa el porcentaje visualmente con signo negativo.

La tabla solo admite valores entre 0 y 100.

Regla implementada localmente en el commit 29bea5ff0ccd7481f9fccd35966cb0326544d40c:

discount_percent_normalized = abs(discount_percent_source)

El porcentaje fuente con signo se conserva y los descuentos regulares de 1 a 99 solo se aceptan cuando coinciden exactamente con:

round(100 × (original - actual) / original)

También se comprueba:

- entero;
- rango válido;
- precio actual;
- precio original;
- original mayor al actual;
- coherencia entre porcentaje y precios.

Los descuentos -100 se clasifican aparte. Nunca son descuentos regulares certificables:

- actual igual a cero y original positivo: candidato a promoción gratuita temporal;
- actual ausente: ambiguo y requiere detalle;
- actual positivo: extremo;
- ratio superior a 20: no certificable.

Nunca deben crear automáticamente un mínimo de cero.

La repetición offline sobre el JSON local de junio produjo:

- 5,310 descuentos regulares coherentes;
- 5,174 elegibles para certificación por ratio;
- 136 regulares coherentes que superan el ratio 20 y requieren revalidación;
- 162 descuentos completos ambiguos por precio actual ausente;
- 16 descuentos completos extremos con precio actual positivo;
- 43 tuplas ambiguas sin porcentaje;
- 357 filas seleccionables para revalidación de detalle por seguridad comercial.

El harness offline importa las funciones usadas por producción y pasa 29 de 29 pruebas. También pasan node --check, el análisis sintáctico PowerShell, ESLint sin errores y git diff --check. El build se omitió porque el prerender actual consulta Supabase.

## 19. Plataformas reales observadas

Distribución principal:

- PS4: 2,923
- PS5: 1,294
- PS5 / PS4: 1,248
- combinaciones con PS3 o PS Vita: 66

LoboDeals 3.0 queda limitado inicialmente a PS4 y PS5.

No sobrescribir plataformas válidas con etiquetas desconocidas o mezclas no objetivo.

## 20. Tipos reales observados

Principales:

- Full Game
- Bundle
- Add-On
- Level
- VR Game
- PSN Game
- Avatar
- Costume
- Character
- Vehicle
- Item
- Weapons
- Season Pass
- Map
- Dynamic Theme
- Game Content
- Static Theme
- Soundtrack
- Theme
- Demo

El mapeo actual del collector es demasiado agresivo:

- Full Game a game
- Bundle a bundle
- Demo a other
- casi todo lo demás a dlc

La tabla acepta:

- game
- bundle
- dlc
- add_on
- season_pass
- currency
- demo
- other

Debe definirse un mapeo explícito antes de escribir datos.

## 21. Contrato de psdeals_stage_items

Campos mínimos sin default para una fila nueva:

- psdeals_id
- psdeals_slug
- psdeals_url
- title

Conflicto único:

region_code, storefront, psdeals_id

El esquema permite insertar una fila mínima desde el listado y completar detalles más adelante.

El upsert diario debe ser parcial y no debe sobrescribir campos de detalle con null.

## 22. Propiedad de datos

El listado diario será dueño de:

- presencia;
- listing_last_seen_at;
- identidad PSDeals;
- slug;
- URL PSDeals;
- título visible;
- imagen visible;
- precios regulares visibles;
- porcentaje normalizado;
- clasificación segura;
- raw_listing_json.

El detalle será dueño de:

- URL de PlayStation Store;
- identificadores oficiales;
- descripción;
- publisher;
- géneros;
- lanzamiento;
- ratings;
- addons;
- relaciones;
- disponibilidad;
- precio PS Plus;
- detail_last_synced_at;
- raw_detail_json.

La función de certificación será la única dueña de los cuatro campos de mínimos compactos.

## 23. Importador de detalles

Archivo:

scripts/import-psdeals-detail-local.mjs

No es un updater de precios aislado.

Problemas pendientes:

- upsert amplio;
- todavía puede escribir null en campos amplios de detalle ajenos al estado comercial;
- puede reemplazar relaciones;
- continúa después de fallos individuales;
- partial o failed puede no producir exit code no cero;
- no integra price_refresh_cycles;
- no certifica;
- PS Plus requiere validación operativa.

En HEAD ya no escribe historial detallado.

El commit local 05b23fb1f8f9abe06357d70a9e1b8f94d68429f1 corrigió la detección del precio PS Plus actual.

El commit local 29bea5ff0ccd7481f9fccd35966cb0326544d40c añadió un payload comercial parcial: una tupla insegura omite precios, porcentaje, fin de oferta, señal PS Plus y disponibilidad, preservando los valores existentes en vez de escribir null. También dejó de inferir free-to-play permanente solamente porque el precio actual sea cero.

No debe reutilizarse sin adaptaciones como runner diario definitivo.

## 24. Ofertas terminadas

Archivos:

- scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs
- scripts/apply-psdeals-ended-discounts-safe-demotion-v1.mjs

Riesgo principal:

un listado parcial puede producir demociones falsas.

La democión solo podrá ejecutarse después de validar completitud fuerte.

El demoter es dry-run por defecto y requiere token explícito para escribir.

No programarlo todavía.

## 25. Arquitectura prevista del runner

Secuencia prevista:

1. crear ciclo running;
2. recopilar listado completo;
3. validar completitud;
4. normalizar y validar datos;
5. usar un timestamp único;
6. insertar productos nuevos mínimos;
7. actualizar precios regulares con payload parcial;
8. detectar candidatos de detalle;
9. actualizar detalles necesarios;
10. comprobar juegos mensuales;
11. demover ofertas terminadas con listado completo;
12. validar el ciclo;
13. marcar succeeded;
14. certificar;
15. refrescar caché;
16. validar producción;
17. registrar métricas y alertas.

Ante un fallo:

- no certificar;
- no borrar precios válidos;
- no demover desde listado parcial;
- marcar failed o partial;
- conservar el último ciclo certificado.

## 26. Automatización

Tarea de Windows conocida:

LoboDeals - Metacritic Weekly 14d

Estado:

- enabled;
- ready.

Tiene defectos conocidos.

No ejecutar, editar, deshabilitar ni eliminar sin autorización.

El updater diario tendrá una tarea separada.

La hora todavía no está decidida.

## 27. SEO y consumo

Medidas temporales:

- sitemap limitado a /, /catalog y /deals;
- robots.txt bloquea /us/playstation/.

Mantener hasta nuevo aviso.

La reactivación operativa puede refrescar catálogo y ofertas sin desbloquear el crawling masivo de slugs.

## 28. Qué falta para reactivar catálogo y ofertas

Estado de los hitos principales:

1. normalización del descuento negativo: cerrada localmente y validada offline;
2. tratamiento de -100%: cerrado localmente y validado offline;
3. mapeo de tipos: cerrado localmente con política explícita de omisión;
4. reglas de plataformas: cerradas localmente para el alcance PS4/PS5;
5. PS Plus mensual: contrato local auditado; actualización operativa todavía manual y sin fuente conectada;
6. diseño final del payload parcial: cerrado localmente y no conectado a un runner diario;
7. implementación del runner;
8. simulación sin escrituras;
9. primer ciclo real;
10. certificación;
11. refresco de caché;
12. validación de /catalog y /deals;
13. automatización y alertas.

Los pasos 1 a 6 no se han ejecutado contra datos reales ni desplegado. Los pasos 7 a 13 siguen abiertos. El paso 5 solo está cerrado como auditoría de contrato, no como operación mensual automatizada.

## 29. Siguiente punto exacto

Crear un inicializador y verificador exclusivamente local del workspace de ciclo que genere una sola vez `local_cycle_id` y `run_token`, los entregue explícitamente a las etapas futuras y cargue/verifique los sobres antes de invocar el ensamblador puro. Debe seguir sin ejecutar productores, Supabase ni acciones operativas. La cadena de evidencia, el validador offline, el ensamblador y el planificador puro ya existen; todavía no están conectados a un runner operativo.

## 30. Gap audit del runner diario certificado

El runner actual conecta únicamente:

1. listado de descuentos por Edge live;
2. analyzer fast refresh;
3. colas obligatoria, PS Plus y stale;
4. importación amplia de detalles;
5. un retry extraído del log;
6. impresión de instrucciones manuales para caché y validación.

No están conectados:

- detección diaria y procesamiento semanal completo de nuevos productos;
- validación fuerte de completitud del JSON antes de usarlo;
- upsert parcial del listado con un timestamp único;
- creación o actualización de price_refresh_cycles;
- democión segura de ofertas terminadas;
- comprobación de juegos mensuales PS Plus;
- validación final del ciclo;
- cambio controlado a succeeded o failed;
- certify_price_refresh_cycle(uuid);
- refresh_catalog_public_cache_v15();
- validación posterior de catálogo, ofertas y métricas.

Solo existen en SQL local price_refresh_cycles y certify_price_refresh_cycle(uuid). La función exige succeeded, finished_at, validación aprobada, cero fallos, failure_reason nulo, cuatro timestamps de etapa dentro del ciclo y coincidencia exacta entre items_seen y las filas marcadas con listing_last_seen_at. Usa advisory lock y actualiza mínimos de forma atómica.

La definición de refresh_catalog_public_cache_v15() no está versionada en sql/. Solo existen invocadores y las instrucciones manuales del runner.

El importer registra psdeals_import_runs, no price_refresh_cycles. Un resultado partial puede terminar con exit code cero; el runner intenta un retry, pero no verifica fallos remanentes ni bloquea el paso manual de caché.

Los scripts de ofertas terminadas existen separados. El analyzer no valida por sí mismo la completitud fuerte del listado y el demoter requiere --apply=YES_I_UNDERSTAND para escribir.

No existe ningún script que lea o actualice ps_plus_monthly_games durante el ciclo. La certificación solo excluye juegos mensuales ya presentes y activos.

Puede implementarse localmente sin SQL ni escrituras remotas:

- validador offline de completitud y manifiesto de ciclo;
- planificador dry-run del orden de etapas;
- contrato de exit code no cero ante fallos remanentes;
- pruebas de que un ciclo incompleto nunca alcanza certificación o caché.

El validador offline de manifiesto/completitud, los clasificadores, los payloads parciales y la cadena local de evidencia ya existen. Todavía no hay un escritor diario de listado ni deben conectarse operaciones hasta que exista un creador único de identidad del ciclo, se cierre el productor de evidencia mensual y se demuestre el lifecycle remoto sin inventar contratos.

## 31. Acciones prohibidas sin nueva autorización

No ejecutar:

- collector real;
- importador real;
- runner;
- demoter con apply;
- función de certificación;
- creación manual de ciclos;
- SQL de actualización;
- DROP del historial;
- refresco de caché;
- tareas programadas;
- build;
- push;
- deploy;
- limpieza de datos;
- npm audit fix;
- npm audit fix --force.

No comenzar la prueba hasta que Johan diga exactamente:

Día 1 de la prueba

## 32. Checkpoint local de tipos, plataformas, payload y PS Plus mensual — 2026-07-29

### Estado de entrada y commits

La sesión comenzó en:

- rama main;
- HEAD 91861ae0ab77b30e303fcd1c8f27b8068ad77807;
- worktree limpio;
- cero commits detrás y seis commits delante de origin/main;
- 29 pruebas offline aprobadas.

Se crearon dos commits de código locales:

1. a01db70a10336f87553a5800330db990cea3b117 — Classify PSDeals item types and platforms
   - scripts/audit-psdeals-listing-classification-local.mjs
   - scripts/collect-psdeals-listing-edge-live-cdp.mjs
   - scripts/import-psdeals-detail-local.mjs
   - scripts/lib/psdeals-item-classification.mjs
   - tests/psdeals-item-classification.test.mjs
2. afd773d36b2f4896ff54a8678d0520b5e513aab0 — Build safe partial PSDeals stage payloads
   - scripts/import-psdeals-detail-local.mjs
   - scripts/lib/psdeals-stage-payload.mjs
   - tests/psdeals-item-classification.test.mjs
   - tests/psdeals-stage-payload.test.mjs

No se hizo push.

### Evidencia de tipos

Se inspeccionaron 19,136 HTML locales de detalle. La etiqueta de detalle solo tomó estos valores:

- game: 12,972;
- addon: 3,234;
- bundle: 2,930.

Las 5,531 filas del snapshot de descuentos de 2026-06-06 pudieron emparejarse con un HTML local de detalle. Ese cruce demostró el siguiente contrato:

| Etiqueta listing | Etiqueta detalle observada | content_type | item_type_label | Política |
| --- | --- | --- | --- | --- |
| Full Game | game | game | game | escritura segura |
| VR Game | game | game | game | escritura segura |
| PSN Game | game | game | game | escritura segura |
| Game Content | game | game | game | escritura segura |
| Bundle | bundle | bundle | bundle | escritura segura |
| Demo | game | demo | demo | listing específico prevalece; detail game no lo sustituye |
| Add-On | addon | dlc | addon | bucket público existente de add-ons |
| Avatar / Avatars | addon | dlc | addon | bucket público existente de add-ons |
| Costume | addon | dlc | addon | bucket público existente de add-ons |
| Character | addon | dlc | addon | bucket público existente de add-ons |
| Vehicle | addon | dlc | addon | bucket público existente de add-ons |
| Item | addon | dlc | addon | bucket público existente de add-ons |
| Weapons | addon | dlc | addon | bucket público existente de add-ons |
| Level | addon | dlc | addon | bucket público existente de add-ons |
| Map | addon | dlc | addon | bucket público existente de add-ons |
| Season Pass | addon | dlc | addon | familia preservada como season_pass; sin semántica pública separada |
| Dynamic Theme | addon | dlc | addon | bucket público existente de add-ons |
| Static Theme | addon | dlc | addon | bucket público existente de add-ons |
| Theme | addon | dlc | addon | bucket público existente de add-ons |
| Soundtrack | addon | dlc | addon | bucket público existente de add-ons |
| Music Track | addon | dlc | addon | bucket público existente de add-ons |
| Extra Episode | addon | dlc | addon | bucket público existente de add-ons |
| VR Add-On | addon | dlc | addon | bucket público existente de add-ons |
| Catalog | addon | propuesta dlc | propuesta addon | confianza media; no escribible, requiere detalle y no sustituye valor existente |
| Combo | addon | propuesta dlc | propuesta addon | confianza media; no escribible, requiere detalle y no sustituye valor existente |
| Subscription | addon | propuesta dlc | propuesta addon | confianza media; no escribible, requiere detalle y no sustituye valor existente |
| null, vacío o desconocido | no demostrable | omitido | omitido | conserva evidencia y requiere detalle |

Los valores permitidos por el contrato de aplicación siguen limitados a game, bundle, dlc, add_on, season_pass, currency, demo y other. El clasificador no emite add_on, currency u other porque no existe evidencia local que justifique una semántica pública separada. No convierte coincidencias parciales ni etiquetas desconocidas en dlc.

La etiqueta detail game es deliberadamente no reemplazante: los HTML demuestran que colapsa Full Game, VR Game, PSN Game, Game Content y Demo.

No se añadió una cola de tipos al fast refresh. Las revalidaciones de tipo quedan como métricas observables y no consumen la cola obligatoria de precios.

### Contrato de plataformas

El alcance público permanece limitado a PS4 y PS5, con orden canónico PS5, PS4.

- PS4, PS5 y combinaciones puras de ambas son escribibles y reemplazantes;
- duplicados, espacios y mayúsculas se normalizan y deduplican;
- PS3, PS Vita y PSP se conservan como evidencia antigua y nunca se publican como plataformas objetivo;
- una mezcla PS4/PS5 con una plataforma antigua permite conservar la intersección objetivo para una fila nueva, pero requiere detalle y no sustituye plataformas existentes;
- una mezcla con token desconocido, un valor exclusivamente antiguo, null, vacío o malformado omite la actualización;
- ninguna regla amplía el catálogo público a PS3, Vita o PSP.

### Medición reproducible del snapshot más reciente

Comando local de solo lectura:

node scripts/audit-psdeals-listing-classification-local.mjs --snapshot=data/import/psdeals-edge-live-recently-added-readonly-2026-07-03-13-04-15-2026-07-03T18-09-51-857Z.json

Resultado corregido sobre 3,600 filas:

- tipos escribibles normalizados: game 2,522; bundle 631; dlc 441; omitido 6;
- distribución propuesta, incluida evidencia no escribible: game 2,522; bundle 631; dlc 446; omitido 1;
- tipos de confianza alta: 3,594;
- tipos ambiguos de confianza media: 5 Catalog;
- tipos desconocidos: 1;
- filas de tipo que requieren detalle y conservan valor anterior: 6;
- plataformas puras de objetivo: 3,598;
- mezclas objetivo + PS Vita: 2;
- plataformas desconocidas o exclusivamente antiguas: 0;
- filas de plataforma que requieren detalle y conservan valor anterior: 2;
- candidatos distintos de revisión por tipo o plataforma: 8;
- integración con fast refresh: ninguna, solo métricas.

### Contrato del payload parcial

scripts/lib/psdeals-stage-payload.mjs exporta constructores puros para:

1. fila mínima nueva desde listing;
2. actualización parcial desde listing;
3. upsert parcial seguro desde detalle.

Reglas cerradas:

- una fila nueva exige identidad PSDeals válida, slug, URL, título, timestamp de listado y raw_listing_json;
- una actualización existente solo incluye claves presentes y validadas;
- undefined y null se omiten en el nivel superior;
- el listing solo escribe precios cuando el descuento regular 1–99 es coherente y certificable;
- -100%, FREE temporal, precios ambiguos e incoherencias conservan evidencia, pero no escriben precios ni free_to_play;
- tipo o plataformas desconocidos no sustituyen valores existentes;
- raw_listing_json y raw_detail_json permanecen bajo su productor;
- el detalle de una fila existente no sustituye slug, URL PSDeals, título, imagen, tipo o plataformas del listing;
- campos ausentes de detalle, arrays vacíos y URLs oficiales inválidas se omiten;
- los campos Metacritic no vuelven al importer;
- ningún constructor incluye los cuatro mínimos compactos lobodeals_lowest_*.

No existe DDL local completo de psdeals_stage_items. Por eso los builders no están conectados a un upsert diario y no afirman conocer todas las restricciones remotas. Conservar un valor anterior se implementa omitiendo su clave; no se inventó una lectura remota ni se cambió SQL.

### Validación offline

Después de los dos commits de código:

- npm test: 55/55 pruebas aprobadas;
- node --check: todos los MJS creados o modificados aprobados;
- npm run lint: cero errores y seis advertencias preexistentes;
- git diff --check: aprobado;
- no reaparecieron latestChartBonusPriceAmount ?? currentPsPlusBuyBoxPriceAmount, explicitCurrentPlus ni current === lowestPsPlusPriceAmount;
- no se ejecutó build.

### Auditoría local de PS Plus mensual

Contrato demostrado:

1. ps_plus_monthly_games es una allowlist manual separada de precios y descuentos;
2. SQL local exige la existencia de item_id, is_active, active_from, active_until, active_from_at y active_until_at;
3. la actividad relevante para certificación requiere is_active=true y que detail_last_synced_at caiga dentro de la ventana efectiva;
4. active_from_at prevalece sobre active_from convertido a timestamptz;
5. active_until_at prevalece sobre el final exclusivo active_until + 1 día;
6. catalog_public_cache expone is_ps_plus_monthly_game, ps_plus_monthly_label, ps_plus_monthly_note, ps_plus_monthly_month y ps_plus_monthly_until;
7. Home filtra is_ps_plus_monthly_game=true y la tarjeta/detalle muestran un beneficio mensual separado;
8. el beneficio mensual no debe modificar current_price_amount, no debe implicar has_deal ni has_ps_plus_deal y no prueba free_to_play;
9. certify_price_refresh_cycle excluye una fila mensual activa de candidatos al mínimo PS Plus;
10. monthly_games_checked_at debe existir dentro del ciclo y antes de validation_completed_at, pero SQL no demuestra por sí solo qué fuente se revisó ni qué filas cambiaron.

La documentación histórica recuperada desde Git confirma que el MVP se cargaba manualmente una vez al mes después de revisar una fuente oficial. Esa historia es evidencia del procedimiento anterior, no una definición vigente del esquema.

No está versionado localmente:

- el DDL completo de ps_plus_monthly_games;
- la nulabilidad, defaults, restricciones o columnas descriptivas adicionales de una fila mensual;
- la definición actual de refresh_catalog_public_cache_v15();
- un script que lea, active, desactive o valide la allowlist mensual;
- un fixture mensual rastreado;
- una referencia de fuente oficial dentro de price_refresh_cycles.

Por tanto, activar y desactivar sigue siendo manual. Antes de marcar monthly_games_checked_at, un futuro paso autorizado deberá revisar una fuente oficial de PlayStation, resolver cada juego contra item_id, validar ventanas, reconciliar activaciones y desactivaciones, refrescar la caché y verificar que los campos de precio y deal no se contaminaron. Ninguno de esos pasos se ejecutó.

Puede probarse offline un manifiesto mensual con identidad, ventanas, solapamientos, duplicados, evidencia de fuente y separación de precios. La siguiente implementación mensual segura sería un validador puro de ese manifiesto, sin fuente externa ni escritura.

### Posición exacta del Bloque 4

Quedaron cerrados localmente los contratos de normalización comercial, tipos, plataformas y payload parcial. El contrato mensual quedó auditado, pero su operación sigue manual y bloqueada por DDL/procedimiento no versionados y por la futura autorización de una fuente oficial.

El Bloque 4 no está cerrado. El validador offline de manifiesto/completitud y el planificador puro ya están implementados en el checkpoint siguiente; no constituyen un runner. No debe ejecutarse aún ningún collector, importer, runner, SQL, certificación, caché ni prueba operativa.

## 33. Checkpoint de revisión adversarial y gates offline — 2026-07-29

### Estado de entrada y commits técnicos

La sesión comenzó en `main`, HEAD `ac4fced045f97136225a867f97781a71a0eaa54e`, worktree limpio y divergencia de cero commits detrás y nueve delante de `origin/main`. La baseline fue de 55/55 pruebas aprobadas.

Se crearon tres commits técnicos locales:

1. `cb65456748997f6bc274dce9f8208eb9d4514d31` — Fail closed on ambiguous PSDeals types;
2. `557871c31f6f93b2c43753519af212f41d000c11` — Validate PSDeals cycle manifests offline;
3. `cf5e4bed398e5f9a6d2db6dd20655cfbf820b3c9` — Plan certified PSDeals cycle transitions.

No se hizo push.

### Revisión adversarial de tipos y plataformas

El cruce de las 5,531 filas de descuentos con 19,136 HTML locales confirmó:

- `Game Content`: 12 muestras, 12 detalles `game`; ejemplo `2402875`, AI: THE SOMNIUM FILES - nirvanA Initiative;
- `Season Pass`: 18 muestras, 18 detalles `addon`; ejemplo `1297809`, DOA5LR Season Pass 7;
- `Catalog`: una muestra en ese snapshot, detalle `addon`; ejemplo `3088728`, THE FINALS - TEAM SECRET TGM25;
- `Combo`: una muestra, detalle `addon`; ejemplo `649506`, HELLDIVERS™ - Support Pack;
- `Subscription`: una muestra, detalle `addon`; ejemplo `645296`, PlanetSide 2 1-Month Membership;
- `Avatar`: 127/127 detalles `addon`;
- `Theme`: 8/8 detalles `addon`;
- `Soundtrack`: 9/9 detalles `addon`.

La interfaz no demuestra semánticas públicas distintas para `dlc`, `add_on` o `season_pass`: las páginas de ofertas consumen `content_type=dlc` y compatibilidad histórica `content_type=game` + `item_type_label=addon`; las tarjetas y el detalle muestran `dlc` como Add-on. `item_type_label` observado por la interfaz usa `game`, `bundle` y `addon`. Por eso Season Pass conserva la familia interna `season_pass`, pero escribe el bucket público existente `dlc/addon`.

La revisión sí encontró una política insegura: `Catalog`, `Combo` y `Subscription` tenían una propuesta de confianza media que podía escribirse en una fila nueva pese a requerir detalle. Desde `cb65456`, mantienen la propuesta `dlc/addon` como evidencia, pero quedan `ambiguous`, `can_write=false`, `requires_detail=true` y `can_replace_existing=false`. En el snapshot de 3,600 filas existen cinco `Catalog`; solo `3088728` tiene detalle local, por lo que la evidencia de una única muestra no se extrapola a las otras cuatro.

Las 66 mezclas con plataformas antiguas del snapshot de 5,531 conservan coincidencia exacta entre etiqueta de listing y detalle. Continúa la política PS5, PS4: conservar solo la intersección objetivo para una fila nueva, retener evidencia PS3/Vita/PSP, requerir detalle y no reemplazar plataformas existentes. Ningún artículo exclusivamente antiguo se publica como PS4/PS5.

### Por qué 3,600 y 5,531 no son baselines equivalentes

El archivo de 5,531 filas es un listing de descuentos del 2026-06-06. Declaró 5,552 elementos detectados, recogió 5,531 y se detuvo por heurística de página duplicada; su formato anterior no demuestra última página ni completitud fuerte.

El archivo de 3,600 filas es un listing de `all-games` ordenado por recientemente añadido del 2026-07-03. Declaró 33,041 elementos detectados, procesó exactamente 100 páginas de 36 filas y se detuvo por límite de seguridad. Su alcance, filtros, orden y criterio de parada son distintos.

Por tanto, ninguno prueba por sí solo un listing diario completo y no deben compararse como una serie homogénea. Después de la corrección adversarial:

- 3,600: tipos escribibles `game` 2,522, `bundle` 631, `dlc` 441, omitidos 6; cinco ambiguos y uno desconocido; 3,598 plataformas objetivo puras y dos mezclas con Vita;
- 5,531: tipos escribibles `game` 3,388, `bundle` 924, `dlc` 1,212, `demo` 2, omitidos 5; tres ambiguos y dos desconocidos; 5,465 plataformas objetivo puras y 66 mezclas antiguas.

No se añadió ninguna cola ilimitada de tipos al fast refresh.

### Contrato versionado del manifiesto

`scripts/lib/psdeals-cycle-manifest.mjs` define la versión 1 y separa:

- identidad: `local_cycle_id`, posible `remote_cycle_id`, región, storefront, inicio, generación, modo y revisión de código;
- listing: alcance, filtros, páginas, totales, duplicados, resultado, terminación de paginación, timestamp único, artefacto, SHA-256 y baseline opcional comparable;
- fast refresh: colas must-refresh, PS Plus y stale, límites independientes, solapamientos, razones y artefactos;
- detalle: intentados, éxitos, fallos, omitidos, resultado declarado, exit code, URLs fallidas, retry, fallos pendientes y posible `psdeals_import_run_id` evidenciado;
- mensual: comprobación semántica, instante, fuente o procedimiento, evidencia, resultado y cambios propuestos;
- ofertas terminadas: comprobación, vínculo al listing completo, candidatos, modo, aplicación y bloqueos;
- lifecycle y acciones registradas;
- gates y razones estructuradas.

Un ciclo offline usa un `local_cycle_id`; no inventa un UUID remoto. Todos los artefactos obligatorios deben compartir el `run_token`, región y storefront, y presentar ruta y SHA-256. El CLI también verifica los archivos y sus hashes reales.

### Completitud fuerte y gates fail-closed

El listing se clasifica como `complete`, `incomplete`, `indeterminate` o `incompatible_baseline`. Solo `complete` permite democión. Exige todas las páginas solicitadas terminadas, cero páginas fallidas, paginación final observada o terminación fuerte equivalente, JSON final no `.partial`, totales consistentes, IDs únicos, filtros exactos US/PlayStation/PS5+PS4 y evidencia ligada a una sola ejecución.

No existe un número mágico de 5,531 o 3,600. Una baseline es opcional, debe declarar filtros comparables, timestamp, umbral de caída y antigüedad; una baseline incompatible, antigua o una caída anormal no se convierte silenciosamente en éxito.

Los gates quedan cerrados cuando falta evidencia o existe contradicción:

- `can_demote`: exige listing fuertemente completo y comprobación de ofertas terminadas vinculada a ese listing;
- `can_mark_succeeded`: además exige fast refresh, detalle sin fallos pendientes, revisión mensual válida y validación temporal coherente;
- `can_certify`: exige estado `succeeded`, `finished_at`, un `remote_cycle_id` UUID evidenciado y todas las gates anteriores;
- `can_refresh_cache`: exige certificación registrada; nunca se habilita por intención ni antes de certificar.

Un exit code 0 del importer no vence un resultado interno `partial` o `failed`; un retry solo cierra detalle cuando deja cero URLs pendientes. Un timestamp mensual sin fuente, procedimiento o evidencia no satisface la revisión. Las páginas fallidas, arrays solapados, límites excedidos, timestamps invertidos/futuros o artefactos de distintas ejecuciones bloquean el ciclo.

### CLI y planificador puros

`scripts/validate-psdeals-cycle-offline.mjs` solo lee archivos locales y muestra `OFFLINE_VALIDATION`. Acepta `--manifest` o `--listing-artifact`, salida humana o `--json`, y nunca aplica acciones. Códigos de salida:

- 0: manifiesto válido;
- 1: uso, lectura, parseo o error local de archivo;
- 2: evidencia inválida o contradictoria;
- 3: resultado indeterminado por evidencia obligatoria ausente.

`scripts/lib/psdeals-cycle-plan.mjs` representa sin ejecutar el orden futuro de 16 pasos: crear ciclo, recoger y validar listing, construir payload, upsert, analizar/importar/reintentar detalle, revisar mensual, analizar ofertas terminadas, validar, marcar succeeded, certificar, refrescar caché, validar público y registrar métricas. Cada paso declara alcance y autorización futura; una gate cerrada bloquea los pasos dependientes. Este módulo no es el runner diario.

### Auditoría de artefactos históricos

El CLI clasificó individualmente como inválidos e incompletos los listings de 5,531 y 3,600 filas. Ambos bloquean `CAN_DEMOTE`, `CAN_CERTIFY` y `CAN_REFRESH_CACHE` porque no demuestran última página, completitud ni un `run_token` común; además sus totales detectados no coinciden con lo recogido.

Para el grupo temporal del 2026-06-06 existen un analyzer de 5,531 IDs únicos, 31 must-refresh, 500 stale y 531 combinados; un import inicial parcial con 531 vistos, 441 actualizados y 90 fallidos; y un retry separado con 90 vistos, 90 actualizados y cero fallos. También existen 23 candidatos de ofertas terminadas construidos sobre el listing incompleto. No existe evidencia local de revisión mensual, price_refresh_cycle, certificación, hash/run token compartido ni enlace inequívoco entre todos los archivos. La proximidad temporal no basta: el conjunto histórico permanece indeterminado y no certificado.

### Validación y bloqueos restantes

La validación local cerró con 96/96 pruebas, `node --check` aprobado, lint con cero errores y seis advertencias preexistentes, `git diff --check` aprobado, CLI válido con exit 0 e inválido con exit 2. No se ejecutó build.

Falta que los productores emitan evidencia estructurada compatible. El collector actual no aporta un `run_token` común, hash, resultado fuerte o inicio de ciclo; el analyzer histórico no emite un resumen versionado completo; el importer puede devolver exit 0 con estado partial y no deja un artefacto final común; la revisión mensual no tiene productor local; el analyzer de ofertas terminadas no exige la gate; y no están implementados el ciclo remoto, upsert diario, certificación, caché ni validación pública. La definición de `refresh_catalog_public_cache_v15()` tampoco está versionada localmente.

El Bloque 4 no está cerrado y ningún ciclo histórico quedó certificado. El siguiente cambio local seguro es crear un sobre de evidencia puro y compartido y adaptar, sin ejecutarlos, collector, analyzer e importer para emitir metadatos versionados compatibles con el manifiesto. No se debe conectar aún ninguna escritura ni acción operativa.

## 34. Checkpoint de cadena local de evidencia — 2026-07-29

### Estado y commits

La sesión comenzó en `main`, HEAD `75bc916b48a10e1fdcd5c425dfcda40df8d233f8`, worktree limpio y divergencia de cero commits detrás y trece delante de `origin/main`. La baseline fue de 96/96 pruebas aprobadas.

Se crearon tres commits técnicos locales:

1. `fcd2215146a4bfda64215286e999b7c4df8361e5` — Define and validate PSDeals evidence envelopes;
2. `da7938b63506a240374c4f2ad3cfac1b8fca13d0` — Emit linked PSDeals producer evidence;
3. `f1539ed1b446ddc1b8ede425025bd91accefcbbf` — Assemble PSDeals manifests from evidence.

No se hizo push.

### Contrato del sobre de evidencia versión 1

`scripts/lib/psdeals-evidence-envelope.mjs` define un sobre genérico con payload tipado. Exige:

- `evidence_version=1` y un `evidence_kind` cerrado;
- `local_cycle_id` y `run_token` explícitos;
- productor, versión o revisión Git, región `us`, storefront `playstation`, modo y tres timestamps;
- contexto canónico con URL solicitada, plataformas, tipos, orden, límites y fingerprint estable de los filtros;
- referencias portables a entradas y salidas con rol, tipo, estado final, tamaño y SHA-256;
- status estructurado, métricas, errores, advertencias y reason codes.

Los builders son deterministas: no crean fechas, UUID ni tokens. El I/O está separado, calcula SHA-256 sobre los bytes reales y dispone de escritura atómica mediante temporal específico más rename; se niega a sobrescribir una salida existente. No existe self-hash circular del sobre.

Semántica cerrada:

- `local_cycle_id` identifica todo el ciclo local;
- `run_token` es un identificador opaco de correlación compartido por todas sus etapas;
- ambos los debe crear una sola vez el futuro creador del ciclo y pasarlos explícitamente;
- no se infieren desde timestamps, directorios, nombres ni proximidad temporal;
- no son credenciales y no contienen secretos;
- ninguno equivale al UUID remoto de `price_refresh_cycles`;
- `remote_cycle_id` solo se admite como UUID en evidencia real y nunca se inventa.

El manifiesto versión 1 conserva compatibilidad con fixtures antiguos que no tenían `identity.run_token`: usa el comportamiento legacy solamente cuando ese campo no existe. Los manifiestos nuevos guardan el token opaco en `identity.run_token`, secciones y referencias; ya no necesitan confundirlo con `local_cycle_id`.

### Evidence kinds y cadena de hashes

Quedaron implementados y validados:

1. `listing_collection`;
2. `fast_refresh_analysis`;
3. `detail_import`;
4. `detail_retry`;
5. `ended_deals_analysis`.

La cadena verificable es:

1. el listing produce `listing_json` final y su SHA-256;
2. fast refresh registra como entrada exactamente ese hash y produce resumen, must-refresh, PS Plus recheck, stale, skipped y combined, todos con hash;
3. detail import registra exactamente el hash de combined y produce resumen más lista de fallos;
4. detail retry registra el hash de la lista original y el hash del sobre exacto del import inicial; produce resumen y fallos pendientes;
5. ended deals registra el hash exacto del listing y siempre conserva `application_performed=false`.

Un status `partial` o `failed` es evidencia válida del fallo, no evidencia de completitud. Un exit code cero no convierte un import parcial en exitoso y un retry solo cierra detalle cuando demuestra cero fallos pendientes.

### Adaptación de productores

- collector: acepta identidad y salida de evidencia explícitas, hashea JSON/TXT después de finalizarlos y distingue terminación fuerte, límite/heurística y página fallida;
- analyzer fast refresh: quedó import-safe, puede emitir un resumen JSON estructurado y sobres con todas las colas, razones, límites, solapamientos y hashes;
- importer: acepta `detail_import` o `detail_retry`, valida el sobre padre y el hash de la cola antes de operar, y puede producir resumen/lista de fallos y evidencia aun cuando el resultado sea partial o failed;
- retry: usa el mismo entrypoint del importer, pero exige el sobre del import inicial y la lista exacta de fallos;
- analyzer de ofertas terminadas: quedó import-safe, exige listing y evidencia enlazados en la ruta trazable y nunca representa democión aplicada.

La compatibilidad manual legacy permanece cuando no se entregan las tres opciones de identidad; esa ejecución no emite un sobre certificable. Si se proporciona parte de la identidad, el script falla antes de continuar. No se modificó el PS1 y ningún productor fue ejecutado durante esta sesión.

### Ensamblador puro y gates

`scripts/lib/psdeals-evidence-assembly.mjs` recibe sobres ya cargados y referencias verificadas. Valida cada sobre y rechaza:

- etapa obligatoria ausente;
- dos sobres para la misma etapa;
- ciclos, run tokens, región, storefront o fingerprints mezclados;
- timestamps invertidos o generación anterior a las evidencias;
- listing/analyzer, analyzer/importer, importer/retry o listing/ended-deals con hashes distintos;
- retry que no apunte al sobre exacto del import inicial;
- listing o fast refresh incompletos;
- retry con fallos pendientes;
- evidencia legacy o untracked.

Cuando la cadena local es compatible, genera un `psdeals-cycle-manifest` versión 1 y lo pasa al validador existente. No crea un segundo sistema de gates, no crea `remote_cycle_id`, mantiene `cycle_state=running`, no marca validación, succeeded, certificación ni caché y no solicita acciones.

La revisión mensual no tiene productor de evidencia y permanece ausente. Ended deals es opcional en el ensamblaje, pero sin su sobre `can_demote=false`. Sin mensual y lifecycle remoto `can_certify=false`; sin certificación registrada `can_refresh_cache=false`.

### Artefactos históricos

Los bytes actuales de los listings históricos pueden hashearse localmente:

- listing de 5,531 filas: SHA-256 `dbd5279cea8bf49793cfb573bac56af7a80ac3b0a296641799ef34f13b7e12b9`;
- listing de 3,600 filas: SHA-256 `30e2ff9df24732e5437f651de6893dc9388423b696a8303a6a2a6bfef28910cd`.

También pueden calcularse hoy hashes del combined, must, stale, skipped, logs de import/retry, lista de fallos y candidatos ended-deals de 2026-06-06. Eso solo identifica sus bytes presentes. Ningún archivo contiene `local_cycle_id`, `run_token`, fingerprint compartido, referencias padre/hijo ni el hash que el consumidor declaró haber leído en el momento original. Además no existe cola PS Plus separada ni resumen estructurado completo para ese grupo.

Por tanto, pueden reconstruirse métricas parciales y sobres `legacy_untracked` o `indeterminate`, pero no una cadena demostrada. No es válido asignarles retrospectivamente un token ni unirlos por fecha. Los listings de 5,531 y 3,600 mantienen scopes, filtros y terminaciones incompatibles. Los 19,136 HTML locales siguen siendo evidencia de clasificación, no evidencia de pertenencia a un único ciclo certificado.

### Validación y posición del Bloque 4

La validación técnica cerró con:

- `npm test`: 168/168 aprobadas;
- suites específicas de sobres, productores y ensamblaje: aprobadas;
- `node --check`: todos los MJS nuevos o modificados aprobados;
- `npm run lint`: cero errores y las mismas seis advertencias preexistentes;
- `git diff --check`: aprobado;
- búsqueda estática de red, Supabase y procesos hijos en módulos puros: sin coincidencias;
- manifiesto ensamblado reconocido por el validador v1, con democión, certificación y caché bloqueadas cuando falta su evidencia.

Siguen abiertos:

- creador único de identidad y workspace del ciclo;
- carga/verificación offline conjunta de todos los sobres antes del ensamblaje;
- productor de evidencia mensual con fuente/procedimiento autorizado;
- lifecycle real de `price_refresh_cycles`;
- upsert diario parcial del listing;
- aplicación controlada de democión;
- certificación, caché, validación pública y métricas;
- conexión con un runner y tarea de Windows.

El Bloque 4 no está cerrado. No se ejecutó un ciclo real ni histórico, no se certificó nada y no se conectó el runner. El siguiente cambio local seguro es implementar un inicializador/verificador offline del workspace del ciclo que cree una sola identidad compartida, verifique bytes y cargue sobres para el ensamblador sin ejecutar productores ni servicios externos.
