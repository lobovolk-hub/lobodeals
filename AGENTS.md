# Reglas operativas de LoboDeals 3.2

LoboDeals 3.2 es la única identidad activa del proyecto. Los documentos con
versiones 1.9, 2.x, 3.0 o 3.1 son evidencia histórica, no instrucciones
operativas.

## Fuentes canónicas y orden de lectura

1. `AGENTS.md`
2. `LOBODEALS-PRODUCT-DIRECTION.md`
3. `LOBODEALS-CURRENT-STATUS.md`
4. `LOBODEALS-SYSTEM-MAP.md`
5. `LOBODEALS-OPERATIONS.md`
6. `LOBODEALS-ROADMAP.md`
7. `LOBODEALS-CONTINUITY.md`

`README.md` solo orienta hacia estas fuentes. `docs/audit/**` y Git son
evidencia, no estado vigente.

## Producto y comunicación

- Prioridad: producto actualizado y útil; operación diaria confiable;
  estabilidad y costes; mejoras visibles; retención; monetización;
  arquitectura avanzada.
- La UI pública se escribe en inglés. La comunicación con Johan se hace en
  español.
- La promesa mínima es una actualización al día, no tiempo real.
- No crear arquitecturas, simuladores, updaters ni fuentes de verdad paralelos.

## Forma de trabajo

- Codex inspecciona, modifica y prueba directamente; Johan no debe reparar
  código mediante copia y pega.
- Avanzar autónomamente en lecturas, cambios locales, pruebas y commits de
  alcance claro.
- Preservar cambios ajenos o no relacionados del worktree.
- Inspeccionar antes de modificar y validar después de modificar.
- No asumir tablas, columnas, funciones, rutas, scripts, runners, variables,
  despliegues ni comportamiento de procesos. Verificarlos en código, esquema o
  lecturas autorizadas.
- Antes de cada operación crítica, mostrar exactamente qué se ejecutará y qué
  efecto tendrá.

## Límites

- No ejecutar collectors, importadores, runners ni procesos reales sin
  autorización explícita.
- No escribir, actualizar ni eliminar datos de Supabase sin autorización
  explícita.
- No refrescar caché de producción.
- No hacer push, deploy ni abrir pull requests sin autorización explícita.
- No eliminar tablas o datos históricos adicionales ni usar `CASCADE`.
- La prueba operativa de 30 días no ha comenzado. Solo comienza cuando Johan
  escriba exactamente la frase reservada definida para ese inicio.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
