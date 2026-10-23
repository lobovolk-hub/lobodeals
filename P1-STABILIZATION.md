# P1 Stabilization — auditoría y preparación local

23 octubre 2026. **No autoriza publicación. Production PASS pendiente.**

## 1. Estado y autoridades

Product Authority (3 septiembre), Bilingual Addendum (13 septiembre), Technical
Audit (20 agosto) y decisiones posteriores preservadas. Backend simple, frontend
simple. Rama main, HEAD y referencia local origin/main:
`a6e604e5c437e1b2a0f990ac41297c4a3d37f43b`. Un worktree, staging vacío.
No se hizo fetch/push ni se verificó nuevamente GitHub remoto.

Se preservaron los siete archivos de Johan y los dos archivos de GOG P1-B.1.
No se leyó ningún .env, no hubo POST remoto ni SQL remoto de escritura.
Las consultas remotas fueron exclusivamente de metadatos y configuración.

## 2. Evidencia y decisiones

El usuario documentó v41 completa a las 00:00 UTC y HTTP 546 a las 04/08/12.
El código anterior ejecuta diez adaptadores con Promise.all en una solicitud:
su trabajo síncrono comparte el presupuesto de esa solicitud. Esto demuestra
acoplamiento de fallos por recursos, no identifica por sí solo al adaptador
responsable de cada incidente. Un ciclo correcto no garantiza estabilidad.

KEEP: una Edge, un scheduler, diez adaptadores, frecuencia de cuatro horas,
token de Vault, verify_jwt=false, tablas existentes, identidad/fechas,
reconciliación, reservas Epic/PlayStation y optimizaciones CPU aprobadas.

REFINE: admisión por tienda y observabilidad funcional. Ocho tiendas carecían
de reserva de publicación; el nuevo control cubre todos los POST persistentes.
La espera de cierres usa allSettled para no abandonar escrituras aún pendientes.

REPLACE: el comando del job despacha diez HTTP independientes en lugar de uno
con diez tiendas. No cambia el código comercial de Steam ni los adaptadores.

## 3. Contratos reales inspeccionados

- Proyecto vlxkoprpobfevxefizwr; campaign-monitoring ACTIVE v41, verify_jwt=false.
- pg_cron 1.6.4; pg_net 0.20.0; job 9, único job, activo, postgres,
  `0 */4 * * *`, cron.timezone=GMT, cron.max_running_jobs=32.
- Comando actual usa Vault campaign_monitor_token, header existente, persist,
  timeout 120000 ms. MD5 del comando: e48e9f74aee2ebfc6944a3aad721314a.
- Un registro Vault con ese nombre; nunca se consultó su valor.
- Verificador existente SECURITY DEFINER, EXECUTE postgres/service_role solamente.
- cron.alter_job(bigint,text,text,text,text,boolean) está disponible.
- net.http_post(url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer)
  devuelve bigint. pg_net.batch_size=200 y pg_net.ttl=6 hours.
- authenticator tiene statement_timeout=8s y lock_timeout=8s. Revalidar estos
  límites y cualquier override PostgREST antes de publicar.

La documentación confirma envío después del commit y respuestas temporales:
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
El límite alojado documentado es CPU 2s por solicitud y wall clock máximo
400s en planes de pago (150s Free):
[límites Edge](https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW).
No se configura ni aumenta ninguno de esos límites.

## 4. Implementación y separación de archivos

Estructural:
- supabase/functions/campaign-monitoring/index.ts: frontera HTTP, admisión,
  ciclo, invocación, logs funcionales y estado explícito de persistencia.
- supabase/migrations/20261023160029_campaign_monitor_store_admission.sql:
  tres columnas privadas en sales_source_health y dos RPC SECURITY INVOKER,
  restringidas a service_role. No crea tablas ni altera filas comerciales.
- supabase/migrations/20261023160058_campaign_monitor_store_dispatch.sql:
  altera el job existente; aborta ante baseline diferente. No crea otro job.
- supabase/rollback/campaign_monitor_store_dispatch.sql: rollback explícito,
  fuera de migrations; restaura el comando original sin borrar datos.
- tests/campaign-monitor-stabilization.test.mjs y
  tests/campaign-monitor-stabilization-postgres.mjs: regresiones nuevas.
- tests/helpers/campaign-monitor-deno.test.mjs: arranque local de los mocks bajo Deno.
- tests/backend-contract.test.mjs: actualiza una aserción estática para la
  nueva frontera de admisión. El comportamiento lo prueban los tests HTTP.

GOG, separado y sin cambios en esta intervención:
- supabase/functions/campaign-monitoring/adapters/gog.ts
- tests/gog-integrity.test.mjs

Revisar el diff GOG por esas dos rutas; el nuevo test sigue untracked y debe
incluirse explícitamente en una publicación futura autorizada. No hacer staging
global ni incluir los siete archivos de Johan. El paquete de la Edge incluye
GOG físicamente, pero su revisión y gate comercial son independientes.

## 5. Seguridad, admisión e idempotencia

Cada despacho lleva stores:[una tienda] y cycleId UTC en un slot de cuatro
horas. Diez tiendas explícitas, una vez cada una. La RPC valida el slot y una
ventana de admisión de 15 minutos; un envío tardío falla explícitamente.

La fila de health se bloquea brevemente al admitir. Se genera invocationId en
el servidor, nunca desde input del cliente. monitor_last_cycle impide repetir
un ciclo ya admitido, incluso tras liberar la reserva; no hay reintento
automático del monitor. Una llamada manual persistente usa la misma exclusión.

La reserva dura diez minutos, más que el máximo de vida documentado del worker.
No se renueva. Un fallo/CPU shutdown/commit incierto conserva la reserva hasta
su vencimiento; el siguiente ciclo de cuatro horas sigue habilitado. Una
liberación exige el mismo propietario. Fallos no se convierten en empty states.

La seguridad de expiración depende del runtime alojado acotado, de los límites
de transacciones y de que todos los escritores usen la nueva frontera HTTP.
No es una prueba de fencing distribuido para runtimes sin límite. Cambiar esos
supuestos requiere revisar el diseño. No mezclar workers v41 y nuevos durante
la activación: drenar según el procedimiento inferior.

Se mantienen claves deterministas y upserts existentes. Los finalize de Epic
y PlayStation conservan generación, conflictos y repetición idempotente.
Una escritura genérica cuyo resultado se pierde NO se declara atómica ni
completada: persistenceStatus=incomplete-or-unknown. No se reintenta el ciclo.

La ausencia incierta no genera END. Se conserva la regla independiente de
expiración por fin oficial previamente conocido. No se toca el histórico GOG.

## 6. Observabilidad y comprobación de cada ciclo

Postgres emite dispatch-enqueued con cycleId, storeSlug, requestId y
dispatch-prepared con requests=10. Son eventos previos al commit: solo se
considera despacho confirmado al correlacionarlos con cron.job_run_details
succeeded. Un error SQL revierte todo el lote; puede dejar logs de preparación
pero no solicitudes comprometidas. Los errores HTTP posteriores son independientes.

Las URLs incluyen cycle_id y store, sin credenciales. Permiten relacionar
logs HTTP incluso si el worker no consigue emitir su primer evento.
La Edge registra store-start, store-admitted, persistence-start,
persistence-complete, store-complete y el resumen compatible complete.
Los eventos incluyen ciclo/invocación/tienda y, cuando aplica, cobertura,
códigos/cantidad de diagnósticos, cantidades y persistenceStatus. No se loguean
headers, token, cuerpos HTML, mensajes arbitrarios de excepción ni URLs de fuente.

HTTP 200 no implica éxito comercial: leer ok/errorCode/cobertura/diagnósticos.
health=healthy tampoco implica diez resultados ni cobertura completa. Una
publicación completada con error de health se distingue de una escritura incierta.

Procedimiento por ciclo, SIN crear automatización adicional:
1. Revisar entre T+10 y T+30 minutos. Obtener los diez requestId de los logs
   Postgres por cycleId y confirmar commit del job. Si no hay diez tiendas
   distintas y el job correcto, FAIL de despacho.
2. Consultar solamente esos IDs en net._http_response: id, status_code,
   timed_out, error_msg, created y content de las respuestas del monitor.
   No consultar ni exportar headers/body de net.http_request_queue: contiene token.
3. Cruzar con logs HTTP por cycle_id/store y logs de aplicación por cycleId,
   storeSlug e invocationId. Cada solicitud necesita estado terminal conocido.
4. HTTP 546 o shutdown CPU Time exceeded => fallo de recursos de esa tienda;
   buscar evento de shutdown y ejecución correspondiente, sin inferir CPU de
   un 503 aislado. Start sin complete tampoco acredita causa CPU.
5. HTTP 401/403 => autenticación; error fuente en outcome => gate comercial;
   persistenceStatus incierto => revisión de persistencia, sin replay automático.
6. Registrar un cuadro de diez filas con requestId, tienda, HTTP, outcome,
   persistencia, cobertura, diagnósticos y evidencia de shutdown si existe.
   Guardar la evidencia sin secretos antes de T+6h, preferiblemente T+30min.
   Si se pierde la ventana de retención y no hay evidencia suficiente, INCONCLUSO.

No se ha creado colector, tabla de observabilidad ni servicio externo. No se
promete retención duradera de pg_net: sus tablas son unlogged y pueden perderse
en un crash. El protocolo usa logs existentes y revisión de cada ciclo.

## 7. Validación local y límites

Suite completa al cierre: **566/566 PASS**. Los nuevos tests HTTP cubren
19 escenarios, incluidos diez fallos independientes, auth, duplicados, overlap,
escritura antes/después de commit, health y redacción de secretos.
Runner PostgreSQL embebido: **8/8 PASS**, ejecutando SQL real de migraciones,
admisión, ACL, publicación Epic/PlayStation y rollback exacto.

El runner usa PGlite instalado FUERA del proyecto (directorio temporal), sin
credenciales ni datos reales. pg_cron, net.http_post y Vault son dobles locales:
valida construcción SQL y transacciones, NO el worker real de pg_net ni
contención entre conexiones PostgreSQL independientes. La prueba de ciclo
válido congela únicamente el reloj en una función transaccional del fixture;
las duraciones/predicados de admisión permanecen iguales.

Reproducir con LOBO_QA_PGLITE_MODULE apuntando al dist/index.js de esa instalación:
`node tests/campaign-monitor-stabilization-postgres.mjs`.
El runner cierra su base en memoria al finalizar. Sin dependencia nueva de app.

Lint y TypeScript app sin emisión: PASS. Deno 2.9.6 check del entrypoint real: PASS;
grafo de despliegue de 29 módulos locales, cero imports remotos y cero errores.
No se ejecuta next build porque next-env.d.ts está protegido.
No hay Docker disponible en PATH; no se arrancó Supabase local ni Edge Runtime
alojado. Deno local tampoco certifica límites de producción.

Tests bajo Deno: **42/42 PASS**, mediante
`deno test --no-lock --allow-read --allow-env tests/helpers/campaign-monitor-deno.test.mjs -- --include-local-gog`.
No se concede acceso de red ni escritura. El primer intento directo falló porque
Deno protege su global frente a reasignación; el arranque exclusivo de pruebas
lo hace writable para los mocks existentes, sin cambiar GOG ni el paquete Edge.
git diff --check: PASS (advertencias LF/CRLF existentes, sin errores de whitespace).

Regresiones CPU GOG/Xbox con watchdog preservadas. Perfil Node/Windows de
1000 extracciones GOG 1/2/4/8 KB: 16/15/48/47 ms CPU; diez adaptadores con mocks,
200 ciclos: 437 ms CPU. Son cargas sintéticas, con granularidad Windows, no
un SLA. La captura oficial GOG anterior de 16,4 MB no se repitió aquí.

## 8. Publicación posterior, separadamente autorizada

No aplicar todo mediante db push sin separar fases: la última migración activa
el nuevo despacho y exige que la Edge compatible ya esté comprobada.

1. Revisar diff estructural, diff GOG y hashes protegidos; autorizar paquete
   exacto. Revalidar metadatos reales, baseline del job, límites/ACL y Vault sin
   exponer su valor. Verificar contratos de RPC/cache PostgREST.
2. Elegir ventana después de un ciclo y sin ejecución pendiente. Si hace falta,
   pausar TEMPORALMENTE el mismo job con autorización de publicación; no crear
   otro. Drenar cola y workers anteriores; mínimo diez minutos después del último
   despacho y confirmar que no quedan solicitudes pendientes/ejecuciones activas.
   No borrar cola ni forzar la liberación de reservas para acelerar la ventana.
3. Aplicar SOLO migración de admisión. Inspeccionar columnas, ACL y caché RPC.
4. Publicar una sola Edge compatible con GOG revisado y verify_jwt=false.
   Confirmar artefacto/versionado. Probes y ejecuciones persistentes controladas
   requieren autorización explícita incluida en ese gate; este informe no la da.
   Verificar singleton, exclusión, persistencia y logs con el runtime real.
5. Con el job activo y baseline intacto, aplicar SOLO migración de despacho.
   Si se pausó para la ventana, reactivarlo de forma coordinada lejos del slot
   antes de aplicar esta migración (exige active=true). Mantener ID 9 y frecuencia.
6. Validar seis ciclos programados consecutivos con el procedimiento anterior.
   No ejecutar manualmente el comando del cron para simular un ciclo ya admitido.

## 9. Rollback no destructivo

Ante defectos, pausar el mismo job bajo autorización y drenar diez minutos,
incluyendo solicitudes pendientes. No borrar campañas, leases ni columnas.
Aplicar explícitamente supabase/rollback/campaign_monitor_store_dispatch.sql;
su guard comprueba el comando nuevo y restaura el hash exacto del anterior.
Conserva job ID, schedule y active. Después decidir por evidencia si revertir
solo scheduler o publicar el artefacto Edge anterior conocido. Las columnas
y RPC aditivas pueden quedarse; no ejecutar down migrations destructivas.
Reactivar el único job cuando corresponda. Volver al lote original restaura
también su riesgo CPU conocido: es recuperación del baseline, no reparación.
Si el gate de compatibilidad falla ANTES de activar el despacho, dejar el
comando original intacto y revertir únicamente la Edge si fuera necesario.

## 10. Production PASS y riesgos pendientes

Exigir seis ciclos consecutivos con diez despachos comprometidos, diez tiendas
distintas y diez resultados terminales atribuibles; cero HTTP 546/CPU shutdown,
cero omisiones/duplicados no explicados, autenticación válida, fallos aislados,
persistencia segura y campañas confirmadas conservadas. No confundir una
fuente comercial bloqueada con fallo del aislamiento: registrar ambos gates.
GOG y Steam necesitan revisión comercial separada; no se corrige Steam aquí.

Riesgos: un adaptador individual aún puede superar 2s; los datos actuales no
demuestran que todos estén siempre debajo. Si ocurre, identificar la tienda y
la etapa con su ciclo/ejecución, reproducir su payload acotado y reparar el coste
demostrado. No reducir cobertura ni inventar resultados. pg_net puede retrasar
o perder peticiones; la ventana de 15 minutos las rechaza explícitamente.
El timeout HTTP 120s puede terminar antes que el worker 400s: correlacionar
resultado de persistencia y no reintentar ciegamente.

## 11. Hashes iniciales y finales protegidos

Los hashes siguientes fueron iguales al inicio y después de la implementación
y gates; incluyen el GOG aprobado. Ninguno de estos nueve archivos fue editado.

| Archivo | SHA-256 inicial = final |
|---|---|
| components/about-page.tsx | 755852C898AD76B3C5B4B0C84F3928E4FA1C1A9A5960F327FF6D0FD8D69EAB95 |
| lib/messages/en.ts | E72F71C24E172712225C45B806E3BAD914667E709F1D5C00D419504218BBAB91 |
| lib/messages/es.ts | FA5EB32C010B439D43ED4AF563F25D1C1539B605CF28BB6626F1B93685E1E42D |
| lib/monetization.ts | ECC6DF01AB1D6AAF5A51A9603D887A162B67272BC3470BA6E2DEFBE7B55AA73A |
| next-env.d.ts | 0F70629890B72A0A82E91972CC032C04B658B26C265373CB711CF576BFBF8FCC |
| tests/bilingual-interactions.test.mjs | ABD2B85B688637D2E4F43AEBCDA82D0E35FD41955F6B904B5163D52419BC32AF |
| tests/phase-8.test.mjs | 4E5C6E3FE57899A795739AF189EA01AE2994684E0AFD8E4457E4FD42DF1FEF3B |
| supabase/functions/campaign-monitoring/adapters/gog.ts | CAA687F879E4DEBFE0A57E8DF3E34D1C074E42DC3B10673F729E9C90D661C0EE |
| tests/gog-integrity.test.mjs | 97CDF1BFDC844A816648E894166321E1C74E962660429CA53849B4D763825B93 |

## 12. Autorización posterior de publicación estructural (23 octubre)

La instrucción posterior de Johan autoriza commit/push y publicación escalonada
exclusivamente estructurales. Sustituye la inclusión de GOG indicada en el plan
anterior: el paquete limpio debe conservar gog.ts del baseline publicado y
excluir tests/gog-integrity.test.mjs. Los siete archivos de Johan y ambos archivos
GOG permanecen sin stagear, modificar ni publicar. No se autoriza POST manual.

El harness Deno incluye las 23 pruebas locales GOG únicamente con
--include-local-gog. Sin ese argumento ejecuta las 19 pruebas estructurales y
no depende del archivo protegido no publicado. Esto permite validar el paquete
limpio sin introducir accidentalmente P1-B.1. La suite del worktree mantiene el
gate mínimo de 566; las pruebas del paquete limpio reflejan solo tests publicados.

Las fases siguen siendo admisión → Edge compatible → despacho. No se usa un
comando que aplique ambas migraciones pendientes conjuntamente. El despliegue
sale del commit publicado, nunca del worktree con cambios GOG.

Preflight de publicación: worktree 566/566; Deno con GOG local 42/42;
PostgreSQL embebido 8/8. Checkout temporal con GOG publicado: suite 538/538,
Deno estructural 19/19, lint, TypeScript e imports Edge PASS. Las 28 pruebas de
diferencia son 23 de GOG y cinco de los cambios locales protegidos de Johan.
gog.ts del baseline coincide con la fuente descargada de Edge v41.

El primer ensayo del export temporal no tenía dependencias/historial y convirtió
LF a CRLF. Se descartó como entorno de validación, sin cambiar el código de la
aplicación; la repetición usa un clone temporal con core.autocrlf=false y npm ci.

El historial remoto conserva siete migraciones retiradas cuyos archivos ya no
están en Git. El CLI desde la raíz no pasa su comprobación de correspondencia.
No ejecutar migration repair ni reconstruir sistemas retirados: usar directorios
temporales por fase, con las migraciones locales aplicadas y manifiestos vacíos
solo para esas siete versiones remotas YA aplicadas. Esos manifiestos no se
commitean ni ejecutan. Cada dry-run debe listar exactamente una migración nueva,
sin seeds/roles, y la aplicación debe usar --skip-vault. Así se conserva el
timestamp original en schema_migrations y no se modifica el historial anterior.
