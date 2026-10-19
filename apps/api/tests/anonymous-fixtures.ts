/**
 * P1 U7 shared SYNTHETIC fixtures for the anonymous-mode tests (not a test file: `tsx --test tests/*.test.ts` skips it).
 * Invented KB text and gate records only (B13); no real person, no KB content.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspect } from "node:util";
import { MockProvider } from "@vc/providers";
import { SpeakersFileSchema, type SearchHit, type SearchToolOutput, type SpeakersFile } from "@vc/engine";
import { COLLECTION_NAMES, anonymousCountersCollection } from "@vc/db";
import { createFakeDb, type FakeDb } from "@vc/db/testing";
import { GATE_FILES } from "../src/go-live-gate.js";
import { BodyTooLargeError, type ApiHandler, type ApiRequest, type ApiResponse } from "../src/server.js";
import {
  ANONYMOUS_PATH,
  createAnonymousApi,
  createMongoAnonymousCounter,
  type AnonymousApiDeps,
  type AnonymousCounterWriter,
} from "../src/anonymous.js";
import { fileURLToPath } from "node:url";

export const SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));
export const NOW = new Date("2026-11-01T00:00:00.000Z");
export const APPROVER = "Umesh";

export const SPEAKERS: SpeakersFile = SpeakersFileSchema.parse({
  speakers: [{ id: "spk-1", name: "Arjun Mehrotra", aliases: ["Arjun Mehrotra", "Arjun", "Mehrotra"] }],
});

const EVIDENCE = "qa/evidence/a10-voice-20261016/report.md";
export const GOOD_GATES: Record<keyof typeof GATE_FILES, string> = {
  b13: "# amendments\n`B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by Umesh`\n",
  gPublish: "Answered: 2026-10-16T10:05:00+05:30 - a - publish text\n",
  gProd: "Answered: 2026-10-16T10:10:00+05:30 - b - authenticated text plus anonymous\n",
  nights: "Nights-mode: tele-manas-disclosed\n",
  a10: `Result: PASS\nRun-at: 2026-10-16T11:00:00+05:30\nEvidence: ${EVIDENCE}\n`,
};

export interface GatesFixture {
  root: string;
  gates: string;
}
export function gatesFixture(overrides: Partial<Record<keyof typeof GATE_FILES, string | null>> = {}): GatesFixture {
  const root = mkdtempSync(join(tmpdir(), "vc-anon-gates-"));
  const gates = join(root, "qa", "gates");
  mkdirSync(gates, { recursive: true });
  for (const k of Object.keys(GATE_FILES) as (keyof typeof GATE_FILES)[]) {
    const body = k in overrides ? overrides[k] : GOOD_GATES[k];
    if (body !== null && body !== undefined) writeFileSync(join(gates, GATE_FILES[k]), body);
  }
  mkdirSync(dirname(join(root, EVIDENCE)), { recursive: true });
  writeFileSync(join(root, EVIDENCE), "report");
  return { root, gates };
}
export const cleanupGates = (f: GatesFixture) => rmSync(f.root, { recursive: true, force: true });

export const HIT: SearchHit = {
  turnId: "t-sem-1",
  sessionId: "sess-sem-1",
  score: 3.2,
  text: "German public universities charge no tuition for most programmes, but expect a semester contribution of about 300 euros.",
  sessionDate: "2026-03-04",
  sessionTitle: "Study in Germany seminar",
  sourceId: "src-sem-1",
  sourceKind: "internal-seminar",
};
export const SEARCH_OK: SearchToolOutput = { status: "ok", hits: [HIT], dropped: 0 };
export const SEARCH_EMPTY: SearchToolOutput = { status: "ok", hits: [], dropped: 0 };

export const GOOD_CLAIM = { text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] };

/** A recording KB that ALSO offers ask/getSession, to prove the anonymous route never reaches them. */
export function recordingKb(search: SearchToolOutput | ((q: string) => SearchToolOutput) = SEARCH_OK) {
  const calls: { tool: string; arg: unknown[] }[] = [];
  return {
    calls,
    async searchKb(...args: unknown[]) {
      calls.push({ tool: "search_kb", arg: args });
      const s = typeof search === "function" ? search(String(args[0])) : search;
      return structuredClone(s);
    },
    async askKnowledgeBase(...args: unknown[]) {
      calls.push({ tool: "ask_knowledge_base", arg: args });
      throw new Error("anonymous mode must never call /ask");
    },
    async getSession(...args: unknown[]) {
      calls.push({ tool: "get_session", arg: args });
      throw new Error("anonymous mode must never call get_session");
    },
  };
}

export function kbAnswerProvider(claims: unknown[] = [GOOD_CLAIM], followUp?: string): MockProvider {
  return new MockProvider({
    responses: {
      "kb-answer": { claims, ...(followUp ? { followUp } : {}) },
      "vc-capabilities": { reply: "unused", questions: ["a?", "b?"] },
    },
  });
}

/** P1 LK1w: the env that selects the Ollama text chain. The key is invented; the host is never contacted (see stubOllamaFetch). */
export const CHAIN_ENV = { VC_TEXT_CHAIN: "ollama:glm-5.3-flash,ollama:deepseek-v4.1-flash", OLLAMA_API_KEY: "synthetic-key-not-real", OLLAMA_BASE_URL: "http://ollama.synthetic.test" };

/**
 * P1 LK1w: replaces globalThis.fetch with a mock that answers CHAIN_ENV's Ollama host with `content` as the model reply and passes every other
 * URL (the test's own calls to its local server) to the real fetch. Call BEFORE startApi: the chain captures `fetch` when it is built.
 */
export function stubOllamaFetch(content: unknown): { calls: { url: string; body: string }[]; restore(): void } {
  const real = globalThis.fetch;
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(CHAIN_ENV.OLLAMA_BASE_URL)) return real(input, init);
    calls.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify(content) }, done: true }), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

export interface AnonWorld {
  fakeDb: FakeDb;
  kb: ReturnType<typeof recordingKb>;
  provider: MockProvider;
  counterCalls: string[];
  logs: unknown[];
  handler: ApiHandler;
  gates: GatesFixture;
  clock: { ms: number };
  deps: AnonymousApiDeps;
  cleanup(): void;
}

export function anonWorld(
  opts: {
    kb?: ReturnType<typeof recordingKb>;
    provider?: MockProvider;
    counter?: AnonymousCounterWriter;
    deps?: Partial<AnonymousApiDeps>;
    env?: Record<string, string | undefined>;
  } = {},
): AnonWorld {
  const { fakeDb, db } = createFakeDb();
  const kb = opts.kb ?? recordingKb();
  const provider = opts.provider ?? kbAnswerProvider();
  const counterCalls: string[] = [];
  const clock = { ms: Date.parse("2026-11-01T10:00:00.000Z") };
  const mongo = createMongoAnonymousCounter(anonymousCountersCollection(db), () => new Date(clock.ms));
  const counter: AnonymousCounterWriter =
    opts.counter ?? {
      async increment(kind) {
        counterCalls.push(kind);
        await mongo.increment(kind);
      },
    };
  const logs: unknown[] = [];
  const gates = gatesFixture();
  const deps: AnonymousApiDeps = {
    kb,
    provider,
    skillsDir: SKILLS_DIR,
    speakers: SPEAKERS,
    counter,
    now: () => new Date(clock.ms),
    nowMs: () => clock.ms,
    log: (line) => logs.push(line),
    ...opts.deps,
  };
  const handler = createAnonymousApi(deps, { enabled: true, gatesDir: gates.gates, now: NOW, approver: APPROVER, env: opts.env ?? {} })!;
  return { fakeDb, kb, provider, counterCalls, logs, handler, gates, clock, deps, cleanup: () => cleanupGates(gates) };
}

/** An ApiRequest to the anonymous route. `body` is the raw string sent; an object is JSON-encoded. */
export function anonRequest(body: unknown, opts: { ip?: string; method?: string; headers?: Record<string, string>; path?: string; readBody?: () => Promise<string> } = {}): ApiRequest {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    method: opts.method ?? "POST",
    url: opts.path ?? ANONYMOUS_PATH,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    remoteAddress: opts.ip ?? "203.0.113.7",
    readBody: opts.readBody ?? (async () => raw),
  };
}

export const tooLargeBody = (): Promise<string> => Promise.reject(new BodyTooLargeError());

export async function ask(w: { handler: ApiHandler }, text: unknown, opts: Parameters<typeof anonRequest>[1] = {}): Promise<ApiResponse & { json: any }> {
  const res = await w.handler(anonRequest({ text }, opts));
  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = undefined;
  }
  return Object.assign(res, { json });
}

/** Every collection of the fake `virtual_counsellor` Db that holds any document, by name. */
export function nonEmptyCollections(fakeDb: FakeDb): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of Object.values(COLLECTION_NAMES)) {
    const n = fakeDb.collection<{ _id: string }>(name).all().length;
    if (n > 0) out[name] = n;
  }
  return out;
}

/** Captures everything written through console.* and process.stdout/stderr while `fn` runs. */
export async function captureOutput<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
  const chunks: string[] = [];
  const names = ["log", "info", "warn", "error", "debug"] as const;
  const saved = names.map((n) => console[n]);
  const outWrite = process.stdout.write.bind(process.stdout);
  const errWrite = process.stderr.write.bind(process.stderr);
  for (const n of names) console[n] = (...args: unknown[]) => void chunks.push(args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 6 }))).join(" "));
  // stdout is the test reporter's channel: pass non-capturing writes through, capture nothing from it (console is patched above).
  (process.stderr.write as unknown) = (c: unknown) => (chunks.push(String(c)), true);
  try {
    const result = await fn();
    return { result, output: chunks.join("\n") };
  } finally {
    names.forEach((n, i) => (console[n] = saved[i] as never));
    process.stdout.write = outWrite;
    process.stderr.write = errWrite;
  }
}
