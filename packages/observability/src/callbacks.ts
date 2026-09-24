import { CallbackHandler } from "@langfuse/langchain";
import type { TracingConfig } from "./config.js";
import { initTracing } from "./tracing.js";

/**
 * Thin adapter: turns a resolved TracingConfig into the LangChain callback array a LangGraph
 * `config.callbacks` (or any LangChain `.invoke(..., { callbacks })`) expects. Callers can always
 * spread this in unconditionally — it's `[]` when tracing is disabled, never `undefined`.
 *
 * ISS-017 (senior review, critical, 2026-09-25) corrected a wrong comment here: this adapter used
 * to set `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` on `process.env`,
 * believing the underlying `@langfuse/core` client read connection details exclusively that way.
 * That was never true for `@langfuse/langchain`'s `CallbackHandler` -- its published `.d.ts`
 * (`ConstructorParams: { userId?, sessionId?, tags?, version?, traceMetadata? }`) has no
 * Langfuse-credential fields and no network client of its own; its private methods
 * (`startAndRegisterOtelSpan`/`handleOtelSpanEnd`) show it only creates OpenTelemetry spans.
 * Export happens entirely through whichever `LangfuseSpanProcessor` is registered on the process's
 * global OTel tracer provider -- see `tracing.ts`, which takes `config` EXPLICITLY (never
 * `process.env`) so a hand-constructed `TracingConfig` can never silently fall through to
 * `LangfuseSpanProcessor`'s own `https://cloud.langfuse.com` default. So this adapter now calls
 * `initTracing(config)` (idempotent -- safe even if a caller already initialized tracing at
 * startup) instead of mutating `process.env`, and constructs the handler with zero Langfuse
 * config, matching the `@langfuse/langchain@5.11.1` README Quickstart
 * (https://langfuse.com/integrations/frameworks/langchain).
 */
export function createLangfuseCallbacks(config: TracingConfig): CallbackHandler[] {
  if (!config.enabled) return [];

  initTracing(config);

  return [new CallbackHandler({})];
}
