import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnableLambda } from "@langchain/core/runnables";
import { ExportResultCode } from "@opentelemetry/core";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { initTracing, __resetTracingForTests } from "../src/tracing.js";
import { createLangfuseCallbacks } from "../src/callbacks.js";
import type { TracingConfig } from "../src/config.js";

// Contract B7/B14 (qa/contracts/counselling-engine.md, amended 2026-09-25 commit 485b6ca, after
// t-004 cycle-0's PASS miss on ISS-016/ISS-017): "Emit must be proven, not assumed" -- an
// integration unit's tests must capture the claimed effect end to end (here: a span actually
// reaching an exporter), not stop at "the client/processor was constructed". tracing.test.ts
// proves construction + registration + idempotency with a spy `registerProvider`; THIS file
// proves the outcome -- a real LangChain Runnable invocation, through the real
// createLangfuseCallbacks -> initTracing -> LangfuseSpanProcessor -> OTel export path, produces at
// least one exported span. Only the destination is faked -- the export mechanism itself, and the
// global OTel tracer registration (initTracing's default `registerProvider`), are real. No network
// call ever happens: RecordingExporter below never leaves the process.
//
// Deliberately NOT `@opentelemetry/sdk-trace-base`'s own `InMemorySpanExporter`: its `shutdown()`
// (verified against its published source) does `this._finishedSpans = []` *before* resolving --
// i.e. it wipes its own list as part of being shut down. `TracingHandle.shutdown()` (tracing.ts)
// calls `processor.shutdown()`, which flushes pending spans to the exporter and THEN shuts the
// exporter down -- so reading `InMemorySpanExporter.getFinishedSpans()` after `handle.shutdown()`
// would always see an empty array regardless of whether export happened. RecordingExporter here
// just accumulates every span handed to `export()` and never clears itself.
class RecordingExporter implements SpanExporter {
  readonly exported: ReadableSpan[] = [];

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.exported.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {}

  async forceFlush(): Promise<void> {}
}

function enabledConfig(): TracingConfig {
  return {
    enabled: true,
    baseUrl: "http://localhost:3000",
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
  };
}

test("B7/B14: a real traced Runnable invocation exports at least one span (outcome, not construction)", async (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const exporter = new RecordingExporter();
  // Initialize tracing directly first, with the recording exporter injected (and the *real*
  // default `registerProvider`, so a genuine global NodeTracerProvider gets registered). The
  // createLangfuseCallbacks() call below invokes initTracing(config) again with no deps -- ISS-017's
  // idempotency guard (tracing.ts: module-level `singletonHandle`) makes that call a no-op that
  // returns this same handle, so the injected exporter stays the one actually wired in.
  const handle = initTracing(enabledConfig(), { exporter });

  const callbacks = createLangfuseCallbacks(enabledConfig());
  assert.equal(callbacks.length, 1, "expected exactly one CallbackHandler");

  const echo = RunnableLambda.from((input: string) => input.toUpperCase());
  const result = await echo.invoke("ping", { callbacks, runName: "t004-outcome-test" });
  assert.equal(result, "PING", "the traced Runnable must still return its real result");

  // LangfuseSpanProcessor's shutdown() flushes pending spans to the exporter before closing, per
  // its published .d.ts ("ensuring all pending operations are completed") -- verified in practice
  // by instrumenting the real exporter.export() call during this fix cycle.
  await handle.shutdown();

  assert.ok(
    exporter.exported.length > 0,
    `expected at least one span to reach the exporter, got ${exporter.exported.length}`,
  );
});

test("B7/B14: a disabled config exports zero spans -- no processor is ever constructed", async (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const exporter = new RecordingExporter();
  // Even with an exporter injected, initTracing's disabled branch must return before
  // LangfuseSpanProcessor (and therefore this exporter) is ever constructed or attached to
  // anything.
  const handle = initTracing({ enabled: false }, { exporter });

  const callbacks = createLangfuseCallbacks({ enabled: false });
  assert.deepEqual(callbacks, [], "disabled config must produce zero callbacks");

  const echo = RunnableLambda.from((input: string) => input.toUpperCase());
  // No callbacks passed -- disabled tracing means nothing observes this invocation at all.
  const result = await echo.invoke("ping");
  assert.equal(result, "PING");

  await handle.shutdown();
  assert.deepEqual(exporter.exported, [], "a disabled config must export zero spans");
});
