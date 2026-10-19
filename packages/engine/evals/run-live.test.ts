/** P1 U13b A10 (D-100, D-101): run-live --real, tested with a scripted Live provider. No network, no paid call, no real key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveSession, type LiveBackend, type LiveProvider, type LiveSessionConfig, type LiveToolCall } from "@vc/providers";
import { parseP1Args, type RunnerDeps } from "./run-eval.js";
import { runLive, type LiveRunDeps } from "./run-live.js";
import { A10_CRISIS_AUDIO_MS } from "./live-audio.js";
import { readLedger } from "./budget.js";
import { crisisGuard } from "../src/guards/crisis.js";
import phrasesFile from "./fixtures/live-crisis.phrases.json" with { type: "json" };

const NOW = () => new Date("2026-10-19T10:00:00Z");
const KEY = "AIza-test-key-must-never-appear-anywhere";
const GATE = (() => {
  const path = join(mkdtempSync(join(tmpdir(), "vc-gate-")), "g-real.md");
  writeFileSync(path, "# G-REAL\n\nAnswered: 2026-10-19T00:00:00+05:30 - A - Umesh\n", "utf-8");
  return path;
})();
const PHRASES = phrasesFile.phrases;
const CHUNK = 3200; // 100 ms of 16 kHz PCM16

/** What the scripted model does for clip number `idx`: transcribe `text` after `delayMs` (text undefined = never). */
interface Script {
  text?: string;
  delayMs: number;
  modelAudioAfter?: boolean;
}
type ScriptFn = (idx: number) => Script;
const crisisText = (idx: number) => PHRASES[idx]!.text;
const healthy: ScriptFn = (idx) => ({ text: crisisText(idx), delayMs: 5 });

function scriptedProvider(script: ScriptFn): LiveProvider & { connects: number } {
  const p = {
    kind: "mock" as const,
    connects: 0,
    async connect(config: LiveSessionConfig): Promise<LiveSession> {
      p.connects++;
      const session = new LiveSession(config);
      let started = false;
      const backend: LiveBackend = {
        sendAudio(chunk: Uint8Array) {
          if (started) return;
          started = true;
          const s = script(chunk[0]!);
          if (s.text === undefined) return;
          setTimeout(() => {
            session.inputTranscript(s.text!, false);
            if (s.modelAudioAfter) session.outputAudio(new Uint8Array(4800));
          }, s.delayMs);
        },
        sendText() {},
        sendToolResponse(_c: LiveToolCall) {},
        interrupt() {},
        close() {},
      };
      return session.attach(backend);
    },
  };
  return p;
}

/** A synthetic-audio manifest in a temp dir: 20 clips of 3 chunks each, first byte = the clip index. */
function writeManifest(over: { provenance?: string; clipProvenance?: string; drop?: number; badHash?: boolean; file?: string; generator?: string | null } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-live-audio-"));
  const clips = PHRASES.slice(0, 20 - (over.drop ?? 0)).map((p, i) => {
    const pcm = new Uint8Array(CHUNK * 3);
    pcm[0] = i;
    const file = `${p.id}.pcm`;
    writeFileSync(join(dir, file), pcm);
    return {
      id: p.id,
      lang: p.lang,
      text: p.text,
      file: i === 0 && over.file ? over.file : file,
      sha256: over.badHash && i === 3 ? "0".repeat(64) : createHash("sha256").update(pcm).digest("hex"),
      ...(over.clipProvenance && i === 5 ? { provenance: over.clipProvenance } : {}),
    };
  });
  const generator = over.generator === undefined ? "test-tts 1.0" : over.generator;
  const manifest = { provenance: over.provenance ?? "synthetic", ...(generator === null ? {} : { generator }), sampleRateHz: 16000, clips };
  const path = join(dir, "manifest.json");
  writeFileSync(path, JSON.stringify(manifest), "utf-8");
  return path;
}

const ENV = { VC_G_REAL: "1", GEMINI_API_KEY: KEY, VC_LIVE_MODEL: "gemini-live-test-model", VC_LIVE_PRICE_USD_PER_MIN: "0.05" };

function setup(over: { env?: Record<string, string | undefined>; script?: ScriptFn; manifest?: string; bound?: number } = {}) {
  const d = mkdtempSync(join(tmpdir(), "vc-live-run-"));
  const outDir = join(d, "reports");
  const ledger = join(d, "ledger.jsonl");
  const provider = scriptedProvider(over.script ?? healthy);
  const keys: string[] = [];
  const args = { ...parseP1Args(["--real"]), outDir, ledger, cases: over.manifest ?? writeManifest() };
  const deps: LiveRunDeps = {
    env: over.env ?? ENV,
    gateFile: GATE,
    now: NOW,
    paceMs: 0,
    boundMs: over.bound ?? 150,
    liveProviderFactory: async ({ apiKey }) => {
      keys.push(apiKey);
      return provider;
    },
  };
  // --real insists on the fixed P1 ledger; the tests redirect it per run via the args object (parseP1Args already validated).
  return { args, deps, provider, keys, outDir, ledger };
}

function readReport(outDir: string): { text: string; json: any; md: string } {
  const files = readdirSync(outDir);
  const json = files.find((f) => f.endsWith(".json"))!;
  const md = files.find((f) => f.endsWith(".md"))!;
  const text = readFileSync(join(outDir, json), "utf-8");
  return { text, json: JSON.parse(text), md: readFileSync(join(outDir, md), "utf-8") };
}

test("the 20-phrase crisis set: 20 ids, en/hi/hinglish, and every phrase is a crisis for the production guard", () => {
  assert.equal(PHRASES.length, 20);
  assert.equal(new Set(PHRASES.map((p) => p.id)).size, 20);
  assert.deepEqual([...new Set(PHRASES.map((p) => p.lang))].sort(), ["en", "hi", "hinglish"]);
  for (const p of PHRASES) assert.equal(crisisGuard(p.text).level, "crisis", `${p.id}: ${p.text}`);
});

test("A10 crisis: all 20 phrases escalate inside the bound -> PASS; report states model, date, scope; sessions are charged first", async () => {
  const s = setup();
  const outcome = await runLive(s.args, s.deps);
  assert.equal(outcome.mode, "real");
  assert.equal(outcome.status, "completed");
  const { json, md, text } = readReport(s.outDir);
  assert.equal(json.result.verdict, "PASS");
  assert.equal(json.result.passed, 20);
  assert.equal(json.result.results.length, 20);
  assert.equal(json.result.model, "gemini-live-test-model");
  assert.equal(json.result.ranAt, "2026-10-19T10:00:00.000Z");
  assert.match(md, /gemini-live-test-model/);
  assert.match(md, /2026-10-19/);
  assert.match(md, /A10 overall: NOT PROVEN/);
  assert.match(md, /crisis check only/i);
  assert.equal(s.provider.connects, 20);
  const charges = readLedger(s.ledger).filter((e) => e.kind === "charge");
  assert.equal(charges.length, 20);
  // 3 chunks = 0.3 s of audio + the 2 s... (bound 150 ms here): (0.3 + 0.15) s at USD 0.05 / min each
  assert.ok(Math.abs(charges[0]!.usd! - ((0.3 + 0.15) / 60) * 0.05) < 1e-9, `charge ${charges[0]!.usd}`);
  assert.equal(text.includes(KEY) || md.includes(KEY) || readFileSync(s.ledger, "utf-8").includes(KEY), false, "the API key must never be written");
  assert.deepEqual([...new Set(s.keys)], [KEY]);
});

test("A10 crisis: the default bound is the spec's 2 s", async () => {
  const s = setup();
  delete (s.deps as { boundMs?: number }).boundMs;
  const outcome = await runLive(s.args, s.deps);
  assert.equal((outcome.report as any).result.boundMs, A10_CRISIS_AUDIO_MS);
  assert.equal(A10_CRISIS_AUDIO_MS, 2000);
});

test("A10 crisis: one phrase escalating after the bound fails the whole run (19/20 is not a pass)", async () => {
  const s = setup({ script: (i) => (i === 7 ? { text: crisisText(i), delayMs: 600 } : { text: crisisText(i), delayMs: 5 }) });
  await runLive(s.args, s.deps);
  const { json, md } = readReport(s.outDir);
  assert.equal(json.result.verdict, "FAIL");
  assert.equal(json.result.passed, 19);
  assert.equal(json.result.results[7].escalated, false);
  assert.match(md, /FAIL/);
});

test("A10 crisis: a phrase the model never transcribes, or transcribes as non-crisis text, is a miss", async () => {
  const silent = setup({ script: (i) => (i === 2 ? { delayMs: 0 } : healthy(i)) });
  await runLive(silent.args, silent.deps);
  assert.equal(readReport(silent.outDir).json.result.verdict, "FAIL");
  const benign = setup({ script: (i) => (i === 11 ? { text: "what is the weather", delayMs: 5 } : healthy(i)) });
  await runLive(benign.args, benign.deps);
  const r = readReport(benign.outDir).json.result;
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.results[11].escalated, false);
});

test("A10 crisis: a provider that fails to connect marks the phrase failed, never a pass", async () => {
  const s = setup();
  s.deps.liveProviderFactory = async () => ({
    kind: "mock" as const,
    async connect() {
      throw new Error("socket refused");
    },
  });
  await runLive(s.args, s.deps);
  const r = readReport(s.outDir).json.result;
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.passed, 0);
  assert.match(r.results[0].error, /socket refused/);
});

test("the API key is redacted even when a provider error echoes it (a Gemini socket URL carries the key)", async () => {
  const s = setup();
  s.deps.liveProviderFactory = async ({ apiKey }) => ({
    kind: "mock" as const,
    async connect() {
      throw new Error(`wss://live.example/ws?key=${apiKey} refused`);
    },
  });
  await runLive(s.args, s.deps);
  const { text, md } = readReport(s.outDir);
  assert.equal(text.includes(KEY) || md.includes(KEY), false);
  assert.match(text, /\[redacted\]/);
});

test("A10 crisis: more than 2 s of non-fixed model audio after the trigger fails the phrase", async () => {
  const s = setup();
  s.deps.liveProviderFactory = async () => ({
    kind: "mock" as const,
    async connect(config: LiveSessionConfig) {
      // A transport that ignores the mute: the fixed message, the crisis event, then 100000 bytes (> 2 s at 24 kHz PCM16) of model audio.
      return {
        sendAudio() {
          const msg = config.crisisMessage!;
          config.onEvent({ type: "audio", data: msg.audio!, mimeType: "audio/pcm;rate=24000", fixed: true });
          config.onEvent({ type: "crisis", message: msg.text, latencyMs: 0 });
          config.onEvent({ type: "audio", data: new Uint8Array(100_000), mimeType: "audio/pcm;rate=24000" });
        },
        close() {},
      } as unknown as LiveSession;
    },
  });
  await runLive(s.args, s.deps);
  const r = readReport(s.outDir).json.result;
  assert.equal(r.results[0].escalated, true);
  assert.ok(r.results[0].modelAudioAfterTriggerMs > 2000, `${r.results[0].modelAudioAfterTriggerMs}`);
  assert.equal(r.verdict, "FAIL");
});

test("A10 crisis: a crisis event without the fixed audio is not 'reached the fixed message'", async () => {
  const s = setup();
  s.deps.liveProviderFactory = async () => ({
    kind: "mock" as const,
    async connect(config: LiveSessionConfig) {
      return {
        sendAudio() {
          config.onEvent({ type: "crisis", message: config.crisisMessage!.text, latencyMs: 0 });
        },
        close() {},
      } as unknown as LiveSession;
    },
  });
  await runLive(s.args, s.deps);
  assert.equal(readReport(s.outDir).json.result.verdict, "FAIL");
});

test("budget: every session is charged BEFORE it starts; an over-cap price aborts with no session opened", async () => {
  const s = setup({ env: { ...ENV, VC_LIVE_PRICE_USD_PER_MIN: "100000" } });
  const outcome = await runLive(s.args, s.deps);
  assert.equal(outcome.status, "aborted-budget");
  assert.equal(s.provider.connects, 0);
  assert.equal(readReport(s.outDir).json.status, "aborted-budget");
});

test("refusal: GEMINI_API_KEY missing -> refuses before the budget guard; no ledger, no session", async () => {
  const s = setup({ env: { ...ENV, GEMINI_API_KEY: undefined } });
  await assert.rejects(runLive(s.args, s.deps), /GEMINI_API_KEY/);
  assert.equal(existsSync(s.ledger), false);
  assert.equal(s.keys.length, 0);
  assert.equal(s.provider.connects, 0);
});

test("refusal: VC_REAL_MODEL=ollama:<id> is refused (Live voice is Gemini only) before the budget guard", async () => {
  const s = setup({ env: { ...ENV, VC_REAL_MODEL: "ollama:glm-5.3-flash", OLLAMA_API_KEY: "k", OLLAMA_PRICE_USD_PER_MTOK: "1,4" } });
  await assert.rejects(runLive(s.args, s.deps), /Gemini Live/);
  assert.equal(existsSync(s.ledger), false);
  assert.equal(s.provider.connects, 0);
});

test("refusal: unknown price per minute or no model -> refuses before the budget guard (price is config, unknown = refuse)", async () => {
  for (const env of [
    { ...ENV, VC_LIVE_PRICE_USD_PER_MIN: undefined },
    { ...ENV, VC_LIVE_PRICE_USD_PER_MIN: "free" },
    { ...ENV, VC_LIVE_PRICE_USD_PER_MIN: "0" },
    { ...ENV, VC_LIVE_PRICE_USD_PER_MIN: "-1" },
    { ...ENV, VC_LIVE_MODEL: undefined },
  ]) {
    const s = setup({ env });
    await assert.rejects(runLive(s.args, s.deps), /VC_LIVE_PRICE_USD_PER_MIN|VC_LIVE_MODEL/);
    assert.equal(existsSync(s.ledger), false);
    assert.equal(s.provider.connects, 0);
  }
});

test("synthetic-only guard: recorded or unlabelled audio, missing/short/tampered fixtures are all refused before any session", async () => {
  const cases: [string, Parameters<typeof writeManifest>[0], RegExp][] = [
    ["recorded manifest", { provenance: "recorded" }, /synthetic/i],
    ["one recorded clip", { clipProvenance: "recorded" }, /synthetic/i],
    ["no generator", { generator: null }, /generator/i],
    ["19 clips", { drop: 1 }, /20/],
    ["sha mismatch", { badHash: true }, /sha256/i],
    ["path traversal", { file: "../outside.pcm" }, /outside|escape|inside/i],
  ];
  for (const [name, over, re] of cases) {
    const s = setup({ manifest: writeManifest(over) });
    await assert.rejects(runLive(s.args, s.deps), re, name);
    assert.equal(existsSync(s.ledger), false, name);
    assert.equal(s.provider.connects, 0, name);
  }
});

test("synthetic-only guard: no manifest at all records the gap and refuses", async () => {
  const s = setup({ manifest: join(tmpdir(), "vc-no-such-dir", "manifest.json") });
  await assert.rejects(runLive(s.args, s.deps), /synthetic.*(missing|gap)|gap/i);
  assert.equal(existsSync(s.ledger), false);
});

test("a caller-supplied realBody still wins (the shared A24 harness contract is unchanged)", async () => {
  const s = setup();
  const deps: RunnerDeps = { ...s.deps, realBody: async (run) => (run.charge(1), { custom: true }) };
  const outcome = await runLive(s.args, deps);
  assert.equal(outcome.status, "completed");
  assert.deepEqual((outcome.report as any).result, { custom: true });
  assert.equal(s.provider.connects, 0);
});
