/**
 * T-009: the scribe golden-session scorer. Runs the REAL scribe graph (compileScribeGraph /
 * startScribe from ../src/scribe/index.js — the same code T-007's tests exercise) against a fake DB
 * (@vc/db/testing) and a scripted provider, then scores the outcome against the gold dataset.
 *
 * This does NOT approve/write anything — the write path (B3) is already covered by T-007's own
 * tests. This harness stops at the interrupt and scores what the counsellor would SEE: the extracted
 * facts, dropped facts, and summary.
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { isScriptLike } from "@vc/schemas";
import { COLLECTION_NAMES, tenantScopedDb, type ConsentDoc } from "@vc/db";
import { createFakeDb, INDEX_PLAN } from "@vc/db/testing";
import { compileScribeGraph, readStudentConcerns, startScribe, SCRIBE_PURPOSE, type DroppedFact } from "../src/scribe/index.js";
import type { Fact } from "@vc/schemas";
import { classifyCitation, type TurnText } from "./citation.js";
import { buildScribeProvider, candidatesForMode, type ProviderMode } from "./providers.js";
import type { AggregateScore, CitationClass, EvalReport, FalseDrop, GoldSession, SessionScore } from "./types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
/** packages/engine/evals -> packages/engine -> packages -> repo root -> skills (same depth as tests/). */
export const DEFAULT_SKILLS_DIR = join(here, "..", "..", "..", "skills");

const EVAL_TENANT = "scribe-evaluation";

function seedConsent(fakeDb: ReturnType<typeof createFakeDb>["fakeDb"], studentId: string): void {
  fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents).seed({
    _id: `${EVAL_TENANT}:consent-${studentId}`,
    tenantId: EVAL_TENANT,
    studentId,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-01-01T00:00:00.000Z",
    minor: false,
  } as ConsentDoc);
}

function declareIndexes(fakeDb: ReturnType<typeof createFakeDb>["fakeDb"]): void {
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb.collection(spec.collection).declareUniqueIndex(Object.keys(spec.keys), {
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function scoreExtraction(
  session: GoldSession,
  mode: ProviderMode,
  request: { facts: Fact[]; dropped: DroppedFact[] },
  turnsById: ReadonlyMap<string, TurnText>,
): NonNullable<SessionScore["extraction"]> {
  const rawCandidates = candidatesForMode(session, mode);
  const citationVerdicts = rawCandidates.map((c) => classifyCitation(c, turnsById));
  const withQuote = citationVerdicts.filter((v) => v.class !== "malformed");
  const nonFabricated = withQuote.filter((v) => v.class !== "fabricated").length;
  const citationPrecision = withQuote.length > 0 ? nonFabricated / withQuote.length : null;

  const recalledKeys = new Set<string>();
  const omittedKeys: string[] = [];
  for (const gf of session.goldFacts) {
    const match = request.facts.find((f) => f.key === gf.key && valuesEqual(f.value, gf.value));
    if (match) recalledKeys.add(gf.key);
    else omittedKeys.push(gf.key);
  }

  const droppedByKey = new Map(request.dropped.map((d) => [d.key, d.reason]));
  const verdictByKey = new Map(citationVerdicts.map((v) => [v.key, v.class]));
  const falseDrops: FalseDrop[] = [];
  for (const key of omittedKeys) {
    const reason = droppedByKey.get(key);
    const cls = verdictByKey.get(key);
    if (!reason || !cls) continue; // never proposed at all: a plain omission, not a false drop
    if (
      reason.includes("not verbatim") &&
      (cls === "case-mismatch" || cls === "punctuation-mismatch" || cls === "case-and-punctuation-mismatch")
    ) {
      falseDrops.push({ key, class: cls, reason });
    }
  }

  const multiTurnGold = session.goldFacts.filter((f) => f.multiTurn);
  const multiTurnRecalled = multiTurnGold.filter((f) => recalledKeys.has(f.key)).length;

  // T-013 (D-020): every fact the graph actually kept, split by review status.
  // ISS-t-013r-rev-3: `fabricatedVerified` is no longer 0 by construction. It counts every kept fact
  // that auto-verified although it should not have: (a) its citation was never located
  // (citationMatch unset), (b) it matches a gold fact marked `mustReview` (a D-020 hostile row:
  // negation, lakh/crore, currency, pronoun/kinship third party, reasoning), or (c) it matches no
  // gold fact at all (a value nobody labelled true).
  const goldMatch = (f: Fact) => session.goldFacts.find((gf) => gf.key === f.key && valuesEqual(f.value, gf.value));
  const wronglyVerified = (f: Fact) => {
    if (f.needsReview !== false) return false;
    if (f.citationMatch === undefined) return true;
    const gold = goldMatch(f);
    return gold === undefined || gold.mustReview;
  };
  const reviewCounts = {
    kept: request.facts.length,
    verified: request.facts.filter((f) => f.needsReview === false).length,
    needsReview: request.facts.filter((f) => f.needsReview === true).length,
    reasoning: request.facts.filter((f) => f.kind === "reasoning").length,
    mustReview: request.facts.filter((f) => goldMatch(f)?.mustReview === true).length,
    fabricatedVerified: request.facts.filter(wronglyVerified).length,
  };

  return {
    goldFactCount: session.goldFacts.length,
    recalledCount: recalledKeys.size,
    omittedKeys,
    falseDrops,
    citationVerdicts,
    citationPrecision,
    multiTurn: { goldCount: multiTurnGold.length, recalledCount: multiTurnRecalled },
    reviewCounts,
  };
}

function scoreSummary(session: GoldSession, request: { summary: string; summaryWithheldReason?: string | undefined }): NonNullable<SessionScore["summary"]> {
  const text = request.summary;
  const scriptLike = text.length > 0 ? isScriptLike(text, "evidence") : false;
  const checklistCovered = session.goldSummaryChecklist.filter((item) => text.toLowerCase().includes(item.toLowerCase())).length;
  return {
    text,
    withheldReason: request.summaryWithheldReason,
    scriptLike,
    checklistTotal: session.goldSummaryChecklist.length,
    checklistCovered,
  };
}

export async function scoreSession(session: GoldSession, mode: ProviderMode, skillsDir: string = DEFAULT_SKILLS_DIR): Promise<SessionScore> {
  const { db: rawDb, fakeDb } = createFakeDb();
  const db = tenantScopedDb(rawDb, EVAL_TENANT);
  declareIndexes(fakeDb);
  seedConsent(fakeDb, session.input.studentId);

  const provider = buildScribeProvider(session, mode);
  const checkpointer = new MemorySaver();
  const graph = compileScribeGraph({ db, provider, skillsDir }, { checkpointer });
  const outcome = await startScribe(graph, session.input, { threadId: `eval:${session.id}` });

  const turnsById = new Map<string, TurnText>(
    session.input.turns.map((t) => [t.turnId, { turnId: t.turnId, text: t.text, translatedText: t.translatedText }]),
  );

  // T-022 / D-020 / B20: crisis still ends "escalated"; a concern-level session CONTINUES, so its
  // level is read from the visible flag (the approval payload), or from the Student KG when the run
  // ended some other way (e.g. extraction_failed).
  const concernFlagged =
    outcome.kind === "awaiting_approval"
      ? (outcome.request.concerns?.length ?? 0) > 0
      : (await readStudentConcerns(db, { studentId: session.input.studentId, sessionId: session.input.sessionId })).length > 0;
  const actualLevel =
    outcome.kind === "done" && outcome.result.status === "escalated"
      ? outcome.result.escalation.level
      : concernFlagged
        ? "concern"
        : "none";
  const crisis: SessionScore["crisis"] = {
    expected: session.expectedCrisisLevel,
    actual: actualLevel,
    correct: actualLevel === session.expectedCrisisLevel,
    // B9: only a CRISIS stops before any provider call; a concern session is extracted on purpose.
    providerCalledDespiteEscalation: actualLevel === "crisis" && provider.calls.length > 0,
  };

  const extraction = outcome.kind === "awaiting_approval" ? scoreExtraction(session, mode, outcome.request, turnsById) : null;
  const summary = outcome.kind === "awaiting_approval" ? scoreSummary(session, outcome.request) : null;
  const result = outcome.kind === "done" ? outcome.result : null;

  return { sessionId: session.id, strata: session.strata, crisis, extraction, summary, result };
}

const EMPTY_CITATION_COUNTS: Record<CitationClass, number> = {
  verbatim: 0,
  "case-mismatch": 0,
  "punctuation-mismatch": 0,
  "case-and-punctuation-mismatch": 0,
  fabricated: 0,
  malformed: 0,
};

export async function scoreDataset(
  sessions: GoldSession[],
  mode: ProviderMode,
  opts: { skillsDir?: string; datasetPath: string },
): Promise<EvalReport> {
  const results: SessionScore[] = [];
  for (const session of sessions) {
    results.push(await scoreSession(session, mode, opts.skillsDir ?? DEFAULT_SKILLS_DIR));
  }

  let crisisCorrect = 0;
  const citationCounts = { ...EMPTY_CITATION_COUNTS };
  let citationNumerator = 0;
  let citationDenominator = 0;
  let goldFactTotal = 0;
  let recalledTotal = 0;
  let falseDropCase = 0;
  let falseDropPunct = 0;
  let falseDropBoth = 0;
  let mtGold = 0;
  let mtRecalled = 0;
  const reviewCounts = { kept: 0, verified: 0, needsReview: 0, reasoning: 0, mustReview: 0, fabricatedVerified: 0 };
  let scriptLeaks = 0;
  let summaryScored = 0;
  let checklistCoveredSum = 0;
  let checklistTotalSum = 0;

  for (const r of results) {
    if (r.crisis.correct) crisisCorrect++;
    if (r.extraction) {
      goldFactTotal += r.extraction.goldFactCount;
      recalledTotal += r.extraction.recalledCount;
      for (const v of r.extraction.citationVerdicts) {
        citationCounts[v.class]++;
        if (v.class !== "malformed") {
          citationDenominator++;
          if (v.class !== "fabricated") citationNumerator++;
        }
      }
      for (const fd of r.extraction.falseDrops) {
        if (fd.class === "case-mismatch") falseDropCase++;
        else if (fd.class === "punctuation-mismatch") falseDropPunct++;
        else falseDropBoth++;
      }
      mtGold += r.extraction.multiTurn.goldCount;
      mtRecalled += r.extraction.multiTurn.recalledCount;
      reviewCounts.kept += r.extraction.reviewCounts.kept;
      reviewCounts.verified += r.extraction.reviewCounts.verified;
      reviewCounts.needsReview += r.extraction.reviewCounts.needsReview;
      reviewCounts.reasoning += r.extraction.reviewCounts.reasoning;
      reviewCounts.mustReview += r.extraction.reviewCounts.mustReview;
      reviewCounts.fabricatedVerified += r.extraction.reviewCounts.fabricatedVerified;
    }
    if (r.summary) {
      summaryScored++;
      if (r.summary.scriptLike) scriptLeaks++;
      checklistCoveredSum += r.summary.checklistCovered;
      checklistTotalSum += r.summary.checklistTotal;
    }
  }

  const aggregate: AggregateScore = {
    sessionCount: results.length,
    crisisRouting: { correct: crisisCorrect, total: results.length, accuracy: results.length > 0 ? crisisCorrect / results.length : 0 },
    extraction: {
      citationPrecision: citationDenominator > 0 ? citationNumerator / citationDenominator : null,
      citationCounts,
      recall: goldFactTotal > 0 ? recalledTotal / goldFactTotal : null,
      goldFactTotal,
      recalledTotal,
      falseDropCounts: { caseMismatch: falseDropCase, punctuationMismatch: falseDropPunct, caseAndPunctuationMismatch: falseDropBoth },
      multiTurn: { goldCount: mtGold, recalledCount: mtRecalled, recall: mtGold > 0 ? mtRecalled / mtGold : null },
      reviewCounts,
    },
    summary: { scriptLikeLeaks: scriptLeaks, scored: summaryScored, checklistCoverage: checklistTotalSum > 0 ? checklistCoveredSum / checklistTotalSum : null },
  };

  return { generatedAt: new Date().toISOString(), providerMode: mode, datasetPath: opts.datasetPath, aggregate, sessions: results };
}
