import { test } from "node:test";
import assert from "node:assert/strict";
import { crisisGuard, routeBeforeGeneration } from "../src/guards/crisis.js";

test("a plain statement is level 'none' and continues", () => {
  const result = crisisGuard("I want to study computer science in Canada.");
  assert.equal(result.level, "none");
  assert.deepEqual(result.matched, []);
  assert.deepEqual(routeBeforeGeneration("I want to study computer science in Canada."), {
    route: "continue",
  });
});

test("a benign use of 'dying' is NOT flagged", () => {
  const result = crisisGuard("I'm dying to go to LSE, it's my dream school.");
  assert.equal(result.level, "none");
  assert.deepEqual(routeBeforeGeneration("I'm dying to go to LSE, it's my dream school."), {
    route: "continue",
  });
});

test("an explicit self-harm signal is level 'crisis' and escalates", () => {
  const result = crisisGuard("I just want to kill myself, nothing matters anymore.");
  assert.equal(result.level, "crisis");
  assert.ok(result.matched.length > 0);

  const routed = routeBeforeGeneration("I just want to kill myself, nothing matters anymore.");
  assert.equal(routed.route, "escalate");
  if (routed.route === "escalate") {
    assert.equal(routed.card.type, "escalation");
    assert.equal(routed.card.level, "crisis");
    assert.match(routed.card.message, /iCALL/);
    assert.ok(routed.card.matched.length > 0);
  }
});

test("a Hinglish self-harm signal is level 'crisis'", () => {
  const result = crisisGuard("mujhe lagta hai ab jeene ka mann nahi hai, sab kuch khatam karna chahti hoon");
  assert.equal(result.level, "crisis");
});

test("an abuse signal is level 'crisis'", () => {
  const result = crisisGuard("my stepfather beats me every week and I don't know what to do.");
  assert.equal(result.level, "crisis");
});

test("a softer distress signal is level 'concern' and still escalates", () => {
  const result = crisisGuard("I feel so hopeless about this whole application process.");
  assert.equal(result.level, "concern");
  assert.ok(result.matched.length > 0);

  const routed = routeBeforeGeneration("I feel so hopeless about this whole application process.");
  assert.equal(routed.route, "escalate");
  if (routed.route === "escalate") {
    assert.equal(routed.card.level, "concern");
    assert.match(routed.card.message, /iCALL/);
  }
});

test("crisis takes priority over concern when both match in the same turn", () => {
  const result = crisisGuard("I feel so hopeless, I just want to end it all.");
  assert.equal(result.level, "crisis");
});

test("empty text is level 'none'", () => {
  assert.equal(crisisGuard("").level, "none");
  assert.equal(crisisGuard("   ").level, "none");
});

// ISS-023 — letter-spaced / punctuation evasion of explicit English signals.
test("ISS-023: letter-spaced 'k i l l myself' is level 'crisis'", () => {
  assert.equal(crisisGuard("k i l l myself").level, "crisis");
});

test("ISS-023: punctuation-broken 'k.i.l.l myself' is level 'crisis'", () => {
  assert.equal(crisisGuard("k.i.l.l myself, I can't take this").level, "crisis");
});

test("ISS-023: hyphen-spaced 's-u-i-c-i-d-a-l' is level 'crisis'", () => {
  assert.equal(crisisGuard("s-u-i-c-i-d-a-l thoughts every day now").level, "crisis");
});

// ISS-023 — indirect romanised Hinglish crisis signals.
test("ISS-023: 'sab khatam kar dunga/dungi' is level 'crisis'", () => {
  assert.equal(crisisGuard("sab khatam kar dunga, ab aur nahi seh sakta").level, "crisis");
  assert.equal(crisisGuard("sab khatam kar dungi, koi matlab nahi bacha ab").level, "crisis");
});

test("ISS-023: 'marne ka mann kar raha hai' is level 'crisis'", () => {
  assert.equal(crisisGuard("marne ka mann kar raha hai aajkal").level, "crisis");
});

test("ISS-023: 'jeena nahi chahta/chahti' is level 'crisis'", () => {
  assert.equal(crisisGuard("jeena nahi chahta ab main").level, "crisis");
  assert.equal(crisisGuard("jeena nahi chahti main ab").level, "crisis");
});

// ISS-023 — 'zindagi se thak gaya/gayi' is exhaustion/hopelessness, not explicit ideation: concern.
test("ISS-023: 'zindagi se thak gaya/gayi' is level 'concern'", () => {
  assert.equal(crisisGuard("zindagi se thak gaya hoon, bas ab aur nahi").level, "concern");
  assert.equal(crisisGuard("zindagi se thak gayi hoon, kuch samajh nahi aa raha").level, "concern");
});

// ISS-023 — Devanagari crisis signals.
test("ISS-023: Devanagari 'मरना चाहता/चाहती' (want to die) is level 'crisis'", () => {
  assert.equal(crisisGuard("मैं मरना चाहता हूं, अब कुछ अच्छा नहीं लगता").level, "crisis");
  assert.equal(crisisGuard("मैं मरना चाहती हूं, थक गई हूं सब से").level, "crisis");
});

test("ISS-023: Devanagari 'आत्महत्या' (suicide) is level 'crisis'", () => {
  assert.equal(crisisGuard("मुझे आत्महत्या के विचार आ रहे हैं").level, "crisis");
});

test("ISS-023: Devanagari 'खुद को खत्म' (end self) is level 'crisis'", () => {
  assert.equal(crisisGuard("मैं खुद को खत्म करना चाहता हूं").level, "crisis");
});

test("ISS-023: Devanagari 'जीना नहीं चाहता/चाहती' (don't want to live) is level 'crisis'", () => {
  assert.equal(crisisGuard("मैं जीना नहीं चाहता अब").level, "crisis");
  assert.equal(crisisGuard("मैं जीना नहीं चाहती अब").level, "crisis");
});

test("ISS-023: Devanagari concern-level tension stays 'concern'", () => {
  assert.equal(crisisGuard("मुझे बहुत टेंशन हो रही है परीक्षा को लेकर").level, "concern");
});

// ISS-023 — benign idioms across scripts must never be flagged 'crisis'.
test("ISS-023: benign idioms stay non-crisis (English, Hinglish, Devanagari)", () => {
  assert.notEqual(crisisGuard("This exam is killing me, so much syllabus to cover.").level, "crisis");
  assert.notEqual(crisisGuard("mar gaye yaar, itna homework de diya").level, "crisis");
  assert.notEqual(crisisGuard("yeh exam toh jaan hi le lega mera").level, "crisis");
  assert.notEqual(crisisGuard("आज मौसम बहुत अच्छा है").level, "crisis");
});

// -------------------------------------------------------------------------------------------
// D-020 / T-005c (qa/gates/crisis-guard-precision.md, 2026-09-26): recall only, nothing
// suppressed. Supersedes T-005b (qa/debug/t-005b-guard-hardening-cycle3.md), whose three fix
// cycles of sentence-boundary suppression kept trading one recall hole for another. Every
// pattern now runs against the whole flattened turn — sentence punctuation is folded away
// exactly like whitespace, never treated as a boundary a pattern can't cross.
// -------------------------------------------------------------------------------------------

// The two recall holes named in the T-005c queue row, plus their stated variants.
const REQUIRED_RECALL_CRISIS: ReadonlyArray<readonly [string, string]> = [
  ["'I hurt. Myself'", "I hurt. Myself, nobody else."],
  ["'kill. myself'", "I want to kill. myself tonight"],
  ["'kill.myself' (no space)", "kill.myself"],
  ["'hurt  myself' (double space)", "hurt  myself"],
  ["zero-width joined 'k​i​l​l myself'", "k​i​l​l myself"],
  ["letter-spaced 'k i l l myself'", "k i l l myself"],
];

for (const [name, text] of REQUIRED_RECALL_CRISIS) {
  test(`T-005c required recall: ${name} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis", JSON.stringify(text));
  });
}

// Sentence-punctuation folding is a distinct capability from the squeezed-substring fallback:
// "beatsme" has no entry in SQUEEZED_CRISIS_SUBSTRINGS, so this case is only caught if the period
// itself folds to a space before the abuse pattern runs, not rescued by squeeze() as a safety net.
test("sentence punctuation folds like whitespace: 'beats. Me' -> crisis (not rescued by squeeze)", () => {
  assert.equal(crisisGuard("she beats. Me every night, I'm scared.").level, "crisis");
});

// Zero-width deletion (not space-substitution) matters specifically for the no-\\s+-tolerance
// Devanagari patterns — squeeze() has no Devanagari entries to fall back on.
test("zero-width character inside a Devanagari word is deleted, not treated as a word gap", () => {
  assert.equal(crisisGuard("आत्म‍हत्या के बारे में सोचता रहता हूं").level, "crisis");
});

// Letter-spacing collapse extends recall to patterns with no squeezed-substring fallback at all
// (SQUEEZED_CRISIS_SUBSTRINGS is English-only and has no "beatsme" entry).
test("letter-spacing collapse recovers an abuse pattern with no squeezed fallback: 'b e a t s me'", () => {
  assert.equal(crisisGuard("she b e a t s me every night").level, "crisis");
});

test("newline folds the same as any other separator, combined with letter-spacing collapse", () => {
  assert.equal(crisisGuard("she b\ne\na\nt\ns me every night").level, "crisis");
  assert.equal(crisisGuard("no point in\nliving like this anymore").level, "crisis");
});

// D-020's accepted direction: these are the exact ISS-040 repros named in the gate answer. Under
// recall-only they are DOCUMENTED expected flags now, not silenced — see qa/evals/crisis-eval.jsonl
// category "accepted_residual" for the full set (8 rows) carried over from the stalled branch.
const ACCEPTED_RESIDUAL_FLAGS: ReadonlyArray<readonly [string, string]> = [
  ["'hurt my self-esteem' style compound", "That hurt my self-esteem a lot, but I'm working through it."],
  ["'attend it all' (verb 'attend', not 'end it all')", "I want to attend it all this semester, every workshop."],
  [
    "'an end. It all comes together' (two sentences, not 'end it all')",
    "My essay needs an end. It all comes together in the conclusion paragraph.",
  ],
];

for (const [name, text] of ACCEPTED_RESIDUAL_FLAGS) {
  test(`D-020 accepted residual: ${name} -> crisis (was 'none' under T-005b's suppression)`, () => {
    assert.equal(crisisGuard(text).level, "crisis", JSON.stringify(text));
  });
}

// Not every hard-negative shape collides with a pattern or the squeezed-substring list — these
// stay 'none' with no suppression logic at all, simply because nothing matches.
test("an unrelated hard-negative shape with no colliding words stays 'none'", () => {
  assert.equal(
    crisisGuard("We reached the last round!It all went better than the mock test.").level,
    "none",
  );
  assert.equal(crisisGuard("Seniors told me the S.A.T. isn't needed for most Indian colleges.").level, "none");
});

// Linear-time requirement (D-020 note: the removed FORMAT_RUN_BETWEEN_WORDS lookbehind was
// quadratic on zalgo-style input — a base letter followed by a long run of stacked Unicode
// combining marks). A 50k-char zalgo string must finish well under a generous bound, and doubling
// the input should roughly double the time, not quadruple it.
function zalgo(combiningMarks: number): string {
  return "e" + "́".repeat(combiningMarks);
}

/** Best-of-`reps` wall time for one `crisisGuard` call — cuts GC/scheduler noise from the sample. */
function bestOf(input: string, reps: number): number {
  let best = Infinity;
  for (let i = 0; i < reps; i++) {
    const started = performance.now();
    crisisGuard(input);
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

test("zalgo/combining-mark-heavy input (50k chars) runs in linear time, well under budget", () => {
  const input = zalgo(50000);
  const elapsed = bestOf(input, 5);
  assert.equal(crisisGuard(input).level, "none");
  assert.ok(elapsed < 3000, `50k-char zalgo input took ${elapsed.toFixed(2)}ms (budget 3000ms)`);
});

test("doubling zalgo input roughly doubles the time (linear, not quadratic)", () => {
  // 100k/200k (not a smaller pair) so the absolute times are large enough that GC/scheduler
  // jitter can't dominate the ratio; best-of-5 per size for the same reason.
  const smallMs = bestOf(zalgo(100000), 5);
  const largeMs = bestOf(zalgo(200000), 5);

  const ratio = largeMs / Math.max(smallMs, 0.01);
  console.log(`zalgo timing: 100k=${smallMs.toFixed(2)}ms, 200k=${largeMs.toFixed(2)}ms, ratio=${ratio.toFixed(2)}`);
  // A quadratic implementation doubles input -> ~4x time; a generous ceiling of 3.5 leaves
  // headroom for timer noise while still catching quadratic blowup (see FALSIFICATION D in the
  // manifest, which reproduced a ~5500x slowdown at just 25k chars with the old quadratic step).
  assert.ok(ratio < 3.5, `expected roughly linear scaling (ratio < 3.5), got ${ratio.toFixed(2)}`);
});
