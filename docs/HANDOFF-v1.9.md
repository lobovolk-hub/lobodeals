# HANDOFF v1.9 â€” LoboDeals â€” 2026-05-11

## 1. InstrucciÃ³n inicial para ADA / nuevo chat

EstÃ¡s continuando el proyecto LoboDeals 1.9.

Trabaja en espaÃ±ol con el usuario, pero la UI pÃºblica de LoboDeals debe mantenerse en inglÃ©s.

Antes de pedir informaciÃ³n, proponer pasos o asumir algo, verifica si ya estÃ¡ documentado en estos archivos:

- docs/STATUS-v1.9.md
- docs/SYSTEM-MAP-v1.9.md
- docs/DB-SNAPSHOT-v1.9.md
- docs/OPERATIONS-v1.9.md
- docs/ROADMAP-v1.9.md
- docs/HANDOFF-v1.9.md
- docs/NEW-CHAT-PROMPT-v1.9.md

Regla crÃ­tica:

No usar ZIP 1.8 como fuente de verdad. El ZIP 1.8 estÃ¡ muerto/obsoleto.

Fuente de verdad actual:

- Proyecto local limpio post LoboDeals 1.9.
- GitHub main despuÃ©s del push final.
- Vercel producciÃ³n.
- Supabase snapshot post limpieza.
- docs/audit-v1.9 como evidencia.
- Documentos v1.9.

## 2. Contexto general

LoboDeals es una web tipo JustWatch pero para videojuegos, enfocada actualmente en PlayStation US.

Objetivo:

- Superar la experiencia de PSDeals.
- Tener catÃ¡logo, deals, bÃºsqueda, tracking, slugs pÃºblicos y futura inteligencia de precios.
- Mantener una base escalable para futuras regiones, Xbox, Nintendo y apps mÃ³viles.

Ruta pÃºblica principal:

    /us/playstation/[slug]

Dominio pÃºblico:

    https://lobodeals.com

La web ya estÃ¡ viva y revisada visualmente en PC y mÃ³vil.

## 3. Estado actual resumido

LoboDeals 1.9 es una etapa de:

    cleanup + documentaciÃ³n + handoff + preparaciÃ³n de Search Console / launch soft

Ya estÃ¡ listo:

- Deploy pÃºblico.
- GitHub main conectado a Vercel.
- Dominio lobodeals.com activo.
- www redirige a lobodeals.com.
- Mobile y PC visualmente perfectos.
- Home, Catalog, Deals, Login, Profile, Tracked y Slugs revisados.
- Build post-cleanup validado.
- Limpieza local hecha.
- Supabase revisado.
- Metacritic queue corregida.
- Worker clasificado como legacy/reference.
- Task Scheduler limpiado.
- DocumentaciÃ³n vieja eliminada.
- DocumentaciÃ³n 1.9 en creaciÃ³n.

Pendiente inmediato:

- Terminar HANDOFF-v1.9.md.
- Crear NEW-CHAT-PROMPT-v1.9.md.
- Validar documentos.
- Decidir si docs finales v1.9 se versionan en Git.
- Search Console.
- Launch soft.

## 4. Rutas y pÃ¡ginas activas

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

Build validado con Next.js 16.2.4.

Comando:

    npm run build

## 5. Estado UX / visual

El usuario confirmÃ³ que mÃ³vil y PC estÃ¡n perfectos post-deploy.

Cerrado visualmente:

- Header desktop.
- Header mobile.
- Search en header.
- MenÃº mobile.
- Home.
- Carrusel principal.
- Catalog.
- Deals.
- Profile.
- Login.
- Tracked.
- Slug pages.
- Cards.
- Filtros desplegables.
- Cierre de dropdowns al tocar fuera.
- Grid mÃ³vil de 2 columnas.

No proponer mÃ¡s cambios visuales antes del launch salvo que el usuario detecte un bug.

## 6. Tech stack

Frontend:

- Next.js App Router.
- TypeScript.
- Supabase JS.
- CSS/Tailwind-style utility classes segÃºn proyecto.
- Vercel hosting.

Backend/data:

- Supabase Postgres.
- Supabase Auth.
- RPCs.
- RLS.
- Scripts Node/PowerShell locales.

AutomatizaciÃ³n local:

- Windows Task Scheduler para Metacritic Weekly 14d.

Fuentes:

- PSDeals.
- PlayStation Store oficial.
- Metacritic.

Infraestructura:

- GitHub.
- Vercel.
- Supabase.
- Porkbun.
- Google Cloud OAuth.
- Cloudflare Worker legacy/reference.

## 7. Proyecto local

Ruta principal:

    D:\Proyectos\lobodeals

Worker separado:

    D:\Proyectos\worker-playstation-ingest

Backup local creado en cleanup:

    D:\Proyectos\lobodeals-local-archive\browser-profiles-legacy-2026-05-11

## 8. GitHub

Repo:

    https://github.com/lobovolk-hub/lobodeals

Rama de producciÃ³n:

    main

Backup histÃ³rico Steam:

    steam-legacy-backup

Flujo normal:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel despliega automÃ¡ticamente desde GitHub main.

No usar vercel --prod como flujo normal.

## 9. Vercel

Proyecto:

    lobodeals

Dominios:

- lobodeals.com
- www.lobodeals.com
- lobodeals.vercel.app

Estado deseado:

- lobodeals.com dominio principal.
- www redirige a lobodeals.com.
- deploy automÃ¡tico desde main.

Variables conocidas:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- NEXT_PUBLIC_SITE_URL

No revelar valores.

## 10. Porkbun / dominio

Dominio comprado en Porkbun:

    lobodeals.com

Vercel gestiona el dominio en producciÃ³n.

No tocar DNS sin revisar Vercel Domains y documentar.

## 11. Google OAuth / Supabase Auth

Supabase Auth estÃ¡ activo con:

- Email/password.
- Login por email o username.
- Google OAuth.
- ConfirmaciÃ³n de email.
- Callback /auth/callback.

Google OAuth ya funcionÃ³ en producciÃ³n.

Nota UX:

Si el usuario ya tiene sesiÃ³n Google en el navegador, Google puede iniciar directo sin mostrar consentimiento completo. En incÃ³gnito suele pedir login/consentimiento.

En Create account with Google, mantener nota tipo:

    If you already have an account created with Google, we'll log you in.

No usar callback del Supabase viejo del proyecto Steam.

## 12. Supabase snapshot

Snapshot 1.9:

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

## 13. ClasificaciÃ³n Supabase

Runtime pÃºblico, no tocar:

- catalog_public_cache.
- profiles.
- user_tracked_items.
- search_catalog_public_cache.
- RPCs de auth/profile/tracking.

CatÃ¡logo/pricing/historial, no tocar:

- psdeals_stage_items.
- psdeals_stage_price_history.
- psdeals_stage_relations.
- psdeals_import_runs.
- official_ps_store_deals.
- refresh_catalog_public_cache_v15.

OperaciÃ³n/auditorÃ­a, mantener:

- metacritic_queue.
- automation_runs.

Legacy PlayStation Store, mantener estructura:

- ps_ingest_queue.
- price_offer_queue.
- ps_discovery_progress.
- worker-playstation-ingest.

No dropear tablas ahora.

## 14. Pricing/deals â€” contexto crÃ­tico

Este punto es crÃ­tico.

PSDeals sigue siendo fuente principal histÃ³rica para:

- catÃ¡logo.
- precios.
- historial.
- relaciones.
- slugs.
- imÃ¡genes.
- metadata base.

Pero los deals pÃºblicos actuales no deben publicarse ciegamente desde PSDeals.

PlayStation Store oficial se usa como allowlist/validaciÃ³n para deals actuales.

Motivo:

En mayo 2026 PlayStation Store mostrÃ³ nuevos precios base y PSDeals/PSPrices podÃ­an mostrar esos precios como descuentos. LoboDeals corrigiÃ³ esto para no mostrar falsos deals.

Estado actual:

- official_ps_store_deals tiene 44 rows.
- catalog_public_cache publica 41 deals oficiales matcheados.
- official-only no matcheados se ignoran por ahora.
- TEKKEN 8, Red Dead Redemption 2 y otros casos no deben mostrar falso descuento si PlayStation Store los muestra como precio base.
- PlanetSide 2 Nanite Systems Starter Bundle quedÃ³ corregido como PS+ $9.99, original $19.99, 50%.

No revertir esta lÃ³gica sin revisar auditorÃ­a crÃ­tica de mayo 2026.

## 15. Refresh cache

FunciÃ³n crÃ­tica:

    refresh_catalog_public_cache_v15

Comando SQL:

    select public.refresh_catalog_public_cache_v15();

Ejecutar despuÃ©s de cambios relevantes en:

- psdeals_stage_items.
- psdeals_stage_price_history.
- official_ps_store_deals.
- lÃ³gica de pricing/deals.

No modificar sin revisar:

- PS Plus deal logic.
- official_ps_store_deals.
- falsos descuentos.
- slugs.
- image fallback.
- current_price_amount.
- best_price_amount.
- best_price_type.

## 16. PSDeals

Scripts relevantes:

- scripts/collect-psdeals-listing-edge-live-cdp.mjs
- scripts/import-psdeals-detail-local.mjs
- scripts/run-psdeals-edge-live-recently-added.ps1
- scripts/reconcile-psdeals-detail-batch.mjs
- scripts/analyze-psdeals-listing-new-v2.mjs
- scripts/analyze-psdeals-discounts-refresh-candidates-v2.mjs
- scripts/refresh-catalog-public-cache-v15.mjs

Estado:

PSDeals Recently Added 12h fue eliminado del Task Scheduler. No estÃ¡ activo.

Regla:

No automatizar PSDeals a ciegas hasta definir estrategia estable contra challenge/captcha.

Future operations:

- Recently added debe cubrir novedades + upcoming.
- Discounts debe revisarse con cuidado.
- Validar outputs antes de importar masivo.
- Guardar outputs estructurados en data/import.
- No depender de HTML si hay challenge/captcha.

## 17. PlayStation Store oficial

Uso actual:

- ValidaciÃ³n de deals.
- PS Plus official deals.
- Allowlist contra falsos descuentos.

Script:

- scripts/collect-psstore-official-deals-edge-live.mjs

Nota importante:

El collector oficial puede requerir sesiÃ³n/login para ver precios originales/descuentos correctamente. Sin login puede capturar 0 o informaciÃ³n incompleta.

No usar PlayStation Store como fuente principal de catÃ¡logo ahora, porque la etapa original tuvo timeouts y HTML errÃ¡tico.

## 18. Metacritic

Solo interesa:

- metacritic_score.

No priorizar:

- metacritic_user_score.
- metacritic_reviews_count.

AutomatizaciÃ³n activa:

    LoboDeals - Metacritic Weekly 14d

Ejecuta:

    D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1

Task Scheduler actual:

- Activa: LoboDeals - Metacritic Weekly 14d.
- Eliminada: LoboDeals - Metacritic Monthly.
- Eliminada: LoboDeals - PSDeals Recently Added 12h.

Scripts:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-score-v2.mjs

Metacritic queue post cleanup:

    manual_review = 373
    pending attempts 0 = 11797
    pending attempts 1 = 211
    processing = 0

CorrecciÃ³n realizada:

- 211 stale locks en processing.
- locked_by node_local_metacritic_browse.
- reset a pending.
- no DELETE.
- manual_review intacto.

## 19. Worker legacy

Ruta:

    D:\Proyectos\worker-playstation-ingest

Cloudflare Worker:

    lobodeals-playstation-ingest

ClasificaciÃ³n:

    Legacy/reference

No es flujo principal actual.

Tiene:

- src/index.ts.
- wrangler.jsonc.
- .dev.vars.
- package.json.

wrangler.jsonc:

- triggers.crons vacÃ­o.
- no cron activo.

Variables .dev.vars:

- SUPABASE_URL.
- SUPABASE_SECRET_KEY.
- INGEST_LIMIT.

No compartir .dev.vars.

Uso histÃ³rico:

- ps_ingest_queue.
- automation_runs.
- fetch(row.store_url).
- PlayStation queue collector worker.

Posible utilidad futura:

- checks de disponibilidad.
- juegos eliminados de tienda.
- validaciones puntuales de store_url.

## 20. Limpieza local realizada

Se limpiÃ³:

- logs/psdeals-import-html.
- logs/psdeals-listing-html.
- .next.
- .browser-profiles movido fuera del proyecto.
- Task Scheduler desactivados eliminados.
- documentaciÃ³n vieja v1/v1.6/v1.7 eliminada.

Se mantuvo:

- data/import.
- logs pequeÃ±os.
- scripts.
- sql.
- app.
- components.
- lib.
- public.
- node_modules.
- docs/audit-v1.9.
- worker-playstation-ingest.

TamaÃ±o post-cleanup antes de regenerar .next:

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

## 21. DocumentaciÃ³n vieja

Se borrÃ³:

- docs/DB-SNAPSHOT-v1.7.md.
- docs/HANDOFF-v1.7.md.
- docs/NEW-CHAT-MESSAGE-v1.7.md.
- docs/OPERATIONS-v1.7.md.
- docs/ROADMAP-v1.7.md.
- docs/STATUS-v1.7.md.
- docs/SYSTEM-MAP-v1.7.md.
- docs/archive/pre-v1.7/.

Se extrajeron referencias Ãºtiles antes de borrar:

    docs/audit-v1.9/legacy-docs-useful-references-before-delete.csv

Se mantiene:

    docs/audit-v1.9

## 22. DocumentaciÃ³n 1.9

Documentos esperados:

- docs/STATUS-v1.9.md
- docs/SYSTEM-MAP-v1.9.md
- docs/DB-SNAPSHOT-v1.9.md
- docs/OPERATIONS-v1.9.md
- docs/ROADMAP-v1.9.md
- docs/HANDOFF-v1.9.md
- docs/NEW-CHAT-PROMPT-v1.9.md

Actualmente creados antes de este handoff:

- STATUS-v1.9.md
- SYSTEM-MAP-v1.9.md
- DB-SNAPSHOT-v1.9.md
- OPERATIONS-v1.9.md
- ROADMAP-v1.9.md

Este archivo:

- HANDOFF-v1.9.md

Pendiente:

- NEW-CHAT-PROMPT-v1.9.md

## 23. Componentes importantes

- components/site-shell.tsx
- components/home-featured-carousel.tsx
- components/home-search-bar.tsx
- components/item-card.tsx
- components/track-button.tsx
- components/price-history-chart.tsx
- components/fallback-game-image.tsx
- components/details-auto-close.tsx

Notas:

- ItemCard debe mantenerse consistente entre Home, Catalog, Deals y Tracked.
- Track/Tracked vive dentro de ItemCard.
- DetailsAutoClose permite cerrar dropdowns al tocar fuera.

## 24. Rutas importantes

- app/page.tsx
- app/catalog/page.tsx
- app/deals/page.tsx
- app/login/page.tsx
- app/login/login-client.tsx
- app/profile/page.tsx
- app/profile/profile-client.tsx
- app/tracked/page.tsx
- app/auth/callback/route.ts
- app/us/playstation/[slug]/page.tsx
- app/sitemap.ts
- app/robots.ts o robots route equivalente si aplica
- app/layout.tsx

## 25. Auth/profile/tracked

Login:

- email + password.
- username + password.
- Google OAuth.
- forgot username.
- forgot password.
- create account.

Profile:

- Welcome.
- avatar gallery PNG.
- display name.
- username.
- birthday.
- password update.
- Google connected status.

Tracked:

- lista juegos trackeados.
- futuro: separar Currently on deal y Regular prices.

Reglas:

- login_username mÃ¡ximo 12 caracteres.
- password 8 a 12 caracteres con 1 nÃºmero y 1 mayÃºscula.
- cambio de username cada 30 dÃ­as.
- avatar desde public/avatars con PNG.

## 26. SEO/Search Console

SEO bÃ¡sico listo:

- robots.txt.
- sitemap.xml.
- canonical sin www.
- metadata base.
- metadata dinÃ¡mica de slugs.

Pendiente:

- Google Search Console.
- Enviar sitemap.
- Solicitar indexaciÃ³n de:
  - /
  - /catalog
  - /deals
  - slugs clave.
- Revisar snippets viejos de Steam si aparecen.

## 27. PrÃ³ximo camino recomendado

DespuÃ©s de cerrar documentaciÃ³n:

1. Crear NEW-CHAT-PROMPT-v1.9.md.
2. Validar lista final de docs.
3. Decidir si docs finales v1.9 entran a Git o quedan locales.
4. git status.
5. Commit/push si corresponde.
6. Search Console.
7. Launch soft.
8. Monitoreo post-launch.

## 28. Roadmap futuro

Pendientes futuros:

- Search Console.
- Launch soft.
- /tracked dividido en Currently on deal y Regular prices.
- PS Plus Monthly Games.
- Google Ads layout.
- AutomatizaciÃ³n estable de PSDeals.
- Checks de disponibilidad/store_url.
- Juegos removidos de PlayStation Store.
- Historical low / price intelligence.
- Multi-region.
- Xbox.
- Nintendo.
- Apps mÃ³viles.

No abrir mejoras grandes antes de Search Console + launch soft.

## 29. Reglas de trabajo

Reglas obligatorias:

- Indicar apartado exacto del roadmap.
- Marcar Listo al cerrar apartados.
- Validar lÃ­nea por lÃ­nea en cambios crÃ­ticos.
- No priorizar rapidez sobre verificaciÃ³n.
- No pedir informaciÃ³n ya entregada.
- No usar ZIP viejo si hubo cambios por chat/Git/deploy.
- ZIP 1.8 muerto/obsoleto.
- Fuente de verdad: local/Git/deploy post limpieza 1.9.
- No borrar data/scripts/tablas sin inventario.
- No automatizar PSDeals a ciegas.
- UI pÃºblica en inglÃ©s.
- ConversaciÃ³n con usuario en espaÃ±ol.
- Entregar archivo completo si hay mÃ¡s de 4 cambios o riesgo de mezcla.
- No cambiar lÃ³gica de deals sin comparar PlayStation Store oficial.
- No ocultar add-ons por tÃ­tulo sin confirmar error real en PlayStation Store.

## 30. QuÃ© no hacer

No hacer:

- No usar documentaciÃ³n v1.7.
- No usar ZIP 1.8.
- No tratar worker como flujo principal.
- No reactivar PSDeals Recently Added 12h sin revisiÃ³n.
- No borrar metacritic_queue manual_review.
- No borrar data/import.
- No publicar secrets.
- No hacer deploy manual vercel --prod como rutina.
- No cambiar Home a PS Plus branding solo porque actualmente haya deals PS Plus.
- No ocultar add-ons por tÃ©rminos genÃ©ricos.
- No revertir official_ps_store_deals allowlist.

## 31. Estado final del handoff

Este handoff representa LoboDeals 1.9 despuÃ©s de:

- deploy pÃºblico.
- revisiÃ³n visual PC/mÃ³vil.
- limpieza local.
- revisiÃ³n worker.
- limpieza Task Scheduler.
- revisiÃ³n Supabase.
- correcciÃ³n Metacritic queue.
- eliminaciÃ³n docs viejos.
- creaciÃ³n docs 1.9.

Siguiente archivo a crear:

    docs/NEW-CHAT-PROMPT-v1.9.md

## Addendum â€” OAuth Google production redirect fix â€” 2026-05-11

DespuÃ©s de crear el handoff 1.9 se detectÃ³ y corrigiÃ³ un bug de OAuth Google.

SÃ­ntoma:
Desde lobodeals.com, Continue with Google mandaba al usuario a http://localhost:3000 despuÃ©s de seleccionar cuenta.

Causa:
Supabase Auth tenÃ­a Site URL = http://localhost:3000.

CorrecciÃ³n:
Supabase Auth Site URL quedÃ³ en:
    https://lobodeals.com

Redirect URLs configuradas:
    https://lobodeals.com/auth/callback
    https://www.lobodeals.com/auth/callback
    https://lobodeals.vercel.app/auth/callback
    http://localhost:3000/auth/callback
    https://lobodeals.com/auth/callback**
    https://www.lobodeals.com/auth/callback**
    https://lobodeals.vercel.app/auth/callback**
    http://localhost:3000/auth/callback**

ValidaciÃ³n:
ProducciÃ³n y local quedaron funcionando correctamente.

Nota:
No tocar login-client.tsx por este bug. El cÃ³digo estaba correcto; el problema era configuraciÃ³n de Supabase.

## Addendum â€” Analytics, GTM, Search Console and sitemap â€” 2026-05-12

Se completÃ³ la configuraciÃ³n de Analytics/Search Console para LoboDeals.

Search Console:
- Propiedad de dominio: lobodeals.com
- Sitemap activo: https://lobodeals.com/sitemap.xml
- Sitemap viejo con www eliminado
- Sitemap actual leÃ­do correctamente con 32,415 pÃ¡ginas descubiertas

Sitemap:
- app/sitemap.ts fue ajustado para paginar catalog_public_cache y superar el lÃ­mite prÃ¡ctico de ~1,000 filas por request.
- El sitemap actual incluye rutas estÃ¡ticas principales y slugs PlayStation.
- Search Console confirmÃ³ 32,415 pÃ¡ginas descubiertas.

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

VinculaciÃ³n GA4/Search Console:
- VinculaciÃ³n creada entre sc-domain:lobodeals.com y LoboDeals web - GA4.

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
