/** P1 U4 / A14 harness: blind pairing, judge sheets, and the tally. The tally here proves plumbing
 *  only; A14 itself needs two real counsellor judges under G-REAL. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBlindPairs,
  buildJudgeSheets,
  tallyH2h,
  resolveH2hSeed,
  buildKeyFile,
  H2H_PASS_RATE,
  type H2hQuestion,
  type H2hRating,
  type ExpertAnswer,
  B22_TARGET,
  B22_PERSONAS,
  gradeB22,
  ruleGrader,
  parseReferenceRubric,
  loadReferenceRubric,
  type ReferenceRubric,
  type B22Walk,
  type B22Grader,
} from "./h2h.js";
import { toH2hMarkdown, judgeSheetMarkdown, toB22Markdown } from "./report.js";
import { loadDataset } from "./dataset.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const questions: H2hQuestion[] = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, question: `question ${i}` }));
const vc = Object.fromEntries(questions.map((q) => [q.id, `VC answer ${q.id}`]));
const experts: ExpertAnswer[] = questions.map((q, i) => ({ questionId: q.id, text: `EXPERT answer ${q.id}`, author: i % 2 === 0 ? "author-1" : "author-2" }));

test("blind pairing is deterministic for a seed, and hides origin in the public sheet", () => {
  const a = buildBlindPairs(questions, vc, experts, "seed-1");
  const b = buildBlindPairs(questions, vc, experts, "seed-1");
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify(a.pairs), /"origin"|"isVc"|"author"|vcSide/);
  for (const p of a.pairs) {
    assert.ok(Object.keys(p).every((k) => ["questionId", "question", "A", "B"].includes(k)), `public pair leaks field: ${Object.keys(p)}`);
  }
});

test("randomisation is real: across 10 questions both A=VC and A=expert occur, and a different seed reorders", () => {
  const a = buildBlindPairs(questions, vc, experts, "seed-1");
  const sides = new Set(a.key.map((k) => k.vcSide));
  assert.equal(sides.size, 2);
  const b = buildBlindPairs(questions, vc, experts, "seed-2");
  assert.notDeepEqual(a.key, b.key);
});

test("every question gets exactly one pair and the key maps to the right texts", () => {
  const { pairs, key } = buildBlindPairs(questions, vc, experts, "s");
  assert.equal(pairs.length, 10);
  for (const k of key) {
    const p = pairs.find((x) => x.questionId === k.questionId)!;
    assert.equal(p[k.vcSide], vc[k.questionId]);
  }
});

test("a missing VC or expert answer is a hard error, never a silent skip", () => {
  assert.throws(() => buildBlindPairs(questions, { ...vc, q3: undefined as unknown as string }, experts, "s"), /q3/);
  assert.throws(() => buildBlindPairs(questions, vc, experts.slice(1), "s"), /q0/);
});

test("judge sheets: one per judge, independent question order, a judge never receives an answer they authored, and no origin leaks", () => {
  const { pairs } = buildBlindPairs(questions, vc, experts, "s");
  const sheets = buildJudgeSheets(pairs, experts, ["author-1", "judge-2"], "order-seed");
  assert.equal(sheets.length, 2);
  const j1 = sheets.find((s) => s.judge === "author-1")!;
  const authored = new Set(experts.filter((e) => e.author === "author-1").map((e) => e.questionId));
  assert.ok(j1.items.every((it) => !authored.has(it.questionId)), "judge author-1 must not see their own answers");
  assert.equal(j1.items.length, 5);
  const j2 = sheets.find((s) => s.judge === "judge-2")!;
  assert.equal(j2.items.length, 10);
  assert.notDeepEqual(
    j2.items.map((i) => i.questionId),
    pairs.map((p) => p.questionId),
    "judge order is shuffled",
  );
  assert.ok(JSON.stringify(sheets).indexOf("author-2") === -1, "no author names in sheets");
  assert.ok(j2.items.every((it) => it.rating === null));
});

test("judgeSheetMarkdown lists the five criteria, preference options and safety box, and no origin", () => {
  const neutralVc = Object.fromEntries(questions.map((q) => [q.id, `alpha text ${q.id}`]));
  const neutralExperts = experts.map((e) => ({ ...e, text: `beta text ${e.questionId}` }));
  const { pairs } = buildBlindPairs(questions, neutralVc, neutralExperts, "s");
  const [sheet] = buildJudgeSheets(pairs, neutralExperts, ["judge-2"], "o");
  const md = judgeSheetMarkdown(sheet!);
  for (const word of ["accuracy", "completeness", "source quality", "profile fit", "safety"]) assert.match(md, new RegExp(word, "i"));
  assert.match(md, /Preference/);
  assert.match(md, /alpha text q0/);
  assert.doesNotMatch(md, /vcSide|isVc|origin|author|VC|expert/i);
});

function rating(judge: string, questionId: string, preference: H2hRating["preference"], safetyA = false, safetyB = false): H2hRating {
  return { judge, questionId, preference, safetyA, safetyB };
}

function allRatings(prefFor: (key: { vcSide: "A" | "B" }, judge: string) => "A" | "B" | "tie", key: { questionId: string; vcSide: "A" | "B" }[], judges: string[]): H2hRating[] {
  return judges.flatMap((j) => key.map((k) => rating(j, k.questionId, prefFor(k, j))));
}

test("tally: VC equal-or-better rate >= 60% with zero safety failures and A1+A3 met => PASS", () => {
  assert.equal(H2H_PASS_RATE, 0.6);
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  let n = 0;
  // 6 of 10 per judge prefer VC, 4 prefer expert
  const ratings = allRatings((k) => (n++ % 10 < 6 ? k.vcSide : k.vcSide === "A" ? "B" : "A"), key, judges);
  const t = tallyH2h(key, ratings, { judges, a1Met: true, a3Met: true, authorsByQuestion: Object.fromEntries(experts.map((e) => [e.questionId, e.author])) });
  assert.equal(t.verdict, "PASS");
  assert.equal(t.equalOrBetterRate, 0.6);
  assert.equal(t.safetyFailures, 0);
});

test("tally: 'tie' counts as equal-or-better; just under 60% fails", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  let n = 0;
  const equalHeavy = allRatings((k) => (n++ % 10 < 3 ? "tie" : n % 10 < 6 ? k.vcSide : k.vcSide === "A" ? "B" : "A"), key, judges);
  const pass = tallyH2h(key, equalHeavy, { judges, a1Met: true, a3Met: true, authorsByQuestion: {} });
  assert.ok(pass.equalOrBetterRate >= 0.6);
  let m = 0;
  const low = allRatings((k) => (m++ % 10 < 5 ? k.vcSide : k.vcSide === "A" ? "B" : "A"), key, judges);
  assert.equal(tallyH2h(key, low, { judges, a1Met: true, a3Met: true, authorsByQuestion: {} }).verdict, "FAIL");
});

test("tally: ANY safety failure on VC fails even at 100% preference; unmet A1 or A3 fails despite a 60%+ rate", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  const ratings = allRatings((k) => k.vcSide, key, judges);
  ratings[0] = { ...ratings[0]!, safetyA: true, safetyB: true };
  const s = tallyH2h(key, ratings, { judges, a1Met: true, a3Met: true, authorsByQuestion: {} });
  assert.equal(s.verdict, "FAIL");
  assert.equal(s.safetyFailures, 1);
  const clean = allRatings((k) => k.vcSide, key, judges);
  assert.equal(tallyH2h(key, clean, { judges, a1Met: false, a3Met: true, authorsByQuestion: {} }).verdict, "FAIL");
  assert.equal(tallyH2h(key, clean, { judges, a1Met: true, a3Met: false, authorsByQuestion: {} }).verdict, "FAIL");
});

test("tally: fewer than two judges, or missing ratings, is NOT PROVEN (never a pass)", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const one = allRatings((k) => k.vcSide, key, ["judge-1"]);
  assert.equal(tallyH2h(key, one, { judges: ["judge-1"], a1Met: true, a3Met: true, authorsByQuestion: {} }).verdict, "NOT PROVEN");
  const two = allRatings((k) => k.vcSide, key, ["judge-1", "judge-2"]).slice(0, 15);
  const t = tallyH2h(key, two, { judges: ["judge-1", "judge-2"], a1Met: true, a3Met: true, authorsByQuestion: {} });
  assert.equal(t.verdict, "NOT PROVEN");
  assert.ok(t.missing > 0);
});

test("tally: a rating by a judge on an answer they authored is rejected, not counted", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const authors = Object.fromEntries(experts.map((e) => [e.questionId, e.author]));
  const ratings = allRatings((k) => k.vcSide, key, ["author-1", "judge-2"]);
  const t = tallyH2h(key, ratings, { judges: ["author-1", "judge-2"], a1Met: true, a3Met: true, authorsByQuestion: authors });
  assert.ok(t.rejectedSelfJudged > 0);
  assert.equal(t.rejectedSelfJudged, 5);
});

test("toH2hMarkdown states verdict, rate and that mock ratings are plumbing only", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  const t = tallyH2h(key, allRatings((k) => k.vcSide, key, judges), { judges, a1Met: true, a3Met: true, authorsByQuestion: {} });
  const md = toH2hMarkdown(t, { mode: "mock" });
  assert.match(md, /A14/);
  assert.match(md, /plumbing only/i);
  assert.match(md, /100\.0%/);
});

// --- p1-u4b fix6: seed handling, per-side safety boxes mapped through the key, runtime validation ---

test("fix6: judge sheet markdown and items carry a safety box for EACH side (A and B), not one shared box", () => {
  const { pairs } = buildBlindPairs(questions, vc, experts, "s");
  const [sheet] = buildJudgeSheets(pairs, experts, ["judge-2"], "o");
  assert.ok(sheet!.items.every((it) => it.safetyA === null && it.safetyB === null));
  assert.deepEqual(sheet!.preferenceOptions, ["A", "B", "tie"]);
  const md = judgeSheetMarkdown(sheet!);
  assert.match(md, /Safety failure on A: \[ \]/);
  assert.match(md, /Safety failure on B: \[ \]/);
});

test("fix6: a safety flag counts against VC only on the side the key says is VC", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  const opts = { judges, a1Met: true, a3Met: true, authorsByQuestion: {} };
  const k0 = key[0]!;
  const vcFlag = (side: "A" | "B") => allRatings((k) => k.vcSide, key, judges).map((r) => (r.questionId === k0.questionId && r.judge === "judge-1" ? { ...r, safetyA: side === "A", safetyB: side === "B" } : r));
  // flag the expert side only: not a VC safety failure
  const expertSide = k0.vcSide === "A" ? "B" : "A";
  assert.equal(tallyH2h(key, vcFlag(expertSide), opts).safetyFailures, 0);
  assert.equal(tallyH2h(key, vcFlag(expertSide), opts).verdict, "PASS");
  // flag the VC side: one failure, verdict FAIL
  const t = tallyH2h(key, vcFlag(k0.vcSide), opts);
  assert.equal(t.safetyFailures, 1);
  assert.equal(t.verdict, "FAIL");
});

test("fix6: preference must be A, B or tie and safety must be boolean; anything else throws (never counted)", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  const opts = { judges, a1Met: true, a3Met: true, authorsByQuestion: {} };
  const base = allRatings((k) => k.vcSide, key, judges);
  const bad = (patch: Record<string, unknown>) => [{ ...base[0]!, ...patch }, ...base.slice(1)] as H2hRating[];
  for (const pref of ["equal", "a", "", null, 1, undefined]) assert.throws(() => tallyH2h(key, bad({ preference: pref }), opts), /preference/i, `preference ${String(pref)}`);
  for (const v of ["false", "true", 0, 1, null, undefined]) {
    assert.throws(() => tallyH2h(key, bad({ safetyA: v }), opts), /safety/i, `safetyA ${String(v)}`);
    assert.throws(() => tallyH2h(key, bad({ safetyB: v }), opts), /safety/i, `safetyB ${String(v)}`);
  }
  assert.doesNotThrow(() => tallyH2h(key, base, opts));
});

test("fix6: --real needs an explicit seed or a random one; mock keeps a deterministic default; the seed is in the key file only", () => {
  assert.deepEqual(resolveH2hSeed({ real: true, seed: "operator-seed" }), { seed: "operator-seed", source: "explicit" });
  const r1 = resolveH2hSeed({ real: true });
  const r2 = resolveH2hSeed({ real: true });
  assert.equal(r1.source, "random");
  assert.match(r1.seed, /^[0-9a-f]{32,}$/);
  assert.notEqual(r1.seed, r2.seed);
  assert.throws(() => resolveH2hSeed({ real: true, seed: "" }), /seed/i);
  assert.deepEqual(resolveH2hSeed({ real: false }), { seed: "p1-u4", source: "mock-default" });
  assert.throws(() => buildBlindPairs(questions, vc, experts, ""), /seed/i);

  const { pairs, key } = buildBlindPairs(questions, vc, experts, r1.seed);
  const sheets = buildJudgeSheets(pairs, experts, ["judge-1", "judge-2"], r1.seed);
  const keyFile = buildKeyFile(r1, key);
  assert.equal(keyFile.seed, r1.seed);
  assert.deepEqual(keyFile.key, key);
  const publicText = JSON.stringify({ pairs, sheets }) + sheets.map((s) => judgeSheetMarkdown(s)).join("\n");
  assert.equal(publicText.includes(r1.seed), false, "the seed must not leak into pairs or sheets");
});

// ---------------------------------------------------------------------------
// B22 harness (contract B22, wave-2 b22-harness): the golden-session novice-vs-expert eval. Everything
// below is TEST-ONLY data: the rubric content here is placeholder tokens, never counselling judgement
// (the real reference rubric is Sapna ma'am's to record; ISS-081 Goodhart).
// ---------------------------------------------------------------------------

const here = fileURLToPath(new URL(".", import.meta.url));
const GOLDEN_SESSIONS_PATH = join(here, "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");
const caseIds = loadDataset(GOLDEN_SESSIONS_PATH).map((s) => s.id);

function testRubric(weights: [number, number] = [1, 3], patch: Partial<ReferenceRubric> = {}): ReferenceRubric {
  return {
    source: "recorded",
    author: "sapna-expert",
    recordedAt: "2026-01-01T00:00:00.000Z",
    cases: Object.fromEntries(
      caseIds.map((id) => [
        id,
        [
          { id: `${id}-i1`, criterion: "TEST-ONLY criterion one", weight: weights[0], anyOf: ["tok-one"] },
          { id: `${id}-i2`, criterion: "TEST-ONLY criterion two", weight: weights[1], anyOf: ["tok-two", "tok-2b"] },
        ],
      ]),
    ),
    ...patch,
  };
}
const FULL = "tok-one and tok-two";
function walksFor(textFor: (persona: (typeof B22_PERSONAS)[number], caseId: string) => string): B22Walk[] {
  return B22_PERSONAS.flatMap((persona) => caseIds.map((caseId) => ({ persona, caseId, text: textFor(persona, caseId) })));
}

test("B22: the case set is the T-009 golden sessions, and the personas are the two non-expert walkers", () => {
  assert.ok(caseIds.length >= 20, `expected >= 20 golden sessions, got ${caseIds.length}`);
  assert.equal(new Set(caseIds).size, caseIds.length);
  assert.deepEqual([...B22_PERSONAS], ["gaurav-pm", "gaurav-bhaiya"]);
  assert.equal(B22_TARGET, 0.9);
  const r = gradeB22({ caseIds, walks: walksFor(() => FULL), rubric: testRubric() });
  assert.equal(r.cases, caseIds.length);
  assert.equal(r.perCase.length, caseIds.length * 2);
});

test("B22: with no reference rubric the verdict is NOT-YET-MEASURABLE, never a score, never a pass, and it does not block", () => {
  for (const rubric of [null, undefined]) {
    const r = gradeB22({ caseIds, walks: walksFor(() => FULL), rubric });
    assert.equal(r.verdict, "NOT-YET-MEASURABLE");
    assert.equal(r.score, null);
    assert.deepEqual(r.perCase, []);
    assert.equal(r.blocksRelease, false);
    assert.match(r.reasons.join(" "), /reference rubric/i);
    const md = toB22Markdown(r);
    assert.match(md, /NOT-YET-MEASURABLE/);
    assert.doesNotMatch(md, /\*\*(PASS|FAIL)\*\*/);
    assert.doesNotMatch(md, /gaurav-pm \|/, "no per-persona score row may be rendered without a reference rubric");
  }
});

test("B22: a rubric that is not the recorded sapna-expert one cannot measure: synthetic, wrong author, empty, or partial all stay NOT-YET-MEASURABLE", () => {
  const first = caseIds[0]!;
  const partial = testRubric();
  delete partial.cases[first];
  const cases: Array<[string, ReferenceRubric, RegExp]> = [
    ["synthetic", testRubric([1, 3], { source: "synthetic" }), /synthetic|recorded/i],
    ["wrong author", testRubric([1, 3], { author: "someone-else" }), /sapna-expert/],
    ["empty", testRubric([1, 3], { cases: {} }), new RegExp(`${caseIds.length} of ${caseIds.length}`)],
    ["partial", partial, new RegExp(`1 of ${caseIds.length}`)],
  ];
  for (const [label, rubric, why] of cases) {
    const r = gradeB22({ caseIds, walks: walksFor(() => FULL), rubric });
    assert.equal(r.verdict, "NOT-YET-MEASURABLE", label);
    assert.equal(r.score, null, label);
    assert.match(r.reasons.join(" "), why, label);
  }
});

test("B22: a missing or empty walk (either persona, any case) is NOT-YET-MEASURABLE, not a zero and not a skip", () => {
  const full = walksFor(() => FULL);
  const noBhaiya = full.filter((w) => w.persona !== "gaurav-bhaiya");
  const oneMissing = full.slice(1);
  const oneEmpty = full.map((w, i) => (i === 0 ? { ...w, text: "   " } : w));
  for (const [label, walks] of [["persona absent", noBhaiya], ["one walk missing", oneMissing], ["one walk empty", oneEmpty]] as const) {
    const r = gradeB22({ caseIds, walks, rubric: testRubric() });
    assert.equal(r.verdict, "NOT-YET-MEASURABLE", label);
    assert.equal(r.score, null, label);
    assert.equal(r.blocksRelease, false, label);
    assert.match(r.reasons.join(" "), /walk/i, label);
  }
});

test("B22: once the rubric exists the 90% bar is exact per persona: 9/10 passes, 8/10 fails and blocks release", () => {
  const rubric = testRubric([1, 9]);
  const pass = gradeB22({ caseIds, walks: walksFor(() => "tok-two only"), rubric });
  assert.equal(pass.verdict, "PASS");
  assert.equal(pass.blocksRelease, false);
  assert.equal(pass.score!.byPersona["gaurav-pm"], 0.9);
  assert.equal(pass.score!.overall, 0.9);

  const below = gradeB22({ caseIds, walks: walksFor(() => "tok-one only"), rubric: testRubric([8, 2]) });
  assert.equal(below.verdict, "FAIL");
  assert.equal(below.blocksRelease, true);
  assert.equal(below.score!.overall, 0.8);

  const none = gradeB22({ caseIds, walks: walksFor(() => "nothing relevant"), rubric });
  assert.equal(none.verdict, "FAIL");
  assert.equal(none.score!.overall, 0);
});

test("B22: both personas must clear the bar: one strong walker cannot carry the other", () => {
  const r = gradeB22({
    caseIds,
    walks: walksFor((persona) => (persona === "gaurav-pm" ? FULL : "tok-two only")),
    rubric: testRubric(),
  });
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.score!.byPersona["gaurav-pm"], 1);
  assert.equal(r.score!.byPersona["gaurav-bhaiya"], 0.75);
  assert.equal(r.score!.overall, 0.75);
  assert.equal(r.blocksRelease, true);
  const md = toB22Markdown(r);
  assert.match(md, /\*\*FAIL\*\*/);
  assert.match(md, /gaurav-bhaiya \| 75\.0%/);
  assert.match(md, /gaurav-pm \| 100\.0%/);
});

test("B22: the grader is blind (sees a rubric item and answer text only) and order-independent", () => {
  const calls: unknown[][] = [];
  const spy: B22Grader = (...args) => {
    calls.push(args);
    return ruleGrader(...args);
  };
  const walks = walksFor((persona) => `${FULL} ${persona === "gaurav-pm" ? "" : "extra"}`);
  const a = gradeB22({ caseIds, walks, rubric: testRubric(), grader: spy });
  assert.equal(calls.length, caseIds.length * 2 * 2, "one call per walk per rubric item");
  for (const args of calls) {
    assert.equal(args.length, 2);
    assert.doesNotMatch(JSON.stringify(args), /gaurav|sapna|persona/i, "the grader must never be told who walked");
  }
  const b = gradeB22({ caseIds: [...caseIds].reverse(), walks: [...walks].reverse(), rubric: testRubric() });
  assert.equal(b.verdict, a.verdict);
  assert.deepEqual(b.score, a.score);
});

test("B22: a padded answer cannot beat the expert: the score is capped at the rubric total", () => {
  const stuffed = `${FULL} tok-2b `.repeat(50);
  const r = gradeB22({ caseIds, walks: walksFor(() => stuffed), rubric: testRubric() });
  assert.equal(r.score!.overall, 1);
  for (const p of r.perCase) assert.ok(p.ratio <= 1);
});

test("B22: malformed input is a hard error, never a silent skip", () => {
  const good = walksFor(() => FULL);
  const rubric = testRubric();
  assert.throws(() => gradeB22({ caseIds, walks: [...good, { persona: "sapna-expert" as never, caseId: caseIds[0]!, text: "x" }], rubric }), /persona/i);
  assert.throws(() => gradeB22({ caseIds, walks: [...good, { persona: "gaurav-pm", caseId: "not-a-golden-case", text: "x" }], rubric }), /not-a-golden-case/);
  assert.throws(() => gradeB22({ caseIds, walks: [...good, good[0]!], rubric }), /duplicate/i);
  assert.throws(() => gradeB22({ caseIds, walks: [{ ...good[0]!, text: 5 as never }, ...good.slice(1)], rubric }), /text/i);
  assert.throws(() => gradeB22({ caseIds: [caseIds[0]!, caseIds[0]!], walks: [], rubric }), /duplicate/i);
  for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const bad = testRubric();
    bad.cases[caseIds[0]!]![0]!.weight = weight;
    assert.throws(() => gradeB22({ caseIds, walks: good, rubric: bad }), /weight/i, `weight ${weight}`);
  }
});

test("B22: ruleGrader is a deterministic, case- and whitespace-insensitive, any-of substring check (Devanagari included)", () => {
  const item = { id: "i", criterion: "TEST-ONLY", weight: 1, anyOf: ["Tok-One", "बजट"] };
  assert.equal(ruleGrader(item, "has  TOK-ONE here"), true);
  assert.equal(ruleGrader(item, "बजट कितना है"), true);
  assert.equal(ruleGrader(item, "nothing"), false);
  assert.equal(ruleGrader({ ...item, anyOf: [] }, "anything"), false);
});

test("B22: the rubric file loader: absent file is null (NOT-YET-MEASURABLE), a BOM is stripped, a malformed file throws", () => {
  const dir = join(tmpdir(), `b22-rubric-${process.pid}-${Date.now()}`);
  assert.equal(loadReferenceRubric(join(dir, "missing.json")), null);
  const ok = JSON.stringify(testRubric());
  assert.equal(parseReferenceRubric(`﻿${ok}`, "t").source, "recorded");
  assert.throws(() => parseReferenceRubric("{not json", "t"), /t: invalid JSON/);
  assert.throws(() => parseReferenceRubric(JSON.stringify({ ...testRubric(), source: "Recorded" }), "t"), /recorded/);
  const noAnyOf = testRubric();
  (noAnyOf.cases[caseIds[0]!]![0] as { anyOf: string[] }).anyOf = [];
  assert.throws(() => parseReferenceRubric(JSON.stringify(noAnyOf), "t"), /anyOf/);
  const zeroWeight = testRubric([0, 3]);
  assert.throws(() => parseReferenceRubric(JSON.stringify(zeroWeight), "t"), /weight/);
});
