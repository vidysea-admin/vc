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
