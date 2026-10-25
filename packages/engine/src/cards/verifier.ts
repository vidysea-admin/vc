/**
 * T049: deterministic backstops before the mandatory semantic verifier. Passing these rules
 * does not authorize release or establish semantic safety. No new phrase-list repairs.
 * T-010: the Verifier (plan.md §3 step 6) — the deterministic gate every candidate card passes
 * before a counsellor can see it. A card is KEPT only if all of these hold, else it is dropped with
 * a reason and counted in `droppedCount` (never shown, never labelled verified):
 *
 *   1. shape (B5): it parses as a CandidateCard;
 *   2. no-script (B1): CardSchema's isScriptLike refine (packages/schemas guards.ts) AND the live
 *      rules below (counsellor voice, directives, salutations, length, more than two sentences);
 *   3. cited (B2): at least one source, and EVERY source resolves to something real in this run —
 *        - `profile`: the id of an approved fact the engine read for this student;
 *        - `transcript`: a turn id in the live window AND a quote that occurs in that turn;
 *        - `kb`: a citation id the KnowledgeBase /ask returned in this run (T-026);
 *      any other source type, or one fabricated source among real ones, drops the card;
 *   4. relevant (B18): relevance.ts;
 *   5. not a duplicate of a card already kept.
 *
 * The optional semantic pass (skills/verifier, Flash-Lite in plan.md) can only DROP more; it is run
 * by nodes.ts after this, never instead of it.
 */
import { CardSchema, CardTypeSchema, INSTRUCTION_VERB_ALTERNATION, type Card, type CardSource } from "@vc/schemas";
import { createHash } from "node:crypto";
import type { ScribeTurn } from "../scribe/schemas.js";
import { relevanceDrop, topicOfKey, withoutQuotes, type RelevanceContext, type Topic } from "./relevance.js";
import {
  CandidateCardSchema,
  MAX_CARD_PROMPT_LENGTH,
  VerifyOutputSchema,
  type CandidateCard,
  type DroppedCard,
  type KnownFact,
  type VerifyOutput,
} from "./schemas.js";

/** What a card's sources may resolve against in this run. */
export interface EvidenceIndex {
  facts: ReadonlyMap<string, KnownFact>;
  turns: ReadonlyMap<string, ScribeTurn>;
  kbIds: ReadonlySet<string>;
}

export function buildEvidenceIndex(knownFacts: readonly KnownFact[], turns: readonly ScribeTurn[], kbIds: Iterable<string>): EvidenceIndex {
  return {
    facts: new Map(knownFacts.map((f) => [f.id, f])),
    turns: new Map(turns.map((t) => [t.turnId, t])),
    kbIds: new Set(kbIds),
  };
}

function normaliseForMatch(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A transcript quote must be a real span of its turn; a trivially short quote proves nothing. */
const MIN_QUOTE_LENGTH = 4;

export function resolveSource(source: CardSource, evidence: EvidenceIndex): boolean {
  switch (source.type) {
    case "profile":
      return evidence.facts.has(source.id);
    case "transcript": {
      const turn = evidence.turns.get(source.id);
      if (!turn || source.quote === undefined) return false;
      const quote = normaliseForMatch(source.quote);
      if (quote.length < MIN_QUOTE_LENGTH) return false;
      return normaliseForMatch(turn.text).includes(quote) || normaliseForMatch(turn.translatedText).includes(quote);
    }
    case "kb":
      return evidence.kbIds.has(source.id);
    default:
      return false;
  }
}

// --- B1, live-card rules on top of isScriptLike -----------------------------------------------
// isScriptLike (packages/schemas) lets compare/challenge/evidence be statements (ISS-008) and only
// flags recital cues. A live card is still a script if it speaks in the counsellor's own voice, tells
// the student what to do, opens like a speech, or runs long.
// Unicode lookaround boundaries, not \b: "I-20" (the US visa form) and "i.e." are not the pronoun.
const COUNSELLOR_VOICE =
  /(?<![\p{L}\p{N}'-])(?:i|i'm|i'd|i'll|i've|me)(?![\p{L}\p{N}'.-])|\bmy (?:advice|suggestion|recommendation|view)\b|\bin my (?:opinion|view|experience)\b|\bwe (?:recommend|suggest|advise)\b|\bour (?:advice|recommendation)\b/iu;
const DIRECTIVE =
  /\b(you (?:should|must|need to|have to|ought to|had better|'d better)|you'd better|make sure (?:you|to)|don'?t worry|trust me|stay positive|be positive|everything will be (?:fine|ok(?:ay)?|alright)|go for it|just apply)\b/i;
// Hinglish recital cues ("student ko bolo ki ...", "unko samjhao ...") — the same "a line to deliver" as
// isScriptLike's English "tell the student", which does not cover Romanised Hindi.
// ISS-t-010-c2-1 parity: the Romanised mirror of the Devanagari polite imperative. Found by my own
// cycle-3 probe, not by a checker: "Family ko bata dijiye ki Canada sasta hai." missed every
// listed verb because the polite auxiliary "dijiye" ("please give/do") was not one of them, while
// its Devanagari spelling दीजिए was already covered. The alternation is morphological (the
// auxiliary, not the main verb) and it sits behind the addressee requirement.
const HINGLISH_RECITAL =
  /\b(?:(?:student|parents|bachche|family) ko|unko|usko|inko|isko|unhe|unhein|use)\b.{0,40}\b(?:bolo|bol do|boliye|batao|bata do|bataiye|bataye|samjhao|samjha do|samjhaiye|samjhaye|kaho|keh do|kahiye|dijiye|dijiyega|deejiye|de dijiye|de dena|dena)\b|\b(?:bolo|kaho|keh do|samjhao|bataiye|samjhaiye|kahiye|boliye|dijiye|dijiyega) ki\b/i;
const SALUTATION = /^(dear|hi|hello|hey|namaste|good (?:morning|afternoon|evening))\b/i;
const MAX_SENTENCES = 2;

// --- ISS-t-010-c0-1 (cycle-0 FAIL, B1): FORM, not punctuation ---------------------------------
// Cycle 0 delegated "is this a question?" to the shared guard, which only asks whether the prompt
// ENDS WITH "?". An imperative addressed to the counsellor therefore became a verified card the
// moment a question mark was appended ("Explain the tuition difference to the student?"), in
// English and in Devanagari. A question mark is not what makes something a question, and the north
// star ("never a script") must not be defeatable by one character. The three rules below are all
// punctuation-blind, and run on top of - never instead of - the shared guard.

// --- ISS-t-010-c1-1 (cycle-1 FAIL, B1): the cycle-1 rules were a verb allow-list, a word count
// and a comma. 25 of the checker's 28 hostile rows still leaked: "Recommend Canada over the UK?"
// (verb outside the 26-item list), "Canada is cheaper than the UK?" (a declarative short enough to
// take the elliptical hatch), "The student's intended major, computer science, is a strong fit for
// Canada?" (any auxiliary after a comma counted as inversion), and Devanagari recitals on statement
// card types (rule (c) covers question types only). Rules (a)-(d) below replace each of those
// proxies with a form test. -----------------------------------------------------------------

// --- ISS-t-010-c2-1 (cycle-2 FAIL, B1): the fail-closed claim was FALSE ------------------------
// Cycle 2's manifest said the deciding lexicon was a list of NON-verbs, so an unlisted opener
// failed closed. That described only the FIRST of isImperativeMood's two tests. The second was an
// allow-list on the token AFTER the verb (30 object heads + 6 particles + "capitalised"), so an
// imperative with a bare-NP object - the commonest object shape in English - failed OPEN on every
// card type: 11 of the checker's 14 rows leaked ("Recommend affordable options to the family.",
// "Push scholarships as the realistic answer."). The two preserved probe files scored 33/33 only
// because every row in them happened to have `the`/`her`/`out`/a capital in slot 2.
// Cycle 3 inverts that second test into a STOP-list, so the whole function now has exactly one
// direction: unless a listed non-verb opens the prompt, or a listed clause token follows the head,
// the prompt is treated as a possible imperative. Both lists name what is NOT an imperative, so an
// unlisted token fails CLOSED for real this time.

// (a) An imperative clause addressed to the counsellor: a bare-form verb in leading position with
// an object. The 26 known instruction verbs are kept as a guaranteed positive set, but they are no
// longer the test: ANY leading token that is morphologically a bare verb and is not a known
// non-verb opener counts, whatever follows it.
// w1-cards-b1: the list now lives in packages/schemas/src/guards.ts (INSTRUCTION_VERB_ALTERNATION),
// shared with the schema-level question-type guard instead of duplicated here.
const INSTRUCTION_VERB = INSTRUCTION_VERB_ALTERNATION;
const INSTRUCTION_TO_COUNSELLOR = new RegExp(
  "^(?:(?:please|kindly|now|first|then|next|also|maybe|perhaps|just)[,\\s]+)*(?:" + INSTRUCTION_VERB + ")(?![\\p{L}\\p{N}'-])",
  "iu",
);

/** Politeness / discourse openers that may precede the verb of an imperative. */
const LEADING_ADVERBS = /^(?:(?:please|kindly|now|first|firstly|then|next|also|maybe|perhaps|just|quickly|briefly|finally)\b[,\s]+)*/i;
/**
 * A comparison opener is allowed in leading position whatever the card type: B1 lets a compare
 * card be a statement, and "Compare the 20 lakh budget with ..." is a control row that must stay.
 */
// The opener must be the whole word followed by a space: cycle 2's `\b` matched the first segment
// of a hyphenated coinage, so "Contrast-check Canada against UK fees." was exempted (my own
// cycle-3 probe).
const COMPARISON_OPENER = /^(?:compare|contrast|weigh|versus|vs)(?=\s)/i;
/** The same openers as a bare alternation, for the hyphenated-head test below. */
const COMPARISON_VERB = "compare|contrast|weigh|versus|vs";
/**
 * Closed-class words plus the counselling nouns/adjectives that legitimately open a card. An opener
 * in this set is NOT a verb, so it cannot start an imperative. Everything else is treated as one
 * when an object follows (fails closed).
 */
const NON_VERB_OPENERS: ReadonlySet<string> = new Set([
  // determiners, quantifiers, pro-forms, existentials
  "the", "a", "an", "this", "that", "these", "those", "there", "here", "any", "some", "no", "none", "all",
  "both", "each", "every", "either", "neither", "another", "other", "such", "much", "many", "most", "more", "less",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "his", "hers", "its", "our", "ours", "my", "mine",
  "their", "theirs", "your", "yours", "them", "us", "one", "ones", "someone", "anyone", "everyone", "nobody",
  // auxiliaries and modals
  "is", "are", "was", "were", "am", "be", "been", "being", "do", "does", "did", "can", "could", "will", "would",
  "shall", "should", "may", "might", "must", "has", "have", "had", "ought", "need", "dare",
  // wh-words and question words (English, Hinglish)
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how", "whether",
  "kya", "kaun", "konsa", "kaunsa", "kab", "kahan", "kahaan", "kyun", "kyon", "kaise", "kitna", "kitni", "kitne",
  // prepositions, conjunctions, subordinators, discourse markers
  "about", "above", "across", "after", "against", "along", "among", "apart", "around", "as", "aside", "at",
  "because", "before", "behind", "below", "beside", "besides", "between", "beyond", "but", "by", "despite",
  "during", "except", "for", "from", "given", "if", "in", "including", "inside", "into", "like", "near", "of",
  "off", "on", "once", "onto", "or", "outside", "over", "per", "since", "so", "than", "though", "through",
  "throughout", "till", "to", "toward", "towards", "under", "unless", "until", "up", "upon", "versus", "via",
  "while", "with", "within", "without", "and", "nor", "yet", "still", "even", "only", "also", "instead",
  // counselling-domain nouns and adjectives that open the pre-brief's own labels and real cards
  "intake", "course", "courses", "budget", "destination", "visa", "english", "fees", "fee", "tuition", "marks",
  "grades", "grade", "score", "scores", "subject", "subjects", "major", "majors", "country", "countries",
  "deadline", "deadlines", "plan", "plans", "note", "notes", "route", "year", "years", "funding", "loan", "loans",
  "scholarship", "scholarships", "university", "universities", "college", "colleges", "timeline", "timelines",
  "option", "options", "student", "students", "parents", "family", "cost", "costs", "money", "rent", "living",
  "exam", "exams", "test", "tests", "result", "results", "profile", "session", "city", "cities", "campus",
  "board", "boards", "application", "applications", "admission", "admissions", "rent", "rents", "essay",
  "essays", "reference", "references", "right", "rights", "ranking", "rankings", "grant", "grants",
  "latest", "yearly", "monthly", "total", "overall", "current", "next", "last", "previous", "possible", "likely",
  "top", "best", "cheaper", "cheapest", "higher", "lower", "good", "better", "new", "old", "open", "short", "long",
  "pending", "outstanding", "remaining", "upcoming", "ongoing", "leading", "existing",
  // NB deliberately NOT here: "offer", "shortlist", "stream", "frame", "push", "pitch" - all of
  // them are bare verbs a planner could open an instruction with ("Offer 20 lakh as the working
  // figure.").
  "backup", "alternative", "alternatives", "entry", "band",
  // Place names. A country or study-destination city is a proper noun, never an English bare verb,
  // and with the second-token allow-list inverted (ISS-t-010-c2-1) an unlisted head + ANY following
  // token now reads as an imperative - which would have dropped "Canada over the UK?" and
  // "Ireland as a backup?", two legitimate elliptical cards. B1 loses nothing by listing them:
  // isScriptLike already allows a compare/evidence statement, so "Canada is cheaper than the UK."
  // was never this rule's to catch.
  "india", "bharat", "uk", "britain", "england", "scotland", "wales", "usa", "america", "canada", "australia",
  "zealand", "germany", "ireland", "singapore", "france", "netherlands", "holland", "uae", "dubai", "japan",
  "italy", "spain", "sweden", "finland", "norway", "denmark", "poland", "malaysia", "china", "switzerland",
  "austria", "belgium", "portugal", "london", "manchester", "birmingham", "toronto", "vancouver", "sydney",
  "melbourne", "dublin", "berlin", "boston", "delhi", "mumbai", "bangalore", "bengaluru", "chennai", "pune",
  "hyderabad", "kolkata", "ahmedabad", "jaipur", "lucknow", "kochi", "europe", "asia",
  // superlatives (NOT_BARE_FORM deliberately does not exclude "-est": "suggest" is a verb)
  "largest", "highest", "lowest", "earliest", "biggest", "smallest", "nearest", "safest", "strongest", "worst",
  "greatest", "fastest", "closest", "widest", "simplest", "hardest", "easiest", "shortest", "longest", "newest",
]);
/** Endings that rule a token out as a bare-form (imperative) verb. */
// "est" is NOT here: "suggest", "request", "invest" are bare verbs. Superlatives are listed as
// non-verb openers instead.
// ISS-t-010-c2-1: the bare `s` alternative is NARROWED, not kept. It used to exclude every genuine
// bare verb ending in a sibilant - "address", "press", "express", "assess", "dismiss", "discuss" -
// which is how "Address tuition worries with the parents." and "Press upon the family ..." were
// kept. It is now `[^s]s$`, so a DOUBLED -ss is a bare verb again while an ordinary plural noun
// ("Applications for this intake close this week.", "Post-study work rules ...") is still not a
// verb. I did NOT delete the alternative outright: measured, that reddens two existing B18 tests
// and 3 CARDS-EVAL rows on plural-noun heads. DISCLOSED RESIDUAL: a bare verb ending in a single
// -s ("focus", "bias", "canvas") is still excluded, so "Focus the family on Canada." is missed by
// rule (a). Three such verbs are plausible in counselling English; a following cycle that wants
// them must name plural nouns positively, not by suffix.
const NOT_BARE_FORM = /(?:[^s]s|ed|ing|ly|tion|sion|ment|ness|ity|ance|ence|ship|ful|ous|ive|able|ible)$/i;
/**
 * A hyphenated opener ("post-study", "pre-departure", "non-EU") is an attributive modifier, not an
 * imperative verb - unless its first segment is one of the 26 known instruction verbs, which keeps
 * "Stress-test her plan against the fees." an instruction.
 */
const HYPHENATED_NON_VERB = new RegExp("^(?!(?:" + INSTRUCTION_VERB + "|" + COMPARISON_VERB + ")-)[\\p{L}]+-[\\p{L}]", "iu");
const AUXILIARY = "is|are|was|were|am|do|does|did|can|could|will|would|shall|should|may|might|must|has|have|had";
/**
 * ISS-t-010-c2-1: the INVERSE of cycle 2's OBJECT_HEAD allow-list. A bare-form verb in leading
 * position is an imperative unless the very next token proves the head was a SUBJECT rather than a
 * verb - a finite auxiliary ("Canada is cheaper?"), a coordinator, a subordinator, a comparative
 * marker or a possessive clitic. Anything else - a bare noun, a bare plural, an adjective, a
 * numeral, a gerund, a preposition - is an object or a PP, so the prompt FAILS CLOSED as an
 * imperative. Cycle 2 had this the other way round and therefore leaked 11/14.
 */
const NOT_AN_OBJECT = new RegExp(
  "^(?:" +
    AUXILIARY +
    "|be|been|being|ain'?t|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|can'?t|won'?t|shan'?t|" +
    "shouldn'?t|couldn'?t|wouldn'?t|hasn'?t|haven'?t|hadn'?t|and|or|but|nor|than|because|unless|although|" +
    "though|whether|versus|vs|while|s|'s)$",
  "i",
);

/** True when the prompt is in the imperative mood: a bare-form verb in leading position + object. */
function isImperativeMood(own: string): boolean {
  const body = own.trim().replace(LEADING_ADVERBS, "");
  if (COMPARISON_OPENER.test(body)) return false;
  const tokens = body.split(/[\s]+/).filter((w) => w.length > 0);
  if (tokens.length < 2) return false;
  if (!leadsWithBareVerb(tokens)) return false;
  const next = (tokens[1] ?? "").replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
  if (next.length === 0) return false;
  return !NOT_AN_OBJECT.test(next);
}

/**
 * True when the first token could be a bare-form (imperative) verb: it is ASCII-alphabetic, it is
 * not a listed non-verb opener or known plural noun, and it does not inflect like a non-bare form.
 * Shared by rule (a) and by the elliptical-fragment hatch in rule (c), which must not admit a
 * prompt that opens with one (ISS-t-010-c2-1: "Recommend affordable options to the family?" was
 * affirmatively classed a question on a `widen` card).
 */
function leadsWithBareVerb(tokens: readonly string[]): boolean {
  // A trailing apostrophe is a possessive, not part of the word ("Parents' savings plan ...").
  const head = (tokens[0] ?? "").replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "").replace(/['-]+$/u, "");
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(head)) return false; // not ASCII-alphabetic: handled elsewhere
  const lower = head.toLowerCase();
  if (HYPHENATED_NON_VERB.test(lower)) return false;
  return !NON_VERB_OPENERS.has(lower) && !PLURAL_NOUN_EXCEPTIONS.has(lower) && !NOT_BARE_FORM.test(lower);
}

// (b) Devanagari recitals. Cycle 1 added an eight-stem lexicon, which left "दीजिए" ("give her this
// information") and "सुनाइए" ("read this line out to her") undefended - and, because rule (c)
// covers only the question card types, an `evidence` or `compare` card carrying one had NO defence
// at all. The stem list is kept, and a structural rule is added: an addressee in the dative
// ("छात्रा को", "उन्हें") plus any verb with a polite-imperative ending is a line to deliver,
// whatever the stem and whatever the card type - the Devanagari mirror of HINGLISH_RECITAL.
const DEVANAGARI_RECITAL =
  /(?:समझा|बता|कह|बोल|सुझा|जता|सिखा|दिला)(?:इए|इये|ाइए|ाइये|ईये|एँ|एं|ओ|ा दीजिए|ा दीजिये|ा दो|ा दें|ें)/u;
const DEVANAGARI_ADDRESSEE =
  // NB: \b is ASCII-word based and never fires after "को", so the boundary is an explicit
  // "no more Devanagari" lookahead.
  /(?:छात्रा|छात्र|विद्यार्थी|स्टूडेंट|बच्ची|बच्चे|बच्चा|माता|पिता|अभिभावक|परिवार|उन्हें|उनको|इन्हें|इनको|उसे|उसको|इसे|इसको|आप)\s*(?:को|से)(?![ऀ-ॿ])/u;
const DEVANAGARI_IMPERATIVE_VERB =
  /^[ऀ-ॿ]{2,}(?:ाइए|ाइये|इए|इये|ईये|ाएँ|ाएं|ाओ|िए|िये|दीजिए|दीजिये|दीजिएगा|दें|देना)(?:गा|गी|गे)?$/u;
/**
 * ISS-t-010-c2-1: the polite-imperative ending now fires WITHOUT an addressee. The cycle-2 scope
 * call ("a morphological imperative test is too large for a fix cycle") was judged and rejected by
 * the checker, correctly: the pattern already matched all four verbs in its rows (सुनाइए, दीजिए,
 * पढ़िए, दोहराइए) and only the addressee requirement stood between it and the disclosed residual,
 * which leaked on evidence/compare/challenge AND on clarify. A line ending in a polite imperative
 * is a line to deliver whether or not it names who to deliver it to.
 * The exclusions are the two very common non-imperative words that carry the same ending
 * ("चाहिए" = should, "इसलिए" = therefore); over-suppressing those would drop ordinary questions.
 */
const NOT_A_DEVANAGARI_IMPERATIVE: ReadonlySet<string> = new Set(["चाहिए", "चाहिये", "इसलिए", "इसलिये", "जिए", "जिये"]);
function isDevanagariRecital(own: string): boolean {
  if (DEVANAGARI_RECITAL.test(own)) return true;
  // With an addressee present the two exclusions no longer apply: "छात्रा को ... बताना चाहिए"
  // ("you should tell the student ...") is exactly the line-to-deliver shape.
  const addressed = DEVANAGARI_ADDRESSEE.test(own);
  for (const raw of own.split(/[\s।॥]+/)) {
    const word = raw.replace(/[^ऀ-ॿ]/gu, "");
    if (word.length === 0) continue;
    if (!addressed && NOT_A_DEVANAGARI_IMPERATIVE.has(word)) continue;
    if (DEVANAGARI_IMPERATIVE_VERB.test(word)) return true;
  }
  return false;
}

// (c) A question-type card must READ as a question, not merely end in one. Interrogative form is
// either an explicit marker (a wh-word, subject-auxiliary inversion, or a Hindi/Hinglish question
// word) or a noun-phrase FRAGMENT ("Intake year?", "Course or field of study?" - the pre-brief's
// own open questions). Cycle 1's hatch was a pure word count, which made every declarative of six
// words or fewer a question by fiat; the fragment test below asks about SHAPE instead.
// w1-cards-b1 (ISS-t-010-c0-1): a wh-word is an interrogative MARKER where it opens a clause - at
// the start of the prompt (after discourse words), after a comma/semicolon/colon/dash, or right after
// a preposition ("In which month ...?", "By when ...?") - or EMBEDDED anywhere when the prompt itself
// opens with a function word ("Any idea what the course looks like for her?", determiner head). An
// embedded wh after a CONTENT-word head is an instruction whose object is a wh-clause, not a
// question: "Question how much she can afford?" / "Caution about how much she can afford?".
const WH = "what|which|who|whom|whose|when|where|why|how";
const WH_PREPOSITION =
  "about|above|across|after|against|along|among|around|at|before|behind|below|beside|between|beyond|by|during|for|from|in|inside|into|near|of|on|onto|outside|over|per|since|through|throughout|to|toward|towards|under|until|upon|with|within|without";
const WH_ANYWHERE = /(?<![\p{L}\p{N}'-])(?:what|which|who|whom|whose|when|where|why|how)(?![\p{L}\p{N}'-])/iu;
const WH_CLAUSE_INITIAL = new RegExp(
  "(?:^(?:(?:so|and|but|now|then|also|ok(?:ay)?)[,\\s]+)*|[,;:—–]\\s*|\\s[-—–]\\s+)(?:(?:" +
    WH_PREPOSITION +
    ")\\s+)?(?:" +
    WH +
    ")(?![\\p{L}\\p{N}'-])",
  "iu",
);
// AUXILIARY is declared with NOT_AN_OBJECT above (rule (a) needs it first).
/**
 * Subject-auxiliary inversion, anchored to the CLAUSE. Cycle 1's prefix was `(?:^|[,;:]\s*)`, so
 * any auxiliary after any comma counted - an appositive ("The student's intended major, computer
 * science, is a strong fit for Canada?") or a parenthetical ("Her plan, as recorded, is to leave in
 * 2027?") read as a question. Inversion counts only at the start of the prompt, or after a FRONTED
 * ADJUNCT - material that opens with a preposition or subordinator, never with a subject NP.
 * "Besides the UK, has the student looked at Ireland?" still qualifies; the two rows above do not.
 */
const FRONTED_ADJUNCT_OPENER =
  "about|above|across|after|against|along|among|amid|apart from|around|as|aside from|at|because of|before|behind|below|beneath|beside|besides|between|beyond|by|despite|due to|during|even if|except|following|for|from|given|if|in|including|inside|instead of|into|near|now that|of|on|once|other than|outside|over|per|prior to|rather than|regarding|since|so far|thanks to|through|throughout|to|toward|towards|under|unless|until|upon|when|whenever|while|with|within|without";
const SUBJECT_AUX_INVERSION = new RegExp(
  "^(?:(?:so|and|but|now|then|also|ok(?:ay)?)[,\\s]+)*(?:(?:" +
    FRONTED_ADJUNCT_OPENER +
    ")(?![\\p{L}\\p{N}'-])[^,;:]*[,;:]\\s*)?(?:" +
    AUXILIARY +
    ")n?'?t?(?![\\p{L}\\p{N}'-])",
  "iu",
);
const HINDI_INTERROGATIVE =
  /क्या|कौन|कब|कहाँ|कहां|क्यों|क्यूँ|कैसे|कैसा|कैसी|कितन|किस|(?<![\p{L}])(?:kya|kaun ?sa|kaun|konsa|kab|kahan|kahaan|kyun|kyon|kaise|kitna|kitni|kitne)(?![\p{L}])/iu;
/**
 * A fragment carries no predicate: no finite verb, no subject pronoun, no degree/comparative
 * complement. Any of these tokens means the prompt is a clause, so the elliptical hatch is closed
 * to it - "Canada is cheaper than the UK?", "The UK is too expensive?" and "Germany suits her
 * budget better?" are declaratives, not elliptical questions.
 */
// ISS-t-010-c2-3: the possessive/object pronouns (her, his, their, my, them ...), the comparative
// markers (more, less, better, cheaper ...) and "than"/"instead"/"rather" are GONE from this list.
// None of them is a predicate - they are determiners and degree words that occur in perfectly
// ordinary fragments - and they were dropping 8 of 20 legitimate elliptical cards ("Other
// countries within her budget?", "Cheaper options than the UK?", "More affordable countries?",
// "Her intake year?"). The declaratives they were meant to catch are caught by their actual finite
// verb: "Canada is cheaper than the UK?" by `is`, "Germany suits her budget better?" by `suits`.
const FINITE_OR_PREDICATE_TOKEN = new RegExp(
  "^(?:" +
    AUXILIARY +
    "|be|been|being|ain'?t|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|can'?t|won'?t|shouldn'?t|" +
    "i|you|he|she|it|we|they|" +
    "too|enough|because|unless|although|though|whether|very)$",
  "i",
);
/** Plural nouns that end in -s and are NOT a third-person verb in a fragment. */
const PLURAL_NOUN_EXCEPTIONS: ReadonlySet<string> = new Set([
  "fees", "marks", "grades", "results", "exams", "options", "scores", "costs", "years", "months", "dates",
  "deadlines", "plans", "notes", "parents", "savings", "loans", "documents", "requirements", "scholarships",
  "universities", "countries", "courses", "colleges", "subjects", "intakes", "cities", "programmes", "programs",
  "degrees", "majors", "streams", "details", "basics", "studies", "others", "campuses", "schools", "boards",
]);
/**
 * w1-cards-b1 (ISS-t-010-c0-1): STRUCTURAL verb + object test for the fragment hatch. A content word
 * (anything that is not a preposition, conjunction, auxiliary, pronoun or determiner) directly
 * followed by an object determiner or object pronoun is a transitive verb with its object, whatever
 * the verb is: "Plan her intake first?", "Cost the whole degree?", "Caution the family about visas?",
 * "Sanction one more year ...?". A noun phrase never has that junction ("Her intake year", "Funding
 * options for the family": there the determiner follows a PREPOSITION, which is exempt). It consults
 * no verb list, so it holds for the noun/verb homographs and the -tion/-able heads that the
 * NON_VERB_OPENERS / NOT_BARE_FORM escape hatches wave through. DISCLOSED RESIDUAL: a homograph verb
 * whose object is a bare noun ("Question parents about fees?") has no such junction; the mandatory
 * semantic verifier (nodes.ts) is the only defence there.
 */
const OBJECT_DETERMINER: ReadonlySet<string> = new Set([
  "the", "a", "an", "this", "these", "those", "her", "his", "their", "its", "our", "my", "your",
  "them", "him", "us", "me", "one", "another", "any", "some", "every", "each",
]);
const FUNCTION_WORD: ReadonlySet<string> = new Set([
  ...OBJECT_DETERMINER, "that", "all", "both", "no", "i", "you", "he", "she", "it", "we", "they",
  "is", "are", "was", "were", "am", "be", "been", "do", "does", "did", "can", "could", "will", "would",
  "shall", "should", "may", "might", "must", "has", "have", "had", "and", "or", "but", "nor", "so", "if",
  "than", "as", "like", "because", "while", "though", "although", "unless", "whether", "versus", "vs",
  ...WH_PREPOSITION.split("|"), "besides", "despite", "except", "given", "including", "instead", "rather",
  "beneath", "amid", "till", "via", "off", "up", "out", "down",
]);
function hasVerbObjectJunction(tokens: readonly string[]): boolean {
  const norm = tokens.map((t) => t.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase());
  for (let i = 0; i < norm.length - 1; i += 1) {
    const word = norm[i] ?? "";
    if (word.length === 0 || FUNCTION_WORD.has(word)) continue;
    if (OBJECT_DETERMINER.has(norm[i + 1] ?? "")) return true;
  }
  return false;
}

/** A fragment stays short by nature; the shape test above is what decides, this is a sanity bound. */
const MAX_ELLIPTICAL_QUESTION_WORDS = 6;
/** The card types the contract requires to BE questions (guards.ts QUESTION_TYPES). */
const QUESTION_CARD_TYPES: ReadonlySet<Card["type"]> = new Set(["widen", "clarify", "check-in"]);

/**
 * ISS-t-010-c2-1 / c2-3, three changes:
 *   - a prompt containing ANY Devanagari is not judged by this test at all. Every rule in it is
 *     ASCII-based, so a Devanagari prompt matched nothing and was classed "a fragment", i.e. a
 *     question - which is why a Devanagari recital leaked on a `clarify` card. Refusing to judge
 *     is the fail-closed answer; the Hindi/Hinglish interrogative markers in `isInterrogativeForm`
 *     run first and are what a genuine Devanagari question is recognised by.
 *   - a prompt that opens with a bare-form verb is not a fragment, whatever follows it. Cycle 2
 *     affirmatively admitted "Recommend affordable options to the family?" as a question.
 *   - the verb-shape heuristics skip tokens already known to be non-verbs, which is what makes the
 *     preposition `as` a preposition again ("Ireland as a backup?" was rejected because `as` ends
 *     in a non-doubled -s) and lets the ordinary noun openers "Living costs", "Funding options"
 *     through.
 */
function isNounPhraseFragment(own: string): boolean {
  if (/[ऀ-ॿ]/u.test(own)) return false;
  const tokens = own.trim().split(/\s+/).filter((w) => w.length > 0);
  if (tokens.length === 0 || tokens.length > MAX_ELLIPTICAL_QUESTION_WORDS) return false;
  if (leadsWithBareVerb(tokens)) return false;
  if (hasVerbObjectJunction(tokens)) return false;
  for (let i = 0; i < tokens.length; i += 1) {
    const word = (tokens[i] ?? "").replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
    if (word.length === 0) continue;
    if (FINITE_OR_PREDICATE_TOKEN.test(word)) return false;
    if (NON_VERB_OPENERS.has(word) || PLURAL_NOUN_EXCEPTIONS.has(word)) continue;
    if (/(?:ed|ing)$/.test(word) && word.length > 4) return false;
    // a non-final token ending in -s that is not a known plural noun reads as a finite verb
    if (i < tokens.length - 1 && /[^s]s$/.test(word)) return false;
  }
  return true;
}

// w1-cards-b1 (ISS-t-010-c0-1): Romanised Hindi. The fragment hatch above is an ENGLISH noun-phrase
// test; a Hinglish prompt ("Parents ko fees ka breakdown dikhao?") parses as a "fragment" because none
// of its tokens is an English verb. A Hinglish prompt (it carries a postposition or copula - a closed
// grammatical class, not a verb lexicon) is therefore a question only on an explicit Hindi
// interrogative word AND only if it is not itself imperative: a polite/plural imperative ending
// (-ao, -iye, -ijiye, -iyega), a light verb "do/lo/dena/lena" after a stem, or a "-na" infinitive used
// as an instruction ("batana"). "chahiye" ("should/need") ends in -iye but is not an imperative.
const HINGLISH_MARKER =
  /(?<![\p{L}])(?:ko|ka|ki|ke|se|mein|pe|ne|tak|liye|baare|hai|hain|tha|thi|hoga|hogi|nahi|nahin|aur|bhi|toh|karo|kiya|kya)(?![\p{L}])/iu;
const HINGLISH_IMPERATIVE =
  /(?<![\p{L}])(?:(?!chahi)\p{L}{2,}(?:ao|iye|ijiye|iyega|ijiyega|iyo)|(?:kar|de|bata|bol|likh|dikha|samjha|puch|pooch|bhej|dekh|sun)\s+(?:do|dena|lo|lena)|(?:bata|bol|likh|dikha|samjha|puch|pooch|bhej|dekh)na|karo|bolo|likho|dekho|suno|pucho|poocho|bhejo|chalo|rakho|kaho)(?![\p{L}])/iu;

function isInterrogativeForm(own: string): boolean {
  const hinglish = HINGLISH_MARKER.test(own);
  if (hinglish && HINGLISH_IMPERATIVE.test(own)) return false;
  const head = (own.trim().split(/\s+/)[0] ?? "").replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
  const whMarker = WH_CLAUSE_INITIAL.test(own) || (FUNCTION_WORD.has(head) && WH_ANYWHERE.test(own));
  if (whMarker || SUBJECT_AUX_INVERSION.test(own.trim()) || HINDI_INTERROGATIVE.test(own)) return true;
  if (hinglish) return false;
  return isNounPhraseFragment(own);
}

/** The first B1 reason a prompt is script-like, or null. `type` as in CardSchema. */
export function liveScriptReason(prompt: string, type: Card["type"]): string | null {
  const trimmed = prompt.trim();
  if (trimmed.length > MAX_CARD_PROMPT_LENGTH) return "too long for a card";
  const own = withoutQuotes(trimmed);
  if (SALUTATION.test(own.trim())) return "opens like a speech";
  if (COUNSELLOR_VOICE.test(own)) return "speaks in the counsellor's own voice";
  if (DIRECTIVE.test(own)) return "tells the student what to do";
  if (HINGLISH_RECITAL.test(own)) return "a line to deliver (Hinglish)";
  // ISS-t-010-c0-1 / ISS-t-010-c1-1: form, not punctuation - these ignore the trailing "?"
  // entirely, and (a) and (b) apply to EVERY card type, statements included.
  if (INSTRUCTION_TO_COUNSELLOR.test(own.trim()) || isImperativeMood(own)) {
    return "an instruction to the counsellor, not a card";
  }
  if (isDevanagariRecital(own)) return "a line to deliver (Devanagari)";
  if (QUESTION_CARD_TYPES.has(type) && !isInterrogativeForm(own)) return "not interrogative: a statement with a '?' appended";
  const sentences = own.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length > MAX_SENTENCES) return "more than two sentences";
  if (!CardSchema.safeParse({ id: "x", type, prompt: trimmed, sources: [{ type: "x", id: "x" }], confidence: 0 }).success) {
    return "isScriptLike";
  }
  return null;
}

/** A stable card id (FeedbackEvent.cardId): same session, type and prompt -> same id. */
export function cardId(sessionId: string, type: string, prompt: string): string {
  const digest = createHash("sha256").update(`vc-card-v1|${sessionId}|${type}|${normaliseForMatch(prompt)}`).digest("hex");
  return `card_${digest.slice(0, 24)}`;
}

export interface VerifyInput {
  sessionId: string;
  /** Raw planner items, unknown until parsed. A planner "check-in" fails the shape (only a concern flag makes one). */
  candidates: unknown[];
  /**
   * The deterministic concern check-in cards (T-022 / B20), built by nodes.ts from the crisis
   * guard's concern records. They skip B18 (a concern check-in always applies) but pass B1 and B2
   * exactly like every other card, and are verified FIRST so the cap never hides them.
   */
  checkIns?: readonly { type: "check-in"; prompt: string; sources: CardSource[]; confidence: number }[];
  evidence: EvidenceIndex;
  relevance: RelevanceContext;
}

function citedTopics(sources: readonly CardSource[], evidence: EvidenceIndex): Set<Topic> {
  const out = new Set<Topic>();
  for (const s of sources) {
    if (s.type !== "profile") continue;
    const fact = evidence.facts.get(s.id);
    const topic = fact ? topicOfKey(fact.key) : null;
    if (topic) out.add(topic);
  }
  return out;
}

const CheckInCandidateSchema = CandidateCardSchema.extend({ type: CardTypeSchema.extract(["check-in"]) });

/** Runs rules 1-5 over every candidate, in order. Returns only verified cards plus the drops. */
export function verifyCards(input: VerifyInput): VerifyOutput {
  const kept: Card[] = [];
  const dropped: DroppedCard[] = [];
  const seen = new Set<string>();

  const queue: { raw: unknown; checkIn: boolean }[] = [
    ...(input.checkIns ?? []).map((raw) => ({ raw: raw as unknown, checkIn: true })),
    ...input.candidates.map((raw) => ({ raw, checkIn: false })),
  ];
  for (const { raw, checkIn } of queue) {
    const parsed = checkIn ? CheckInCandidateSchema.safeParse(raw) : CandidateCardSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ reason: "invalid_shape" });
      continue;
    }
    const cand: { type: Card["type"]; prompt: string; sources: CardSource[]; confidence: number } = parsed.data;
    const id = cardId(input.sessionId, cand.type, cand.prompt);
    const tag = { cardId: id, type: cand.type };

    if (liveScriptReason(cand.prompt, cand.type) !== null) {
      dropped.push({ ...tag, reason: "script_like" });
      continue;
    }
    if (cand.sources.length === 0) {
      dropped.push({ ...tag, reason: "uncited" });
      continue;
    }
    if (!cand.sources.every((s) => resolveSource(s, input.evidence))) {
      dropped.push({ ...tag, reason: "unresolved_source" });
      continue;
    }
    if (!checkIn) {
      const drop = relevanceDrop(cand, input.relevance, citedTopics(cand.sources, input.evidence));
      if (drop) {
        dropped.push({ ...tag, reason: drop });
        continue;
      }
    }
    if (seen.has(id)) {
      dropped.push({ ...tag, reason: "duplicate" });
      continue;
    }
    // B5 + B1 once more at the boundary: a kept card is a full CardSchema card.
    const card = CardSchema.parse({ id, type: cand.type, prompt: cand.prompt.trim(), sources: cand.sources, confidence: cand.confidence });
    seen.add(id);
    kept.push(card);
  }
  return VerifyOutputSchema.parse({ kept, dropped });
}
