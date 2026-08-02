# LoboDeals 3.2 — Continuidad

Fecha de corte: 2026-08-02

Este documento permite continuar tras perder un chat. No es un diario. Para
detalle forense usar `docs/audit/**` y Git.

## Cómo retomar

1. Leer los siete documentos canónicos en el orden de `AGENTS.md`.
2. Ejecutar `git status --short --branch`, `git rev-parse HEAD` y
   `git rev-list --left-right --count origin/main...HEAD` sin fetch.
3. Leer `package.json` y ejecutar el baseline local pertinente.
4. No asumir que local, Supabase y producción coinciden.
5. No ejecutar procesos reales ni mutaciones sin autorización visible.

## Decisiones irreversibles

- LoboDeals 3.2 es la única identidad activa.
- Alcance inicial: PlayStation US, PS4/PS5, Games/Bundles/DLC.
- UI pública en inglés; comunicación con Johan en español.
- Actualización diaria mínima, no tiempo real.
- El histórico detallado no se respalda, exporta ni usa para backfill.
- Los mínimos compactos son prospectivos y comienzan vacíos.
- Monthly no es un descuento comercial.
- No crear updaters, simuladores o arquitecturas paralelos.

## Migraciones y capacidad

- 004: ciclo reconciliable y receipts aplicados; recovery acotado preservado en
  `docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30/`.
- 005: certificación cycle-bound aplicada; postcheck aprobado.
- 006: history retirado mediante `DROP ... RESTRICT`; versión
  `20260801030244`; SHA-256
  `e825a88ef811873f16cc48da5685d8e87eb699b5d903bd29ad34025a9630f5e4`;
  postcheck 13/13.
- 007: safe demotion v2 aplicada una sola vez; versión `20260801220321`;
  SHA-256 `d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`;
  postcheck 7/7 y certificado posterior 23/23, 0 blockers. V1 ya no es
  ejecutable por `service_role`; v2 sí, con ACL exacta.
- Database Size: 440.741.011 → 166.841.491 bytes.
- No modificar las migraciones aplicadas 005, 006 o 007.

## Incidentes que no deben repetirse

- PostgreSQL 17 añadió `MAINTAIN` al contrato ACL; comparar la superficie
  completa, no una lista recordada.
- El precheck 006 falló por agrupar un alias sin materializar y luego por
  comparar `name[]` con `text[]`; tipar arrays del catálogo explícitamente.
- El primer intento 006 abortó porque los índices compuestos se modelaron solo
  por su primera key; validar definición estructural completa.
- Supabase MCP puede devolver solo el último result set; usar certificados de un
  statement con salida machine-readable.
- Timeout remoto exige reconciliación; nunca repetir ciegamente.
- La clase Hollow Knight aparece cuando un descuento termina pero el producto
  conserva flags/precios antiguos. Solo listing completo + identidad segura +
  restauración verificable permiten demotion.
- Un refresh manual v15 puede saltarse receipts/certificación; su camino directo
  está bloqueado.

## Checkpoints Git esenciales

- `4f826ac`: retiró la documentación 1.9.
- `d81418b`: último SHA productivo previamente confirmado.
- `9031ece`, `ec10b59`, `3de193f`, `13c3970`, `381db35`: mitigaciones de CPU,
  ISR, robots y sitemap de mayo.
- `91e0159`, `4cbe2f7`, `bf5077a`: runners de recently-added/discounts y fast
  refresh.
- `422926a`, `6de4743`, `193aa33`: retirada 006 y consolidación post-006.
- `d5a7277`, `e2bd081`, `f0ec189`: dry-run, orquestación offline y documentación
  del updater.
- `b97485f`: documentación canónica 3.2.
- `fe2b2c2`: eliminación de fuentes operativas obsoletas.
- `7110174`: auditoría histórica del refresh diario.
- `81c012a`: safe demotion v2 local y migración 007 no aplicada.
- `a92e8fd`: diagnóstico Vercel y estrategia de cache.
- `21e6358`: plan de recovery NO-GO, sin ejecución.
- `e2e7ae8`: validación global del paquete, sin operación remota.
- `03ed523`: endurecimiento 007, recovery y validadores read-only completos.
- `dcf04b6`: runner diario único, 22 adapters y 15 replays integrales.
- `1912f29`: HEAD real y SHA canónico del certificado fijados en los gates live.
- `d1bae03`: gates Edge/CDP y captcha distinguen puerto, pestaña, región,
  challenge y desconexión antes de cualquier adapter.
- `302a97e`: certificado read-only posterior a 007 y su contrato local.
- `b3cf38b`: launcher PowerShell/CDP dedicado y preflight automático de
  challenge, sin Computer Use ni confirmación por chat.
- `d87bda6`: preflight live fail-closed, contratos de 23 etapas, identidad
  intent/UUID, reconciliación create-cycle y evidencia Vercel manual.
- `56c6798`: ownership exacto de ejecutable/perfil/puerto Edge y aislamiento de
  artifacts runtime respecto del lint.

## Estado al iniciar este paquete

- HEAD: `f0ec1899166c08cf4049d763faeb7e5ca095f6bc`.
- `main`, 77 delante / 0 detrás de `origin/main`, sin fetch; worktree limpio.
- 452 pruebas pasan; lint 0 errores/6 warnings.
- Datos públicos no actuales; runners detenidos; Vercel con ISR Writes sobre la
  cuota visible y Active CPU cerca del límite.
- Bloque 4 código listo, operación incompleta; ningún ciclo real.
- Refresh de recuperación, push, deploy y prueba de 30 días no autorizados.

## Evidencia preservada

- Revisión 005/006:
  `docs/audit/lobodeals-3-005-006-adversarial-review-2026-07-30.md`.
- Decisión de retención:
  `docs/audit/lobodeals-3-compact-price-retention-readiness-2026-07-30.md`.
- Auditoría de history:
  `docs/audit/lobodeals-3-price-history-retention-audit-2026-07-29.md`.
- Recovery 004:
  `docs/audit/lobodeals-3-migration-004-scoped-recovery-2026-07-30/README.md`.
- Inventario documental:
  `docs/audit/lobodeals-3.2-document-inventory-2026-08-01.md`.
- Auditoría del flujo diario:
  `docs/audit/lobodeals-3.2-daily-refresh-audit-2026-08-01.md`.
- Safe demotion:
  `docs/audit/lobodeals-3.2-safe-demotion-audit-2026-08-01.md`.
- Aplicación 007:
  `docs/audit/lobodeals-3.2-migration-007-application-2026-08-01.md`.
- Vercel/ISR:
  `docs/audit/lobodeals-3.2-vercel-cache-audit-2026-08-01.md`.
- Validación final:
  `docs/audit/lobodeals-3.2-final-validation-2026-08-01.md`.

Git conserva los documentos eliminados; no recrearlos como fuentes activas.

## Punto de continuación después del Texto 3.2-0026

- Producción observada: deployment `dpl_6Ua5HpBGWf1GczzzzZdE7AL3vHBr`, SHA
  `4f826ac873850d3e61ceb68721512099625f1515`.
- Datos públicos siguen en 2026-06-06; no se ejecutó el recovery.
- Safe demotion v2 está lista, integrada y aplicada mediante la única 007
  `20260801220321`; 0 ciclos y 0 receipts después de aplicar.
- Certificado previo 007 aprobado 23/23, 0 blockers; SHA del certificado:
  `b6ebbc3f46b2ee052a02bfea52bbfc811be38786a4e993f4d51e8996ef277e73`.
- Certificado posterior 007 aprobado 23/23, 0 blockers; SHA del certificado:
  `42cdef8220310d3b396685103aeb54d6881000d5b45dfb710c7c650b67c61a35`.
- Supabase repetido read-only: proyecto `ACTIVE_HEALTHY`, 007 una vez,
  postcheck y certificado posterior aprobados 23/23; cycles, receipts,
  candidates y mínimos en cero, sin drift observable.
- Vercel read-only: deployment productivo `READY`, sin error runtime devuelto ni
  deploy concurrente observado. Evidencia manual de Johan a las 00:41 PET:
  211/240 minutos de CPU y margen 29; válida máximo 180 minutos y de renovación
  obligatoria antes de live.
- Runner: `npm run refresh:daily`; cuatro modos, 23 contratos, 507/507 pruebas,
  15/15 replays y 0 writes. `LIVE_ADAPTER_CONTRACTS_READY=true`, pero
  `LIVE_EXECUTOR_BOUND=false`: los handlers de producción no están en el repo.
- Identidad corregida: `run_intent_id=local-cycle-*` antes del RPC; UUID remoto
  solo después del create/reconcile y ligado a receipts posteriores. No se
  permite prefijar un UUID para una ejecución nueva ni crear un segundo ciclo.
- Edge launcher/captcha están listos en código. La prueba real quedó en HARD
  STOP porque Edge dentro del sandbox no publicó CDP y la elevación de Codex
  ocupó temporalmente 9222 con otro perfil; el launcher abortó de forma segura.
- No se ejecutó el recovery, no se creó ciclo y no se emite Autorización B.
  Próxima tarea exacta: completar adapters de producción y ejecutar el wrapper
  PowerShell en un contexto sin colisión de puerto; luego repetir
  `live-preflight` hasta `READY_FOR_AUTHORIZATION_B`.
