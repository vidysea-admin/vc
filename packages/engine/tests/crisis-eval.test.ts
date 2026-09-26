/**
 * Offline recall check for the crisis guard (ISS-023, contract B9, B16 — outcome not construction).
 * Runs crisisGuard over the labelled dataset at qa/evals/crisis-eval.jsonl and asserts:
 *   - the guard's output matches the documented `expected` level on every line, and
 *   - recall (crisisCaught / crisisTotal, over every row whose `expected` is "crisis") is >= 0.95
 *     (B16's bar) — printed alongside the full confusion matrix so both can be pasted into the
 *     evidence manifest.
 *
 * D-020 / qa/gates/crisis-guard-precision.md (2026-09-26): the guard matches for recall only. The
 * `accepted_residual` category (originally ISS-040's "hard_negative" false-positive repros — ported
 * from the stalled t-005b branch's dataset, see qa/debug/t-005b-guard-hardening-cycle3.md) is EIGHT
 * rows whose `expected` field was flipped from "none" to "crisis" here, because that is what this
 * unit's recall-only design actually and correctly returns for them now — a documented expected
 * flag, not a suppressed one. The remaining `hard_negative` rows remain "none" unchanged: those
 * genuinely don't collide with any pattern or squeezed substring even without suppression, and stay
 * as a real regression check. There is no "must never flag" assertion left for either category —
 * only "matches what is documented", exactly like every other row.
 *
 * ISS-039 note (carried from the stalled branch): the "explicit"/"indirect"/"concern"/"benign_idiom"
 * categories were authored by the same person who wrote the patterns they probe — a same-author
 * eval set, not an independent one, and its reported numbers should be read that way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crisisGuard } from "../src/guards/crisis.js";
import type { CrisisLevel } from "../src/guards/crisis.js";

interface EvalLine {
  text: string;
  expected: CrisisLevel;
  lang: string;
  category: "explicit" | "indirect" | "concern" | "abuse" | "benign_idiom" | "hard_negative" | "accepted_residual";
}

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
// packages/engine/tests -> packages/engine -> packages -> repo root -> qa/evals
const EVAL_PATH = join(TESTS_DIR, "..", "..", "..", "qa", "evals", "crisis-eval.jsonl");

function loadEval(): EvalLine[] {
  const raw = readFileSync(EVAL_PATH, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalLine);
}

test("crisis-eval: every row matches its documented expected level; crisis recall >= 0.95 (B16)", () => {
  const lines = loadEval();
  assert.ok(lines.length >= 45, `expected >=45 eval lines, got ${lines.length}`);

  const confusion: Record<string, Record<string, number>> = {};
  const mismatches: string[] = [];
  let crisisTotal = 0;
  let crisisCaught = 0;

  for (const line of lines) {
    const result = crisisGuard(line.text);
    confusion[line.expected] ??= {};
    confusion[line.expected][result.level] = (confusion[line.expected][result.level] ?? 0) + 1;

    if (line.expected === "crisis") {
      crisisTotal++;
      if (result.level === "crisis") crisisCaught++;
    }
    if (result.level !== line.expected) {
      mismatches.push(
        `[${line.category}] expected=${line.expected} actual=${result.level} :: ${JSON.stringify(line.text)}`,
      );
    }
  }

  const recall = crisisTotal === 0 ? 1 : crisisCaught / crisisTotal;

  console.log("crisis-eval confusion matrix (expected -> {actual: count}):", JSON.stringify(confusion));
  console.log(`crisis recall: ${crisisCaught}/${crisisTotal} (${recall.toFixed(4)})`);
  if (mismatches.length > 0) {
    console.log("mismatches:\n" + mismatches.join("\n"));
  }

  assert.equal(mismatches.length, 0, `${mismatches.length} row(s) did not match their documented expected level`);
  assert.ok(recall >= 0.95, `B16 requires crisis recall >= 0.95, got ${recall.toFixed(4)} (${crisisCaught}/${crisisTotal})`);
});
