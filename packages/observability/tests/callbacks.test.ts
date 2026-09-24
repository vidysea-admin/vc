import { test } from "node:test";
import assert from "node:assert/strict";
import { createLangfuseCallbacks } from "../src/callbacks.js";
import { __resetTracingForTests } from "../src/tracing.js";
import type { TracingConfig } from "../src/config.js";

// ISS-017 (senior review, critical): createLangfuseCallbacks used to set LANGFUSE_BASE_URL/
// LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY on process.env, on the wrong assumption that
// @langfuse/langchain's CallbackHandler read Langfuse credentials that way. It never did (see the
// comment in callbacks.ts) -- exporting spans is entirely the registered LangfuseSpanProcessor's
// job (tracing.ts), configured explicitly, never via env. process.env must now be untouched by
// this function in every case, enabled or disabled.

function snapshotLangfuseEnv() {
  return {
    base: process.env.LANGFUSE_BASE_URL,
    pub: process.env.LANGFUSE_PUBLIC_KEY,
    sec: process.env.LANGFUSE_SECRET_KEY,
  };
}

test("disabled config produces an empty callbacks array (never undefined)", () => {
  const callbacks = createLangfuseCallbacks({ enabled: false });
  assert.deepEqual(callbacks, []);
  assert.equal(Array.isArray(callbacks), true);
});

test("disabled config does not touch process.env", () => {
  const before = snapshotLangfuseEnv();
  createLangfuseCallbacks({ enabled: false });
  assert.deepEqual(snapshotLangfuseEnv(), before);
});

test("enabled config returns exactly one callback handler and never touches process.env (ISS-017)", (t) => {
  __resetTracingForTests();
  t.after(__resetTracingForTests);

  const before = snapshotLangfuseEnv();
  const config: TracingConfig = {
    enabled: true,
    baseUrl: "http://localhost:3000",
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
  };
  const callbacks = createLangfuseCallbacks(config);
  assert.equal(callbacks.length, 1);
  assert.deepEqual(
    snapshotLangfuseEnv(),
    before,
    "createLangfuseCallbacks must resolve Langfuse config explicitly, never via process.env",
  );
});
