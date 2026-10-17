# Intent — Vidysea Student Virtual Counsellor (P1) — PROPOSAL DRAFT v6

<!-- v6 2026-10-17: applies D-087 (coach-first + tool-aware; crisis defaults; both profile sources; existing KnowledgeBase API as RAG, no page store or authoring). v5: applies D-086 (Q16 approved with a B13 amendment, voice transcripts persist, ranking weights configurable, consent out of VC scope) and review-v4 C1-C8. v4: fixes review-v3.md (voice disabled until A10; honest guard limits; production data basis; contract amendments). v3: revised per D-083, D-084, D-085 (docs/DECISIONS.md:780-799). API only; Pathlynks students first; Hindi UI labels
     out of scope; voice = Gemini Live over WebSocket; worldwide KB personalised to the student; anonymous mode;
     the existing KnowledgeBase API is the RAG. Meeting cites are oct15_N:line (qa/evidence/meeting-2026-10-15/). [ASSUMPTION] = my inference. -->

**Originator:** CEO (direction) + Umesh (founding operator) · **Date:** 2026-10-17 · **Status:** DRAFT, awaiting /grill round 6 and Umesh approval at the PLAN gate
**Supersedes in intent:** ARCHITECTURE section 1 surface order (P1 copilot, P2 application, P3 student voice/avatar), per D-083.

## Problem
Students need counselling at any hour and in their own language; Vidysea lacks counsellors and the existing ones cannot answer
everything (oct15_3:46-47). Much of what students ask (Netherlands or Japan scholarships, for example) is already in Vidysea
material the CEO calls highly reliable ("90-95% of the work can be easily done through our knowledge base", oct15_3:51-61).
None of it is organised so an AI can answer from it with sources, for any country, fitted to the individual student.

## Proposed outcome
- **O1 (API only).** VC ships as an API. Pathlynks/partner developers build the student UI (D-084). `apps/web` stays a reference/demo client.
- **O2 (two interaction endpoints).** A **text chat endpoint** and a **live voice endpoint**, because the consuming UI toggles between
  them (D-084; oct15_3:290-292). Live voice uses **Gemini Live (native speech-to-speech) over a WebSocket** (D-085). **Voice transcripts persist into the same session history as text, WhatsApp-like** (D-086); audio itself is not stored [ASSUMPTION]. **Voice stays disabled for real students until the real-audio gate A10 passes**; in voice, citation, no-quote and crisis rules are monitored after the fact, not enforced before speech (needs a B6 amendment).
- **O3 (full counsellor, 24/7, no booking, no avatar).** oct15_3:35-37, 144-146, 117-119. Distinct from Counsellor Assist (oct15_3:32-34). **Coach first and tool-aware (D-087):** the VC coaches the student, knows every VC tool and feature, and uses them to help; it does not ghost-write (B1 no-drafting stays).
- **O4 (worldwide KB, personalised).** Coverage is not limited to pilot countries: worldwide study-abroad and career content, and the VC
  picks "what is the best possible" for this student from their profile (D-085). **Ranking weights are configurable; the default goal is student success, personalised** (D-086). [ASSUMPTION] Ranking uses only approved
  profile facts (a Pathlynks-supplied profile, or chat-extracted facts the student confirms, D-087), and every ranked option cites both the KB source and the profile fact it used. A **coverage-gap report** tells Vidysea
  which countries/themes the KB cannot answer yet, computed by VC from the KB API, so Vidysea can decide where content should grow.
- **O5 (the existing KnowledgeBase API is the RAG).** The VC uses the working `D:/KnowledgeBase` API (`/ask`, `/search`, `/citations`, `/gaps`, `/sources`) as-is and keeps no copy in `D:/vc` (D-085, D-087). There is no new page store and no page-authoring programme; KB changes happen only where the existing API truly cannot serve a named need (spec section 7).
- **O6 (cited, never quote a counsellor without permission).** oct15_3:155-182. Sources are returned as structured fields for the partner UI.
- **O7 (anonymous mode, before the student is Pathlynks-authenticated).** The VC may answer **generic KB questions with nothing stored by VC**:
  no profile, no transcript, no thread, no gap counter. The question text still reaches the model provider and the KnowledgeBase, so the claim is "VC persists nothing", not "nothing leaves" (production basis approved in D-086, recorded in the B13 amendment). Personal questions wait for sign-in (`sign_in_required`). **Consent is handled by Pathlynks and is outside VC scope: a Pathlynks-authenticated student is treated as consented** (D-086; oct15_3:8-10).
- **O8 (release confidence = our own head-to-head against expert answers).** oct15_3:64-72, 89-91; D-083. The public challenge event
  (oct15_3:91-93) is Umesh's outward-facing call.
- **O9 (first users).** Internal testing, then Pathlynks students (D-084).
- **O10 (crisis: minimum exposure).** Concern flagged and the conversation continues; crisis escalated by notifying the connected counsellor or internal admin (oct15_3:211-216; D-083). **For a student with no connected counsellor, D-087 adopts the crisis proposal's defaults:** fixed safe message, Tele-MANAS 14416, keep talking, no promise of secrecy, every flag logged; the human-alert route waits on the CEO "Nights" decision and the Tele-MANAS hand-off is disclosed meanwhile. Zero liability is not achievable (qa/evidence/crisis-research-20261017/proposal.md, oct15_3:218-236).

## Affected users and systems
- Users: see user-types.md (five student types, plus an anonymous visitor mode; partner developers are the integrators).
- Systems: `apps/api` (chat, voice WebSocket, anonymous routes; JWT/tenant/OpenAPI exist), `packages/engine` (student-turn graph,
  profile ranking), `mcp/university-kb` (tools that call the KnowledgeBase API), **`D:/KnowledgeBase`** (existing API used as RAG; a Lab Protocol sibling, read-only from VC under H6; any KB change is a contingent change request under its own DECISIONS entry, Approver Umesh), `packages/providers`
  (Gemini Live session adapter), `packages/db` (threads incl. voice turns, tenant, erasure), `packages/engine/evals`, `skills/`.
- Counsellor Assist keeps its code as the secondary track (D-083).
- Anonymous routes are an exception to B21's "every request carries a JWT"; this needs a contract amendment.
- Languages tested: English and Hindi/Hinglish only; the CEO's "any language" is best effort beyond those and stated as untested.

## Constraints
- Contract B13 allows only synthetic or anonymised text to reach external models. Test and evaluation runs obey it (every real-model/audio run is gated, synthetic input only). **Production use is a different fact:** the product sends real minors' text and voice to Gemini (and anonymous text with no sign-in). **Umesh approved this production basis in D-086 (Q16)**, under Vidysea's consent; the B13 amendment signed in U0 records provider terms, retention and the DPDP basis, and **G-PUBLISH/G-PROD depend on it** before any real-user exposure.
- Production Mongo read-only except `virtual_counsellor`. Anonymous mode writes to no store at all.
- Every factual claim carries a source or is dropped / labelled unverified (B2). Student PII never enters the KB.
- Counsellors and seminar speakers are paraphrased, not named, without recorded permission.
- Multilingual input is an engine capability (English internal). UI label translation is the client's job (D-084).
- No push, deploy, paid-provider call or partner exposure without the gates in force.

## Non-goals
Any VC-owned UI/chat page/login or Hindi label work; ghost-writing essays or SOPs; a KB page store, page endpoints or page authoring (D-087); consent collection or consent-claim verification (Pathlynks's job, D-086); avatar, video, booking; changing crisis behaviour; application drafting (P2);
Career Library clusters (oct15_1; oct15_3:302-420); bulk student import; a copy of KB content in `D:/vc`.

## Open questions (authoritative list in user-types.md)
- [ ] Q5 voice limits/format (incl. max audio after a crisis trigger). [ ] Q6 head-to-head judges/threshold/public challenge **and owner of expert answers, golden questions and anonymisation sign-off**. [ ] Q7 anonymous crisis, counters, limiter.
- [ ] Q8 quote permission. [ ] Q9 content licence. [ ] Q12 tenant model and sandbox. [ ] Q13 Counsellor Assist owner. [ ] Q18 real-run budget.
- Resolved by D-087: Q2 (coach-first, tool-aware), Q11 (crisis defaults; human alert gated on the CEO Nights decision), Q15 (both profile sources), Q17 (existing KB API as RAG; no authoring).
- Resolved by D-086: Q1 (consent out of VC scope), Q3 (configurable weights, default student success), Q4 (Gemini Live kept, transcripts persist), Q16 (approved, B13 amendment in U0).
- Moved to U0 gates (not grill questions): contract amendments (incl. B1 clarification and crisis defaults), default ranking weight vector and staleness threshold review, recording the CEO Nights decision, KnowledgeBase change request only if a spec section 7 gap is confirmed.
