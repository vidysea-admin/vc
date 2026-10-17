/**
 * Live (voice) session seam, P1 unit U9 (plan row U9, spec A9/A9b/A10, contract B6 voice amendment).
 *
 * The text seam (`LlmProvider.generate`) is request/response with a Zod-parsed output, so every
 * hard rule can run BEFORE anything reaches the student. A Live voice session cannot: the model
 * speaks as it thinks, so a spoken breach cannot be unsaid. This module therefore gives voice a
 * different, honest contract:
 *   - the crisis rule is ENFORCED as far as the medium allows: every input-transcript chunk goes
 *     through an injected detector; on a hit the model's audio is muted, the backend is
 *     interrupted, and the FIXED crisis message is played (spec D-088 Q5: at most 2 s of model
 *     audio after the trigger, so after the trigger NO model audio is forwarded at all);
 *   - everything else (uncited numbers, listed speaker names) is AUDITED AFTER THE FACT: the
 *     finished assistant transcript goes through an injected auditor and each finding becomes a
 *     `flag` event plus an audit record for the thread (A9b). Nothing here claims pre-send
 *     enforcement for voice.
 *
 * Shape:
 *   `LiveProvider.connect(config)` -> `LiveSession` (sendAudio / sendText / sendToolResult /
 *   interrupt / close). All behaviour (crisis hook, audit hook, transcript buffering, tool-call
 *   routing, format checks, close-once) lives in `LiveSession`, which wraps a transport-level
 *   `LiveBackend`. The two implementations only differ in the backend:
 *   - `MockLiveProvider` / `MockLiveBackend`: scripted by tests, records every call. Fully tested.
 *   - `GeminiLiveProvider`: COMPILE-ONLY. It translates Gemini Live messages into the normalized
 *     backend events through an injected `GeminiLiveConnector` (structurally what the Google GenAI
 *     SDK's `ai.live` is). It imports no SDK and opens no socket, so tests run offline; real use
 *     waits for G-REAL and the A10 voice gate.
 *
 * Audio contract (spec item 1, D-088 Q5): PCM16 little-endian mono, 16 kHz in, 24 kHz out.
 * Final transcripts leave through `LiveTranscriptSink` so U8 owns persistence; this package never
 * imports `apps/api`. `D:/ikigai_counsellor/server/geminiLiveService.ts` is the read-only
 * reference for the Gemini message shapes.
 */

// ---------------------------------------------------------------------------
// Constants and types
// ---------------------------------------------------------------------------

export const LIVE_INPUT_SAMPLE_RATE_HZ = 16_000;
export const LIVE_OUTPUT_SAMPLE_RATE_HZ = 24_000;
export const LIVE_INPUT_MIME = "audio/pcm;rate=16000";
export const LIVE_OUTPUT_MIME = "audio/pcm;rate=24000";

export type LiveRole = "user" | "assistant";

export interface LiveToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema of the arguments. */
  parameters?: Record<string, unknown>;
}

export interface LiveToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** A finding from the output auditor (A9b). */
export interface LiveAuditFinding {
  /** Machine reason, e.g. "uncited_number", "listed_speaker", "audit_error". */
  reason: string;
  /** What was found (the number, the name). */
  detail: string;
}

/** The fixed crisis message (text always; pre-rendered 24 kHz PCM16 when the caller has it). */
export interface LiveCrisisMessage {
  text: string;
  audio?: Uint8Array;
}

export interface LiveCrisisDetection {
  crisis: boolean;
  level?: string;
}

/**
 * Injected so this package imports nothing from the engine. Receives the CURRENT user utterance
 * accumulated so far (not just the latest chunk), so a phrase split across two transcript chunks
 * is still caught. Must be synchronous: it sits on the 2 s crisis budget.
 */
export type LiveCrisisDetector = (text: string) => boolean | LiveCrisisDetection;

/** Injected output auditor. `sourcedText` is every tool result sent in this session so far. */
export type LiveOutputAuditor = (input: { text: string; sourcedText: readonly string[] }) => LiveAuditFinding[];

export interface LiveFinalTranscript {
  /** Monotonic per session, starting at 1, in the order the turns happened. */
  seq: number;
  role: LiveRole;
  text: string;
  channel: "voice";
  /** ISO-8601 from the injected clock. */
  ts: string;
  /** True for the fixed crisis message (spoken by us, not by the model). */
  fixed?: boolean;
  /** True when the model turn was cut off before it finished. */
  interrupted?: boolean;
}

export interface LiveAuditRecord {
  seq: number;
  ts: string;
  finding: LiveAuditFinding;
  /** The assistant transcript the finding was found in. */
  transcript: string;
}

export interface LiveCrisisRecord {
  ts: string;
  level?: string;
  /** Milliseconds from the trigger to the fixed message being handed to the client. */
  latencyMs: number;
}

/** Callback interface for U8: shared thread history. Errors it throws are reported, never fatal. */
export interface LiveTranscriptSink {
  onFinalTranscript(transcript: LiveFinalTranscript): void | Promise<void>;
  onAudit?(record: LiveAuditRecord): void | Promise<void>;
  onCrisis?(record: LiveCrisisRecord): void | Promise<void>;
}

export type LiveEvent =
  | { type: "audio"; data: Uint8Array; mimeType: typeof LIVE_OUTPUT_MIME; fixed?: boolean }
  | { type: "transcript"; role: LiveRole; text: string; final: boolean; fixed?: boolean }
  | { type: "tool_call"; call: LiveToolCall }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "crisis"; level?: string; message: string; latencyMs: number }
  | { type: "flag"; reason: string; detail: string }
  | { type: "error"; message: string }
  | { type: "closed"; reason: string };

export interface LiveSessionConfig {
  systemInstruction?: string;
  /** KB tools (U2) the model may call. */
  tools?: LiveToolDeclaration[];
  voiceName?: string;
  onEvent: (event: LiveEvent) => void;
  sink?: LiveTranscriptSink;
  detectCrisis?: LiveCrisisDetector;
  /** Required whenever `detectCrisis` is set: a detector with nothing to play is a silent no-op. */
  crisisMessage?: LiveCrisisMessage;
  auditOutput?: LiveOutputAuditor;
  /** Runs a model tool call; the result is sent back to the model and counted as "sourced" for the audit. */
  toolHandler?: (call: LiveToolCall) => Promise<unknown> | unknown;
  /** Injected clock for deterministic tests. */
  now?: () => number;
}

export interface LiveProvider {
  readonly kind: "mock" | "gemini";
  connect(config: LiveSessionConfig): Promise<LiveSession>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LiveAudioFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAudioFormatError";
  }
}

export class LiveSessionClosedError extends Error {
  constructor() {
    super("Live session is closed");
    this.name = "LiveSessionClosedError";
  }
}

export class LiveNotWiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveNotWiredError";
  }
}

export class LiveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveConfigError";
  }
}

// ---------------------------------------------------------------------------
// Backend (transport) contract
// ---------------------------------------------------------------------------

/** What `LiveSession` calls on a transport. */
export interface LiveBackend {
  sendAudio(chunk: Uint8Array): void;
  sendText(text: string): void;
  sendToolResponse(call: LiveToolCall, result: unknown): void;
  /** Stop the model speaking now. */
  interrupt(): void;
  close(): void;
}

/** What a transport reports back; implemented by `LiveSession`. */
export interface LiveBackendSink {
  /** `final` true when the transport knows the user's utterance is finished. */
  inputTranscript(text: string, final: boolean): void;
  outputTranscript(text: string): void;
  /** Raw model audio, already decoded to PCM16 bytes at 24 kHz. */
  outputAudio(data: Uint8Array): void;
  toolCall(call: LiveToolCall): void;
  turnComplete(): void;
  interrupted(): void;
  error(message: string): void;
  backendClosed(reason: string): void;
}

// ---------------------------------------------------------------------------
// LiveSession: all the behaviour
// ---------------------------------------------------------------------------

export class LiveSession implements LiveBackendSink {
  private closedFlag = false;
  private seq = 0;
  private userBuf = "";
  private assistantBuf = "";
  private crisisFiredForUtterance = false;
  /**
   * While true, model audio and transcript are dropped: after a crisis trigger the fixed message
   * owns the floor, and after a client interrupt() the student has asked the model to stop. Cleared
   * when the backend reports `interrupted` or `turnComplete` (the cancelled/finished generation is
   * over), and, for a client interrupt only, when the next student speech is recognised.
   */
  private muted = false;
  private droppedModelAudioChunks = 0;
  private readonly sourced: string[] = [];
  private readonly now: () => number;
  private backend: LiveBackend | undefined;
  /** Serialises sink writes so the thread keeps turn order even when a sink is async. */
  private sinkChain: Promise<void> = Promise.resolve();
  private readonly pendingBackendEvents: (() => void)[] = [];

  constructor(private readonly config: LiveSessionConfig) {
    if (config.detectCrisis && !config.crisisMessage) {
      throw new LiveConfigError("detectCrisis requires crisisMessage: a detector with no fixed message to play is a silent no-op");
    }
    this.now = config.now ?? Date.now;
  }

  /** Called once by the provider after the transport is open. Replays anything that arrived earlier. */
  attach(backend: LiveBackend): this {
    this.backend = backend;
    for (const run of this.pendingBackendEvents.splice(0)) run();
    return this;
  }

  get closed(): boolean {
    return this.closedFlag;
  }

  // -- client -> model ------------------------------------------------------

  sendAudio(chunk: Uint8Array): void {
    this.assertOpen();
    if (!(chunk instanceof Uint8Array)) throw new LiveAudioFormatError("audio chunk must be a Uint8Array of PCM16 samples");
    if (chunk.byteLength === 0) throw new LiveAudioFormatError("empty audio chunk");
    if (chunk.byteLength % 2 !== 0) throw new LiveAudioFormatError(`PCM16 needs an even byte length, got ${chunk.byteLength}`);
    this.backend!.sendAudio(chunk);
  }

  sendText(text: string): void {
    this.assertOpen();
    // A typed message is as much student input as speech: it goes through the same crisis hook.
    // Typed text is persisted by the text channel (U10), so it only reaches the voice thread here
    // when it triggers the crisis path (the fixed reply must follow the words that caused it).
    if (this.scanForCrisis(text, text)) return; // the fixed message owns the floor; do not also prompt the model
    this.backend!.sendText(text);
  }

  async sendToolResult(call: LiveToolCall, result: unknown): Promise<void> {
    this.assertOpen();
    this.sourced.push(stringifyForAudit(result));
    this.backend!.sendToolResponse(call, result);
  }

  /** Stop the model speaking now (student barge-in, or the client asked). */
  interrupt(): void {
    this.assertOpen();
    this.muted = true;
    this.backend!.interrupt();
    this.flushAssistant(true);
    this.emit({ type: "interrupted" });
  }

  /** Idempotent. After close every send throws `LiveSessionClosedError`. */
  close(reason = "closed by client"): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    this.flushAssistant(true);
    this.flushUser(true);
    try {
      this.backend?.close();
    } catch (err) {
      this.emit({ type: "error", message: errMsg(err) }, true);
    }
    this.emit({ type: "closed", reason }, true);
  }

  /** Resolves when every sink write queued so far has settled (tests and graceful shutdown). */
  async drain(): Promise<void> {
    await this.sinkChain;
  }

  // -- model -> client (LiveBackendSink) ----------------------------------------

  inputTranscript(text: string, final: boolean): void {
    if (this.closedFlag || !text) return;
    if (this.muted && !this.crisisFiredForUtterance) this.muted = false; // student spoke again after a client interrupt
    this.userBuf = this.userBuf ? `${this.userBuf} ${text}`.trim() : text.trim();
    this.emit({ type: "transcript", role: "user", text, final });
    this.scanForCrisis(this.userBuf);
    if (final) this.flushUser(true);
  }

  outputTranscript(text: string): void {
    if (this.closedFlag || !text) return;
    if (this.muted) return;
    this.flushUser(true); // the model only answers once the student has finished
    this.assistantBuf = this.assistantBuf ? `${this.assistantBuf} ${text}`.trim() : text.trim();
    this.emit({ type: "transcript", role: "assistant", text, final: false });
  }

  outputAudio(data: Uint8Array): void {
    if (this.closedFlag) return;
    if (this.muted) {
      this.droppedModelAudioChunks++;
      return;
    }
    this.flushUser(true);
    this.emit({ type: "audio", data, mimeType: LIVE_OUTPUT_MIME });
  }

  toolCall(call: LiveToolCall): void {
    if (this.closedFlag) return;
    this.flushUser(true);
    this.emit({ type: "tool_call", call });
    const handler = this.config.toolHandler;
    if (!handler) return;
    void (async () => {
      try {
        const result = await handler(call);
        if (!this.closedFlag) await this.sendToolResult(call, result);
      } catch (err) {
        this.emit({ type: "error", message: `tool ${call.name} failed: ${errMsg(err)}` });
      }
    })();
  }

  turnComplete(): void {
    if (this.closedFlag) return;
    this.flushUser(true);
    this.flushAssistant(false);
    this.muted = false;
    this.emit({ type: "turn_complete" });
  }

  interrupted(): void {
    if (this.closedFlag) return;
    this.flushAssistant(true);
    this.muted = false;
    this.emit({ type: "interrupted" });
  }

  /** Model audio chunks dropped because the session was muted (crisis or client interrupt). */
  get droppedAudioChunks(): number {
    return this.droppedModelAudioChunks;
  }

  error(message: string): void {
    if (this.closedFlag) return;
    this.emit({ type: "error", message });
  }

  backendClosed(reason: string): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    this.flushAssistant(true);
    this.flushUser(true);
    this.emit({ type: "closed", reason }, true);
  }

  // -- internals ------------------------------------------------------------------

  private assertOpen(): void {
    if (this.closedFlag) throw new LiveSessionClosedError();
    if (!this.backend) throw new LiveNotWiredError("Live session has no backend attached yet");
  }

  private emit(event: LiveEvent, allowClosed = false): void {
    if (this.closedFlag && !allowClosed) return;
    try {
      this.config.onEvent(event);
    } catch {
      // A throwing listener must not take the voice session (or the crisis path) down.
    }
  }

  /** Returns true when the crisis path fired. `typed` is the text to record when it came from sendText. */
  private scanForCrisis(text: string, typed?: string): boolean {
    const detect = this.config.detectCrisis;
    if (!detect || this.crisisFiredForUtterance) return false;
    const started = this.now();
    let result: boolean | LiveCrisisDetection;
    try {
      result = detect(text);
    } catch (err) {
      // D-087: unsure counts as the higher level. A detector that throws is unsure.
      this.emit({ type: "error", message: `crisis detector failed, treating as crisis: ${errMsg(err)}` });
      result = { crisis: true, level: "detector_error" };
    }
    const hit = typeof result === "boolean" ? { crisis: result } : result;
    if (!hit.crisis) return false;
    if (typed !== undefined) this.userBuf = this.userBuf ? `${this.userBuf} ${typed}` : typed;
    this.fireCrisis(hit.level, started);
    return true;
  }

  private fireCrisis(level: string | undefined, started: number): void {
    this.crisisFiredForUtterance = true;
    this.muted = true;
    this.assistantBuf = ""; // whatever the model was mid-way through saying never reaches the thread as a finished turn
    try {
      this.backend!.interrupt();
    } catch (err) {
      this.emit({ type: "error", message: `interrupt failed: ${errMsg(err)}` });
    }
    const message = this.config.crisisMessage!;
    if (message.audio) this.emit({ type: "audio", data: message.audio, mimeType: LIVE_OUTPUT_MIME, fixed: true });
    this.emit({ type: "transcript", role: "assistant", text: message.text, final: true, fixed: true });
    const latencyMs = Math.max(0, this.now() - started);
    this.emit({ type: "crisis", ...(level !== undefined ? { level } : {}), message: message.text, latencyMs });
    const ts = new Date(this.now()).toISOString();
    this.flushUser(false); // the student's words go to the thread BEFORE the fixed reply
    const fixedSeq = ++this.seq;
    this.writeSink((sink) =>
      sink.onFinalTranscript({ seq: fixedSeq, role: "assistant", text: message.text, channel: "voice", ts, fixed: true }),
    );
    this.writeSink((sink) =>
      sink.onCrisis?.({ ts, ...(level !== undefined ? { level } : {}), latencyMs }),
    );
  }

  /**
   * `endOfUtterance` true when the student's utterance is over (the model answers, a tool call
   * arrives, the turn completes, or the transcript is final). Only then may a new crisis fire:
   * later chunks of the SAME utterance must not play the fixed message twice.
   */
  private flushUser(endOfUtterance: boolean): void {
    const text = this.userBuf.trim();
    this.userBuf = "";
    if (endOfUtterance) this.crisisFiredForUtterance = false;
    if (!text) return;
    const ts = new Date(this.now()).toISOString();
    const seq = ++this.seq;
    this.writeSink((sink) => sink.onFinalTranscript({ seq, role: "user", text, channel: "voice", ts }));
  }

  private flushAssistant(interrupted: boolean): void {
    const text = this.assistantBuf.trim();
    this.assistantBuf = "";
    if (!text) return;
    const ts = new Date(this.now()).toISOString();
    let findings: LiveAuditFinding[] = [];
    const audit = this.config.auditOutput;
    if (audit) {
      try {
        findings = audit({ text, sourcedText: this.sourced });
      } catch (err) {
        // An auditor that cannot run must be visible, never a silent clean bill of health.
        findings = [{ reason: "audit_error", detail: errMsg(err) }];
      }
    }
    const seq = ++this.seq;
    this.writeSink((sink) =>
      sink.onFinalTranscript({ seq, role: "assistant", text, channel: "voice", ts, ...(interrupted ? { interrupted: true } : {}) }),
    );
    this.emit({ type: "transcript", role: "assistant", text, final: true });
    for (const finding of findings) {
      this.writeSink((sink) => sink.onAudit?.({ seq, ts, finding, transcript: text }));
      this.emit({ type: "flag", reason: finding.reason, detail: finding.detail });
    }
  }

  private writeSink(write: (sink: LiveTranscriptSink) => void | Promise<void>): void {
    const sink = this.config.sink;
    if (!sink) return;
    this.sinkChain = this.sinkChain.then(async () => {
      try {
        await write(sink);
      } catch (err) {
        this.emit({ type: "error", message: `transcript sink failed: ${errMsg(err)}` }, true);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Default output auditor (A9b): uncited numbers, listed speakers
// ---------------------------------------------------------------------------

export interface SimpleOutputAuditorOptions {
  /** Names the model must never say aloud (counsellor/WhatsApp speakers, B1 no-quote list). */
  listedSpeakers?: readonly string[];
  /** Numbers that never need a source (e.g. the Tele-MANAS number in the fixed message). */
  allowedNumbers?: readonly string[];
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

function numberTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ""));
}

/**
 * Flags (a) any figure in the spoken text that appears in no tool result of this session and (b)
 * any listed speaker named. Heuristic by design: it can over-flag, never silently pass a number.
 */
export function createSimpleOutputAuditor(options: SimpleOutputAuditorOptions = {}): LiveOutputAuditor {
  const speakers = (options.listedSpeakers ?? []).map((s) => s.trim()).filter(Boolean);
  const allowed = new Set((options.allowedNumbers ?? []).map((n) => n.replace(/,/g, "")));
  return ({ text, sourcedText }) => {
    const findings: LiveAuditFinding[] = [];
    const sourcedNumbers = new Set(sourcedText.flatMap(numberTokens));
    for (const n of new Set(numberTokens(text))) {
      if (allowed.has(n) || sourcedNumbers.has(n)) continue;
      findings.push({ reason: "uncited_number", detail: n });
    }
    const folded = fold(text);
    for (const name of speakers) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(fold(name))}($|[^\\p{L}\\p{N}])`, "u");
      if (re.test(folded)) findings.push({ reason: "listed_speaker", detail: name });
    }
    return findings;
  };
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

export type MockLiveCall =
  | { type: "audio"; bytes: number }
  | { type: "text"; text: string }
  | { type: "tool_response"; id: string; name: string; result: unknown }
  | { type: "interrupt" }
  | { type: "close" };

/** Scriptable transport. Tests call the `say*` / `emit*` methods to play the model's side. */
export class MockLiveBackend implements LiveBackend {
  readonly calls: MockLiveCall[] = [];
  readonly audioIn: Uint8Array[] = [];
  private sink: LiveBackendSink | undefined;

  bind(sink: LiveBackendSink): void {
    this.sink = sink;
  }
  sendAudio(chunk: Uint8Array): void {
    this.audioIn.push(chunk);
    this.calls.push({ type: "audio", bytes: chunk.byteLength });
  }
  sendText(text: string): void {
    this.calls.push({ type: "text", text });
  }
  sendToolResponse(call: LiveToolCall, result: unknown): void {
    this.calls.push({ type: "tool_response", id: call.id, name: call.name, result });
  }
  interrupt(): void {
    this.calls.push({ type: "interrupt" });
  }
  close(): void {
    this.calls.push({ type: "close" });
  }

  // model side
  emitInputTranscript(text: string, final = false): void {
    this.s().inputTranscript(text, final);
  }
  emitOutputTranscript(text: string): void {
    this.s().outputTranscript(text);
  }
  emitOutputAudio(data: Uint8Array): void {
    this.s().outputAudio(data);
  }
  emitToolCall(call: LiveToolCall): void {
    this.s().toolCall(call);
  }
  emitTurnComplete(): void {
    this.s().turnComplete();
  }
  emitInterrupted(): void {
    this.s().interrupted();
  }
  emitError(message: string): void {
    this.s().error(message);
  }
  emitClosed(reason: string): void {
    this.s().backendClosed(reason);
  }

  private s(): LiveBackendSink {
    if (!this.sink) throw new LiveNotWiredError("MockLiveBackend is not bound to a session");
    return this.sink;
  }
}

export class MockLiveProvider implements LiveProvider {
  readonly kind = "mock" as const;
  readonly backends: MockLiveBackend[] = [];
  readonly configs: LiveSessionConfig[] = [];

  async connect(config: LiveSessionConfig): Promise<LiveSession> {
    const backend = new MockLiveBackend();
    const session = new LiveSession(config);
    backend.bind(session);
    this.backends.push(backend);
    this.configs.push(config);
    return session.attach(backend);
  }

  /** The backend of the most recent `connect`, for scripting the model side. */
  get last(): MockLiveBackend {
    const b = this.backends[this.backends.length - 1];
    if (!b) throw new LiveNotWiredError("MockLiveProvider has no session yet");
    return b;
  }
}

// ---------------------------------------------------------------------------
// Gemini implementation (compile-only; no SDK import, no network)
// ---------------------------------------------------------------------------

/** The slice of the Google GenAI SDK's live connection this adapter uses (ikigai proxy reference). */
export interface GeminiLiveConnection {
  sendRealtimeInput(input: { audio?: { data: string; mimeType: string }; text?: string; audioStreamEnd?: boolean }): void;
  sendToolResponse(input: { functionResponses: { id: string; name: string; response: Record<string, unknown> }[] }): void;
  close(): void;
}

export interface GeminiLiveCallbacks {
  onopen?: () => void;
  onmessage: (message: unknown) => void;
  onerror?: (error: { message?: string } | Error) => void;
  onclose?: (event: { reason?: string }) => void;
}

/** Structurally the SDK's `ai.live`. Injected so this package has no SDK dependency. */
export interface GeminiLiveConnector {
  connect(params: { model: string; config: Record<string, unknown>; callbacks: GeminiLiveCallbacks }): Promise<GeminiLiveConnection>;
}

export interface GeminiLiveProviderOptions {
  model: string;
  /** Absent -> `connect` throws `LiveNotWiredError` (no key, no SDK, G-REAL still closed). */
  connector?: GeminiLiveConnector;
}

export class GeminiLiveProvider implements LiveProvider {
  readonly kind = "gemini" as const;
  readonly model: string;
  private readonly connector: GeminiLiveConnector | undefined;

  constructor(options: GeminiLiveProviderOptions) {
    this.model = options.model;
    this.connector = options.connector;
  }

  async connect(config: LiveSessionConfig): Promise<LiveSession> {
    if (!this.connector) {
      throw new LiveNotWiredError("GeminiLiveProvider has no connector: real Gemini Live use waits for G-REAL and the A10 voice gate");
    }
    const session = new LiveSession(config);
    const connection = await this.connector.connect({
      model: this.model,
      config: buildGeminiLiveConfig(config),
      callbacks: {
        onmessage: (message) => translateGeminiMessage(message, session),
        onerror: (error) => session.error(error instanceof Error ? error.message : (error.message ?? "Gemini Live error")),
        onclose: (event) => session.backendClosed(event?.reason || "Gemini Live closed"),
      },
    });
    return session.attach(new GeminiLiveBackend(connection));
  }
}

/** Gemini `LiveConnectConfig` shape, as used by the ikigai proxy (audio out, both transcripts on). */
export function buildGeminiLiveConfig(config: LiveSessionConfig): Record<string, unknown> {
  return {
    responseModalities: ["AUDIO"],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName ?? "Kore" } } },
    ...(config.systemInstruction ? { systemInstruction: { parts: [{ text: config.systemInstruction }] } } : {}),
    ...(config.tools && config.tools.length > 0
      ? {
          tools: [
            {
              functionDeclarations: config.tools.map((t) => ({
                name: t.name,
                description: t.description,
                ...(t.parameters ? { parametersJsonSchema: t.parameters } : {}),
              })),
            },
          ],
        }
      : {}),
  };
}

class GeminiLiveBackend implements LiveBackend {
  constructor(private readonly connection: GeminiLiveConnection) {}
  sendAudio(chunk: Uint8Array): void {
    this.connection.sendRealtimeInput({ audio: { data: toBase64(chunk), mimeType: LIVE_INPUT_MIME } });
  }
  sendText(text: string): void {
    this.connection.sendRealtimeInput({ text });
  }
  sendToolResponse(call: LiveToolCall, result: unknown): void {
    const response = result !== null && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
    this.connection.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response }] });
  }
  interrupt(): void {
    // ASSUMPTION (verify under G-REAL, spec A10 "interruption stops audio <= 300 ms"): the SDK has no
    // dedicated client-side "stop speaking" call. `LiveSession` mutes model audio locally the instant
    // interrupt() is called, so the student never hears more; here we only flush the input stream so
    // the backend ends the current activity.
    this.connection.sendRealtimeInput({ audioStreamEnd: true });
  }
  close(): void {
    try {
      this.connection.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // best effort flush, as in the reference proxy
    }
    this.connection.close();
  }
}

/** Translates one Gemini Live server message into normalized backend events. Exported for tests. */
export function translateGeminiMessage(raw: unknown, sink: LiveBackendSink): void {
  const msg = raw as Record<string, any> | null;
  if (!msg || typeof msg !== "object") return;

  const toolCall = msg.toolCall;
  if (toolCall && Array.isArray(toolCall.functionCalls)) {
    for (const fc of toolCall.functionCalls) {
      if (!fc || typeof fc.name !== "string") continue;
      sink.toolCall({ id: String(fc.id ?? fc.name), name: fc.name, args: fc.args && typeof fc.args === "object" ? fc.args : {} });
    }
  }

  const content = msg.serverContent;
  if (!content || typeof content !== "object") return;

  if (typeof content.inputTranscription?.text === "string" && content.inputTranscription.text.trim()) {
    sink.inputTranscript(content.inputTranscription.text.trim(), false);
  }
  if (typeof content.outputTranscription?.text === "string" && content.outputTranscription.text.trim()) {
    sink.outputTranscript(content.outputTranscription.text.trim());
  }
  const parts: any[] = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
  for (const part of parts) {
    const inline = part?.inlineData;
    if (!inline?.data) continue;
    const mime = String(inline.mimeType ?? LIVE_OUTPUT_MIME);
    const rate = /rate=(\d+)/.exec(mime)?.[1];
    if (!mime.startsWith("audio/pcm") || (rate !== undefined && Number(rate) !== LIVE_OUTPUT_SAMPLE_RATE_HZ)) {
      sink.error(`unexpected model audio format ${mime}; expected ${LIVE_OUTPUT_MIME}`);
      continue;
    }
    const bytes = fromBase64(String(inline.data));
    if (bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) {
      sink.error("model audio chunk is not whole PCM16 samples");
      continue;
    }
    sink.outputAudio(bytes);
  }
  if (content.interrupted === true) sink.interrupted();
  if (content.turnComplete === true) sink.turnComplete();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stringifyForAudit(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function fromBase64(s: string): Uint8Array {
  const b = Buffer.from(s, "base64");
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}
