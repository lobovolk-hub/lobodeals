# SYSTEM MAP v1.9 â€” LoboDeals â€” 2026-05-11

## 1. PropÃ³sito del sistema

LoboDeals es una web de seguimiento de precios, catÃ¡logo y ofertas de videojuegos, actualmente enfocada en PlayStation US.

Objetivo principal:

- Crear una experiencia mejor que PSDeals en UX.
- Permitir bÃºsqueda, catÃ¡logo, deals, tracking y slugs pÃºblicos.
- Preparar una base escalable para futuras regiones/plataformas.

La ruta pÃºblica principal de juego es:

    /us/playstation/[slug]

La UI pÃºblica debe mantenerse en inglÃ©s.

## 2. Arquitectura general

Componentes principales:

- Next.js app en D:\Proyectos\lobodeals
- Supabase como base de datos y Auth
- Vercel para hosting/deploy
- GitHub como repositorio fuente
- Porkbun como registrar/dominio
- Google Cloud OAuth para login con Google
- Windows Task Scheduler para automatizaciÃ³n local Metacritic
- Scripts locales Node/PowerShell para PSDeals, PlayStation Store y Metacritic
- Worker separado legacy en D:\Proyectos\worker-playstation-ingest

## 3. Hosting y deploy

Hosting:

- Vercel
- Proyecto: lobodeals

Dominios:

- lobodeals.com
- www.lobodeals.com
- lobodeals.vercel.app

ConfiguraciÃ³n deseada:

- lobodeals.com como dominio principal
- www.lobodeals.com redirige a lobodeals.com
- lobodeals.vercel.app sigue disponible como dominio Vercel

Deploy:

- GitHub repo: https://github.com/lobovolk-hub/lobodeals
- Rama activa: main
- Vercel estÃ¡ conectado al repo GitHub
- Cada push a main genera deploy automÃ¡tico

Comando normal de deploy:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

No usar deploy manual con vercel --prod salvo emergencia.

## 4. Proyecto local principal

Ruta local:

    D:\Proyectos\lobodeals

Carpetas principales:

- app: rutas App Router de Next.js
- components: componentes reutilizables
- lib: clientes Supabase
- public: assets pÃºblicos, logo, iconos, avatares
- scripts: scripts de ingesta, refresh, auditorÃ­a y Metacritic
- sql: schema/base SQL
- data/import: outputs estructurados de imports/auditorÃ­as
- logs: logs pequeÃ±os recientes conservados
- docs: documentaciÃ³n y auditorÃ­a 1.9

Carpetas ignoradas o no destinadas a Git/ZIP:

- node_modules
- .next
- data
- logs
- .vercel
- .env.local
- .browser-profiles
- archive
- docs, salvo que se decida versionar documentaciÃ³n final

Nota: en 1.9 se moviÃ³ .browser-profiles fuera del proyecto.

Backup local:

    D:\Proyectos\lobodeals-local-archive\browser-profiles-legacy-2026-05-11

## 5. Rutas Next.js

Rutas activas detectadas por build:

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
- /apple-icon.png
- /icon.png
- /_not-found

Todas compilan correctamente con:

    npm run build

## 6. Frontend y UX

PÃ¡ginas principales:

### Home

Ruta:

    /

Incluye:

- Header con bÃºsqueda
- Carrusel principal LoboDeals' choice
- Secciones de juegos/deals
- Cards con Track/Tracked integrado
- Redirecciones a catalog/deals segÃºn secciÃ³n

El buscador en header redirige a:

    /catalog?tab=all&letter=ALL&sort=title&q=...

### Catalog

Ruta:

    /catalog

Incluye:

- BÃºsqueda
- PaginaciÃ³n 36 items por pÃ¡gina
- Grid responsive
- Filtros desplegables:
  - Type
  - Category
  - Letters
- Ordenamientos:
  - Title
  - Top Rated by Metacritic
  - Upcoming Games
  - Latest Releases

Usa RPC:

    search_catalog_public_cache

### Deals

Ruta:

    /deals

Incluye:

- PaginaciÃ³n 36 items por pÃ¡gina
- Grid responsive
- Filtros desplegables:
  - Type
  - Category
  - Letters
- Ordenamientos:
  - Highest discounts
  - Top rated discounts
  - A-Z

Importante:

- Deals se basan en catalog_public_cache.
- Los deals pÃºblicos actuales estÃ¡n filtrados por la lÃ³gica de allowlist oficial de PlayStation Store.

### Slug page

Ruta:

    /us/playstation/[slug]

Incluye:

- Imagen principal
- Precio actual
- Precio original si corresponde
- PS Plus deal si corresponde
- Metacritic score si existe
- Publisher
- Release date
- Plataformas
- CTA a PlayStation Store
- Track/Tracked
- Price history chart
- Related content si existe

### Login

Ruta:

    /login

Incluye:

- Login por email o username
- Password
- Registro
- Google OAuth
- Mensajes diferenciados para Google login/create
- Forgot username/password

### Profile

Ruta:

    /profile

Incluye:

- Saludo al usuario
- Avatar seleccionado desde galerÃ­a local PNG
- Cambio de avatar
- Username
- Display name
- Birthday
- Password update
- Estado Google Connected

### Tracked

Ruta:

    /tracked

Incluye:

- Juegos trackeados por usuario autenticado
- Misma card visual que Home/Catalog/Deals
- Pendiente futuro: separar Currently on deal y Regular prices

## 7. Componentes principales

Componentes relevantes:

- components/site-shell.tsx
  Header, footer, navegaciÃ³n, mobile menu, search.

- components/home-featured-carousel.tsx
  Carrusel principal de Home.

- components/home-search-bar.tsx
  Buscador creado durante ajustes previos; revisar si sigue usado tras mover search al header.

- components/item-card.tsx
  Card principal reutilizada en Home, Catalog, Deals y Tracked.
  Track/Tracked vive dentro de la card.

- components/track-button.tsx
  BotÃ³n Track/Tracked con Supabase Auth/RPC.

- components/price-history-chart.tsx
  GrÃ¡fico de historial de precios.

- components/fallback-game-image.tsx
  Fallback visual para imÃ¡genes rotas.

- components/details-auto-close.tsx
  Cierra dropdowns details al hacer clic fuera o presionar Escape.

## 8. Supabase

Supabase cubre:

- Base de datos
- Auth
- OAuth Google
- RLS
- RPCs de bÃºsqueda, tracking, profile y cache

Variables necesarias:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY

No exponer SUPABASE_SECRET_KEY.

## 9. Tablas principales Supabase

Snapshot 1.9:

- catalog_public_cache: 32412
- psdeals_stage_items: 32412
- psdeals_stage_price_history: 785766
- psdeals_stage_relations: 41398
- official_ps_store_deals: 44
- metacritic_queue: 16473
- profiles: 1
- user_tracked_items: 9
- ps_ingest_queue: 0
- price_offer_queue: 0
- ps_discovery_progress: 4
- automation_runs: 1624

## 10. ClasificaciÃ³n de tablas

### Runtime pÃºblico

No tocar:

- catalog_public_cache
- profiles
- user_tracked_items

### Stage PSDeals / catÃ¡logo

No tocar:

- psdeals_stage_items
- psdeals_stage_price_history
- psdeals_stage_relations
- psdeals_import_runs

### Deals oficiales

No tocar:

- official_ps_store_deals

Esta tabla es crÃ­tica para evitar falsos descuentos.

### Metacritic

Mantener:

- metacritic_queue

Estado corregido en 1.9:

- processing: 0
- manual_review: 373
- pending attempts 0: 11797
- pending attempts 1: 211

### Legacy PlayStation Store

Mantener estructura, documentar como legacy:

- ps_ingest_queue
- price_offer_queue
- ps_discovery_progress
- automation_runs

No usarlas como flujo principal actual.

## 11. RPCs y funciones importantes

Funciones/RPCs conocidas:

- search_catalog_public_cache
- refresh_catalog_public_cache_v15
- is_login_username_available
- get_email_for_login_username
- track_user_item
- untrack_user_item
- is_user_tracking_item
- get_user_tracked_item_ids
- make_default_login_username
- normalize_candidate_login_username
- handle_new_auth_user

Funciones crÃ­ticas:

- search_catalog_public_cache:
  usada por /catalog y bÃºsqueda.

- refresh_catalog_public_cache_v15:
  reconstruye la capa pÃºblica desde stage/cache y aplica lÃ³gica de deals.

- track/untrack/is_user_tracking:
  soportan Track/Tracked.

## 12. Auth y perfiles

Supabase Auth soporta:

- Email/password
- Login por email o username
- OAuth Google
- ConfirmaciÃ³n de correo

Tabla profile:

- login_username
- login_username_normalized
- display_name
- avatar_path
- birthday

Reglas de usuario:

- username/login_user mÃ¡ximo 12 caracteres
- password 8 a 12 caracteres
- password con al menos 1 nÃºmero y 1 mayÃºscula
- cambio de username limitado cada 30 dÃ­as
- avatar desde galerÃ­a propia PNG en public/avatars

## 13. Tracking

Tabla:

- user_tracked_items

Regla importante:

- item_id referencia psdeals_stage_items.id.
- No guardar catalog_public_cache.id directamente como fuente final.
- La UI puede pasar id desde catalog_public_cache, pero RPC debe resolver al item real.

Track/Tracked debe estar visible en:

- Home cards
- Catalog cards
- Deals cards
- Tracked cards
- Slug page
- Carrusel principal

## 14. Pricing y deals

SituaciÃ³n actual:

- PSDeals es fuente principal histÃ³rica de catÃ¡logo, precios e historial.
- PlayStation Store oficial valida deals actuales.
- official_ps_store_deals actÃºa como allowlist.
- catalog_public_cache publica solo deals que pasan la lÃ³gica actual.

Contexto crÃ­tico:

En mayo 2026 PlayStation cambiÃ³ precios base y muchos sitios externos mostraron falsos descuentos. LoboDeals corrigiÃ³ esta situaciÃ³n para no marcar como deals precios que en PlayStation Store ya eran base regular.

No revertir esta lÃ³gica sin revisar auditorÃ­a crÃ­tica.

## 15. PSDeals

PSDeals se usa para:

- CatÃ¡logo
- Slugs
- ImÃ¡genes
- Store URLs
- Precios
- Historial
- Relaciones
- Recently added
- Discounts como fuente inicial a contrastar

Scripts clave:

- scripts/collect-psdeals-listing-edge-live-cdp.mjs
- scripts/import-psdeals-detail-local.mjs
- scripts/run-psdeals-edge-live-recently-added.ps1
- scripts/reconcile-psdeals-detail-batch.mjs
- scripts/analyze-psdeals-listing-new-v2.mjs
- scripts/analyze-psdeals-discounts-refresh-candidates-v2.mjs

## 16. PlayStation Store oficial

Se usa como:

- Validador de deals actuales
- Fuente oficial para PS Plus deals
- Fuente futura posible para disponibilidad/store_url o juegos removidos

Script clave:

- scripts/collect-psstore-official-deals-edge-live.mjs

Dato importante:

El collector oficial requiere sesiÃ³n/login para ver algunos precios originales o descuentos correctamente. Sin login puede recolectar 0 o informaciÃ³n incompleta.

## 17. Metacritic

Se usa solo para:

- metacritic_score

No priorizar:

- metacritic_user_score
- metacritic_reviews_count

Scripts clave:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-score-v2.mjs

AutomatizaciÃ³n local activa:

- Windows Task Scheduler
- LoboDeals - Metacritic Weekly 14d
- Ejecuta run-metacritic-weekly-14d.ps1
- PrÃ³ximo/Ãºltimo horario debe verificarse en Task Scheduler si hace falta

## 18. Worker legacy

Ruta:

    D:\Proyectos\worker-playstation-ingest

Cloudflare Worker:

    lobodeals-playstation-ingest

ClasificaciÃ³n:

    Legacy/reference

No es el flujo principal actual.

CaracterÃ­sticas:

- Procesa ps_ingest_queue.
- Usa automation_runs.
- Hace fetch a row.store_url.
- Tiene scheduled handler.
- wrangler.jsonc no tiene crons activos.
- .dev.vars contiene secretos; no compartir.

Posible uso futuro:

- referencia para checks de disponibilidad
- juegos eliminados de PlayStation Store
- validaciones puntuales de store_url

## 19. Automatizaciones locales

Windows Task Scheduler actual:

Activo:

- LoboDeals - Metacritic Weekly 14d

Eliminadas en limpieza 1.9:

- LoboDeals - Metacritic Monthly
- LoboDeals - PSDeals Recently Added 12h

Importante:

PSDeals Recently Added ya no estÃ¡ automatizado por Task Scheduler. El flujo PSDeals debe tratarse como manual/controlado hasta resolver estrategia estable contra challenge/captcha.

## 20. SEO

Activos:

- robots.txt
- sitemap.xml
- metadata base
- canonical sin www
- metadata dinÃ¡mica de slug

Pendiente:

- Search Console
- Enviar sitemap
- Solicitar indexaciÃ³n de rutas clave
- Monitorear snippets viejos de Steam si aparecen

## 21. Dominio / Porkbun

Dominio comprado en Porkbun:

- lobodeals.com

Vercel maneja la configuraciÃ³n de dominio actual.

Estado esperado:

- lobodeals.com funciona
- www.lobodeals.com redirige a lobodeals.com

Si se cambia DNS, revisar Vercel Domains y Porkbun.

## 22. Google Cloud OAuth

Google OAuth se usa para Supabase Auth.

Debe estar configurado para el proyecto Supabase actual, no el viejo.

URLs importantes:

- Supabase callback actual
- lobodeals.com
- lobodeals.vercel.app
- localhost:3000 para desarrollo

No documentar client secret.

## 23. Git y documentaciÃ³n

Repo:

    https://github.com/lobovolk-hub/lobodeals

Rama:

    main

Backup histÃ³rico:

    steam-legacy-backup

DocumentaciÃ³n vieja v1/v1.6/v1.7 eliminada.

DocumentaciÃ³n 1.9 esperada:

- STATUS-v1.9.md
- SYSTEM-MAP-v1.9.md
- DB-SNAPSHOT-v1.9.md
- OPERATIONS-v1.9.md
- ROADMAP-v1.9.md
- HANDOFF-v1.9.md
- NEW-CHAT-PROMPT-v1.9.md

## 24. Fuente de verdad

Fuente de verdad actual:

- Proyecto local limpio post 1.9
- GitHub main despuÃ©s de push final
- Supabase snapshot post limpieza
- Vercel producciÃ³n
- docs/audit-v1.9 para evidencia

No usar:

- ZIP 1.8
- documentaciÃ³n v1.7
- documentaciÃ³n v1.6
- referencias del proyecto Steam antiguo salvo backup histÃ³rico

## 25. Estado del system map

Este mapa representa el estado de LoboDeals 1.9 posterior a:

- deploy pÃºblico
- revisiÃ³n visual PC/mÃ³vil
- limpieza local
- limpieza Task Scheduler
- revisiÃ³n worker
- revisiÃ³n Supabase
- correcciÃ³n de Metacritic queue
- eliminaciÃ³n de documentaciÃ³n vieja

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
