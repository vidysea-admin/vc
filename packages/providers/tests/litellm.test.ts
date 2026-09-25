/**
 * T-019: LiteLlmProvider against a REAL in-process stub HTTP server (B14 — outcome, not
 * construction). Every test sends an actual HTTP request over 127.0.0.1 and asserts on what came
 * back, not merely that the object was constructed. No live network, no live Gemini/LiteLLM
 * gateway (B13/B8): the stub is started and stopped by the test itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import {
  LiteLlmProvider,
  LiteLlmHttpError,
  LiteLlmTimeoutError,
  LiteLlmMalformedResponseError,
  LiteLlmNetworkError,
} from "../src/index.js";

const OutSchema = z.object({ answer: z.string().min(1) });

interface StubRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Starts a stub OpenAI-compatible server; `handle` decides the response for each request. */
async function startStub(
  handle: (req: StubRequest) => { status: number; body: unknown } | "hang",
): Promise<{ baseUrl: string; server: Server; requests: StubRequest[] }> {
  const requests: StubRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const stubReq: StubRequest = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf-8") };
      requests.push(stubReq);
      const outcome = handle(stubReq);
      if (outcome === "hang") return; // never respond — used for the timeout test
      res.writeHead(outcome.status, { "content-type": "application/json" });
      res.end(typeof outcome.body === "string" ? outcome.body : JSON.stringify(outcome.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("stub server has no port");
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, server, requests };
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function chatCompletion(contentObj: unknown) {
  return {
    id: "chatcmpl-stub",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(contentObj) }, finish_reason: "stop" }],
  };
}

test("a real request goes out and a well-formed response is parsed by the caller's schema", async () => {
  const stub = await startStub(() => ({ status: 200, body: chatCompletion({ answer: "42" }) }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl, apiKey: "test-key-value" });
    const out = await provider.generate({
      skillName: "demo-skill",
      skillPrompt: "## Purpose\nanswer things",
      outputSchema: OutSchema,
      input: { q: "life" },
    });
    assert.deepEqual(out, { answer: "42" });

    assert.equal(stub.requests.length, 1);
    const sent = stub.requests[0]!;
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, "/v1/chat/completions");
    assert.equal(sent.headers.authorization, "Bearer test-key-value");
    const payload = JSON.parse(sent.body);
    assert.equal(payload.model, "balanced");
    assert.equal(payload.messages[0].role, "system");
    assert.match(payload.messages[0].content, /answer things/);
    assert.match(payload.messages[1].content, /"q":"life"/);
  } finally {
    await stop(stub.server);
  }
});

test("no Authorization header is sent when no apiKey is configured", async () => {
  const stub = await startStub(() => ({ status: 200, body: chatCompletion({ answer: "ok" }) }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl });
    await provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} });
    assert.equal(stub.requests[0]!.headers.authorization, undefined);
  } finally {
    await stop(stub.server);
  }
});

test("a non-2xx HTTP response gives a typed LiteLlmHttpError naming the status, no key value in the message", async () => {
  const stub = await startStub(() => ({ status: 500, body: { error: "internal" } }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl, apiKey: "super-secret-key" });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      (err: unknown) => {
        assert.ok(err instanceof LiteLlmHttpError);
        assert.match(err.message, /500/);
        assert.doesNotMatch(err.message, /super-secret-key/);
        return true;
      },
    );
  } finally {
    await stop(stub.server);
  }
});

test("a response whose content is not valid JSON gives a typed LiteLlmMalformedResponseError", async () => {
  const stub = await startStub(() => ({ status: 200, body: { choices: [{ message: { content: "not json {{{" } }] } }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl, apiKey: "super-secret-key" });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      (err: unknown) => {
        assert.ok(err instanceof LiteLlmMalformedResponseError);
        assert.doesNotMatch(err.message, /super-secret-key/);
        return true;
      },
    );
  } finally {
    await stop(stub.server);
  }
});

test("a response with no choices[0].message.content gives a typed LiteLlmMalformedResponseError", async () => {
  const stub = await startStub(() => ({ status: 200, body: { choices: [] } }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      LiteLlmMalformedResponseError,
    );
  } finally {
    await stop(stub.server);
  }
});

test("a response body that is not valid JSON at all gives a typed LiteLlmMalformedResponseError", async () => {
  const stub = await startStub(() => ({ status: 200, body: "{{{not json" }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      LiteLlmMalformedResponseError,
    );
  } finally {
    await stop(stub.server);
  }
});

test("well-formed JSON that fails the caller's outputSchema throws the underlying schema error (retryable upstream), not a swallowed generic error", async () => {
  const stub = await startStub(() => ({ status: 200, body: chatCompletion({ answer: "" }) }));
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      /answer/,
    );
  } finally {
    await stop(stub.server);
  }
});

test("a server that never responds times out with a typed LiteLlmTimeoutError, no key value in the message", async () => {
  const stub = await startStub(() => "hang");
  try {
    const provider = new LiteLlmProvider({ model: "balanced", baseUrl: stub.baseUrl, apiKey: "super-secret-key", timeoutMs: 100 });
    await assert.rejects(
      provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
      (err: unknown) => {
        assert.ok(err instanceof LiteLlmTimeoutError);
        assert.match(err.message, /100/);
        assert.doesNotMatch(err.message, /super-secret-key/);
        return true;
      },
    );
  } finally {
    await stop(stub.server);
  }
});

test("no server listening at all (connection refused) gives a typed LiteLlmNetworkError, no key value in the message", async () => {
  // Port 1 on loopback: nothing listens there and the connection is refused immediately.
  const provider = new LiteLlmProvider({ model: "balanced", baseUrl: "http://127.0.0.1:1/v1", apiKey: "super-secret-key", timeoutMs: 2000 });
  await assert.rejects(
    provider.generate({ skillName: "s", skillPrompt: "p", outputSchema: OutSchema, input: {} }),
    (err: unknown) => {
      assert.ok(err instanceof LiteLlmNetworkError);
      assert.doesNotMatch(err.message, /super-secret-key/);
      return true;
    },
  );
});

test("B11: the apiKey never appears in JSON.stringify / String() of the provider instance", () => {
  const provider = new LiteLlmProvider({ model: "m", baseUrl: "http://127.0.0.1:9/v1", apiKey: "super-secret-value" });
  assert.doesNotMatch(JSON.stringify(provider), /super-secret-value/);
  assert.doesNotMatch(String(provider), /super-secret-value/);
});

test("kind and model are exposed for logging/observability", () => {
  const provider = new LiteLlmProvider({ model: "smart-coding", baseUrl: "http://127.0.0.1:9/v1" });
  assert.equal(provider.kind, "litellm");
  assert.equal(provider.model, "smart-coding");
});
