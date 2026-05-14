# DB SNAPSHOT v1.9 — LoboDeals — 2026-05-11

## 1. Propósito

Este documento resume el estado de Supabase para LoboDeals 1.9 después de la limpieza local, revisión de tablas, revisión de Task Scheduler y corrección de locks antiguos en metacritic_queue.

No reemplaza un dump SQL completo. Es un snapshot operativo para handoff, mantenimiento y migración a nuevo chat.

## 2. Principio general

No borrar tablas, funciones, policies ni datos sin inventario previo.

La base contiene tres grupos:

- Runtime actual de la web pública.
- Stage/historial de PSDeals.
- Legacy de la etapa PlayStation Store directa.

El hecho de que una tabla sea legacy no significa que deba eliminarse de inmediato.

## 3. Row counts snapshot 1.9

Estado validado después de la limpieza:

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

## 4. Clasificación rápida

### Runtime público — NO TOCAR

- catalog_public_cache
- profiles
- user_tracked_items
- RPCs de búsqueda, auth/profile y tracking

### Catálogo / pricing / historial — NO TOCAR

- psdeals_stage_items
- psdeals_stage_price_history
- psdeals_stage_relations
- psdeals_import_runs
- official_ps_store_deals
- refresh_catalog_public_cache_v15

### Operación / auditoría — MANTENER

- metacritic_queue
- automation_runs

### Legacy PlayStation Store — MANTENER ESTRUCTURA

- ps_ingest_queue
- price_offer_queue
- ps_discovery_progress
- worker-playstation-ingest

## 5. catalog_public_cache

Rows:

    32412

Uso:

- Capa pública de lectura para Home.
- /catalog.
- /deals.
- /tracked.
- /us/playstation/[slug].
- /sitemap.xml.
- Search público.

Esta tabla es crítica para runtime.

No tocar manualmente salvo diagnóstico específico.

Se reconstruye con:

    select public.refresh_catalog_public_cache_v15();

Importante:

- Publica datos derivados de psdeals_stage_items y lógica de deals.
- Es la capa que debe usar la UI.
- Debe mantener slugs públicos sanos.
- No debe publicar falsos deals derivados ciegamente desde PSDeals.
- Deals actuales pasan por lógica de official_ps_store_deals.

## 6. psdeals_stage_items

Rows:

    32412

Uso:

- Stage principal de catálogo importado desde PSDeals.
- Fuente base para catalog_public_cache.
- Contiene slugs, títulos, URLs, imágenes, precios, publisher, release date, Metacritic score y metadata.

No tocar.

Notas:

- PSDeals es fuente principal histórica de catálogo/precios.
- Si se corrigen o importan items, luego se debe refrescar catalog_public_cache.
- user_tracked_items debe referenciar item_id real de psdeals_stage_items, no catalog_public_cache.id como fuente definitiva.

## 7. psdeals_stage_price_history

Rows:

    785766

Uso:

- Historial de precios.
- Price history chart.
- Valor futuro del proyecto.

No borrar.

Aunque es la tabla más grande, no se considera basura.

Notas:

- Contiene historial estructurado.
- No equivale a logs crudos.
- Mantener para futuras mejoras de historical low, price trends, tracking alerts y análisis.

## 8. psdeals_stage_relations

Rows:

    41398

Uso:

- Relaciones entre items.
- Related content en slug pages.
- DLC, editions, bundles y contenido relacionado según PSDeals.

No tocar.

Notas:

- PSDeals no siempre clasifica perfecto.
- Algunas variantes pueden requerir mapping manual futuro.
- No eliminar relaciones solo por parecer DLC/add-on.

## 9. official_ps_store_deals

Rows:

    44

Uso:

- Allowlist / validación oficial para deals actuales.
- Crítica para evitar falsos descuentos.

Estado validado:

    active official deals: 44

Distribución validada:

    ps_plus_discount addon   3
    ps_plus_discount bundle  6
    ps_plus_discount game    34
    ps_plus_freebie addon    1

No tocar.

Contexto crítico:

En mayo 2026 PlayStation Store mostró cambios de precios base. PSDeals y PSPrices podían mostrar como descuento lo que en realidad era nuevo precio base regular. LoboDeals corrigió esto usando PlayStation Store oficial como validación de deals actuales.

La lógica actual no debe revertirse sin revisar la auditoría crítica de precios.

Resultado operativo:

- official_ps_store_deals tiene 44 filas oficiales.
- catalog_public_cache publica 41 deals oficiales matcheados.
- official-only no matcheados contra catálogo/base PSDeals se ignoran por ahora.

## 10. metacritic_queue

Rows:

    16473

Uso:

- Cola para backfill/actualización de metacritic_score.
- Relacionada con Windows Task Scheduler activo: LoboDeals - Metacritic Weekly 14d.

Estado posterior a cleanup:

    manual_review = 373
    pending attempts 0 = 11797
    pending attempts 1 = 211
    processing = 0

Corrección aplicada en 1.9:

- Había 211 filas antiguas con status = processing.
- locked_by = node_local_metacritic_browse.
- attempts = 1.
- updated_at alrededor de 2026-05-01 06:26–06:27 UTC.
- Se validó rows_to_reset = 211.
- Se resetearon a pending.
- locked_by quedó null.
- No se borró nada.
- manual_review no se tocó.

Interpretación:

- manual_review contiene casos que no pudieron resolverse automáticamente.
- pending attempts 0 son filas nunca procesadas.
- pending attempts 1 son filas liberadas desde processing viejo.
- processing debe estar en 0 salvo ejecución activa.

Script relacionado:

    scripts\run-metacritic-weekly-14d.ps1

Regla:

No limpiar manual_review masivamente. Revisar caso por caso si se decide trabajar esa cola.

## 11. profiles

Rows:

    1

Uso:

- Perfil del usuario autenticado.
- Login username.
- Display name.
- Avatar.
- Birthday.
- Perfil conectado a Supabase Auth.

No tocar.

Campos importantes esperados:

- login_username.
- login_username_normalized.
- display_name.
- avatar_path.
- birthday.
- updated_at.
- username_changed_at.

Reglas de producto:

- login_user máximo 12 caracteres.
- password 8–12 caracteres, al menos un número y una mayúscula.
- username puede cambiarse cada 30 días.
- display name puede tener espacios.
- avatar usa galería propia PNG en public/avatars.

## 12. user_tracked_items

Rows:

    9

Uso:

- Juegos guardados/tracked por usuario.
- /tracked.
- Track/Tracked en cards y slug.

No tocar.

Regla crítica:

- item_id debe referenciar psdeals_stage_items.id.
- La UI puede trabajar con catalog_public_cache.id, pero la RPC debe resolver el item real.
- No guardar catalog_public_cache.id como fuente definitiva del tracking.

RLS:

- Usuario solo puede ver/insertar/borrar sus propios tracked items.

## 13. ps_ingest_queue

Rows:

    0

Clasificación:

    Legacy PlayStation Store

Uso histórico:

- Cola usada por worker-playstation-ingest.
- Flujo antiguo de ingesta directa desde PlayStation Store.
- Ya no es flujo principal actual.

Decisión 1.9:

- Mantener estructura.
- No borrar por ahora.
- Documentar como legacy.
- No usar como flujo principal.

## 14. price_offer_queue

Rows:

    0

Clasificación:

    Legacy PlayStation Store / offers

Decisión 1.9:

- Mantener estructura.
- No borrar por ahora.
- Documentar como legacy.
- No usar como flujo activo.

## 15. ps_discovery_progress

Rows:

    4

Clasificación:

    Legacy PlayStation Store discovery

Contenido validado:

- category_ps4_all_games.
- category_ps5_all_games.
- browse_all_games.
- category_new_games.

Estado:

- Algunas fuentes quedaron done.
- Algunas pausadas por problemas de HTML/paginación pública de PlayStation Store.

Decisión 1.9:

- Mantener por evidencia histórica.
- No usar como flujo principal.
- Puede servir como referencia si se retoma scraping directo de PlayStation Store.

## 16. automation_runs

Rows:

    1624

Clasificación:

    Historial operativo legacy

Contenido:

- Ejecuciones de collect_playstation_queue_worker.
- Ejecuciones de collect_playstation_queue_local.
- Ejecuciones antiguas de flujo PlayStation Store.
- Fechas principalmente 2026-04-20 a 2026-04-22.

Decisión 1.9:

- Mantener por handoff/historial.
- No purgar antes de cerrar documentación.
- No se considera runtime público actual.

A futuro podría evaluarse una política de retención, pero no ahora.

## 17. psdeals_import_runs

Uso:

- Historial de imports PSDeals.
- Evidencia de procesos de importación.

No tocar.

Debe documentarse como parte del flujo operativo PSDeals.

## 18. RPCs / funciones conocidas

Funciones importantes detectadas/documentadas:

- public.search_catalog_public_cache(...)
- public.refresh_catalog_public_cache_v15()
- public.is_login_username_available(text)
- public.get_email_for_login_username(text)
- public.make_default_login_username(uuid)
- public.normalize_candidate_login_username(text)
- public.track_user_item(uuid)
- public.untrack_user_item(uuid)
- public.is_user_tracking_item(uuid)
- public.get_user_tracked_item_ids(uuid[])
- public.handle_new_auth_user()

## 19. search_catalog_public_cache

Uso:

- /catalog.
- Search desde Home/Header.
- Búsqueda tolerante y ordenada.

Debe soportar:

- tab all/games/bundles/addons.
- q.
- letter.
- sort.
- pagination limit/offset.

Importante UX:

- En All, Games y Bundles son grupo principal mezclado por relevancia/título.
- Add-ons deben aparecer después.
- Debe tolerar typos y títulos con puntuación.

## 20. refresh_catalog_public_cache_v15

Uso:

- Reconstruye catalog_public_cache.
- Aplica lógica de precios/deals.
- Integra datos de PSDeals stage.
- Respeta official_ps_store_deals para deals actuales.

Comando SQL:

    select public.refresh_catalog_public_cache_v15();

Regla:

Ejecutar después de imports/correcciones relevantes en stage o deals.

No modificar sin revisar:

- PS Plus deal logic.
- official_ps_store_deals allowlist.
- falso discount patch de mayo 2026.
- slug/public_slug handling.
- image fallback/normalization.

## 21. RLS y policies

Policies conocidas/documentadas:

profiles:

- profiles_select_own.
- profiles_insert_own.
- profiles_update_own.

user_tracked_items:

- tracked_select_own.
- tracked_insert_own.
- tracked_delete_own.

catalog_public_cache:

- public can read catalog_public_cache para anon.
- authenticated can read catalog_public_cache para authenticated.

Regla:

No cambiar RLS sin prueba de:

- usuario anónimo.
- usuario autenticado.
- login.
- profile.
- tracked.
- catalog/deals/slugs.

## 22. Auth

Supabase Auth está activo para:

- Email/password.
- OAuth Google.
- Callback /auth/callback.

Google OAuth debe apuntar al Supabase project actual.

No usar callback de Supabase viejo del proyecto Steam.

Variables sensibles:

- SUPABASE_SECRET_KEY.
- Google client secret.
- .env.local.
- .dev.vars del worker.

Nunca commitear ni pegar secretos.

## 23. Storage

No hay storage crítico documentado como runtime principal.

Avatares se sirven desde:

    public/avatars

Son 10 PNG propios.

No asumir .webp.

## 24. Datos públicos críticos

catalog_public_cache debe tener:

- slug.
- title.
- image_url.
- platforms.
- content_type.
- item_type_label.
- release_date.
- current_price_amount.
- original_price_amount.
- discount_percent.
- ps_plus_price_amount.
- best_price_amount.
- best_price_type.
- has_deal.
- has_ps_plus_deal.
- metacritic_score.
- publisher/store URL según uso de slug page.

## 25. Deals actuales

Estado conceptual actual:

- Regular deals públicos: filtrados por lógica actual.
- PS Plus official deals: validados contra PlayStation Store.
- No publicar falsos deals de PSDeals si PlayStation Store muestra ese precio como base regular.

Casos validados en auditoría:

- TEKKEN 8 no debe mostrar falso descuento.
- Red Dead Redemption 2 no debe mostrar falso descuento si PlayStation Store lo muestra como precio base.
- Sifu / Clair Obscur Deluxe fueron parte de la revisión conceptual.
- PlanetSide 2 Nanite Systems Starter Bundle quedó corregido como PS+ $9.99, original $19.99, 50%.

## 26. Metacritic scope

Solo importa:

- metacritic_score

No priorizar:

- metacritic_user_score.
- metacritic_reviews_count.

Motivo:

- El usuario decidió que para LoboDeals 1.6+ solo importa metacritic_score.

## 27. Limpieza realizada en Supabase 1.9

No se dropeó ninguna tabla.

No se hizo DELETE masivo.

Única corrección aplicada:

- Reset de 211 stale locks en metacritic_queue.
- processing -> pending.
- locked_by -> null.
- manual_review intacto.
- datos no borrados.

## 28. Tablas candidatas futuras a revisar

No borrar ahora, pero documentar:

- ps_ingest_queue.
- price_offer_queue.
- ps_discovery_progress.
- automation_runs.

Motivo:

Son de la etapa PlayStation Store directa y worker legacy.

Podrían servir para:

- checks de disponibilidad.
- juegos removidos de tienda.
- recuperación de lógica antigua.
- auditorías históricas.

## 29. Consultas útiles

Refresh cache:

    select public.refresh_catalog_public_cache_v15();

Counts principales:

    select 'catalog_public_cache' as table_name, count(*) from public.catalog_public_cache
    union all select 'psdeals_stage_items', count(*) from public.psdeals_stage_items
    union all select 'psdeals_stage_price_history', count(*) from public.psdeals_stage_price_history
    union all select 'psdeals_stage_relations', count(*) from public.psdeals_stage_relations
    union all select 'official_ps_store_deals', count(*) from public.official_ps_store_deals
    union all select 'metacritic_queue', count(*) from public.metacritic_queue
    union all select 'profiles', count(*) from public.profiles
    union all select 'user_tracked_items', count(*) from public.user_tracked_items;

Metacritic queue status:

    select status, locked_by, attempts, count(*) as rows_count
    from public.metacritic_queue
    group by status, locked_by, attempts
    order by status, attempts;

Official deals summary:

    select is_active, official_deal_type, official_item_type_label, count(*) as rows_count
    from public.official_ps_store_deals
    group by is_active, official_deal_type, official_item_type_label
    order by is_active desc, official_deal_type, official_item_type_label;

## 30. Estado final

Supabase queda estable para launch soft.

No hay limpieza física adicional recomendada antes del handoff.

Prioridad siguiente:

- Documentar operaciones.
- Search Console.
- Launch soft.
- Monitorear Vercel logs y Supabase Auth/users.

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
