# LoboDeals — STATE v2.52l

## Versión actual

**v2.52l**

> Nota:
> Esta sigue siendo la referencia operativa local/documental actual.
> La subversión solo se incrementa cuando haya deploy real a Vercel.

## Stack

- Next.js App Router
- Supabase
- Vercel
- Cloudflare Workers
- Windows 11
- Visual Studio Code

## Regla principal de trabajo

- **No asumir nada.**
- Siempre verificar tablas, columnas, rutas, código y estado real antes de proponer cambios.
- Cuando se propongan cambios, preferir **archivo completo** y no parches ambiguos.
- Antes de decir que algo “debería” pasar, comprobar con evidencia.
- Si hay duda sobre DB, API, cache, cron, worker, columnas o tablas: **inspeccionar primero**.

## Regla de versionado

- Solo subir subversión cuando haya **deploy a Vercel**.
- Ejemplo:
  - `v2.52l` → `v2.52m`
  - `v2.52m` → `v2.52n`
  - `v2.52n` → `v2.53`
- No subir versión por cambios locales no desplegados.

---

## Resumen del proyecto

LoboDeals está en fase **PC / Steam first**.

Objetivo actual:

- consolidar una web seria y premium de catálogo/ofertas de Steam para PC
- cerrar bien Steam antes de pensar en otras plataformas
- mantener inventario canónico sólido
- mantener precios lo más actualizados posible
- tener browse visible coherente y conectado
- tener fichas premium consistentes
- y después abrir fases específicas adicionales como Metacritic y expansión futura

### Modelo actual del producto

- `/pc` = capa principal de **games**
- `/catalog` = inventario amplio Steam de **games + dlc + software**
- `/pc/[slug]` = ficha premium canónica por juego
- `pc_games` = inventario/base canónica Steam PC
- `pc_store_offers` = precios/ofertas actuales
- `pc_game_screenshots` = screenshots cacheados
- `pc_public_catalog_cache` = browse público visible de `/pc`
- `catalog_public_cache` = browse público visible de `/catalog`

---

## Método de trabajo esperado para el nuevo chat

El nuevo chat debe trabajar así:

1. **No asumir nunca** tablas, columnas, rutas, funciones, jobs o comportamiento.
2. Verificar primero con:
   - código real
   - SQL real
   - logs reales
   - respuestas reales de APIs
3. Cuando proponga cambios:
   - preferir **archivo completo**
   - o bloque SQL completo
   - evitar “edita esta parte” sin contexto claro
4. Si detecta algo raro:
   - primero diagnosticar
   - luego proponer fix
5. Evitar respuestas rápidas con inferencias no comprobadas.
6. Mantener coherencia con esta versión `v2.52l`.

---

## Estado operativo actual

### Cloudflare Workers activos

#### 1) `lobodeals-price-backfill`

- Activo
- Cron: `*/30 * * * *`
- Endpoint:
  - `/api/internal-backfill-steam-prices`
- Body actual:
  - `iterations: 5`
  - `batchSize: 25`
  - `scope: "visible"`

#### 2) `lobodeals-refresh`

- Activo
- Cron: `15,45 * * * *`
- Endpoint:
  - `/api/internal-enrich-steam-appdetails`
- Body actual:
  - `iterations: 4`
  - `batchSize: 25`

### Hallazgo operativo importante

Antes, `lobodeals-refresh` y `lobodeals-price-backfill` estaban corriendo al mismo minuto.  
Eso causaba timeouts/interferencia.

Se corrigió separando el cron de `lobodeals-refresh` a:

- `15,45 * * * *`

Con ese cambio:

- `lobodeals-refresh` volvió a responder bien
- el enrich priorizado volvió a funcionar en producción

### Supabase jobs

Los jobs internos de Supabase siguen sin ser el camino operativo principal.

La operación importante actual está recayendo en:

- Cloudflare Workers
- endpoints internos
- refresh manual/expreso de caches públicas cuando haga falta

---

## Qué ya quedó estable

### 1) Backfill de precios US visible

El endpoint `/api/internal-backfill-steam-prices` quedó funcional para visibles.

Estado:

- encuentra candidatos stale/missing
- actualiza precios
- actualiza ofertas US
- dejó de quedarse en `processed: 0`

### 2) Enrich priorizado para visibles

El endpoint `/api/internal-enrich-steam-appdetails` quedó funcional con priorización real.

Se corrigió:

- selección priorizada de candidatos visibles
- timeout inicial del RPC con una versión más ligera
- deduplicación de screenshots antes del insert
- manejo correcto de screenshots repetidos
- estabilidad local y en producción

### 3) Choque de cron entre workers

Se detectó que refresh + price backfill simultáneos generaban timeout.  
Se corrigió separando cron del refresh.

### 4) Caso `Depths Of Horror: Mushroom Day`

Se corrigió:

- `discount_percent`
- `is_free_to_play`
- coherencia entre offer real y cache pública
- badges/estado engañoso de “free” o descuentos viejos

### 5) Top Rated

Se detectó que:

- Monster Hunter Rise sí estaba bien enriquecido
- sí tenía Metacritic correcto
- pero Top Rated solo mostraba una página por una implementación incorrecta

Se corrigió el flujo de Top Rated para que:

- use browse paginado real
- soporte orden por Metacritic
- deje de comportarse como una lista fija de una sola página

### 6) Fichas individuales premium

Las fichas individuales de muchos juegos ya están mostrando:

- screenshots
- precios
- release date
- metacritic (cuando existe)
- aspecto visual premium

### 7) `/home` y `/pc` quedaron mucho más alineados

Se unificó la lógica visible de secciones principales para que `/home` y `/pc` compartan una misma base de criterio.

Resultado esperado actual:

- Best Deals ya no debe sentirse igual a Biggest Discounts
- Latest Discounts debe mostrar solo descuentos reales
- Latest Releases no debe mostrar futuros
- Top Rated debe mantener mucha más coherencia entre home y `/pc`

---

## Qué se descubrió y se corrigió durante la limpieza

### 1) La base seguía viva, pero la capa pública visible estaba congelada

Se comprobó con evidencia que:

- `pc_games`
- `pc_store_offers`
- `pc_game_screenshots`

seguían actualizándose con workers activos, pero:

- `pc_public_catalog_cache`
- `catalog_public_cache`

no se estaban reconstruyendo automáticamente con frescura reciente.

### 2) Refresh público útil actual

El refresh público útil y vigente quedó así:

#### Refresh válido para `/pc`
```sql
select public.refresh_pc_public_catalog_cache();