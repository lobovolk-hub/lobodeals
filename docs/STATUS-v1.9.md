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

## Addendum — PS Plus Monthly Games MVP — 2026-05-12

Se implementó la primera versión funcional de PS Plus Monthly Games.

Objetivo:
- Mostrar juegos mensuales de PS Plus como beneficio de suscripción.
- No tratarlos como descuentos regulares.
- No marcarlos como 100% off.
- No modificar current_price_amount.
- No activar has_deal.
- No activar has_ps_plus_deal salvo que exista un PS Plus discount real separado.

Regla de producto:
Monthly Games = Free with PS Plus.
Deals = descuentos activos / PS Plus discounts oficiales.

Supabase:
Se creó la tabla:

    public.ps_plus_monthly_games

Uso:
- Allowlist mensual oficial de juegos incluidos con PS Plus.
- Se carga manualmente una vez al mes tras revisar fuente oficial.
- Se asocia contra item_id / slug existente del catálogo.

Columnas nuevas en catalog_public_cache:
- is_ps_plus_monthly_game
- ps_plus_monthly_label
- ps_plus_monthly_note
- ps_plus_monthly_month
- ps_plus_monthly_until

También se agregaron columnas temporales/operativas en ps_plus_monthly_games:
- active_from_at
- active_until_at

Motivo:
PlayStation Plus Monthly Games puede mantenerse canjeable hasta el primer martes del mes siguiente aproximadamente a las 17:00. Por eso no conviene depender solo de active_until date.

Funciones actualizadas:
- public.refresh_catalog_public_cache_v15()
- public.search_catalog_public_cache(...)

Mayo 2026 cargado:
- EA SPORTS FC™ 26
  slug: ea-sports-fc-26-standard-edition-ps4-ps5
- Nine Sols
  slug: nine-sols-ps4-ps5
- WUCHANG: Fallen Feathers
  slug: wuchang-fallen-feathers

Fechas usadas:
- active_from: 2026-05-05
- active_until: 2026-06-01
- active_until_at: 2026-06-02 17:00:00+00

Resultado validado:
- refresh_catalog_public_cache_v15() devolvió:
  (32425,0,42,0)
- ps_plus_monthly_games tiene 3 filas activas para 2026-05.
- Los 3 juegos aparecen en catalog_public_cache con is_ps_plus_monthly_game = true.
- has_deal = false.
- has_ps_plus_deal = false.
- current_price_amount conserva el precio real.

Frontend:
Commit aplicado:

    1a02314 Show PS Plus monthly games from catalog cache

Archivos modificados:
- app/us/playstation/[slug]/page.tsx
- components/item-card.tsx

Validación visual:
- Slug pages muestran Free with PS Plus.
- Catalog cards muestran Monthly PS Plus game / Free with PS Plus.
- La UI quedó aprobada visualmente.

Pendiente futuro:
- Crear sección Home: This month’s PS Plus games.
- Crear flujo mensual documentado para actualizar ps_plus_monthly_games.
- Agregar en perfil/tracked: Did you redeem this month’s games?
- Guardar claimed/redeemed por usuario en una tabla futura.

## Addendum — PS Plus Monthly Games Home section — 2026-05-12

Se implementó la sección de Home:

    This month’s PS Plus games

La sección usa datos reales desde catalog_public_cache y muestra los juegos activos en ps_plus_monthly_games.

Estado:
- Implementado en app/page.tsx.
- Usa ItemCard.
- Muestra Monthly PS Plus game / Free with PS Plus.
- Visual validado por el usuario.
- No se mezcla con /deals.
- No altera current_price_amount.
- No activa has_deal.
- No activa has_ps_plus_deal.

Mayo 2026:
- EA SPORTS FC™ 26 Standard Edition PS4 & PS5
- Nine Sols PS4 & PS5
- WUCHANG: Fallen Feathers

## Addendum — Supabase Auth SMTP with Resend — 2026-05-12

Se configuró custom SMTP para Supabase Auth usando Resend.

Motivo:
- El servicio built-in de Supabase tiene límites bajos y no está pensado para producción.
- LoboDeals necesita enviar correos de confirmación, recuperación y autenticación sin depender del límite interno de Supabase.

Proveedor:
- Resend

Dominio:
- lobodeals.com

Estado DNS:
- Domain Verification configurado.
- DKIM configurado.
- SPF configurado.
- Enable Sending activado.
- Enable Receiving no se activó porque LoboDeals solo necesita enviar correos de Auth por ahora.

Sender configurado:
- no-reply@lobodeals.com
- Sender name: LoboDeals

Supabase:
- Authentication → Emails → SMTP Settings
- Enable custom SMTP: activo
- Host: smtp.resend.com
- Port: 465
- Username: resend
- Password: Resend API key

Templates revisados/configurados:
- Confirm sign up
- Invite user
- Magic link
- Change email address
- Reset password
- Reauthentication

Validación:
- Resend mostró eventos POST /emails correctos.
- El usuario confirmó que la configuración quedó funcionando sin problemas.

Nota:
Custom SMTP no cambia el texto de Google OAuth que muestra el dominio de Supabase. Eso queda para un bloque futuro separado: Custom Auth Domain.

Pendiente futuro:
- Evaluar activar emails de seguridad:
  - Password changed
  - Email address changed
  - Identity linked
- Revisar Custom Auth Domain para evitar mostrar el subdominio Supabase en OAuth.

## Addendum — Emergency PSDeals-only deals refresh — 2026-05-13

Se realizó una actualización crítica de deals el 2026-05-13 tras el inicio de una nueva ronda grande de ofertas.

Decisión operativa:
- PlayStation Store official mixed deals quedó descartado por ahora para deals masivos.
- PSDeals vuelve a ser la fuente principal de pricing/deals.
- La auditoría con PlayStation Store se pospone porque el flujo mixto regular/PS Plus tomó demasiado tiempo y bloqueaba la actualización pública.

Flujo ejecutado:
1. PSDeals recently-added:
   - 8 páginas revisadas.
   - 12 nuevos items insertados.
   - Cache refrescada manualmente en Supabase.

2. PSDeals best-new-deals:
   - 215 páginas procesadas.
   - 7528 unique items collected.
   - 0 failed pages.
   - Auto-stop por five_consecutive_duplicate_pages.

3. Analyzer inicial:
   - 6511 refresh candidates.
   - 1017 same price fields omitidos inicialmente.

4. Import detail URL por URL:
   - Primer pase:
     - Seen: 6511
     - Updated: 6502
     - Failed: 9
   - Segundo pase de omitidos:
     - Seen: 1017
     - Updated: 1013
     - Failed: 4

Total aproximado actualizado desde PSDeals detail:
- 7515 de 7528 URLs.
- 13 fallos totales.

Problema detectado:
- El analyzer fue demasiado agresivo.
- Omitió URLs con discount_percent > 0 si los campos básicos parecían iguales.
- Caso visible: Mixtape.
- Mixtape no fue abierto en el primer pase porque quedó dentro de los 1017 omitidos.
- Al importar los omitidos, Mixtape quedó corregido.

Regla nueva:
- En ofertas grandes, no omitir URLs con discount_percent > 0 solo porque current/original parecen iguales.
- PS Plus puede requerir abrir detail page para detectar current_ps_plus_price_amount.
- El analyzer debe corregirse antes del siguiente flujo grande.

Publicación:
- Se aplicó emergency cache update directo sobre catalog_public_cache desde psdeals_stage_items.
- No se ejecutó refresh_catalog_public_cache_v15() después.
- IMPORTANTE: No ejecutar refresh_catalog_public_cache_v15() hasta convertirlo a PSDeals-only, porque puede revertir la lógica actual.

Estado final validado:
- total_rows: 32437
- active_regular_deals: 7227
- active_ps_plus_deals: 3053
- active_monthly_games: 3
- expired_deals_still_marked_active: 0
- deals_with_100_percent_or_more: 0
- null_best_price_amount: 0

Validación visual:
- /deals correcto.
- /home correcto.
- Mixtape correcto.
- Like a Dragon Gaiden correcto.
- Producción validada por el usuario.

Pendientes obligatorios:
1. Convertir refresh_catalog_public_cache_v15 a PSDeals-only.
2. Corregir analyzer para no omitir PS Plus/discounted items.
3. Reintentar las 13 URLs fallidas.
4. Diseñar flujo rápido para no abrir miles de URLs cada vez.
5. Documentar estrategia futura de refresh:
   - listing como fuente rápida.
   - detail solo para nuevos, cambios, PS Plus, faltantes o casos dudosos.

## Addendum — Emergency PSDeals-only refresh + Metacritic protection — 2026-05-13

Se cerró la operación crítica de actualización de deals del 2026-05-13.

Contexto:
- El 2026-05-13 salió una ronda grande de ofertas.
- PlayStation Store official mixed deals mezclaba descuentos regulares y PS Plus, lo que hizo el flujo demasiado lento y complejo para operación diaria.
- Se decidió descartar PlayStation Store official mixed deals por ahora para deals masivos.
- PSDeals vuelve a ser la fuente principal operativa para pricing/deals.

Resultado final de cache:
- total_rows: 32437
- active_regular_deals: 7227
- active_ps_plus_deals: 3053
- active_monthly_games: 3
- expired_deals_still_marked_active: 0
- deals_with_100_percent_or_more: 0
- null_best_price_amount: 0

Casos clave validados:
- Mixtape:
  - current_price_amount: 19.99
  - original_price_amount: 19.99
  - ps_plus_price_amount: 17.99
  - best_price_amount: 17.99
  - best_price_type: ps_plus
  - discount_percent: 10
  - has_ps_plus_deal: true
- Like a Dragon Gaiden: The Man Who Erased His Name PS4 & PS5:
  - current_price_amount: 14.99
  - original_price_amount: 49.99
  - best_price_type: regular
  - discount_percent: 70
  - has_deal: true

Flujo ejecutado:
1. PSDeals recently-added:
   - 8 páginas revisadas.
   - 12 nuevos items insertados.
   - Cache refrescada manualmente.

2. PSDeals best-new-deals:
   - 215 páginas procesadas.
   - 7528 unique items collected.
   - 0 failed pages.
   - Auto-stop por five_consecutive_duplicate_pages.

3. Primer analyzer:
   - 6511 refresh candidates.
   - 1017 omitidos por same price fields.
   - Problema detectado: el analyzer omitió casos como Mixtape aunque tenían PS Plus deal.

4. Import detail URL por URL:
   - Primer pase:
     - Seen: 6511
     - Updated: 6502
     - Failed: 9
   - Segundo pase de omitidos:
     - Seen: 1017
     - Updated: 1013
     - Failed: 4

Total:
- 7515 de 7528 URLs actualizadas desde PSDeals detail.
- 13 URLs fallidas totales.

Problema Metacritic detectado:
- Metacritic jamás se recoge desde PSDeals.
- Metacritic pertenece a su propio collector/backfill.
- El importador de detalles de PSDeals estaba escribiendo:
  - metacritic_score: null
  - metacritic_user_score: null
  - metacritic_reviews_count: null
- Eso pudo pisar scores ya existentes durante imports masivos.
- Se restauraron scores desde backup previo:
  - recoverable_metacritic_scores: 1286
  - active_deals_with_metacritic después de restaurar: 1270

Corrección aplicada:
- Commit:
  12bf932 Preserve Metacritic scores during PSDeals imports
- Archivo:
  scripts/import-psdeals-detail-local.mjs
- Cambio:
  El importador PSDeals ya no escribe campos Metacritic.
- Regla:
  PSDeals importer puede actualizar pricing, PS Plus, deal_ends_at, history, store data y relaciones, pero no debe tocar campos Metacritic.

refresh_catalog_public_cache_v15:
- Se convirtió a lógica PSDeals-only.
- Ya no depende de official_ps_store_deals para publicar deals.
- Resultado validado:
  select public.refresh_catalog_public_cache_v15();
  devolvió:
  (32437,7227,3053,0)
- La función vuelve a ser segura de ejecutar.

Protecciones vigentes:
- No publicar deals expirados.
- No publicar descuentos >= 100%.
- No publicar original_price_amount absurdamente alto:
  original_price_amount <= current_price_amount * 20
- best_price_amount siempre no-null.
- Monthly PS Plus games se mantienen separados de deals.

Pendientes:
1. Corregir analyzer para no omitir URLs con discount_percent > 0.
2. Reintentar las 13 URLs fallidas.
3. Diseñar flujo rápido para no abrir miles de URLs en cada refresh.
4. Documentar estrategia futura:
   - listing como fuente rápida.
   - detail solo para nuevos, cambios, PS Plus, faltantes o casos dudosos.

## Addendum — Retry failed PSDeals detail URLs — 2026-05-14

Se reintentaron las 13 URLs fallidas del refresh masivo de PSDeals discounts.

Resultado:
- Seen: 13
- Inserted: 0
- Updated: 13
- Failed: 0

Log:
- data\import\psdeals-discounts-failed-retry-2026-05-14-00-05-00.log

Después del retry se ejecutó refresh_catalog_public_cache_v15().

Resultado:
- refresh_catalog_public_cache_v15:
  (32437,7236,3049,0)

Validación final:
- total_rows: 32437
- active_regular_deals: 7236
- active_ps_plus_deals: 3049
- active_monthly_games: 3
- expired_deals_still_marked_active: 0
- deals_with_100_percent_or_more: 0
- null_best_price_amount: 0

Estado:
- Las 7528 URLs de PSDeals discounts recolectadas el 2026-05-13 quedaron cubiertas.
- Los 13 fallos iniciales fueron recuperados.
- refresh_catalog_public_cache_v15() sigue seguro y estable en modo PSDeals-only.

Pendiente siguiente:
- Diseñar flujo rápido para no abrir miles de URLs en cada refresh.

## Addendum — PSDeals discounts fast refresh runner — 2026-05-14

Se creó el runner operativo para discounts fast refresh:

scripts/run-psdeals-edge-live-discounts-fast-refresh.ps1

Objetivo:
- Evitar abrir miles de URLs de PSDeals en cada refresh.
- Mantener cobertura segura de deals sin repetir el proceso completo de 7528 URLs.
- Usar listing completo + analyzer fast + detail selectivo + retry automático.

Flujo del runner:
1. Recolecta PSDeals discounts best-new-deals.
2. Ejecuta analyze-psdeals-discounts-fast-refresh-v1.mjs.
3. Genera:
   - combined refresh TXT
   - must refresh TXT
   - stale refresh TXT
   - skipped safe TXT
4. Importa los selected detail URLs vía Edge live.
5. Reintenta fallos una vez.
6. NO ejecuta refresh_catalog_public_cache_v15 desde PowerShell.
7. Imprime el SQL manual de Supabase para refrescar cache y validar counts.

Motivo del refresh manual:
- refresh_catalog_public_cache_v15 suele fallar desde PowerShell/Node por statement timeout/crash.
- En Supabase SQL Editor funciona correctamente con:
  set statement_timeout = '10min';
  select public.refresh_catalog_public_cache_v15();

Prueba real del 2026-05-14:
- PSDeals discounts listing:
  - 215 páginas procesadas.
  - 7497 unique items collected.
  - 0 failed pages.
- Fast analyzer:
  - Must refresh: 9
  - Stale selected: 500
  - Combined refresh total: 509
  - Skipped safe: 6988
- Import:
  - Seen: 509
  - Updated: 505
  - Failed: 4
- Retry:
  - Seen: 4
  - Updated: 4
  - Failed: 0
- Cache final:
  - refresh_catalog_public_cache_v15:
    (32456,7244,3054,0)
  - total_rows: 32456
  - active_regular_deals: 7244
  - active_ps_plus_deals: 3054
  - active_monthly_games: 3
  - expired_deals_still_marked_active: 0
  - deals_with_100_percent_or_more: 0
  - null_best_price_amount: 0

Comando operativo diario para discounts fast refresh:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos\lobodeals\scripts\run-psdeals-edge-live-discounts-fast-refresh.ps1" -Pages 1000 -StaleHours 24 -StaleLimit 500

Regla:
- El analyzer seguro que refresca todo se mantiene como fallback:
  scripts/analyze-psdeals-discounts-refresh-candidates-v2.mjs
- El analyzer fast será el flujo operativo normal:
  scripts/analyze-psdeals-discounts-fast-refresh-v1.mjs

Estado:
- Fast refresh operativo.
- Runner listo.
- Producción validada.

## Addendum — Recently-added runner hardened — 2026-05-14

Se endureció el runner operativo:

scripts/run-psdeals-edge-live-recently-added.ps1

Cambios:
- Get-EdgeEndpoint ahora intenta leer primero:
  http://127.0.0.1:9222/json/version
- Si falla, usa fallback:
  Microsoft\Edge\User Data\DevToolsActivePort
- El runner ya no ejecuta refresh_catalog_public_cache_v15 desde PowerShell/Node.
- Al final imprime el SQL manual para Supabase:
  set statement_timeout = '10min';
  select public.refresh_catalog_public_cache_v15();

Motivo:
- El refresh desde PowerShell/Node suele fallar por timeout/crash.
- En Supabase SQL Editor el refresh funciona correctamente.
- El fallback de Edge evita errores cuando /json/version responde 404 pero DevToolsActivePort sigue disponible.

Estado:
- Runner recently-added alineado con el runner discounts fast refresh.
- Ambos runners dejan el refresh de cache como paso manual en Supabase.
- Ambos forman parte del flujo operativo diario.

Comandos diarios actuales:

1. Recently-added:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos\lobodeals\scripts\run-psdeals-edge-live-recently-added.ps1" -Pages 8

2. Discounts fast refresh:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos\lobodeals\scripts\run-psdeals-edge-live-discounts-fast-refresh.ps1" -Pages 1000 -StaleHours 24 -StaleLimit 500

3. Supabase manual refresh:
set statement_timeout = '10min';
select public.refresh_catalog_public_cache_v15();

4. Supabase validation:
validar total_rows, active_regular_deals, active_ps_plus_deals, active_monthly_games, expired_deals_still_marked_active, deals_with_100_percent_or_more y null_best_price_amount.
