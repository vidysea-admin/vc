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
