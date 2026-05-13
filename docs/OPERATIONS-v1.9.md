# OPERATIONS v1.9 â€” LoboDeals â€” 2026-05-11

## 1. PropÃ³sito

Este documento describe cÃ³mo operar LoboDeals 1.9 despuÃ©s de la limpieza, deploy pÃºblico inicial y revisiÃ³n de infraestructura.

Incluye:

- Desarrollo local.
- Build.
- Deploy.
- GitHub.
- Vercel.
- Supabase.
- PSDeals.
- PlayStation Store oficial.
- Metacritic.
- Windows Task Scheduler.
- Worker legacy.
- Limpieza segura.
- Reglas de trabajo.

## 2. Ruta principal del proyecto

Proyecto principal:

    D:\Proyectos\lobodeals

Worker separado:

    D:\Proyectos\worker-playstation-ingest

El worker se conserva como legacy/reference. No es el flujo principal actual.

## 3. Desarrollo local

Entrar al proyecto:

    cd D:\Proyectos\lobodeals

Levantar desarrollo:

    npm run dev

Abrir:

    http://localhost:3000

Build local:

    npm run build

El build fue validado correctamente despuÃ©s de la limpieza 1.9.

## 4. Deploy normal

El deploy normal se hace por GitHub conectado a Vercel.

Flujo correcto:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel despliega automÃ¡ticamente desde GitHub main.

No usar vercel --prod como flujo normal. Solo usarlo como emergencia.

## 5. GitHub

Repositorio:

    https://github.com/lobovolk-hub/lobodeals

Rama de producciÃ³n:

    main

Backup histÃ³rico de Steam:

    steam-legacy-backup

Comandos Ãºtiles:

    git status
    git log --oneline -10
    git remote -v
    git branch -a

Regla:

Antes de push, correr npm run build salvo cambios puramente documentales donde no toque cÃ³digo. Si el usuario dice que quedÃ³ excelente o todo estÃ¡ bien en cambios de cÃ³digo, asumir que corriÃ³ npm run build y pasÃ³, salvo que indique lo contrario.

## 6. Vercel

Proyecto:

    lobodeals

Dominios:

    lobodeals.com
    www.lobodeals.com
    lobodeals.vercel.app

Estado deseado:

- lobodeals.com es el dominio principal.
- www.lobodeals.com redirige a lobodeals.com.
- lobodeals.vercel.app queda como dominio Vercel.
- Deploy automÃ¡tico desde GitHub main.

Variables de entorno conocidas:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- NEXT_PUBLIC_SITE_URL

No publicar valores de variables.

Si algo falla en Vercel:

1. Revisar logs del deployment.
2. Confirmar que GitHub main contiene los archivos reales.
3. Confirmar que .gitignore no excluye app, components, lib, public, scripts o sql.
4. Confirmar variables de entorno.
5. Correr npm run build localmente.

## 7. DNS / Porkbun

Dominio comprado en Porkbun:

    lobodeals.com

Vercel maneja dominios activos.

Estado esperado:

- lobodeals.com abre producciÃ³n.
- www.lobodeals.com redirige a lobodeals.com.

Si se modifica DNS:

- Revisar Vercel Domains.
- Revisar Porkbun DNS.
- No tocar sin documentar cambio.

## 8. Supabase

Supabase se usa para:

- Base de datos.
- Auth.
- OAuth Google.
- RLS.
- RPCs.

Variables locales:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY

Regla:

Nunca compartir SUPABASE_SECRET_KEY.

Tablas runtime no tocar:

- catalog_public_cache.
- profiles.
- user_tracked_items.

Tablas stage/historial no tocar:

- psdeals_stage_items.
- psdeals_stage_price_history.
- psdeals_stage_relations.
- psdeals_import_runs.
- official_ps_store_deals.

Legacy no borrar sin decisiÃ³n explÃ­cita:

- ps_ingest_queue.
- price_offer_queue.
- ps_discovery_progress.
- automation_runs.

## 9. Refresh de cache pÃºblica

DespuÃ©s de cambios relevantes en stage, pricing o official deals, refrescar:

    select public.refresh_catalog_public_cache_v15();

Validar counts y nulls si corresponde.

No modificar refresh_catalog_public_cache_v15 sin revisar:

- lÃ³gica de official_ps_store_deals.
- PS Plus deal logic.
- falsos descuentos corregidos en mayo 2026.
- slugs pÃºblicos.
- image fallback/normalization.
- current_price_amount.
- best_price_amount.
- best_price_type.

## 10. SituaciÃ³n actual de precios/deals

PSDeals es fuente principal histÃ³rica de:

- catÃ¡logo.
- precios.
- historial.
- relaciones.
- slugs.
- imÃ¡genes.
- metadatos base.

Pero los deals pÃºblicos actuales no se publican ciegamente desde PSDeals.

PlayStation Store oficial funciona como allowlist/validaciÃ³n de deals actuales.

Contexto:

En mayo 2026 PlayStation cambiÃ³ precios base. PSDeals y PSPrices podÃ­an mostrar como descuento lo que PlayStation Store mostraba como precio regular/base. LoboDeals corrigiÃ³ esto para evitar falsos descuentos.

Estado actual:

- official_ps_store_deals tiene 44 rows.
- catalog_public_cache publica 41 deals oficiales matcheados.
- Algunos official-only no matcheados se ignoran por ahora.
- La web quedÃ³ mÃ¡s precisa que PSDeals/PSPrices en esa situaciÃ³n puntual.

No revertir esto sin revisar la auditorÃ­a crÃ­tica.

## 11. PSDeals â€” operaciÃ³n manual/controlada

Scripts relevantes:

- scripts/collect-psdeals-listing-edge-live-cdp.mjs
- scripts/import-psdeals-detail-local.mjs
- scripts/run-psdeals-edge-live-recently-added.ps1
- scripts/reconcile-psdeals-detail-batch.mjs
- scripts/analyze-psdeals-listing-new-v2.mjs
- scripts/analyze-psdeals-discounts-refresh-candidates-v2.mjs
- scripts/refresh-catalog-public-cache-v15.mjs

PSDeals Recently Added 12h ya no estÃ¡ activo en Task Scheduler.

Regla:

No automatizar PSDeals a ciegas hasta resolver estrategia estable contra challenge/captcha.

Para future operations:

- Recently added debe cubrir novedades + upcoming.
- Discounts/best-new-deals debe correr con cuidado.
- Validar resultados antes de importar masivo.
- Detener import si hay seÃ±ales de HTML incompleto, challenge o captcha.
- Guardar outputs estructurados en data/import.

## 12. PlayStation Store oficial

Uso actual:

- ValidaciÃ³n de deals.
- PS Plus official deals.
- Allowlist contra falsos descuentos.

Script relevante:

- scripts/collect-psstore-official-deals-edge-live.mjs

Notas:

- El collector oficial puede requerir sesiÃ³n/login para ver precios originales/descuentos.
- Sin login puede recolectar 0 o informaciÃ³n incompleta.
- En la auditorÃ­a crÃ­tica se recolectaron 44 official deals.
- De esos, 41 quedaron matcheados en cache pÃºblica.

No usar PlayStation Store como fuente principal de catÃ¡logo por ahora porque histÃ³ricamente causÃ³ timeouts y HTML errÃ¡tico.

## 13. Metacritic

Objetivo:

Solo mantener metacritic_score.

No priorizar:

- metacritic_user_score.
- metacritic_reviews_count.

Scripts relevantes:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-score-v2.mjs

AutomatizaciÃ³n activa:

    LoboDeals - Metacritic Weekly 14d

Ruta:

    D:\Proyectos\lobodeals\scripts\run-metacritic-weekly-14d.ps1

Task Scheduler:

- Activa: LoboDeals - Metacritic Weekly 14d.
- Eliminadas: LoboDeals - Metacritic Monthly.
- Eliminadas: LoboDeals - PSDeals Recently Added 12h.

Estado metacritic_queue post cleanup:

- manual_review = 373.
- pending attempts 0 = 11797.
- pending attempts 1 = 211.
- processing = 0.

Regla:

Si aparecen filas antiguas en processing por mÃ¡s de 24 horas, revisar locked_by antes de resetear. No borrar manual_review.

## 14. Comando de revisiÃ³n Task Scheduler

Ver tareas relacionadas:

    Get-ScheduledTask |
      Where-Object {
        $_.TaskName -match 'metacritic|lobodeals|psdeals|playstation' -or
        $_.TaskPath -match 'metacritic|lobodeals|psdeals|playstation'
      } |
      Select-Object TaskName, TaskPath, State |
      Format-Table -AutoSize

Debe quedar solo:

    LoboDeals - Metacritic Weekly 14d    Ready

## 15. Worker legacy

Ruta:

    D:\Proyectos\worker-playstation-ingest

Nombre Cloudflare Worker:

    lobodeals-playstation-ingest

ClasificaciÃ³n:

    Legacy/reference

No es flujo principal actual.

Archivos:

- src/index.ts
- wrangler.jsonc
- .dev.vars
- package.json

wrangler.jsonc:

- main: src/index.ts.
- observability enabled.
- INGEST_LIMIT default 5.
- triggers.crons vacÃ­o.

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

Posible uso futuro:

- checks de disponibilidad.
- juegos eliminados de PlayStation Store.
- validaciÃ³n puntual de store_url.

## 16. Limpieza local realizada

Se limpiÃ³:

- logs/psdeals-import-html.
- logs/psdeals-listing-html.
- .next.
- .browser-profiles movido fuera del proyecto.
- Task Scheduler desactivados eliminados.

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

Backup browser profiles:

    D:\Proyectos\lobodeals-local-archive\browser-profiles-legacy-2026-05-11

## 17. data/import

Mantener.

Motivo:

Contiene evidencia estructurada de:

- PSDeals full catalog listing.
- gap audits.
- discounts audits.
- official PlayStation Store comparisons.
- Metacritic audit logs.
- detail import/retry evidence.
- edge-live outputs.

No es basura cruda como HTML de logs.

## 18. logs

Mantener logs restantes.

DespuÃ©s de limpieza quedaron aproximadamente 15.42 MB.

No borrar logs pequeÃ±os recientes sin revisiÃ³n.

## 19. .next

Se puede borrar cuando se quiera liberar espacio.

Comando:

    Remove-Item -Recurse -Force .next

Se regenera con:

    npm run build
    npm run dev

No incluir en Git ni ZIP.

## 20. node_modules

Mantener mientras se trabaja activamente.

Se puede borrar si se quiere crear un ZIP limpio o reinstalar:

    Remove-Item -Recurse -Force node_modules
    npm install

No incluir en ZIP ni Git.

## 21. ZIP / handoff

Para ZIP de proyecto, excluir:

- node_modules.
- .next.
- .vercel.
- .env.local.
- .env files con secretos.
- data si el ZIP debe ser liviano.
- logs.
- .browser-profiles.
- lobodeals-local-archive.
- archivos temporales.

Incluir:

- app.
- components.
- lib.
- public.
- scripts.
- sql.
- package.json.
- package-lock.json.
- tsconfig.json.
- next.config.ts.
- postcss.config.mjs.
- eslint.config.mjs.
- proxy.ts.
- README.md si se decide actualizar.
- docs finales v1.9 si se decide versionarlos.

## 22. Search Console

Pendiente.

Pasos futuros:

- Crear/verificar propiedad.
- Enviar sitemap:
  https://lobodeals.com/sitemap.xml
- Solicitar indexaciÃ³n de:
  /
  /catalog
  /deals
  slugs clave.
- Revisar si Google muestra snippets viejos del proyecto Steam.
- Monitorear cobertura.

## 23. SEO actual

Activos:

- robots.txt.
- sitemap.xml.
- canonical sin www.
- metadata base.
- metadata dinÃ¡mica de slugs.

Validado anteriormente en ejemplos como:

- TEKKEN 8.
- Hydroneer.

## 24. Auth Google

Supabase Auth + Google OAuth estÃ¡ operativo.

Notas:

- En navegador normal puede entrar directo si ya hay sesiÃ³n Google.
- En incÃ³gnito muestra consentimiento/login.
- BotÃ³n Create account with Google puede iniciar sesiÃ³n si la cuenta ya existe.
- Texto aclaratorio en create debe mantenerse.

No cambiar OAuth sin revisar:

- Google Cloud OAuth client.
- Supabase callback actual.
- Site URL.
- Redirect URLs.

## 25. Reglas de trabajo

Reglas obligatorias:

- Indicar apartado exacto del roadmap.
- Marcar Listo al cerrar apartados.
- Revisar si la informaciÃ³n ya fue entregada antes de pedirla.
- Validar lÃ­nea por lÃ­nea en cambios crÃ­ticos.
- No priorizar rapidez sobre verificaciÃ³n.
- Si hay mÃ¡s de 4 cambios o riesgo de mezcla, entregar archivo completo.
- No usar ZIP viejo como fuente de verdad si hubo cambios por chat/Git/deploy.
- ZIP 1.8 estÃ¡ muerto/obsoleto.
- No borrar tablas ni data sin inventario.
- No automatizar PSDeals sin revisiÃ³n.
- Mantener UI pÃºblica en inglÃ©s.
- No cambiar tÃ­tulos Home a PS Plus deals solo porque temporalmente haya deals PS Plus.
- No ocultar add-ons por tÃ­tulo sin confirmar error real en PlayStation Store.
- No volver a manual masivo salvo errores puntuales.

## 26. Comandos frecuentes

Desarrollo:

    cd D:\Proyectos\lobodeals
    npm run dev

Build:

    npm run build

Deploy:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Git status:

    git status

Ãšltimos commits:

    git log --oneline -10

Remotes:

    git remote -v

## 27. ValidaciÃ³n manual pre-launch

Revisar:

- /
- /catalog
- /deals
- /login
- /profile
- /tracked
- /us/playstation/tekken-8
- /us/playstation/hydroneer
- /robots.txt
- /sitemap.xml

Validar:

- header desktop.
- header mobile.
- search.
- mobile menu.
- filters dropdown.
- cards 2 columnas en mÃ³vil.
- login.
- Google OAuth.
- track/tracked.
- canonical.
- sitemap.

## 28. Monitoreo post-launch

Revisar:

- Vercel deployment logs.
- Supabase Auth users.
- Supabase table growth.
- Search Console coverage.
- errores de slugs.
- errores de imÃ¡genes.
- feedback de usuarios.
- PSDeals/PS Store pricing changes.

## 29. QuÃ© no hacer

No hacer:

- DROP de tablas legacy sin decisiÃ³n explÃ­cita.
- DELETE masivo en metacritic_queue.
- borrar data/import.
- borrar scripts por parecer viejos sin scan de uso.
- publicar SUPABASE_SECRET_KEY.
- subir .env.local.
- cambiar lÃ³gica de deals sin comparar PlayStation Store oficial.
- reactivar PSDeals Recently Added 12h sin resolver challenge/captcha.
- tratar worker legacy como flujo principal.
- usar documentaciÃ³n v1.7.
- usar ZIP 1.8.

## 30. Estado final de operaciones

OperaciÃ³n actual estable:

- Deploy por GitHub main.
- Vercel conectado.
- Supabase estable.
- Metacritic Weekly 14d activo.
- PSDeals manual/controlado.
- PlayStation Store oficial usado como validaciÃ³n de deals.
- Worker legacy conservado como referencia.
- DocumentaciÃ³n 1.9 en creaciÃ³n.

## Addendum â€” Supabase Auth URL Configuration â€” 2026-05-11

OAuth Google requiere que Supabase Auth tenga producciÃ³n como Site URL.

ConfiguraciÃ³n correcta en Supabase Authentication URL Configuration:

Site URL:
    https://lobodeals.com

Redirect URLs:
    https://lobodeals.com/auth/callback
    https://www.lobodeals.com/auth/callback
    https://lobodeals.vercel.app/auth/callback
    http://localhost:3000/auth/callback
    https://lobodeals.com/auth/callback**
    https://www.lobodeals.com/auth/callback**
    https://lobodeals.vercel.app/auth/callback**
    http://localhost:3000/auth/callback**

No dejar Site URL como http://localhost:3000 en producciÃ³n, porque Google OAuth puede devolver al usuario a localhost.

El cÃ³digo de login usa window.location.origin para construir el callback:
    /auth/callback?next=...

Por eso el bug era de configuraciÃ³n Supabase, no de cÃ³digo.

Validado:
- lobodeals.com funciona correctamente con Continue with Google.
- localhost funciona correctamente con Continue with Google.

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
