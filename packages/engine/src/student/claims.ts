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
 *  - No resolvable source: `unverified`, sourceIds [], shown flagged; never presented as sourced.
 * "Supports" (stated heuristic): every number in the claim appears in the text (thousands separators
 * ignored), every country named in the claim appears in the text (prefix match, so "Germany" ~
 * "German"), and at least half of the claim's content words appear in the text (5-letter stems).
 *
 * Source kind (B24.4): each claim takes the MOST restrictive kind of its resolved sources (whatsapp >
 * unknown > toc > internal-seminar); a claim with no resolved source, or sourced from a served `/ask`
 * answer, is `unknown`. For whatsapp/unknown claims a verbatim run of >= 8 source words drops the
 * claim, and personal identifiers are redacted. The default-deny no-quote guard runs on every claim.
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
  dropped: { text: string; reason: "verbatim_restricted_source" }[];
  unverifiedCount: number;
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

const stem = (w: string) => w.slice(0, 5);
function tokens(text: string): string[] {
  return text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}
function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));
}
/** Single-word names of >= 5 letters match by prefix (all but the last letter), so "Germany" ~ "German". */
function mentions(toks: string[], joined: string, c: string): boolean {
  if (c.includes(" ") || c.length < 5) return joined.includes(` ${c} `);
  const p = c.slice(0, -1);
  return toks.some((t) => t.startsWith(p));
}
function countriesIn(text: string): string[] {
  const toks = tokens(text);
  const joined = ` ${toks.join(" ")} `;
  return COUNTRIES.filter((c) => mentions(toks, joined, c));
}

/** The stated support heuristic (see the file header). */
export function supports(claim: { text: string; kind: ClaimKind }, evidence: string): boolean {
  if (!evidence.trim()) return false;
  const claimNums = numbersIn(claim.text);
  if (claim.kind === "number" && claimNums.length === 0) return false;
  const evNums = new Set(numbersIn(evidence));
  if (!claimNums.every((n) => evNums.has(n))) return false;
  const claimCountries = countriesIn(claim.text);
  if (claim.kind === "country" && claimCountries.length === 0) return false;
  const evTokens = tokens(evidence);
  const evStems = new Set(evTokens.map(stem));
  const evJoined = ` ${evTokens.join(" ")} `;
  for (const c of claimCountries) if (!mentions(evTokens, evJoined, c)) return false;
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

  for (const draft of drafts) {
    const ids = [...new Set(draft.sourceIds)].filter((id) => hitById.has(id) || askNodes.has(id));
    const kinds: SourceKind[] = [];
    const restrictedTexts: string[] = [];
    const labels: string[] = [];
    let supported = false;
    let attributedNode = false;
    for (const id of ids) {
      const hit = hitById.get(id);
      if (hit) {
        kinds.push(hit.sourceKind);
        if (hit.sourceKind === "whatsapp" || hit.sourceKind === "unknown") restrictedTexts.push(hit.text);
        if (hit.speakerLabel && hit.sourceKind === "whatsapp") labels.push(hit.speakerLabel);
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
          restrictedTexts.push(t.text);
          if (supports(draft, t.text)) supported = true;
        }
      }
      if (!sources.has(id)) sources.set(id, { id, kind: "unknown", ...dateFlags(date, ctx.now, staleAfter) });
    }

    const status: Claim["status"] = supported ? "verified" : attributedNode && draft.kind === "fact" ? "attributed" : "unverified";
    const sourceKind = ids.length === 0 ? "unknown" : mostRestrictive(kinds);
    let text = draft.text;
    if (ctx.speakers) {
      if (sourceKind === "whatsapp" || sourceKind === "unknown") {
        if (restrictedTexts.some((src) => hasVerbatimRun(text, src))) {
          dropped.push({ text: "", reason: "verbatim_restricted_source" });
          continue;
        }
        text = redactPersonalIdentifiers(text, ctx.speakers, labels);
      }
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
  };
}
