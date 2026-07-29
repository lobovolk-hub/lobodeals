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

afd773d36b2f4896ff54a8678d0520b5e513aab0

origin/main confirmado:

4f826ac873850d3e61ceb68721512099625f1515

La rama local main estaba ocho commits por delante y cero por detrás de origin/main antes del commit documental que contiene esta actualización.

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

Implementar el validador offline de manifiesto y completitud del ciclo diario. Debe demostrar, sin conexiones ni escrituras, que un ciclo incompleto nunca puede avanzar a certificación o caché y que conserva evidencia separada de listado, detalle, demociones y revisión mensual.

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

El siguiente cambio local concreto es el validador offline de manifiesto/completitud. Los clasificadores y builders ya existen, pero todavía no hay un escritor diario de listado ni debe conectarse hasta que ese validador y el contrato del ciclo estén cerrados.

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
| Catalog | addon | dlc | addon | confianza media; requiere detalle y no sustituye valor existente |
| Combo | addon | dlc | addon | confianza media; requiere detalle y no sustituye valor existente |
| Subscription | addon | dlc | addon | confianza media; requiere detalle y no sustituye valor existente |
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

Resultado sobre 3,600 filas:

- tipos normalizados: game 2,522; bundle 631; dlc 446; omitido 1;
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

El Bloque 4 no está cerrado. El siguiente cambio local seguro es el validador offline de manifiesto/completitud del ciclo certificado. No debe ejecutarse aún ningún collector, importer, runner, SQL, certificación, caché ni prueba operativa.
