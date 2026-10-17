# T-048 Hindi label review (read-only), 2026-10-17

Source: apps/web/src/components/labels.ts (HINDI_LABELS, HI_ENUMS, metadata), commit 36bae79.
Usage checked in apps/web/src/components/ApprovalScreen.tsx and NewSessionForm.tsx.
Context: a counsellor reviews AI-scribe proposed profile facts for a student (approve / edit / reject), then submits.

Note: the 15 Oct examples (book -> पुस्तक, intake -> सेवन) do NOT occur in this dictionary. There is no booking, intake, application or shortlist key here, so nothing to keep as English for those. The same failure pattern (literal sense) does occur in: thread, conflict, write pending, resolved, escalated.

Confidence = how sure I am the current string is a problem and the proposal is better (high / med / low). Proposals need a native-speaker counsellor sign-off.

| key | current | problem | proposed | confidence |
|---|---|---|---|---|
| enum.outcome.conflict | विरोध | Wrong sense. English = write/version conflict (profile changed since proposal). विरोध = opposition/protest. | टकराव (प्रोफ़ाइल पहले बदल चुकी) or कन्फ़्लिक्ट | high |
| enum.outcome.partial_conflict | आंशिक विरोध | Same wrong sense as conflict. | आंशिक टकराव | high |
| thread | वार्ता | Wrong sense. "Thread" is a technical thread id, not talks/negotiation. | थ्रेड | high |
| stateNotFound | वार्ता नहीं मिली | Same: "thread not found", not "talks not found". | थ्रेड नहीं मिला | high |
| stateInProgress | निर्णय दर्ज, लेखन लंबित | "लेखन" = authoring/writing text. English "write pending" = database save. लंबित is bureaucratic. | निर्णय दर्ज हो गया, सेव होना बाकी है | high |
| edit (vs enum.change.update) | बदलें (both) | Collision: the Edit button and the change type "update" are the same word, and colChange is बदलाव. A counsellor cannot tell action from state. | edit: एडिट करें; change.update: अपडेट | high |
| enum.source.kb | ज्ञान भंडार | Overly Sanskritised for "KB"; nobody says this. | नॉलेज बेस | med |
| enum.speaker.counsellor, enum.source.counsellor-edit, metadata title/description | परामर्शदाता, परामर्श स्वीकृति, विद्यार्थी परामर्श | Overly formal; Indian students and counsellors say "काउंसलर/काउंसलिंग". Brand-visible in the page title. | काउंसलर; काउंसलर अप्रूवल; स्टूडेंट काउंसलिंग और सेशन रिव्यू | med |
| stateAlreadyResolved | पहले ही पूर्ण | "Resolved" (decision already applied) is not "complete". | पहले ही तय हो चुका है | med |
| enum.outcome.escalated | सहायता को भेजा गया | Vague. Used for crisis escalation; does not say it went to a human/safety team. | वरिष्ठ टीम को भेजा गया (or एस्केलेट किया गया) | med |
| submitSession | समीक्षा के लिए भेजें | English says "for scribe review"; Hindi drops "scribe", so who reviews is unclear (AI scribe vs the counsellor). | स्क्राइब रिव्यू के लिए भेजें | med |
| rejectReasonLimitReached | सीमा पूरी | "Limit reached" reads as "limit complete", ambiguous, no verb. | सीमा पूरी हो गई | med |
| session / title / stateSessionProcessing / newSessionTitle / newSessionLinkHome / stateSessionStarted / sectionTranscript | सत्र | "सत्र" is textbook/academic (class term); counsellors and students say "सेशन". Also "सत्र पर कार्य जारी" is stilted. | सेशन; सेशन प्रोसेस हो रहा है | med |
| sectionDropped | हटाए गए तथ्य | "हटाए" implies deleted from the profile; they were dropped from proposal (not applied). | छोड़े गए तथ्य | med |
| colTurn | बारी | Turn = conversation turn number. "बारी" = someone's turn to act, so reads as a queue position. | टर्न | med |
| colValue / colBefore / editedValue | प्रस्तावित मान / मौजूदा मान / बदला हुआ मान | "मान" is the maths/physics sense; fact values are text (e.g. a course name). editedValue "बदला हुआ" also collides with बदलें. | प्रस्तावित वैल्यू / मौजूदा वैल्यू / एडिट की हुई वैल्यू | med |
| needsReview | समीक्षा आवश्यक | "समीक्षा" is overly formal for a short chip. | रिव्यू ज़रूरी (or जाँच ज़रूरी) | med |
| rejectReason | कारण (वैकल्पिक) | "वैकल्पिक" (Sanskritised "optional") is a form-filler word; natural is "ज़रूरी नहीं". | कारण (ज़रूरी नहीं) | med |
| sectionSummary | सत्र सारांश का मसौदा | "मसौदा" is legal/bureaucratic for "draft". | सेशन समरी (ड्राफ़्ट) | med |
| withhold / summaryWithheld / summaryWithheldBefore | रोकें / सारांश रोका गया / समीक्षा से पहले रोका गया | "रोकें" also means "stop"; sense is "hold back, do not publish". Not wrong, but ambiguous on a button. | रोककर रखें / होल्ड करें | low |
| invalidNumber | मान्य संख्या नहीं | Stiff. | सही नंबर नहीं है | low |
| aiUnavailableApology | असुविधा के लिए क्षमा | "क्षमा" alone is heavy for "sorry for the trouble"; standard is खेद. | असुविधा के लिए खेद है | low |
| aiUnavailableHint | लिखा हुआ सुरक्षित है | Fine in sense; slightly clipped (no "आपका"). | आपने जो लिखा वह सुरक्षित है | low |
| colSensitivity / enum.sensitivity.high | संवेदनशीलता / अधिक | "संवेदनशीलता" is Sanskritised; "अधिक" for "high" is stiff. | सेंसिटिविटी; ज़्यादा | low |
| approve / reject / title / openApprovalScreen / summaryApproved | स्वीकार करें / अस्वीकार करें / स्वीकृति | Correct but formal; product staff say "अप्रूव". Acceptable as is if the team prefers pure Hindi. | अप्रूव करें / रिजेक्ट करें / अप्रूवल | low |
| colDecision / decided / sameDecision / otherDecision | निर्णय | Correct; "फ़ैसला" is the spoken form. Keep unless tone is wanted. | फ़ैसला | low |
| reload | फिर लोड करें | "फिर" is awkward; usual is दोबारा. | दोबारा लोड करें | low |
| retry | फिर कोशिश करें | Same. | दोबारा कोशिश करें | low |
| rejectReasonRemaining | शेष अक्षर | "शेष" formal; the counter shows n/max. | बचे अक्षर | low |
| stateError | सर्वर त्रुटि | Correct; "त्रुटि" is formal, "सर्वर एरर" is what users see elsewhere. | सर्वर एरर | low |
| stateDone | पूर्ण | Terse; "पूर्ण" reads like a form status. | पूरा हो गया | low |
| enum.outcome.summary_failed | सारांश में त्रुटि | Missing the verb; English "Summary failed" = summary could not be produced. | सारांश बनाने में त्रुटि | low |
| languageHindi | हिन्दी | Valid spelling but the common form is हिंदी (anusvara). | हिंदी | low |
| stateFenced | डेटा मिटाया जा रहा है | Sense is right (erasure in progress); a bit more alarming than English. Keep. | keep (optional: डेटा हटाने की प्रक्रिया जारी है) | low |

## Strings reviewed and judged OK
language, student (विद्यार्थी), thread aside, sectionFacts, sectionWritten (दर्ज तथ्य), colFact, colChange, colEvidence (प्रमाण), colConfidence, colReason, submit, submitting, outcome, issues, none, stateLoading, stateInvalid, newSessionLinkHome, colTranscriptText (क्या कहा गया, good), enum.outcome.written/refused/rejected/extraction_failed, enum.change.add/remove, enum.sensitivity.low/medium, enum.source.profile/student-direct, stateAiUnavailable (एआई; Roman "AI" is also common).

## Totals
Strings/keys reviewed: 53 labels + 8 outcome + 3 change + 3 sensitivity + 4 source + 2 speaker + metadata (2) = 75 entries.
Rows flagged: 34 (6 high, 13 med, 15 low). Real wrong-sense errors: conflict, partial_conflict, thread (2 keys), "write pending"/लेखन, plus the बदलें collision.
