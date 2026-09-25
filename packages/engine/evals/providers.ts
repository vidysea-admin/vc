/**
 * T-009: scripted providers over the gold dataset, used both to drive a real scribe graph run and
 * (via `candidatesForMode`) as the scorer's own ground truth of "what the provider proposed" — a
 * single source of truth, so the scorer never has to guess at raw model output by re-parsing engine
 * internals (see score.ts).
 *
 * Each mode exists to prove one thing about the scorer (the brief's falsification requirement):
 *   - "perfect"    returns the gold facts and a checklist-covering summary -> should score ~100%.
 *   - "fabricator" wraps every quote in a paraphrase frame (never a verbatim substring) -> the
 *                  scorer's citation precision must drop, and the engine's own guard must drop these
 *                  facts (0 recall on them).
 *   - "case-drift" upper-cases every quote -> not verbatim, but a genuine quote underneath -> the
 *                  guard drops it anyway (ISS-t-007-rev-2), which the scorer must report as a FALSE
 *                  drop, not a fabrication, with case/punctuation kept separate.
 *   - "lazy"       returns no facts and an empty summary -> 0 recall, and (because the crisis/consent
 *                  gates run before any provider call) crisis routing is UNCHANGED, proving those
 *                  gates are provider-independent.
 */
import { MockProvider } from "@vc/providers";
import { SCRIBE_PURPOSE } from "../src/scribe/index.js";
import type { GoldFact, GoldSession } from "./types.js";

export type ProviderMode = "perfect" | "fabricator" | "case-drift" | "lazy";

export const PROVIDER_MODES: readonly ProviderMode[] = ["perfect", "fabricator", "case-drift", "lazy"];

/** Wraps a quote so it is never a verbatim (or case/punctuation-normalised) substring of the original. */
function fabricate(quote: string): string {
  return `roughly speaking, ${quote.toLowerCase()} or thereabouts (paraphrased)`;
}

/** Upper-cases every Latin letter; a no-op on scripts with no case concept (e.g. Devanagari), which
 *  is honest — case-drift genuinely cannot occur there. */
function caseDrift(quote: string): string {
  return quote.toUpperCase();
}

function candidateFor(goldFact: GoldFact, mode: ProviderMode): Record<string, unknown> {
  const quote = mode === "fabricator" ? fabricate(goldFact.quote) : mode === "case-drift" ? caseDrift(goldFact.quote) : goldFact.quote;
  return {
    key: goldFact.key,
    value: goldFact.value,
    source: { type: "transcript", quote, turnId: goldFact.turnId },
    confidence: 0.9,
    purposeTags: [SCRIBE_PURPOSE],
    sensitivity: goldFact.sensitivity,
  };
}

/** The raw candidate array this mode would have the provider return for a session — the single
 *  source of truth shared by `buildScribeProvider` (what actually runs through the graph) and the
 *  scorer (what "should have been proposed", for citation-quality analysis). */
export function candidatesForMode(session: GoldSession, mode: ProviderMode): Record<string, unknown>[] {
  if (mode === "lazy") return [];
  return session.goldFacts.map((gf) => candidateFor(gf, mode));
}

function summaryFor(session: GoldSession, mode: ProviderMode): string {
  if (mode === "lazy") return "";
  if (session.goldSummaryChecklist.length === 0) {
    return "The session covered the student's current thinking; no new profile facts were confirmed.";
  }
  // A plain, factual account (never a recital instruction) that covers every checklist item, so the
  // "perfect" provider's summary passes both the B1 script check and the checklist-coverage score.
  return `Session record: the student's current position covers ${session.goldSummaryChecklist.join(", ")}.`;
}

export function buildScribeProvider(session: GoldSession, mode: ProviderMode): MockProvider {
  return new MockProvider({
    model: `scripted-${mode}`,
    responses: {
      "fact-extraction": { facts: candidatesForMode(session, mode) },
      "session-summary": { summary: summaryFor(session, mode) },
    },
  });
}
