# OPERATIONS v1.9 — LoboDeals — 2026-05-11

## 1. Propósito

Este documento describe cómo operar LoboDeals 1.9 después de la limpieza, deploy público inicial y revisión de infraestructura.

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

El build fue validado correctamente después de la limpieza 1.9.

## 4. Deploy normal

El deploy normal se hace por GitHub conectado a Vercel.

Flujo correcto:

    npm run build
    git status
    git add .
    git commit -m "mensaje descriptivo"
    git push

Vercel despliega automáticamente desde GitHub main.

No usar vercel --prod como flujo normal. Solo usarlo como emergencia.

## 5. GitHub

Repositorio:

    https://github.com/lobovolk-hub/lobodeals

Rama de producción:

    main

Backup histórico de Steam:

    steam-legacy-backup

Comandos útiles:

    git status
    git log --oneline -10
    git remote -v
    git branch -a

Regla:

Antes de push, correr npm run build salvo cambios puramente documentales donde no toque código. Si el usuario dice que quedó excelente o todo está bien en cambios de código, asumir que corrió npm run build y pasó, salvo que indique lo contrario.

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
- Deploy automático desde GitHub main.

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

- lobodeals.com abre producción.
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

Legacy no borrar sin decisión explícita:

- ps_ingest_queue.
- price_offer_queue.
- ps_discovery_progress.
- automation_runs.

## 9. Refresh de cache pública

Después de cambios relevantes en stage, pricing o official deals, refrescar:

    select public.refresh_catalog_public_cache_v15();

Validar counts y nulls si corresponde.

No modificar refresh_catalog_public_cache_v15 sin revisar:

- lógica de official_ps_store_deals.
- PS Plus deal logic.
- falsos descuentos corregidos en mayo 2026.
- slugs públicos.
- image fallback/normalization.
- current_price_amount.
- best_price_amount.
- best_price_type.

## 10. Situación actual de precios/deals

PSDeals es fuente principal histórica de:

- catálogo.
- precios.
- historial.
- relaciones.
- slugs.
- imágenes.
- metadatos base.

Pero los deals públicos actuales no se publican ciegamente desde PSDeals.

PlayStation Store oficial funciona como allowlist/validación de deals actuales.

Contexto:

En mayo 2026 PlayStation cambió precios base. PSDeals y PSPrices podían mostrar como descuento lo que PlayStation Store mostraba como precio regular/base. LoboDeals corrigió esto para evitar falsos descuentos.

Estado actual:

- official_ps_store_deals tiene 44 rows.
- catalog_public_cache publica 41 deals oficiales matcheados.
- Algunos official-only no matcheados se ignoran por ahora.
- La web quedó más precisa que PSDeals/PSPrices en esa situación puntual.

No revertir esto sin revisar la auditoría crítica.

## 11. PSDeals — operación manual/controlada

Scripts relevantes:

- scripts/collect-psdeals-listing-edge-live-cdp.mjs
- scripts/import-psdeals-detail-local.mjs
- scripts/run-psdeals-edge-live-recently-added.ps1
- scripts/reconcile-psdeals-detail-batch.mjs
- scripts/analyze-psdeals-listing-new-v2.mjs
- scripts/analyze-psdeals-discounts-refresh-candidates-v2.mjs
- scripts/refresh-catalog-public-cache-v15.mjs

PSDeals Recently Added 12h ya no está activo en Task Scheduler.

Regla:

No automatizar PSDeals a ciegas hasta resolver estrategia estable contra challenge/captcha.

Para future operations:

- Recently added debe cubrir novedades + upcoming.
- Discounts/best-new-deals debe correr con cuidado.
- Validar resultados antes de importar masivo.
- Detener import si hay señales de HTML incompleto, challenge o captcha.
- Guardar outputs estructurados en data/import.

## 12. PlayStation Store oficial

Uso actual:

- Validación de deals.
- PS Plus official deals.
- Allowlist contra falsos descuentos.

Script relevante:

- scripts/collect-psstore-official-deals-edge-live.mjs

Notas:

- El collector oficial puede requerir sesión/login para ver precios originales/descuentos.
- Sin login puede recolectar 0 o información incompleta.
- En la auditoría crítica se recolectaron 44 official deals.
- De esos, 41 quedaron matcheados en cache pública.

No usar PlayStation Store como fuente principal de catálogo por ahora porque históricamente causó timeouts y HTML errático.

## 13. Metacritic

Objetivo:

Solo mantener metacritic_score.

No priorizar:

- metacritic_user_score.
- metacritic_reviews_count.

Scripts relevantes:

- scripts/run-metacritic-weekly-14d.ps1
- scripts/backfill-metacritic-local.mjs
- scripts/backfill-metacritic-score-v2.mjs
- scripts/metacritic-monthly-reseed.mjs

Automatización activa:

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

Si aparecen filas antiguas en processing por más de 24 horas, revisar locked_by antes de resetear. No borrar manual_review.

## 14. Comando de revisión Task Scheduler

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

Clasificación:

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
- triggers.crons vacío.

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

Posible uso futuro:

- checks de disponibilidad.
- juegos eliminados de PlayStation Store.
- validación puntual de store_url.

## 16. Limpieza local realizada

Se limpió:

- logs/psdeals-import-html.
- logs/psdeals-listing-html.
- .next.
- .browser-profiles movido fuera del proyecto.
- Task Scheduler desactivados eliminados.

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

Después de limpieza quedaron aproximadamente 15.42 MB.

No borrar logs pequeños recientes sin revisión.

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
- Solicitar indexación de:
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
- metadata dinámica de slugs.

Validado anteriormente en ejemplos como:

- TEKKEN 8.
- Hydroneer.

## 24. Auth Google

Supabase Auth + Google OAuth está operativo.

Notas:

- En navegador normal puede entrar directo si ya hay sesión Google.
- En incógnito muestra consentimiento/login.
- Botón Create account with Google puede iniciar sesión si la cuenta ya existe.
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
- Revisar si la información ya fue entregada antes de pedirla.
- Validar línea por línea en cambios críticos.
- No priorizar rapidez sobre verificación.
- Si hay más de 4 cambios o riesgo de mezcla, entregar archivo completo.
- No usar ZIP viejo como fuente de verdad si hubo cambios por chat/Git/deploy.
- ZIP 1.8 está muerto/obsoleto.
- No borrar tablas ni data sin inventario.
- No automatizar PSDeals sin revisión.
- Mantener UI pública en inglés.
- No cambiar títulos Home a PS Plus deals solo porque temporalmente haya deals PS Plus.
- No ocultar add-ons por título sin confirmar error real en PlayStation Store.
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

Últimos commits:

    git log --oneline -10

Remotes:

    git remote -v

## 27. Validación manual pre-launch

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
- cards 2 columnas en móvil.
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
- errores de imágenes.
- feedback de usuarios.
- PSDeals/PS Store pricing changes.

## 29. Qué no hacer

No hacer:

- DROP de tablas legacy sin decisión explícita.
- DELETE masivo en metacritic_queue.
- borrar data/import.
- borrar scripts por parecer viejos sin scan de uso.
- publicar SUPABASE_SECRET_KEY.
- subir .env.local.
- cambiar lógica de deals sin comparar PlayStation Store oficial.
- reactivar PSDeals Recently Added 12h sin resolver challenge/captcha.
- tratar worker legacy como flujo principal.
- usar documentación v1.7.
- usar ZIP 1.8.

## 30. Estado final de operaciones

Operación actual estable:

- Deploy por GitHub main.
- Vercel conectado.
- Supabase estable.
- Metacritic Weekly 14d activo.
- PSDeals manual/controlado.
- PlayStation Store oficial usado como validación de deals.
- Worker legacy conservado como referencia.
- Documentación 1.9 en creación.
