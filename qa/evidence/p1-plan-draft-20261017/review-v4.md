# P1 plan-gate drafts v4 - fresh read-only re-review

Reviewer: p1-v4-reviewer. Date: 2026-10-17. Scope: qa/evidence/p1-plan-draft-20261017/{intent,user-types,spec,plan}.md vs review-v3.md. Drafts not edited. No tests run (document review).
Read-only checks run: package names (@vc/api, engine, db, providers, schemas, mcp-university-kb all exist); `eval:scribe` exists in packages/engine/package.json:16 (`eval:kb`, `coverage` are correctly marked NEW); packages/engine/src/guards/ holds citation, no-script, crisis, escalation, concern-classifier (plan.md:6 correct); no `quote_permission`/`speakers` anywhere in packages/apps/mcp (plan.md:6 correct); KnowledgeBase has apps/api/src/{search-store.ts,auth.ts,server.ts,rate-limit.ts}, routes/{ask,brain,citations,...}.ts, migrations/*.cjs, docs/DECISIONS.md with D-117 present (plan.md:11 correct).

## VERDICT: APPROVE (pending human answers to the open questions), with 6 small non-blocking edits recommended

Every BLOCK finding from v3 is resolved; the remaining items are wiring/traceability gaps (section C) that can be fixed in-draft or by the checker at the PLAN gate. None changes scope. Open questions Q1-Q9, Q11-Q13, Q15-Q18 remain human decisions and are listed consistently in intent.md:59-63, user-types.md:51-67, spec.md:53.

## A. Findings F1-F15

| # | v3 sev | Status | Evidence (v4) |
|---|---|---|---|
| F1 sentence-level claim | BLOCK | RESOLVED (one residual, see C1) | spec.md:11 defines `claims[]` `{text,kind,sourceIds[],verified}`, numbers/country auto-verified, "every sentence" claim explicitly NOT made; A1 spec.md:25; plan.md:6 states citationGuard does not parse sentences; B2 amendment plan.md:17 |
| F2 quote_permission | BLOCK | RESOLVED | field + `speakers[]` in U1 lint plan.md:18; deterministic A3 spec.md:27 with named fixture `fixtures/speakers.json`; secondary 200-prompt scan; guard `guards/no-quote.ts` plan.md:24; Q8 defines permission user-types.md:59 |
| F3 mock vs real | BLOCK | RESOLVED | MOCK/REAL column spec.md:4,23-44; G-REAL gate with cost ceiling plan.md:17; Q18 user-types.md:67; plan.md:49 |
| F4 skippable criteria | WARN | RESOLVED | spec.md:22 "not skippable ... NOT PROVEN"; plan.md:53 |
| F5 commands | WARN | RESOLVED | Command column spec.md:23-44; package names verified; NEW: items marked |
| F6 circular golden set | WARN | RESOLVED (residual C2) | spec.md:26 real question logs or non-author, frozen KB fixture, live smoke separate; A17 spec.md:43 frozen fixture |
| F7 human work unit | WARN | RESOLVED | U13a plan.md:32, hours estimate spec.md:47, owner Q17 |
| F8 sibling edit | BLOCK | RESOLVED | plan.md:11 Lab Protocol/Approver Umesh/session_pages reasoning; plan.md:17 G-KB; U1 plan.md:18 names target files (`routes/kb-pages.ts`, `search-store.ts` pattern, `server.ts`, `auth.ts`, migration); Q10 removed (user-types.md:51); order stated plan.md:46 |
| F9 premature partner contract | BLOCK | RESOLVED | U5a internal / U5b gated on Q1,Q4,Q5 + G-PUBLISH plan.md:22-23; user-types.md:7 |
| F10 Wave 0 | WARN | RESOLVED | plan.md:37 |
| F11 missing units | WARN | RESOLVED | profile source Q15 + plan.md:47; consent verification in U8 plan.md:27; gap-count storage `virtual_counsellor` consented-only (spec.md:13, plan.md:27); guard path fixed plan.md:6; `ws` dependency approval plan.md:29, spec.md:50 |
| F12 contract collisions | WARN | RESOLVED | plan.md:17 lists B21 (anonymous + page/coverage tools), B13, B6, B1, B2, B22, no-quote, API contract, anonymous-stores-nothing; intent.md:43 |
| F13a gap count vs A15 | BLOCK | RESOLVED | A4 spec.md:28 "consented mode writes one gap count, anonymous none"; user-types.md:10,29; Q7 default none |
| F13b rate limiting state | BLOCK | RESOLVED (residual C5) | edge limiting, or whitelisted in-memory text-free TTL state, tested in A15b spec.md:40; plan.md:26 |
| F13c provider/KB handling | WARN | RESOLVED | spec.md:9 claim narrowed to "VC persists nothing"; A15c spec.md:41 KB-side no-write test; Q16; intent.md:29 |
| F13d stronger spy | WARN | RESOLVED | A15a spec.md:39 throwing proxies, real compiled route, PII turn |
| F13e classifier | WARN | RESOLVED | A15b spec.md:40 rule-based, fail-closed, >=40 borderline cases; plan.md:24 `student/classify.ts` |
| F14 voice gating | BLOCK | RESOLVED (residual C3) | risk plan.md:44; A10 spec.md:34 mandatory gate, 20-phrase crisis set, max-2 s audio bound, states A1/A3 not enforced pre-send; DoD plan.md:53 voice may ship disabled; B6 amendment plan.md:17; options with cost Q4 user-types.md:55; voice disabled spec.md:8, plan.md:29 |
| F15 production data basis | BLOCK | RESOLVED (residual C4) | Q16 user-types.md:65; B13 amendment plan.md:17; risk plan.md:45; intent.md:47; Q16 in U0 minimum plan.md:17 |

Notes N1-N6 also handled: U14 optional + one-line yes (plan.md:34); languages scoped (spec.md:16, intent.md:44); question lists synced and Q10/Q14 moved to U0 (intent.md:63, user-types.md:49-51); Q12/Q13/Q11 trimmed per v3 Check 6; Q15-Q18 added; H2 cited as "new requirement" (spec.md:12).

## B. New defects introduced by v4

None blocking. Items C1-C8 below are new or residual.

## C. Residual / new issues (WARN, fix in draft or at the checker's PLAN review)

- C1 (spec.md:25, A1, with spec.md:10-11) Internal contradiction and a gap. A1 says "100% of claims have >= 1 sourceId resolving to a page read this turn" and in the same cell "uncited fact claims are dropped or verified:false" (spec.md:11 says such claims are kept and flagged). If kept, 100% is false; state "100% of claims with verified:true". Also the answer path via `POST /ask` fallback (spec.md:10) returns KB claims/sources, not pages, so "a page read this turn" cannot resolve their sourceIds. Define sourceId resolution for both paths.
- C2 (spec.md:26, A2, MOCK) 15 of the 60 golden questions are Hindi/Hinglish but KB pages are English (intent.md:51 "English internal"). Retrieval hit@3 on those needs a query-translation step; with the Mock provider that step cannot be proved, so either those 15 are REAL, or the retrieval is declared language-agnostic with a named mechanism.
- C3 (plan.md:28 U9, spec.md:33-34) Voice "output transcript audited" is a unit behaviour but no criterion proves the audit fires (for example an A9 Mock case where the mock Live output transcript contains an uncited number or a listed speaker name and an audit event is emitted). Without it the post-hoc monitoring that the whole voice mitigation rests on is unproven (A10 REAL checks 20 questions only).
- C4 (plan.md:23, 17, 53) Q16 is in the U0 minimum but is not a dependency of U5b/G-PUBLISH, and no named go-live gate says "no real minor's text/voice reaches Gemini in production, and anonymous route not public, before Q16 sign-off + B13 amendment". Add Q16 to U5b/G-PUBLISH (or a G-PROD gate).
- C5 (plan.md:26, spec.md:40) "Edge rate limiting": nobody owns the edge (Vidysea infra vs Pathlynks gateway) and no unit delivers it. Name the owner or default to the whitelisted in-memory fallback with its test, and keep it a Q7 decision.
- C6 (plan.md:25, 17, 31) Dependency wiring: U6b/A16 depend on Q3 (what "best possible" optimises) but list only Q15; U1/A3 depend on Q8 and U6 on Q2, and U3 on Q9, none are in U0 minimum or unit dependencies. U12 (plan.md:31) omits U3 (golden.jsonl, kb-fixture for A2/A17), U4 (eval harness for A2) and U6b (A16) as dependencies.
- C7 (traceability) NEW artefacts referenced by criteria but not in any unit's NEW column: `evals/run-live.ts` (A10), the `eval:kb` script (A2), `fixtures/speakers.json` (A3, package not stated), a page `status` (retired/stale) field for A13 (U1 lint list plan.md:18 has `last-verified` but not status). Add to U4/U1/U6.
- C8 (spec.md:39 vs user-types.md:10) A15a tests "text and Mock voice" anonymous, while public voice is "not offered until A10 passes". Either drop Mock voice from A15a or state anonymous voice is a defined (disabled) route.

Other minor: A2 draws questions from "Pathlynks/WhatsApp question logs" (spec.md:26) - note it needs anonymisation sign-off under the student-data rule (Q17 owner); A15b's 40 borderline cases should include Hindi/Hinglish; A3 speaker-name match should cover transliterated/Devanagari names.

## D. Recommendation

APPROVE for the PLAN gate pending Umesh's answers to Q1-Q9, Q11-Q13, Q15-Q18 and the U0 gates (G-KB, G-REAL, G-PUBLISH, contract amendments). Fold C1, C3, C4, C6 into the drafts before or at gate time; C2, C5, C7, C8 are cleanup. Criteria not run remain NOT PROVEN; nothing here was executed beyond read-only file/symbol checks.
