import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  MockProvider,
  GeminiProvider,
  createProvider,
  loadProviderConfig,
  providersStatus,
} from "../src/index.js";

const OutSchema = z.object({ answer: z.string().min(1) });

test("providersStatus no longer reports a scaffold placeholder", () => {
  assert.doesNotMatch(providersStatus(), /not yet implemented/);
});

test("MockProvider returns the canned output parsed by the caller's Zod schema (typed output)", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": { answer: "42" } } });
  const out = await provider.generate({
    skillName: "demo-skill",
    skillPrompt: "## Purpose\nanswer things",
    outputSchema: OutSchema,
    input: { q: "life" },
  });
  assert.deepEqual(out, { answer: "42" });
});

test("MockProvider records every call (skill name, prompt, input) so tests can prove zero calls", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": (input: unknown) => ({ answer: JSON.stringify(input) }) } });
  assert.equal(provider.calls.length, 0);
  const out = await provider.generate({ skillName: "demo-skill", skillPrompt: "P", outputSchema: OutSchema, input: { a: 1 } });
  assert.equal(out.answer, '{"a":1}');
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.skillName, "demo-skill");
  assert.equal(provider.calls[0]?.skillPrompt, "P");
  assert.deepEqual(provider.calls[0]?.input, { a: 1 });
});

test("MockProvider refuses an output that does not match the schema (no free text crosses the seam, B5)", async () => {
  const provider = new MockProvider({ responses: { "demo-skill": { answer: "" } } });
  await assert.rejects(
    provider.generate({ skillName: "demo-skill", skillPrompt: "P", outputSchema: OutSchema, input: {} }),
    /answer/,
  );
});

test("MockProvider throws for a skill with no canned response (never invents output)", async () => {
  const provider = new MockProvider({ responses: {} });
  await assert.rejects(
    provider.generate({ skillName: "unknown", skillPrompt: "P", outputSchema: OutSchema, input: {} }),
    /no canned response/,
  );
});

test("B6: loadProviderConfig reads the provider and model from config, and requires both for gemini", () => {
  assert.deepEqual(loadProviderConfig({ VC_LLM_PROVIDER: "mock" }), { provider: "mock", model: "mock" });
  assert.deepEqual(
    loadProviderConfig({ VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "gemini-x-flash", GEMINI_API_KEY: "k" }),
    { provider: "gemini", model: "gemini-x-flash", apiKey: "k" },
  );
  assert.throws(() => loadProviderConfig({}), /VC_LLM_PROVIDER/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "openai" }), /VC_LLM_PROVIDER/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k" }), /VC_LLM_MODEL/);
  assert.throws(() => loadProviderConfig({ VC_LLM_PROVIDER: "gemini", VC_LLM_MODEL: "m" }), /GEMINI_API_KEY/);
});

test("B6: createProvider selects the implementation by config; the Gemini stub is constructed, never called", () => {
  const gemini = createProvider({ provider: "gemini", model: "gemini-x-flash", apiKey: "k" });
  assert.ok(gemini instanceof GeminiProvider);
  assert.equal(gemini.kind, "gemini");
  assert.equal(gemini.model, "gemini-x-flash");

  const mock = createProvider({ provider: "mock", model: "mock" }, { mockResponses: { s: { answer: "x" } } });
  assert.ok(mock instanceof MockProvider);
  assert.equal(mock.kind, "mock");
});

test("B11: the Gemini stub never exposes its key through JSON or string conversion", () => {
  const gemini = new GeminiProvider({ model: "m", apiKey: "super-secret-value" });
  assert.doesNotMatch(JSON.stringify(gemini), /super-secret-value/);
  assert.doesNotMatch(String(gemini), /super-secret-value/);
});
