# B13 consent text: DRAFT for Umesh's approval (English and Hindi)

**Status:** DRAFT, not approved, not legal advice. Slug `p1-b13-consent-draft`. Drafted 2026-10-17 under D-093 (7): the maker drafts, Umesh approves, with legal review if possible.
**Lane:** docs only. Nothing here changes code, contracts or gates. The B13 contract amendment is checker-owned and needs Umesh's signature (D-093).
**Fill pass 2026-10-21 (branch p1/b13):** every [FILL] that the repo answers has been filled, and the text was corrected where the repo has moved since the first draft (D-090 removed Tavily; D-105 put GLM and DeepSeek via Ollama on the student text path; no Sarvam code exists). What the repo could not answer stays [FILL]. See Part 5 for the log.
**Who shows this text:** Pathlynks, or whichever surface the partner runs. VC does not collect or verify consent (D-086, intent.md "out of scope"). D-093 (4A) asks only that Pathlynks send VC a consent signal for under-18s.

## How to read the tags

- **[LEGAL-REVIEW]** A legal fact or legal choice the sources do not settle. A lawyer must confirm it or fill it in before this text is shown to anyone. Every such item is also listed in Part 4.
- **[FILL]** A name, number or date that no source gives. Do not guess it.
- **[ASSUMPTION]** An engineering fact the spec marks as an assumption.
- Text in the block quotes under a "SHOW TO USER" heading (Parts 1 to 3) is the user-facing wording. Everything else is a note to the approver.

## Part 0. Facts this text relies on, and where they come from

| # | Fact the text states | Source | Grounding |
|---|---|---|---|
| F1 | VC is an AI counsellor. Student chat and the anonymous route use a text model chain: GLM 5.3 flash, then DeepSeek v4.1 flash, both called through Ollama's hosted service (default base URL https://ollama.com); a Gemini Lite slot is reserved but held until a key is supplied. A model safety screen also reads each student turn. Voice goes to Gemini Live. The scribe and the concern classifier stay on the configured VC_LLM provider (Gemini in the plan) until a later eval moves them. | D-105 (Q1, Q4); `.env.example` lines 72-84; `packages/providers/src/index.ts` lines 281-282 and 1133; plan.md sections 2 and 4; D-086, D-093 | Grounded in the repo. Which chain the production environment sets is a deployment fact: [FILL]. Hosting company, region and terms for Ollama, GLM and DeepSeek: [FILL] [LEGAL-REVIEW]. |
| F2 | For signed-in students, a question that VC cannot answer from search alone goes to the KnowledgeBase `/ask`. That service uses its own LLM provider chain (Gemini is the KB's default first provider; the deployed chain is not recorded). Tavily web search is NOT used: Umesh removed it from the B13 processor list, and the KB `TAVILY_API_KEY` stays unset for any deployment VC calls (no key, no web call). | p1-plan-draft spec.md G6; D-090; qa/gates/p1-u0-amendment-signatures.md (Answered 2026-10-17T14:11:30); KB docs/DECISIONS.md D-008; KB `apps/api/src/ask-web-fallback.ts` lines 57-60 (as quoted in the gate) | Grounded. The KB's deployed provider is [FILL]. Go-live check: the KB key is really unset. |
| F3 | VC never shows a web-only or weak answer. | spec.md scope item 3, G6 | Grounded. The question can still reach the KB's own LLM provider, so the text says it may. Tavily is out (D-090). |
| F4 | Speech to text: Gemini Live. Sarvam is named in plan.md as the Indic fallback, but the repo has no Sarvam code or config, so it is not a processor today. Voice stays off until A10 and the go-live gate. | plan.md lines 68, 176, 286; `git grep -i sarvam` finds nothing under packages, apps, skills or mcp; U0-4 | Grounded. If Sarvam is ever enabled, add it to Part 1 and to the processor register. |
| F5 | VC stores redacted turns. Names, phone numbers and emails are removed from questions and essays before storage. Other details (school, city, marks, health) are not covered by that redaction. | D-093 (6A) | Grounded. The text must not claim "no personal data". |
| F6 | Voice turns are saved as text in the same history. Audio itself is not stored. | spec.md scope item 1 | [ASSUMPTION] in the spec |
| F7 | Facts about the student are used for ranking only if from Pathlynks or confirmed by the student. | spec.md scope item 10 | Grounded |
| F8 | Erasure: hard delete of everything held for the student, after two confirmations by the student and an approver's recorded approval; read-back proves zero left; a receipt keeps counts and time only; new writes are blocked from the first confirmation until the purge completes, plus 24 hours. | contract B15 and gate `erasure-fencing` | Grounded |
| F9 | Export: a per-student JSON bundle. | contract B15 | Grounded |
| F10 | The student can view, correct and confirm their profile. | spec.md scope item 8 | Grounded |
| F11 | Retention. Engineering fact: no timer deletes chat turns, profile facts or checkpoints; they stay until erasure. The legal maximum period is not defined anywhere. | `packages/db/src/collections.ts` line 44 (chat store "Never TTL-indexed", guarded by tests/db-init.test.ts); TASKS.md T-024 (D-020: whole chat is kept) | Engineering fact grounded. The period itself: [LEGAL-REVIEW] [FILL] |
| F12 | Crisis handling: a fixed safe message with Tele-MANAS 14416 (free, 24x7; DGHS also lists 1800-89-14416); asks who the student's safe adult is; no promise of secrecy; keeps talking; every flag is logged. Tele-MANAS language coverage is unverified. | crisis-research-20261017/proposal.md items 3, 5; spec.md scope item 9 | Grounded. The research could not read the official Tele-MANAS portal; number and hours are confirmed on a DGHS page only. |
| F13 | No human-alert route is live until the CEO "Nights" decision. Until then the Tele-MANAS hand-off is disclosed and no counsellor is promised. | spec.md scope item 9, A20 | Grounded |
| F14 | Crisis flags and notifications are erased with the student, and appear in the student's export. | docs/plan.md crisis-record erasure/export unit (working-tree text, lines about 318 to 337) | Grounded in the plan. A litigation hold would conflict: [LEGAL-REVIEW] |
| F15 | Without a consent record, a crisis turn still escalates, but the record holds identifiers and the flag only, never message text. | contract B4, D-027 | Grounded. Whether even this is lawful for a minor without parental consent is [LEGAL-REVIEW]. |
| F16 | Anonymous mode: VC stores no profile, transcript, thread, trace or user text. The only write is a text-free counter (date, kind, count). Personal questions need sign-in. Rate limit is in memory. The question still goes to Gemini and to KnowledgeBase `/search`. It never goes to `/ask`, so never to Tavily. | spec.md scope item 2, A15c, G3 | Grounded. KB-side and provider-side handling is outside VC's control and not verified. |
| F17 | Under 18: parent or guardian consent is needed before anything personal is stored (DPDP s.9). Pathlynks supplies the consent signal. Without it the turn runs but nothing personal persists. | D-093 (4A) | Grounded |
| F18 | DPDP Act 2023 s.9: verifiable parental consent before processing a child's personal data; s.9(2) no processing likely to harm a child's well-being; s.9(3) no tracking or behavioural monitoring of children. Rule 10 requires checking that the claimed parent is an adult (18 or older). | crisis-research report.md section on DPDP, sources [2] and [3] | Grounded in a third-party site (dpdpa.com). Verify against the Gazette. |
| F19 | The main DPDP Rules (including Rule 10) are expected in force about 13 May 2027. Not confirmed from the Gazette. | report.md DPDP timing paragraph | [LEGAL-REVIEW] |
| F20 | VC does not draft essays or SOPs for the student; it coaches. | spec.md scope item 8, contract B1 | Grounded |
| F21 | Who runs VC. | Brand name "Vidysea" (ARCHITECTURE.md line 8; docs/intent.md line 1). The registered legal entity, its address, and whether Pathlynks or Vidysea is the Data Fiduciary appear in no tracked file of D:/vc and no doc found under D:/ai_os (no privacy policy or grievance officer either). | Brand grounded. Legal entity: [FILL] [LEGAL-REVIEW] |
| F22 | Withdrawal and grievance route. | The erasure flow itself exists (F8). The student-facing surface that receives a withdrawal or a complaint belongs to Pathlynks or the partner and is not in this repo. | [FILL] [LEGAL-REVIEW] |
| F23 | Helplines. | Shipped student messages: Tele-MANAS 14416, free, open 24x7 (`packages/engine/src/student/lang.ts` lines 31, 36, 48). 112 and iCALL 9152987821 appear only in the counsellor-side card (`packages/engine/src/guards/crisis.ts` lines 553-554). | Grounded for 14416. 112 stays [LEGAL-REVIEW]. |

## Part 1. Student consent text (SHOW TO USER)

### English

> **Before you start: what VC does with your information**
>
> **What VC is.** VC (Virtual Counsellor) is an AI counsellor. It helps you think about studying abroad: countries, courses, costs and next steps. It coaches you and shows where its information comes from. It is not a person, it can be wrong, and it does not write your essays or applications for you.
>
> **Who sees your messages.** To answer you, VC sends your messages to outside services:
> - **AI language models.** These read your question and write the reply. VC uses the models **GLM** and **DeepSeek**, run through the hosted service of **Ollama**, and may use **Google Gemini** as a backup. [FILL: confirm the chain set in the live system, and the company and country that host each model.] The same kind of AI model also checks messages for signs that you may be in distress.
> - **Google Gemini for voice.** If you use voice, Gemini turns your speech into text.
> - **Our knowledge-base service.** It looks up facts from Vidysea's own material. If it cannot answer from that material, it may send your question to **its own AI provider [FILL: provider name; the knowledge base's default is Google Gemini]**. VC does not use web search for your question, and it will not show you an answer that came from the open web. [CONFIRM before go-live: the knowledge base's web-search key is unset.]
>
> These services are run by other companies, and they handle your text under their own terms. [LEGAL-REVIEW: provider terms, retention at each provider, and whether data leaves India.]
>
> **What VC saves.**
> - Your conversation, saved as text. Before saving, VC removes names, phone numbers and email addresses. VC does not remove other details such as your school, city, marks or health, so please share only what you are comfortable with.
> - If you use voice, the words are saved as text in the same history. The audio is not kept. [ASSUMPTION: confirm]
> - Facts about you, such as your goals, country choices and budget. VC uses a fact to suggest options only if it came from Pathlynks or you confirmed it. You can look at your profile, correct it and confirm it.
> - A note when a message looks like you may be in danger (see below).
>
> **How long.** VC does not delete this on a timer. It keeps it until you ask us to delete it. [FILL: maximum retention period, if the law or Vidysea sets one] [LEGAL-REVIEW]
>
> **Your rights.**
> - **Delete:** you can ask us to erase everything VC holds about you. You confirm twice, then a person at Vidysea or your partner approves it. Then it is deleted for good, VC checks that nothing is left, and keeps only a receipt with counts and a time. From your first confirmation until the deletion is finished, plus 24 hours more, VC will not save anything new about you.
> - **Download:** you can ask for a copy of your data as one file.
> - **Correct:** you can change facts in your profile.
> - **Stop:** you can withdraw your consent at any time by [FILL: withdrawal route] [LEGAL-REVIEW]. VC then stops saving anything about you.
> - **Complain:** write to [FILL: grievance officer name and email] [LEGAL-REVIEW].
>
> **If you are in danger.** VC is not an emergency service and not a therapist. If a message suggests you might hurt yourself, VC will answer with care, show the helpline **Tele-MANAS 14416** (free, any time, any day), ask who the adult you trust is, and keep talking with you. VC cannot promise that your messages will stay secret if someone's safety is at risk. It also cannot promise that a counsellor will read a flag straight away, especially at night. [LEGAL-REVIEW: who is told, how fast, and whether a guardian is told.] If you are in immediate danger, call **112** or Tele-MANAS now. [LEGAL-REVIEW: 112 is in the counsellor-side card (crisis.ts line 554) but not in the student message (lang.ts lines 44-52), which says only to tell a trusted adult; confirm or remove.]
>
> **Using VC without signing in.** You can ask general questions without signing in. VC then saves no profile, no conversation and no text of your question. It keeps only a count of how many questions were asked, with no words and no identity. Your question is still sent to Gemini and to our knowledge-base search to get an answer. If you ask something personal, VC will ask you to sign in first. Please do not type your name, phone number or other private details there.
>
> **Your choice.** By pressing "I agree" you agree to the above. If you do not agree, you can still use VC without signing in, as described above. If you are under 18, a parent or guardian must agree for you; see the next part.

### Hindi

> **शुरू करने से पहले: VC आपकी जानकारी का क्या करता है**
>
> **VC क्या है।** VC (वर्चुअल काउंसलर) एक AI काउंसलर है। यह विदेश में पढ़ाई से जुड़े सवालों में आपकी मदद करता है: देश, कोर्स, खर्च और अगले कदम। यह आपको सोचने में मदद करता है और बताता है कि जानकारी कहाँ से आई है। यह इंसान नहीं है, इससे गलती हो सकती है, और यह आपके निबंध या आवेदन खुद नहीं लिखता।
>
> **आपके संदेश कौन देखता है।** जवाब देने के लिए VC आपके संदेश बाहर की कुछ सेवाओं को भेजता है:
> - **AI भाषा मॉडल।** ये आपका सवाल पढ़कर जवाब लिखते हैं। VC **GLM** और **DeepSeek** मॉडल इस्तेमाल करता है, जो **Ollama** की होस्ट की हुई सेवा से चलते हैं, और बैकअप के रूप में **Google Gemini** इस्तेमाल कर सकता है। [FILL: पक्का करें कि लाइव सिस्टम में कौन-सी श्रृंखला लगी है, और हर मॉडल को कौन-सी कंपनी और किस देश में होस्ट करती है।] इसी तरह का AI मॉडल संदेशों में परेशानी के संकेत भी देखता है।
> - **आवाज़ के लिए Google Gemini।** अगर आप बोलकर पूछते हैं, तो Gemini आपकी आवाज़ को लिखे हुए शब्दों में बदलता है।
> - **हमारी नॉलेज-बेस सेवा।** यह Vidysea की अपनी सामग्री से तथ्य खोजती है। अगर उस सामग्री से जवाब नहीं मिलता, तो वह आपका सवाल **अपने AI प्रदाता [FILL: नाम; नॉलेज-बेस का डिफ़ॉल्ट Google Gemini है]** को भेज सकती है। आपके सवाल के लिए VC वेब-सर्च इस्तेमाल नहीं करता, और जो जवाब खुले वेब से आया हो, VC वह आपको नहीं दिखाता। [पुष्टि, लाइव होने से पहले: नॉलेज-बेस की वेब-सर्च कुंजी खाली है।]
>
> ये सेवाएँ दूसरी कंपनियाँ चलाती हैं और आपका लिखा हुआ अपनी शर्तों के हिसाब से संभालती हैं। [LEGAL-REVIEW: प्रदाताओं की शर्तें, हर प्रदाता के पास रखने की अवधि, और डेटा भारत से बाहर जाता है या नहीं।]
>
> **VC क्या सहेजता है।**
> - आपकी बातचीत, लिखे हुए रूप में। सहेजने से पहले VC नाम, फ़ोन नंबर और ईमेल पता हटा देता है। स्कूल, शहर, अंक या सेहत जैसी दूसरी बातें VC नहीं हटाता, इसलिए वही बताइए जो आप बताना चाहें।
> - अगर आप बोलकर पूछते हैं, तो आपके शब्द उसी इतिहास में लिखे हुए रूप में सहेजे जाते हैं। आवाज़ की रिकॉर्डिंग नहीं रखी जाती। [ASSUMPTION: पक्का करें]
> - आपके बारे में तथ्य, जैसे आपके लक्ष्य, देशों की पसंद और बजट। VC किसी तथ्य का इस्तेमाल विकल्प सुझाने में तभी करता है जब वह Pathlynks से आया हो या आपने उसे पक्का किया हो। आप अपनी प्रोफ़ाइल देख सकते हैं, सुधार सकते हैं और पक्की कर सकते हैं।
> - जब कोई संदेश ऐसा लगे कि आप खतरे में हो सकते हैं, तब उसका एक नोट (नीचे देखें)।
>
> **कितने समय तक।** VC यह सब किसी टाइमर से अपने-आप नहीं मिटाता। यह तब तक रखा जाता है जब तक आप इसे मिटाने को नहीं कहते। [FILL: अधिकतम रखने की अवधि, अगर कानून या Vidysea तय करे] [LEGAL-REVIEW]
>
> **आपके अधिकार।**
> - **मिटाना:** आप कह सकते हैं कि VC के पास आपके बारे में जो कुछ है, सब मिटा दिया जाए। आप दो बार पक्का करते हैं, फिर Vidysea या आपके पार्टनर का एक व्यक्ति उसे मंज़ूर करता है। उसके बाद सब हमेशा के लिए मिटा दिया जाता है, VC जाँचता है कि कुछ बचा नहीं, और सिर्फ़ एक रसीद रखता है जिसमें गिनती और समय होता है। आपकी पहली पुष्टि से लेकर मिटाने का काम पूरा होने तक, और उसके बाद 24 घंटे और, VC आपके बारे में कुछ नया नहीं सहेजता।
> - **कॉपी लेना:** आप अपने डेटा की एक फ़ाइल में कॉपी माँग सकते हैं।
> - **सुधारना:** आप अपनी प्रोफ़ाइल के तथ्य बदल सकते हैं।
> - **सहमति वापस लेना:** आप कभी भी [FILL: वापसी का तरीका] से अपनी सहमति वापस ले सकते हैं [LEGAL-REVIEW]। उसके बाद VC आपके बारे में कुछ नहीं सहेजता।
> - **शिकायत:** [FILL: शिकायत अधिकारी का नाम और ईमेल] को लिखें [LEGAL-REVIEW]।
>
> **अगर आप खतरे में हैं।** VC आपातकालीन सेवा नहीं है और थेरेपिस्ट भी नहीं है। अगर किसी संदेश से लगे कि आप खुद को नुकसान पहुँचा सकते हैं, तो VC प्यार और ध्यान से जवाब देगा, हेल्पलाइन **Tele-MANAS 14416** (मुफ़्त, हर दिन, हर समय) दिखाएगा, पूछेगा कि आपका भरोसेमंद बड़ा कौन है, और आपसे बात करता रहेगा। अगर किसी की सुरक्षा खतरे में हो, तो VC यह वादा नहीं कर सकता कि आपकी बातें गुप्त रहेंगी। VC यह भी वादा नहीं कर सकता कि कोई काउंसलर तुरंत वह संदेश पढ़ेगा, खासकर रात में। [LEGAL-REVIEW: किसे बताया जाएगा, कितनी जल्दी, और अभिभावक को बताया जाएगा या नहीं।] अगर आप अभी खतरे में हैं, तो तुरंत **112** या Tele-MANAS पर फ़ोन कीजिए। [LEGAL-REVIEW: 112 सिर्फ़ काउंसलर-पक्ष के कार्ड में है, विद्यार्थी के संदेश में नहीं (वहाँ सिर्फ़ किसी भरोसेमंद बड़े को बताने को कहा गया है); पक्का करें या हटाएँ।]
>
> **बिना साइन-इन के VC का इस्तेमाल।** आप बिना साइन-इन किए सामान्य सवाल पूछ सकते हैं। तब VC कोई प्रोफ़ाइल, कोई बातचीत और आपके सवाल का कोई शब्द नहीं सहेजता। वह सिर्फ़ यह गिनती रखता है कि कितने सवाल पूछे गए, बिना किसी शब्द और बिना पहचान के। जवाब पाने के लिए आपका सवाल फिर भी Gemini और हमारी नॉलेज-बेस खोज को भेजा जाता है। अगर आप कुछ निजी पूछेंगे, तो VC पहले साइन-इन करने को कहेगा। कृपया वहाँ अपना नाम, फ़ोन नंबर या दूसरी निजी बातें न लिखें।
>
> **आपका फ़ैसला।** "मैं सहमत हूँ" दबाने का मतलब है कि आप ऊपर लिखी बातों से सहमत हैं। अगर आप सहमत नहीं हैं, तो भी आप ऊपर बताए अनुसार बिना साइन-इन के VC इस्तेमाल कर सकते हैं। अगर आपकी उम्र 18 साल से कम है, तो आपकी जगह माता-पिता या अभिभावक को सहमति देनी होगी; अगला भाग देखें।

## Part 2. Parent or guardian consent text, for students under 18 (SHOW TO USER)

Legal basis: DPDP Act 2023 s.9 (verifiable parental consent before a child's personal data is processed). Rule 10 (check that the person is an adult) and the commencement date of the Rules are [LEGAL-REVIEW] (F18, F19). **How the parent is verified, and how the consent signal reaches VC, is Pathlynks's job and is not described here.** [LEGAL-REVIEW]

### English

> **For parents and guardians: consent for your child to use VC**
>
> Your child (under 18) wants to use VC, an AI counsellor that helps with studying abroad. Under India's Digital Personal Data Protection Act 2023 (section 9), we need your consent before VC keeps any personal information about your child. [LEGAL-REVIEW: confirm the wording, the legal basis, and the date from which this applies.]
>
> **What you are agreeing to.** Please read the student text above. It tells you what VC saves (the conversation as text, with names, phone numbers and emails removed; facts about your child that they or Pathlynks confirm), which outside services see the messages (the AI language models GLM and DeepSeek run through Ollama's hosted service, Google Gemini for voice and as a backup, and our knowledge-base service with its own AI provider), how long we keep it [FILL] [LEGAL-REVIEW], and your child's rights.
>
> **If you do not agree.** VC will still answer general questions, but it will not save anything personal about your child. It will not remember earlier chats. [Source: D-093 (4A).] Safety is the one exception: if a message suggests your child may be in danger, VC records only who the child is and that a safety flag was raised, never the message itself. [LEGAL-REVIEW: confirm this is allowed for a child without parental consent.]
>
> **Your rights as a parent or guardian.** You can ask to see, correct, download or delete your child's data, and to withdraw this consent at any time, by [FILL: route] [LEGAL-REVIEW]. For complaints write to [FILL: grievance officer].
>
> **Safety.** VC is not an emergency service or a therapist. If your child's messages suggest they may be in danger, VC shows the Tele-MANAS helpline 14416 and asks the child to speak to a trusted adult. VC does not promise to keep such messages secret. We do not promise that a person will see a flag at once, or at night. [LEGAL-REVIEW: whether and when a parent or guardian is told, and whether detection of distress in a child's messages counts as "behavioural monitoring" under section 9(3).]
>
> **What VC does not do.** It does not show your child advertisements, and it does not use their chats to profile them for any purpose other than helping them with counselling. [LEGAL-REVIEW and CONFIRM: no source states an advertising or profiling policy; the research recommends it. Do not ship this sentence until Vidysea confirms it is true.]
>
> By pressing "I agree" you confirm that you are the parent or legal guardian of this student, that you are 18 or older, and that you agree to the above. [LEGAL-REVIEW: the verification method, and who stores the proof.]

### Hindi

> **माता-पिता और अभिभावकों के लिए: आपके बच्चे के VC इस्तेमाल की सहमति**
>
> आपका बच्चा (18 साल से कम) VC इस्तेमाल करना चाहता है। VC एक AI काउंसलर है जो विदेश में पढ़ाई में मदद करता है। भारत के डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम 2023 (धारा 9) के अनुसार, VC आपके बच्चे की कोई भी निजी जानकारी सहेजे, इससे पहले हमें आपकी सहमति चाहिए। [LEGAL-REVIEW: शब्द, कानूनी आधार और यह किस तारीख से लागू है, इसकी पुष्टि करें।]
>
> **आप किस बात पर सहमति दे रहे हैं।** कृपया ऊपर विद्यार्थी वाला भाग पढ़ें। उसमें लिखा है कि VC क्या सहेजता है (बातचीत लिखे हुए रूप में, नाम, फ़ोन नंबर और ईमेल हटाकर; आपके बच्चे के बारे में वे तथ्य जिन्हें बच्चे ने या Pathlynks ने पक्का किया हो), कौन-सी बाहरी सेवाएँ संदेश देखती हैं (GLM और DeepSeek AI मॉडल जो Ollama की सेवा से चलते हैं, आवाज़ के लिए और बैकअप के रूप में Google Gemini, और हमारी नॉलेज-बेस सेवा अपने AI प्रदाता के साथ), कितने समय तक रखा जाता है [FILL] [LEGAL-REVIEW], और आपके बच्चे के अधिकार क्या हैं।
>
> **अगर आप सहमत नहीं हैं।** VC फिर भी सामान्य सवालों के जवाब देगा, पर आपके बच्चे के बारे में कुछ निजी नहीं सहेजेगा। उसे पिछली बातचीत याद नहीं रहेगी। सुरक्षा इसका एकमात्र अपवाद है: अगर किसी संदेश से लगे कि आपका बच्चा खतरे में हो सकता है, तो VC सिर्फ़ यह दर्ज करता है कि बच्चा कौन है और सुरक्षा का संकेत उठा, संदेश कभी नहीं। [LEGAL-REVIEW: पक्का करें कि माता-पिता की सहमति के बिना बच्चे के लिए यह अनुमत है।]
>
> **माता-पिता या अभिभावक के रूप में आपके अधिकार।** आप कभी भी अपने बच्चे का डेटा देखने, सुधारने, डाउनलोड करने या मिटाने को कह सकते हैं, और यह सहमति वापस ले सकते हैं, [FILL: तरीका] से [LEGAL-REVIEW]। शिकायत के लिए [FILL: शिकायत अधिकारी] को लिखें।
>
> **सुरक्षा।** VC आपातकालीन सेवा या थेरेपिस्ट नहीं है। अगर आपके बच्चे के संदेशों से लगे कि वह खतरे में हो सकता है, तो VC Tele-MANAS हेल्पलाइन 14416 दिखाता है और बच्चे से किसी भरोसेमंद बड़े से बात करने को कहता है। VC ऐसे संदेशों को गुप्त रखने का वादा नहीं करता। हम यह वादा भी नहीं करते कि कोई व्यक्ति संकेत को तुरंत या रात में देखेगा। [LEGAL-REVIEW: माता-पिता या अभिभावक को कब और बताया जाएगा या नहीं, और क्या बच्चे के संदेशों में परेशानी पहचानना धारा 9(3) के तहत "व्यवहार की निगरानी" माना जाएगा।]
>
> **VC क्या नहीं करता।** यह आपके बच्चे को विज्ञापन नहीं दिखाता, और उनकी बातचीत का इस्तेमाल काउंसलिंग में मदद के अलावा किसी और मक़सद से उनकी प्रोफ़ाइल बनाने में नहीं करता। [LEGAL-REVIEW और पुष्टि: किसी स्रोत में विज्ञापन या प्रोफ़ाइलिंग की नीति नहीं लिखी है; शोध इसकी सिफ़ारिश करता है। जब तक Vidysea पक्का न करे कि यह सच है, यह वाक्य न दिखाएँ।]
>
> "मैं सहमत हूँ" दबाकर आप पुष्टि करते हैं कि आप इस विद्यार्थी के माता-पिता या कानूनी अभिभावक हैं, आपकी उम्र 18 साल या उससे ज़्यादा है, और आप ऊपर लिखी बातों से सहमत हैं। [LEGAL-REVIEW: पुष्टि का तरीका, और प्रमाण कौन रखेगा।]

## Part 3. Short anonymous-mode notice (SHOW TO USER, above the chat box)

**English:** You are using VC without signing in. VC saves nothing about you or your question, only a count of questions with no words and no identity. Your question is still sent to Gemini and to our knowledge-base search to get an answer. Do not type your name, phone number or private details. For personal advice, sign in. If you are in danger, call Tele-MANAS 14416 (free, any time).

**हिन्दी:** आप बिना साइन-इन के VC इस्तेमाल कर रहे हैं। VC आपके या आपके सवाल के बारे में कुछ नहीं सहेजता, सिर्फ़ सवालों की गिनती रखता है, बिना किसी शब्द और बिना पहचान के। जवाब पाने के लिए आपका सवाल फिर भी Gemini और हमारी नॉलेज-बेस खोज को भेजा जाता है। अपना नाम, फ़ोन नंबर या निजी बातें न लिखें। निजी सलाह के लिए साइन-इन करें। अगर आप खतरे में हैं, तो Tele-MANAS 14416 पर फ़ोन करें (मुफ़्त, हर समय)।

## Part 4. Open items for the approver and the lawyer

**Needs a lawyer ([LEGAL-REVIEW]):**
1. Retention periods for conversations, profile facts, crisis flags and backups (F11), and how a litigation hold interacts with erasure (F14). No source sets any period.
2. Whether per-message distress detection on minors is "behavioural monitoring" under DPDP s.9(3) or harm under s.9(2), and whether the Fourth Schedule exemptions or s.7(f) apply (report.md findings 2 and 3).
3. Whether recording identifiers plus a crisis flag, with no consent signal for a minor, is lawful (F15). This is the B4 and D-027 exception, narrowed by D-093 (4A).
4. Parent verification method and Rule 10 adult check, who holds the proof, and whether Pathlynks or Vidysea is the Data Fiduciary (F17, F18). The entity name is [FILL] throughout.
5. Commencement date of the DPDP Rules (about 13 May 2027, unconfirmed against the Gazette), and the Fourth Schedule text (read from a third-party site; the MeitY PDF returned 403) (F18, F19).
6. Provider terms and data location for Ollama's hosted GLM and DeepSeek models, Gemini (voice and backup), and the KB's LLM provider; cross-border transfer; processor agreements (F1, F2, F4). Tavily is out (D-090) and Sarvam is not integrated, so neither is listed.
7. Withdrawal route, grievance officer and the rights wording (access, correction, erasure, grievance) required by the Act.
8. Who is told when a crisis flag is raised, how fast, and whether a guardian is told over the student's wishes (proposal "Three decisions" 1 to 3; the CEO Nights decision is still open).
9. The helpline set: Tele-MANAS 14416 is the number in the shipped student messages. 112 is in the counsellor-side card only, and iCALL 9152987821 is counsellor-side only; neither is in the student text, and 112 stays tagged. Tele-MANAS language coverage is unverified; the official Tele-MANAS portal could not be read.
10. The sentence on advertising and profiling in Part 2, which no source supports yet.
11. POCSO duty to report: the text does not mention it. Whether the consent text must say that a disclosure of abuse may be reported to the police is for counsel (report.md finding 5).

**Needs a name or number ([FILL]):** the deployed model chain and the company and country hosting GLM and DeepSeek through Ollama; the KB's deployed LLM provider; the maximum retention period (if any); the withdrawal route; the grievance officer; the Data Fiduciary legal entity name. (Sarvam and Tavily are no longer in the text; see Part 5.)

**Design points the approver should know:**
- The Pathlynks rule "authenticated = consented" (D-086) is narrowed for under-18s by D-093 (4A). This text assumes a consent signal exists for minors. If Pathlynks cannot send it, a minor's turn runs but nothing personal persists, and Part 2 would have no surface to appear on.
- The wording "VC saves nothing" for anonymous mode is limited to VC's own storage (spec.md scope item 2). Provider and KB handling are stated in the text, not denied. The KB has no request logger, but provider error strings are unverified (G3).
- "Redacted" covers names, phone numbers and emails only (D-093 6A). Do not widen the claim.
- The text promises no counsellor, no speed and no secrecy for crisis flags, because the human-alert route is not live (F13).
- Hindi: plain register, written for a 13 to 18 year old and a parent. A native-Hindi reviewer should read Part 1 to 3 once before use, as was done for the UI labels (T-048).
- Contract and register follow-ups (checker-owned, NOT edited here): `qa/contracts/counselling-engine.md` B13 (lines 232-236) still lists Tavily as a processor, although D-090 removed it; and the processor register in `qa/gates/p1-u0-amendment-signatures.md` has no row for the Ollama-hosted GLM and DeepSeek models of the student text chain (D-105), only the generic failover-chain row.
- This draft cannot assert compliance with the DPDP Act. Do not add the word "compliant" anywhere.

## Part 5. Fill log (2026-10-21)

**Filled or corrected, with source:**
- Tavily removed from Parts 1 and 2 and the fact table: D-090; qa/gates/p1-u0-amendment-signatures.md (Answered 2026-10-17T14:11:30).
- Text model chain named (GLM, DeepSeek via Ollama; Gemini backup and voice): D-105; `.env.example`; `packages/providers/src/index.ts`.
- Sarvam removed from the text (not integrated): `git grep -i sarvam` finds no code.
- Retention: wording now states the engineering fact (no timer, kept until erased): `packages/db/src/collections.ts` line 44; TASKS.md T-024. The legal period stays [FILL].
- KB provider: default first provider is Gemini (KB D-008); kept as [FILL] because the deployed chain is not recorded.
- Helplines: Tele-MANAS 14416, free, 24x7 confirmed against `lang.ts`; 112 and iCALL traced to the counsellor-side card only.
- Brand name: Vidysea (ARCHITECTURE.md, docs/intent.md).

**Still missing (not in any repo document):** Data Fiduciary legal entity name and address; grievance officer name and email; withdrawal route; maximum retention period; deployed model chain and the hosting company and country of each model; KB deployed LLM provider; processor terms, retention and region for every provider; confirmation that 112 belongs in the student text; confirmation that the KB web-search key is unset in production.

All [LEGAL-REVIEW] tags are kept.
