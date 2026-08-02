# LoboDeals 3.2 — Roadmap maestro

Fecha de vigencia: 2026-08-02

## Orden activo

1. **Dirección y limpieza.** Fuente de verdad canónica, inventario, eliminación
   de contradicciones y preservación mínima de evidencia.
2. **Auditoría del refresh.** Reconstruir el flujo de mayo y evaluar runners,
   fast refresh, retry, ended deals, safe demotion y caché.
3. **Vercel.** Observar la ventana posterior al fix; mantener cero warm-up y
   preparar el desacople entre shell SEO y precio diario.
4. **Migración 007 — completada.** Aplicada una sola vez con Autorización A;
   postcheck, certificado posterior y preflight read-only aprobados.
5. **Conexión live y Edge runtime.** Implementar los adapters de producción
   verificables detrás de los 23 contratos y repetir Edge/CDP desde un entorno
   que permita a `msedge.exe` visible conservar `127.0.0.1:9222`.
6. **Refresh de recuperación.** Solo después de `live-preflight` sin blockers,
   evidencia Vercel renovada y una Autorización B independiente, ejecutar una
   sola recuperación supervisada.
7. **Mejoras públicas.** Secciones dinámicas, DLC/Editions, Unicode, Monthly,
   slugs y Google Sign-In.
8. **Mínimos.** Mostrar lowest regular y lowest PS Plus prospectivos y explicar
   si existió un mínimo menor.
9. **Tracked.** Mejorar utilidad, retención y seguimiento.
10. **Analítica y monetización.** Medir tráfico/clics e integrar ingresos con
   transparencia.
11. **Prueba de 30 días.** Iniciar solo mediante la frase reservada y después de
    cerrar las gates operativas.

## Gates actuales

- Bloque 4 tiene código local listo, pero operación real incompleta.
- Safe demotion v2 está lista, integrada y aplicada mediante 007; v1 ya no es
  ejecutable por `service_role`.
- ISR Writes y Active CPU tienen fuentes identificadas; la estrategia local de
  caché está aprobada, pero la operación no es segura aún bajo la cuota visible.
- Datos públicos siguen desactualizados.
- El runner único pasa 507 pruebas y 15 replays con cero efectos. Sus 23
  contratos están completos, pero el executor de producción no está enlazado.
- La evidencia manual Vercel 211/240 pasa el umbral con 29 minutos de margen,
  aunque debe renovarse antes de live. Edge PowerShell y captcha automático
  pasan pruebas locales; el runtime CDP real quedó bloqueado por el entorno.
- El refresh conserva NO-GO y no existe Autorización B vigente.
- La prueba de 30 días no ha empezado.

No adelantar arquitectura avanzada, automatización o monetización a costa de
la promesa diaria y la estabilidad de Vercel.
