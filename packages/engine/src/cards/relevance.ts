/**
 * T-010 (contract B18, context relevance): what the live cards must never show or ask.
 *   - a topic the student's own facts make irrelevant (an India-only student gets no visa card);
 *   - an approved fact asked again as if it were unknown;
 *   - anything on the student's do-not-ask list;
 *   - an urgency-mismatched prompt for a student leaving two or more years from now (SC-038).
 * Plus the pre-brief (plan.md §3 step 1): known facts, open questions, do-not-ask.
 *
 * Deterministic code (B6: hard rules are code, not a prompt the model may ignore). A bounded
 * lexicon, not a semantic judgement: it recognises a fixed set of counselling topics by keyword. A
 * card about a topic outside the lexicon is not suppressed by it (documented residual; the planner
 * skill carries the same rules as soft guidance, and the counsellor still sees only verified cards).
 */
import type { Fact } from "@vc/schemas";
import type { ScribeTurn } from "../scribe/schemas.js";
import type { KnownFact } from "./schemas.js";

export type Topic = "visa" | "destination" | "budget" | "intake" | "course" | "english_test" | "grades";

/** Keyword patterns that say a card is ABOUT a topic (English + common Hinglish/Devanagari words). */
export const TOPIC_PATTERNS: Readonly<Record<Topic, RegExp>> = Object.freeze({
  visa: /\b(visas?|study permits?|immigration|ukvi|f-?1|i-20|sevis|cas (?:letter|number)|biometrics?|post[- ]study work|psw|work permits?|consulate|embassy)\b|वीज़ा|वीजा/i,
  destination: /\b(countr(?:y|ies)|destinations?|abroad|overseas|desh|videsh)\b|देश|विदेश/i,
  budget: /\b(budget|afford(?:able)?|tuition|fees?|costs?|expenses?|spend(?:ing)?|lakhs?|loans?|funding|kharcha)\b|बजट|खर्च/i,
  intake: /\b(intakes?|start (?:date|year)|which year|kab (?:jana|jaoge|jaana))\b|\bwhen\b.{0,30}\b(?:start|begin|join|leave|go|move)\b/i,
  course: /\b(courses?|majors?|subjects?|programm?e?s?|degrees?|streams?|field of study|speciali[sz]ation)\b/i,
  english_test: /\b(ielts|toefl|pte|duolingo english|english (?:test|score|proficiency)|band score)\b/i,
  grades: /\b(percentage|marks|grades?|cgpa|gpa|board (?:results?|exams?)|class 1[02]|12th|10th)\b/i,
});

const TOPIC_NAMES = Object.keys(TOPIC_PATTERNS) as Topic[];

/** Which topic an approved fact's key answers (null: a key outside the lexicon). */
const KEY_TOPICS: readonly [RegExp, Topic][] = [
  [/visa/i, "visa"],
  [/country|destination/i, "destination"],
  [/budget|fee|tuition|funding|loan/i, "budget"],
  [/intake|start_?(?:year|date)|timeline|leave_?year|departure/i, "intake"],
  [/ielts|toefl|pte|english/i, "english_test"],
  [/percentage|grade|gpa|marks/i, "grades"],
  [/major|course|subject|program|degree|stream|field/i, "course"],
];

export function topicOfKey(key: string): Topic | null {
  for (const [re, topic] of KEY_TOPICS) if (re.test(key)) return topic;
  return null;
}

// A fixed country lexicon (canonical name <- whole-word aliases). India first: its aliases decide B18's
// India-only rule. Deliberately small; a country outside it is simply not recognised (fail-open: a
// visa card may then show, which is safe, never a hidden one).
const COUNTRY_LEXICON: readonly [string, RegExp][] = [
  ["India", /\b(india|bharat)\b|भारत/i],
  ["UK", /\b(uk|u\.k\.?|united kingdom|great britain|britain|england|scotland|wales)\b/i],
  ["USA", /\b(usa|u\.s\.a?\.?|united states|america)\b/i],
  ["Canada", /\b(canada)\b/i],
  ["Australia", /\b(australia)\b/i],
  ["New Zealand", /\b(new zealand|nz)\b/i],
  ["Germany", /\b(germany)\b/i],
  ["Ireland", /\b(ireland)\b/i],
  ["Singapore", /\b(singapore)\b/i],
  ["France", /\b(france)\b/i],
  ["Netherlands", /\b(netherlands|holland)\b/i],
  ["UAE", /\b(uae|dubai|united arab emirates)\b/i],
  ["Japan", /\b(japan)\b/i],
];

function countriesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const [name, re] of COUNTRY_LEXICON) if (re.test(text)) out.add(name);
  return out;
}

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  return [];
}

// "two years from now", "after 2 years", "do saal baad" — the student's own departure horizon.
const TWO_PLUS_YEARS = /\b(?:(?:two|three|2|3) years? (?:from now|later|away)|after (?:two|three|2|3) years|(?:do|teen) saal baad)\b/i;
const YEAR = /\b(20[2-9]\d)\b/;

/** Prompts that press for immediate action (mismatched for a student leaving 2+ years out). */
export const URGENCY_PATTERN =
  /\b(urgent(?:ly)?|immediately|right away|asap|this (?:week|month)|closing soon|closes (?:this|next) (?:week|month)|apply now|last date|before it closes|deadline (?:is )?(?:this|next) (?:week|month))\b/i;

// A question that directly asks for a value ("What is your budget?"), as opposed to one that widens
// from it ("Have you considered other countries besides the UK?").
const DIRECT_ASK =
  /^(?:so,?\s+|and\s+)?(?:what|which|how much|how many|when|where|do you|did you|are you|have you (?:decided|chosen|finali[sz]ed|fixed)|could you (?:tell|share)|can you (?:tell|share)|kitna|kaunsa|kaun sa|kab)\b/i;
const WIDEN_MARKER =
  /\b(other|else|instead|also|besides|alternatives?|beyond|apart from|consider(?:ed)?|compar(?:e|ed|ing)|rather than|outside)\b/i;

// --- ISS-t-010-c2-2 (cycle-2 FAIL, B18): the clarify branch DEFAULTS TO SUPPRESSING -------------
// Three cycles of this issue, each a different proxy, each failing in the same direction:
//   - `citedTopics.size > 0` (cycle 0) switched the guard off for every topic on any citation;
//   - `citedTopics.has(topic)` alone (the cycle-0 verdict's literal fix) drops CE-054
//     ("Is the 20 lakh budget per year or for the whole course?" cites budget, NAMES course);
//   - `buildsOnCitedTopic` (cycle 1) was a single global boolean outside the per-topic loop;
//   - `requestsValueOf` (cycle 2) made the clarify branch CONDITIONAL on eight phrase frames, so
//     every re-ask phrased outside them was SHOWN. Measured by the cycle-2 checker: 9/10 of its
//     re-ask rows leaked (1/10 under cycle 1), and 8/8 leaked with no profile citation at all
//     (0/8 under cycle 1). Cycle 2's B18 was a REGRESSION, and the cause was the default
//     direction, not the contents of the list.
// So: the clarify branch is UNCONDITIONAL again — a clarify card that names a known topic it does
// not cite is SUPPRESSED. That is the direction B18 protects (over-suppressing costs a card;
// under-suppressing re-asks an approved fact in front of the counsellor). The single carve-out
// below is what CE-054 genuinely needs, and it is POSITIVE and POSITIONAL, not a phrase list: an
// unrecognised phrasing does not match it and is therefore suppressed. It fails CLOSED.
//
// The `requestsValueOf` export, VALUE_DESCRIPTION_TAIL and UNKNOWN_VALUE_FRAMES are DELETED, not
// left dead: they are the defect. Nothing else imported them (they were used only here).

/**
 * The CLOSED vocabulary a passing-mention tail may contain: prepositions, determiners,
 * coordinators, quantity words, numerals and duration nouns. It is an ALLOW-list, which is what
 * makes the carve-out fail closed — every word outside it (an adjective like "unclear", a
 * participle like "fixed", a noun like "gap", a verb, a pronoun, a wh-word) cancels the carve-out
 * and the card is suppressed. Measured against my own hostile rows: "or unclear for the course?",
 * "the only fixed thing, unlike the course?" and "known but not the course?" all leaked while this
 * test was a stop-list of clause tokens, and all three are suppressed by the allow-list.
 */
const TAIL_FUNCTION_WORD =
  /^(?:a|an|the|this|that|these|those|of|for|per|in|on|at|to|from|by|with|within|across|over|under|about|around|between|during|through|throughout|including|plus|and|or|nor|versus|vs|each|every|both|all|any|either|whole|entire|full|total|same|other|single|combined|overall|first|second|third|final|rest|part|half|only|just)$/i;
/**
 * Duration / quantity words a scope question hangs on ("per year", "across the term", "the yearly
 * figure, or the whole four-year course"). Kept to measure words only: no state adjective
 * ("unclear", "open", "known"), no noun that could BE the thing asked about.
 */
const TAIL_MEASURE_NOUN =
  /^(?:year|years|yr|yrs|yearly|month|months|monthly|annual|annually|term|terms|semester|semesters|session|sessions|intake|intakes|week|weeks|day|days|duration|length|span|stay|programme|program|degree|figure|figures|amount|amounts|number|cap|ceiling|limit|limits|allowance|maximum|minimum|estimate|estimates)$/i;
/** A numeral, optionally hyphenated into a modifier ("three-year", "2-year"). */
const TAIL_NUMERAL = /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:-[\p{L}]+)?$/iu;

/**
 * THE ONE CARVE-OUT (B18). True when `topic` is named *in passing*, inside a verbless tail that
 * hangs off a topic the card actually CITES — the shape of CE-054, "Is the 20 lakh budget per year
 * or for the whole course?" (cites budget, names course as the last word of "or for the whole
 * course"). All four conditions must hold, and each one is a positive structural fact about the
 * prompt, so anything unrecognised falls through to "suppressed":
 *   1. the card cites an approved fact for some OTHER known topic, and that topic's keyword occurs
 *      in the prompt (the anchor the tail hangs off);
 *   2. `topic`'s keyword occurs EXACTLY ONCE (two mentions are not a passing mention);
 *   3. that occurrence is the LAST word of the prompt (bar punctuation) — a topic being asked about
 *      is followed by the rest of its question, a topic named in passing is not;
 *   4. every word between the anchor and the mention is in the CLOSED vocabulary above — function
 *      words, numerals and duration nouns only. Anything else at all cancels the carve-out.
 * A single counter-example is enough to lose the carve-out, which is why it is written this way:
 * "Is the 20 lakh budget per year or has she picked a course?" fails (4), "Is the course something
 * we should pin down before the 20 lakh budget?" fails (1)/(3).
 */
export function namedInPassing(own: string, topic: RegExp, citedPatterns: readonly RegExp[]): boolean {
  if (citedPatterns.length === 0) return false;
  const scan = new RegExp(topic.source, topic.flags.includes("g") ? topic.flags : `${topic.flags}g`);
  let only: { index: number; end: number } | null = null;
  for (let m = scan.exec(own); m !== null; m = scan.exec(own)) {
    if (m[0].length === 0) {
      scan.lastIndex += 1;
      continue;
    }
    if (only !== null) return false; // (2) more than one mention
    only = { index: m.index, end: m.index + m[0].length };
  }
  if (only === null) return false;
  if (/[\p{L}\p{N}]/u.test(own.slice(only.end))) return false; // (3) not the last word

  // (1) the nearest cited-topic keyword that occurs BEFORE the mention is the anchor.
  // The anchor is the LAST cited keyword before the mention, so the span (4) has to validate is
  // the shortest one the prompt allows — anything earlier is a different clause's business.
  let anchor = -1;
  const before = own.slice(0, only.index);
  for (const cited of citedPatterns) {
    const g = new RegExp(cited.source, cited.flags.includes("g") ? cited.flags : `${cited.flags}g`);
    for (let m = g.exec(before); m !== null; m = g.exec(before)) {
      if (m[0].length === 0) {
        g.lastIndex += 1;
        continue;
      }
      if (m.index + m[0].length > anchor) anchor = m.index + m[0].length;
    }
  }
  if (anchor < 0) return false;

  // (4) everything between the anchor's own keyword and the mention must be closed-class.
  for (const raw of own.slice(anchor, only.index).split(/\s+/)) {
    const word = raw.replace(/[^\p{L}\p{N}'-]/gu, "");
    if (word.length === 0) continue;
    if (!TAIL_FUNCTION_WORD.test(word) && !TAIL_MEASURE_NOUN.test(word) && !TAIL_NUMERAL.test(word)) return false;
  }
  return true;
}

/** The do-not-ask marker keys a counsellor-approved fact can carry (value: a topic name or a phrase). */
const DO_NOT_ASK_KEY = /^do_?not_?(?:ask|raise)$/i;

export interface RelevanceContext {
  /** Topics an approved fact already answers: never asked again as if unknown. */
  knownTopics: ReadonlySet<Topic>;
  /** Explicit do-not-ask items: never raised at all (any card that mentions one is dropped). */
  doNotRaise: readonly { label: string; pattern: RegExp }[];
  /** B18: every destination the student has is India (approved facts + what they said this window). */
  indiaOnly: boolean;
  /** SC-038: the student leaves two or more years from now. */
  longHorizon: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function itemPattern(item: string): { label: string; pattern: RegExp } | null {
  const label = item.trim().toLowerCase();
  if (label.length < 3) return null;
  const topic = TOPIC_NAMES.find((t) => t === label || t.replace("_", " ") === label);
  if (topic) return { label, pattern: TOPIC_PATTERNS[topic] };
  return { label, pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(label)}(?:$|[^\\p{L}\\p{N}])`, "iu") };
}

/** Builds the B18 context from the approved profile and the live turns. `now` is injectable for tests. */
export function buildRelevanceContext(knownFacts: readonly Fact[], turns: readonly ScribeTurn[], now: Date = new Date()): RelevanceContext {
  const knownTopics = new Set<Topic>();
  const doNotRaise: { label: string; pattern: RegExp }[] = [];
  const destinations = new Set<string>();
  let horizonYear: number | null = null;

  for (const fact of knownFacts) {
    if (DO_NOT_ASK_KEY.test(fact.key)) {
      for (const item of stringsOf(fact.value)) {
        const p = itemPattern(item);
        if (p) doNotRaise.push(p);
      }
      continue;
    }
    const topic = topicOfKey(fact.key);
    if (topic) knownTopics.add(topic);
    if (topic === "destination") for (const v of stringsOf(fact.value)) for (const c of countriesIn(v)) destinations.add(c);
    if (topic === "intake") {
      for (const v of stringsOf(fact.value)) {
        const m = YEAR.exec(v);
        if (m) horizonYear = Math.max(horizonYear ?? 0, Number(m[1]));
      }
    }
  }

  let saidTwoPlusYears = false;
  for (const turn of turns) {
    if (turn.speaker !== "student") continue;
    for (const text of [turn.text, turn.translatedText]) {
      for (const c of countriesIn(text)) destinations.add(c);
      if (TWO_PLUS_YEARS.test(text)) saidTwoPlusYears = true;
    }
  }

  const indiaOnly = destinations.size > 0 && [...destinations].every((d) => d === "India");
  const longHorizon = saidTwoPlusYears || (horizonYear !== null && horizonYear - now.getUTCFullYear() >= 2);
  return { knownTopics, doNotRaise, indiaOnly, longHorizon };
}

/** Text with quoted spans removed (a card may quote the student; a quote is not the card's own voice). */
export function withoutQuotes(text: string): string {
  return text.replace(/"[^"]*"|“[^”]*”|‘[^’]*’|'[^']{3,}'/g, " ");
}

/**
 * True when a question card asks for a topic's value AS IF IT WERE UNKNOWN:
 *   - a direct ask ("What is your budget?", "Which country ...?") with no widening marker, whatever
 *     the card type or its citations; or
 *   - a clarify card that mentions this topic without citing the known fact it would be
 *     clarifying. That branch is UNCONDITIONAL (ISS-t-010-c2-2): the only escape is
 *     `namedInPassing`, the one positive carve-out CE-054 needs. A clarify that cites the approved
 *     fact ("Is the 20 lakh budget per year or total?") builds on it and is kept.
 *
 * `citesKnownFact` is the per-topic judgement `citedTopics.has(topic)` — never a global flag.
 * `citedPatterns` are the keyword patterns of the topics this card DOES cite (the carve-out's
 * anchor); an empty list means no carve-out is possible, so the branch suppresses.
 */
export function asksFor(
  card: { type: string; prompt: string },
  topic: RegExp,
  citesKnownFact: boolean,
  citedPatterns: readonly RegExp[] = [],
): boolean {
  const prompt = card.prompt.trim();
  if (!prompt.endsWith("?")) return false;
  const own = withoutQuotes(prompt);
  if (!topic.test(own)) return false;
  if (DIRECT_ASK.test(own.trim()) && !WIDEN_MARKER.test(own)) return true;
  return card.type === "clarify" && !citesKnownFact && !namedInPassing(own, topic, citedPatterns);
}

export type RelevanceDrop = "not_applicable" | "already_known" | "do_not_ask" | "urgency_mismatch";

/**
 * The B18 verdict for one card: null keeps it, otherwise the reason it is dropped. `citedTopics` are
 * the topics of the approved facts this card cites through a `profile` source.
 */
export function relevanceDrop(
  card: { type: string; prompt: string },
  ctx: RelevanceContext,
  citedTopics: ReadonlySet<Topic> = new Set(),
): RelevanceDrop | null {
  const own = withoutQuotes(card.prompt);
  if (ctx.indiaOnly && TOPIC_PATTERNS.visa.test(own)) return "not_applicable";
  for (const item of ctx.doNotRaise) if (item.pattern.test(own)) return "do_not_ask";
  // ISS-t-010-c2-2 (B18): the citation flag is PER TOPIC (`citedTopics.has(topic)`) and the clarify
  // branch is UNCONDITIONAL — a clarify naming a known topic it does not cite is suppressed unless
  // `namedInPassing` positively recognises it as a passing mention hanging off a topic it DOES
  // cite. Cycle 0's `|| citedTopics.size > 0`, cycle 1's `buildsOnCitedTopic` and cycle 2's
  // `requestsValueOf` all made this branch conditional; each one therefore failed OPEN on the
  // phrasings nobody had listed.
  const citedPatterns = [...citedTopics].map((t) => TOPIC_PATTERNS[t]);
  for (const topic of ctx.knownTopics) {
    // A DIRECT ask of a known topic is still dropped whatever it cites (asksFor ignores the flag there).
    if (asksFor(card, TOPIC_PATTERNS[topic], citedTopics.has(topic), citedPatterns)) return "already_known";
  }
  if (ctx.longHorizon && URGENCY_PATTERN.test(own)) return "urgency_mismatch";
  return null;
}

const OPEN_QUESTION_LABELS: Readonly<Record<Exclude<Topic, "visa">, string>> = Object.freeze({
  destination: "Destination country?",
  course: "Course or field of study?",
  intake: "Intake year?",
  budget: "Yearly budget?",
  english_test: "English test score?",
  grades: "Latest board or school marks?",
});

/**
 * The pre-brief (plan.md §3 step 1): what is already known, what is still open, what not to ask.
 * `openQuestions` are short topic questions for the counsellor's own planning (never a line to
 * read out), and never include a topic already known (B18). Visa only appears for a student with a
 * known, non-India destination.
 */
export function buildPreBrief(knownFacts: readonly KnownFact[], ctx: RelevanceContext): {
  knownFacts: Fact[];
  openQuestions: string[];
  doNotAsk: string[];
} {
  const facts: Fact[] = knownFacts.filter((f) => !DO_NOT_ASK_KEY.test(f.key)).map(({ id: _id, ...fact }) => fact);
  const openQuestions: string[] = [];
  for (const [topic, label] of Object.entries(OPEN_QUESTION_LABELS) as [Exclude<Topic, "visa">, string][]) {
    if (!ctx.knownTopics.has(topic)) openQuestions.push(label);
  }
  if (ctx.knownTopics.has("destination") && !ctx.indiaOnly && !ctx.knownTopics.has("visa")) {
    openQuestions.push("Visa route for the chosen country?");
  }
  const doNotAsk = [...[...ctx.knownTopics].map((t) => t.replace("_", " ")), ...ctx.doNotRaise.map((d) => d.label)];
  return { knownFacts: facts, openQuestions, doNotAsk: [...new Set(doNotAsk)] };
}
