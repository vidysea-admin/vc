/**
 * The model/provider seam (ARCHITECTURE.md H5, D-005, contract B6): model choice goes through
 * config, never a hardcoded SDK call inside a graph node.
 *
 * One interface, `LlmProvider.generate({skillName, skillPrompt, outputSchema, input})`:
 *   - `skillPrompt` is the body of `skills/<skillName>/SKILL.md` (loaded by the caller through the
 *     engine's skill loader), so prompts live in skills, not in code (B6);
 *   - `outputSchema` is the Zod schema of the node's output; every provider MUST return a value
 *     parsed by it, so no free text crosses the seam (B5).
 *
 * Implementations:
 *   - `MockProvider`: deterministic canned outputs per skill, records every call. Used by every
 *     automated test (B8/B13: tests are offline).
 *   - `GeminiProvider`: a STUB selected by config. It holds the model name and key but has no
 *     network code yet; `generate` throws. The real call is a later unit, and live runs need
 *     synthetic fixtures or the recorded gate (B13, qa/gates/real-transcripts-gemini.md).
 */
import { z } from "zod";

export type ProviderKind = "mock" | "gemini";

export interface GenerateRequest<T> {
  /** The skill folder name, e.g. "fact-extraction". */
  skillName: string;
  /** The SKILL.md body (prompt + soft rules). */
  skillPrompt: string;
  /** The typed output contract; the provider's result is parsed by it. */
  outputSchema: z.ZodType<T>;
  /** The node's typed input (already Zod-validated by the caller). */
  input: unknown;
}

export interface LlmProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  generate<T>(request: GenerateRequest<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Config (B6: the model is chosen by config)
// ---------------------------------------------------------------------------

export const ProviderConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("mock"), model: z.string().min(1) }),
  z.object({ provider: z.literal("gemini"), model: z.string().min(1), apiKey: z.string().min(1) }),
]);
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ProviderEnv {
  VC_LLM_PROVIDER?: string;
  VC_LLM_MODEL?: string;
  GEMINI_API_KEY?: string;
  [key: string]: string | undefined;
}

/**
 * Reads the provider config from an env-like object (call with `process.env`; this function never
 * reads `process.env` itself). `VC_LLM_PROVIDER` is required: there is deliberately no default, so
 * a deployment can never silently run on canned mock output. Gemini needs `VC_LLM_MODEL` and
 * `GEMINI_API_KEY` (B11: keys only from the environment). Error messages name keys, never values.
 */
export function loadProviderConfig(env: ProviderEnv): ProviderConfig {
  const provider = env.VC_LLM_PROVIDER;
  if (provider === "mock") {
    return { provider: "mock", model: env.VC_LLM_MODEL || "mock" };
  }
  if (provider === "gemini") {
    if (!env.VC_LLM_MODEL) throw new Error("loadProviderConfig: VC_LLM_MODEL is required for the gemini provider");
    if (!env.GEMINI_API_KEY) throw new Error("loadProviderConfig: GEMINI_API_KEY is required for the gemini provider");
    return { provider: "gemini", model: env.VC_LLM_MODEL, apiKey: env.GEMINI_API_KEY };
  }
  throw new Error(
    `loadProviderConfig: VC_LLM_PROVIDER must be "mock" or "gemini" (got ${provider === undefined ? "nothing" : JSON.stringify(provider)})`,
  );
}

// ---------------------------------------------------------------------------
// MockProvider
// ---------------------------------------------------------------------------

/** A canned response: a fixed value (deep-copied per call) or a function of the input. */
export type MockResponse = unknown | ((input: unknown) => unknown);

export interface MockProviderCall {
  skillName: string;
  skillPrompt: string;
  model: string;
  input: unknown;
}

export interface MockProviderOptions {
  model?: string;
  responses: Record<string, MockResponse>;
}

export class MockProvider implements LlmProvider {
  readonly kind = "mock" as const;
  readonly model: string;
  /** Every call, in order. Tests assert on this (e.g. zero calls on a crisis transcript). */
  readonly calls: MockProviderCall[] = [];
  private readonly responses: Map<string, MockResponse>;

  constructor(options: MockProviderOptions) {
    this.model = options.model ?? "mock";
    this.responses = new Map(Object.entries(options.responses));
  }

  /** Replaces the canned response for one skill (e.g. a second session in the same test). */
  setResponse(skillName: string, response: MockResponse): void {
    this.responses.set(skillName, response);
  }

  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    this.calls.push({
      skillName: request.skillName,
      skillPrompt: request.skillPrompt,
      model: this.model,
      input: structuredClone(request.input),
    });
    if (!this.responses.has(request.skillName)) {
      throw new Error(`MockProvider: no canned response for skill "${request.skillName}"`);
    }
    const response = this.responses.get(request.skillName);
    const raw = typeof response === "function" ? (response as (input: unknown) => unknown)(request.input) : structuredClone(response);
    return request.outputSchema.parse(raw);
  }
}

// ---------------------------------------------------------------------------
// GeminiProvider (stub)
// ---------------------------------------------------------------------------

export class ProviderNotWiredError extends Error {
  constructor(kind: ProviderKind, model: string) {
    super(
      `ProviderNotWiredError: the ${kind} provider (model "${model}") is a stub in T-007 and makes no network ` +
        "call. Wiring the real client is a later unit; live runs need synthetic fixtures or the recorded " +
        "per-use gate (contract B13).",
    );
    this.name = "ProviderNotWiredError";
  }
}

export class GeminiProvider implements LlmProvider {
  readonly kind = "gemini" as const;
  readonly model: string;
  // A private class field (#), so the key never shows up in JSON.stringify, String() or
  // util.inspect output (B11: no key value in logs or traces).
  readonly #apiKey: string;

  constructor(options: { model: string; apiKey: string }) {
    this.model = options.model;
    this.#apiKey = options.apiKey;
  }

  /** True when a key is present; the value itself is never exposed. */
  hasApiKey(): boolean {
    return this.#apiKey.length > 0;
  }

  async generate<T>(_request: GenerateRequest<T>): Promise<T> {
    throw new ProviderNotWiredError(this.kind, this.model);
  }

  toString(): string {
    return `GeminiProvider(model=${this.model})`;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateProviderDeps {
  /** Canned responses when `config.provider === "mock"`. */
  mockResponses?: Record<string, MockResponse>;
}

/** Picks the implementation from config (B6). */
export function createProvider(config: ProviderConfig, deps: CreateProviderDeps = {}): LlmProvider {
  const parsed = ProviderConfigSchema.parse(config);
  switch (parsed.provider) {
    case "mock":
      return new MockProvider({ model: parsed.model, responses: deps.mockResponses ?? {} });
    case "gemini":
      return new GeminiProvider({ model: parsed.model, apiKey: parsed.apiKey });
  }
}

export function providersStatus(): string {
  return "@vc/providers: provider seam (mock + gemini stub), model chosen by config (B6)";
}
