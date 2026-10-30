/**
 * Live (voice) session seam, P1 unit U9 (plan row U9, spec A9/A9b/A10, contract B6 voice amendment).
 *
 * The text seam (`LlmProvider.generate`) is request/response with a Zod-parsed output, so every
 * hard rule can run BEFORE anything reaches the student. A Live voice session cannot: the model
 * speaks as it thinks, so a spoken breach cannot be unsaid. This module therefore gives voice a
 * different, honest contract:
 *   - the crisis rule is ENFORCED as far as the medium allows: every input-transcript chunk goes
 *     through an injected detector; on a hit the model's audio is muted, the backend is
 *     interrupted, and the FIXED crisis message (text, as chat) is shown (spec D-088 Q5: at most 2 s of model
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
  /** Server-only opt-in: this tool returns factual KB evidence, never conversation/memory context. Omitted is false. */
  factualEvidence?: boolean;
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

/**
 * The fixed crisis message: TEXT ONLY (Umesh 2026-10-29, "voice crisis is the same as chat"). A voice crisis shows the
 * same helpline message a chat crisis returns; no pre-recorded audio exists, is required or is ever sent. The model is
 * still muted and interrupted at the trigger, so the student never hears model speech after it.
 */
export interface LiveCrisisMessage {
  text: string;
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

/** Injected output auditor. `sourcedText` contains only explicitly eligible factual-evidence tool results. */
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
  /** Only explicit finalized microphone transcription can authorize a memory decision. */
  inputFinal?: boolean;
  inputContext?: string;
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
  | { type: "audio"; data: Uint8Array; mimeType: typeof LIVE_OUTPUT_MIME }
  | { type: "transcript"; role: LiveRole; text: string; final: boolean; fixed?: boolean }
  | { type: "tool_call"; call: LiveToolCall }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "usage"; usage: LiveUsage }
  | { type: "crisis"; level?: string; message: string; latencyMs: number }
  | { type: "flag"; reason: string; detail: string }
  | { type: "error"; message: string }
  | { type: "closed"; reason: string };

/**
 * D-140: what one provider usage report cost. Counts only, never text. `costUsd` is absent when the model has no known price
 * (a price is never invented). Tracking only: nothing caps a session on it.
 */
export interface LiveUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

/** D-140: USD per million tokens by modality, as Google publishes it for a Live model. */
export interface LivePrice {
  input: { text: number; audio: number; imageVideo: number };
  output: { text: number; audio: number };
}

/**
 * D-140: paid-tier Live prices from ai.google.dev/gemini-api/docs/pricing, read 2026-10-30. Audio is 25 tokens per second, so
 * audio in $3.00/M is about $0.005/min and audio out $12.00/M about $0.018/min. Thinking tokens bill as text output.
 */
export const GEMINI_LIVE_PRICES: Readonly<Record<string, LivePrice>> = {
  "gemini-3.1-flash-live-preview": { input: { text: 0.75, audio: 3, imageVideo: 1 }, output: { text: 4.5, audio: 12 } },
};

export interface LiveSessionConfig {
  systemInstruction?: string;
  /** KB tools (U2) the model may call. */
  tools?: LiveToolDeclaration[];
  voiceName?: string;
  onEvent: (event: LiveEvent) => void;
  sink?: LiveTranscriptSink;
  /** Opaque server context captured when a microphone utterance starts, never from model output. */
  captureInputContext?: () => string | undefined;
  detectCrisis?: LiveCrisisDetector;
  /** Required whenever `detectCrisis` is set (non-empty text): a detector with no message to show is a silent no-op. */
  crisisMessage?: LiveCrisisMessage;
  auditOutput?: LiveOutputAuditor;
  /** Runs a model tool call; all results reach the model, but only server-declared factual evidence sources the audit. */
  toolHandler?: (call: LiveToolCall) => Promise<unknown> | unknown;
  /** Injected clock for deterministic tests. */
  now?: () => number;
  /**
   * After a crisis, the shortest pause (ms) between two student transcript chunks that counts as the
   * student starting a NEW utterance (D-096 brief rewrite 1). Default `CRISIS_RESUME_GAP_MS_DEFAULT`.
   */
  crisisResumeGapMs?: number;
  /** Monotonic clock (ms) for the crisis resume gap; injectable for tests. Default `performance.now()`. */
  monotonicNow?: () => number;
}

/** Default `crisisResumeGapMs`: a pause this long after the last student chunk starts a new utterance. */
export const CRISIS_RESUME_GAP_MS_DEFAULT = 1200;

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
  /**
   * The input audio stream has ended (A10 diagnose): tells the backend no more audio is coming, so it can finalise
   * a pending input transcription. Optional; a transport without it simply never gets the marker.
   */
  endAudio?(): void;
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
  /** D-140: a provider usage report (optional so a transport without one still fits). */
  usage?(usage: LiveUsage): void;
}

// ---------------------------------------------------------------------------
// LiveSession: all the behaviour
// ---------------------------------------------------------------------------

/** Most backend events a session queues before `attach`; beyond it the oldest are dropped (logged). */
export const PENDING_BACKEND_EVENTS_MAX = 256;

export class LiveSession implements LiveBackendSink {
  private closedFlag = false;
  private seq = 0;
  private userBuf = "";
  private assistantBuf = "";
  private crisisFiredForUtterance = false;
  /**
   * While true, model audio and transcript are dropped: after a crisis trigger the fixed message
   * owns the floor, and after a client interrupt() the student has asked the model to stop. Cleared
   * when the backend reports `turnComplete` or `interrupted` (both only when no crisis mute is on,
   * see below), and when the next student speech is recognised.
   */
  private muted = false;
  /**
   * Set by a crisis trigger, cleared ONLY by new student speech after the crisis utterance has ended
   * (D-096). While set, no backend signal reopens model audio: not `interrupted` (F1, the backend
   * confirms the interrupt we asked for), not `toolCall` (R1) and not `turnComplete` (R2).
   */
  private crisisMute = false;
  /** A `turnComplete` or `interrupted` has arrived since the last crisis fired (lift condition 1). */
  private crisisTurnEnded = false;
  /** Monotonic time of the last student transcript chunk (lift condition 2 measures the gap from it). */
  private lastStudentChunkAt: number | undefined;
  private readonly crisisResumeGapMs: number;
  private readonly monotonicNow: () => number;
  private droppedModelAudioChunks = 0;
  private readonly sourced: string[] = [];
  private readonly now: () => number;
  private backend: LiveBackend | undefined;
  /** Serialises sink writes so the thread keeps turn order even when a sink is async. */
  private sinkChain: Promise<void> = Promise.resolve();
  /** Backend work that arrived before `attach` (tool calls), capped at PENDING_BACKEND_EVENTS_MAX. */
  private readonly pendingBackendEvents: (() => void)[] = [];
  /** A crisis backend interrupt owed from before `attach`; kept apart so a flood can never drop it. */
  private pendingCrisisInterrupt = false;

  constructor(private readonly config: LiveSessionConfig) {
    if (config.detectCrisis && !config.crisisMessage) {
      throw new LiveConfigError("detectCrisis requires crisisMessage: a detector with no fixed message to show is a silent no-op");
    }
    if (config.detectCrisis && (typeof config.crisisMessage?.text !== "string" || !config.crisisMessage.text.trim())) {
      throw new LiveConfigError("detectCrisis requires a non-empty crisisMessage.text: a voice student must never get silence after a crisis");
    }
    this.now = config.now ?? Date.now;
    const gap = config.crisisResumeGapMs ?? CRISIS_RESUME_GAP_MS_DEFAULT;
    if (!Number.isFinite(gap) || gap < 0) throw new LiveConfigError(`crisisResumeGapMs must be a finite number >= 0, got ${gap}`);
    this.crisisResumeGapMs = gap;
    this.monotonicNow = config.monotonicNow ?? (() => performance.now());
  }

  /** Called once by the provider after the transport is open. Replays anything that arrived earlier. */
  attach(backend: LiveBackend): this {
    if (this.backend) throw new LiveConfigError("Live session already has a backend attached");
    this.backend = backend;
    if (this.pendingCrisisInterrupt) {
      this.pendingCrisisInterrupt = false;
      this.interruptBackendForCrisis();
    }
    for (const run of this.pendingBackendEvents.splice(0)) {
      try {
        run();
      } catch (err) {
        this.emit({ type: "error", message: `replay after attach failed: ${errMsg(err)}` });
      }
    }
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

  /**
   * Marks the end of the input audio stream (Gemini: `audioStreamEnd`). Without it the backend may hold the final
   * input transcription of a short clip until the connection is closed. Not an interrupt: it does not mute the model.
   * A no-op when the transport has no such marker.
   */
  endAudio(): void {
    this.assertOpen();
    this.backend!.endAudio?.();
  }

  sendText(text: string): void {
    this.assertOpen();
    // A typed message is as much student input as speech: it goes through the same crisis hook,
    // every time (also when a spoken crisis already fired for this utterance: M2).
    // Typed text is persisted by the text channel (U10), so it only reaches the voice thread here
    // when it triggers the crisis path (the fixed reply must follow the words that caused it).
    if (this.scanForCrisis(text, text, true)) return; // the fixed message owns the floor; do not also prompt the model
    this.backend!.sendText(text);
  }

  async sendToolResult(call: LiveToolCall, result: unknown): Promise<void> {
    this.assertOpen();
    if (this.config.tools?.some((tool) => tool.name === call.name && tool.factualEvidence === true)) {
      this.sourced.push(stringifyForAudit(result));
    }
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

  private inputContext: string | undefined;

  inputTranscript(text: string, final: boolean): void {
    if (this.closedFlag || (!text && !final)) return;
    if (!this.userBuf) this.inputContext = this.config.captureInputContext?.();
    const at = this.monotonicNow();
    const gapMs = this.lastStudentChunkAt === undefined ? Infinity : at - this.lastStudentChunkAt;
    this.lastStudentChunkAt = at;
    if (this.crisisMute) {
      // D-096, brief rewrite 1: the crisis mute lifts ONLY on new student speech, i.e. a chunk that
      // comes (1) after the backend ended or abandoned its turn since the crisis AND (2) after a pause
      // of at least crisisResumeGapMs since the previous student chunk. Anything else is the same
      // crisis utterance going on: it stays muted and keeps the crisis state (no refire). No final
      // flag is relied on: the Gemini path always reports final=false.
      if (this.crisisTurnEnded && gapMs >= this.crisisResumeGapMs) {
        this.flushUser(true); // the crisis utterance is over; its words must not be re-scanned
        this.crisisMute = false;
        this.crisisTurnEnded = false;
        this.muted = false;
      }
    } else if (this.muted) {
      this.muted = false; // student spoke again after a client interrupt
    }
    this.userBuf = this.userBuf ? `${this.userBuf} ${text}`.trim() : text.trim();
    this.emit({ type: "transcript", role: "user", text, final });
    this.scanForCrisis(this.userBuf);
    // During a crisis mute a final flag does not end the crisis utterance (only the rule above does).
    if (final) this.flushUser(!this.crisisMute, true);
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
    // During a crisis mute a tool call does not end the student's utterance: the next chunk of the
    // same utterance must not lift the mute or refire the fixed message (R1, D-096).
    this.flushUser(!this.crisisMute);
    this.emit({ type: "tool_call", call });
    const handler = this.config.toolHandler;
    if (!handler) return;
    const run = (): void => {
      void (async () => {
        try {
          const result = await handler(call);
          if (!this.closedFlag) await this.sendToolResult(call, result);
        } catch (err) {
          this.emit({ type: "error", message: `tool ${call.name} failed: ${errMsg(err)}` });
        }
      })();
    };
    // A call that beats `attach` (the transport's onmessage is live before the session has a backend)
    // is queued and answered on attach, not turned into an error (M1).
    if (this.backend) run();
    else this.queueBeforeAttach(run);
  }

  /** D-140: billed even during a crisis or interrupt mute, so it is passed on whatever the mute state. */
  usage(usage: LiveUsage): void {
    this.emit({ type: "usage", usage });
  }

  turnComplete(): void {
    if (this.closedFlag) return;
    // During a crisis mute the turn end does not end the student's utterance (H1): the next chunk of
    // the same utterance must neither lift the mute nor refire the fixed message.
    this.flushUser(!this.crisisMute);
    this.flushAssistant(false);
    // The end of the model's turn lifts a client-interrupt mute, never a crisis mute (R2, D-096):
    // after a crisis only new student speech reopens the model's audio. It does arm lift condition 1.
    if (this.crisisMute) this.crisisTurnEnded = true;
    else this.muted = false;
    this.emit({ type: "turn_complete" });
  }

  interrupted(): void {
    if (this.closedFlag) return;
    this.flushAssistant(true);
    // After a crisis the mute lasts until the student speaks again (F1, D-096); arms lift condition 1.
    if (this.crisisMute) this.crisisTurnEnded = true;
    else this.muted = false;
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

  /**
   * Returns true when the crisis path fired. `typed` is the text to record when it came from sendText.
   * `force` (typed text) scans even when a crisis already fired for the current spoken utterance:
   * the no-refire rule is for later chunks of the SAME utterance, not for a separate typed message.
   */
  private scanForCrisis(text: string, typed?: string, force = false): boolean {
    const detect = this.config.detectCrisis;
    if (!detect || (this.crisisFiredForUtterance && !force)) return false;
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
    this.fireCrisis(hit.level, started, typed === undefined);
    return true;
  }

  /**
   * `spoken` false for a typed crisis: the no-refire flag belongs to the spoken utterance, so a typed
   * crisis must not stop a later spoken crisis from showing the helpline message again.
   */
  private fireCrisis(level: string | undefined, started: number, spoken: boolean): void {
    if (spoken) this.crisisFiredForUtterance = true;
    // What the model already said is real: audit it and store it as an interrupted turn, exactly as
    // a barge-in does, BEFORE the mute (F2).
    this.flushAssistant(true);
    this.muted = true;
    this.crisisMute = true;
    this.crisisTurnEnded = false; // condition 1 counts from THIS crisis
    // Before `attach` there is no backend yet: the student still gets the fixed message now, and
    // the backend interrupt is replayed on attach (M1).
    if (this.backend) this.interruptBackendForCrisis();
    else this.pendingCrisisInterrupt = true;
    const message = this.config.crisisMessage!;
    // The message text is guaranteed by the constructor (M3). Text only, as chat answers a crisis: no audio event is emitted here.
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

  private interruptBackendForCrisis(): void {
    try {
      this.backend!.interrupt();
    } catch (err) {
      this.emit({ type: "error", message: `interrupt failed: ${errMsg(err)}` });
    }
  }

  private queueBeforeAttach(run: () => void): void {
    if (this.pendingBackendEvents.length >= PENDING_BACKEND_EVENTS_MAX) {
      this.pendingBackendEvents.shift();
      this.emit({ type: "error", message: `backend not attached: queue full (${PENDING_BACKEND_EVENTS_MAX}), dropped the oldest queued event` });
    }
    this.pendingBackendEvents.push(run);
  }

  /**
   * `endOfUtterance` true when the student's utterance is over (the model answers, a tool call
   * arrives, the turn completes, or the transcript is final). Only then may a new crisis fire:
   * later chunks of the SAME utterance must not play the fixed message twice.
   */
  private flushUser(endOfUtterance: boolean, inputFinal = false): void {
    const text = this.userBuf.trim();
    const inputContext = this.inputContext;
    this.inputContext = undefined;
    this.userBuf = "";
    if (endOfUtterance) this.crisisFiredForUtterance = false;
    if (!text) return;
    const ts = new Date(this.now()).toISOString();
    const seq = ++this.seq;
    this.writeSink((sink) => sink.onFinalTranscript({ seq, role: "user", text, channel: "voice", ts, ...(inputFinal ? { inputFinal: true, ...(inputContext ? { inputContext } : {}) } : {}) }));
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
 * Flags (a) any figure in the spoken text that appears in no eligible factual tool result of this session and (b)
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
  | { type: "audio_end" }
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
  endAudio(): void {
    this.calls.push({ type: "audio_end" });
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
  emitUsage(usage: LiveUsage): void {
    this.s().usage?.(usage);
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
  /** D-140: overrides the `GEMINI_LIVE_PRICES` entry for `model`; with neither, usage carries tokens and no cost. */
  price?: LivePrice;
}

export class GeminiLiveProvider implements LiveProvider {
  readonly kind = "gemini" as const;
  readonly model: string;
  private readonly connector: GeminiLiveConnector | undefined;
  private readonly price: LivePrice | undefined;

  constructor(options: GeminiLiveProviderOptions) {
    this.model = options.model;
    this.connector = options.connector;
    this.price = options.price ?? (Object.hasOwn(GEMINI_LIVE_PRICES, options.model) ? GEMINI_LIVE_PRICES[options.model] : undefined);
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
        onmessage: (message) => translateGeminiMessage(message, session, this.price),
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
  endAudio(): void {
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
export function translateGeminiMessage(raw: unknown, sink: LiveBackendSink, price?: LivePrice): void {
  const msg = raw as Record<string, any> | null;
  if (!msg || typeof msg !== "object") return;

  // D-140: usageMetadata rides on any server message (alone or beside one other field), so it is read before the serverContent return.
  const usage = liveUsageFromMetadata(msg.usageMetadata, price);
  if (usage) sink.usage?.(usage);

  const toolCall = msg.toolCall;
  if (toolCall && Array.isArray(toolCall.functionCalls)) {
    for (const fc of toolCall.functionCalls) {
      if (!fc || typeof fc.name !== "string") continue;
      sink.toolCall({ id: String(fc.id ?? fc.name), name: fc.name, args: fc.args && typeof fc.args === "object" ? fc.args : {} });
    }
  }

  const content = msg.serverContent;
  if (!content || typeof content !== "object") return;

  if (typeof content.inputTranscription?.text === "string" || content.inputTranscription?.finished === true) {
    sink.inputTranscript(typeof content.inputTranscription.text === "string" ? content.inputTranscription.text.trim() : "", content.inputTranscription.finished === true);
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

/**
 * D-140: one Gemini Live `usageMetadata` as text-free usage. Input = prompt + tool-use prompt tokens; output = response + thoughts tokens.
 * Prompt and response tokens are priced by their modality breakdown; any count the breakdown does not cover is priced at the audio rate
 * (the higher one) so cost is never under-reported. Counts that are not whole non-negative numbers are ignored. Undefined when nothing was used.
 */
export function liveUsageFromMetadata(raw: unknown, price: LivePrice | undefined): LiveUsage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const meta = raw as Record<string, unknown>;
  const prompt = count(meta.promptTokenCount), toolUse = count(meta.toolUsePromptTokenCount);
  const response = count(meta.responseTokenCount), thoughts = count(meta.thoughtsTokenCount);
  const inputTokens = prompt + toolUse, outputTokens = response + thoughts;
  if (inputTokens === 0 && outputTokens === 0) return undefined;
  if (!price) return { inputTokens, outputTokens };
  const byModality = (details: unknown): Map<string, number> => {
    const m = new Map<string, number>();
    for (const d of Array.isArray(details) ? details : []) {
      if (!d || typeof d !== "object" || typeof (d as { modality?: unknown }).modality !== "string") continue;
      const key = (d as { modality: string }).modality.toUpperCase();
      m.set(key, (m.get(key) ?? 0) + count((d as { tokenCount?: unknown }).tokenCount));
    }
    return m;
  };
  const pIn = byModality(meta.promptTokensDetails), pOut = byModality(meta.responseTokensDetails);
  const inText = pIn.get("TEXT") ?? 0, inAudio = pIn.get("AUDIO") ?? 0, inVisual = (pIn.get("IMAGE") ?? 0) + (pIn.get("VIDEO") ?? 0);
  const outText = pOut.get("TEXT") ?? 0, outAudio = pOut.get("AUDIO") ?? 0;
  const inRest = Math.max(0, prompt - inText - inAudio - inVisual), outRest = Math.max(0, response - outText - outAudio);
  const usd =
    (inText + toolUse) * price.input.text + (inAudio + inRest) * price.input.audio + inVisual * price.input.imageVideo +
    (outText + thoughts) * price.output.text + (outAudio + outRest) * price.output.audio;
  return { inputTokens, outputTokens, costUsd: usd / 1e6 };
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : 0;
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
