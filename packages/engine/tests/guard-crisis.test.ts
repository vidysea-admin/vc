import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONCERN_PATTERNS,
  CRISIS_PATTERNS,
  STRESS_PATTERNS,
  crisisGuard,
  routeBeforeGeneration,
  squeezePatternSource,
  stressSignal,
} from "../src/guards/crisis.js";

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

// -------------------------------------------------------------------------------------------
// T-005c cycle 1 — ISS-t-005c-rev-1 (critical): full-phrase spacing merged two words into one
// token ("b e a t s  m e" -> "beatsme") that no \s+-based pattern could match, and the hand-kept
// 7-substring squeeze list only rescued English entries. The fix derives a separator-free twin of
// EVERY pattern. This block closes the class BY CONSTRUCTION: it expands each pattern in
// CRISIS_PATTERNS and CONCERN_PATTERNS into concrete example phrases, then asserts every spaced
// evasion form of every example is flagged at that pattern's level. A new pattern is covered the
// moment it is added to either list.
// -------------------------------------------------------------------------------------------

/**
 * Expands a regex source into concrete matching strings, for the small regex subset the crisis
 * patterns use: literals, `(...)` groups with `|`, `[...]` classes (no ranges/negation), escapes
 * (`\s` -> " ", `\b` -> "", `\w` -> "x"), and the `? + *` quantifiers (`?` -> absent and present,
 * `+` -> once, `*` -> absent). Throws on anything outside that subset so a future pattern using
 * new syntax fails loudly instead of being silently skipped. Output is capped per pattern.
 */
function expandPattern(source: string, cap = 48): string[] {
  let pos = 0;
  const limit = (list: string[]): string[] => [...new Set(list)].slice(0, cap);
  const product = (a: string[], b: string[]): string[] => limit(a.flatMap((x) => b.map((y) => x + y)));

  function parseAlternation(): string[] {
    const branches: string[] = [...parseSequence()];
    while (source[pos] === "|") {
      pos++;
      branches.push(...parseSequence());
    }
    return limit(branches);
  }
  function parseSequence(): string[] {
    let acc = [""];
    while (pos < source.length && source[pos] !== "|" && source[pos] !== ")") {
      let atom = parseAtom();
      const q = source[pos];
      if (q === "?") {
        pos++;
        atom = ["", ...atom];
      } else if (q === "+") {
        pos++;
      } else if (q === "*") {
        pos++;
        atom = [""];
      } else if (q === "{") {
        throw new Error(`expandPattern: unsupported {n,m} quantifier in ${source}`);
      }
      acc = product(acc, atom);
    }
    return acc;
  }
  function parseAtom(): string[] {
    const ch = source[pos];
    if (ch === "(") {
      pos++;
      if (source.startsWith("?:", pos)) pos += 2;
      else if (source[pos] === "?") throw new Error(`expandPattern: unsupported group in ${source}`);
      const inner = parseAlternation();
      if (source[pos] !== ")") throw new Error(`expandPattern: unclosed group in ${source}`);
      pos++;
      return inner;
    }
    if (ch === "[") {
      const end = source.indexOf("]", pos);
      const body = [...source.slice(pos + 1, end)];
      if (body[0] === "^" || body.includes("-") || body.includes("\\")) {
        throw new Error(`expandPattern: unsupported class in ${source}`);
      }
      pos = end + 1;
      return body;
    }
    if (ch === "\\") {
      const next = source[pos + 1];
      pos += 2;
      if (next === "s") return [" "];
      if (next === "b") return [""];
      if (next === "w") return ["x"];
      if (/[a-zA-Z0-9]/.test(next)) throw new Error(`expandPattern: unsupported escape \\${next} in ${source}`);
      return [next];
    }
    if (ch === "." || ch === "^" || ch === "$") throw new Error(`expandPattern: unsupported ${ch} in ${source}`);
    const cp = String.fromCodePoint(source.codePointAt(pos)!);
    pos += cp.length;
    return [cp];
  }

  const out = parseAlternation();
  if (pos !== source.length) throw new Error(`expandPattern: trailing input at ${pos} in ${source}`);
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0);
}

/** One letter plus its combining marks (a Devanagari piece like "त्" or "हीं"), or one other char. */
const GRAPHEME = /\p{L}\p{M}*|[^\s]/gu;
const graphemes = (word: string): string[] => word.match(GRAPHEME) ?? [];

/** (a) every word fully letter-spaced, words separated by a double space: "b e a t s  m e". */
const letterSpaced = (phrase: string): string =>
  phrase.split(" ").map((w) => graphemes(w).join(" ")).join("  ");
/** (a') letter-spaced with SINGLE spaces everywhere — the word gap is indistinguishable. */
const letterSpacedFlat = (phrase: string): string =>
  phrase.split(" ").map((w) => graphemes(w).join(" ")).join(" ");
/** (b) punctuation-spaced: "b.e.a.t.s m.e". */
const punctuationSpaced = (phrase: string): string =>
  phrase.split(" ").map((w) => graphemes(w).join(".")).join(" ");
/** (c) double space between words: "beats  me". */
const doubleSpaced = (phrase: string): string => phrase.split(" ").join("  ");

const LEVEL_OF = { none: 0, concern: 1, crisis: 2 } as const;

const PATTERN_GROUPS: ReadonlyArray<readonly [readonly RegExp[], "crisis" | "concern"]> = [
  [CRISIS_PATTERNS, "crisis"],
  [CONCERN_PATTERNS, "concern"],
];

for (const [patterns, level] of PATTERN_GROUPS) {
  for (const pattern of patterns) {
    test(`ISS-t-005c-rev-1 generated: every spaced form of /${pattern.source}/ -> ${level}`, () => {
      const examples = expandPattern(pattern.source);
      assert.ok(examples.length > 0, `no example generated for ${pattern.source}`);
      const failures: string[] = [];
      for (const example of examples) {
        // Generator sanity: the example must match its own pattern as plain text.
        assert.ok(pattern.test(example), `generator produced a non-matching example ${JSON.stringify(example)}`);
        const forms: ReadonlyArray<readonly [string, string]> = [
          ["plain", example],
          ["letter-spaced", letterSpaced(example)],
          ["letter-spaced-flat", letterSpacedFlat(example)],
          ["punctuation-spaced", punctuationSpaced(example)],
          ["double-spaced", doubleSpaced(example)],
          ["letter-spaced in a sentence", `she said ${letterSpaced(example)} tonight`],
        ];
        for (const [formName, text] of forms) {
          const actual = crisisGuard(text).level;
          // A crisis pattern must flag "crisis"; a concern pattern at least "concern" (a squeezed
          // merge that ALSO hits a crisis pattern is the safe direction under D-020) — the next
          // test pins concern forms to exactly "concern" today.
          if (LEVEL_OF[actual] < LEVEL_OF[level]) failures.push(`${formName}: ${JSON.stringify(text)} -> ${actual}`);
        }
      }
      assert.deepEqual(failures, [], `missed spaced forms for /${pattern.source}/`);
    });
  }
}

test("ISS-t-005c-rev-1 generated: concern-pattern spaced forms land at exactly 'concern'", () => {
  const escalated: string[] = [];
  for (const pattern of CONCERN_PATTERNS) {
    for (const example of expandPattern(pattern.source)) {
      for (const text of [letterSpaced(example), punctuationSpaced(example), doubleSpaced(example)]) {
        const actual = crisisGuard(text).level;
        if (actual !== "concern") escalated.push(`${JSON.stringify(text)} -> ${actual}`);
      }
    }
  }
  assert.deepEqual(escalated, []);
});

test("squeezePatternSource derives a separator-free twin that compiles for every pattern", () => {
  for (const pattern of [...CRISIS_PATTERNS, ...CONCERN_PATTERNS]) {
    const derived = squeezePatternSource(pattern.source);
    assert.doesNotThrow(() => new RegExp(derived, pattern.flags), derived);
    assert.ok(!/\\s|\\b| |'/.test(derived), `separator construct left in ${derived}`);
  }
  assert.equal(
    squeezePatternSource(String.raw`\bcan'?t\s+(go on|do this any ?more)\b`),
    "cant(goon|dothisanymore)",
  );
});

// The six strings reproduced in the senior review (ISS-t-005c-rev-1), verbatim.
const REV1_REPRODUCED: ReadonlyArray<string> = [
  "b e a t s  m e",
  "h u r t i n g  m y s e l f",
  "m a r n a  c h a h t a",
  "k h u d  k o  k h a t a m",
  "s a b  k u c h  k h a t a m",
  "b e a t i n g  m e",
];

for (const text of REV1_REPRODUCED) {
  test(`ISS-t-005c-rev-1 reproduced miss: ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis");
  });
}

// All four Devanagari crisis patterns fully spaced per akshara piece (single and double word gap,
// and dot-spaced), plus the Devanagari concern pattern.
const DEVANAGARI_SPACED: ReadonlyArray<readonly [string, "crisis" | "concern"]> = [
  ["म र ना  चा ह ता", "crisis"],
  ["म र ना चा ह ती", "crisis"],
  ["आ त् म ह त् या", "crisis"],
  ["आ.त्.म.ह.त्.या", "crisis"],
  ["खु द  को  ख त् म", "crisis"],
  ["खु द को ख त् म", "crisis"],
  ["जी ना  न हीं  चा ह ता", "crisis"],
  ["जी.ना न.हीं चा.ह.ती", "crisis"],
  ["ब हु त  टें श न", "concern"],
];

for (const [text, level] of DEVANAGARI_SPACED) {
  test(`ISS-t-005c-rev-1 Devanagari fully spaced: ${JSON.stringify(text)} -> ${level}`, () => {
    assert.equal(crisisGuard(text).level, level);
  });
}

// ISS-t-005c-c0-2 — Hinglish "mar jaunga" family.
const MAR_JAUNGA: ReadonlyArray<string> = [
  "agar yeh nahi hua toh main mar jaunga",
  "main mar jaungi is baar sach mein",
  "warna marjaunga main",
  "main mar jaaunga ek din",
  "mar jaoongi main",
  "bas ab mar jaana hai",
  "mujhe mar jana hai",
  "main mar jaana chahta hoon",
  "m a r  j a u n g a",
];

for (const text of MAR_JAUNGA) {
  test(`ISS-t-005c-c0-2: ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis");
  });
}

test("ISS-t-005c-c0-2: past-tense idiom 'mar gaye yaar' still does not flag crisis", () => {
  assert.notEqual(crisisGuard("mar gaye yaar, itna homework de diya").level, "crisis");
});

// ISS-t-005c-c0-3 — confusable evasion: fullwidth (NFKC) and Cyrillic/Greek homoglyphs.
const CONFUSABLES: ReadonlyArray<readonly [string, string]> = [
  ["fullwidth 'kill myself'", "ｋｉｌｌ myself"],
  ["Cyrillic ka in 'kill myself'", "кill myself"],
  ["Cyrillic es in 'suicidal'", "suiсidal thoughts every day"],
  ["uppercase Cyrillic in 'KILL MYSELF'", "КILL MYЅELF"],
  ["Cyrillic ie in 'beats me'", "bеats mе"],
  ["Greek alpha in 'end it all'", "end it αll"],
  ["fullwidth letter-spaced 'beats me'", "ｂ ｅ ａ ｔ ｓ  ｍ ｅ"],
];

for (const [name, text] of CONFUSABLES) {
  test(`ISS-t-005c-c0-3 confusable: ${name} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis");
  });
}

test("ISS-t-005c-c0-3: NFKC folding leaves every Devanagari pattern matching", () => {
  for (const text of [
    "मैं मरना चाहता हूं",
    "मुझे आत्महत्या के विचार आ रहे हैं",
    "मैं खुद को खत्म करना चाहता हूं",
    "मैं जीना नहीं चाहती अब",
    "आत्म‍हत्या",
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  assert.equal(crisisGuard("मुझे बहुत टेंशन हो रही है").level, "concern");
});

// D-020 accepted residuals introduced by cycle 1's derived separator-free patterns: with every word
// boundary gone, adjacent ordinary words can form a pattern ("can't go online" -> "cantgoon...",
// "want to diet" -> "wanttodie..."). Documented expected flags, not suppressed — the recall-only
// trade D-020 accepted; T-012's classifier may annotate them "likely benign", never hide them.
const CYCLE1_ACCEPTED_RESIDUALS: ReadonlyArray<string> = [
  "I can't go online today, the wifi is down",
  "I want to diet before the trip",
  "mar jaunga hanste hanste yaar",
];

for (const text of CYCLE1_ACCEPTED_RESIDUALS) {
  test(`D-020 accepted residual (cycle 1 squeeze): ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis");
  });
}

// -------------------------------------------------------------------------------------------
// T-033 / ISS-t-005c-c0-1 (high): indirect suicidal-ideation WARNING SIGNS. The five checker
// repros (formerly `known_gap` rows owned by T-012) plus the named families — burden / "better
// off without me", "won't be around", "no reason to live", "want to disappear / sleep forever",
// giving things away, saying goodbye, wishing to be dead — in English, romanised Hinglish and
// Devanagari. All at level 'crisis' (see the classification table in crisis.ts). Recall-only
// (D-020): false alarms these patterns open are pinned below as documented expected flags.
// -------------------------------------------------------------------------------------------

const T033_WARNING_SIGNS: ReadonlyArray<readonly [string, string]> = [
  // The five ISS-t-005c-c0-1 repros, verbatim.
  ["en", "everyone would be better off without me"],
  ["en", "I won't be around next month, just so you know"],
  ["en", "I won't be here much longer, honestly"],
  ["en", "I've been giving away all my things lately"],
  ["en", "I just wanted to say goodbye to you now"],
  // English — burden / better off without me
  ["en", "I feel like such a burden to my family"],
  ["en", "I'm just a burden to everyone"],
  ["en", "I'm so tired of being a burden"],
  ["en", "they'd all be happier without me"],
  ["en", "the world is better without me in it"],
  ["en", "no one would miss me if I left"],
  ["en", "nobody would even notice if I was gone"],
  ["en", "would anyone care if I died"],
  // English — won't be around
  ["en", "I'm not going to be around much longer"],
  ["en", "soon you won't have to deal with me anymore"],
  ["en", "don't worry, I'll be gone soon"],
  // English — no reason to live
  ["en", "there's no reason to live anymore"],
  ["en", "I've lost my will to live"],
  ["en", "I have nothing left to live for"],
  ["en", "life isn't worth living"],
  ["en", "I can't live like this anymore"],
  ["en", "I don't want to be alive anymore"],
  ["en", "I dont wanna exist"],
  // English — disappear / sleep forever / wish I was dead
  ["en", "I just want to disappear"],
  ["en", "sometimes I wanna vanish and never come back"],
  ["en", "I want to sleep forever"],
  ["en", "I wish I could sleep forever"],
  ["en", "I want to go to sleep and never wake up"],
  ["en", "I hope I don't wake up tomorrow"],
  ["en", "I wish I was dead"],
  ["en", "I wish I'd never been born"],
  ["en", "I wish I didn't exist"],
  // English — giving things away / saying goodbye
  ["en", "I gave away my stuff to my cousins this week"],
  ["en", "I'm giving my things away, I won't need them"],
  ["en", "this is goodbye, thanks for trying"],
  ["en", "consider this my final goodbye"],
  ["en", "goodbye forever"],
  ["en", "you won't hear from me again after tonight"],
  ["en", "this is the last time you'll hear from me"],
  // English — explicit / method language missing from the ported base
  ["en", "I've been thinking about taking my own life"],
  ["en", "I'd rather be dead than go back there"],
  ["en", "I thought about hanging myself"],
  ["en", "I want to unalive myself"],
  ["en", "I keep thinking of jumping off the roof"],
  // Hinglish (romanised)
  ["hi-Latn", "main sab pe bojh hoon"],
  ["hi-Latn", "main sabke liye bojh ban gaya hoon"],
  ["hi-Latn", "mere bina sab khush rahenge"],
  ["hi-Latn", "main nahi rahungi zyada time"],
  ["hi-Latn", "main zyada din nahi rahunga"],
  ["hi-Latn", "jeene ki koi wajah nahi hai"],
  ["hi-Latn", "jeene ka koi matlab nahi"],
  ["hi-Latn", "kahin gayab ho jana chahta hoon"],
  ["hi-Latn", "hamesha ke liye so jaun bas"],
  ["hi-Latn", "kaash main paida hi na hoti"],
  ["hi-Latn", "kaash main mar jaun"],
  ["hi-Latn", "apni saari cheezein doston ko de di maine"],
  ["hi-Latn", "sabko alvida, ab nahi milenge"],
  ["hi-Latn", "aakhri baar baat kar raha hoon tumse"],
  // Devanagari
  ["hi-Deva", "मैं सब पर बोझ हूं"],
  ["hi-Deva", "मेरे बिना सब खुश रहेंगे"],
  ["hi-Deva", "मैं अब ज्यादा दिन नहीं रहूंगा"],
  ["hi-Deva", "जीने की कोई वजह नहीं है"],
  ["hi-Deva", "जीने का मन नहीं करता"],
  ["hi-Deva", "बस गायब हो जाना चाहता हूं"],
  ["hi-Deva", "हमेशा के लिए सो जाना चाहती हूं"],
  ["hi-Deva", "काश मैं पैदा ही न होता"],
  ["hi-Deva", "मैंने अपनी सारी चीजें दोस्तों को दे दी हैं"],
  ["hi-Deva", "सबको अलविदा, अब नहीं मिलेंगे"],
  ["hi-Deva", "आखिरी बार बात कर रहा हूं"],
];

for (const [lang, text] of T033_WARNING_SIGNS) {
  test(`T-033 warning sign (${lang}): ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis", JSON.stringify(text));
  });
}

// Nukta spellings (ज़, ख़, ग़, फ़): a student may type a precomposed nukta letter (U+0958..U+095F) or
// the base letter + combining nukta U+093C. NFKC always leaves them decomposed, so the patterns carry
// an optional decomposed nukta — both spellings, and the nukta-less one, must flag.
test("T-033: Devanagari nukta spellings (precomposed, decomposed, none) all flag crisis", () => {
  for (const text of [
    "मैंने अपनी सारी चीज़ें दे दीं", // precomposed ज़ (U+095B)
    "मैंने अपनी सारी चीज़ें दे दीं", // ज + combining nukta
    "मैंने अपनी सारी चीजें दे दीं", // no nukta
    "बस ग़ायब हो जाना चाहता हूं", // precomposed ग़ (U+095A)
    "मेरे बिना सब ख़ुश रहेंगे", // precomposed ख़ (U+0959)
    "आख़िरी बार बात कर रही हूं", // precomposed ख़ in आख़िरी
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
});

// A pattern literal that NFKC would rewrite (a precomposed nukta letter, a fullwidth form) can never
// match, because the input is NFKC-normalised before matching. Pin every pattern source as NFKC-stable.
test("T-033: every pattern source is NFKC-stable (no literal the normaliser would rewrite)", () => {
  const unstable = [...CRISIS_PATTERNS, ...CONCERN_PATTERNS]
    .map((pattern) => pattern.source)
    .filter((source) => source !== source.normalize("NFKC"));
  assert.deepEqual(unstable, []);
});

// Hard negatives: idioms and near-misses of the new families that must stay 'none' (nothing in
// them asserts a warning sign, and no pattern or derived squeezed twin collides with them).
const T033_HARD_NEGATIVES: ReadonlyArray<string> = [
  "I'm dying to go to Canada for my masters",
  "this exam is killing me",
  "mar gaya yaar hasi se",
  "hasi se pet dard ho gaya, mar gaye hum toh",
  "My phone battery is dying, can we continue later?",
  "The traffic near the coaching centre is killing me",
  "I'm going to miss my friends a lot when I leave",
  "Bye! See you in the next session",
  "The rash should disappear in a week, the doctor said",
  "No one will notice the typo, don't worry",
  "sab log mere bina movie dekhne chale gaye",
  "उसने अपनी किताबें जूनियर्स को दे दीं",
  "मैं कल कॉलेज नहीं आऊंगा",
  "Is there any scholarship for students who want to live on campus?",
];

for (const text of T033_HARD_NEGATIVES) {
  test(`T-033 hard negative stays 'none': ${JSON.stringify(text)}`, () => {
    assert.equal(crisisGuard(text).level, "none", JSON.stringify(text));
  });
}

// D-020 accepted residuals opened by the T-033 patterns: ordinary study-abroad phrasing that shares
// a warning sign's words. Documented expected flags, measured in the eval set's false-positive line
// (qa/evals/crisis-eval.jsonl, category accepted_residual), never suppressed. T-012's classifier may
// annotate them "likely benign"; it may never hide them.
const T033_ACCEPTED_RESIDUALS: ReadonlyArray<string> = [
  "I won't be around next week, it's my cousin's wedding in Jaipur",
  "I want to say goodbye to my friends before I fly to Toronto",
  "I don't want to live in a hostel in first year",
  "I feel like a huge burden has been lifted off my shoulders",
  "The seats will be gone by March, so apply early", // squeezed: "seatswillbegone" contains "illbegone"
  "My wifi died in the middle of the mock test", // squeezed: "wifidied" contains "ifidied"
];

for (const text of T033_ACCEPTED_RESIDUALS) {
  test(`D-020 accepted residual (T-033 warning-sign patterns): ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis", JSON.stringify(text));
  });
}

// -------------------------------------------------------------------------------------------
// T-033 — linear-time matching. Every pattern is star-height 1: no `+`/`*`-quantified group and no
// `{n,m}` quantifier, so a backtracking engine does bounded work per start position (the plain view
// has single spaces only, and the squeezed twins have no separators at all). Checked statically, then
// measured on long adversarial input built from every pattern's own near-miss prefixes.
// -------------------------------------------------------------------------------------------

test("T-033: no pattern has a quantified group or a {n,m} quantifier (star height 1)", () => {
  const offenders = [...CRISIS_PATTERNS, ...CONCERN_PATTERNS]
    .map((pattern) => pattern.source)
    .filter((source) => /\)[+*{]/.test(source) || /(^|[^\\])\{/.test(source));
  assert.deepEqual(offenders, []);
});

/** Near-miss prefixes of every pattern's examples (last grapheme dropped), plus long single-letter runs. */
function adversarialInput(targetLength: number): string {
  const pieces: string[] = [];
  for (const pattern of [...CRISIS_PATTERNS, ...CONCERN_PATTERNS]) {
    for (const example of expandPattern(pattern.source, 4)) {
      const parts = graphemes(example.replace(/ /g, "\u0001"));
      pieces.push(parts.slice(0, -1).join("").replace(/\u0001/g, " "));
    }
  }
  pieces.push("a".repeat(200), "ja" + "a".repeat(200), "man" + "n".repeat(200), "wish i ".repeat(20));
  const unit = pieces.join(" ");
  let out = "";
  while (out.length < targetLength) out += unit + " ";
  return out.slice(0, targetLength);
}

test("T-033: long adversarial input (50k chars of near-miss prefixes) runs well under budget", () => {
  const input = adversarialInput(50000);
  const elapsed = bestOf(input, 3);
  assert.ok(elapsed < 3000, `50k-char adversarial input took ${elapsed.toFixed(2)}ms (budget 3000ms)`);
});

test("T-033: doubling the adversarial input roughly doubles the time (linear, not quadratic)", () => {
  const smallMs = bestOf(adversarialInput(50000), 5);
  const largeMs = bestOf(adversarialInput(100000), 5);
  const ratio = largeMs / Math.max(smallMs, 0.01);
  console.log(`adversarial timing: 50k=${smallMs.toFixed(2)}ms, 100k=${largeMs.toFixed(2)}ms, ratio=${ratio.toFixed(2)}`);
  assert.ok(ratio < 3.5, `expected roughly linear scaling (ratio < 3.5), got ${ratio.toFixed(2)}`);
});

test("T-033: zalgo-stacked warning-sign phrase still flags, and 100k chars of it stays linear", () => {
  const zalgoPhrase = [..."better off without me"].map((ch) => (ch === " " ? ch : ch + "̶́")).join("");
  assert.equal(crisisGuard(zalgoPhrase).level, "crisis");
  const long = (zalgoPhrase + " ").repeat(Math.ceil(100000 / (zalgoPhrase.length + 1)));
  const elapsed = bestOf(long, 3);
  assert.ok(elapsed < 3000, `100k-char zalgo warning-sign input took ${elapsed.toFixed(2)}ms (budget 3000ms)`);
});

// T-033 (found by the linear-time probe, pre-existing on main): a run of combining marks whose
// canonical combining classes ALTERNATE (Devanagari nukta ccc 7 / virama ccc 9, or Latin acute 230 /
// grave-below 220) makes String.prototype.normalize reorder them with a quadratic sort — measured on
// the base guard: 25k chars 203ms, 50k 786ms, 100k 3187ms. The single-mark zalgo test above never
// hit it because one repeated mark needs no reordering.
function alternatingMarks(length: number, pair: string): string {
  return "क" + pair.repeat(Math.floor((length - 1) / pair.length));
}

test("T-033: alternating-class combining-mark runs (Devanagari and Latin) stay linear", () => {
  for (const [label, base, pair] of [
    ["deva nukta/virama", "क", "़्"],
    ["deva virama/nukta", "क", "़्"],
    ["latin acute/grave-below", "e", "̖́"],
  ] as const) {
    const make = (n: number): string => base + alternatingMarks(n, pair).slice(1);
    const smallMs = bestOf(make(50000), 3);
    const largeMs = bestOf(make(100000), 3);
    const ratio = largeMs / Math.max(smallMs, 0.01);
    console.log(`${label}: 50k=${smallMs.toFixed(2)}ms, 100k=${largeMs.toFixed(2)}ms, ratio=${ratio.toFixed(2)}`);
    assert.ok(largeMs < 3000, `${label}: 100k chars took ${largeMs.toFixed(2)}ms (budget 3000ms)`);
    assert.ok(ratio < 3.5 || largeMs < 50, `${label}: expected roughly linear scaling, got ratio ${ratio.toFixed(2)}`);
  }
});

test("T-033: a signal next to a huge combining-mark run still flags", () => {
  assert.equal(crisisGuard("मैं आत्महत्या" + "़्".repeat(20000)).level, "crisis");
  assert.equal(crisisGuard("k" + "̖́".repeat(20000) + "ill myself").level, "crisis");
});

// -------------------------------------------------------------------------------------------
// T-033 / ISS-t-005c-rev-2 (medium): squeezePatternSource silently mis-derived a bounded quantifier
// on a separator (`hi\s{2,4}bye` -> `hi{2,4}bye`, which misses "hibye"), and the compile-only test
// passed vacuously. It now throws on any `{` quantifier outside a character class (mirroring the
// test's own expandPattern), and a lazy `?` after a separator quantifier is consumed with it.
// -------------------------------------------------------------------------------------------

test("ISS-t-005c-rev-2: squeezePatternSource throws on an unhandled {n,m} quantifier", () => {
  assert.throws(() => squeezePatternSource(String.raw`\bhi\s{2,4}bye\b`), /\{n,m\}/);
  assert.throws(() => squeezePatternSource("hi {2}bye"), /\{n,m\}/);
  assert.throws(() => squeezePatternSource("ki{2}ll"), /\{n,m\}/);
});

test("ISS-t-005c-rev-2: a brace inside a class or escaped is a literal, not a quantifier", () => {
  assert.equal(squeezePatternSource("a[{]b"), "a[{]b");
  assert.equal(squeezePatternSource(String.raw`a\{b`), String.raw`a\{b`);
});

test("ISS-t-005c-rev-2: a lazy separator quantifier is dropped whole, never re-attached to a letter", () => {
  assert.equal(squeezePatternSource(String.raw`a\s+?b`), "ab");
  assert.equal(squeezePatternSource(String.raw`a\s*?b`), "ab");
  assert.equal(squeezePatternSource("a +?b"), "ab");
  assert.ok(new RegExp(squeezePatternSource(String.raw`kill\s+?myself`)).test("killmyself"));
});

// -------------------------------------------------------------------------------------------
// P1 W3 / D-093 2A (Umesh, 2026-10-17): every proposed Hindi/Hinglish crisis phrase, "kms" included.
// Each phrase is reached by a real student sentence; spaced, doubled, punctuated, Devanagari and
// leet forms are generated from it. The generated-pattern tests above already cover every NEW entry
// of CRISIS_PATTERNS (spaced forms, squeezed twin, NFKC stability, star height).
// -------------------------------------------------------------------------------------------

const D093_PHRASES: ReadonlyArray<string> = [
  "mujhe marna hai",
  "bas ab mujhe marna hi hai",
  "mai khatam ho jana chahta hu",
  "main khatam ho jaunga ek din",
  "mujhe marne ki iccha ho rahi hai",
  "ab jeena nahi hai mujhe",
  "mujhe jaan dena hai",
  "मुझे मरना है",
  "मैं खत्म हो जाना चाहता हूँ",
  "मैं खत्म हो जाऊंगा",
  "मुझे जीना नहीं है",
  "मेरे मन में मरने की इच्छा है",
  "मुझे जान देना है",
  "I don't see the point anymore",
  "i dont see the point anymore",
  "I do not see any point anymore",
  "I see no point in living",
  "what's the point of living",
  "what is the point anymore",
  "I have been thinking about ending things",
  "i am ending things tonight",
  "I'm planning to end everything",
  "i will end it tonight",
  "kms",
  "I want to kms",
  "ugh just kms already",
  "KMS",
  "k m s",
  "k.m.s",
  "i w4nt to d1e",
  "su1c1de is all i think about",
  "i want to k!ll myself",
  "i w@nt to d!e",
  // The leet-folded second view is the ONLY path for these: the plain view has "w4nt" / "7o" beside an intact "die".
  "i w4nt to die",
  "i wan7 to die",
  "1 w4nt to die",
];

for (const phrase of D093_PHRASES) {
  test(`D-093 2A: a student who writes ${JSON.stringify(phrase)} is level 'crisis'`, () => {
    assert.equal(crisisGuard(phrase).level, "crisis", phrase);
    assert.equal(routeBeforeGeneration(phrase).route, "escalate", phrase);
  });
}

test("D-093 2A: a typographic apostrophe (phone keyboards) does not hide an English phrase", () => {
  assert.equal(crisisGuard("I don’t see the point anymore").level, "crisis");
  assert.equal(crisisGuard("I can’t go on").level, "crisis");
});

test("D-093 2A: 'kms' is flagged as a letter-spaced, punctuated, cased and sentence-embedded token", () => {
  for (const text of ["K M S", "k-m-s", "kms.", "kms!!!", "ok i might kms tonight", "mai kms kar lunga", "KMS 😔"]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
});

const D093_NOT_CRISIS: ReadonlyArray<string> = [
  "the hostel is about 50 kms from the airport",
  "the campus is a few kms away from the station",
  "it is 12 kms from the city centre",
  "Do I need to work MS Excel skills for the MS in CS?",
  "I think MS in data science is better than MBA",
  "I don't see the point of this course",
  "what's the point of the IELTS if I have a degree from an English medium school",
  "the semester is ending, things are busy",
  "ending things well matters for a clean visa file",
  "I will end the call at five today",
  "I want to kill this exam",
  "was my score 7.5 or 6.5 in IELTS",
  "I got 10th rank and 3rd year marks of 85%",
];
for (const text of D093_NOT_CRISIS) {
  test(`D-093 2A: ${JSON.stringify(text)} stays 'none' (no false alarm from the new phrases)`, () => {
    assert.equal(crisisGuard(text).level, "none", text);
  });
}

// P1 W3 eng3 fix cycle 1 (checker FAIL ISS-p1eng3-1, review W2): "kms" is a unit of distance ONLY right after a number or a plain
// quantity word. A distance word after it ("kms from the stress", "kms away from here") or a vague word before it ("about", "almost")
// must NOT hide a crisis statement.
test("D-093 2A repair: 'kms' next to about/almost/from/away words is still a crisis statement", () => {
  for (const text of [
    "i keep thinking about kms",
    "thinking about kms every day",
    "i was almost kms tonight",
    "i wanna kms from the stress",
    "kms from this exam pressure",
    "i want to kms away from here",
    "kms away from here",
    "i am around kms levels of tired",
    "some days i just want to kms",
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
    assert.equal(routeBeforeGeneration(text).route, "escalate", text);
  }
});

test("D-093 2A repair: 'kms' as a distance after a number or a quantity word stays 'none'", () => {
  for (const text of [
    "50 kms",
    "a few kms from campus",
    "the flat is several kms from the university",
    "thousands of kms from home",
    "it is a couple of kms away",
    "the airport is 12 kms from the city centre",
    "I want to kill this exam",
  ]) {
    assert.equal(crisisGuard(text).level, "none", text);
  }
});

test("D-093 2A repair: elongated 'kms' spellings are flagged (ISS-p1eng3-3)", () => {
  for (const text of ["kmss", "wanna kmsss", "KMSS!!"]) assert.equal(crisisGuard(text).level, "crisis", text);
  // A distance with an elongated unit after a number is still a distance.
  assert.equal(crisisGuard("it is 50 kmss from here").level, "none");
});

test("D-093 2A repair: Hinglish spelling variants of 'mujhe marna hai' are flagged (ISS-p1eng3-3)", () => {
  for (const text of ["mujhe marna h", "mujhe marnaa hai", "marnaa hi hai", "mujhe marna h ab"]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
});

test("D-093 2A repair: '1' read as 'l' in leet spellings ('ki11 myself') is flagged (review I1)", () => {
  for (const text of ["ki11 myself", "kil1 myself", "i want to ki11 myself", "k1ll myself"]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  // The existing 1 -> i reading and bare numbers are unchanged.
  assert.equal(crisisGuard("su1c1de").level, "crisis");
  assert.equal(crisisGuard("I scored 11 out of 20 in 2026").level, "none");
});

// Review W1: "I don't see the point in continuing/going on with MBA" is study talk; the self-referential life form
// ("with my life", a bare "going on") still fires.
test("D-093 2A repair: 'see the point in going on / continuing' fires only for the life form or a bare statement (review W1)", () => {
  for (const text of [
    "I don't see the point in going on",
    "I don't see the point in continuing with my life",
    "i dont see the point in going on anymore",
    "I can't see the point in continuing, I am so tired",
    "I see no point in going on",
    "i see no point in continuing with life",
    "I do not see any point in going on because nothing works",
    "I don't see the point in going on. what should I do",
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  for (const text of [
    "I don't see the point in continuing with MBA",
    "I don't see the point in going on with this course",
    "I don't see the point in continuing my IELTS prep",
    "I don't see the point in continuing with the course",
    "I see no point in continuing with an MS in CS",
  ]) {
    assert.equal(crisisGuard(text).level, "none", text);
  }
});

// Review cycle 1 (Block): "see the point in going on / continuing" fires by default; only a study object right after it is study talk.
test("D-093 2A repair: 'see the point in going on / continuing' fires unless a study object follows (review c1 Block)", () => {
  for (const text of [
    "I don't see the point in going on at all",
    "I don't see the point in going on without her",
    "I don't see the point in going on feeling like this",
    "I don't see the point in going on, nothing matters",
    "I don't see the point in going on everything is pointless",
    "I don't see the point in going on today",
    "I can't see the point in going on here",
    "I don't see the point in going on in this world",
    "I don't see the point in going on. Please help",
    "I don't see the point in going on my family would be better off",
    "i dont see the point in going on lol",
    "I don't see the point in going on with things",
    "I don't see the point in going on when nobody cares",
    "I don't see the point in continuing to live",
    "I don't see the point in going on with it",
    "I don't see the point in continuing with everything",
    "I don't see the point in going on like this",
    "I don't see the point in going on with my life as a student",
    "I don't see the point in continuing my existence",
    "I don't see the point in continuing. My IELTS prep is useless anyway",
    "I don't see the point in continuing with college life",
    "I don't see the point in continuing with it my exams are over",
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  // Study talk stays none (the five W1 cases above are unchanged).
  for (const text of ["I don't see the point in continuing my GRE coaching", "I see no point in going on to a masters degree", "I don't see the point in going online for classes", "I see no point in continuing coaching classes"]) {
    assert.equal(crisisGuard(text).level, "none", text);
  }
});

test("D-093 2A repair: a trailing '1' after 'kill' ('kill1 myself') is flagged (review c1 Low)", () => {
  for (const text of ["kill1 myself", "i want to kill1 myself", "kil11 myself"]) assert.equal(crisisGuard(text).level, "crisis", text);
  assert.equal(crisisGuard("I will fill11 forms").level, "none");
});

// eng3 fix cycle 3 (extra cycle, D-098), cycle-2 FAIL: the leet fold was quadratic on a long run of look-alike characters.
test("D-093 2A cycle 3: the leet fold is linear on long runs of look-alike characters (cycle-2 FAIL)", () => {
  for (const [label, text] of [
    ["1 x100000", "1".repeat(100000)],
    ["5 x100000", "5".repeat(100000)],
    ["kill + 1 x100000", "kill" + "1".repeat(100000)],
    ["! x100000", "!".repeat(100000)],
    ["@$ x50000", "@$".repeat(50000)],
    ["1 x100000 then a stop", "1".repeat(100000) + "."],
  ] as const) {
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      crisisGuard(text);
      best = Math.min(best, performance.now() - started);
    }
    assert.ok(best < 200, `${label} took ${best.toFixed(0)} ms`);
  }
  // Recall on the folded forms is unchanged.
  assert.equal(crisisGuard("kill1 myself").level, "crisis");
  assert.equal(crisisGuard("i w4nt to d1e").level, "crisis");
});

// D-098 item 2: a study object followed, in the same clause, by distress words is still a crisis statement (D-020 recall).
test("D-093 2A cycle 3: 'see the point in continuing <study object>' fires when distress follows in the clause (D-098)", () => {
  for (const text of [
    "i dont see the point in continuing college i hate myself",
    "I dont see the point in continuing with my studies, I hate myself",
    "I don't see the point in continuing college, I'm worthless",
    "I don't see the point in continuing the course because everything hurts",
    "I don't see the point in continuing the course of my life",
    "I don't see the point in continuing my IELTS prep i feel hopeless",
    "I don't see the point in going on with this course nobody cares about me",
    "I don't see the point in continuing coaching classes I am a burden to everyone",
    "I don't see the point in continuing MBA i feel so empty",
    "I don't see the point in continuing with MBA there is so much pain",
    "i dont see the point in going onwards",
    "I don't see the point in going onwards.",
    "I see no point in going onward",
  ]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  // The W1 study-talk cases stay none.
  for (const text of [
    "I don't see the point in continuing with MBA",
    "I don't see the point in going on with this course",
    "I don't see the point in continuing coaching classes",
    "I don't see the point in going online for classes",
    "I don't see the point in continuing my GRE coaching because the fees are too high",
    "I see no point in continuing with an MS in CS",
  ]) {
    assert.equal(crisisGuard(text).level, "none", text);
  }
});

test("D-093 2A cycle 3: 'see the point in continuing' scanning is linear on a long repeated phrase", () => {
  for (const unit of ["i dont see the point in continuing mba ", "i dont see the point in continuing ", "i dont see the point in going on with this course "]) {
    const text = unit.repeat(Math.ceil(100000 / unit.length));
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      crisisGuard(text);
      best = Math.min(best, performance.now() - started);
    }
    assert.ok(best < 120, `${JSON.stringify(unit)} x repeated took ${best.toFixed(0)} ms`);
  }
  // More than a handful of study-suppressed repeats is not plain study talk: it is flagged (fail closed, D-020).
  assert.equal(crisisGuard("i dont see the point in continuing mba ".repeat(30)).level, "crisis");
  assert.equal(crisisGuard("i dont see the point in continuing mba ".repeat(3)).level, "none");
});

test("D-093 2A: every new Hinglish/English phrase has its spaced / doubled / punctuated evasion forms flagged", () => {
  const failures: string[] = [];
  // Not generated: leet phrases (letter-spacing a leet phrase is a second evasion on top of the first) and "kms" sentences (a
  // whole letter-spaced sentence merges into one run, and "kms" has no squeezed twin by design; "K M S" / "k-m-s" are pinned above).
  for (const phrase of D093_PHRASES.filter((p) => !/kms/i.test(p) && !/^k[ .]m[ .]s$/i.test(p) && !/[0-9@!]/.test(p))) {
    for (const form of [letterSpaced(phrase), letterSpacedFlat(phrase), punctuationSpaced(phrase), doubleSpaced(phrase)]) {
      if (crisisGuard(form).level !== "crisis") failures.push(`${JSON.stringify(form)} <- ${phrase}`);
    }
  }
  assert.deepEqual(failures, []);
});

// -------------------------------------------------------------------------------------------
// P1 W3 / D-093 3A: the soft stress tier. Stress talk is NOT a crisis or concern flag.
// -------------------------------------------------------------------------------------------

const STRESS_PHRASES: ReadonlyArray<string> = [
  "pressure bahut hai",
  "Padhai ka pressure bohot hai yaar",
  "bahut stress hai",
  "mujhe bahut stress ho raha hai",
  "bahut pressure hai ghar se",
  "I am so stressed",
  "I'm really stressed about the visa",
  "can't handle the pressure",
  "I can’t handle this pressure of boards",
  "there is too much pressure on me",
  "I'm under so much pressure",
  "मुझे बहुत स्ट्रेस है",
  "बहुत प्रेशर है",
];
for (const text of STRESS_PHRASES) {
  test(`D-093 3A: ${JSON.stringify(text)} is a stress signal and not a crisis or concern flag`, () => {
    assert.equal(stressSignal(text), true, text);
    assert.equal(crisisGuard(text).level, "none", text);
  });
}

const NOT_STRESS: ReadonlyArray<string> = [
  "What is the tuition at German public universities?",
  "how stressful is the visa interview usually",
  "tell me about the pressure cooker rules in the hostel",
  "I want to study computer science in Canada.",
  "",
  "   ",
];
for (const text of NOT_STRESS) {
  test(`D-093 3A: ${JSON.stringify(text)} is not a stress signal`, () => {
    assert.equal(stressSignal(text), false, text);
  });
}

test("D-093 3A: the stress patterns are linear (no quantified group, no {n,m}) and NFKC-stable", () => {
  for (const { source } of STRESS_PATTERNS) {
    assert.ok(!/\)[+*{]/.test(source) && !/(^|[^\\])\{/.test(source), source);
    assert.equal(source, source.normalize("NFKC"), source);
  }
  const t0 = performance.now();
  stressSignal("pressure ".repeat(20000));
  assert.ok(performance.now() - t0 < 3000);
});

// -------------------------------------------------------------------------------------------
// ISS-340 (D-103) - Devanagari-script Hinglish. Gemini Live transcribes Hindi speech in Devanagari, so
// every Latin Hinglish crisis/concern phrase needs its Devanagari counterpart at the SAME level, in the
// spelling variants a transcript or a phone keyboard produces (nukta / no nukta, anusvara vs chandrabindu
// vs none, short vs long u, a dropped bindu on "nahi" / "main", khatam vs khatm, mixed Devanagari + Latin).
// -------------------------------------------------------------------------------------------

const A10_MANIFEST = fileURLToPath(new URL("../../../qa/evals/p1/live-audio/manifest.json", import.meta.url));

test("ISS-340: every A10 clip's spoken text (ttsInput when set, else text) reaches 'crisis' - all 20, and the Latin text too", () => {
  const manifest = JSON.parse(readFileSync(A10_MANIFEST, "utf-8")) as {
    clips: { id: string; text: string; ttsInput?: string }[];
  };
  assert.equal(manifest.clips.length, 20);
  const misses: string[] = [];
  for (const clip of manifest.clips) {
    for (const spoken of new Set([clip.ttsInput ?? clip.text, clip.text])) {
      const level = crisisGuard(spoken).level;
      if (level !== "crisis") misses.push(`${clip.id} ${JSON.stringify(spoken)} -> ${level}`);
    }
  }
  assert.deepEqual(misses, []);
  assert.ok(manifest.clips.filter((c) => c.ttsInput !== undefined).length >= 7, "the 7 Hinglish clips carry a Devanagari ttsInput");
});

const ISS340_CRISIS: ReadonlyArray<readonly [string, string]> = [
  // "sab khatam kar dunga" (+ spelling variants of khatam and of the "dunga" verb)
  ["sab khatam kar dunga", "सब खत्म कर दूंगा, अब और नहीं सह सकता"],
  ["sab khatam kar dunga", "सब खत्म कर दूँगा"],
  ["sab khatam kar dunga", "सब खत्म कर दुंगा"],
  ["sab khatam kar dunga", "सब खत्म कर दूगा"],
  ["sab khatam kar dungi", "सब खत्म कर दूंगी"],
  ["sab khatam kar dungi", "सब खत्म कर दुँगी"],
  ["sab khatam (khatam -> khatm)", "सब खतम कर दूंगा"],
  ["sab khatam (nukta precomposed U+0959)", "सब ख़त्म कर दूँगा"],
  ["sab khatam (nukta decomposed)", "सब ख़त्म कर दूँगा"],
  ["sab khatam (ZWJ inside the conjunct)", "सब खत्‍म कर दूंगा"],
  ["sab khatam kar lunga", "सब खत्म कर लूंगा"],
  ["mixed: sab + Devanagari", "sab खत्म kar dunga"],
  ["mixed: Devanagari sab + Latin khatam", "सब khatam कर दूंगा"],
  ["mixed: Devanagari verb at the end", "सब खत्म कर dunga"],
  ["mixed: Latin verb at the end", "sab खत्म कर dungi"],
  // "sab kuch khatam"
  ["sab kuch khatam", "सब कुछ खत्म"],
  ["sab kuch khatam", "सब कुछ ख़त्म हो गया"],
  ["sab kuch khatam", "सब कुछ खतम"],
  ["mixed: sab kuch khatam", "सब कुछ khatam"],
  // "khud ko khatam / maar"
  ["khud ko khatam (nukta)", "ख़ुद को खत्म करना चाहता हूं"],
  ["khud ko khatam (khatm)", "खुद को खतम कर लूंगा"],
  ["khud ko maar", "खुद को मार दूंगा"],
  ["khud ko maarna", "खुद को मारना चाहता हूं"],
  ["khud ko marne", "खुद को मरने दूंगा"],
  ["mixed: khud ko khatam", "खुद को khatam कर लूंगा"],
  ["khatam kar lunga khud ko / apne aap ko / apni jaan", "खत्म कर लूंगा अपने आप को"],
  ["khatam kar lunga khud ko / apne aap ko / apni jaan", "खत्म कर लूँगा अपनी जान"],
  ["khatam kar lunga khud ko", "खतम कर लूंगा खुद को"],
  // "zindagi khatam / bekaar"
  ["zindagi khatam", "ज़िंदगी खत्म"],
  ["zindagi khatam", "जिंदगी खत्म हो गई"],
  ["zindagi bekaar", "ज़िन्दगी बेकार है"],
  ["zindagi bekaar", "जिन्दगी बेकार"],
  ["zindagi bekaar", "जिँदगी बेकार है"],
  ["mixed: zindagi bekaar", "zindagi बेकार है"],
  ["mixed: zindagi khatam", "ज़िंदगी khatam"],
  // "marna / maut chahta"
  ["maut chahiye", "मौत चाहिए"],
  ["maut chahta", "मुझे मौत चाहिए"],
  ["marna chahiye", "मरना चाहिए"],
  ["marna chahte", "हम मरना चाहते हैं"],
  ["mixed: marna chahta", "मैं marna चाहता हूं"],
  ["mixed: marna chahta", "मैं मरना chahta हूं"],
  // "marne ka mann / iccha / khayal / khwahish"
  ["marne ka mann", "मरने का मन कर रहा है"],
  ["marne ka mann (long n)", "मरने का मन्न है"],
  ["marne ki khwahish", "मरने की ख्वाहिश"],
  ["marne ka khayal", "मरने का ख़याल आता है"],
  ["marne ka khayal", "मरने का खयाल"],
  ["mixed: marne ka mann", "marne का मन कर रहा है"],
  ["mixed: marne ka mann", "मरने ka mann"],
  // "jeena nahi chahta / hai" (nahi without its bindu, chandrabindu, plural)
  ["jeena nahi chahta (no bindu)", "जीना नही चाहता"],
  ["jeena nahi chahta (chandrabindu)", "जीना नहीँ चाहती"],
  ["jeena nahi chahte", "जीना नहीं चाहते"],
  ["jeena nahi hai (no bindu)", "जीना नही है"],
  ["mixed: jeena nahi chahta", "jeena नहीं चाहता"],
  ["mixed: jeena nahi chahta", "जीना nahi चाहता हूं"],
  // "jeene ka mann / matlab / point / reason nahi"
  ["jeene ka mann nahi (no bindu)", "जीने का मन नही है"],
  ["jeene ki wajah nahi (nukta)", "जीने की कोई वज़ह नही"],
  ["jeene ka matlab nahi", "जीने का कोई मतलब नहीं"],
  ["jeene ka reason nahi", "जीने का कोई रीज़न नहीं"],
  ["jeene ka point nahi", "जीने का कोई पॉइंट नहीं"],
  // "mar jaunga / jaana hai"
  ["mar jaunga (chandrabindu)", "मर जाऊँगा"],
  ["mar jaunga (short u)", "मर जाउंगा"],
  ["mar jaungi (short u, chandrabindu)", "मर जाउँगी"],
  ["mar jaana hai", "मर जाना है"],
  ["mar jaana chahta", "मर जाना चाहता हूं"],
  ["mixed: mar jaunga", "मर jaunga"],
  ["mixed: mar jaunga", "mar जाऊंगा"],
  // "jaan de dunga / le lunga / dena hai"
  ["jaan de dunga", "जान दे दूंगा"],
  ["jaan de dunga (short u)", "जान दे दुंगा"],
  ["jaan de dungi (chandrabindu)", "जान दे दूँगी"],
  ["jaan le lunga", "जान ले लूंगा"],
  ["jaan le lunga (short u)", "जान ले लुँगा"],
  ["jaan dena hai", "जान देना है"],
  ["jaan dena chahti", "जान देना चाहती हूं"],
  ["mixed: jaan de dunga", "जान दे dunga"],
  ["mixed: jaan de dunga", "jaan दे दूंगा"],
  // "khatam ho jana / jaunga"
  ["khatam ho jaunga", "खत्म हो जाऊंगा"],
  ["khatam ho jaunga (khatm)", "खतम हो जाऊँगी"],
  ["khatam ho jana", "ख़त्म हो जाना चाहता हूं"],
  ["mixed: khatam ho jaunga", "खत्म हो jaunga"],
  // abuse: "mujhe maarta hai / mere saath peet..."
  ["mere saath peetai hoti hai", "मेरे साथ पिटाई होती है घर में"],
  ["mere saath peetai hoti hai (long ee)", "मेरे साथ पीटाई होती है"],
  ["mere saath marpeet", "मेरे साथ मारपीट होती है"],
  ["mere saath marpeet (hyphen)", "मेरे साथ मार-पीट होती है"],
  ["mujhe maarte hain", "मुझे मारते हैं घर में"],
  ["mujhe maarta hai", "मुझे मारता है मेरा सौतेला बाप"],
  ["mujhe peetta hai", "मुझे पीटता है"],
  ["mujhe peette hain", "मुझे पीटते हैं"],
  ["mujhe peeta gaya", "मुझे पीटा गया"],
  ["mujhko maarti hai", "मुझको मारती है मेरी सौतेली माँ"],
  ["meri pitai", "घर में मेरी पिटाई होती है"],
  ["mixed: mere saath peetai", "मेरे saath पिटाई होती है"],
  ["mixed: mujhe maarta", "mujhe मारता है"],
  // T-033 families: dropped bindu on "main", short u in the verb, nahi without bindu
  ["main nahi rahunga (no bindu on main)", "मै नहीं रहूंगा"],
  ["main nahi rahunga (nahi no bindu)", "मैं नही रहूँगा"],
  ["main nahi rahunga (short u)", "मैं नहीं रहुंगा"],
  ["main nahi bachunga (short u)", "मैं नही बचुंगा"],
  ["nahi bachunga (short u)", "अब नहीं बचुंगा"],
  ["din nahi rahunga (short u)", "ज्यादा दिन नहीं रहुंगा"],
  ["din na jiunga (short u)", "ज्यादा दिन ना जिउंगा"],
  ["kabhi nahi uthunga (short u)", "कभी नहीं उठुंगा"],
  ["kabhi nahi uthun (no bindu)", "कभी नही उठूंगा"],
  ["mere na rehne ke baad", "मेरे न रहने के बाद सब खुश रहेंगे"],
  ["mere na rehne se", "मेरे ना रहने से किसी को फर्क नहीं पड़ेगा"],
  ["cheezon ko de dunga", "अपनी सारी चीजों को दोस्तों को दे दूंगा"],
  ["goodbye (gudbye)", "सबको गुडबाय"],
  ["goodbye (good bye)", "आप सबको गुड बाय"],
  ["alvida zindagi", "अलविदा ज़िंदगी"],
  ["aakhri baar (akhri spelling)", "आखरी बार बात कर रहा हूं"],
  ["aakhri baar mil raha", "आख़िरी बार मिल रही हूं"],
  ["mixed: sabko alvida", "sabko अलविदा"],
];

for (const [meaning, text] of ISS340_CRISIS) {
  test(`ISS-340: Devanagari/mixed Hinglish "${meaning}" -> crisis: ${JSON.stringify(text)}`, () => {
    assert.equal(crisisGuard(text).level, "crisis", text);
    const routed = routeBeforeGeneration(text);
    assert.equal(routed.route, "escalate");
  });
}

// Spaced / punctuated evasion of the new Devanagari forms (the squeezed twin is derived per pattern).
for (const text of ["सब खत्म कर दूंगा", "मेरे साथ पिटाई होती है", "मरने का मन कर रहा है", "जान दे दूंगा"]) {
  test(`ISS-340: evasion forms of ${JSON.stringify(text)} stay crisis`, () => {
    const words = text.split(" ");
    const spaced = words.map((w) => (w.match(/\p{L}\p{M}*/gu) ?? []).join(" ")).join("  ");
    const dotted = words.map((w) => (w.match(/\p{L}\p{M}*/gu) ?? []).join(".")).join(" ");
    for (const form of [text.split(" ").join("  "), spaced, dotted, text.split(" ").join("\n"), `ok. ${text}. thanks`]) {
      assert.equal(crisisGuard(form).level, "crisis", form);
    }
  });
}

const ISS340_CONCERN: ReadonlyArray<readonly [string, string]> = [
  ["mann nahi lag raha", "मन नहीं लग रहा"],
  ["mann nahi lag raha (nahi no bindu)", "आजकल मन नही लग रहा है"],
  ["mann nahi lag rahi", "मन नहीं लग रही"],
  ["bahut tension (halant)", "बहुत टेन्शन है"],
  ["bahut tension (ai)", "बहुत टैंशन हो रही है"],
  ["bahut tension (anusvara)", "बहुत टेंशन है"],
  ["mixed: bahut tension", "बहुत tension है"],
  ["mixed: bahut tension", "bahut टेंशन है"],
  ["zindagi se thak gaya", "ज़िंदगी से थक गया हूं"],
  ["zindagi se thak gayi", "जिंदगी से थक गई"],
  ["zindagi se thak gayi", "ज़िन्दगी से थक गयी हूं"],
];

for (const [meaning, text] of ISS340_CONCERN) {
  test(`ISS-340: Devanagari/mixed Hinglish "${meaning}" -> concern: ${JSON.stringify(text)}`, () => {
    assert.equal(crisisGuard(text).level, "concern", text);
  });
}

// Benign Devanagari study-abroad talk must stay none: the new patterns must not fire on the bare word
// "khatam" or on a near-miss of a new family (a study noun, a market, a friend named Peter, a PT class).
const ISS340_NEGATIVES: ReadonlyArray<string> = [
  "मुझे कनाडा में पढ़ाई खत्म करनी है",
  "परीक्षा खत्म हो गई",
  "मेरी पढ़ाई खतम हो गई है",
  "सेमेस्टर खत्म होने के बाद मैं कनाडा जाऊंगा",
  "वीज़ा की प्रक्रिया खत्म हो गई",
  "आज की क्लास खत्म कर दूंगा",
  "मैं सारा काम खत्म कर दूंगा",
  "बैंक का काम खत्म कर लूंगा",
  "मुझे मार्केट जाना है",
  "मैं मार्केट जा रहा हूं",
  "मेरे साथ पीटर आ रहा है",
  "मेरे साथ पीटी की क्लास है",
  "मुझे पिटारा चाहिए",
  "मेरे साथ दोस्त रहता है",
  "ज़िंदगी में बहुत कुछ करना है",
  "ज़िंदगी बहुत खूबसूरत है",
  "मौत की सज़ा के बारे में पढ़ना चाहता हूं",
  "जीना सीखना चाहता हूं",
  "जीने का तरीका बदलना है",
  "मैं कल कॉलेज नहीं आऊंगा",
  "मैं नहीं आऊंगा",
  "आखरी बार वीज़ा के बारे में बात कर रहा हूं",
  "टेन्शन फ्री पढ़ाई कैसे करें",
  "मैं सब कुछ ठीक कर दूंगा",
  "उसने सारी चीज़ें सबको बांट दीं",
  "सबको नमस्ते",
  "मरने वालों की संख्या कितनी है",
  "मैं मैदान में खेलता हूं",
];

for (const text of ISS340_NEGATIVES) {
  test(`ISS-340 negative stays 'none': ${JSON.stringify(text)}`, () => {
    assert.equal(crisisGuard(text).level, "none", JSON.stringify(text));
  });
}

// D-020 parity: the Latin phrase already flags this study-adjacent sentence; its Devanagari counterpart flags too
// (recall over precision, never suppressed).
test("ISS-340 parity: 'ye sab khatam kar dunga' (Latin) and its Devanagari form are both crisis (accepted residual, D-020)", () => {
  assert.equal(crisisGuard("ye sab khatam kar dunga").level, "crisis");
  assert.equal(crisisGuard("मैं यह सब खत्म कर दूंगा").level, "crisis");
});

// The mapping is additive: a Latin phrase that was already crisis stays crisis, and the pure-Latin set is unchanged.
test("ISS-340: pure-Latin Hinglish is unaffected (still crisis / none exactly as before)", () => {
  for (const text of ["sab khatam kar dunga, ab aur nahi seh sakta", "mere saath peetai hoti hai ghar mein", "marne ka mann kar raha hai aajkal", "mar jaunga"]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
  for (const text of ["exam khatam ho gaya", "mujhe market jana hai", "mere saath Peter aa raha hai", "kar dunga kal"]) {
    assert.equal(crisisGuard(text).level, "none", text);
  }
});

// Nukta handling is a normaliser fold, so existing Devanagari patterns that spell a nukta letter plainly also match its
// nukta-bearing form (and vice versa): ख़ुश / खुश, ग़ायब / गायब.
test("ISS-340: nukta, chandrabindu and a dropped bindu fold in the normaliser for the existing Devanagari patterns too", () => {
  for (const text of ["मेरे बिना सब ख़ुश रहेंगे", "मेरे बिना सब खुश रहेंगे", "ग़ायब हो जाऊं", "गायब हो जाऊँ", "मैं नही रहूंगा", "जीना नहीँ चाहता", "खुद को ख़त्म कर लूंगा"]) {
    assert.equal(crisisGuard(text).level, "crisis", text);
  }
});

// Linear time on a long Devanagari turn built from the new phrases' near-miss prefixes (no new quadratic step).
test("ISS-340: a 200k-character Devanagari turn of near-miss prefixes runs in linear time", () => {
  const unit = "सब खत्म कर द मेरे साथ पि मरने का म जान दे द खुद को ख ज़िंदगी से थ मुझे मार ";
  const build = (n: number): string => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const time = (text: string): number => {
    const t0 = performance.now();
    crisisGuard(text);
    return performance.now() - t0;
  };
  const small = Math.min(time(build(25000)), time(build(25000)));
  const large = Math.min(time(build(100000)), time(build(100000)));
  assert.ok(large < 4000, `100k chars took ${large.toFixed(1)} ms`);
  assert.ok(large / Math.max(small, 1) < 8, `ratio ${(large / Math.max(small, 1)).toFixed(2)} for 4x the input`);
});

// -------------------------------------------------------------------------------------------
// P1 LK8 (policy .17, Tier L safety) — the Hindi/Hinglish word for suicide, "khudkushi" / "खुदकुशी".
// qa/verdicts/p1-lk6.md finding 1: crisisGuard returned level 'none' for it, so a model-free turn
// carrying the commonest everyday word for suicide was never escalated. Same level as the existing
// English "suicide" / Devanagari "आत्महत्या" patterns (crisis). The escalation reply text is untouched.
// -------------------------------------------------------------------------------------------

const LK8_CRISIS_TURNS: ReadonlyArray<string> = [
  "main khudkushi karunga",
  "khudkushi",
  "Khudkushi karne ka man hai",
  "main khudkhushi karna chahta hoon",
  "mujhe khud kushi karni hai",
  "khud-kushi ke baare mein soch raha hoon",
  "KHUDKUSHI",
  "khudkusi kar lunga",
  "khudkushee karne wala hoon",
  "मैं खुदकुशी करना चाहता हूँ",
  "खुदकुशी",
  "ख़ुदकुशी कर लूंगा",
  "ख़ुदकुशी", // precomposed nukta letter ख़ (U+0959)
  "खुद कुशी कर लूंगा",
  "खुदकशी का ख्याल आता है",
  "खुदखुशी करनी है",
  "main खुदकुशी karunga", // mixed script
  "k h u d k u s h i", // letter-spaced evasion
  "khud\u200Bkushi", // zero-width space inside the word
];

for (const text of LK8_CRISIS_TURNS) {
  test(`LK8: ${JSON.stringify(text)} is level 'crisis' and escalates before generation`, () => {
    assert.equal(crisisGuard(text).level, "crisis", text);
    assert.equal(routeBeforeGeneration(text).route, "escalate", text);
  });
}

// Negatives: nothing here asserts or names suicide. "khushi" (happiness), "khud" (self) and "khush" (happy)
// are everyday words that share letters with the new patterns.
const LK8_NEGATIVES: ReadonlyArray<string> = [
  "mujhe bahut khushi hui ye sunke",
  "main khud khush hoon apne result se",
  "apni khud ki khushi ke liye padhna chahta hoon",
  "khud padhunga main, coaching nahi chahiye",
  "khushi mere college ki senior hai",
  "kushal sir ne bola khud se apply karo",
  "khud kush hoon ab",
  "मुझे बहुत खुशी हुई",
  "मैं खुद पढ़ूंगा",
  "खुद कशिश है इस कोर्स में",
  "कुशी नगर में कॉलेज है",
  "खुदा का शुक्र है",
];

for (const text of LK8_NEGATIVES) {
  test(`LK8 negative stays 'none': ${JSON.stringify(text)}`, () => {
    assert.equal(crisisGuard(text).level, "none", text);
    assert.deepEqual(routeBeforeGeneration(text), { route: "continue" }, text);
  });
}

test("LK8: the crisis reply text is unchanged by the vocabulary addition", () => {
  const routed = routeBeforeGeneration("main khudkushi karunga");
  assert.equal(routed.route, "escalate");
  if (routed.route === "escalate") {
    assert.equal(routed.card.level, "crisis");
    assert.equal(routed.card.message, (routeBeforeGeneration("I just want to kill myself") as { card: { message: string } }).card.message);
  }
});

// D-020 accepted residual (safe direction): the squeezed twin of the khudkushi patterns has no word gap, so the ordinary two
// words "khud khushi" / "खुद खुशी" ("own happiness") flag. Documented, never suppressed.
for (const text of ["apni khud khushi se aaya hoon", "मैं खुद खुशी से आया"]) {
  test(`D-020 accepted residual (LK8 khudkushi squeezed twin): ${JSON.stringify(text)} -> crisis`, () => {
    assert.equal(crisisGuard(text).level, "crisis", text);
  });
}
