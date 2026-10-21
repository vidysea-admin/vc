/**
 * Placeholder for the API/backend orchestrator surface (plan.md §5 "Backend"
 * row). No Fastify server, no LangGraph wiring yet — this package exists so
 * the workspace shape is real.
 *
 * T-014 / ISS-t-011-c3-rev-3: this file is nonetheless where releaseExpiredErasureFences
 * (packages/db src/erasure.ts) finally gets a real caller — it is the one place in this scaffold
 * that owns a live Mongo client for the eventual API process. `startApi` connects only through
 * connectFromEnv (this file never reaches the driver's own database-selection method directly —
 * packages/db/tests/db-scope.test.ts's B12 scanner would catch that) and starts the periodic fence
 * sweep ONLY when actually invoked, never on import (contract B8: importing this module performs
 * no I/O and starts no timer).
 */
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import {
  ERASURE_CONFIG_ENV,
  MIN_AUDIT_HMAC_KEY_LENGTH,
  anonymousCountersCollection,
  connectFromEnv,
  erasureConfigFromEnv,
  errorLabel,
  startErasureFenceSweep,
  tenantScopedDb,
  type MongoClientFactory,
  type ErasureFenceSweepOptions,
} from "@vc/db";
import { createModelLanguageDetector, createStudentFactExtractor, escalateTurns, initScribeCheckpointer, parseReplyLangs, loadConcernClassifierConfig, concernClassifierProviderConfig, CONCERN_CLASSIFIER_SKILL, loadSkill, type EscalationDeps, type SpeakersFile, type StudentGraphDeps, type StudentKbPort } from "@vc/engine";
import {
  createProvider,
  emitEngineeringAlert,
  emitFailoverAlert,
  GroundingConfigError,
  loadGroundedAnswerer,
  loadGroundingBudget,
  loadProviderConfig,
  loadTextChainConfig,
  type EngineeringAlert,
  type FailoverExhaustedInfo,
  type LiveProvider,
  type LlmProvider,
  type OllamaActualUsage,
  type OllamaRequestEstimate,
} from "@vc/providers";
import { createJwtVerifier, createStudentJwtVerifier, jwtConfigFromEnv, studentJwtConfigFromEnv, type JwtVerifier, type StudentJwtVerifier } from "./auth.js";
import { createApiHandler, createApiServer, createTenantWiring, type ApiLogLine } from "./server.js";
import {
  AnonymousConfigError,
  DEFAULT_GATES_DIR,
  anonymousEnabledFromEnv,
  anonymousSafetyScreenFromEnv,
  createAnonymousApi,
  createMongoAnonymousCounter,
  withAnonymousRoutes,
  type AnonymousApiDeps,
  type AnonymousCounterWriter,
} from "./anonymous.js";
import {
  ChatConfigError,
  assertChatGoLive,
  chatEnabledFromEnv,
  createChatApi,
  withChatRoutes,
  type ChatApiDeps,
} from "./chat.js";
import {
  VoiceConfigError,
  assertVoiceGoLive,
  createVoiceApi,
  voiceEnabledFromEnv,
  withVoiceRoutes,
  type VoiceApi,
  type VoiceApiDeps,
} from "./voice.js";

export * from "./auth.js";
export * from "./server.js";
export { OPENAPI_DOCUMENT, STUDENT_API_DRAFT } from "./openapi.js";
export * from "./go-live-gate.js";
export * from "./anonymous.js";
export * from "./chat.js";
export * from "./voice.js";

export function apiStatus(): string {
  return "@vc/api: HTTP API over the scribe, profile and erasure (T-025); opt-in via startApi({ http })";
}

/** The repo's skills/ directory (apps/api/src -> repo root). */
export const DEFAULT_SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));
export const DEFAULT_API_PORT = 8080;

// ---------------------------------------------------------------------------
// P1 LK7 (D-105): the monthly USD cap on the text chain (VC_TEXT_CHAIN).
// ---------------------------------------------------------------------------

/** The per-calendar-month (UTC) USD cap on what the text chain may spend. REQUIRED whenever VC_TEXT_CHAIN is set. */
export const CHAIN_MONTHLY_CAP_ENV = "VC_CHAIN_MONTHLY_CAP_USD";

/** A bad or missing cap while VC_TEXT_CHAIN is set: the chain is refused at startup (fail closed). Names the variable, never a value. */
export class ChainSpendCapError extends Error {
  constructor(reason: string) {
    super(`ChainSpendCapError: ${reason}`);
    this.name = "ChainSpendCapError";
  }
}

/**
 * Thrown from the chain's `beforeRequest` hook when a request would take the month past the cap. The Ollama provider lets a hook's throw
 * surface unchanged and `isRetryableProviderError` is false for it, so the failover chain neither retries it nor tries the next hop (the next
 * hop would cost the same). The student graph turns it into the existing degraded reply.
 */
export class ChainBudgetExhaustedError extends Error {
  constructor(
    readonly capUsd: number,
    readonly month: string,
  ) {
    super(`ChainBudgetExhaustedError: the text chain's monthly cap of USD ${capUsd} (${month}) has no room for this request`);
    this.name = "ChainBudgetExhaustedError";
  }
}

/**
 * Reads VC_CHAIN_MONTHLY_CAP_USD: a plain positive decimal ("50", "12.5"). Anything else (unset, empty, zero, negative, NaN, Infinity,
 * an exponent or hex form, a currency symbol, a number too large to be finite) throws. A missing cap is never "unlimited".
 */
export function parseChainMonthlyCap(env: Record<string, string | undefined>): number {
  const raw = env[CHAIN_MONTHLY_CAP_ENV]?.trim();
  if (raw === undefined || raw === "") {
    throw new ChainSpendCapError(`${CHAIN_MONTHLY_CAP_ENV} is required when VC_TEXT_CHAIN is set (a positive USD amount per calendar month)`);
  }
  const value = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) throw new ChainSpendCapError(`${CHAIN_MONTHLY_CAP_ENV} must be a positive USD amount such as 50 or 12.5`);
  return value;
}

/** Text-free chain accounting lines: a month, a cap and figures, never a student's words. */
export type ChainLogLine = { level: "error"; event: "chain_cap_exhausted"; capUsd: number; month: string; spentUsd: number; ts: string };

export interface ChainSpendSnapshot {
  /** UTC calendar month the figures belong to, "YYYY-MM". */
  month: string;
  capUsd: number;
  /** Reservations plus settled actuals this month. */
  spentUsd: number;
  /** Requests refused because the cap had no room (this process). */
  capRefusals: number;
  /** Times the whole chain was exhausted by failures, not by the cap (this process). */
  chainExhausted: number;
}

export interface ChainSpendGuard {
  /** `createProvider`'s `beforeRequest`: reserves the request's upper-bound cost, or throws ChainBudgetExhaustedError. Synchronous, so check-and-reserve is atomic. */
  beforeRequest(estimate: OllamaRequestEstimate): void;
  /** `createProvider`'s `onUsage`: settles a reported usage to the actual figure; an unreported one keeps its reservation. Never throws. */
  onUsage(usage: OllamaActualUsage): void;
  /** `createProvider`'s `onExhausted`: counts the exhaustion and keeps the default failover alert. */
  onExhausted(info: FailoverExhaustedInfo): void;
  spentUsd(): number;
  snapshot(): ChainSpendSnapshot;
}

export interface ChainSpendGuardOptions {
  capUsd: number;
  now?: () => Date;
  log?: (line: ChainLogLine) => void;
  /** P1 alerts (D-108 item 7): the engineering-alert sink. Default: the T-021 mechanism (`emitEngineeringAlert`: stderr line plus a Langfuse error span). */
  alert?: (alert: EngineeringAlert) => void;
}

/** The share of the monthly cap at which the one-time-per-month warning alert fires. */
export const CHAIN_CAP_WARN_FRACTION = 0.8;

const monthOf = (d: Date): string => d.toISOString().slice(0, 7);

function defaultChainLog(line: ChainLogLine): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(line));
}

/** H6: the notional cost one grounded Gemini call reserves against the chain's monthly cap (Google Search grounding is billed per grounded prompt, roughly USD 0.035). */
const GROUNDED_CALL_ESTIMATED_COST_USD = 0.035;
const GROUNDED_CALL_ESTIMATED_TOKENS = 1024;

/**
 * The cap, in this process. Spend is the upper-bound reservation of every request sent (a request that fails after it was sent keeps its
 * reservation: no hook says it was cheaper), settled DOWN to the provider-reported actual when a response reports its token counts, so a month of
 * ordinary replies is not counted at the 2048-token worst case. A request that would pass the cap is refused before it is sent. The month is the
 * UTC calendar month and the counter starts at zero in each. It is NOT persisted: a restart or a second replica starts from zero.
 */
export function createChainSpendGuard(options: ChainSpendGuardOptions): ChainSpendGuard {
  const { capUsd } = options;
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new ChainSpendCapError("the cap must be a positive, finite USD amount");
  const now = options.now ?? (() => new Date());
  const log = options.log ?? defaultChainLog;
  const sink = options.alert ?? emitEngineeringAlert;
  let month = monthOf(now());
  let spent = 0;
  let loggedFor: string | undefined;
  let warnedFor: string | undefined;
  let capRefusals = 0;
  let chainExhausted = 0;
  // The month each reservation was made in, keyed by the estimate object the provider hands back inside its usage.
  const reservedIn = new WeakMap<OllamaRequestEstimate, string>();
  const money = (usd: number): number => Math.round(usd * 1e6) / 1e6;
  // P1 alerts A2: figures only (month, cap, spend), never text. A failing sink must not turn a reservation or a refusal into a crash.
  const raise = (event: "alert_chain_cap_80pct" | "alert_chain_cap_exhausted"): void => {
    try {
      sink({ event, attributes: { month, capUsd, spentUsd: money(spent) } });
    } catch {
      // alerting must never fail a student turn
    }
  };
  const warnIfNear = (): void => {
    if (warnedFor !== month && spent >= capUsd * CHAIN_CAP_WARN_FRACTION - 1e-9) {
      warnedFor = month;
      raise("alert_chain_cap_80pct");
    }
  };
  const roll = (): void => {
    const current = monthOf(now());
    if (current !== month) {
      month = current;
      spent = 0;
    }
  };
  return {
    beforeRequest(estimate) {
      roll();
      const cost = estimate.estimatedCostUsd;
      // A non-finite or negative estimate is not a number a cap can reason about: refuse rather than under-count.
      if (!Number.isFinite(cost) || cost < 0 || spent + cost > capUsd) {
        capRefusals += 1;
        if (loggedFor !== month) {
          loggedFor = month;
          try {
            log({ level: "error", event: "chain_cap_exhausted", capUsd, month, spentUsd: spent, ts: new Date().toISOString() });
          } catch {
            // a failing logger must not turn a refusal into a crash
          }
          raise("alert_chain_cap_exhausted");
        }
        throw new ChainBudgetExhaustedError(capUsd, month);
      }
      spent += cost;
      reservedIn.set(estimate, month);
      warnIfNear();
    },
    onUsage(usage) {
      try {
        roll();
        if (usage.actual !== "reported" || usage.usd === undefined || !Number.isFinite(usage.usd) || usage.usd < 0) return;
        if (reservedIn.get(usage.estimate) !== month) return; // reserved in an earlier month: that month's figure is closed
        spent = Math.max(0, spent + (usage.usd - usage.estimate.estimatedCostUsd));
        warnIfNear();
      } catch {
        // the response is already paid for: accounting must never fail the turn
      }
    },
    onExhausted(info) {
      chainExhausted += 1;
      emitFailoverAlert(info);
    },
    spentUsd() {
      roll();
      return spent;
    },
    snapshot() {
      roll();
      return { month, capUsd, spentUsd: spent, capRefusals, chainExhausted };
    },
  };
}

/**
 * T-025: the HTTP server, OPT-IN. Without `http`, startApi only runs the fence sweep (as before),
 * so importing or starting this package never opens a port by accident.
 */
export interface StartApiHttpOptions {
  /** Default: VC_API_PORT, else DEFAULT_API_PORT. 0 picks a free port (tests). */
  port?: number;
  /** Default 127.0.0.1: a public bind is a deployment decision, made explicitly. */
  host?: string;
  /** Tests inject a verifier over locally generated keys; default: jwtConfigFromEnv(env). */
  verifier?: JwtVerifier;
  /** Tests inject a MockProvider; default: createProvider(loadProviderConfig(env)). The scribe and the concern classifier use this; the student chat and anonymous surfaces use it only when VC_TEXT_CHAIN is unset (P1 LK1w). */
  provider?: LlmProvider;
  skillsDir?: string;
  /** Trusted dependency factory, never populated from HTTP request bodies. */
  escalationForTenant?: (tenantId: string) => EscalationDeps;
  log?: (line: ApiLogLine) => void;
  writerDeadlineMs?: number;
  /**
   * P1 U7: the public anonymous text route. Whether it is served is decided ONLY by the explicit flag
   * VC_ANONYMOUS_ENABLED (default off) AND the A20 go-live gate; supplying this object never turns it on. The
   * production KB port is injected by the deployment (startApi does not depend on mcp/university-kb; the launcher, main.ts, builds it).
   */
  anonymous?: StartApiAnonymousOptions;
  /** P1 U8: the authenticated student chat routes (flag VC_CHAT_ENABLED plus the A20 gate). */
  chat?: StartApiChatOptions;
  /** P1 U10w: the voice WebSocket (flag VC_VOICE_ENABLED plus the A20 `voice` gate). */
  voice?: StartApiVoiceOptions;
  /** P1 LK7: the text chain's spend guard (only built when VC_TEXT_CHAIN is set). Tests inject a clock and a log; the cap itself is only ever VC_CHAIN_MONTHLY_CAP_USD. */
  chainSpend?: Pick<ChainSpendGuardOptions, "now" | "log" | "alert">;
}

/** P1 U10w: environment names for the voice WebSocket secrets, used when the option is not supplied. */
export const VOICE_WS_ENV = { secret: "VC_VOICE_WS_SECRET", baseUrl: "VC_VOICE_WS_BASE_URL" } as const;

/**
 * P1 U10w: the voice WebSocket. Whether it is served is decided ONLY by the explicit flag VC_VOICE_ENABLED (exactly "true"; default off) AND
 * the A20 `voice` go-live gate (which includes the passing A10 record) with request tracing off; supplying this object never turns it on, and
 * with the flag off none of it is read or built. The Live provider and the pre-rendered crisis message are injected by the deployment (G-REAL
 * is not granted: no real provider is created here). The database, the tenant-scoped Db factory and the escalation port come from startApi,
 * so a voice crisis escalates through the same path as chat.
 */
export interface StartApiVoiceOptions
  extends Omit<VoiceApiDeps, "verifier" | "dbForTenant" | "live" | "crisis" | "wsSecret" | "wsBaseUrl" | "escalateForTenant"> {
  /** The Live seam. Required when the flag is on. */
  live?: LiveProvider;
  /** The fixed crisis message with its pre-rendered 24 kHz PCM16 audio. Required when the flag is on. */
  crisis?: VoiceApiDeps["crisis"];
  /** HS256 key for the WebSocket token (at least 32 bytes). Default: VC_VOICE_WS_SECRET (its UTF-8 bytes). */
  wsSecret?: Uint8Array;
  /** `wss://host[/prefix]` the client is told to connect to. Default: VC_VOICE_WS_BASE_URL. */
  wsBaseUrl?: string;
  /** Default: studentJwtConfigFromEnv(env) (the same VC_STUDENT_JWT_* names as chat, never the counsellor key). */
  verifier?: StudentJwtVerifier;
  /** Default: the chat port when chat is enabled, else the engine's escalateTurns over the tenant's EscalationDeps (the same factory the scribe uses). */
  escalateForTenant?: VoiceApiDeps["escalateForTenant"];
  /** Default: the repo's qa/gates. */
  gatesDir?: string;
}

export interface StartApiAnonymousOptions {
  /** Search-only knowledge-base port. Required when the flag is on. */
  kb?: Pick<StudentKbPort, "searchKb">;
  /** Speakers file for the no-quote guard. Required when the flag is on. */
  speakers?: SpeakersFile;
  /** Default: the repo's qa/gates. */
  gatesDir?: string;
  /**
   * How clients are told apart for the 10-per-minute limit. REQUIRED when the flag is on (one of the two), because the safe default
   * depends on the deployment: `clientKey` extracts the real client from a trusted proxy's header; `trustSocketAddress: true` states the
   * server is reached directly, so the socket peer address (normalised) is the client. Behind a load balancer without `clientKey`
   * every user would share one bucket, so neither being set is a startup error.
   */
  trustSocketAddress?: boolean;
  /** Default: the Mongo `anonymous_counters` aggregate counter (text-free). */
  counter?: AnonymousCounterWriter;
  limiter?: AnonymousApiDeps["limiter"];
  clientKey?: AnonymousApiDeps["clientKey"];
  config?: AnonymousApiDeps["config"];
  now?: AnonymousApiDeps["now"];
  nowMs?: AnonymousApiDeps["nowMs"];
  log?: AnonymousApiDeps["log"];
}

/** P1 LK7: the overridable parts of the authenticated safety screen. */
export type StartApiSafetyScreenOptions = Omit<NonNullable<StudentGraphDeps["safetyScreen"]>, "provider" | "authenticated" | "anonymous"> & { provider?: LlmProvider };

/**
 * P1 U8: the authenticated student chat routes. Whether they are served is decided ONLY by the explicit flag VC_CHAT_ENABLED (default
 * off) AND the A20 go-live gate; supplying this object never turns them on. The production KB port and the Pathlynks profile port are
 * injected by the deployment (startApi depends on neither mcp/university-kb nor a Pathlynks client; the launcher, main.ts, builds the KB port).
 */
export interface StartApiChatOptions {
  /** Knowledge-base port. Required when the flag is on. */
  kb?: StudentKbPort;
  /**
   * P1 LK7 (D-105): the LK5 model safety screen on authenticated turns. ON by default: it runs on the concern classifier's provider (D-105 Q4: the
   * classifier moves to the chain only after its own eval), with the engine's defaults for timeout and threshold. `false` turns it off; an object
   * overrides the provider, `timeoutMs` or `blockAt`. A slow or down screen provider shows the fixed crisis message (D-105, fail closed).
   */
  safetyScreen?: false | StartApiSafetyScreenOptions;
  /** Speakers file for the no-quote guard. Required when the flag is on. */
  speakers?: SpeakersFile;
  /** Default: the repo's qa/gates. */
  gatesDir?: string;
  /** Tests inject a verifier over local keys; default: studentJwtConfigFromEnv(env) (its own VC_STUDENT_JWT_* names, never the counsellor key). */
  verifier?: StudentJwtVerifier;
  profile?: ChatApiDeps["profile"];
  extractFacts?: ChatApiDeps["extractFacts"];
  /** Default: the engine's escalateTurns over the tenant's EscalationDeps (the same factory the scribe uses). */
  escalateForTenant?: ChatApiDeps["escalateForTenant"];
  sandboxTenantId?: ChatApiDeps["sandboxTenantId"];
  limitsForTenant?: ChatApiDeps["limitsForTenant"];
  config?: ChatApiDeps["config"];
  now?: ChatApiDeps["now"];
  nowMs?: ChatApiDeps["nowMs"];
  log?: ChatApiDeps["log"];
  /** P1 alerts A1: the engineering-alert sink for the safety-screen outage alert (default: the T-021 mechanism). */
  alert?: ChatApiDeps["alert"];
}

export interface Api {
  /** P1 LK7: the text chain's monthly spend figures; present only when VC_TEXT_CHAIN is set. */
  chainSpend?: () => ChainSpendSnapshot;
  /** Closes voice (live sessions finalized, usage written), stops the HTTP server (when started) and the fence sweep, then closes the Mongo client. Await once. */
  stop: () => Promise<void>;
  /** The bound port, when `http` was requested. */
  port?: number;
}

export interface StartApiOptions extends ErasureFenceSweepOptions {
  /** Tests inject a fake (see @vc/db/testing createFakeMongoClient); omit for the real driver. */
  clientFactory?: MongoClientFactory;
  /** T-025: also serve the HTTP API. */
  http?: StartApiHttpOptions;
}

function resolvePort(env: Record<string, string | undefined>, requested: number | undefined): number {
  const raw = requested ?? (env.VC_API_PORT !== undefined && env.VC_API_PORT.trim() !== "" ? Number(env.VC_API_PORT) : DEFAULT_API_PORT);
  if (!Number.isInteger(raw) || raw < 0 || raw > 65535) throw new RangeError("startApi: VC_API_PORT must be a port number (0-65535)");
  return raw;
}

/**
 * T-015 / ISS-t-014-rev-2: startErasureFenceSweep's own `onError` default is a no-op BY DESIGN
 * (packages/db does not own a logger or a process's stdout/stderr). `startApi` is the process that
 * DOES, so a caller who does not inject their own `onError` still gets visibility instead of a
 * fence-release failure vanishing silently forever: one structured JSON line per failing tick,
 * naming the failure. A real deployment is expected to inject its own `onError` wired to its actual
 * logging/alerting pipeline (Langfuse/observability, structured log shipper, etc.) — this default
 * is the floor, not the intended production behaviour.
 *
 * ISS-t-015-c0-1: logs `errorLabel(err)` (name + code only, the same redaction erasure.ts's own
 * receipt lines use), never `err.message`. A realistic Mongo-shaped error (e.g. an E11000
 * duplicate-key line, which real servers embed document field values into) is not exploitable
 * TODAY through this path specifically (erasureFenceKey is a SHA-256 hash, not a raw studentId; no
 * $jsonSchema validators are configured), but the no-PII guarantee on this log line should not
 * depend on that staying true.
 */
function defaultSweepErrorLogger(err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: "error",
      event: "erasure_fence_sweep_failed",
      error: errorLabel(err),
      ts: new Date().toISOString(),
    }),
  );
}

/**
 * Connects to `virtual_counsellor` (B12) and starts the erasure-fence sweep (D-016,
 * ISS-t-011-c3-rev-3). `env` defaults to `process.env`; a test passes a fixture instead so nothing
 * here ever reads the real environment. `stop()` clears the sweep's interval and closes the client
 * — call it on shutdown (SIGTERM/SIGINT) once this scaffold grows an actual server loop.
 *
 * T-015 / ISS-t-014-rev-3: everything after `client.connect()` runs inside a try/catch. A connected
 * client is a resource this function owns until it hands back `stop()` — if starting the sweep
 * fails (e.g. startErasureFenceSweep's own intervalMs validation), the caller never receives a
 * `stop()` to close it with, so this function itself closes the client before rethrowing, instead
 * of leaking a live connection.
 *
 * ISS-t-015-c0-2: closing the client is itself fallible. Before, `await client.close(); throw err;`
 * silently discarded the ROOT cause (e.g. startErasureFenceSweep's RangeError) whenever close()
 * itself threw, and left it unclear whether the client was actually released. Now a close() failure
 * is caught and reported as an AggregateError carrying BOTH the original error (first) and the
 * close failure (second), so a caller can always see the real root cause, and never mistakes a
 * close-time symptom for it.
 */
export async function startApi(
  env: Record<string, string | undefined> = process.env,
  options: StartApiOptions = {},
): Promise<Api> {
  const { clientFactory, onError, http, ...sweepOptions } = options;
  // T-025: every configuration error (JWT, provider, port) surfaces BEFORE anything connects.
  const httpBase = http
    ? {
        port: resolvePort(env, http.port),
        host: http.host ?? "127.0.0.1",
        verifier: http.verifier ?? createJwtVerifier(jwtConfigFromEnv(env)),
        provider: http.provider ?? createProvider(loadProviderConfig(env)),
        skillsDir: http.skillsDir ?? DEFAULT_SKILLS_DIR,
      }
    : undefined;
  // P1 LK1w (D-105): `provider` stays the scribe's and the concern classifier's base (a task moves to the text chain only after its own eval, Q4).
  // `studentProvider` serves the student surfaces (chat turn, anonymous route): the VC_TEXT_CHAIN chain when set, else that same current provider.
  // A bad chain (no OLLAMA_API_KEY, unknown price) throws here, before anything connects.
  const textChain = httpBase ? loadTextChainConfig(env) : undefined;
  // P1 LK7: a chain spends real money, so it never starts without a valid monthly cap (fail closed, before anything connects). Every hop of the
  // chain is charged through this one guard; a refused request is the existing degraded reply, never a crash.
  const chainGuard = textChain ? createChainSpendGuard({ capUsd: parseChainMonthlyCap(env), ...(http?.chainSpend ?? {}) }) : undefined;
  const httpSetup = httpBase
    ? {
        ...httpBase,
        studentProvider: textChain
          ? createProvider(textChain, { beforeRequest: chainGuard!.beforeRequest, onUsage: chainGuard!.onUsage, onExhausted: chainGuard!.onExhausted })
          : httpBase.provider,
      }
    : undefined;
  const classifierConfig = httpSetup ? loadConcernClassifierConfig(env) : undefined;
  const classifierProvider = httpSetup && !http?.escalationForTenant
    ? (http?.provider ?? createProvider(concernClassifierProviderConfig(loadProviderConfig(env), classifierConfig!))) : undefined;
  const classifierPrompt = httpSetup ? loadSkill(httpSetup.skillsDir, CONCERN_CLASSIFIER_SKILL) : undefined;
  const escalationForTenant = httpSetup ? (http?.escalationForTenant ?? (() => ({
    recipients: async () => ({ adminIds: [], counsellorIds: [] }),
    classifier: { provider: classifierProvider!, skillPrompt: classifierPrompt!, config: classifierConfig! },
    writerDeadlineMs: http?.writerDeadlineMs,
  }))) : undefined;
  // P1 U7: the anonymous route. The flag, the config and the A20 go-live gate are all checked BEFORE anything connects; the
  // default counter writer is bound to the Db only after connect (it is not called before the first request).
  const anonymousFlag = httpSetup ? anonymousEnabledFromEnv(env) : false;
  // P1 LK7: the safety screen's provider is the concern classifier's (D-105 Q4: it moves to the chain only after its own eval). The anonymous screen
  // is OFF unless VC_ANONYMOUS_SAFETY_SCREEN is exactly "true" (open decision A15b / B24.6 vs D-105); a bad value is a startup error.
  const screenBaseProvider = httpSetup ? (classifierProvider ?? httpSetup.provider) : undefined;
  const anonymousScreen = anonymousFlag ? anonymousSafetyScreenFromEnv(env) : false;
  // p1-nosource-grounded G1: Gemini with Google Search grounding for a no-source question. VC_GROUNDING is off unless exactly "gemini"; "gemini" without
  // GEMINI_API_KEY, or any other value, is a startup error before anything connects. The key is read from the environment only (B11).
  const grounding = httpSetup ? loadGroundedAnswerer(env) : undefined;
  // p1-grounding-hardening H6: grounded calls are capped per caller (an anonymous client, a chat thread) and per UTC day (VC_GROUNDING_MAX_PER_SESSION, default
  // 5; VC_GROUNDING_MAX_PER_DAY, default 500). With a text chain each allowed call also reserves a notional per-call cost against the same monthly USD cap
  // (no refund: a conservative figure, since the grounded request has no usage report). Over any cap the turn falls back to the model-only guidance.
  // A malformed cap is a startup error even when grounding is off, so a typo is never silently the default.
  const groundingBudget = httpSetup
    ? loadGroundingBudget(env, {
        ...(chainGuard && grounding
          ? { spend: () => chainGuard.beforeRequest({ model: grounding.model, estimatedInputTokens: GROUNDED_CALL_ESTIMATED_TOKENS, maxOutputTokens: GROUNDED_CALL_ESTIMATED_TOKENS, estimatedCostUsd: GROUNDED_CALL_ESTIMATED_COST_USD }) }
          : {}),
      })
    : undefined;
  const counterRef: { writer?: AnonymousCounterWriter } = {};
  let anonymousHandler: ReturnType<typeof createAnonymousApi>;
  if (httpSetup && anonymousFlag) {
    const a = http?.anonymous;
    if (!a?.kb || !a.speakers) throw new AnonymousConfigError("VC_ANONYMOUS_ENABLED is true but no search-only knowledge-base port and speakers file were supplied");
    if (!a.clientKey && a.trustSocketAddress !== true) {
      throw new AnonymousConfigError("VC_ANONYMOUS_ENABLED is true but neither a clientKey nor trustSocketAddress: true was supplied; the per-client limit needs one of them");
    }
    anonymousHandler = createAnonymousApi(
      {
        kb: a.kb,
        provider: httpSetup.studentProvider,
        skillsDir: httpSetup.skillsDir,
        speakers: a.speakers,
        // G5: with VC_ANONYMOUS_SAFETY_SCREEN=true every cleared anonymous turn is screened; otherwise a turn that reaches the no-source reply (the only
        // one that sends the text to a model or the web) is screened first. The rules provider has no concern-classifier handling and makes no model call,
        // so there the no-source screen is left off rather than turning every such turn into the crisis message.
        ...(anonymousScreen
          ? { safetyScreen: { provider: screenBaseProvider! } }
          : screenBaseProvider && screenBaseProvider.kind !== "rules"
            ? { safetyScreen: { provider: screenBaseProvider, scope: "no_source" as const } }
            : {}),
        ...(grounding ? { grounding, ...(groundingBudget ? { groundingBudget } : {}) } : {}),
        counter:
          a.counter ??
          {
            increment: (kind) => {
              if (!counterRef.writer) throw new AnonymousConfigError("anonymous counter used before the database connected");
              return counterRef.writer.increment(kind);
            },
          },
        ...(a.limiter ? { limiter: a.limiter } : {}),
        ...(a.clientKey ? { clientKey: a.clientKey } : {}),
        ...(a.config ? { config: a.config } : {}),
        ...(a.now ? { now: a.now } : {}),
        ...(a.nowMs ? { nowMs: a.nowMs } : {}),
        ...(a.log ? { log: a.log } : {}),
      },
      { enabled: true, gatesDir: a.gatesDir ?? DEFAULT_GATES_DIR, env },
    );
  }
  // P1 U8: the chat flag, the A20 gate, the tracing check, the student JWT config and the required ports are all checked BEFORE anything connects.
  let chatSetup: { chat: StartApiChatOptions; verifier: StudentJwtVerifier; kb: StudentKbPort; speakers: SpeakersFile } | undefined;
  if (httpSetup && chatEnabledFromEnv(env)) {
    const c = http?.chat;
    assertChatGoLive({ gatesDir: c?.gatesDir ?? DEFAULT_GATES_DIR, env });
    const verifier = c?.verifier ?? createStudentJwtVerifier(studentJwtConfigFromEnv(env));
    if (!c?.kb || !c.speakers) throw new ChatConfigError("VC_CHAT_ENABLED is true but no knowledge-base port and speakers file were supplied");
    chatSetup = { chat: c, verifier, kb: c.kb, speakers: c.speakers };
  }
  // P1 U10w: the voice flag and the A20 `voice` gate (with tracing off) are checked BEFORE anything connects; a failure is a startup error (fail closed).
  let voiceSetup: { voice: StartApiVoiceOptions; live: LiveProvider; crisis: VoiceApiDeps["crisis"]; verifier: StudentJwtVerifier } | undefined;
  if (httpSetup && voiceEnabledFromEnv(env)) {
    const v = http?.voice;
    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env });
    if (!v?.live || !v.crisis) throw new VoiceConfigError("VC_VOICE_ENABLED is true but no Live provider and crisis message were supplied");
    voiceSetup = { voice: v, live: v.live, crisis: v.crisis, verifier: v.verifier ?? createStudentJwtVerifier(studentJwtConfigFromEnv(env)) };
  }
  // The escalation port chat and voice share (one flag, one escalation): an explicit chat port, else the engine's escalateTurns over the tenant's deps.
  const defaultEscalateForTenant: NonNullable<ChatApiDeps["escalateForTenant"]> = (tenantId, tenantDb) => (input) => escalateTurns(tenantDb, input, escalationForTenant!(tenantId));
  const sharedEscalateForTenant = chatSetup?.chat.escalateForTenant ?? defaultEscalateForTenant;
  // p1-lk6 (D-104): the default student fact extractor, for chat and voice alike. It reads the student's ORIGINAL words through the default text
  // provider (the student chain when VC_TEXT_CHAIN is set, D-105 Q4) and proposes English facts; an injected `extractFacts` option wins. It runs only on a turn whose text
  // is stored, and a failure never fails the turn (chat.ts and voice.ts catch it and log the event name only).
  const defaultExtractFacts = httpSetup ? createStudentFactExtractor({ provider: httpSetup.studentProvider, skillsDir: httpSetup.skillsDir }) : undefined;
  const chatExtractFacts = chatSetup?.chat.extractFacts ?? defaultExtractFacts;
  // P1 LK7 (D-105): the authenticated chat path gets the model language detector (only when the chain is set: it is the "cheap chain" detector; with no
  // chain the offline script test stays, and the base provider is never asked to classify languages) and the LK5 safety screen (ON by default; `false` opts
  // out). crisisGuard still runs first on the original text inside the graph. VC_REPLY_LANGS is read once here (dropped entries are logged by parseReplyLangs).
  const chatScreenOption = chatSetup?.chat.safetyScreen;
  // p1-grounding-hardening H2 (fail closed): grounding sends a redacted question to the web, so it never runs unscreened. The screen is on whenever grounding is on;
  // a configuration that would leave a grounded path without a classifier-capable screen is a startup error, before anything connects.
  if (grounding) {
    const unscreened: string[] = [];
    if (anonymousFlag && screenBaseProvider?.kind === "rules") unscreened.push("the anonymous route's screen provider is the rules provider (no concern-classifier handling)");
    if (chatSetup && chatScreenOption === false) unscreened.push("chat.safetyScreen is false");
    if (chatSetup && chatScreenOption !== false && (chatScreenOption?.provider ?? screenBaseProvider)?.kind === "rules") unscreened.push("the chat screen's provider is the rules provider (no concern-classifier handling)");
    if (unscreened.length > 0) {
      throw new GroundingConfigError(`VC_GROUNDING=gemini needs the safety screen on for every path that can reach it, but ${unscreened.join(" and ")}. Configure a model provider for the concern classifier or turn VC_GROUNDING off`);
    }
  }
  // p1-lk7 fix cycle 1 (fail closed, D-105): the screen holds every reply and a screen that errors shows the fixed crisis message. A provider that can never
  // serve `concern-classifier` (the rules provider) would therefore turn EVERY authenticated turn into the crisis message while startApi looked healthy.
  // Refuse to start instead (cheap check on the provider's kind: no network probe at startup). There is deliberately no env kill switch: that would be fail-open.
  if (chatSetup && chatScreenOption !== false) {
    const screenProvider = chatScreenOption?.provider ?? screenBaseProvider;
    if (screenProvider?.kind === "rules") {
      throw new ChatConfigError(
        "VC_CHAT_ENABLED is true and the safety screen is on, but the screen's provider is the rules provider, which has no concern-classifier handling: every student turn would show the crisis message. Configure a model provider for the concern classifier (VC_LLM_PROVIDER) or supply chat.safetyScreen.provider",
      );
    }
  }
  const chatGraph: ChatApiDeps["graph"] | undefined = chatSetup
    ? {
        ...(httpSetup && textChain ? { detectLanguage: createModelLanguageDetector(httpSetup.studentProvider) } : {}),
        replyLangs: parseReplyLangs(env.VC_REPLY_LANGS),
        ...(grounding ? { grounding } : {}),
        ...(chatScreenOption === false
          ? {}
          : { safetyScreen: { ...(chatScreenOption ?? {}), provider: chatScreenOption?.provider ?? screenBaseProvider!, authenticated: true, anonymous: false } }),
      }
    : undefined;
  const { client, db } = connectFromEnv(env, clientFactory);
  counterRef.writer = createMongoAnonymousCounter(anonymousCountersCollection(db), http?.anonymous?.now);
  // Built before connecting so every voice configuration error (secret length, base URL) is a startup error with nothing connected.
  let voice: VoiceApi | undefined;
  if (voiceSetup) {
    const { voice: v, live, crisis, verifier } = voiceSetup;
    const { gatesDir, live: _live, crisis: _crisis, wsSecret, wsBaseUrl, verifier: _verifier, escalateForTenant, ...passThrough } = v;
    const secretRaw = env[VOICE_WS_ENV.secret];
    voice = createVoiceApi(
      {
        ...passThrough,
        ...(passThrough.extractFacts === undefined && defaultExtractFacts ? { extractFacts: defaultExtractFacts } : {}),
        verifier,
        dbForTenant: (tenantId) => tenantScopedDb(db, tenantId),
        live,
        crisis,
        wsSecret: wsSecret ?? new TextEncoder().encode(secretRaw ?? ""),
        wsBaseUrl: wsBaseUrl ?? env[VOICE_WS_ENV.baseUrl] ?? "",
        escalateForTenant: escalateForTenant ?? sharedEscalateForTenant,
      },
      { enabled: true, gatesDir: gatesDir ?? DEFAULT_GATES_DIR, env },
    );
  }
  try {
    await client.connect();
  } catch (err) {
    await voice?.close().catch(() => undefined);
    throw err;
  }
  let server: ReturnType<typeof createApiServer> | undefined;
  let sweep: ReturnType<typeof startErasureFenceSweep> | undefined;
  try {
    // T-029: with a usable audit key the sweep also expires abandoned confirmations / approval
    // requests (purging nothing). Without one it only releases fences, as before.
    const envKey = env[ERASURE_CONFIG_ENV.auditHmacKey];
    const auditHmacKey = sweepOptions.auditHmacKey ?? (envKey !== undefined && envKey.length >= MIN_AUDIT_HMAC_KEY_LENGTH ? envKey : undefined);
    sweep = startErasureFenceSweep(db, {
      ...sweepOptions,
      ...(auditHmacKey !== undefined ? { auditHmacKey } : {}),
      onError: onError ?? defaultSweepErrorLogger,
    });
    let port: number | undefined;
    if (httpSetup) {
      // The checkpoint indexes (unscoped: index commands only; every checkpoint DOCUMENT goes
      // through a tenant-scoped saver, createTenantWiring).
      await initScribeCheckpointer(client);
      const wiring = createTenantWiring({ client, db, provider: httpSetup.provider, skillsDir: httpSetup.skillsDir, escalationForTenant });
      // T-034 (B21 "Events"): absent VC_WEBHOOK_DESTINATION_URL keeps the emission hook a no-op
      // (ApiDeps.webhooks undefined), same as a test that never configures it.
      const webhookDestinationUrl = env.VC_WEBHOOK_DESTINATION_URL;
      const handler = createApiHandler({
        verifier: httpSetup.verifier,
        dbForTenant: wiring.dbForTenant,
        graphForTenant: wiring.graphForTenant,
        ...(http?.log ? { log: http.log } : {}),
        ...(http?.writerDeadlineMs !== undefined ? { writerDeadlineMs: http.writerDeadlineMs } : {}),
        // T-029: read (and validated) per reconfirm call; a config error is a 503, never a fallback.
        erasureConfig: () => erasureConfigFromEnv(env),
        ...(webhookDestinationUrl
          ? {
              webhooks: {
                outboxForTenant: wiring.webhookOutboxForTenant,
                destinationUrl: webhookDestinationUrl,
                // T-042 (ISS-085): always wired alongside the outbox itself -- there is no
                // separate env toggle for the recoverable gap ledger; whenever webhooks are
                // configured at all, both leaks this unit fixes become recoverable, not just logged.
                gapsForTenant: wiring.gapsForTenant,
              },
            }
          : {}),
      });
      const chatHandler = chatSetup
        ? createChatApi(
            {
              verifier: chatSetup.verifier,
              dbForTenant: wiring.dbForTenant,
              kb: chatSetup.kb,
              provider: httpSetup.studentProvider,
              skillsDir: httpSetup.skillsDir,
              speakers: chatSetup.speakers,
              escalateForTenant: sharedEscalateForTenant,
              ...(chatSetup.chat.profile ? { profile: chatSetup.chat.profile } : {}),
              ...(chatExtractFacts ? { extractFacts: chatExtractFacts } : {}),
              ...(chatGraph ? { graph: chatGraph } : {}),
              ...(chatGraph?.grounding && groundingBudget ? { groundingBudget } : {}),
              ...(chatSetup.chat.sandboxTenantId !== undefined ? { sandboxTenantId: chatSetup.chat.sandboxTenantId } : {}),
              ...(chatSetup.chat.limitsForTenant ? { limitsForTenant: chatSetup.chat.limitsForTenant } : {}),
              ...(chatSetup.chat.config ? { config: chatSetup.chat.config } : {}),
              ...(chatSetup.chat.now ? { now: chatSetup.chat.now } : {}),
              ...(chatSetup.chat.nowMs ? { nowMs: chatSetup.chat.nowMs } : {}),
              ...(chatSetup.chat.log ? { log: chatSetup.chat.log } : {}),
              ...(chatSetup.chat.alert ? { alert: chatSetup.chat.alert } : {}),
            },
            { enabled: true, gatesDir: chatSetup.chat.gatesDir ?? DEFAULT_GATES_DIR, env },
          )
        : undefined;
      const s = createApiServer(withVoiceRoutes(withChatRoutes(withAnonymousRoutes(handler, anonymousHandler), chatHandler), voice?.handler), {
        ...(voice ? { onUpgrade: voice.upgrade } : {}),
      });
      server = s;
      await new Promise<void>((resolve, reject) => {
        s.once("error", reject);
        s.listen(httpSetup.port, httpSetup.host, () => {
          s.off("error", reject);
          resolve();
        });
      });
      port = (s.address() as AddressInfo).port;
    }
    const liveSweep = sweep;
    const liveServer = server;
    return {
      ...(port !== undefined ? { port } : {}),
      ...(chainGuard ? { chainSpend: () => chainGuard.snapshot() } : {}),
      stop: async () => {
        // Voice first: it finalizes every live session (usage written, provider sessions closed) and drains within its own timeout, which
        // also lets the HTTP server close (an upgraded socket would otherwise keep it open) and keeps the database open until it is done.
        await voice?.close();
        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));
        liveSweep.stop();
        await client.close();
      },
    };
  } catch (err) {
    sweep?.stop();
    await voice?.close().catch(() => undefined);
    if (server?.listening) server.close();
    try {
      await client.close();
    } catch (closeErr) {
      throw new AggregateError(
        [err, closeErr],
        "startApi: failed to start the erasure fence sweep, and closing the Mongo client afterwards also failed",
      );
    }
    throw err;
  }
}
