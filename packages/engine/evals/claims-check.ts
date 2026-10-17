/**
 * P1 U4 / A1 harness: checks the `claims[]` of a student answer against the KB responses recorded for
 * that same turn (spec scope item 4, G5). This is the EVAL-side oracle; U6 builds the runtime guard
 * and is judged by this.
 *
 * Rules (each violation names its rule):
 *  - `verified` needs >= 1 sourceId that resolves in THIS turn's responses: a `/search` hit `turnId`
 *    (text = inline `turn.text`) or an `/ask` `node_id` (text = a session resolved from
 *    `evidence.sessionRef(s)`, `sessionRefs`, or `session:<id>` inside the node_id, read from the
 *    recorded `GET /sessions/:id`).
 *  - the resolved text must support the claim: every number in the claim appears in it (commas
 *    ignored), every known country name in the claim appears in it, and for `kind: fact` at least
 *    60% of the claim's content words (> 3 letters) appear in it [ASSUMPTION: a weak lexical proxy
 *    for "supports", stated as such; the REAL head-to-head is the real judge].
 *  - an `/ask` claim with no fetched session text can only be `attributed`, never `verified`.
 *  - `attributed` needs a resolvable source; `unverified` needs none.
 */

export type ClaimKind = "number" | "country" | "fact";
export type ClaimStatus = "verified" | "attributed" | "unverified";

export interface Claim {
  text: string;
  kind: ClaimKind;
  sourceIds: string[];
  status: ClaimStatus;
}

export interface ClaimContext {
  searchHits: { turnId: string; sessionId: string; score: number; turn: { text: string }; session: Record<string, unknown> }[];
  askSources: { node_id: string; sessionRefs?: string[] }[];
  sessions: Record<string, { turns: { turnId: string; text: string }[] }>;
  countryNames?: string[];
}

export type ClaimRule =
  | "verified-without-source"
  | "attributed-without-source"
  | "unresolvable-source"
  | "ask-fact-verified-without-text"
  | "unsupported-number"
  | "unsupported-country"
  | "unsupported-fact";

export interface ClaimViolation {
  claimIndex: number;
  rule: ClaimRule;
  detail: string;
}

export interface ClaimsCheckResult {
  violations: ClaimViolation[];
  counts: { verified: number; attributed: number; unverified: number };
  unverifiedShare: number;
}

export const UNVERIFIED_SHARE_MAX = 0.05;
export const FACT_SUPPORT_MIN = 0.6;

interface Resolved {
  /** Source was found in this turn's responses. */
  found: boolean;
  /** Text available to check the claim against ("" when it is an /ask node with no fetched session). */
  text: string;
  viaAsk: boolean;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/(\d),(?=\d)/g, "$1");
}

function resolve(id: string, ctx: ClaimContext): Resolved {
  const hit = ctx.searchHits.find((h) => h.turnId === id);
  if (hit) return { found: true, text: hit.turn.text, viaAsk: false };
  const node = ctx.askSources.find((n) => n.node_id === id);
  if (!node) return { found: false, text: "", viaAsk: false };
  const sessionIds = new Set<string>(node.sessionRefs ?? []);
  const m = /session:([^/\s]+)/.exec(id);
  if (m?.[1]) sessionIds.add(m[1]);
  const texts: string[] = [];
  for (const sid of sessionIds) {
    const s = ctx.sessions[sid];
    if (s) texts.push(s.turns.map((t) => t.text).join(" "));
  }
  return { found: true, text: texts.join(" "), viaAsk: true };
}

export function checkClaims(claims: readonly Claim[], ctx: ClaimContext): ClaimsCheckResult {
  const violations: ClaimViolation[] = [];
  const counts = { verified: 0, attributed: 0, unverified: 0 };
  for (const [claimIndex, claim] of claims.entries()) {
    counts[claim.status] += 1;
    const v = (rule: ClaimRule, detail: string) => violations.push({ claimIndex, rule, detail });
    if (claim.status === "unverified") continue;
    if (claim.sourceIds.length === 0) {
      v(claim.status === "verified" ? "verified-without-source" : "attributed-without-source", `"${claim.text}" has no sourceId`);
      continue;
    }
    const lookups = claim.sourceIds.map((id) => ({ id, r: resolve(id, ctx) }));
    const resolved = lookups.filter((l) => l.r.found).map((l) => l.r);
    const unresolved = lookups.filter((l) => !l.r.found).map((l) => l.id);
    // ANY unresolved id is a violation, even if another id on the claim resolves: a claim must not cite what the turn never fetched.
    if (unresolved.length > 0) v("unresolvable-source", `[${unresolved.join(", ")}] not found in this turn's KB responses`);
    if (resolved.length === 0) continue;
    if (claim.status === "attributed") continue;

    // status === "verified"
    const texts = resolved.map((r) => r.text).filter((t) => t.length > 0);
    if (texts.length === 0) {
      v("ask-fact-verified-without-text", `"${claim.text}" cites only /ask nodes with no fetched session text; it can be attributed, not verified`);
      continue;
    }
    const support = normalise(texts.join(" "));
    const claimText = normalise(claim.text);
    const numbers = claimText.match(/\d+(?:\.\d+)?/g) ?? [];
    for (const n of numbers) {
      if (!new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(support)) {
        v("unsupported-number", `number ${n} is not in the cited source text`);
      }
    }
    for (const country of ctx.countryNames ?? []) {
      if (claimText.includes(country.toLowerCase()) && !support.includes(country.toLowerCase())) {
        v("unsupported-country", `${country} is not in the cited source text`);
      }
    }
    if (claim.kind === "fact") {
      const words = [...new Set((claimText.match(/[a-zऀ-ॿ]{4,}/g) ?? []))];
      if (words.length > 0) {
        const found = words.filter((w) => support.includes(w)).length;
        if (found / words.length < FACT_SUPPORT_MIN) {
          v("unsupported-fact", `only ${found}/${words.length} content words of the claim appear in the cited source text`);
        }
      }
    }
  }
  const total = claims.length;
  return { violations, counts, unverifiedShare: total === 0 ? 0 : counts.unverified / total };
}

export function aggregateUnverified(results: readonly ClaimsCheckResult[]): { total: number; unverified: number; share: number; pass: boolean } {
  let total = 0;
  let unverified = 0;
  for (const r of results) {
    total += r.counts.verified + r.counts.attributed + r.counts.unverified;
    unverified += r.counts.unverified;
  }
  const share = total === 0 ? 0 : unverified / total;
  return { total, unverified, share, pass: total > 0 && share <= UNVERIFIED_SHARE_MAX };
}
