# Proposal: what the counsellor bot does when a student is in crisis
For the CEO · 2026-10-17 · Evidence: report.md (70 sources, 64 verified). [n] = reference in report.md. Research, not legal advice.

## The problem
Many of our students are 13 to 18. Some will tell the bot they want to hurt themselves. If the bot notices and nothing happens, that is the worst position; US suits allege exactly this [32][42] (allegations, not findings). If it tells parents or school every time, students stop telling anyone [26][55].

## Recommended policy
1. **Scope.** The bot supports, refers and escalates. It never diagnoses, treats or calls itself therapy [24].
2. **Detection.** A separate safety checker reads every message. It can raise a flag but never clears one (our design choice, backed by [34]). Level 0 nothing. Level 1 stress or venting: kind reply, helpline visible. Level 2 thoughts of self-harm: bot asks directly, a human is alerted. Level 3 plan, means or attempt: human paged at once. Unsure, indirect, Hinglish or voice cases count as level 2 [23][70], since Hinglish detection is unproven. If age is unsure, use minor settings [24][35].
3. **What the bot says first.** "If you are in danger, I will bring in a trusted adult." No promise of secrecy. Ask who their safe adult is, and say who will be told before telling them [25][26][57]. Never say "nothing will happen to you legally" [54].
4. **Keep talking.** The bot never goes cold or hands off silently. It stays with the student until a human or helpline takes over, and re-checks risk every message, because safeguards weaken in long chats [21][34].
5. **Helplines.** Tele-MANAS 14416, free and 24x7 (DGHS also lists 1800-89-14416) [14][18]. Most callers are adults (about 70% are 18-45) and staff are limited [65], though it says it serves adolescents too; language coverage is unverified. Pair it with our own on-call counsellor, and test-call before launch. iCall is Mon-Sat 8am-10pm only, never a crisis line [19]. KIRAN, Vandrevala, 112 and Childline 1098 are unverified; do not use until checked.
6. **Humans and the 2am problem.** Level 2 reaches a named, trained person within a stated time; level 3 is paged immediately; the written plan says what happens if nobody answers [44][32]. The Supreme Court's Sukdeb Saha rules bind schools and coaching centres, not us directly; we use them as the benchmark. If we cannot staff nights, tell the student plainly and connect them straight to Tele-MANAS. Never promise a counsellor at 2am if untrue [56].
7. **Parents and school.** Below level 3 the student chooses who is told. At level 3, tell the guardian only what is needed to protect life [51] (by analogy only). If the parent may be the danger, a human decides and the parent is not told ([52] is background only). No police or school-discipline route for attempts [1][54]. Overriding the student at level 3 is a judgment call on thin evidence; counsel to confirm.
8. **Sexual abuse.** A trained person reports to police or the Special Juvenile Police Unit, not to the parent, with no private inquiry first [8][9][53]. Treat every flagged disclosure as reportable even if no human has read it yet (precaution until counsel confirms).
9. **Consent and data.** DPDP requires verifiable parental consent before processing a child's data and bars tracking children [2][3]. The main rules start about 13 May 2027 [7]; build to them now. Use safety data for safety only [4][5].
10. **Logs.** Record every flag, who acted and how fast [32][42]. Retention and vendor access are unresolved (lawyer).
11. **Never.** Give method or lethality information [22][23]; encourage self-harm (abetment risk) [11]; coach secrecy [24]; play therapist; let safeguards degrade in long sessions [34]. Test in Hindi and Hinglish [23].

## What it costs
The research did not price this; figures are my assumptions. The big cost is people: one seat covered 24x7 needs about 4 to 5 full-time staff, or a paid on-call rota, or an outside clinical partner. Smaller: lawyer's opinion, staff training twice a year [61], Hindi and Hinglish testing, an extra check on every message. Get two quotes.

## Liability we cannot remove
"Zero liability" is not achievable. A missed or late detection can still be sued; the US cases are allegations, not findings [32]. We are probably the publisher of the bot's words, so do not count on the s.79 safe harbour [12]. Disclaimers and a minor's click-through are weak shields [33][47]. POCSO and abetment exposure remain [8][11]. No source shows any escalation design reduces harm. What minimises exposure: a written, drilled escalation plan with named humans [44] (a benchmark, not a rule that binds us); never promising more than we deliver [56]; complete logs; no therapy claims [24]; insurance (not researched).

## Three decisions for you
1. **Nights.** Fund a 24x7 named on-call counsellor (own or partner), or run days only with direct Tele-MANAS hand-off at night, disclosed to students [56][65].
2. **Minors.** Serve under-18s only after counsel clears DPDP, with this crisis system live? Excluding them looks like a product choice (no Indian rule found requiring us to serve them; counsel to confirm; a US example is [38]), but students disclose anyway [42].
3. **Authority.** Who owns the policy (a named clinical-safety owner), and do we notify a guardian over the student's wishes at level 3 [51][52]?

## Needs a lawyer to confirm
- Is per-message distress screening of minors "monitoring" under DPDP s.9(3)? Do the Fourth Schedule exemptions or s.7(f) apply [2][4][5][6]? Check the Gazette dates [7].
- Does a classifier flag alone count as POCSO "knowledge"? Verify s.19 and s.21 [8][9].
- Verify MHCA ss.15, 23 and 115 (do ss.15 and 23 apply to a non-clinical chatbot at all?), BNS s.107 and the Sukdeb Saha text, including the counsellor ratio [1][11][13][51][52].
- Retention versus erasure and litigation hold; vendors and cross-border transfer.
- Counsellor status (employee or contractor), indemnity cover and vendor contracts.
