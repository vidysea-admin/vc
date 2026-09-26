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

  // --- ISS-023: Devanagari -----------------------------------------------------------------------
  // \b is not used here — JS's default \b is defined over ASCII word chars ([A-Za-z0-9_]) and does
  // not treat Devanagari code points as word characters, so it would silently fail to match at
  // Devanagari word edges. Devanagari script is unambiguous enough here that plain substring
  // matching (with \s+ only for the internal word gap) is safe.
  /मरना\s+चाहत[ाी]/, // "marna chahta/chahti" — want to die
  /आत्महत्या/, // "aatmahatya" — suicide
  /खुद\s+को\s+खत्म/, // "khud ko khatam" — end oneself
  /जीना\s+नहीं\s+चाहत[ाी]/, // "jeena nahi chahta/chahti" — don't want to live

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
function normalise(text: string): string {
  const capped = text.replace(INVISIBLE_FORMAT_CHARS, "").replace(LONG_MARK_RUN, capMarkRun);
  const stripped = stripForeignMarks(stripForeignMarks(capped).normalize("NFKD"));
  return stripped
    .normalize("NFKC")
    .replace(INVISIBLE_FORMAT_CHARS, "")
    .toLowerCase()
    .replace(HOMOGLYPH_CHAR, (ch) => HOMOGLYPHS[ch] ?? ch)
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

  const crisisMatched = new Set<string>();
  const concernMatched = new Set<string>();

  const views = collapsed === normalised ? [normalised] : [normalised, collapsed];
  for (const view of views) {
    for (const source of matchAll(view, CRISIS_PATTERNS)) crisisMatched.add(source);
    for (const source of matchAll(view, CONCERN_PATTERNS)) concernMatched.add(source);
  }
  for (const { source, regex } of SQUEEZED_CRISIS_PATTERNS) {
    if (regex.test(squeezed)) crisisMatched.add(`squeezed:${source}`);
  }
  for (const { source, regex } of SQUEEZED_CONCERN_PATTERNS) {
    if (regex.test(squeezed)) concernMatched.add(`squeezed:${source}`);
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
