/**
 * Langfuse OTel span export (T-004, D-004, ARCHITECTURE.md H4/§5, standard rule 5:
 * D:/ai_os/umesh/operating-brain/wiki/patterns/agentic-architecture-standard.md).
 *
 * ISS-017 (senior review, critical, 2026-09-25): `@langfuse/langchain@5.11.1`'s `CallbackHandler`
 * creates OpenTelemetry spans internally (verified against its published `.d.ts` — it has no
 * network client, no Langfuse credential fields, and its private methods are named
 * `startAndRegisterOtelSpan`/`handleOtelSpanEnd`) but never exports them anywhere on its own.
 * Exporting requires a `LangfuseSpanProcessor` (`@langfuse/otel`) registered on an OTel tracer
 * provider (`@opentelemetry/sdk-trace-node`'s `NodeTracerProvider`) — verified against
 * `@langfuse/otel@5.11.1`'s published `.d.ts` and the `@langfuse/langchain@5.11.1` README
 * Quickstart (https://langfuse.com/integrations/frameworks/langchain), which registers the
 * processor with exactly this shape:
 *
 *   new NodeTracerProvider({ spanProcessors: [new LangfuseSpanProcessor()] }).register();
 *
 * Without this, tracing was a silent no-op: no errors, no network calls, and nothing ever
 * reached Langfuse.
 *
 * This module does that registration exactly once per process, with the Langfuse connection
 * details passed EXPLICITLY into `LangfuseSpanProcessor`'s constructor from a resolved
 * `TracingConfig` (never left to its env-var fallback) -- `LangfuseSpanProcessorParams.baseUrl`
 * DEFAULTS TO `"https://cloud.langfuse.com"` when omitted (verified in its published `.d.ts`), so
 * an implicit/env-only config would silently point traces -- full prompts and student
 * transcripts -- at Langfuse Cloud, which standard rule 5 (D-004) forbids unconditionally. The
 * Cloud refusal lives in config.ts (ISS-016) and is re-applied here on every call
 * (ISS-t-004-langfuse-1), so even a hand-built `TracingConfig` is checked before any processor
 * exists.
 */

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import { assertValidTracingConfig, type TracingConfig } from "./config.js";

export interface TracingHandle {
  /** Flushes any pending spans and shuts the processor down. Safe to call even when disabled. */
  shutdown: () => Promise<void>;
}

export interface InitTracingDeps {
  /**
   * Registers the given processor on a tracer provider. Defaults to the real
   * `new NodeTracerProvider({ spanProcessors: [processor] }).register()`. Tests inject a fake so
   * the module's global OTel registration state is never touched by the test suite.
   */
  registerProvider?: (processor: LangfuseSpanProcessor) => void;
  /**
   * Overrides the OTel span exporter `LangfuseSpanProcessor` hands spans to. Defaults to
   * `LangfuseSpanProcessor`'s own OTLP HTTP exporter (real network, real Langfuse ingestion).
   * Contract B7/B14 (`qa/contracts/counselling-engine.md`, 2026-09-25, after ISS-017): "emit must
   * be proven, not assumed" — tests inject an in-memory `SpanExporter` here so a real traced
   * operation can prove a span actually reached an exporter, fully offline.
   */
  exporter?: SpanExporter;
}

function defaultRegisterProvider(processor: LangfuseSpanProcessor): void {
  new NodeTracerProvider({ spanProcessors: [processor] }).register();
}

// Module-level singleton: `initTracing` must register the processor at most once per process,
// no matter how many call sites (every graph invocation, T-007+) call it.
let singletonHandle: TracingHandle | undefined;
// ISS-025: the config that won the first call, so a later call with a DIFFERENT config is detected
// instead of silently ignored.
let singletonConfig: TracingConfig | undefined;

function sameTracingConfig(a: TracingConfig, b: TracingConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.baseUrl === b.baseUrl &&
    a.publicKey === b.publicKey &&
    a.secretKey === b.secretKey
  );
}

/**
 * Idempotently wires up Langfuse OTel span export for the current process.
 *
 * - Every call first re-validates `config` (ISS-t-004-langfuse-1): a hand-built `TracingConfig`
 *   that skipped `loadTracingConfig` still can not point at Langfuse Cloud (any hostile variant),
 *   and an enabled config must carry a baseUrl and both keys.
 * - `config.enabled === false` → registers nothing, returns a no-op handle. Safe to call
 *   unconditionally at startup even when tracing is off.
 * - `config.enabled === true` → constructs exactly one `LangfuseSpanProcessor`, configured
 *   explicitly from `config` (never from `process.env`), and registers it via `deps.registerProvider`
 *   (real `NodeTracerProvider(...).register()` by default).
 * - A second call with the SAME config returns the same handle without registering again.
 * - A second call with a DIFFERENT config throws (ISS-025). The OTel provider is process-global and
 *   can only be registered once, so the first config really does win; silently ignoring the second
 *   would let a caller believe its endpoint/keys (or its "disabled") were in effect when they are
 *   not. The error names which fields differ, never their values (B11: no key in logs).
 */
export function initTracing(config: TracingConfig, deps: InitTracingDeps = {}): TracingHandle {
  assertValidTracingConfig(config);

  if (singletonHandle && singletonConfig) {
    if (!sameTracingConfig(singletonConfig, config)) {
      const fields = (["enabled", "baseUrl", "publicKey", "secretKey"] as const).filter(
        (field) => singletonConfig?.[field] !== config[field],
      );
      throw new Error(
        `initTracing (ISS-025): tracing is already initialised in this process with a different config ` +
          `(differs in: ${fields.join(", ")}). The first config stays in effect; initialise tracing once at ` +
          "startup and pass the same TracingConfig everywhere.",
      );
    }
    return singletonHandle;
  }

  if (!config.enabled) {
    singletonConfig = { ...config };
    singletonHandle = { shutdown: async () => {} };
    return singletonHandle;
  }

  const processor = new LangfuseSpanProcessor({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    exporter: deps.exporter,
  });

  const registerProvider = deps.registerProvider ?? defaultRegisterProvider;
  registerProvider(processor);

  singletonConfig = { ...config };
  singletonHandle = {
    shutdown: async () => {
      await processor.shutdown();
    },
  };
  return singletonHandle;
}

/** Test-only: clears the module singleton so each test starts from a clean slate. */
export function __resetTracingForTests(): void {
  singletonHandle = undefined;
  singletonConfig = undefined;
}
