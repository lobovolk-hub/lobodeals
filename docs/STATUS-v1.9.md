# STATUS v1.9 — LoboDeals — 2026-05-11

## 1. Estado general

LoboDeals 1.9 es la versión de limpieza, estabilización y handoff posterior al deploy público inicial de LoboDeals PlayStation.

La web está viva en producción:

- https://lobodeals.com
- https://www.lobodeals.com redirige a https://lobodeals.com
- https://lobodeals.vercel.app también está configurado como dominio de Vercel

El flujo GitHub → Vercel quedó restaurado y validado. El deploy normal vuelve a hacerse con:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel despliega automáticamente desde GitHub main.

## 2. Estado visual / UX

La experiencia visual de PC y móvil quedó cerrada y confirmada por revisión manual post-deploy.

Cerrado visualmente:

- Home
- Carrusel principal
- Header desktop
- Header mobile
- Search en header
- Menú mobile
- /catalog
- /deals
- /tracked
- /profile
- /login
- Slugs públicos
- Cards responsive
- Filtros desplegables en /catalog y /deals
- Grids móviles de 2 columnas

No se requieren más cambios visuales antes del launch.

## 3. Rutas principales

Rutas activas:

- /
- /catalog
- /deals
- /login
- /profile
- /tracked
- /us/playstation/[slug]
- /auth/callback
- /robots.txt
- /sitemap.xml

Ruta pública confirmada para slugs:

    /us/playstation/[slug]

La UI pública debe mantenerse en inglés.

## 4. Proyecto local

Ruta principal:

    D:\Proyectos\lobodeals

Worker separado:

    D:\Proyectos\worker-playstation-ingest

El worker se conserva como referencia legacy de la etapa PlayStation Store, pero no es el flujo principal actual.

## 5. Estado post-cleanup local

Limpieza realizada en LoboDeals 1.9:

- Se inventariaron y eliminaron los HTML crudos pesados de logs/psdeals-import-html.
- Se inventariaron y eliminaron los HTML crudos pesados de logs/psdeals-listing-html.
- logs bajó de aproximadamente 4904 MB a 15.42 MB.
- Se eliminó .next como cache regenerable.
- Se movió .browser-profiles fuera del proyecto a backup local:
  D:\Proyectos\lobodeals-local-archive\browser-profiles-legacy-2026-05-11
- data/import fue revisado y se mantiene.
- node_modules se mantiene.
- docs/audit-v1.9 se mantiene.
- No se borró código fuente.
- No se borraron scripts.
- No se borró data/import.
- No se borraron tablas de Supabase.

Tamaño post-cleanup antes de regenerar .next por build:

    node_modules      432.84 MB
    data              192.53 MB
    .git               61.69 MB
    logs               15.42 MB
    docs               10.23 MB
    public              3.39 MB
    archive             3 MB
    scripts             0.27 MB
    app                 0.17 MB
    .playwright-cli     0.15 MB
    components          0.05 MB
    sql                 0.01 MB
    lib                 0 MB
    .vercel             0 MB

Nota: después de ejecutar npm run build, .next se regenera. No debe incluirse en ZIP ni en Git.

## 6. Build

Build validado después de limpieza:

    npm run build

Resultado:

- Compiled successfully
- Finished TypeScript
- Generated static pages
- Finalized page optimization

Rutas detectadas por build:

- /
- /_not-found
- /apple-icon.png
- /auth/callback
- /catalog
- /deals
- /icon.png
- /login
- /profile
- /robots.txt
- /sitemap.xml
- /tracked
- /us/playstation/[slug]

## 7. GitHub

Repositorio actual:

    https://github.com/lobovolk-hub/lobodeals

Rama de producción:

    main

La versión Steam anterior fue reemplazada en main. Se creó backup histórico en GitHub como:

    steam-legacy-backup

## 8. Vercel

Proyecto Vercel:

    lobodeals

Dominios:

- lobodeals.com
- www.lobodeals.com
- lobodeals.vercel.app

Configuración deseada:

- lobodeals.com como dominio principal.
- www.lobodeals.com redirige a lobodeals.com.
- Deploy automático desde GitHub main.

Variables de entorno conocidas en Vercel/producción:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- NEXT_PUBLIC_SITE_URL

No publicar secretos en documentación ni commits.

## 9. Supabase

Supabase es la base de datos y Auth de LoboDeals.

Estado snapshot 1.9:

    catalog_public_cache        32412
    psdeals_stage_items         32412
    psdeals_stage_price_history 785766
    psdeals_stage_relations     41398
    official_ps_store_deals     44
    metacritic_queue            16473
    profiles                    1
    user_tracked_items          9
    ps_ingest_queue             0
    price_offer_queue           0
    ps_discovery_progress       4
    automation_runs             1624

Runtime público — no tocar:

- catalog_public_cache
- profiles
- user_tracked_items
- search_catalog_public_cache
- RPCs de auth/profile/tracking

Catálogo, pricing e historial — no tocar:

- psdeals_stage_items
- psdeals_stage_price_history
- psdeals_stage_relations
- official_ps_store_deals
- psdeals_import_runs
- refresh_catalog_public_cache_v15

Legacy PlayStation Store — conservar estructura, no usar como flujo principal:

- ps_ingest_queue
- price_offer_queue
- ps_discovery_progress
- worker-playstation-ingest

Operación / auditoría:

- automation_runs
- metacritic_queue

## 10. Metacritic

La única tarea local activa en Windows Task Scheduler es:

    LoboDeals - Metacritic Weekly 14d

Ejecuta:

    D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1

Se eliminaron del Task Scheduler las tareas desactivadas:

- LoboDeals - Metacritic Monthly
- LoboDeals - PSDeals Recently Added 12h

Los scripts no fueron borrados.

Corrección realizada en Supabase:

- Había 211 filas antiguas en metacritic_queue con status = processing.
- Tenían locked_by = node_local_metacritic_browse.
- Se confirmó rows_to_reset = 211.
- Se resetearon a pending.
- No se borró nada.
- No se tocaron filas en manual_review.

Estado posterior:

    manual_review = 373
    pending attempts 0 = 11797
    pending attempts 1 = 211
    processing = 0

## 11. Situación particular de precios/deals

La situación de precios/deals es especial y debe mantenerse documentada.

PSDeals sigue siendo la fuente principal histórica para:

- catálogo
- precios
- historial
- relaciones
- slugs
- imágenes
- metadatos base

Pero los deals públicos actuales no deben publicarse ciegamente desde PSDeals.

Después de la auditoría crítica de precios del 9–10 de mayo de 2026, LoboDeals publica deals filtrados contra PlayStation Store oficial.

Estado actual:

- PlayStation Store oficial mostraba pocos deals reales.
- Muchos “deals” en PSDeals/PSPrices eran en realidad nuevos precios base menores.
- LoboDeals corrigió esto para no mostrar falsos descuentos.
- official_ps_store_deals funciona como allowlist de deals oficiales.
- catalog_public_cache publica solamente deals que pasan esa lógica.
- Actualmente hay 44 filas en official_ps_store_deals.
- En cache pública quedaron 41 deals oficiales matcheados.
- Los casos official-only que no existen en catálogo/base PSDeals se ignoran por ahora.

No revertir esta lógica sin revisar la auditoría crítica.

## 12. Fuentes principales

PSDeals:
fuente principal histórica de catálogo, precios, historial y relaciones.

PlayStation Store oficial:
validación/allowlist para deals actuales y posible fuente futura para disponibilidad/store_url.

Metacritic:
solo importa metacritic_score. No priorizar user score ni review count.

## 13. Worker

Worker local separado:

    D:\Proyectos\worker-playstation-ingest

Nombre Cloudflare Worker:

    lobodeals-playstation-ingest

Clasificación:

    Legacy/reference

No es el flujo principal actual de LoboDeals 1.9.

Datos relevantes:

- Usa ps_ingest_queue.
- Usa automation_runs.
- Tiene handler scheduled, pero wrangler.jsonc no tiene crons activos.
- .dev.vars contiene variables sensibles; no compartir ni commitear.
- Puede servir como referencia futura para checks de disponibilidad o PlayStation Store, pero no tratarlo como infraestructura activa del launch.

## 14. Documentación vieja

La documentación vieja v1/v1.6/v1.7 fue revisada, se extrajeron referencias útiles y luego fue eliminada.

Borrado:

- docs/DB-SNAPSHOT-v1.7.md
- docs/HANDOFF-v1.7.md
- docs/NEW-CHAT-MESSAGE-v1.7.md
- docs/OPERATIONS-v1.7.md
- docs/ROADMAP-v1.7.md
- docs/STATUS-v1.7.md
- docs/SYSTEM-MAP-v1.7.md
- docs/archive/pre-v1.7/

Se mantiene:

    docs/audit-v1.9

Los documentos finales 1.9 deben reemplazar completamente la documentación vieja.

## 15. Reglas de trabajo vigentes

Reglas importantes:

- Indicar siempre el apartado exacto del roadmap en el que se está trabajando.
- Marcar claramente Listo al cerrar apartados.
- Validar línea por línea en cambios críticos.
- No priorizar rapidez sobre verificación.
- No asumir que un ZIP viejo es fuente de verdad si hubo cambios posteriores por chat/Git/deploy.
- La fuente de verdad actual es la versión local/Git posterior al deploy y limpieza 1.9.
- El ZIP 1.8 debe considerarse muerto/obsoleto.
- No volver a procesos manuales masivos salvo revisión de errores puntuales.
- No borrar tablas, scripts ni data sin inventario previo.
- No tocar filtros de visibilidad pública sin discutirlo explícitamente.
- No ocultar add-ons por título salvo que se confirme error real en PlayStation Store.
- Mantener UI pública en inglés.
- En cambios estructurales, entregar archivo completo cuando haya más de 4 cambios o riesgo de mezcla.

## 16. Estado de cierre

LoboDeals 1.9 queda como etapa de:

    cleanup + documentación + handoff + preparación de Search Console / launch soft

Siguiente documento a crear:

    SYSTEM-MAP-v1.9.md

## Addendum — OAuth Google production redirect fix — 2026-05-11

Se corrigió un bug crítico de OAuth Google en producción.

Problema:
Continue with Google desde https://lobodeals.com redirigía a http://localhost:3000 después de seleccionar cuenta Google.

Causa:
Supabase Auth tenía Site URL configurado como http://localhost:3000.

Corrección aplicada en Supabase Authentication URL Configuration:
- Site URL cambiado a https://lobodeals.com.
- Redirect URLs conservadas/agregadas para:
  - https://lobodeals.com/auth/callback
  - https://www.lobodeals.com/auth/callback
  - https://lobodeals.vercel.app/auth/callback
  - http://localhost:3000/auth/callback
  - versiones con wildcard para permitir query params.

Validación:
- Continue with Google funciona correctamente en producción.
- Continue with Google funciona correctamente en local.
- No fue necesario tocar código ni redeploy.

## Addendum — Analytics, GTM, Search Console and sitemap — 2026-05-12

Se completó la configuración de Analytics/Search Console para LoboDeals.

Search Console:
- Propiedad de dominio: lobodeals.com
- Sitemap activo: https://lobodeals.com/sitemap.xml
- Sitemap viejo con www eliminado
- Sitemap actual leído correctamente con 32,415 páginas descubiertas

Sitemap:
- app/sitemap.ts fue ajustado para paginar catalog_public_cache y superar el límite práctico de ~1,000 filas por request.
- El sitemap actual incluye rutas estáticas principales y slugs PlayStation.
- Search Console confirmó 32,415 páginas descubiertas.

Google Analytics / GA4:
- Flujo: LoboDeals web - GA4
- URL del flujo: https://lobodeals.com/
- Measurement ID: G-HDWK60YXND
- Realtime validado correctamente.

Google Tag Manager:
- Contenedor: GTM-NHVH36FP
- Tag publicado: Google tag - GA4 - LoboDeals
- Activador: Initialization - All Pages
- GTM instalado en app/layout.tsx mediante NEXT_PUBLIC_GTM_ID.

Vinculación GA4/Search Console:
- Vinculación creada entre sc-domain:lobodeals.com y LoboDeals web - GA4.

Estado:
Analytics, GTM, Search Console y sitemap quedan listos para launch soft.

## Addendum — Daily manual refresh operation — 2026-05-12

Se decidió no dejar programada automáticamente la revisión de PSDeals / PlayStation Store por ahora.

Motivos:
- PSDeals requiere Edge live / CDP.
- Chrome / Playwright local no se usa para PSDeals.
- Puede haber captcha/challenge.
- Los deals públicos deben validarse contra PlayStation Store oficial antes de publicarse.
- El usuario prefiere revisar manualmente conmigo todos los días a las 12:30 p. m.

Flujo diario manual acordado:

1. PSDeals recently-added
   - Fuente operativa:
     https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
   - Uso:
     - nuevos ingresos
     - latest
     - upcoming
     - cambios de catálogo
   - Runner:
     scripts/run-psdeals-edge-live-recently-added.ps1
   - Regla:
     Este flujo puede importar nuevos items y luego refrescar catalog_public_cache.

2. PlayStation Store official deals
   - Fuente actual:
     https://store.playstation.com/en-us/category/b3915b25-f581-43dd-95dd-a4ec50dbabe6/1
   - Uso:
     - fuente de verdad / allowlist para PS Plus official deals
   - Script:
     scripts/collect-psstore-official-deals-edge-live.mjs
   - Regla:
     Aplicar SQL solo después de revisar conteos y contenido recolectado.

3. PSDeals best-new-deals
   - Fuente:
     https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc
   - Uso:
     - candidatos de descuento
   - Regla:
     No publicar deals ciegamente desde PSDeals.

4. Validación final
   - Refrescar catalog_public_cache.
   - Validar producción:
     - /home
     - /catalog
     - /deals
     - slugs puntuales.

Estado 2026-05-12 mediodía:
- recently-added corrió correctamente.
- 8 páginas revisadas.
- 288 items recolectados.
- 13 nuevos detectados.
- 13 insertados.
- PlayStation Store official deals recolectó 45 deals.
- SQL oficial aplicado.
- catalog_public_cache quedó en:
  (32425,0,42,0)
- Producción validada en lobodeals.com y se ve perfecta.
