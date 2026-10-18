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
  type MongoClientFactory,
  type ErasureFenceSweepOptions,
} from "@vc/db";
import { escalateTurns, initScribeCheckpointer, loadConcernClassifierConfig, concernClassifierProviderConfig, CONCERN_CLASSIFIER_SKILL, loadSkill, type EscalationDeps, type SpeakersFile, type StudentKbPort } from "@vc/engine";
import { createProvider, loadProviderConfig, type LlmProvider } from "@vc/providers";
import { createJwtVerifier, createStudentJwtVerifier, jwtConfigFromEnv, studentJwtConfigFromEnv, type JwtVerifier, type StudentJwtVerifier } from "./auth.js";
import { createApiHandler, createApiServer, createTenantWiring, type ApiLogLine } from "./server.js";
import {
  AnonymousConfigError,
  DEFAULT_GATES_DIR,
  anonymousEnabledFromEnv,
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

export * from "./auth.js";
export * from "./server.js";
export { OPENAPI_DOCUMENT, STUDENT_API_DRAFT } from "./openapi.js";
export * from "./go-live-gate.js";
export * from "./anonymous.js";
export * from "./chat.js";

export function apiStatus(): string {
  return "@vc/api: HTTP API over the scribe, profile and erasure (T-025); opt-in via startApi({ http })";
}

/** The repo's skills/ directory (apps/api/src -> repo root). */
export const DEFAULT_SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));
export const DEFAULT_API_PORT = 8080;

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
  /** Tests inject a MockProvider; default: createProvider(loadProviderConfig(env)). */
  provider?: LlmProvider;
  skillsDir?: string;
  /** Trusted dependency factory, never populated from HTTP request bodies. */
  escalationForTenant?: (tenantId: string) => EscalationDeps;
  log?: (line: ApiLogLine) => void;
  writerDeadlineMs?: number;
  /**
   * P1 U7: the public anonymous text route. Whether it is served is decided ONLY by the explicit flag
   * VC_ANONYMOUS_ENABLED (default off) AND the A20 go-live gate; supplying this object never turns it on. The
   * production KB port is injected by the deployment (apps/api does not depend on mcp/university-kb).
   */
  anonymous?: StartApiAnonymousOptions;
  /** P1 U8: the authenticated student chat routes (flag VC_CHAT_ENABLED plus the A20 gate). */
  chat?: StartApiChatOptions;
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

/**
 * P1 U8: the authenticated student chat routes. Whether they are served is decided ONLY by the explicit flag VC_CHAT_ENABLED (default
 * off) AND the A20 go-live gate; supplying this object never turns them on. The production KB port and the Pathlynks profile port are
 * injected by the deployment (apps/api depends on neither mcp/university-kb nor a Pathlynks client).
 */
export interface StartApiChatOptions {
  /** Knowledge-base port. Required when the flag is on. */
  kb?: StudentKbPort;
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
}

export interface Api {
  /** Stops the HTTP server (when started), the fence sweep, and closes the Mongo client. Await once. */
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
  const httpSetup = http
    ? {
        port: resolvePort(env, http.port),
        host: http.host ?? "127.0.0.1",
        verifier: http.verifier ?? createJwtVerifier(jwtConfigFromEnv(env)),
        provider: http.provider ?? createProvider(loadProviderConfig(env)),
        skillsDir: http.skillsDir ?? DEFAULT_SKILLS_DIR,
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
        provider: httpSetup.provider,
        skillsDir: httpSetup.skillsDir,
        speakers: a.speakers,
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
  const { client, db } = connectFromEnv(env, clientFactory);
  counterRef.writer = createMongoAnonymousCounter(anonymousCountersCollection(db), http?.anonymous?.now);
  await client.connect();
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
              provider: httpSetup.provider,
              skillsDir: httpSetup.skillsDir,
              speakers: chatSetup.speakers,
              escalateForTenant: chatSetup.chat.escalateForTenant ?? ((tenantId, tenantDb) => (input) => escalateTurns(tenantDb, input, escalationForTenant!(tenantId))),
              ...(chatSetup.chat.profile ? { profile: chatSetup.chat.profile } : {}),
              ...(chatSetup.chat.extractFacts ? { extractFacts: chatSetup.chat.extractFacts } : {}),
              ...(chatSetup.chat.sandboxTenantId !== undefined ? { sandboxTenantId: chatSetup.chat.sandboxTenantId } : {}),
              ...(chatSetup.chat.limitsForTenant ? { limitsForTenant: chatSetup.chat.limitsForTenant } : {}),
              ...(chatSetup.chat.config ? { config: chatSetup.chat.config } : {}),
              ...(chatSetup.chat.now ? { now: chatSetup.chat.now } : {}),
              ...(chatSetup.chat.nowMs ? { nowMs: chatSetup.chat.nowMs } : {}),
              ...(chatSetup.chat.log ? { log: chatSetup.chat.log } : {}),
            },
            { enabled: true, gatesDir: chatSetup.chat.gatesDir ?? DEFAULT_GATES_DIR, env },
          )
        : undefined;
      const s = createApiServer(withChatRoutes(withAnonymousRoutes(handler, anonymousHandler), chatHandler));
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
      stop: async () => {
        if (liveServer) await new Promise<void>((resolve) => liveServer.close(() => resolve()));
        liveSweep.stop();
        await client.close();
      },
    };
  } catch (err) {
    sweep?.stop();
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
