# LoboDeals 3.2 — Roadmap maestro

Fecha de vigencia: 2026-08-01

## Orden activo

1. **Dirección y limpieza.** Fuente de verdad canónica, inventario, eliminación
   de contradicciones y preservación mínima de evidencia.
2. **Auditoría del refresh.** Reconstruir el flujo de mayo y evaluar runners,
   fast refresh, retry, ended deals, safe demotion y caché.
3. **Runner diario.** Integrar adapters reales, safe demotion v2, receipts,
   certificación, cache v16, reconciliación y pruebas end-to-end.
4. **Vercel.** Observar la ventana posterior al fix; mantener cero warm-up y
   preparar el desacople entre shell SEO y precio diario.
5. **Refresh de recuperación.** Preparar y, solo con autorización futura,
   recuperar datos públicos con gates y observación de Vercel.
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
- Safe demotion v2 está lista localmente, no aplicada ni integrada.
- ISR Writes y Active CPU tienen fuentes identificadas; la estrategia local de
  caché está aprobada, pero la operación no es segura aún bajo la cuota visible.
- Datos públicos siguen desactualizados.
- El refresh de recuperación no está autorizado.
- La prueba de 30 días no ha empezado.

No adelantar arquitectura avanzada, automatización o monetización a costa de
la promesa diaria y la estabilidad de Vercel.
