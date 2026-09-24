import { test } from "node:test";
import assert from "node:assert/strict";
import { createLangfuseCallbacks } from "../src/callbacks.js";
import type { TracingConfig } from "../src/config.js";

test("disabled config produces an empty callbacks array (never undefined)", () => {
  const callbacks = createLangfuseCallbacks({ enabled: false });
  assert.deepEqual(callbacks, []);
  assert.equal(Array.isArray(callbacks), true);
});

test("disabled config does not touch process.env", () => {
  const before = {
    base: process.env.LANGFUSE_BASE_URL,
    pub: process.env.LANGFUSE_PUBLIC_KEY,
    sec: process.env.LANGFUSE_SECRET_KEY,
  };
  createLangfuseCallbacks({ enabled: false });
  assert.equal(process.env.LANGFUSE_BASE_URL, before.base);
  assert.equal(process.env.LANGFUSE_PUBLIC_KEY, before.pub);
  assert.equal(process.env.LANGFUSE_SECRET_KEY, before.sec);
});

test("enabled config returns exactly one callback handler and sets the resolved env vars", () => {
  const savedEnv = {
    base: process.env.LANGFUSE_BASE_URL,
    pub: process.env.LANGFUSE_PUBLIC_KEY,
    sec: process.env.LANGFUSE_SECRET_KEY,
  };
  try {
    const config: TracingConfig = {
      enabled: true,
      baseUrl: "http://localhost:3000",
      publicKey: "pk-lf-test",
      secretKey: "sk-lf-test",
    };
    const callbacks = createLangfuseCallbacks(config);
    assert.equal(callbacks.length, 1);
    assert.equal(process.env.LANGFUSE_BASE_URL, "http://localhost:3000");
    assert.equal(process.env.LANGFUSE_PUBLIC_KEY, "pk-lf-test");
    assert.equal(process.env.LANGFUSE_SECRET_KEY, "sk-lf-test");
  } finally {
    // Restore, so this test never leaks Langfuse env into a sibling test file's run.
    if (savedEnv.base === undefined) delete process.env.LANGFUSE_BASE_URL;
    else process.env.LANGFUSE_BASE_URL = savedEnv.base;
    if (savedEnv.pub === undefined) delete process.env.LANGFUSE_PUBLIC_KEY;
    else process.env.LANGFUSE_PUBLIC_KEY = savedEnv.pub;
    if (savedEnv.sec === undefined) delete process.env.LANGFUSE_SECRET_KEY;
    else process.env.LANGFUSE_SECRET_KEY = savedEnv.sec;
  }
});
