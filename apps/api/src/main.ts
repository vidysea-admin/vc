/**
 * The production launcher (golive-launcher; gate qa/gates/golive-launch.md Q1): the process entrypoint that turns the
 * environment into one `startApi` call. `pnpm -C apps/api start` runs it (systemd unit: infra/ubuntu/vc-api.service).
 *
 * It owns only wiring, no behaviour:
 *   - the knowledge-base ports come from mcp/university-kb (`createStudentKbPort` over the real KB client): an ANONYMOUS
 *     port from the search-only key VC_KB_ANON_API_KEY, a CHAT port from VC_KB_API_KEY (`/ask` + sessions);
 *   - the speakers file comes from VC_SPEAKERS_FILE (JSON, SpeakersFileSchema), else an empty list (nothing is quotable
 *     by name until the KnowledgeBase team supplies one, gate Q5);
 *   - the per-client rate-limit key is the `X-Real-IP` header nginx sets from `$remote_addr` (gate Q3). `X-Forwarded-For`
 *     is never read: a client can put anything in its left entries. The server binds 127.0.0.1, so only nginx can reach it.
 *   - a surface whose flag is on but whose configuration is missing REFUSES to start, naming the missing variable.
 *
 * `buildLauncherConfig` is pure (no network, no listening socket); `launch` is the only function that starts anything.
 * Importing this module does nothing: it runs only when it is the process entrypoint.
 */
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SpeakersFileSchema, type SpeakersFile } from "@vc/engine";
import {
  createAnonymousKbClient,
  createKnowledgeBaseClient,
  createStudentKbPort,
} from "@vc/mcp-university-kb";
import { anonymousEnabledFromEnv, normalizeClientAddress } from "./anonymous.js";
import { STUDENT_JWT_ENV, studentJwtConfigFromEnv } from "./auth.js";
import { chatEnabledFromEnv } from "./chat.js";
import { startApi, type Api, type StartApiOptions } from "./index.js";
import type { ApiRequest } from "./server.js";

type Env = Record<string, string | undefined>;
type HttpOptions = NonNullable<StartApiOptions["http"]>;

/** A launch refusal: names the missing or bad variable, never its value. */
export class LauncherConfigError extends Error {
  constructor(message: string) {
    super(`LauncherConfigError: ${message}`);
    this.name = "LauncherConfigError";
  }
}

/** The header nginx sets (`proxy_set_header X-Real-IP $remote_addr`). */
export const CLIENT_KEY_HEADER = "x-real-ip";

/**
 * The anonymous limiter's client key: the single `X-Real-IP` header value when it is a well-formed IP address, else
 * `undefined` (one shared bucket: stricter, never looser). `X-Forwarded-For` is deliberately not consulted.
 */
export function clientKeyFromRequest(req: Pick<ApiRequest, "headers">): string | undefined {
  const raw = req.headers[CLIENT_KEY_HEADER];
  if (typeof raw !== "string") return undefined; // absent, or repeated (an array): not a value nginx sets
  const value = raw.trim();
  if (isIP(value) === 0) return undefined;
  return normalizeClientAddress(value);
}

function present(env: Env, name: string): string | undefined {
  const v = env[name];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

function requireVars(env: Env, surface: string, names: readonly string[]): void {
  for (const name of names) {
    if (present(env, name) === undefined) throw new LauncherConfigError(`${surface} is enabled but ${name} is not set`);
  }
}

/** VC_SPEAKERS_FILE (JSON, SpeakersFileSchema) else an empty list. A set-but-unreadable or invalid file is a refusal, never a silent empty list. */
export function loadSpeakers(env: Env, readFile: (path: string) => string = (p) => readFileSync(p, "utf8")): SpeakersFile {
  const path = present(env, "VC_SPEAKERS_FILE");
  if (path === undefined) return { speakers: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFile(path));
  } catch {
    throw new LauncherConfigError("VC_SPEAKERS_FILE is set but the file cannot be read as JSON");
  }
  const parsed = SpeakersFileSchema.safeParse(json);
  if (!parsed.success) throw new LauncherConfigError("VC_SPEAKERS_FILE does not match the speakers file schema");
  return parsed.data;
}

export interface LauncherDeps {
  /** Tests inject a reader; default reads the file from disk. */
  readFile?: (path: string) => string;
}

/**
 * Turns the environment into the `http` options for `startApi`. Pure: builds clients (no I/O until a request) and reads the
 * speakers file; opens nothing. Throws `LauncherConfigError` naming the missing variable when an enabled surface lacks config.
 */
export function buildLauncherConfig(env: Env, deps: LauncherDeps = {}): HttpOptions {
  const http: HttpOptions = { host: "127.0.0.1" };
  const anonymous = anonymousEnabledFromEnv(env);
  const chat = chatEnabledFromEnv(env);
  if (!anonymous && !chat) return http;

  const speakers = loadSpeakers(env, deps.readFile);

  if (anonymous) {
    requireVars(env, "VC_ANONYMOUS_ENABLED", ["VC_KB_BASE_URL", "VC_KB_ANON_API_KEY"]);
    const client = createAnonymousKbClient({ baseUrl: present(env, "VC_KB_BASE_URL")!, apiKey: present(env, "VC_KB_ANON_API_KEY")! });
    http.anonymous = { kb: createStudentKbPort({ client }), speakers, clientKey: clientKeyFromRequest };
  }

  if (chat) {
    requireVars(env, "VC_CHAT_ENABLED", ["VC_KB_BASE_URL", "VC_KB_API_KEY"]);
    // The student JWT verifier is built here only to fail early and by name; startApi builds its own from the same env.
    const jwtVars = [STUDENT_JWT_ENV.issuer, STUDENT_JWT_ENV.audience];
    requireVars(env, "VC_CHAT_ENABLED", jwtVars);
    if (![STUDENT_JWT_ENV.publicKey, STUDENT_JWT_ENV.jwksUrl, STUDENT_JWT_ENV.hs256Secret].some((n) => present(env, n) !== undefined)) {
      throw new LauncherConfigError(
        `VC_CHAT_ENABLED is enabled but none of ${STUDENT_JWT_ENV.publicKey}, ${STUDENT_JWT_ENV.jwksUrl}, ${STUDENT_JWT_ENV.hs256Secret} is set`,
      );
    }
    try {
      studentJwtConfigFromEnv(env);
    } catch (err) {
      throw new LauncherConfigError(`VC_CHAT_ENABLED is enabled but the student JWT configuration is invalid (${err instanceof Error ? err.message : "error"})`);
    }
    const client = createKnowledgeBaseClient({ baseUrl: present(env, "VC_KB_BASE_URL")!, apiKey: present(env, "VC_KB_API_KEY")! });
    http.chat = { kb: createStudentKbPort({ client }), speakers };
  }
  return http;
}

/**
 * Builds the config and starts the API. `overrides` are for tests (a fake Mongo client, a mock provider, a port 0, a gates
 * directory): the built `anonymous` / `chat` options are extended by, not replaced with, the override's.
 */
export async function launch(env: Env = process.env, overrides: Partial<StartApiOptions> & { http?: HttpOptions } = {}): Promise<Api> {
  const { http: over, ...rest } = overrides;
  const built = buildLauncherConfig(env);
  const http: HttpOptions = {
    ...built,
    ...over,
    ...(built.anonymous || over?.anonymous ? { anonymous: { ...built.anonymous, ...over?.anonymous } } : {}),
    ...(built.chat || over?.chat ? { chat: { ...built.chat, ...over?.chat } } : {}),
  };
  return startApi(env, { ...rest, http });
}

async function main(): Promise<void> {
  let api: Api;
  try {
    api = await launch(process.env);
  } catch (err) {
    // The error class and message only (never the environment); a config error already names the variable.
    const what = err instanceof Error ? (err.message.startsWith(err.name) ? err.message : `${err.name}: ${err.message}`) : "unknown error";
    console.error(`vc-api failed to start: ${what}`);
    process.exit(1);
  }
  console.error(JSON.stringify({ level: "info", event: "vc_api_listening", port: api.port, ts: new Date().toISOString() }));
  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    console.error(JSON.stringify({ level: "info", event: "vc_api_stopping", signal, ts: new Date().toISOString() }));
    api.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Run only as the process entrypoint (never on import: contract B8).
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
