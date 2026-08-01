# LoboDeals 3.2 — Validación global del paquete 3.2-0023

Fecha: 2026-08-01, America/Lima

Alcance: validación local y lecturas remotas read-only ya documentadas. No se
ejecutaron collectors, importadores, runners, Edge/CDP, SQL, writes de
Supabase, refresh de cache, navegación de producción, push ni deploy.

## Resultado

| Validación | Resultado |
|---|---|
| `npm test` final | 464/464 pass |
| Recheck final Bloque 4 + ended/demotion | 14/14 pass |
| Suites enfocadas Bloque 4 | 18/18 pass |
| Suites enfocadas runners | 43/43 pass |
| Suites enfocadas fast refresh | 18/18 pass |
| Suites enfocadas ended/demotion | 11/11 pass |
| Suites enfocadas cache/certification | 34/34 pass |
| `node --check` | 107/107 archivos `.mjs` |
| `npm run lint` | 0 errores, 6 warnings conocidos |
| `git diff --check` | pass |
| `git diff --cached --check` | pass al preparar el checkpoint |
| Patrones de secretos en archivos tracked | 0 matches |
| Referencias activas a archivos eliminados | 0 fuera de inventarios históricos |
| Paths citados por documentación activa | 0 rotos |
| Valor falso del gate de migración 006 | 0 matches tracked |
| Build | no ejecutado: no cambió Next.js/TypeScript de producción |

Las suites enfocadas pueden compartir algún archivo con otra categoría; sus
conteos prueban cada ejecución, no deben sumarse como casos únicos.

## Warnings de lint preservados

- `app/catalog/page.tsx`: `total_count` no usado.
- `app/page.tsx`: `total_count` y `count` no usados.
- `app/us/playstation/[slug]/page.tsx`: `siteUrl` no usado.
- `components/fallback-game-image.tsx`: `<img>` deliberado/pendiente.
- `scripts/analyze-psdeals-ended-discounts-from-listing-v1.mjs`:
  `chunkArray` no usado.

No se mezclaron correcciones ajenas a la misión para silenciar warnings
preexistentes.

## Revisión documental y de scripts

- Los siete documentos canónicos están listados por `AGENTS.md`; README solo
  dirige a ellos y `CLAUDE.md` conserva el contrato de compatibilidad.
- Versiones 1.9, 2.x, 3.0 y 3.1 solo aparecen en contexto histórico explícito.
- Los seis archivos eliminados en el paquete no tienen referencias activas;
  los inventarios registran deliberadamente sus nombres como evidencia.
- Los dos wrappers PSDeals históricos se conservan, pero Operations los marca
  incompatibles y prohíbe usarlos como sustituto del runner.
- `package.json` solo ofrece dev/build/start/lint/test y tres comandos locales
  offline; no expone un runner operacional.
- El mapa de Bloque 4 enlaza safe demotion a selector, SQL 004, migración 007 y
  las pruebas v2. El inventario de scripts identifica v2 como reemplazo actual.
- No existe suite documental dedicada; las referencias se validaron mediante
  scanner read-only de paths activos y búsquedas Git.

## Checkpoint de seguridad

- `PUBLIC_DATA_CURRENT=false`
- `DAILY_RUNNER_READY=false`
- `COMPACT_MINIMA_READY=false`
- `BLOCK_4_COMPLETE=false`
- `LIVE_CYCLE_READY=false`
- `THIRTY_DAY_TRIAL_READY=false`
- `RECOVERY_REFRESH_EXECUTED=false`

La suite completa prueba código local y fakes. No convierte migración 007 en
aplicada, no demuestra un runner real y no autoriza un ciclo.

## Recheck correctivo posterior a `e2e7ae8`

Una revisión final corrigió tres inconsistencias documentales sin cambiar
código productivo: el nombre fantasma del analyzer recently-added se sustituyó
por `scripts/analyze-psdeals-listing-new-v2.mjs`, el roadmap recuperó el orden
Vercel → recovery → runner y la auditoría ISR dejó de tratar cada deployment
como una purga automática. También precisó que ISR Writes se factura en
unidades de 8 KB y actualizó la muestra read-only posterior al deployment.

- `npm test`: 464/464.
- Bloque 4: 18/18.
- Runners y fast refresh: 58/58.
- Ended deals y safe demotion: 11/11.
- Cache y certificación: 61/61.
- `node --check`: 107/107 archivos `.mjs`.
- Lint: 0 errores y 6 warnings conocidos.
- Secret scan tracked: 0 archivos.
- Paths literales en los ocho documentos activos: 0 inexistentes.
- Referencias activas al analyzer fantasma: 0.
- Valor falso del gate de migración 006: 0 matches tracked.

El inventario conserva deliberadamente nombres de archivos eliminados para
explicar su clasificación; esas menciones históricas no son enlaces operativos
ni referencias entrantes desde las fuentes activas.
