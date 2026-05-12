ADA, vamos a continuar el proyecto LoboDeals 1.9.

Contexto:
LoboDeals es una web tipo JustWatch para videojuegos, actualmente enfocada en PlayStation US. La web ya está viva en producción en https://lobodeals.com y la experiencia visual en PC y móvil quedó confirmada como perfecta para launch.

Antes de pedirme información, proponer pasos o asumir algo, lee y usa como fuente de verdad estos documentos:

- docs/STATUS-v1.9.md
- docs/SYSTEM-MAP-v1.9.md
- docs/DB-SNAPSHOT-v1.9.md
- docs/OPERATIONS-v1.9.md
- docs/ROADMAP-v1.9.md
- docs/HANDOFF-v1.9.md
- docs/NEW-CHAT-PROMPT-v1.9.md

Reglas críticas:

- Trabaja en español conmigo.
- La UI pública de LoboDeals debe mantenerse en inglés.
- Indica siempre el apartado exacto del roadmap en el que estamos.
- Cuando cierres un apartado, márcalo claramente como Listo.
- Valida línea por línea en cambios críticos.
- No priorices rapidez sobre verificación.
- No me pidas información que ya esté en los documentos.
- No uses el ZIP 1.8 como fuente de verdad. Está muerto/obsoleto.
- La fuente de verdad actual es el proyecto local/Git/deploy post limpieza 1.9.
- No borres data, scripts, tablas ni funciones sin inventario previo.
- No cambies lógica de pricing/deals sin revisar el contexto de official_ps_store_deals.
- Si hay más de 4 cambios o riesgo de mezcla, entrégame el archivo completo.
- No automatices PSDeals a ciegas.

Rutas locales:

- Proyecto principal: D:\Proyectos\lobodeals
- Worker legacy/reference: D:\Proyectos\worker-playstation-ingest
- Backup local browser profiles legacy: D:\Proyectos\lobodeals-local-archive\browser-profiles-legacy-2026-05-11

GitHub:

- Repo: https://github.com/lobovolk-hub/lobodeals
- Rama producción: main
- Backup histórico Steam: steam-legacy-backup

Deploy normal:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel:

- Proyecto: lobodeals
- Dominio principal: https://lobodeals.com
- www redirige a lobodeals.com
- Deploy automático desde GitHub main

Supabase snapshot 1.9:

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

Pricing/deals:
PSDeals sigue siendo la fuente principal histórica de catálogo, precios, historial, relaciones, slugs, imágenes y metadatos base. Pero los deals públicos actuales no deben publicarse ciegamente desde PSDeals. PlayStation Store oficial funciona como allowlist/validación actual mediante official_ps_store_deals. Esta lógica corrige falsos descuentos detectados en mayo 2026, cuando algunos precios eran en realidad nuevos precios base menores.

Metacritic:
Solo importa metacritic_score. No priorizar metacritic_user_score ni metacritic_reviews_count. La única tarea activa en Windows Task Scheduler es LoboDeals - Metacritic Weekly 14d, que ejecuta D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1. Las tareas desactivadas Metacritic Monthly y PSDeals Recently Added 12h fueron eliminadas.

Estado post-cleanup:
Se limpiaron logs HTML crudos, .next, browser profiles legacy fuera del proyecto, Task Scheduler desactivado y documentación vieja. Se mantuvieron data/import, scripts, sql, app, components, lib, public, node_modules, logs pequeños, docs/audit-v1.9 y worker legacy.

Roadmap inmediato:
1. Confirmar documentación LoboDeals 1.9.
2. Decidir si docs finales v1.9 se versionan en Git.
3. Hacer git status.
4. Commit/push si corresponde.
5. Search Console.
6. Launch soft.
7. Monitoreo post-launch.

No abras mejoras grandes antes de Search Console + launch soft salvo bug crítico.
