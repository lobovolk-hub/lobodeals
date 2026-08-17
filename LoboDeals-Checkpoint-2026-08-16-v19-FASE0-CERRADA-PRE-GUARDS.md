# LoboDeals — Checkpoint 2026-08-16 v19
## FASE 0 CERRADA — PRE-GUARDS / PRE-COMMIT

**Proyecto local:** `D:\Proyectos\lobodeals`  
**Rama:** `main`  
**HEAD de referencia:** `930ea6e688641e03d776896789939addf142b15c`  
**Working tree:** deliberadamente dirty; preservar hotfixes y untracked. No reset/clean.

---

## 1. Estado ejecutivo

FASE 0 queda **cerrada funcional y semánticamente en producción**.

Secuencia cerrada:

1. SQL 008 aplicado y validado live.
2. SQL 009 CRLF-safe aplicado y validado live.
3. Recovery histórico de PS+ lows y postcheck verde.
4. Big Walk recuperado y validado live.
5. Primer Daily Runner v24 / cache v19 ejecutado.
6. Se detectó y corrigió el fallo de final listing upsert contra `psdeals_stage_items_public_offer_verification_check`.
7. El mismo run se reanudó y llegó a ended reconciliation, `MARK_CYCLE_SUCCEEDED`, `CERTIFY_CYCLE_V4`, cache v19 y postchecks.
8. La validación live detectó un segundo bug de resume: `finalFreshRequired` se recalculaba con `Date.now()` y podía cambiar después de horas.
9. Se añadió decisión durable `decide_final_reconciliation_mode_v127`.
10. Se preparó, auditó y ejecutó recovery quirúrgico de las 14 procedencias Detail degradadas.
11. Validación live final: Stage y Cache en `1786 complete_listing + 14 strong_detail_revalidation`.

**No queda un bloqueo semántico conocido de FASE 0 en producción.**

---

## 2. Ciclo Daily Runner validado

**Local run:** `local-cycle-daily-20260816-125225-52986b90`  
**Remote cycle:** `60e1725f-8393-416c-a384-9581f8ab7ea0`

Estado live final:

- `status = certified`
- `validation_passed = true`
- `items_seen = 1800`
- `items_failed = 0`
- `new_items_detected = 18`
- `ended_discounts_applied = 11`
- `failure_reason = NULL`
- unresolved receipts = `0`
- active cache jobs = `0`
- active demotion jobs = `0`
- listing stamps exactos = `1800`

Cache:

- total = `40747`
- verified regular = `1777`
- verified PS+ = `67`
- verified cycle mismatches = `0`
- `complete_listing` con input hash indebido = `0`
- `strong_detail_revalidation` sin input hash = `0`

---

## 3. Distribución final de evidencia pública

Stage y Cache:

- `complete_listing = 1786`
- `strong_detail_revalidation = 14`

Las 14 filas Detail tienen:

- cycle id `60e1725f-8393-416c-a384-9581f8ab7ea0`
- source `strong_detail_revalidation`
- input artifact SHA `a343aa6fd28d7e2aa12ddcc70b368a960004235b685d705385f2fc8986c3624e`
- 14/14 evidence SHA individuales exactos validados
- 14/14: `public_offer_verified_at = detail_last_synced_at = raw_detail_json.imported_at`
- Stage y Cache coinciden 14/14 en los cinco `public_offer_*`

---

## 4. Big Walk — target final

Item id `b4618a2f-1eb2-4fac-9683-05944242e5f2`, PSDeals `3781017`, slug `big-walk`.

Stage:

- current `$19.99`
- original `$19.99`
- discount `0`
- Lowest Regular `$19.99`
- Lowest PS+ `NULL`
- Monthly activo `true`
- commercial regular `false`
- commercial PS+ `false`

Cache:

- current `$19.99`
- original `NULL`
- discount `0`
- `has_deal=false`
- `has_ps_plus_deal=false`
- `has_verified_deal=false`
- `has_verified_ps_plus_deal=false`

`cache.original_price_amount=NULL` es intencional; Cache normaliza `original_price_amount` a `NULL` cuando no hay deal regular activo. Stage conserva `$19.99/$19.99`.

---

## 5. Mafia: The Omertà Collection

PSDeals `3858781`:

- current `$49.99`
- original `$99.99`
- discount `50`
- `has_verified_deal=true`
- Stage source `strong_detail_revalidation`
- Cache source `strong_detail_revalidation`
- evidence SHA `ddfda3ddf24cb34acc6e5fa5b9531a91f37da82aae6bcc433a9333aecbf0c048`

---

## 6. Monthly Games — agosto 2026

Conjunto activo validado:

1. Dying Light 2 Stay Human: Reloaded Edition
2. Big Walk
3. Signalis

Invariantes:

- Monthly PS+ low en cero = `0`
- Monthly contaminando commercial regular mediante `$0/100%` = `0`
- Monthly FREE no crea deal comercial
- Monthly FREE no participa en Lowest PS+
- Monthly puede coexistir con PS+ comercial positivo independiente

---

## 7. Bug 1 — final listing upsert

Fallo original:

`STAGE_UPSERT_discounts-final-v118:new row for relation "psdeals_stage_items" violates check constraint "psdeals_stage_items_public_offer_verification_check"`

Root cause:

- listing inicial estampó `complete_listing`
- Detail elevó 14 filas a `strong_detail_revalidation` + input SHA
- final listing reutilizó snapshot previo
- payload `complete_listing` omitía input SHA en vez de limpiarlo
- PostgREST partial upsert retenía el input SHA Detail mientras cambiaba source
- el CHECK live rechazó correctamente la combinación

Patch local:

- `complete_listing` emite input artifact `NULL`
- adapter permite solo ese `NULL` contractual
- reused final snapshot puede producir `0` batches
- fresh final snapshot conserva flujo completo

Receipt histórico: `15d59e1b-1ceb-4513-825c-158f68b13eb4`

Cierre honesto:

- `status=failed`
- `affected_rows=0`
- attempted `100`
- failed `100`
- skipped `0`
- `STAGE_UPSERT_PUBLIC_OFFER_VERIFICATION_CHECK`

---

## 8. Bug 2 — decisión final no durable durante resume

Root cause:

`finalFreshRequired` se calculaba con `Date.now()` fuera de checkpoint durable.

En la ejecución original el snapshot todavía era fresco y el modo efectivo era reuse. Al reanudar horas después el booleano cambió a fresh, mientras los steps de colección final ya estaban `done` y devolvían el viejo snapshot marcado `reused_initial_snapshot=true`. El plan final confió en el booleano recalculado, ejecutó 22 batches/1800 updates y degradó las 14 procedencias Detail a `complete_listing`.

Patch final:

- step durable `decide_final_reconciliation_mode_v127`
- resume reutiliza la misma decisión
- artifacts finales declaran `reused_initial_snapshot`
- contradicción decisión/artifact aborta
- reused snapshot => `0` final discount batches
- fresh => exige colección realmente fresca
- final Stage stamp verification sigue obligatorio

Validación local reportada:

- tests focalizados nuevos `4/4 PASS`
- `npm test` `694/694 PASS`
- operator self-test PASS
- adapter self-test PASS
- `git diff --check` PASS

---

## 9. Recovery final de 14 Detail provenance

Artifact:

`sql/recovery/evidence/009-lobodeals-3-fase0-detail-provenance-14.json`

SHA-256:

`e9a306d0b40bca6d46166b5d8ffd5d21d806c8a8e6a5edbbeded19b2fe52bd44`

Recovery SQL final ejecutado:

`sql/recovery/009-lobodeals-3-fase0-restore-14-detail-provenance-before-use.sql`

SHA-256:

`0cc3b238f6fbbe7d4107a73c897be41cf82edf1a429ce6d79b287e8237b01204`

Tamaño `23918 bytes`.

Auditoría durante revisión:

1. Se eliminó el guard erróneo `cache.discount_percent = stage regular discount_percent`; Cache puede representar el descuento del mejor precio PS+.
2. Primer intento abortó de forma segura con `LOBODEALS_FASE0_RECOVERY_STAGE_NON_PUBLIC_FIELD_CHANGED`; no hubo cambios parciales.
3. Causa: trigger `trg_psdeals_stage_items_set_updated_at` ejecuta `new.updated_at = now()`.
4. Recovery final:
   - captura `updated_at_before`
   - excluye `updated_at` solo de immutable-row Stage
   - valida exactamente 14 cambios de `updated_at`
   - exige `updated_at = transaction_timestamp()`
   - exige `updated_at >= updated_at_before`
   - exige `updated_at IS DISTINCT FROM updated_at_before`
   - Cache conserva comparación inmutable sin excepción
   - no desactiva triggers ni escribe `updated_at` manualmente

Resultado live final: recovery correcto y persistido.

---

## 10. SQL / contratos relevantes

- SQL 008: `0236f9ad8c2044c9ce79c1ab6dc2e7e54f299172b5084ffdc5f41847e1a2c00a`
- SQL 009 CRLF-safe: `b6f0d9815fe76dd07dbad45d2d9e2611d31205734d59340464f12f42ee88d88c`
- Big Walk recovery: `7eb694ad24ca7fd0c152877a8350d30645f56f83a185b984b789e0ae7023b426`
- PS+ lows recovery: `942659321ea0fe357a18041c8dd822db6687e26d6501adb55054e4949b64c994`
- Postcheck 009: `f3de3872be4dc0e46d85a486bf4a6e68895d95e7a6cdbf60065ce2eda9848fcf`

---

## 11. Hashes actuales de código protegido

Reportados tras el patch durable de resume:

- Operator: `a8b065529292d8e132e82e8b9c60798baff91e090800083578aedac19d39fcc7`
- Core: `cba3b5ad20a3dc7bf81d23f9723eb7bf90ceaddbee1f14216c9289fc2446c8b8`
- Stage payload: `89cd3fadbd7fa9563976d2cfeb809aa9c411036a8af2db4eb7759e16b343b27c`
- Listing adapter: `8fa71b1912fc0ce468efa4deaffd8610a6d26c7bde35cf16790440fc8b8971a4`
- Certification evidence: `162253c98f0777dc589bc6028d9e51638350f585535bfbf43c65c9fa86ea37c3`

---

## 12. Guards deliberadamente pendientes

`installed-manifest.json`:

- Operator: esperado `73859e...`, actual `a8b065...`
- Core: esperado `2e00ab...`, actual `cba3b5...`
- Test: esperado `edca7d...`, actual `b10fc5...`

`source-baseline.json`: último estado reportado `0 mismatches`.

No actualizar guards sin verificación local exacta de hashes y reverse-diff.

---

## 13. Daily Runner

Launcher aprobado:

`D:\Proyectos\lobodeals\START-LOBODEALS-DAILY.cmd`

El header puede seguir mostrando `V2.2F`; branding stale solamente.

**No ejecutar otro Daily Runner todavía.** Los installed guards deben reconciliarse primero.

---

## 14. Working tree

Preservar working tree dirty y todos los hotfixes/untracked.

- no `git reset`
- no `git clean`
- no descartar untracked
- no sobreescribir operator/core desde históricos
- no commit/push todavía

Branch `main`; HEAD `930ea6e688641e03d776896789939addf142b15c`.

---

## 15. Próximo paso exacto

Reconciliar **solo installed guards**:

1. verificar SHA-256 actuales de operator, core y test protegido
2. comparar contra `installed-manifest.json`
3. demostrar que las diferencias corresponden exclusivamente al patch deliberado
4. backup del manifest
5. sustituir únicamente hashes necesarios
6. reverse-diff exacto contra backup
7. ejecutar operator `--self-test`, adapter self-test y source baseline verification
8. no ejecutar Daily Runner hasta terminar esta verificación

Después: FASE 1 — revisión final del working tree, commit intencional, push, deploy, visual regression y observabilidad post-deploy.

---

## 16. Estado de checkpoint

**FASE 0: CERRADA.**

Este checkpoint reemplaza operativamente al checkpoint pre-rollout v18 como nueva fuente de verdad post-rollout/post-recovery.
