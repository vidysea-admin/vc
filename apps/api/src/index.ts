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
  createAdminStore,
  erasureConfigFromEnv,
  errorLabel,
  listStudentFlags,
  openReadOnlyDb,
  READ_ONLY_DB_ALLOW_LIST,
  startErasureFenceSweep,
  tenantScopedDb,
  type MongoClientFactory,
  type ErasureFenceSweepOptions,
} from "@vc/db";
import { createModelLanguageDetector, createStudentFactExtractor, escalateTurns, initScribeCheckpointer, parseReplyLangs, loadConcernClassifierConfig, concernClassifierProviderConfig, CONCERN_CLASSIFIER_SKILL, loadSkill, navigateSteps, runStudentTurn, PATHLYNKS_UNAVAILABLE_TEXT, type EscalationDeps, type KnowledgeAsker, type SpeakersFile, type StudentGraphDeps, type StudentKbPort } from "@vc/engine";
import {
  createProvider,
  emitEngineeringAlert,
  emitFailoverAlert,
  GroundingConfigError,
  loadGeminiPrice,
  loadGroundedAnswerer,
  loadGroundingBudget,
  loadProviderConfig,
  loadTextChainConfig,
  withRoleModels,
  type CreateProviderDeps,
  type EngineeringAlert,
  type FailoverExhaustedInfo,
  type LiveProvider,
  type LlmProvider,
  type OllamaActualUsage,
  type OllamaRequestEstimate,
} from "@vc/providers";
import { createJwtVerifier, createStudentJwtVerifier, jwtConfigFromEnv, refuseTenantClaims, studentJwtConfigFromEnv, type JwtVerifier, type StudentJwtVerifier } from "./auth.js";
import { createApiHandler, createApiServer, createTenantWiring, type ApiLogLine } from "./server.js";
import { loadSourcesFile, mongoSourceForTenant, postgresSourceForTenant, type SourcesFile, type ProfileFact } from "@vc/schemas";
import type { QuestDbLike } from "@vc/mcp-pathlynks";
import { adminJwtSecretFromEnv } from "./admin-auth.js";
import {
  createGithubPort,
  createLivePathlynksPort,
  createLiveVidyseaPort,
  createNavCatalogueLoader,
  createPostgresTestPort,
  createUsageSink,
  seedSourcesFromConfig,
  usdInrFromEnv,
  withAdminRoutes,
  type AdminPostgresPort,
  type AdminRoutesDeps,
} from "./admin-routes.js";
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
  PartnerConfigError,
  PARTNER_KEY_REQUIRED_ENV,
  PARTNER_OWN_TENANTS_ENV,
  PARTNER_PEPPER_ENV,
  RESERVED_TENANT_IDS_ENV,
  createMongoPartnerStore,
  createPartnerRegistry,
  resolveMemoryPolicy,
  NO_MEMORY_POLICY,
  partnerKeyRequiredFromEnv,
  partnerOwnTenantsFromEnv,
  partnerPepperFromEnv,
  foldId,
  reservedTenantIdsFromEnv,
  reservedTenantIdsWarning,
  withPartnerRoutes,
  type PartnerStore,
} from "./partners.js";
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
  type VoiceTools,
} from "./voice.js";

/**
 * wire-fix-1 (D-134, contract B12, qa/gates/mongo-host.md): the Career Quest opener for one site, or undefined (quest tools stay unwired, generic asks fall back to the KB).
 * It exists only when config/sources.json holds exactly one enabled "mongo" source for the verified site AND its database is on the read-only allow-list in @vc/db
 * (today only `pathlynks_journey`). The handle it opens exposes find / aggregate / countDocuments only, each forced to readPreference secondaryPreferred, limited to the
 * source collection list; the port adds the owner filter. Nothing connects here (opening a handle is local; the shared client connects once in startApi).
 */
export function questDbOpenerFor(client: ReturnType<typeof connectFromEnv>["client"], sources: SourcesFile | undefined, siteId: string): (() => Promise<QuestDbLike>) | undefined {
  const source = sources ? mongoSourceForTenant(sources, siteId) : undefined;
  if (!source || (source.platform ?? "pathlynks") !== "pathlynks" || !READ_ONLY_DB_ALLOW_LIST.includes(source.database)) return undefined;
  const { database, collections } = source;
  return async () => openReadOnlyDb(client, database, collections);
}

/** Shared authenticated graph filters; identity comes only from the voice session, never tool arguments. */
export function createQuestVoiceTools(tenantId: string | ((verifiedTenant: string) => StudentGraphDeps | undefined), graph: StudentGraphDeps, existing?: VoiceTools): VoiceTools {
  const prompts: Record<string, string> = {
    vidysea_profile: "show my Vidysea profile", vidysea_shortlisted_programmes: "show my shortlisted programmes",
    vidysea_profile_assessment: "show my Vidysea profile assessment",
    pathlynks_profile: "show my Pathlynks profile", pathlynks_saved_careers: "show my saved careers",
    pathlynks_compare: "what is in my compare list", pathlynks_assessment: "what is my assessment status",
    pathlynks_career_fit: "which careers suit me and why", pathlynks_report: "summarise my combined report",
    vidysea_pathlynks_snapshot: "which careers suit me and why",
    // wire-fix-1 (D-134): the tracking tools and the Career Quest tools. Each phrase is one the student classifier routes to exactly that tool
    // (classify.ts OWN_PROGRESS_RULES), so voice runs the same graph node, the same owner binding and the same allow-listed columns as chat.
    vidysea_journey_maps: "show my journey maps", vidysea_applications: "show my applications", vidysea_visa: "show my visa applications",
    vidysea_favourites: "show my favourites", vidysea_saved_scholarships: "show my saved scholarships", vidysea_progress: "what is my progress",
    pathlynks_quest_progress: "show my career quest", pathlynks_goals: "show my goals", pathlynks_year_plan: "show my year plan",
  };
  const owned = new Set([...Object.keys(prompts), "navigate_steps"]);
  const unavailable = () => ({ result: { message: PATHLYNKS_UNAVAILABLE_TEXT } });
  return {
    declarations: [
      ...(existing?.declarations.filter((d) => !owned.has(d.name)) ?? []),
      ...Object.keys(prompts).map((name) => ({ name, description: "Read the signed-in student own configured platform data. Never accepts an identity.", parameters: { type: "object", properties: {}, additionalProperties: false } })),
      { name: "navigate_steps", description: "Verified host task steps for a navigation intent.", parameters: { type: "object", required: ["intent"], properties: { intent: { type: "string", minLength: 1, maxLength: 500 } }, additionalProperties: false } },
    ],
    async run(call, who) {
      if (!owned.has(call.name)) return existing ? existing.run(call, who) : unavailable();
      const selected = typeof tenantId === "function" ? tenantId(who.tenantId) : who.tenantId === tenantId ? graph : undefined;
      if (!selected || !call.args || typeof call.args !== "object" || Array.isArray(call.args)) return unavailable();
      const keys = Object.keys(call.args);
      if (call.name === "navigate_steps" ? (keys.length !== 1 || keys[0] !== "intent" || typeof call.args.intent !== "string" || !call.args.intent.trim() || call.args.intent.length > 500) : keys.length !== 0) return unavailable();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = async () => {
          if (call.name === "navigate_steps") return { result: navigateSteps(await selected.navCatalogue?.(), call.args.intent as string) };
          const out = await runStudentTurn(selected, { mode: "authenticated", auth: { role: "student", tenantId: who.tenantId, studentId: who.studentId }, threadId: who.threadId, turnId: "voice-tool", text: prompts[call.name] });
          return { result: { message: out.response.message } };
        };
        return await Promise.race([work(), new Promise<ReturnType<typeof unavailable>>((resolve) => { timer = setTimeout(() => resolve(unavailable()), 5000); })]);
      } catch { return unavailable(); }
      finally { if (timer) clearTimeout(timer); }
    },
  };
}

export * from "./auth.js";
export * from "./admin-auth.js";
export * from "./admin-routes.js";
export * from "./server.js";
export { OPENAPI_DOCUMENT, PARTNER_OPENAPI, STUDENT_API_DRAFT } from "./openapi.js";
export * from "./partners.js";
export * from "./go-live-gate.js";
export * from "./anonymous.js";
export * from "./chat.js";
export * from "./voice.js";

export function apiStatus(): string {
  return "@vc/api: HTTP API over the scribe, live cards, profile and erasure (T-025, T-010); opt-in via startApi({ http })";
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
  /**
   * T-010: the KnowledgeBase `/ask` client for evidence cards (@vc/mcp-university-kb `KnowledgeBaseClient` fits as-is). Omitted:
   * live cards still run, knowledge is "not_configured" and no `kb` source can resolve, so no evidence card is shown uncited (B2).
   * NOTE (go-live gap): the launcher (main.ts) does not supply this yet; only a caller of startApi can.
   */
  kb?: KnowledgeAsker;
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
  /**
   * pc-partner-keys (D-111): per-partner API keys. The registry exists only when VC_PARTNER_KEY_PEPPER is set (>= 32 characters); VC_PARTNER_KEY_REQUIRED=true
   * needs it and refuses to start without. 'store' is for tests (default: the 'partners' collection of the virtual_counsellor Db); 'nowMs' drives the 60 s cache.
   */
  partners?: { store?: PartnerStore; nowMs?: () => number; log?: PartnerNoteSink };
}

/** pc-hardening-4 P2: a partner-config note (names a variable, never a value or an id). Default sink: one JSON line on stderr. */
export type PartnerNoteSink = (line: { level: "warn"; event: string; message: string; ts: string }) => void;

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
  memoryPolicyForTenant?: ChatApiDeps["memoryPolicyForTenant"];
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

/**
 * vc-admin-control: the admin console and the Pathlynks wiring. Everything defaults to the real thing (GitHub over fetch, the Postgres port over
 * `@vc/mcp-pathlynks`, config/sources.json); tests inject fakes. The console is served only when VC_ADMIN_JWT_SECRET is set.
 */
export interface StartApiAdminOptions {
  github?: AdminRoutesDeps["github"];
  postgres?: AdminPostgresPort;
  /** A parsed sources file, or a path; default: the repo's config/sources.json (missing file = nothing seeded). */
  sources?: SourcesFile | string;
  /** Replaces the live Pathlynks port (tests). */
  pathlynks?: ChatApiDeps["pathlynks"];
  /** Native synthetic seam; production resolves the exact configured tenant source. */
  vidysea?: StudentGraphDeps["vidysea"];
  nowMs?: () => number;
  log?: (line: Record<string, unknown>) => void;
}

export const DEFAULT_SOURCES_FILE = fileURLToPath(new URL("../../../config/sources.json", import.meta.url));

export interface StartApiOptions extends ErasureFenceSweepOptions {
  /** vc-admin-control: the admin console, usage rows and the Pathlynks port. */
  admin?: StartApiAdminOptions;
  /** Tests inject a fake (see @vc/db/testing createFakeMongoClient); omit for the real driver. */
  clientFactory?: MongoClientFactory;
  /** T-025: also serve the HTTP API. */
  http?: StartApiHttpOptions;
}

/**
 * The default partner store handed to the registry before the Db exists: every call goes to the store bound after connect. (Extracted in place from startApi so a test can
 * reach it; pc-hardening-2 fix cycle 1 R2 is the `update` line below.)
 */
export function deferredPartnerStore(ref: { store?: PartnerStore }): PartnerStore {
  return {
    get: (id) => partnerStoreOf(ref).get(id),
    list: () => partnerStoreOf(ref).list(),
    insert: (doc) => partnerStoreOf(ref).insert(doc),
    update: (id, patch, expect) => partnerStoreOf(ref).update(id, patch, expect),
  };
}

/** The partner store once the Db is connected; a request before that is a registry outage (fail closed), never a guess. */
function partnerStoreOf(ref: { store?: PartnerStore }): PartnerStore {
  if (!ref.store) throw new Error("partner store used before the database connected");
  return ref.store;
}

function resolvePort(env: Record<string, string | undefined>, requested: number | undefined): number {
  const raw = requested ?? (env.VC_API_PORT !== undefined && env.VC_API_PORT.trim() !== "" ? Number(env.VC_API_PORT) : DEFAULT_API_PORT);
  if (!Number.isInteger(raw) || raw < 0 || raw > 65535) throw new RangeError("startApi: VC_API_PORT must be a port number (0-65535)");
  return raw;
}

/** pc-reserved-ids-2: one structured JSON line on stderr for a partner-config warning or note (names the variable, never a value). */
function logPartnerNote(event: string, message: string, sink?: PartnerNoteSink): void {
  const line = { level: "warn" as const, event, message, ts: new Date().toISOString() };
  if (sink) {
    sink(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(line));
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
  const usageRef: { sink?: ReturnType<typeof createUsageSink> } = {};
  // S13 fix-b: Gemini (text and grounded) reports usageMetadata through onUsage; it reaches the per-turn meter (and so the student and tenant caps) exactly as the
  // Ollama chain's usage does. A malformed GEMINI_PRICE_USD_PER_MTOK is a startup error here; unset, tokens are metered and no dollar figure is invented.
  const geminiPrice = http ? loadGeminiPrice(env) : undefined;
  const geminiMeter: CreateProviderDeps = { onUsage: (u) => usageRef.sink?.addUsage(u), ...(geminiPrice ? { geminiPrice } : {}) };
  // Metering is only added for a Gemini deployment: any other provider is built exactly as before.
  const meterDeps: CreateProviderDeps = env.VC_LLM_PROVIDER === "gemini" ? geminiMeter : {};
  // T-025: every configuration error (JWT, provider, port) surfaces BEFORE anything connects.
  const httpBase = http
    ? {
        port: resolvePort(env, http.port),
        host: http.host ?? "127.0.0.1",
        verifier: http.verifier ?? createJwtVerifier(jwtConfigFromEnv(env)),
        // S13 fix-b: VC_MODEL_SUMMARY puts the scribe's session summary on its own model; unset, this is the plain provider.
        provider: withRoleModels(env, http.provider ?? createProvider(loadProviderConfig(env), meterDeps), ["summary"], meterDeps),
        skillsDir: http.skillsDir ?? DEFAULT_SKILLS_DIR,
      }
    : undefined;
  // P1 LK1w (D-105): `provider` stays the scribe's and the concern classifier's base (a task moves to the text chain only after its own eval, Q4).
  // `studentProvider` serves the student surfaces (chat turn, anonymous route): the VC_TEXT_CHAIN chain when set, else that same current provider.
  // A bad chain (no OLLAMA_API_KEY, unknown price) throws here, before anything connects.
  // T-057: VC_LLM_PROVIDER=gemini is an explicit choice of ONE model vendor for every student-facing role (answer, safety screen, fact extraction, language
  // detection). A VC_TEXT_CHAIN left in the environment is then not read at all, so no role can silently fall back to Ollama (the chain needs OLLAMA_API_KEY
  // and a spend cap too, neither of which a gemini deployment is asked for). One text-free note says so. Any other VC_LLM_PROVIDER: unchanged.
  const geminiOnly = httpBase !== undefined && env.VC_LLM_PROVIDER === "gemini";
  if (geminiOnly && (env.VC_TEXT_CHAIN ?? "").trim() !== "") console.error(JSON.stringify({ level: "warn", event: "text_chain_ignored", reason: "VC_LLM_PROVIDER=gemini", ts: new Date().toISOString() }));
  const textChain = httpBase && !geminiOnly ? loadTextChainConfig(env) : undefined;
  // P1 LK7: a chain spends real money, so it never starts without a valid monthly cap (fail closed, before anything connects). Every hop of the
  // chain is charged through this one guard; a refused request is the existing degraded reply, never a crash.
  const chainGuard = textChain ? createChainSpendGuard({ capUsd: parseChainMonthlyCap(env), ...(http?.chainSpend ?? {}) }) : undefined;
  const httpSetup = httpBase
    ? {
        ...httpBase,
        // S13 fix-b: VC_MODEL_ANSWER / VC_MODEL_ROUTER move the answer skills / the language, rewrite and follow-up skills of the STUDENT surfaces onto their own
        // models. Unset keys return the same provider object, so nothing changes; the safety screen and the fact extractor keep the base model.
        studentProvider: withRoleModels(env, textChain
          ? createProvider(textChain, {
              beforeRequest: chainGuard!.beforeRequest,
              // vc-admin-control VA17: the same usage report also feeds the per-turn meter (a no-op outside a metered turn or before the sink exists).
              onUsage: (u) => {
                chainGuard!.onUsage(u);
                usageRef.sink?.addUsage(u);
              },
              onExhausted: chainGuard!.onExhausted,
            })
          : httpBase.provider, ["answer", "router"], meterDeps),
      }
    : undefined;
  // pc-partner-keys: the pepper and the required flag are checked BEFORE anything connects. The store is bound to the Db only after connect (the registry reads
  // it on the first keyed request, never before).
  const partnerPepper = httpSetup ? partnerPepperFromEnv(env) : undefined;
  const partnerKeyRequired = httpSetup ? partnerKeyRequiredFromEnv(env) : false;
  if (partnerKeyRequired && partnerPepper === undefined) throw new PartnerConfigError(`${PARTNER_KEY_REQUIRED_ENV} is true but ${PARTNER_PEPPER_ENV} is not set`);
  // vc-admin-control: every configuration error (JWT secret length, USD/INR rate, master key shape, sources file) surfaces BEFORE anything connects.
  const adminJwtSecret = httpSetup ? adminJwtSecretFromEnv(env) : undefined;
  const adminUsdInr = httpSetup ? usdInrFromEnv(env) : undefined;
  const adminMasterKey = env.VC_ADMIN_MASTER_KEY !== undefined && env.VC_ADMIN_MASTER_KEY !== "" ? env.VC_ADMIN_MASTER_KEY : undefined;
  let sourcesFile: SourcesFile | undefined;
  if (httpSetup) {
    const s = options.admin?.sources;
    if (typeof s === "object") sourcesFile = s;
    else {
      const path = s ?? DEFAULT_SOURCES_FILE;
      const exists = (process.getBuiltinModule("node:fs") as typeof import("node:fs")).existsSync(path);
      if (exists) sourcesFile = loadSourcesFile(path); // a bad file (a secret-looking value, an unknown key) is a startup error naming the path of the field
    }
  }
  const pathlynksSiteId = sourcesFile?.siteId;
  const partnerStoreRef: { store?: PartnerStore } = {};
  const partnerStore: PartnerStore = http?.partners?.store ?? deferredPartnerStore(partnerStoreRef);
  // pc-reserved-ids (R2): the tenant ids a partner key may never carry as its partner id = the operator's VC_RESERVED_TENANT_IDS (a bad list throws here, before anything
  // connects) plus the sandbox tenant id. The registry checks them on every request, so a partner record made earlier is refused too.
  // S3: both lists matter only when partners are enabled (pepper set). With the pepper unset they are not parsed, so a malformed one cannot stop a server that has no partners;
  // one note says so (the value is never echoed). S1: with partners on and the list empty, one warning names the variable and the consequence; the server still starts.
  let partnerReservedIds: string[] = [];
  let partnerOwnTenants: string[] = [];
  if (partnerPepper !== undefined) {
    partnerReservedIds = reservedTenantIdsFromEnv(env);
    partnerOwnTenants = partnerOwnTenantsFromEnv(env);
    if (partnerReservedIds.length === 0) logPartnerNote("reserved_tenant_ids_empty", reservedTenantIdsWarning(), http?.partners?.log);
    const sandbox = http?.chat?.sandboxTenantId;
    if (sandbox !== undefined) {
      // the sandbox tenant can never be exempted, like the built-in names
      if (partnerOwnTenants.some((o) => foldId(o.trim()) === foldId(sandbox.trim()))) throw new PartnerConfigError(`${PARTNER_OWN_TENANTS_ENV} cannot bind the configured sandbox tenant`);
      partnerReservedIds.push(sandbox);
    }
  } else if (httpSetup) {
    if ([RESERVED_TENANT_IDS_ENV, PARTNER_OWN_TENANTS_ENV].some((name) => (env[name] ?? "").trim() !== "")) {
      logPartnerNote("reserved_tenant_ids_ignored", `${RESERVED_TENANT_IDS_ENV} and ${PARTNER_OWN_TENANTS_ENV} are ignored: ${PARTNER_PEPPER_ENV} is not set, so partner keys are off`, http?.partners?.log);
    }
    // pc-hardening-4 P2 (ISS-pc-hardening-3-4): the student-JWT and counsellor-JWT partner-tenant guards (guardStudentVerifier / guardCounsellorVerifier below) exist only with a partner registry, so with the pepper unset they are off. Say so
    // once, loudly enough for an operator, without ids or secrets; behaviour is unchanged (no connection is opened here, startup is not blocked).
    logPartnerNote("partner_tenant_guard_off", `${PARTNER_PEPPER_ENV} is not set: partner keys are off, so the student-JWT and counsellor-JWT partner-tenant guards are not installed`, http?.partners?.log);
  }
  const partnerRegistry =
    partnerPepper !== undefined
      ? createPartnerRegistry({ store: partnerStore, pepper: partnerPepper, reservedIds: partnerReservedIds, ownTenants: partnerOwnTenants, ...(http?.partners?.nowMs ? { nowMs: http.partners.nowMs } : {}) })
      : undefined;
  const classifierConfig = httpSetup ? loadConcernClassifierConfig(env) : undefined;
  // T-057: the classifier tier name defaults to "flash-lite" (a gateway class name); the Gemini API has no such model id. With gemini, an unset VC_CONCERN_MODEL
  // means the deployment's own VC_LLM_MODEL; an explicit VC_CONCERN_MODEL still wins.
  const classifierModel = (base: ReturnType<typeof loadProviderConfig>): Pick<NonNullable<typeof classifierConfig>, "model"> =>
    base.provider === "gemini" && (env.VC_CONCERN_MODEL ?? "").trim() === "" ? { model: base.model } : classifierConfig!;
  const classifierProvider = httpSetup && !http?.escalationForTenant
    ? (http?.provider ?? createProvider(concernClassifierProviderConfig(loadProviderConfig(env), classifierModel(loadProviderConfig(env))), meterDeps)) : undefined;
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
  // S13 fix-b: a grounded call's usageMetadata reaches the same per-turn meter (the notional chain reservation below stays as it was).
  const grounding = httpSetup ? loadGroundedAnswerer(env, { onUsage: geminiMeter.onUsage!, ...(geminiPrice ? { price: geminiPrice } : {}) }) : undefined;
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
        ...(partnerRegistry ? { partners: partnerRegistry } : {}),
        ...(partnerKeyRequired ? { partnerKeyRequired } : {}),
      },
      { enabled: true, gatesDir: a.gatesDir ?? DEFAULT_GATES_DIR, env },
    );
  }
  // pc-hardening-3 K1 (ISS-pc-reserved-ids-6): with partners on, every student JWT verifier (chat, profile, voice sessions; injected or default) also refuses a token whose tenant
  // claim equals an existing partner id (auth.ts refuseTenantClaims), read from the partner store the registry already holds (no new connection). Partners off: unchanged.
  const guardStudentVerifier = (v: StudentJwtVerifier): StudentJwtVerifier => (partnerRegistry ? refuseTenantClaims(v, (tenantId) => partnerRegistry.isPartnerTenantClaim(tenantId)) : v);
  // w1-counsellor-tenant-guard (ISS-pc-hardening-3-3, gate counsellor-jwt-partner-tenant answered (a)): the counsellor/admin/approver verifier (default or injected) gets the same guard, the same
  // fold and the same registry check, so a counsellor JWT whose tenant claim folds to a partner id gets the uniform 401 on every counsellor route. Partners off: unchanged (the note above says so).
  const guardCounsellorVerifier = (v: JwtVerifier): JwtVerifier => (partnerRegistry ? refuseTenantClaims(v, (tenantId) => partnerRegistry.isPartnerTenantClaim(tenantId)) : v);
  // P1 U8: the chat flag, the A20 gate, the tracing check, the student JWT config and the required ports are all checked BEFORE anything connects.
  let chatSetup: { chat: StartApiChatOptions; verifier: StudentJwtVerifier; kb: StudentKbPort; speakers: SpeakersFile } | undefined;
  if (httpSetup && chatEnabledFromEnv(env)) {
    const c = http?.chat;
    assertChatGoLive({ gatesDir: c?.gatesDir ?? DEFAULT_GATES_DIR, env });
    const verifier = guardStudentVerifier(c?.verifier ?? createStudentJwtVerifier(studentJwtConfigFromEnv(env)));
    if (!c?.kb || !c.speakers) throw new ChatConfigError("VC_CHAT_ENABLED is true but no knowledge-base port and speakers file were supplied");
    chatSetup = { chat: c, verifier, kb: c.kb, speakers: c.speakers };
  }
  // P1 U10w: the voice flag and the A20 `voice` gate (with tracing off) are checked BEFORE anything connects; a failure is a startup error (fail closed).
  let voiceSetup: { voice: StartApiVoiceOptions; live: LiveProvider; crisis: VoiceApiDeps["crisis"]; verifier: StudentJwtVerifier } | undefined;
  if (httpSetup && voiceEnabledFromEnv(env)) {
    const v = http?.voice;
    assertVoiceGoLive({ gatesDir: v?.gatesDir ?? DEFAULT_GATES_DIR, env });
    if (!v?.live || !v.crisis) throw new VoiceConfigError("VC_VOICE_ENABLED is true but no Live provider and crisis message were supplied");
    voiceSetup = { voice: v, live: v.live, crisis: v.crisis, verifier: guardStudentVerifier(v.verifier ?? createStudentJwtVerifier(studentJwtConfigFromEnv(env))) };
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
  partnerStoreRef.store = createMongoPartnerStore(db);
  // vc-admin-control: the store is built before connecting (a bad master key throws here, nothing connected). Console off + no master key = no store.
  const adminStore = httpSetup && (adminJwtSecret !== undefined || adminMasterKey !== undefined) ? createAdminStore(db, adminMasterKey ? { masterKey: adminMasterKey } : {}) : undefined;
  const adminLog = options.admin?.log ?? ((line: Record<string, unknown>) => console.error(JSON.stringify({ ...line, ts: new Date().toISOString() })));
  // VA17: usage rows need the HMAC key derived from the master key; without it none are written (the console says nothing about students it cannot key).
  const usageSink = adminStore && adminMasterKey ? createUsageSink(adminStore, adminMasterKey) : undefined;
  if (usageSink) usageRef.sink = usageSink;
  // One exact source per verified tenant; bootstrap is never another tenant's fallback.
  type PlatformRuntime = Pick<StudentGraphDeps, "pathlynks" | "vidysea" | "navCatalogue" | "pathlynksTimeoutMs">;
  const platformRuntimes = new Map<string, PlatformRuntime>();
  const pathlynksTimeoutMs = env.VC_PATHLYNKS_TIMEOUT_MS !== undefined && /^[0-9]+$/.test(env.VC_PATHLYNKS_TIMEOUT_MS) ? Number(env.VC_PATHLYNKS_TIMEOUT_MS) : undefined;
  if ((chatSetup || voiceSetup) && adminStore && sourcesFile) {
    const sites = new Set(sourcesFile.sources.filter(s=>s.kind === "postgres").map(s=>s.siteId ?? sourcesFile.siteId));
    if (options.admin?.pathlynks) sites.add(sourcesFile.siteId);
    for (const siteId of sites) {
      const source = postgresSourceForTenant(sourcesFile,siteId);
      const legacyInjected = !source && siteId === sourcesFile.siteId && options.admin?.pathlynks && !sourcesFile.sources.some(s=>s.kind==="postgres" && (s.siteId??sourcesFile!.siteId)===siteId);
      if (!source && !legacyInjected) continue;
      const platform = source?.platform ?? "pathlynks";
      const navCatalogue = createNavCatalogueLoader(adminStore,siteId) as NonNullable<StudentGraphDeps["navCatalogue"]>;
      const shared = {navCatalogue,...(pathlynksTimeoutMs !== undefined ? {pathlynksTimeoutMs} : {})};
      if (platform === "vidysea") platformRuntimes.set(siteId,{...shared,vidysea:options.admin?.vidysea ?? createLiveVidyseaPort(adminStore,{env,seeded:sourcesFile.sources,siteId})});
      else {
        // wire-fix-1: the same read-only Career Quest opener serves chat and voice (one port per site); absent = the quest tools are not wired for this site.
        const questDb = questDbOpenerFor(client, sourcesFile, siteId);
        platformRuntimes.set(siteId,{...shared,pathlynks:options.admin?.pathlynks ?? createLivePathlynksPort(adminStore,{env,seeded:sourcesFile.sources,siteId,...(source?{sourceId:source.id}:{}),...(questDb?{questDb}:{}),onEvent:e=>adminLog({level:e.type === "privileged_role_override" ? "warn" : "error",event:"pathlynks_"+e.type})})});
      }
    }
  }
  const platformForTenant = (tenantId: string) => platformRuntimes.get(tenantId);
  // T-057 r3: a site with an enabled GitHub source but no enabled postgres source (Vidysea while vidysea-db is disabled, D-123) still gets the stored navigation
  // catalogue, which needs no database credential. This map feeds ONLY the chat wiring below; liveProfile.facts and the voice tools keep `platformForTenant`.
  const navOnly = new Map<string, PlatformRuntime>();
  if ((chatSetup || voiceSetup) && adminStore && sourcesFile) {
    for (const s of sourcesFile.sources) {
      const siteId = s.siteId ?? sourcesFile.siteId;
      if (s.kind === "github" && s.enabled !== false && !platformRuntimes.has(siteId) && !navOnly.has(siteId)) navOnly.set(siteId,{navCatalogue:createNavCatalogueLoader(adminStore,siteId) as NonNullable<StudentGraphDeps["navCatalogue"]>});
    }
  }
  if ([...platformRuntimes.values()].some(p=>p.pathlynks) && env.PATHLYNKS_ALLOW_PRIVILEGED_ROLE === "1") adminLog({level:"warn",event:"pathlynks_privileged_role_override",message:"PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1: connect-time privilege refusal skipped; SELECT-only read-only transactions remain"});
  if ([...platformRuntimes.values()].some(p=>p.vidysea) && env.VIDYSEA_ALLOW_PRIVILEGED_ROLE === "1") adminLog({level:"warn",event:"vidysea_privileged_role_override",message:"VIDYSEA_ALLOW_PRIVILEGED_ROLE=1 (D-123): connect-time privilege refusal skipped; SELECT-only read-only transactions remain"});
  const liveProfile: ChatApiDeps["profile"] = platformRuntimes.size ? {
    async facts(who) {
      const runtime = platformForTenant(who.tenantId);
      if (!runtime) return [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const read = runtime.vidysea ? runtime.vidysea.getStudentProfile(who.studentId).then(result=>({status:result.ok && Array.isArray(result.rows)?"ok":"unavailable",data:result.rows?.[0]??null})) : runtime.pathlynks!.getStudentProfile(who.studentId);
        const result = await Promise.race([read,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("profile unavailable")),Math.min(Math.max(pathlynksTimeoutMs??5000,1),5000));})]);
        if(result.status!=="ok")throw new Error("profile unavailable");
        if(!result.data)return [];
        const facts:ProfileFact[]=[];
        const source = runtime.vidysea ? "vidysea" as const : "pathlynks" as const;
        const fields = runtime.vidysea ? {name:"name",academic_level:"academic_level",field_of_interest:"interest",target_intake:"target_intake",budget_range_text:"budget",preferred_countries:"target_country"} : {name:"name",grade:"grade"};
        for(const [field,key] of Object.entries(fields)) {
          const raw = result.data[field];
          const value = field === "preferred_countries" && Array.isArray(raw) ? raw.filter((v):v is string=>typeof v === "string").slice(0,20).join(", ") : raw;
          if((typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)))facts.push({key,value:String(value).slice(0,1000),source});
        }
        return facts;
      }finally{if(timer)clearTimeout(timer);}
    },
  } : undefined;
  // Built before connecting so every voice configuration error (secret length, base URL) is a startup error with nothing connected.
  let voice: VoiceApi | undefined;
  if (voiceSetup) {
    const { voice: v, live, crisis, verifier } = voiceSetup;
    const { gatesDir, live: _live, crisis: _crisis, wsSecret, wsBaseUrl, verifier: _verifier, escalateForTenant, ...passThrough } = v;
    const secretRaw = env[VOICE_WS_ENV.secret];
    // pc-voice V2 (D-111): partner keys reach voice. With a registry (VC_PARTNER_KEY_PEPPER) the student session route also takes a partner server key, and the
    // anonymous voice routes (page key) are served when the deployment has said how visitors are told apart, exactly as the anonymous text route requires: a
    // clientKey (here or on `anonymous`) or trustSocketAddress. Their crisis counter is the same text-free aggregate counter.
    const anonymousVoiceClientKey = passThrough.anonymous?.clientKey ?? http?.anonymous?.clientKey;
    const anonymousVoice: VoiceApiDeps["anonymous"] | undefined =
      partnerRegistry && (anonymousVoiceClientKey !== undefined || http?.anonymous?.trustSocketAddress === true)
        ? {
            ...passThrough.anonymous,
            ...(anonymousVoiceClientKey ? { clientKey: anonymousVoiceClientKey } : {}),
            counter:
              passThrough.anonymous?.counter ??
              http?.anonymous?.counter ?? {
                increment: (kind) => {
                  if (!counterRef.writer) throw new AnonymousConfigError("anonymous counter used before the database connected");
                  return counterRef.writer.increment(kind);
                },
              },
          }
        : undefined;
    voice = createVoiceApi(
      {
        ...passThrough,
        ...(liveProfile ? {
          profileFacts: passThrough.profileFacts ?? ((who) => liveProfile.facts(who)),
          profileNames: passThrough.profileNames ?? (async (who) => (await liveProfile.facts(who)).filter(f => f.key === "name").map(f => f.value)),
        } : {}),
        memoryPolicyForTenant: passThrough.memoryPolicyForTenant ?? (async (tenantId) => {
          const store = http?.partners?.store ?? partnerStoreRef.store;
          return store ? resolveMemoryPolicy(store, tenantId) : NO_MEMORY_POLICY;
        }),
        ...(platformRuntimes.size && chatSetup && httpSetup ? { tools: createQuestVoiceTools((tenantId)=>{
          const platform = platformForTenant(tenantId);
          return platform ? {kb:chatSetup.kb,provider:httpSetup.studentProvider,skillsDir:httpSetup.skillsDir,speakers:chatSetup.speakers,...platform,
            hasPriorFlag:async(who)=>(await listStudentFlags(tenantScopedDb(db,who.tenantId),{studentId:who.studentId,threadId:who.threadId})).length>0} : undefined;
        }, {kb:chatSetup.kb,provider:httpSetup.studentProvider,skillsDir:httpSetup.skillsDir,speakers:chatSetup.speakers,hasPriorFlag:async()=>false},passThrough.tools) } : {}),
        ...(partnerRegistry ? { partners: partnerRegistry } : {}),
        ...(anonymousVoice ? { anonymous: anonymousVoice } : { anonymous: undefined }),
        ...(passThrough.extractFacts === undefined && defaultExtractFacts ? { extractFacts: defaultExtractFacts } : {}),
        ...(usageSink && passThrough.usage === undefined ? { usage: usageSink } : {}),
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
        verifier: guardCounsellorVerifier(httpSetup.verifier),
        dbForTenant: wiring.dbForTenant,
        graphForTenant: wiring.graphForTenant,
        // T-010: live cards are counsellor-facing, so they use the counsellor/scribe provider (httpSetup.provider), NOT the student chain.
        cards: { provider: httpSetup.provider, skillsDir: httpSetup.skillsDir, ...(http?.kb ? { kb: http.kb } : {}) },
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
              ...(partnerRegistry ? { partners: partnerRegistry } : {}),
              dbForTenant: wiring.dbForTenant,
              kb: chatSetup.kb,
              provider: httpSetup.studentProvider,
              memoryPolicyForTenant: chatSetup.chat.memoryPolicyForTenant ?? (async (tenantId) => {
                const store = http?.partners?.store ?? partnerStoreRef.store;
                return store ? resolveMemoryPolicy(store, tenantId) : NO_MEMORY_POLICY;
              }),
              skillsDir: httpSetup.skillsDir,
              speakers: chatSetup.speakers,
              escalateForTenant: sharedEscalateForTenant,
              ...((chatSetup.chat.profile ?? liveProfile) ? { profile: chatSetup.chat.profile ?? liveProfile } : {}),
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
              ...(usageSink ? { usage: usageSink } : {}),
              platformForTenant: (tenantId: string) => platformForTenant(tenantId) ?? navOnly.get(tenantId),
              ...(pathlynksTimeoutMs !== undefined ? { pathlynksTimeoutMs } : {}),
            },
            { enabled: true, gatesDir: chatSetup.chat.gatesDir ?? DEFAULT_GATES_DIR, env },
          )
        : undefined;
      const publicHandler = withPartnerRoutes(withVoiceRoutes(withChatRoutes(withAnonymousRoutes(handler, anonymousHandler), chatHandler), voice?.handler), partnerRegistry);
      // vc-admin-control: /admin/api/* is answered here, before every other wrapper; with no VC_ADMIN_JWT_SECRET nothing is mounted.
      const mountedHandler =
        adminStore && adminJwtSecret
          ? withAdminRoutes(publicHandler, {
              store: adminStore,
              db,
              partnerStore,
              ...(partnerPepper !== undefined ? { partnerCtx: { pepper: partnerPepper, reservedIds: partnerReservedIds, ownTenants: partnerOwnTenants } } : {}),
              jwtSecret: adminJwtSecret,
              ...(adminUsdInr !== undefined ? { usdInrRate: adminUsdInr } : {}),
              ...(options.admin?.nowMs ? { nowMs: options.admin.nowMs } : {}),
              github: options.admin?.github ?? ((token) => createGithubPort(token)),
              postgres: options.admin?.postgres ?? createPostgresTestPort({ env }),
              env,
              // fix2 F1: env credentials are released only to the exact connections seeded from config/sources.json.
              ...(sourcesFile ? { seededSources: sourcesFile.sources } : {}),
              ...(pathlynksSiteId ? { defaultSiteId: pathlynksSiteId } : {}),
              log: adminLog,
            })
          : publicHandler;
      if (adminStore && sourcesFile) {
        // Seed config/sources.json once per start; a source that already exists (with its stored secret and last sync) is left exactly as it is.
        try {
          const r = await seedSourcesFromConfig(adminStore, sourcesFile);
          adminLog({ level: "info", event: "admin_sources_seeded", created: r.created, existing: r.existing });
        } catch (err) {
          adminLog({ level: "error", event: "admin_sources_seed_failed", error: errorLabel(err) });
        }
      }
      const s = createApiServer(mountedHandler, {
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
