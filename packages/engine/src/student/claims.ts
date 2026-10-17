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
 *    `attributed` (source present, text not proven); a number/country claim is `unverified`.
 *  - No resolvable source (empty or unresolvable sourceIds): the claim is DROPPED, never shown (repair
 *    R2a; the graph additionally hides `unverified` claims in anonymous mode, D-092).
 * "Supports" (stated heuristic, repair R5): every number in the claim appears in the text (thousands
 * separators ignored) with the same currency/unit when the claim gives one; negation parity (no / not /
 * never / without / free / n't / nahi / nahin / mat on both sides or neither); every country named in
 * the claim appears in the text (exact token or demonym, so "Germany" ~ "German" but "India" !~
 * "individual"); for fact/country claims every capitalised proper noun (incl. off-list countries and
 * acronyms) appears in the text; and at least half of the claim's content words appear (5-letter stems).
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
  withheld?: string[];
  unavailableReason?: string;
  detail?: string;
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
}

export interface GuardedClaim extends Claim {
  sourceKind: SourceKind;
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

const stem = (w: string) => w.slice(0, 5);
function tokens(text: string): string[] {
  return text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

// Units/currencies a number can carry (canonical names). Repair R5: "300 dollars" != "300 euros".
const UNIT_AFTER: [RegExp, string][] = [
  [/^\s*(?:euros?|eur|€)(?![\p{L}])/iu, "eur"],
  [/^\s*(?:dollars?|usd|us\$|\$)(?![\p{L}])/iu, "usd"],
  [/^\s*(?:pounds?|gbp|£)(?![\p{L}])/iu, "gbp"],
  [/^\s*(?:rupees?|inr|rs\.?|₹)(?![\p{L}])/iu, "inr"],
  [/^\s*(?:lakhs?|lacs?)(?![\p{L}])/iu, "lakh"],
  [/^\s*(?:crores?)(?![\p{L}])/iu, "crore"],
  [/^\s*(?:%|percent|per cent)/iu, "pct"],
  [/^\s*(?:months?)(?![\p{L}])/iu, "month"],
  [/^\s*(?:years?|yrs?)(?![\p{L}])/iu, "year"],
  [/^\s*(?:weeks?)(?![\p{L}])/iu, "week"],
  [/^\s*(?:days?)(?![\p{L}])/iu, "day"],
  [/^\s*(?:hours?|hrs?)(?![\p{L}])/iu, "hour"],
  [/^\s*(?:credits?|ects)(?![\p{L}])/iu, "credit"],
];
const UNIT_BEFORE: [RegExp, string][] = [
  [/(?<![\p{L}])(?:€|eur|euros?)\s*$/iu, "eur"],
  [/(?<![\p{L}])(?:\$|usd|us\$)\s*$/iu, "usd"],
  [/(?<![\p{L}])(?:£|gbp)\s*$/iu, "gbp"],
  [/(?<![\p{L}])(?:₹|inr|rs\.?)\s*$/iu, "inr"],
];
interface NumberMention {
  n: string;
  unit: string | null;
}
function numberMentions(text: string): NumberMention[] {
  const out: NumberMention[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 12);
    const before = text.slice(Math.max(0, m.index! - 6), m.index!);
    const unit = UNIT_AFTER.find(([re]) => re.test(after))?.[1] ?? UNIT_BEFORE.find(([re]) => re.test(before))?.[1] ?? null;
    out.push({ n, unit });
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

/**
 * Negation parity, per evidence clause: the claim's negation (yes/no) must equal that of at least one
 * evidence clause (sentence, or a ", but" / ";" part) that carries >= half of the claim's content words,
 * so "no tuition, but a 300-euro contribution" supports both halves and "fees of 500 euros" never
 * supports "no fees".
 */
function negationParity(claim: string, evidence: string): boolean {
  const neg = hasNegation(claim);
  const content = tokens(claim).filter((w) => w.length >= 4 && !STOP.has(w) && !NEGATIONS.has(w) && !/^\d/.test(w));
  const clauses = evidence.split(/(?<=[.!?।])\s+|;\s*|,?\s+\bbut\b\s+|,?\s+\bwhile\b\s+|,?\s+\bwhereas\b\s+|,?\s+\blekin\b\s+/i).filter((c) => c.trim());
  const relevant = clauses.filter((c) => {
    if (content.length === 0) return true;
    const stems = new Set(tokens(c).map(stem));
    return content.filter((w) => stems.has(stem(w))).length / content.length >= 0.5;
  });
  return relevant.some((c) => hasNegation(c) === neg);
}

/** The stated support heuristic (see the file header). */
export function supports(claim: { text: string; kind: ClaimKind }, evidence: string): boolean {
  if (!evidence.trim()) return false;
  const claimNums = numberMentions(claim.text);
  if (claim.kind === "number" && claimNums.length === 0) return false;
  const evNums = numberMentions(evidence);
  for (const c of claimNums) {
    const same = evNums.filter((e) => e.n === c.n);
    if (same.length === 0) return false;
    if (c.unit && !same.some((e) => e.unit === c.unit)) return false;
  }
  if (!negationParity(claim.text, evidence)) return false;
  const claimCountries = countriesIn(claim.text);
  if (claim.kind === "country" && claimCountries.length === 0) return false;
  const evTokens = tokens(evidence);
  const evStems = new Set(evTokens.map(stem));
  const evJoined = ` ${evTokens.join(" ")} `;
  for (const c of claimCountries) if (!mentions(evTokens, evJoined, c)) return false;
  if (claim.kind !== "number") {
    const evCountries = new Set(countriesIn(evidence));
    for (const p of properNouns(claim.text)) {
      const asCountry = COUNTRIES.find((c) => mentions([p], ` ${p} `, c));
      if (asCountry ? evCountries.has(asCountry) : evStems.has(stem(p))) continue;
      return false;
    }
  }
  const content = tokens(claim.text).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w));
  if (content.length === 0) return claimNums.length > 0 || claimCountries.length > 0;
  const present = content.filter((w) => evStems.has(stem(w))).length;
  return present / content.length >= 0.5;
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
  if (ctx.ask && ctx.ask.status === "answered" && ctx.ask.citations.web.length === 0) {
    for (const n of ctx.ask.citations.internal) askNodes.set(n.node_id, n);
  }
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
    const status: Claim["status"] = supported ? "verified" : attributedNode && draft.kind === "fact" ? "attributed" : "unverified";
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
    claims.push({ text, kind: draft.kind, sourceIds: ids, status, sourceKind });
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
