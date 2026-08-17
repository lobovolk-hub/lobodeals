# LoboDeals 3.2 — Dirección de producto

Fecha de vigencia: 2026-08-01

## Misión

Ayudar a jugadores de PlayStation US a descubrir juegos, bundles y DLC/Add-ons
para PS4 y PS5, entender su precio actual y salir con claridad hacia la compra.

## Usuario y propuesta de valor

El usuario quiere encontrar contenido relevante y saber, sin interpretar datos
técnicos, si existe un descuento regular, un precio de PS Plus o un mínimo
prospectivo. LoboDeals debe:

- incorporar productos nuevos;
- actualizar descuentos y precios al menos una vez al día;
- retirar descuentos terminados;
- diferenciar precio regular, oferta regular y precio PS Plus;
- conservar Games, Bundles y DLC/Add-ons;
- mostrar mínimos prospectivos certificados;
- avisar cuando el precio actual no sea el mínimo observado;
- ofrecer una salida de compra clara;
- actualizar sin depender de visitas a cada slug;
- generar tráfico, clics comerciales e ingresos.

La experiencia pública está validada. No se rediseña sin una necesidad de
producto demostrable. Toda la UI pública se mantiene en inglés.

## Promesa diaria

LoboDeals promete una actualización completa al menos una vez al día, no datos
en tiempo real. Un fallo debe ser visible y conservar el último dato válido; no
debe publicar un éxito parcial como ciclo completo.

## Precios y mínimos

- Regular y PS Plus son familias distintas.
- El entitlement gratuito de Monthly Games no es un descuento regular ni un
  precio PS Plus comercial. La membresía Monthly del producto no invalida una
  oferta regular o PS Plus comercial independiente, positiva y certificada.
- Los mínimos son prospectivos: empiezan con observaciones futuras de ciclos
  certificados y nunca se reconstruyen desde el histórico retirado.
- Un mínimo solo se inicializa con un precio positivo, coherente, de identidad y
  familia seguras; solo cambia ante un precio estrictamente menor.
- `Lowest PS+ Price Ever` nunca usa el entitlement Monthly `0`, un buy-box PS+
  `0` ni `temporary_free_promotion_candidate`; sí admite un precio PS+ comercial
  independiente y certificado aunque el producto esté Monthly activo.

## Prioridades visibles

1. Retirar el carrusel manual y crear secciones dinámicas.
2. Restaurar DLC y Editions.
3. Eliminar mojibake.
4. Presentar correctamente lowest regular y lowest PS Plus.
5. Actualizar Monthly.
6. Mejorar Tracked.
7. Corregir Google Sign-In.
8. Añadir valor a los slugs.
9. Instrumentar monetización.

Estas prioridades empiezan después de recuperar una operación diaria confiable
y reducir el riesgo de costes.

## Retención y monetización

La retención debe crecer mediante seguimiento útil, Monthly, mejores slugs y
señales de precio comprensibles. La monetización debe medir clics salientes,
usar enlaces comerciales transparentes y no degradar la confianza del dato.

## No objetivos actuales

- tiempo real;
- regiones o storefronts adicionales;
- una nueva arquitectura de ingesta paralela;
- otro simulador o updater alternativo;
- backfill del histórico retirado;
- gráficas de historial detallado;
- iniciar la prueba de 30 días antes de sus gates.

La infraestructura existe para mantener el producto actualizado, útil y
sostenible; no es una finalidad separada.
