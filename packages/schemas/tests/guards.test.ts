import { test } from "node:test";
import assert from "node:assert/strict";
import { isScriptLike } from "../src/guards.js";

test("a genuine question is not script-like", () => {
  assert.equal(isScriptLike("Have you considered a smaller campus for a closer mentor ratio?"), false);
});

test("a comparison-marker prompt is not script-like", () => {
  assert.equal(isScriptLike("Compare University A and University B on total cost."), false);
  assert.equal(isScriptLike("vs the public option, this private college costs 3x more."), false);
  assert.equal(isScriptLike("Evidence: 80% of 2024 grads found jobs within 6 months."), false);
});

test("a recital cue is flagged as script-like even when phrased as a question", () => {
  assert.equal(isScriptLike("Tell the student this university is the best fit?"), true);
});

test("recital cues 'Say:' and 'You should tell' are flagged", () => {
  assert.equal(isScriptLike("Say: this is your best option."), true);
  assert.equal(isScriptLike("You should tell them to apply to this course now."), true);
});

test("a plain statement with no question mark or comparison marker is script-like", () => {
  assert.equal(isScriptLike("This university is a great fit for you."), true);
});

// ISS-008: widened recital cues — imperative-to-counsellor forms beyond the
// original three.
test("widened recital cues are flagged as script-like", () => {
  assert.equal(isScriptLike("Tell them this is the right choice."), true);
  assert.equal(isScriptLike("Say to the student that this is final."), true);
  assert.equal(isScriptLike("Ask them to agree to this plan."), true);
  assert.equal(isScriptLike("Convince the student this is their best shot."), true);
  assert.equal(isScriptLike("Reassure them that everything will work out."), true);
});

// ISS-008: a leading definitive assertion closed with a tag question reads as
// a statement wearing a question mark, not a genuine question.
test("a definitive assertion closed with a tag question is script-like", () => {
  assert.equal(isScriptLike("This university is definitely your best option, right?"), true);
  assert.equal(isScriptLike("This is certainly the correct choice, isn't it?"), true);
  assert.equal(isScriptLike("It's clearly the better deal, don't you think?"), true);
  assert.equal(isScriptLike("This is obviously the right call, correct?"), true);
});

// ISS-008: type-aware behaviour via the optional `type` parameter.
test("widen/clarify: a statement with no '?' is script-like even without a recital cue", () => {
  assert.equal(isScriptLike("Consider universities outside the top 10.", "widen"), true);
  assert.equal(isScriptLike("You have not said your budget range.", "clarify"), true);
});

test("widen/clarify: a genuine question is not script-like", () => {
  assert.equal(isScriptLike("Have you considered a smaller campus?", "widen"), false);
  assert.equal(isScriptLike("What is your budget range?", "clarify"), false);
});

test("compare/challenge/evidence: a cited statement is not script-like even with no '?'", () => {
  assert.equal(
    isScriptLike(
      "According to the 2024 QS ranking, University A ranks 15 spots higher than University B.",
      "evidence",
    ),
    false,
  );
  assert.equal(
    isScriptLike(
      "Your budget of $20k does not cover tuition plus living costs at University A, which run $35k a year.",
      "challenge",
    ),
    false,
  );
  assert.equal(
    isScriptLike("University A costs $20k a year; University B costs $28k a year.", "compare"),
    false,
  );
});

test("compare/challenge/evidence: a recital cue still flags regardless of type", () => {
  assert.equal(isScriptLike("Tell the student University A is better.", "evidence"), true);
});

// ISS-t-002b-schema-hardening-1: statement-type cards (compare/challenge/evidence) have no "?"
// fallback, so recital cues must match case-insensitively and cover plain imperatives.
test("ISS-t-002b-1: lowercase / mid-sentence recital cues flag statement-type cards", () => {
  assert.equal(isScriptLike("You must tell the student their application is rejected.", "evidence"), true);
  assert.equal(isScriptLike("Next, tell the student that LSE is the better fit.", "challenge"), true);
  assert.equal(isScriptLike("you need to tell them the deadline has passed.", "compare"), true);
  assert.equal(isScriptLike("Tell them LSE is the right choice.", "evidence"), true);
});

test("ISS-t-002b-1: a leading imperative 'Say ...' flags as script", () => {
  assert.equal(isScriptLike("Say the international office deadline is March 1.", "evidence"), true);
  assert.equal(isScriptLike("say that the scholarship covers 50% of fees.", "challenge"), true);
});

test("ISS-t-002b-1: third-party reporting verbs in cited evidence are NOT scripts", () => {
  assert.equal(isScriptLike("Alumni say the campus is safe (2024 survey, n=312).", "evidence"), false);
  assert.equal(isScriptLike("Recruiters tell us LSE graduates earn 12% more in year one.", "evidence"), false);
  assert.equal(isScriptLike("The 2024 QS ranking puts University A 15 places above University B.", "compare"), false);
});

// ISS-t-002b-schema-hardening-2: further recital synonyms beyond tell/say —
// explain/inform (to) the student/them/him/her, "let ... know", and a leading
// script-label cue ("Your line:", "Script:", "Say this:").
test("ISS-t-002b-2: 'explain (to) the student/them' is flagged as script-like", () => {
  assert.equal(isScriptLike("Explain to the student that LSE is the better fit.", "evidence"), true);
});

test("ISS-t-002b-2: 'inform them' is flagged as script-like", () => {
  assert.equal(isScriptLike("Inform them the scholarship covers 50%.", "evidence"), true);
});

test("ISS-t-002b-2: 'let the student know' is flagged as script-like", () => {
  assert.equal(isScriptLike("Let the student know the deadline is March 1.", "evidence"), true);
});

test("ISS-t-002b-2: a leading script-label cue ('Your line:') is flagged as script-like", () => {
  assert.equal(isScriptLike("Your line: University A is ranked higher.", "evidence"), true);
});

test("ISS-t-002b-2: false-positive guards from the earlier fix stay false", () => {
  assert.equal(isScriptLike("Alumni say the campus is safe (2024 survey, n=312).", "evidence"), false);
  assert.equal(
    isScriptLike("The office will inform applicants by May 1 (source: admissions page).", "evidence"),
    false,
  );
  assert.equal(
    isScriptLike("Recruiters tell us LSE graduates earn 12% more in year one.", "evidence"),
    false,
  );
});

// w1-cards-b1 / ISS-t-010-c0-1 (B1): the widen/clarify/check-in guard asked only "does it end in '?'".
// Scenario: a planner card that leads with an instruction verb and merely ends in "?" must not pass.
test("widen/clarify/check-in: an instruction-led prompt is script-like even with a trailing '?'", () => {
  for (const type of ["widen", "clarify", "check-in"] as const) {
    assert.equal(isScriptLike("Explain the tuition difference to the family?", type), true, type);
    assert.equal(isScriptLike("Please summarise the budget for the parents?", type), true, type);
    assert.equal(isScriptLike("Walk her through the January intake?", type), true, type);
    assert.equal(isScriptLike("Mention the visa backlog?", type), true, type);
    assert.equal(isScriptLike("Describe the scholarship options?", type), true, type);
  }
});

test("widen/clarify/check-in: a genuine question that merely contains an instruction verb is not flagged", () => {
  assert.equal(isScriptLike("Has the student asked about scholarships?", "widen"), false);
  assert.equal(isScriptLike("Would it help to explain the fee structure first?", "clarify"), false);
  assert.equal(isScriptLike("Let's check: is the budget per year?", "clarify"), false);
});
