export * from "./config.js";
export * from "./callbacks.js";
// Named (not `export *`): `tracing.js` also exports `__resetTracingForTests`, a test-only
// helper that has no business in this package's public surface.
export { initTracing } from "./tracing.js";
export type { TracingHandle, InitTracingDeps } from "./tracing.js";
// T-021: a single OTel error span through the same tracer-provider wiring (see errorSpan.ts).
export { recordErrorSpan } from "./errorSpan.js";
export type { ErrorSpanInput } from "./errorSpan.js";
