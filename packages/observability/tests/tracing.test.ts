import { test } from "node:test";
import assert from "node:assert/strict";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { initTracing, __resetTracingForTests } from "../src/tracing.js";
import { loadTracingConfig } from "../src/config.js";
import type { TracingConfig } from "../src/config.js";

// ISS-017 (senior review, critical): @langfuse/langchain's CallbackHandler creates OTel spans
// internally but never exports them anywhere on its own -- exporting requires a
// LangfuseSpanProcessor (from @langfuse/otel) registered on an OTel tracer provider
// (@opentelemetry/sdk-trace-node's NodeTracerProvider). Without this, tracing was a silent
// no-op: everything "worked" (no errors, no network) and nothing ever reached Langfuse.
//
// Every test here injects `registerProvider` instead of letting initTracing call the real
// `NodeTracerProvider(...).register()` -- this keeps the module's global OTel state untouched
// (so tests never interfere with each other or a later real graph run in-process) and keeps
// these tests fully offline: the *processor* is always the real `LangfuseSpanProcessor` class
// (so `instanceof` and its resolved config are genuine), but nothing calls network-facing
// methods (`onEnd`/`forceFlush`/`export`) on it.

const VALID_KEYS = {
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_SECRET_KEY: "sk-lf-test",
};

function enabledConfig(baseUrl = "http://localhost:3000"): TracingConfig {
  return {
    enabled: true,
    baseUrl,
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
  };
}

test("enabled config registers exactly one LangfuseSpanProcessor configured with the given baseUrl", (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const registered: LangfuseSpanProcessor[] = [];
  const handle = initTracing(enabledConfig("http://localhost:3000"), {
    registerProvider: (processor) => registered.push(processor),
  });

  assert.equal(registered.length, 1, "expected exactly one processor registered");
  assert.ok(
    registered[0] instanceof LangfuseSpanProcessor,
    "the registered processor must be a real LangfuseSpanProcessor instance",
  );
  // LangfuseSpanProcessor's fields are declared `private` in its .d.ts, but TypeScript `private`
  // is a compile-time-only guard -- it compiles to a normal enumerable property, so this reads
  // the actual resolved baseUrl the processor was constructed with (not a mock/spy value).
  assert.equal((registered[0] as unknown as { baseUrl?: string }).baseUrl, "http://localhost:3000");
  assert.equal(typeof handle.shutdown, "function");
});

test("calling initTracing twice with the same-shaped enabled config registers exactly once (idempotent)", (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const registered: LangfuseSpanProcessor[] = [];
  const deps = { registerProvider: (processor: LangfuseSpanProcessor) => registered.push(processor) };

  const handleA = initTracing(enabledConfig(), deps);
  const handleB = initTracing(enabledConfig(), deps);

  assert.equal(registered.length, 1, "registerProvider must only run on the first call");
  assert.equal(handleA, handleB, "the same handle must be returned on subsequent calls");
});

test("disabled config registers nothing and returns a no-op handle", async (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const registered: LangfuseSpanProcessor[] = [];
  const handle = initTracing(
    { enabled: false },
    { registerProvider: (processor) => registered.push(processor) },
  );

  assert.equal(registered.length, 0, "a disabled config must never register a processor");
  assert.equal(typeof handle.shutdown, "function");
  await assert.doesNotReject(() => handle.shutdown(), "a no-op handle's shutdown must resolve cleanly");
});

test("the Langfuse Cloud refusal still applies through the loadTracingConfig -> initTracing pipeline", (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  // initTracing itself trusts its TracingConfig input -- the refusal lives in loadTracingConfig
  // (config.ts, ISS-016), which is the only place a TracingConfig is legitimately produced from
  // env. This proves the full pipeline still refuses Langfuse Cloud after the ISS-017 rewrite,
  // including the trailing-dot bypass ISS-016 fixed.
  assert.throws(
    () =>
      initTracing(
        loadTracingConfig({
          LANGFUSE_BASE_URL: "https://cloud.langfuse.com./v1",
          ...VALID_KEYS,
        }),
      ),
    /refusing Langfuse Cloud host/,
  );
});
