import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTracingConfig } from "../src/config.js";

const VALID_KEYS = {
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_SECRET_KEY: "sk-lf-test",
};

const CLOUD_HOSTS = [
  "cloud.langfuse.com",
  "us.cloud.langfuse.com",
  "eu.cloud.langfuse.com",
  "jp.cloud.langfuse.com",
  "hipaa.cloud.langfuse.com",
];

for (const host of CLOUD_HOSTS) {
  test(`refuses Langfuse Cloud host: ${host}`, () => {
    assert.throws(
      () =>
        loadTracingConfig({
          LANGFUSE_BASE_URL: `https://${host}`,
          ...VALID_KEYS,
        }),
      /refusing Langfuse Cloud host/,
    );
  });

  test(`refuses Langfuse Cloud host ${host} even with a path/port on the URL`, () => {
    assert.throws(
      () =>
        loadTracingConfig({
          LANGFUSE_BASE_URL: `https://${host}:443/api`,
          ...VALID_KEYS,
        }),
      /refusing Langfuse Cloud host/,
    );
  });
}

test("accepts a self-hosted localhost base URL", () => {
  const config = loadTracingConfig({
    LANGFUSE_BASE_URL: "http://localhost:3000",
    ...VALID_KEYS,
  });
  assert.deepEqual(config, {
    enabled: true,
    baseUrl: "http://localhost:3000",
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
  });
});

test("accepts a self-hosted 127.0.0.1 base URL", () => {
  const config = loadTracingConfig({
    LANGFUSE_BASE_URL: "http://127.0.0.1:3000",
    ...VALID_KEYS,
  });
  assert.equal(config.enabled, true);
});

test("accepts a self-hosted internal-domain base URL (not a Langfuse Cloud host)", () => {
  const config = loadTracingConfig({
    LANGFUSE_BASE_URL: "https://langfuse.internal.vidysea.com",
    ...VALID_KEYS,
  });
  assert.equal(config.enabled, true);
});

test("disabled + no throw when LANGFUSE_BASE_URL is missing entirely", () => {
  const config = loadTracingConfig({ ...VALID_KEYS });
  assert.deepEqual(config, { enabled: false });
});

test("disabled when only the public key is missing", () => {
  const config = loadTracingConfig({
    LANGFUSE_BASE_URL: "http://localhost:3000",
    LANGFUSE_SECRET_KEY: "sk-lf-test",
  });
  assert.deepEqual(config, { enabled: false });
});

test("disabled when only the secret key is missing", () => {
  const config = loadTracingConfig({
    LANGFUSE_BASE_URL: "http://localhost:3000",
    LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  });
  assert.deepEqual(config, { enabled: false });
});

test("disabled when the env object is empty", () => {
  const config = loadTracingConfig({});
  assert.deepEqual(config, { enabled: false });
});

test("LANGFUSE_HOST is accepted as a legacy alias for LANGFUSE_BASE_URL", () => {
  const config = loadTracingConfig({
    LANGFUSE_HOST: "http://localhost:3000",
    ...VALID_KEYS,
  });
  assert.equal(config.enabled, true);
  assert.equal(config.baseUrl, "http://localhost:3000");
});

test("LANGFUSE_HOST pointed at Langfuse Cloud is refused too", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_HOST: "https://us.cloud.langfuse.com",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("a malformed base URL throws a clear error rather than silently disabling", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "not a url",
        ...VALID_KEYS,
      }),
    /is not a valid URL/,
  );
});
