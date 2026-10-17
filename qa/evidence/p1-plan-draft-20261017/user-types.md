# User types — Student Virtual Counsellor (P1), API-only — PROPOSAL DRAFT v7

<!-- v7 2026-10-17: fixes review-v6.md R1-R11 and folds D-088. v6: applies D-087 (coach-first tool-aware; crisis defaults; both profile sources; existing KB API as RAG). v5: applies D-086 and review-v4 C1-C8. v4: fixes review-v3.md. Navigation = API call flows. Types are [ASSUMPTION] unless a meeting cite is given. "Client" = the
     partner/Pathlynks UI. Endpoint names are proposals (plan.md). Authenticated calls carry the client JWT (apps/api/src/auth.ts, B21). -->

## Consumers
Partner developer (reads OpenAPI, builds the text/voice toggle UI; contract published only when the A20 go-live gate passes (signed B13 amendment, G-PUBLISH/G-PROD, Nights mode)). Pathlynks student (end user, reaches us only via the client).

## Two modes
- **Anonymous (before the student is authenticated):** `POST /v1/public/chat/turns` (text only) answers **generic KB questions only**, using the KB `/search` only (no web fallback). VC stores no profile, thread, transcript, checkpoint, outbox, trace/log text or user text; the only write is a **text-free aggregate counter** (date, kind, count; D-088 Q7). A rule-based, fail-closed classifier (no LLM sees the text to classify; includes Hindi/Hinglish) treats ambiguous questions as personal and returns `state: "sign_in_required"`. Crisis phrases get the fixed safe message plus Tele-MANAS 14416. The in-memory limiter allows 10 requests per minute per client. The anonymous routes are an exception to B21's JWT rule (contract amendment in U0). The text still reaches the model provider and the KnowledgeBase (production basis approved in D-086, B13 amendment). There is no public voice route.
- **Authenticated (Pathlynks student JWT, per the B21 student-JWT amendment):** threads, turns, memory, personalisation, escalation records, gap counts, usage limits (30 requests per minute; 60 voice minutes per month; 20-minute voice session; per-tenant configurable, D-088 Q5). **Consent is outside VC scope: a Pathlynks-authenticated student is treated as consented** (D-086); VC does not verify a consent claim. Partners get one tenant each plus a synthetic-data sandbox tenant (D-088 Q12).

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
- **Flow (D-083 escalation path plus D-087 defaults):** `state: "concern"` (conversation continues) or `"escalated"` with the fixed safe message (Tele-MANAS 14416, asks who their safe adult is, no promise of secrecy, keeps talking, re-checks risk every message, every flag logged) -> escalation record + notify connected counsellor/internal admin; delivery record-only until real recipients are wired (H9). **A Pathlynks student with no connected counsellor has nobody to notify: the human-alert route waits on the CEO "Nights" decision, and meanwhile the Tele-MANAS hand-off is disclosed and no counsellor is promised (D-087).** Anonymous: fixed message plus Tele-MANAS, no record beyond the text-free counter. Voice: input-transcript trigger interrupts and plays the fixed message.

## U6. Student who asks the VC to write for them (any type)
- **Goal:** get an SOP/essay done. **Flow:** turn("meri SOP likh do") -> the VC coaches (asks about the student's story, gives a structure, reviews the student's own draft) and does not ghost-write; it also tells the student which VC features can help (sources for a country, profile view, ranking) and uses them (D-087, coach first and tool-aware). **Blocks on:** a student who wants a finished draft; the line between feedback and drafting.

## Back-office (not an end user): KB curator/evaluator
Works in the KnowledgeBase repo and CLI: stale list, coverage-gap report, correction items, head-to-head report.

## Answered or moved (all grill questions are closed)
Answered by D-084/D-085: first users, API only, chat + voice together, Hindi labels out, Gemini Live over WebSocket, worldwide personalised KB, generic-before-sign-in, KB in KnowledgeBase.
**Answered by D-086 (Approved-by Umesh):** Q16 production data basis approved, recorded as a B13 amendment signed in U0 and a dependency of G-PUBLISH/G-PROD; Q4 voice transcripts persist into the same session history as text; Q3 ranking weights configurable, default = student success, personalised; Q1 consent is out of VC scope, Pathlynks-authenticated = consented, no consent-claim verification.
**Answered by D-087 (Approved-by Umesh):** Q2 coach first and tool-aware, drafting not granted (B1 clarification in U0); Q11 crisis defaults from the crisis proposal, human alert waits on the CEO Nights decision; Q15 both profile sources accepted; Q17 the existing KnowledgeBase API is the RAG, no page authoring.
**Answered by D-088 (delegated to the maker by Umesh; he may override any by a later entry):**
- Q5: 20-minute session cap, 60 voice minutes per student per month, 30 requests per minute per student, PCM16 16 kHz in / 24 kHz out, at most 2 s of audio after a crisis trigger; all per-tenant configurable.
- Q6: golden questions from anonymised real logs; Vidysea counsellors (Sapna ma'am's team) write the expert answers; two counsellors judge blind; LLM judge pre-screens only; pass = equal or better on >= 60% with zero safety failures; public challenge out of P1 scope. (Maker condition: judges are not the authors of the answers they score; A1 and A3 stay required.)
- Q7: crisis gets the fixed message plus Tele-MANAS; anonymous mode keeps only a text-free aggregate counter; 10 requests per minute per client in memory.
- Q8: deny by default; a speaker is named only with written permission recorded in `speakers.json`; external seminar speakers follow the same rule.
- Q9: internal seminars and TOC as paraphrase; WhatsApp only as anonymised paraphrase, never verbatim; disputes go to Umesh.
- Q12: one tenant per partner plus a synthetic sandbox tenant. Q13: label rename only, owner Umesh. Q18: USD 50 per eval run, USD 200 per month [ASSUMPTION, adjustable].
**Not questions (U0 gates and decisions to record):** contract amendments (incl. B21 student-JWT), CEO Nights decision, G-REAL/G-PUBLISH/G-PROD, Q10 and Q14, default ranking weights and staleness threshold, an optional KnowledgeBase change request only if Umesh takes one (spec section 7).
