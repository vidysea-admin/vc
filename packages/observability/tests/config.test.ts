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

// ISS-016 (senior review, critical): the Cloud refusal was an exact-match Set lookup on the raw
// hostname, so a trailing-dot FQDN (which resolves to the exact same host over DNS) bypassed it
// entirely -- `loadTracingConfig({LANGFUSE_BASE_URL:'https://cloud.langfuse.com./v1', ...keys})`
// returned `enabled: true`. Fixed by normalising (lowercase + strip all trailing dots) before the
// lookup, and by refusing `langfuse.com` and any `*.langfuse.com` suffix as a catch-all.
test("ISS-016: refuses a Langfuse Cloud host with a single trailing DNS-root dot", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com./v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016: refuses a Langfuse Cloud host with a double trailing dot", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com../v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016: refuses an uppercase Langfuse Cloud host with a trailing dot", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://CLOUD.LANGFUSE.COM./v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016: refuses an arbitrary *.langfuse.com subdomain not in the explicit Set", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://foo.cloud.langfuse.com/v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016: refuses the bare apex host langfuse.com", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://langfuse.com/v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

// Contract B7 (qa/contracts/counselling-engine.md, amended 2026-09-25 after ISS-016): "Host guards
// are tested against hostile variants: trailing dot, mixed case, explicit port, userinfo,
// IDN/punycode." Trailing dot, double trailing dot, uppercase+trailing dot and explicit port are
// covered above; userinfo and IDN/punycode below. Both are verified against real Node `URL`
// behavior (not assumed): `new URL("https://user:pass@cloud.langfuse.com/v1").hostname` and
// `new URL("https://cloud。langfuse。com/v1").hostname` (IDEOGRAPHIC FULL STOP, U+3002 --
// and FULLWIDTH FULL STOP, U+FF0E, likewise) both resolve to the plain ASCII "cloud.langfuse.com"
// under WHATWG URL's IDNA host-parsing step, so loadTracingConfig's existing normalise-then-refuse
// logic (config.ts) already refuses them; these tests pin that down so a future change to the
// normalisation logic can't silently regress it.
test("ISS-016 hostile variant: refuses a Langfuse Cloud host with userinfo (user:pass@) in the URL", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://attacker:token@cloud.langfuse.com/v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016 hostile variant: refuses a Langfuse Cloud host written with IDN ideographic-full-stop dots (U+3002)", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://cloud。langfuse。com/v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016 hostile variant: refuses a Langfuse Cloud host written with IDN fullwidth-full-stop dots (U+FF0E)", () => {
  assert.throws(
    () =>
      loadTracingConfig({
        LANGFUSE_BASE_URL: "https://cloud．langfuse．com/v1",
        ...VALID_KEYS,
      }),
    /refusing Langfuse Cloud host/,
  );
});

test("ISS-016: still accepts localhost, 127.0.0.1 and a non-langfuse.com internal domain", () => {
  assert.equal(
    loadTracingConfig({ LANGFUSE_BASE_URL: "http://localhost:3000", ...VALID_KEYS }).enabled,
    true,
  );
  assert.equal(
    loadTracingConfig({ LANGFUSE_BASE_URL: "http://127.0.0.1:3000", ...VALID_KEYS }).enabled,
    true,
  );
  assert.equal(
    loadTracingConfig({
      LANGFUSE_BASE_URL: "https://langfuse.internal.vidysea.com",
      ...VALID_KEYS,
    }).enabled,
    true,
  );
});
