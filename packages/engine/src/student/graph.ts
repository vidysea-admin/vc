/**
 * P1 U6: the live student turn graph (LangGraph.js 1.x StateGraph, H1/D-002), contract B24 / spec v8
 * plan row U6. One invocation = one student turn. Nodes:
 *
 *   gate -> crisis -> route -> { answer | coach | tool } -> finish -> END
 *
 *  - gate: takes the RAW input. The crisis guard scans the raw text (first 4000 chars) BEFORE schema
 *    validation, so an over-long or malformed crisis message still gets the fixed safe message (repair
 *    R7). Otherwise authenticated mode needs a verified student identity (role `student`, studentId,
 *    tenantId; the JWT itself is verified by the API layer, U8/B21): a bad identity throws
 *    StudentAuthRequiredError, any other invalid input StudentInputInvalidError, before any KB or model
 *    call. Pathlynks-authenticated = consented (B4, D-086): no consent row.
 *  - finish: the prior-flag Tele-MANAS suffix and the TurnResponse schema parse, inside the compiled
 *    graph (repair R9). `compileStudentGraph` caches one compiled graph per deps object.
 *  - Store writes (flag log, escalation, gap count, anonymous counter) never fail a turn: each is caught
 *    and reported to `onWriteError` (text-free); a crisis turn sets `flagWriteFailed` and still shows the
 *    fixed message + Tele-MANAS 14416 (repair R1).
 *  - crisis: the existing recall-only guard (`crisisGuard`, B9) runs on EVERY message (B24.7 "keep
 *    talking": no session lock). Any flag is treated as the higher level on the student surface
 *    (unsure/indirect/Hinglish count high, B24.7). The flagged turn gets the fixed safe message
 *    (Tele-MANAS 14416, Nights mode `tele-manas-disclosed`), a text-free flag log record, and, for an
 *    authenticated student, the existing escalation path (`escalate` port -> escalateTurns). Anonymous:
 *    the anonymous fixed message and the text-free counter only. No KB or model call on a flagged turn.
 *  - route: anonymous -> rule-based personal/generic classifier (fail closed -> sign_in_required);
 *    authenticated -> rule-based intent -> a tool/feature from the capability manifest (A21(b)).
 *  - answer (answer_from_kb): `search_kb` first; `ask_knowledge_base` only when search is insufficient
 *    (0 hits with score >= threshold [ASSUMPTION]) and never in anonymous mode; the /ask serve rule is
 *    re-checked here (answered + internal sources + no web); the model writes claims over the evidence;
 *    the claims guard, the source-kind rules and the default-deny no-quote guard run on them. No sourced
 *    claim left -> the fixed no-answer + one gap count (authenticated) / counter (anonymous).
 *  - coach: SOP/essay requests become coaching (B1 student scope); a draft-shaped model reply is never
 *    shown (deterministic coaching fallback); coaching questions pass the existing no-script guard.
 *  - tool: a non-KB feature (profile, ranking, export/erasure, coverage, freshness, channel switch) is
 *    returned as `selectedTool` for the API layer (U6b/U8) to execute; the graph does not do it itself.
 *
 * The provider is any LlmProvider; production passes the configured FailoverProvider (B6). A provider
 * failure is the apology + `retryable` (A12), never a guessed answer.
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { LlmProvider } from "@vc/providers";
import { TurnResponseSchema, type Claim, type TurnResponse } from "@vc/schemas";
import { crisisGuard, type CrisisLevel } from "../guards/crisis.js";
import { noScriptGuard } from "../guards/no-script.js";
import { findPersonalIdentifiers, hasVerbatimRun, noQuoteGuard, type SpeakersFile } from "../guards/no-quote.js";
import { loadSkill } from "../skills/loader.js";
import { classifyIntent, classifyQuestion, type StudentIntentTool } from "./classify.js";
import {
  DEFAULT_STALE_AFTER_MONTHS,
  countriesIn,
  guardClaims,
  type AskToolOutput,
  type GuardedClaim,
  type SearchHit,
  type SourceKind,
  type StudentKbPort,
} from "./claims.js";

// ---------------------------------------------------------------------------
// Fixed texts (B24.2, B24.7, A12)
// ---------------------------------------------------------------------------

/** Same text as mcp/university-kb NO_SOURCED_ANSWER_TEXT (a test keeps them equal). */
export const NO_SOURCED_ANSWER_TEXT = "I don't have a sourced answer for this yet.";
export const PROVIDER_APOLOGY_TEXT = "Sorry, I couldn't put an answer together just now. Please try again.";
export const SIGN_IN_REQUIRED_TEXT =
  "This sounds like a question about your own situation. Please sign in through Pathlynks so I can help with it properly.";
export const TELE_MANAS_LINE = "If things feel heavy, Tele-MANAS on 14416 is free and open 24x7.";

const CRISIS_CORE =
  "I'm really glad you told me. What you're going through matters, and you deserve support right now. " +
  "Please call Tele-MANAS on 14416. It is free, open 24x7, and the people there are trained for exactly this " +
  "(Tele-MANAS: 14416, मुफ़्त, 24x7). I'm an AI guide, not a counsellor, and no counsellor from our side is " +
  "being connected right now, so Tele-MANAS is the best next step. If you are in danger right now, please tell " +
  "a trusted adult near you.";

/** Authenticated student, Nights mode `tele-manas-disclosed` (qa/gates/nights.md): asks for the safe adult. */
export const STUDENT_CRISIS_MESSAGE =
  `${CRISIS_CORE} Who is a safe adult you could talk to today, like a parent, relative or teacher? ` +
  "I'm still here, and you can keep talking to me.";

/** Anonymous mode: the same hand-off, no identity questions. */
export const ANONYMOUS_CRISIS_MESSAGE = `${CRISIS_CORE} I'm still here, and you can keep talking to me.`;

/** B24.7 / A11b forbidden list: none of these may ever reach a student after a flag. */
export const CRISIS_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\b(secret|secrecy|confidential)\b/i,
  /\bbetween (us|you and me)\b/i,
  /\b(won'?t|will not|never) tell (anyone|anybody|your|them)\b/i,
  /\bnothing (bad )?will happen to you\b/i,
  /\b(lethal|lethality|overdose|dosage|dose)\b/i,
  /\bhow (to|many|much)\b.{0,40}\b(pills?|tablets?|hang|cut|jump|poison)\b/i,
  /\b(therapy|therapist|therapeutic|psychotherapy)\b/i,
  /\b(a|our|the|your) counsellor (will|is going to) (call|contact|reach|join|be with)\b/i,
  /\bcounsellor (is|will be) (on the way|coming|calling)\b/i,
];

const violatesCrisisRules = (text: string) => CRISIS_FORBIDDEN_PATTERNS.some((p) => p.test(text));

const COACH_FALLBACK =
  "I can't write it for you, but I can help you write a strong one yourself. Let's start with your own material: " +
  "What moment or experience made you choose this field? Which project or achievement are you proudest of, and what " +
  "exactly did you do in it? What do you want to do after this course, and how does this programme get you there? " +
  "Send me your answers or your own draft and I'll give feedback on structure and clarity.";

const TOOL_MESSAGES: Record<Exclude<StudentToolName, "search_kb" | "ask_knowledge_base" | "get_session" | "coach_draft_feedback">, string> = {
  kb_source_detail: "Here is where my last answer came from.",
  source_freshness: "Here are the dates of the sources behind my last answer, and whether any are old.",
  coverage: "Here is what I have sourced answers for so far, and what is not covered yet.",
  rank_options: "Let me compare those options against the profile facts you have confirmed.",
  profile_view: "Here is what I know about you, and where each fact came from.",
  profile_confirm: "Thanks, I'll mark that as confirmed by you.",
  profile_correct: "Thanks, tell me the correct value and I'll update it.",
  data_export: "I'll prepare an export of your data.",
  data_erasure: "I can erase your data. You'll be asked to confirm first.",
  channel_switch: "Sure, you can switch between text and voice on this same conversation.",
};

// ---------------------------------------------------------------------------
// Capability manifest (A21(c), B1(d))
// ---------------------------------------------------------------------------

export type StudentToolName = StudentIntentTool | "ask_knowledge_base" | "get_session";

export interface StudentTool {
  name: StudentToolName;
  /** Executed by this graph (KB tools, coaching) or returned for the API layer to execute. */
  executedBy: "graph" | "api";
  anonymous: boolean;
}

/** Every tool/feature registered in the student graph. Must equal skills/vc-capabilities/SKILL.md. */
export const STUDENT_TOOLS: readonly StudentTool[] = [
  { name: "search_kb", executedBy: "graph", anonymous: true },
  { name: "ask_knowledge_base", executedBy: "graph", anonymous: false },
  { name: "get_session", executedBy: "graph", anonymous: false },
  { name: "kb_source_detail", executedBy: "api", anonymous: false },
  { name: "source_freshness", executedBy: "api", anonymous: false },
  { name: "coverage", executedBy: "api", anonymous: false },
  { name: "rank_options", executedBy: "api", anonymous: false },
  { name: "profile_view", executedBy: "api", anonymous: false },
  { name: "profile_confirm", executedBy: "api", anonymous: false },
  { name: "profile_correct", executedBy: "api", anonymous: false },
  { name: "data_export", executedBy: "api", anonymous: false },
  { name: "data_erasure", executedBy: "api", anonymous: false },
  { name: "channel_switch", executedBy: "api", anonymous: false },
  { name: "coach_draft_feedback", executedBy: "graph", anonymous: false },
];

export const CAPABILITY_MANIFEST_SKILL = "vc-capabilities";
export const KB_ANSWER_SKILL = "kb-answer";

/** Tool names from the manifest's table rows (`| \`tool\` | ... |`). */
export function parseCapabilityManifest(body: string): Set<string> {
  const names = new Set<string>();
  for (const m of body.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)) names.add(m[1]!);
  return names;
}

function assertManifestMatches(body: string): void {
  const manifest = parseCapabilityManifest(body);
  const registered = new Set(STUDENT_TOOLS.map((t) => t.name as string));
  const missing = [...registered].filter((n) => !manifest.has(n));
  const extra = [...manifest].filter((n) => !registered.has(n));
  if (missing.length || extra.length) {
    throw new Error(`capability manifest drift (skills/${CAPABILITY_MANIFEST_SKILL}/SKILL.md): missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
  }
}

// ---------------------------------------------------------------------------
// Draft detection (A21(a))
// ---------------------------------------------------------------------------

/** Essay/SOP-shaped text: long prose, a salutation, a sign-off, or a document heading over prose. */
export function isDraftLike(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 150) return true;
  if (/^\s*(dear|respected|to whom it may concern)\b/im.test(text)) return true;
  if (/^\s*(sincerely|yours (sincerely|faithfully|truly)|warm regards|best regards|regards),?\s*$/im.test(text)) return true;
  if (/^\s*(statement of purpose|personal statement|motivation letter|cover letter|essay)\s*:?\s*$/im.test(text) && words > 40) return true;
  const firstPersonSentences = text.split(/(?<=[.!?])\s+/).filter((s) => /^(I|My)\b/.test(s.trim())).length;
  return firstPersonSentences >= 3 && words > 80;
}

// ---------------------------------------------------------------------------
// Deps, input, result
// ---------------------------------------------------------------------------

export interface StudentGraphConfig {
  /** A /search hit counts only at or above this score [ASSUMPTION: 1.0, from the U2 fixture score range]. */
  searchScoreThreshold: number;
  /** Max hits offered to the model as evidence. */
  maxEvidence: number;
  staleAfterMonths: number;
}
export const DEFAULT_SEARCH_SCORE_THRESHOLD = 1.0;
const DEFAULT_CONFIG: StudentGraphConfig = {
  searchScoreThreshold: DEFAULT_SEARCH_SCORE_THRESHOLD,
  maxEvidence: 5,
  staleAfterMonths: DEFAULT_STALE_AFTER_MONTHS,
};

/** B24.7 flag log record: ids, time, level and action only, never transcript text. */
export interface CrisisFlagRecord {
  tenantId: string;
  studentId: string;
  threadId: string;
  turnId: string;
  at: string;
  level: "crisis";
  action: "fixed_message_tele_manas_disclosed";
}

/** B24.2 gap count: one per authenticated no-answer turn; ids and time only. */
export interface GapRecord {
  tenantId: string;
  studentId: string;
  threadId: string;
  turnId: string;
  at: string;
}

export type AnonymousCounterKind = "answered" | "no_answer" | "sign_in_required" | "crisis";

export interface StudentGraphDeps {
  kb: StudentKbPort;
  provider: LlmProvider;
  skillsDir: string;
  speakers: SpeakersFile;
  config?: Partial<StudentGraphConfig>;
  now?: () => Date;
  recordGap?: (gap: GapRecord) => Promise<void>;
  logFlag?: (record: CrisisFlagRecord) => Promise<void>;
  /** The existing escalation path (production: `(i) => escalateTurns(db, i, escalationDeps)`). */
  escalate?: (input: { sessionId: string; studentId: string; turns: { turnId: string; speaker: string; lang: string; text: string; translatedText: string }[] }) => Promise<unknown>;
  /** The anonymous text-free aggregate counter (B24.6); U7 wires the single counter writer. */
  countAnonymous?: (kind: AnonymousCounterKind) => Promise<void>;
  /** A store write failed (never transcript text: only which write). Default: a text-free console.warn. */
  onWriteError?: (write: StudentWriteKind, error: unknown) => void;
}

export type StudentWriteKind = "flag_log" | "escalate" | "gap" | `counter:${AnonymousCounterKind}`;

const StudentAuthSchema = z
  .object({
    role: z.literal("student"),
    studentId: z.string().min(1).max(128),
    tenantId: z.string().min(1).max(128),
  })
  .strict();
export type StudentAuth = z.infer<typeof StudentAuthSchema>;

export const MAX_STUDENT_TEXT = 4000;
const TextSchema = z.string().min(1).max(MAX_STUDENT_TEXT);
const StudentTurnInputSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("authenticated"),
      auth: StudentAuthSchema,
      threadId: z.string().min(1).max(128),
      turnId: z.string().min(1).max(128),
      text: TextSchema,
      priorFlagInThread: z.boolean().optional(),
    })
    .strict(),
  z.object({ mode: z.literal("anonymous"), text: TextSchema }).strict(),
]);
export type StudentTurnInput = z.infer<typeof StudentTurnInputSchema>;

export class StudentAuthRequiredError extends Error {
  constructor() {
    super("A verified student identity (role student, studentId, tenantId) is required on the student surface (B21, B24.5).");
    this.name = "StudentAuthRequiredError";
  }
}

/** The identity is fine but the turn input is not (empty / over-long text, unknown fields). Repair R7. */
export class StudentInputInvalidError extends Error {
  constructor() {
    super(`The student turn input is invalid (text must be 1..${MAX_STUDENT_TEXT} characters).`);
    this.name = "StudentInputInvalidError";
  }
}

/** A crisis phrase in the raw text (first MAX chars) of an input that fails validation: the input to
 *  run the crisis path with (the authenticated one when only the text was wrong, else anonymous). */
function salvageCrisisInput(raw: unknown): StudentTurnInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string" || !r.text) return undefined;
  const scan = r.text.slice(0, MAX_STUDENT_TEXT);
  if (crisisGuard(scan).level === "none") return undefined;
  const same = StudentTurnInputSchema.safeParse({ ...r, text: scan });
  return same.success ? same.data : { mode: "anonymous", text: scan };
}

function invalidInputError(raw: unknown): Error {
  if (raw && typeof raw === "object" && StudentTurnInputSchema.safeParse({ ...(raw as object), text: "x" }).success) return new StudentInputInvalidError();
  return new StudentAuthRequiredError();
}

export interface StudentTurnResult {
  response: TurnResponse;
  selectedTool?: StudentToolName;
  /** A12: the provider chain failed; the client shows the apology with a Retry. */
  retryable?: boolean;
  /** The guard's own level before the student-surface "higher level" mapping. */
  guardLevel?: CrisisLevel;
  claimSourceKinds: SourceKind[];
  /** A flag-log or escalation write failed; the fixed message was still shown. */
  flagWriteFailed?: boolean;
}

const KbAnswerOutputSchema = z.object({
  claims: z
    .array(z.object({ text: z.string().min(1).max(2000), kind: z.enum(["number", "country", "fact"]), sourceIds: z.array(z.string()).max(20) }))
    .max(20),
  followUp: z.string().max(500).optional(),
});
const CoachOutputSchema = z.object({ reply: z.string().max(8000), questions: z.array(z.string().max(500)).max(6) });

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

const last = <T>() => Annotation<T>({ reducer: (_prev: T, next: T) => next, default: () => undefined as T });

export const StudentTurnState = Annotation.Root({
  /** The unvalidated turn input; the gate validates it into `input`. */
  raw: last<unknown>(),
  input: last<StudentTurnInput>(),
  tool: last<StudentToolName | undefined>(),
  result: last<StudentTurnResult | undefined>(),
});
type State = typeof StudentTurnState.State;

export const STUDENT_NODES = { gate: "gate", crisis: "crisis", route: "route", answer: "answer_from_kb", coach: "coach", tool: "feature_tool", finish: "finish" } as const;

const emptyResponse = (input: StudentTurnInput, state: TurnResponse["state"], message: string): TurnResponse => ({
  ...(input.mode === "authenticated" ? { turnId: input.turnId } : {}),
  state,
  message,
  claims: [],
  sources: [],
  profileFactsUsed: [],
});

const isDevanagari = (t: string) => /[ऀ-ॿ]/.test(t);

export function buildStudentGraph(deps: StudentGraphDeps) {
  const config: StudentGraphConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const now = deps.now ?? (() => new Date());
  const manifestPrompt = loadSkill(deps.skillsDir, CAPABILITY_MANIFEST_SKILL);
  assertManifestMatches(manifestPrompt);
  const kbAnswerPrompt = loadSkill(deps.skillsDir, KB_ANSWER_SKILL);

  const onWriteError =
    deps.onWriteError ?? ((write: StudentWriteKind, error: unknown) => console.warn(`[student-graph] ${write} write failed (${error instanceof Error ? error.name : typeof error})`));

  /** Repair R1: a store write never fails the turn. Returns false when the write threw. */
  const safeWrite = async (write: StudentWriteKind, fn: (() => Promise<unknown>) | undefined): Promise<boolean> => {
    if (!fn) return true;
    try {
      await fn();
      return true;
    } catch (err) {
      try {
        onWriteError(write, err);
      } catch {
        // the error reporter itself must not fail the turn either
      }
      return false;
    }
  };
  const count = (kind: AnonymousCounterKind) => safeWrite(`counter:${kind}`, deps.countAnonymous ? () => deps.countAnonymous!(kind) : undefined);

  const finish = (input: StudentTurnInput, result: StudentTurnResult): StudentTurnResult => {
    let response = result.response;
    if (input.mode === "authenticated" && input.priorFlagInThread && response.state === "ok") {
      response = { ...response, message: `${response.message ?? ""} ${TELE_MANAS_LINE}`.trim() };
    }
    return { ...result, response: TurnResponseSchema.parse(response) };
  };

  const builder = new StateGraph(StudentTurnState)
    .addNode(STUDENT_NODES.gate, (s: State) => {
      const raw = s.raw !== undefined ? s.raw : s.input;
      const parsed = StudentTurnInputSchema.safeParse(raw);
      if (parsed.success) return { input: parsed.data };
      // Repair R7: crisis first, before validation (an over-long crisis message is still a crisis).
      const salvaged = salvageCrisisInput(raw);
      if (salvaged) return { input: salvaged };
      throw invalidInputError(raw);
    })
    .addNode(STUDENT_NODES.crisis, async (s: State) => {
      const input = s.input;
      const guard = crisisGuard(input.text);
      if (guard.level === "none") return {};
      // B24.7: unsure / indirect / Hinglish count as the higher level; with no connected counsellor on
      // the student surface every flag is handled as crisis.
      if (input.mode === "anonymous") {
        const counted = await count("crisis");
        return {
          result: {
            response: emptyResponse(input, "escalated", ANONYMOUS_CRISIS_MESSAGE),
            guardLevel: guard.level,
            claimSourceKinds: [],
            ...(counted ? {} : { flagWriteFailed: true }),
          },
        };
      }
      const logged = await safeWrite(
        "flag_log",
        deps.logFlag
          ? () =>
              deps.logFlag!({
                tenantId: input.auth.tenantId,
                studentId: input.auth.studentId,
                threadId: input.threadId,
                turnId: input.turnId,
                at: now().toISOString(),
                level: "crisis",
                action: "fixed_message_tele_manas_disclosed",
              })
          : undefined,
      );
      const escalated = await safeWrite(
        "escalate",
        deps.escalate
          ? () =>
              deps.escalate!({
                sessionId: input.threadId,
                studentId: input.auth.studentId,
                turns: [{ turnId: input.turnId, speaker: "student", lang: isDevanagari(input.text) ? "hi" : "en", text: input.text, translatedText: input.text }],
              })
          : undefined,
      );
      return {
        result: {
          response: emptyResponse(input, "escalated", STUDENT_CRISIS_MESSAGE),
          guardLevel: guard.level,
          claimSourceKinds: [],
          ...(logged && escalated ? {} : { flagWriteFailed: true }),
        },
      };
    })
    .addNode(STUDENT_NODES.route, async (s: State) => {
      const input = s.input;
      if (input.mode === "anonymous") {
        if (classifyQuestion(input.text).class !== "generic") {
          await count("sign_in_required");
          return { result: { response: emptyResponse(input, "sign_in_required", SIGN_IN_REQUIRED_TEXT), claimSourceKinds: [] } };
        }
        return { tool: "search_kb" as const };
      }
      return { tool: classifyIntent(input.text) };
    })
    .addNode(STUDENT_NODES.answer, async (s: State) => ({ result: await answerFromKb(s.input) }))
    .addNode(STUDENT_NODES.coach, async (s: State) => ({ result: await coach(s.input) }))
    .addNode(STUDENT_NODES.tool, (s: State) => {
      const tool = s.tool as keyof typeof TOOL_MESSAGES;
      return { result: { response: emptyResponse(s.input, "ok", TOOL_MESSAGES[tool]), selectedTool: tool, claimSourceKinds: [] } };
    })
    .addNode(STUDENT_NODES.finish, (s: State) => {
      if (!s.result) throw new Error("student graph reached finish without a result");
      return { result: finish(s.input, s.result) };
    })
    .addEdge(START, STUDENT_NODES.gate)
    .addEdge(STUDENT_NODES.gate, STUDENT_NODES.crisis)
    .addConditionalEdges(STUDENT_NODES.crisis, (s: State) => (s.result ? STUDENT_NODES.finish : STUDENT_NODES.route), [STUDENT_NODES.route, STUDENT_NODES.finish])
    .addConditionalEdges(
      STUDENT_NODES.route,
      (s: State) => (s.result ? STUDENT_NODES.finish : s.tool === "search_kb" ? STUDENT_NODES.answer : s.tool === "coach_draft_feedback" ? STUDENT_NODES.coach : STUDENT_NODES.tool),
      [STUDENT_NODES.answer, STUDENT_NODES.coach, STUDENT_NODES.tool, STUDENT_NODES.finish],
    )
    .addEdge(STUDENT_NODES.answer, STUDENT_NODES.finish)
    .addEdge(STUDENT_NODES.coach, STUDENT_NODES.finish)
    .addEdge(STUDENT_NODES.tool, STUDENT_NODES.finish)
    .addEdge(STUDENT_NODES.finish, END);

  async function noAnswer(input: StudentTurnInput): Promise<StudentTurnResult> {
    if (input.mode === "authenticated") {
      const gap: GapRecord = { tenantId: input.auth.tenantId, studentId: input.auth.studentId, threadId: input.threadId, turnId: input.turnId, at: now().toISOString() };
      await safeWrite("gap", deps.recordGap ? () => deps.recordGap!(gap) : undefined);
    } else {
      await count("no_answer");
    }
    return { response: emptyResponse(input, "no_sourced_answer", NO_SOURCED_ANSWER_TEXT), selectedTool: "search_kb", claimSourceKinds: [] };
  }

  /** Repair R3: a follow-up question is shown only when it is plainly a question with no facts in it. */
  function safeFollowUp(raw: string | undefined, restricted: { texts: string[]; labels: string[] }): string | undefined {
    const f = raw?.trim();
    if (!f || !f.endsWith("?")) return undefined;
    if (/\p{N}/u.test(f)) return undefined;
    if (countriesIn(f).length > 0) return undefined;
    if (findPersonalIdentifiers(f, deps.speakers, restricted.labels).length > 0) return undefined;
    if (restricted.texts.some((t) => hasVerbatimRun(f, t))) return undefined;
    return noQuoteGuard(f, deps.speakers, restricted.labels).text;
  }

  async function answerFromKb(input: StudentTurnInput): Promise<StudentTurnResult> {
    const authenticated = input.mode === "authenticated";
    // Anonymous: structurally search-only, whatever the port offers (A15c, B24.6).
    const searchKb = deps.kb.searchKb.bind(deps.kb);
    const askKb = authenticated ? deps.kb.askKnowledgeBase?.bind(deps.kb) : undefined;
    const getSession = authenticated ? deps.kb.getSession?.bind(deps.kb) : undefined;

    let hits: SearchHit[] = [];
    try {
      const search = await searchKb(input.text);
      if (search.status === "ok") {
        hits = search.hits
          .filter((h) => h.score >= config.searchScoreThreshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, config.maxEvidence);
      }
    } catch {
      hits = [];
    }

    let ask: AskToolOutput | undefined;
    if (hits.length === 0) {
      if (!askKb) return noAnswer(input);
      try {
        ask = await askKb(input.text);
      } catch {
        return noAnswer(input);
      }
      // Serve rule re-checked on the engine side: only an answered /ask with internal sources and no web.
      if (ask.status !== "answered" || ask.citations.internal.length === 0 || ask.citations.web.length > 0) return noAnswer(input);
    }

    const evidence =
      hits.length > 0
        ? hits.map((h) => ({ id: h.turnId, kind: "search" as const, text: h.text, sourceKind: h.sourceKind, sessionDate: h.sessionDate }))
        : ask!.citations.internal.map((n) => ({ id: n.node_id, kind: "ask" as const, text: ask!.answer, sourceKind: "unknown" as const }));

    let draft: z.infer<typeof KbAnswerOutputSchema>;
    try {
      draft = await deps.provider.generate({
        skillName: KB_ANSWER_SKILL,
        skillPrompt: kbAnswerPrompt,
        outputSchema: KbAnswerOutputSchema,
        input: { question: input.text, evidence, priorFlag: authenticated ? Boolean(input.priorFlagInThread) : false },
      });
    } catch {
      return { response: emptyResponse(input, "ok", PROVIDER_APOLOGY_TEXT), selectedTool: "search_kb", retryable: true, claimSourceKinds: [] };
    }

    const guarded = await guardClaims(draft.claims, {
      hits,
      ...(ask ? { ask } : {}),
      ...(getSession ? { getSession } : {}),
      now: now(),
      staleAfterMonths: config.staleAfterMonths,
      speakers: deps.speakers,
    });
    // D-092: anonymous mode never shows an unverified claim; authenticated mode flags it (spec item 4).
    const shown = authenticated ? guarded.claims : guarded.claims.filter((c) => c.status !== "unverified");
    if (!shown.some((c) => c.status !== "unverified")) return noAnswer(input);

    const followUp = safeFollowUp(draft.followUp, guarded.restricted);
    let message = [...shown.map((c) => (c.status === "unverified" ? `${c.text} (unverified)` : c.text)), ...(followUp ? [followUp] : [])].join(" ");
    // Repair R2a: the FINAL message is checked against every restricted text of the turn (fail closed).
    if (guarded.restricted.texts.some((t) => hasVerbatimRun(message, t))) return noAnswer(input);
    message = noQuoteGuard(message, deps.speakers, guarded.restricted.labels).text;
    if (authenticated && input.priorFlagInThread && violatesCrisisRules(message)) {
      return { response: emptyResponse(input, "ok", STUDENT_CRISIS_MESSAGE), selectedTool: "search_kb", claimSourceKinds: [] };
    }
    if (!authenticated) await count("answered");
    const claims: Claim[] = shown.map(({ text, kind, sourceIds, status }: GuardedClaim) => ({ text, kind, sourceIds, status }));
    const cited = new Set(shown.flatMap((c) => c.sourceIds));
    return {
      response: { ...(authenticated ? { turnId: input.turnId } : {}), state: "ok", message, claims, sources: guarded.sources.filter((s) => cited.has(s.id)), profileFactsUsed: [] },
      selectedTool: ask ? "ask_knowledge_base" : "search_kb",
      claimSourceKinds: shown.map((c) => c.sourceKind),
    };
  }

  async function coach(input: StudentTurnInput): Promise<StudentTurnResult> {
    let message = COACH_FALLBACK;
    try {
      const out = await deps.provider.generate({
        skillName: CAPABILITY_MANIFEST_SKILL,
        skillPrompt: manifestPrompt,
        outputSchema: CoachOutputSchema,
        input: { request: input.text, mode: "coach_draft_feedback" },
      });
      // Existing B1 no-script guard: each coaching question must be a genuine question.
      const questions = out.questions.map((q) => q.trim()).filter((q) => q && noScriptGuard({ type: "clarify", prompt: q }).ok);
      const candidate = [out.reply.trim(), ...questions].filter(Boolean).join(" ");
      if (!isDraftLike(out.reply) && !isDraftLike(candidate) && questions.length >= 2) message = candidate;
    } catch {
      message = COACH_FALLBACK;
    }
    message = noQuoteGuard(message, deps.speakers).text;
    if (input.mode === "authenticated" && input.priorFlagInThread && violatesCrisisRules(message)) message = COACH_FALLBACK;
    return { response: emptyResponse(input, "ok", message), selectedTool: "coach_draft_feedback", claimSourceKinds: [] };
  }

  return builder;
}

export type CompiledStudentGraph = ReturnType<ReturnType<typeof buildStudentGraph>["compile"]>;
const compiledByDeps = new WeakMap<StudentGraphDeps, CompiledStudentGraph>();

/**
 * The compiled student graph for these deps, compiled once and cached per deps object (repair R9).
 * Invoke with `{ raw: <unvalidated turn input> }`; the gate validates it and the finish node applies
 * the prior-flag suffix and the TurnResponse schema. Deps are treated as immutable once compiled.
 */
export function compileStudentGraph(deps: StudentGraphDeps): CompiledStudentGraph {
  let graph = compiledByDeps.get(deps);
  if (!graph) {
    graph = buildStudentGraph(deps).compile();
    compiledByDeps.set(deps, graph);
  }
  return graph;
}

/** Runs one student turn end to end through the compiled graph (gate validation -> ... -> finish). */
export async function runStudentTurn(deps: StudentGraphDeps, rawInput: unknown): Promise<StudentTurnResult> {
  const out = await compileStudentGraph(deps).invoke({ raw: rawInput });
  if (!out.result) throw new Error("student graph ended without a result");
  return out.result;
}
