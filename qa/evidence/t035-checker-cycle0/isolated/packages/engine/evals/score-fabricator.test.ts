/**
 * T-009: the "fabricator" scripted provider wraps every quote in a paraphrase frame, so it is never a
 * verbatim (or case/punctuation-normalised) substring of the transcript. This proves two things the
 * brief asks for: (1) the scorer's citation precision genuinely drops when quotes are fabricated
 * (it is not hardcoded to 1), and (2) the real scribe graph's own citation guard (B2) actually drops
 * every one of them — recall goes to 0, not "written with a bad citation".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("fabricator provider: citation precision collapses to 0, and the graph writes none of it", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const report = await scoreDataset(sessions, "fabricator", { datasetPath: DATASET_PATH });

  assert.equal(report.aggregate.extraction.citationPrecision, 0, "every fabricated quote must classify as fabricated, not a near-miss");
  assert.equal(report.aggregate.extraction.recall, 0, "the engine's own guard (B2) must drop every fabricated citation before it is written");
  assert.equal(report.aggregate.extraction.recalledTotal, 0);
  assert.ok(report.aggregate.extraction.goldFactTotal > 0, "sanity: the dataset must have gold facts to fail to recall");

  // A fabrication is a TRUE drop (the guard is right to reject it), never mis-classified as a false drop.
  assert.deepEqual(report.aggregate.extraction.falseDropCounts, { caseMismatch: 0, punctuationMismatch: 0, caseAndPunctuationMismatch: 0 });

  // Every dropped fact's reason must actually be the citation guard's fabricated-citation reason.
  for (const s of report.sessions) {
    if (!s.extraction) continue;
    for (const key of s.extraction.omittedKeys) {
      assert.ok(s.extraction.citationVerdicts.some((v) => v.key === key && v.class === "fabricated"), `${s.sessionId}/${key}: expected a fabricated verdict`);
    }
  }

  // Crisis/concern routing is provider-independent: unaffected by a fabricating provider.
  assert.equal(report.aggregate.crisisRouting.accuracy, 1);
});
