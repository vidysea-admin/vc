/**
 * Hard-rule code guard for contract B9 (crisis) — a distress or self-harm signal must route to an
 * escalation card before any generative call, deterministically, so a real signal can never be
 * missed because a model chose not to flag it (H5/D-005). Regex-only by design (ARCHITECTURE.md H5,
 * same honest-scope tradeoff as the ported source): false positives are the safe failure mode here.
 *
 * `crisisGuard`'s CRISIS_PATTERNS + REDIRECT_MESSAGE are ported as-is from
 * `D:/vidysea/ikigai-counsellor/src/services/crisis-guard.ts` (H6, reuse not rebuild) — English,
 * romanised Hindi/Hinglish, and abuse-signal patterns. CONCERN_PATTERNS is new here: ikigai's guard
 * only had a single crisis/no-crisis boolean; this engine adds a softer "concern" tier (academic
 * stress / hopelessness language that is not itself a self-harm or abuse signal) so the counsellor
 * gets a gentler nudge rather than either silence or the full crisis redirect.
 *
 * ISS-023 (a prior unit) added Devanagari and indirect-Hinglish CRISIS/CONCERN patterns on top of
 * the ported base, plus a squeezed-substring fallback for letter-spaced evasion of the clearest
 * English signals ("k i l l myself" -> "killmyself"). See the crisis-vs-concern classification
 * table below the pattern lists.
 *
 * D-020 / qa/gates/crisis-guard-precision.md (2026-09-26, Umesh): this guard matches for RECALL
 * ONLY and suppresses nothing. A prior unit (T-005b) spent three fix cycles building sentence-
 * boundary suppression (a capitalisation-gated "is this a new sentence?" heuristic, an infinitive
 * exception, a zero-width join-point lookbehind) to cut the false alarms below — every fix closed
 * one recall hole ("I hurt. Myself", "kill. myself") only by opening another (a stop followed by a
 * space hid the pattern's own trigger words; Devanagari has no case, so its "is this a new
 * sentence?" gate never fired at all; the final lookbehind was quadratic on stacked combining
 * marks). Full diagnosis: qa/debug/t-005b-guard-hardening-cycle3.md. This unit (T-005c) supersedes
 * T-005b: every pattern runs against the WHOLE turn, flattened exactly like the pre-boundary-
 * suppression base below — sentence punctuation is folded away exactly like whitespace, same as
 * every other separator. The false alarms this reopens ("hurt my self-esteem", "attend it all", "an
 * end. It all comes together") are the accepted safe direction (B9: false positives are the safe
 * failure mode) and are captured as documented expected flags in the test suite and the crisis eval
 * set, not suppressed. A later, non-blocking layer (T-012's classifier, B16) may mark a flag
 * "reviewed, likely benign" for the counsellor — it may never hide it.
 *
 * Kept from the stalled t-005b branch, because they are recall devices, not suppression (the three
 * pieces named in the D-020 answer):
 *   - invisible Unicode format characters (zero-width joins: ZWSP, ZWNJ, ZWJ, word joiner, BOM,
 *     soft hyphen, bidi marks — category Cf) are DELETED, not turned into a separator, before any
 *     other normalisation. This matters beyond the English \s+ patterns below (which would recover
 *     the keyword anyway once every separator collapses to one space): the Devanagari patterns are
 *     plain literal substrings with NO \s+ tolerance between their characters, so "आत्म<ZWJ>हत्या"
 *     only reforms into the literal "आत्महत्या" the direct patterns expect if the zero-width
 *     character disappears outright.
 *   - every other separator — whitespace (including a newline), sentence punctuation, an ellipsis —
 *     folds into the same single space, so pressing Enter mid-phrase or a "." between two words
 *     never manufactures a gap the patterns can't cross.
 *   - runs of single-letter tokens ("k i l l", "k.i.l.l", "b e a t s") collapse into one word, so
 *     letter-spacing evasion is caught by the ordinary CRISIS_PATTERNS/CONCERN_PATTERNS regexes
 *     directly (`collapseLetterSpacedRuns`) — not only by the narrow, English-only
 *     SQUEEZED_CRISIS_SUBSTRINGS list below, which has no Devanagari or Hinglish entries.
 * Deliberately NOT ported from that branch: `isStrongBoundary`, the capitalisation/infinitive gate,
 * `FORMAT_RUN_BETWEEN_WORDS`'s quadratic lookbehind, `squeezedAcrossWholeFragments`'s join-point
 * logic, and `SELF_COMPOUND` — every one of those existed only to suppress a match, which is exactly
 * the mechanism D-020 removed.
 */

export type CrisisLevel = "none" | "concern" | "crisis";

export interface CrisisCheckResult {
  level: CrisisLevel;
  matched: string[];
}

export interface EscalationCard {
  type: "escalation";
  level: "concern" | "crisis";
  message: string;
  matched: string[];
}

export type RouteResult = { route: "escalate"; card: EscalationCard } | { route: "continue" };

// Ported verbatim from ikigai-counsellor's crisis-guard.ts (H6).
const CRISIS_PATTERNS: readonly RegExp[] = [
  // English — suicidal ideation / self-harm
  /\b(want|going|gonna|trying|wanna)\s+to\s+(die|kill myself|end (it|my life))\b/i,
  /\bkill\s+myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bno\s+(point|reason)\s+(in\s+)?(living|being alive)\b/i,
  /\bcan'?t\s+(go on|keep going|do this any ?more)\b/i,
  /\bend\s+(it\s+all|my\s+life)\b/i,
  /\b(cut|cutting|hurt|hurting|harm|harming)\s+myself\b/i,
  // Romanised Hindi (Hinglish) — common patterns
  /\b(marna|maut)\s+(chah|chahta|chahti|chahiye)\b/i,
  /\bjeene?\s+ka\s+(mann|man|dil|fayda)\s+(nahi|nahin|na|nai)\b/i,
  /\bkhud\s+ko\s+(khatam|maar|marne|mara|maarn)\w*\b/i,
  /\bzindagi\s+(khatam|bekaar|bekar|bekār)\b/i,
  /\bsab\s+kuch\s+khatam\b/i,
  // Abuse signals (more conservative — single keyword w/ context)
  /\b(beats|beating|hits|hitting)\s+me\b/i,
  /\bbeing\s+abused\b/i,
  /\b(mujhe|mere\s+saath)\s+(maarta|maarti|peetata|peet)\w*\b/i,

  // --- ISS-023: indirect romanised Hinglish -----------------------------------------------------
  // "sab khatam kar dunga/dungi" — an explicit first-person intent to end everything, distinct
  // from the already-present "sab kuch khatam" (a bare hopelessness statement with no "kar
  // dunga/dungi" intent verb attached).
  /\bsab\s+khatam\s+kar\s+(dunga|dungi|doonga|doongi)\b/i,
  // "marne ka mann (kar raha hai)" — a stated wish/inclination toward dying, not merely fatigue.
  /\bmarne\s+ka\s+man+\b/i,
  // "jeena nahi chahta/chahti" — an explicit "don't want to live" statement.
  /\bjeena\s+nahi[n]?\s+chaht[ai]\b/i,

  // --- ISS-023: Devanagari -----------------------------------------------------------------------
  // \b is not used here — JS's default \b is defined over ASCII word chars ([A-Za-z0-9_]) and does
  // not treat Devanagari code points as word characters, so it would silently fail to match at
  // Devanagari word edges. Devanagari script is unambiguous enough here that plain substring
  // matching (with \s+ only for the internal word gap) is safe.
  /मरना\s+चाहत[ाी]/, // "marna chahta/chahti" — want to die
  /आत्महत्या/, // "aatmahatya" — suicide
  /खुद\s+को\s+खत्म/, // "khud ko khatam" — end oneself
  /जीना\s+नहीं\s+चाहत[ाी]/, // "jeena nahi chahta/chahti" — don't want to live
];

// New in this engine (not in ikigai's source) — softer distress language: stressed/hopeless/
// overwhelmed, but not itself a self-harm, suicide, or abuse signal. Deliberately narrower than the
// crisis list so ordinary frustration ("I'm dying to go to LSE") never lands here either.
const CONCERN_PATTERNS: readonly RegExp[] = [
  /\bi\s+feel\s+(so\s+)?(hopeless|worthless|empty)\b/i,
  /\bi\s+feel\s+like\s+giving\s+up\b/i,
  /\bnobody\s+(cares|understands|listens\s+to\s+me)\b/i,
  /\bi\s+can'?t\s+(take|handle)\s+(this|it)\s+anymore\b/i,
  /\bso\s+much\s+(pressure|stress)\s+i\s+can'?t\s+(cope|breathe)\b/i,
  /\bbahut\s+tension\s+(hai|ho\s+rahi\s+hai)\b/i,
  /\bmann\s+nahi\s+lag\s+raha\b/i,
  // ISS-023: "zindagi se thak gaya/gayi" — tired-of-life exhaustion/hopelessness. See the
  // crisis-vs-concern table below for why this is concern, not crisis.
  /\bzindagi\s+se\s+thak\s+(gaya|gayi|gya|gyi)\b/i,
  // ISS-023: Devanagari "bahut tension" — mirrors the existing Hinglish concern pattern above.
  // No \b (see the CRISIS_PATTERNS Devanagari note) — plain substring matching is safe here.
  /बहुत\s+टेंशन/,
];

// ISS-023 crisis-vs-concern classification table for the new phrases above (per-phrase reasoning,
// not just a bucket list — the deciding question is "does the phrase itself assert an intent or
// wish toward death/ending life?"):
//
// | phrase                                    | script     | level   | why                                          |
// |--------------------------------------------|------------|---------|----------------------------------------------|
// | sab khatam kar dunga/dungi                  | Hinglish   | crisis  | first-person intent verb ("I will end ...")  |
// | marne ka mann (kar raha hai)                | Hinglish   | crisis  | explicit wish/inclination to die             |
// | jeena nahi chahta/chahti                    | Hinglish   | crisis  | explicit "don't want to live"                |
// | zindagi se thak gaya/gayi                   | Hinglish   | concern | exhaustion/hopelessness, no death assertion  |
// | मरना चाहता/चाहती (marna chahta/chahti)        | Devanagari | crisis  | explicit "want to die"                       |
// | आत्महत्या (aatmahatya)                       | Devanagari | crisis  | direct word for suicide                      |
// | खुद को खत्म (khud ko khatam)                  | Devanagari | crisis  | explicit "end myself", mirrors existing Hinglish pattern |
// | जीना नहीं चाहता/चाहती (jeena nahi chahta/chahti) | Devanagari | crisis  | explicit "don't want to live"                |
// | बहुत टेंशन (bahut tension)                    | Devanagari | concern | academic-stress language, mirrors Hinglish "bahut tension" — no death assertion |

// ISS-023: substrings matched against the fully-squeezed (every separator in the whole turn
// removed, not just collapsed to one space) text, as a fallback for the case where an ENTIRE
// multi-word phrase is letter- or format-spaced ("e n d i t a l l", "attend<ZWSP>it<ZWSP>all") —
// once every separator disappears the phrase reforms as one run no \s+-based CRISIS_PATTERNS entry
// can match, since the space that used to sit between what were "end"/"it"/"all" is gone too.
// Deliberately a short list of unambiguous, high-signal substrings only: because squeezing an
// entire turn destroys every word boundary in it, an ordinary sentence can end up with two
// unrelated words landing next to each other here in a way `collapseLetterSpacedRuns` (below,
// scoped to single-letter runs only) cannot produce. That is a known, accepted trade for recall —
// see the D-020 note above and the crisis-eval hard_negative rows this reopens.
const SQUEEZED_CRISIS_SUBSTRINGS: readonly string[] = [
  "killmyself",
  "suicidal",
  "suicide",
  "enditall",
  "hurtmyself",
  "harmmyself",
  "cuttingmyself",
];

const CRISIS_MESSAGE = [
  "Hey — what you just shared matters more than this session.",
  "I'd really like you to talk to someone who can help right now.",
  "iCALL is free, confidential, and trained for exactly this — you can call them at 9152987821 anytime.",
  "If you're in immediate danger, please call 112.",
  "Want to pause our session and pick it up another day? You're not alone.",
].join(" ");

const CONCERN_MESSAGE = [
  "This turn matched a distress signal — it's not an emergency-level flag, but worth a direct check-in.",
  "Ask the student how they're really doing before moving on to the next topic.",
  "iCALL (9152987821) is free and confidential if they want to talk to someone outside this session.",
].join(" ");

/**
 * Unicode format characters (category Cf: ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D, word joiner
 * U+2060, BOM U+FEFF, soft hyphen U+00AD, bidi marks, ...) are invisible, so a student — or an
 * evasion attempt — can drop one inside a keyword without changing what is displayed on screen.
 * They are DELETED (not replaced by a space) before anything else runs, so "आत्म<ZWJ>हत्या" and
 * "ki<ZWSP>ll" both reform into their unbroken literal form first. This single linear pass (no
 * lookaround, no variable-length quantifier) is what keeps this guard fast on zalgo-style input —
 * a prior design's equivalent fix used a lookbehind/lookahead pair with a `\p{M}*` quantifier on
 * both sides, which was quadratic on heavily-stacked combining marks (see D-020 note above).
 */
const INVISIBLE_FORMAT_CHARS = /\p{Cf}/gu;

/**
 * A word: letters, combining marks (Devanagari matras/virama live in \p{M}, not \p{L} — dropping
 * them silently breaks every Devanagari word) and digits, with inner apostrophes kept so "can't"
 * still matches `can'?t`.
 */
const NON_WORD_RUN = /[^\p{L}\p{M}\p{N}']+/gu;

/** Every character kept by `squeeze()` — letters, combining marks and digits, no apostrophe. */
const NON_SQUEEZE_RUN = /[^\p{L}\p{M}\p{N}]+/gu;

/** One letter plus any combining marks: the unit of letter-spacing evasion ("k i l l"). */
const SINGLE_LETTER_TOKEN = /^\p{L}\p{M}*$/u;

/**
 * Step 1 (recall, not suppression): NFC-normalise, delete invisible format characters, lowercase
 * (a safe no-op on Devanagari, which has no case), then collapse every remaining separator —
 * whitespace including a newline, sentence punctuation, an ellipsis, anything that is not a
 * letter/mark/digit/apostrophe — down to a single space. This is what lets "kill. myself",
 * "kill\nmyself" and "kill....myself" all match the same `\bkill\s+myself\b` pattern as an
 * ordinary "kill myself": sentence punctuation is folded away exactly like any other separator,
 * never treated as a boundary a pattern cannot cross (D-020).
 */
function normalise(text: string): string {
  return text
    .normalize("NFC")
    .replace(INVISIBLE_FORMAT_CHARS, "")
    .toLowerCase()
    .replace(NON_WORD_RUN, " ")
    .trim();
}

/**
 * Step 2 (recall): collapses each run of 2+ adjacent single-letter tokens ("k i l l", "k.i.l.l"
 * once `normalise()` has already turned every separator into a plain space, "b e a t s") into one
 * word, whatever separator used to sit between the letters. A multi-letter word is never touched,
 * so "harm my self-worth" can never become "harmmyself" *here* (the fully-squeezed view below is
 * the one place multi-word runs do glue together, by design — see its own comment). This is what
 * lets ordinary CRISIS_PATTERNS/CONCERN_PATTERNS regexes (which need a real `\s+` between two
 * words, e.g. `\bbeats\s+me\b`) catch letter-spacing evasion directly, including for Devanagari and
 * Hinglish phrases that have no entry in the narrow, English-only SQUEEZED_CRISIS_SUBSTRINGS list.
 */
function collapseLetterSpacedRuns(normalised: string): string {
  if (normalised.length === 0) return normalised;
  const tokens = normalised.split(" ");
  const out: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    let end = index;
    if (SINGLE_LETTER_TOKEN.test(tokens[index])) {
      while (end + 1 < tokens.length && SINGLE_LETTER_TOKEN.test(tokens[end + 1])) end++;
    }
    out.push(end > index ? tokens.slice(index, end + 1).join("") : tokens[index]);
    index = end + 1;
  }
  return out.join(" ");
}

/**
 * Step 3 (recall, narrow use — see SQUEEZED_CRISIS_SUBSTRINGS): strips every remaining separator
 * from the WHOLE turn, so a multi-word phrase that is fully letter- or format-spaced across a word
 * gap ("e n d i t a l l") still reforms into a substring the short, unambiguous list above can
 * match, at the accepted cost that two unrelated adjacent words can now glue together too.
 */
function squeeze(normalised: string): string {
  return normalised.replace(NON_SQUEEZE_RUN, "");
}

function matchAll(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

/**
 * Deterministic sweep over a single turn's text (D-020: recall only, nothing suppressed). Crisis-
 * level patterns take priority over concern-level ones — a turn that matches both is reported as
 * "crisis" only, since that is the severity the counsellor needs to act on. Every regex runs
 * against both the plain normalised view and the letter-spacing-collapsed view (so a collapse can
 * only ADD a match, never hide one the plain view had); the squeezed-substring fallback runs once
 * against the whole turn.
 */
export function crisisGuard(text: string): CrisisCheckResult {
  if (!text || text.trim().length === 0) {
    return { level: "none", matched: [] };
  }

  const normalised = normalise(text);
  if (normalised.length === 0) {
    return { level: "none", matched: [] };
  }
  const collapsed = collapseLetterSpacedRuns(normalised);
  const squeezed = squeeze(normalised);

  const crisisMatched = new Set<string>();
  const concernMatched = new Set<string>();

  const views = collapsed === normalised ? [normalised] : [normalised, collapsed];
  for (const view of views) {
    for (const source of matchAll(view, CRISIS_PATTERNS)) crisisMatched.add(source);
    for (const source of matchAll(view, CONCERN_PATTERNS)) concernMatched.add(source);
  }
  for (const substring of SQUEEZED_CRISIS_SUBSTRINGS) {
    if (squeezed.includes(substring)) crisisMatched.add(`squeezed:${substring}`);
  }

  if (crisisMatched.size > 0) {
    return { level: "crisis", matched: [...crisisMatched] };
  }
  if (concernMatched.size > 0) {
    return { level: "concern", matched: [...concernMatched] };
  }

  return { level: "none", matched: [] };
}

/**
 * The hard-rule routing decision (contract B9): run this before any generative call. A distress or
 * self-harm signal short-circuits straight to an `EscalationCard` — the graph must not proceed with
 * the normal widen/challenge/compare/evidence flow in the same turn (see skills/safety-escalation).
 */
export function routeBeforeGeneration(text: string): RouteResult {
  const result = crisisGuard(text);
  if (result.level === "none") {
    return { route: "continue" };
  }

  const message = result.level === "crisis" ? CRISIS_MESSAGE : CONCERN_MESSAGE;
  return {
    route: "escalate",
    card: {
      type: "escalation",
      level: result.level,
      message,
      matched: result.matched,
    },
  };
}
