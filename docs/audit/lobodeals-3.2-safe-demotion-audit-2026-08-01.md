# LoboDeals 3.2 — Auditoría de ended deals y safe demotion

Fecha de corte: 2026-08-01, America/Lima
Alcance: código, SQL local, pruebas, runner y evidencia histórica. No se
ejecutaron demotions, SQL, collectors ni llamadas Supabase.

## Gates

- `SAFE_DEMOTION_AUDITED=true`
- `SAFE_DEMOTION_CODE_READY=true` — código local, incluida migración 007 aún no aplicada.
- `SAFE_DEMOTION_TESTS_READY=true`
- `SAFE_DEMOTION_RUNNER_INTEGRATED=false`
- `SAFE_DEMOTION_OPERATIONALLY_READY=false`
- `HOLLOW_KNIGHT_CLASS_FAILURE_PREVENTED=false` — producción/operación actual.

La clase de fallo está cerrada en el código local y sus pruebas, pero todavía
no en producción: la migración 007 no se ha aplicado y ningún runner real
obliga la secuencia analyzer → detail revalidation → analyzer → RPC v2 → cache
v16. No es válido afirmar que el problema ya está resuelto operativamente.

## Hallazgo previo al hardening

El RPC v1 receipt-bound ya exigía ciclo running, listing completo, receipt de
análisis, set canónico de hasta 500 IDs, hashes exactos, precios coherentes,
scope US/PlayStation, affected count exacto e idempotencia. Sin embargo, no
bloqueaba por sí mismo:

- `is_ps_plus_discount=true` o estado PS Plus ambiguo;
- una oferta con `deal_ends_at` futuro;
- una fila perteneciente a Monthly activo;
- una familia `content_type` / `item_type_label` incompatible;
- slug ausente o URL que no correspondiera al `psdeals_id`.

El analyzer anterior tampoco convertía esos casos en blockers: seleccionaba
toda fila previamente descontada cuyo ID faltara del listing. Por eso dos
scripts aislados y un receipt no satisfacían el contrato mínimo.

## Contrato local endurecido

Una fila solo entra al set de demotion cuando cumple simultáneamente:

1. listing discounts fuertemente completo y con IDs válidos;
2. ausencia del `psdeals_id` en ese listing;
3. identidad positiva, US/PlayStation, slug presente y URL ligada al ID;
4. familia exacta `game/game`, `bundle/bundle` o `dlc/addon`;
5. `current_price_amount > 0`;
6. `original_price_amount > current_price_amount`;
7. descuento entero entre 1 y 99 y coherente al centavo con ambos precios;
8. `is_ps_plus_discount === false`;
9. evidencia Monthly verificada y ausencia de membresía Monthly activa;
10. `deal_ends_at` nulo o no futuro respecto al momento observado;
11. ninguna señal explícita de identidad ambigua, categoría cambiada o
    producto no publicado.

`deal_ends_at` nulo no demuestra por sí solo que la oferta terminó. La
finalización proviene de la ausencia en un listing completo hash-linked. Una
fecha futura sí contradice esa conclusión y bloquea.

## Capas de defensa

### Selector y analyzer

`scripts/lib/psdeals-ended-discounts.mjs` separa:

- IDs todavía activos;
- ausencias detectadas;
- candidatos seguros;
- candidatos bloqueados con reason codes.

El analyzer consulta también la membresía Monthly activa. En modo tracked,
verifica hash e identidad del listing padre. Si el listing no está completo,
contiene un ID inválido o queda un candidato ambiguo, la evidence envelope es
`partial`; no puede alimentar una demotion.

Los candidatos bloqueados deben pasar por detail refresh y el analyzer debe
ejecutarse de nuevo sobre el mismo listing/evidencia. Un detail refresh no
convierte automáticamente una ausencia en segura.

### RPC v2

`sql/007-lobodeals-3-safe-demotion-hardening.sql` añade
`apply_psdeals_ended_deals_v2` sin ejecutar datos ni backfill. El RPC:

- vuelve a validar precios, descuento, identidad, familia, PS Plus, Monthly y
  fecha futura dentro de la misma transacción;
- bloquea filas y mantiene un lock compartido de Monthly durante el check;
- delega al v1 receipt-bound para hashes, affected count, idempotencia,
  actualización y receipt;
- retira a `service_role` el EXECUTE directo del v1;
- deja v2 como única entrada operativa de demotion.

La migración está pinned al SHA-256 observado del v1 y exige cero ciclos. Su
recovery `before-use` restaura v1 solo si siguen vacías las tablas de ciclos y
receipts; no usa `CASCADE` ni toca datos históricos.

### Receipt, doble ejecución y timeout

El set se ordena, deduplica y hashea con IDs separados por newline. El v1
subyacente abre/reconcilia un receipt `demotion_apply` ligado al receipt
`ended_deals_analysis`; un replay idéntico devuelve el terminal existente y
una contradicción falla cerrada. Un timeout no autoriza un segundo apply: el
adapter debe leer ciclo y receipt por idempotency key antes de decidir.

### Caché posterior

Demotion no refresca la caché por sí sola. `mark_succeeded` exige el receipt de
demotion y los receipts obligatorios; después vienen certificación y cache v16.
La caché v16 solo abre con `can_refresh_cache`. El camino directo v15 continúa
bloqueado.

## Paridad e integración

| Superficie | Estado | Evidencia |
|---|---|---|
| Selector puro | `READY` | Contrato fail-closed y reason codes |
| Analyzer real | `READY` | Listing parent hash + Monthly + blocked output |
| Evidence envelope | `READY` | Blockers fuerzan estado partial |
| RPC local v2 | `READY_NOT_APPLIED` | Migración 007 + recovery before-use |
| Port Supabase | `READY` | Allowlist solo v2; v1 rechazado |
| Reconciliación | `READY` | Receipt/idempotency y timeout tests |
| Orquestador offline | `PARTIAL` | Usa selector endurecido, pero no ejecuta adaptadores reales |
| Wrappers PowerShell | `BROKEN` | No llaman analyzer/demotion v2 ni propagan ciclo |
| Runner diario real | `MISSING` | No hay entrada operacional end-to-end |
| Producción | `NOT_READY` | Migración 007 no aplicada; no existe ciclo real |

No hay todavía paridad completa de payload entre un comando diario y el RPC:
los process specs producen listing/análisis/import/retry, pero falta el paso
operativo obligatorio que lea el artifact final, construya el set/hash/request,
invoque v2, reconcilie el receipt y adjunte el resultado al manifest.

## Casos cubiertos por pruebas nuevas

- candidato regular coherente ausente de listing completo;
- producto todavía presente;
- listing incompleto o ID de listing inválido;
- Monthly no verificado y Monthly activo;
- PS Plus activo y PS Plus nulo/ambiguo;
- deal futuro;
- original ausente o no mayor que current;
- porcentaje incoherente y descuento extremo;
- familia incorrecta;
- URL/identidad dudosa;
- evidence partial ante candidatos bloqueados;
- migración 007 hash-pinned y sin ciclos;
- guards equivalentes dentro del RPC;
- `service_role` sin acceso al v1 y con acceso solo al v2;
- recovery prohibido después de uso;
- port local que rechaza v1.

## Qué falta para prevenir el fallo en operación

1. Revisión humana del SQL 007 y aplicación remota separadamente autorizada.
2. Preflight read-only que confirme v2 y confirme `service_role_execute=false`
   para v1.
3. Integrar detail revalidation de bloqueados y reanálisis obligatorio.
4. Implementar el action adapter de demotion v2 y adjuntar el receipt real.
5. Hacer que un ciclo con bloqueados, pendientes, receipt ausente o timeout no
   pueda marcarse succeeded.
6. Verificar cache v16 y páginas públicas tras una demotion real autorizada.
7. Probar el runner completo con fakes, replay y fallos antes de cualquier ciclo
   productivo.
