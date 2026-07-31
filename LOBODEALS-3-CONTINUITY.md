# LoboDeals 3.2 — Documento canónico de continuidad

Actualizado: 2026-07-30
Proyecto local: D:\Proyectos\lobodeals
Repositorio: lobovolk-hub/lobodeals
Rama principal: main

## 1. Fuente de verdad

Este es el documento canónico para continuar LoboDeals 3.2 en una tarea nueva.

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

LoboDeals 3.2 comienza limitado a PlayStation US.

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

El historial todavía no debe eliminarse durante una sesión local. Su retirada física es una operación remota futura y separada.

Decisiones definitivas de LoboDeals 3.2:

- no exportar ni respaldar `psdeals_stage_price_history`;
- no reconstruir ni backfillear mínimos certificados desde sus 841.549 filas;
- los cuatro mínimos compactos comienzan vacíos;
- únicamente observaciones válidas de ciclos futuros certificados pueden inicializarlos o reducirlos;
- el histórico debe retirarse físicamente antes del primer ciclo real por el límite de capacidad comunicado (`0,456/0,5 GB`);
- la retirada será sin backup y sin `CASCADE`.

Orden obligatorio:

1. cerrar y probar localmente el contrato de mínimos futuros;
2. auditar en remoto, solo lectura, cero writers, consumidores y dependencias actuales;
3. revisar y aprobar una migración exacta de retirada sin backup ni `CASCADE`;
4. ejecutar esa migración únicamente con autorización crítica separada;
5. verificar capacidad y ausencia del histórico;
6. solo después permitir el primer ciclo real controlado.

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
- en aquel checkpoint existía una gate histórica de ratio 20:1; Texto
  3.2-0005 la retiró porque producto permite descuentos coherentes 1–99.

Nunca deben crear automáticamente un mínimo de cero.

La repetición offline sobre el JSON local de junio produjo:

- 5,310 descuentos regulares coherentes;
- 5,174 habrían sido elegibles bajo la antigua gate de ratio;
- 136 regulares coherentes fueron excluidos por aquella gate ya retirada;
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

## 35. Checkpoint del runner local reanudable y auditoría de retención — 2026-07-29

### Estado de entrada y commits técnicos

La sesión comenzó en `main`, HEAD `4c2b9fd553c70fc31dfc04f9cdbe4b5b5213d7d7`, worktree limpio y divergencia de cero commits detrás y diecisiete delante de la referencia local `origin/main`. La baseline fue 168/168 pruebas aprobadas.

Se crearon seis checkpoints técnicos locales antes de la documentación final:

1. `2487fe837f9fac8b98043f3d87d8ccab193476e4` — Harden PSDeals evidence path containment;
2. `543842b2d1d4ee28908381f616c5ad272d3003b4` — Initialize verified PSDeals cycle workspaces;
3. `a23d570efe73d4370768683e6473882a0ac8337c` — Orchestrate resumable PSDeals cycle state;
4. `8ffb3c5c31d38abb6e1c2f914944bd539cd0a720` — Record monthly PSDeals cycle evidence;
5. `125a672715fc3e912ab53a5d848dfc232ece6b82` — Run resumable PSDeals cycles with fixtures;
6. `46986777838eee8fedea9f0da5ff1e8598005a89` — Prepare guarded PSDeals operational adapters;
7. `c03e450a1689d1c8fcc70c76af7273c4079b15dc` — Audit price history retention dependencies.

No se hizo push.

### Corrección adversarial de rutas

La revisión encontró que el confinamiento era solamente léxico: una ruta dentro del workspace podía apuntar mediante symlink o junction a bytes externos. `psdeals-evidence-io.mjs` y `psdeals-evidence-runtime.mjs` verifican ahora el `realpath` tanto del root como del archivo, exigen que una ruta portable identifique los mismos bytes y leen, hashean y parsean el mismo archivo real. Una prueba Windows crea un junction real y confirma que el escape se rechaza.

El resto del contrato adversarial permaneció cerrado: los tokens no se generan en productores, los hashes corresponden a bytes, partial no se vuelve succeeded por exit 0, el ensamblador rechaza duplicados y mezclas, `remote_cycle_id` no se inventa, ended-deals no aplica democión y los módulos importables no ejecutan `main`.

### Workspace e identidad

`scripts/lib/psdeals-cycle-workspace.mjs` implementa workspaces versión 1 con directorios separados: `state`, `artifacts`, `evidence`, `logs`, `manifest`, `locks` y `receipts`. Los workspaces futuros viven bajo `data/cycles` o una raíz explícita y quedan cubiertos por el ignore existente de `data/`; las fixtures de tests siguen rastreadas por separado.

La identidad se crea una vez y conserva `local_cycle_id` visiblemente local, `run_token` opaco y no secreto, `remote_cycle_id=null`, timestamp, modo, US/PlayStation, contexto/fingerprint canónicos, revisión Git y versión. Los generadores y el reloj son inyectables. `identity.json` se escribe atómicamente, no se sobrescribe y se valida exactamente al reabrir. Traversal, rutas absolutas, NUL y reparse points fuera del root se rechazan. La finalización es un receipt único.

### Lock y concurrencia

`psdeals-cycle-lock.mjs` adquiere `locks/active.json` mediante creación exclusiva `wx`. Una segunda adquisición falla, la liberación exige el mismo owner y un lock corrupto no se elimina. La antigüedad solo clasifica stale: el takeover exige `CONFIRM_STALE_LOCK_TAKEOVER`, owner esperado, segunda verificación y receipt. Nunca mata procesos ni borra locks automáticamente.

No se implementó heartbeat mutable porque reemplazar silenciosamente el lock activo en Windows reduciría la garantía de exclusión. Una ejecución prolongada sigue protegida porque el takeover stale nunca es automático.

### Ledger y máquina de estados

`psdeals-cycle-ledger.mjs` usa un journal append-only `state/ledger-NNNNNN.json`. Cada entrada tiene secuencia, hash anterior y hash propio. Solo se añade con el lock propio. La reconstrucción verifica todos los archivos; secuencia rota, hash alterado, identidad distinta, dos etapas running o transición inválida bloquean nuevas escrituras.

Las 16 etapas conservan intentos y los estados `pending`, `ready`, `running`, `succeeded`, `partial`, `failed`, `blocked`, `skipped` y `awaiting_authorization`. Solo una etapa corre, succeeded no se repite y skip solo admite `retry_details/no_initial_failures`. Una etapa interrumpida se registra failed antes de un nuevo intento. El ledger guarda timestamps, hashes, evidencia, exit code, reasons, errores redactados, autorización y separación entre acción externa real y simulación.

Se corrigieron tres gates circulares del plan previo: `validate_listing` determina `listing_complete`; `analyze_ended_deals` exige listing completo y produce la elegibilidad de democión; `validate_cycle` calcula `can_mark_succeeded` y no puede exigirlo de antemano.

### Runner, modos y CLI

`scripts/run-psdeals-cycle.mjs` expone `init`, `plan`, `status`, `verify`, `run-fixture`, `assemble`, `resume` y `explain-blockers`. La salida redacta todos los `run_token`. Códigos: 0 éxito; 1 uso/I-O; 2 evidencia inválida; 3 indeterminado; 4 bloqueado; 5 awaiting authorization; 6 fallo de etapa; 7 corrupción; 8 lock activo.

Modos:

- `plan`: no escribe ledger ni ejecuta adaptadores;
- `offline_validation`: verifica bytes, sobres, ensamblador y manifiesto sin conexiones;
- `fixture`: usa solo adaptadores falsos y directorios temporales;
- `operational`: está bloqueado antes de escribir ledger o invocar adaptadores.

El cargador solo descubre JSON dentro de `evidence/`, rechaza entradas no regulares, duplicados e identidades/fingerprints diferentes, y verifica cada referencia. El manifiesto guardado puede añadir el resultado local de validación, pero sus secciones productoras deben coincidir con un nuevo ensamblaje. Antes de mark-succeeded, certify o cache, el runner vuelve a verificar la cadena.

### Simulación fixture y lifecycle

La simulación válida recorre las 16 etapas: retry queda skipped por cero fallos y las otras quince terminan succeeded. Produce listing, colas, import, mensual, ended-deals, manifiesto, ledger y receipts. Las etapas externas simuladas conservan `simulation_performed=true` y `external_action_performed=false`.

El manifiesto validado abre `can_mark_succeeded`, pero conserva `remote_cycle_id=null`, estado running, certificación false y caché false. Por eso su validador real mantiene `can_certify=false` y `can_refresh_cache=false`. Las gates posteriores abiertas al terminar la fixture proceden solo de receipts simulados del ledger.

Se probaron reanudación sin repetir import, artefacto alterado, evidencia duplicada, lock, corrupción, operational bloqueado, adapter ausente, timeout simulado, salida simulada excesiva y redacción de secretos. Ninguna fixture abrió procesos o conexiones.

### Evidencia mensual

Se añadió `monthly_games_check` al sobre versión 1. Exige artefacto hasheado, `source_type`, `source_reference`, procedimiento/versión, resultado, propuestas y `application_performed=false`. Admite `no_changes`, `proposed_changes`, `indeterminate` y `failed`.

Solo `no_changes` con evidencia semántica completa produce succeeded. `proposed_changes` es partial y bloquea certificación; nunca significa applied. `record-psdeals-monthly-evidence-offline.mjs` solo registra un artefacto ya presente dentro del workspace, sin consultar fuentes ni actualizar datos.

### Payload, upsert y lifecycle remoto

`psdeals-listing-upsert-adapter.mjs` prepara lotes con los builders seguros. Exige IDs existentes explícitos; no adivina insert/update. Usa la clave demostrada `region_code,storefront,psdeals_id`, agrupa por operación y columnas para evitar nulls, excluye mínimos certificados y usa lotes locales 1–500, default 100. La ejecución requiere un puerto inyectado; no existe cliente Supabase real.

`psdeals-operational-contracts.mjs` modela sin ejecutar create-cycle, mark-succeeded, `certify_price_refresh_cycle(uuid)` y `refresh_catalog_public_cache_v15()`. Exige autorización específica, UUID remoto y gate. El receipt debe coincidir con acción y autorización. El SQL demuestra que mark-succeeded debe actualizar estado, validación y timestamps coherentemente, y que certificar es una acción distinta.

Siguen bloqueados los adaptadores operativos de productores, reconciliación remota, upsert real, democión, ciclo remoto, certificación, caché, validación pública y métricas. La definición de cache v15 y el contrato público exacto no están versionados.

### Auditoría de retención de price history

El reporte reproducible quedó en `docs/audit/lobodeals-3-price-history-retention-audit-2026-07-29.md`; comando: `node scripts/audit-price-history-dependencies-local.mjs`.

Se distinguen:

1. `psdeals_stage_price_history`, histórico detallado sin DDL local; 841,549 es una medición histórica;
2. `item_price_snapshots`, tabla v1 con FK a catalog items y `on delete cascade`;
3. `lowest_price_amount` y `lowest_ps_plus_price_amount`, resúmenes que en aquel checkpoint aún escribía el importer y mostraba el detalle, retirados después del runtime actual;
4. `lobodeals_lowest_*`, mínimos compactos certificados que deben conservarse.

En ese checkpoint no existía evidencia suficiente para eliminar ninguno. La propuesta original incluía exportación, pero quedó sustituida por la decisión definitiva de LoboDeals 3.2: no exportar ni backfillear el histórico. Se mantienen como requisitos el inventario remoto read-only de columnas, índices, FKs, triggers, vistas, funciones, jobs, filas, tamaño y rango, junto con una migración exacta separada y validaciones posteriores. El reporte no ejecutó SQL ni incluyó una operación destructiva autorizada.

### Migración futura del PS1

El PS1 histórico usa ruta fija, Edge, globs, logs y regex. Ejecuta collector, analyzer, import y retry, pero no demuestra el resultado final del import ni vuelve a comprobar fallos tras retry. No crea ciclo, mensual/ended-deals, manifiesto, succeeded o certificación; solo imprime SQL manual de caché.

La futura tarea de Windows debe invocar un único entrypoint estable con raíz configurable, identidad/workspace exactos, códigos 0–8, lock, evidencia y resume con receipts. Debe registrar código, workspace y última etapa sin secretos. No se modificó el PS1 ni la tarea.

### Posición exacta del Bloque 4

El Bloque 4 dispone de contratos locales para evidencia, workspace, lock, ledger, reanudación, manifiesto, mensual, batching, lifecycle guardado y simulación completa. Esto demuestra orquestación offline, no operación real.

Sigue abierto: operational está bloqueado, no hay integración remota probada ni fuente mensual autorizada, no se aplicó democión, no se creó/certificó ningún ciclo y no se refrescó caché. Tampoco se eliminó historial ni se creó automatización.

La siguiente tarea local de máximo alcance seguro es construir adaptadores operativos uno por uno detrás de puertos inyectados, empezando por create-cycle y upsert listing con cliente Supabase totalmente falso y receipts/reconciliación idempotente; después preparar especificaciones de proceso separadas para collector/analyzer/import/retry. Conexión real, SQL, Edge y ejecución operational permanecen bloqueados hasta autorización explícita.

### Validación final de la sesión

- `npm test`: 209/209 aprobadas;
- suites de runner, ledger, workspace, mensual, upsert/lifecycle y auditoría: aprobadas;
- `node --check`: todos los MJS creados o modificados aprobados;
- `npm run lint`: cero errores y las mismas seis advertencias preexistentes;
- runner fixture: 16 etapas recorridas, 15 succeeded y retry skipped por cero fallos;
- CLI: init/plan/status/verify/run-fixture/assemble/resume/explain-blockers probados;
- `git diff --check`: aprobado después de normalizar el reporte;
- búsqueda estática: los módulos nuevos no importan Supabase ni child_process y no contienen fetch/spawn/exec;
- no se ejecutó build ni ningún proceso operativo.

## 36. Checkpoint de preparación máxima previa al primer ciclo real — 2026-07-29

### Estado de entrada y checkpoints

La sesión comenzó en `main`, HEAD `0f45336c130463119dee0849c9c18a52e0e7545d`, worktree limpio y divergencia de cero commits detrás y veintiséis delante de la referencia local `origin/main`. La baseline fue 209/209 pruebas aprobadas.

Se crearon los siguientes commits técnicos locales:

1. `c043e2876db89ad3552c8fbec2d12c14dbb9f9f5` — Harden resumable PSDeals operational boundaries;
2. `542cfa19e21c3ea381c417ef2c1d854ff03e2afb` — Verify PSDeals remote contracts read only;
3. `d2700dd332dfecda906faf4ffbd615686ee23052` — Reconcile remote PSDeals cycle operations;
4. `5678df87bd1259a0b48f3a3963dd222c532f929f` — Bind guarded PSDeals producer processes;
5. `c6ee13a62e65e897b9ec61c26b47940202c12f89` — Prepare PSDeals public validation gates;
6. `5278f76a28868c13b24338d80abd936f83397a4f` — Add the certified PSDeals runner wrapper;
7. `3f1c332c9581142b2c06bd0f158c3716a413dea8` — Remove PSDeals adapter test lint warning.

No se hizo push.

### Revisión adversarial y autorizaciones

Las autorizaciones operativas son ahora documentos separados, ligados a etapa, permiso, `local_cycle_id`, hash de `run_token`, ventana temporal y `authorization_id`; solo se acepta `source=operator_input`. Un booleano del manifiesto no puede habilitar una escritura. El runner verifica además que un resultado con `external_action_performed=true` cite la autorización exacta y que el receipt reabierto conserve el mismo hash registrado en el ledger. Un receipt alterado bloquea la reanudación.

El modo operational sin autorización se detiene antes de llamar al adaptador y antes de escribir el ledger. La simulación integral recorrió el runner real, workspace, lock, ledger, receipts, especificaciones, clientes falsos y HTTP falso; todas las acciones externas quedaron con `external_action_performed=false` y `simulation_performed=true`.

### Preflight y contratos remotos read-only

La configuración local contiene URL, publishable key y secret key no vacías; sus valores no se imprimieron ni se versionaron. El proyecto remoto configurado respondió `ACTIVE_HEALTHY`, región `us-east-2`, PostgreSQL 17.6.1.104. La inspección usó únicamente metadatos y `SELECT`: cero mutaciones y cero RPC.

Contratos verificados:

- `psdeals_stage_items`: 32,890 filas, clave única `(region_code, storefront, psdeals_id)`, columnas comerciales/de listing/de detalle y cuatro mínimos compactos presentes;
- `psdeals_import_runs`: 114 filas y estados `running`, `succeeded`, `failed`, `partial`, `cancelled`;
- `price_refresh_cycles`: cero filas y estados/columnas coherentes con SQL local, pero sin `local_cycle_id` ni hash de `run_token`;
- `ps_plus_monthly_games`: siete filas, cuatro activas, contrato mensual real verificado;
- `catalog_public_cache`: 32,890 filas, 5,197 deals regulares, 1,605 PS Plus y cuatro mensuales;
- `certify_price_refresh_cycle(uuid)`: definición remota verificada, `security invoker`, no ejecutada;
- `refresh_catalog_public_cache_v15()`: definición remota verificada, reemplaza la caché en transacción, no ejecutada.

El preflight es válido y read-only, pero clasifica `NOT_READY` por dos bloqueos concretos: create-cycle no puede reconciliar un timeout ambiguo con una identidad local única; cache v15 no produce un receipt independiente ligado al ciclo. `item_price_snapshots` no existe remotamente y queda como advertencia legacy, no como objeto requerido.

### Puerto Supabase y adaptadores idempotentes

`psdeals-supabase-port.mjs` separa lecturas de escrituras, carga cliente/credenciales solo al invocarse explícitamente, exige `AbortSignal`, limita lecturas a lotes de 500, usa timeout de 30 segundos y aplica allowlists de tablas y de las dos RPC exactas. Importar el módulo no conecta. Las pruebas solo usan clientes falsos.

Create-cycle permanece `awaiting_contract`: el adaptador puede recuperar un receipt existente y modela reconciliación única, cero candidatos, múltiples candidatos y timeout posterior a commit, pero el esquema remoto no posee la clave necesaria. Nunca inventa UUID ni repite automáticamente una creación incierta.

El upsert de listing está preparado sin ejecutarse: lee explícitamente IDs existentes, usa los builders parciales, agrupa por conjunto exacto de columnas, omite `undefined`, nulls destructivos, campos de detalle, mínimos, `free_to_play` inferido, tipo/plataformas ambiguos y duplicados. Verifica postcondiciones y, tras timeout, realiza como máximo una reconciliación de lectura; no reintenta ciegamente la escritura.

Mark-succeeded y certify admiten reconciliación posterior por estado/UUID demostrados. La democión aplicada y el cache refresh permanecen `awaiting_contract` porque no existe un receipt remoto inequívoco para reconciliar una respuesta perdida.

### Productores, importer, retry y ended deals

Las cinco especificaciones de proceso fijan ejecutable, entrypoint, argumentos como arrays, `shell=false`, cwd, límites, allowlist de entorno, efectos, artefactos y evidencia para collector, fast-refresh analyzer, importer, retry y ended-deals analyzer. No aceptan ejecutables ni rutas arbitrarias del manifiesto y un exit code cero sin evidencia válida no completa la etapa.

El collector acepta ahora rutas explícitas `--output-json` y `--output-txt` cuando recibe identidad rastreada; el modo legacy conserva el comportamiento anterior. Analyzer, importer y retry ya emiten sobres enlazados conforme al checkpoint previo. Ningún productor fue ejecutado.

La etapa `apply_ended_deals` quedó separada del análisis, con permiso propio `allow_apply_demotion`. Solo se omite por `no_ended_deal_candidates`; candidatos reales no autorizan aplicación. Monthly conserva evidencia local, pero la fuente/procedimiento real sigue sin autorización y cualquier cambio propuesto bloquea el ciclo.

### Validación pública, wrapper y readiness

La validación pública modela home, catalog, deals y una muestra acotada de detalles con cliente HTTP inyectado, timeouts y criterios observables. Las pruebas usan HTTP falso; no se navegó ni se consultó producción.

`scripts/run-psdeals-certified-cycle.ps1` es un wrapper nuevo y separado del PS1 histórico. Solo admite Plan, Preflight, Status y Resume; resume está limitado por el CLI a workspaces fixture. Resuelve rutas, comprueba Node/entrypoint, usa argumentos como array, propaga códigos 0–8, confina logs al proyecto antes de crearlos y usa mutex para impedir solapamiento. No contiene operational ni autorizaciones hardcodeadas. Su parser PowerShell y pruebas contractuales aprueban. No fue ejecutado y no se tocó ninguna tarea de Windows.

La evaluación final permanece `NOT_READY`; READY nunca autorizaría por sí solo una ejecución. Además de los dos bloqueos remotos, siguen pendientes: fuente mensual autorizada, contrato reconciliable de democión/caché, conexión futura de adaptadores operativos por etapa con autorizaciones reales y validación pública real autorizada.

### Price history remoto

`psdeals_stage_price_history` existe con 841,549 filas exactas y 273,907,712 bytes totales: 107,372,544 de tabla y 166,469,632 de índices. Su rango es 2015-07-10 a 2026-06-06. Tiene PK, índice único, índices por item/kind y FK a `psdeals_stage_items(id) ON DELETE CASCADE`; no se encontraron triggers, consumidores directos en vistas/funciones accesibles ni `pg_cron`. Las funciones verificadas de certificación y caché no lo consumen.

La limpieza seguía en `NO-GO` en ese checkpoint. La ausencia de exportación dejó de ser un bloqueo por decisión expresa de producto: LoboDeals 3.2 no conservará respaldo ni hará backfill. Continúan siendo bloqueos la auditoría remota actual, el contrato de certificación, una migración exacta separada y la autorización crítica. No se preparó SQL destructivo y `CASCADE` continúa prohibido.

### Posición exacta del Bloque 4

El Bloque 4 alcanzó el límite local anterior al primer ciclo controlado: runner reanudable, límites operativos, puertos inyectables, upsert preparado, especificaciones de productores, preflight remoto, wrapper y simulación con falsos están validados. No está implementado un camino real completo reconciliable ni se ha ejecutado un ciclo.

El siguiente cambio local de máximo alcance es diseñar y versionar, sin ejecutarla, una migración revisable para añadir identidad local única a `price_refresh_cycles` y un receipt de cache ligado al ciclo, junto con el contrato exacto de receipt de democión. Después deben actualizarse el preflight y los adaptadores con pruebas falsas. Esto requiere una nueva instrucción porque esta sesión prohibió modificar SQL.

### Validación final de esta sesión

- `node --check`: 28 MJS cambiados desde el HEAD inicial aprobaron;
- `npm test`: 243/243 pruebas aprobaron;
- ensayo operational con runner real y adaptadores falsos: aprobado, sin acción externa;
- CLI seguro: plan, status, verify, preflight, explain-blockers y comandos fixture cubiertos por las funciones reales; el preflight real devolvió el código bloqueado 4;
- parser PowerShell del wrapper nuevo: aprobado;
- `npm run lint`: cero errores y seis advertencias preexistentes; la única advertencia nueva se eliminó;
- auditor local de history: 162 archivos y 156 referencias, sin escrituras ni conexiones;
- `git diff --check` y búsquedas de SQL mutante, secretos, RPC ejecutadas, comandos arbitrarios, `shell=true`, autorizaciones hardcodeadas y rutas operativas por defecto: aprobadas con las coincidencias esperadas limitadas a contratos/puertos inyectables y al DDL histórico documentado.

## 37. Checkpoint de migración reconciliable del ciclo — 2026-07-29

### Estado de entrada y checkpoints

La sesión comenzó en `main`, HEAD `70fb31bab2b3ab655766820a45f0042cd7d8761e`, worktree limpio y divergencia de cero commits detrás y 34 delante de la referencia local `origin/main`. La baseline fue 243/243 pruebas aprobadas.

Se crearon cuatro checkpoints antes de esta actualización de continuidad:

1. `e18a3c5bcd477e95f30ee297f1f54f43ef033910` — Design reconciliable PSDeals cycle migration;
2. `d9dd718662698897599067b12bcbc5c516d8b10c` — Align PSDeals adapters with cycle receipts;
3. `306ef06822218adc491ab6b9df98a0b1e10e1ce7` — Rehearse migrated PSDeals lifecycle offline;
4. `8d801ff118e7fcbb4ae16a61473b831dbbb68892` — Document PSDeals migration application plan.

No se hizo push.

### Revalidación remota read-only

La revalidación usó exclusivamente metadatos y `SELECT` contra el proyecto `vlxkoprpobfevxefizwr`; registró cero mutaciones y cero RPC. Los hechos siguieron estables:

- proyecto `ACTIVE_HEALTHY`, región `us-east-2`, PostgreSQL 17.6.1.104;
- `psdeals_stage_items`: 32,890 filas;
- `psdeals_import_runs`: 114 filas;
- `price_refresh_cycles`: cero filas;
- `ps_plus_monthly_games`: siete filas, cuatro activas;
- `catalog_public_cache`: 32,890 filas;
- `psdeals_stage_price_history`: 841,549 filas y 273,907,712 bytes;
- mínimos compactos certificados: cero filas.

Las definiciones remotas tampoco cambiaron:

- `certify_price_refresh_cycle(uuid)`: SHA-256 `3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88`;
- `refresh_catalog_public_cache_v15()`: SHA-256 `1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc`.

La huella de 004 permanece ausente en Supabase. El facts redactado versión 2 está en `docs/audit/lobodeals-3-remote-readonly-facts-2026-07-29.json`.

### Migración 004

`sql/004-lobodeals-3-reconciliable-cycle-actions.sql` quedó versionada con SHA-256 `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf`. No se aplicó.

La migración es transaccional y fail-closed:

- `lock_timeout=10s`, `statement_timeout=120s` y lock `ACCESS EXCLUSIVE` sobre cycles;
- exige cero filas en `price_refresh_cycles`;
- verifica objetos y columnas base, ausencia completa de la huella 004 y hashes exactos de v1/v15;
- no usa `IF NOT EXISTS`, `CREATE OR REPLACE`, SQL dinámico, `CASCADE` ni sentencias destructivas;
- no toca `psdeals_stage_price_history` ni datos históricos;
- cualquier discrepancia revierte la transacción.

### Identidad y create-cycle

`price_refresh_cycles` recibe `local_cycle_id`, SHA-256 del `run_token`, revisión Git, fingerprint de filtros, hash de manifiesto, modo operational y timestamps de gates posteriores. El token crudo nunca se almacena remotamente.

`local_cycle_id` y `run_token_sha256` tienen índices únicos separados, además del índice compuesto. Un trigger impide cambiar identidad, scope, fecha o inicio. La aplicación bloquea si aparece una fila legacy antes de ejecutar 004.

`create_or_reconcile_price_refresh_cycle_v1` toma advisory locks deterministas para ambas identidades. Crea una sola fila `running`, devuelve el UUID remoto o recupera la coincidencia exacta; una reutilización parcial o combinación contradictoria falla. No marca succeeded, no certifica y no invoca otras etapas.

### Receipts remotos

`psdeals_cycle_action_receipts` usa una tabla única y acotada con:

- `cycle_id`, parent receipt, kind, idempotency key global, attempt y hashes;
- estados `intent`, `running`, `committed`, `failed`, `indeterminate`;
- timestamps, conteo afectado, resultado JSON limitado a 16 KiB y error code redactado;
- FKs `ON DELETE RESTRICT` y sin propagación destructiva;
- índices por ciclo/kind/status, parent e idempotency key.

Los kinds cubren create, listing validation/batches, fast refresh, detail import/retry, monthly, ended-deals, democión, mark, certify, cache, public validation y metrics. Un replay idéntico recupera el receipt; ciclo, parent, request hash, input hash o attempt distintos producen contradicción. Un receipt no terminal o committed no puede portar error code.

Se eligió una tabla común porque estos campos y consultas son compartidos. Se descartaron JSON en `metrics`, tablas por acción y almacenamiento del token crudo. 004 no implementa purga: se propone conservar todo durante piloto/prueba y al menos 400 días los terminales certificados; failed/indeterminate se conservan hasta reconciliación. Cualquier política real será otra migración autorizada.

### Monthly, democión y lifecycle

`record_psdeals_monthly_check_v1` exige fuente, referencia segura, procedimiento/version, hash y resultado semántico. Nunca actualiza `ps_plus_monthly_games`. Solo `no_changes` con cero propuestas fija `monthly_games_checked_at`; `proposed_changes`, `indeterminate` y `failed` bloquean la finalización.

`apply_psdeals_ended_deals_v1` exige ciclo running, listing completo, receipt de análisis enlazado, hashes coincidentes y un array canónico ordenado de hasta 500 IDs positivos. Recalcula SHA-256 sobre IDs separados por salto de línea, bloquea faltantes o extras y solo modifica el scope US/PlayStation exacto. Cada candidato debe conservar un descuento regular certificable 1–99: precios positivos, original mayor que actual y porcentaje redondeado exactamente coherente. Democión y receipt se comprometen en la misma transacción; el conjunto vacío también queda demostrado.

El orden resuelto es: analizar ended deals, aplicar la democión mientras el ciclo sigue `running`, y después mark-succeeded. Esto evita exigir `succeeded` para una acción que a su vez es prerequisito de succeeded.

`mark_psdeals_price_refresh_cycle_succeeded_v1` exige un conjunto explícito, único y acotado de receipts committed: listing, al menos un upsert batch, fast refresh, detail sin fallos pendientes, monthly `no_changes`, ended analysis y demotion. Bloquea receipts running/indeterminate y valida hashes, timestamps y métricas antes de fijar `succeeded`.

`certify_price_refresh_cycle_v2` exige el receipt committed de mark, envuelve sin reemplazar `certify_price_refresh_cycle(uuid)` y registra el resultado en un receipt. El subbloque transaccional evita efectos parciales si v1 falla.

`refresh_catalog_public_cache_v16` exige ciclo certified y receipt committed de certify, envuelve v15 y valida filas insertadas positivas y cero deals expirados aún activos. Si v15 o la postcondición falla, el subbloque revierte el refresh y conserva un receipt failed; un committed idéntico se reconcilia sin repetir.

### Public validation, métricas y permisos

Public validation solo puede comenzar desde un receipt committed de cache y solo puede comprometerse con `passed=true`; metrics exige como parent esa validación pública. Ambas actualizan timestamps separados y no vuelven a ejecutar cache.

La tabla de receipts tiene RLS habilitado. `anon` y `authenticated` no pueden escribir ni ejecutar RPC operativas. `service_role` obtiene solo lectura de receipts y ejecución de entrypoints versionados; los helpers internos son solo de `postgres`. Las funciones `SECURITY DEFINER` fijan `search_path=''` y validan argumentos. Las funciones v1/v15 conservan sus definiciones, pero su ejecución directa se revoca al rol operativo para impedir bypass; solo wrappers v2/v16 forman la ruta futura.

### Adaptadores, preflight y gates

El puerto Supabase deja de exponer insert/update directos de cycles y bloquea los nombres legacy de certify/cache. Su allowlist contiene exclusivamente RPC 004 y el upsert stage demostrado. La conexión sigue siendo diferida y las pruebas usan clientes falsos.

Create-cycle busca por ambas identidades inmutables y exige también un receipt remoto committed para reconciliar timeouts. Listing upsert abre y cierra un receipt por batch, verifica bytes/columnas post-upsert y no repite una escritura si un receipt committed ya no coincide con la fila leída. Lifecycle reconcilia por UUID y receipt exactos.

El manifiesto v1 admite opcionalmente `receipt_contract_version=1` y una cadena remota limitada a 500 referencias. Con el contrato activo, democión, mark, certify y cache solo abren sus gates por kinds y parents committed compatibles.

El preflight versión 2 distingue `MIGRATION_NOT_APPLIED`, `MIGRATION_PARTIALLY_APPLIED`, `MIGRATION_CONTRACT_MISMATCH`, `MIGRATION_READY`, `LIVE_CYCLE_READY` y `NOT_READY`. Sobre los facts reales terminó válido pero no listo, clasificación `MIGRATION_NOT_APPLIED` y código CLI 3. Las fixtures de un esquema completo producen `MIGRATION_READY`; nunca convierten por sí solas el entorno en live-ready.

### Ensayo y pruebas SQL

El ensayo usa el runner real de 17 etapas y un fake que reproduce identidad, unicidad, parents, hashes, receipts y efectos de 004. Recorrió create, listing, batch upsert, fast refresh, import, retry, monthly, ended deals, demotion, mark, certify, cache, public validation y metrics. Todo efecto externo quedó simulado.

Se probaron timeout después de commit y resume sin repetir democión, mark, certify o cache; conjuntos de democión cero/no cero; límite 500; receipt contradictorio; parent de otro ciclo; y fallo de cache posterior a certify que conserva la certificación y no aplica cache.

No había `psql`, servidor PostgreSQL, Docker, Podman ni Supabase CLI local. WSL no tenía subsistema instalado. Por ello, la migración no se ejecutó en PostgreSQL real: las garantías SQL son análisis estático, fixtures y ensayo contractual. Esta limitación debe tratarse expresamente antes de la primera aplicación.

Validación final previa a continuidad:

- `npm test`: 277/277 aprobadas;
- suites específicas de migración, adaptadores y ensayo: aprobadas;
- `node --check`: 19 MJS cambiados desde el HEAD inicial aprobados;
- `npm run lint`: cero errores y las mismas seis advertencias preexistentes;
- preflight offline: código 3 y `MIGRATION_NOT_APPLIED`;
- `git diff --check`: aprobado;
- búsquedas de destrucción, `CASCADE`, SQL dinámico, grants públicos, secrets, red y procesos en módulos puros: aprobadas; las coincidencias de roles son revocaciones explícitas.

### Aplicación, rollback e history

El procedimiento futuro exacto está en `docs/audit/lobodeals-3-cycle-migration-004-application-plan-2026-07-29.md`. Requiere HEAD/checksum, worktree limpio, backup o punto de recuperación demostrado, nuevo preflight read-only, cero ciclos, hashes legacy exactos, ventana sin productores y autorización explícita. La herramienta propuesta es una única operación Supabase `apply_migration` con el archivo 004 exacto, rol `postgres`, salida capturada y sin cambios adicionales.

Antes de cualquier uso, una reversión solo podría prepararse con cycles/receipts en cero, inventario exacto y migración inversa separada sin `CASCADE`. Después de crear evidencia o certificar, no se borra ni “descertifica”: se revocan entrypoints afectados, se conserva auditoría y se corrige hacia adelante.

La certificación v2 solo poblará mínimos al envolver v1 dentro de un ciclo real válido. El orden descrito originalmente para price history quedó sustituido por LoboDeals 3.2: la tabla histórica debe retirarse antes del primer ciclo real, sin exportación ni backfill, después de demostrar cero dependencias actuales y aprobar una migración exacta independiente. La FK legacy `ON DELETE CASCADE` no debe usarse. No se eliminó ningún dato.

### Posición exacta del Bloque 4

El Bloque 4 tiene ahora una migración local versionada y fail-closed que cierra por diseño los cuatro bloqueos estructurales del Texto 0003: identidad create-cycle, receipt de democión, lifecycle reconciliable y cache ligada a certificación. Puertos, adaptadores, preflight, manifiesto y runner están alineados y ensayados con falsos.

Producción sigue sin 004; por eso el estado remoto es `MIGRATION_NOT_APPLIED` y el ciclo live permanece `NOT_READY`. No se ejecutó un ciclo real y el Bloque 4 no está cerrado.

La siguiente tarea de máximo alcance es una sesión separada y explícitamente autorizada para repetir el precheck read-only, confirmar backup/ventana/checksum y aplicar únicamente 004. Después debe hacerse el postcheck read-only hasta `MIGRATION_READY`. Esa sesión no debe crear aún un ciclo real salvo una autorización adicional posterior.

## 38. Precheck autorizado de migración 004 bloqueado por recuperación — 2026-07-29

Texto 0005 autorizó una sola aplicación de `sql/004-lobodeals-3-reconciliable-cycle-actions.sql`, condicionada a todos los prechecks y a una recuperación demostrable. La sesión comenzó en `main`, HEAD `c87fa118daf7155d0eedf38e707e15f82bef994f`, worktree limpio y divergencia 39 delante/0 detrás de `origin/main`.

La verificación local aprobó:

- SHA-256 exacto `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf` sobre 67,999 bytes y 2,205 líneas;
- ausencia de `CASCADE`, `DROP`, `TRUNCATE`, `DELETE`, mutación de `psdeals_stage_price_history`, SQL dinámico, secretos y grants públicos inesperados;
- `npm test`: 277/277;
- suites específicas de migración/preflight/rehearsal: 35/35 antes de la decisión y 37/37 en la validación final, incluido el ensayo operacional con adaptadores falsos;
- `node --check` de contrato y preflight: aprobado.

El precheck remoto read-only confirmó:

- proyecto exacto `vlxkoprpobfevxefizwr`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.104;
- historial de migraciones del canal vacío y huella 004 completamente ausente;
- cero `price_refresh_cycles`, cero ciclos activos y cero sesiones activas relevantes;
- ninguna columna, tabla o función parcial de 004;
- certify v1 SHA-256 `3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88`;
- cache v15 SHA-256 `1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc`;
- 32,890 stage items, 114 import runs, siete monthly/cuatro activos, 32,890 cache, 841,549 history y cero mínimos certificados.

La recuperación obligatoria no pudo demostrarse. La organización Supabase está en plan Free; la documentación oficial vigente indica backups diarios administrados para Pro, Team y Enterprise, y no se demostró PITR. Aunque se capturaron definiciones, hashes, columnas, constraints, índices, RLS, policies y grants, ese inventario no sustituye el backup o punto de restauración exigido por el plan versionado.

La sesión se clasificó `PRECHECK_BLOCKED`. No se invocó `apply_migration`, no comenzó ninguna transacción y producción permanece `MIGRATION_NOT_APPLIED`; el preflight offline conserva código contractual 3. No hubo ciclos, receipts, RPC operativas, caché, monthly ni cambios de history.

La validación final repitió `npm test` con 277/277 aprobadas, `npm run lint` con cero errores y las seis advertencias preexistentes, parseó los cinco JSON de auditoría y confirmó `git diff --check`. Dos fixtures de CLI dejaron de fijar instantes que caducaban frente a evidencia generada con el reloj real; no cambió el runner ni ningún comportamiento operativo.

Posición exacta de aquel checkpoint: 004 continuaba versionada y validada localmente, pero no instalada. La recuperación acotada posterior de 004 quedó documentada en la sección siguiente. La decisión actual de LoboDeals 3.2 prohíbe exportar/backfillear history y separa esa retirada física de la recuperación de 004.

## 39. Recuperación acotada y aplicación verificada de migración 004 — 2026-07-30

Texto 0006 autorizó demostrar una recuperación limitada a la superficie de 004, protegerla localmente y aplicar una sola vez la migración exacta si todas las gates aprobaban. La sesión comenzó en `main`, HEAD `39cd12781304a05da2802f60f81ba8e50f612fd8`, 41 commits delante/0 detrás de `origin/main` y worktree limpio.

### Recuperación acotada demostrada

El parser local cubrió las 2.205 líneas y clasificó 78 sentencias: 68 mutaciones persistentes, dos controles transaccionales, dos controles de sesión, un lock, un guard y cuatro postchecks read-only. No quedó ninguna sentencia desconocida ni mutación sin inversa.

El mapa incluye las diez columnas, nueve constraints y tres índices nuevos de cycles; la tabla de receipts con 16 columnas, 14 constraints y cuatro índices resultantes; RLS sin policies; doce funciones; dos triggers; comentarios; grants/revokes; y el registro del plano de control de migraciones como efecto separado. Cada objeto SQL tiene inversa, dependencia, precondición, riesgo y orden.

`sql/recovery/004-lobodeals-3-reconciliable-cycle-actions-before-use.sql` quedó separado de la ruta de migraciones y fuera del runner. Exige huella 004 exacta, cero ciclos, cero receipts, firmas/owner/search path/permisos exactos, hashes v1/v15 y RLS/constraints/índices/triggers compatibles. Revoca entrypoints primero, retira dependencias en orden inverso, restaura las ACL legacy capturadas, opera transaccionalmente y no contiene `CASCADE`, DML comercial, history ni manipulación del historial de migraciones. No está autorizado para ejecución y queda prohibido después de uso operativo.

La reconciliación futura del registro es otra operación: solo después de un recovery autorizado y validado se obtendría la versión exacta y se usaría el procedimiento oficial `migration repair --status reverted`; nunca SQL directo sobre tablas internas.

El bundle reproducible está en `docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30/`. Conserva baseline, exportación explícita de cero ciclos, ausencia previa de receipts, definiciones legacy, mapa, manifiesto y SHA-256. No exporta las 841.549 filas/273.907.712 bytes de `psdeals_stage_price_history` porque 004 no menciona ni muta esa tabla, no ejecuta ninguna función que la toque y su recovery no depende de ella. La gate quedó `SCOPED_RECOVERY_PROVEN`.

Antes de cualquier mutación se creó `4127875931172285241445331c2fdc8c3a01fa11` (`Prepare scoped recovery for PSDeals migration 004`). Contenía solo el bundle, recovery SQL no autorizado, builder/validador, 25 pruebas y el plan actualizado. El worktree quedó limpio y 004 conservó SHA-256 `712af68ff12934f7f3f7648b6e629e84610e576fbc4d044ccf74a8bd18630dbf`.

### Precheck, aplicación y postcheck

El precheck read-only repetido a las `2026-07-30T01:08:20.804171Z` confirmó:

- proyecto `vlxkoprpobfevxefizwr`, `ACTIVE_HEALTHY`, región `us-east-2`, PostgreSQL 17.6.1.104;
- historial de migraciones vacío y huella 004 completamente ausente;
- cero ciclos, cero sesiones relevantes y cero mínimos certificados;
- conteos/timestamps iguales al baseline;
- certify v1 SHA-256 `3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88` con ACL `postgres`/`service_role`;
- cache v15 SHA-256 `1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc` con ACL `PUBLIC`, `postgres`, `anon`, `authenticated` y `service_role`.

Se invocó `apply_migration` una sola vez sobre el proyecto exacto, nombre `lobodeals_3_reconciliable_cycle_actions` y los 67.999 bytes de 004. La herramienta respondió `success=true` y registró la versión `20260730010927`. No hubo timeout ni reintento.

El postcheck read-only a las `2026-07-30T01:11:41.826225Z` verificó:

- diez columnas, nueve constraints y tres índices 004 añadidos a cycles;
- receipts con 16 columnas, 14 constraints, cuatro índices, RLS, cero policies y cero filas;
- doce funciones y dos triggers con firmas exactas; once `SECURITY DEFINER`, el trigger identity invoker, `search_path=''`, owner `postgres` y grants esperados;
- helpers internos solo para `postgres`; entrypoints solo para `service_role`/`postgres`; sin ejecución para `anon` o `authenticated`;
- v1/v15 con definiciones y hashes intactos, ahora ejecutables únicamente por `postgres`;
- 0 cycles, 0 receipts, 32.890 stage items, 114 import runs, siete monthly/cuatro activos, 32.890 cache, 841.549 history/273.907.712 bytes y cero mínimos certificados;
- todos los timestamps comerciales iguales al baseline: no hubo upsert, monthly, cache refresh ni history.

Los asesores no encontraron warnings atribuibles a 004. Solo marcaron como `INFO` RLS sin policy para cycles/receipts y los índices nuevos todavía sin uso; es coherente con cero filas/ciclos y ausencia de grants a clientes. La deuda security/performance restante era preexistente y no se modificó.

El facts redactado está en `docs/audit/lobodeals-3-remote-readonly-facts-2026-07-30.json`. El preflight offline pasó válido/listo, sin blockers ni objetos faltantes, clasificación `MIGRATION_READY` y código 2. `LIVE_CYCLE_READY` sigue falso por diseño.

### Validación y posición del Bloque 4

Antes de la aplicación aprobaron 302/302 pruebas, incluidas 25/25 de recuperación, node checks, bundle `--check`, `git diff --check` y lint con cero errores/las seis advertencias preexistentes. No se ejecutó build. La validación final debe conservar esos resultados después de registrar la aplicación.

Posición exacta: la infraestructura reconciliable de 004 ya está instalada y verificada como `MIGRATION_READY`, pero el Bloque 4 no está cerrado. No existe aún un ciclo real ni evidencia live. Continúan bloqueados create-cycle, productores, upsert, monthly, democión, mark-succeeded, certificación, caché, validación pública y métricas hasta una autorización separada para el primer ciclo controlado. La prueba de 30 días no comenzó.

Siguiente tarea local segura: preparar, sin ejecutar, el runbook exacto del primer ciclo controlado usando los RPC 004 ya verificados, sus receipts y los artefactos locales; debe incluir gates de abort/reconciliación y no autoriza todavía la ejecución.

## 40. Decisión LoboDeals 3.2 sobre retención compacta — 2026-07-30

La sesión comenzó en `main`, HEAD `6d45b60c96295b85ac26833ca7f708082e01e7fb`, 43 commits delante/0 detrás de la referencia local `origin/main`, worktree limpio y baseline 302/302. El worktree heredado de Texto 0007-R1 fue revisado archivo por archivo antes de conservar, adaptar o descartar cambios.

### Decisión definitiva de producto

Johan descartó expresamente cualquier exportación o respaldo de `psdeals_stage_price_history` y cualquier backfill de mínimos a partir de sus 841.549 filas. No se conservará JSONL, gzip, CSV, dump, ZIP, espejo ni copia remota. Las herramientas locales de exportación que estaban sin rastrear fueron eliminadas antes de commit y nunca se ejecutaron; se exportaron cero filas.

Los cuatro campos `lobodeals_lowest_*` comienzan vacíos. Solo una observación positiva, coherente y segura del mismo ciclo futuro certificado puede inicializar el mínimo correspondiente; después únicamente un importe estrictamente menor puede reemplazarlo. No se importan mínimos legacy, no se crean columnas legacy alternativas y no se presenta un mínimo matemático histórico como certificado.

### Contrato local protegido

`scripts/lib/psdeals-compact-minima.mjs` quedó reducido a un contrato puro de observaciones futuras. Exige identidad explícita de ciclo e ítem, scope US/PlayStation/USD, productor correcto, precio positivo, oferta activa y señales comerciales seguras. Regular requiere descuento 1–99 coherente; PS Plus exige evidencia actual de detalle y exclusión mensual explícita. FREE, cero, `-100%`, monthly, tipo/plataforma insegura o evidencia incompleta no inicializan ni reducen mínimos.

Git demuestra que el writer detallado fue introducido por `06edcc1` y retirado por `c2e3281`; el runtime local actual no contiene writer directo de `psdeals_stage_price_history`. El importer ya no parsea ni escribe `lowest_price_amount` o `lowest_ps_plus_price_amount`; el stage payload bloquea esos campos legacy y los cuatro certificados; la página de detalle consume únicamente `lobodeals_lowest_*` y los rotula como mínimos certificados. La certificación conserva propiedad exclusiva de esos cuatro campos.

### Evidencia remota y retirada pendiente

No se consultó Supabase durante esta sesión. La última evidencia remota conservada, fechada `2026-07-30T01:11:41.826225Z`, reporta 841.549 filas de history, 273.907.712 bytes, 32.890 stage items y cero mínimos certificados. El uso `0,456/0,5 GB` fue aportado por Johan y no fue medido de nuevo.

La revisión adversarial local de 003 mantiene un gap: la función no recalcula por sí misma la igualdad exacta del porcentaje ni exige evidencia explícita de tipo/plataforma segura. Además, un listing ambiguo puede omitir el tuple comercial pero actualizar `listing_last_seen_at`, dejando la posibilidad de combinar timestamp nuevo y precios anteriores. Esta superficie debe cerrarse antes del primer ciclo mediante un contrato remoto verificado y una migración separada revisable; no se modificaron 003/004 ni se inventó 005.

La retirada física del histórico es obligatoria antes del primer ciclo real por la presión de capacidad, pero todavía está bloqueada. Primero se requiere una auditoría remota de solo lectura que confirme esquema, tamaño, dependencias y cero writers/consumidores actuales; después debe prepararse y aprobarse una migración exacta sin backup y sin `CASCADE`. No se ejecutó exportación, backfill, índice, migración, `DELETE`, `TRUNCATE`, `DROP`, `CASCADE`, `VACUUM` ni `VACUUM FULL`.

Readiness demostrado:

- `HISTORY_REMOTE_AUDIT_READY=false`;
- `CERTIFICATION_CONTRACT_READY=false`;
- `HISTORY_RETIREMENT_MIGRATION_READY=false`;
- `HISTORY_RETIRED=false`;
- `STORAGE_READY=false`;
- `LIVE_CYCLE_READY=false`.

El reporte detallado actualizado está en `docs/audit/lobodeals-3-compact-price-retention-readiness-2026-07-30.md`. Como `docs/**` está ignorado, se añadió intencionalmente con `git add -f` solo ese archivo; no se amplió `.gitignore` ni se añadió otro documento ignorado.

El checkpoint local `90031cf` (`Preserve certified price low ownership boundaries`) conserva siete archivos de código/pruebas. La validación final aprobó 311/311 pruebas, 27/27 suites enfocadas, todos los `node --check`, `git diff --check` y lint con cero errores y las seis advertencias preexistentes. No se ejecutó build ni ningún proceso operativo.

Posición exacta del Bloque 4: la infraestructura reconciliable de 004 continúa instalada y verificada, y los límites locales de propiedad de mínimos están protegidos. El Bloque 4 no está cerrado, no existe ciclo real y la prueba de 30 días no comenzó. El siguiente paso seguro es una auditoría remota estrictamente de solo lectura sobre `psdeals_stage_price_history`, sus dependencias y el contrato efectivo de certificación; no autoriza exportación, backfill, retirada física ni ejecución del ciclo.

## 41. Certificación ligada al ciclo y retirada restrictiva preparada — 2026-07-30

Texto 3.2-0002 completó la auditoría remota read-only: history conserva 841.549 filas/273.907.712 bytes; no hay blockers externos ni writers/consumers SQL almacenados, pero permanecen la policy pública y grants directos amplios. Los cuatro mínimos, cycles y receipts continúan en cero. La certificación remota 003/004 sigue insegura porque una marca nueva podía combinarse con valores públicos preservados.

Texto 3.2-0003 comenzó en `main`, HEAD `169c5870fce05f92fd9554a435cf22e6b5688ce4`, 45 commits delante/0 detrás de la referencia local `origin/main`, worktree limpio y baseline 311/311.

La solución local seleccionada separa precio público conservado de candidato certificable. La migración 005 añade dos slots acotados y sobrescribibles dentro de cada fila stage: regular y PS Plus, cada uno con remote cycle ID, timestamp, SHA-256 y JSON completo. No crea una fila por observación ni depende de history.

El listing solo produce candidato con tuple regular completo, tipo/plataforma seguros, fuente discounts, porcentaje 1–99 y fórmula exacta `round(100 * (original - current) / original)`. Un tuple inválido puede actualizar presencia/raw listing, pero no reemplaza el candidato; el slot anterior queda excluido por cycle ID.

El detalle usa un único instante de parseo, calcula SHA-256 del HTML y registra estado explícito del parser PS Plus. Buy box ausente/ilegible, chart inválido o discrepancia de fuentes no se convierten en un `false` seguro ni producen candidato. PS Plus requiere precio positivo menor que el regular del mismo parseo, tipo/plataforma seguros y exclusión monthly en certificación.

`certify_price_refresh_cycle_v3` no llama a v1/v2. Verifica cycle/timestamps/receipts, enlaza regular al hash exacto de listing validado, exige detail committed sin fallos pendientes, filtra scope/tipo/plataforma/monthly y conserva advisory lock, rollback, receipts, idempotencia, monotonicidad y first seen. 005 conserva v1/v2 para compatibilidad, revoca v2 a `service_role` y dirige la ruta futura a v3. 003 y 004 no fueron modificadas.

La migración 006 prepara la retirada de `public.psdeals_stage_price_history`. Es transaccional, toma lock acotado, verifica ocho columnas, cuatro constraints, cuatro índices, RLS, policy, grants, dependencias, FKs, triggers, vistas, rutinas y publicaciones; retira intencionalmente la superficie de acceso y termina con `DROP TABLE ... RESTRICT`. No contiene `CASCADE`, exportación, backfill, copia, mutación masiva por filas, `TRUNCATE` ni `VACUUM`. Los pre/postchecks read-only quedaron separados bajo `sql/validation/`.

Commits técnicos:

- `9d10089806ea86f090210d86cb67a2bfb34ae6ca` — `Bind price certification evidence to refresh cycles`;
- `00ea4c74142388aeb54ffb158f32f459a3d1ab36` — `Prepare restrictive PSDeals history retirement`.

El reporte detallado está en `docs/audit/lobodeals-3-certification-and-history-retirement-readiness-2026-07-30.md`.

La caché pública sigue sin los cuatro mínimos; v15/v16 no los propagan y el slug consulta stage. Esto no bloquea retirar history, pero debe resolverse antes de una fila pública “Lowest price ever” o filtro equivalente.

Ninguna migración fue aplicada. History sigue presente. No hubo SQL remoto, mutaciones Supabase, ciclo, certificación, caché, collector/importer/runner real, push, deploy ni prueba de 30 días.

La validación final aprobó 352/352 pruebas y 122/122 enfocadas. Todos los `node --check` aprobaron; lint conservó cero errores y las seis advertencias preexistentes; los diff checks y búsquedas de secretos/operaciones prohibidas aprobaron. No se ejecutó build.

Readiness:

- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `HISTORY_RETIREMENT_PREFLIGHT_READY=true` solo como readiness del diseño local;
- `CERTIFICATION_FIX_REQUIRED=true` en remoto.

Posición exacta: Bloque 3 conserva la retirada física pendiente; Bloque 4 tiene la corrección local de certificación y la retirada restrictiva preparadas, pero ninguna está aplicada. El siguiente gate es revisar 005/006 y autorizar por separado un precheck remoto read-only y su aplicación secuencial. Eso no autoriza todavía el primer ciclo real.

## 42. Revisión adversarial local de 005/006 — 2026-07-30

Texto 3.2-0004 comenzó en `main`, HEAD
`88732b037551ffcb491e0f1833d4f8b632834e79`, 48 commits delante/0 detrás de la
referencia local `origin/main`, worktree limpio y baseline 352/352.

La revisión encontró defectos reales en los borradores 005/006 y los corrigió
sin ejecutar SQL. Los candidatos pasan de un límite de 4.096 a 1.024 bytes por
JSON, admiten únicamente claves cerradas y llevan un SHA-256 del tuple exacto.
Regular enlaza el listing validado; PS Plus enlaza además la cola exacta
consumida. El techo textual conjunto para 32.890 filas baja de unos 257 MiB a
64,24 MiB; las muestras miden 588 y 750 bytes, unos 41,97 MiB combinados si
todos los items poblaran ambos slots, antes de overhead.

SQL y JavaScript calculan el porcentaje sobre importes de dos decimales/cents
con tolerancia cero. Texto 3.2-0005 retiró posteriormente el límite 20:1:
todo descuento coherente de 1% a 99% puede certificar y 100% permanece
excluido. Certifican `game/game`, `bundle/bundle` y `dlc/addon` cuando la
clasificación contemporánea es segura. La variedad de Add-On, Season Pass,
Avatar, Costume, Character, Vehicle, Weapons, Soundtrack, Theme, Map e Item no
reduce su alcance público ni mezcla identidades. Plataformas admitidas:
`["PS4"]`, `["PS5"]` y `["PS5","PS4"]`.

005 exige owner de aplicación `postgres`, fija timeouts, conserva v1/v2 solo
para `postgres`, expone v3 únicamente a `service_role`/`postgres` y no cambia
003/004. V3 conserva receipts, idempotencia, advisory lock, rollback,
monotonicidad y first seen. El modelo 004 no tiene campos actor/intent
separados; la autorización demostrable es ACL + action kind + parent receipt +
idempotency/request/input/manifest hashes.

006 ahora verifica owner, estructura exacta de los cuatro índices, superficie
cerrada de 32 entradas ACL de PostgreSQL 17, incluido `MAINTAIN`, sin
grantees, privilegios, grantors ni grant options adicionales. Tras
`DROP TABLE ... RESTRICT` ejecuta una postcondición dentro de la misma
transacción. Conserva lock timeout 5 s y statement timeout 60 s; no contiene
`CASCADE`, DML por filas, `TRUNCATE`, `VACUUM`, copia, exportación ni backfill.

Se añadieron precheck y postcheck 005 estrictamente read-only bajo
`sql/validation/`. Deben usarse junto a los ya existentes de 006 en cuatro
operaciones separadas. La secuencia futura obliga a aplicar y verificar 005,
reconfirmar producción, ejecutar precheck 006 y solo después autorizar 006. No
debe ejecutarse un ciclo entre ambas.

Vercel read-only identificó producción `READY` en deployment
`dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`, SHA
`4f826ac873850d3e61ceb68721512099625f1515`, creado
`2026-07-27T05:38:08.090Z`, con aliases públicos esperados. El SHA existe en
Git local. Su árbol exacto no contiene consumers de
`psdeals_stage_price_history`: `PRODUCTION_HISTORY_CONSUMERS_COUNT=0`,
`PRODUCTION_HISTORY_CONSUMERS=[]` y `PRODUCTION_SAFE_AFTER_006=true`.

La validación aprobó 358/358 pruebas, 63/63 enfocadas, todos los node checks,
`git diff --check` y lint con cero errores/las mismas seis advertencias
preexistentes. No se ejecutó build.

Readiness demostrado:

- `CERTIFICATION_MIGRATION_LOCAL_APPROVED=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `PRODUCTION_SAFE_AFTER_006=true`;
- `REMOTE_005_READY_TO_APPLY=false` hasta repetir precheck remoto actual;
- `REMOTE_006_READY_TO_APPLY=false` hasta aplicar/verificar 005 y aprobar el
  precheck 006;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`;
- `CERTIFICATION_FIX_REQUIRED=true` remotamente.

El dossier reproducible es
`docs/audit/lobodeals-3-005-006-adversarial-review-2026-07-30.md`.
El commit técnico es `3b89f1e`
(`Harden PSDeals certification and history retirement`).
Ninguna migración fue aplicada, history continúa presente y el Bloque 4 no
está cerrado. El siguiente paso es una sesión separada para ejecutar únicamente
el precheck remoto read-only de 005; no autoriza aplicar 005/006 ni iniciar un
ciclo.

## 43. Alcance público preservado en la certificación — 2026-07-30

Texto 3.2-0005 comenzó en `main`, HEAD
`862f9dfb288a1e39003cb46b7471fda58c8b0c24`, 50 commits delante/0 detrás de la
referencia local `origin/main`, worktree limpio y baseline 358/358.

La decisión final de producto conserva sin cambios la web pública existente:
Games, Bundles y DLC/Add-ons, sus filtros, categorías, rutas, disponibilidad y
precios actuales. Los cambios se limitan al contrato local de evidencia,
normalización y certificación; no se modificaron archivos de `app/` ni
`components/`.

Un candidato regular puede certificar cuando sus importes positivos de dos
decimales producen exactamente, sobre cents, un porcentaje entero entre 1% y
99%, el original es mayor que el actual y toda la evidencia contemporánea del
mismo ciclo es segura. Se retiró la gate general 20:1 de JavaScript y 005.
Descuentos coherentes de 1%, 50%, 95%, 96%, 97%, 98% y 99% aprobaron; 100%,
cero, FREE, negativos, porcentajes incoherentes, evidencia incompleta o ciclos
mezclados permanecen excluidos.

La allowlist de certificación es simétrica en JavaScript y SQL:
`game/game`, `bundle/bundle` y `dlc/addon`. Un producto seguro dentro de
DLC/Add-ons conserva su identidad PSDeals individual y su propio mínimo; no se
mezcla con el juego relacionado. Catalog, Combo, Subscription, desconocidos,
pares contradictorios y evidencia preservada de otro ciclo no certifican y no
degradan el precio público anterior.

PS4, PS5 y su conjunto combinado son certificables. Ambos órdenes fuente
PS4/PS5 y PS5/PS4 se normalizan antes del candidate y del SHA-256 a
`["PS5","PS4"]`. Duplicados, vacío, null, unknown, PS3, PS Vita, PSP y mezclas
legacy se rechazan.

005 conserva candidates de máximo 1.024 bytes, claves cerradas, SHA-256 del
candidate y artefacto, cycle ID, timestamp, FKs `RESTRICT`, índices parciales,
constraints todo-null/completo, ACL restrictiva, receipts, idempotencia,
monotonicidad, first seen, exclusión monthly y ausencia de historial detallado.
Su SHA-256 local vigente es
`2e631ebaabe809d8828690f25de4ae8b0b598f6faf0519e114e71f7bde2b7b96`.
006 no cambió y conserva SHA-256
`a121bfa29a94978209c6568502d13265e8bc5accae1b5aa21e617dc3ce6997aa`.

Los precheck/postcheck 005 read-only registran el SHA, el rango 1–99, la
ausencia de ratio 20:1, las tres familias seguras y las plataformas canónicas.
No fueron ejecutados contra Supabase. La validación final aprobó 366/366 pruebas
y 94/94 enfocadas; todos los `node --check`, diff checks y lint aprobaron, con
cero errores y las seis advertencias preexistentes.

El checkpoint técnico es `3211c1f`
(`Preserve public product scope in certified price lows`).

Readiness local:

- `PUBLIC_GAMES_PRESERVED=true`;
- `PUBLIC_BUNDLES_PRESERVED=true`;
- `PUBLIC_DLC_ADDONS_PRESERVED=true`;
- `PUBLIC_FILTERS_PRESERVED=true`;
- `PUBLIC_CURRENT_PRICES_PRESERVED=true`;
- `CERTIFICATION_MIGRATION_LOCAL_APPROVED=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_005_READY_TO_APPLY=false`;
- `REMOTE_006_READY_TO_APPLY=false`.

005 y 006 continúan sin aplicar. History permanece presente, el Bloque 4 no está
cerrado y la prueba de 30 días no comenzó. El siguiente paso separado es
ejecutar únicamente el precheck remoto read-only de 005; no autoriza aplicar
005/006 ni iniciar un ciclo real.

## 44. Aplicación remota verificada de 005 — 2026-07-31

Texto 3.2-0007 terminó con resultado `GO`. Johan autorizó exclusivamente
aplicar la migración 005 con prechecks inmediatos y postcheck, sin aplicar 006
ni ejecutar ciclos. La operación se realizó sobre el proyecto Supabase
`vlxkoprpobfevxefizwr`.

La migración quedó registrada una sola vez:

- versión: `20260731052531`;
- nombre: `lobodeals_3_cycle_bound_price_certification`;
- fecha: `2026-07-31 05:25:31 UTC`;
- fecha local: `2026-07-31 00:25:31 America/Lima`;
- SHA-256:
  `2e631ebaabe809d8828690f25de4ae8b0b598f6faf0519e114e71f7bde2b7b96`;
- tamaño del archivo local aplicado: 28.396 bytes;
- resultado transaccional: exitoso;
- postcheck remoto: aprobado.

El precheck inmediato confirmó PostgreSQL 17.6, sesión `postgres`, 004 exacta,
005/006 ausentes, v3 y las ocho columnas ausentes, cero colisiones, cero locks
o actividad riesgosa, 32.890 filas stage, 841.549 filas history, cero cycles,
cero receipts y cero mínimos.

005 instaló las ocho columnas candidatas nullable sin default, dos constraints
todo-null/completo con claves cerradas y máximo 1.024 bytes, dos FKs
`ON DELETE RESTRICT`, dos índices parciales, el helper
`_psdeals_certification_candidate_sha256_v1(jsonb)` y
`certify_price_refresh_cycle_v3(uuid,uuid,text,text,timestamptz)`.

El postcheck verificó:

- las ocho columnas presentes y completamente null en las 32.890 filas;
- v1 ejecutable únicamente por `postgres`;
- v2 ejecutable únicamente por `postgres`;
- v3 ejecutable únicamente por `service_role` y `postgres`;
- cero `EXECUTE` de v3 para `PUBLIC`, `anon` o `authenticated`;
- v3 con owner `postgres`, `SECURITY DEFINER` y `search_path=''`;
- descuentos regulares coherentes de 1% a 99%;
- exclusión de 100%, cero, FREE y datos incoherentes;
- ausencia del límite histórico 20:1;
- pares seguros `game/game`, `bundle/bundle` y `dlc/addon`;
- exclusión de tipos ambiguos;
- PS4, PS5 y conjunto combinado canónico PS5+PS4;
- cycle ID, timestamp, artifact hash y candidate hash obligatorios;
- rechazo de candidatos de otro ciclo;
- mínimos monotónicos y first seen preservado;
- monthly activo excluido;
- receipts e idempotencia conservados.

El coste inmediato fue pequeño y coherente con columnas nullable y candidatos
vacíos:

- Database Size antes: 440.683.667 bytes;
- Database Size después: 440.741.011 bytes;
- incremento total observado: 57.344 bytes;
- incremento en relaciones `public`/stage: 16.384 bytes;
- heap y TOAST de stage: sin crecimiento;
- índices parciales nuevos: 8.192 bytes cada uno y sin entradas;
- margen aproximado frente a 500 MB decimales: 59.258.989 bytes.

La integridad operativa quedó sin cambios: stage conserva 32.890 filas;
history conserva 841.549 filas y su tamaño previamente medido de 273.907.712
bytes; existen cero cycles, cero receipts, cero mínimos y cero candidates.
Monthly conserva 7 filas, 4 activas. La caché no fue refrescada.

La migración 006 no fue aplicada ni registrada. Su SHA-256 local continúa
siendo
`a121bfa29a94978209c6568502d13265e8bc5accae1b5aa21e617dc3ce6997aa`.
`public.psdeals_stage_price_history` sigue presente con sus 841.549 filas,
cuatro índices, policy y grants previos. No se ejecutó `DROP`. No debe poblarse
ningún candidate mientras history permanezca presente.

Readiness remoto actual:

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

`CERTIFICATION_FIX_REQUIRED=false` significa únicamente que la corrección
remota v3 está instalada y verificada. No significa updater completo, ciclo
listo, certificación ejecutada, mínimos inicializados ni sistema listo para
operación.

`COMPACT_MINIMA_SCHEMA_READY=true` significa que columnas, constraints,
índices, helper, v3 y ACL pasaron el postcheck remoto.
`COMPACT_MINIMA_READY=false` continúa porque faltan retirar history, realizar
la simulación integral, validar el updater, ejecutar el primer ciclo
expresamente autorizado y completar la verificación operativa.

No se ejecutaron collector, importer, analyzer operativo, runner, ciclo,
mark-succeeded, certificación, cache refresh, monthly write, push, deploy,
eliminación histórica ni prueba de 30 días. El Bloque 4 no está cerrado. El
siguiente gate, todavía no ejecutado ni autorizado como escritura, es
exclusivamente el precheck remoto read-only de la migración 006.

## 45. Precheck 006 NO-GO y endurecimiento local PostgreSQL 17 — 2026-07-31

Texto 3.2-0009 ejecutó exclusivamente el precheck remoto read-only de 006.
Confirmó que history sigue presente con 841.549 filas y 273.907.712 bytes, su
estructura de ocho columnas/cuatro constraints/cuatro índices es exacta, no
hay FKs entrantes, triggers de usuario, dependencias externas, writers o
consumers almacenados, consumers de producción ni consumers runtime locales.
Stage conserva 32.890 filas; cycles, receipts, mínimos y candidates siguen en
cero; monthly conserva 7 filas/4 activas y cache 32.890 filas.

El resultado fue `NO-GO` por tres defectos locales verificables:

1. el precheck canónico usaba el alias `dependent_catalog` dentro de un cast
   en `ORDER BY`, forma inválida en PostgreSQL 17;
2. `information_schema.role_table_grants` mostraba 28 grants, pero
   `aclexplode(relacl)` demostró 32 entradas efectivas: ocho privilegios para
   cada uno de `anon`, `authenticated`, `service_role` y `postgres`, incluido
   `MAINTAIN`;
3. el postcheck no protegía todas las invariantes de history, 005 y los datos
   conservados.

Texto 3.2-0010 corrigió esos tres defectos exclusivamente de forma local en el
commit `f6403701b18068bda6b3ba5daba241c38abf5469`
(`Harden restrictive history retirement validation`).

El precheck ahora ordena las dependencias desde una subconsulta, reproduce las
exclusiones internas de 006 y muestra por separado `information_schema`, ACL
efectivo, conteos por rol/privilegio, `MAINTAIN`, `PUBLIC`, grantees,
privilegios, grant options y drift total.

006 compara bidireccionalmente el ACL real con un conjunto cerrado de 32
tuplas `(grantee, privilege_type, is_grantable, grantor)`. Rechaza 28, 31 o 33
entradas, ausencia de `MAINTAIN`, `PUBLIC`, rol/privilegio/grantor adicional y
grant option inesperado. Conserva transacción, timeouts, `ACCESS EXCLUSIVE`,
retirada de policy, `REVOKE ALL PRIVILEGES`, `DROP TABLE ... RESTRICT`,
postcondición y `COMMIT`; no contiene `CASCADE`, copia, backup, exportación,
backfill ni DML de filas.

El postcheck read-only ampliado comprueba ausencia de tabla, columnas,
constraints, índices, triggers, policy, ACL y dependencias; registro de 006;
las ocho columnas, cuatro constraints, dos FKs, dos índices, helper SHA, v1,
v2 y v3 de 005; first-seen, candidates, monthly activas, cache
`max(updated_at)` y capacidad. Los valores previos están visibles como
baseline autorizable y deben refrescarse inmediatamente antes de una futura
aplicación.

El SHA-256 local nuevo de 006 es
`e754bbd0beb5f1790f72d8e219fca239477bd25853fdee61758139fec9d96c34`
y su tamaño es 15.762 bytes. La validación local aprobó 375/375 pruebas,
84/84 enfocadas, `node --check`, diff checks y lint con cero errores y las seis
advertencias preexistentes. No se ejecutó SQL remoto, 006, collector,
importer, runner, ciclo, certificación, caché, monthly, push ni deploy.

Readiness local:

- `MIGRATION_006_DESTRUCTIVE_SCOPE_EXACT=true`;
- `MIGRATION_006_FAIL_CLOSED=true`;
- `POSTCHECK_006_COMPLETE=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_006_READY_TO_APPLY=false`;
- `STORAGE_READY=false`;
- `COMPACT_MINIMA_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`.

El Bloque 3 conserva pendiente la retirada física de history y el Bloque 4 no
está cerrado. El siguiente paso seguro es repetir exclusivamente el precheck
remoto DB READ-ONLY de 006 usando los archivos corregidos. Eso no autoriza
aplicar 006 ni iniciar la prueba de 30 días.

## 46. Corrección final del agrupamiento ACL del precheck 006 — 2026-07-31

Texto 3.2-0011 repitió las 20 consultas canónicas del precheck remoto
read-only. Diecinueve ejecutaron correctamente y toda la evidencia sustantiva
de 006 volvió a coincidir: identidad, estructura, dependencias, ACL efectivo
de 32 entradas con `MAINTAIN`, policy, producción, runtime, datos, capacidad y
locks. La consulta 14 falló con PostgreSQL `42803` porque agrupaba mediante el
alias de salida `grantee` aunque la expresión proyectada dependía de
`grantee_role.rolname`. El resultado permaneció `NO-GO`; no se aplicó 006.

Texto 3.2-0012 corrigió exclusivamente ese defecto local. La consulta 14
materializa ahora en un CTE `effective_acl` el grantee, privilege type, grant
option y grantor; el SELECT exterior agrupa por
`effective_acl.grantee`. Además devuelve arrays ordenados de privilegios,
grantors y grant options, por lo que PUBLIC, roles o privilegios inesperados,
duplicados y drift de identidad continúan visibles. Las 20 consultas siguen
presentes y son únicamente `SELECT`/`WITH`.

No se encontró otro alias equivalente defectuoso en los prechecks,
postchecks o validadores relacionados. La migración 006 no cambió y conserva
SHA-256
`e754bbd0beb5f1790f72d8e219fca239477bd25853fdee61758139fec9d96c34`,
`DROP TABLE ... RESTRICT`, ACL exacto de 32 entradas, `MAINTAIN` para los cuatro
roles y assertions fail-closed.

Commit técnico:

- `50d244c9d1eb0e82082992f9ea3e82708966b044` —
  `Fix PostgreSQL 17 ACL precheck grouping`.

Validación local: 377/377 pruebas globales, 83/83 enfocadas, 19/19 de
retirement, `node --check`, diff checks y lint con cero errores y las seis
advertencias preexistentes. No hubo SQL remoto, Supabase, build, collector,
importer, runner, ciclo, certificación, caché, monthly, push ni deploy.

Readiness local:

- `PRECHECK_006_STRICTLY_READ_ONLY=true`;
- `DEPENDENCY_QUERY_POSTGRES17_VALID=true`;
- `ACL_GROUPING_QUERY_POSTGRES17_VALID=true`;
- `MIGRATION_006_LOCAL_HASH_MATCH=true`;
- `MIGRATION_006_DESTRUCTIVE_SCOPE_EXACT=true`;
- `MIGRATION_006_FAIL_CLOSED=true`;
- `POSTCHECK_006_COMPLETE=true`;
- `HISTORY_RETIREMENT_MIGRATION_LOCAL_APPROVED=true`;
- `REMOTE_006_READY_TO_APPLY=false`;
- `STORAGE_READY=false`;
- `HISTORY_RETIRED=false`;
- `LIVE_CYCLE_READY=false`.

El siguiente paso es repetir íntegramente el precheck remoto DB READ-ONLY de
006. No existe autorización DB WRITE y 006 continúa sin aplicar.
