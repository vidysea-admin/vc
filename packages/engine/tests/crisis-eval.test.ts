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
 *
 * T-033 (ISS-t-005c-c0-1, ISS-t-005c-c1-2): the five indirect-ideation rows that were `known_gap`
 * (owned by T-012) are now caught by the guard's warning-sign patterns and COUNTED, as category
 * `warning_sign`, alongside new English / Hinglish / Devanagari warning-sign rows. The known_gap
 * mechanism stays for any future owner-tagged miss, but the B16 output is now ONE block that prints
 * counted recall, the known_gap line and the all-rows recall (counted + known_gap) together, so the
 * counted figure can never be quoted forward without the gap beside it — and the 0.95 bar is
 * asserted on BOTH the counted rows and all crisis rows. The same block measures false positives
 * (D-020: accepted, measured, reported — never suppressed): every benign-intent row (benign_idiom,
 * hard_negative, accepted_residual) the guard flagged.
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
  category:
    | "explicit"
    | "indirect"
    | "concern"
    | "abuse"
    | "benign_idiom"
    | "hard_negative"
    | "accepted_residual"
    | "evasion_spaced"
    | "evasion_confusable"
    | "warning_sign"
    | "known_gap";
  /**
   * T-005c cycle 1 (ISS-t-005c-c0-1): a row the keyword guard is KNOWN not to catch, tagged with the
   * unit that owns the fix (e.g. "T-012", the classifier). Indirect ideation such as "everyone would
   * be better off without me" has no stable keyword shape — a pattern list cannot cover that class
   * without flagging ordinary speech wholesale. These rows are labelled with their TRUE level
   * ("crisis") and reported separately; they are excluded from the B16 recall bar and from the
   * row-must-match assertion, so the bar measures what this guard is responsible for and the gap
   * stays visible instead of being relabelled away.
   */
  known_gap?: string;
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

  const knownGap: EvalLine[] = lines.filter((line) => line.known_gap !== undefined);
  const counted: EvalLine[] = lines.filter((line) => line.known_gap === undefined);

  let gapCrisisTotal = 0;
  let gapCrisisCaught = 0;
  const gapReport: string[] = [];
  for (const line of knownGap) {
    const level = crisisGuard(line.text).level;
    if (line.expected === "crisis") {
      gapCrisisTotal++;
      if (level === "crisis") gapCrisisCaught++;
    }
    gapReport.push(`    [${line.known_gap}] expected=${line.expected} actual=${level} :: ${JSON.stringify(line.text)}`);
  }

  // D-020: false positives are accepted, but measured. A benign-intent row is one whose category says
  // the student meant nothing alarming, whatever the documented `expected` level records.
  const BENIGN_INTENT = new Set<EvalLine["category"]>(["benign_idiom", "hard_negative", "accepted_residual"]);
  let benignTotal = 0;
  const falsePositives: string[] = [];

  for (const line of counted) {
    const result = crisisGuard(line.text);
    confusion[line.expected] ??= {};
    confusion[line.expected][result.level] = (confusion[line.expected][result.level] ?? 0) + 1;

    if (line.expected === "crisis") {
      crisisTotal++;
      if (result.level === "crisis") crisisCaught++;
    }
    if (BENIGN_INTENT.has(line.category)) {
      benignTotal++;
      if (result.level !== "none") {
        falsePositives.push(`    [${line.category}] actual=${result.level} :: ${JSON.stringify(line.text)}`);
      }
    }
    if (result.level !== line.expected) {
      mismatches.push(
        `[${line.category}] expected=${line.expected} actual=${result.level} :: ${JSON.stringify(line.text)}`,
      );
    }
  }

  // T-012 / ISS-t-033-rev-1: the counted figure above includes accepted_residual rows — benign-intent
  // text the recall-only guard flags, so they are labelled expected:"crisis". Counting them as caught
  // crises inflates recall. TRUE-crisis recall counts only rows whose category is not benign-intent.
  let trueCrisisTotal = 0;
  let trueCrisisCaught = 0;
  for (const line of counted) {
    if (line.expected !== "crisis" || BENIGN_INTENT.has(line.category)) continue;
    trueCrisisTotal++;
    if (crisisGuard(line.text).level === "crisis") trueCrisisCaught++;
  }

  const ratio = (caught: number, total: number): number => (total === 0 ? 1 : caught / total);
  const recall = ratio(crisisCaught, crisisTotal);
  const trueRecall = ratio(trueCrisisCaught, trueCrisisTotal);
  const allCaught = crisisCaught + gapCrisisCaught;
  const allTotal = crisisTotal + gapCrisisTotal;
  const allRecall = ratio(allCaught, allTotal);
  const fpRate = ratio(falsePositives.length, benignTotal);

  // ISS-t-005c-c1-2: ONE block, so the counted figure is never read without the known_gap line.
  console.log(
    [
      `B16 crisis recall (golden set, bar >= 0.95):`,
      `  counted rows:                  ${crisisCaught}/${crisisTotal} (${recall.toFixed(4)})`,
      `  TRUE-crisis rows (counted, excl. benign-intent accepted_residual): ${trueCrisisCaught}/${trueCrisisTotal} (${trueRecall.toFixed(4)})`,
      `  known_gap rows (not counted):  ${gapCrisisCaught}/${gapCrisisTotal} caught` +
        (knownGap.length === 0 ? " — none outstanding" : ` — ${knownGap.length} outstanding, listed below`),
      ...gapReport,
      `  all crisis rows incl. known_gap: ${allCaught}/${allTotal} (${allRecall.toFixed(4)})`,
      `  false positives on benign-intent rows (D-020: accepted, measured, not suppressed): ` +
        `${falsePositives.length}/${benignTotal} (${fpRate.toFixed(4)})`,
      ...falsePositives,
    ].join("\n"),
  );
  console.log("crisis-eval confusion matrix (expected -> {actual: count}):", JSON.stringify(confusion));
  if (mismatches.length > 0) {
    console.log("mismatches:\n" + mismatches.join("\n"));
  }

  assert.equal(mismatches.length, 0, `${mismatches.length} row(s) did not match their documented expected level`);
  assert.ok(recall >= 0.95, `B16 requires crisis recall >= 0.95, got ${recall.toFixed(4)} (${crisisCaught}/${crisisTotal})`);
  assert.ok(
    trueCrisisTotal < crisisTotal,
    "ISS-t-033-rev-1: the true-crisis denominator must exclude the accepted_residual rows the counted line includes",
  );
  assert.ok(
    trueRecall >= 0.95,
    `B16 bar on TRUE-crisis rows only: got ${trueRecall.toFixed(4)} (${trueCrisisCaught}/${trueCrisisTotal})`,
  );
  assert.ok(
    allRecall >= 0.95,
    `B16 bar must also hold with known_gap rows counted: got ${allRecall.toFixed(4)} (${allCaught}/${allTotal})`,
  );
});

test("crisis-eval (T-033): no known_gap row is left — every indirect-ideation row is counted", () => {
  const knownGap = loadEval().filter((line) => line.known_gap !== undefined);
  assert.deepEqual(
    knownGap.map((line) => line.text),
    [],
    "a known_gap row must be listed with its owner in the B16 block and justified in the manifest",
  );
});

test("crisis-eval (T-033): the golden set covers warning signs in all three scripts", () => {
  const warning = loadEval().filter((line) => line.category === "warning_sign");
  for (const lang of ["en", "hi-Latn", "hi-Deva"]) {
    assert.ok(
      warning.filter((line) => line.lang === lang).length >= 5,
      `expected >= 5 warning_sign rows in ${lang}, got ${warning.filter((line) => line.lang === lang).length}`,
    );
  }
});

// ---------------------------------------------------------------------------
// T-012 / ISS-t-033-rev-2: a HELD-OUT slice, written independently of the patterns
// ---------------------------------------------------------------------------
//
// qa/evals/crisis-eval-heldout.jsonl was authored and committed (6f98e5a) BEFORE its author read
// CRISIS_PATTERNS / CONCERN_PATTERNS, and before any guard run against it; rows carry their TRUE
// intent only (no `expected` guard level). It is kept OUT of the golden set above on purpose: rows
// that get tuned into the patterns stop being held out. Its recall is printed as its own line and is
// NOT a B16 PASS — the 0.95 bar is a pilot gate, and this slice is the honest measure of the keyword
// guard alone on phrasing it was not written against. The floor assertion only stops a silent
// regression below the first measured value (10/28); raising the patterns to fit these rows would
// be the wrong fix (it spends the slice) — a new held-out slice must be written after any tuning.

interface HeldOutLine {
  text: string;
  intent: "crisis" | "none";
  lang: "en" | "hi-Latn" | "hi-Deva";
  kind: string;
}

const HELDOUT_PATH = join(TESTS_DIR, "..", "..", "..", "qa", "evals", "crisis-eval-heldout.jsonl");
/**
 * The keyword-guard recall floor on the held-out slice. First measured 10/28 (T-012 build, 2026-09-27); 12/28 on main da2faad
 * before w1-crisis-recall; raised to 14/28 by w1-crisis-recall (D-112): the two abuse rows "Papa mujhe roz maarte hain" and
 * "पापा मुझे रोज़ मारते हैं।" (a frequency word between the object and the hitting verb). Those two rows were read while tuning, so
 * they are no longer held out; the other 14 misses are new phrase families and were deliberately NOT tuned (ISS-t-012-rev-4).
 */
const HELDOUT_BASELINE = { caught: 14, total: 28 };

function loadHeldOut(): HeldOutLine[] {
  return readFileSync(HELDOUT_PATH, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as HeldOutLine);
}

test("crisis-eval held-out (ISS-t-033-rev-2): labelled by intent, all three scripts, disjoint from the golden set", () => {
  const held = loadHeldOut();
  for (const line of held) {
    assert.ok(line.intent === "crisis" || line.intent === "none", `bad intent on ${JSON.stringify(line.text)}`);
    assert.ok(!("expected" in line), "a held-out row carries its true intent only, never a guard-level label");
  }
  const crisis = held.filter((line) => line.intent === "crisis");
  assert.ok(crisis.length >= 25, `expected >= 25 held-out crisis rows, got ${crisis.length}`);
  for (const lang of ["en", "hi-Latn", "hi-Deva"] as const) {
    assert.ok(crisis.filter((line) => line.lang === lang).length >= 5, `expected >= 5 held-out crisis rows in ${lang}`);
  }
  const golden = new Set(loadEval().map((line) => line.text));
  assert.deepEqual(
    held.filter((line) => golden.has(line.text)).map((line) => line.text),
    [],
    "a held-out row must never also be a golden-set row",
  );
});

test("crisis-eval held-out (ISS-t-033-rev-2): keyword-guard recall is printed on its own line and never regresses", () => {
  const held = loadHeldOut();
  const crisis = held.filter((line) => line.intent === "crisis");
  const benign = held.filter((line) => line.intent === "none");
  const missed = crisis.filter((line) => crisisGuard(line.text).level !== "crisis");
  const caught = crisis.length - missed.length;
  const flaggedBenign = benign.filter((line) => crisisGuard(line.text).level !== "none");
  const recall = caught / crisis.length;
  console.log(
    [
      `B16 HELD-OUT slice (independent of the patterns; NOT counted toward the golden-set bar):`,
      `  keyword-guard crisis recall: ${caught}/${crisis.length} (${recall.toFixed(4)})` +
        (recall >= 0.95 ? "" : " — BELOW the 0.95 pilot bar: the guard alone is not pilot-ready"),
      ...missed.map((line) => `    missed [${line.lang}/${line.kind}] ${JSON.stringify(line.text)}`),
      `  benign rows flagged: ${flaggedBenign.length}/${benign.length}`,
    ].join("\n"),
  );
  assert.ok(
    caught / crisis.length >= HELDOUT_BASELINE.caught / HELDOUT_BASELINE.total,
    `held-out recall regressed below the first measured baseline ${HELDOUT_BASELINE.caught}/${HELDOUT_BASELINE.total}: got ${caught}/${crisis.length}`,
  );
});
