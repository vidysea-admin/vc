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
 * English signals ("k i l l myself" -> "killmyself"). T-005c cycle 1 replaced that hand-kept
 * 7-substring fallback with a separator-free twin DERIVED from every pattern (see
 * `squeezePatternSource`), so fully spaced phrases in any script are covered. See the
 * crisis-vs-concern classification table below the pattern lists.
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
 *     directly (`collapseLetterSpacedRuns`); a phrase whose EVERY word is spaced is caught by the
 *     derived separator-free patterns (SQUEEZED_CRISIS_PATTERNS/SQUEEZED_CONCERN_PATTERNS).
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

// ---------------------------------------------------------------------------
// ISS-340 (D-103): Devanagari-script and mixed-script Hinglish
// ---------------------------------------------------------------------------
// Gemini Live transcribes Hindi speech in Devanagari, so a voice crisis turn ("सब खत्म कर दूंगा", "मेरे साथ
// पिटाई होती है") reached the guard in a script the romanised Hinglish patterns above cannot match. This
// block gives every romanised Hinglish crisis/concern phrase its Devanagari counterpart at the SAME level,
// built from per-word slots that accept the Latin spelling an existing pattern already uses, the Devanagari
// forms, or either one in the same sentence ("sab खत्म kar dunga", "सब khatam कर दूंगा"). The Latin
// alternatives of every slot are copied from the existing Latin patterns, so a pure-Latin turn is unchanged.
// Spelling variants (nukta / no nukta, chandrabindu / anusvara, a dropped bindu on नहीं and मैं) are folded by
// `foldDevanagariSpelling` before matching, so a pattern here never spells a nukta or a chandrabindu.
// Every pattern is star-height 1 with no `{n,m}` quantifier (same contract as the list below).

type SlotEdge = "start" | "end" | "mid";

/** One word position: the Latin spellings (word-boundary anchored at a phrase edge) or the Devanagari forms. */
function slot(latin: readonly string[], devanagari: readonly string[], edge: SlotEdge = "mid"): string {
  const lat = latin.map((word) => (edge === "start" ? String.raw`\b${word}` : edge === "end" ? String.raw`${word}\b` : word));
  return `(?:${[...lat, ...devanagari].join("|")})`;
}

/** A phrase: its slots joined by one-or-more whitespace, matched case-insensitively (Devanagari has no case). */
function phrase(...slots: readonly string[]): RegExp {
  return new RegExp(slots.join(String.raw`\s+`), "i");
}

// Verb endings. Text is folded first (chandrabindu -> anusvara), so only the anusvara form is written here.
const D_DUNGA = "द[ुू]ं?ग[ाी]"; // dunga / dungi, long or short u, with or without the bindu
const D_LUNGA = "ल[ुू]ं?ग[ाी]"; // lunga / lungi
const D_MAAR = String.raw`मार(?:ना|ने|ता|ती|ा|ू|\s+द|\s+ल|\s+डाल)`; // "maar dunga / maarna / maara" - never "मार्केट"
const S_SAB = slot(["sab"], ["सब"], "start");
const S_KUCH = slot(["kuch"], ["कुछ"]);
const S_KHATAM = slot(["khatam"], ["खत्म", "खतम"]);
const S_KAR = slot(["kar"], ["कर"]);
const S_KHUD = slot(["khud"], ["खुद"]);
const S_KO = slot(["ko"], ["को"]);
const S_ZINDAGI = slot(["zindagi"], ["ज(?:ि|ी)ं?दगी", "ज(?:ि|ी)न्दगी"], "start");
const S_JEENA = slot(["jeena"], ["जीना", "जिना"], "start");
const S_JEENE = slot(["jeene?"], ["जीने"], "start");
const S_MARNE = slot(["marne"], ["मरने"], "start");
const S_JAAN = slot(["jaan"], ["जान"], "start");
const S_NAHI = slot(["nahi", "nahin"], ["नहीं"]);
const S_NAHI4 = slot(["nahi", "nahin", "na", "nai"], ["नहीं", "ना", "न"], "end");
const S_HAI = slot(["hai"], ["है"], "end");
const S_KAKI = slot(["ka", "ki"], ["का", "की"]);
const S_KOI = String.raw`(?:(?:koi|कोई)\s+)?`;
// "jaan de dunga" / "jaan de de dunga" / "jaan le lunga": the verb endings of the existing Latin pattern, plus the Devanagari ones.
const S_DE_DUNGA = String.raw`(?:(?:de|le|दे|ले)\s+)?` + slot(["dunga", "dungi", "doonga", "doongi", "lunga", "lungi", "loonga", "loongi"], [D_DUNGA, D_LUNGA], "end");
// "khud ko / apne aap ko / apni jaan" (the object of "khatam kar lunga ...").
const S_SELF = `(?:${S_KHUD}\\s+${S_KO}|${slot(["apne"], ["अपने"])}\\s+${slot(["aap"], ["आप"])}\\s+${S_KO}|${slot(["apni"], ["अपनी"])}\\s+${slot(["jaan"], ["जान"])})`;
// Abuse: "mujhe / mere saath" + a hitting verb. Latin verbs keep the existing `\w*` tail; Devanagari excludes
// "मार्केट", "पीटर" (Peter), "पीटी" (PT) and "पिटारा" (a box) by listing the verb forms.
const S_ME = slot(["mujhe", String.raw`mere\s+saath`], ["मुझे", "मुझको", String.raw`मेरे\s+साथ`, String.raw`मेरे\s+saath`, String.raw`mere\s+साथ`], "start");
const S_HIT = slot(
  [String.raw`maarta\w*`, String.raw`maarti\w*`, String.raw`peetata\w*`, String.raw`peet\w*`],
  ["मार(?:ता|ती|ते|ा)", String.raw`मार\s*पीट`, "प[िी]टाई", "प[िी]ट(?:ता|ती|ते|ना)", "पीटा"],
);
const D_TENSION = "(?:टेंशन|टेन्शन|टैंशन|टेनशन)";

const ISS340_CRISIS_PATTERNS: readonly RegExp[] = [
  // "sab kuch khatam" / "sab khatam kar dunga" (ISS-023) - the crisis-08 clip: "सब खत्म कर दूंगा"
  phrase(S_SAB, S_KUCH, slot(["khatam"], ["खत्म", "खतम"], "end")),
  phrase(S_SAB, S_KHATAM, S_KAR, slot(["dunga", "dungi", "doonga", "doongi"], [D_DUNGA, D_LUNGA], "end")),
  // "khud ko khatam / maar / marne" and "khatam kar lunga khud ko / apne aap ko / apni jaan"
  phrase(S_KHUD, S_KO, slot(["khatam", "maar", "marne", "mara"], ["खत्म", "खतम", D_MAAR, "मरने", "मरना"], "mid")),
  phrase(S_KHATAM, S_KAR, slot(["lunga", "lungi", "loonga", "loongi", "dunga", "dungi", "doonga", "doongi"], [D_LUNGA, D_DUNGA]), S_SELF),
  // "zindagi khatam / bekaar"
  phrase(S_ZINDAGI, slot(["khatam", "bekaar", "bekar"], ["खत्म", "खतम", "बेकार"], "end")),
  // "marna / maut chahta / chahiye" (the plain Devanagari form is already above; this adds "मौत चाहिए", "मरना चाहिए", mixed script)
  phrase(slot(["marna", "maut"], ["मरना", "मौत"], "start"), slot(["chah", "chahta", "chahti", "chahiye"], ["चाह"], "end")),
  // "marne ka mann", "marne ki iccha / khwahish / khayal"
  phrase(S_MARNE, slot(["ka"], ["का"]), slot(["man+"], ["मन"], "end")),
  phrase(S_MARNE, S_KAKI, slot(["iccha", "ichha", "ichchha", "khwahish", "khayal"], ["इच्छा", "इछा", "ख्वाहिश", "खयाल", "ख्याल"], "end")),
  // "jeena nahi chahta / hai"
  phrase(S_JEENA, S_NAHI, slot(["chahta", "chahti"], ["चाहत"], "end")),
  phrase(S_JEENA, S_NAHI, S_HAI),
  // "jeene ka mann / dil / matlab / point nahi", "jeene ki wajah nahi"
  phrase(S_JEENE, slot(["ka"], ["का"]), slot(["mann", "man", "dil", "fayda"], ["मन", "दिल", "फायदा"]), S_NAHI4),
  phrase(S_JEENE, slot(["ki"], ["की"]), S_KOI + slot(["wajah", "vajah", "wajeh", "reason"], ["वजह", "कारण", "रीजन"]), S_NAHI4),
  phrase(S_JEENE, slot(["ka"], ["का"]), S_KOI + slot(["matlab", "maksad", "maqsad", "reason", "point", "faida", "fayda"], ["मतलब", "मकसद", "रीजन", "पॉइंट", "पॉइन्ट", "प्वाइंट", "फायदा"]), S_NAHI4),
  // "mar jaunga / jaungi / jaana hai / jaana chahta" (a short-u "जाउंगा" is included)
  phrase(slot(["mar"], ["मर"], "start"), slot(["jaun", "jaaun", "jau", "jaau", "jaoon", "jaaoon", "jaunga", "jaungi"], ["जा[उऊ]"], "end")),
  phrase(slot(["mar"], ["मर"], "start"), slot(["jaana", "jana"], ["जाना"]), slot(["hai", "chahta", "chahti"], ["है", "चाहत"], "end")),
  // "jaan de dunga / le lunga", "jaan dena hai / chahta" (a short-u "दुंगा" is included)
  phrase(S_JAAN, slot(["de", "le"], ["दे", "ले"]), S_DE_DUNGA),
  phrase(S_JAAN, slot(["dena"], ["देना"]), slot(["hai", "chahta", "chahti"], ["है", "चाहत"], "end")),
  // "khatam ho jana / jaunga"
  phrase(S_KHATAM, slot(["ho"], ["हो"]), slot(["jana", "jaana", "jaun", "jaaun", "jaunga", "jaungi", "jaaunga", "jaaungi"], ["जाना", "जा[उऊ]"], "end")),
  // Abuse: "mujhe maarta hai", "mere saath peetai hoti hai" ("पिटाई", "पीटाई", "मारपीट"); and the Hindi word order "मेरी पिटाई होती है"
  phrase(S_ME, S_HIT),
  /मेरी\s+(?:प[िी]टाई|मार\s*पीट)/,
  // T-033 families, Devanagari spelling variants the existing patterns do not take (short u instead of long u, na/n for nahi)
  phrase(slot(["main", "mai"], ["मैं"], "start"), slot(["nahi", "nahin", "na"], ["नहीं", "ना", "न"]), slot(["rahunga", "rahungi", "rahoonga", "rahoongi", "bachunga", "bachungi"], ["(?:रह|बच)[ुू]ं?ग[ाी]"], "end")),
  /(?:नहीं|ना|न)\s+बच[ुू]ं?ग[ाी]/, // "nahi bachunga" - I won't survive, short-u spelling
  /दिन\s+(?:नहीं|ना|न)\s+(?:रह[ुू]|बच[ुू]|जि[उऊ]|जी[उऊ])ं?ग[ाी]/, // "(zyada) din nahi rahunga / jiunga"
  /कभी\s+(?:नहीं|ना|न)\s+(?:उठ[ुू]|जाग[ुू])/, // "kabhi na uthun" - never wake up, short-u spelling
  /मेरे\s+(?:न|ना)\s+रहने\s+(?:से|पर|पे|के\s+बाद)/, // "mere na rehne se / par / ke baad"
  /(?:अपनी|अपना|अपने|मेरी|मेरा|मेरे)\s+(?:(?:सारी|सारा|सारे|सब)\s+)?चीजों\s+को\s+(?:(?:सबको|सब\s+को|लोगों\s+को|दोस्तों\s+को)\s+)?(?:दे|बांट)/, // "cheezon ko de dunga"
  // goodbye: "sabko alvida / goodbye", "alvida duniya / zindagi", "aakhri baar baat kar raha"
  phrase(
    slot(["sab\\s*ko", "sabhi\\s+ko", "aap\\s+sab\\s*ko", "tum\\s+sab\\s*ko", "aapko", "tumko", "tumhe", "tumhein"], ["सबको", "सब\\s+को", "आप\\s+सबको", "तुम\\s+सबको", "आपको", "तुम्हें", "तुमको"], "start"),
    slot(["alvida", "alwida", "goodbye", "good\\s*bye"], ["अलविदा", "गुडबाय", "गुड\\s*बाय"], "end"),
  ),
  phrase(slot(["alvida", "alwida"], ["अलविदा"], "start"), slot(["dosto", "doston", "sab", "sabko", "duniya", "zindagi", "hamesha", "forever"], ["दोस्तों", "दोस्तो", "दुनिया", "सबको", "हमेशा", "ज(?:ि|ी)ं?दगी", "ज(?:ि|ी)न्दगी"], "end")),
  phrase(
    slot(["aakhri", "akhri", "aakhiri", "aakhari", "akhiri"], ["आखिरी", "आखरी"], "start"),
    slot(["baar", "bar"], ["बार"]),
    slot(["baat\\s+kar", "mil"], ["बात\\s+कर", "मिल"]),
    slot(["raha", "rahi", "rahe"], ["रहा", "रही", "रहे"], "end"),
  ),
];

const ISS340_CONCERN_PATTERNS: readonly RegExp[] = [
  // "mann nahi lag raha"
  phrase(slot(["mann"], ["मन"], "start"), S_NAHI, slot(["lag"], ["लग"]), slot(["raha"], ["रहा", "रही"], "end")),
  // "bahut tension": the Devanagari spellings of tension, and either word in the other script
  new RegExp(String.raw`बहुत\s+(?:tension|${D_TENSION})`, "i"),
  new RegExp(String.raw`\bbahut\s+${D_TENSION}`, "i"),
  // "zindagi se thak gaya / gayi" - tired-of-life exhaustion, concern (see the ISS-023 table)
  phrase(S_ZINDAGI, slot(["se"], ["से"]), slot(["thak"], ["थक"]), slot(["gaya", "gayi", "gya", "gyi"], ["गया", "गई", "गयी"], "end")),
];

// Ported verbatim from ikigai-counsellor's crisis-guard.ts (H6). Exported (read-only) so the test
// suite can generate every letter-/punctuation-/double-spaced evasion form of every pattern
// (T-005c cycle 1, ISS-t-005c-rev-1) — the coverage is closed by construction, not by examples.
export const CRISIS_PATTERNS: readonly RegExp[] = [
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
  // P1 LK8 (policy .17, qa/verdicts/p1-lk6.md finding 1): "khudkushi", the everyday Hindi/Hinglish word for suicide, at the
  // same level as English "suicide". Spellings: khudkushi / khud kushi / khudkhushi (+ "-kusi", "-kushee"). A spaced "khud khushi"
  // ("own happiness") is not in the plain form, but its derived squeezed twin flags it: a documented D-020 false alarm, never suppressed.
  /\bkhud(?:\s*kush?(?:i|ee)|khush?(?:i|ee))\b/i,
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
  // ISS-t-005c-c0-2: "mar jaunga/jaungi/jaaunga/jaoonga" (I will die) and "mar jaana hai / mar
  // jaana chahta" — a first-person statement of dying, distinct from "marna chahta" above. The
  // idiomatic "mar jaunga hanste hanste" (I'll die laughing) also flags: an accepted false alarm
  // (D-020). "mar gaye yaar" (past tense, a common idiom) still does not match.
  /\bmar\s+(ja+[ou]+n?g[ai]|ja+na?\s+(hai|chaht[ai]))\b/i,

  // --- U6h L5: phrases the U6 review found missed (recall-only, D-020; see the L5 table below) ----
  // "jaan de dunga / jaan le lunga" - a first-person intent to give up / take one's own life.
  /\bjaan\s+(de|le)\s+((de|le)\s+)?(dunga|dungi|doonga|doongi|lunga|lungi|loonga|loongi)\b/i,
  // "khatam kar lunga khud ko" - "end myself" with the object last (the object-first order is matched above).
  /\bkhatam\s+kar\s+(lunga|lungi|loonga|loongi|dunga|dungi|doonga|doongi)\s+(khud\s+ko|apne\s+aap\s+ko|apni\s+jaan)\b/i,
  // "in case I'm not here / around" - preparing to be gone. Needs "not" and a presence word, so
  // "in case I'm not able to get a visa" and "in case I'm here early" stay clear.
  /\bin\s+case\s+(i'?m|i\s+am)\s+not\s+(here|around|there|alive)\b/i,
  /\bin\s+case\s+i\s+(won'?t|will\s+not)\s+be\s+(here|around|there|alive)\b/i,

  // --- P1 W3 / D-093 2A (Umesh, 2026-10-17): every proposed Hindi/Hinglish recall phrase ---------
  // Source: the U6h AI review (e2fd6fc, item 6) and the U7 review. Recall-only (D-020): a phrase that
  // also appears in ordinary talk ("end things with my agent") is an accepted false alarm. "kms" is a
  // whole-token check (TOKEN_CRISIS_PHRASES below), not a pattern: its separator-free twin would match
  // inside "work ms" / "think ms".
  // "mujhe marna hai / marna hi hai" - a stated wish to die, the verb "marna" with no "chahta" (the
  // "marna chahta" family is matched above).
  /\bmarna+\s+(hi\s+)?(hai|hain|h)\b/i,
  // "mai khatam ho jana chahta hu / khatam ho jaunga" - "I want to cease to exist", distinct from
  // "sab kuch khatam" (a bare hopelessness statement).
  /\bkhatam\s+ho\s+(jana|jaana|jaun|jaaun|jaunga|jaungi|jaaunga|jaaungi)\b/i,
  // "marne ki iccha / marne ka khayal" - a stated wish or thought of dying.
  /\bmarne\s+(ki|ka)\s+(iccha|ichha|ichchha|khwahish|khayal)\b/i,
  // "jeena nahi hai" - "I don't want to live" without "chahta".
  /\bjeena\s+nahi[n]?\s+hai\b/i,
  // "jaan dena hai / jaan dena chahta" - intent to give up one's life ("jaan lena" is left out: it also means "to find out").
  /\bjaan\s+dena\s+(hai|chahta|chahti)\b/i,
  // English - "I don't see the point anymore", "what's the point of living". Needs "anymore" or a life word, so
  // "I don't see the point of this course" stays clear.
  /\b(don'?t|do\s+not|can'?t|cannot|no\s+longer)\s+see\s+(the|any)\s+point\s+(anymore|any\s+more|in\s+(living|life|anything|being\s+alive))\b/i,
  /\bsee\s+no\s+point\s+(anymore|any\s+more|in\s+(living|life|anything|being\s+alive))\b/i,
  // "...point in going on / continuing with (my) life": the self-referential life form. The bare "in going on" / "in continuing"
  // is a code check (matchPointContinuing): "continuing with MBA" is study talk, so it cannot be a plain pattern.
  /\b(don'?t|do\s+not|can'?t|cannot|no\s+longer)\s+see\s+(the|any)\s+point\s+in\s+(going\s+on|continuing)\s+(with\s+)?(my\s+|this\s+)?(life|living)\b/i,
  /\bsee\s+no\s+point\s+in\s+(going\s+on|continuing)\s+(with\s+)?(my\s+|this\s+)?(life|living)\b/i,
  /\b(what'?s|what\s+is)\s+the\s+point\s+(of\s+(living|life|going\s+on|anything)|anymore|any\s+more)\b/i,
  // English - "thinking about ending things", "I'm ending things tonight".
  /\b(thinking|thought|thoughts|think|planning|plan|plans|want|wanna|going|gonna|decided|ready|trying)\s+((about|of|to)\s+)?end(ing)?\s+(things|everything)\b/i,
  /\bend(ing)?\s+(things|everything)\s+(for\s+good|tonight|today|right\s+now|soon)\b/i,
  /\bend(ing)?\s+it\s+(tonight|today|soon|for\s+good|right\s+now)\b/i,

  // --- ISS-023: Devanagari -----------------------------------------------------------------------
  // \b is not used here — JS's default \b is defined over ASCII word chars ([A-Za-z0-9_]) and does
  // not treat Devanagari code points as word characters, so it would silently fail to match at
  // Devanagari word edges. Devanagari script is unambiguous enough here that plain substring
  // matching (with \s+ only for the internal word gap) is safe.
  /मरना\s+चाहत[ाी]/, // "marna chahta/chahti" — want to die
  /आत्महत्या/, // "aatmahatya" — suicide
  /खुद\s*क[ुू]श[ीि]/, // P1 LK8: "khudkushi" / "khud kushi" - suicide (the nukta form ख़ुदकुशी is folded to this before matching)
  /खुदकशी/, // P1 LK8: "khudkashi" - the vowel-less spelling of the same word
  /खुदखुश[ीि]/, // P1 LK8: "khudkhushi" - the aspirated misspelling (unspaced in the plain form; spaced "खुद खुशी", "own happiness", is a D-020 squeezed-twin false alarm)
  /खुद\s+को\s+खत्म/, // "khud ko khatam" — end oneself
  /जीना\s+नहीं\s+चाहत[ाी]/, // "jeena nahi chahta/chahti" — don't want to live
  /जान\s+(दे|ले)\s+((दे|ले)\s+)?(दू[ंँ]?ग[ाी]|लू[ंँ]?ग[ाी])/, // U6h L5: "jaan de dunga" - (I will) give up my life
  // P1 W3 / D-093 2A: the Devanagari forms of the new Hinglish phrases above.
  /मरना\s+(ही\s+)?(है|हैं)/, // "marna hai" - (I) have to / want to die
  /खत्म\s+हो\s+(जाना|जाऊ[ंँ]?(ग[ाी])?)/, // "khatam ho jana / jaunga" - cease to exist
  /मरने\s+(की|का)\s+(इच्छा|ख्याल|मन)/, // "marne ki iccha / ka khayal" - a wish or thought of dying
  /जीना\s+नहीं\s+है/, // "jeena nahi hai" - don't want to live
  /जान\s+देना\s+(है|चाहत[ाी])/, // "jaan dena hai / chahta" - give up my life

  // --- T-033 / ISS-t-005c-c0-1: indirect suicidal-ideation WARNING SIGNS -------------------------
  // The classic warning-sign statements a keyword list used to miss entirely ("everyone would be
  // better off without me", "I won't be around", "giving away my things", "saying goodbye") — the
  // families named in the issue, in English, romanised Hinglish and Devanagari. All crisis-level: see
  // the classification table below. Recall-only (D-020): several of these share words with ordinary
  // study-abroad talk ("I won't be around next week", "say goodbye to my friends before I fly",
  // "don't want to live in a hostel"); those false alarms are the accepted safe direction, measured
  // in the crisis eval set (category accepted_residual), never suppressed. Every pattern is star-
  // height 1 (no quantified group, no {n,m}, no \w run) so matching stays linear.
  // English — burden / better off without me / no one would miss me
  /\b(i\s+am|i'?m|feel\s+like|i'?ve\s+become|i\s+have\s+become|i\s+became)\s+(such\s+|just\s+|only\s+|nothing\s+but\s+)?a\s+(huge\s+|big\s+|total\s+)?burden\b/i,
  /\bbeing\s+(such\s+)?a\s+burden\b/i,
  /\bburden\s+(to|on|for)\s+(everyone|everybody|my\s+family|my\s+parents|them\s+all|you\s+all|all\s+of\s+you|the\s+world|others)\b/i,
  /\b(better|happier|easier|fine)\s+off\s+without\s+me\b/i,
  /\b(be|is|are|been)\s+(better|happier|easier|fine)\s+without\s+me\b/i,
  /\b(no\s*one|nobody)(\s+would|\s+will|'d|'ll)\s+(even\s+)?(miss|notice)\s+me\b/i,
  /\bif\s+i\s+(died|disappeared|vanished|was\s+gone|were\s+gone|was\s+dead|were\s+dead|wasn'?t\s+(here|around|alive)|weren'?t\s+(here|around|alive)|was\s+not\s+(here|around|alive))\b/i,
  /\bif\s+i'?m\s+(gone|dead|not\s+here|not\s+around|no\s+longer\s+(here|around))\b/i,
  // English — won't be around
  /\b(won'?t|will\s+not|not\s+going\s+to|not\s+gonna)\s+be\s+(around|here|alive)\b/i,
  /\b(won'?t|will\s+not|never)\s+have\s+to\s+(deal\s+with|worry\s+about|see|put\s+up\s+with)\s+me\b/i,
  /\b(i'?ll|i\s+will)\s+be\s+gone\b/i,
  // English — no reason to live
  /\b(no|any|lost\s+(my|the|all)|losing\s+(my|the))\s+(reasons?|will|purpose)\s+to\s+(live|go\s+on|keep\s+living|stay\s+alive|keep\s+going|carry\s+on|be\s+alive|exist)\b/i,
  /\b(nothing|nobody|no\s*one|not\s+much|what\s+do\s+i\s+have|what\s+is\s+there|what'?s\s+there)\s+(left\s+)?to\s+live\s+for\b/i,
  /\b(not|isn'?t|wasn'?t|no\s+longer)\s+worth\s+living\b/i,
  /\bcan'?t\s+live\s+(like\s+this|anymore|any\s+more|with\s+myself|this\s+life)\b/i,
  /\b(don'?t|do\s+not)\s+(want\s+to|wanna)\s+(live|exist|be\s+alive|be\s+here|wake\s+up|go\s+on|be\s+around)\b/i,
  // English — want to disappear / sleep forever / wish I was dead
  /\b(want|wanna|wanted|need|needed)\s+(to\s+)?(just\s+)?(disappear|vanish|stop\s+existing|not\s+exist|cease\s+to\s+exist|be\s+dead|not\s+be\s+alive|not\s+be\s+here|not\s+be\s+around|be\s+gone|never\s+wake\s+up|not\s+wake\s+up)\b/i,
  /\b(want|wanna|wish|going|gonna)\s+(to\s+)?(just\s+)?sleep\s+forever\b/i,
  /\bsleep\s+and\s+(never|not)\s+wake\s+up\b/i,
  /\b(hope|pray|wish|want\s+to|wanna)\s+(i\s+)?(never|don'?t|do\s+not|won'?t|will\s+not|wouldn'?t)\s+wake\s+up\b/i,
  /\b(disappear|vanish)\s+(forever|for\s+good|from\s+(this|the)\s+world|from\s+everyone)\b/i,
  /\bwish\s+i\s+(was|were)\s+(dead|never\s+born|gone)\b/i,
  /\bwish\s+i\s+(wasn'?t|weren'?t|was\s+not|were\s+not|didn'?t|did\s+not)\s+(alive|born|here|around|exist)\b/i,
  /\bwish\s+i(\s+could|\s+would|'d|\s+had|\s+can)\s+(just\s+)?(die|disappear|vanish|stop\s+existing|sleep\s+forever|never\s+wake\s+up|not\s+wake\s+up|never\s+(have\s+)?been\s+born|not\s+exist|never\s+existed)\b/i,
  // English — giving things away
  /\b(giving|gave|give|given|gives)\s+away\s+(all\s+(of\s+)?my|everything|my\s+(things|stuff|belongings|possessions|favou?rite|prized|valuables))\b/i,
  /\b(giving|gave|give|given|gives)\s+(all\s+(of\s+)?)?my\s+(things|stuff|belongings|possessions)\s+away\b/i,
  // English — saying goodbye
  /\b(want|wanted|wanna|need|needed|came|here|just|trying|going)\s+to\s+say\s+(goodbye|good\s*bye|bye|my\s+goodbyes)\b/i,
  /\b(final|last)\s+(goodbye|good\s*bye|goodbyes)\b/i,
  /\b(this\s+is|it'?s|it\s+is)\s+goodbye\b/i,
  /\b(good\s*bye|bye)\s+(forever|for\s+ever|for\s+good|cruel\s+world)\b/i,
  /\bgood\s*bye\s+(world|everyone|everybody|all)\b/i,
  /\b(won'?t|will\s+not|never)\s+(hear\s+from|see|talk\s+to)\s+me\s+(again|anymore|any\s+more)\b/i,
  /\blast\s+time\s+(you'?ll|you\s+will|anyone\s+will|you\s+ever)\s+(hear\s+from|see|talk\s+to)\s+me\b/i,
  // English — explicit / method language the ported base lacked
  /\b(take|taking|took)\s+my\s+(own\s+)?life\b/i,
  /\b(rather\s+(be\s+dead|die|not\s+exist|not\s+be\s+alive)|better\s+off\s+dead)\b/i,
  /\b(hang|hanging|hanged|shoot|shooting|drown|drowning|poison|poisoning|stab|stabbing|strangle|strangling|suffocate|suffocating|overdose|overdosing|starve|starving)\s+myself\b/i,
  /\bunaliv(e|ed|ing)\b/i,
  /\b(slit|slitting|slash|slashing)\s+my\s+(wrists?|throat)\b/i,
  /\b(jump|jumping)\s+(off|from)\s+(a|the|my)\s+(bridge|building|roof|terrace|balcony|cliff|tower)\b/i,
  /\b(jump|jumping)\s+in\s+front\s+of\s+(a|the)\s+(train|bus|truck|car|metro)\b/i,
  // Hinglish (romanised) — burden, better off without me, won't be around
  /\b(bojh|bojha|boj|burden)\s+(hoon|hun|hu|ban\s+(gaya|gayi|gya|gyi|chuka|chuki))\b/i,
  /\bmere\s+(bina|baghair|bagair|bager)\s+(sab\s+|sabhi\s+|log\s+|sab\s+log\s+|ghar\s*wale\s+|family\s+|mummy\s+papa\s+)?(khush|better|theek|thik|behtar|zyada\s+khush|jyada\s+khush)\b/i,
  /\b(main|mai)\s+(nahi|nahin|na)\s+(rahunga|rahungi|rahoonga|rahoongi|bachunga|bachungi)\b/i,
  /\b(nahi|nahin|na)\s+(bachunga|bachungi|bachoonga|bachoongi)\b/i,
  /\b(zyada|jyada|jaada|jada)\s+din\s+(nahi|nahin|na)\s+(rahunga|rahungi|bachunga|bachungi|jiunga|jiungi|jeeunga|jeeungi)\b/i,
  /\bmere\s+(marne\s+ke\s+baad|na\s+(rehne|rahne)\s+(se|par|pe|ke\s+baad))\b/i,
  // Hinglish — no reason to live, disappear / sleep forever, wish I was dead
  /\bjeene?\s+ki\s+(koi\s+)?(wajah|vajah|wajeh|reason)\s+(nahi|nahin|na|nai)\b/i,
  /\bjeene?\s+ka\s+(koi\s+)?(matlab|maksad|maqsad|reason|point|faida|fayda)\s+(nahi|nahin|na|nai)\b/i,
  /\b(kis|kiske)\s+(liye|lie)\s+(jeena|jiyu|jiyun|jiyoon|jiun|jeeun)\b/i,
  /\b(gayab|gaayab|gaib|ghayab)\s+ho\s+(jana|jaana|jaun|jaaun|jau|jaau|jaoon|jaunga|jaungi)\b/i,
  /\bhamesha\s+ke\s+(liye|lie)\s+(so\s+(jaun|jaau|jau|jaana|jana|jaunga|jaungi)|sona|chala\s+(jaun|jaunga)|chali\s+(jaun|jaungi))\b/i,
  /\bkabhi\s+(na|nahi|nahin)\s+(uthun|uthu|uthoon|uthna|jaagun|jagun|jaagu|jagu)\b/i,
  /\bmar\s+(jaun|jaaun|jau|jaau|jaoon|jaaoon)\b/i,
  /\b(kaash|kash)\s+(main|mai)\s+(paida|peda)\s+(hi\s+)?(na|nahi|nahin)\s+(hota|hoti|hua|hui)\b/i,
  /\b(kaash|kash)\s+(main|mai)\s+mar\s+(gaya|gayi|chuka|chuki|jaata|jaati)\b/i,
  // Hinglish — giving things away, saying goodbye
  /\b(apna|apni|apne|mera|meri|mere)\s+(saara\s+|saari\s+|saare\s+|sara\s+|sari\s+|sare\s+|sab\s+)?(saman|samaan|cheezein|cheezen|chizein|chizen|cheeze|chize|cheezon\s+ko|chizon\s+ko)\s+(sab\s*ko\s+|logon\s+ko\s+|doston\s+ko\s+|dosto\s+ko\s+)?(de|dena|baant|bant)\b/i,
  /\b(sab\s*ko|sabhi\s+ko|aap\s+sab\s*ko|tum\s+sab\s*ko|aapko|tumko|tumhe|tumhein)\s+(alvida|alwida|goodbye|good\s*bye)\b/i,
  /\b(alvida|alwida)\s+(dosto|doston|sab|sabko|duniya|zindagi|hamesha|forever)\b/i,
  /\b(aakhri|akhri|aakhiri|aakhari|akhiri)\s+(baar|bar)\s+(baat\s+kar|mil)\s+(raha|rahi|rahe)\b/i,
  // Devanagari (no \b, see the note above). A nukta is written as an optional DECOMPOSED combining
  // nukta (U+093C) because NFKC leaves every nukta letter decomposed — "ख़ुश" typed with a precomposed
  // U+0959 reaches the patterns as ख + ़ + ु + श. Pinned by the NFKC-stability test.
  /बोझ\s+(हू[ंँ]?|बन\s+(गया|गई|गयी|चुका|चुकी))/, // "bojh hoon / ban gaya" — I am a burden
  /मेरे\s+(बिना|बग़?ैर)\s+(सब\s+|सभी\s+|लोग\s+|घरवाले\s+|परिवार\s+)?(ख़?ुश|बेहतर|ठीक)/, // better off without me
  /मैं\s+(नहीं|ना|न)\s+(रहू[ंँ]?ग[ाी]|बचू[ंँ]?ग[ाी])/, // "main nahi rahunga" — I won't be around
  /(नहीं|ना|न)\s+बचू[ंँ]?ग[ाी]/, // "nahi bachunga" — I won't survive
  /दिन\s+(नहीं|ना|न)\s+(रहू[ंँ]?ग[ाी]|बचू[ंँ]?ग[ाी]|जिऊ[ंँ]?ग[ाी]|जीऊ[ंँ]?ग[ाी])/, // "(zyada) din nahi rahunga"
  /मेरे\s+मरने\s+के\s+बाद/, // "mere marne ke baad" — after I die
  /जीने\s+(की|का)\s+(कोई\s+)?(वज़?ह|कारण|मतलब|मक़?सद|मन|दिल|फ़?ायदा)\s+(नहीं|ना|न)/, // no reason / no wish to live
  /(किस|किसके)\s+(लिए|लिये)\s+(जीना|जियू[ंँ]?|जिऊ[ंँ]?)/, // "kis liye jeena" — what to live for
  /ग़?ायब\s+हो\s+(जाना|जा[उऊ])/, // "gayab ho jana / jaun" — disappear
  /हमेशा\s+के\s+(लिए|लिये)\s+(सो\s+जा|सोना|चला\s+जा|चली\s+जा)/, // "hamesha ke liye so jaun" — sleep forever
  /कभी\s+(नहीं|ना|न)\s+(उठू[ंँ]?|जागू[ंँ]?)/, // "kabhi na uthun" — never wake up
  /मर\s+(जा[उऊ]|जाना\s+(है|चाहत[ाी]))/, // "mar jaun / jaunga / jaana hai" — (wish to) die
  /काश\s+(मैं|में)\s+(पैदा\s+(ही\s+)?(नहीं|ना|न)\s+(होता|होती|हुआ|हुई)|मर\s+(गया|गई|जाता|जाती))/, // wish I was never born / dead
  /(अपनी|अपना|अपने|मेरी|मेरा|मेरे)\s+(सारी\s+|सारा\s+|सारे\s+|सब\s+)?(चीज़?ें|सामान)\s+(सबको\s+|सब\s+को\s+|लोगों\s+को\s+|दोस्तों\s+को\s+)?(दे|बा[ंँ]ट)/, // giving my things away
  /(सबको|सब\s+को|आप\s+सबको|तुम\s+सबको|आपको|तुम्हें|तुमको)\s+अलविदा/, // "sabko alvida" — goodbye everyone
  /अलविदा\s+(दोस्तों|दोस्तो|दुनिया|सबको|हमेशा)/, // "alvida duniya" — goodbye world
  /आख़?िरी\s+बार\s+(बात\s+कर|मिल)\s+(रहा|रही|रहे)/, // "aakhri baar baat kar raha" — talking for the last time
  // ISS-340 (D-103): the Devanagari / mixed-script counterparts of the romanised Hinglish phrases (defined above).
  ...ISS340_CRISIS_PATTERNS,
];

// New in this engine (not in ikigai's source) — softer distress language: stressed/hopeless/
// overwhelmed, but not itself a self-harm, suicide, or abuse signal. Deliberately narrower than the
// crisis list so ordinary frustration ("I'm dying to go to LSE") never lands here either.
export const CONCERN_PATTERNS: readonly RegExp[] = [
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
  // ISS-340 (D-103): Devanagari / mixed-script counterparts of the romanised Hinglish concern phrases.
  ...ISS340_CONCERN_PATTERNS,
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
// | khudkushi / khud kushi / khudkhushi          | Hinglish   | crisis  | P1 LK8: direct everyday word for suicide, same level as "suicide" |
// | खुदकुशी / खुदकशी / खुदखुशी (khudkushi)         | Devanagari | crisis  | P1 LK8: same word in Devanagari (nukta form folded) |
// | जीना नहीं चाहता/चाहती (jeena nahi chahta/chahti) | Devanagari | crisis  | explicit "don't want to live"                |
// | बहुत टेंशन (bahut tension)                    | Devanagari | concern | academic-stress language, mirrors Hinglish "bahut tension" — no death assertion |
//
// U6h L5 (post-PASS recall fix, review 743d78b). The same deciding question, per phrase:
//
// | phrase                                      | script     | level      | why |
// |---------------------------------------------|------------|------------|-----|
// | in case I'm not here / I won't be around     | English    | crisis     | preparing to be gone; a recognised warning sign |
// | jaan de/le dunga/dungi, जान दे दूंगा          | Hinglish / Devanagari | crisis | first-person intent to end one's life |
// | khatam kar lunga khud ko / apne aap ko       | Hinglish   | crisis     | "end myself", object-last word order |
// | pressure bahut hai                           | Hinglish   | NOT FLAGGED | ordinary academic-pressure talk, no death or self-harm assertion. A CONCERN flag would show the full crisis message (B24.7 maps every flag to it) on routine study talk, so it stays unflagged: the student gets a normal brief answer plus one coaching question (coach-first). A softer distress route is a product decision (open risk in the U6h manifest). |
//
// T-033 (ISS-t-005c-c0-1) warning-sign families — every one is CRISIS, in all three scripts:
//
// | family                                      | examples                                         | level  | why |
// |---------------------------------------------|--------------------------------------------------|--------|-----|
// | burden / better off without me              | "I'm a burden", "mere bina sab khush", "बोझ हूं"   | crisis | recognised suicide warning sign; labelled crisis in the golden set |
// | won't be around / after I'm gone            | "I won't be around", "main nahi rahunga"          | crisis | veiled statement of intent |
// | no reason to live                           | "no reason to live", "jeene ki wajah nahi"        | crisis | a wish not to live, stated indirectly |
// | want to disappear / sleep forever           | "want to sleep forever", "gayab ho jana"          | crisis | a wish for death in euphemism |
// | giving things away / saying goodbye         | "giving away my things", "sabko alvida"           | crisis | classic preparatory behaviour |
// Filing any of these as concern would be the UNSAFE direction: B20 lets concern turns continue to
// generation, so a veiled goodbye would get a chatty reply instead of the escalation card.

// T-005c cycle 1 (ISS-t-005c-rev-1, critical): the separator-free twin of EVERY pattern above,
// DERIVED from the pattern list itself — never a hand-kept allowlist. Cycle 0 matched the fully-
// squeezed turn (every separator removed) against 7 hardcoded English substrings ("killmyself",
// "enditall", ...), so a fully letter- or punctuation-spaced multi-word phrase outside those 7
// ("b e a t s  m e", "m a r n a  c h a h t a", every Devanagari phrase) collapsed into one run
// ("beatsme") that neither the \s+-based regexes nor the list could match. The root cause is not
// fixable by a better collapse: once letters are single-space separated, "the gap between two
// words" and "the gap inside one letter-spaced word" are the same single space, so no collapse
// can know where the word boundary was. Instead each pattern is recompiled with its whitespace
// (`\s`, `\s+`, `\s*`, `\s?`, a literal space and its quantifier), its `\b` word-boundary
// assertions and its apostrophes removed (`squeezePatternSource`), and run against `squeeze()`'s
// separator-free view of the whole turn. A new pattern added above is covered automatically.
// Accepted cost (D-020, recall-only): with every word boundary gone, two unrelated adjacent words
// can now form a match ("spend it all" -> "spenditall" contains "enditall"; "can't go online" ->
// "cantgoonline" contains "cantgoon"). Those are documented false alarms, never suppressed.
// Linear time: the derived regexes have exactly the atoms/quantifiers of their originals minus
// separators — no nesting, no lookaround is introduced.

/**
 * Drops every separator-tolerance construct from a pattern's source: `\s` (with any `+ * ?`
 * quantifier), a literal space or apostrophe (with its quantifier), and `\b`. Inside a character
 * class nothing is touched. Escapes other than `\s`/`\b` are copied verbatim.
 *
 * T-033 (ISS-t-005c-rev-2): an unescaped `{` outside a character class is a `{n,m}` quantifier this
 * derivation cannot handle (dropping `\s{2,4}` would leave a dangling `{2,4}` quantifying the
 * previous atom, silently changing what the twin matches), so it THROWS — the same contract as the
 * test suite's `expandPattern`, so a pattern author finds out at module load, not from a missed
 * signal. A lazy `?` after a dropped separator quantifier (`\s+?`) is consumed with it.
 */
export function squeezePatternSource(source: string): string {
  let out = "";
  let inClass = false;
  const isQuantifier = (ch: string | undefined): boolean => ch === "+" || ch === "*" || ch === "?";
  // Index just past a separator's quantifier, including a lazy `?` after `+`/`*`/`?`.
  const skipQuantifier = (at: number): number => {
    if (!isQuantifier(source[at])) return at;
    return source[at + 1] === "?" ? at + 2 : at + 1;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      if (!inClass && (next === "s" || next === "b")) {
        i++;
        if (next === "s") i = skipQuantifier(i + 1) - 1;
        continue;
      }
      out += ch + (next ?? "");
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      out += ch;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      continue;
    }
    if (ch === "{") {
      throw new Error(`squeezePatternSource: unsupported {n,m} quantifier in /${source}/`);
    }
    if (ch === " " || ch === "'") {
      i = skipQuantifier(i + 1) - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

interface SqueezedPattern {
  source: string;
  regex: RegExp;
}

function deriveSqueezed(patterns: readonly RegExp[]): readonly SqueezedPattern[] {
  return patterns.map((pattern) => ({
    source: pattern.source,
    regex: new RegExp(squeezePatternSource(pattern.source), pattern.flags),
  }));
}

const SQUEEZED_CRISIS_PATTERNS = deriveSqueezed(CRISIS_PATTERNS);
const SQUEEZED_CONCERN_PATTERNS = deriveSqueezed(CONCERN_PATTERNS);

const CRISIS_MESSAGE = [
  "Hey — what you just shared matters more than this session.",
  "I'd really like you to talk to someone who can help right now.",
  "Tele-MANAS is free and open 24x7: call 14416 (or 1800-891-4416).",
  "iCALL (022-25521111, Mon-Sat 8am-10pm) is a counselling line, not an emergency line.",
  "If you're in immediate danger, please call 112.",
  "Want to pause our session and pick it up another day? You're not alone.",
].join(" ");

const CONCERN_MESSAGE = [
  "This turn matched a distress signal — it's not an emergency-level flag, but worth a direct check-in.",
  "Ask the student how they're really doing before moving on to the next topic.",
  "Tele-MANAS (14416, free, 24x7) is there if they want to talk to someone outside this session.",
  "iCALL (022-25521111, Mon-Sat 8am-10pm) is a counselling line, not an emergency line.",
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
 * ISS-t-005c-c0-3: common Cyrillic and Greek lowercase homoglyphs of Latin letters, folded to the
 * Latin letter they impersonate ("кill myself" with a Cyrillic ka, "suiсidal" with a
 * Cyrillic es). Applied after lowercasing, so uppercase homoglyphs are covered too. NFKC (below)
 * already folds fullwidth/compatibility forms ("ｋｉｌｌ" -> "kill"); homoglyphs
 * from other scripts are not compatibility-equivalent, so they need this explicit map. Recall-only:
 * a genuine Russian/Greek word that folds into an English pattern is an accepted false alarm.
 */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  // Cyrillic
  "а": "a", // а
  "е": "e", // е
  "ё": "e", // ё
  "о": "o", // о
  "р": "p", // р
  "с": "c", // с
  "х": "x", // х
  "у": "y", // у
  "і": "i", // і
  "ї": "i", // ї
  "ј": "j", // ј
  "к": "k", // к
  "м": "m", // м
  "т": "t", // т
  "н": "h", // н
  "в": "b", // в
  "ѕ": "s", // ѕ
  "ԁ": "d", // ԁ
  "һ": "h", // һ
  "ӏ": "l", // ӏ
  "ԛ": "q", // ԛ
  "ԝ": "w", // ԝ
  "г": "r", // г (italic/handwritten r-like)
  "п": "n", // п
  "и": "u", // и
  // Greek
  "α": "a", // α
  "ε": "e", // ε
  "ο": "o", // ο
  "ρ": "p", // ρ
  "ι": "i", // ι
  "κ": "k", // κ
  "ν": "v", // ν
  "τ": "t", // τ
  "υ": "u", // υ
  "χ": "x", // χ
  "η": "n", // η
  "ω": "w", // ω
};
const HOMOGLYPH_CHAR = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "gu");

/**
 * T-033 (found while writing the brief's zalgo/long-input test): combining marks stacked on a Latin
 * letter ("k̶i̶l̶l̶" with U+0336 strikethrough, zalgo "b̖̕e̖t̖t̖e̖r̖") were kept as \p{M} word characters,
 * so "k̶i̶l̶l̶ myself" never contained "kill" and evaded every pattern. Every
 * combining mark OUTSIDE a Devanagari run is now deleted — a Devanagari matra, virama, nukta or
 * anusvara is part of the word and is kept (the Deva script run is matched as a whole and copied
 * back unchanged). The text is stripped, decomposed (NFKD, so "é" precomposed becomes e + U+0301),
 * stripped again, then recomposed by the NFKC step in `normalise()`. A marked Latin/Cyrillic/Greek
 * letter therefore folds to its base letter ("é" -> "e", which only ADDS matches: recall-only).
 * Linear: one alternation of a script-run and a single mark, no nested quantifier.
 */
/**
 * T-033 (found by the linear-time probe; pre-existing on main): `String.prototype.normalize` puts a
 * run of combining marks into canonical order with a QUADRATIC sort when their combining classes
 * alternate (Devanagari nukta ccc 7 / virama ccc 9: the base guard took 203ms at 25k chars, 786ms at
 * 50k, 3187ms at 100k). No real word carries more than a handful of marks on one letter, so every
 * run longer than MAX_MARK_RUN is cut to its first MAX_MARK_RUN marks BEFORE any normalisation.
 * Recall-safe: a letter is never removed, only surplus marks stacked on one letter, so no word a
 * pattern could match is lost. Linear: a bounded-minimum run of one class, matched greedily.
 */
const MAX_MARK_RUN = 32;
const LONG_MARK_RUN = /\p{M}{33,}/gu;
function capMarkRun(run: string): string {
  return Array.from(run).slice(0, MAX_MARK_RUN).join("");
}

/**
 * ISS-340 (D-103): Devanagari spelling variants a transcript or a phone keyboard produces, folded to the one form the
 * patterns spell. Runs on the NFKD text (before NFKC), so a precomposed nukta letter (U+0958..U+095F) has already been
 * split into base + U+093C. Recall only: every fold maps several spellings to one, so a pattern can match more, never fewer.
 *   - nukta (U+093C) deleted: ख़त्म == खत्म, ज़िंदगी == जिंदगी, ग़ायब == गायब (the nukta is optional in speech and typing);
 *   - chandrabindu (U+0901) -> anusvara (U+0902): दूँगा == दूंगा, नहीँ == नहीं;
 *   - a dropped bindu on the two commonest words: "नही" -> "नहीं" (nahi), "मै" -> "मैं" (main).
 * Linear: four single-pass regex replaces with a one-character lookahead.
 */
const DEVA_NUKTA = /़/g;
const DEVA_CHANDRABINDU = /ँ/g;
const DEVA_NAHI_NO_BINDU = /नही(?![ंँ])/g;
const DEVA_MAIN_NO_BINDU = /मै(?![ंँ])/g;
function foldDevanagariSpelling(text: string): string {
  return text
    .replace(DEVA_NUKTA, "")
    .replace(DEVA_CHANDRABINDU, "ं")
    .replace(DEVA_NAHI_NO_BINDU, "नहीं")
    .replace(DEVA_MAIN_NO_BINDU, "मैं");
}

const DEVANAGARI_RUN_OR_MARK =/\p{Script=Devanagari}+|\p{M}/gu;
const IS_DEVANAGARI = /^\p{Script=Devanagari}/u;
function stripForeignMarks(text: string): string {
  // The first alternative wins at any Devanagari character, so a lone-mark match is never Devanagari.
  return text.replace(DEVANAGARI_RUN_OR_MARK, (run) => (IS_DEVANAGARI.test(run) ? run : ""));
}

/**
 * Step 1 (recall, not suppression): strip combining marks outside Devanagari (`stripForeignMarks`),
 * NFKC-normalise (compatibility folding: fullwidth Latin, ligatures,
 * etc. become plain ASCII — ISS-t-005c-c0-3; Devanagari has no compatibility forms the patterns rely
 * on, so its matching is unchanged — see the Devanagari tests), delete invisible format characters,
 * lowercase (a safe no-op on Devanagari, which has no case), fold Cyrillic/Greek homoglyphs to Latin
 * (`HOMOGLYPHS`), then collapse every remaining separator —
 * whitespace including a newline, sentence punctuation, an ellipsis, anything that is not a
 * letter/mark/digit/apostrophe — down to a single space. This is what lets "kill. myself",
 * "kill\nmyself" and "kill....myself" all match the same `\bkill\s+myself\b` pattern as an
 * ordinary "kill myself": sentence punctuation is folded away exactly like any other separator,
 * never treated as a boundary a pattern cannot cross (D-020).
 */
function normalise(text: string, leet: false | "i" | "l" = false): string {
  const folded = foldText(text);
  // Review c1 Low: in the 1 -> l reading a trailing "1" after a double l ("kill1" -> "killl") is one more l, so a run of three or
  // more l's folds back to two ("kill"). Only the l-view changes, and that view is only ever an addition.
  const leetFolded = leet ? foldLeet(folded, leet) : folded;
  return (leet === "l" ? leetFolded.replace(/l{3,}/g, "ll") : leetFolded).replace(NON_WORD_RUN, " ").trim();
}

/**
 * Every step of `normalise` except the final separator collapse (so punctuation survives). The long-mark-run cap runs first,
 * before any Unicode normalisation, which keeps it linear on huge combining-mark runs (T-033).
 */
function foldText(text: string): string {
  const capped = text.replace(INVISIBLE_FORMAT_CHARS, "").replace(LONG_MARK_RUN, capMarkRun);
  const stripped = foldDevanagariSpelling(stripForeignMarks(stripForeignMarks(capped).normalize("NFKD")));
  const folded = stripped
    .normalize("NFKC")
    .replace(INVISIBLE_FORMAT_CHARS, "")
    .toLowerCase()
    .replace(HOMOGLYPH_CHAR, (ch) => HOMOGLYPHS[ch] ?? ch)
    // P1 W3: a phone keyboard types a typographic apostrophe ("don’t"); the patterns' `'?` expects the ASCII one.
    .replace(TYPOGRAPHIC_APOSTROPHE, "'");
  return folded;
}

/** U+2019 right single quote, U+2018 left, U+02BC modifier letter apostrophe, U+2032 prime, U+FF07 fullwidth. */
const TYPOGRAPHIC_APOSTROPHE = /[‘’ʼ′＇]/g;

/**
 * P1 W3 / D-093 2A: "i w4nt to d1e", "su1c1de", "k!ll myself", "d@ie". A digit or symbol standing beside a letter is read
 * as the letter it imitates (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, @ a, $ s; "!" only before a letter, so "die!" keeps its stop).
 * This is a SECOND VIEW tried in addition to the plain one (never instead of it), so it can only add a match. A bare
 * number ("5 lakh", "2026") has no letter beside it and is untouched.
 */
const LEET_MAP: Readonly<Record<string, string>> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
// The run start is anchored (no look-alike character directly before it), so a long run is scanned once, from its first character.
// Unanchored, every start position inside a 100000-character run of "1" re-scanned the rest of the run: quadratic (cycle-2 FAIL).
const LEET_BEFORE_LETTER = /(?<![013457@$!])[013457@$!]+(?=\p{L})/gu;
const LEET_AFTER_LETTER = /(?<=\p{L})[013457@$]+/gu;
/**
 * A whole run of look-alike characters is folded ("ki11" -> "kiii" or, with `oneAs` "l", "kill"). "1" is ambiguous: i ("d1e",
 * "su1c1de") or l ("ki11 myself", "k1ll"), so the caller tries both readings as separate views.
 */
function foldLeet(text: string, oneAs: "i" | "l" = "i"): string {
  const map = (run: string): string => [...run].map((ch) => (ch === "1" ? oneAs : (LEET_MAP[ch] ?? ch))).join("");
  return text.replace(LEET_BEFORE_LETTER, map).replace(LEET_AFTER_LETTER, map);
}

/**
 * Step 2 (recall): collapses each run of 2+ adjacent single-letter tokens ("k i l l", "k.i.l.l"
 * once `normalise()` has already turned every separator into a plain space, "b e a t s") into one
 * word, whatever separator used to sit between the letters. A multi-letter word is never touched,
 * so "harm my self-worth" can never become "harmmyself" *here* (the fully-squeezed view below is
 * the one place multi-word runs do glue together, by design — see its own comment). This is what
 * lets ordinary CRISIS_PATTERNS/CONCERN_PATTERNS regexes (which need a real `\s+` between two
 * words, e.g. `\bbeats\s+me\b`) catch letter-spacing evasion directly, including for Devanagari and
 * Hinglish phrases.
 *
 * Known limit (ISS-t-005c-rev-1): when EVERY word of a multi-word phrase is letter-spaced
 * ("b e a t s  m e"), the whole phrase is one single-letter run and merges into one token
 * ("beatsme") — the word gap is indistinguishable from the letter gaps after `normalise()`. This
 * view cannot recover that case by design; the derived squeezed patterns (Step 3) do.
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
 * Step 3 (recall — see SQUEEZED_CRISIS_PATTERNS/SQUEEZED_CONCERN_PATTERNS): strips every remaining
 * separator (and apostrophe) from the WHOLE turn, so a multi-word phrase that is fully letter-,
 * punctuation- or format-spaced across a word gap ("e n d i t a l l", "b.e.a.t.s m.e") still reforms
 * into a run the derived separator-free twin of its pattern can match, at the accepted cost that two
 * unrelated adjacent words can now glue together too.
 */
function squeeze(normalised: string): string {
  return normalised.replace(NON_SQUEEZE_RUN, "");
}

/**
 * P1 W3 / D-093 2A: crisis shorthand that is only safe to match as a WHOLE TOKEN. "kms" ("kill myself") is the one: its
 * separator-free twin would match inside ordinary text ("work ms" -> "workms", "think ms in cs"), so it is deliberately not a
 * CRISIS_PATTERNS entry (no squeezed twin). An elongated "kmss" / "kmsss" is the same token. The ONLY suppression is a unit-of-
 * distance reading, and only from the word BEFORE it: a number or a plain quantity word ("50 kms", "a few kms", "thousands of
 * kms"). Nothing after it suppresses ("kms away from here", "kms from the stress" are crisis statements, fix cycle 1 of
 * p1-eng3), and neither does a vague word before it ("thinking about kms", "almost kms"). Anything else is a flag (recall-only, D-020).
 */
export const TOKEN_CRISIS_PHRASES: readonly string[] = ["kms"];
const QUANTITY_BEFORE = new Set(["few", "several", "couple", "many", "hundred", "hundreds", "thousand", "thousands"]);
function isDistanceQuantity(token: string | undefined): boolean {
  return token !== undefined && (/^\p{N}+$/u.test(token) || QUANTITY_BEFORE.has(token));
}
function matchTokens(view: string): string[] {
  const tokens = view.split(" ");
  const found: string[] = [];
  for (const phrase of TOKEN_CRISIS_PHRASES) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] !== phrase && !(tokens[i].length > phrase.length && tokens[i].startsWith(phrase) && /^s+$/.test(tokens[i].slice(phrase.length)))) continue;
      const before = tokens[i - 1];
      // "thousands of kms", "a couple of kms": the quantity word sits one token further back.
      const distance = isDistanceQuantity(before) || (before === "of" && isDistanceQuantity(tokens[i - 2]));
      if (!distance) {
        found.push(phrase);
        break;
      }
    }
  }
  return found;
}

/**
 * Review W1 + cycle-1 Block (P1 W3 eng3, D-020 recall over precision): "I don't see the point in going on / continuing" is a
 * crisis statement BY DEFAULT: at the end of the turn, before punctuation (`matchPointContinuingPunctuated`) and before any next
 * word ("... at all", "... without her", "... today", "... lol", "... my family would be better off"). It is study talk, and
 * suppressed, ONLY when a study object follows: a study noun right after it ("... continuing MBA"), or a lead-in word followed
 * within three words by a study noun ("... continuing with MBA", "... going on with this course", "... continuing my IELTS prep").
 * It always fires, whatever follows, on a life word in the next four words ("... continuing to live", "... with my life") and on
 * "without", "with things / it / everything", "like this".
 * [ASSUMPTION] (maker decision under D-020, fail closed, for Umesh): a lead-in alone ("my", "the", "to", ...) does NOT suppress;
 * it needs a study noun after it, so "... going on my family would be better off" fires. The life form ("with my life") is also
 * a plain CRISIS_PATTERNS entry.
 */
const POINT_IN_CONTINUING = /\b(?:(?:don'?t|do\s+not|can'?t|cannot|no\s+longer)\s+see\s+(?:the|any)|see\s+no)\s+point\s+in\s+(?:going\s*on(?:wards?)?|continuing)(?![\p{L}\p{N}])/gu;
/** The same phrase on the lowercased raw text, immediately followed by punctuation (the normalised views fold punctuation away). */
const POINT_IN_CONTINUING_PUNCT = /\b(?:(?:don'?t|do\s+not|can'?t|cannot|no\s+longer)\s+see\s+(?:the|any)|see\s+no)\s+point\s+in\s+(?:going\s*on(?:wards?)?|continuing)\s*[^\p{L}\p{M}\p{N}\s']/u;
const POINT_STUDY_LEAD_IN = new Set(["with", "my", "the", "this", "these", "those", "a", "an", "our", "his", "her", "their", "your", "to"]);
const POINT_STUDY_NOUNS = new Set([
  "ielts", "gre", "gmat", "toefl", "sat", "mba", "ms", "btech", "course", "degree", "prep", "preparation", "studies", "study",
  "college", "application", "applications", "coaching", "exam", "exams",
]);
const POINT_LIFE_WORDS = new Set(["living", "life", "live", "alive", "existing", "exist"]);
const POINT_WITH_ALWAYS = new Set(["things", "it", "everything"]);
/**
 * Cycle 3 (D-098, recall over precision): a study object does NOT suppress when distress follows in the same clause. The
 * normalised view has no punctuation, so the clause is the rest of the view (bounded to POINT_REST_WINDOW characters, which keeps
 * the scan linear on a turn that repeats the phrase). Distress is: a life word, a hard-distress phrase (POINT_DISTRESS), or any
 * CRISIS_PATTERNS / CONCERN_PATTERNS match run on that rest.
 */
const POINT_REST_WINDOW = 240;
/** After this many study-suppressed matches in one view the turn is flagged: a turn that repeats the phrase is not plain study talk. */
const POINT_MAX_SUPPRESSED = 20;
const POINT_DISTRESS =
  /\b(?:hate[ds]?\s+(?:myself|my\s*self|me|my\s+life|everything|being\s+alive)|worthless|hopeless|helpless|useless\s+(?:person|human|to\s+everyone)|burden|depress(?:ed|ion|ing)|miserable|hurts?|hurting|pain(?:ful)?|suffer(?:ing)?|suffocat(?:ing|ed)|drowning|crying|alone|lonely|empty|numb|dead|die|dying|death|suicid(?:e|al)|kill(?:ing)?|nobody|no\s*one|nothing\s+matters|everything\s+is\s+(?:pointless|meaningless)|give\s+up|gave\s+up|ashamed|failure|loser)\b/u;
function pointRestHasDistress(rest: string, tokens: readonly string[]): boolean {
  return (
    tokens.some((t) => POINT_LIFE_WORDS.has(t)) ||
    POINT_DISTRESS.test(rest) ||
    CRISIS_PATTERNS.some((pattern) => pattern.test(rest)) ||
    CONCERN_PATTERNS.some((pattern) => pattern.test(rest))
  );
}
function matchPointContinuing(view: string): boolean {
  let suppressed = 0;
  for (const m of view.matchAll(POINT_IN_CONTINUING)) {
    const start = (m.index ?? 0) + m[0].length;
    const rest = view.slice(start, start + POINT_REST_WINDOW);
    const tokens = rest.split(" ").filter((t) => t.length > 0);
    // Nothing follows, or something other than a study object does: the statement itself is the signal.
    if (tokens.length === 0 || pointRestHasDistress(rest, tokens)) return true;
    const [first, second] = tokens;
    const studyObject =
      POINT_STUDY_NOUNS.has(first) || (POINT_STUDY_LEAD_IN.has(first) && tokens.slice(1, 4).some((t) => POINT_STUDY_NOUNS.has(t)));
    // "with things / it / everything" is the one lead-in that never counts as a study object ("... with it my exams are over" fires).
    if (!studyObject || (first === "with" && POINT_WITH_ALWAYS.has(second))) return true;
    if (++suppressed > POINT_MAX_SUPPRESSED) return true;
  }
  return false;
}
function matchPointContinuingPunctuated(text: string): boolean {
  return POINT_IN_CONTINUING_PUNCT.test(foldText(text));
}
/** The same bare form with every separator gone (fully letter- or punctuation-spaced evasion): only when it ends the turn. */
const SQUEEZED_POINT_IN_CONTINUING = /(?:dontseethepoint|donotseethepoint|cantseethepoint|cannotseethepoint|nolongerseethepoint|seenopoint)in(?:goingon|continuing)$/;

function matchAll(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

/**
 * Deterministic sweep over a single turn's text (D-020: recall only, nothing suppressed). Crisis-
 * level patterns take priority over concern-level ones — a turn that matches both is reported as
 * "crisis" only, since that is the severity the counsellor needs to act on. Every regex runs
 * against both the plain normalised view and the letter-spacing-collapsed view (so a collapse can
 * only ADD a match, never hide one the plain view had); the derived separator-free twin of every
 * pattern runs once against the whole squeezed turn, at the pattern's own level.
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
  // P1 W3 / D-093 2A: the leet-folded second view ("w4nt", "d1e"). Tried in addition to the plain views, so it only adds.
  const leeted = normalise(text, "i");
  const leetCollapsed = collapseLetterSpacedRuns(leeted);
  const leetSqueezed = squeeze(leeted);
  // Review I1: "1" is also an "l" ("ki11 myself", "k1ll"), so the l-reading is a third view (again, only ever an addition).
  const leetedL = normalise(text, "l");
  const leetLCollapsed = collapseLetterSpacedRuns(leetedL);
  const leetLSqueezed = squeeze(leetedL);

  const crisisMatched = new Set<string>();
  const concernMatched = new Set<string>();

  const views = [...new Set([normalised, collapsed, leeted, leetCollapsed, leetedL, leetLCollapsed])];
  for (const view of views) {
    for (const source of matchAll(view, CRISIS_PATTERNS)) crisisMatched.add(source);
    for (const source of matchAll(view, CONCERN_PATTERNS)) concernMatched.add(source);
    for (const token of matchTokens(view)) crisisMatched.add(`token:${token}`);
    if (matchPointContinuing(view)) crisisMatched.add("token:point-in-continuing");
  }
  if (matchPointContinuingPunctuated(text)) crisisMatched.add("token:point-in-continuing");
  for (const twin of new Set([squeezed, leetSqueezed, leetLSqueezed])) {
    if (SQUEEZED_POINT_IN_CONTINUING.test(twin)) crisisMatched.add("squeezed:point-in-continuing");
    for (const { source, regex } of SQUEEZED_CRISIS_PATTERNS) {
      if (regex.test(twin)) crisisMatched.add(`squeezed:${source}`);
    }
    for (const { source, regex } of SQUEEZED_CONCERN_PATTERNS) {
      if (regex.test(twin)) concernMatched.add(`squeezed:${source}`);
    }
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

// ---------------------------------------------------------------------------
// P1 W3 / D-093 3A (Umesh, 2026-10-17): the SOFT stress tier
// ---------------------------------------------------------------------------

/**
 * Ordinary exam / study-abroad stress talk: "pressure bahut hai", "bahut stress", "I am so stressed", "can't handle the
 * pressure". It asserts no death or self-harm, so it is NOT a crisis or concern flag (crisisGuard returns "none" for all of
 * these; B24.7 would otherwise show the full crisis message on routine study talk). The student surface answers the turn as
 * usual and appends a soft check-in plus Tele-MANAS 14416 (`stressSignal`, student graph `finish`). The counsellor path
 * (`routeBeforeGeneration`) is unchanged. Star-height 1, no `{n,m}`, so matching stays linear.
 */
export const STRESS_PATTERNS: readonly RegExp[] = [
  // Hinglish
  /\bpressure\s+(bahut|bohot|bahot|zyada|jyada|kaafi|kafi)\s+(hai|hota|ho|badh)\b/i,
  /\b(bahut|bohot|bahot|zyada|jyada|kaafi|kafi)\s+(stress|pressure)\b/i,
  /\bstress\s+(bahut|bohot|bahot|zyada|jyada)\b/i,
  // English
  /\b(i\s+am|i'?m|im|feeling|feel|so|really|very|too)\s+(so\s+|really\s+|very\s+|too\s+|extremely\s+|super\s+)?(stressed|overwhelmed)\b/i,
  /\b(can'?t|cannot|couldn'?t|unable\s+to)\s+(handle|take|cope\s+with|deal\s+with|bear)\s+(the|this|all\s+this|so\s+much|all\s+the|any\s+more\s+of\s+the)\s+(pressure|stress)\b/i,
  /\b(too|so)\s+much\s+(pressure|stress)\b/i,
  /\bunder\s+(so\s+|a\s+lot\s+of\s+|too\s+much\s+|immense\s+|a\s+lot\s+of\s+)?(pressure|stress)\b/i,
  // Devanagari
  /बहुत\s+(स्ट्रेस|प्रेशर|दबाव)/,
  /(स्ट्रेस|प्रेशर|दबाव)\s+बहुत/,
];

/** The soft check-in line, then the helpline line (kept in sync with the student graph's TELE_MANAS_LINE). */
export const STRESS_CHECK_IN = "That sounds like a lot of pressure, and it's okay to say so.";

/** True when the turn carries ordinary stress language. Independent of `crisisGuard`: callers run the crisis path first. */
export function stressSignal(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const normalised = normalise(text);
  if (normalised.length === 0) return false;
  const collapsed = collapseLetterSpacedRuns(normalised);
  return STRESS_PATTERNS.some((p) => p.test(normalised) || (collapsed !== normalised && p.test(collapsed)));
}
