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

// ISS-t-013r-rev-3: the golden set carries D-020 hostile rows (negation, lakh/crore, currency, pronoun
// and kinship third party, same-key distractor, reasoning-before-value). With the perfect provider
// every one of them is KEPT (recall above), and none may auto-verify.
test("ISS-t-013r-rev-3: every D-020 hostile gold fact is kept and ends needsReview; fabricatedVerified is 0 over a set that can make it non-zero", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const hostileGold = sessions.flatMap((s) => s.goldFacts.filter((f) => f.mustReview));
  assert.ok(hostileGold.length >= 10, `expected >= 10 hostile gold facts, got ${hostileGold.length}`);
  const classes = new Set(hostileGold.map((f) => f.hostile));
  for (const c of ["negation", "lakh-unscaled", "crore-scaled", "currency", "pronoun", "kinship", "reasoning-before-value"]) {
    assert.ok(classes.has(c), `hostile class ${c} is present in the golden set`);
  }

  const report = await scoreDataset(sessions, "perfect", { datasetPath: DATASET_PATH });
  assert.equal(report.aggregate.extraction.reviewCounts.mustReview, hostileGold.length, "every hostile gold fact was kept");
  assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0);
  for (const s of report.sessions) {
    const session = sessions.find((x) => x.id === s.sessionId)!;
    for (const gf of session.goldFacts.filter((f) => f.mustReview)) {
      assert.ok(s.extraction, `${s.sessionId} was scored`);
      assert.equal(s.extraction?.reviewCounts.fabricatedVerified, 0, `${s.sessionId}: ${gf.key} must not auto-verify`);
    }
  }
});
