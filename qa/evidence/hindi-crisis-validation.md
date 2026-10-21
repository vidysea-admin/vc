# Hindi / Hinglish crisis reply: validation and proposed text
Date: 2026-10-21T12:28+05:30 · Task: q-hindi-crisis · Scope: read-only on code, this proposal file only. No code changed, nothing committed, no student data sent anywhere (WebSearch/WebFetch used with public queries only).
**Final sign-off still needs the clinical safety owner (qa/gates/g-prod.md). This is a drafting and checking aid, not clinical approval.**

## 1. Where the crisis texts live (current state)
| Text | Where | Who sees it |
|---|---|---|
| `CRISIS_CORE` + `STUDENT_CRISIS_MESSAGE` / `ANONYMOUS_CRISIS_MESSAGE` | `packages/engine/src/student/lang.ts:46-59` | the student, every language |
| `CRISIS_MESSAGES = { en, hi }` | `lang.ts:560-563`; `crisisMessageFor` `lang.ts:566-571` | `hi` and `hi-Latn` both map to key `hi`, and `hi` is the SAME English string |
| `HELPLINE_GLOSS` "(Tele-MANAS: 14416, मुफ़्त, 24x7)" | `lang.ts:36` | the only Hindi in any crisis reply |
| `TELE_MANAS_LINE` "If things feel heavy, Tele-MANAS on 14416 is free and open 24x7." | `lang.ts:31` | non-crisis/stress replies; `FIXED_TEXTS` has `en` only |
| `STRESS_CHECK_IN` "That sounds like a lot of pressure..." | `guards/crisis.ts:1005` | stress turns, English only |
| `CRISIS_MESSAGE` / `CONCERN_MESSAGE` (iCALL 9152987821) | `guards/crisis.ts:550-562`, used by `routeBeforeGeneration` `:960-976` | escalation card; CRISIS_MESSAGE is worded to the student |
| `skills/safety-escalation/SKILL.md:42` | repeats iCALL 9152987821 | counsellor skill |
| Voice fixed text | injected via `deps.crisis.message` (`apps/api/src/voice.ts:920`); test fixture `"Please call Tele-MANAS on 14416. I am still here."` (`apps/api/tests/voice-fixtures.ts:38`) | voice student |

### Current text, verbatim (what a Hindi or Hinglish student gets today)
> I'm really glad you told me. What you're going through matters, and you deserve support right now. Please call Tele-MANAS on 14416. It is free, open 24x7, and the people there are trained for exactly this (Tele-MANAS: 14416, मुफ़्त, 24x7). I'm an AI guide, not a counsellor, and no counsellor from our side is being connected right now, so Tele-MANAS is the best next step. If you are in danger right now, please tell a trusted adult near you. Who is a safe adult you could talk to today, like a parent, relative or teacher? I'm still here, and you can keep talking to me.

(Anonymous variant: the same, without the safe-adult question.)

## 2. Issues found (ranked)
1. **There is no Hindi or Hinglish crisis message at all.** `CRISIS_MESSAGES.hi` is the English string with a 3-word Hindi gloss (`lang.ts:561-562`, and its own comment says "Replace `hi` with a vetted fully-Hindi message when one exists"). A Hindi-script or Hinglish student in crisis gets an English paragraph. For 13-18 year olds this is the main defect.
2. **No separate Hinglish (Latin-script) entry.** `hi-Latn` is routed to the `hi` key (`lang.ts:568`). Once a Devanagari text exists, a student typing Roman Hindi would get Devanagari back. The catalog needs an `hi-Latn` entry (shape change, see section 6).
3. **No 112 in the student message.** Immediate-danger advice is only "tell a trusted adult". 112 appears only in the counsellor card (`crisis.ts:554`). 112 is the national single emergency number (PIB, see sources), so it belongs in the "danger right now" sentence.
4. **No hope statement.** WHO and AFSP safe-messaging guidance stress hope/recovery plus help-seeking. The current text has help-seeking but never says that feeling can change. Add one short, non-promissory line.
5. **Wrong or unverified helpline facts in `CRISIS_MESSAGE` / `CONCERN_MESSAGE` (`crisis.ts:553, 561`).**
   - "iCALL ... call them at 9152987821 **anytime**" is false. TISS lists iCALL telephone 022-25521111 **Monday to Saturday, 8 AM to 10 PM** (fetched from tiss.ac.in). The mobile 9152987821 is on iCALL's own site, but the only hours found for it are a third-party directory (same Mon-Sat 8-10pm); the site shows an "available now / not available now" indicator. The earlier crisis research (proposal.md item 5, source [19]) also says iCALL is never a crisis line.
   - "trained for exactly this" overclaims for iCALL.
   - The card is English only and says "free and confidential" (the word "confidential" is on the forbidden list for student text, `graph.ts:113`, because it implies secrecy; in CONCERN_MESSAGE it addresses the counsellor, but CRISIS_MESSAGE is student-facing).
   - It omits Tele-MANAS, which is the helpline every other path uses. Two different helplines for the same event is inconsistent.
6. **Only the short code is shown.** DGHS gives both the short code and the toll-free form. A short code does not always dial from every network or landline; show the toll-free digits too (section 3).
7. **Wording problems in the English base that carry into any translation.**
   - "the people there are trained for exactly this" is a promise about quality we have not verified (research: staff limited, ~70% of callers adults, minors' coverage unverified). The proposed text says only that it is free, open 24x7 and that the student can ask for their own language.
   - The Hindi gloss sits mid-sentence in brackets; a screen reader / TTS reads "24x7" as Latin characters.
   - 75 words in one paragraph is long for a distressed teen. Proposed texts are broken into short sentences.
   - "tell a trusted adult near you" and the safe-adult question are good; keep.
8. **Gender neutrality.** None of the current Hindi is gendered (there is almost none). The proposed texts avoid gendered participles: address with आप plus plural-honorific verbs (रहे हैं, कर सकते हैं), no "अकेला/अकेली", no "थका/थकी"; Hinglish likewise (aap ... rahe hain, no "akela/akeli").
9. **Voice.** A TTS voice reading "14416" can say "fourteen thousand four hundred sixteen". Spoken variant should spell the digits (section 4D).
10. **Test fixture is English-only.** `tests/lang.test.ts:175-176` require `/not a counsellor/i` and `/no counsellor from our side is\s+being connected/i` in EVERY catalog entry, and `:170` pins `Object.keys(CRISIS_MESSAGES)` to `["en","hi"]`. A Hindi/Hinglish entry cannot pass that fixture; it needs a per-language fixture (Devanagari/Hinglish equivalents of the same four assertions) and `CRISIS_FORBIDDEN_PATTERNS` (`graph.ts:112-122`) needs Devanagari and Hinglish equivalents (secret/confidential, "won't tell anyone", therapy, "a counsellor will call"). Otherwise a future edit to the Hindi text is unchecked.
11. **Not covered here (flag only):** the research proposal says the bot should "ask directly" at level 2; the fixed message does not ask whether the student is thinking of suicide. That is a policy choice for the clinical owner, not a translation fix.

## 3. Helpline facts checked (numbers present in code or proposed)
| Item | Finding | Source / confidence |
|---|---|---|
| Tele-MANAS **14416** | Correct. Free, 24x7. | DGHS page fetched directly: "toll-free helpline number 1800-89-14416 or short code 14416", "24X7 tele-mental health services". HIGH |
| Tele-MANAS toll-free | `1800-89-14416`, `1-800-891-4416`, `1800-891-4416` are the same digits (18008914416), different hyphenation. Use "1800-891-4416" (PIB/NIMHANS form, easier to read as 1800 + 7 digits). | DGHS fetched; PIB/NIMHANS via search summary. HIGH on the digits |
| Tele-MANAS languages | Search summaries of PIB releases: callers choose a language after dialling; "20 languages based on states' choice". Hindi presumably included. **Not read from a primary page** (pib.gov.in returned 403 to fetch; telemanas.mohfw.gov.in returned only a title in the earlier research). DGHS page says nothing on languages. | MEDIUM. So the text says "you can ask for your language", not "Hindi is available". Needs the go-live test call (docs/go-live-checklist.md:40) |
| Tele-MANAS and minors | No source found says whether under-18s are served or have a protocol. | UNVERIFIED (already an open item in the checklist) |
| **112** | National single emergency number (police, fire, health), ERSS-112; PIB says operational in all States/UTs. | PIB via search summary; fetch not done. MEDIUM-HIGH. The earlier research marked 112 "unverified"; this check supports it |
| iCALL 9152987821 / 022-25521111 | Exists. TISS page: phone 022-25521111, Mon-Sat 8 AM-10 PM; chat via nULTA Mon-Fri 10:30-5:30. Not a crisis line, not 24x7. Hours of the 9152987821 mobile only from a third-party directory. | tiss.ac.in fetched. HIGH for existence/hours of 022 line, LOW for mobile hours |
| Childline **1098** (not in code) | Exists, for children. Status in flux: Childline India site says it moved under MWCD Mission Vatsalya (district bodies) and "for immediate support reach out to 112"; a 2023 PIB item says it is being integrated into 112. **Do not add** to the fixed message until checked; 112 covers the immediate case. | search summaries, MEDIUM |
| KIRAN 1800-599-0019, Vandrevala | Not in code. Not verified. Do not add. | unverified |

## 4. Proposed text (for the clinical safety owner to review)
Design rules applied: short sentences; thanks first; one hope line; helpline with both number forms; honest "AI guide, not a counsellor / no counsellor from our side is connected" (required by the Nights decision and the existing fixture); 112 for immediate danger; safe-adult question only in the student (authenticated) version; no method detail; no secrecy promise; no "therapy"; no "a counsellor will call"; gender-neutral grammar; the same facts in all three languages so any can fall back to another.

### A. English (small edit of the current text: hope line, 112, toll-free form, shorter)
Student:
> Thank you for telling me. What you're feeling matters, and with the right support it can get better. Please call Tele-MANAS now on 14416 (or 1800-891-4416). It's free and open 24x7, and you can ask to talk in your own language. I'm an AI guide, not a counsellor, and no counsellor from our side is being connected right now, so Tele-MANAS is the best next step. If you are in danger right now, call 112 or go to a trusted adult near you. Who is a safe adult you could talk to today, like a parent, relative or teacher? I'm still here, and you can keep talking to me.

Anonymous: the same, with the sentence "Who is a safe adult ... teacher?" removed.

(Passes the existing fixture: 14416, "not a counsellor", "no counsellor from our side is being connected", "safe adult", "?".)

### B. Hindi (Devanagari)
Student:
> मुझे बताने के लिए शुक्रिया। आप जो महसूस कर रहे हैं, वह मायने रखता है, और सही मदद से हालात बेहतर हो सकते हैं। कृपया अभी टेली-मानस (Tele-MANAS) को 14416 पर फ़ोन करें, या 1800-891-4416 पर। यह मुफ़्त है, हर समय खुला रहता है, और आप अपनी भाषा में बात करने को कह सकते हैं। मैं एक AI गाइड हूँ, काउंसलर नहीं, और हमारी तरफ़ से अभी कोई काउंसलर नहीं जुड़ रहा है। इसलिए टेली-मानस सबसे अच्छा अगला कदम है। अगर आप अभी ख़तरे में हैं, तो 112 पर फ़ोन करें या अपने पास किसी भरोसेमंद बड़े को बताएँ। आज आप किस भरोसेमंद बड़े से बात कर सकते हैं, जैसे माता-पिता, कोई रिश्तेदार या टीचर? मैं यहीं हूँ, आप मुझसे बात करते रह सकते हैं।

Anonymous: the same without "आज आप किस भरोसेमंद बड़े से ... टीचर?".

Language notes: आप with plural-honorific verbs only (महसूस कर रहे हैं, कह सकते हैं, बात कर सकते हैं, करते रह सकते हैं), so no change for male/female students. "काउंसलर", "टीचर", "फ़ोन" are the words teens use. "टेली-मानस (Tele-MANAS)" gives the Devanagari form for reading aloud and the Latin brand for recognition. Nukta used in फ़ोन, मुफ़्त, ख़तरे (standard; the guard folds nukta on input, output is unaffected).

### C. Hinglish (Roman script, for students who type Hindi in Latin letters)
Student:
> Mujhe batane ke liye shukriya. Aap jo mehsoos kar rahe hain, woh maayne rakhta hai, aur sahi madad se halaat behtar ho sakte hain. Please abhi Tele-MANAS ko 14416 par call karein, ya 1800-891-4416 par. Yeh free hai, hamesha khula rehta hai, aur aap apni bhasha mein baat karne ko keh sakte hain. Main ek AI guide hoon, counsellor nahi, aur hamari taraf se abhi koi counsellor nahi jud raha hai. Isliye Tele-MANAS sabse achha agla kadam hai. Agar aap abhi khatre mein hain, toh 112 par call karein ya apne paas kisi bharosemand bade ko batayein. Aaj aap kis bharosemand bade se baat kar sakte hain, jaise mummy-papa, koi rishtedaar ya teacher? Main yahin hoon, aap mujhse baat karte reh sakte hain.

Anonymous: the same without "Aaj aap kis bharosemand bade ... teacher?".

### D. Voice (spoken) variants: digits spelled so TTS reads them one by one
Hindi: "मैं यहीं हूँ। कृपया अभी टेली-मानस को फ़ोन करें: एक, चार, चार, एक, छह। यह मुफ़्त है और हर समय खुला रहता है। अगर आप ख़तरे में हैं, तो एक, एक, दो पर फ़ोन करें, या किसी भरोसेमंद बड़े को बताएँ।"
English: "I'm still here. Please call Tele-MANAS now: one, four, four, one, six. It's free and open all day and night. If you're in danger, call one, one, two, or tell a trusted adult."
Open point for the owner: whether the voice text must also carry the "AI guide, not a counsellor / none connected" disclosure (the text version does). If yes, add one sentence; it lengthens the audio.

### E. Escalation card (counsellor-side, `crisis.ts:550-562`), corrected facts only
- `CRISIS_MESSAGE`: replace the iCALL sentence with "Tele-MANAS is free and open 24x7: call 14416 (or 1800-891-4416)." and "If you're in immediate danger, please call 112." Drop "anytime" and "trained for exactly this". Keep the rest.
- `CONCERN_MESSAGE` (to the counsellor): replace "iCALL (9152987821) is free and confidential" with "Tele-MANAS (14416, free, 24x7) is there if they want to talk to someone outside this session. iCALL (022-25521111, Mon-Sat 8am-10pm) is a counselling line, not an emergency line."
- `skills/safety-escalation/SKILL.md:42` carries the same iCALL line; same correction.
(Owner decides whether to keep iCALL at all; the fixed student message does not use it.)

## 5. Safe-messaging check of the proposed text
| Criterion (WHO media-professionals resource 2023 / AFSP, applied by analogy; both are written for journalists, not chatbots) | Proposed text |
|---|---|
| No method, means or location detail | none |
| Hope and help-seeking | "can get better with the right support"; helpline; trusted adult |
| Non-judgemental, validating | "Thank you for telling me ... matters" |
| Short, plain | about 90 words in 8 short sentences (was 75 in 6 longer ones); students need the extra facts (112, toll-free), the owner may trim the toll-free form |
| No promise of secrecy / confidentiality; no legal reassurance | none (forbidden words absent) |
| No overclaim of the helpline or of us | "you can ask for your language" (not "Hindi is available"); no "trained for exactly this"; honest AI-not-counsellor disclosure kept |
| Does not leave the student alone | "I'm still here" kept |
Limit of this check: the WHO PDF was not fetched (the WHO URL tried returned 404; the search summary shows the resource exists and stresses hope/help-seeking; the "no method detail" rule comes from the earlier research sources [15][16][22]). Neither is a chatbot standard.

## 6. What implementing this needs (not done; for the orchestrator / a maker unit)
1. `lang.ts`: `CrisisCatalog` gets a `hi-Latn` entry (Hinglish above) and `hi` gets the Devanagari text; `crisisMessageFor` returns `hi-Latn` for Latin-script Hindi (today it folds to `hi`, `lang.ts:568`); keep the English fallback for other languages.
2. `tests/lang.test.ts:169-183`: key list `["en","hi","hi-Latn"]` and a per-language fixture (14416, 1800-891-4416, 112, and Hindi/Hinglish equivalents of the "not a counsellor", "no counsellor from our side is being connected", safe-adult question; no forbidden terms). `CRISIS_FORBIDDEN_PATTERNS` (`graph.ts:112-122`) needs Devanagari and Hinglish forms.
3. `crisis.ts:550-562` and the SKILL.md line: the fact corrections in 4E.
4. Optional: `FIXED_TEXTS` `hi` / `hi-Latn` for `TELE_MANAS_LINE` and `STRESS_CHECK_IN`, which are English only today.
5. Gate: new clinical wording needs the clinical safety owner's sign-off BEFORE it replaces the "already approved" English text (lang.ts header says only vetted wording is used). `lang.ts`, `graph.ts` and `crisis.ts` edits are code changes, not made here.

## 7. Open items needing a person
- Clinical safety owner: approve or edit B, C, D; decide the "ask directly" question (issue 11) and the voice disclosure.
- Hindi native-speaker read of B and C by someone who is not the drafter (I am a language model; this has not been read by a native speaker).
- Go-live test call to 14416: does it answer in Hindi, how fast, does it take callers under 18 (docs/go-live-checklist.md:40).
- Whether 1098 (Childline) belongs in an abuse-specific message once its status is confirmed.

## Sources
- DGHS, National Mental Health Programme (fetched, verbatim number and 24X7): https://dghs.mohfw.gov.in/national-mental-health-programme.php
- PIB, Tele-MANAS releases (seen in search results; direct fetch returned 403): https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2226319&reg=3&lang=2 · https://www.pib.gov.in/PressReleasePage.aspx?PRID=1941620&reg=3&lang=2 · https://www.pib.gov.in/PressReleasePage.aspx?PRID=1866498&reg=48&lang=2
- Tele-MANAS portal (listed; content not read): https://telemanas.mohfw.gov.in/
- PIB, Pan-India Emergency Number 112 (search result): https://www.pib.gov.in/newsite/PrintRelease.aspx?relid=188727&reg=48&lang=2
- TISS iCALL contact page (fetched): https://tiss.ac.in/view/6/projects/icall-telephonic-counselling-service-for-individua/contact-us-6/ · iCALL site: https://icallhelpline.org/ · IndiaSpend directory entry (third-party hours): https://safecheck.indiaspend.com/home/details/12
- Childline: https://www.childlineindia.org/a/about/childline-india · PIB on 1098/112 integration: https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1934905
- WHO, Preventing suicide: a resource for media professionals, 2023 update (existence only): https://www.who.int/publications/i/item/9789240076846 · AFSP safe storytelling: https://storytelling.afsp.org/
- Repo: qa/evidence/crisis-research-20261017/proposal.md and sources.md ([14][18][19][56][64][65]); docs/go-live-checklist.md:40; docs/DECISIONS.md:816 (Q11 Nights).
