# HANDOFF v1.9 — LoboDeals — 2026-05-11

## 1. Instrucción inicial para ADA / nuevo chat

Estás continuando el proyecto LoboDeals 1.9.

Trabaja en español con el usuario, pero la UI pública de LoboDeals debe mantenerse en inglés.

Antes de pedir información, proponer pasos o asumir algo, verifica si ya está documentado en estos archivos:

- docs/STATUS-v1.9.md
- docs/SYSTEM-MAP-v1.9.md
- docs/DB-SNAPSHOT-v1.9.md
- docs/OPERATIONS-v1.9.md
- docs/ROADMAP-v1.9.md
- docs/HANDOFF-v1.9.md
- docs/NEW-CHAT-PROMPT-v1.9.md

Regla crítica:

No usar ZIP 1.8 como fuente de verdad. El ZIP 1.8 está muerto/obsoleto.

Fuente de verdad actual:

- Proyecto local limpio post LoboDeals 1.9.
- GitHub main después del push final.
- Vercel producción.
- Supabase snapshot post limpieza.
- docs/audit-v1.9 como evidencia.
- Documentos v1.9.

## 2. Contexto general

LoboDeals es una web tipo JustWatch pero para videojuegos, enfocada actualmente en PlayStation US.

Objetivo:

- Superar la experiencia de PSDeals.
- Tener catálogo, deals, búsqueda, tracking, slugs públicos y futura inteligencia de precios.
- Mantener una base escalable para futuras regiones, Xbox, Nintendo y apps móviles.

Ruta pública principal:

    /us/playstation/[slug]

Dominio público:

    https://lobodeals.com

La web ya está viva y revisada visualmente en PC y móvil.

## 3. Estado actual resumido

LoboDeals 1.9 es una etapa de:

    cleanup + documentación + handoff + preparación de Search Console / launch soft

Ya está listo:

- Deploy público.
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
- Documentación vieja eliminada.
- Documentación 1.9 en creación.

Pendiente inmediato:

- Terminar HANDOFF-v1.9.md.
- Crear NEW-CHAT-PROMPT-v1.9.md.
- Validar documentos.
- Decidir si docs finales v1.9 se versionan en Git.
- Search Console.
- Launch soft.

## 4. Rutas y páginas activas

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

El usuario confirmó que móvil y PC están perfectos post-deploy.

Cerrado visualmente:

- Header desktop.
- Header mobile.
- Search en header.
- Menú mobile.
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
- Grid móvil de 2 columnas.

No proponer más cambios visuales antes del launch salvo que el usuario detecte un bug.

## 6. Tech stack

Frontend:

- Next.js App Router.
- TypeScript.
- Supabase JS.
- CSS/Tailwind-style utility classes según proyecto.
- Vercel hosting.

Backend/data:

- Supabase Postgres.
- Supabase Auth.
- RPCs.
- RLS.
- Scripts Node/PowerShell locales.

Automatización local:

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

Rama de producción:

    main

Backup histórico Steam:

    steam-legacy-backup

Flujo normal:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel despliega automáticamente desde GitHub main.

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
- deploy automático desde main.

Variables conocidas:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- NEXT_PUBLIC_SITE_URL

No revelar valores.

## 10. Porkbun / dominio

Dominio comprado en Porkbun:

    lobodeals.com

Vercel gestiona el dominio en producción.

No tocar DNS sin revisar Vercel Domains y documentar.

## 11. Google OAuth / Supabase Auth

Supabase Auth está activo con:

- Email/password.
- Login por email o username.
- Google OAuth.
- Confirmación de email.
- Callback /auth/callback.

Google OAuth ya funcionó en producción.

Nota UX:

Si el usuario ya tiene sesión Google en el navegador, Google puede iniciar directo sin mostrar consentimiento completo. En incógnito suele pedir login/consentimiento.

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

## 13. Clasificación Supabase

Runtime público, no tocar:

- catalog_public_cache.
- profiles.
- user_tracked_items.
- search_catalog_public_cache.
- RPCs de auth/profile/tracking.

Catálogo/pricing/historial, no tocar:

- psdeals_stage_items.
- psdeals_stage_price_history.
- psdeals_stage_relations.
- psdeals_import_runs.
- official_ps_store_deals.
- refresh_catalog_public_cache_v15.

Operación/auditoría, mantener:

- metacritic_queue.
- automation_runs.

Legacy PlayStation Store, mantener estructura:

- ps_ingest_queue.
- price_offer_queue.
- ps_discovery_progress.
- worker-playstation-ingest.

No dropear tablas ahora.

## 14. Pricing/deals — contexto crítico

Este punto es crítico.

PSDeals sigue siendo fuente principal histórica para:

- catálogo.
- precios.
- historial.
- relaciones.
- slugs.
- imágenes.
- metadata base.

Pero los deals públicos actuales no deben publicarse ciegamente desde PSDeals.

PlayStation Store oficial se usa como allowlist/validación para deals actuales.

Motivo:

En mayo 2026 PlayStation Store mostró nuevos precios base y PSDeals/PSPrices podían mostrar esos precios como descuentos. LoboDeals corrigió esto para no mostrar falsos deals.

Estado actual:

- official_ps_store_deals tiene 44 rows.
- catalog_public_cache publica 41 deals oficiales matcheados.
- official-only no matcheados se ignoran por ahora.
- TEKKEN 8, Red Dead Redemption 2 y otros casos no deben mostrar falso descuento si PlayStation Store los muestra como precio base.
- PlanetSide 2 Nanite Systems Starter Bundle quedó corregido como PS+ $9.99, original $19.99, 50%.

No revertir esta lógica sin revisar auditoría crítica de mayo 2026.

## 15. Refresh cache

Función crítica:

    refresh_catalog_public_cache_v15

Comando SQL:

    select public.refresh_catalog_public_cache_v15();

Ejecutar después de cambios relevantes en:

- psdeals_stage_items.
- psdeals_stage_price_history.
- official_ps_store_deals.
- lógica de pricing/deals.

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

PSDeals Recently Added 12h fue eliminado del Task Scheduler. No está activo.

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

- Validación de deals.
- PS Plus official deals.
- Allowlist contra falsos descuentos.

Script:

- scripts/collect-psstore-official-deals-edge-live.mjs

Nota importante:

El collector oficial puede requerir sesión/login para ver precios originales/descuentos correctamente. Sin login puede capturar 0 o información incompleta.

No usar PlayStation Store como fuente principal de catálogo ahora, porque la etapa original tuvo timeouts y HTML errático.

## 18. Metacritic

Solo interesa:

- metacritic_score.

No priorizar:

- metacritic_user_score.
- metacritic_reviews_count.

Automatización activa:

    LoboDeals - Metacritic Weekly 14d

Ejecuta:

    D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1

Task Scheduler actual:

- Activa: LoboDeals - Metacritic Weekly 14d.
- Eliminada: LoboDeals - Metacritic Monthly.
- Eliminada: LoboDeals - PSDeals Recently Added 12h.

Scripts:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-local.mjs
- scripts/backfill-metacritic-score-v2.mjs
- scripts/metacritic-monthly-reseed.mjs

Metacritic queue post cleanup:

    manual_review = 373
    pending attempts 0 = 11797
    pending attempts 1 = 211
    processing = 0

Corrección realizada:

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

Clasificación:

    Legacy/reference

No es flujo principal actual.

Tiene:

- src/index.ts.
- wrangler.jsonc.
- .dev.vars.
- package.json.

wrangler.jsonc:

- triggers.crons vacío.
- no cron activo.

Variables .dev.vars:

- SUPABASE_URL.
- SUPABASE_SECRET_KEY.
- INGEST_LIMIT.

No compartir .dev.vars.

Uso histórico:

- ps_ingest_queue.
- automation_runs.
- fetch(row.store_url).
- PlayStation queue collector worker.

Posible utilidad futura:

- checks de disponibilidad.
- juegos eliminados de tienda.
- validaciones puntuales de store_url.

## 20. Limpieza local realizada

Se limpió:

- logs/psdeals-import-html.
- logs/psdeals-listing-html.
- .next.
- .browser-profiles movido fuera del proyecto.
- Task Scheduler desactivados eliminados.
- documentación vieja v1/v1.6/v1.7 eliminada.

Se mantuvo:

- data/import.
- logs pequeños.
- scripts.
- sql.
- app.
- components.
- lib.
- public.
- node_modules.
- docs/audit-v1.9.
- worker-playstation-ingest.

Tamaño post-cleanup antes de regenerar .next:

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

## 21. Documentación vieja

Se borró:

- docs/DB-SNAPSHOT-v1.7.md.
- docs/HANDOFF-v1.7.md.
- docs/NEW-CHAT-MESSAGE-v1.7.md.
- docs/OPERATIONS-v1.7.md.
- docs/ROADMAP-v1.7.md.
- docs/STATUS-v1.7.md.
- docs/SYSTEM-MAP-v1.7.md.
- docs/archive/pre-v1.7/.

Se extrajeron referencias útiles antes de borrar:

    docs/audit-v1.9/legacy-docs-useful-references-before-delete.csv

Se mantiene:

    docs/audit-v1.9

## 22. Documentación 1.9

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

- login_username máximo 12 caracteres.
- password 8 a 12 caracteres con 1 número y 1 mayúscula.
- cambio de username cada 30 días.
- avatar desde public/avatars con PNG.

## 26. SEO/Search Console

SEO básico listo:

- robots.txt.
- sitemap.xml.
- canonical sin www.
- metadata base.
- metadata dinámica de slugs.

Pendiente:

- Google Search Console.
- Enviar sitemap.
- Solicitar indexación de:
  - /
  - /catalog
  - /deals
  - slugs clave.
- Revisar snippets viejos de Steam si aparecen.

## 27. Próximo camino recomendado

Después de cerrar documentación:

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
- Automatización estable de PSDeals.
- Checks de disponibilidad/store_url.
- Juegos removidos de PlayStation Store.
- Historical low / price intelligence.
- Multi-region.
- Xbox.
- Nintendo.
- Apps móviles.

No abrir mejoras grandes antes de Search Console + launch soft.

## 29. Reglas de trabajo

Reglas obligatorias:

- Indicar apartado exacto del roadmap.
- Marcar Listo al cerrar apartados.
- Validar línea por línea en cambios críticos.
- No priorizar rapidez sobre verificación.
- No pedir información ya entregada.
- No usar ZIP viejo si hubo cambios por chat/Git/deploy.
- ZIP 1.8 muerto/obsoleto.
- Fuente de verdad: local/Git/deploy post limpieza 1.9.
- No borrar data/scripts/tablas sin inventario.
- No automatizar PSDeals a ciegas.
- UI pública en inglés.
- Conversación con usuario en español.
- Entregar archivo completo si hay más de 4 cambios o riesgo de mezcla.
- No cambiar lógica de deals sin comparar PlayStation Store oficial.
- No ocultar add-ons por título sin confirmar error real en PlayStation Store.

## 30. Qué no hacer

No hacer:

- No usar documentación v1.7.
- No usar ZIP 1.8.
- No tratar worker como flujo principal.
- No reactivar PSDeals Recently Added 12h sin revisión.
- No borrar metacritic_queue manual_review.
- No borrar data/import.
- No publicar secrets.
- No hacer deploy manual vercel --prod como rutina.
- No cambiar Home a PS Plus branding solo porque actualmente haya deals PS Plus.
- No ocultar add-ons por términos genéricos.
- No revertir official_ps_store_deals allowlist.

## 31. Estado final del handoff

Este handoff representa LoboDeals 1.9 después de:

- deploy público.
- revisión visual PC/móvil.
- limpieza local.
- revisión worker.
- limpieza Task Scheduler.
- revisión Supabase.
- corrección Metacritic queue.
- eliminación docs viejos.
- creación docs 1.9.

Siguiente archivo a crear:

    docs/NEW-CHAT-PROMPT-v1.9.md

## Addendum — OAuth Google production redirect fix — 2026-05-11

Después de crear el handoff 1.9 se detectó y corrigió un bug de OAuth Google.

Síntoma:
Desde lobodeals.com, Continue with Google mandaba al usuario a http://localhost:3000 después de seleccionar cuenta.

Causa:
Supabase Auth tenía Site URL = http://localhost:3000.

Corrección:
Supabase Auth Site URL quedó en:
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

Validación:
Producción y local quedaron funcionando correctamente.

Nota:
No tocar login-client.tsx por este bug. El código estaba correcto; el problema era configuración de Supabase.

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
