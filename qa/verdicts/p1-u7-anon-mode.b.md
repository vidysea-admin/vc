# Verdict (coordinator B, blind) - p1-u7-anon-mode
Cycle checked: 0
Policy-Version: proportional-verification/2026-10-17.14
Checked head: f1d762653ba5c33a339815ba8b2339849c06be5d (code 38f32a4, base 0e62084 = merge-base with p1/u6h, verified with git)
Evidence dir: qa/evidence/p1-u7-check-b/ (summaries, probes, falsification driver and JSON)

## Check plan
Tier L, dual-trigger security apps/api/src/anonymous.ts:54 (read). Plan: (1) re-run affected tests, typecheck and scoped package suites; (2) full diff read (4c) including the security read; (3) hostile probes; (4) one falsification per criterion, one slim throwaway copy per mutant, outside the bound tree; (5) judge the builder's stated risks. API-only: no persona walks, no browser (no apps/web change).

## Evidence (all run by me; tests through scripts/vc-testlock.sh)
- api anonymous files whole: tests 43 pass 43 fail 0. engine student-graph + student-classify whole: tests 67 pass 67 fail 0.
- `pnpm -r typecheck` exit 0. Scoped suites: apps/api 124/124, packages/db 253/253, packages/engine tests 1047 pass 1002 fail 0 skipped 45 (the 45 skips are the pre-existing ones the maker disclosed).
- Hostile probes (probe-out.txt 88 checks plus probe2/4/5, 0 FAIL): spoofed X-Forwarded-For / Forwarded / X-Real-IP / CF headers over real node:http do not buy a fresh bucket (200 x10 then 429); a garbage Authorization header is ignored; trailing-slash, dot-segment and voice paths are not anonymous; crisis (EN, Hinglish, >4000 chars) on a client already at 429 is 200 with the fixed message and Tele-MANAS, never reaches KB or model, and 30 more crisis messages neither reset nor consume the budget; a "concern"-level prefix also short-circuits (no model/KB), so the limiter skip for non-"none" levels opens no cost bypass; 12 gate states (B13 PENDING, role-word signer, wrong approver, g-prod option a/d, unanswered, future instant, commented-out answer, missing g-publish/nights, bogus nights) all refuse; the real repo qa/gates refuse today; each of 4 tracing env vars refuses; a marker string never appears in the fake DB, logs, console or 400/500 bodies (answered, KB-throw, forced-500, counter-throw paths); only anonymous_counters is non-empty, with exactly _id,date,kind,count; a never-answering counter delays the reply about 0.77 s (deadline 750 ms), a throwing counter still gives 200; 10 personal/ambiguous EN/Hinglish/Hindi/phone/email questions give sign_in_required with zero KB calls; an unverified claim is dropped and its source is not listed (probe4).

## Criteria (each: tests green in copy, one named mutant red by assertion, copy restored green; fals-summary.json)
- A15a MET - A15a x5; mutant recordGap-swallowed red (1, the proxy assertion).
- A15b MET - 4 green; shared-bucket red (3), off-by-one red (1). The ambiguous-to-KB mutant survived: EQUIVALENT (QuestionClass has exactly two members, classify.ts:17, so "=== personal" equals "!== generic").
- A15c MET - 3 green; extra-arg-to-KB mutant red (1, the "only q" assertion). Two survivors, see P2 and EXPLANATION.
- A20 MET - 11 green; gate-target-weakened red (1), flag-default-on red (2), both by assertion, not by hang.
- TRACE MET (red 1). B21 MET (any-method red 2, extra-body-keys red 2; other routes 401 over real HTTP). VAL/B24.6 MET (500-echo red 1). B24.7 MET (crisis-subject-to-limiter red 1). D092 and D092.eng MET (graph mutant red 1, route probe).
- R1B MET (deadline 750->5000 red by assertion, better than the maker's timeout-cancel evidence). R2 red 1. R3 red 1. R4 red 1. R5 red 1. RA red 3. RC red 1. RD red 1. RE red 1. RF red 1.
- 4c diff scope: 15 product/test files, all in the manifest; no function, route, export or test removed (the 18 removed lines are re-spelled signature/import lines plus one fake-Mongo operator guard extended with $inc in packages/db/tests/fakes.ts, additive). readBody gains an optional argument (compatible; typecheck -r exit 0, so apps/web and mcp consumers are unaffected). No .claude, qa/contracts, DECISIONS or ARCHITECTURE edit.

## Security read of the changed lines
A20 gate: enabled only by exact "true" plus assertGoLive("anonymous") plus the tracing env check, all before connecting to Mongo (index.ts, probed). Counter: atomic $inc upsert, field set pinned. Limiter: socket address only, salted SHA-256 in memory, IPv6 /64 and v4-mapped normalised, fail-closed full table. Crisis before limiter: sound. Helpline on every non-200: verified. Output hardening: opaque ids, no title for whatsapp/unknown, no follow-up. Residual risks are P1 and P3, neither a criterion failure.

## Builder-stated risks judged
RE-restricted-source-listed claimed equivalent (claims.ts:670): ACCEPTED, claims.ts already filters sources to cited ids and probe4 lists only the shown claims' sources. R1B 30 s timeout cancellations: SUPERSEDED by my assertion-level kill. mutant-cap-raise (31 mutants, 19 criteria): accepted, each criterion has a named killer.

PROPOSED-ISSUE: {"id":"P1","sev":"medium","type":"security","title":"crisis scan of up to 256 KiB runs before the limiter, so a rate-limited client still costs about 40-110 ms CPU per request","evidence":"qa/evidence/p1-u7-check-b/probe3.mts: 244 KiB letter-spaced body from a client already at 429, 77-110 ms per request; 122 KiB non-ascii 66-119 ms (measured under shared load)","direction":"order is contract-mandated (B24.7); add a cheap per-client byte/volume limiter or scan a bounded slice for a client already over budget, and keep edge body and request limits in the deployment"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","type":"test-gap","title":"nothing pins that an anonymous generic question matching an intent rule (e.g. 'Which countries do you cover?') still goes to search_kb","evidence":"mutant graph.ts:527 'return { tool: classifyIntent(input.text) }' survives 67/67 engine tests; current behaviour is correct (probe5.mts: search_kb, one KB call)","direction":"add one engine test with an intent-rule-matching generic anonymous question asserting selectedTool search_kb"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","type":"availability","title":"limiter table of 50,000 live keys refuses every NEW client (fail closed); per-process memory means 10/min per instance","evidence":"anonymous.ts:177-179, probe P9","direction":"already disclosed in the manifest; revisit with a shared limiter at go-live"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","type":"process","title":"vc-testlock.sh broke a lock held by another run at 2026-10-18T02:21 ('owner PID unknown/unparseable and lock age 1792270373s > fallback 600s')","evidence":"first lines of my api-anon run; the age looks computed from a nonsense epoch difference","direction":"check the stale-lock age computation in scripts/vc-testlock.sh"}
PROPOSED-ISSUE: {"id":"P5","sev":"low","type":"wording","title":"manifest has no '## Test selection' section or Sibling lines (.13-6); I derived candidates by git grep","evidence":"dependents of the changed exports outside api/db/engine are apps/web/demo/seed.ts and mcp/university-kb/src/index.ts, which only read COLLECTION_NAMES; typecheck -r exit 0","direction":"none needed for this unit"}

full-suite trigger: none beyond the scoped package suites I ran (api, db, engine green; typecheck -r exit 0); the 6c collection check suffices.

VERDICT: PASS
SCOREBOARD: 19/19 criteria met, 0/0 invariants (none touched)
TIER: L (security: public unauthenticated route and limiter, apps/api/src/anonymous.ts:54; no raise needed)
FAILURES: none
CAPABILITY-COVERAGE: 25/25 mutant rows reproduced green, red, restored; 3 survivors judged (1 equivalent, 1 defence in depth, 1 test gap P2), none the only killer of a criterion
LIVE-BROWSER: not-applicable (no apps/web change)
ISSUES-WRITTEN: none (dual check, PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every criterion was re-run and falsified by an assertion-level red in an isolated copy, the hostile probes (spoofed headers, crisis on a limited client, unsigned or wrong gates, text-free storage) all held, and the scoped suites are green. Open: no test pins A15c routing by intent (P2), and the crisis-scan CPU before the limiter (P1) is a non-blocking hardening item.
Metrics: start=2026-10-18T02:19:10+05:30 end=2026-10-18T02:59:00+05:30 wall_min=30 agent_min=unavailable blocked_min=10 suite_runs=0 repeat_runs=0 mutations=25 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-17.14 lane=normal check_s=2390 mutants=25 defects_unit=0 defects_6c=0
