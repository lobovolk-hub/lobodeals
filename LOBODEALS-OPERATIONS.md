# LoboDeals 3.2 — Operaciones

Fecha de corte: 2026-08-01

Estado general: `AUDITED_BUT_NOT_REAUTHORIZED`.

Este documento contiene el único procedimiento operativo vigente. Hasta una
autorización visible posterior, todos los comandos reales son referencia
auditada y no permiso de ejecución.

## Preflight obligatorio

1. Confirmar proyecto, rama, HEAD, worktree y divergencia sin fetch.
2. Confirmar que el proyecto remoto, esquema y funciones esperadas coinciden.
3. Confirmar capacidad de Supabase y riesgo de cuotas Vercel.
4. Ejecutar pruebas locales, suites de runners/ended/cache, lint y checks.
5. Crear identidad de ciclo y autorización acotada solo cuando exista permiso.

Abortar ante drift, proyecto dudoso, worktree inesperado, Vercel en riesgo,
listing parcial o falta de rollback/reconciliación.

## Edge/CDP y captcha

Estado: `AUDITED_BUT_NOT_REAUTHORIZED`.

- Usar Microsoft Edge con remote debugging en `127.0.0.1:9222`.
- Johan resuelve el challenge/captcha en la pestaña visible.
- El runner descubre `/json/version` o `DevToolsActivePort`.
- No automatizar captcha ni usar un perfil oculto alternativo.
- Cerrar una instancia anterior solo dentro de una operación autorizada y
  advertida previamente.

## Recently-added

Wrapper: `scripts/run-psdeals-edge-live-recently-added.ps1`.

URL canónica:

`https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc`

El wrapper recolecta, analiza nuevos, bloquea más de 200 faltantes e importa
detalles. Su texto de refresh manual v15 es histórico e incompatible con el
gate v16 actual; por ello el wrapper no está listo.

## Discounts y fast refresh

Wrapper: `scripts/run-psdeals-edge-live-discounts-fast-refresh.ps1`.

URL canónica:

`https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc`

El wrapper recolecta, genera colas `must`, `ps-plus`, `stale`, `skipped` y
`combined`, importa y reintenta una vez. No demuestra por sí solo completitud
fuerte ni integra ended deals/safe demotion; su refresh v15 final está obsoleto.

## Retry, ended deals y safe demotion

- Un único retry de detalle; pendientes después del retry cierran el ciclo.
- `analyze-psdeals-ended-discounts-from-listing-v1.mjs` solo produce evidencia
  y candidates a partir de un listing completo enlazado.
- La aplicación directa de
  `apply-psdeals-ended-discounts-safe-demotion-v1.mjs` está deshabilitada.
- La única dirección aceptable es el RPC receipt-bound del ciclo migrado.
- Monthly, PS Plus ambiguo, identidad dudosa, original ausente, precios
  incoherentes, deal futuro y listing incompleto deben bloquear demotion.

## Caché y validaciones

- No ejecutar el refresh directo v15.
- La caché v16 exige certificación y receipt del ciclo.
- Validar counts, nulls, expirados activos, descuentos extremos, muestras de
  producto, home, catalog, deals y slugs.
- Una escritura de Supabase no invalida automáticamente una página de Next.js;
  la estrategia exacta de ISR se documentará tras la auditoría de Vercel.

## Logs, doble ejecución y fallos

- Mantener outputs acotados bajo `data/import` y logs pequeños; no leer archivos
  de cientos de MB completos.
- Cada etapa debe tener evidencia hash-linked, receipt, estado y conteos.
- Timeout no equivale a fallo ni éxito: reconciliar antes de reintentar.
- Una segunda ejecución debe ser idempotente y no repetir efectos confirmados.
- Ante listing parcial, import incompleto, receipt contradictorio o cache
  fallida, detenerse y conservar evidencia; no avanzar por fecha o proximidad
  de nombres.

## Recovery Refresh — Awaiting Authorization

Estado: `AWAITING_AUDIT_AND_AUTHORIZATION`.

El orden previsto es: preflight → Edge/captcha → recently-added → detalle →
caché intermedia solo si el contrato aprobado la exige → discounts completo →
fast refresh → retry → ended analyzer → detail refresh dudosos → safe
demotion receipt-bound → certificación → caché final v16 → postchecks →
muestras → revisión de Vercel.

No es un comando ejecutable. La auditoría posterior de este paquete debe fijar
responsables, comandos, gates GO/NO-GO, abortos y autorizaciones exactas antes
de considerarlo.
