/**
 * T-021 (D-020, contract B6 "runtime failover"): a single OTel error span, emitted through
 * whatever tracer provider `initTracing` (tracing.ts) already registered for this process — the
 * SAME LangfuseSpanProcessor export path `callbacks.ts` uses for LangChain runs. This lets a
 * component that is NOT a LangChain Runnable (packages/providers' FailoverProvider, when every
 * model in its chain has failed) still raise a Langfuse-visible error trace, through the existing
 * observability wiring rather than a second exporter.
 *
 * Safe to call unconditionally, even before `initTracing` ever ran in this process (tracing
 * disabled, or a process that never traces at all): `@opentelemetry/api`'s `trace.getTracer()`
 * returns its documented no-op tracer when no provider has been registered globally, so this never
 * throws and never makes (or blocks on) a network call of its own.
 *
 * CALLER NOTE: `LangfuseSpanProcessor`'s default `shouldExportSpan` filter (verified against
 * `@langfuse/otel@5.11.1`'s published dist, `span-filter.ts`'s `isDefaultExportSpan`) only forwards
 * a span it recognises as LLM-related — its own instrumentation scope, a known LLM instrumentor's
 * scope, or an attribute key that starts with `"gen_ai."`. A span with neither is a perfectly real,
 * correctly-built OTel span that is still silently dropped before it ever reaches Langfuse. A
 * caller whose span is genuinely about an LLM/provider failure should include at least one
 * `"gen_ai.*"` attribute (e.g. `"gen_ai.system"`) so the default filter forwards it.
 */
import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";

const TRACER_NAME = "@vc/observability/error-span";

export interface ErrorSpanInput {
  /** The span name, e.g. "provider.failover.exhausted". */
  name: string;
  /** Structured, KEY-FREE attributes (B11/B13): no API key value, no transcript/student text. */
  attributes?: Attributes;
  errorName: string;
  /** Already key-free and transcript-free — the caller's responsibility, same as every typed error in this codebase (B11). */
  errorMessage: string;
}

/**
 * Starts a span, records the given error on it (OTel's own `recordException`, which produces a
 * standard `exception` event), marks the span ERROR, and ends it immediately — this is a single
 * point-in-time error event, not a span around ongoing work.
 */
export function recordErrorSpan(input: ErrorSpanInput): void {
  const tracer = trace.getTracer(TRACER_NAME);
  const span = tracer.startSpan(input.name, { attributes: input.attributes });
  span.recordException({ name: input.errorName, message: input.errorMessage });
  span.setStatus({ code: SpanStatusCode.ERROR, message: input.errorMessage });
  span.end();
}
