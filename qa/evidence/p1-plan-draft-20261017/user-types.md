# User types — Student Virtual Counsellor (P1), API-only — PROPOSAL DRAFT v6

<!-- v6 2026-10-17: applies D-087 (coach-first tool-aware; crisis defaults; both profile sources; existing KB API as RAG). v5: applies D-086 and review-v4 C1-C8. v4: fixes review-v3.md. Navigation = API call flows. Types are [ASSUMPTION] unless a meeting cite is given. "Client" = the
     partner/Pathlynks UI. Endpoint names are proposals (plan.md). Authenticated calls carry the client JWT (apps/api/src/auth.ts, B21). -->

## Consumers
Partner developer (reads OpenAPI, builds the text/voice toggle UI; contract published only after Q5, the signed B13 amendment and G-PUBLISH/G-PROD). Pathlynks student (end user, reaches us only via the client).

## Two modes
- **Anonymous (before the student is authenticated):** `POST /v1/public/chat/turns` (text only) answers **generic KB questions only**. VC stores nothing: no thread, profile, transcript, checkpoint, outbox, trace/log text, **and no gap counter** (unless Umesh allows a text-free aggregate in Q7). A rule-based, fail-closed classifier (no LLM sees the text to classify; includes Hindi/Hinglish) treats ambiguous questions as personal and returns `state: "sign_in_required"`. Crisis phrases get the fixed safe message with no record. Rate limiting defaults to a whitelisted in-memory, text-free limiter inside the handler; an edge limiter is optional (Q7). The anonymous routes are an exception to B21's JWT rule (contract amendment in U0). The text still reaches the model provider and the KnowledgeBase (production basis approved in D-086, B13 amendment). There is no public voice route.
- **Authenticated (Pathlynks JWT):** threads, turns, memory, personalisation, escalation records, gap counts. **Consent is outside VC scope: a Pathlynks-authenticated student is treated as consented** (D-086); VC does not verify a consent claim.

## Common authenticated call flow
1. Client presents the Pathlynks-issued JWT -> `POST /v1/students/{id}/chat/threads` -> `threadId`.
2. Text: `POST .../turns` -> `{claims[], sources[], profileFactsUsed[], rankingProfile?, state}` (`claims[]` = `{text, kind, sourceIds[], verified}`). Voice (when enabled): `POST .../voice/sessions` -> `{token, wsUrl}` -> WebSocket.
3. `state` is one of `ok | concern | escalated | no_sourced_answer | sign_in_required`.
4. `GET .../threads/{threadId}` returns one history of text **and voice** turns (voice turns carry `channel:"voice"`, WhatsApp-like, D-086); erasure/export reuse `/erasure-requests` and `/export`.

## U0. Anonymous visitor (before sign-in)
- **Goal:** try the VC and get general answers ("how do scholarships in the Netherlands work?") before signing in.
- **Flow:** public text turn -> `claims[]` + `sources[]` -> if the question needs the profile (or is ambiguous) -> `sign_in_required`; the client runs Pathlynks's sign-in and moves to the authenticated flow.
- **Blocks on:** accidental storage; a personal question misread as generic; answers that quietly use profile data.

## U1. Stream/subject chooser (class 9-10)
- **Goal:** choose subjects/direction (oct15_3:355-361). **Flow:** sign-in -> thread -> turn("science ya commerce?") -> claims + 1-3 sources + `followUps[]`. **Blocks on:** jargon, long option lists (two priority groups; oct15_3:407-419).

## U2. Abroad aspirant, any country (class 11-12 / UG / PG)
- **Goal:** the best options worldwide for this profile (oct15_3:51-60; D-085). **Default objective: student success, personalised; weights are configurable** (D-086).
- **Flow:** authenticated turn("where should I study?") -> ranking from the profile facts available (Pathlynks-supplied or student-confirmed) with the configured weights -> options each with `sources[]`, `profileFactsUsed[]` and the `rankingProfile` used -> turn("source?") -> country the KB cannot answer -> `no_sourced_answer` (gap counted, authenticated mode only).
- **Blocks on:** uncited claims; unexplained ranking; stale rules (`stale: true`).

## U3. Voice-first Hindi/Hinglish speaker (disabled until A10 passes)
- **Goal:** talk instead of type (D-084/D-085; oct15_3:290-292).
- **Flow:** `POST .../voice/sessions` -> `{token, wsUrl}` -> WebSocket: audio frames + `start | interrupt | end`; server sends `transcript.partial/final`, Gemini Live audio, `answer.sources`, `state`, `flag`, `confirm` (numeric facts); reconnect resumes with `lastEventId`. **Final transcripts persist into the same thread as text** (D-086), so the student sees one history and the client can fall back to text.
- **Honest limit:** citations, no-quote and crisis are monitored after speech, not enforced before it (D-086 keeps Gemini Live; A9b proves the audit fires, A10 measures it on real audio).
- **Blocks on:** mis-heard numbers; dropped connection; mic denied.

## U4. Returning Pathlynks student with a profile
- **Goal:** continuity. **Flow:** the VC proposes facts it heard in chat ("I noted you want a UK master's, correct?") and uses them only after the student confirms; JWT -> thread create returns `memory.used[]` (facts with their `source`: pathlynks or student-confirmed, D-087) -> personalised answers -> corrections via existing profile/erasure endpoints.

## U5. Student in distress (a state any user can enter)
- **Goal:** be taken seriously; minimum Vidysea liability (oct15_3:218-236).
- **Flow (D-083 escalation path plus D-087 defaults):** `state: "concern"` (conversation continues) or `"escalated"` with the fixed safe message (Tele-MANAS 14416, asks who their safe adult is, no promise of secrecy, keeps talking, re-checks risk every message, every flag logged) -> escalation record + notify connected counsellor/internal admin; delivery record-only until real recipients are wired (H9). **A Pathlynks student with no connected counsellor has nobody to notify: the human-alert route waits on the CEO "Nights" decision, and meanwhile the Tele-MANAS hand-off is disclosed and no counsellor is promised (D-087).** Anonymous: fixed message, no record. Voice: input-transcript trigger interrupts and plays the fixed message.

## U6. Student who asks the VC to write for them (any type)
- **Goal:** get an SOP/essay done. **Flow:** turn("meri SOP likh do") -> the VC coaches (asks about the student's story, gives a structure, reviews the student's own draft) and does not ghost-write; it also tells the student which VC features can help (sources for a country, profile view, ranking) and uses them (D-087, coach first and tool-aware). **Blocks on:** a student who wants a finished draft; the line between feedback and drafting.

## Back-office (not an end user): KB curator/evaluator
Works in the KnowledgeBase repo and CLI: stale list, coverage-gap report, correction items, head-to-head report.

## Answered or moved (not grill questions)
Answered by D-084/D-085: first users, API only, chat + voice together, Hindi labels out, Gemini Live over WebSocket, worldwide personalised KB, generic-before-sign-in, KB in KnowledgeBase.
**Answered by D-086 (Approved-by Umesh):** Q16 production data basis approved, recorded as a B13 amendment signed in U0 and a dependency of G-PUBLISH/G-PROD; Q4 voice transcripts persist into the same session history as text; Q3 ranking weights configurable, default = student success, personalised; Q1 consent is out of VC scope, Pathlynks-authenticated = consented, no consent-claim verification.
**Answered by D-087 (Approved-by Umesh):** Q2 coach first and tool-aware, drafting not granted (B1 clarification in U0); Q11 crisis defaults from the crisis proposal, human alert waits on the CEO Nights decision; Q15 both profile sources accepted (Pathlynks-supplied, student-confirmed chat facts); Q17 the existing KnowledgeBase API is the RAG, no page authoring, KB changes only for confirmed gaps (spec section 7); expert-answer ownership moved into Q6.
Moved to U0 gates: **KnowledgeBase change request, only if a spec section 7 gap is confirmed** (Approver is Umesh in both repos), **contract amendments** (checker-owned, Umesh approves critical edits), **default ranking weight vector** for Umesh's review, **G-PROD go-live gate**. Dropped as answered by B21/D-083: "API keys or JWT" (JWT issued by the client backend), rename itself.

## Questions for the /grill session (ids kept stable; Q1, Q3, Q4, Q16 resolved by D-086; Q2, Q11, Q15, Q17 by D-087; Q10 and Q14 moved to U0)
5. **Voice limits:** session length, cost ceiling per student, rate limits, audio format/sample rate Pathlynks developers can consume, and the maximum audio acceptable after a crisis trigger (the residual of the D-086 voice decision).
6. **Head-to-head:** who are the judges, what threshold, is the public "challenge Viral Doshi" event in scope or a later outward-facing decision, **and who writes the 60 expert answers and the golden questions and signs the anonymisation of question logs**?
7. **Anonymous mode:** may a crisis phrase leave no record (nothing can be escalated), and is a text-free aggregate unanswered-topic counter allowed (default: none)? Is the default in-memory limiter enough, or does infra want an edge limiter (owner needed)?
8. **Quote permission:** what counts as permission (written)? Are external seminar speakers treated like counsellors? (The VC guards by a speaker list, default-deny.)
9. **Content rights:** may TOC/seminar and WhatsApp material be shown as cited paraphrase? Who decides? (Needs a source-kind marker from KB if some sources must be excluded, spec section 7 G1.)
12. **Tenancy and sandbox:** one tenant per partner? Synthetic-data sandbox for partner developers: yes/no?
13. **Counsellor Assist:** who owns it and what is its roadmap (the rename itself is settled by D-083)?
18. **Real-run budget:** what is the cost ceiling for the real-model head-to-head, latency and voice runs (G-REAL)?
