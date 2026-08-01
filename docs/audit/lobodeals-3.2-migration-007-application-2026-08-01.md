# LoboDeals 3.2 — Aplicación controlada de migración 007

Fecha: 2026-08-01, America/Lima

## Alcance autorizado

Autorización A consumida exclusivamente para aplicar
`sql/007-lobodeals-3-safe-demotion-hardening.sql` en el proyecto Supabase
`vlxkoprpobfevxefizwr`, ejecutar sus validaciones read-only y documentar el
checkpoint. No se ejecutaron demotions, collectors, imports, ciclos, receipts
operativos, candidates, certificación de precios, mínimos, Monthly, cache,
Edge, captcha, Vercel, push, deploy, refresh ni recovery.

## Identidad aplicada

- Nombre: `lobodeals_3_safe_demotion_hardening`.
- Versión remota: `20260801220321`.
- Archivo: 9.977 bytes.
- SHA-256: `d2ac2c231dd5ad18d9fc675d66fac6a19389cdc0864c9632ee601b62e5581766`.
- Registro: exactamente una migración 007, después de 004, 005 y 006.

## Certificación inmediatamente anterior

- Proyecto: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.
- Certificado previo: 23/23 checks, 0 blockers.
- `checked_at`: `2026-08-01 22:03:02.701342+00`.
- Backend PID: `2589008`.
- Snapshot: `296320:296320:`.
- 007 ausente; v2 ausente; v1 con definición SHA-256
  `e2809e095b09088af405416151f39c6081ac0dd34b981d619e74db5377f6863e`
  y contrato de seguridad exacto.
- Ciclos: 0; receipts: 0; locks/waiters relevantes: 0; clientes relevantes: 0.

## Aplicación y atomicidad

Supabase `apply_migration` respondió `success: true`. La migración ejecutó una
sola transacción con `lock_timeout = 5s`, `statement_timeout = 120s`, lock
exclusivo de `price_refresh_cycles`, assertions previas, creación/comentario de
v2 y cambio acotado de ACL. No contiene `CASCADE`, DML comercial, demotion ni
backfill. PostgreSQL hace atómicos el DDL y los grants dentro del `BEGIN/COMMIT`;
cualquier assertion o error habría revertido también la función, comentario y
ACL. Al no existir error no se ejecutó ni autorizó recovery.

## Postcheck inmediato

`sql/validation/007-safe-demotion-postcheck-readonly.sql` pasó todas sus siete
condiciones en `2026-08-01 22:03:34.367181+00`, backend PID `2589018`, snapshot
`296323:296323:`:

- una sola 007 registrada;
- v2 presente;
- `service_role` revocado de v1;
- v2 con owner `postgres`, `SECURITY DEFINER`, `search_path=""` y grant solo a
  `service_role` además del owner;
- ciclos y receipts todavía en cero.

## Certificación posterior y preflight final

Se añadió el validador estrictamente read-only
`sql/validation/007-safe-demotion-postcheck-certificate-readonly.sql` porque el
certificado previo debe exigir 007/v2 ausentes y no representa el estado
post-aplicación.

- Archivo: 19.420 bytes.
- SHA-256: `42cdef8220310d3b396685103aeb54d6881000d5b45dfb710c7c650b67c61a35`.
- Resultado remoto: 23/23 checks, 0 blockers.
- `checked_at`: `2026-08-01 22:06:51.651907+00`.
- Backend PID: `2589060`.
- Snapshot: `296324:296324:`.
- SHA-256 remoto de v2: `6d1c5266784bc309eb3f06e49648875e668a89bef5c9c500cc61349a002cf07a`.
- ACL v1: `{postgres=X/postgres}`.
- ACL v2: `{postgres=X/postgres,service_role=X/postgres}`.
- Ciclos, receipts, candidates y mínimos: 0.
- Stage/cache: 32.890/32.890; Monthly: 7, activas: 4.
- Waiters y clientes relevantes: 0.
- El preflight diagnóstico original se repitió después del certificado y cerró
  con 0 clientes activos y 0 clientes relevantes.

## Validación y límites posteriores

- Commit del certificado posterior: `302a97e`.
- `npm test`: 488/488.
- La Autorización A quedó consumida y no habilita ningún uso de v2.
- `RECOVERY_REFRESH_EXECUTED=false`.
- `PUBLIC_DATA_CURRENT=false`.
- `DAILY_RUNNER_READY=false`.
- `COMPACT_MINIMA_READY=false`.
- `LIVE_CYCLE_READY=false`.
- `THIRTY_DAY_TRIAL_READY=false`.
- Recovery, refresh, Vercel, Edge/captcha, push y deploy permanecen no
  autorizados.
