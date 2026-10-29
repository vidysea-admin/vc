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
import { readFileSync, openSync, fstatSync, readSync, closeSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SpeakersFileSchema, crisisMessageFor, type SpeakersFile } from "@vc/engine";
import { GeminiLiveProvider, type GeminiLiveConnector } from "@vc/providers";
import {
  createAnonymousKbClient,
  createKnowledgeBaseClient,
  createStudentKbPort,
} from "@vc/mcp-university-kb";
import { anonymousEnabledFromEnv, normalizeClientAddress } from "./anonymous.js";
import { STUDENT_JWT_ENV, studentJwtConfigFromEnv } from "./auth.js";
import { chatEnabledFromEnv } from "./chat.js";
import { voiceEnabledFromEnv } from "./voice.js";
import { startApi, type Api, type StartApiOptions, type StartApiVoiceOptions } from "./index.js";
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
  /** Offline connector and bounded binary-reader seams; neither is used with voice off. */
  voiceConnector?: GeminiLiveConnector;
  readBinaryFile?: (path: string, maxBytes: number) => Uint8Array;
  /** Trusted programmatic wiring, never supplied by a browser. */
  voiceOverride?: StartApiVoiceOptions;
}

/** At most60 seconds of mono PCM16 at24kHz. Wording/rate/quality still require operator vetting. */
export const VOICE_CRISIS_PCM_MAX_BYTES = 2_880_000;

function readVoicePcm(file: string, maxBytes: number): Uint8Array {
  const fd = openSync(file, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 2 || stat.size > maxBytes) throw new Error("invalid asset");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const got = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!got) throw new Error("partial asset");
      offset += got;
    }
    if (fstatSync(fd).size !== bytes.length || readSync(fd, Buffer.alloc(1), 0, 1, null)) throw new Error("changed asset");
    return bytes;
  } finally { closeSync(fd); }
}

function validPcm(bytes: Uint8Array): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > VOICE_CRISIS_PCM_MAX_BYTES || bytes.byteLength % 2) return false;
  const head = Buffer.from(bytes.subarray(0, 12)).toString("ascii");
  return !/^(?:RIFF|RF64|ID3|OggS|fLaC)/.test(head) && !(bytes[0] === 255 && (bytes[1]! & 224) === 224);
}

function voiceConfig(env: Env, deps: LauncherDeps): StartApiVoiceOptions {
  const supplied = deps.voiceOverride ?? {};
  let live = supplied.live;
  if (!live) {
    requireVars(env, "VC_VOICE_ENABLED", ["GEMINI_API_KEY", "VC_VOICE_MODEL"]);
    const apiKey = env.GEMINI_API_KEY!, model = env.VC_VOICE_MODEL!;
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(model)) throw new LauncherConfigError("VC_VOICE_MODEL is invalid");
    // Client/SDK import and network are deferred until the existing gated voice session connects.
    const connector: GeminiLiveConnector = deps.voiceConnector ?? {
      async connect({ model, config, callbacks }) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const sdk = new GoogleGenAI({ apiKey, httpOptions: { timeout: 10_000 } });
          const connection = await sdk.live.connect({ model, config, callbacks });
          return {
            sendRealtimeInput: (input) => connection.sendRealtimeInput(input),
            sendToolResponse: (input) => connection.sendToolResponse(input),
            close: () => connection.close(),
          };
        } catch { throw new Error("Voice provider connection failed"); }
      },
    };
    live = new GeminiLiveProvider({ model, connector });
  }
  const wsSecret = supplied.wsSecret ?? new TextEncoder().encode(env.VC_VOICE_WS_SECRET ?? "");
  if (!(wsSecret instanceof Uint8Array) || wsSecret.byteLength < 32) throw new LauncherConfigError("VC_VOICE_WS_SECRET must contain at least32 UTF-8 bytes");
  const wsBaseUrl = supplied.wsBaseUrl ?? env.VC_VOICE_WS_BASE_URL;
  try {
    const url = new URL(wsBaseUrl ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!(url.protocol === "wss:" || (url.protocol === "ws:" && local)) || url.username || url.password || url.search || url.hash) throw new Error("invalid");
  } catch { throw new LauncherConfigError("VC_VOICE_WS_BASE_URL must be a credential-free wss URL (ws allowed only on loopback)"); }
  let crisis = supplied.crisis;
  if (!crisis) {
    requireVars(env, "VC_VOICE_ENABLED", ["VC_VOICE_CRISIS_PCM_FILE", "VC_VOICE_CRISIS_PCM_SHA256"]);
    const hash = env.VC_VOICE_CRISIS_PCM_SHA256!;
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) throw new LauncherConfigError("VC_VOICE_CRISIS_PCM_SHA256 must be64 hexadecimal characters");
    let audio: Uint8Array;
    try { audio = (deps.readBinaryFile ?? readVoicePcm)(env.VC_VOICE_CRISIS_PCM_FILE!, VOICE_CRISIS_PCM_MAX_BYTES); }
    catch { throw new LauncherConfigError("VC_VOICE_CRISIS_PCM_FILE cannot be read as a bounded regular PCM asset"); }
    if (!validPcm(audio)) throw new LauncherConfigError("VC_VOICE_CRISIS_PCM_FILE must be nonempty whole raw PCM16 samples within the byte limit");
    const actual = createHash("sha256").update(audio).digest();
    if (!timingSafeEqual(actual, Buffer.from(hash, "hex"))) throw new LauncherConfigError("VC_VOICE_CRISIS_PCM_SHA256 does not match the supplied asset");
    crisis = { message: { text: crisisMessageFor("en", "student"), audio } };
  }
  if (typeof crisis.message?.text !== "string" || !crisis.message.text.trim() || !crisis.message.audio || !validPcm(crisis.message.audio)) throw new LauncherConfigError("The effective voice crisis message/audio is incomplete");
  return { ...supplied, live, crisis, wsSecret, wsBaseUrl: wsBaseUrl! };
}

/**
 * Turns the environment into the `http` options for `startApi`. Pure: builds clients (no I/O until a request) and reads the
 * speakers file; opens nothing. Throws `LauncherConfigError` naming the missing variable when an enabled surface lacks config.
 */
export function buildLauncherConfig(env: Env, deps: LauncherDeps = {}): HttpOptions {
  const http: HttpOptions = { host: "127.0.0.1" };
  const anonymous = anonymousEnabledFromEnv(env);
  const chat = chatEnabledFromEnv(env);
  const voice = voiceEnabledFromEnv(env);
  if (!anonymous && !chat && !voice) return http;

  const speakers = loadSpeakers(env, deps.readFile);
  // T-057: optional KB client timeout (ms), bounded 1000..30000; unset keeps the client default. A bad value fails startup by name.
  const kbTimeoutRaw = present(env, "VC_KB_TIMEOUT_MS");
  const kbTimeoutMs = kbTimeoutRaw === undefined ? undefined : Number(kbTimeoutRaw);
  if (kbTimeoutMs !== undefined && !(Number.isInteger(kbTimeoutMs) && kbTimeoutMs >= 1_000 && kbTimeoutMs <= 30_000)) {
    throw new LauncherConfigError("VC_KB_TIMEOUT_MS must be an integer between 1000 and 30000");
  }
  const kbTimeout = kbTimeoutMs === undefined ? {} : { timeoutMs: kbTimeoutMs };

  if (anonymous) {
    requireVars(env, "VC_ANONYMOUS_ENABLED", ["VC_KB_BASE_URL", "VC_KB_ANON_API_KEY"]);
    const client = createAnonymousKbClient({ baseUrl: present(env, "VC_KB_BASE_URL")!, apiKey: present(env, "VC_KB_ANON_API_KEY")!, ...kbTimeout });
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
    const client = createKnowledgeBaseClient({ baseUrl: present(env, "VC_KB_BASE_URL")!, apiKey: present(env, "VC_KB_API_KEY")!, ...kbTimeout });
    http.chat = { kb: createStudentKbPort({ client }), speakers };
  }
  if (voice) http.voice = { speakers, ...voiceConfig(env, deps) };
  return http;
}

/**
 * Builds the config and starts the API. `overrides` are for tests (a fake Mongo client, a mock provider, a port 0, a gates
 * directory): the built `anonymous` / `chat` options are extended by, not replaced with, the override's.
 */
export async function launch(env: Env = process.env, overrides: Partial<StartApiOptions> & { http?: HttpOptions } = {}, deps: LauncherDeps = {}): Promise<Api> {
  const { http: over, ...rest } = overrides;
  const built = buildLauncherConfig(env, { ...deps, ...(over?.voice ? { voiceOverride: over.voice } : {}) });
  const http: HttpOptions = {
    ...built,
    ...over,
    ...(built.anonymous || over?.anonymous ? { anonymous: { ...built.anonymous, ...over?.anonymous } } : {}),
    ...(built.chat || over?.chat ? { chat: { ...built.chat, ...over?.chat } } : {}),
    ...(built.voice || over?.voice ? { voice: { ...built.voice, ...over?.voice } } : {}),
  };
  return startApi(env, { ...rest, http });
}

/** A Mongo URI's userinfo (user:password@) up to the LAST "@" before the first "/" (a raw "@" in a password must not end the match early). */
const MONGO_USERINFO = /mongodb(\+srv)?:\/\/[^\s/]*@/gi;
/** A credential-shaped run: sk-..., key..., token... followed by 16 or more id characters. */
const SECRET_RUN = /\b(sk|key|token)[-_A-Za-z0-9]{16,}/g;

/**
 * What the process prints when it fails to start: the error name and message only (never the environment), with any
 * Mongo URI credentials and credential-shaped runs redacted. A third-party error (the Mongo driver, a provider loader) can
 * echo a value it was handed, e.g. `VC_LLM_PROVIDER must be ... (got "mongodb+srv://user:pw@host")`; a config error
 * already names the variable and never a value, and passes through unchanged.
 */
export function describeStartupError(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const raw = err.message.startsWith(err.name) ? err.message : `${err.name}: ${err.message}`;
  return raw.replace(MONGO_USERINFO, "mongodb://***@").replace(SECRET_RUN, "[redacted]");
}

async function main(): Promise<void> {
  let api: Api;
  try {
    api = await launch(process.env);
  } catch (err) {
    console.error(`vc-api failed to start: ${describeStartupError(err)}`);
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
