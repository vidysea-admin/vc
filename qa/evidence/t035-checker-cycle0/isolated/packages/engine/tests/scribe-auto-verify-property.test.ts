/**
 * T-030 (D-025): PROPERTY proof for the scribe's auto-verify gate (`needsReview:false`), replacing
 * example-by-example hostile rows with a closure check over the whole template language
 * (qa/debug/t-013-citation-rescope-cycle3.md §3, "the proof that would settle it").
 *
 * The SPEC_* grammar below (what the templates are MEANT to accept) is written out in a closed regex
 * subset (literals, `(?:…)`, `|`, `?`, bounded `{m,n}`) and interpreted by this file's own parser,
 * enumerator and backtracking matcher, so an edit's membership is decided by that interpreter, never by
 * a JS `RegExp` call into the engine. That buys mechanical independence from the engine's regex ENGINE,
 * but NOT independence from the engine's regex CONTENT: this spec was authored by transcribing the same
 * grammar `nodes.ts` encodes, so on its own it can only prove the code equals itself (senior-software-
 * engineer review, ISS-t-030-rev-1). So if the engine's templates accept anything the spec does not (the
 * rev-14 open gap `(?: [\p{L}]+){0,4}?`), the edit properties go RED -- but a shared blind spot in both
 * would not.
 *
 * TWO oracle fixtures sit at the end of this file, and they are NOT of equal standing:
 *
 *   - `tests/fixtures/auto-verify-oracle.jsonl` (the T-036 block) is **NOT an independent oracle**. An
 *     earlier claim in this header that it was "written from B2/D-026 wording BEFORE reading the
 *     SPEC_* grammar or the engine's templates" was false: 23 of its 102 rows are byte-for-byte copies
 *     of sentences that already existed in `nodes.ts`'s own doc comments (e.g. nodes.ts:515-517) and in
 *     this same test file's pre-existing T-030 (d) probes and controls, and all six of its
 *     `neg-speaker-01..06` rows are those controls with the `speaker` field flipped
 *     (checker verdict qa/verdicts/t-036-independent-oracle.md cycle 0, ISS-t-036-1). It is retained
 *     ONLY as REGRESSION coverage of behaviour already known and already asserted elsewhere. It cannot
 *     tell us whether the engine matches the contract, because its rows were selected from what the
 *     engine already does.
 *
 *   - `tests/fixtures/auto-verify-oracle-blind.jsonl` (the T-036-blind block) IS the independent
 *     oracle, and its independence rests on a mechanism, not on an assurance: its 102 rows were
 *     authored in a separate agent context (commit 7823f91) that was structurally forbidden from
 *     opening `packages/engine/src/scribe/nodes.ts`, this test file, or the older fixture, and was
 *     given only the prose of criterion B2 (qa/contracts/counselling-engine.md) and decision D-026
 *     (docs/DECISIONS.md). That agent reported its full read list and flagged 36 rows it judged the
 *     contract did not settle. 24 of the 102 rows have since been moved to
 *     `auto-verify-oracle-blind-unsettled.jsonl`: those are OPEN CONTRACT QUESTIONS awaiting the
 *     checker (qa/feedback-inbox.md, 2026-09-27), not passing tests -- the block reports them and
 *     asserts nothing about them.
 *
 * Evidence tuple the gate decides over: (value, key, quote, the cited turn's text + translatedText,
 * speaker). Cross-turn context is OUT of scope (gate qa/gates/auto-verify-property.md).
 *
 *   (a) single- and two-token edits (insert / replace / delete) of sentences of the language, from a
 *       large vocabulary, need review unless the edited sentence is still in the language;
 *   (b) random off-grammar sentences need review;
 *   (c) flipping ONE input (speaker, key, translation-only match) flips a verifying fact to review,
 *       with exactly that one reason;
 *   (d) the 8 probes of the debug report all need review;
 *   (T-036) regression only: the older, code-derived oracle rows still agree with the engine;
 *   (T-036-blind) the independent, blind-authored oracle rows agree with the engine, with the
 *       contract-unsettled rows quarantined and merely reported.
 * Synthetic data only (B13); seeded PRNG, so every run checks the same cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyCandidateFact, AUTO_VERIFY_TEMPLATE_SOURCES } from "../src/scribe/nodes.js";
import type { ScribeTurn } from "../src/scribe/schemas.js";

// ---------------------------------------------------------------------------
// The closure-check grammar (what the templates are MEANT to accept; NOT independent of the production
// regex -- see the file header). {C} = the country's alias phrases; {N} = the fact's number, spelled
// exactly.
// The engine templates also admit the Hinglish copula spelling "he" (for "hai"); the engine's third-party
// deny lexicon reads "he" as the English pronoun and vetoes those sentences (pre-existing, fail-safe false
// negative, recorded as a gap in qa/manifests/t-030-template-gap.md). The spec leaves "he" out so that its
// language is one the gate is meant to verify; "...he" variants stay OUTSIDE L and are checked by (a)/(b).
// ---------------------------------------------------------------------------

const SPEC_DEGREE =
  "(?:masters|master s|bachelors|bachelor s|mba|ms|phd|ug|pg|undergrad|undergraduate|postgraduate|degree|higher studies|studies|education|graduation|post graduation)";
const SPEC_CONNECTOR =
  "(?:computer science|abroad|further|further studies|data science|engineering|medicine|business|management|finance|economics|" +
  `psychology|nursing|architecture|design|artificial intelligence|(?:(?:my|a|an) )?${SPEC_DEGREE})`;

const SPEC_COUNTRY: readonly string[] = [
  `^i (?:really |definitely |also )?(?:want|wish|plan|intend|hope|aim|d like|would like|d love|would love|am planning|m planning|am going|m going|am hoping|m hoping|am aiming|m aiming|am applying|m applying|have decided|ve decided|decided) to (?:study|go|move|settle|live|work|apply|pursue|do|shift|relocate)(?: ${SPEC_CONNECTOR})? (?:in|to) (?:the )?{C}(?: for (?:my |a |an )?${SPEC_DEGREE})?$`,
  `^my (?:(?:first|top|preferred|dream|target|final|main) ){0,3}(?:choice|preference|destination|country|target|option|pick)(?: country| destination)? is (?:the )?{C}$`,
  `^i (?:prefer|choose|chose|have chosen|ve chosen|have picked|ve picked|picked|have selected|ve selected|selected) (?:the )?{C}(?: for (?:my |a |an )?${SPEC_DEGREE})?$`,
  `^(?:main|mai) {C}(?: (?:mein|me|main))? (?:jaana|jana|padhna|padhai karna|study karna|settle hona|settle karna|shift hona|rehna|jaake padhna) (?:chahta|chahti|chahte) (?:hoon|hu|hun|hoo|hai|hain)$`,
  `^(?:mujhe|mujhko) {C}(?: (?:mein|me))? (?:jaana|jana|padhna|padhai karni|padhai karna|study karna|settle hona|shift hona|rehna|jaake padhna) hai$`,
  `^(?:meri|mera) (?:(?:pehli|first|top) )?(?:choice|preference|pasand|target|destination) {C} hai$`,
  `^(?:मैं|मै) {C}(?: में)? (?:जाना|पढ़ना|पढ़ाई करना|बसना|रहना) (?:चाहता|चाहती|चाहते) (?:हूँ|हूं|हू|हैं)$`,
  `^मुझे {C}(?: में)? (?:जाना|पढ़ना|पढ़ाई करनी|पढ़ाई करना|रहना) है$`,
  `^(?:मेरी|मेरा) (?:पहली )?(?:पसंद|लक्ष्य) {C} है$`,
];

const SPEC_BUDGET: ReadonlyArray<readonly [string, string]> = [
  ["budget_inr_per_year", `^my (?:annual |yearly |maximum |max )?budget is {N}(?: (?:per year|a year|per annum|annually))?$`],
  ["budget_inr_total", `^my (?:total|overall) budget is {N}$`],
  ["budget_inr_total", `^my budget is {N} (?:total|in total)$`],
  ["budget_inr_per_year", `^mera (?:saalana |salana |annual |yearly )?budget {N}(?: (?:per year|saal ka|salana))? hai$`],
  ["budget_inr_total", `^mera (?:total|poora) budget {N} hai$`],
  ["budget_inr_per_year", `^मेरा (?:सालाना )?बजट {N} है$`],
  ["budget_inr_total", `^मेरा कुल बजट {N} है$`],
];

const SPEC_ARTICLE = "(?:(?:the|my|apne|mere|meri) )?";
const SPEC_BOARD = "(?:board|boards|board exam|board exams|boards exam|exam|exams|बोर्ड|परीक्षा|बोर्ड परीक्षा)";
const SPEC_FAMILIES: ReadonlyArray<{ key: string; exam: string; unit: string; noun: string; value: number }> = [
  { key: "ielts_overall", exam: `${SPEC_ARTICLE}ielts(?: (?:academic|overall|exam|test))?`, unit: "(?: (?:band|bands))?", noun: "(?:score|band|result)", value: 7.5 },
  { key: "class12_percentage", exam: `${SPEC_ARTICLE}(?:(?:class|std|standard|grade) 12|12th|hsc|12वीं|बारहवीं) ${SPEC_BOARD}`, unit: "(?: (?:percent|percentage|प्रतिशत))?", noun: "(?:score|percentage|percent|result)", value: 92 },
  { key: "class10_percentage", exam: `${SPEC_ARTICLE}(?:(?:class|std|standard|grade) 10|10th|ssc|10वीं|दसवीं) ${SPEC_BOARD}`, unit: "(?: (?:percent|percentage|प्रतिशत))?", noun: "(?:score|percentage|percent|result)", value: 88 },
  { key: "toefl_total", exam: `${SPEC_ARTICLE}toefl(?: ibt)?(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 105 },
  { key: "pte_overall", exam: `${SPEC_ARTICLE}pte(?: academic)?(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 65 },
  { key: "gre_total", exam: `${SPEC_ARTICLE}gre(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 320 },
  { key: "gmat_total", exam: `${SPEC_ARTICLE}gmat(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 680 },
  { key: "sat_total", exam: `${SPEC_ARTICLE}sat(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 1400 },
  { key: "duolingo_score", exam: `${SPEC_ARTICLE}(?:duolingo|det)(?: (?:exam|test))?`, unit: "", noun: "(?:score|result)", value: 120 },
];
const SPEC_SCORE_SHAPES: readonly string[] = [
  `^i (?:scored|got|secured|have scored|ve scored|have got|ve got|received|obtained) {N}{U} (?:in|on) {E}$`,
  `^my {E} {S} (?:is|was) {N}{U}$`,
  `^my {S} (?:in|on|for) {E} (?:is|was) {N}{U}$`,
  `^my {S} (?:is|was) {N}{U} (?:in|on) {E}$`,
  `^(?:maine|mene) {E} (?:mein|me|main) {N}{U} (?:score kiya|score kiye|score kiya hai|scored|laaye|laye|liye|nikale|paaye|paye|haasil kiye|hasil kiye|laaye hain|liye hain)$`,
  `^mere {E} (?:mein|me) {N}{U} (?:aaye|aye|aaye hain|aaye the|hain|the)$`,
  `^mera {E} {S} {N}{U} (?:hai|tha)$`,
  `^मैंने {E} में {N}{U} (?:स्कोर किया|स्कोर किए|प्राप्त किए|प्राप्त किया|लाए|हासिल किए)$`,
  `^मेरे {E} में {N}{U} (?:आए|आये|हैं|थे)$`,
];

// ---------------------------------------------------------------------------
// A tiny interpreter for the closed subset. Anything else (a class, `.`, `*`, `+`, a lazy or open
// quantifier, `\p{…}`) is a parse error: the spec cannot express an open gap.
// ---------------------------------------------------------------------------

type Node =
  | { t: "lit"; s: string }
  | { t: "seq"; items: Node[] }
  | { t: "alt"; opts: Node[] }
  | { t: "rep"; node: Node; min: number; max: number };

function parse(src: string): Node {
  let i = 0;
  const body = src.replace(/^\^/u, "").replace(/\$$/u, "");
  const chars = [...body];
  function alt(): Node {
    const opts = [seq()];
    while (chars[i] === "|") {
      i++;
      opts.push(seq());
    }
    return opts.length === 1 ? opts[0]! : { t: "alt", opts };
  }
  function seq(): Node {
    const items: Node[] = [];
    while (i < chars.length && chars[i] !== "|" && chars[i] !== ")") {
      let atom: Node;
      const c = chars[i]!;
      if (c === "(") {
        if (chars[i + 1] !== "?" || chars[i + 2] !== ":") throw new Error(`spec: only (?: groups, at ${i} in ${src}`);
        i += 3;
        atom = alt();
        if (chars[i] !== ")") throw new Error(`spec: unclosed group in ${src}`);
        i++;
      } else if (c === "\\") {
        const n = chars[i + 1]!;
        if (!/[.\\()|?{}*+^$[\]-]/u.test(n)) throw new Error(`spec: escape \\${n} is not a literal`);
        atom = { t: "lit", s: n };
        i += 2;
      } else if ("[.*+^$".includes(c)) {
        throw new Error(`spec: open construct "${c}" in ${src}`);
      } else {
        atom = { t: "lit", s: c };
        i++;
      }
      if (chars[i] === "?") {
        atom = { t: "rep", node: atom, min: 0, max: 1 };
        i++;
      } else if (chars[i] === "{") {
        const close = chars.indexOf("}", i);
        const m = /^\{(\d+),(\d+)\}$/u.exec(chars.slice(i, close + 1).join(""));
        if (!m) throw new Error(`spec: only bounded {m,n}, in ${src}`);
        atom = { t: "rep", node: atom, min: Number(m[1]), max: Number(m[2]) };
        i = close + 1;
      }
      if (chars[i] === "?" || chars[i] === "*" || chars[i] === "+") throw new Error(`spec: lazy/open quantifier in ${src}`);
      items.push(atom);
    }
    return { t: "seq", items };
  }
  const node = alt();
  if (i !== chars.length) throw new Error(`spec: trailing input in ${src}`);
  return node;
}

/** Full-string membership by backtracking over the AST (independent of the engine's RegExp). */
function matches(node: Node, s: string): boolean {
  function m(n: Node, pos: number, k: (p: number) => boolean): boolean {
    switch (n.t) {
      case "lit":
        return s.startsWith(n.s, pos) && k(pos + n.s.length);
      case "seq": {
        const step = (idx: number, p: number): boolean => (idx === n.items.length ? k(p) : m(n.items[idx]!, p, (q) => step(idx + 1, q)));
        return step(0, pos);
      }
      case "alt":
        return n.opts.some((o) => m(o, pos, k));
      case "rep": {
        const go = (count: number, p: number): boolean =>
          (count >= n.min && k(p)) || (count < n.max && m(n.node, p, (q) => q !== p && go(count + 1, q)));
        return go(0, pos);
      }
    }
  }
  return m(node, 0, (p) => p === s.length);
}

function count(n: Node): number {
  switch (n.t) {
    case "lit":
      return 1;
    case "seq":
      return n.items.reduce((acc, x) => acc * count(x), 1);
    case "alt":
      return n.opts.reduce((acc, x) => acc + count(x), 0);
    case "rep": {
      const c = count(n.node);
      let total = 0;
      for (let r = n.min; r <= n.max; r++) total += c ** r;
      return total;
    }
  }
}

function enumerate(n: Node): string[] {
  switch (n.t) {
    case "lit":
      return [n.s];
    case "seq":
      return n.items.reduce<string[]>((acc, x) => {
        const tails = enumerate(x);
        return acc.flatMap((a) => tails.map((b) => a + b));
      }, [""]);
    case "alt":
      return n.opts.flatMap(enumerate);
    case "rep": {
      const one = enumerate(n.node);
      const out: string[] = [];
      let layer = [""];
      for (let r = 0; r <= n.max; r++) {
        if (r >= n.min) out.push(...layer);
        layer = layer.flatMap((a) => one.map((b) => a + b));
      }
      return out;
    }
  }
}

/** One path; `pick(n)` chooses the branch index (coverage walk or seeded random). */
function walk(n: Node, pick: (k: number) => number): string {
  switch (n.t) {
    case "lit":
      return n.s;
    case "seq":
      return n.items.map((x) => walk(x, pick)).join("");
    case "alt":
      return walk(n.opts[pick(n.opts.length)]!, pick);
    case "rep": {
      const reps = n.min + pick(n.max - n.min + 1);
      let out = "";
      for (let r = 0; r < reps; r++) out += walk(n.node, pick);
      return out;
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The grammar cases: (template spec, key, value) with the value's slot filled in.
// ---------------------------------------------------------------------------

const escapeLit = (s: string) => s.replace(/[.\\()|?{}*+^$[\]-]/gu, "\\$&");
/**
 * The spec's country vocabulary, transcribed from the engine's own alias list (not independent -- see
 * the file header). The dotted aliases ("u.k", "u.s.a", "u.s")
 * are deliberately absent: the template slot spells them "u k", but the whole-word alias check looks for
 * "u.k", so they never auto-verify (a pre-existing, fail-safe false negative; recorded in the manifest).
 */
const COUNTRY_SLOTS: Readonly<Record<string, readonly string[]>> = {
  UK: ["uk", "united kingdom", "great britain"],
  USA: ["usa", "united states", "united states of america"],
  India: ["india", "bharat"],
  Canada: ["canada"],
  Australia: ["australia"],
  "New Zealand": ["new zealand", "nz"],
  Germany: ["germany"],
  Ireland: ["ireland"],
  Singapore: ["singapore"],
  France: ["france"],
};
const CANONICAL_COUNTRIES = Object.keys(COUNTRY_SLOTS);

interface GrammarCase {
  id: string;
  key: string;
  value: string | number;
  node: Node;
  size: number;
}

function buildCases(): GrammarCase[] {
  const cases: GrammarCase[] = [];
  const add = (id: string, key: string, value: string | number, src: string) => {
    const node = parse(src.normalize("NFC"));
    cases.push({ id, key, value, node, size: count(node) });
  };
  SPEC_COUNTRY.forEach((t, i) => {
    for (const canonical of CANONICAL_COUNTRIES) {
      const slot = `(?:${COUNTRY_SLOTS[canonical]!.map(escapeLit).join("|")})`;
      add(`country[${i}]/${canonical}`, "targetCountry", canonical, t.split("{C}").join(slot));
    }
  });
  SPEC_BUDGET.forEach(([key, t], i) => add(`budget[${i}]`, key, 1500000, t.split("{N}").join(escapeLit("1500000"))));
  for (const f of SPEC_FAMILIES) {
    SPEC_SCORE_SHAPES.forEach((shape, i) => {
      const src = shape.split("{E}").join(f.exam).split("{U}").join(f.unit).split("{S}").join(f.noun).split("{N}").join(escapeLit(String(f.value)));
      add(`score[${i}]/${f.key}`, f.key, f.value, src);
    });
  }
  return cases;
}

const CASES = buildCases();
/** Membership in L(key, value): the union of every spec template that declares `key`, at this value. */
function inLanguage(key: string, value: string | number, sentence: string): boolean {
  return CASES.some((c) => c.key === key && c.value === value && matches(c.node, sentence));
}

/** A coverage walk (every branch index reached across walks) plus seeded random walks; or all of L when small. */
function sentencesOf(c: GrammarCase, rng: () => number, samples: number): string[] {
  if (c.size <= samples) return [...new Set(enumerate(c.node))];
  const out = new Set<string>();
  for (let w = 0; out.size < samples && w < samples * 4; w++) {
    let step = 0;
    const pick = w < samples / 2 ? (k: number) => (w + step++) % k : (k: number) => Math.floor(rng() * k);
    out.add(walk(c.node, pick));
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// The gate under test: the real verifyCandidateFact over one synthetic turn.
// ---------------------------------------------------------------------------

const SESSION_ENDED = "2026-09-26T00:00:00.000Z";

function run(opts: {
  text: string;
  translatedText?: string;
  quote?: string;
  speaker?: "student" | "counsellor";
  key: string;
  value: unknown;
}): { needsReview: boolean; reasons: string[] } {
  const turn: ScribeTurn = {
    turnId: "p1",
    speaker: opts.speaker ?? "student",
    lang: "en",
    text: opts.text,
    translatedText: opts.translatedText ?? opts.text,
    ts: 1,
  };
  const result = verifyCandidateFact(
    {
      key: opts.key,
      value: opts.value,
      source: { type: "transcript", quote: opts.quote ?? opts.text, turnId: "p1" },
      confidence: 0.9,
      sensitivity: "low",
    },
    new Map([["p1", turn]]),
    SESSION_ENDED,
  );
  assert.ok("fact" in result, `kept, never dropped: ${opts.quote ?? opts.text}`);
  const fact = "fact" in result ? result.fact : undefined;
  return { needsReview: fact?.needsReview !== false, reasons: (fact?.reviewReasons ?? []).map((r) => r.split(":")[0]!) };
}

// ---------------------------------------------------------------------------
// Vocabulary: the grammar's own tokens, every token of the golden transcripts, attribution / hedge
// fillers (English, Hinglish, Devanagari), digits, and seeded random letter strings.
// ---------------------------------------------------------------------------

const tokenise = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{Nd}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

function buildVocabulary(grammarSentences: readonly string[]): { all: string[]; grammar: string[] } {
  const grammar = new Set<string>();
  for (const s of grammarSentences) for (const t of s.split(" ")) grammar.add(t);
  const all = new Set<string>(grammar);
  const dataset = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "qa", "evals", "scribe", "sessions.jsonl");
  for (const line of readFileSync(dataset, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { input: { turns: Array<{ text: string; translatedText: string }> } };
    for (const t of row.input.turns) for (const tok of [...tokenise(t.text), ...tokenise(t.translatedText)]) all.add(tok);
  }
  for (const w of [
    "as", "suggested", "advised", "recommended", "per", "agent", "consultant", "landlord", "allegedly", "supposedly",
    "planned", "apparently", "officially", "finally", "honestly", "eventually", "somehow", "there", "here", "then",
    "ke", "hisaab", "se", "salah", "par", "pe", "kehne", "wali", "wala", "sirf", "bhi", "abhi", "pakka",
    "सलाह", "पर", "एजेंट", "सलाहकार", "के", "कहने", "वाली", "भी", "अभी",
    "0", "1", "10", "12", "20", "93", "7", "8", "2500000",
  ]) {
    all.add(w.normalize("NFC"));
  }
  const rng = mulberry32(0x7030);
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < 60; i++) {
    const len = 2 + Math.floor(rng() * 8);
    let w = "";
    for (let j = 0; j < len; j++) w += letters[Math.floor(rng() * letters.length)];
    all.add(w);
  }
  const deva = "कखगघचजटडतदनपबमयरलवसह";
  for (let i = 0; i < 20; i++) {
    let w = "";
    for (let j = 0; j < 2 + Math.floor(rng() * 4); j++) w += deva[Math.floor(rng() * deva.length)];
    all.add(w);
  }
  return { all: [...all].sort(), grammar: [...grammar].sort() };
}

const SAMPLES_PER_CASE = 24;
const rngSentences = mulberry32(0x5eed);
const LANGUAGE: Array<{ c: GrammarCase; sentences: string[] }> = CASES.map((c) => ({ c, sentences: sentencesOf(c, rngSentences, SAMPLES_PER_CASE) }));
const VOCAB = buildVocabulary(LANGUAGE.flatMap((l) => l.sentences));

type Edit = { op: "insert" | "replace" | "delete"; at: number; token?: string };
function applyEdit(tokens: readonly string[], e: Edit): string[] {
  const out = [...tokens];
  if (e.op === "insert") out.splice(e.at, 0, e.token!);
  else if (e.op === "replace") out.splice(e.at, 1, e.token!);
  else out.splice(e.at, 1);
  return out;
}

// ---------------------------------------------------------------------------
// Sanity of the oracle itself (a spec that accepts nothing would make every property vacuous).
// ---------------------------------------------------------------------------

test("T-030 property oracle: the spec parses in the closed subset, is finite, and rejects an open gap", () => {
  assert.equal(CASES.length, 9 * CANONICAL_COUNTRIES.length + 7 + 9 * SPEC_FAMILIES.length);
  // the spec's vocabulary sits inside the engine's closed vocabulary (same canonical set, no extra alias)
  assert.deepEqual(Object.keys(AUTO_VERIFY_TEMPLATE_SOURCES.countrySlots).sort(), [...CANONICAL_COUNTRIES].sort());
  for (const [canonical, aliases] of Object.entries(COUNTRY_SLOTS)) {
    for (const a of aliases) assert.ok(AUTO_VERIFY_TEMPLATE_SOURCES.countrySlots[canonical]!.includes(a), `${canonical}: ${a}`);
  }
  const total = CASES.reduce((a, c) => a + c.size, 0);
  assert.ok(Number.isFinite(total) && total > 0, `finite language, |L| summed over cases = ${total}`);
  assert.throws(() => parse("^i want to study(?: [\\p{L}]+){0,4}? in uk$"), /spec:/u, "an open letter gap cannot be written in the spec");
  assert.throws(() => parse("^i want .* uk$"), /spec:/u);
  assert.ok(inLanguage("targetCountry", "UK", "i want to study in the uk"));
  assert.ok(!inLanguage("targetCountry", "UK", "i want to study as landlord suggested in the uk"));
  assert.ok(!inLanguage("nationality", "UK", "i want to study in the uk"), "a key no template declares has an empty language");
  console.log(`[t030-property] cases=${CASES.length} |L|=${total} sampled=${LANGUAGE.reduce((a, l) => a + l.sentences.length, 0)} vocab=${VOCAB.all.length} grammarTokens=${VOCAB.grammar.length}`);
});

// ---------------------------------------------------------------------------
// True positives over the language: every sampled sentence of L verifies with its declared key.
// ---------------------------------------------------------------------------

test("T-030 property: every sampled sentence of the template language auto-verifies with its declared key (student, original text)", () => {
  let checked = 0;
  const failures: string[] = [];
  for (const { c, sentences } of LANGUAGE) {
    for (const s of sentences) {
      checked++;
      const r = run({ text: s, key: c.key, value: c.value });
      if (r.needsReview) failures.push(`${c.id}: "${s}" -> ${r.reasons.join(",")}`);
    }
  }
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} of ${checked} language sentences did not verify`);
  console.log(`[t030-property] true positives: ${checked} of ${checked} language sentences verify`);
});

// ---------------------------------------------------------------------------
// (a) edits: single-token insert / replace / delete from the vocabulary; seeded two-token edits.
// ---------------------------------------------------------------------------

test("T-030 property (a1): every single-token edit (insert / replace / delete) of a language sentence needs review unless it is still in the language", () => {
  const rng = mulberry32(0xa1);
  const fromAll = () => VOCAB.all[Math.floor(rng() * VOCAB.all.length)]!;
  // the grammar's own words at every slot catch a slot widened with in-grammar words
  const fromGrammar = () => VOCAB.grammar[Math.floor(rng() * VOCAB.grammar.length)]!;
  let checked = 0;
  let stillInL = 0;
  const leaks: string[] = [];
  for (const { c, sentences } of LANGUAGE) {
    for (const s of sentences) {
      const tokens = s.split(" ");
      const edits: Edit[] = [];
      // every position gets every operation: insert (x2), and for an existing token delete + replace (x2)
      for (let at = 0; at <= tokens.length; at++) {
        edits.push({ op: "insert", at, token: fromAll() }, { op: "insert", at, token: fromGrammar() });
        if (at < tokens.length) {
          edits.push({ op: "delete", at }, { op: "replace", at, token: fromAll() }, { op: "replace", at, token: fromGrammar() });
        }
      }
      for (const e of edits) {
        const edited = applyEdit(tokens, e).join(" ");
        if (edited.length === 0) continue;
        if (inLanguage(c.key, c.value, edited)) {
          stillInL++;
          continue;
        }
        checked++;
        const r = run({ text: edited, key: c.key, value: c.value });
        if (!r.needsReview) leaks.push(`${c.id} ${e.op}@${e.at}${e.token ? `+${e.token}` : ""}: "${edited}"`);
      }
    }
  }
  assert.deepEqual(leaks.slice(0, 20), [], `${leaks.length} single-token edits outside the language auto-verified`);
  assert.ok(checked > 40_000, `enough edits checked: ${checked}`);
  console.log(`[t030-property] (a1) single-token edits outside L checked=${checked} leaks=${leaks.length} (edits still in L, skipped=${stillInL})`);
});

test("T-030 property (a2): seeded two-token edits of language sentences need review unless still in the language", () => {
  const rng = mulberry32(0xa2);
  const ops: Array<Edit["op"]> = ["insert", "replace", "delete"];
  let checked = 0;
  const leaks: string[] = [];
  for (let i = 0; i < 30_000; i++) {
    const { c, sentences } = LANGUAGE[Math.floor(rng() * LANGUAGE.length)]!;
    let tokens = sentences[Math.floor(rng() * sentences.length)]!.split(" ");
    const trail: string[] = [];
    for (let k = 0; k < 2; k++) {
      const op = ops[Math.floor(rng() * ops.length)]!;
      const pool = rng() < 0.5 ? VOCAB.grammar : VOCAB.all;
      const token = pool[Math.floor(rng() * pool.length)]!;
      const at = Math.floor(rng() * (op === "insert" ? tokens.length + 1 : Math.max(tokens.length, 1)));
      if (op !== "insert" && tokens.length === 0) continue;
      tokens = applyEdit(tokens, { op, at, token });
      trail.push(`${op}@${at}${op === "delete" ? "" : `+${token}`}`);
    }
    const edited = tokens.join(" ");
    if (edited.length === 0 || inLanguage(c.key, c.value, edited)) continue;
    checked++;
    const r = run({ text: edited, key: c.key, value: c.value });
    if (!r.needsReview) leaks.push(`${c.id} ${trail.join(" ")}: "${edited}"`);
  }
  assert.deepEqual(leaks.slice(0, 20), [], `${leaks.length} two-token edits outside the language auto-verified`);
  assert.ok(checked > 20_000, `enough two-token edits checked: ${checked}`);
  console.log(`[t030-property] (a2) two-token edits outside L checked=${checked} leaks=${leaks.length}`);
});

// ---------------------------------------------------------------------------
// (b) random off-grammar sentences.
// ---------------------------------------------------------------------------

test("T-030 property (b): random sentences (over the whole vocabulary, and over the grammar's own tokens) need review unless in the language", () => {
  const rng = mulberry32(0xb0);
  let checked = 0;
  const leaks: string[] = [];
  for (let i = 0; i < 20_000; i++) {
    const { c } = LANGUAGE[Math.floor(rng() * LANGUAGE.length)]!;
    const pool = i % 2 === 0 ? VOCAB.all : VOCAB.grammar;
    const len = 1 + Math.floor(rng() * 12);
    const words: string[] = [];
    for (let k = 0; k < len; k++) words.push(pool[Math.floor(rng() * pool.length)]!);
    // the value's own spelling somewhere in it, so the value check alone cannot be what rejects it
    const valueWord = typeof c.value === "number" ? String(c.value) : COUNTRY_SLOTS[c.value]![0]!;
    words.splice(Math.floor(rng() * (words.length + 1)), 0, valueWord);
    const sentence = words.join(" ");
    if (inLanguage(c.key, c.value, sentence)) continue;
    checked++;
    const r = run({ text: sentence, key: c.key, value: c.value });
    if (!r.needsReview) leaks.push(`${c.id}: "${sentence}"`);
  }
  assert.deepEqual(leaks, [], `${leaks.length} random off-grammar sentences auto-verified`);
  console.log(`[t030-property] (b) random off-grammar sentences checked=${checked} leaks=${leaks.length}`);
});

// ---------------------------------------------------------------------------
// (c) flip one input at a time: speaker, key, translation-only. Each flip alone moves a verifying fact to
// review, with exactly that one reason.
// ---------------------------------------------------------------------------

const OTHER_KEYS = [
  "targetCountry", "budget_inr_per_year", "budget_inr_total", "ielts_overall", "class12_percentage", "class10_percentage",
  "toefl_total", "gre_total", "duolingo_score", "nationality", "budget_usd", "ieltsBand", "intendedCourse", "universityOfInterest", "why_targetCountry", "k",
];
/** An innocuous original that holds no template clause and no deny cue (the translation carries the clause). */
const ORIGINAL_ELSEWHERE = "Soch raha hoon abhi.";

test("T-030 property (c): flipping ONE input (speaker, key, translation-only) flips a verifying fact to review, with exactly that reason", () => {
  let flips = 0;
  for (const { c, sentences } of LANGUAGE) {
    for (const s of sentences.slice(0, 8)) {
      const base = run({ text: s, key: c.key, value: c.value });
      assert.equal(base.needsReview, false, `baseline verifies: ${c.id} "${s}"`);

      const bySpeaker = run({ text: s, key: c.key, value: c.value, speaker: "counsellor" });
      assert.deepEqual([bySpeaker.needsReview, bySpeaker.reasons], [true, ["speaker"]], `speaker flip: ${c.id} "${s}"`);

      for (const other of OTHER_KEYS) {
        if (other === c.key) continue;
        const byKey = run({ text: s, key: other, value: c.value });
        assert.deepEqual([byKey.needsReview, byKey.reasons], [true, ["key-not-declared"]], `key flip ${c.key}->${other}: "${s}"`);
        flips++;
      }

      const byTranslation = run({ text: ORIGINAL_ELSEWHERE, translatedText: s, quote: s, key: c.key, value: c.value });
      assert.deepEqual([byTranslation.needsReview, byTranslation.reasons], [true, ["translation-only"]], `translation flip: ${c.id} "${s}"`);
      flips += 2;
    }
  }
  console.log(`[t030-property] (c) one-input flips checked=${flips}`);
});

// ---------------------------------------------------------------------------
// (d) the 8 probes of qa/debug/t-013-citation-rescope-cycle3.md §1.2 (K x4, S x2, P, W). X (cross-turn) is
// out of scope (gate auto-verify-property).
// ---------------------------------------------------------------------------

test("T-030 (d): the 8 debug-report probes all need review (key x4, speaker x2, translation-only, rev-14 gap)", () => {
  const probes: Array<{ id: string; args: Parameters<typeof run>[0]; reason: string }> = [
    { id: "K1 nationality from a study clause", args: { text: "I want to study in the UK", key: "nationality", value: "UK" }, reason: "key-not-declared" },
    { id: "K2 ieltsBand from a class-12 clause", args: { text: "I scored 92 in my class 12 boards", key: "ieltsBand", value: 92 }, reason: "key-not-declared" },
    { id: "K3 budget_usd from an unstated currency", args: { text: "My budget is 1500000", key: "budget_usd", value: 1500000 }, reason: "key-not-declared" },
    { id: "K4 budget_inr_total from a per-year clause", args: { text: "My budget is 2500000 per year", key: "budget_inr_total", value: 2500000 }, reason: "key-not-declared" },
    { id: "S1 counsellor 'I prefer Canada'", args: { text: "I prefer Canada", key: "targetCountry", value: "Canada", speaker: "counsellor" }, reason: "speaker" },
    { id: "S2 counsellor anecdote 'I chose Canada'", args: { text: "I chose Canada", key: "targetCountry", value: "Canada", speaker: "counsellor" }, reason: "speaker" },
    {
      id: "P1 match only in the machine translation",
      args: { text: "UK ke baare mein soch raha hoon", translatedText: "I want to study in the UK", quote: "I want to study in the UK", key: "targetCountry", value: "UK" },
      reason: "translation-only",
    },
    { id: "W rev-14 attributed gap", args: { text: "I want to study as landlord suggested in the UK", key: "targetCountry", value: "UK" }, reason: "unrecognised-form" },
  ];
  for (const p of probes) {
    const r = run(p.args);
    assert.equal(r.needsReview, true, `${p.id} must need review`);
    assert.ok(r.reasons.includes(p.reason), `${p.id}: named ${p.reason} (got ${r.reasons.join(",")})`);
  }
  // the brief's rev-14 sentence
  assert.equal(run({ text: "I want to study as agent advised in Australia", key: "targetCountry", value: "Australia" }).needsReview, true);
  // controls: the correct key, the student and the original text still verify
  assert.equal(run({ text: "I want to study in the UK", key: "targetCountry", value: "UK" }).needsReview, false);
  assert.equal(run({ text: "My budget is 2500000 per year", key: "budget_inr_per_year", value: 2500000 }).needsReview, false);
  assert.equal(run({ text: "I scored 92 in my class 12 boards", key: "class12_percentage", value: 92 }).needsReview, false);
  assert.equal(run({ text: "I prefer Canada", key: "targetCountry", value: "Canada" }).needsReview, false);
});

// ---------------------------------------------------------------------------
// T-036 REGRESSION BLOCK -- NOT an independent oracle. `tests/fixtures/auto-verify-oracle.jsonl` is a
// hand-written positive/negative sentence list per auto-verify template (country, budget, score). This
// block previously claimed the rows were authored from B2/D-026 "BEFORE reading the SPEC_* grammar above
// or the engine's templates in nodes.ts". That claim was FALSE and is withdrawn: the cycle-0 checker
// found 23 of the 102 rows are byte-for-byte identical to sentences already present in nodes.ts's doc
// comments (nodes.ts:515-517) and in this file's own pre-existing T-030 (d) probes and controls, and that
// all six `neg-speaker-01..06` rows -- the rows the unit's falsification proof used to lean on -- are
// those same controls with `speaker` flipped to "counsellor"
// (qa/verdicts/t-036-independent-oracle.md cycle 0; ISS-t-036-1).
//
// What this block is worth, stated without inflation: it pins 102 concrete input/output pairs of the
// gate, so a future refactor that changes any of them goes red. That is REGRESSION coverage of known
// behaviour. It is NOT evidence that the engine matches B2/D-026, because the rows were chosen from
// material that already reflects what the engine does. The independent check is the T-036-blind block
// below. See qa/manifests/t-036-independent-oracle.md.
// ---------------------------------------------------------------------------

interface OracleRow {
  id: string;
  category: string;
  text: string;
  translatedText?: string;
  quote?: string;
  key: string;
  value: string | number;
  speaker?: "student" | "counsellor";
  expect: "verify" | "review";
  why: string;
}

function loadOracleFixture(): OracleRow[] {
  const path = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "auto-verify-oracle.jsonl");
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OracleRow);
}

const ORACLE_ROWS = loadOracleFixture();

test("T-036 regression oracle (NOT independent -- 23/102 rows are copies of nodes.ts comments and pre-existing probes): the 102 known input/output pairs still hold", () => {
  const positives = ORACLE_ROWS.filter((r) => r.expect === "verify");
  const negatives = ORACLE_ROWS.filter((r) => r.expect === "review");
  assert.ok(ORACLE_ROWS.length > 0, "the fixture must not be empty (a vacuous oracle proves nothing)");
  assert.equal(positives.length, 30, "expected 30 SHOULD-verify rows in the regression fixture");
  assert.equal(negatives.length, 72, "expected 72 MUST-need-review rows in the regression fixture");

  const failures: string[] = [];
  for (const row of ORACLE_ROWS) {
    const r = run({
      text: row.text,
      translatedText: row.translatedText,
      quote: row.quote,
      speaker: row.speaker ?? "student",
      key: row.key,
      value: row.value,
    });
    const actual = r.needsReview ? "review" : "verify";
    if (actual !== row.expect) {
      failures.push(
        `${row.id} (${row.category}): expected "${row.expect}", engine said "${actual}" [${r.reasons.join(",") || "-"}] -- "${row.text}" (${row.why})`,
      );
    }
  }
  assert.deepEqual(failures, [], `${failures.length} of ${ORACLE_ROWS.length} regression-oracle rows disagree with the engine`);
  console.log(
    `[t036-regression] regression (NOT independent) oracle rows=${ORACLE_ROWS.length} positive=${positives.length} negative=${negatives.length} failures=${failures.length}`,
  );
});

// ---------------------------------------------------------------------------
// T-036-blind (ISS-t-030-rev-1, ISS-t-036-1): THE INDEPENDENT ORACLE.
//
// HOW the independence was obtained (a blindness claim is worth only its mechanism):
//   `tests/fixtures/auto-verify-oracle-blind.jsonl` was authored in a SEPARATE agent context
//   (commit 7823f91) whose brief structurally forbade it from opening
//   `packages/engine/src/scribe/nodes.ts`, this test file, or the older `auto-verify-oracle.jsonl`.
//   Its only inputs were the prose of criterion B2 (qa/contracts/counselling-engine.md) and decision
//   D-026 (docs/DECISIONS.md). It reported its full read list and flagged 36 rows whose correct
//   answer it judged the contract text did not settle. The rows were then run against the engine for
//   the first time in T-036 fix cycle 1 and every disagreement was triaged in
//   qa/manifests/t-036-independent-oracle.md.
//
//   That is the whole basis. It is a process claim about a separate context, not a proof: it rules out
//   the specific failure that sank cycle 0 (rows copied from the implementation), and nothing more.
//
// WHAT THE FIRST RUN FOUND (fix cycle 1), stated plainly:
//   - 0 auto-verify LEAKS. Not one row the contract requires to be needs-review was auto-verified by
//     the engine; all 72 must-need-review rows came back needs-review. No change was made to nodes.ts.
//   - 29 of the 30 rows the blind author expected to AUTO-VERIFY did not. Every disagreement ran in
//     the safe direction (the engine is stricter than the contract prose), so none is a leak -- but
//     it means the engine's auto-verify surface is markedly narrower than a reader of B2 would expect.
//   - 5 of those 29 were the blind author's error, corrected in-file with the contract sentence that
//     makes them wrong (their `value` is a unit conversion of "20 lakh" -> 2000000, which the student
//     never typed; B2 auto-verifies "typed numbers ... matched as whole words").
//   - The other 24 are NOT settled by B2/D-026 either way, so they are quarantined in
//     `auto-verify-oracle-blind-unsettled.jsonl` and merely REPORTED below. They are open contract
//     questions filed to qa/feedback-inbox.md (2026-09-27) for the checker, not passing tests.
//
// HONEST LIMIT OF THIS BLOCK: after quarantine the asserted split is 1 verify / 77 review, so on its
// own it would also be satisfied by an engine that auto-verifies almost nothing. It is therefore a
// one-sided (safety-direction) oracle. The verify direction is carried by the T-030 (d) controls and
// the regression block above, and the block is kept falsifiable by a named nodes.ts edit that flips
// the blind row `blind-neg-wrongkey-04` (see the manifest's capability-coverage table).
//
// HARNESS NORMALISATION (two conversions, applied to every row, chosen before the rows were run and
// never per-row -- neither one changes any row's `expect`):
//   1. KEY NAMES. The blind author could not know this repo's key spellings and used plain ones
//      (`budget`, `ieltsScore`, `boardPercentage`, ...). BLIND_KEY_ALIASES maps each to the engine key
//      for the SAME fact concept. The map is concept-injective, so the hostile `blind-neg-wrongkey-*`
//      rows stay hostile after mapping. Keys with no engine concept (`jeePercentile`, `neetScore`) are
//      passed through unmapped -- that gap is open question Q5.
//   2. VALUE TYPE + CITED QUOTE. The fixture is JSON, so every `value` is a string; a fully numeric
//      one is coerced to a number, as the engine's numeric facts are numbers. The fixture's optional
//      `quote` field is the author's note of the matched SPAN ("Canada", "7.5"), not a citation quote,
//      so the cited quote is the turn text -- the single clause each row's `why` reasons about.
// ---------------------------------------------------------------------------

interface BlindOracleRow extends OracleRow {
  unsettled?: boolean;
  open_question?: string;
}

/** Concept-preserving map from the blind author's key names to this engine's keys (see HARNESS NORMALISATION). */
const BLIND_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  targetCountry: "targetCountry",
  budget: "budget_inr_per_year",
  ieltsScore: "ielts_overall",
  toeflScore: "toefl_total",
  satScore: "sat_total",
  greScore: "gre_total",
  gmatScore: "gmat_total",
  duolingoScore: "duolingo_score",
  boardPercentage: "class12_percentage",
});

function loadBlindFixture(name: string): BlindOracleRow[] {
  const path = join(dirname(fileURLToPath(import.meta.url)), "fixtures", name);
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BlindOracleRow);
}

const BLIND_ROWS = loadBlindFixture("auto-verify-oracle-blind.jsonl");
const BLIND_UNSETTLED = loadBlindFixture("auto-verify-oracle-blind-unsettled.jsonl");

function runBlindRow(row: BlindOracleRow): { actual: "verify" | "review"; reasons: string[] } {
  const numeric = /^\d+(?:\.\d+)?$/.test(String(row.value));
  const r = run({
    text: row.text,
    translatedText: row.translatedText,
    quote: row.text,
    speaker: row.speaker ?? "student",
    key: BLIND_KEY_ALIASES[row.key] ?? row.key,
    value: numeric ? Number(row.value) : row.value,
  });
  return { actual: r.needsReview ? "review" : "verify", reasons: r.reasons };
}

test("T-036-blind independent oracle: rows authored by an agent forbidden from reading nodes.ts agree with the engine", () => {
  // Shape guard -- the fixture cannot be emptied, trimmed or quietly re-split into a vacuous pass, and
  // no row may vanish: the two files must still account for all 102 blind-authored rows, disjointly.
  assert.equal(BLIND_ROWS.length, 78, "expected 78 asserted rows in auto-verify-oracle-blind.jsonl");
  assert.equal(BLIND_UNSETTLED.length, 24, "expected 24 quarantined rows in auto-verify-oracle-blind-unsettled.jsonl");
  assert.equal(
    BLIND_ROWS.length + BLIND_UNSETTLED.length,
    102,
    "all 102 blind-authored rows must be accounted for; a disagreeing row may never be deleted (ISS-t-036-1)",
  );
  const ids = new Set([...BLIND_ROWS, ...BLIND_UNSETTLED].map((r) => r.id));
  assert.equal(ids.size, 102, "blind row ids must be unique across the asserted and quarantined files");
  const positives = BLIND_ROWS.filter((r) => r.expect === "verify");
  const negatives = BLIND_ROWS.filter((r) => r.expect === "review");
  assert.equal(positives.length, 1, "expected 1 asserted SHOULD-verify blind row (see HONEST LIMIT above)");
  assert.equal(negatives.length, 77, "expected 77 asserted MUST-need-review blind rows");
  assert.ok(
    BLIND_UNSETTLED.every((r) => r.unsettled === true && typeof r.open_question === "string" && r.open_question.length > 0),
    "every quarantined row must carry unsettled:true and the open contract question it is waiting on",
  );

  const failures: string[] = [];
  for (const row of BLIND_ROWS) {
    const { actual, reasons } = runBlindRow(row);
    if (actual !== row.expect) {
      failures.push(
        `${row.id} (${row.category}): expected "${row.expect}", engine said "${actual}" [${reasons.join(",") || "-"}] -- "${row.text}"`,
      );
    }
  }
  assert.deepEqual(failures, [], `${failures.length} of ${BLIND_ROWS.length} blind-oracle rows disagree with the engine`);

  // No assertion on the quarantined rows -- B2/D-026 do not settle them, so asserting either way would
  // freeze an answer the contract has not given. They are reported so the disagreement stays visible.
  const quarantineReport = BLIND_UNSETTLED.map((row) => {
    const { actual, reasons } = runBlindRow(row);
    return `    ${row.id}: blind author said "${row.expect}", engine says "${actual}" [${reasons.join(",") || "-"}] -- ${row.open_question}`;
  });
  console.log(
    `[t036-blind] independent oracle asserted=${BLIND_ROWS.length} (verify=${positives.length} review=${negatives.length}) failures=${failures.length}; ` +
      `QUARANTINED (reported, not asserted) = ${BLIND_UNSETTLED.length} open contract questions:\n${quarantineReport.join("\n")}`,
  );
});
