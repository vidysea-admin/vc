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
import { COLLECTION_NAMES, type ConsentDoc } from "@vc/db";
import { createFakeDb, INDEX_PLAN } from "@vc/db/testing";
import { compileScribeGraph, startScribe, SCRIBE_PURPOSE, type DroppedFact } from "../src/scribe/index.js";
import type { Fact } from "@vc/schemas";
import { classifyCitation, type TurnText } from "./citation.js";
import { buildScribeProvider, candidatesForMode, type ProviderMode } from "./providers.js";
import type { AggregateScore, CitationClass, EvalReport, FalseDrop, GoldSession, SessionScore } from "./types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
/** packages/engine/evals -> packages/engine -> packages -> repo root -> skills (same depth as tests/). */
export const DEFAULT_SKILLS_DIR = join(here, "..", "..", "..", "skills");

function seedConsent(fakeDb: ReturnType<typeof createFakeDb>["fakeDb"], studentId: string): void {
  fakeDb.collection<ConsentDoc>(COLLECTION_NAMES.consents).seed({
    _id: `consent-${studentId}`,
    studentId,
    guardianConsent: true,
    purposes: [SCRIBE_PURPOSE],
    recordedAt: "2026-01-01T00:00:00.000Z",
    minor: false,
  });
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

  return {
    goldFactCount: session.goldFacts.length,
    recalledCount: recalledKeys.size,
    omittedKeys,
    falseDrops,
    citationVerdicts,
    citationPrecision,
    multiTurn: { goldCount: multiTurnGold.length, recalledCount: multiTurnRecalled },
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
  const { db, fakeDb } = createFakeDb();
  declareIndexes(fakeDb);
  seedConsent(fakeDb, session.input.studentId);

  const provider = buildScribeProvider(session, mode);
  const checkpointer = new MemorySaver();
  const graph = compileScribeGraph({ db, provider, skillsDir }, { checkpointer });
  const outcome = await startScribe(graph, session.input, { threadId: `eval:${session.id}` });

  const turnsById = new Map<string, TurnText>(
    session.input.turns.map((t) => [t.turnId, { turnId: t.turnId, text: t.text, translatedText: t.translatedText }]),
  );

  const actualLevel = outcome.kind === "done" && outcome.result.status === "escalated" ? outcome.result.escalation.level : "none";
  const crisis: SessionScore["crisis"] = {
    expected: session.expectedCrisisLevel,
    actual: actualLevel,
    correct: actualLevel === session.expectedCrisisLevel,
    providerCalledDespiteEscalation: actualLevel !== "none" && provider.calls.length > 0,
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
    },
    summary: { scriptLikeLeaks: scriptLeaks, scored: summaryScored, checklistCoverage: checklistTotalSum > 0 ? checklistCoveredSum / checklistTotalSum : null },
  };

  return { generatedAt: new Date().toISOString(), providerMode: mode, datasetPath: opts.datasetPath, aggregate, sessions: results };
}
