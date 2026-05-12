# SYSTEM MAP v1.9 — LoboDeals — 2026-05-11

## 1. Propósito del sistema

LoboDeals es una web de seguimiento de precios, catálogo y ofertas de videojuegos, actualmente enfocada en PlayStation US.

Objetivo principal:

- Crear una experiencia mejor que PSDeals en UX.
- Permitir búsqueda, catálogo, deals, tracking y slugs públicos.
- Preparar una base escalable para futuras regiones/plataformas.

La ruta pública principal de juego es:

    /us/playstation/[slug]

La UI pública debe mantenerse en inglés.

## 2. Arquitectura general

Componentes principales:

- Next.js app en D:\Proyectos\lobodeals
- Supabase como base de datos y Auth
- Vercel para hosting/deploy
- GitHub como repositorio fuente
- Porkbun como registrar/dominio
- Google Cloud OAuth para login con Google
- Windows Task Scheduler para automatización local Metacritic
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

Configuración deseada:

- lobodeals.com como dominio principal
- www.lobodeals.com redirige a lobodeals.com
- lobodeals.vercel.app sigue disponible como dominio Vercel

Deploy:

- GitHub repo: https://github.com/lobovolk-hub/lobodeals
- Rama activa: main
- Vercel está conectado al repo GitHub
- Cada push a main genera deploy automático

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
- public: assets públicos, logo, iconos, avatares
- scripts: scripts de ingesta, refresh, auditoría y Metacritic
- sql: schema/base SQL
- data/import: outputs estructurados de imports/auditorías
- logs: logs pequeños recientes conservados
- docs: documentación y auditoría 1.9

Carpetas ignoradas o no destinadas a Git/ZIP:

- node_modules
- .next
- data
- logs
- .vercel
- .env.local
- .browser-profiles
- archive
- docs, salvo que se decida versionar documentación final

Nota: en 1.9 se movió .browser-profiles fuera del proyecto.

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

Páginas principales:

### Home

Ruta:

    /

Incluye:

- Header con búsqueda
- Carrusel principal LoboDeals' choice
- Secciones de juegos/deals
- Cards con Track/Tracked integrado
- Redirecciones a catalog/deals según sección

El buscador en header redirige a:

    /catalog?tab=all&letter=ALL&sort=title&q=...

### Catalog

Ruta:

    /catalog

Incluye:

- Búsqueda
- Paginación 36 items por página
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

- Paginación 36 items por página
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
- Los deals públicos actuales están filtrados por la lógica de allowlist oficial de PlayStation Store.

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
- Avatar seleccionado desde galería local PNG
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
  Header, footer, navegación, mobile menu, search.

- components/home-featured-carousel.tsx
  Carrusel principal de Home.

- components/home-search-bar.tsx
  Buscador creado durante ajustes previos; revisar si sigue usado tras mover search al header.

- components/item-card.tsx
  Card principal reutilizada en Home, Catalog, Deals y Tracked.
  Track/Tracked vive dentro de la card.

- components/track-button.tsx
  Botón Track/Tracked con Supabase Auth/RPC.

- components/price-history-chart.tsx
  Gráfico de historial de precios.

- components/fallback-game-image.tsx
  Fallback visual para imágenes rotas.

- components/details-auto-close.tsx
  Cierra dropdowns details al hacer clic fuera o presionar Escape.

## 8. Supabase

Supabase cubre:

- Base de datos
- Auth
- OAuth Google
- RLS
- RPCs de búsqueda, tracking, profile y cache

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

## 10. Clasificación de tablas

### Runtime público

No tocar:

- catalog_public_cache
- profiles
- user_tracked_items

### Stage PSDeals / catálogo

No tocar:

- psdeals_stage_items
- psdeals_stage_price_history
- psdeals_stage_relations
- psdeals_import_runs

### Deals oficiales

No tocar:

- official_ps_store_deals

Esta tabla es crítica para evitar falsos descuentos.

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

Funciones críticas:

- search_catalog_public_cache:
  usada por /catalog y búsqueda.

- refresh_catalog_public_cache_v15:
  reconstruye la capa pública desde stage/cache y aplica lógica de deals.

- track/untrack/is_user_tracking:
  soportan Track/Tracked.

## 12. Auth y perfiles

Supabase Auth soporta:

- Email/password
- Login por email o username
- OAuth Google
- Confirmación de correo

Tabla profile:

- login_username
- login_username_normalized
- display_name
- avatar_path
- birthday

Reglas de usuario:

- username/login_user máximo 12 caracteres
- password 8 a 12 caracteres
- password con al menos 1 número y 1 mayúscula
- cambio de username limitado cada 30 días
- avatar desde galería propia PNG en public/avatars

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

Situación actual:

- PSDeals es fuente principal histórica de catálogo, precios e historial.
- PlayStation Store oficial valida deals actuales.
- official_ps_store_deals actúa como allowlist.
- catalog_public_cache publica solo deals que pasan la lógica actual.

Contexto crítico:

En mayo 2026 PlayStation cambió precios base y muchos sitios externos mostraron falsos descuentos. LoboDeals corrigió esta situación para no marcar como deals precios que en PlayStation Store ya eran base regular.

No revertir esta lógica sin revisar auditoría crítica.

## 15. PSDeals

PSDeals se usa para:

- Catálogo
- Slugs
- Imágenes
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

El collector oficial requiere sesión/login para ver algunos precios originales o descuentos correctamente. Sin login puede recolectar 0 o información incompleta.

## 17. Metacritic

Se usa solo para:

- metacritic_score

No priorizar:

- metacritic_user_score
- metacritic_reviews_count

Scripts clave:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-local.mjs
- scripts/backfill-metacritic-score-v2.mjs
- scripts/metacritic-monthly-reseed.mjs

Automatización local activa:

- Windows Task Scheduler
- LoboDeals - Metacritic Weekly 14d
- Ejecuta run-metacritic-weekly-14d.ps1
- Próximo/último horario debe verificarse en Task Scheduler si hace falta

## 18. Worker legacy

Ruta:

    D:\Proyectos\worker-playstation-ingest

Cloudflare Worker:

    lobodeals-playstation-ingest

Clasificación:

    Legacy/reference

No es el flujo principal actual.

Características:

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

PSDeals Recently Added ya no está automatizado por Task Scheduler. El flujo PSDeals debe tratarse como manual/controlado hasta resolver estrategia estable contra challenge/captcha.

## 20. SEO

Activos:

- robots.txt
- sitemap.xml
- metadata base
- canonical sin www
- metadata dinámica de slug

Pendiente:

- Search Console
- Enviar sitemap
- Solicitar indexación de rutas clave
- Monitorear snippets viejos de Steam si aparecen

## 21. Dominio / Porkbun

Dominio comprado en Porkbun:

- lobodeals.com

Vercel maneja la configuración de dominio actual.

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

## 23. Git y documentación

Repo:

    https://github.com/lobovolk-hub/lobodeals

Rama:

    main

Backup histórico:

    steam-legacy-backup

Documentación vieja v1/v1.6/v1.7 eliminada.

Documentación 1.9 esperada:

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
- GitHub main después de push final
- Supabase snapshot post limpieza
- Vercel producción
- docs/audit-v1.9 para evidencia

No usar:

- ZIP 1.8
- documentación v1.7
- documentación v1.6
- referencias del proyecto Steam antiguo salvo backup histórico

## 25. Estado del system map

Este mapa representa el estado de LoboDeals 1.9 posterior a:

- deploy público
- revisión visual PC/móvil
- limpieza local
- limpieza Task Scheduler
- revisión worker
- revisión Supabase
- corrección de Metacritic queue
- eliminación de documentación vieja
