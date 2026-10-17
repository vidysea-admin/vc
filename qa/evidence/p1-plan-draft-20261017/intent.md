# Intent — Vidysea Student Virtual Counsellor (P1) — PROPOSAL DRAFT v7

<!-- v7 2026-10-17: fixes review-v6.md R1-R11 and folds D-088 (all remaining questions answered by the maker, delegated by Umesh). v6: applies D-087 (coach-first + tool-aware; crisis defaults; both profile sources; existing KnowledgeBase API as RAG, no page store or authoring). v5: applies D-086 (Q16 approved with a B13 amendment, voice transcripts persist, ranking weights configurable, consent out of VC scope) and review-v4 C1-C8. v4: fixes review-v3.md (voice disabled until A10; honest guard limits; production data basis; contract amendments). v3: revised per D-083, D-084, D-085 (docs/DECISIONS.md:780-799). API only; Pathlynks students first; Hindi UI labels
     out of scope; voice = Gemini Live over WebSocket; worldwide KB personalised to the student; anonymous mode;
     the existing KnowledgeBase API is the RAG. Meeting cites are oct15_N:line (qa/evidence/meeting-2026-10-15/). [ASSUMPTION] = my inference. -->

**Originator:** CEO (direction) + Umesh (founding operator) · **Date:** 2026-10-17 · **Status:** DRAFT, all grill questions closed (D-086..D-088); awaiting the fresh-review re-check and Umesh approval at the PLAN gate
**Supersedes in intent:** ARCHITECTURE section 1 surface order (P1 copilot, P2 application, P3 student voice/avatar), per D-083.

## Problem
Students need counselling at any hour and in their own language; Vidysea lacks counsellors and the existing ones cannot answer
everything (oct15_3:46-47). Much of what students ask (Netherlands or Japan scholarships, for example) is already in Vidysea
material the CEO calls highly reliable ("90-95% of the work can be easily done through our knowledge base", oct15_3:51-61).
None of it is organised so an AI can answer from it with sources, for any country, fitted to the individual student.

## Proposed outcome
- **O1 (API only).** VC ships as an API. Pathlynks/partner developers build the student UI (D-084). `apps/web` stays a reference/demo client.
- **O2 (two interaction endpoints).** A **text chat endpoint** and a **live voice endpoint**, because the consuming UI toggles between
  them (D-084; oct15_3:290-292). Live voice uses **Gemini Live (native speech-to-speech) over a WebSocket** (D-085). **Voice transcripts persist into the same session history as text, WhatsApp-like** (D-086); audio itself is not stored [ASSUMPTION]. Limits (D-088, per-tenant configurable): 20-minute session, 60 voice minutes per student per month, 30 requests per minute, at most 2 s of audio after a crisis trigger. **Voice stays disabled for real students until the real-audio gate A10 passes**; in voice, citation, no-quote and crisis rules are monitored after the fact, not enforced before speech (needs a B6 amendment).
- **O3 (full counsellor, 24/7, no booking, no avatar).** oct15_3:35-37, 144-146, 117-119. Distinct from Counsellor Assist (oct15_3:32-34). **Coach first and tool-aware (D-087):** the VC coaches the student, knows every VC tool and feature, and uses them to help; it does not ghost-write (B1 no-drafting stays).
- **O4 (worldwide KB, personalised).** Coverage is not limited to pilot countries: worldwide study-abroad and career content, and the VC
  picks "what is the best possible" for this student from their profile (D-085). **Ranking weights are configurable; the default goal is student success, personalised** (D-086). [ASSUMPTION] Ranking uses only approved
  profile facts (a Pathlynks-supplied profile, or chat-extracted facts the student confirms, D-087), and every ranked option cites both the KB source and the profile fact it used. A **coverage-gap report** tells Vidysea
  which countries/themes the KB cannot answer yet, computed by VC from the KB API, so Vidysea can decide where content should grow.
- **O5 (the existing KnowledgeBase API is the RAG).** The VC uses the working `D:/KnowledgeBase` API (`/search`, `/ask`, `/sessions`, `/gaps`, `/sources`) as-is and keeps no copy in `D:/vc` (D-085, D-087). There is no new page store and no page-authoring programme; KB changes happen only where the existing API truly cannot serve a named need (spec section 7).
- **O6 (cited, never quote a counsellor without permission).** oct15_3:155-182. Sources are returned as structured fields for the partner UI.
- **O7 (anonymous mode, before the student is Pathlynks-authenticated).** The VC may answer **generic KB questions with nothing stored by VC**:
  no profile, no transcript, no thread, no user text; the only write is a **text-free aggregate counter** (date, kind, count; D-088 Q7). Anonymous turns use only the KB `/search` (no `/ask`, so no web fallback), with an in-memory limiter of 10 requests per minute per client. The question text still reaches the model provider and the KnowledgeBase, so the claim is "VC persists no user text", not "nothing leaves" (production basis approved in D-086, recorded in the B13 amendment). Personal questions wait for sign-in (`sign_in_required`). **Consent is handled by Pathlynks and is outside VC scope: a Pathlynks-authenticated student is treated as consented** (D-086; oct15_3:8-10).
- **O8 (release confidence = our own head-to-head against expert answers).** oct15_3:64-72, 89-91; D-083. D-088: golden questions from anonymised real logs, Vidysea counsellors (Sapna ma'am's team) write the answers, two counsellors judge blind, pass = VC equal or better on >= 60% with zero safety failures. **The public challenge event is out of P1 scope** (oct15_3:91-93).
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
- Contract B13 allows only synthetic or anonymised text to reach external models. Test and evaluation runs obey it (every real-model/audio run is gated, synthetic input only). **Production use is a different fact:** the product sends real minors' text and voice to Gemini (and anonymous text with no sign-in). **Umesh approved this production basis in D-086 (Q16)**, under Vidysea's consent; the B13 amendment signed in U0 records provider terms, retention and the DPDP basis, and **G-PUBLISH/G-PROD depend on it** before any real-user exposure. The amendment also names the KB's own LLM provider and web-search provider (Tavily) for authenticated `/ask` calls. Content rules (D-088 Q9): internal seminars and TOC as paraphrase; WhatsApp material only as anonymised paraphrase, never verbatim.
- Production Mongo read-only except `virtual_counsellor`. Anonymous mode writes only the text-free aggregate counter.
- Every factual claim carries a source or is dropped / labelled unverified (B2). Student PII never enters the KB.
- Counsellors and seminar speakers are paraphrased, not named, unless written permission is recorded in `speakers.json` (deny by default, D-088 Q8; external seminar speakers follow the same rule).
- Multilingual input is an engine capability (English internal). UI label translation is the client's job (D-084).
- No push, deploy, paid-provider call or partner exposure without the gates in force.

## Non-goals
Any VC-owned UI/chat page/login or Hindi label work; ghost-writing essays or SOPs; a KB page store, page endpoints or page authoring (D-087); consent collection or consent-claim verification (Pathlynks's job, D-086); avatar, video, booking; changing crisis behaviour; application drafting (P2);
Career Library clusters (oct15_1; oct15_3:302-420); bulk student import; a copy of KB content in `D:/vc`.

## Open questions
**None.** D-086, D-087 and D-088 closed every grill question (D-088 answers were set by the maker on Umesh's delegation; Umesh may override any by a later entry).
- Decided by D-088: Q5 voice limits, Q6 head-to-head, Q7 anonymous mode, Q8 quote permission, Q9 content licence, Q12 tenancy (one tenant per partner plus a synthetic sandbox tenant), Q13 Counsellor Assist (label rename only, owner Umesh), Q18 budget (USD 50 per run, USD 200 per month [ASSUMPTION, adjustable]).
- Decided by D-087: Q2 coach-first and tool-aware, Q11 crisis defaults, Q15 both profile sources, Q17 existing KB API as RAG. Decided by D-086: Q1, Q3, Q4, Q16.
- Remaining gates and decisions to record in U0 (not questions): contract amendments (B13, both B21 changes incl. the student-JWT, B1, B2, B6, consent clauses, crisis defaults, B22), the CEO Nights decision, G-REAL/G-PUBLISH/G-PROD, Q10 and Q14, review of the default ranking weights and staleness threshold, and an optional KB change request only if Umesh takes one of the spec section 7 options.
