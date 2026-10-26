/**
 * P1 U6: the live student turn graph (LangGraph.js 1.x StateGraph, H1/D-002), contract B24 / spec v8
 * plan row U6. One invocation = one student turn. Nodes:
 *
 *   gate -> crisis -> route -> { answer | coach | tool } -> finish -> END
 *
 *  - gate: takes the RAW input. The crisis guard scans the FULL raw text BEFORE schema validation, so an
 *    over-long or malformed crisis message still gets the fixed safe message (repair R7; U6h L5: a crisis
 *    phrase anywhere in an over-long text counts, and the escalated excerpt is the window that carries it). Otherwise authenticated mode needs a verified student identity (role `student`, studentId,
 *    tenantId; the JWT itself is verified by the API layer, U8/B21): a bad identity throws
 *    StudentAuthRequiredError, any other invalid input StudentInputInvalidError, before any KB or model
 *    call. Pathlynks-authenticated = consented (B4, D-086): no consent row.
 *  - finish: the prior-flag Tele-MANAS suffix and the TurnResponse schema parse, inside the compiled
 *    graph (repair R9). U6h M4: "prior flag in this thread" is derived server-side (the `hasPriorFlag` port
 *    plus the flags this graph raised itself); the caller-supplied `priorFlagInThread` is ignored. `compileStudentGraph` caches one compiled graph per deps object.
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
 *    re-checked here (`isServedAsk`: answered, verdict correct, insufficient_coverage false, internal
 *    sources, no web - U6h P4); WhatsApp/unknown hit text and the /ask answer are redacted of names and
 *    phones BEFORE they go to the model (U6h M3); the model writes claims over the evidence; the claims
 *    guard, the source-kind rules and the default-deny no-quote guard run on them. No sourced
 *    claim left -> the fixed no-answer + one gap count (authenticated) / counter (anonymous).
 *  - coach: SOP/essay requests become coaching (B1 student scope); a draft-shaped model reply is never
 *    shown (deterministic coaching fallback); coaching questions pass the existing no-script guard; a
 *    sentence or question that carries a number or a country is dropped from the reply (U6h M4).
 *  - tool: a non-KB feature (profile, ranking, export/erasure, coverage, freshness, channel switch) is
 *    returned as `selectedTool` for the API layer (U6b/U8) to execute; the graph does not do it itself.
 *
 * The provider is any LlmProvider; production passes the configured FailoverProvider (B6). A provider
 * failure is the apology + `retryable` (A12), never a guessed answer.
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { GroundedAnswerer, GroundedSource, LlmProvider } from "@vc/providers";
import { TurnResponseSchema, type Claim, type Source, type TurnResponse } from "@vc/schemas";
import { STRESS_CHECK_IN, crisisGuard, stressSignal, type CrisisLevel } from "../guards/crisis.js";
import { CONCERN_CLASSIFIER_SKILL, safetyScreen, type SafetyScreenVerdict, type Severity } from "../guards/concern-classifier.js";
import { noScriptGuard } from "../guards/no-script.js";
import { findPersonalIdentifiers, hasVerbatimRun, noQuoteGuard, redactPersonalIdentifiers, type SpeakersFile } from "../guards/no-quote.js";
import { loadSkill } from "../skills/loader.js";
import {
  ANONYMOUS_CRISIS_MESSAGE,
  ANONYMOUS_NO_ANSWER_TEXT,
  ANONYMOUS_SIGN_IN_TEXT,
  CRISIS_MESSAGES,
  DEFAULT_REPLY_LANGS,
  GENERAL_GUIDANCE_PROMPT,
  GENERAL_GUIDANCE_TIMEOUT_MS,
  GROUNDED_GUIDANCE_PROMPT,
  HELPLINE_GLOSS,
  HELPLINE_LINE_EN_HI,
  LANG_DETECT_TIMEOUT_MS,
  NO_SOURCED_ANSWER_TEXT,
  PROVIDER_APOLOGY_TEXT,
  SIGN_IN_REQUIRED_TEXT,
  STUDENT_CRISIS_MESSAGE,
  TELE_MANAS_LINE,
  crisisMessageFor,
  detectLanguageOffline,
  fixedText,
  generalGuidance,
  groundedGuidance,
  hasExplicitLink,
  isNonEnglish,
  isOutOfScopeQuestion,
  redactStudentDetails,
  isOutsideAllowList,
  countriesInLocalized,
  localizedClaimText,
  replyLangIs,
  resolveReplyLang,
  rewriteToEnglishQuery,
  type CrisisCatalog,
  type DetectedLanguage,
  type LanguageDetector,
  type ReplyLang,
} from "./lang.js";
import { classifyIntent, classifyQuestion, type StudentIntentTool } from "./classify.js";
import { NAVIGATE_UNKNOWN_TEXT, navigateSteps, type NavCatalogue } from "../tools/navigate.js";
import {
  DEFAULT_STALE_AFTER_MONTHS,
  countriesIn,
  numberMentions,
  guardClaims,
  isServedAsk,
  type AskToolOutput,
  type GuardedClaim,
  type SearchHit,
  type SourceKind,
  type StudentKbPort,
} from "./claims.js";

// ---------------------------------------------------------------------------
// Fixed texts (B24.2, B24.7, A12)
// ---------------------------------------------------------------------------

// The fixed texts and the crisis messages now live in ./lang.ts (the fixed-text catalog, LK4 / D-105); re-exported so every
// existing importer (`@vc/engine`, tests) keeps the same names.
export {
  NO_SOURCED_ANSWER_TEXT,
  PROVIDER_APOLOGY_TEXT,
  SIGN_IN_REQUIRED_TEXT,
  TELE_MANAS_LINE,
  ANONYMOUS_SIGN_IN_TEXT,
  ANONYMOUS_NO_ANSWER_TEXT,
  STUDENT_CRISIS_MESSAGE,
  ANONYMOUS_CRISIS_MESSAGE,
};

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
  // LK10 C4: Hindi (Devanagari) and Hinglish forms (spec section 6). JS \b is ASCII-only, so Devanagari uses Unicode letter/mark lookarounds.
  // secret / confidential
  /(?<![\p{L}\p{M}])(?:गुप्त|गोपनीय|सीक्रेट|कॉन्फ(?:\u093C|\u095E)?िडेंशियल|राज\u093C?|राज\u095B)(?![\p{L}\p{M}])/u,
  /\b(?:gupt|gopniya|gopaniya|raa?z)\b/i,
  // between us
  /(?:हमारे|हम दोनों के)\s*बीच/u,
  /\b(?:hamare|humare|hum dono ke)\s+beech\b/i,
  // "won't tell anyone"
  /किसी\s*(?:को|से)\s*(?:भी\s*)?नहीं\s*(?:बताऊँ|बताऊं|बताउँ|बताउं|कहूँ|कहूं)/u,
  /\bkisi\s+(?:ko|se)\s+(?:bhi\s+)?(?:nahi|nahin)\s+(?:bata|kah|keh)(?:unga|ungi|oonga|oongi|ounga|aungi)\b/i,
  // nothing will happen to you
  /(?:आपको|तुम्हें|तुझे)\s*कुछ\s*(?:भी\s*)?नहीं\s*होगा/u,
  /\b(?:aapko|tumhe|tumhein|tujhe)\s+kuch\s+(?:bhi\s+)?(?:nahi|nahin)\s+hoga\b/i,
  // therapy
  /(?:थेरेपी|थैरेपी|थेरेपिस्ट|थैरेपिस्ट|मनोचिकित्सा)/u,
  // a counsellor will call / join / is on the way (the vetted "no counsellor is connecting" line must stay allowed)
  /काउंसलर\s+(?:आपको\s+)?(?:[फ\u095E]\u093C?ोन|कॉल|संपर्क)\s+(?:करेगा|करेगी|करेंगे|करेंगी)/u,
  /काउंसलर\s+(?:जल्द\s+)?(?:जुड़ेगा|जुड़ेगी|जुड़ेंगे|जुड़ेंगी|आएगा|आएगी|आएंगे|आएँगे|आ\s+रहा|आ\s+रही|आ\s+रहे)/u,
  /\bcounsellor\s+(?:aapko\s+)?(?:call|phone|fone|sampark)\s+(?:karega|karegi|karenge|karengi)\b/i,
  /\bcounsellor\s+(?:jald\s+)?(?:judega|jud\s+jayega|jud\s+jaayega|aayega|aaega|aa\s+raha|aa\s+rahi|aa\s+rahe)\b/i,
];

const FOLLOW_UP_MAX_CHARS = 200;
/** TurnResponse.message is bounded at 8000 characters (schemas/student-api.ts); the soft stress note is skipped rather than overflow it. */
const STUDENT_MESSAGE_MAX = 8000;
/** p1-nosource-grounded G1: the longest question that may leave for the web, and the most grounding links shown. */
const WEB_QUESTION_MAX_CHARS = 1000;
const WEB_SOURCES_MAX = 5;
/** The grounded call gets at most this long, so a grounded timeout plus the model-only fallback stays near half a minute. */
const GROUNDED_TIMEOUT_MAX_MS = 12_000;

const violatesCrisisRules = (text: string) => CRISIS_FORBIDDEN_PATTERNS.some((p) => p.test(text));

const COACH_FALLBACK =
  "I can't write it for you, but I can help you write a strong one yourself. Let's start with your own material: " +
  "What moment or experience made you choose this field? Which project or achievement are you proudest of, and what " +
  "exactly did you do in it? What do you want to do after this course, and how does this programme get you there? " +
  "Send me your answers or your own draft and I'll give feedback on structure and clarity.";

const TOOL_MESSAGES: Record<Exclude<StudentToolName, "search_kb" | "ask_knowledge_base" | "get_session" | "coach_draft_feedback" | PathlynksToolName | "navigate_steps">, string> = {
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
// Pathlynks port (vc-admin-control S5/S6) - the live, read-only view of the signed-in student's own Pathlynks rows
// ---------------------------------------------------------------------------

/** What a port call answers. `unavailable` = the database is down, slow, refused or not configured (never a reason text). */
export type PathlynksResult<T> = { status: "ok"; data: T } | { status: "unavailable" };

/**
 * Spec S5. Every method takes the VERIFIED student id of the turn (never an id from the message text) and must read only that student's
 * rows. The production implementation is `createPathlynksPort` (mcp/pathlynks); tests use a fake. Rows are display data only.
 */
export interface PathlynksPort {
  getStudentProfile(studentId: string): Promise<PathlynksResult<Record<string, unknown> | null>>;
  getSavedCareers(studentId: string): Promise<PathlynksResult<ReadonlyArray<Record<string, unknown>>>>;
  getCompareList(studentId: string): Promise<PathlynksResult<ReadonlyArray<Record<string, unknown>>>>;
  getAssessmentStatus(studentId: string): Promise<PathlynksResult<Record<string, unknown> | null>>;
}

export type PathlynksToolName = "pathlynks_profile" | "pathlynks_saved_careers" | "pathlynks_compare" | "pathlynks_assessment";
const PATHLYNKS_TOOLS: readonly PathlynksToolName[] = ["pathlynks_profile", "pathlynks_saved_careers", "pathlynks_compare", "pathlynks_assessment"];
const isPathlynksTool = (t: unknown): t is PathlynksToolName => PATHLYNKS_TOOLS.includes(t as PathlynksToolName);

/** The one reply when the port is down, slow, absent or returns anything but rows: no reason, no host, no SQL, no stack. */
export const PATHLYNKS_UNAVAILABLE_TEXT = "I can't see your Pathlynks data right now";
/** The reply when the message asks for another student's data. The port is not called. */
export const PATHLYNKS_OWN_DATA_ONLY_TEXT = "I can only show your own Pathlynks data, so I can't look up another student's.";
const PATHLYNKS_DEFAULT_TIMEOUT_MS = 5_000;
const PATHLYNKS_MAX_ROWS_SHOWN = 10;
const PATHLYNKS_VALUE_MAX_CHARS = 120;
const PATHLYNKS_MESSAGE_MAX = 3_000;
/** Columns never shown back, whatever the table holds. */
const PATHLYNKS_HIDDEN_KEYS = /pass|secret|token|hash|salt|student_?id|tenant|^id$|_id$/i;
const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Does the message point at someone other than the signed-in student? A fail-closed convenience for the student, NOT the isolation
 * mechanism: the port is only ever called with the verified id, so even a missed phrase returns the student's OWN rows, never another's.
 * The student's own id in the text is removed first.
 */
function namesAnotherStudent(text: string, ownStudentId: string): boolean {
  const t = text.replace(new RegExp(ownStudentId.replace(ESCAPE_REGEX, "\\$&"), "gi"), " ");
  return (
    /\b(someone|somebody|anyone|anybody)\s+else\b/i.test(t) ||
    /\b(another|other|different)\s+(student|person|user|child|kid)s?\b/i.test(t) ||
    /\b(his|her|their|friend'?s?|brother'?s?|sister'?s?|classmate'?s?|son'?s?|daughter'?s?)\b/i.test(t) ||
    /\b(?:student|user|learner|pupil|child|kid)s?[\s_-]*(?:id\b)?\s*[#:=]?\s*(?!(?:and|who|in|at|of|on|for|with|here|can|how|what|from|is|to|the|a|my|i|asking|looking|login|logged|account|id|data|profile)\b)[a-z0-9][\w-]*/i.test(t) ||
    /\b(?:stu|usr|uid)[-_]?[a-z0-9]+/i.test(t) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t) ||
    /\b\d{5,}\b/.test(t)
  );
}

const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const humanKey = (k: string) => cleanText(k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")).toLowerCase();

/**
 * G6 (answered 2026-10-26): the Pathlynks reply carries an ALLOW-LIST of columns, not a deny-list. A column that is not named here never leaves
 * this function, whatever the table holds today or adds tomorrow (phone, email, address, parent or guardian fields, dates of birth, ...).
 * Keys are compared lower-cased with every non-alphanumeric removed, so `career_name`, `careerName` and `Career Name` are one key.
 */
const PATHLYNKS_ALLOWED_COLUMNS: Record<PathlynksToolName, ReadonlySet<string>> = {
  pathlynks_saved_careers: new Set(["career", "careername", "careertitle", "name", "title", "pathway", "pathwayname", "coursename", "programname"]),
  pathlynks_compare: new Set(["career", "careername", "careertitle", "name", "title", "pathway", "pathwayname", "coursename", "programname"]),
  pathlynks_profile: new Set(["name", "firstname", "grade", "class", "classname", "standard", "stream", "board"]),
  pathlynks_assessment: new Set(["status", "assessmentstatus", "reportstatus", "report", "completed", "iscompleted", "completedon", "completedat", "progress", "assessmentname", "name", "title", "stage"]),
};
const columnKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A row as one display line: allow-listed scalar columns only, each value bounded. A single visible column shows just its value. */
function rowLine(row: unknown, allowed: ReadonlySet<string>): string | undefined {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const parts: [string, string][] = [];
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (!allowed.has(columnKey(k))) continue;
    if (PATHLYNKS_HIDDEN_KEYS.test(k)) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const value = cleanText(String(v)).slice(0, PATHLYNKS_VALUE_MAX_CHARS);
    if (value) parts.push([humanKey(k), value]);
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0]![1] : parts.map(([k, v]) => `${k}: ${v}`).join(", ");
}

function listMessage(allowed: ReadonlySet<string>, title: string, empty: string, rows: ReadonlyArray<unknown>): string {
  const lines = rows.map((r) => rowLine(r, allowed)).filter((l): l is string => l !== undefined);
  if (lines.length === 0) return empty;
  const shown = lines.slice(0, PATHLYNKS_MAX_ROWS_SHOWN).map((l, i) => `${i + 1}. ${l}`);
  const more = lines.length > shown.length ? [`...and ${lines.length - shown.length} more.`] : [];
  return [`${title}`, ...shown, ...more].join("\n");
}

function recordMessage(allowed: ReadonlySet<string>, title: string, empty: string, row: Record<string, unknown> | null): string {
  const line = row ? rowLine(row, allowed) : undefined;
  return line === undefined ? empty : `${title} ${line}`;
}

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
  // vc-admin-control S6: executed by this graph, authenticated students only (the anonymous route never reaches the tool node).
  { name: "pathlynks_profile", executedBy: "graph", anonymous: false },
  { name: "pathlynks_saved_careers", executedBy: "graph", anonymous: false },
  { name: "pathlynks_compare", executedBy: "graph", anonymous: false },
  { name: "pathlynks_assessment", executedBy: "graph", anonymous: false },
  { name: "navigate_steps", executedBy: "graph", anonymous: false },
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

/** Essay/SOP-shaped text: long prose, a salutation, a sign-off, or a document heading over prose. `maxWords` is the length bar (default 150). */
export function isDraftLike(text: string, maxWords = 150): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > maxWords) return true;
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
  /**
   * LK4 (D-105): the model-based language detector (production: `createModelLanguageDetector(chain)`). It is called only on a turn the
   * crisis guard has already cleared, never on a crisis turn. A missing, failing or slow detector falls back to the offline script test.
   */
  detectLanguage?: LanguageDetector;
  /** LK4: the reply-language allow-list (`VC_REPLY_LANGS`, see `parseReplyLangs`). Default en, hi, hi-Latn. */
  replyLangs?: readonly string[];
  /** LK4: the vetted crisis messages (default `CRISIS_MESSAGES`); a test injects its own. */
  crisisMessages?: CrisisCatalog;
  /**
   * LK5 (D-105): the model safety screen (`concern-classifier`) on every turn the crisis guard cleared. It runs in parallel with the
   * answer; nothing is released until it returns; "possible" (severity at or above `blockAt`, default the escalation line), an error,
   * a timeout or invalid output is the fixed crisis message. Absent = no screen. `authenticated` defaults to ON, `anonymous` to OFF
   * (contract A15b/B24.6 say no model sees anonymous text to classify; that question is with Umesh).
   * p1-nosource-grounded G5: anonymous "no_source" screens an anonymous turn ONLY when it reaches the no-source reply, and BEFORE the grounded / guidance
   * call (a "possible" verdict or an outage is the fixed crisis message and nothing leaves for a model or the web); true screens every cleared turn.
   */
  safetyScreen?: { provider: LlmProvider; timeoutMs?: number; blockAt?: Severity; authenticated?: boolean; anonymous?: boolean | "no_source" };
  /**
   * p1-nosource-grounded G1 (D-110 follow-up): Gemini with Google Search grounding, tried FIRST on a no-source question (flag `VC_GROUNDING=gemini`).
   * It receives the redacted question only. Absent = the D-110 model-only path. An error, a timeout (`expertTimeoutMs`), an empty or guard-failing
   * answer falls back to that path. The grounding links come back as `sources` entries of kind `web`, never inside the message.
   */
  grounding?: GroundedAnswerer;
  /** LK5: hard stop for the English search-query rewrite of a non-English turn (default 2 s); a miss searches with the original text. */
  rewriteTimeoutMs?: number;
  /** D-110: hard stop for the no-source expert answer call (default 20 s); a miss shows the fixed refusal text. */
  expertTimeoutMs?: number;
  /** The anonymous text-free aggregate counter (B24.6); U7 wires the single counter writer. */
  countAnonymous?: (kind: AnonymousCounterKind) => Promise<void>;
  /**
   * U6h M4 / fix1 M4b: has this thread already been flagged? REQUIRED. Production reads the stored (durable) flag log, so a
   * restart, a second replica or a fresh deps object cannot forget a flag. The graph derives the prior-flag state from this
   * (OR the flags it raised itself in this process, which can only add to it), never from the caller-supplied input. A read
   * that throws fails toward disclosure: the helpline line is shown. `buildStudentGraph` throws when it is missing.
   */
  hasPriorFlag: (thread: { tenantId: string; studentId: string; threadId: string }) => Promise<boolean>;
  /** A store write/read failed (never transcript text: only which one). Default: a text-free console.warn. */
  onWriteError?: (write: StudentWriteKind, error: unknown) => void;
  /**
   * vc-admin-control S5/S6: the live Pathlynks reads behind the four `pathlynks_*` tools (production: `createPathlynksPort`). Called ONLY
   * with the verified `auth.studentId` of an authenticated turn. Absent, failing, slow or malformed = the fixed PATHLYNKS_UNAVAILABLE_TEXT.
   */
  pathlynks?: PathlynksPort;
  /** Hard stop for one port call (default 5 s); an overrun is the fixed unavailable line. */
  pathlynksTimeoutMs?: number;
  /**
   * vc-admin-control S6: the stored navigation catalogue for `navigate_steps` (production: the latest `nav_catalogue` source artifact).
   * Nothing is fetched from the host site or GitHub at chat time. Absent, failing or empty = "I don't know that page yet".
   */
  navCatalogue?: () => NavCatalogue | undefined | Promise<NavCatalogue | undefined>;
}

export type StudentWriteKind = "flag_log" | "flag_read" | "escalate" | "gap" | "safety_screen" | "pathlynks" | "nav_catalogue" | `counter:${AnonymousCounterKind}`;

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
      /** Accepted for compatibility and IGNORED (U6h M4): the prior-flag state is derived server-side. */
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

/**
 * U6h L5: the text to run the crisis path with when a crisis phrase is anywhere in an over-long text: the
 * first MAX-char window (windows overlap by half) that the guard flags, so the escalated excerpt carries the
 * phrase and still fits the schema bound.
 */
function crisisWindow(text: string): string {
  if (text.length <= MAX_STUDENT_TEXT) return text;
  const step = MAX_STUDENT_TEXT / 2;
  for (let at = 0; at < text.length; at += step) {
    const w = text.slice(at, at + MAX_STUDENT_TEXT);
    if (crisisGuard(w).level !== "none") return w;
    if (at + MAX_STUDENT_TEXT >= text.length) break;
  }
  return text.slice(0, MAX_STUDENT_TEXT);
}

/** A crisis phrase anywhere in the FULL raw text of an input that fails validation (repair R7, U6h L5): the
 *  input to run the crisis path with (the authenticated one when only the text was wrong, else anonymous). */
function salvageCrisisInput(raw: unknown): { input: StudentTurnInput; level: CrisisLevel } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string" || !r.text) return undefined;
  const level = crisisGuard(r.text).level;
  if (level === "none") return undefined;
  const scan = crisisWindow(r.text);
  const same = StudentTurnInputSchema.safeParse({ ...r, text: scan });
  return { input: same.success ? same.data : { mode: "anonymous", text: scan }, level };
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
  /** H3 (internal, removed in `finish`): the reply is a no-source reply, so a safety-screen OUTAGE keeps it instead of becoming the crisis message. */
  noSourceReply?: boolean;
  /** LK4: the language detected for this turn (a crisis turn: the offline script result). */
  detectedLang?: string;
  /** LK4: the language the reply is written in: the detected language when allow-listed, else en. */
  replyLang?: ReplyLang;
}

const KbAnswerOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1).max(2000),
        /** LK5: the same claim in the reply language (absent for an English reply). */
        localized: z.string().min(1).max(2000).optional().catch(undefined),
        kind: z.enum(["number", "country", "fact"]),
        sourceIds: z.array(z.string()).max(20),
      }),
    )
    .max(20),
  followUp: z.string().max(500).optional(),
  /**
   * LK5: the language the model wrote `localized` in; anything but the language asked for means the English reply. The three LK5 fields
   * are tolerant (repair 1, ISS-383): an empty, null or over-long value becomes undefined, which is "show the English reply". `text`, `kind`
   * and `sourceIds` stay strict.
   */
  replyLang: z.string().max(16).optional().catch(undefined),
  followUpLocalized: z.string().max(500).optional().catch(undefined),
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
  /** Set by the gate when the crisis phrase was found in an over-long input (the excerpt is already crisis). */
  salvagedLevel: last<CrisisLevel | undefined>(),
  /** U6h M4: derived server-side by the route node (authenticated mode only). */
  priorFlag: last<boolean>(),
  /** LK4: set by the crisis node (offline) or the route node (model detector), attached to the result by finish. */
  detectedLang: last<string | undefined>(),
  replyLang: last<ReplyLang | undefined>(),
  /** LK5: the safety screen, started by the route node and awaited by finish (it never rejects). */
  screen: last<Promise<SafetyScreenVerdict> | undefined>(),
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

export function buildStudentGraph(deps: StudentGraphDeps) {
  // U6h fix1 M4b: the durable prior-flag read is not optional. A JS caller or a cast that leaves it out gets a loud failure here,
  // not a graph that quietly trusts process memory.
  if (typeof deps.hasPriorFlag !== "function") throw new Error("StudentGraphDeps.hasPriorFlag is required (the durable crisis-flag read)");
  const config: StudentGraphConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const now = deps.now ?? (() => new Date());
  const replyLangs = deps.replyLangs ?? DEFAULT_REPLY_LANGS;
  const crisisMessages = deps.crisisMessages ?? CRISIS_MESSAGES;
  /** LK4: the model detector with a hard stop; any failure or overrun is the offline script result (the turn never waits on it). */
  const detectLanguage = async (text: string): Promise<DetectedLanguage> => {
    if (!deps.detectLanguage) return detectLanguageOffline(text);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const guard = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), LANG_DETECT_TIMEOUT_MS + 500);
      });
      return (await Promise.race([deps.detectLanguage(text), guard])) ?? detectLanguageOffline(text);
    } catch {
      return detectLanguageOffline(text);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const manifestPrompt = loadSkill(deps.skillsDir, CAPABILITY_MANIFEST_SKILL);
  assertManifestMatches(manifestPrompt);
  const kbAnswerPrompt = loadSkill(deps.skillsDir, KB_ANSWER_SKILL);

  const onWriteError =
    deps.onWriteError ?? ((write: StudentWriteKind, error: unknown) => console.warn(`[student-graph] ${write} write failed (${error instanceof Error ? error.name : typeof error})`));

  const report = (write: StudentWriteKind, err: unknown) => {
    try {
      onWriteError(write, err);
    } catch {
      // the error reporter itself must not fail the turn either
    }
  };

  /** Repair R1: a store write never fails the turn. Returns false when the write threw. */
  const safeWrite = async (write: StudentWriteKind, fn: (() => Promise<unknown>) | undefined): Promise<boolean> => {
    if (!fn) return true;
    try {
      await fn();
      return true;
    } catch (err) {
      report(write, err);
      return false;
    }
  };

  // U6h M4: threads this graph has flagged itself (bounded; oldest evicted), so the suffix works with no store wired.
  const MAX_REMEMBERED_FLAGS = 10_000;
  const flaggedThreads = new Set<string>();
  const threadKey = (a: { tenantId: string; studentId: string }, threadId: string) => JSON.stringify([a.tenantId, a.studentId, threadId]);
  const rememberFlag = (a: { tenantId: string; studentId: string }, threadId: string) => {
    flaggedThreads.add(threadKey(a, threadId));
    if (flaggedThreads.size > MAX_REMEMBERED_FLAGS) flaggedThreads.delete(flaggedThreads.values().next().value as string);
  };
  /** Server-side "was this thread flagged before?". A caller-supplied value is never consulted. */
  const readPriorFlag = async (input: StudentTurnInput): Promise<boolean> => {
    if (input.mode !== "authenticated") return false;
    const thread = { tenantId: input.auth.tenantId, studentId: input.auth.studentId, threadId: input.threadId };
    if (flaggedThreads.has(threadKey(input.auth, input.threadId))) return true;
    try {
      return await deps.hasPriorFlag(thread);
    } catch (err) {
      report("flag_read", err);
      return true; // fail toward disclosure: showing the helpline line is the safe error
    }
  };
  const count = (kind: AnonymousCounterKind) => safeWrite(`counter:${kind}`, deps.countAnonymous ? () => deps.countAnonymous!(kind) : undefined);

  /**
   * The fixed crisis result for a turn: the vetted message for the language, plus (when `writes`) the flag log, the escalation and the
   * anonymous counter. `writes` is false for a safety-screen outage: the message still goes out, but an outage is not a determination
   * that this student is in crisis, so it must not raise a counsellor escalation per turn.
   */
  const crisisResult = async (input: StudentTurnInput, guardLevel: CrisisLevel | undefined, lang: string, writes: boolean): Promise<StudentTurnResult> => {
    const level = guardLevel ? { guardLevel } : {};
    // B24.7: unsure / indirect / Hinglish count as the higher level; with no connected counsellor on
    // the student surface every flag is handled as crisis.
    if (input.mode === "anonymous") {
      const counted = writes ? await count("crisis") : true;
      return {
        response: emptyResponse(input, "escalated", crisisMessageFor(lang, "anonymous", crisisMessages)),
        ...level,
        claimSourceKinds: [],
        ...(counted ? {} : { flagWriteFailed: true }),
      };
    }
    let logged = true;
    let escalated = true;
    if (writes) {
      rememberFlag(input.auth, input.threadId);
      logged = await safeWrite(
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
      escalated = await safeWrite(
        "escalate",
        deps.escalate
          ? () =>
              deps.escalate!({
                sessionId: input.threadId,
                studentId: input.auth.studentId,
                turns: [{ turnId: input.turnId, speaker: "student", lang, text: input.text, translatedText: input.text }],
              })
          : undefined,
      );
    }
    return {
      response: emptyResponse(input, "escalated", crisisMessageFor(lang, "student", crisisMessages)),
      ...level,
      claimSourceKinds: [],
      ...(logged && escalated ? {} : { flagWriteFailed: true }),
    };
  };

  const screenCfg = deps.safetyScreen;
  const screenPrompt = screenCfg ? loadSkill(deps.skillsDir, CONCERN_CLASSIFIER_SKILL) : "";
  const screenOn = (mode: StudentTurnInput["mode"]) => Boolean(screenCfg) && (mode === "authenticated" ? screenCfg!.authenticated ?? true : screenCfg!.anonymous === true);

  const finish = (input: StudentTurnInput, result: StudentTurnResult, priorFlag: boolean, outsideAllowList: boolean): StudentTurnResult => {
    let response = result.response;
    // P1 W3 / D-093 3A: ordinary stress language ("pressure bahut hai") is not a crisis flag. The turn is answered as usual with a
    // soft check-in and Tele-MANAS 14416. D-110: the order is the empathy line first, then the reply (the answer, the sign-in or the
    // help sentence), then the helpline; a reply that already carries 14416 gets only the check-in in front. The helpline is added
    // ONLY on a distress or concern signal (this one, a flagged thread below, or an uncovered language below): ordinary replies
    // carry none. The fixed crisis message (state "escalated") is never touched.
    let softNote = false;
    if (response.state !== "escalated" && stressSignal(input.text)) {
      const message = response.message ?? "";
      const withNote = [STRESS_CHECK_IN, message, message.includes("14416") ? "" : TELE_MANAS_LINE].filter((part) => part !== "").join(" ");
      if (withNote.length <= STUDENT_MESSAGE_MAX) {
        response = { ...response, message: withNote };
        softNote = true;
      }
    }
    if (input.mode === "authenticated" && priorFlag && response.state === "ok" && !softNote) {
      response = { ...response, message: `${response.message ?? ""} ${TELE_MANAS_LINE}`.trim() };
    }
    // LK5 (D-105 Q1): a reply to a student writing a language outside the allow-list is English, so it always carries the English+Hindi
    // helpline line. The crisis messages already carry the Hindi gloss; an existing English helpline line only gets the gloss added.
    if (outsideAllowList && response.state !== "escalated" && !(response.message ?? "").includes(HELPLINE_GLOSS)) {
      const message = response.message ?? "";
      const line = message.includes(TELE_MANAS_LINE) ? HELPLINE_GLOSS : HELPLINE_LINE_EN_HI;
      const room = STUDENT_MESSAGE_MAX - line.length - 1;
      response = { ...response, message: `${message.length > room ? message.slice(0, room) : message} ${line}`.trim() };
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
      if (salvaged) return { input: salvaged.input, salvagedLevel: salvaged.level };
      throw invalidInputError(raw);
    })
    .addNode(STUDENT_NODES.crisis, async (s: State) => {
      const input = s.input;
      const guard = { level: s.salvagedLevel ?? crisisGuard(input.text).level };
      if (guard.level === "none") return {};
      // LK4: a crisis turn makes no model call. Its language is the offline script result, which picks the vetted message.
      const lang = detectLanguageOffline(input.text);
      return { detectedLang: lang.lang, replyLang: resolveReplyLang(lang, replyLangs), result: await crisisResult(input, guard.level, lang.lang, true) };
    })
    .addNode(STUDENT_NODES.route, async (s: State) => {
      const input = s.input;
      // LK5: the model safety screen starts first, so it runs in parallel with detection, retrieval and the answer call. finish awaits it.
      const screen = screenOn(input.mode)
        ? safetyScreen(
            { text: input.text, lang: detectLanguageOffline(input.text).lang },
            { provider: screenCfg!.provider, skillPrompt: screenPrompt, ...(screenCfg!.timeoutMs !== undefined ? { timeoutMs: screenCfg!.timeoutMs } : {}), ...(screenCfg!.blockAt !== undefined ? { blockAt: screenCfg!.blockAt } : {}) },
          )
        : undefined;
      // LK4: only a turn the crisis guard cleared gets here, so the detector (a model call) never sees a crisis turn.
      const detected = await detectLanguage(input.text);
      const langState = { detectedLang: detected.lang, replyLang: resolveReplyLang(detected, replyLangs), ...(screen ? { screen } : {}) };
      if (input.mode === "anonymous") {
        if (classifyQuestion(input.text).class !== "generic") {
          await count("sign_in_required");
          return { ...langState, result: { response: emptyResponse(input, "sign_in_required", ANONYMOUS_SIGN_IN_TEXT), claimSourceKinds: [] } };
        }
        return { ...langState, tool: "search_kb" as const };
      }
      return { ...langState, tool: classifyIntent(input.text), priorFlag: await readPriorFlag(input) };
    })
    .addNode(STUDENT_NODES.answer, async (s: State) => ({ result: await answerFromKb(s.input, Boolean(s.priorFlag), { detected: s.detectedLang, reply: s.replyLang ?? "en" }, s.screen) }))
    .addNode(STUDENT_NODES.coach, async (s: State) => ({ result: await coach(s.input, Boolean(s.priorFlag)) }))
    .addNode(STUDENT_NODES.tool, async (s: State) => {
      if (isPathlynksTool(s.tool)) return { result: await pathlynksTool(s.input, s.tool) };
      if (s.tool === "navigate_steps") return { result: await navigateTool(s.input) };
      const tool = s.tool as keyof typeof TOOL_MESSAGES;
      return { result: { response: emptyResponse(s.input, "ok", TOOL_MESSAGES[tool]), selectedTool: tool, claimSourceKinds: [] } };
    })
    .addNode(STUDENT_NODES.finish, async (s: State) => {
      if (!s.result) throw new Error("student graph reached finish without a result");
      const { noSourceReply, ...held } = s.result;
      let result: StudentTurnResult = held;
      // LK5: nothing is released before the screen has answered. "Possible", an error, a timeout or invalid output replaces the reply
      // with the fixed crisis message. Only a real "possible" raises the flag log and the escalation; an outage is reported text-free.
      const verdict = s.screen ? await s.screen : undefined;
      if (verdict && verdict.verdict === "possible") {
        if (verdict.basis === "unavailable") report("safety_screen", Object.assign(new Error("safety screen unavailable"), { name: verdict.errorName }));
        // H3: a classifier OUTAGE on a no-source turn is not evidence of distress. Nothing left for the web or a model (noAnswer sent nothing),
        // so the student keeps the plain fixed refusal (or topic decline); a real classified "possible" is still the crisis message.
        if (!(noSourceReply && verdict.basis === "unavailable")) {
          result = await crisisResult(s.input, undefined, s.detectedLang ?? detectLanguageOffline(s.input.text).lang, verdict.basis === "classified");
        }
      }
      const outside = s.detectedLang !== undefined && isOutsideAllowList({ lang: s.detectedLang }, replyLangs);
      const done = finish(s.input, result, Boolean(s.priorFlag), outside);
      return { result: { ...done, ...(s.detectedLang ? { detectedLang: s.detectedLang } : {}), ...(s.replyLang ? { replyLang: s.replyLang } : {}) } };
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

  /**
   * vc-admin-control S6: one of the four `pathlynks_*` reads. The student id is the VERIFIED `auth.studentId`; nothing in the message text
   * can change it. A message that points at another student is refused before the port is touched. An anonymous input never gets here (the
   * route node answers it with sign_in_required) and is refused again here. Every failure (absent port, `unavailable`, throw, timeout,
   * malformed rows) is the one fixed line: no reason, host, SQL or stack ever reaches the reply or the stored response.
   */
  async function pathlynksTool(input: StudentTurnInput, tool: PathlynksToolName): Promise<StudentTurnResult> {
    const done = (message: string): StudentTurnResult => ({ response: emptyResponse(input, "ok", message), selectedTool: tool, claimSourceKinds: [] });
    if (input.mode !== "authenticated") return { response: emptyResponse(input, "sign_in_required", ANONYMOUS_SIGN_IN_TEXT), claimSourceKinds: [] };
    const studentId = input.auth.studentId;
    if (namesAnotherStudent(input.text, studentId)) return done(PATHLYNKS_OWN_DATA_ONLY_TEXT);
    const port = deps.pathlynks;
    if (!port) return done(PATHLYNKS_UNAVAILABLE_TEXT);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stop = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), deps.pathlynksTimeoutMs ?? PATHLYNKS_DEFAULT_TIMEOUT_MS);
      });
      const call = (): Promise<PathlynksResult<unknown>> => {
        switch (tool) {
          case "pathlynks_profile":
            return port.getStudentProfile(studentId);
          case "pathlynks_saved_careers":
            return port.getSavedCareers(studentId);
          case "pathlynks_compare":
            return port.getCompareList(studentId);
          case "pathlynks_assessment":
            return port.getAssessmentStatus(studentId);
        }
      };
      const out = await Promise.race([call(), stop]);
      if (!out || out.status !== "ok") return done(PATHLYNKS_UNAVAILABLE_TEXT);
      const data = out.data;
      const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
      let message: string;
      switch (tool) {
        case "pathlynks_saved_careers":
          if (!Array.isArray(data)) return done(PATHLYNKS_UNAVAILABLE_TEXT);
          message = listMessage(PATHLYNKS_ALLOWED_COLUMNS.pathlynks_saved_careers, "Your saved careers on Pathlynks:", "You have no saved careers on Pathlynks yet.", data);
          break;
        case "pathlynks_compare":
          if (!Array.isArray(data)) return done(PATHLYNKS_UNAVAILABLE_TEXT);
          message = listMessage(PATHLYNKS_ALLOWED_COLUMNS.pathlynks_compare, "Your compare list on Pathlynks:", "Your compare list on Pathlynks is empty.", data);
          break;
        case "pathlynks_profile":
          if (data !== null && !isRecord(data)) return done(PATHLYNKS_UNAVAILABLE_TEXT);
          message = recordMessage(PATHLYNKS_ALLOWED_COLUMNS.pathlynks_profile, "Your Pathlynks profile:", "I don't see a Pathlynks profile for you yet.", data);
          break;
        case "pathlynks_assessment":
          if (data !== null && !isRecord(data)) return done(PATHLYNKS_UNAVAILABLE_TEXT);
          message = recordMessage(PATHLYNKS_ALLOWED_COLUMNS.pathlynks_assessment, "Your Pathlynks assessment:", "I don't see an assessment on your Pathlynks account yet.", data);
          break;
      }
      return done(message.slice(0, PATHLYNKS_MESSAGE_MAX));
    } catch (err) {
      report("pathlynks", err);
      return done(PATHLYNKS_UNAVAILABLE_TEXT);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * vc-admin-control S6/VA14: `navigate_steps`. Text steps from the stored catalogue only (`navigateSteps` returns nothing outside it); a
   * missing, failing or empty catalogue is the fixed "I don't know that page yet". It never clicks or fetches anything.
   */
  async function navigateTool(input: StudentTurnInput): Promise<StudentTurnResult> {
    const done = (message: string): StudentTurnResult => ({ response: emptyResponse(input, "ok", message), selectedTool: "navigate_steps", claimSourceKinds: [] });
    if (input.mode !== "authenticated") return { response: emptyResponse(input, "sign_in_required", ANONYMOUS_SIGN_IN_TEXT), claimSourceKinds: [] };
    let catalogue: NavCatalogue | undefined;
    try {
      catalogue = deps.navCatalogue ? await deps.navCatalogue() : undefined;
    } catch (err) {
      report("nav_catalogue", err);
      return done(NAVIGATE_UNKNOWN_TEXT);
    }
    const { steps, routes } = navigateSteps(catalogue, input.text);
    return done(routes.length === 0 ? NAVIGATE_UNKNOWN_TEXT : steps.join("\n"));
  }

  /**
   * D-110 + p1-nosource-grounded: the reply when the knowledge base gives no servable source. The gap is counted first (unchanged). Then, in order:
   * (G4) a question outside the topic boundary gets the short fixed decline with no model call; (G5) on an anonymous turn with the `no_source` screen
   * the model safety screen answers before anything leaves for a model or the web; then the guarded expert answer (grounded first when configured,
   * else the model-only text chain). The reply is the vetted disclaimer plus that answer; the state stays `no_sourced_answer` with no claims, and
   * grounding links (if any) are `sources` entries of kind `web`. A failure, a timeout or an output the guards refuse is the fixed refusal text,
   * so the turn never errors.
   */
  async function noAnswer(input: StudentTurnInput, priorFlag: boolean, replyLang: ReplyLang, screen?: Promise<SafetyScreenVerdict>): Promise<StudentTurnResult> {
    if (input.mode === "authenticated") {
      const gap: GapRecord = { tenantId: input.auth.tenantId, studentId: input.auth.studentId, threadId: input.threadId, turnId: input.turnId, at: now().toISOString() };
      await safeWrite("gap", deps.recordGap ? () => deps.recordGap!(gap) : undefined);
    } else {
      await count("no_answer");
    }
    const refusal = input.mode === "authenticated" ? NO_SOURCED_ANSWER_TEXT : ANONYMOUS_NO_ANSWER_TEXT;
    const reply = (message: string, sources: Source[] = []): StudentTurnResult => ({
      response: { ...emptyResponse(input, "no_sourced_answer", message), sources },
      selectedTool: "search_kb",
      claimSourceKinds: [],
      noSourceReply: true,
    });
    if (isOutOfScopeQuestion(input.text)) return reply(fixedText(replyLang, "topicDecline"));
    if (screen) {
      // The screen the route started for this turn (authenticated, or anonymous with anonymous: true) must answer before the text leaves for a
      // model or the web. A "possible" verdict sends nothing: `finish` awaits the same verdict and replaces this placeholder with the crisis message.
      if ((await screen).verdict === "possible") return reply(refusal);
    } else if (input.mode === "anonymous" && screenCfg?.anonymous === "no_source") {
      const lang = detectLanguageOffline(input.text).lang;
      const verdict = await safetyScreen(
        { text: input.text, lang },
        { provider: screenCfg.provider, skillPrompt: screenPrompt, ...(screenCfg.timeoutMs !== undefined ? { timeoutMs: screenCfg.timeoutMs } : {}), ...(screenCfg.blockAt !== undefined ? { blockAt: screenCfg.blockAt } : {}) },
      );
      if (verdict.verdict === "possible") {
        if (verdict.basis === "unavailable") {
          // H3: an outage is reported text-free; the student gets the plain refusal and nothing leaves (no grounded or guidance call).
          report("safety_screen", Object.assign(new Error("safety screen unavailable"), { name: verdict.errorName }));
          return reply(refusal);
        }
        return crisisResult(input, undefined, lang, true);
      }
    }
    const guidance = await expertGuidance(input, priorFlag, replyLang);
    if (guidance === "declined") return reply(fixedText(replyLang, "topicDecline"));
    return guidance ? reply(guidance.message, guidance.sources) : reply(refusal);
  }

  /** G1 + H1: the question as it may leave for the web: listed speakers, self-introduced names (any case), ages, schools and colleges, street addresses, PIN codes, dates of birth, phone and ID numbers, e-mail addresses and links replaced, bounded. This is a deterministic floor, not a guarantee that free text holds no personal detail; nothing else about the student goes with it. */
  function webQuestion(text: string): string {
    return redactStudentDetails(
      redactPersonalIdentifiers(text, deps.speakers, [])
        .replace(/(?:https?|ftps?):\/\/\S+|www\.\S+/giu, "[link]")
        .replace(/[^\s@<>()"',;]+@[^\s@<>()"',;]+\.\p{L}{2,}/gu, "[email]"),
    ).slice(0, WEB_QUESTION_MAX_CHARS);
  }

  /** G1: grounding links re-checked on this side of the seam (https only, no credentials, unique, at most 5), as `web` sources. */
  function webSources(raw: readonly GroundedSource[]): Source[] {
    const out: Source[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (out.length >= WEB_SOURCES_MAX) break;
      if (typeof item?.url !== "string" || item.url.length > 2048) continue;
      let u: URL;
      try {
        u = new URL(item.url);
      } catch {
        continue;
      }
      if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.hostname === "" || seen.has(u.toString())) continue;
      seen.add(u.toString());
      const title = typeof item.title === "string" ? item.title.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
      out.push({ id: `web:${out.length + 1}`, kind: "web", title: title || u.hostname, url: u.toString() });
    }
    return out;
  }

  /**
   * The output checks every model-written no-source answer gets, grounded or not: no link, bare domain or e-mail, never a draft SOP/essay (B1), no
   * repeat of the system prompts, names and phone numbers removed (every listed speaker), the no-quote guard, on a flagged thread the forbidden
   * crisis wording. Numbers are allowed. Returns the disclaimer plus the answer, or undefined for "refuse this one".
   */
  function guardedGuidance(raw: string, input: StudentTurnInput, priorFlag: boolean, replyLang: ReplyLang): string | undefined {
    if (hasExplicitLink(raw) || isDraftLike(raw, Number.POSITIVE_INFINITY)) return undefined;
    if ([GENERAL_GUIDANCE_PROMPT, GROUNDED_GUIDANCE_PROMPT].some((prompt) => hasVerbatimRun(raw, prompt))) return undefined;
    const answer = noQuoteGuard(redactPersonalIdentifiers(raw, deps.speakers, []), deps.speakers).text.trim();
    if (answer === "") return undefined;
    const message = `${fixedText(replyLang, "guidanceDisclaimer")} ${answer}`;
    // Room for the empathy line and the helpline that `finish` may add, so a long answer is refused rather than cut mid-sentence.
    if (message.length > STUDENT_MESSAGE_MAX - 400) return undefined;
    if (input.mode === "authenticated" && priorFlag && violatesCrisisRules(message)) return undefined;
    return message;
  }

  /**
   * The disclaimer plus the guarded expert answer (and its web sources), "declined" when a model judged the question outside the topic boundary, or
   * undefined for "show the refusal". Grounded first when `deps.grounding` is set; any failure there falls through to the model-only text chain
   * (D-110), unchanged. A grounded decline is final. The model safety screen still runs on the student's text in `finish`, and a "possible" verdict
   * replaces this reply with the fixed crisis message.
   */
  async function expertGuidance(input: StudentTurnInput, priorFlag: boolean, replyLang: ReplyLang): Promise<{ message: string; sources: Source[] } | "declined" | undefined> {
    const timeoutMs = deps.expertTimeoutMs ?? GENERAL_GUIDANCE_TIMEOUT_MS;
    if (deps.grounding) {
      const grounded = await groundedGuidance(deps.grounding, { question: webQuestion(input.text), replyLang }, Math.min(timeoutMs, GROUNDED_TIMEOUT_MAX_MS));
      if (grounded?.kind === "declined") return "declined";
      if (grounded?.kind === "answer") {
        const message = guardedGuidance(grounded.text, input, priorFlag, replyLang);
        if (message !== undefined) return { message, sources: webSources(grounded.sources) };
      }
    }
    const plain = await generalGuidance(deps.provider, { question: input.text, replyLang }, timeoutMs);
    if (plain?.kind === "declined") return "declined";
    if (plain?.kind === "answer") {
      const message = guardedGuidance(plain.text, input, priorFlag, replyLang);
      if (message !== undefined) return { message, sources: [] };
    }
    return undefined;
  }

  /**
   * Repair R3 / U6h fix1 M4c: a follow-up question is shown only when it is ONE sentence ending in "?", at most
   * FOLLOW_UP_MAX_CHARS long, plainly a question (no-script guard), free of the forbidden crisis phrases and with no facts in it.
   */
  function safeFollowUp(raw: string | undefined, restricted: { texts: string[]; labels: string[] }): string | undefined {
    const f = raw?.trim();
    if (!f || !f.endsWith("?") || f.length > FOLLOW_UP_MAX_CHARS) return undefined;
    const body = f.slice(0, -1);
    if (/[?!\u0964]/.test(body) || /\.\s/.test(body)) return undefined; // a second sentence (or question) is advice, not a follow-up
    // P1 W3 (U6h leftover 3): a second sentence with no terminal punctuation to split on ("...university\nWhich cities?", "...; which cities?").
    if (/[\n\r\u2028\u2029;]/.test(body)) return undefined;
    if (!noScriptGuard({ type: "clarify", prompt: f }).ok || violatesCrisisRules(f)) return undefined;
    // P1 W3 (U6h leftover 1): the answer path drops a spelled-out figure ("five thousand euros") exactly as the coach filter does.
    if (/\p{N}/u.test(f) || numberMentions(f).length > 0) return undefined;
    if (countriesIn(f).length > 0) return undefined;
    if (findPersonalIdentifiers(f, deps.speakers, restricted.labels).length > 0) return undefined;
    if (restricted.texts.some((t) => hasVerbatimRun(f, t))) return undefined;
    return noQuoteGuard(f, deps.speakers, restricted.labels).text;
  }

  /** Repair 1 (M3): the localized follow-up passes what `safeFollowUp` applies to the English one, plus the language-neutral comparison with it. */
  function localizedFollowUpOk(englishFollowUp: string, fl: string, replyLang: ReplyLang, restricted: { texts: string[]; labels: string[] }): boolean {
    if (fl.length > FOLLOW_UP_MAX_CHARS || !fl.endsWith("?")) return false;
    const body = fl.slice(0, -1);
    if (/[?!\u0964\n\r\u2028\u2029;]/.test(body) || /\.\s/.test(body)) return false;
    if (!noScriptGuard({ type: "clarify", prompt: fl }).ok || violatesCrisisRules(fl)) return false;
    if (/\p{N}/u.test(fl) || numberMentions(fl).length > 0) return false;
    if (countriesInLocalized(fl).length > 0) return false;
    if (findPersonalIdentifiers(fl, deps.speakers, restricted.labels).length > 0) return false;
    if (restricted.texts.some((t) => hasVerbatimRun(fl, t))) return false;
    // D-106: a fact-free follow-up only; a factual one would come back as the English wording, which is the English reply here.
    // LK5b (B2): localizedClaimText returns NFC text, so compare against the NFC form of fl (a precomposed nukta is not a mismatch).
    return localizedClaimText(englishFollowUp, fl, replyLang, restricted.texts) === fl.normalize("NFC");
  }

  /**
   * LK5: the reply in the student's language, or undefined for "show the English reply". The English claims already passed every guard;
   * this only swaps in the localized copies, and only when ALL of them pass the language-neutral checks and the model reported the
   * language it was asked for (a drift to any other language is the English reply). A non-English reply never mixes in an English
   * follow-up. Names and phone numbers are redacted exactly as in the English path.
   */
  function localizedMessage(
    draft: z.infer<typeof KbAnswerOutputSchema>,
    shown: GuardedClaim[],
    englishFollowUp: string | undefined,
    restricted: { texts: string[]; labels: string[] },
    replyLang: ReplyLang,
  ): string | undefined {
    if (replyLang === "en" || !replyLangIs(draft.replyLang, replyLang)) return undefined;
    const parts: string[] = [];
    for (const c of shown) {
      // D-106 rule (a): factual sentences in their English wording, fact-free ones localized; alignment failure = the English reply.
      const mixed = c.localized ? localizedClaimText(c.text, c.localized, replyLang, restricted.texts) : undefined;
      if (mixed === undefined) return undefined;
      const text =
        c.sourceKind === "whatsapp" || c.sourceKind === "unknown"
          ? redactPersonalIdentifiers(mixed, deps.speakers, restricted.labels)
          : redactPersonalIdentifiers(mixed, { speakers: [] }, []);
      parts.push(c.status === "unverified" ? `${text} (unverified)` : text);
    }
    // Repair 1 (M3): a localized follow-up goes through the same checks as the English one; if it fails, the whole reply is the English
    // reply (which carries the English follow-up). An absent or blank one just means no follow-up in the localized reply.
    const fl = draft.followUpLocalized?.trim();
    if (englishFollowUp && fl) {
      if (!localizedFollowUpOk(englishFollowUp, fl, replyLang, restricted)) return undefined;
      parts.push(fl);
    }
    const message = noQuoteGuard(parts.join(" "), deps.speakers, restricted.labels).text;
    return restricted.texts.some((t) => hasVerbatimRun(message, t)) ? undefined : message;
  }

  async function answerFromKb(input: StudentTurnInput, priorFlag: boolean, lang: { detected: string | undefined; reply: ReplyLang }, screen?: Promise<SafetyScreenVerdict>): Promise<StudentTurnResult> {
    const authenticated = input.mode === "authenticated";
    // Anonymous: structurally search-only, whatever the port offers (A15c, B24.6).
    const searchKb = deps.kb.searchKb.bind(deps.kb);
    const askKb = authenticated ? deps.kb.askKnowledgeBase?.bind(deps.kb) : undefined;
    const getSession = authenticated ? deps.kb.getSession?.bind(deps.kb) : undefined;

    let hits: SearchHit[] = [];
    try {
      // LK5 (D-105 Q2): a non-English turn is searched with a one-off English rewrite (nothing stored); failure uses the original text.
      const query = lang.detected !== undefined && isNonEnglish(lang.detected) ? await rewriteToEnglishQuery(deps.provider, input.text, deps.rewriteTimeoutMs) : input.text;
      const search = await searchKb(query);
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
      if (!askKb) return noAnswer(input, priorFlag, lang.reply, screen);
      try {
        ask = await askKb(input.text);
      } catch {
        return noAnswer(input, priorFlag, lang.reply, screen);
      }
      // Serve rule re-checked on the engine side (U6h P4): answered, verdict "correct", insufficient_coverage
      // false, internal sources, no web. Anything the engine cannot confirm is the fixed no-answer.
      if (!isServedAsk(ask)) return noAnswer(input, priorFlag, lang.reply, screen);
    }

    // U6h M3: names and phones are redacted from WhatsApp/unknown hit text and from the /ask answer BEFORE they are
    // model input; the claim check below still sees the raw evidence. Seminar / ToC text passes through unchanged.
    const hitLabels = hits.filter((h) => h.sourceKind === "whatsapp" || h.sourceKind === "unknown").flatMap((h) => (h.speakerLabel?.trim() ? [h.speakerLabel] : []));
    const modelText = (h: SearchHit) => (h.sourceKind === "whatsapp" || h.sourceKind === "unknown" ? redactPersonalIdentifiers(h.text, deps.speakers, hitLabels) : h.text);
    const evidence =
      hits.length > 0
        ? hits.map((h) => ({ id: h.turnId, kind: "search" as const, text: modelText(h), sourceKind: h.sourceKind, sessionDate: h.sessionDate }))
        : ask!.citations.internal.map((n) => ({ id: n.node_id, kind: "ask" as const, text: redactPersonalIdentifiers(ask!.answer, deps.speakers, []), sourceKind: "unknown" as const }));

    let draft: z.infer<typeof KbAnswerOutputSchema>;
    try {
      draft = await deps.provider.generate({
        skillName: KB_ANSWER_SKILL,
        skillPrompt: kbAnswerPrompt,
        // the tolerant LK5 fields (.catch) widen the schema INPUT type to unknown; the OUTPUT type is what the provider hands back
        outputSchema: KbAnswerOutputSchema as z.ZodType<z.output<typeof KbAnswerOutputSchema>>,
        input: { question: input.text, evidence, priorFlag: authenticated ? priorFlag : false, replyLang: lang.reply },
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
    if (!shown.some((c) => c.status !== "unverified")) return noAnswer(input, priorFlag, lang.reply, screen);

    // U7 repair C: an anonymous reply never carries a model-written follow-up (it could solicit marks, a school or a link).
    const followUp = authenticated ? safeFollowUp(draft.followUp, guarded.restricted) : undefined;
    let message = [...shown.map((c) => (c.status === "unverified" ? `${c.text} (unverified)` : c.text)), ...(followUp ? [followUp] : [])].join(" ");
    // Repair R2a: the FINAL message is checked against every restricted text of the turn (fail closed).
    if (guarded.restricted.texts.some((t) => hasVerbatimRun(message, t))) return noAnswer(input, priorFlag, lang.reply, screen);
    message = noQuoteGuard(message, deps.speakers, guarded.restricted.labels).text;
    const englishViolatesCrisisRules = authenticated && priorFlag && violatesCrisisRules(message);
    message = localizedMessage(draft, shown, followUp, guarded.restricted, lang.reply) ?? message;
    // Repair 1 (M2): the forbidden-pattern check also runs on the text actually shown, i.e. after the localized swap.
    if (authenticated && priorFlag && (englishViolatesCrisisRules || violatesCrisisRules(message))) {
      return { response: emptyResponse(input, "ok", STUDENT_CRISIS_MESSAGE), selectedTool: "search_kb", claimSourceKinds: [] };
    }
    if (!authenticated) await count("answered");
    let claims: Claim[] = shown.map(({ text, kind, sourceIds, status }: GuardedClaim) => ({ text, kind, sourceIds, status }));
    const cited = new Set(shown.flatMap((c) => c.sourceIds));
    let sources = guarded.sources.filter((s) => cited.has(s.id));
    if (!authenticated) {
      // U7 repair E: an anonymous caller gets opaque ordinal ids (the KB turn id is internal) and no title for restricted kinds.
      const opaque = new Map<string, string>(sources.map((s, i) => [s.id, `s${i + 1}`]));
      sources = sources.map(({ id, title, ...rest }) => ({ id: opaque.get(id)!, ...rest, ...(title && rest.kind !== "whatsapp" && rest.kind !== "unknown" ? { title } : {}) }));
      claims = claims.map((c) => ({ ...c, sourceIds: c.sourceIds.map((id) => opaque.get(id)).filter((id): id is string => id !== undefined) }));
    }
    return {
      response: { ...(authenticated ? { turnId: input.turnId } : {}), state: "ok", message, claims, sources, profileFactsUsed: [] },
      selectedTool: ask ? "ask_knowledge_base" : "search_kb",
      claimSourceKinds: shown.map((c) => c.sourceKind),
    };
  }

  /** U6h M4: a coaching sentence or question that carries a number or a country is a factual claim; coaching has no sources. */
  const factFree = (s: string) => !/\p{N}/u.test(s) && numberMentions(s).length === 0 && countriesIn(s).length === 0;

  async function coach(input: StudentTurnInput, priorFlag: boolean): Promise<StudentTurnResult> {
    let message = COACH_FALLBACK;
    try {
      const out = await deps.provider.generate({
        skillName: CAPABILITY_MANIFEST_SKILL,
        skillPrompt: manifestPrompt,
        outputSchema: CoachOutputSchema,
        input: { request: input.text, mode: "coach_draft_feedback" },
      });
      // Existing B1 no-script guard: each coaching question must be a genuine question.
      const questions = out.questions.map((q) => q.trim()).filter((q) => q && factFree(q) && noScriptGuard({ type: "clarify", prompt: q }).ok);
      const reply = out.reply.split(/(?<=[.!?।])\s+/).filter((sentence) => factFree(sentence)).join(" ").trim();
      const candidate = [reply, ...questions].filter(Boolean).join(" ");
      if (!isDraftLike(out.reply) && !isDraftLike(candidate) && questions.length >= 2) message = candidate;
    } catch {
      message = COACH_FALLBACK;
    }
    message = noQuoteGuard(message, deps.speakers).text;
    if (input.mode === "authenticated" && priorFlag && violatesCrisisRules(message)) message = COACH_FALLBACK;
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
