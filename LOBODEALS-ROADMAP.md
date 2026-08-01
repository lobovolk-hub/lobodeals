# LoboDeals 3.2 — Roadmap maestro

Fecha de vigencia: 2026-08-01

## Orden activo

1. **Dirección y limpieza.** Fuente de verdad canónica, inventario, eliminación
   de contradicciones y preservación mínima de evidencia.
2. **Auditoría del refresh.** Reconstruir el flujo de mayo y evaluar runners,
   fast refresh, retry, ended deals, safe demotion y caché.
3. **Vercel.** Observar la ventana posterior al fix; mantener cero warm-up y
   preparar el desacople entre shell SEO y precio diario.
4. **Migración 007.** Aplicar únicamente con Autorización A explícita, ejecutar
   postcheck y repetir certificado/preflight read-only.
5. **Refresh de recuperación.** Con capacidad Vercel aprobada y Autorización B
   independiente, ejecutar una sola recuperación supervisada mediante el
   runner diario ya integrado en código.
6. **Mejoras públicas.** Secciones dinámicas, DLC/Editions, Unicode, Monthly,
   slugs y Google Sign-In.
7. **Mínimos.** Mostrar lowest regular y lowest PS Plus prospectivos y explicar
   si existió un mínimo menor.
8. **Tracked.** Mejorar utilidad, retención y seguimiento.
9. **Analítica y monetización.** Medir tráfico/clics e integrar ingresos con
   transparencia.
10. **Prueba de 30 días.** Iniciar solo mediante la frase reservada y después de
    cerrar las gates operativas.

## Gates actuales

- Bloque 4 tiene código local listo, pero operación real incompleta.
- Safe demotion v2 está lista e integrada localmente; 007 no está aplicada.
- ISR Writes y Active CPU tienen fuentes identificadas; la estrategia local de
  caché está aprobada, pero la operación no es segura aún bajo la cuota visible.
- Datos públicos siguen desactualizados.
- El runner único pasa 487 pruebas y 15 replays con cero efectos. El refresh de
  recuperación conserva NO-GO de 007, aprobación de capacidad Vercel,
  Edge/captcha y autorización live; no está autorizado.
- La prueba de 30 días no ha empezado.

No adelantar arquitectura avanzada, automatización o monetización a costa de
la promesa diaria y la estabilidad de Vercel.
