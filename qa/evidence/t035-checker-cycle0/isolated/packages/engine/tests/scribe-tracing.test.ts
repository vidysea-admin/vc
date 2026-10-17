/**
 * B7/B14: a scribe graph run emits spans through the REAL export path
 * (createLangfuseCallbacks -> initTracing -> LangfuseSpanProcessor -> OTel
 * exporter). Only the destination is an in-process recording exporter; no
 * network. Its own file, so the global OTel provider registration is isolated
 * in its own test process (node:test runs each file in a subprocess).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { initTracing } from "@vc/observability";
import { startScribe, resumeScribe, scribeRunConfig } from "../src/scribe/index.js";
import { makeHarness, baseInput } from "./scribe-fixtures.js";

class RecordingExporter implements SpanExporter {
  readonly exported: ReadableSpan[] = [];
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.exported.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

const TRACING = {
  enabled: true,
  baseUrl: "http://localhost:3000",
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
} as const;

test("B7/B14: a scribe run with @vc/observability callbacks exports spans for the graph's nodes", async (t) => {
  const exporter = new RecordingExporter();
  const handle = initTracing({ ...TRACING }, { exporter });

  const h = makeHarness();
  const run = scribeRunConfig({ threadId: "thread-traced", tracing: { ...TRACING } });
  assert.equal(run.callbacks.length, 1, "enabled tracing yields one Langfuse callback handler");

  const first = await startScribe(h.graph, baseInput(), run);
  assert.equal(first.kind, "awaiting_approval");
  const done = await resumeScribe(h.graph, { action: "approve" }, run);
  assert.equal(done.kind === "done" && done.result.status, "written");

  await handle.shutdown();

  const names = exporter.exported.map((s) => s.name);
  t.diagnostic(`exported spans: ${names.join(", ")}`);
  assert.ok(exporter.exported.length > 0, "at least one span must reach the exporter");
  assert.ok(
    names.some((n) => n.includes("extract_facts")),
    `a span for the extract_facts node must be exported; got: ${names.join(", ")}`,
  );
});

test("B7: scribeRunConfig with tracing disabled adds no callbacks", () => {
  const run = scribeRunConfig({ threadId: "t", tracing: { enabled: false } });
  assert.deepEqual(run.callbacks, []);
});
