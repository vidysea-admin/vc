/**
 * T-009: the "perfect" scripted provider (returns exactly the gold facts, verbatim-cited, plus a
 * checklist-covering summary) run through the REAL scribe graph over the full golden dataset. This is
 * the scorer's positive control: every metric should read as a clean pass. If this test is ever red,
 * either the dataset's gold quotes drifted out of verbatim-sync with the transcripts, or the scribe
 * graph itself regressed — not the scorer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("perfect provider: 100% citation precision, 100% recall, zero false drops, correct crisis routing", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const report = await scoreDataset(sessions, "perfect", { datasetPath: DATASET_PATH });

  assert.equal(report.aggregate.extraction.citationPrecision, 1, "every gold-quote citation must be exactly verbatim");
  assert.equal(report.aggregate.extraction.recall, 1, JSON.stringify(report.aggregate.extraction, null, 2));
  assert.deepEqual(report.aggregate.extraction.falseDropCounts, { caseMismatch: 0, punctuationMismatch: 0, caseAndPunctuationMismatch: 0 });
  assert.equal(report.aggregate.extraction.multiTurn.recall, 1, "multi-turn-span facts must also be recalled with a perfect provider");
  assert.equal(report.aggregate.crisisRouting.accuracy, 1, "every session's crisis/concern/none level must route correctly");
  assert.equal(report.aggregate.summary.scriptLikeLeaks, 0, "a plain factual summary must never read as script-like (B1)");
  assert.equal(report.aggregate.summary.checklistCoverage, 1, "the perfect provider's summary must cover every gold checklist item");

  // Escalated sessions never called the provider (B9), even though this run used a "perfect" provider.
  const escalated = report.sessions.filter((s) => s.crisis.actual !== "none");
  assert.ok(escalated.length >= 2, "the dataset must contain at least one concern and one crisis session");
  for (const s of escalated) {
    assert.equal(s.crisis.providerCalledDespiteEscalation, false, `${s.sessionId}: the provider must not be called on escalation`);
  }
});
