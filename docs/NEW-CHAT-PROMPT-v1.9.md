ADA, vamos a continuar el proyecto LoboDeals 1.9 en un nuevo chat.

Contexto general:
LoboDeals es una web tipo JustWatch para videojuegos, actualmente enfocada en PlayStation US. La web está viva en producción en https://lobodeals.com. La experiencia visual PC/móvil fue validada previamente como correcta para launch. El proyecto está en fase de operación diaria, launch soft, estabilización, automatización y preparación para monetización futura.

Antes de pedirme información, proponer pasos o asumir algo, lee y usa como fuente de verdad estos documentos:

- docs/STATUS-v1.9.md
- docs/SYSTEM-MAP-v1.9.md
- docs/DB-SNAPSHOT-v1.9.md
- docs/OPERATIONS-v1.9.md
- docs/ROADMAP-v1.9.md
- docs/HANDOFF-v1.9.md
- docs/DAILY-REFRESH-v1.9.md
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
- No borres data, scripts, tablas, funciones, logs o archivos sin inventario previo.
- No ejecutes ni me des SQL destructivo o pesado mezclado con explicación. Si algo no debe ejecutarse, no lo pongas en bloque SQL/PowerShell.
- Para cambios críticos, dame pasos pequeños y espera resultados.
- Si hay más de 4 cambios o riesgo de mezcla, entrega archivo completo o un parche muy controlado.
- No automatices PSDeals a ciegas.
- No cambies lógica de pricing/deals sin revisar el contexto más reciente: actualmente el flujo operativo es PSDeals-only + fast refresh, no PlayStation Store allowlist para mixed deals.

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

Estado operativo actual:

- LoboDeals está en operación diaria.
- Search Console está mejorando: todavía puede aparecer texto viejo de Steam en home, pero /catalog y /deals ya aparecen con contenido PlayStation.
- No tocar SEO técnico por ahora si canonical, sitemap y redirects siguen correctos.
- Personas ya fueron invitadas al launch soft, pero muchas no son de USA o no entienden inglés. Aun así hay visitas de otros países.
- Pendiente revisar alcance semanal con GA4/Search Console/Vercel.

Pricing/deals actual:

- PSDeals es la fuente principal operativa para catálogo, pricing y deals.
- PlayStation Store official mixed deals queda descartado por ahora para deals masivos.
- refresh_catalog_public_cache_v15 está en modo PSDeals-only y se considera seguro.
- No publicar deals expirados.
- No publicar descuentos >= 100%.
- No permitir best_price_amount null.
- Monthly PS Plus Games está separado de deals.
- PSDeals importer no debe tocar Metacritic.
- Metacritic viene de su propio collector/backfill.

Último chequeo diario completo validado:

Fecha: 2026-05-16

recently-added:
- 4 nuevos insertados.
- Failed: 0.

discounts fast refresh:
- 7497 unique items collected.
- Must refresh: 0.
- Stale selected: 500.
- Import: Seen 500 / Updated 489 / Failed 11.
- Retry: Seen 11 / Updated 11 / Failed 0.

Cache final:
- refresh_catalog_public_cache_v15: (32502,7290,3060,0)
- total_rows: 32502
- active_regular_deals: 7290
- active_ps_plus_deals: 3060
- active_monthly_games: 3
- expired_deals_still_marked_active: 0
- deals_with_100_percent_or_more: 0
- null_best_price_amount: 0

Casos clave validados:
- Mixtape: PS Plus deal correcto y Metacritic 85.
- Like a Dragon Gaiden: regular deal correcto y Metacritic 78.
- Red Dead Redemption 2: regular deal correcto y Metacritic 97.

Refresh diario:

Guía principal:
- docs/DAILY-REFRESH-v1.9.md

Runners actuales:
- scripts/run-psdeals-edge-live-recently-added.ps1
- scripts/run-psdeals-edge-live-discounts-fast-refresh.ps1

Estado:
- recently-added runner operativo.
- discounts fast refresh runner operativo.
- discounts runner endurecido para no cortarse por FAILED en stderr y llegar al retry automático.
- retry automático validado con fallos recuperados.
- refresh_catalog_public_cache_v15 todavía se ejecuta manualmente desde Supabase SQL Editor.

Supabase Free / DB size:

Último estado:
- current_database_size después de eliminar backup viejo: aproximadamente 415 MB.
- Margen estimado antes del límite Free de 500 MB: aproximadamente 85 MB.

Tabla más pesada:
- psdeals_stage_price_history
- 817955 rows
- 258 MB total
- 101 MB tabla
- 157 MB índices

Se eliminó:
- catalog_public_cache_backup_20260513_before_psdeals_only

Se creó por error y luego se eliminó:
- psdeals_price_history_archive_summary

Importante:
- No se borró price_history.
- No se perdió información.
- Crecimiento normal reciente de price_history parece bajo, salvo pico fuerte del 2026-05-13.
- Decisión pendiente: mantener price_history completo, conservar 2 años, conservar 1 año + resumen histórico, o reducir/remover feature visible.
- No ejecutar compactación ni borrado de price_history sin diagnóstico y confirmación explícita.

Metacritic:

- Solo importa metacritic_score.
- No priorizar metacritic_user_score ni metacritic_reviews_count.
- La única tarea activa en Windows Task Scheduler es LoboDeals - Metacritic Weekly 14d.
- Ejecuta:
  D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1
- Las tareas desactivadas Metacritic Monthly y PSDeals Recently Added 12h fueron eliminadas.

Pendientes principales para el nuevo chat:

1. Automatización local supervisada del refresh diario:
   - dejar de depender de ejecución manual de Johan.
   - automatizar refresh_catalog_public_cache_v15 sin Supabase SQL manual.
   - crear validación automática.
   - crear alertas si falla.
   - programar runners con Task Scheduler.
   - manejar Edge live/CDP, retries, captcha/challenge y evitar publicar datos malos.

2. Filtro de plataforma en /catalog y /deals:
   - agregar selector PS4 / PS5.
   - por defecto ambos marcados.
   - usuario puede elegir solo PS4, solo PS5 o ambos.
   - debe convivir con search, sort, tab/type filters, Metacritic y paginación.

3. Resumen semanal de alcance:
   - revisar GA4, Search Console, Vercel logs.
   - países de visitas.
   - páginas más vistas.
   - queries, clicks, impresiones, CTR.
   - errores 404.
   - evolución de indexación.

4. Price history:
   - evaluar si se conserva completo.
   - evaluar mantener solo últimos 2 años.
   - evaluar mantener solo último año + resumen histórico.
   - no borrar sin preservar dato mínimo para historical low.

5. Monetización:
   - no priorizar antes de automatización y alcance mínimo.
   - revisar Partnerize/PlayStation.
   - definir links afiliados.
   - agregar tracking de clicks salientes.
   - agregar disclosure.
   - activar de forma gradual.

6. Proyecto de compatibilidad:
   - hay trabajo paralelo tipo backwards-compatible.com.
   - puede tardar semanas.
   - futura integración posible en slugs de LoboDeals.
   - datos esperados: resolución, framerate, modos, 120Hz, HDR, Ray Tracing, PSSR.
   - no implementar todavía.

Orden recomendado para nuevo chat:

1. Automatización local supervisada del refresh diario.
2. Filtro PS4/PS5 en /catalog y /deals.
3. Resumen semanal de alcance.
4. Decisión price_history.
5. Monetización Partnerize.
6. Integración futura de compatibilidad.

Primer mensaje sugerido del usuario en el nuevo chat:
"ADA, continuemos LoboDeals 1.9 desde el handoff actualizado. Lee docs/NEW-CHAT-PROMPT-v1.9.md, STATUS, ROADMAP, OPERATIONS, DB-SNAPSHOT, HANDOFF y DAILY-REFRESH antes de proponer el siguiente paso. Quiero empezar por automatización local supervisada del refresh diario, salvo que detectes un riesgo más urgente."
