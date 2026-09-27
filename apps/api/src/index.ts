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
import { connectFromEnv, errorLabel, startErasureFenceSweep, type MongoClientFactory, type ErasureFenceSweepOptions } from "@vc/db";
import { initScribeCheckpointer } from "@vc/engine";
import { createProvider, loadProviderConfig, type LlmProvider } from "@vc/providers";
import { createJwtVerifier, jwtConfigFromEnv, type JwtVerifier } from "./auth.js";
import { createApiHandler, createApiServer, createTenantWiring, type ApiLogLine } from "./server.js";

export * from "./auth.js";
export * from "./server.js";
export { OPENAPI_DOCUMENT } from "./openapi.js";

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
  log?: (line: ApiLogLine) => void;
  writerDeadlineMs?: number;
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
  const { client, db } = connectFromEnv(env, clientFactory);
  await client.connect();
  let server: ReturnType<typeof createApiServer> | undefined;
  let sweep: ReturnType<typeof startErasureFenceSweep> | undefined;
  try {
    sweep = startErasureFenceSweep(db, { ...sweepOptions, onError: onError ?? defaultSweepErrorLogger });
    let port: number | undefined;
    if (httpSetup) {
      // The checkpoint indexes (unscoped: index commands only; every checkpoint DOCUMENT goes
      // through a tenant-scoped saver, createTenantWiring).
      await initScribeCheckpointer(client);
      const wiring = createTenantWiring({ client, db, provider: httpSetup.provider, skillsDir: httpSetup.skillsDir });
      const handler = createApiHandler({
        verifier: httpSetup.verifier,
        ...wiring,
        ...(http?.log ? { log: http.log } : {}),
        ...(http?.writerDeadlineMs !== undefined ? { writerDeadlineMs: http.writerDeadlineMs } : {}),
      });
      const s = createApiServer(handler);
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
