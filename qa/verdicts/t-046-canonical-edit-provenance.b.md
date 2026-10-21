# Verdict (coordinator B, blind) - t-046-canonical-edit-provenance
Date: 2026-10-21. Bound root D:/vc. Checked: main HEAD ba47d82 (git archive copy, product bytes only). Cycle checked: 0 (manifest Fix cycle 0).
Policy: proportional-verification/2026-10-19.17 (the manifest carries no Policy-Version pin; the dispatch named the current block; a .2 default changes nothing here).
Blindness: I did not read another coordinator's verdict or checkpoint for this feature. One early `ls qa/verdicts | head -80` listing showed names only up to t-011; no t-046 entry was shown or opened.

## Check plan (step 0)
Signals: logic + security/auth (actor identity from the verified JWT) -> TIER L, dual-trigger apps/api/src/server.ts:292 (scribeOpts takes counsellorId from ctx.auth). No rendered-UI file changed (apps/web/demo/seed.ts is the demo runtime wrapper, no components), so no Mode D. No prompt/LLM change, no data artifact.
Criteria (contract B2 edit provenance, B3, B5, B14, B21 + TASKS T-046 text; the manifest has no [C*] ids, so I derived them):
- C1 real approval edit -> trusted JWT actor/time + original citation, readable via raw KG, profile API and fact.approved event
- C2 forged body/source/actor/extra/duplicate/unknown-key refused 400 before claim or write
- C3 changed value -> needsReview true, no inherited transcript verification; unchanged value keeps its transcript source
- C4 model-authored counsellor-edit/extra provenance refused before projection; clean neighbour survives
- C5 winner actor/time bound to the exact compiled graph, no cross-graph authority, replay by another caller changes nothing
- C6 crash-after-claim recovery uses the persisted winner metadata, not the recovery caller

## Evidence (executed by me in a copy outside D:/vc, under scripts/vc-testlock.sh)
Scoped tests on the HEAD copy: schemas fact-source 13/13; db facts 59/59; engine scribe-per-fact + scribe + b18-suppression 205 tests, 160 pass, 0 fail, 45 skip (pre-existing skips; all 23 T046 tests ran and passed); api server 34/34; web api 14/14. tsc --noEmit exit 0 for schemas, db, engine, api, web.
Independent probe, written by me from the contract (apps/api, real handler + fake DB + signed JWTs): 6/6 pass.
- P1 outcome: edit by JWT counsellor "probe-actor-77" stored counsellor-edit with that exact actor, editedAt inside the request window, editedFrom equal to the proposal source, needsReview true, no citationMatch; unchanged budget keeps its transcript source; event source equals raw source; profile readback shows the actor; replay by another caller -> already_resolved, facts byte-identical, attacker id absent.
- P2 same-value "edit" mints no counsellor-edit.
- P3 eight forgery bodies (forged counsellor-edit source, confidence, extra counsellorId, unknown key, duplicate key, replaced transcript source, top-level actor/time, per_fact extra) -> all 400, 0 facts, 0 claims.
- P4 honest whole-batch edit stamps the JWT actor.
- P5 forged model source and extra fields dropped, clean neighbour survives, "MODEL" absent from the response.
- P6 engine resumeScribe with missing / "" / "   " actor -> ApprovalResponseError, 0 claims, 0 facts.
Probe and logs: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t046b/ (zz-probe-t046b.test.ts.keep, log-*.txt, falsify.txt).

## Falsification (one per criterion, each in its own copy m1..m6; green-before / red-after / restored-green)
- C1 server.ts:292 drop `counsellorId: ctx.auth.counsellorId` -> probe P1 1/1 -> 0/1 -> 1/1; maker test "T046 verified JWT" also red.
- C2 nodes.ts delete the isDeepStrictEqual proposal-metadata throw -> probe P3 green -> red -> green.
- C3 nodes.ts `needsReview: true` -> `proposed.needsReview ?? false` -> engine "changed formerly auto-verified" green -> red -> green. The first attempt through probe P1 SURVIVED because that fixture is already needsReview true; the criterion is carried by the engine test, recorded as is.
- C4 schemas.ts CandidateFactSchema `.strict()` removed -> probe P5 green -> red -> green.
- C5 graph.ts remove `approvalBindings.get(invocation.graph) === binding &&` -> "nested second graph" green -> red -> green.
- C6 graph.ts recoverUnder `winner: claim ?? undefined` -> `undefined` -> "crash after winning claim recovery" green -> red -> green.

## Diff scope (4c)
git diff 4e71afe~1..4e71afe: 16 product paths, all in the manifest inventory. Nothing deleted except the old local WebhookFactSourceSchema union (the export name stays, now FactSourceSchema), and test edits strengthen or follow the new contract (the old "edit keeps transcript source" assertion became counsellor-edit assertions, as the contract requires). Later main commits to these files (T047 consent guard, chat tables, concern webhook) leave the edit-provenance code unchanged (4e71afe..HEAD diff read).

PROPOSED-ISSUE: {"sev":"medium","title":"apps/web live runtime passes no counsellorId to resumeScribe, so any changed-value edit in VC_WEB_MODE=live is refused 400","where":"apps/web/src/server/approval-service.ts:91 and apps/web/src/server/runtime.ts:49","note":"fail-closed, no forgery; live mode is untested and has no authenticated actor. Not a criterion of this unit, so not a FAIL."}
PROPOSED-ISSUE: {"sev":"low","title":"manifest has no Policy-Version pin, no [C*] ids, no Pre-check/Tests lines and Status 'integrated'; its maker browser evidence is SKIP (no rendered UI changed, so I ran no walk)"}

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 3/3 invariants hold (B3 no write before approval: P3 0 claims/0 facts; B5 strict typed boundaries: P3/P5; B14 outcome through the real API + fake DB readback)
TIER: L (security/auth: actor from the verified JWT, apps/api/src/server.ts:292)
CAPABILITY-COVERAGE: 6/6 rows reproduced
LIVE-BROWSER: not-applicable (apps/web/demo/seed.ts and server-side files only; no component changed)
ISSUES-WRITTEN: none (PROPOSED-ISSUE lines only, dual check)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Edit provenance holds end to end at main HEAD. JWT actor and server time are captured once, the original citation is kept, forgery at the body, config, model and graph seams is refused before any claim or write, and replay and recovery keep the winner. All six falsifications flipped red and restored green.
Metrics: start=2026-10-21T15:17:09+05:30 end=2026-10-21T15:30:00+05:30 wall_min=13 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=770 mutants=0 defects_unit=0 defects_6c=0
