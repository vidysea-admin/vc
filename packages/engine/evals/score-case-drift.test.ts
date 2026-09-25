/**
 * T-009: the "case-drift" scripted provider upper-cases every quote — the same words, same
 * punctuation, genuinely drawn from the turn, just re-cased. This is ISS-t-007-rev-2's exact failure
 * mode: `verifyCandidateFact`'s `.includes()` check is case-sensitive, so a real, honest citation gets
 * silently dropped as if it were fabricated. The scorer must tell the two apart: citation precision
 * (is this a real quote at all?) stays HIGH, while the false-drop count (did the guard wrongly reject
 * a real quote?) goes up — quantifying the issue instead of just re-describing it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("case-drift provider: high citation precision, but real false drops from the guard's case-sensitivity", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const report = await scoreDataset(sessions, "case-drift", { datasetPath: DATASET_PATH });

  // The quotes are genuinely from the transcript (just re-cased), so they are NOT fabrications.
  assert.equal(report.aggregate.extraction.citationPrecision, 1, "a re-cased but genuine quote is not a fabrication");

  // ISS-t-007-rev-2, quantified: the guard's case-sensitive .includes() drops these anyway.
  assert.ok(
    report.aggregate.extraction.falseDropCounts.caseMismatch > 0,
    `expected case-mismatch false drops > 0, got ${JSON.stringify(report.aggregate.extraction.falseDropCounts)}`,
  );
  assert.equal(report.aggregate.extraction.falseDropCounts.punctuationMismatch, 0, "case-drift changes case only, never punctuation");

  // Recall is measurably worse than the perfect run because of those false drops (not because the
  // facts were never proposed — every one of them was proposed, just rejected on case alone).
  assert.ok(report.aggregate.extraction.recall! < 1, "case-sensitivity must cost real recall");
  assert.ok(report.aggregate.extraction.recall! > 0, "Devanagari-quote facts have no case concept and should still recall");

  // Every false-dropped fact really was proposed with the RIGHT key, value and turn — only the case differs.
  for (const s of report.sessions) {
    if (!s.extraction) continue;
    for (const fd of s.extraction.falseDrops) {
      assert.equal(fd.class, "case-mismatch", `${s.sessionId}/${fd.key}: case-drift must only ever produce case-mismatch false drops`);
    }
  }

  assert.equal(report.aggregate.crisisRouting.accuracy, 1, "crisis/concern routing is provider-independent");
});
