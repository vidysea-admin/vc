import { test } from "node:test";
import assert from "node:assert/strict";
import { SpanStatusCode } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { initTracing, __resetTracingForTests } from "../src/tracing.js";
import { recordErrorSpan } from "../src/errorSpan.js";
import type { TracingConfig } from "../src/config.js";

// Contract B7/B14 (qa/contracts/counselling-engine.md): "emit must be proven, not assumed" -- same
// RecordingExporter pattern as outcome.test.ts, applied to recordErrorSpan instead of a LangChain
// Runnable. Proves a real span reaches a real exporter through the real initTracing ->
// LangfuseSpanProcessor -> OTel export path; only the destination (the exporter) is faked, and it
// never leaves the process.
//
// IMPORTANT (found while writing this test): the real `NodeTracerProvider(...).register()` call
// (initTracing's default registerProvider) sets a PROCESS-GLOBAL OTel tracer provider that
// `@opentelemetry/api` refuses to replace on a second real registration -- __resetTracingForTests
// only resets this module's OWN singleton, never that global. So, like outcome.test.ts, this file
// calls the real (non-injected-registerProvider) initTracing path at most ONCE, in test order (node
// runs a file's top-level tests sequentially, in one process, by default) -- everything that needs
// the real global registration happens inside that one test.

test("T-021: recordErrorSpan never throws before any tracing was ever initialised in this process (default OTel no-op tracer)", () => {
  __resetTracingForTests();
  assert.doesNotThrow(() =>
    recordErrorSpan({ name: "provider.failover.exhausted", errorName: "AiUnavailableError", errorMessage: "no chain configured" }),
  );
});

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
  return { enabled: true, baseUrl: "http://localhost:3000", publicKey: "pk-lf-test", secretKey: "sk-lf-test" };
}

test("T-021/B7/B14/B11/B13: recordErrorSpan exports a real ERROR span with the given fields, and leaks no out-of-band secret (outcome, not construction)", async (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const exporter = new RecordingExporter();
  // The ONE real (non-injected-registerProvider) initTracing call in this file — see the file-level
  // note above.
  const handle = initTracing(enabledConfig(), { exporter });

  const OUT_OF_BAND_SECRET = "sk-never-passed-to-recordErrorSpan";

  recordErrorSpan({
    name: "provider.failover.exhausted",
    // "gen_ai.system" is required for LangfuseSpanProcessor's default shouldExportSpan filter to
    // forward this span at all (see errorSpan.ts's CALLER NOTE) -- without it the span is real and
    // recording but silently dropped before export, which is exactly the bug this test caught
    // (first version of this test asserted 0 exported spans and failed for the wrong reason).
    attributes: { "gen_ai.system": "litellm", "failover.models": "fast-cheap -> balanced -> smart-coding", "failover.attempts": 10, "failover.last_error_name": "LiteLlmTimeoutError" },
    errorName: "AiUnavailableError",
    errorMessage: "every model in the failover chain (fast-cheap -> balanced -> smart-coding) failed after 10 attempt(s)",
  });

  await handle.shutdown();

  assert.equal(exporter.exported.length, 1, `expected exactly one exported span, got ${exporter.exported.length}`);
  const span = exporter.exported[0]!;
  assert.equal(span.name, "provider.failover.exhausted");
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["failover.attempts"], 10);
  assert.equal(span.attributes["failover.last_error_name"], "LiteLlmTimeoutError");
  assert.equal(span.events.length, 1, "expected one recorded exception event");
  assert.equal(span.events[0]!.name, "exception");

  const serialized = JSON.stringify({ name: span.name, attributes: span.attributes, status: span.status, events: span.events.map((e) => ({ name: e.name, attributes: e.attributes })) });
  assert.doesNotMatch(serialized, new RegExp(OUT_OF_BAND_SECRET), "recordErrorSpan must never surface anything beyond exactly what its caller passed in");
});
