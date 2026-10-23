// Deno exposes its global as configurable but read-only. The existing Node
// fixtures replace that global to prevent starting a server or reading secrets.
// Make only the TEST global writable; production never imports this file.
Object.defineProperty(globalThis, 'Deno', { ...Object.getOwnPropertyDescriptor(globalThis, 'Deno'), writable: true })
await import('../campaign-monitor-stabilization.test.mjs')
// P1-B.1 is intentionally unpublished. Include it only for the protected local gate.
if (Deno.args.includes('--include-local-gog')) await import('../gog-integrity.test.mjs')
