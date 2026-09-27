/**
 * T-030 (D-025): PROPERTY proof for the scribe's auto-verify gate (`needsReview:false`), replacing
 * example-by-example hostile rows with a closure check over the whole template language
 * (qa/debug/t-013-citation-rescope-cycle3.md §3, "the proof that would settle it").
 *
 * The oracle is an INDEPENDENT spec of the intended grammar, written out below in a closed regex subset
 * (literals, `(?:…)`, `|`, `?`, bounded `{m,n}`) and interpreted by this file's own parser, enumerator
 * and backtracking matcher. Membership of an edited sentence is decided by that interpreter, never by
 * the engine regex under test. So if the engine's templates accept anything the spec does not (the
 * rev-14 open gap `(?: [\p{L}]+){0,4}?`), the edit properties go RED.
 *
 * Evidence tuple the gate decides over: (value, key, quote, the cited turn's text + translatedText,
 * speaker). Cross-turn context is OUT of scope (gate qa/gates/auto-verify-property.md).
 *
 *   (a) single- and two-token edits (insert / replace / delete) of sentences of the language, from a
 *       large vocabulary, need review unless the edited sentence is still in the language;
 *   (b) random off-grammar sentences need review;
 *   (c) flipping ONE input (speaker, key, translation-only match) flips a verifying fact to review,
 *       with exactly that one reason;
 *   (d) the 8 probes of the debug report all need review.
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
// The independent spec (what the templates are MEANT to accept). {C} = the country's alias phrases;
// {N} = the fact's number, spelled exactly.
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
 * The spec's country vocabulary, written out independently. The dotted aliases ("u.k", "u.s.a", "u.s")
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
