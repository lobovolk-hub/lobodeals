# LoboDeals 3.0 — recuperación acotada de la migración 004

Estado preparado: `SCOPED_RECOVERY_PROVEN` localmente, sujeto a repetir el precheck remoto inmediatamente antes de aplicar 004.

Este bundle demuestra la recuperación de la superficie exacta de `sql/004-lobodeals-3-reconciliable-cycle-actions.sql` mientras `price_refresh_cycles` siga en cero, `psdeals_cycle_action_receipts` siga en cero y ninguna RPC nueva haya sido usada. No autoriza ejecutar el recovery SQL.

## Alcance

La migración tiene 2.205 líneas, 78 sentencias y 68 sentencias mutantes persistentes. El mapa registra cada sentencia, objeto, dependencia, efecto sobre datos, inversa, precondición, riesgo y orden de recuperación. Incluye diez columnas, nueve constraints y tres índices sobre la tabla vacía de ciclos; la tabla vacía de receipts y su metadata; doce funciones; dos triggers; grants/revokes y comentarios. No crea policies.

`apply_migration` también puede registrar una versión en `supabase_migrations.schema_migrations` mediante el plano de control. Ese efecto se registra aparte porque no forma parte del texto SQL y el recovery SQL no manipula tablas internas.

El histórico detallado no se exporta: 004 no menciona ni muta `psdeals_stage_price_history`, no invoca funciones que lo modifiquen y su inversa no depende de sus 841.549 filas. El bundle conserva su conteo y tamaño observados solo como control de no afectación.

## Archivos

- `mutation-map.json`: inventario reproducible de sentencias y mutaciones.
- `empty-operational-data.json`: exportación explícita de las cero filas de ciclos y ausencia previa de receipts.
- `recovery-manifest.json`: baseline, alcance, gates, referencias y fingerprints.
- `checksums.json`: SHA-256 y tamaño de cada miembro; excluye su propio hash para evitar circularidad.
- `sql/recovery/004-lobodeals-3-reconciliable-cycle-actions-before-use.sql`: recuperación transaccional separada de la ruta automática.

Reproducción local:

```text
node scripts/build-psdeals-migration-004-recovery-bundle.mjs --check
```

## Condiciones estrictas del recovery SQL

Solo podría considerarse en una sesión futura con autorización separada y después de comprobar:

1. 004 aplicada completa y con la huella exacta;
2. cero ciclos y cero receipts;
3. ninguna función 004 utilizada operacionalmente;
4. definiciones v1/v15 con los hashes capturados;
5. firmas, grants, RLS, índices, constraints y triggers exactamente compatibles;
6. runner y clientes operativos bloqueados;
7. revisión humana del diff y del estado remoto inmediatamente anterior.

El script se niega ante cualquier discrepancia, trabaja en una transacción, revoca entrypoints nuevos primero, elimina dependencias en orden inverso y no usa `CASCADE`, DML comercial ni borrado de filas. Después del primer ciclo o receipt queda prohibido: corresponde corregir hacia adelante.

## Contención de emergencia no autorizada

Si 004 queda aplicada pero un postcheck falla, no se ejecuta automáticamente el recovery. Se bloquea el runner, no se invoca ningún entrypoint nuevo, se conservan los objetos para investigar y se verifican solo mediante lectura. Una futura autorización podría revocar exclusivamente permisos nuevos; no debe tocar v1/v15 ni usar `CASCADE`.

## Historial de migraciones

Una recuperación futura del esquema y la reconciliación del historial son dos operaciones separadas. Primero debe terminar y validarse la transacción de recovery. Después se obtiene mediante el canal de migraciones la versión exacta realmente registrada y, con otra autorización, se usa el flujo documentado `supabase migration repair --status reverted <version-exacta>`. No se permite `UPDATE`, `DELETE` ni inserción directa sobre `supabase_migrations.schema_migrations`, ni se inventa una versión.

## Prohibiciones

Este bundle no autoriza ejecutar el recovery SQL, crear ciclos o receipts, invocar RPC, corregir producción, borrar históricos, certificar, refrescar caché ni actualizar juegos mensuales. Una aplicación posterior a uso real no puede retirarse con este procedimiento.
