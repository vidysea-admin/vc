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
import { connectFromEnv, startErasureFenceSweep, type MongoClientFactory, type ErasureFenceSweepOptions } from "@vc/db";

export function apiStatus(): string {
  return "@vc/api: not yet implemented (scaffold only, see T-002)";
}

export interface Api {
  /** Stops the fence sweep and closes the Mongo client. Idempotent-safe to await once. */
  stop: () => Promise<void>;
}

export interface StartApiOptions extends ErasureFenceSweepOptions {
  /** Tests inject a fake (see @vc/db/testing createFakeMongoClient); omit for the real driver. */
  clientFactory?: MongoClientFactory;
}

/**
 * Connects to `virtual_counsellor` (B12) and starts the erasure-fence sweep (D-016,
 * ISS-t-011-c3-rev-3). `env` defaults to `process.env`; a test passes a fixture instead so nothing
 * here ever reads the real environment. `stop()` clears the sweep's interval and closes the client
 * — call it on shutdown (SIGTERM/SIGINT) once this scaffold grows an actual server loop.
 */
export async function startApi(
  env: Record<string, string | undefined> = process.env,
  options: StartApiOptions = {},
): Promise<Api> {
  const { clientFactory, ...sweepOptions } = options;
  const { client, db } = connectFromEnv(env, clientFactory);
  await client.connect();
  const sweep = startErasureFenceSweep(db, sweepOptions);
  return {
    stop: async () => {
      sweep.stop();
      await client.close();
    },
  };
}
