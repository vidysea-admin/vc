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

  // Crisis sessions never called the provider (B9), even though this run used a "perfect" provider.
  const crisisSessions = report.sessions.filter((s) => s.crisis.actual === "crisis");
  assert.ok(crisisSessions.length >= 1, "the dataset must contain at least one crisis session");
  for (const s of crisisSessions) {
    assert.equal(s.crisis.providerCalledDespiteEscalation, false, `${s.sessionId}: the provider must not be called on a crisis`);
    assert.equal(s.extraction, null, `${s.sessionId}: a crisis session ends before extraction`);
  }
  // T-022 / D-020 / B20: a concern session is FLAGGED and CONTINUES — its facts are still extracted.
  const concernSessions = report.sessions.filter((s) => s.crisis.actual === "concern");
  assert.ok(concernSessions.length >= 1, "the dataset must contain at least one concern session");
  for (const s of concernSessions) {
    assert.notEqual(s.extraction, null, `${s.sessionId}: a concern session must still be extracted (flag and continue)`);
    assert.equal(s.extraction?.recalledCount, s.extraction?.goldFactCount, `${s.sessionId}: every gold fact recalled`);
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

// ISS-t-013r-rev-4/-5/-6/-c1-1 (fix cycle 2): the golden set also carries question, conditional,
// in-law-kinship, date-context and unrecognised-form hostile rows (none may auto-verify), and
// template-positive rows that MUST auto-verify, so the allow-list is proven non-vacuous.
test("ISS-t-013r-rev-6: cycle-2 hostile classes stay in review, and every template-positive row auto-verifies (verified > 0)", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const classes = new Set(sessions.flatMap((s) => s.goldFacts.filter((f) => f.mustReview).map((f) => f.hostile)));
  for (const c of ["question", "conditional", "in-law-kinship", "date-context", "unrecognised-form"]) {
    assert.ok(classes.has(c), `hostile class ${c} is present in the golden set`);
  }
  const positives = sessions.filter((s) => s.strata.includes("d020-template-positive"));
  assert.ok(positives.length >= 10, `expected >= 10 template-positive sessions, got ${positives.length}`);

  const report = await scoreDataset(sessions, "perfect", { datasetPath: DATASET_PATH });
  assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0);
  for (const session of positives) {
    const s = report.sessions.find((x) => x.sessionId === session.id);
    assert.equal(s?.extraction?.reviewCounts.verified, session.goldFacts.length, `${session.id}: its template fact must auto-verify`);
  }
  assert.ok(report.aggregate.extraction.reviewCounts.verified >= positives.length);
});
// ISS-t-013r-c2-1 / -rev-9 / -rev-10 (fix cycle 3): reported-speech (English, Hinglish, Devanagari, an
// unlisted subject), retraction-in-a-second-sentence and zero-width-hidden-negation rows; none may
// auto-verify, and the template positives still do.
test("ISS-t-013r-c2-1: cycle-3 hostile classes (reported-speech, retraction, zero-width) stay in review; fabricatedVerified 0; positives still verify", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const cycle3 = sessions.filter((s) =>
    s.goldFacts.some((f) => f.mustReview && ["reported-speech", "retraction", "zero-width"].includes(f.hostile ?? "")),
  );
  const classes = new Set(cycle3.flatMap((s) => s.goldFacts.map((f) => f.hostile)));
  for (const c of ["reported-speech", "retraction", "zero-width"]) assert.ok(classes.has(c), `hostile class ${c} present`);
  assert.ok(cycle3.length >= 9, `expected >= 9 cycle-3 hostile sessions, got ${cycle3.length}`);

  const report = await scoreDataset(sessions, "perfect", { datasetPath: DATASET_PATH });
  assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0);
  for (const session of cycle3) {
    const s = report.sessions.find((x) => x.sessionId === session.id);
    assert.equal(s?.extraction?.reviewCounts.kept, session.goldFacts.length, `${session.id}: kept, never dropped`);
    assert.equal(s?.extraction?.reviewCounts.verified, 0, `${session.id}: must not auto-verify`);
  }
  const positives = sessions.filter((s) => s.strata.includes("d020-template-positive"));
  assert.ok(report.aggregate.extraction.reviewCounts.verified >= positives.length && positives.length > 0);
});
// T-030 (ISS-t-013r-rev-14): "I want to study as <unlisted filler> in <country>" rows (English, a
// Hinglish filler inside the English template, Hinglish and Devanagari template clauses, and a connector
// or degree carrying a filler). None may auto-verify, in perfect OR case-drift mode; every
// template-positive row (the 12 originals plus the closed-connector positives) still does.
test("ISS-t-013r-rev-14 (T-030): attributed-gap hostile rows stay in review (perfect + case-drift); fabricatedVerified 0; every template positive verifies", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const hostile = sessions.filter((s) => s.goldFacts.some((f) => f.mustReview && f.hostile === "attributed-gap"));
  assert.ok(hostile.length >= 10, `expected >= 10 attributed-gap sessions, got ${hostile.length}`);
  const strata = new Set(hostile.flatMap((s) => s.strata));
  for (const st of ["pure-english", "romanised-hinglish", "devanagari"]) assert.ok(strata.has(st), `attributed-gap rows cover ${st}`);
  const positives = sessions.filter((s) => s.strata.includes("d020-template-positive"));
  assert.ok(positives.length >= 12, `expected >= 12 template-positive sessions, got ${positives.length}`);

  for (const mode of ["perfect", "case-drift"] as const) {
    const report = await scoreDataset([...hostile, ...positives], mode, { datasetPath: DATASET_PATH });
    assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0, `${mode}: fabricatedVerified`);
    for (const session of hostile) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.kept, session.goldFacts.length, `${mode} ${session.id}: kept, never dropped`);
      assert.equal(s?.extraction?.reviewCounts.verified, 0, `${mode} ${session.id}: must not auto-verify`);
    }
    for (const session of positives) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.verified, session.goldFacts.length, `${mode} ${session.id}: its template fact must auto-verify`);
    }
  }
});
// T-030 (D-025): genuine quotes on the three structural dimensions the gate did not read before: a key
// no matching template declares (nationality from a study clause, an IELTS key from a class-12 clause,
// a USD or total budget from a bare or per-year clause), a counsellor-spoken turn, and a template clause
// found only in the machine translation. None may auto-verify, in perfect OR case-drift mode; the
// template positives (including the new total-budget and class-10 rows) still do.
test("D-025 (T-030): key-not-declared, counsellor-speaker and translation-only rows stay in review (perfect + case-drift); fabricatedVerified 0; positives verify", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const classes = ["key-not-declared", "counsellor-speaker", "translation-only"];
  const hostile = sessions.filter((s) => s.goldFacts.some((f) => f.mustReview && classes.includes(f.hostile ?? "")));
  for (const c of classes) {
    assert.ok(hostile.filter((s) => s.goldFacts.some((f) => f.hostile === c)).length >= 3, `>= 3 rows of class ${c}`);
  }
  const positives = sessions.filter((s) => s.strata.includes("d020-template-positive"));
  assert.ok(positives.some((s) => s.id === "p18-template-en-budget-total") && positives.some((s) => s.id === "p19-template-en-class10"));

  for (const mode of ["perfect", "case-drift"] as const) {
    const report = await scoreDataset([...hostile, ...positives], mode, { datasetPath: DATASET_PATH });
    assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0, `${mode}: fabricatedVerified`);
    for (const session of hostile) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.kept, session.goldFacts.length, `${mode} ${session.id}: kept, never dropped`);
      assert.equal(s?.extraction?.reviewCounts.verified, 0, `${mode} ${session.id}: must not auto-verify`);
    }
    for (const session of positives) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.verified, session.goldFacts.length, `${mode} ${session.id}: its template fact must auto-verify`);
    }
  }
});
// T-030 (ISS-t-013-c2-rev-4): number RANGES ("15-20 lakh", "1500000 to 2000000", "15 se 20 lakh") and
// COMPOUND numbers ("1.5 crore", "20 lakh plus 5 lakh", "2000000 plus 500000"), plus marks that are not a
// percentage. Each quote is genuine and single-clause, and each proposes one end or the sum as the value;
// none may auto-verify. The percentage and IELTS positives (p20, p21) still do.
test("ISS-t-013-c2-rev-4 (T-030): numeric-range, numeric-compound and marks rows stay in review (perfect + case-drift); fabricatedVerified 0; p20/p21 verify", async () => {
  const sessions = loadDataset(DATASET_PATH);
  const classes = ["numeric-range", "numeric-compound", "marks-not-percentage"];
  const hostile = sessions.filter((s) => s.goldFacts.some((f) => f.mustReview && classes.includes(f.hostile ?? "")));
  assert.ok(hostile.filter((s) => s.goldFacts.some((f) => f.hostile === "numeric-range")).length >= 5, ">= 5 range rows");
  assert.ok(hostile.filter((s) => s.goldFacts.some((f) => f.hostile === "numeric-compound")).length >= 4, ">= 4 compound rows");
  const strata = new Set(hostile.flatMap((s) => s.strata));
  for (const st of ["pure-english", "romanised-hinglish", "devanagari"]) assert.ok(strata.has(st), `range/compound rows cover ${st}`);
  const positives = sessions.filter((s) => s.id === "p20-template-en-class12-percent" || s.id === "p21-template-en-ielts-score");
  assert.equal(positives.length, 2);

  for (const mode of ["perfect", "case-drift"] as const) {
    const report = await scoreDataset([...hostile, ...positives], mode, { datasetPath: DATASET_PATH });
    assert.equal(report.aggregate.extraction.reviewCounts.fabricatedVerified, 0, `${mode}: fabricatedVerified`);
    for (const session of hostile) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.kept, session.goldFacts.length, `${mode} ${session.id}: kept, never dropped`);
      assert.equal(s?.extraction?.reviewCounts.verified, 0, `${mode} ${session.id}: must not auto-verify`);
    }
    for (const session of positives) {
      const s = report.sessions.find((x) => x.sessionId === session.id);
      assert.equal(s?.extraction?.reviewCounts.verified, session.goldFacts.length, `${mode} ${session.id}: its template fact must auto-verify`);
    }
  }
});
