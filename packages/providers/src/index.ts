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
 *   - `GeminiProvider`: T-057, a real text provider (REST generateContent in JSON mode, key in a header,
 *     12 s default timeout, typed key-free errors). It was a stub that threw `ProviderNotWiredError`; live runs
 *     still need synthetic fixtures or the recorded gate (B13, qa/gates/real-transcripts-gemini.md).
 *   - `LiteLlmProvider` (T-019): a SECOND real provider, so Gemini going away does not take the
 *     whole engine down ("Gemini dependence is not AI dependence" — the lead's 2026-09-25 review,
 *     qa/feedback-inbox.md). An OpenAI-compatible chat-completions client against a configurable
 *     gateway base URL (D:/ai_os/litellm-config.yaml's class names — fast-cheap / balanced /
 *     smart-coding — are valid VC_LLM_MODEL values when VC_LLM_BASE_URL points at that gateway).
 *   - `RulesProvider` (T-019): a deterministic, NO-MODEL provider. Lets P1 (scribe -> facts ->
 *     profile diff -> approve) complete end to end with zero AI calls, so the counsellor's core
 *     flow never depends on any model vendor being up. See the doc comment above its class for the
 *     input contract.
 *   - `FailoverProvider` (T-021, D-020, contract B6 "runtime failover"): wraps a config-ordered
 *     chain of `LiteLlmProvider`s (e.g. VC_LLM_MODELS="fast-cheap,balanced,smart-coding") and
 *     retries across it, within a total attempt budget, on retryable failures only (timeout, 429,
 *     5xx, unparseable JSON) — never on auth/config errors, and NEVER auto-dropping to `rules`
 *     (that would silently trade "AI unavailable" for wrong facts nobody asked to see). When the
 *     whole budget is spent it raises an engineering alert (@vc/observability) and throws the
 *     typed `AiUnavailableError`. `createProvider` builds one automatically when the litellm config
 *     carries `models` (from VC_LLM_MODELS); a plain single-model config is unchanged (backward
 *     compatible — still a bare `LiteLlmProvider`, one attempt, no retry). T-021 fix cycle 1
 *     (ISS-t-021-rev-1): a wall-clock `deadlineMs` (default 45s, VC_LLM_DEADLINE_MS) bounds the
 *     whole call independent of the attempt counter, and chain members default to a shorter 8s
 *     per-attempt timeout (VC_LLM_ATTEMPT_TIMEOUT_MS) instead of the standalone provider's 30s —
 *     together these replace the old, unbounded ~5.4 minute worst case with a real ceiling. T-037
 *     (ISS-066): that deadline used to only reject `FailoverProvider`'s own promise — the losing
 *     chain member's real LiteLLM HTTP request kept running (and billing) unseen. `GenerateRequest`
 *     now carries an optional `signal`; `raceDeadline` binds one per attempt and aborts it the
 *     instant the deadline timer wins, and `LiteLlmProvider.generate()` wires that signal into the
 *     same `AbortController` as its own per-attempt timeout, so the underlying fetch is actually
 *     cancelled, not merely ignored.
 */
import { z } from "zod";
import { recordErrorSpan } from "@vc/observability";

export type ProviderKind = "mock" | "gemini" | "litellm" | "rules" | "ollama";

export interface GenerateRequest<T> {
  /** The skill folder name, e.g. "fact-extraction". */
  skillName: string;
  /** The SKILL.md body (prompt + soft rules). */
  skillPrompt: string;
  /** The typed output contract; the provider's result is parsed by it. */
  outputSchema: z.ZodType<T>;
  /** The node's typed input (already Zod-validated by the caller). */
  input: unknown;
  /**
   * T-037 (ISS-066): optional. When set and it later fires, an in-flight `generate()` call MUST stop
   * doing work it can stop (a real HTTP provider aborts its request) rather than run to completion
   * unobserved. Optional so every existing caller (packages/engine's two `provider.generate()` call
   * sites) keeps compiling unchanged — neither passes one today. `FailoverProvider` is the first
   * producer: it binds one per attempt so a losing/timed-out chain member's request is actually
   * cancelled instead of abandoned (the bug this unit fixes). `MockProvider`/`RulesProvider`/
   * have nothing in-flight to cancel (synchronous/deterministic), so they accept and ignore it;
   * `LiteLlmProvider`, `OllamaProvider` and (T-057) `GeminiProvider` have a real network request to abort.
   */
  signal?: AbortSignal;
  /** Private per-disclosure authorization, bounded by this attempt's existing cancellation. */
  preflight?: () => Promise<void>;
}

export class ProviderAuthorizationRefusedError extends Error {
  constructor() {
    super("Provider execution was refused because authorization could not be verified.");
    this.name = "ProviderAuthorizationRefusedError";
  }
}

async function authorizeExecution(request: Pick<GenerateRequest<unknown>, "preflight" | "signal">): Promise<void> {
  const signal = request.signal;
  const cancelled = () => new DOMException("Provider execution cancelled.", "AbortError");
  if (signal?.aborted) throw cancelled();
  let onAbort: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    onAbort = () => reject(cancelled());
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const check = Promise.resolve().then(() => request.preflight?.()).catch(() => {
      throw new ProviderAuthorizationRefusedError();
    });
    await (signal ? Promise.race([check, abort]) : check);
    if (signal?.aborted) throw cancelled();
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
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
  z.object({
    provider: z.literal("litellm"),
    model: z.string().min(1),
    baseUrl: z.string().min(1),
    apiKey: z.string().min(1).optional(),
    /**
     * T-021: the full failover chain, config order, when set (from VC_LLM_MODELS). Absent by
     * default so an existing plain single-model config object is byte-for-byte unchanged
     * (backward compatibility, D-020) — createProvider only builds a FailoverProvider when this is
     * present.
     */
    models: z.array(z.string().min(1)).min(1).optional(),
    /** T-021: total retry budget across the whole chain (VC_LLM_RETRY_BUDGET; default ~10, D-020). */
    maxAttempts: z.number().int().positive().optional(),
    /**
     * T-021 fix cycle 1 (ISS-t-021-rev-1): wall-clock deadline for the WHOLE chain, independent of
     * the attempt counter (VC_LLM_DEADLINE_MS; default FAILOVER_DEFAULT_DEADLINE_MS = 45000).
     */
    deadlineMs: z.number().int().positive().optional(),
    /**
     * T-021 fix cycle 1 (ISS-t-021-rev-1): a shorter default per-attempt timeout for chain members,
     * so 10 attempts at the old 30s-per-attempt default could never reach a 45s deadline in fewer
     * than the whole budget (VC_LLM_ATTEMPT_TIMEOUT_MS; default LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS).
     */
    attemptTimeoutMs: z.number().int().positive().optional(),
  }),
  z.object({ provider: z.literal("rules"), model: z.string().min(1) }),
  z.object({
    provider: z.literal("ollama"),
    /** The first hop's model id (uniform with the other variants); the full ordered chain is `chain`. */
    model: z.string().min(1),
    apiKey: z.string().min(1),
    baseUrl: z.string().min(1).optional(),
    /** P1 LK1 (D-105): the text chain, config order (from VC_TEXT_CHAIN), each hop priced at load time. */
    chain: z.array(z.object({
      model: z.string().min(1),
      inputUsdPerMTok: z.number().positive(),
      outputUsdPerMTok: z.number().positive(),
    })).min(1),
    maxOutputTokens: z.number().int().positive().optional(),
    /** Per-hop total timeout (VC_TEXT_CHAIN_HOP_TIMEOUT_MS; default TEXT_CHAIN_DEFAULT_HOP_TIMEOUT_MS). */
    hopTimeoutMs: z.number().int().positive().optional(),
    /** Product wall-clock deadline for the whole chain (VC_TEXT_CHAIN_DEADLINE_MS; default TEXT_CHAIN_DEFAULT_DEADLINE_MS). */
    deadlineMs: z.number().int().positive().optional(),
  }),
]);
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ProviderEnv {
  VC_LLM_PROVIDER?: string;
  VC_LLM_MODEL?: string;
  GEMINI_API_KEY?: string;
  /** T-019: the OpenAI-compatible gateway base URL for the litellm provider. */
  VC_LLM_BASE_URL?: string;
  /** T-019: optional — some gateways (e.g. a locally-run LiteLLM proxy) need no key. */
  VC_LLM_API_KEY?: string;
  /**
   * T-021 (D-020): the failover chain, config order, comma-separated (e.g.
   * "fast-cheap,balanced,smart-coding"). Optional — absent keeps the old single-model litellm
   * config shape exactly as it was (backward compatibility).
   */
  VC_LLM_MODELS?: string;
  /** T-021: total retry budget across the whole chain. Optional; FailoverProvider defaults it. */
  VC_LLM_RETRY_BUDGET?: string;
  /**
   * T-021 fix cycle 1 (ISS-t-021-rev-1): wall-clock deadline in ms for the whole chain, independent
   * of the attempt counter. Optional; FailoverProvider defaults it (FAILOVER_DEFAULT_DEADLINE_MS).
   */
  VC_LLM_DEADLINE_MS?: string;
  /**
   * T-021 fix cycle 1 (ISS-t-021-rev-1): per-attempt timeout in ms for chain members, shorter than
   * the standalone LiteLlmProvider default so the deadline is reachable within the retry budget.
   * Optional; defaults to LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS.
   */
  VC_LLM_ATTEMPT_TIMEOUT_MS?: string;
  /**
   * P1 LK1 (D-105): the Ollama text chain, config order, comma-separated `ollama:<model-id>` entries
   * (e.g. "ollama:glm-5.3-flash,ollama:deepseek-v4.1-flash"). Read ONLY by `loadTextChainConfig`; it is
   * opt-in per caller and deliberately not a `VC_LLM_PROVIDER` value (see that function).
   */
  VC_TEXT_CHAIN?: string;
  /** P1 LK1: per-hop total timeout in ms for the text chain. */
  VC_TEXT_CHAIN_HOP_TIMEOUT_MS?: string;
  /** P1 LK1: product wall-clock deadline in ms for the whole text chain. */
  VC_TEXT_CHAIN_DEADLINE_MS?: string;
  [key: string]: string | undefined;
}

/**
 * Reads the provider config from an env-like object (call with `process.env`; this function never
 * reads `process.env` itself). `VC_LLM_PROVIDER` is required: there is deliberately no default, so
 * a deployment can never silently run on canned mock output. Gemini needs `VC_LLM_MODEL` and
 * `GEMINI_API_KEY` (B11: keys only from the environment). litellm needs `VC_LLM_MODEL` and
 * `VC_LLM_BASE_URL`; `VC_LLM_API_KEY` is optional. rules needs nothing else (T-019: no model, so
 * there is nothing to configure beyond picking it). Error messages name keys, never values.
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
  if (provider === "litellm") {
    if (!env.VC_LLM_MODEL) throw new Error("loadProviderConfig: VC_LLM_MODEL is required for the litellm provider");
    if (!env.VC_LLM_BASE_URL) throw new Error("loadProviderConfig: VC_LLM_BASE_URL is required for the litellm provider");
    // T-021 / D-020: VC_LLM_MODELS is optional. Absent -> the object below has exactly the same
    // shape it always had (no `models`, no `maxAttempts`) — backward compatible, byte for byte.
    const modelsRaw = env.VC_LLM_MODELS?.split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (env.VC_LLM_MODELS !== undefined && (modelsRaw === undefined || modelsRaw.length === 0)) {
      throw new Error("loadProviderConfig: VC_LLM_MODELS was set but contained no model names");
    }
    let maxAttempts: number | undefined;
    if (env.VC_LLM_RETRY_BUDGET !== undefined) {
      const n = Number(env.VC_LLM_RETRY_BUDGET);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`loadProviderConfig: VC_LLM_RETRY_BUDGET must be a positive integer (got ${JSON.stringify(env.VC_LLM_RETRY_BUDGET)})`);
      }
      maxAttempts = n;
    }
    // T-021 fix cycle 1 (ISS-t-021-rev-1): the wall-clock deadline and the per-attempt timeout for
    // chain members. Both optional, same "absent -> byte-for-byte unchanged" backward-compatibility
    // rule as maxAttempts above.
    let deadlineMs: number | undefined;
    if (env.VC_LLM_DEADLINE_MS !== undefined) {
      const n = Number(env.VC_LLM_DEADLINE_MS);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`loadProviderConfig: VC_LLM_DEADLINE_MS must be a positive integer (got ${JSON.stringify(env.VC_LLM_DEADLINE_MS)})`);
      }
      deadlineMs = n;
    }
    let attemptTimeoutMs: number | undefined;
    if (env.VC_LLM_ATTEMPT_TIMEOUT_MS !== undefined) {
      const n = Number(env.VC_LLM_ATTEMPT_TIMEOUT_MS);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`loadProviderConfig: VC_LLM_ATTEMPT_TIMEOUT_MS must be a positive integer (got ${JSON.stringify(env.VC_LLM_ATTEMPT_TIMEOUT_MS)})`);
      }
      attemptTimeoutMs = n;
    }
    return {
      provider: "litellm",
      model: env.VC_LLM_MODEL,
      baseUrl: env.VC_LLM_BASE_URL,
      ...(env.VC_LLM_API_KEY ? { apiKey: env.VC_LLM_API_KEY } : {}),
      ...(modelsRaw && modelsRaw.length > 0 ? { models: modelsRaw } : {}),
      ...(maxAttempts !== undefined ? { maxAttempts } : {}),
      ...(deadlineMs !== undefined ? { deadlineMs } : {}),
      ...(attemptTimeoutMs !== undefined ? { attemptTimeoutMs } : {}),
    };
  }
  if (provider === "rules") {
    return { provider: "rules", model: env.VC_LLM_MODEL || "rules" };
  }
  throw new Error(
    `loadProviderConfig: VC_LLM_PROVIDER must be "mock", "gemini", "litellm" or "rules" (got ${provider === undefined ? "nothing" : JSON.stringify(provider)})`,
  );
}

/** tool-first T3 (spec (f)): the roles that may run on their own model. Each key is optional and falls back as `resolveRoleModel` says. */
export type ModelRole = "summary" | "answer" | "router";
export const ROLE_MODEL_ENV: Readonly<Record<ModelRole, string>> = {
  summary: "VC_MODEL_SUMMARY",
  answer: "VC_MODEL_ANSWER",
  router: "VC_MODEL_ROUTER",
};
/** The gemini summary default: probed live as a fast model that takes `thinkingLevel: "minimal"` (see geminiThinkingConfig). Never an unprobed id. */
export const SUMMARY_DEFAULT_MODEL = "gemini-3.5-flash-lite";
// A model id: starts alphanumeric, then letters, digits and . _ : / -, at most 128 characters. Anchored on a single character class, so there is no backtracking.
const ROLE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/**
 * The provider config for one role (summary, answer, router): `loadProviderConfig` with the model swapped for the role's
 * `VC_MODEL_<ROLE>` when set. Unset (or empty) falls back to `VC_LLM_MODEL`; the one exception is `summary` under the gemini provider,
 * which defaults to `SUMMARY_DEFAULT_MODEL`. A value that is not a plain model id is a config error naming the key, never the value.
 * An overridden litellm role drops the `VC_LLM_MODELS` failover chain (the chain belongs to the answer model). `loadProviderConfig`
 * itself is unchanged; building a provider from the result goes through `createProvider`, so a gemini role model is routed through
 * `geminiThinkingConfig` like every other Gemini call.
 */
export function loadRoleProviderConfig(env: ProviderEnv, role: ModelRole): ProviderConfig {
  const key = ROLE_MODEL_ENV[role];
  const raw = env[key];
  const trimmed = raw?.trim() ?? "";
  if (raw !== undefined && trimmed === "" && raw !== "") {
    throw new Error(`loadRoleProviderConfig: ${key} must be a model id (it was only whitespace)`);
  }
  if (trimmed !== "") {
    if (!ROLE_MODEL_ID.test(trimmed) || trimmed.includes("//")) throw new Error(`loadRoleProviderConfig: ${key} must be a plain model id (letters, digits and . _ : / -, at most 128 characters)`);
    return loadProviderConfig({ ...env, VC_LLM_MODEL: trimmed, VC_LLM_MODELS: undefined });
  }
  if (role === "summary" && env.VC_LLM_PROVIDER === "gemini") {
    return loadProviderConfig({ ...env, VC_LLM_MODEL: SUMMARY_DEFAULT_MODEL, VC_LLM_MODELS: undefined });
  }
  return loadProviderConfig(env);
}

/** The model id a role runs on (see `loadRoleProviderConfig`). */
export function resolveRoleModel(env: ProviderEnv, role: ModelRole): string {
  return loadRoleProviderConfig(env, role).model;
}

/**
 * S13 fix-b: which model calls belong to which role. `summary` is the scribe's session summary, `answer` the student's answer, guidance and coaching, `router` the
 * language detection, query rewrite and follow-up resolver. A skill not listed here always runs on the base provider.
 */
export const ROLE_SKILLS: Readonly<Record<ModelRole, readonly string[]>> = {
  summary: ["session-summary"],
  answer: ["kb-answer", "kb-general-guidance", "vc-capabilities"],
  router: ["lang-detect", "kb-query-rewrite", "student-public-followup"],
};

/** S13 fix-b: a provider that sends each role's skills to that role's own provider and everything else to the base. */
export class RoleRoutedProvider implements LlmProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  readonly #base: LlmProvider;
  readonly #bySkill: ReadonlyMap<string, LlmProvider>;

  constructor(base: LlmProvider, bySkill: ReadonlyMap<string, LlmProvider>) {
    this.#base = base;
    this.#bySkill = bySkill;
    this.kind = base.kind;
    this.model = base.model;
  }

  /** The provider a skill runs on (the base when its role has no model of its own). */
  providerFor(skillName: string): LlmProvider {
    return this.#bySkill.get(skillName) ?? this.#base;
  }

  generate<T>(request: GenerateRequest<T>): Promise<T> {
    return this.providerFor(request.skillName).generate(request);
  }

  toString(): string {
    return `RoleRoutedProvider(base=${this.#base.model}, roles=${new Set(this.#bySkill.values()).size})`;
  }
}

/**
 * S13 fix-b: puts `VC_MODEL_<ROLE>` to work. For each listed role whose key is SET (non-blank), a provider is built from `loadRoleProviderConfig` (so a bad id is a
 * startup error naming the key) and its skills (`ROLE_SKILLS`) run on it. When none of the listed roles' keys is set this returns `base` itself: behaviour is unchanged,
 * and a model id is never invented (the summary-under-gemini default is NOT applied here, only an explicit key switches a model).
 */
export function withRoleModels(env: ProviderEnv, base: LlmProvider, roles: readonly ModelRole[], deps: CreateProviderDeps = {}): LlmProvider {
  const bySkill = new Map<string, LlmProvider>();
  for (const role of roles) {
    const raw = env[ROLE_MODEL_ENV[role]];
    if (raw === undefined || raw === "") continue;
    const provider = createProvider(loadRoleProviderConfig(env, role), deps);
    for (const skill of ROLE_SKILLS[role]) bySkill.set(skill, provider);
  }
  return bySkill.size === 0 ? base : new RoleRoutedProvider(base, bySkill);
}

/** P1 LK1 (D-105): the chain's product bound, so a student never waits through a second lap (design: 12 s). */
export const TEXT_CHAIN_DEFAULT_DEADLINE_MS = 12_000;
/** P1 LK1 (D-105): the documented default chain, selected with `VC_TEXT_CHAIN=default`. Order is Umesh's (GLM first); the LK9 streamed first-token probe reports whether to flip it. The Gemini Lite slot is reserved (LK3, held) and is not in it. */
export const TEXT_CHAIN_DEFAULT_SPEC = "ollama:glm-5.3-flash,ollama:deepseek-v4.1-flash";
/** P1 LK1: a hop that has not answered in this long is a retryable timeout and the chain moves on. */
export const TEXT_CHAIN_DEFAULT_HOP_TIMEOUT_MS = 8_000;

function positiveIntEnv(env: ProviderEnv, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const n = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`loadTextChainConfig: ${key} must be a positive integer (got ${JSON.stringify(raw)})`);
  }
  return n;
}

/**
 * P1 LK1 (D-105): reads the Ollama text chain from `VC_TEXT_CHAIN` (comma-separated `ollama:<model-id>`
 * entries, in failover order). Returns `undefined` when it is unset or blank, so a caller opts in with
 * `loadTextChainConfig(env) ?? loadProviderConfig(env)`. Every hop is priced here (table or
 * OLLAMA_PRICE_USD_PER_MTOK; an unknown price is refused, never zero), so a bad chain fails at startup.
 * `gemini:` entries are RESERVED (the Gemini Lite text adapter is LK3, held) and refused, not ignored.
 *
 * Deliberately NOT reachable through `loadProviderConfig` / `VC_LLM_PROVIDER`: that config is also the base
 * the concern classifier and the scribe derive their provider from, and D-105 Q4 keeps a call on its current
 * model until its own eval passes on the chain. Reads only the env object it is given; messages name keys,
 * never values.
 */
export function loadTextChainConfig(env: ProviderEnv): Extract<ProviderConfig, { provider: "ollama" }> | undefined {
  const raw = env.VC_TEXT_CHAIN;
  if (raw === undefined || raw.trim() === "") return undefined;
  const spec = raw.trim().toLowerCase() === "default" ? TEXT_CHAIN_DEFAULT_SPEC : raw;
  const entries = spec.split(",").map((e) => e.trim()).filter((e) => e.length > 0);
  if (entries.length === 0) throw new Error("loadTextChainConfig: VC_TEXT_CHAIN was set but contained no entries");
  const models = entries.map((entry) => {
    if (/^gemini:/i.test(entry)) {
      throw new Error("loadTextChainConfig: VC_TEXT_CHAIN gemini entries are reserved (the Gemini text adapter is not built yet, LK3); use ollama:<model-id>");
    }
    const m = /^ollama:(.+)$/.exec(entry);
    const id = m?.[1]?.trim();
    if (!id) throw new Error('loadTextChainConfig: every VC_TEXT_CHAIN entry must be "ollama:<model-id>"');
    return id;
  });
  const apiKey = env.OLLAMA_API_KEY?.trim();
  if (!apiKey) throw new OllamaRefusedError("OLLAMA_API_KEY is required when VC_TEXT_CHAIN is set");
  const chain = models.map((model) => ({ model, ...resolveOllamaPrice(model, env) }));
  const maxOutputTokens = env[OLLAMA_MAX_OUTPUT_TOKENS_ENV] === undefined ? undefined : resolveOllamaMaxOutputTokens(env);
  return {
    provider: "ollama",
    model: models[0]!,
    apiKey,
    ...(env.OLLAMA_BASE_URL ? { baseUrl: env.OLLAMA_BASE_URL } : {}),
    chain,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    hopTimeoutMs: positiveIntEnv(env, "VC_TEXT_CHAIN_HOP_TIMEOUT_MS") ?? TEXT_CHAIN_DEFAULT_HOP_TIMEOUT_MS,
    deadlineMs: positiveIntEnv(env, "VC_TEXT_CHAIN_DEADLINE_MS") ?? TEXT_CHAIN_DEFAULT_DEADLINE_MS,
  };
}

// ---------------------------------------------------------------------------
// ModelOutputSchemaError (T-032, ISS-t-021-rev-3)
// ---------------------------------------------------------------------------

/**
 * Raised ONLY where a provider validates the MODEL's raw output against the caller's `outputSchema`
 * (the three `parseModelOutput` call sites below — MockProvider, LiteLlmProvider, RulesProvider) —
 * never for any other internal Zod use a chain member's own code might have. Extends `z.ZodError`
 * itself (not a plain wrapper) so `packages/engine/src/scribe/nodes.ts`'s `isSchemaError`
 * (`err instanceof ZodError || err.name === "ZodError"`) keeps matching it for the un-chained,
 * single-provider retry path — out of this unit's scope, never touched here, and unaffected because
 * `instanceof ZodError` still holds for a subclass.
 *
 * `isRetryableProviderError` below narrows on `instanceof ModelOutputSchemaError` specifically (not
 * the base `z.ZodError`), so an unrelated internal `ZodError` bug inside a chain member — anything
 * NOT raised at this exact output-validation boundary — is never mistaken for a retryable "wrong-shape
 * model answer" and instead propagates unchanged, exactly like any other unrecognised failure
 * (D-020's fail-closed whitelist).
 */
export class ModelOutputSchemaError extends z.ZodError {
  constructor(issues: z.ZodIssue[]) {
    super([{ code: "custom", path: [], message: "Provider output did not match the required schema." }]);
    this.name = "ModelOutputSchemaError";
  }
}

/**
 * Validates a provider's raw model output against the caller's schema (B5), tagging a mismatch as
 * `ModelOutputSchemaError` so `isRetryableProviderError` can scope failover eligibility to exactly
 * this boundary (T-032, ISS-t-021-rev-3) instead of any `z.ZodError` from anywhere in a provider.
 */
function parseModelOutput<T>(outputSchema: z.ZodType<T>, raw: unknown): T {
  const result = outputSchema.safeParse(raw);
  if (result.success) return result.data;
  throw new ModelOutputSchemaError(result.error.issues);
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
    await authorizeExecution(request);
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
    return parseModelOutput(request.outputSchema, raw);
  }
}

// ---------------------------------------------------------------------------
// GeminiProvider (T-057: a real text provider; it was a stub that threw ProviderNotWiredError)
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

/** T-057: per-call timeout of a Gemini text call. Well under the 30 s demo budget (C5): the caller's own bounds (the safety screen's 8 s race) sit inside it. */
export const GEMINI_DEFAULT_TIMEOUT_MS = 12_000;
const GEMINI_TEXT_MAX_OUTPUT_TOKENS = 4096;
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * The thinking config a Gemini model accepts, so a flash model can skip hidden reasoning (short, fast, not cut off by the output limit).
 * Proven live (2026-10-29): the 2.5 family, gemini-3.1-flash-lite and gemini-3.5-flash take `thinkingBudget: 0`; gemini-3.5-flash-lite rejects it
 * (HTTP 400) and takes `thinkingLevel: "minimal"`. A model not proven here gets NO thinkingConfig, because a wrong one is a 400 on every call.
 */
export function geminiThinkingConfig(model: string): { thinkingBudget: 0 } | { thinkingLevel: "minimal" } | undefined {
  if (/^gemini-3\.5-flash-lite(?![\w.])/i.test(model)) return { thinkingLevel: "minimal" };
  // `(?!-lite)`: an id like "gemini-3.5-flash-lite2" must not fall back to the plain 3.5-flash match (a flash-lite id gets the flash-lite config or none; budget 0 is a 400 on 3.5-flash-lite).
  if (/^gemini-(2\.5-flash(?:-lite)?|3\.1-flash-lite|3\.5-flash)(?![\w.])(?!-lite)/i.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

export class GeminiHttpError extends Error {
  readonly status: number;
  constructor(status: number, model: string) {
    super(`GeminiHttpError: the gemini provider (model "${model}") request failed with HTTP ${status}`);
    this.name = "GeminiHttpError";
    this.status = status;
  }
}

export class GeminiTimeoutError extends Error {
  constructor(model: string, timeoutMs: number) {
    super(`GeminiTimeoutError: the gemini provider (model "${model}") did not respond within ${timeoutMs}ms`);
    this.name = "GeminiTimeoutError";
  }
}

/** The CALLER's `request.signal` fired (never this provider's own timer, that is `GeminiTimeoutError`). */
export class GeminiAbortedError extends Error {
  constructor(model: string) {
    super(`GeminiAbortedError: the gemini provider (model "${model}") request was aborted by the caller's signal`);
    this.name = "GeminiAbortedError";
  }
}

export class GeminiMalformedResponseError extends Error {
  constructor(model: string, reason: string) {
    super(`GeminiMalformedResponseError: the gemini provider (model "${model}") returned an unusable response: ${reason}`);
    this.name = "GeminiMalformedResponseError";
  }
}

export class GeminiNetworkError extends Error {
  constructor(model: string, reason: string) {
    super(`GeminiNetworkError: the gemini provider (model "${model}") request could not be sent: ${reason}`);
    this.name = "GeminiNetworkError";
  }
}

export interface GeminiProviderOptions {
  model: string;
  apiKey: string;
  /** Overridable for tests; production leaves this at GEMINI_DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  baseUrl?: string;
  /** Tests inject a fake; the default resolves the global `fetch` at call time. */
  fetchImpl?: typeof fetch;
  /** S13 fix-b: called once per 2xx JSON response with the reported `usageMetadata` token counts (the same hook and shape the Ollama chain uses). A throw is swallowed. */
  onUsage?: (usage: OllamaActualUsage) => void;
  /** S13 fix-b: optional USD per million tokens; with it a reported usage carries `usd`, without it only tokens (a price is never invented). */
  price?: OllamaPrice;
}

/** S13 fix-b: the env name of the optional Gemini price, "<input>,<output>" USD per million tokens. */
export const GEMINI_PRICE_ENV = "GEMINI_PRICE_USD_PER_MTOK";

/**
 * S13 fix-b: the optional Gemini price from `GEMINI_PRICE_USD_PER_MTOK="<input>,<output>"`. Unset or blank is undefined (tokens are still metered, no dollar
 * figure). A set value that is not two finite numbers, both >= OLLAMA_MIN_PRICE_USD_PER_MTOK, is a startup error naming the key, never the value.
 */
export function loadGeminiPrice(env: ProviderEnv): OllamaPrice | undefined {
  const raw = env[GEMINI_PRICE_ENV];
  if (raw === undefined || raw.trim() === "") return undefined;
  const parts = raw.split(",").map((p) => p.trim());
  const [i, o] = parts.map((p) => (/^\d+(?:\.\d+)?$/.test(p) ? Number(p) : Number.NaN));
  if (parts.length !== 2 || !Number.isFinite(i) || !Number.isFinite(o) || i! < OLLAMA_MIN_PRICE_USD_PER_MTOK || o! < OLLAMA_MIN_PRICE_USD_PER_MTOK) {
    throw new Error(`${GEMINI_PRICE_ENV} must be "<input>,<output>" USD per million tokens, both finite and >= ${OLLAMA_MIN_PRICE_USD_PER_MTOK}`);
  }
  return { inputUsdPerMTok: i!, outputUsdPerMTok: o! };
}

/**
 * S13 fix-b: turns a generateContent body's `usageMetadata` into the Ollama-shaped usage report and calls the hook. Output tokens are the candidate tokens
 * plus any thinking tokens (both are billed as output). "reported" only when the prompt and candidate counts are non-negative safe integers; anything else is
 * "unreported" and carries no figure. A throwing hook is swallowed: the tokens are already spent and the reply must not be lost.
 */
function reportGeminiUsage(
  hook: ((usage: OllamaActualUsage) => void) | undefined,
  info: { model: string; estimatedInputTokens: number; maxOutputTokens: number; price: OllamaPrice | undefined },
  body: unknown,
): void {
  if (!hook) return;
  const estimate: OllamaRequestEstimate = {
    model: info.model,
    estimatedInputTokens: info.estimatedInputTokens,
    maxOutputTokens: info.maxOutputTokens,
    estimatedCostUsd: info.price ? (info.estimatedInputTokens * info.price.inputUsdPerMTok + info.maxOutputTokens * info.price.outputUsdPerMTok) / 1e6 : 0,
  };
  const meta = (body as { usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown } } | null)?.usageMetadata;
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  let usage: OllamaActualUsage = { model: info.model, estimate, actual: "unreported" };
  if (valid(meta?.promptTokenCount) && valid(meta?.candidatesTokenCount) && (meta?.thoughtsTokenCount === undefined || valid(meta.thoughtsTokenCount))) {
    const inputTokens = meta.promptTokenCount;
    const outputTokens = meta.candidatesTokenCount + (meta.thoughtsTokenCount ?? 0);
    usage = {
      model: info.model,
      estimate,
      actual: "reported",
      inputTokens,
      outputTokens,
      ...(info.price ? { usd: (inputTokens * info.price.inputUsdPerMTok + outputTokens * info.price.outputUsdPerMTok) / 1e6 } : {}),
    };
  }
  try {
    hook(usage);
  } catch {
    // accounting must never fail or discard a paid reply
  }
}

export class GeminiProvider implements LlmProvider {
  readonly kind = "gemini" as const;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onUsage: ((usage: OllamaActualUsage) => void) | undefined;
  private readonly price: OllamaPrice | undefined;
  // A private class field (#), so the key never shows up in JSON.stringify, String() or
  // util.inspect output (B11: no key value in logs or traces).
  readonly #apiKey: string;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.onUsage = options.onUsage;
    this.price = options.price;
    this.#apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? GEMINI_DEFAULT_TIMEOUT_MS;
    this.baseUrl = (options.baseUrl ?? GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** True when a key is present; the value itself is never exposed. */
  hasApiKey(): boolean {
    return this.#apiKey.length > 0;
  }

  /**
   * One request, JSON mode, no retries (a schema-invalid output is re-asked by the caller, like every other provider). The skill prompt is the
   * system instruction and the typed input is the user turn. The key travels in a header, never in the URL. The caller's `signal` and this
   * provider's own `timeoutMs` abort the SAME fetch; the timer stays armed until the body is read, so a stalled body is a timeout too.
   * Every failure is a typed, key-free error; the caller's Zod schema is the only judge of the output (B5).
   */
  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    if (request.signal?.aborted) throw new GeminiAbortedError(this.model);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = request.signal;
    const onExternalAbort = (): void => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    let phase: "pre" | "sent" = "pre";
    let body: unknown;
    const userContent = JSON.stringify(request.input);
    try {
      await authorizeExecution({ ...request, signal: controller.signal });
      phase = "sent";
      const res = await this.fetchImpl(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.#apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.skillPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: GEMINI_TEXT_MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            // A proven flash model may skip thinking (fast and short); any other model is left on its own default.
            ...(geminiThinkingConfig(this.model) ? { thinkingConfig: geminiThinkingConfig(this.model) } : {}),
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new GeminiHttpError(res.status, this.model);
      try {
        body = await res.json();
      } catch (err) {
        if ((err as { name?: unknown } | null)?.name === "AbortError") throw err;
        throw new GeminiMalformedResponseError(this.model, "response body was not valid JSON");
      }
    } catch (err) {
      if (err instanceof GeminiHttpError || err instanceof GeminiMalformedResponseError) throw err;
      if ((err as { name?: unknown } | null)?.name === "AbortError") {
        if (externalSignal?.aborted) throw new GeminiAbortedError(this.model);
        throw new GeminiTimeoutError(this.model, this.timeoutMs);
      }
      if (phase === "pre") throw err; // authorization refusal: surface it unchanged
      throw new GeminiNetworkError(this.model, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
    // S13 fix-b: the tokens were spent whether or not the reply turns out usable, so they are reported first (same order as the Ollama hook).
    reportGeminiUsage(this.onUsage, { model: this.model, estimatedInputTokens: Buffer.byteLength(request.skillPrompt, "utf8") + Buffer.byteLength(userContent, "utf8"), maxOutputTokens: GEMINI_TEXT_MAX_OUTPUT_TOKENS, price: this.price }, body);
    const candidate = (body as { candidates?: Array<{ finishReason?: unknown; content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0];
    // A reply cut off by the token limit (or blocked) is never parsed as if it were whole.
    if (candidate?.finishReason !== undefined && candidate.finishReason !== "STOP") {
      throw new GeminiMalformedResponseError(this.model, `the reply did not finish normally (${typeof candidate.finishReason === "string" ? candidate.finishReason.slice(0, 40) : "unknown"})`);
    }
    const content = (candidate?.content?.parts ?? []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
    if (content.length === 0) throw new GeminiMalformedResponseError(this.model, "no candidates[0].content.parts text in the response");
    let parsed: unknown;
    try {
      parsed = parseModelJson(content);
    } catch {
      throw new GeminiMalformedResponseError(this.model, "the reply text was not valid JSON");
    }
    return parseModelOutput(request.outputSchema, parsed);
  }

  toString(): string {
    return `GeminiProvider(model=${this.model})`;
  }
}

// ---------------------------------------------------------------------------
// LiteLlmProvider (T-019) — a SECOND real provider: an OpenAI-compatible
// chat-completions client against a configurable gateway base URL, so the
// engine does not go down if Gemini does (lead's 2026-09-25 review).
// ---------------------------------------------------------------------------

/** Generous enough for a gateway hop; bounded so a hung socket can never wedge a node forever. */
export const LITELLM_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * T-021 fix cycle 1 (ISS-t-021-rev-1): the default per-attempt timeout for a LiteLlmProvider built
 * as a FailoverProvider chain member (VC_LLM_ATTEMPT_TIMEOUT_MS) — deliberately shorter than
 * LITELLM_DEFAULT_TIMEOUT_MS, since a chain retries several models within a bounded wall-clock
 * deadline (FAILOVER_DEFAULT_DEADLINE_MS): at the old 30s-per-attempt default, a single hung attempt
 * could nearly exhaust the whole deadline on its own. A standalone (non-chain) LiteLlmProvider is
 * unaffected and keeps LITELLM_DEFAULT_TIMEOUT_MS (backward compatibility).
 */
export const LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS = 8_000;

export class LiteLlmHttpError extends Error {
  readonly status: number;
  constructor(status: number, model: string) {
    super(`LiteLlmHttpError: the litellm provider (model "${model}") request failed with HTTP ${status}`);
    this.name = "LiteLlmHttpError";
    this.status = status;
  }
}

export class LiteLlmTimeoutError extends Error {
  constructor(model: string, timeoutMs: number) {
    super(`LiteLlmTimeoutError: the litellm provider (model "${model}") did not respond within ${timeoutMs}ms`);
    this.name = "LiteLlmTimeoutError";
  }
}

/**
 * T-037 (ISS-066): thrown when `generate()` stops because the CALLER's `request.signal` fired —
 * never because of this provider's own `timeoutMs` (that stays `LiteLlmTimeoutError`, unchanged).
 * Raised (a) synchronously, before any fetch, when the signal already carries `aborted === true`
 * (no socket is ever opened for a request nobody wants anymore), or (b) from the fetch's own
 * AbortError once the signal fires mid-flight. `FailoverProvider` is the one caller that sets a
 * signal today, to cancel a losing/timed-out attempt it is about to abandon; that rejection is
 * discarded by its own `Promise.race` (the deadline branch already won), so this error is not meant
 * to reach `isRetryableProviderError` and is deliberately left off its whitelist (fail closed, same
 * as any other unrecognised failure mode).
 */
export class LiteLlmAbortedError extends Error {
  constructor(model: string) {
    super(`LiteLlmAbortedError: the litellm provider (model "${model}") request was aborted by the caller's signal`);
    this.name = "LiteLlmAbortedError";
  }
}

/** The HTTP response came back but was not a usable chat-completion (bad body, no content, non-JSON content). */
export class LiteLlmMalformedResponseError extends Error {
  constructor(model: string, reason: string) {
    super(`LiteLlmMalformedResponseError: the litellm provider (model "${model}") returned an unusable response: ${reason}`);
    this.name = "LiteLlmMalformedResponseError";
  }
}

/**
 * golive-json-robust: some models on the litellm/ollama path answer HTTP 200 with JSON inside a
 * ```json fence, or with JS-style unquoted keys. Bounded tolerance, nothing more: (1) strip ONE
 * leading ``` / ```json fence and ONE trailing ```; (2) if the parse still fails, quote bare
 * identifier keys OUTSIDE string literals and parse once more. Anything else throws as before; the
 * caller's Zod schema still judges the result (B5).
 */
function parseModelJson(content: string): unknown {
  const text = content.trim().replace(/^```[A-Za-z]*[ \t]*\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // Split into string literals and the rest; the key-quoting regex only ever touches the rest.
    const repaired = text
      .split(/("(?:[^"\\]|\\.)*")/)
      .map((part, i) => (i % 2 === 1 ? part : part.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')))
      .join("");
    return JSON.parse(repaired);
  }
}

/** The request could not be sent at all (DNS, connection refused, TLS, ...). Never the abort/timeout case. */
export class LiteLlmNetworkError extends Error {
  constructor(model: string, reason: string) {
    super(`LiteLlmNetworkError: the litellm provider (model "${model}") request could not be sent: ${reason}`);
    this.name = "LiteLlmNetworkError";
  }
}

export interface LiteLlmProviderOptions {
  model: string;
  /** OpenAI-compatible base URL, e.g. "http://127.0.0.1:4000/v1" (a trailing slash is tolerated). */
  baseUrl: string;
  apiKey?: string;
  /** Overridable for tests; production leaves this at LITELLM_DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export class LiteLlmProvider implements LlmProvider {
  readonly kind = "litellm" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  // A private class field (#), so the key never shows up in JSON.stringify, String() or
  // util.inspect output (B11: no key value in logs, traces or error messages).
  readonly #apiKey: string | undefined;

  constructor(options: LiteLlmProviderOptions) {
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? LITELLM_DEFAULT_TIMEOUT_MS;
    this.#apiKey = options.apiKey;
  }

  /** True when a key is configured; the value itself is never exposed. */
  hasApiKey(): boolean {
    return typeof this.#apiKey === "string" && this.#apiKey.length > 0;
  }

  toString(): string {
    return `LiteLlmProvider(model=${this.model}, baseUrl=${this.baseUrl})`;
  }

  /**
   * One request, JSON-mode, no retries (retries that could duplicate a write belong to the caller —
   * packages/engine/src/scribe/nodes.ts generateWithRetry already re-asks on a schema-invalid output;
   * this provider makes exactly one HTTP attempt per call). A schema-invalid output's ZodError is
   * thrown as-is (never swallowed or wrapped) so that retry path recognises it, same as MockProvider.
   * Every other failure mode (timeout, non-2xx, malformed body) becomes a typed, key-free error (B11).
   *
   * T-037 (ISS-066): `request.signal`, when given, is wired into the SAME underlying
   * `AbortController` as this provider's own `timeoutMs` timer, so either one aborts the real
   * in-flight fetch — a losing/timed-out request never keeps running (and billing) after its result
   * stops mattering. Which one fired is what tells `LiteLlmAbortedError` (external signal) apart from
   * the unchanged `LiteLlmTimeoutError` (this provider's own timer): the external signal is checked
   * first, so a signal that fires in the very same tick as the internal timeout still reports as an
   * abort, not a timeout.
   */
  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    if (request.signal?.aborted) {
      // Nobody wants this result any more — never open a socket for it at all.
      throw new LiteLlmAbortedError(this.model);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = request.signal;
    const onExternalAbort = (): void => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    let res: Response;
    try {
      await authorizeExecution({ ...request, signal: controller.signal });
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.skillPrompt },
            { role: "user", content: JSON.stringify(request.input) },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof ProviderAuthorizationRefusedError) throw err;
      if ((err as { name?: unknown } | null)?.name === "AbortError") {
        if (externalSignal?.aborted) throw new LiteLlmAbortedError(this.model);
        throw new LiteLlmTimeoutError(this.model, this.timeoutMs);
      }
      throw new LiteLlmNetworkError(this.model, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (!res.ok) {
      throw new LiteLlmHttpError(res.status, this.model);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new LiteLlmMalformedResponseError(this.model, "response body was not valid JSON");
    }
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message
      ?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LiteLlmMalformedResponseError(this.model, "no choices[0].message.content string in the response");
    }
    let parsed: unknown;
    try {
      parsed = parseModelJson(content);
    } catch {
      throw new LiteLlmMalformedResponseError(this.model, "choices[0].message.content was not valid JSON");
    }
    // B5: no free text crosses the seam — the caller's Zod schema is the only judge.
    return parseModelOutput(request.outputSchema, parsed);
  }
}

// ---------------------------------------------------------------------------
// Grounded answers (p1-nosource-grounded, D-110 follow-up): Gemini with Google Search grounding. The question has no verified
// source in the knowledge base, so one model call may search the public web and answer from it. This is the only Gemini call that
// makes a real request; `GeminiProvider.generate` above stays a stub. No SDK: the REST `generateContent` endpoint over fetch, like
// the litellm provider. B13: Gemini is a listed processor; the caller sends ONLY the redacted question text (see the student graph).
// ---------------------------------------------------------------------------

export const GROUNDING_MAX_SOURCES = 5;
export const GROUNDING_DEFAULT_MODEL = "gemini-2.5-flash";
export const GROUNDING_DEFAULT_TIMEOUT_MS = 20_000;
const GROUNDING_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// Room for the answer (about 150 words) AND any thinking tokens, which count against this limit on the 2.5 models (the first live probe was cut mid-sentence at 700).
const GROUNDING_MAX_OUTPUT_TOKENS = 2048;

/** One grounding source as the student sees it: a title and an https link. */
export interface GroundedSource {
  title: string;
  url: string;
}

export interface GroundedAnswer {
  /** Plain prose from the model. The caller applies every output guard; this layer only extracts it. */
  text: string;
  sources: GroundedSource[];
}

export interface GroundedAnswerRequest {
  /** The already-redacted question. Nothing else about the student is accepted by this seam. */
  question: string;
  /** The fixed system prompt (a constant of the caller, never student text). */
  systemPrompt: string;
  signal?: AbortSignal;
  /** Same gate hook as `GenerateRequest.preflight` (spend guard, B13 per-use gate). */
  preflight?: () => Promise<void>;
}

export interface GroundedAnswerer {
  readonly kind: "gemini" | "mock";
  readonly model: string;
  answer(request: GroundedAnswerRequest): Promise<GroundedAnswer>;
}

export class GroundingHttpError extends Error {
  readonly status: number;
  constructor(status: number, model: string) {
    super(`GroundingHttpError: the grounded Gemini request (model "${model}") failed with HTTP ${status}`);
    this.name = "GroundingHttpError";
    this.status = status;
  }
}

export class GroundingFailedError extends Error {
  constructor(model: string, reason: string) {
    super(`GroundingFailedError: the grounded Gemini request (model "${model}") failed: ${reason}`);
    this.name = "GroundingFailedError";
  }
}

/**
 * Grounding links as structured entries: https only (no userinfo, no other scheme), unique by URL, a bounded title, at most
 * GROUNDING_MAX_SOURCES. Anything malformed is dropped, never repaired.
 */
export function sanitizeGroundingSources(raw: unknown): GroundedSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: GroundedSource[] = [];
  for (const item of raw) {
    if (out.length >= GROUNDING_MAX_SOURCES) break;
    const web = (item as { web?: { uri?: unknown; title?: unknown } } | null)?.web;
    if (typeof web?.uri !== "string" || web.uri.length > 2048) continue;
    let parsed: URL;
    try {
      parsed = new URL(web.uri.trim());
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hostname === "") continue;
    const url = parsed.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    // eslint-disable-next-line no-control-regex
    const cleanTitle = typeof web.title === "string" ? web.title.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    out.push({ title: cleanTitle || parsed.hostname, url });
  }
  return out;
}

export interface GeminiGroundedAnswererOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Tests inject a fake; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  /** S13 fix-b: per-call usage report from `usageMetadata` (see GeminiProviderOptions.onUsage). */
  onUsage?: (usage: OllamaActualUsage) => void;
  /** S13 fix-b: optional USD per million tokens (see GeminiProviderOptions.price). */
  price?: OllamaPrice;
}

export class GeminiGroundedAnswerer implements GroundedAnswerer {
  readonly kind = "gemini" as const;
  readonly model: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #onUsage: ((usage: OllamaActualUsage) => void) | undefined;
  readonly #price: OllamaPrice | undefined;

  constructor(options: GeminiGroundedAnswererOptions) {
    this.model = options.model;
    this.#onUsage = options.onUsage;
    this.#price = options.price;
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? GROUNDING_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeoutMs = options.timeoutMs ?? GROUNDING_DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  toString(): string {
    return `GeminiGroundedAnswerer(model=${this.model})`;
  }

  async answer(request: GroundedAnswerRequest): Promise<GroundedAnswer> {
    if (request.signal?.aborted) throw new GroundingFailedError(this.model, "cancelled");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    const onExternalAbort = (): void => controller.abort();
    request.signal?.addEventListener("abort", onExternalAbort, { once: true });
    let res: Response;
    try {
      await authorizeExecution({ preflight: request.preflight, signal: controller.signal });
      res = await this.#fetch(`${this.#baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        // The key travels in a header, never in the URL, so no log of the URL can carry it (B11).
        headers: { "content-type": "application/json", "x-goog-api-key": this.#apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.question }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: GROUNDING_MAX_OUTPUT_TOKENS,
            // A proven flash model may skip thinking, which keeps the answer short and quick; any other model is left on its own default.
            ...(geminiThinkingConfig(this.model) ? { thinkingConfig: geminiThinkingConfig(this.model) } : {}),
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onExternalAbort);
      if (err instanceof ProviderAuthorizationRefusedError) throw err;
      throw new GroundingFailedError(this.model, (err as { name?: unknown } | null)?.name === "AbortError" ? "timeout or cancelled" : "network error");
    }
    // The timer and the abort listener stay armed until the body has been read, so a stalled body is cut off too.
    let body: unknown;
    try {
      if (!res.ok) throw new GroundingHttpError(res.status, this.model);
      body = await res.json();
    } catch (err) {
      if (err instanceof GroundingHttpError) throw err;
      throw new GroundingFailedError(this.model, "response body was not valid JSON or was cut off");
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onExternalAbort);
    }
    // S13 fix-b: a grounded call is billed per prompt and per token whether or not its text is usable, so the usage is reported before any check.
    reportGeminiUsage(this.#onUsage, { model: this.model, estimatedInputTokens: Buffer.byteLength(request.systemPrompt, "utf8") + Buffer.byteLength(request.question, "utf8"), maxOutputTokens: GROUNDING_MAX_OUTPUT_TOKENS, price: this.#price }, body);
    const candidate = (body as { candidates?: Array<{ finishReason?: unknown; content?: { parts?: Array<{ text?: unknown }> }; groundingMetadata?: { groundingChunks?: unknown } }> } | null)?.candidates?.[0];
    // A reply cut off by the token limit is never shown (it would end mid-sentence): the caller falls back to the model-only path.
    if (candidate?.finishReason !== undefined && candidate.finishReason !== "STOP") throw new GroundingFailedError(this.model, `the answer did not finish normally (${typeof candidate.finishReason === "string" ? candidate.finishReason.slice(0, 40) : "unknown"})`);
    const text = (candidate?.content?.parts ?? [])
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (text === "") throw new GroundingFailedError(this.model, "no text in the response");
    return { text, sources: sanitizeGroundingSources(candidate?.groundingMetadata?.groundingChunks) };
  }
}

/** A deterministic fake for tests: returns the canned answer (or throws the canned error) and records every request. */
export class MockGroundedAnswerer implements GroundedAnswerer {
  readonly kind = "mock" as const;
  readonly model: string;
  readonly calls: GroundedAnswerRequest[] = [];
  readonly #result: GroundedAnswer | Error | ((r: GroundedAnswerRequest) => Promise<GroundedAnswer>);

  constructor(result: GroundedAnswer | Error | ((r: GroundedAnswerRequest) => Promise<GroundedAnswer>), model = "mock-grounded") {
    this.#result = result;
    this.model = model;
  }

  async answer(request: GroundedAnswerRequest): Promise<GroundedAnswer> {
    this.calls.push(request);
    if (typeof this.#result === "function") return this.#result(request);
    if (this.#result instanceof Error) throw this.#result;
    return this.#result;
  }
}

export class GroundingConfigError extends Error {
  constructor(message: string) {
    super(`GroundingConfigError: ${message}`);
    this.name = "GroundingConfigError";
  }
}

/**
 * `VC_GROUNDING` (default off): unset, empty or "off" -> undefined; exactly "gemini" -> a Gemini grounded answerer from
 * `GEMINI_API_KEY` (B11: keys only from the environment) and optional `VC_GROUNDING_MODEL`. Any other value, or "gemini" without a
 * key, is a configuration error at startup, never a silent off.
 */
export function loadGroundedAnswerer(
  env: { VC_GROUNDING?: string; VC_GROUNDING_MODEL?: string; GEMINI_API_KEY?: string },
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; onUsage?: (usage: OllamaActualUsage) => void; price?: OllamaPrice } = {},
): GroundedAnswerer | undefined {
  const raw = env.VC_GROUNDING?.trim();
  if (raw === undefined || raw === "" || raw === "off") return undefined;
  if (raw !== "gemini") throw new GroundingConfigError('VC_GROUNDING must be unset, "off" or "gemini" (got a different value)');
  if (!env.GEMINI_API_KEY) throw new GroundingConfigError("VC_GROUNDING=gemini needs GEMINI_API_KEY");
  const model = env.VC_GROUNDING_MODEL?.trim() || GROUNDING_DEFAULT_MODEL;
  // H6: only a flash model is accepted, so hidden reasoning cannot eat the output limit and cut the reply off. `geminiThinkingConfig` then picks the
  // config each proven flash id takes (`thinkingBudget: 0`, or `thinkingLevel: "minimal"` for gemini-3.5-flash-lite); a flash id it has not proven gets
  // none and runs on its own default. A non-flash model is a startup error rather than a silently truncated or costlier answer.
  if (!/flash/i.test(model)) throw new GroundingConfigError('VC_GROUNDING_MODEL must be a "flash" model: the thinking budget is only set (and proven) for those');
  return new GeminiGroundedAnswerer({
    model,
    apiKey: env.GEMINI_API_KEY,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.onUsage ? { onUsage: options.onUsage } : {}),
    ...(options.price ? { price: options.price } : {}),
  });
}

/** H6: the cap a grounded call ran into. The student graph treats any grounded failure as "fall back to the model-only D-110 guidance". */
export class GroundingBudgetError extends Error {
  readonly scope: "session" | "day" | "spend";
  constructor(scope: "session" | "day" | "spend") {
    super(`GroundingBudgetError: the grounded-call ${scope} cap is reached`);
    this.name = "GroundingBudgetError";
    this.scope = scope;
  }
}

export const GROUNDING_DEFAULT_MAX_PER_SESSION = 5;
export const GROUNDING_DEFAULT_MAX_PER_DAY = 500;
const GROUNDING_BUDGET_MAX_KEYS = 20_000;

export interface GroundingBudgetOptions {
  maxPerSession: number;
  maxPerDay: number;
  /** UTC day rollover clock (tests). */
  now?: () => Date;
  /** Charged once per allowed call, after the counters (the existing spend guard); a throw refuses the call. */
  spend?: () => void | Promise<void>;
}

/**
 * H6: caps grounded calls per caller key (an anonymous client or a chat thread) and per UTC day, and charges the spend guard when one exists.
 * `bind(answerer, key)` returns an answerer that counts every attempt before it reaches the network; over a cap it throws
 * `GroundingBudgetError`, which the graph already turns into the model-only guidance. The per-key map is bounded and reset each day.
 */
export class GroundingBudget {
  readonly maxPerSession: number;
  readonly maxPerDay: number;
  readonly #now: () => Date;
  readonly #spend: (() => void | Promise<void>) | undefined;
  #day = "";
  #dayCount = 0;
  #perKey = new Map<string, number>();

  constructor(options: GroundingBudgetOptions) {
    this.maxPerSession = options.maxPerSession;
    this.maxPerDay = options.maxPerDay;
    this.#now = options.now ?? (() => new Date());
    this.#spend = options.spend;
  }

  async #charge(key: string): Promise<void> {
    const day = this.#now().toISOString().slice(0, 10);
    if (day !== this.#day) {
      this.#day = day;
      this.#dayCount = 0;
      this.#perKey = new Map();
    }
    if (this.#dayCount >= this.maxPerDay) throw new GroundingBudgetError("day");
    const used = this.#perKey.get(key) ?? 0;
    if (used >= this.maxPerSession) throw new GroundingBudgetError("session");
    // F2: reserve both counts synchronously, BEFORE the async spend is awaited, so parallel calls cannot all pass the checks above.
    const keys = this.#perKey;
    this.#dayCount += 1;
    if (!keys.has(key) && keys.size >= GROUNDING_BUDGET_MAX_KEYS) keys.delete(keys.keys().next().value as string);
    keys.set(key, used + 1);
    if (this.#spend) {
      try {
        await this.#spend();
      } catch {
        // Roll the reservation back (only if the day has not rolled over meanwhile), so a refused spend does not eat the caps.
        if (this.#day === day) this.#dayCount = Math.max(0, this.#dayCount - 1);
        const n = keys.get(key);
        if (n !== undefined) {
          if (n <= 1) keys.delete(key);
          else keys.set(key, n - 1);
        }
        throw new GroundingBudgetError("spend");
      }
    }
  }

  /** `key` is the caller (a client or a thread); pass a function to read it from request-scoped state (the graph and its deps are shared across requests). */
  bind(inner: GroundedAnswerer, key: string | (() => string)): GroundedAnswerer {
    const charge = (k: string) => this.#charge(k);
    return {
      kind: inner.kind,
      model: inner.model,
      async answer(request: GroundedAnswerRequest): Promise<GroundedAnswer> {
        await charge(typeof key === "function" ? key() : key);
        return inner.answer(request);
      },
    };
  }
}

function groundingCap(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d{1,9}$/.test(raw.trim()) || Number(raw.trim()) < 1) throw new GroundingConfigError(`${name} must be a positive whole number`);
  return Number(raw.trim());
}

/** H6: `VC_GROUNDING_MAX_PER_SESSION` (default 5) and `VC_GROUNDING_MAX_PER_DAY` (default 500); a malformed value is a startup error. */
export function loadGroundingBudget(
  env: { VC_GROUNDING_MAX_PER_SESSION?: string; VC_GROUNDING_MAX_PER_DAY?: string },
  options: { now?: () => Date; spend?: () => void | Promise<void> } = {},
): GroundingBudget {
  return new GroundingBudget({
    maxPerSession: groundingCap(env.VC_GROUNDING_MAX_PER_SESSION, GROUNDING_DEFAULT_MAX_PER_SESSION, "VC_GROUNDING_MAX_PER_SESSION"),
    maxPerDay: groundingCap(env.VC_GROUNDING_MAX_PER_DAY, GROUNDING_DEFAULT_MAX_PER_DAY, "VC_GROUNDING_MAX_PER_DAY"),
    ...(options.now ? { now: options.now } : {}),
    ...(options.spend ? { spend: options.spend } : {}),
  });
}

// ---------------------------------------------------------------------------
// FailoverProvider (T-021, D-020, contract B6 "runtime failover") — cycles a config-ordered
// chain of providers within a total attempt budget, retrying only retryable failures, and NEVER
// auto-dropping to the `rules` provider (that decision belongs to the deployment's config, not to
// a mid-session failure). When the whole budget is spent it raises the engineering alert and
// throws AiUnavailableError, the typed error apps/web surfaces as the apologetic "AI unavailable"
// state with a Retry that resubmits the same input (no retype).
// ---------------------------------------------------------------------------

/**
 * Thrown when every model in a FailoverProvider's chain failed within the retry budget. `name` is
 * checked BY STRING (not `instanceof`) by callers in another bundled copy (apps/web), the same
 * pattern already used for ApprovalResponseError/ZodError in apps/web/src/server/approval-service.ts.
 * Carries no transcript content and no key value (B11/B13) — only model names (never secrets) and
 * counts.
 */
export class AiUnavailableError extends Error {
  readonly modelsAttempted: string[];
  readonly attempts: number;
  readonly lastErrorName: string;

  constructor(modelsAttempted: string[], attempts: number, lastErrorName: string) {
    super(
      `AiUnavailableError: every model in the failover chain (${modelsAttempted.join(" -> ")}) failed after ` +
        `${attempts} attempt(s) (last error: ${lastErrorName}); there is no automatic drop to the rules provider (contract B6)`,
    );
    this.name = "AiUnavailableError";
    this.modelsAttempted = modelsAttempted;
    this.attempts = attempts;
    this.lastErrorName = lastErrorName;
  }
}

/**
 * Retryable: a timeout, an HTTP 429 or 5xx, a response whose body was not usable JSON
 * (LiteLlmMalformedResponseError — "invalid/unparseable JSON") or could not be sent at all
 * (LiteLlmNetworkError — DNS/connection-refused/TLS, transient by nature), or — T-021 fix cycle 1,
 * ISS-t-021-rev-2, gate `failover-scope` Q2 A (Umesh, 2026-09-26: "treat wrong-shape like an
 * outage") — a schema-invalid MODEL OUTPUT (a tagged `ModelOutputSchemaError`, T-032/ISS-t-021-rev-3):
 * the model answered, but not in the shape the caller's outputSchema requires. Treating this as
 * retryable here (not only at generateWithRetry's own same-provider layer,
 * packages/engine/src/scribe/nodes.ts) is what fails it over to the NEXT chain member within the
 * SAME attempt budget and wall-clock deadline, instead of generateWithRetry re-asking with a fresh
 * top-level `provider.generate()` call that would otherwise restart FailoverProvider's internal
 * chain position at model 0 and start a brand-new deadline window (ISS-t-021-rev-2's actual bug:
 * "never fails over ... restarts at chain[0]").
 * NEVER retryable: any other HTTP status (400/401/403/404/... — auth/config errors, D-020's "never
 * on auth/config errors"), a stub provider's ProviderNotWiredError, a bare/unrelated `z.ZodError`
 * that is NOT a `ModelOutputSchemaError` (T-032, ISS-t-021-rev-3: an internal bug inside a chain
 * member's own code, unrelated to validating the model's output, must never be silently retried as
 * if it were an outage), or anything unrecognised. This is a WHITELIST on purpose: an unrecognised
 * failure mode fails closed (no retry, no failover) rather than silently retried.
 */
export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof LiteLlmTimeoutError) return true;
  if (err instanceof LiteLlmMalformedResponseError) return true;
  if (err instanceof LiteLlmNetworkError) return true;
  if (err instanceof LiteLlmHttpError) return err.status === 429 || err.status >= 500;
  if (err instanceof ModelOutputSchemaError) return true;
  // T-057: Gemini as a text provider. Same rule as LiteLLM: timeout, unusable body, unsendable request, 429 and 5xx are outages; auth/config 4xx and the caller's abort are not.
  if (err instanceof GeminiTimeoutError || err instanceof GeminiMalformedResponseError || err instanceof GeminiNetworkError) return true;
  if (err instanceof GeminiHttpError) return err.status === 429 || err.status >= 500;
  // P1 LK1 (D-105 Q5): the Ollama text chain. Same rule as LiteLLM: timeout, unusable body, unsendable
  // request, 429 and 5xx are outages and go to the next hop. 4xx other than 429 (config/auth), the caller's
  // own abort (OllamaAbortedError), a refusal (OllamaRefusedError) and a budget stop are NOT, so they surface.
  if (err instanceof OllamaTimeoutError) return true;
  if (err instanceof OllamaMalformedResponseError) return true;
  if (err instanceof OllamaNetworkError) return true;
  if (err instanceof OllamaHttpError) return err.status === 429 || err.status >= 500;
  return false;
}

/** Total retry budget across the whole chain when the config/caller does not set one (D-020: "about 10"). */
export const FAILOVER_DEFAULT_MAX_ATTEMPTS = 10;
/** Doubles per attempt, capped at FAILOVER_DEFAULT_MAX_DELAY_MS. */
export const FAILOVER_DEFAULT_BASE_DELAY_MS = 200;
export const FAILOVER_DEFAULT_MAX_DELAY_MS = 4_000;

/**
 * T-021 fix cycle 1 (ISS-t-021-rev-1): default wall-clock deadline, in ms, for the WHOLE
 * FailoverProvider.generate() call — independent of the attempt counter. At the pre-fix defaults
 * (10 attempts x 30s per-attempt timeout + backoff) the worst-case wait before the apology was
 * ~5.4 minutes with no upper bound enforced at all; this deadline is the actual bound now, whatever
 * the attempt budget or per-attempt timeout are configured to.
 */
export const FAILOVER_DEFAULT_DEADLINE_MS = 45_000;

/**
 * T-021 fix cycle 1 (ISS-t-021-rev-1): thrown internally when the wall-clock deadline is hit before
 * an attempt (or the whole chain) completes. Never escapes FailoverProvider.generate() to the
 * caller — it is folded into the same onExhausted alert + AiUnavailableError as a normal
 * attempt-budget exhaustion (its name is carried as AiUnavailableError.lastErrorName so the alert
 * and the caller can tell a deadline-cutoff apart from an ordinary provider failure).
 */
export class FailoverDeadlineExceededError extends Error {
  constructor(deadlineMs: number) {
    super(`FailoverDeadlineExceededError: the failover chain did not complete within the ${deadlineMs}ms wall-clock deadline (contract B6)`);
    this.name = "FailoverDeadlineExceededError";
  }
}

/**
 * Full-jitter exponential backoff (AWS "Exponential Backoff And Jitter"): a uniformly random delay
 * in [0, min(maxDelayMs, baseDelayMs * 2^(attempt-1))]. `attempt` is 1-based (the attempt number
 * that just failed). `random` is injectable so tests can make the jitter deterministic.
 */
export function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number = Math.random): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * cap);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What FailoverProvider hands its alert hook when the whole budget is exhausted. */
export interface FailoverExhaustedInfo {
  /** Every model in the chain, config order (not secrets — safe to log). */
  models: string[];
  /** Total attempts actually made (<= the configured budget). */
  attempts: number;
  lastErrorName: string;
  lastErrorMessage: string;
  /** Kind of the first chain member, so the alert names the real provider (absent from older callers). */
  kind?: ProviderKind;
}

/**
 * The default alert (contract B6 "runtime failover", item (a) engineering alert): a structured,
 * key-free, transcript-free console.error line PLUS a Langfuse-visible OTel error span through the
 * existing @vc/observability wiring (recordErrorSpan — the same export path callbacks.ts/tracing.ts
 * use for LangChain runs, so this needs no second exporter). Safe to call even when tracing was
 * never initialised (recordErrorSpan no-ops via the OTel API's default no-op tracer).
 */
export function emitFailoverAlert(info: FailoverExhaustedInfo): void {
  console.error(
    JSON.stringify({
      event: "provider_failover_exhausted",
      models: info.models,
      attempts: info.attempts,
      lastErrorName: info.lastErrorName,
    }),
  );
  recordErrorSpan({
    name: "provider.failover.exhausted",
    attributes: {
      // "gen_ai.*" is the OTel GenAI semantic-convention prefix; @langfuse/otel's LangfuseSpanProcessor
      // only exports a span by default when it recognises it as LLM-related (its own instrumentation
      // scope, a known LLM instrumentor's scope, or a "gen_ai."-prefixed attribute) — verified against
      // its published dist (span-filter.ts's isDefaultExportSpan). Without this, the span is a real,
      // correctly-built OTel span that the processor silently drops before it ever reaches Langfuse.
      "gen_ai.system": info.kind ?? "litellm",
      "failover.models": info.models.join(" -> "),
      "failover.attempts": info.attempts,
      "failover.last_error_name": info.lastErrorName,
    },
    errorName: info.lastErrorName,
    errorMessage: `every model in the failover chain (${info.models.join(" -> ")}) failed after ${info.attempts} attempt(s)`,
  });
}

/** A go-live engineering alert (P1 alerts, D-108 item 7). `attributes` are figures and names only: never a student's words, a key or a transcript. */
export interface EngineeringAlert {
  /** `alert_<what>`, e.g. "alert_safety_screen_outage". */
  event: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * The same alert mechanism as `emitFailoverAlert` (a structured, text-free console.error line PLUS a Langfuse-visible OTel error span through
 * the existing @vc/observability `recordErrorSpan`), for alerts that are not a provider-chain exhaustion. No new transport: no email, Slack or
 * webhook. The caller owns rate limiting and must pass only key-free, transcript-free attributes.
 */
export function emitEngineeringAlert(alert: EngineeringAlert): void {
  const attributes = alert.attributes ?? {};
  console.error(JSON.stringify({ level: "error", event: alert.event, ...attributes }));
  recordErrorSpan({
    name: `vc.${alert.event}`,
    attributes: {
      // "gen_ai.*" so the Langfuse span filter forwards the span (see emitFailoverAlert).
      "gen_ai.system": "vc",
      "alert.event": alert.event,
      ...Object.fromEntries(Object.entries(attributes).map(([k, v]) => [`alert.${k}`, v])),
    },
    errorName: alert.event,
    errorMessage: `engineering alert ${alert.event}`,
  });
}

export interface FailoverProviderOptions {
  /** Providers in config order — the chain FailoverProvider cycles through on a retryable failure. */
  chain: LlmProvider[];
  /** Total retry budget across the WHOLE chain (D-020: "about 10"). */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * T-021 fix cycle 1 (ISS-t-021-rev-1): wall-clock deadline in ms for the WHOLE generate() call,
   * independent of maxAttempts — defaults to FAILOVER_DEFAULT_DEADLINE_MS. Each attempt (and each
   * backoff wait) is capped at whatever remains of this budget, so a hung attempt can never by
   * itself push the total wait past the deadline.
   */
  deadlineMs?: number;
  /**
   * P1 LK1 (D-105 Q5): one attempt per chain member, no wrap-around, for a caller-facing chain where a
   * second lap over the same models only adds latency. Caps the attempt budget at `chain.length`
   * (a smaller `maxAttempts` still wins). Default false: the LiteLLM chain keeps its wrapping budget.
   */
  singlePass?: boolean;
  /** Injectable for tests (no real waiting; node:test fake timers also work against the default). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for deterministic jitter in tests. */
  random?: () => number;
  /**
   * Called exactly once, synchronously, when the whole attempt budget is spent — BEFORE
   * AiUnavailableError is thrown. Defaults to emitFailoverAlert (real console.error + Langfuse
   * span); tests inject a spy to assert "emitted exactly once, no secrets" without depending on
   * console output.
   */
  onExhausted?: (info: FailoverExhaustedInfo) => void;
}

export class FailoverProvider implements LlmProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  private readonly chain: LlmProvider[];
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly deadlineMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onExhausted: (info: FailoverExhaustedInfo) => void;

  constructor(options: FailoverProviderOptions) {
    if (options.chain.length === 0) throw new Error("FailoverProvider: chain must have at least one provider");
    this.chain = options.chain;
    this.kind = options.chain[0]!.kind;
    this.model = options.chain.map((p) => p.model).join(" -> ");
    this.maxAttempts = options.singlePass
      ? Math.min(options.maxAttempts ?? options.chain.length, options.chain.length)
      : (options.maxAttempts ?? FAILOVER_DEFAULT_MAX_ATTEMPTS);
    this.baseDelayMs = options.baseDelayMs ?? FAILOVER_DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? FAILOVER_DEFAULT_MAX_DELAY_MS;
    this.deadlineMs = options.deadlineMs ?? FAILOVER_DEFAULT_DEADLINE_MS;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.onExhausted = options.onExhausted ?? emitFailoverAlert;
  }

  /**
   * Races `run(signal)`'s promise against a timer for `remainingMs` — the wall-clock deadline's
   * actual enforcement mechanism (ISS-t-021-rev-1's "each attempt's timeout is capped at the
   * remaining budget"): whatever timeout the provider itself is configured with, this attempt can
   * never take longer than what is left of FailoverProvider's own deadline. Always clears its timer
   * so a settled attempt never leaves a dangling handle.
   *
   * T-037 (ISS-066): `run` is a factory, not an already-started promise, so this method owns the
   * `AbortController` behind the signal it hands to the attempt. When the deadline timer wins the
   * race, it calls `controller.abort()` BEFORE rejecting — the attempt is not just abandoned here,
   * its own in-flight work (a real LiteLLM HTTP request) is told to stop. `Promise.race` already
   * attaches a rejection handler to the losing promise, so aborting it here can never produce an
   * unhandled rejection later.
   */
  private async raceDeadline<T>(run: (signal: AbortSignal) => Promise<T>, remainingMs: number, externalSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener("abort", onAbort, { once: true });
    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new FailoverDeadlineExceededError(this.deadlineMs));
      }, Math.max(0, remainingMs));
    });
    try {
      return await Promise.race([run(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  }

  toString(): string {
    return `FailoverProvider(chain=${this.chain.map((p) => p.model).join(",")})`;
  }

  /**
   * Cycles the chain in config order (attempt 1 -> chain[0], attempt 2 -> chain[1], ... wrapping
   * back to chain[0] if the budget outlives one full pass), applying full-jitter exponential
   * backoff between attempts. A non-retryable error (isRetryableProviderError) is NEVER retried and
   * NEVER fails over — it is thrown immediately, unchanged, so a schema-invalid output still hits
   * generateWithRetry's own same-provider retry and an auth/config error surfaces exactly as the
   * chosen model reported it. Only once the WHOLE budget is spent on retryable failures does this
   * raise the alert and throw the typed AiUnavailableError — never a silent drop to `rules`.
   *
   * T-021 fix cycle 1 (ISS-t-021-rev-1): a wall-clock deadline (this.deadlineMs) bounds the WHOLE
   * call independently of the attempt counter. Before every attempt, and before every backoff wait,
   * the remaining deadline budget is checked; once it runs out the loop stops exactly like an
   * ordinary attempt-budget exhaustion (same single alert, same AiUnavailableError), just with
   * `FailoverDeadlineExceededError` as the recorded lastErrorName. Each attempt itself is raced
   * against the remaining budget (raceDeadline), so a single hung attempt can never by itself push
   * the total wait past the deadline, whatever its own configured timeout is.
   *
   * T-032 (ISS-t-021-rev-3): both deadline-exhaustion exits below assign `lastError` UNCONDITIONALLY
   * (never `lastError ?? ...`). The deadline is what actually stopped the loop in both cases — even
   * when an earlier attempt already set `lastError` to some other retryable failure — so reporting
   * that stale earlier error instead of the deadline would misattribute the exhaustion cause to the
   * caller and the engineering alert.
   */
  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    const deadlineAt = Date.now() + this.deadlineMs;
    let lastError: unknown;
    let attempt = 0;
    while (attempt < this.maxAttempts) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        lastError = new FailoverDeadlineExceededError(this.deadlineMs);
        break;
      }
      const provider = this.chain[attempt % this.chain.length]!;
      attempt += 1;
      try {
        // T-037 (ISS-066): the signal is bound fresh per attempt, inside raceDeadline, so a
        // deadline-timeout on THIS attempt can never reach back and abort a different (earlier,
        // already-settled, or later) attempt's own request.
        return await this.raceDeadline((signal) => provider.generate<T>({ ...request, signal }), remaining, request.signal);
      } catch (err) {
        if (err instanceof FailoverDeadlineExceededError) {
          lastError = err;
          break;
        }
        if (!isRetryableProviderError(err)) throw err;
        lastError = err;
        if (attempt >= this.maxAttempts) break;
        const remainingForBackoff = deadlineAt - Date.now();
        if (remainingForBackoff <= 0) {
          // The deadline ran out BETWEEN attempts (during the backoff gap), before backoff could
          // even begin — the reported cause must be the deadline, not the retryable error that just
          // preceded it.
          lastError = new FailoverDeadlineExceededError(this.deadlineMs);
          break;
        }
        const backoffMs = Math.min(computeBackoffMs(attempt, this.baseDelayMs, this.maxDelayMs, this.random), remainingForBackoff);
        await this.sleep(backoffMs);
      }
    }
    const models = this.chain.map((p) => p.model);
    const lastErrorName = lastError instanceof Error ? lastError.name : "UnknownError";
    const lastErrorMessage = lastError instanceof ModelOutputSchemaError
      ? "Provider output did not match the required schema."
      : lastError instanceof Error ? lastError.message : String(lastError);
    this.onExhausted({ models, attempts: attempt, lastErrorName, lastErrorMessage, kind: this.kind });
    throw new AiUnavailableError(models, attempt, lastErrorName);
  }
}

// ---------------------------------------------------------------------------
// RulesProvider (T-019) — deterministic, NO MODEL. Lets P1 (scribe -> facts ->
// profile diff -> approve) complete end to end with zero AI calls (the lead's
// "AI dependence is one thing, Gemini dependence is another" review).
//
// Input contract (there is no model to interpret a free-form prompt, so the
// input itself must already be structured):
//   - fact-extraction: `input.turns` is the engine's normal ScribeTurn[] (see
//     packages/engine/src/scribe/schemas.ts ScribeTurnSchema). Any turn whose
//     `translatedText` (falling back to `text` when translatedText has none)
//     contains one or more "key: value" lines is read as a structured
//     annotation / form field rendered into the transcript — e.g. a
//     counsellor's structured intake form surfaced as a turn reading
//     "targetCountry: Canada\nbudget_inr_per_year: 2000000". Each matched
//     line becomes one candidate fact, cited to that exact turn and the exact
//     matched line (a verbatim substring of the turn text, so the engine's
//     citation guard, B2, accepts it without any fuzzy matching). A value
//     that parses as a plain number is coerced to a number; anything else
//     stays a trimmed string. `confidence` is always 1 (deterministic, not
//     modeled). A turn with no such line contributes no facts — this
//     provider never invents one.
//   - session-summary: `input.facts` is the session's already-extracted
//     Fact[]. The summary is a fixed template listing each fact's key, value
//     and source turn — a record of what was captured, never an instruction
//     to the counsellor (contract B1). Zero facts still produces a valid,
//     non-empty summary string.
// ---------------------------------------------------------------------------

export class RulesProviderUnsupportedSkillError extends Error {
  constructor(skillName: string) {
    super(`RulesProviderUnsupportedSkillError: the rules provider has no deterministic handling for skill "${skillName}"`);
    this.name = "RulesProviderUnsupportedSkillError";
  }
}

const RULES_FIELD_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;

interface RulesTurnLike {
  turnId?: unknown;
  text?: unknown;
  translatedText?: unknown;
}

function coerceRuleValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed.length > 0 && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Every "key: value" line in `text`, matched verbatim so each `line` is a real substring of it. */
function annotationLines(text: string): Array<{ line: string; key: string; value: string | number }> {
  const out: Array<{ line: string; key: string; value: string | number }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = RULES_FIELD_LINE.exec(line);
    if (!m) continue;
    out.push({ line, key: m[1]!, value: coerceRuleValue(m[2]!) });
  }
  return out;
}

function rulesExtractFacts(input: unknown): { facts: unknown[] } {
  const turns = Array.isArray((input as { turns?: unknown } | null)?.turns)
    ? ((input as { turns: unknown[] }).turns as RulesTurnLike[])
    : [];
  const facts: unknown[] = [];
  for (const turn of turns) {
    const turnId = typeof turn.turnId === "string" ? turn.turnId : "";
    if (!turnId) continue;
    const translated = typeof turn.translatedText === "string" ? turn.translatedText : "";
    const original = typeof turn.text === "string" ? turn.text : "";
    const source = annotationLines(translated).length > 0 ? translated : original;
    for (const { line, key, value } of annotationLines(source)) {
      facts.push({
        key,
        value,
        source: { type: "transcript", quote: line, turnId },
        confidence: 1,
        purposeTags: [],
        sensitivity: "low",
      });
    }
  }
  return { facts };
}

function rulesSummarizeSession(input: unknown): { summary: string } {
  const rawFacts = (input as { facts?: unknown } | null)?.facts;
  const facts = Array.isArray(rawFacts) ? rawFacts : [];
  if (facts.length === 0) return { summary: "No facts were recorded this session." };
  const lines = facts.map((f) => {
    const fact = f as { key?: unknown; value?: unknown; source?: { turnId?: unknown } };
    const key = typeof fact.key === "string" ? fact.key : "unknown";
    const value =
      fact.value !== null && typeof fact.value === "object" ? JSON.stringify(fact.value) : String(fact.value);
    const turnId = typeof fact.source?.turnId === "string" ? fact.source.turnId : "unknown turn";
    return `${key} = ${value} (turn ${turnId})`;
  });
  return { summary: `Facts recorded this session: ${lines.join("; ")}.` };
}

export class RulesProvider implements LlmProvider {
  readonly kind = "rules" as const;
  readonly model: string;

  constructor(options: { model?: string } = {}) {
    this.model = options.model ?? "rules";
  }

  /** Dispatches on skillName to a deterministic, template-based handler; never calls a network. */
  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    await authorizeExecution(request);
    let raw: unknown;
    switch (request.skillName) {
      case "fact-extraction":
        raw = rulesExtractFacts(request.input);
        break;
      case "session-summary":
        if ((request.input as { task?: unknown } | null)?.task === "verify-approved-history") {
          const input = z.object({ task: z.literal("verify-approved-history"), candidate: z.string().min(1),
            facts: z.array(z.object({ key: z.string().min(1), value: z.unknown(),
              source: z.object({ turnId: z.string().optional() }).passthrough() }).passthrough()),
            approvedContext: z.array(z.object({ factId: z.string().min(1) }).passthrough()).min(1),
          }).passthrough().parse(request.input);
          const reviewedFactIds = input.approvedContext.map((fact) => fact.factId);
          const exact = rulesSummarizeSession({ facts: input.facts }).summary === input.candidate;
          raw = { verdict: exact && new Set(reviewedFactIds).size === reviewedFactIds.length ? "clear" : "uncertain",
            confidence: exact ? 1 : 0, reviewedFactIds,
            reviewedRanges: [{ start: 0, end: input.candidate.length }], offendingSpans: [] };
        } else raw = rulesSummarizeSession(request.input);
        break;
      default:
        throw new RulesProviderUnsupportedSkillError(request.skillName);
    }
    // B5: even a deterministic path returns only what the caller's Zod schema accepts.
    return parseModelOutput(request.outputSchema, raw);
  }
}


// ---------------------------------------------------------------------------
// OllamaProvider (P1 U13b prep, D-100) — Ollama-hosted API-key models (e.g. GLM 5.3 Flash,
// DeepSeek 4.1 Flash) for the REAL eval runners. A Bearer-key HTTP client for Ollama's
// `POST {base}/api/chat`. It is NOT part of the production failover chain or `createProvider`;
// the REAL runners select it through `VC_REAL_MODEL=ollama:<model-id>` (`prepareOllamaProvider`).
// Every request is charged against the A24 budget BEFORE it is sent (the `beforeRequest` hook),
// so the USD 50/run and 200/month caps apply to Ollama runs exactly as they do to any REAL run.
// ---------------------------------------------------------------------------

export const OLLAMA_DEFAULT_BASE_URL = "https://ollama.com";
export const OLLAMA_DEFAULT_TIMEOUT_MS = 120_000;
/** Upper bound on generated tokens per request (Ollama `options.num_predict`); also the output side of the pre-request cost bound. */
export const OLLAMA_DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const OLLAMA_PRICE_ENV = "OLLAMA_PRICE_USD_PER_MTOK";
/** ISS-271: a price below this (USD per million tokens) is a typo or a unit slip, not a price; the budget cap would under-count. */
export const OLLAMA_MIN_PRICE_USD_PER_MTOK = 0.01;
/** ISS-274: env override of the per-request output-token bound (positive integer). */
export const OLLAMA_MAX_OUTPUT_TOKENS_ENV = "OLLAMA_MAX_OUTPUT_TOKENS";

export interface OllamaPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

/**
 * Per-model price table (USD per million tokens). The model ids are Ollama's real ids (GET /api/tags,
 * 2026-10-19); a pinned `:<tag>` (e.g. `deepseek-v4.1-flash:1017`) is priced from its base id. The prices
 * below are [ASSUMPTION - UNVERIFIED]: they do not come from Ollama's price list; they are deliberately
 * conservative placeholders so the budget cap over-counts rather than under-counts. A model id that is not in
 * this table (and has no `OLLAMA_PRICE_USD_PER_MTOK="<in>,<out>"` override) is REFUSED: an unknown
 * price is never treated as zero. Replace with the real ids/prices before the first paid run.
 */
export const OLLAMA_PRICE_TABLE_USD_PER_MTOK: Readonly<Record<string, OllamaPrice>> = {
  "glm-5.3-flash": { inputUsdPerMTok: 1, outputUsdPerMTok: 4 },
  "deepseek-v4.1-flash": { inputUsdPerMTok: 1, outputUsdPerMTok: 4 },
};

/** A REAL-run config problem (missing key, unknown model price, bad VC_REAL_MODEL) found before any request. */
export class OllamaRefusedError extends Error {
  constructor(reason: string) {
    super(`OllamaRefusedError: ${reason}`);
    this.name = "OllamaRefusedError";
  }
}
export class OllamaHttpError extends Error {
  readonly status: number;
  constructor(status: number, model: string) {
    super(`OllamaHttpError: the ollama provider (model "${model}") request failed with HTTP ${status}`);
    this.name = "OllamaHttpError";
    this.status = status;
  }
}
export class OllamaTimeoutError extends Error {
  constructor(model: string, timeoutMs: number) {
    super(`OllamaTimeoutError: the ollama provider (model "${model}") did not respond within ${timeoutMs}ms`);
    this.name = "OllamaTimeoutError";
  }
}
export class OllamaAbortedError extends Error {
  constructor(model: string) {
    super(`OllamaAbortedError: the ollama provider (model "${model}") request was aborted by the caller's signal`);
    this.name = "OllamaAbortedError";
  }
}
export class OllamaMalformedResponseError extends Error {
  constructor(model: string, reason: string) {
    super(`OllamaMalformedResponseError: the ollama provider (model "${model}") returned an unusable response: ${reason}`);
    this.name = "OllamaMalformedResponseError";
  }
}
export class OllamaNetworkError extends Error {
  constructor(model: string, reason: string) {
    super(`OllamaNetworkError: the ollama provider (model "${model}") request could not be sent: ${reason}`);
    this.name = "OllamaNetworkError";
  }
}

/** What is about to be sent: an UPPER BOUND on its cost, so a budget guard never under-counts. */
export interface OllamaRequestEstimate {
  model: string;
  /** Prompt-size bound: one token per UTF-8 byte (never fewer tokens than reality for the price bound). */
  estimatedInputTokens: number;
  maxOutputTokens: number;
  estimatedCostUsd: number;
}

/**
 * D-103: what a SUCCESSFUL `/api/chat` response actually reported (`prompt_eval_count` / `eval_count`), next to the
 * pre-request reservation it was made under. `actual` is "reported" only when BOTH counts are non-negative safe
 * integers; anything else (missing, negative, fractional, string, null, half-present) is "unreported" and carries no
 * token or USD figure, so a caller keeps the reservation instead of recording zero.
 */
export interface OllamaActualUsage {
  model: string;
  /** The reservation this request was charged under (the cap check is unchanged). */
  estimate: OllamaRequestEstimate;
  actual: "reported" | "unreported";
  inputTokens?: number;
  outputTokens?: number;
  /** Actual tokens x this provider's table/override price (USD per million tokens); notional for a hosted-key model. */
  usd?: number;
}

export interface OllamaProviderOptions {
  model: string;
  apiKey: string;
  price: OllamaPrice;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** Called after authorization and BEFORE the request is sent; throwing (e.g. BudgetExceededError) stops the request. */
  beforeRequest?: (estimate: OllamaRequestEstimate) => void;
  /** D-103: called once per successful (2xx, JSON-body) response with the reported token counts; never replaces the reservation above. */
  afterResponse?: (usage: OllamaActualUsage) => void;
  /** Injected in tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements LlmProvider {
  readonly kind = "ollama" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly price: OllamaPrice;
  private readonly beforeRequest: ((estimate: OllamaRequestEstimate) => void) | undefined;
  private readonly afterResponse: ((usage: OllamaActualUsage) => void) | undefined;
  private readonly fetchImpl: typeof fetch;
  // Private (#) so the key never shows up in JSON.stringify, String() or util.inspect (B11).
  readonly #apiKey: string;
  #actualHookFailures = 0;

  constructor(options: OllamaProviderOptions) {
    // ISS-272: a whitespace-only key is no key; a pasted key with a trailing newline is trimmed, never sent with it.
    const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
    if (!apiKey) throw new OllamaRefusedError("OLLAMA_API_KEY is required for the ollama provider");
    const { inputUsdPerMTok: i, outputUsdPerMTok: o } = options.price;
    if (!Number.isFinite(i) || !Number.isFinite(o) || i < OLLAMA_MIN_PRICE_USD_PER_MTOK || o < OLLAMA_MIN_PRICE_USD_PER_MTOK) {
      throw new OllamaRefusedError(
        `price for model "${options.model}" must be finite and >= ${OLLAMA_MIN_PRICE_USD_PER_MTOK} USD per million tokens (an unknown price is never assumed zero)`,
      );
    }
    this.model = options.model;
    this.price = options.price;
    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? OLLAMA_DEFAULT_TIMEOUT_MS;
    this.maxOutputTokens = options.maxOutputTokens ?? OLLAMA_DEFAULT_MAX_OUTPUT_TOKENS;
    this.beforeRequest = options.beforeRequest;
    this.afterResponse = options.afterResponse;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** D-103: how many times `afterResponse` threw (its response was still returned). */
  get actualHookFailures(): number {
    return this.#actualHookFailures;
  }

  toString(): string {
    return `OllamaProvider(model=${this.model}, baseUrl=${this.baseUrl})`;
  }

  async generate<T>(request: GenerateRequest<T>): Promise<T> {
    if (request.signal?.aborted) throw new OllamaAbortedError(this.model);
    const userContent = JSON.stringify(request.input);
    // ISS-270: UTF-8 byte length (>= tokens for any tokenizer), not UTF-16 code units: Devanagari text is 3 bytes per character.
    const estimatedInputTokens = Buffer.byteLength(request.skillPrompt, "utf8") + Buffer.byteLength(userContent, "utf8");
    const estimate: OllamaRequestEstimate = {
      model: this.model,
      estimatedInputTokens,
      maxOutputTokens: this.maxOutputTokens,
      estimatedCostUsd:
        (estimatedInputTokens * this.price.inputUsdPerMTok + this.maxOutputTokens * this.price.outputUsdPerMTok) / 1e6,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const externalSignal = request.signal;
    const onExternalAbort = (): void => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    let phase: "pre" | "sent" = "pre";
    let body: unknown;
    try {
      await authorizeExecution({ ...request, signal: controller.signal });
      this.beforeRequest?.(estimate); // charge BEFORE the spend can happen
      phase = "sent";
      const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.#apiKey}` },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          options: { num_predict: this.maxOutputTokens },
          messages: [
            { role: "system", content: request.skillPrompt },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new OllamaHttpError(res.status, this.model);
      // ISS-273: the abort timer stays armed until the body has been read; a stalled body is a timeout, not a hang.
      try {
        body = await res.json();
      } catch (err) {
        if ((err as { name?: unknown } | null)?.name === "AbortError") throw err;
        throw new OllamaMalformedResponseError(this.model, "response body was not valid JSON");
      }
    } catch (err) {
      if (err instanceof OllamaHttpError || err instanceof OllamaMalformedResponseError) throw err;
      if ((err as { name?: unknown } | null)?.name === "AbortError") {
        if (externalSignal?.aborted) throw new OllamaAbortedError(this.model);
        throw new OllamaTimeoutError(this.model, this.timeoutMs);
      }
      if (phase === "pre") throw err; // authorization refusal or a budget stop: surface it unchanged
      throw new OllamaNetworkError(this.model, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (this.afterResponse) {
      // D-103: the tokens were spent whether or not the content turns out usable, so record them first.
      const counts = body as { prompt_eval_count?: unknown; eval_count?: unknown } | null;
      const validCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
      const usage: OllamaActualUsage =
        validCount(counts?.prompt_eval_count) && validCount(counts?.eval_count)
          ? {
              model: this.model,
              estimate,
              actual: "reported",
              inputTokens: counts.prompt_eval_count,
              outputTokens: counts.eval_count,
              usd: (counts.prompt_eval_count * this.price.inputUsdPerMTok + counts.eval_count * this.price.outputUsdPerMTok) / 1e6,
            }
          : { model: this.model, estimate, actual: "unreported" };
      try {
        this.afterResponse(usage);
      } catch {
        // The response is already paid for: a failing hook (e.g. the ledger could not be written) must not discard it
        // or trigger a re-send. The failure is counted so the caller can see it; the budget run tallies that call as
        // unreported, keeping its reservation.
        this.#actualHookFailures += 1;
      }
    }

    const content = (body as { message?: { content?: unknown } } | null)?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new OllamaMalformedResponseError(this.model, "no message.content string in the response");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new OllamaMalformedResponseError(this.model, "message.content was not valid JSON");
    }
    return parseModelOutput(request.outputSchema, parsed); // B5: the caller's Zod schema is the only judge
  }
}

/**
 * `VC_REAL_MODEL` selection for the REAL runners: unset/empty/"gemini" -> the existing default
 * (unchanged); "ollama:<model-id>" -> Ollama. Anything else is refused, never guessed.
 */
export function parseRealModel(env: ProviderEnv): { backend: "gemini" } | { backend: "ollama"; model: string } {
  const raw = env.VC_REAL_MODEL?.trim();
  if (!raw || raw === "gemini") return { backend: "gemini" };
  if (raw.startsWith("ollama:") && raw.slice("ollama:".length).trim().length > 0) {
    return { backend: "ollama", model: raw.slice("ollama:".length).trim() };
  }
  throw new OllamaRefusedError(`VC_REAL_MODEL must be unset, "gemini" or "ollama:<model-id>" (got ${JSON.stringify(raw)})`);
}

function resolveOllamaPrice(model: string, env: ProviderEnv): OllamaPrice {
  const override = env[OLLAMA_PRICE_ENV];
  if (override !== undefined) {
    const parts = override.split(",").map((s) => Number(s.trim()));
    const [i, o] = parts;
    if (parts.length !== 2 || i === undefined || o === undefined || !Number.isFinite(i) || !Number.isFinite(o) || i < OLLAMA_MIN_PRICE_USD_PER_MTOK || o < OLLAMA_MIN_PRICE_USD_PER_MTOK) {
      throw new OllamaRefusedError(`${OLLAMA_PRICE_ENV} must be "<input>,<output>" USD per million tokens, both finite and >= ${OLLAMA_MIN_PRICE_USD_PER_MTOK}`);
    }
    return { inputUsdPerMTok: i, outputUsdPerMTok: o };
  }
  // Exact id first, then the base id with a pinned ":<tag>" suffix dropped (the full id is still what is sent).
  const base = /^([^:]+):[^:]+$/.exec(model)?.[1] ?? model;
  const key = Object.hasOwn(OLLAMA_PRICE_TABLE_USD_PER_MTOK, model) ? model : base;
  const known = Object.hasOwn(OLLAMA_PRICE_TABLE_USD_PER_MTOK, key) ? OLLAMA_PRICE_TABLE_USD_PER_MTOK[key] : undefined;
  if (!known) {
    throw new OllamaRefusedError(`no price for ollama model "${model}": add it to OLLAMA_PRICE_TABLE_USD_PER_MTOK or set ${OLLAMA_PRICE_ENV}; REAL runs never assume a zero price`);
  }
  return known;
}

function resolveOllamaMaxOutputTokens(env: ProviderEnv): number {
  const raw = env[OLLAMA_MAX_OUTPUT_TOKENS_ENV];
  if (raw === undefined || raw.trim() === "") return OLLAMA_DEFAULT_MAX_OUTPUT_TOKENS;
  const n = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(n) || n <= 0) {
    throw new OllamaRefusedError(`${OLLAMA_MAX_OUTPUT_TOKENS_ENV} must be a positive integer (got ${JSON.stringify(raw)})`);
  }
  return n;
}

/**
 * Validates everything an Ollama REAL run needs BEFORE any run starts (so nothing is written to the
 * spend ledger on a bad config): the VC_REAL_MODEL selection, OLLAMA_API_KEY and the model price.
 * Returns undefined when the default (Gemini) is selected; otherwise a factory that builds the
 * provider once the run's budget hook exists. Reads only the env object it is given.
 */
export function prepareOllamaProvider(
  env: ProviderEnv,
  options: { fetchImpl?: typeof fetch } = {},
): ((beforeRequest: (estimate: OllamaRequestEstimate) => void, afterResponse?: (usage: OllamaActualUsage) => void) => OllamaProvider) | undefined {
  const selection = parseRealModel(env);
  if (selection.backend !== "ollama") return undefined;
  const apiKey = env.OLLAMA_API_KEY?.trim();
  if (!apiKey) throw new OllamaRefusedError("OLLAMA_API_KEY is required when VC_REAL_MODEL selects an ollama model");
  const price = resolveOllamaPrice(selection.model, env);
  const baseUrl = env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;
  const maxOutputTokens = resolveOllamaMaxOutputTokens(env);
  return (beforeRequest, afterResponse) =>
    new OllamaProvider({
      model: selection.model,
      apiKey,
      price,
      baseUrl,
      maxOutputTokens,
      beforeRequest,
      ...(afterResponse ? { afterResponse } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateProviderDeps {
  /** Canned responses when `config.provider === "mock"`. */
  mockResponses?: Record<string, MockResponse>;
  /** P1 LK1, `provider: "ollama"` only. Charged on EVERY hop before its request is sent; a throw (a budget stop) stops the chain, it does not fail over. */
  beforeRequest?: (estimate: OllamaRequestEstimate) => void;
  /** P1 LK1, `provider: "ollama"` (per hop) and, S13 fix-b, `provider: "gemini"`. Usage: the actual token counts the call reported, or `actual: "unreported"`; called once per 2xx response, even when its content proves unusable. */
  onUsage?: (usage: OllamaActualUsage) => void;
  /** S13 fix-b, `provider: "gemini"` only: optional USD per million tokens (`loadGeminiPrice`). Without it a usage report carries tokens and no `usd`. */
  geminiPrice?: OllamaPrice;
  /** P1 LK1, `provider: "ollama"` only. Replaces the default engineering alert when the whole chain is exhausted. */
  onExhausted?: (info: FailoverExhaustedInfo) => void;
  /** P1 LK1, `provider: "ollama"` only. Injected in tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Picks the implementation from config (B6). */
export function createProvider(config: ProviderConfig, deps: CreateProviderDeps = {}): LlmProvider {
  const parsed = ProviderConfigSchema.parse(config);
  switch (parsed.provider) {
    case "mock":
      return new MockProvider({ model: parsed.model, responses: deps.mockResponses ?? {} });
    case "gemini":
      return new GeminiProvider({
        model: parsed.model,
        apiKey: parsed.apiKey,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        // S13 fix-b: Gemini text calls reach the same per-turn usage meter as the Ollama chain.
        ...(deps.onUsage ? { onUsage: deps.onUsage } : {}),
        ...(deps.geminiPrice ? { price: deps.geminiPrice } : {}),
      });
    case "litellm":
      // T-021 / D-020: only build the failover chain when the config actually carries one
      // (VC_LLM_MODELS). No `models` -> exactly the old single-attempt LiteLlmProvider, unchanged
      // (backward compatibility with the single-model config).
      if (parsed.models && parsed.models.length > 0) {
        // T-021 fix cycle 1 (ISS-t-021-rev-1): chain members get the shorter attempt timeout
        // (LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS unless VC_LLM_ATTEMPT_TIMEOUT_MS overrides it) —
        // never the standalone LITELLM_DEFAULT_TIMEOUT_MS, which alone could nearly exhaust the
        // whole wall-clock deadline on a single hung attempt.
        const attemptTimeoutMs = parsed.attemptTimeoutMs ?? LITELLM_DEFAULT_ATTEMPT_TIMEOUT_MS;
        return new FailoverProvider({
          chain: parsed.models.map((model) => new LiteLlmProvider({ model, baseUrl: parsed.baseUrl, apiKey: parsed.apiKey, timeoutMs: attemptTimeoutMs })),
          ...(parsed.maxAttempts !== undefined ? { maxAttempts: parsed.maxAttempts } : {}),
          ...(parsed.deadlineMs !== undefined ? { deadlineMs: parsed.deadlineMs } : {}),
        });
      }
      return new LiteLlmProvider({ model: parsed.model, baseUrl: parsed.baseUrl, apiKey: parsed.apiKey });
    case "rules":
      return new RulesProvider({ model: parsed.model });
    case "ollama": {
      // P1 LK1 (D-105): a single-pass chain over the configured hops with a product deadline. No backoff
      // between hops: the next hop is a different model, so waiting only adds student-visible latency.
      const hopTimeoutMs = parsed.hopTimeoutMs ?? TEXT_CHAIN_DEFAULT_HOP_TIMEOUT_MS;
      return new FailoverProvider({
        chain: parsed.chain.map(
          (hop) =>
            new OllamaProvider({
              model: hop.model,
              apiKey: parsed.apiKey,
              price: { inputUsdPerMTok: hop.inputUsdPerMTok, outputUsdPerMTok: hop.outputUsdPerMTok },
              timeoutMs: hopTimeoutMs,
              ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
              ...(parsed.maxOutputTokens !== undefined ? { maxOutputTokens: parsed.maxOutputTokens } : {}),
              ...(deps.beforeRequest ? { beforeRequest: deps.beforeRequest } : {}),
              ...(deps.onUsage ? { afterResponse: deps.onUsage } : {}),
              ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
            }),
        ),
        singlePass: true,
        deadlineMs: parsed.deadlineMs ?? TEXT_CHAIN_DEFAULT_DEADLINE_MS,
        baseDelayMs: 0,
        maxDelayMs: 0,
        ...(deps.onExhausted ? { onExhausted: deps.onExhausted } : {}),
      });
    }
  }
}

export function providersStatus(): string {
  return "@vc/providers: provider seam (mock, gemini, litellm, rules), model chosen by config (B6)";
}

// P1 U9: Live (voice) session seam: Mock + Gemini (compile-only) implementations, crisis interrupt
// hook, post-hoc output audit and the transcript sink for U8. Lives in its own module.
export * from "./live.js";
