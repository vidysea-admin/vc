/**
 * T-008: the one ApprovalRuntime per server process (kept on globalThis so every Next route module
 * shares it, including across dev hot reloads).
 *
 * - demo (the default): the in-process fake db + mock provider + synthetic paused threads
 *   (demo/seed.ts). Never touches MONGODB_URL (B8).
 * - live: ONLY when VC_WEB_MODE is exactly "live". The Db comes from @vc/db connectFromEnv, which
 *   names `virtual_counsellor` through the one B12 helper; the checkpointer is initScribeCheckpointer.
 *   Not exercised by any test or by the demo (tests never connect, B8/B12).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { connectFromEnv } from "@vc/db";
import { compileScribeGraph, initScribeCheckpointer, inspectScribe, resumeScribe, scribeThreadId, startScribe } from "@vc/engine";
import { createProvider, loadProviderConfig } from "@vc/providers";
import type { ApprovalRuntime } from "./approval-service";
import type { SessionRuntime } from "./session-service";

export type RuntimeMode = "demo" | "live";

export function resolveMode(env: Record<string, string | undefined>): RuntimeMode {
  return env.VC_WEB_MODE === "live" ? "live" : "demo";
}

export interface WebRuntime extends ApprovalRuntime, SessionRuntime {
  mode: RuntimeMode;
  /** Demo only: the seeded thread ids, for the index page. */
  threads?: Record<string, string>;
  /** Demo only: a read-back of the fake db for one student (browser evidence, B14). */
  readback?: (studentId: string) => unknown;
}

const KEY = Symbol.for("vc.web.runtime");
type Holder = { [KEY]?: Promise<WebRuntime> };

async function createLiveRuntime(env: Record<string, string | undefined>): Promise<WebRuntime> {
  const skillsDir = env.VC_SKILLS_DIR ?? join(process.cwd(), "..", "..", "skills");
  if (!existsSync(skillsDir)) throw new Error("live runtime: skills/ directory not found (set VC_SKILLS_DIR)");
  const { client, db } = connectFromEnv(env);
  const checkpointer = await initScribeCheckpointer(client);
  // T-021 / D-020: createProvider(loadProviderConfig(env)) already returns the FailoverProvider
  // chain automatically when VC_LLM_MODELS is set (packages/providers) -- no separate wiring
  // needed here for the runtime-failover behavior itself.
  const provider = createProvider(loadProviderConfig(env));
  const graph = compileScribeGraph({ db, provider, skillsDir }, { checkpointer });
  return {
    mode: "live",
    graph,
    engine: { inspectScribe, resumeScribe },
    startSession: (input) => startScribe(graph, input, { threadId: scribeThreadId(input.sessionId) }),
  };
}

async function createRuntime(): Promise<WebRuntime> {
  if (resolveMode(process.env) === "live") return createLiveRuntime(process.env);
  const { createDemoRuntime } = await import("../../demo/seed");
  return createDemoRuntime();
}

export function getRuntime(): Promise<WebRuntime> {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    holder[KEY] = createRuntime().catch((err: unknown) => {
      delete holder[KEY]; // a failed start is retried by the next request, never cached
      throw err;
    });
  }
  return holder[KEY];
}

/** Tests inject a runtime (a fresh demo runtime per test). */
export function setRuntimeForTests(runtime: WebRuntime): void {
  (globalThis as Holder)[KEY] = Promise.resolve(runtime);
}
