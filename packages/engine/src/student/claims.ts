/**
 * P1 U6 claims[] guard for the student surface (contract B2 student-surface claims, B24.4; spec scope
 * item 4, A1, A13, A22). Deterministic code, no LLM (B6).
 *
 * A `sourceId` is exactly one of: the KB `node_id` of a `sources.internal[]` entry returned by THIS
 * turn's `/ask`, or the `turnId` of a `/search` hit returned in THIS turn. Anything else is stripped.
 *  - `/search`: the hit's inline `text` is the evidence; `verified` when it supports the claim.
 *  - `/ask`: `verified` only when the node is in this response AND a session resolved from
 *    `evidence.sessionRef(s)` (or `session:<id>` / `/session:<id>` in the node_id) is fetched with
 *    `get_session` and one of its turns supports the claim. Otherwise a `kind:fact` claim is
 *    `attributed` (source present, text not proven) ONLY when the served /ask answer itself supports the fact (U6h H1);
 *    otherwise, and for every number/country claim, it is `unverified`. Only a served /ask counts (`isServedAsk`).
 *  - No resolvable source (empty or unresolvable sourceIds): the claim is DROPPED, never shown (repair
 *    R2a; the graph additionally hides `unverified` claims in anonymous mode, D-092).
 * "Supports" (stated heuristic, repair R5, tightened by U6h H2 - fail closed): the claim is cut into sentence-sized
 * clauses and each one must be fully carried by ONE evidence clause: the same negation (no / not / never / without /
 * free / n't / nahi / nahin / mat); every content word present (light stem + a tiny synonym table, no 50% overlap, so
 * an extra clause, an antonym such as mandatory/optional or higher/lower, or a swapped word fails); no quantifier the
 * evidence lacks AND none it drops (most / all / every / only / some / few, U6h fix1); the same hedges and modals (may / usually /
 * should), conditions (if / unless / provided) and scope words (public / private / international / postgraduate); a caveat
 * sentence right after the evidence clause ("This applies only to ...") must be carried too; the same comparators (at least /
 * at most); every number with the same value, currency/unit, rate (per month != per semester != a year; "two" = 2) and
 * country (a figure stays with the country it sits next to); every country named in the claim in that clause (exact
 * token or demonym, so "India" !~ "individual"); for fact/country claims every capitalised proper noun in the evidence.
 * Wording the heuristic does not know is unverified, never verified.
 *
 * Source kind (B24.4): each claim takes the MOST restrictive kind of its resolved sources (whatsapp >
 * unknown > toc > internal-seminar); a claim sourced from a served `/ask` answer is `unknown`. EVERY
 * claim, whatever it cites, is dropped when it has a verbatim run of >= 8 words from ANY restricted text
 * of the turn (whatsapp/unknown hits, the /ask answer, fetched get_session turns). Whatsapp/unknown
 * claims get personal identifiers redacted (speakerLabels of whatsapp AND unknown hits and of fetched
 * session turns); every claim gets phone numbers redacted and the default-deny no-quote guard.
 *
 * The KB port types below mirror the structuredContent of the U2 MCP tools (`search_kb`,
 * `ask_knowledge_base`, `get_session` in mcp/university-kb/src/index.ts). The engine does not import
 * that package; the API layer adapts the tool outputs onto this port.
 */
import type { Claim, Source } from "@vc/schemas";
import { hasVerbatimRun, noQuoteGuard, redactPersonalIdentifiers, type SpeakersFile } from "../guards/no-quote.js";

export type SourceKind = "internal-seminar" | "toc" | "whatsapp" | "unknown";
export type ClaimKind = Claim["kind"];

export interface SearchHit {
  turnId: string;
  sessionId: string;
  score: number;
  text: string;
  speakerLabel?: string;
  occurredAt?: string;
  sessionDate: string;
  sessionTitle?: string;
  sourceId: string;
  sourceKind: SourceKind;
}
export type SearchToolOutput =
  | { status: "ok"; hits: SearchHit[]; dropped: number }
  | { status: "unavailable"; unavailableReason?: string; detail?: string };

export interface AskInternalSource {
  node_id: string;
  evidence?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface AskToolOutput {
  status: "answered" | "no_sourced_answer" | "unavailable";
  answer: string;
  citations: { internal: AskInternalSource[]; web: Record<string, unknown>[] };
  verdict: string;
  reason: string;
  sourceKind?: "unknown";
  /** U2 serve rule: true when the retrieved nodes do not fully cover the question. Absent = cannot be confirmed. */
  insufficient_coverage?: boolean;
  withheld?: string[];
  unavailableReason?: string;
  detail?: string;
}

/**
 * U6h P4: the /ask serve rule, checked on the engine side. Served only when answered, verdict "correct",
 * `insufficient_coverage` explicitly false, at least one internal source and no web source. A result the
 * engine cannot confirm (a missing field counts) is never served: callers return the fixed no-answer.
 */
export function isServedAsk(ask: AskToolOutput | undefined): ask is AskToolOutput {
  return (
    !!ask &&
    ask.status === "answered" &&
    ask.verdict === "correct" &&
    ask.insufficient_coverage === false &&
    ask.citations.internal.length > 0 &&
    ask.citations.web.length === 0
  );
}

export type SessionToolOutput =
  | {
      status: "ok";
      session: { id: string; title?: string; date: string; sourceId: string };
      sourceKind?: SourceKind;
      turns: { turnId: string; text: string; speakerLabel?: string }[];
      dropped?: number;
    }
  | { status: "unavailable"; unavailableReason?: string; detail?: string };

/** The KB tools the student graph may call. Anonymous mode gets a port with `searchKb` only. */
export interface StudentKbPort {
  searchKb(query: string): Promise<SearchToolOutput>;
  askKnowledgeBase?(query: string): Promise<AskToolOutput>;
  getSession?(sessionId: string): Promise<SessionToolOutput>;
}

export interface DraftClaim {
  text: string;
  kind: ClaimKind;
  sourceIds: string[];
  /** LK5: the same claim in the reply language. The guards below read `text` (English) only; this rides along unchanged. */
  localized?: string | undefined;
}

export interface GuardedClaim extends Claim {
  sourceKind: SourceKind;
  /** LK5: carried through from the draft, unchecked here (the graph checks it against the guarded English claim). */
  localized?: string | undefined;
}

export interface ClaimsGuardContext {
  /** The /search hits used as evidence in this turn. */
  hits: SearchHit[];
  /** This turn's /ask result; only a served ("answered") result contributes node_ids. */
  ask?: AskToolOutput;
  getSession?: StudentKbPort["getSession"];
  now: Date;
  /** Sessions older than this are flagged `stale` [ASSUMPTION: 24 months, qa/gates signature sheet P-7]. */
  staleAfterMonths?: number;
  /** When given, the no-quote guard and the A22 source-kind rules run on every claim. */
  speakers?: SpeakersFile;
}

export interface ClaimsGuardResult {
  claims: GuardedClaim[];
  sources: Source[];
  dropped: { text: string; reason: "verbatim_restricted_source" | "no_resolvable_source" }[];
  unverifiedCount: number;
  /** Turn-wide restricted (WhatsApp/unknown, /ask) texts and speakerLabels, for the final-message check. */
  restricted: { texts: string[]; labels: string[] };
}

export const DEFAULT_STALE_AFTER_MONTHS = 24;

const KIND_RANK: Record<SourceKind, number> = { "internal-seminar": 0, toc: 1, unknown: 2, whatsapp: 3 };
const mostRestrictive = (kinds: SourceKind[]): SourceKind =>
  kinds.length === 0 ? "unknown" : kinds.reduce((a, b) => (KIND_RANK[b] > KIND_RANK[a] ? b : a));

// Countries checked against the text (spec: "numbers and country names are checked"). A claim naming a
// country outside this list is not checked for that country; the list covers the destinations the
// golden set names [ASSUMPTION] and is easy to extend.
const COUNTRIES = [
  "australia", "austria", "belgium", "canada", "china", "cyprus", "czech", "denmark", "dubai", "finland", "france",
  "germany", "hungary", "india", "ireland", "italy", "japan", "latvia", "lithuania", "malaysia", "malta", "netherlands",
  "new zealand", "norway", "poland", "portugal", "russia", "singapore", "south korea", "korea", "spain", "sweden",
  "switzerland", "uae", "united arab emirates", "uk", "united kingdom", "britain", "england", "scotland", "wales",
  "usa", "united states", "america", "ukraine", "georgia", "kazakhstan", "philippines", "bangladesh", "nepal",
];
const STOP = new Set([
  "about", "after", "also", "among", "around", "because", "before", "being", "between", "could", "every", "from",
  "have", "into", "more", "most", "much", "only", "other", "over", "some", "such", "than", "that", "their", "them",
  "then", "there", "these", "they", "this", "those", "very", "were", "what", "when", "where", "which", "while", "with",
  "would", "your", "will", "should", "does", "each", "here", "just", "like", "many", "make", "made", "same", "said",
]);

// Demonyms / adjective forms that name the same country (exact tokens; no prefix matching, so "India"
// never matches "individual"). Repair R5.
const DEMONYMS: Record<string, string[]> = {
  australia: ["australian", "australians"], austria: ["austrian"], belgium: ["belgian"], canada: ["canadian", "canadians"],
  china: ["chinese"], cyprus: ["cypriot"], czech: ["czechia"], denmark: ["danish"], finland: ["finnish"], france: ["french"],
  germany: ["german", "germans"], hungary: ["hungarian"], india: ["indian", "indians"], ireland: ["irish"], italy: ["italian"],
  japan: ["japanese"], latvia: ["latvian"], lithuania: ["lithuanian"], malaysia: ["malaysian"], malta: ["maltese"],
  netherlands: ["dutch", "holland"], norway: ["norwegian"], poland: ["polish"], portugal: ["portuguese"], russia: ["russian"],
  singapore: ["singaporean"], korea: ["korean"], spain: ["spanish"], sweden: ["swedish"], switzerland: ["swiss"],
  uk: ["british", "britain"], britain: ["british", "uk"], england: ["english"], scotland: ["scottish"], wales: ["welsh"],
  usa: ["american", "americans"], america: ["american", "americans"], ukraine: ["ukrainian"], georgia: ["georgian"],
  kazakhstan: ["kazakh"], philippines: ["filipino", "philippine"], bangladesh: ["bangladeshi"], nepal: ["nepali", "nepalese"],
  dubai: ["emirati"], uae: ["emirati"],
};

// Negation words (English, Hinglish). "free" counts: "tuition-free" negates fees. Repair R5.
const NEGATIONS = new Set(["no", "not", "never", "without", "free", "nahi", "nahin", "mat", "none", "cannot", "nor", "नहीं", "नही", "मत"]);
function hasNegation(text: string): boolean {
  if (/n['’]t\b/i.test(text)) return true;
  return tokens(text).some((t) => NEGATIONS.has(t));
}

// Capitalised words that are not proper nouns when they start a sentence (or anywhere). Repair R5.
const NOT_PROPER = new Set([
  ...STOP, "the", "a", "an", "as", "at", "by", "in", "on", "of", "to", "for", "and", "but", "or", "if", "so", "it", "its",
  "is", "are", "be", "can", "do", "all", "any", "both", "no", "not", "yes", "you", "we", "i", "he", "she", "our", "my",
  "his", "her", "per", "an", "after", "before", "during", "since", "until", "under", "within", "without", "how", "why", "who",
]);

/**
 * Light English stemmer (U6h H2): plural, -ed, -ing, trailing -e and a doubled final consonant, so
 * "programmes" ~ "program" and "charged" ~ "charge" but "optional" !~ "option". It replaces the old
 * 5-letter prefix, which let "mandatory"-style near-collisions through.
 */
function lightStem(word: string): string {
  let s = word;
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (!/(?:ss|us|is)$/.test(s)) {
    if (s.length > 3 && /(?:ch|sh|x|z|ss|o)es$/.test(s)) s = s.slice(0, -2);
    else if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
  }
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  if (s.length > 3 && /([^aeiou])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}
function tokens(text: string): string[] {
  return text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

// Synonym groups collapsed to one concept (the first member). Kept tiny on purpose: every entry widens what
// "supports" accepts. Antonyms are NOT listed, so "optional" never covers "mandatory" (H2).
const SYNONYM_GROUPS: string[][] = [
  ["required", "need", "mandatory", "compulsory", "necessary", "must", "obligatory", "essential"],
  ["allowed", "permitted", "permissible"],
];
const CANON = new Map<string, string>();
for (const group of SYNONYM_GROUPS) for (const w of group) CANON.set(lightStem(w), lightStem(group[0]!));
const conceptOf = (token: string): string => {
  const s = lightStem(token);
  return CANON.get(s) ?? s;
};

// Quantifiers: a claim may not carry one the matched evidence clause lacks ("most" -> "all" / "every" / "only").
const QUANTIFIERS: Record<string, string> = {
  all: "all", every: "all", each: "all", everyone: "all", entire: "all", whole: "all",
  any: "any", only: "only", most: "most", mostly: "most", majority: "most", many: "many", some: "some", several: "some",
  few: "few", both: "both", none: "none", always: "always", never: "never", sometimes: "sometimes",
  solely: "only", exclusively: "only", merely: "only",
};
// U6h fix1 H2a: restrictors a claim may neither drop nor add. Each class must be the SAME set in the claim clause and the
// evidence clause (both directions): a hedge or modal (may / usually / should), a condition (if / unless / provided) and a
// scope word (public / private / international / postgraduate). Wording outside these lists is caught by the content-word rule.
const HEDGES: Record<string, string> = {
  may: "possible", might: "possible", could: "possible", can: "possible", perhaps: "possible", possibly: "possible",
  should: "advice", ought: "advice",
  usually: "usual", generally: "usual", typically: "usual", normally: "usual", commonly: "usual", often: "usual",
  sometimes: "sometimes", occasionally: "sometimes", rarely: "rare", seldom: "rare",
  likely: "likely", probably: "likely", probable: "likely", unlikely: "unlikely",
};
const CONDITIONS: Record<string, string> = {
  if: "if", unless: "unless", provided: "if", providing: "if", once: "once", whenever: "if", otherwise: "unless", except: "except",
  depending: "depending", depends: "depending", subject: "depending",
  // P1 W3 (U6h leftover 5): temporal qualifiers ("until 2027", "since 2025", "starting next year") are conditions too.
  starting: "from", beginning: "from", effective: "from", until: "until", till: "until", since: "since",
};
// "from 2027", "by 2027", "before 2026", "after 2025": a dated bound is a restriction the claim may neither drop nor add.
const DATED_BOUND = /(?<![\p{L}\p{N}])(from|by|before|after)\s+(?:the\s+)?(?:19|20)\d\d(?![\p{L}\p{N}])/giu;
const SCOPE_WORDS = new Set(
  ["public", "private", "international", "domestic", "foreign", "overseas", "local", "undergraduate", "postgraduate", "graduate",
    "bachelor", "master", "doctoral", "phd", "eu", "part", "online", "residential",
    // P1 W3 (U6h leftover 5): partial and temporal scope - "for the first year", "in certain cases", "at selected universities".
    "first", "second", "final", "initial", "certain", "selected", "eligible", "qualifying", "specific", "particular", "partial",
    "partially", "temporary", "temporarily", "limited"].map((w) => lightStem(w)),
);
// Number comparators must match exactly in both directions ("at least 300" is not "300", "300" is not "at most 300").
const COMPARATORS = new Set([
  "more", "less", "fewer", "least", "minimum", "maximum", "below", "above",
  // P1 W3 (U6h leftover 5): "of up to 300 euros", "capped at", "max 300", "exceeding 300".
  "up", "upto", "cap", "capped", "max", "min", "exceeding", "exceeds", "exceed",
]);
// Words that carry no checkable content: articles, auxiliaries, pronouns, hedges and filler, and currency / percent
// words (the number check already compares the currency). "Only" and the other quantifiers are NOT here.
const FUNCTION_WORDS = new Set([
  "the", "and", "for", "are", "was", "were", "has", "had", "have", "been", "being", "can", "could", "may", "might", "will", "would", "shall",
  "should", "does", "did", "done", "doing", "its", "you", "your", "yours", "our", "who", "whom", "how", "why", "off", "out", "own", "get",
  "gets", "got", "his", "her", "she", "him", "now", "yes", "via", "etc", "also", "just", "even", "still", "already", "yet", "very", "too",
  "quite", "rather", "really", "actually", "simply", "basically", "usually", "generally", "typically", "commonly", "normally", "often",
  "currently", "approximately", "approx", "roughly", "nearly", "almost", "around", "about", "that", "this", "these", "those", "there", "here",
  "their", "them", "they", "then", "than", "what", "which", "while", "when", "where", "with", "from", "into", "because", "make", "made",
  "like", "same", "said", "such", "other", "per", "but", "nor", "don", "doesn", "didn", "isn", "aren", "wasn", "weren", "won", "couldn",
  "wouldn", "shouldn", "hasn", "haven", "hadn", "ones", "thing", "things", "hai", "hain", "ki", "ka", "ke", "mein", "par", "aur", "toh",
  "bhi", "se", "ko", "yeh", "woh", "tha", "thi", "kya",
  // Reporting verbs carry no checkable fact of their own ("X notes that ..." ~ "..., says X"); the fact is what follows.
  "say", "says", "said", "note", "notes", "noted", "state", "states", "stated", "mention", "mentions", "mentioned", "according",
  "explain", "explains", "explained", "tell", "tells", "told", "add", "adds", "added", "report", "reports", "reported",
  "euro", "euros", "eur", "dollar", "dollars", "usd", "pound", "pounds", "gbp", "rupee", "rupees", "inr", "rs", "lakh", "lakhs", "lac",
  "lacs", "crore", "crores", "percent",
]);
const quantOf = (token: string): string | undefined => (Object.hasOwn(QUANTIFIERS, token) ? QUANTIFIERS[token] : undefined);
const COUNTRY_WORDS = new Set<string>([...COUNTRIES.filter((c) => !c.includes(" ")), ...Object.values(DEMONYMS).flat()]);

// Units/currencies a number can carry (canonical names). Repair R5: "300 dollars" != "300 euros".
const UNIT_AFTER: [RegExp, string][] = [
  [/^[\s-]*(?:euros?|eur|€)(?![\p{L}])/iu, "eur"],
  [/^[\s-]*(?:dollars?|usd|us\$|\$)(?![\p{L}])/iu, "usd"],
  [/^[\s-]*(?:pounds?|gbp|£)(?![\p{L}])/iu, "gbp"],
  [/^[\s-]*(?:rupees?|inr|rs\.?|₹)(?![\p{L}])/iu, "inr"],
  [/^[\s-]*(?:lakhs?|lacs?)(?![\p{L}])/iu, "lakh"],
  [/^[\s-]*(?:crores?)(?![\p{L}])/iu, "crore"],
  [/^[\s-]*(?:%|percent|per cent)/iu, "pct"],
  [/^[\s-]*(?:months?)(?![\p{L}])/iu, "month"],
  [/^[\s-]*(?:years?|yrs?)(?![\p{L}])/iu, "year"],
  [/^[\s-]*(?:weeks?)(?![\p{L}])/iu, "week"],
  [/^[\s-]*(?:days?)(?![\p{L}])/iu, "day"],
  [/^[\s-]*(?:hours?|hrs?)(?![\p{L}])/iu, "hour"],
  [/^[\s-]*(?:credits?|ects)(?![\p{L}])/iu, "credit"],
];
const UNIT_BEFORE: [RegExp, string][] = [
  [/(?<![\p{L}])(?:€|eur|euros?)\s*$/iu, "eur"],
  [/(?<![\p{L}])(?:\$|usd|us\$)\s*$/iu, "usd"],
  [/(?<![\p{L}])(?:£|gbp)\s*$/iu, "gbp"],
  [/(?<![\p{L}])(?:₹|inr|rs\.?)\s*$/iu, "inr"],
];
// Rate qualifier after a number ("300 euros per semester", "a year", "each term", "/month", "monthly"). U6h H2.
const RATE_PER_RE = /^\s*(?:(?:per|a|an|each|every)\s+|\/\s*)(month|year|week|day|hour|semester|term|annum)(?![\p{L}])/iu;
const RATE_ADV_RE = /^\s*(monthly|yearly|annually|annual|weekly|daily|hourly)(?![\p{L}])/iu;
const RATE_CANON: Record<string, string> = {
  month: "month", monthly: "month", year: "year", yearly: "year", annually: "year", annual: "year", annum: "year",
  week: "week", weekly: "week", day: "day", daily: "day", hour: "hour", hourly: "hour", semester: "semester", term: "semester",
};
// Spelled-out numbers equal digits ("two weeks" = "2 weeks"); "one" only before a unit, so the pronoun is not a number.
const NUMBER_WORDS: Record<string, string> = {
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", hundred: "100", thousand: "1000",
  // P1 W3 (U6h leftover 2): large figures, and the transliterated Hindi "hazaar" ("paanch hazaar").
  million: "1000000", billion: "1000000000", hazaar: "1000", hazar: "1000",
};
// Transliterated Hindi figures count only before a magnitude or currency word, so "do bhai" / "ek achha sawaal" are not numbers.
const HINDI_NUMBER_WORDS: Record<string, string> = {
  ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5", chhe: "6", chhah: "6", saat: "7", aath: "8", nau: "9",
  das: "10", bees: "20", pachas: "50", sau: "100",
};
const MULTI_WORD_NUMBERS: Record<string, string> = {
  "half a million": "500000", "a million": "1000000", "an million": "1000000", "a billion": "1000000000", "an billion": "1000000000",
};
const NUMBER_RE = new RegExp(
  String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?|(?<![\p{L}\p{N}])(?:half\s+a\s+million|(?:a|an)\s+(?:million|billion)|(?:a|an)(?=\s+(?:lakhs?|lacs?|crores?)(?![\p{L}\p{N}]))|(?:${Object.keys(HINDI_NUMBER_WORDS).join("|")})(?=\s+(?:lakhs?|lacs?|crores?|karod|hazaar|hazar|sau|rupaye|rupay|rupees?|euros?|dollars?)(?![\p{L}\p{N}]))|${Object.keys(NUMBER_WORDS).join("|")}|one(?=\s+(?:months?|years?|weeks?|days?|hours?|semesters?|terms?|credits?|euros?|dollars?|pounds?)))(?![\p{L}\p{N}])`,
  "giu",
);
export interface NumberMention {
  n: string;
  unit: string | null;
  rate: string | null;
  start: number;
  end: number;
  /** U6h fix1 H2b: the countries this figure sits next to in its clause. null = the clause names no country. */
  bound?: string[] | null;
}
/** Every figure in `text`, digits or spelled out ("five thousand"), with unit and rate (U6h fix1 M4: the coach filter uses it too). */
export function numberMentions(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[0];
    const low = raw.toLowerCase();
    const n = /^\d/.test(raw) ? raw.replace(/,/g, "").replace(/\.0+$/, "") : (MULTI_WORD_NUMBERS[low.replace(/\s+/g, " ")] ?? NUMBER_WORDS[low] ?? HINDI_NUMBER_WORDS[low] ?? "1");
    let end = m.index! + raw.length;
    const after = text.slice(end, end + 40);
    let unit: string | null = null;
    for (const [re, name] of UNIT_AFTER) {
      const um = re.exec(after);
      if (um) {
        unit = name;
        end += um[0].length;
        break;
      }
    }
    if (!unit) {
      const before = text.slice(Math.max(0, m.index! - 6), m.index!);
      unit = UNIT_BEFORE.find(([re]) => re.test(before))?.[1] ?? null;
    }
    const tail = text.slice(end, end + 30);
    const rm = RATE_PER_RE.exec(tail) ?? RATE_ADV_RE.exec(tail);
    const rate = rm ? (RATE_CANON[rm[1]!.toLowerCase()] ?? null) : null;
    if (rm) end += rm[0].length;
    out.push({ n, unit, rate, start: m.index!, end });
  }
  return out;
}
/** Single-word names match an exact token or a listed demonym; multi-word / short names match the joined text. */
function mentions(toks: string[], joined: string, c: string): boolean {
  if (c.includes(" ")) return joined.includes(` ${c} `);
  const forms = [c, ...(DEMONYMS[c] ?? [])];
  return toks.some((t) => forms.includes(t));
}
export function countriesIn(text: string): string[] {
  const toks = tokens(text);
  const joined = ` ${toks.join(" ")} `;
  return COUNTRIES.filter((c) => mentions(toks, joined, c));
}
/** Capitalised Latin words (incl. acronyms) that are not common sentence starters. */
function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize("NFC").matchAll(/(?<![\p{L}\p{M}\p{N}])\p{Lu}[\p{L}\p{M}'’-]*/gu)) {
    const w = m[0].toLowerCase().replace(/['’]s$/, "");
    if (w.length >= 2 && !NOT_PROPER.has(w)) out.push(w);
  }
  return out;
}

/** One sentence-sized piece of a claim or of the evidence, reduced to the things "supports" compares. */
interface Clause {
  neg: boolean;
  words: Set<string>;
  quant: Set<string>;
  comp: Set<string>;
  hedge: Set<string>;
  cond: Set<string>;
  scope: Set<string>;
  nums: NumberMention[];
  countries: Set<string>;
  /** Evidence only: content words of a caveat sentence that followed this clause; the claim must carry them (U6h fix1 H2a). */
  mustCarry: Set<string>;
}

// Delimiters inside a clause that separate one country's figure from another's ("300 euros for Germany and 500 euros for France").
// A comma counts only before whitespace, so "11,000" stays whole.
const FIGURE_BREAK = /,\s+|;\s*|\s+(?:and|while|whereas|versus|vs\.?|but|compared (?:to|with))\s+|\s+[-–—]\s+/gi;
/** U6h fix1 H2b: bind each figure to the country (or countries) in its own segment, so a figure cannot move to its neighbour. */
function bindFigures(text: string, nums: NumberMention[]): void {
  const clauseCountries = countriesIn(text);
  if (clauseCountries.length === 0) {
    for (const n of nums) n.bound = null;
    return;
  }
  const segs: { start: number; end: number }[] = [];
  let at = 0;
  for (const m of text.matchAll(FIGURE_BREAK)) {
    segs.push({ start: at, end: m.index! });
    at = m.index! + m[0].length;
  }
  segs.push({ start: at, end: text.length });
  let pending: string[] = [];
  for (const seg of segs) {
    const here = nums.filter((n) => n.start >= seg.start && n.start < seg.end);
    const segCountries = countriesIn(text.slice(seg.start, seg.end));
    if (here.length === 0) {
      pending = [...pending, ...segCountries];
      continue;
    }
    const bound = segCountries.length > 0 || pending.length > 0 ? [...new Set([...segCountries, ...pending])] : clauseCountries.length === 1 ? clauseCountries : [];
    for (const n of here) n.bound = bound;
    pending = [];
  }
}

function analyse(text: string): Clause {
  const nums = numberMentions(text);
  bindFigures(text, nums);
  let rest = text;
  for (const m of [...nums].sort((a, b) => b.start - a.start)) rest = `${rest.slice(0, m.start)} ${rest.slice(m.end)}`;
  const words = new Set<string>();
  const quant = new Set<string>();
  const comp = new Set<string>();
  const hedge = new Set<string>();
  const cond = new Set<string>();
  const scope = new Set<string>();
  for (const t of tokens(rest)) {
    const q = quantOf(t);
    if (q) quant.add(q);
    if (COMPARATORS.has(t)) comp.add(t);
    if (Object.hasOwn(HEDGES, t)) hedge.add(HEDGES[t]!);
    if (Object.hasOwn(CONDITIONS, t)) cond.add(CONDITIONS[t]!);
    if (SCOPE_WORDS.has(lightStem(t))) scope.add(lightStem(t));
    if (t.length < 3 || /^\d/.test(t) || NEGATIONS.has(t) || FUNCTION_WORDS.has(t) || COUNTRY_WORDS.has(t) || q || COMPARATORS.has(t)) continue;
    words.add(conceptOf(t));
  }
  for (const m of text.matchAll(DATED_BOUND)) cond.add(`date-${m[1]!.toLowerCase()}`);
  return { neg: hasNegation(text), words, quant, comp, hedge, cond, scope, nums, countries: new Set(countriesIn(text)), mustCarry: new Set() };
}
const isEmptyClause = (c: Clause) => c.words.size === 0 && c.nums.length === 0 && c.countries.size === 0 && c.quant.size === 0;

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** The claim's numbers: each must be in the evidence clause with the same value, unit (when given), rate and country binding. */
function numbersSupported(claim: NumberMention[], evidence: NumberMention[]): boolean {
  return claim.every((c) =>
    evidence.some(
      (e) =>
        e.n === c.n &&
        (c.unit === null || e.unit === c.unit) &&
        e.rate === c.rate &&
        (!c.bound || c.bound.length === 0 || !e.bound || c.bound.every((x) => e.bound!.includes(x))),
    ),
  );
}

/**
 * A claim clause is supported by an evidence clause only when ALL of the following hold (U6h H2, fail closed):
 * same negation; every content word of the claim is in the clause (no 50% overlap); the SAME quantifiers, hedges /
 * modals, conditions and scope words (U6h fix1: a dropped "some", "may", "if" or "public" fails, as does an added one);
 * the same comparators; every number with the same unit, rate and country; and the claim's countries are the clause's
 * countries (or, when the clause names none, the only ones the evidence names).
 */
function clauseSupports(c: Clause, e: Clause, evidenceCountries: Set<string>): boolean {
  if (c.neg !== e.neg) return false;
  for (const w of c.words) if (!e.words.has(w)) return false;
  for (const w of e.mustCarry) if (!c.words.has(w)) return false;
  if (!sameSet(c.quant, e.quant) || !sameSet(c.hedge, e.hedge) || !sameSet(c.cond, e.cond) || !sameSet(c.scope, e.scope)) return false;
  if (c.comp.size !== e.comp.size || [...c.comp].some((w) => !e.comp.has(w))) return false;
  if (!numbersSupported(c.nums, e.nums)) return false;
  if (c.countries.size > 0) {
    if (e.countries.size > 0) {
      for (const x of c.countries) if (!e.countries.has(x)) return false;
    } else {
      for (const x of evidenceCountries) if (!c.countries.has(x)) return false;
    }
  }
  return true;
}

const CLAUSE_BREAK_CLAIM = /(?<=[.!?।])\s+|;\s*|,?\s+\bbut\b\s+|,?\s+\bhowever\b,?\s+/i;
const SENTENCE_BREAK = /(?<=[.!?।])\s+/;
const SUBCLAUSE_BREAK_EVIDENCE = /;\s*|,?\s+\bbut\b\s+|,?\s+\bwhile\b\s+|,?\s+\bwhereas\b\s+|,?\s+\blekin\b\s+/i;

// U6h fix1 H2a: an evidence sentence that restricts the one before it ("This applies only to EU citizens.", "Exceptions apply ...").
const CAVEAT_SENTENCE =
  /^\W*(?:(?:this|that|these|those|it|they|the (?:above|same|rule|fee|waiver|offer|exemption))\b[^.!?।]*\b(?:appl(?:y|ies|icable)|holds?|valid|only|except\w*|exclud\w*|limited|restricted|subject|not|n['’]t)\b|(?:exceptions?|except|unless|provided|subject to|only|however|note that|conditions?|caveats?|restrictions?)\b)/i;
const CAVEAT_FILLER = new Set(
  ["this", "that", "these", "those", "they", "apply", "applies", "applied", "applicable", "hold", "holds", "valid", "except", "exception",
    "exceptions", "however", "note", "unless", "provided", "subject", "condition", "conditions", "caveat", "caveats", "restriction",
    "restrictions", "above", "same", "rule"].map((w) => lightStem(w)),
);
function withCaveat(main: Clause, caveat: Clause): Clause {
  const carry = new Set([...caveat.words].filter((w) => !CAVEAT_FILLER.has(w)));
  return {
    ...main,
    words: new Set([...main.words, ...carry]),
    quant: new Set([...main.quant, ...caveat.quant]),
    hedge: new Set([...main.hedge, ...caveat.hedge]),
    cond: new Set([...main.cond, ...caveat.cond]),
    scope: new Set([...main.scope, ...caveat.scope]),
    nums: [...main.nums, ...caveat.nums],
    countries: new Set([...main.countries, ...caveat.countries]),
    mustCarry: new Set([...main.mustCarry, ...carry]),
  };
}
/** Evidence clauses; a caveat sentence is merged into the clause(s) before it (so a claim must carry it) and also kept on its own. */
function evidenceClausesOf(evidence: string): Clause[] {
  const sentences = evidence.split(SENTENCE_BREAK).filter((x) => x.trim());
  const out: Clause[] = [];
  sentences.forEach((sentence, i) => {
    const parts = sentence.split(SUBCLAUSE_BREAK_EVIDENCE).filter((x) => x.trim()).map(analyse);
    const next = sentences[i + 1];
    const caveat = next !== undefined && CAVEAT_SENTENCE.test(next) ? analyse(next) : undefined;
    for (const part of parts) out.push(caveat ? withCaveat(part, caveat) : part);
  });
  return out;
}

/**
 * The stated support heuristic (see the file header). U6h H2: no partial-overlap acceptance. The claim is cut
 * into sentence-sized clauses; each one must be fully carried by one evidence clause. Unknown wording, a
 * paraphrase outside the small synonym table, or Hindi text therefore fails closed (unverified), never open.
 */
export function supports(claim: { text: string; kind: ClaimKind }, evidence: string): boolean {
  if (!evidence.trim()) return false;
  const claimNums = numberMentions(claim.text);
  if (claim.kind === "number" && claimNums.length === 0) return false;
  const claimCountries = countriesIn(claim.text);
  if (claim.kind === "country" && claimCountries.length === 0) return false;
  const evidenceCountries = new Set(countriesIn(evidence));
  for (const c of claimCountries) if (!evidenceCountries.has(c)) return false;
  if (claim.kind !== "number") {
    const evStems = new Set(tokens(evidence).map(lightStem));
    for (const p of properNouns(claim.text)) {
      const asCountry = COUNTRIES.find((c) => mentions([p], ` ${p} `, c));
      if (asCountry ? evidenceCountries.has(asCountry) : evStems.has(lightStem(p))) continue;
      return false;
    }
  }
  const evClauses = evidenceClausesOf(evidence);
  const claimClauses = claim.text.split(CLAUSE_BREAK_CLAIM).filter((c) => c.trim()).map(analyse).filter((c) => !isEmptyClause(c));
  if (claimClauses.length === 0) return false;
  return claimClauses.every((c) => evClauses.some((e) => clauseSupports(c, e, evidenceCountries)));
}

/** Session ids a served /ask node points at (spec scope item 4(a)). */
export function sessionRefsOf(node: AskInternalSource): string[] {
  const refs = new Set<string>();
  const ev = node.evidence ?? {};
  if (typeof ev.sessionRef === "string" && ev.sessionRef) refs.add(ev.sessionRef);
  if (Array.isArray(ev.sessionRefs)) for (const r of ev.sessionRefs) if (typeof r === "string" && r) refs.add(r);
  const m = /(?:^|\/)session:([A-Za-z0-9][A-Za-z0-9._:-]{0,199})$/.exec(node.node_id);
  if (m) refs.add(m[1]!);
  return [...refs];
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) - (to.getUTCDate() < from.getUTCDate() ? 1 : 0);
}

function dateFlags(date: string | undefined, now: Date, staleAfterMonths: number): Pick<Source, "stale" | "dateUnknown"> {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) return { dateUnknown: true };
  return monthsBetween(new Date(date), now) > staleAfterMonths ? { stale: true } : {};
}

export async function guardClaims(drafts: DraftClaim[], ctx: ClaimsGuardContext): Promise<ClaimsGuardResult> {
  const staleAfter = ctx.staleAfterMonths ?? DEFAULT_STALE_AFTER_MONTHS;
  const hitById = new Map(ctx.hits.map((h) => [h.turnId, h]));
  const askNodes = new Map<string, AskInternalSource>();
  const servedAsk = isServedAsk(ctx.ask) ? ctx.ask : undefined;
  if (servedAsk) for (const n of servedAsk.citations.internal) askNodes.set(n.node_id, n);
  // One get_session per session per turn, shared by every claim citing it.
  const sessionCache = new Map<string, Promise<SessionToolOutput | null>>();
  const fetchSession = (id: string) => {
    if (!ctx.getSession) return Promise.resolve(null);
    let p = sessionCache.get(id);
    if (!p) {
      p = ctx.getSession(id).catch(() => null);
      sessionCache.set(id, p);
    }
    return p;
  };

  const sources = new Map<string, Source>();
  const claims: GuardedClaim[] = [];
  const dropped: ClaimsGuardResult["dropped"] = [];

  // Turn-wide restricted material (repair R2): every WhatsApp/unknown hit of this turn, the /ask answer
  // and every get_session turn fetched on the /ask path - checked against EVERY claim, whatever it cites.
  const restrictedTexts: string[] = [];
  const labels: string[] = [];
  for (const h of ctx.hits) {
    if (h.sourceKind !== "whatsapp" && h.sourceKind !== "unknown") continue;
    restrictedTexts.push(h.text);
    if (h.speakerLabel?.trim()) labels.push(h.speakerLabel);
  }
  if (ctx.ask?.answer?.trim()) restrictedTexts.push(ctx.ask.answer);

  // Pass 1: resolve sources and status (fetches sessions, which adds to the restricted material).
  const resolved: { draft: DraftClaim; ids: string[]; status: Claim["status"]; sourceKind: SourceKind }[] = [];
  for (const draft of drafts) {
    const ids = [...new Set(draft.sourceIds)].filter((id) => hitById.has(id) || askNodes.has(id));
    if (ids.length === 0) {
      // Repair R2a: a claim with no resolvable source is never shown, flagged or not.
      dropped.push({ text: "", reason: "no_resolvable_source" });
      continue;
    }
    const kinds: SourceKind[] = [];
    let supported = false;
    let attributedNode = false;
    // U6h H1: "attributed" means the served /ask answer itself carries the fact; it is not enough that a node is present.
    const askCarriesIt = !!servedAsk && supports(draft, servedAsk.answer);
    for (const id of ids) {
      const hit = hitById.get(id);
      if (hit) {
        kinds.push(hit.sourceKind);
        if (supports(draft, hit.text)) supported = true;
        if (!sources.has(id)) {
          sources.set(id, { id, kind: hit.sourceKind, ...(hit.sessionTitle ? { title: hit.sessionTitle } : {}), ...dateFlags(hit.sessionDate, ctx.now, staleAfter) });
        }
        continue;
      }
      const node = askNodes.get(id)!;
      kinds.push("unknown"); // a served /ask answer is restricted by default (U2 serve rule)
      attributedNode = true;
      let date: string | undefined;
      for (const ref of sessionRefsOf(node)) {
        const s = await fetchSession(ref);
        if (!s || s.status !== "ok") continue;
        date ??= s.session.date;
        for (const t of s.turns) {
          if (!restrictedTexts.includes(t.text)) restrictedTexts.push(t.text);
          if (t.speakerLabel?.trim() && !labels.includes(t.speakerLabel)) labels.push(t.speakerLabel);
          if (supports(draft, t.text)) supported = true;
        }
      }
      if (!sources.has(id)) sources.set(id, { id, kind: "unknown", ...dateFlags(date, ctx.now, staleAfter) });
    }
    const status: Claim["status"] = supported ? "verified" : attributedNode && draft.kind === "fact" && askCarriesIt ? "attributed" : "unverified";
    resolved.push({ draft, ids, status, sourceKind: mostRestrictive(kinds) });
  }

  // Pass 2: text guards, against the complete turn-wide restricted material.
  for (const { draft, ids, status, sourceKind } of resolved) {
    let text = draft.text;
    if (ctx.speakers) {
      if (restrictedTexts.some((src) => hasVerbatimRun(text, src))) {
        dropped.push({ text: "", reason: "verbatim_restricted_source" });
        continue;
      }
      text =
        sourceKind === "whatsapp" || sourceKind === "unknown"
          ? redactPersonalIdentifiers(text, ctx.speakers, labels)
          : redactPersonalIdentifiers(text, { speakers: [] }, []); // phone numbers only; permitted names may stay
      text = noQuoteGuard(text, ctx.speakers, labels).text;
    }
    claims.push({ text, kind: draft.kind, sourceIds: ids, status, sourceKind, ...(draft.localized !== undefined ? { localized: draft.localized } : {}) });
  }

  const cited = new Set(claims.flatMap((c) => c.sourceIds));
  return {
    claims,
    sources: [...sources.values()].filter((s) => cited.has(s.id)),
    dropped,
    unverifiedCount: claims.filter((c) => c.status === "unverified").length,
    restricted: { texts: restrictedTexts, labels },
  };
}
