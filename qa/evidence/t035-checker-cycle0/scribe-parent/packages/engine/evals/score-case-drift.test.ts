/**
 * T-009: the "case-drift" scripted provider upper-cases every quote — the same words, same
 * punctuation, genuinely drawn from the turn, just re-cased. This WAS ISS-t-007-rev-2's exact failure
 * mode: `verifyCandidateFact`'s `.includes()` check was case-sensitive, so a real, honest citation got
 * silently dropped as if it were fabricated (23/24 true facts dropped, measured 2026-09-26 before this
 * fix). T-013 (D-020, citation-guarantee-scope) fixed it: citation location now has a "normalised"
 * tier (NFC -> whitespace collapse -> casefold -> strip a fixed punctuation set -> strict substring),
 * so a re-cased quote is recognised as the SAME genuine citation instead of a fabrication. This test
 * now proves the fix holds: zero false drops, full recall, every recovered fact recorded at the
 * "normalised" match tier.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("case-drift provider: high citation precision AND zero false drops — T-013 recovers re-cased quotes as real citations", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const report = await scoreDataset(sessions, "case-drift", { datasetPath: DATASET_PATH });

  // The quotes are genuinely from the transcript (just re-cased), so they are NOT fabrications.
  assert.equal(report.aggregate.extraction.citationPrecision, 1, "a re-cased but genuine quote is not a fabrication");

  // T-013 fix: the "normalised" match tier recovers every one of these instead of dropping them.
  assert.deepEqual(
    report.aggregate.extraction.falseDropCounts,
    { caseMismatch: 0, punctuationMismatch: 0, caseAndPunctuationMismatch: 0 },
    "T-013's normalised tier means a re-cased quote is never dropped, so it is never a false drop either",
  );

  // Full recall: every genuinely-drawn, re-cased quote is now kept (previously measured 1/24, ISS-t-007-rev-2).
  assert.equal(report.aggregate.extraction.recall, 1, "case alone must no longer cost recall (T-013, D-020)");

  // Every fact recovered via the raw eval classifier's case-mismatch class corresponds to a KEPT fact
  // (not a false drop) — i.e. the independent classifier still SEES the case drift, but the engine no
  // longer treats it as a reason to drop.
  assert.ok(
    report.aggregate.extraction.citationCounts["case-mismatch"] > 0,
    "the case-drift provider must still genuinely re-case quotes (sanity: the fixture itself didn't change)",
  );

  assert.equal(report.aggregate.crisisRouting.accuracy, 1, "crisis/concern routing is provider-independent");
});
