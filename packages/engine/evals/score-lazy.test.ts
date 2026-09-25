/**
 * T-009: the "lazy" scripted provider returns no facts and an empty summary, regardless of input.
 * Two things must hold: extraction recall collapses to 0 (nothing to recall), and — critically —
 * crisis/concern routing is UNCHANGED, because contract B9 requires the crisis/consent gates to run
 * BEFORE any provider call. A lazy provider proves that invariant: if routing depended on the
 * provider at all, a lazy one would break it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadDataset } from "./dataset.js";
import { scoreDataset } from "./score.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const DATASET_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");

test("lazy provider: 0 recall, but crisis/concern routing is completely unaffected", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const report = await scoreDataset(sessions, "lazy", { datasetPath: DATASET_PATH });

  assert.equal(report.aggregate.extraction.recall, 0);
  assert.equal(report.aggregate.extraction.recalledTotal, 0);
  assert.ok(report.aggregate.extraction.goldFactTotal > 0);
  assert.equal(report.aggregate.extraction.citationPrecision, null, "a lazy provider proposes zero citations to judge at all");
  assert.equal(report.aggregate.summary.checklistCoverage, 0, "an empty summary covers none of the gold checklist");
  assert.equal(report.aggregate.summary.scriptLikeLeaks, 0, "an empty string is never script-like");

  assert.equal(report.aggregate.crisisRouting.accuracy, 1, "the crisis/consent gates never depend on the provider (B9)");
  for (const s of report.sessions) {
    assert.equal(s.crisis.correct, true, `${s.sessionId}: crisis routing must match expectation regardless of provider`);
    if (s.crisis.actual !== "none") {
      assert.equal(s.crisis.providerCalledDespiteEscalation, false, `${s.sessionId}: provider must not be called on escalation`);
    }
  }
});
