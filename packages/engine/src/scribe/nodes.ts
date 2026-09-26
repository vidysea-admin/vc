/**
 * The scribe's logic as plain functions (agentic-architecture-standard: the graph is thin wiring;
 * logic lives in functions, skills and tools). Each function takes a Zod-validated input slice plus
 * explicit deps and returns a Zod-validated output (B5). None of them touches LangGraph, so they
 * survive a framework swap unchanged.
 */
import type { Db } from "mongodb";
import { ZodError, type z } from "zod";
import { FactSchema, isScriptLike, type CitationMatch, type Fact } from "@vc/schemas";
import {
  ConsentRequiredError,
  FactConflictError,
  FENCE_POSTCHECK_TIMEOUT_MS,
  FencedWriterDeadlineError,
  PartialApplyError,
  StudentFencedError,
  applyApprovedDiff,
  factsCollection,
  isStudentFenced,
  recordApprovedSessionSummary,
  proposeFactChanges,
  requireConsent,
  undoApprovedSessionSummary,
} from "@vc/db";
import type { LlmProvider } from "@vc/providers";
import { citationGuard } from "../guards/citation.js";
import { routeBeforeGeneration } from "../guards/crisis.js";
import { loadSkill } from "../skills/loader.js";
import {
  ApprovalOutputSchema,
  CandidateFactSchema,
  COUNSELLOR_WITHHELD_SUMMARY_REASON,
  ConsentGateInputSchema,
  ConsentGateOutputSchema,
  CrisisGateInputSchema,
  CrisisGateOutputSchema,
  DiffInputSchema,
  DiffOutputSchema,
  ExtractInputSchema,
  ExtractOutputSchema,
  ExtractionSkillOutputSchema,
  SCRIBE_PURPOSE,
  ScribeResultSchema,
  SummaryInputSchema,
  SummaryOutputSchema,
  SummarySkillOutputSchema,
  WriteInputSchema,
  type ApprovalOutput,
  type ApprovalResponse,
  type ConsentGateOutput,
  type CrisisGateOutput,
  type DiffOutput,
  type DroppedFact,
  type ExtractOutput,
  type RejectedFact,
  type ScribeEscalation,
  type ScribeResult,
  type ScribeTurn,
  type SummaryOutput,
} from "./schemas.js";

export interface ScribeDeps {
  /** The `virtual_counsellor` Db from @vc/db getVcDb/connectFromEnv (B12). */
  db: Db;
  /** The provider seam (B6); tests pass a MockProvider. */
  provider: LlmProvider;
  /** The repo's skills/ directory; prompts come from SKILL.md files (B6). */
  skillsDir: string;
}

// ---------------------------------------------------------------------------
// (a) consent gate — B4, runs first
// ---------------------------------------------------------------------------

export async function checkConsent(rawInput: unknown, deps: Pick<ScribeDeps, "db">): Promise<ConsentGateOutput> {
  const input = ConsentGateInputSchema.parse(rawInput);
  try {
    await requireConsent(deps.db, input.studentId, SCRIBE_PURPOSE);
    return ConsentGateOutputSchema.parse({ consent: "granted" });
  } catch (err) {
    // Only a consent refusal is a routed outcome; any other error (e.g. the DB is down)
    // propagates, so it is retried from the checkpoint instead of being mistaken for "no consent".
    if (err instanceof ConsentRequiredError) {
      return ConsentGateOutputSchema.parse({ consent: "refused", refusalReason: err.message });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// (b) crisis gate — B9, deterministic, before any provider call
// ---------------------------------------------------------------------------

/**
 * Runs the existing crisis guard (guards/crisis.ts, unchanged) over EVERY turn, on both the
 * original-language `text` and the English `translatedText`: a signal that a translation softened
 * must still escalate. The most severe signal wins (crisis over concern), then the earliest turn.
 * A concern-level signal also stops the scribe, because the guard routes it to escalation and false
 * positives are this guard's safe failure mode.
 */
export function checkCrisis(rawInput: unknown): CrisisGateOutput {
  const input = CrisisGateInputSchema.parse(rawInput);
  let worst: ScribeEscalation | null = null;
  for (const turn of input.turns) {
    for (const text of [turn.text, turn.translatedText]) {
      const route = routeBeforeGeneration(text);
      if (route.route !== "escalate") continue;
      const candidate: ScribeEscalation = { ...route.card, turnId: turn.turnId };
      if (!worst || (worst.level === "concern" && candidate.level === "crisis")) worst = candidate;
    }
    if (worst?.level === "crisis") break;
  }
  return CrisisGateOutputSchema.parse({ escalation: worst });
}

// ---------------------------------------------------------------------------
// (c) fact extraction — skill via provider, then B2 citation checks
// ---------------------------------------------------------------------------

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// T-013 rescope (D-020, gate citation-guarantee-scope): citation location (verbatim/normalised, the
// existing behaviour restated as two strict tiers so case/punctuation drift is recovered as a real
// citation instead of a fabricated-citation drop — the T-009 case-drift eval previously dropped
// 23/24 true facts here) plus the closed auto-verify surface (typed numbers + a fixed country/alias
// vocabulary, matched as whole words). Every string fact NOT on that surface is kept as
// `needsReview`, never dropped (the open-ended "is this glued word part of a longer name" judgment
// that stalled the prior T-013 attempt three cycles running — qa/debug/t-013-citation-robustness-
// cycle3.md — is not attempted here at all).
// ---------------------------------------------------------------------------

/**
 * The fixed punctuation set treated as a token break for the "normalised" tier: the T-009 eval's
 * list (`.,!?;:"'()-–—।`) plus curly quotes “”‘’. Digits, currency symbols and letters are never in
 * it.
 */
const CITATION_PUNCTUATION = ".,!?;:\"'()\\-–—।“”‘’";
const CITATION_PUNCTUATION_RE = new RegExp(`[${CITATION_PUNCTUATION}]`, "gu");

/** Tier 1 ("verbatim"): Unicode NFC, then whitespace collapse. Canonically-equivalent text only —
 *  this alone recovers an NFD-decomposed Devanagari quote against an NFC transcript (or vice versa). */
function normaliseVerbatim(text: string): string {
  return collapseWhitespace(stripInvisibleFormat(text).normalize("NFC"));
}

/**
 * ISS-t-013r-rev-10 (fix cycle 3): invisible format characters are DELETED (never a token break) before
 * any tokenising, so "n\u200Bot" is the word "not" and cannot hide a cue from a marker set. Closed
 * list: soft hyphen U+00AD, zero-width space U+200B, LRM/RLM U+200E/U+200F, word joiner U+2060, BOM
 * U+FEFF. ZWNJ U+200C and ZWJ U+200D are KEPT — they are meaningful inside Devanagari words.
 */
const INVISIBLE_FORMAT_RE = /[\u00AD\u200B\u200E\u200F\u2060\uFEFF]/gu;

function stripInvisibleFormat(text: string): string {
  return text.replace(INVISIBLE_FORMAT_RE, "");
}

/**
 * Tier 2 ("normalised"): tier 1, then casefold, then every character of the fixed punctuation set
 * becomes a space (a token BREAK, never a deletion) and whitespace collapses again. Still a STRICT
 * substring check downstream — never fuzzy/edit-distance.
 */
function normaliseLoose(text: string): string {
  return collapseWhitespace(normaliseVerbatim(text).toLowerCase().replace(CITATION_PUNCTUATION_RE, " "));
}

/**
 * Locates `quote` in one of `haystacks` and returns the tier it matched at, or null when neither
 * tier finds it (the citation is dropped, B2 — a genuine fabrication, not a normalisation gap).
 */
function locateCitation(quote: string, haystacks: readonly string[]): CitationMatch | null {
  const verbatimQuote = normaliseVerbatim(quote);
  if (verbatimQuote.length > 0 && haystacks.some((h) => normaliseVerbatim(h).includes(verbatimQuote))) {
    return "verbatim";
  }
  const looseQuote = normaliseLoose(quote);
  if (looseQuote.length > 0 && haystacks.some((h) => normaliseLoose(h).includes(looseQuote))) {
    return "normalised";
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `word` (already tier-2 normalised) occurs in `haystackNormalised` (already tier-2
 * normalised) as a WHOLE token — bounded by start/end-of-string or a non-letter/non-digit character
 * on both sides. This is what stops a digit run like "15" matching inside "115", and a country alias
 * matching as part of a longer word, WITHOUT any case/name-shape heuristic (the mechanism that
 * defeated the prior T-013 attempt).
 */
function containsWholeWord(haystackNormalised: string, word: string): boolean {
  if (word.length === 0) return false;
  const re = new RegExp(`(?:^|[^\\p{L}\\p{Nd}])${escapeRegExp(word)}(?:$|[^\\p{L}\\p{Nd}])`, "u");
  return re.test(` ${haystackNormalised} `);
}

/**
 * T-013 rescope: the ONLY string values that auto-verify at full confidence (B2, D-020) — a small,
 * closed, hand-curated set (alias, lower-case, NFC -> canonical display value). Deliberately
 * EXCLUDES ambiguous single-word aliases that are also common nouns or other proper nouns (bare
 * "Britain", "America", "Georgia", "Turkey", "Jordan", "Chad" ...) so a whole-word match can never
 * mistake a distractor place/name for a country — this is exactly the sibling-diagnosis hostile
 * class ("new britain" -> uk, "bank of america" -> USA, "georgia tech" -> Georgia,
 * qa/debug/t-013-citation-robustness-cycle3.md). [ASSUMPTION 2026-09-26, gate
 * citation-guarantee-scope follow-up unanswered]: this is today's minimal illustrative list, not a
 * vetted full ISO-3166 set. Extend carefully, one alias at a time, and never with a bare common-noun
 * homograph — everything else stays `needsReview` regardless (B3 still gates every write).
 */
const COUNTRY_ALIASES: ReadonlyMap<string, string> = new Map(
  (
    [
      ["uk", "UK"],
      ["u.k", "UK"],
      ["united kingdom", "UK"],
      ["great britain", "UK"],
      ["usa", "USA"],
      ["u.s.a", "USA"],
      ["u.s", "USA"],
      ["united states", "USA"],
      ["united states of america", "USA"],
      ["india", "India"],
      ["bharat", "India"],
      ["canada", "Canada"],
      ["australia", "Australia"],
      ["new zealand", "New Zealand"],
      ["nz", "New Zealand"],
      ["germany", "Germany"],
      ["ireland", "Ireland"],
      ["singapore", "Singapore"],
      ["france", "France"],
    ] as const
  ).map(([alias, canonical]) => [alias.normalize("NFC"), canonical]),
);

/**
 * A small, fixed list of third-party referents. When one appears in the cited turn, a fact is never
 * auto-verified even if its value is otherwise on the closed surface — "my cousin is in the UK" must
 * not auto-verify a value as the STUDENT's own (D-020, citation-guarantee-scope: "at minimum it must
 * not be verified"). This is a bounded lexicon check, not a semantic aboutness judgment: it never
 * decides WHO a fact is about, only downgrades to needsReview when a referent word is present.
 *
 * ISS-t-013r-c0-2 (fix cycle 1): the list now also carries bare third-person pronouns (English,
 * Hinglish, Devanagari) and Hindi/Hinglish kinship words. A pronoun is common in ordinary speech, so
 * this downgrades more facts to needsReview — that is the fail-safe direction (auto-verify only ever
 * narrows, qa/feedback-inbox.md ai-engineer line), and nothing is dropped for it.
 */
const THIRD_PARTY_MARKERS = new Set(
  [
    // English relational nouns
    "cousin", "cousins", "friend", "friends", "brother", "brothers", "sister", "sisters", "uncle", "uncles",
    "aunt", "aunts", "aunty", "auntie", "colleague", "colleagues", "neighbour", "neighbor", "neighbours",
    "neighbors", "someone", "somebody", "acquaintance", "father", "mother", "dad", "daddy", "mom", "mum",
    "mommy", "mummy", "mumma", "parent", "parents", "son", "daughter", "wife", "husband", "grandfather",
    "grandmother", "grandpa", "grandma", "nephew", "niece", "classmate", "classmates", "roommate", "senior",
    "seniors", "bro", "sis", "relative", "relatives", "family", "boyfriend", "girlfriend",
    // English third-person pronouns
    "he", "she", "him", "her", "his", "hers", "himself", "herself", "they", "them", "their", "theirs",
    "themselves",
    // Hinglish kinship / relations
    "bhai", "bhaiya", "bhaiyya", "bhaisaab", "didi", "di", "behen", "behan", "bahen", "bahan", "papa",
    "maa", "mata", "pita", "pitaji", "chacha", "chachi", "chachu", "mama", "mami", "mamu",
    "bua", "phupha", "fufa", "mausi", "mausa", "dada", "dadi", "nana", "nani", "jiju", "jija", "bhabhi",
    "dost", "dosto", "saheli", "rishtedar", "padosi",
    // Hinglish third-person pronouns
    "woh", "wo", "vo", "voh", "uska", "uski", "uske", "unka", "unki", "unke", "usko", "unko", "unhe",
    "unhone", "usne", "inka", "inki", "inke",
    // Devanagari kinship / relations
    "भाई", "भैया", "दीदी", "बहन", "पापा", "मम्मी", "माँ", "मां", "माता", "पिता", "पिताजी", "चाचा", "चाची",
    "मामा", "मामी", "बुआ", "मौसी", "दादा", "दादी", "नाना", "नानी", "जीजा", "भाभी", "दोस्त", "सहेली",
    "रिश्तेदार", "पड़ोसी",
    // ISS-t-013r-rev-6 (fix cycle 2): in-law and extended kinship (Hinglish + Devanagari)
    "devar", "devrani", "saali", "sali", "saala", "sala", "nanad", "jeth", "jethani", "jethji", "sasur",
    "sasurji", "saas", "saasu", "sasural", "sasuraal", "behnoi", "bahnoi", "behanoi", "bhatija", "bhatiji",
    "bhanja", "bhanji", "pati", "patni", "biwi", "inlaw", "inlaws",
    "देवर", "देवरानी", "साली", "साला", "ननद", "जेठ", "जेठानी", "ससुर", "सास", "ससुराल", "बहनोई", "भतीजा",
    "भतीजी", "भांजा", "भांजी", "भानजा", "पति", "पत्नी",
    // Devanagari third-person pronouns
    "वह", "वो", "वे", "उसका", "उसकी", "उसके", "उनका", "उनकी", "उनके", "उसे", "उन्हें", "उसने", "उन्होंने",
  ].map((w) => w.normalize("NFC")),
);

/**
 * ISS-t-013r-c0-1 (fix cycle 1): negation AND contrast cues. Any hit anywhere in the cited turn forces
 * needsReview. "Anywhere in the turn", not "before the value in the clause", on purpose: Hindi puts
 * the negation AFTER the value ("UK nahi, Canada jaana hai"), and a model-cropped quote ("I want the
 * UK") can hide a negation that sits just outside it — the whole-turn check is the fail-safe
 * superset of the clause rule. Contrast words (instead/rather/than/but/lekin …) are included because
 * "Canada instead of the UK" negates the UK without a negation word.
 */
const NEGATION_MARKERS = new Set(
  [
    "not", "no", "never", "nor", "neither", "none", "nothing", "nobody", "nowhere", "without", "cannot",
    "dont", "doesnt", "didnt", "cant", "wont", "isnt", "arent", "wasnt", "werent", "shouldnt", "wouldnt",
    "couldnt", "havent", "hasnt", "hadnt", "instead", "rather", "than", "except", "unlike", "versus", "vs",
    "but", "however", "although", "though", "earlier", "previously", "anymore",
    "nahi", "nahin", "nhi", "nai", "mat", "na", "naa", "bina", "bajay", "bajaye", "bajaaye", "lekin", "magar",
    "chhodkar", "chodkar", "pehle",
    "नहीं", "नही", "मत", "न", "ना", "बिना", "बजाय", "बजाए", "लेकिन", "मगर", "छोड़कर", "पहले",
  ].map((w) => w.normalize("NFC")),
);
/** English "n't" contractions, checked on the text BEFORE punctuation is broken into spaces. */
const NT_CONTRACTION_RE = /n['’]t(?![\p{L}\p{Nd}])/u;

/**
 * ISS-t-013r-rev-2 (fix cycle 1): unit multipliers and currencies. A typed number never auto-verifies
 * when one appears anywhere in the cited turn ("20 lakh" must not auto-verify 20, and neither may the
 * scaled 2000000 — the model's arithmetic is exactly what the counsellor should check).
 */
const MULTIPLIER_MARKERS = new Set(
  [
    "lakh", "lakhs", "lac", "lacs", "crore", "crores", "cr", "crs", "k", "thousand", "thousands", "million",
    "millions", "mn", "billion", "billions", "bn", "hazaar", "hazar", "rs", "inr", "usd", "gbp",
    "eur", "aud", "cad", "nzd", "sgd", "rupee", "rupees", "rupaye", "rupaiye", "dollar", "dollars", "pound",
    "pounds", "euro", "euros", "लाख", "करोड़", "हज़ार", "हजार", "रुपये", "रुपए", "रुपया",
  ].map((w) => w.normalize("NFC")),
);
const CURRENCY_SYMBOL_RE = /[₹$£€¥]/u;
/** A digit run glued to a multiplier/currency ("20k", "20lakh", "rs20", "inr20", "rs.20"). */
const GLUED_MULTIPLIER_RE =
  /^(?:(?:rs|inr|usd|gbp|eur)\.?\p{Nd}[\p{Nd}.,]*|\p{Nd}[\p{Nd}.,]*(?:k|l|lac|lacs|lakh|lakhs|cr|crs|crore|crores|mn|m|bn|b))$/u;

/**
 * ISS-t-013r-c0-1/-c0-2 (fix cycle 1): a FIRST-PERSON marker must be present in the cited QUOTE for
 * any auto-verify — the value must be anchored to the student speaking about themselves. "mein" is
 * deliberately absent (Hinglish "in": "UK mein"), and so is "us" (collides with the country "US").
 */
const FIRST_PERSON_MARKERS = new Set(
  [
    "i", "me", "my", "mine", "myself", "we", "our", "ours", "ourselves", "im", "ive",
    "main", "mai", "mujhe", "mujhko", "mera", "meri", "mere", "hum", "humara", "humari", "humare", "hamara",
    "hamari", "hamare", "humein", "hamein", "maine", "mene", "mainey",
    "मैं", "मै", "मुझे", "मुझको", "मेरा", "मेरी", "मेरे", "हम", "हमारा", "हमारी", "हमारे", "हमें", "मैंने",
  ].map((w) => w.normalize("NFC")),
);

function hasMarker(normalisedText: string, markers: ReadonlySet<string>): boolean {
  return normalisedText
    .split(" ")
    .filter(Boolean)
    .some((tok) => markers.has(tok));
}

/** "in-law", "in law", "in-laws" (English), judged on the tier-2 text where "-" is a token break. */
const IN_LAW_RE = /(?:^| )in laws?(?: |$)/u;

function hasThirdPartyMarker(normalisedText: string): boolean {
  return hasMarker(normalisedText, THIRD_PARTY_MARKERS) || IN_LAW_RE.test(normalisedText);
}

/**
 * ISS-t-013r-rev-4 (fix cycle 2): interrogative mood. A question is never a decided fact. Fires on a
 * literal question mark anywhere in the cited turn, on a question word (kya/क्या/whether/kaun/kahan
 * …), or on an English modal/auxiliary + first person inversion ("should I", "can we", "do I").
 */
const INTERROGATIVE_MARKERS = new Set(
  [
    "kya", "kyaa", "kyá", "whether", "kaun", "kaunsa", "kaunsi", "kaunse", "kahan", "kahaan", "kidhar", "kyun",
    "kyon", "kyu", "kaise", "kab",
    "क्या", "कौन", "कौनसा", "कौनसी", "कहाँ", "कहां", "किधर", "क्यों", "क्यूँ", "कैसे", "कब",
  ].map((w) => w.normalize("NFC")),
);
const QUESTION_MARK_RE = /[?？]/u;
const INVERSION_RE =
  /(?:^| )(?:should|shall|could|can|may|might|will|would|do|does|did|am|must|ought|have|was|were|is|are) (?:i|we)(?: |$)/u;

function hasInterrogative(rawText: string, normalisedText: string): boolean {
  return QUESTION_MARK_RE.test(rawText) || hasMarker(normalisedText, INTERROGATIVE_MARKERS) || INVERSION_RE.test(normalisedText);
}

/**
 * ISS-t-013r-rev-5 (fix cycle 2): conditional / hypothetical / uncertain mood. "if I get admission I
 * will go to Canada", "agar scholarship milti hai to …", "in an ideal world I would …", "maybe …".
 * "would" is a marker except in the fixed polite-preference phrases "would like" / "would love"
 * (which the allow-list templates spell as "I'd like" / "I would like").
 */
const CONDITIONAL_MARKERS = new Set(
  [
    "if", "unless", "would", "might", "maybe", "perhaps", "possibly", "probably", "suppose", "supposing",
    "assuming", "provided", "hypothetically", "ideally", "ideal", "hopefully", "otherwise", "someday",
    "agar", "agr", "yadi", "kaash", "kash", "shayad", "shaayad", "sambhav", "mumkin", "hoga", "hogi",
    "अगर", "यदि", "काश", "शायद", "संभव", "मुमकिन", "होगा", "होगी",
  ].map((w) => w.normalize("NFC")),
);

function hasConditional(normalisedText: string): boolean {
  const withoutPolitePreference = normalisedText.replace(/(?:^| )would (?:like|love)(?= |$)/gu, " ");
  return hasMarker(withoutPolitePreference, CONDITIONAL_MARKERS);
}

/**
 * ISS-t-013r-c2-1 / ISS-t-013r-rev-9 (fix cycle 3): reported speech / attribution — the SECOND layer
 * behind the single-clause rule. "Rahul said, I want to study in UK", "according to X …", "woh kehta
 * hai …", "मेरे समधी कहते हैं, …": the clause is someone else's words, whoever the (unlisted) subject is.
 * Closed set; "according to" / "ke mutabik" / "के अनुसार" are caught by their content word.
 */
const REPORTING_MARKERS = new Set(
  [
    "say", "says", "said", "saying", "tell", "tells", "told", "telling", "ask", "asks", "asked", "wrote", "writes",
    "written", "texted", "texts", "messaged", "mentioned", "mentions", "according", "claims", "claimed", "quoted",
    "kaha", "kahaa", "kehta", "kehte", "kehti", "kahta", "kahte", "kahti", "bola", "boli", "bole", "bolta", "bolti",
    "bolte", "bataya", "batati", "batata", "batate", "mutabik", "mutaabik", "anusar", "anusaar",
    "कहा", "कहता", "कहते", "कहती", "बोला", "बोली", "बोले", "बोलता", "बोलती", "बोलते", "बताया", "बताती", "बताता",
    "बताते", "मुताबिक", "मुताबिक़", "अनुसार",
  ].map((w) => w.normalize("NFC")),
);

function hasReportedSpeech(normalisedText: string): boolean {
  return hasMarker(normalisedText, REPORTING_MARKERS);
}

// ---------------------------------------------------------------------------
// ISS-t-013r-rev-6 (fix cycle 2): the ALLOW-LIST. A fact auto-verifies only when its cited quote is,
// on its own, ONE whole clause of the cited turn AND that clause matches one of a small set of
// declarative first-person templates for the auto-verifiable kinds (country preference/destination,
// budget number, exam score number) in English, Hinglish and Devanagari — with the template's slot
// holding exactly the fact's value. Any other shape is `unrecognised-form` (kept, needsReview). The
// deny sets above stay as a second layer judged on the whole turn. Fail-safe by construction: a new
// risk class (a mood, a relation, a date) can no longer auto-verify just because nobody listed it.
// ---------------------------------------------------------------------------

/**
 * Template normalisation: NFC, lower case, every punctuation mark becomes a space EXCEPT a "." or ","
 * between two digits (so "7.5" and "20,000" stay one number token), whitespace collapsed.
 */
function normaliseTemplate(text: string): string {
  return collapseWhitespace(
    stripInvisibleFormat(text)
      .normalize("NFC")
      .toLowerCase()
      .replace(/(?<!\p{Nd})[.,]|[.,](?!\p{Nd})/gu, " ")
      .replace(/[!?？;:"'()\-–—।“”‘’/]/gu, " "),
  );
}

/**
 * The clauses of a turn: split at sentence/clause punctuation (never inside a decimal or a digit
 * grouping) and at "because"/"kyunki"/"क्योंकि", each template-normalised.
 */
function clausesOf(text: string): string[] {
  return stripInvisibleFormat(text)
    .normalize("NFC")
    .split(/[!?？;:।\n]|(?<!\p{Nd})[.,]|[.,](?!\p{Nd})|(?:^|\s)(?:because|kyunki|kyonki|kyoki|क्योंकि)(?=\s|$)/iu)
    .map((c) => normaliseTemplate(c ?? ""))
    .filter((c) => c.length > 0);
}

const DEGREE = "(?:masters|master s|bachelors|bachelor s|mba|ms|phd|ug|pg|undergrad|undergraduate|postgraduate|degree|higher studies|studies|education|graduation|post graduation)";
const EXAM =
  "(?:(?:the|my|apne|mere|meri) )?(?:(?:class|std|standard|grade) \\p{Nd}{1,2} |\\p{Nd}{1,2}th |cbse |icse |hsc |ssc |final |12वीं |10वीं |बारहवीं |दसवीं )?" +
  "(?:board|boards|board exam|board exams|boards exam|exam|exams|ielts|ielts academic|toefl|pte|gre|gmat|sat|act|duolingo|det|jee|jee main|jee mains|jee advanced|neet|cuet|cat|बोर्ड|परीक्षा|बोर्ड परीक्षा)" +
  "(?: (?:exam|test|overall|academic))?";
const NUM = "(?<n>\\p{Nd}+(?:[.,]\\p{Nd}+)*)";
const SCORE_UNIT = "(?: (?:percent|percentage|marks|points|band|bands|cgpa|gpa|अंक|प्रतिशत|नंबर|number))?";

/** Country templates; `{C}` is replaced by the aliases of the fact's canonical country only. */
const COUNTRY_TEMPLATES: readonly string[] = [
  // English: "I want to study in <country>", "I'd like to go to the <country>", "I am planning to move to <country> for my masters"
  `^i (?:really |definitely |also )?(?:want|wish|plan|intend|hope|aim|d like|would like|d love|would love|am planning|m planning|am going|m going|am hoping|m hoping|am aiming|m aiming|am applying|m applying|have decided|ve decided|decided) to (?:study|go|move|settle|live|work|apply|pursue|do|shift|relocate)(?: [\\p{L}]+){0,4}? (?:in|to) (?:the )?{C}(?: for (?:my |a |an )?${DEGREE})?$`,
  // English: "my first choice is <country>", "my preferred destination is the <country>"
  `^my (?:(?:first|top|preferred|dream|target|final|main) )*(?:choice|preference|destination|country|target|option|pick)(?: country| destination)? is (?:the )?{C}$`,
  // English: "I prefer <country>", "I have chosen the <country> for my masters"
  `^i (?:prefer|choose|chose|have chosen|ve chosen|have picked|ve picked|picked|have selected|ve selected|selected) (?:the )?{C}(?: for (?:my |a |an )?${DEGREE})?$`,
  // Hinglish: "main <country> jaana chahta/chahti hoon", "main <country> mein padhna chahta hu"
  `^(?:main|mai) {C}(?: (?:mein|me|main))? (?:jaana|jana|padhna|padhai karna|study karna|settle hona|settle karna|shift hona|rehna|jaake padhna) (?:chahta|chahti|chahte) (?:hoon|hu|hun|hoo|hai|hain)$`,
  // Hinglish: "mujhe <country> jaana hai"
  `^(?:mujhe|mujhko) {C}(?: (?:mein|me))? (?:jaana|jana|padhna|padhai karni|padhai karna|study karna|settle hona|shift hona|rehna|jaake padhna) (?:hai|he)$`,
  // Hinglish: "meri pehli choice <country> hai"
  `^(?:meri|mera) (?:(?:pehli|first|top) )?(?:choice|preference|pasand|target|destination) {C} (?:hai|he)$`,
  // Devanagari: "मैं <country> जाना चाहता हूँ"
  `^(?:मैं|मै) {C}(?: में)? (?:जाना|पढ़ना|पढ़ाई करना|बसना|रहना) (?:चाहता|चाहती|चाहते) (?:हूँ|हूं|हू|हैं)$`,
  // Devanagari: "मुझे <country> जाना है"
  `^मुझे {C}(?: में)? (?:जाना|पढ़ना|पढ़ाई करनी|पढ़ाई करना|रहना) है$`,
  // Devanagari: "मेरी पहली पसंद <country> है"
  `^(?:मेरी|मेरा) (?:पहली )?(?:पसंद|लक्ष्य) {C} है$`,
];

/** Number templates (budget, exam score); the `n` group must spell exactly the fact's value. */
const NUMBER_TEMPLATES: readonly string[] = [
  // English budget: "my budget is 1500000", "my annual budget is 25000 per year"
  `^my (?:total |annual |yearly |overall |maximum |max )?budget is ${NUM}(?: (?:per year|a year|per annum|annually|total|in total))?$`,
  // English score: "I scored 92 in my class 12 boards", "I got 7.5 in IELTS"
  `^i (?:scored|got|secured|have scored|ve scored|have got|ve got|received|obtained) ${NUM}${SCORE_UNIT} (?:in|on) ${EXAM}$`,
  // English score: "my score was 92 in boards", "my IELTS score is 7.5"
  `^my (?:${EXAM} )?(?:score|marks|percentage|band|result|gpa|cgpa|percent)(?: (?:in|on|for) ${EXAM})? (?:is|was) ${NUM}${SCORE_UNIT}(?: (?:in|on) ${EXAM})?$`,
  // Hinglish budget: "mera budget 1500000 hai"
  `^mera (?:total |saalana |salana |annual |yearly |poora )?budget ${NUM}(?: (?:per year|saal ka|salana))? (?:hai|he)$`,
  // Hinglish score: "maine IELTS mein 7.5 score kiya"
  `^(?:maine|mene) ${EXAM} (?:mein|me|main) ${NUM}${SCORE_UNIT} (?:score kiya|score kiye|score kiya hai|scored|laaye|laye|liye|nikale|paaye|paye|haasil kiye|hasil kiye|laaye hain|liye hain)$`,
  // Hinglish score: "mere boards mein 92 percent aaye"
  `^mere ${EXAM} (?:mein|me) ${NUM}${SCORE_UNIT} (?:aaye|aye|aaye hain|aaye the|hain|the)$`,
  // Hinglish score: "mera IELTS score 7.5 hai"
  `^mera ${EXAM} (?:score|result|percentage|band) ${NUM}${SCORE_UNIT} (?:hai|tha|he)$`,
  // Devanagari budget: "मेरा बजट 1500000 है"
  `^मेरा (?:कुल |सालाना )?बजट ${NUM} है$`,
  // Devanagari score: "मैंने IELTS में 7.5 स्कोर किया"
  `^मैंने ${EXAM} में ${NUM}${SCORE_UNIT} (?:स्कोर किया|स्कोर किए|प्राप्त किए|प्राप्त किया|लाए|हासिल किए)$`,
  // Devanagari score: "मेरे बोर्ड में 92 प्रतिशत आए"
  `^मेरे ${EXAM} में ${NUM}${SCORE_UNIT} (?:आए|आये|हैं|थे)$`,
];

const COMPILED_NUMBER_TEMPLATES: readonly RegExp[] = NUMBER_TEMPLATES.map((t) => new RegExp(t.normalize("NFC"), "u"));
const countryTemplateCache = new Map<string, readonly RegExp[]>();

function countryTemplatesFor(canonical: string): readonly RegExp[] {
  const cached = countryTemplateCache.get(canonical);
  if (cached) return cached;
  const aliases = [...COUNTRY_ALIASES.entries()]
    .filter(([, canon]) => canon === canonical)
    .map(([alias]) => escapeRegExp(normaliseTemplate(alias)))
    .sort((a, b) => b.length - a.length);
  const slot = `(?:${aliases.join("|")})`;
  const compiled = COUNTRY_TEMPLATES.map((t) => new RegExp(t.normalize("NFC").split("{C}").join(slot), "u"));
  countryTemplateCache.set(canonical, compiled);
  return compiled;
}

/**
 * ISS-t-013r-c2-1 / ISS-t-013r-rev-9 (fix cycle 3): the ONE closed two-clause shape that survives the
 * single-clause rule — a bare acknowledgement clause ("Yes, I want to study in Canada", "Haan ji. Main
 * Canada jaana chahta hoon"). Nothing else counts as trivial: "scratch that", "nope", "kidding",
 * "Rahul said" are all non-trivial clauses, so the turn goes to review.
 */
const TRIVIAL_CLAUSES = new Set(
  ["yes", "yeah", "yep", "ok", "okay", "haan", "han", "haan ji", "ji haan", "ji", "hmm", "sir", "maam", "ma am",
    "हाँ", "हां", "जी", "हाँ जी", "जी हाँ", "हां जी", "जी हां"].map((c) => normaliseTemplate(c)),
);

/** The non-trivial clauses of one turn text. */
function substantiveClauses(text: string): string[] {
  return clausesOf(text).filter((c) => !TRIVIAL_CLAUSES.has(c));
}

type AllowListVerdict = "allowed" | "multi-clause" | "unrecognised-form";

/**
 * The allow-list gate. "allowed" only when:
 *   - the quote is one whole clause of the cited turn (or of the quote itself when no turn context is
 *     given) and that clause matches a template whose slot is the value; otherwise "unrecognised-form";
 *   - (fix cycle 3, STRUCTURAL) every text of the cited turn (text and translatedText) has exactly ONE
 *     non-trivial clause — so no other clause of the same turn can attribute ("Rahul said, …"), retract
 *     ("… Scratch that, Canada.") or otherwise qualify it, whatever words it uses; otherwise "multi-clause".
 */
function matchesAllowedTemplate(value: unknown, quote: string, turnTexts: readonly string[]): AllowListVerdict {
  const clause = normaliseTemplate(quote);
  if (clause.length === 0) return "unrecognised-form";
  const sources = turnTexts.length > 0 ? turnTexts : [quote];
  const clausesPerSource = sources.map(substantiveClauses);
  if (!clausesPerSource.some((cs) => cs.includes(clause))) return "unrecognised-form";
  if (!clauseMatchesTemplate(value, clause)) return "unrecognised-form";
  if (clausesPerSource.some((cs) => cs.length !== 1)) return "multi-clause";
  return "allowed";
}

function clauseMatchesTemplate(value: unknown, clause: string): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    return COMPILED_NUMBER_TEMPLATES.some((re) => {
      const m = re.exec(clause);
      return m?.groups?.n !== undefined && m.groups.n === String(value);
    });
  }
  if (typeof value === "string") {
    const canonical = COUNTRY_ALIASES.get(value.trim().toLowerCase().normalize("NFC"));
    if (canonical === undefined) return false;
    return countryTemplatesFor(canonical).some((re) => re.test(clause));
  }
  return false;
}

function hasNegation(rawText: string, normalisedText: string): boolean {
  return NT_CONTRACTION_RE.test(normaliseVerbatim(rawText).toLowerCase()) || hasMarker(normalisedText, NEGATION_MARKERS);
}

function hasMultiplierOrCurrency(rawText: string, normalisedText: string): boolean {
  if (CURRENCY_SYMBOL_RE.test(rawText)) return true;
  // Glued forms are judged on whitespace tokens of the tier-1 text (punctuation kept, so "20,00,000"
  // and "rs.20" stay one token), with surrounding brackets/quotes/sentence punctuation trimmed.
  const rawTokens = normaliseVerbatim(rawText).toLowerCase().split(" ");
  if (rawTokens.some((t) => GLUED_MULTIPLIER_RE.test(t.replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/gu, "")))) return true;
  return hasMarker(normalisedText, MULTIPLIER_MARKERS);
}

/**
 * ISS-t-013r-rev-2 (fix cycle 1): a typed number is a whole token in the tier-1 text (NFC, whitespace
 * collapsed, punctuation KEPT) — bounded on the left by start/whitespace/an opening bracket or quote,
 * and on the right by end/whitespace/%/closing punctuation, where a "." or "," is NOT followed by a
 * digit. So 20 is not found in "20,00,000", "1.20", "20-25", "20/40", "$20" or "20k"; 1.5 is found
 * in "1.5" but neither 1 nor 5 is.
 */
function containsNumberToken(rawText: string, value: number): boolean {
  const text = ` ${normaliseVerbatim(rawText).toLowerCase()} `;
  const num = escapeRegExp(String(value));
  const re = new RegExp(`[\\s("'“‘]${num}(?=\\s|%|[)"'”’;:!?]|[.,](?!\\p{Nd}))`, "u");
  return re.test(text);
}

export interface FactReviewOutcome {
  needsReview: boolean;
  reviewReasons: string[];
}

/** Named review reasons (B2/D-020): stable prefixes so the counsellor UI and evals can key on them. */
export const REVIEW_REASONS = {
  thirdParty:
    "third-party: a third-party referent (relative/friend/pronoun such as cousin, behen, bhai, he, she, their) " +
    "appears in the cited turn; the value's grounding to the student is not certain (D-020)",
  negation:
    "negation: a negation or contrast cue (not/never/no/instead/than/but/nahi/nahin/mat …) appears in the cited " +
    "turn, so the value may be denied rather than affirmed (D-020, fail-safe)",
  noFirstPerson:
    "no-first-person: the cited quote carries no first-person marker (I/me/my/main/mujhe/mera/meri/hum …), so " +
    "the value is not anchored to the student speaking about themselves (D-020, fail-safe)",
  multiplier:
    "unit-multiplier: a unit multiplier or currency (lakh/crore/k/thousand/million/₹/rs/INR/$/USD/£/€ …) appears " +
    "in the cited turn; the scaled amount must be checked by the counsellor (D-020, fail-safe)",
  reasoning: "reasoning: a reasoning fact is always kept for the counsellor's review (B2/D-020)",
  interrogative:
    "interrogative: the cited turn is (or contains) a question (?, kya/क्या, should I, can we …); a question is " +
    "not a decided fact (D-020, fail-safe)",
  conditional:
    "conditional: the cited turn is conditional or hypothetical (if/agar/would/might/maybe/perhaps/kaash/in an " +
    "ideal world …); the value is not a settled fact (D-020, fail-safe)",
  unrecognisedForm:
    "unrecognised-form: the cited quote is not one whole declarative first-person clause matching an auto-verify " +
    "template (I want to study in <country> / my budget is <number> / I scored <number> in <exam> …, English, " +
    "Hinglish, Devanagari); the counsellor decides (D-020, allow-list)",
  multiClause:
    "multi-clause: the cited turn has more than one clause, so another clause can attribute, retract or qualify " +
    "the value (Rahul said, … / … scratch that, Canada); only a single-clause turn auto-verifies (D-020, allow-list)",
  reportedSpeech:
    "reported-speech: a reporting or attribution cue (said/says/told/according to/kaha/kehta/bola/ke mutabik/" +
    "कहा/बोला/के मुताबिक …) appears in the cited turn; the words may be someone else's (D-020, fail-safe)",
} as const;

/**
 * Decides whether a fact auto-verifies (needsReview: false) or is kept flagged for the counsellor
 * (needsReview: true) — NEVER dropped for this reason (B2, D-020). Fail-safe (fix cycle 1): a fact
 * auto-verifies only when ALL of these hold, otherwise it is needsReview with every failing condition
 * named in reviewReasons:
 *   1. its value is on the closed surface — a typed number that is a whole number token in the quote,
 *      or a string on the closed COUNTRY_ALIASES vocabulary whose alias is a whole word in the quote;
 *   2. the QUOTE carries a first-person marker;
 *   3. the cited TURN carries no negation/contrast cue;
 *   4. the cited TURN carries no third-party marker;
 *   5. (numbers) the cited TURN carries no unit multiplier or currency;
 *   6. (fix cycle 2, ISS-t-013r-rev-4/-5) the cited TURN carries no interrogative or conditional cue;
 *   7. (fix cycle 2, ISS-t-013r-rev-6, the ALLOW-LIST) the quote is one whole clause of the cited turn
 *      and matches a declarative first-person template whose slot is exactly the value
 *      (matchesAllowedTemplate); otherwise `unrecognised-form`;
 *   8. (fix cycle 3, ISS-t-013r-c2-1/-rev-9) every text of the cited turn has exactly ONE non-trivial
 *      clause (a bare "yes/haan ji" acknowledgement is the only trivial one); otherwise `multi-clause`;
 *   9. (fix cycle 3) the cited TURN carries no reporting/attribution cue; otherwise `reported-speech`.
 * A `reasoning` fact is always needsReview, regardless of its value.
 *
 * `context` is the full text of the cited turn (and its translation, if any). Conditions 3-5 are
 * judged on the quote PLUS that context, so a model-cropped quote cannot hide a cue that sits just
 * outside it. When omitted, the quote alone is the context.
 */
export function assessFactForReview(
  candidate: { kind: string; value: unknown },
  quote: string,
  context: readonly (string | undefined)[] = [],
): FactReviewOutcome {
  const reasons: string[] = [];
  const normalisedQuote = normaliseLoose(quote);
  const contextTexts = [quote, ...context.filter((t): t is string => typeof t === "string" && t.length > 0)];
  const contextPairs = contextTexts.map((t) => [t, normaliseLoose(t)] as const);

  const thirdParty = contextPairs.some(([, n]) => hasThirdPartyMarker(n));
  const negated = contextPairs.some(([raw, n]) => hasNegation(raw, n));
  const firstPerson = hasMarker(normalisedQuote, FIRST_PERSON_MARKERS);
  // ISS-t-013r-rev-4/-rev-5 (fix cycle 2): mood deny layer, judged on the quote plus the whole turn.
  const interrogative = contextPairs.some(([raw, n]) => hasInterrogative(raw, n));
  const conditional = contextPairs.some(([, n]) => hasConditional(n));
  // ISS-t-013r-c2-1 / -rev-9 (fix cycle 3): attribution deny layer (second layer behind multi-clause).
  const reportedSpeech = contextPairs.some(([, n]) => hasReportedSpeech(n));

  if (thirdParty) reasons.push(REVIEW_REASONS.thirdParty);

  if (candidate.kind === "reasoning") {
    return { needsReview: true, reviewReasons: [...reasons, REVIEW_REASONS.reasoning] };
  }

  const guards: string[] = [];
  if (negated) guards.push(REVIEW_REASONS.negation);
  if (!firstPerson) guards.push(REVIEW_REASONS.noFirstPerson);
  if (interrogative) guards.push(REVIEW_REASONS.interrogative);
  if (conditional) guards.push(REVIEW_REASONS.conditional);
  if (reportedSpeech) guards.push(REVIEW_REASONS.reportedSpeech);
  // ISS-t-013r-rev-6 (fix cycle 2): the allow-list gate — the first layer; the deny sets are the second.
  // Fix cycle 3 (ISS-t-013r-c2-1 / -rev-9): it also requires a single-clause cited turn.
  const turnTexts = context.filter((t): t is string => typeof t === "string" && t.length > 0);
  const allowVerdict = matchesAllowedTemplate(candidate.value, quote, turnTexts);
  if (allowVerdict === "unrecognised-form") guards.push(REVIEW_REASONS.unrecognisedForm);
  if (allowVerdict === "multi-clause") guards.push(REVIEW_REASONS.multiClause);

  if (typeof candidate.value === "number" && Number.isFinite(candidate.value)) {
    const matched = containsNumberToken(quote, candidate.value);
    if (contextPairs.some(([raw, n]) => hasMultiplierOrCurrency(raw, n))) guards.push(REVIEW_REASONS.multiplier);
    if (matched && !thirdParty && guards.length === 0) return { needsReview: false, reviewReasons: [] };
    if (!matched) {
      reasons.push("typed number value is not a whole number token in the cited quote (B2 auto-verify requires an exact match)");
    }
    return { needsReview: true, reviewReasons: [...reasons, ...guards] };
  }

  if (typeof candidate.value === "string") {
    const canonical = COUNTRY_ALIASES.get(candidate.value.trim().toLowerCase().normalize("NFC"));
    const aliasHit =
      canonical !== undefined &&
      [...COUNTRY_ALIASES.entries()].some(
        ([alias, canon]) => canon === canonical && containsWholeWord(normalisedQuote, alias),
      );
    if (canonical !== undefined && aliasHit && !thirdParty && guards.length === 0) {
      return { needsReview: false, reviewReasons: [] };
    }
    if (canonical === undefined) {
      reasons.push("string value is not on the fixed country/alias vocabulary (B2 auto-verify surface)");
      return { needsReview: true, reviewReasons: reasons };
    }
    if (!aliasHit) reasons.push("the vocabulary value's alias is not a whole word/phrase in the cited quote");
    return { needsReview: true, reviewReasons: [...reasons, ...guards] };
  }

  reasons.push(`value type "${typeof candidate.value}" is outside the auto-verify surface (numbers + country/alias vocabulary only)`);
  return { needsReview: true, reviewReasons: reasons };
}

/** The model's source as a CardSource-shaped list, so the existing citation guard can judge it. */
function toCitationSources(source: unknown): { type: string; id: string; quote?: string }[] {
  if (source === null || typeof source !== "object") return [];
  const s = source as Record<string, unknown>;
  return [
    {
      type: typeof s.type === "string" ? s.type : "",
      id: typeof s.turnId === "string" ? s.turnId : "",
      quote: typeof s.quote === "string" ? s.quote : undefined,
    },
  ];
}

/**
 * Validates one model-proposed fact against the transcript. Returns the normalised Fact or the
 * reason it was dropped. Checks, in order: shape; the existing citation guard (B2: a source with a
 * non-empty type and turn id); a transcript source; the cited turn exists; the quote is verbatim in
 * that turn (fact-extraction SKILL.md: "never a paraphrase presented as a quote").
 */
export function verifyCandidateFact(
  raw: unknown,
  turnsById: ReadonlyMap<string, ScribeTurn>,
  sessionEndedAt: string,
): { fact: Fact } | { dropped: DroppedFact } {
  const shape = CandidateFactSchema.safeParse(raw);
  const key = typeof (raw as { key?: unknown } | null)?.key === "string" ? (raw as { key: string }).key : "";
  if (!shape.success) {
    return { dropped: { key, reason: `malformed fact: ${shape.error.issues.map((i) => i.message).join("; ")}` } };
  }
  const candidate = shape.data;

  const sources = toCitationSources(candidate.source);
  const guard = citationGuard({ sources });
  if (!guard.ok) return { dropped: { key, reason: guard.reason } };

  const source = sources[0]!;
  if (source.type !== "transcript" || !source.quote) {
    return { dropped: { key, reason: "a scribe fact must cite a transcript quote + turn (B2)" } };
  }
  const turn = turnsById.get(source.id);
  if (!turn) {
    return { dropped: { key, reason: `cites turn "${source.id}", which is not in this session's transcript (B2)` } };
  }

  const kind = candidate.kind ?? "value";
  if (kind === "reasoning" && !candidate.explains) {
    return {
      dropped: {
        key,
        reason: "a reasoning fact must name `explains` (the key of the value fact it accounts for), B2/D-020",
      },
    };
  }

  // T-013 rescope (D-020): two strict tiers, never fuzzy. A quote that matches at NEITHER tier is a
  // genuine fabrication (dropped); one that matches only at "normalised" is a real citation (kept),
  // just recorded as weaker evidence — this is what recovers the T-009 case-drift facts that a
  // single case-sensitive `.includes()` used to drop outright.
  const matchTier = locateCitation(source.quote, [turn.text, turn.translatedText]);
  if (!matchTier) {
    return { dropped: { key, reason: `quote is not found in turn "${source.id}", even after normalisation (fabricated citation, B2)` } };
  }

  const review = assessFactForReview({ kind, value: candidate.value }, source.quote, [
    turn.text,
    turn.translatedText,
  ]);
  const reviewReasons =
    matchTier === "normalised" && review.needsReview
      ? ["citation matched only after normalisation (case/punctuation/Unicode-form drift), not verbatim", ...review.reviewReasons]
      : review.reviewReasons;

  const fact = FactSchema.parse({
    key: candidate.key,
    value: candidate.value,
    kind,
    ...(candidate.explains ? { explains: candidate.explains } : {}),
    source: { type: "transcript", quote: source.quote, turnId: source.id },
    confidence: candidate.confidence,
    validFrom: sessionEndedAt,
    // ISS-t-007-rev-5 (DPDP purpose limitation): the scribe runs under the profile_synthesis consent
    // only, so its facts carry exactly that purpose. Model-supplied tags are discarded, never merged.
    purposeTags: [SCRIBE_PURPOSE],
    sensitivity: candidate.sensitivity,
    citationMatch: matchTier,
    needsReview: review.needsReview,
    ...(reviewReasons.length > 0 ? { reviewReasons } : {}),
  });
  return { fact };
}

/** How many times a schema-invalid provider output is re-asked before the node fails (ISS-t-007-rev-1). */
export const PROVIDER_OUTPUT_RETRIES = 1;

function isSchemaError(err: unknown): err is ZodError {
  return err instanceof ZodError || (err as { name?: unknown } | null)?.name === "ZodError";
}

function describeSchemaError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`).join("; ");
}

/**
 * Calls the provider; if its output fails the node's output schema, re-asks at most
 * PROVIDER_OUTPUT_RETRIES times with the validation error appended to the input
 * (`previousAttemptError`), then gives up with `{ failedReason }`. Only schema failures are retried
 * here: any other provider error (network, auth, not wired) propagates to the checkpoint retry.
 *
 * T-021 fix cycle 1 (ISS-t-021-rev-2, gate `failover-scope` Q2 A): when `provider` is a
 * `@vc/providers` `FailoverProvider`, a schema-invalid (ZodError) response is now retried INSIDE
 * that call — it fails over to the next chain member within the SAME attempt budget and wall-clock
 * deadline (see `isRetryableProviderError` there). A raw ZodError only ever reaches this function's
 * catch block for a non-chain (single-model) provider; for an exhausted FailoverProvider chain the
 * error that arrives here is the typed `AiUnavailableError`, which `isSchemaError` correctly does
 * NOT match, so it is rethrown unchanged below rather than triggering a second, fresh top-level
 * `provider.generate()` call that would otherwise reset the chain back to model 0 and start a brand
 * new deadline window (that reset was the actual bug ISS-t-021-rev-2 reported).
 */
async function generateWithRetry<T>(
  provider: LlmProvider,
  request: { skillName: string; skillPrompt: string; outputSchema: z.ZodType<T>; input: Record<string, unknown> },
): Promise<{ output: T } | { failedReason: string }> {
  let lastError = "";
  for (let attempt = 0; attempt <= PROVIDER_OUTPUT_RETRIES; attempt += 1) {
    const input = attempt === 0 ? request.input : { ...request.input, previousAttemptError: lastError };
    try {
      return { output: await provider.generate({ ...request, input }) };
    } catch (err) {
      if (!isSchemaError(err)) throw err;
      lastError = describeSchemaError(err);
    }
  }
  return {
    failedReason: `the ${request.skillName} output was schema-invalid after ${PROVIDER_OUTPUT_RETRIES + 1} attempts: ${lastError}`,
  };
}

export async function extractFacts(rawInput: unknown, deps: Omit<ScribeDeps, "db">): Promise<ExtractOutput> {
  const input = ExtractInputSchema.parse(rawInput);
  const skillPrompt = loadSkill(deps.skillsDir, "fact-extraction");
  const generated = await generateWithRetry(deps.provider, {
    skillName: "fact-extraction",
    skillPrompt,
    outputSchema: ExtractionSkillOutputSchema,
    input: { turns: input.turns },
  });
  if ("failedReason" in generated) {
    return ExtractOutputSchema.parse({ facts: [], dropped: [], failedReason: generated.failedReason });
  }
  const output = generated.output;

  const turnsById = new Map(input.turns.map((t) => [t.turnId, t]));
  const keptByKey = new Map<string, Fact>();
  const dropped: DroppedFact[] = [];
  for (const raw of output.facts) {
    const verdict = verifyCandidateFact(raw, turnsById, input.sessionEndedAt);
    if ("dropped" in verdict) {
      dropped.push(verdict.dropped);
      continue;
    }
    // One fact per key per session: a second fact for the same key would make the write
    // supersede the first inside one session. Keep the higher-confidence one.
    const prior = keptByKey.get(verdict.fact.key);
    if (prior) {
      const [keep, drop] = verdict.fact.confidence > prior.confidence ? [verdict.fact, prior] : [prior, verdict.fact];
      keptByKey.set(keep.key, keep);
      dropped.push({ key: drop.key, reason: "duplicate key in this session; the higher-confidence fact was kept" });
      continue;
    }
    keptByKey.set(verdict.fact.key, verdict.fact);
  }
  return ExtractOutputSchema.parse({ facts: [...keptByKey.values()], dropped });
}

// ---------------------------------------------------------------------------
// (d) session summary — skill via provider, B1 recital check
// ---------------------------------------------------------------------------

export async function summarizeSession(rawInput: unknown, deps: Omit<ScribeDeps, "db">): Promise<SummaryOutput> {
  const input = SummaryInputSchema.parse(rawInput);
  const skillPrompt = loadSkill(deps.skillsDir, "session-summary");
  const generated = await generateWithRetry(deps.provider, {
    skillName: "session-summary",
    skillPrompt,
    outputSchema: SummarySkillOutputSchema,
    input: { turns: input.turns, facts: input.facts },
  });
  if ("failedReason" in generated) {
    return SummaryOutputSchema.parse({ summary: "", failedReason: generated.failedReason });
  }
  const output = generated.output;
  // B1: a summary is a record, never a script. Judged as a statement-type text ("evidence"), so
  // only recital cues flag it, never the lack of a "?".
  if (isScriptLike(output.summary, "evidence")) {
    return SummaryOutputSchema.parse({
      summary: "",
      summaryWithheldReason:
        "The generated summary read as a script for the counsellor to recite (contract B1), so it was withheld.",
    });
  }
  return SummaryOutputSchema.parse({ summary: output.summary });
}

// ---------------------------------------------------------------------------
// (e) profile diff — pure proposal, writes nothing
// ---------------------------------------------------------------------------

/**
 * Reads the student's OPEN facts (`active: true`, D-013) and diffs the session's facts against them
 * with @vc/db proposeFactChanges, which writes nothing.
 *
 * T-003b carry-forward: during another writer's retire->insert window a key can have ZERO open
 * facts. This read then proposes an "add" with no `before`. That is safe because nothing is written
 * on the strength of this read: applyApprovedDiff re-reads the open fact at write time, and a
 * genuine concurrent value surfaces as FactConflictError (status "conflict"), never a silent
 * overwrite.
 */
export async function proposeDiff(rawInput: unknown, deps: Pick<ScribeDeps, "db">): Promise<DiffOutput> {
  const input = DiffInputSchema.parse(rawInput);
  const existingFacts = await factsCollection(deps.db).find({ studentId: input.studentId, active: true }).toArray();
  const diff = proposeFactChanges({
    studentId: input.studentId,
    summary: input.summary,
    existingFacts,
    candidateFacts: input.facts,
  });
  const changedKeys = new Set(diff.changes.map((c) => c.key));
  const proposedFacts = input.facts.filter((f) => changedKeys.has(f.key));
  return DiffOutputSchema.parse({ diff, proposedFacts });
}

// ---------------------------------------------------------------------------
// (f) counsellor response -> CounsellorDecision
// ---------------------------------------------------------------------------

/**
 * T-008: a counsellor response that is schema-valid but does not fit the thread's proposal (a
 * per_fact response that misses a proposed fact, names an unknown key, or decides a key twice).
 * Thrown by decisionFromResponse, which resumeScribe runs BEFORE taking the claim, so nothing is
 * claimed or written and the thread stays open for a corrected response.
 */
export class ApprovalResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalResponseError";
  }
}

/** "string" | "number" | "boolean" for a scalar; "other" for anything else (object, array, null, ...). */
function scalarTypeOf(v: unknown): "string" | "number" | "boolean" | "other" {
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  return "other";
}

/**
 * T-008 / ISS-t-013-rev-5: per-fact decisions -> the facts to write (approved as proposed, edited
 * with the counsellor's value, rejected ones left out). The decision approves when anything is
 * kept: at least one fact, or the summary.
 *
 * T-018 / ISS-t-008-c0-1: an edit's value must be the SAME scalar type as the proposed value it
 * replaces (a number stays a number, a string stays a string, a boolean stays a boolean). This is
 * checked here, not only in EditedValueSchema (schemas.ts), because only this function has BOTH
 * sides to compare — the schema alone can refuse a non-scalar edit value (cheap, no context
 * needed) but can not know what type the proposal itself was. A proposed value that is itself an
 * array or object (scalarTypeOf -> "other") can never match any scalar edit, so editing such a
 * fact is refused outright: the counsellor must reject it and add a new fact by hand instead
 * (same design choice as EditedValueSchema's own refusal, qa/manifests/t-008-approval-ui.md
 * residual 1). Checked in the SAME loop that validates keys, before any edit is applied, so a bad
 * response is refused before anything is claimed or written (B3), matching
 * ApprovalResponseError's existing contract.
 */
function perFactDecision(
  response: Extract<ApprovalResponse, { action: "per_fact" }>,
  proposedFacts: Fact[],
): ApprovalOutput {
  const proposedByKey = new Map(proposedFacts.map((f) => [f.key, f]));
  const seen = new Set<string>();
  for (const d of response.facts) {
    if (!proposedByKey.has(d.key)) throw new ApprovalResponseError(`per_fact: "${d.key}" is not a proposed fact of this thread`);
    if (seen.has(d.key)) throw new ApprovalResponseError(`per_fact: "${d.key}" is decided more than once`);
    seen.add(d.key);
    if (d.decision === "edit") {
      const proposed = proposedByKey.get(d.key)!;
      const proposedType = scalarTypeOf(proposed.value);
      const editedType = scalarTypeOf(d.value);
      if (editedType !== proposedType) {
        throw new ApprovalResponseError(
          `per_fact: "${d.key}" is edited with a ${editedType} value, but the proposed value is a ${proposedType} ` +
            `(an edited value must match the proposed value's type; reject the fact and add a new one instead)`,
        );
      }
    }
  }
  const missing = proposedFacts.filter((f) => !seen.has(f.key)).map((f) => f.key);
  if (missing.length > 0) throw new ApprovalResponseError(`per_fact: no decision for proposed fact(s) ${missing.join(", ")}`);

  const edits: Fact[] = [];
  const rejectedFacts: RejectedFact[] = [];
  for (const d of response.facts) {
    const proposed = proposedByKey.get(d.key)!;
    // ISS-t-007-rev-5: the consent purpose is never widened by an approval or an edit.
    if (d.decision === "approve") edits.push({ ...proposed, purposeTags: [SCRIBE_PURPOSE] });
    if (d.decision === "edit") edits.push({ ...proposed, value: d.value, purposeTags: [SCRIBE_PURPOSE] });
    if (d.decision === "reject") rejectedFacts.push({ key: d.key, ...(d.reason ? { reason: d.reason } : {}) });
  }
  const approve = edits.length > 0 || response.summary === "approve";
  return ApprovalOutputSchema.parse({
    decision: approve ? { approve: true, edits } : { approve: false },
    summaryDecision: response.summary,
    ...(rejectedFacts.length > 0 ? { rejectedFacts } : {}),
  });
}

export function decisionFromResponse(response: ApprovalResponse, proposedFacts: Fact[]): ApprovalOutput {
  switch (response.action) {
    case "per_fact":
      return perFactDecision(response, proposedFacts);
    case "approve":
      return ApprovalOutputSchema.parse({ decision: { approve: true, edits: proposedFacts } });
    case "edit":
      // ISS-t-007-rev-5: a counsellor edit changes values, never the consent purpose. The scribe's
      // facts are processed under profile_synthesis only, so any other tag in the edit is dropped.
      return ApprovalOutputSchema.parse({
        decision: { approve: true, edits: response.facts.map((f) => ({ ...f, purposeTags: [SCRIBE_PURPOSE] })) },
      });
    case "reject":
      return ApprovalOutputSchema.parse({ decision: { approve: false } });
  }
}

// ---------------------------------------------------------------------------
// (g) write — only on approval (B3)
// ---------------------------------------------------------------------------

export interface WriteApprovedOptions {
  /**
   * ISS-t-016-c0-1 / D-016: the SAME absolute instant the outer run's lease (graph.ts newLease) is
   * derived from. recordApprovedSessionSummary and applyApprovedDiff each bind their OWN
   * WriterDeadline to the time remaining until THIS instant (recomputed fresh at each call site, so
   * neither call's deadline can outlive the other's) instead of independently defaulting to the
   * package's full FENCED_WRITER_DEADLINE_MS whenever the outer run shortened its own deadline —
   * closing the gap where a caller-shortened `writerDeadlineMs` left the lease's window shorter
   * than the write's own (driver-level `timeoutMS`-bound) internal bound. Absent (a graph invoked
   * outside start/resumeScribe, e.g. a test driving graph.invoke directly): both calls fall back to
   * their own package default, unchanged from before this fix.
   */
  writerDeadlineExpiresAt?: number;
}

/**
 * ISS-t-016-c0-1 / ISS-t-018-rev-2: ms remaining until `expiresAt`, recomputed fresh at each call
 * site (never cached across writes), floored at 1ms so an already-expired outer deadline still
 * yields a valid (if immediately-expiring) WriterDeadline rather than falling back to the full
 * default. Exported so graph.ts's approval node can bind recordRejectReasons' deadline to the same
 * run lease writeApproved's own inner writes already use (the ISS-t-016-c0-1 pattern).
 */
export function boundedDeadlineMs(expiresAt: number | undefined): number | undefined {
  if (expiresAt === undefined) return undefined;
  return Math.max(1, expiresAt - Date.now());
}

/**
 * Applies an approved decision with @vc/db applyApprovedDiff, passing the sessionId FROM STATE
 * (D-012: the contentHash includes it, so a checkpoint replay of this node is an idempotent no-op).
 * A non-approval writes nothing. A genuine conflicting writer becomes status "conflict" (on the first
 * fact) or "partial_conflict" (on fact 2+, ISS-t-007-rev-4: earlier facts are committed and reported
 * in `writtenFactIds`). Both are terminal: a retry would hit the same foreign fact forever. Every
 * other error, including a PartialApplyError with a non-conflict cause, propagates so LangGraph can
 * retry this node from its checkpoint (idempotent by D-012).
 *
 * T-016 / ISS-t-007-rev-7: on approval, the approved summary is stored on the session row FIRST
 * (recordApprovedSessionSummary: never upserts, so a row the erasure already purged is not
 * recreated, and it throws, so no facts are written for an erased session either). Replays re-set
 * the same value.
 *
 * ISS-t-017-rev-1: recordApprovedSessionSummary's own pre/post-check can only see a fence that
 * exists by the time ITS post-check runs. A fence confirmed strictly AFTER that (but before or
 * during the applyApprovedDiff call right below) is invisible to it — it already returned
 * successfully. So when applyApprovedDiff itself ends fenced (`StudentFencedError`, from either its
 * own pre-check or its own post-check), this function also undoes the summary write by the exact
 * `approvedAt` recordApprovedSessionSummary returned, via `undoApprovedSessionSummary` (the same
 * match-key compensation, invoked one level up). Only with this does the full two-write approval
 * path ever leave zero summary residue on a `fenced` outcome, whichever of the two writes actually
 * caught the fence — closing the window `packages/db/src/facts.ts`'s module docstring and
 * `undoApprovedSessionSummary`'s own docstring describe, and that this function's docstring and
 * `packages/engine/src/scribe/graph.ts`'s `invokeFenceAware` docstring both now reflect accurately.
 *
 * ISS-t-017-c1-2 (a narrower window `StudentFencedError` alone does not cover): applyApprovedDiff
 * can ALSO end `FencedWriterDeadlineError` — thrown only when its OWN post-check (compensateIfFenced)
 * found the student NOT fenced at that exact instant (a genuine fence there throws
 * `StudentFencedError` instead, the case already handled above). A deadline error alone is therefore
 * ambiguous: it could be a plain slow write with nothing to do with erasure (D-012's retry is
 * idempotent; the summary should stay), or it could be an erasure confirmed strictly AFTER
 * applyApprovedDiff's own post-check read ran clean — a race narrower than the one this function's
 * pre-check window covers, invisible to applyApprovedDiff itself for the same reason a
 * `StudentFencedError` there wouldn't be ambiguous. So this function re-checks the fence itself
 * (`isStudentFenced`, the same read `compensateIfFenced`'s own post-check uses) before deciding: if
 * the student is fenced now, or the fence state can not be read at all (fail-safe — the same
 * "unreadable counts as fenced" rule `compensateIfFenced` and `graph.ts`'s `fencedForPostCheck` both
 * already use), the summary is undone before rethrowing; an UNFENCED deadline error is left alone —
 * legitimate, self-healing via `resumeScribe(null)`'s idempotent retry (D-012), nothing to
 * compensate.
 */
export async function writeApproved(
  rawInput: unknown,
  deps: Pick<ScribeDeps, "db">,
  options: WriteApprovedOptions = {},
): Promise<ScribeResult> {
  const input = WriteInputSchema.parse(rawInput);
  if (!input.decision.approve) {
    return ScribeResultSchema.parse({ status: "rejected" });
  }
  // T-008: a counsellor-withheld summary stores no text, only the reason.
  const withheld = input.summaryDecision === "withhold";
  const { approvedAt: summaryApprovedAt } = await recordApprovedSessionSummary(
    deps.db,
    {
      sessionId: input.sessionId,
      studentId: input.studentId,
      summary: withheld ? "" : input.summary,
      summaryWithheldReason: withheld ? COUNSELLOR_WITHHELD_SUMMARY_REASON : input.summaryWithheldReason,
    },
    { deadlineMs: boundedDeadlineMs(options.writerDeadlineExpiresAt) },
  );
  try {
    const applied = await applyApprovedDiff(deps.db, input.diff, input.decision, input.sessionId, {
      deadlineMs: boundedDeadlineMs(options.writerDeadlineExpiresAt),
    });
    return ScribeResultSchema.parse({
      status: "written",
      writtenFactIds: applied.written.map((doc) => doc._id),
      supersededKeys: applied.supersededKeys,
    });
  } catch (err) {
    if (err instanceof StudentFencedError) {
      // ISS-t-017-rev-1: applyApprovedDiff caught the fence (its own pre-check or post-check) AFTER
      // recordApprovedSessionSummary's own post-check already ran clean. Undo the summary this call
      // wrote too, matched on its own approvedAt, so it can only ever remove THIS call's value.
      // If the undo itself throws, that error propagates instead (never a silently-masked residue),
      // matching compensateIfFenced's own documented contract.
      await undoApprovedSessionSummary(deps.db, {
        sessionId: input.sessionId,
        studentId: input.studentId,
        summaryApprovedAt,
      });
      throw err;
    }
    if (err instanceof FencedWriterDeadlineError) {
      // ISS-t-017-c1-2: applyApprovedDiff's own post-check only found the student NOT fenced at the
      // instant it ran (a genuine fence there is StudentFencedError, handled above) — a fence
      // confirmed strictly AFTER that, in the narrow window before this deadline error surfaced, is
      // invisible to applyApprovedDiff itself. Re-check directly, right now, with the same read
      // compensateIfFenced's own post-check uses. An unreadable fence state fails safe (treated as
      // fenced), matching compensateIfFenced and graph.ts's fencedForPostCheck. An UNFENCED deadline
      // error (a plain slow write, nothing to do with erasure) leaves the summary alone: the retry is
      // idempotent under D-012, so there is nothing to compensate.
      let fencedNow: boolean;
      try {
        fencedNow = await isStudentFenced(deps.db, input.studentId, new Date(), { timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS });
      } catch {
        fencedNow = true; // fail-safe: an unreadable fence state is treated as fenced
      }
      if (fencedNow) {
        await undoApprovedSessionSummary(deps.db, {
          sessionId: input.sessionId,
          studentId: input.studentId,
          summaryApprovedAt,
        });
      }
      throw err;
    }
    if (err instanceof FactConflictError) {
      return ScribeResultSchema.parse({ status: "conflict", key: err.key, message: err.message });
    }
    if (err instanceof PartialApplyError && err.cause instanceof FactConflictError) {
      return ScribeResultSchema.parse({
        status: "partial_conflict",
        key: err.failingKey,
        writtenFactIds: err.writtenIds,
        message: err.message,
      });
    }
    throw err;
  }
}
