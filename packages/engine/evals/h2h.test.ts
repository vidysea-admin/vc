/** P1 U4 / A14 harness: blind pairing, judge sheets, and the tally. The tally here proves plumbing
 *  only; A14 itself needs two real counsellor judges under G-REAL. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBlindPairs,
  buildJudgeSheets,
  tallyH2h,
  H2H_PASS_RATE,
  type H2hQuestion,
  type H2hRating,
  type ExpertAnswer,
} from "./h2h.js";
import { toH2hMarkdown, judgeSheetMarkdown } from "./report.js";

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

function rating(judge: string, questionId: string, preference: H2hRating["preference"], safetyFailureOnVc = false): H2hRating {
  return { judge, questionId, preference, safetyFailureOnVc };
}

function allRatings(prefFor: (key: { vcSide: "A" | "B" }, judge: string) => "A" | "B" | "equal", key: { questionId: string; vcSide: "A" | "B" }[], judges: string[]): H2hRating[] {
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

test("tally: 'equal' counts as equal-or-better; just under 60% fails", () => {
  const { key } = buildBlindPairs(questions, vc, experts, "s");
  const judges = ["judge-1", "judge-2"];
  let n = 0;
  const equalHeavy = allRatings((k) => (n++ % 10 < 3 ? "equal" : n % 10 < 6 ? k.vcSide : k.vcSide === "A" ? "B" : "A"), key, judges);
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
  ratings[0] = { ...ratings[0]!, safetyFailureOnVc: true };
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
