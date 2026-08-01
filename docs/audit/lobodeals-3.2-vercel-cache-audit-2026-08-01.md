# LoboDeals 3.2 — Auditoría de Vercel, ISR y Active CPU

Fecha de corte: 2026-08-01, America/Lima

Alcance: código local, historia Git y lecturas remotas de Vercel. No se hizo
fetch, deploy, cambio de configuración, navegación pública, warm-up ni
invalidación de caché.

## Dictamen

- `ISR_WRITE_SOURCE_IDENTIFIED=true` — atribución arquitectónica con alta
  confianza; no existe desglose facturable exacto por ruta.
- `ACTIVE_CPU_SOURCE_IDENTIFIED=true` — fuentes principales identificadas con
  alta confianza; no existe desglose de segundos por ruta.
- `DAILY_REFRESH_SAFE_FOR_VERCEL=false` — el refresh de Supabase no genera ISR
  por sí solo, pero la operación completa no se aprueba mientras la ventana
  visible exceda ISR Writes y Active CPU esté cerca del límite.
- `CACHE_STRATEGY_APPROVED_LOCALLY=true` — diseño aprobado, no implementado ni
  desplegado.
- `DEPLOY_FIX_REQUIRED_BEFORE_REFRESH=false` — un deploy no es requisito causal
  para actualizar Supabase y, en el estado actual, puede recrear cachés. Esta
  gate no autoriza el refresh: permanecen NO-GO de runner, demotion y cuota.

La fuente más probable de los 304K ISR Writes es la ruta de detalle
`/us/playstation/[slug]`: es estática bajo demanda, acepta slugs no
pregenerados y mantiene una entrada de caché por path. Un slug nuevo para un
deployment produce su primera generación al recibir una solicitud; un slug ya
generado puede regenerarse, también por solicitud, después de 86.400 segundos.
El catálogo conocido contiene 32.890 filas, por lo que crawling amplio,
revisitas después del TTL y nuevos deployments multiplican entradas y
regeneraciones. La ventana de 30 días incluye el periodo previo a las últimas
mitigaciones y al fix Unicode.

`/catalog` y `/deals` no son ISR en el deployment observado: el build las
clasifica dinámicas. Sus consultas server-side por cada request, junto con las
generaciones/regeneraciones de slugs y sus consultas repetidas, son las fuentes
principales de Active CPU. El proxy no intercepta las rutas públicas y no es
la explicación.

## Métricas disponibles

Las siguientes cifras fueron aportadas por Johan para “Last 30 days” al 1 de
agosto. El conector read-only disponible no expone el panel de uso, por lo que
no se verificaron independientemente:

| Métrica | Uso visible | Lectura |
|---|---:|---|
| Fast Data Transfer | 2,32 / 100 GB | amplio margen |
| Fast Origin Transfer | 4,74 / 10 GB | 47,4% |
| Edge Requests | 336K / 1M | 33,6% |
| Edge Request CPU | 31s / 1h | amplio margen |
| ISR Reads | 233K / 1M | 23,3% |
| ISR Writes | 304K / 200K | 152%; sobre la cuota visible |
| Function Invocations | 160K / 1M | 16% |
| Fluid Active CPU | 3h22m / 4h | 84,2% |
| Fluid Provisioned Memory | 27,9 / 360 GB-h | amplio margen |

Los runtime logs consultables son eventos retenidos, no el total facturable de
requests. No deben compararse numéricamente con 304K.

## Producción observada read-only

- Proyecto: `lobodeals`, ID `prj_xi25eHLsj4DNb9zy7P0v64xM4W1I`.
- Team: `team_jGoo6NusUUoD1KzoFi2rEcCj`.
- Deployment productivo READY:
  `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`.
- Git SHA: `4f826ac873850d3e61ceb68721512099625f1515`.
- Next.js 16.2.12, Turbopack, Node.js 24.x, región `iad1`.
- El build contiene tres Node lambdas.
- Aliases observados:
  `lobodeals.com`, `www.lobodeals.com`, `lobodeals.vercel.app`,
  `lobodeals-lobovolk-hubs-projects.vercel.app` y
  `lobodeals-git-main-lobovolk-hubs-projects.vercel.app`.

El deployment restauró el build cache del deployment anterior
`dpl_FHhLSmHv6C1m1GYCtk3TwPXeCWz4`, pero desplegó el SHA posterior `4f826ac`.
Los cambios locales de este paquete no están desplegados.

## Clasificación real del build productivo

El build remoto del SHA productivo mostró:

| Ruta | Build | Código relevante | Efecto |
|---|---|---|---|
| `/` | estática, revalidate 1h | `revalidate=3600` | ISR acotado a home |
| `/catalog` | dinámica | `searchParams`; RPC Supabase | función en cada request |
| `/deals` | dinámica | `searchParams`; query Supabase | función en cada request |
| `/us/playstation/[slug]` | estática bajo demanda | `force-static`, `dynamicParams=true`, `revalidate=86400` | caché por slug y regeneración request-driven |
| `/sitemap.xml` | estática, revalidate 1d | solo tres URLs | contribución ISR pequeña |
| `/robots.txt` | estática | metadata route | sin CPU por request de app |
| `/login`, `/profile`, `/tracked` | dinámicas | auth/datos por usuario | funciones de tráfico autenticado |
| `/auth/callback` | dinámica | route handler | función solo en callback |

`next.config.ts` no activa Cache Components. En el modelo instalado, leer el
prop `searchParams` hace dinámica a toda la page. Por eso `revalidate=900` y
`fetchCache='force-cache'` en catálogo/deals no los convierten en ISR. No se
encontraron `generateStaticParams`, `revalidatePath`, `revalidateTag`,
`unstable_cache`, `no-store` ni invalidaciones masivas en la app.

## Consultas y coste por render

- Home ejecuta siete lecturas Supabase en paralelo por generación: cinco
  queries de `catalog_public_cache` y dos RPCs de búsqueda.
- Catalog ejecuta un RPC server-side por combinación de search params y por
  request.
- Deals ejecuta una consulta server-side con count y datos por request.
- Cada generación de slug ejecuta una lectura de cache para metadata y entre
  tres y cinco lecturas para la página: cache, stage, relaciones y, si aplica,
  stage/cache de relacionados. El máximo observable en código es seis llamadas
  Supabase por generación contando metadata.
- El cliente de tracking puede hablar directamente con Supabase desde el
  navegador; eso no explica Fluid Active CPU de una Function.
- `proxy.ts` solo coincide con callback, profile y tracked; no añade CPU a home,
  catálogo, deals ni slugs públicos.

## Evidencia de runtime

Para el deployment productivo y los cinco días posteriores se observaron 42
eventos con ruta entre los grupos visibles: 30 en slugs, 8 en catálogo y 4 en
deals. Por source se observaron 30 eventos `cache` y 40 `function` entre los
grupos visibles. Son muestras de logs, no totales de uso, pero confirman que la
superficie slug domina el tráfico de caché observado.

En la consulta histórica de errores, el cluster principal fue:

```text
TypeError: Invalid character in header content ["x-next-cache-tags"]
```

Tuvo 120 ocurrencias agrupadas, 57 usuarios afectados y ruta
`/us/playstation/[slug]`, con última observación el 26 de julio. Los errores se
concentraron en slugs Unicode. Los commits `d81418b` y `4f826ac` contienen el
fix de encoding y el deployment del 27 de julio. La lectura read-only de los
cinco días posteriores devolvió cero errores de runtime. Por ello:

- que el fallo histórico afectó la escritura/regeneración de slugs: `PROVEN`;
- que el SHA actual eliminó el error observado desde el deployment:
  `HIGH_CONFIDENCE`, no prueba matemática de ausencia futura;
- que reintentos del fallo explican una parte material de 304K:
  `POSSIBLE`; no existe contador de writes por error.

## Causas clasificadas

| Causa | Clasificación | Evidencia y límite |
|---|---|---|
| Entrada/regeneración ISR individual por slug | `PROVEN` | Configuración local, build productivo y eventos cache de la ruta |
| Crawling/revisitas sobre un universo de 32.890 slugs | `HIGH_CONFIDENCE` | cardinalidad, `dynamicParams=true`, logs con muchos paths únicos; faltan UA/host |
| TTL de 24h de slugs | `PROVEN` | `revalidate=86400`; requiere una visita posterior al vencimiento |
| Primer request de un slug tras deployment | `PROVEN` | no hay `generateStaticParams`; la ruta se genera bajo demanda |
| Deployments como multiplicador de primeras generaciones | `POSSIBLE` | cada deployment tiene outputs/cachés propios; no hay desglose facturable |
| Errores Unicode previos como multiplicador | `POSSIBLE` | error probado; cantidad de ISR Writes inducidos no observable |
| Home como fuente principal de 304K | `RULED_OUT` | una sola ruta, TTL 1h y un evento de ruta observado |
| Sitemap actual como fuente principal | `RULED_OUT` | solo `/`, `/catalog`, `/deals`; TTL diario |
| Catalog/deals como ISR | `RULED_OUT` | build productivo los clasifica dinámicos |
| Invalidación masiva desde código | `RULED_OUT` | no hay APIs de invalidación en el repositorio productivo |
| Refresh Supabase como invalidación automática | `RULED_OUT` | no existe enlace/push de Supabase hacia Next ISR |
| Crawling específico de aliases `.vercel.app` | `NOT_OBSERVABLE` | aliases existen, pero los logs disponibles no exponen Host/User-Agent |
| Catalog/deals como Active CPU | `PROVEN` | build dinámico y queries server-side por request |
| Generación ISR de slug como Active CPU | `PROVEN` | generación server-side y hasta seis lecturas Supabase |
| Slugs como mayor componente exacto de CPU | `HIGH_CONFIDENCE` | dominan eventos observados, sin segundos CPU por ruta |
| Proxy público como fuente principal de CPU | `RULED_OUT` | matcher excluye rutas públicas |

## Respuestas obligatorias

1. **Fuente de 304K:** slugs ISR individuales, amplificados por crawling,
   revisitas después de 24h y deployments; `HIGH_CONFIDENCE`.
2. **Rutas:** principalmente `/us/playstation/[slug]`; home y sitemap aportan
   poco. Catalog/deals no escriben ISR en el build observado.
3. **Qué activa un write:** primera visita a un path no generado o
   regeneración iniciada por una visita después del TTL; un deploy crea un
   nuevo conjunto de outputs.
4. **Slugs individuales:** sí, una entrada por path solicitado.
5. **Frecuencia:** primera solicitud por deployment y, luego, como máximo una
   regeneración tras cada ventana de 24h cuando exista otra solicitud; no es un
   cron autónomo.
6. **Active CPU:** renders dinámicos de catalog/deals/auth y generaciones de
   slugs con varias queries; el peso exacto no es observable.
7. **Refresh Supabase invalida páginas:** no.
8. **Refresh de caché pública produce ISR:** no por sí solo.
9. **Cuándo cambian páginas:** catalog/deals leen en cada visita; home y slugs
   cambian cuando una visita provoca su generación/regeneración. Sin visita no
   hay ISR temporal autónomo.
10. **Crawling `.vercel.app`:** los aliases aceptan tráfico, pero Host/User-Agent
    no se observan; crawling concreto queda `NOT_OBSERVABLE`.
11. **Sitemap/robots:** sitemap limita descubrimiento a tres URLs y robots
    bloquea `/us/playstation/`; reducen bots conformes. No borran URLs ya
    descubiertas ni detienen bots no conformes, y no prueban protección por
    hostname.
12. **Slugs sin ISR por producto:** sí técnicamente como render dinámico, pero
    trasladaría el coste a CPU. La estrategia aprobada desacopla precio diario
    y shell SEO para evitar regeneración diaria por producto.
13. **Home/catalog/deals diarios:** sí. Home puede usar TTL de 24h; catalog y
    deals pueden servir un snapshot diario/capa de datos versionada sin SSR por
    cada filtro.
14. **Cambios mínimos:** no hacer warm-up; ampliar home a 24h; separar datos
    volátiles de slugs; deduplicar queries; convertir catalog/deals a shell
    estable con datos diarios; consolidar aliases al dominio canónico.
15. **Impacto del recovery:** cero ISR al escribir Supabase. Después, catalog y
    deals reflejan datos en sus siguientes requests; home en su siguiente
    regeneración y cada slug en su propia regeneración. Warm-up masivo sería
    inseguro y queda prohibido.

## Estrategia de caché aprobada localmente

Objetivo: una actualización diaria visible sin generar 32.890 páginas cada
día ni convertir todo el catálogo en Functions.

1. **Durante recuperación:** no navegar ni calentar slugs masivamente; no usar
   `generateStaticParams` con el catálogo; no invalidar paths por lote.
2. **Observar antes de tocar producción:** esperar una ventana post-`4f826ac`
   suficiente y revisar ISR Writes, Active CPU, rutas y errores. El valor de 30
   días contiene comportamiento anterior a las mitigaciones.
3. **Home:** cambiar en un deploy futuro de 1h a 24h, o a invalidación única
   ligada al receipt final cuando exista un runner seguro. Nunca por producto.
4. **Catalog y deals:** ofrecer un shell estable y un snapshot diario común;
   filtros/paginación deben leer la cache pública sin ejecutar SSR costoso por
   cada request. No crear una entrada server-cache por combinación ilimitada.
5. **Slugs:** separar identidad/SEO estable de precio/estado volátil. Mantener
   shell y metadata con TTL largo, retirar precios volátiles de metadata y
   cargar el precio diario desde `catalog_public_cache` mediante una lectura
   pública acotada. Así la promesa diaria no depende de regenerar el HTML de
   cada producto.
6. **Costo de slug residual:** si se conserva generación estática bajo demanda,
   compartir la consulta entre metadata/page y consolidar relaciones para
   reducir de hasta seis lecturas a una o dos. Usar TTL largo; cero warm-up.
7. **SEO:** conservar canonical a `lobodeals.com`; publicar solo un conjunto
   acotado y deliberado de slugs en sitemap cuando se reactive su indexación.
   No volver a enumerar 32.890 URLs sin presupuesto medido.
8. **Aliases:** preferir redirect de dominio gestionado por Vercel hacia el
   canonical; no ampliar el matcher del proxy solo para redirigir y gastar CPU.
9. **Verificación:** comparar siete días antes/después por ruta. Fallo de
   runtime, crecimiento diario incompatible con cuota o Active CPU sin margen
   revierte el cambio o mantiene el NO-GO.

La estrategia requiere cambios y un deploy futuro para obtener todo el ahorro,
pero no un deploy previo meramente para que Supabase pueda actualizarse. No se
ha implementado porque este paquete prohíbe cambios con efecto desplegado.

## Gate operativo para el recovery

Vercel no abre todavía el recovery. Para cambiar
`DAILY_REFRESH_SAFE_FOR_VERCEL` a `true` deben cumplirse simultáneamente:

- ventana post-fix que muestre ISR Writes dentro de presupuesto y CPU con
  margen, o aprobación explícita de capacidad/spend;
- cero warm-up y cero invalidación masiva;
- monitoreo read-only antes y después;
- abortar si la cuota indica riesgo inmediato de pausa.

Esto es independiente de los blockers ya existentes: runner roto, migración
007 no aplicada, demotion no integrada y cache v16 no ejecutable end-to-end.
