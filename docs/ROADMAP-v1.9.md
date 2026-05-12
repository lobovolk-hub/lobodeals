# ROADMAP v1.9 — LoboDeals — 2026-05-11

## 1. Estado actual

LoboDeals 1.9 es la etapa de limpieza, documentación y handoff posterior al deploy público inicial.

La web ya está viva:

- https://lobodeals.com
- https://www.lobodeals.com redirige a https://lobodeals.com
- https://lobodeals.vercel.app disponible como dominio Vercel

La experiencia visual de PC y móvil fue revisada y confirmada como perfecta para launch.

No se requieren más cambios visuales inmediatos.

## 2. Bloques cerrados

### 2.1 Deploy público inicial — Listo

- GitHub main conectado a Vercel.
- Deploy automático por git push restaurado.
- Dominio lobodeals.com activo.
- www redirige a dominio principal.
- Build validado.

### 2.2 UX responsive post-deploy — Listo

Cerrado:

- Header desktop.
- Header mobile.
- Search en header.
- Mobile menu.
- Home.
- Carrusel.
- Catalog.
- Deals.
- Tracked.
- Profile.
- Login.
- Slug pages.
- Cards 2 columnas en móvil.
- Filtros desplegables.
- Cierre de dropdowns al tocar fuera.

### 2.3 SEO básico técnico — Listo

Activo:

- robots.txt.
- sitemap.xml.
- canonical sin www.
- metadata base.
- metadata dinámica en slugs.

Pendiente externo:

- Search Console.

### 2.4 Pricing/deals critical audit — Listo

Cerrado:

- PSDeals no se usa ciegamente para publicar deals.
- PlayStation Store oficial se usa como allowlist/validación para deals actuales.
- official_ps_store_deals tiene 44 rows.
- catalog_public_cache publica deals oficiales matcheados.
- Falsos descuentos corregidos.

Regla:

No revertir la lógica de deals sin revisar la auditoría crítica de mayo 2026.

### 2.5 Limpieza local — Listo

Realizado:

- Inventario local.
- Limpieza de HTML crudo pesado en logs.
- Eliminación de .next.
- Revisión y conservación de data/import.
- Movimiento de .browser-profiles a backup local.
- Revisión de worker.
- Revisión de Task Scheduler.
- Build post-cleanup validado.

### 2.6 Windows Task Scheduler — Listo

Se mantiene activa:

- LoboDeals - Metacritic Weekly 14d.

Se eliminaron:

- LoboDeals - Metacritic Monthly.
- LoboDeals - PSDeals Recently Added 12h.

### 2.7 Supabase cleanup review — Listo

Realizado:

- Row counts.
- Clasificación de tablas.
- Revisión de legacy PlayStation Store.
- Revisión de official_ps_store_deals.
- Revisión de metacritic_queue.
- Reset de 211 stale locks de processing a pending.

No se borraron tablas.

### 2.8 Documentación vieja — Listo

Se eliminaron docs viejos v1/v1.6/v1.7 tras extraer referencias útiles.

Se mantiene:

- docs/audit-v1.9

## 3. Documentación 1.9

Documentos creados:

- STATUS-v1.9.md — Listo
- SYSTEM-MAP-v1.9.md — Listo
- DB-SNAPSHOT-v1.9.md — Listo
- OPERATIONS-v1.9.md — Listo

Pendientes:

- ROADMAP-v1.9.md — En curso
- HANDOFF-v1.9.md
- NEW-CHAT-PROMPT-v1.9.md

## 4. Próximo bloque inmediato

### 2.11.8 Documentación final 1.9 — En curso

Objetivo:

Crear documentación fresca y completa para evitar depender del ZIP 1.8 o de docs viejos.

Orden:

1. STATUS-v1.9.md — Listo
2. SYSTEM-MAP-v1.9.md — Listo
3. DB-SNAPSHOT-v1.9.md — Listo
4. OPERATIONS-v1.9.md — Listo
5. ROADMAP-v1.9.md — En curso
6. HANDOFF-v1.9.md — Pendiente
7. NEW-CHAT-PROMPT-v1.9.md — Pendiente

Criterio de cierre:

- Todos los documentos existen.
- No hay documentos viejos coexistiendo fuera de audit-v1.9.
- Build sigue pasando.
- Git status queda limpio tras commit final.
- Handoff permite migrar a nuevo chat sin perder contexto.

## 5. Después de documentación

### 2.12 Search Console / indexación — Pendiente

Tareas:

- Crear o revisar propiedad en Google Search Console.
- Verificar dominio o URL prefix.
- Enviar sitemap:
  https://lobodeals.com/sitemap.xml
- Solicitar indexación de:
  - /
  - /catalog
  - /deals
  - slugs clave
- Revisar que Google no muestre snippets viejos de Steam.
- Monitorear cobertura.

Prioridad:

Alta después del handoff 1.9.

## 6. Launch soft

### 2.13 Launch soft — Pendiente

Objetivo:

Compartir LoboDeals de forma limitada antes de anuncio amplio.

Validar con usuario real o cuenta secundaria:

- Home.
- Catalog.
- Deals.
- Search.
- Slugs.
- Login.
- Registro.
- Google OAuth.
- Profile.
- Tracked.
- Track/Tracked.
- Responsive mobile.
- Links a PlayStation Store.

Monitorear:

- Vercel logs.
- Supabase Auth users.
- Supabase table growth.
- Errores en slugs.
- Errores en imágenes.
- Feedback inicial.

## 7. Post-launch corto

### 2.14 Monitoreo post-launch — Pendiente

Tareas:

- Revisar Search Console.
- Revisar indexación inicial.
- Revisar errores 404.
- Revisar Vercel logs.
- Revisar Supabase Auth.
- Revisar feedback del usuario.
- Corregir bugs puntuales.

Regla:

No abrir mejoras grandes antes de confirmar estabilidad básica.

## 8. Próximas mejoras funcionales

### 2.15 /tracked mejorado — Pendiente

Idea:

Separar tracked en dos grupos:

- Currently on deal.
- Regular prices.

Objetivo:

Que el usuario vea primero sus juegos trackeados que están actualmente en descuento.

No implementado aún.

### 2.16 PS Plus Monthly Games — Roadmap futuro

Idea:

Crear capa separada de /deals para juegos mensuales de PS Plus Essential.

Flujo futuro:

- Verificar una vez al mes el listado oficial de juegos mensuales.
- Hacer match contra slugs existentes.
- Mostrar sección en Home.
- Permitir marcar como redeemed/claimed.
- Guardar en perfil del usuario.
- Calcular ahorro estimado acumulado.

No implementar ahora.

### 2.17 Google Ads layout — Roadmap futuro

Idea:

Aprovechar espacios laterales en desktop y placements cuidadosos en mobile.

Regla:

No romper UX actual.

Revisar después de Search Console / launch soft.

### 2.18 Automatización PSDeals estable — Roadmap futuro

Objetivo:

Diseñar flujo robusto para:

- Recently added.
- Discounts.
- Detail refresh.
- Nuevos precios.
- Nuevos ingresos.
- Upcoming/preorders.
- Juegos removidos o no disponibles.

Estado actual:

PSDeals Recently Added 12h no está activo.

Motivo:

Se pausó para evitar automatizar a ciegas ante challenge/captcha y HTML cambiante.

Pendiente:

- Diseñar estrategia estable.
- Evaluar Edge live/CDP.
- Evaluar infraestructura futura.
- Mantener scraping local por ahora, pero considerar escalabilidad.

### 2.19 Juegos removidos de PlayStation Store — Roadmap futuro

Problema:

PlayStation puede eliminar juegos o cambiar disponibilidad.

Posible solución futura:

- Checks periódicos de store_url.
- Status de disponibilidad.
- Diferenciar unavailable, delisted, error temporal, región no disponible.
- No borrar datos históricos.
- Mostrar estado si aplica.

Fuentes posibles:

- PlayStation Store oficial.
- Worker legacy como referencia.
- Validaciones puntuales.

No implementar ahora.

### 2.20 Historical low / price intelligence — Roadmap futuro

Usar psdeals_stage_price_history para:

- Historical low.
- Price trend.
- Alertas.
- Mejor ranking de deals.
- Diferenciar precio base menor vs descuento real.
- Estadísticas por usuario.

No implementar antes de estabilizar launch.

## 9. Mejoras de catálogo futuras

Pendientes potenciales:

- Refinar búsqueda tolerante.
- Mejorar ranking de resultados.
- Mejorar agrupación game/bundle/add-on.
- Revisión de slugs problemáticos.
- Mejor fallback de imágenes.
- Multi-region.
- Xbox.
- Nintendo.
- Apps Android/iOS.

No abrir antes del launch soft.

## 10. Reglas de pricing/deals

Reglas vigentes:

- PSDeals es fuente principal histórica.
- PlayStation Store oficial valida deals actuales.
- official_ps_store_deals funciona como allowlist.
- No publicar falsos descuentos.
- No cambiar títulos de Home a PS Plus deals solo porque temporalmente solo haya deals PS Plus.
- Mantener títulos:
  - Top rated discounts by Metacritic.
  - Highest discounts.

Razón:

La marca representa mejores ofertas en general, no solo PS Plus.

## 11. Reglas de visibilidad pública

No ocultar add-ons por título.

No ocultar por solo contener palabras como:

- avatar.
- music pack.
- music track.
- SHAREfactory.
- addon.
- bundle.

Regla:

Solo ocultar ítems específicos si se confirma que su PlayStation Store URL carga como error real o no tiene sentido público.

Antes de cambiar filtros importantes, discutirlo explícitamente.

## 12. Reglas de trabajo

Reglas obligatorias:

- Indicar apartado exacto del roadmap.
- Marcar Listo al cerrar apartados.
- Validar línea por línea en cambios críticos.
- No priorizar rapidez sobre verificación.
- No pedir información ya entregada.
- No usar ZIP viejo si hubo cambios por chat/Git/deploy.
- ZIP 1.8 está muerto.
- Fuente de verdad: local/Git/deploy post limpieza 1.9.
- No borrar data/scripts/tablas sin inventario.
- Si hay más de 4 cambios o riesgo de mezcla, entregar archivo completo.
- UI pública en inglés.
- Conversación con usuario en español.
- No automatizar PSDeals a ciegas.

## 13. Orden recomendado desde aquí

1. Terminar ROADMAP-v1.9.md.
2. Crear HANDOFF-v1.9.md.
3. Crear NEW-CHAT-PROMPT-v1.9.md.
4. Validar docs existentes.
5. Decidir si docs finales v1.9 se versionan en Git o quedan locales.
6. npm run build si hubo cambios de código.
7. git status.
8. commit de documentación/cleanup si corresponde.
9. Search Console.
10. Launch soft.

## 14. Estado final del roadmap

LoboDeals 1.9 está en cierre de documentación.

El siguiente hito real después del handoff es:

    Search Console + Launch soft

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
