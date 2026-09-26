# Scenario coverage baseline — 2026-09-26

**Static coverage map, NOT a scenario run (no test suites run: RAM ceiling).**
Contract B19: an unrun row is a SKIP, so SCENARIOS stays **0/58 run** until a checker
Mode C run actually executes the suites against a live/browser session. This file only
classifies, by reading source and test files, whether a covering automated test currently
exists on `main` for each scenario row — it does not run `pnpm test` or any browser.

Machine constraint honored: ~1.5 GB RAM free, a live maker session (vc-02) building in
worktrees — no `pnpm install`, `pnpm -r test`, dev servers or browsers were run. Only
reading, grep, git log/diff and this classification were performed.

## Counts per status (58 rows total)

| status | count |
|---|---|
| covered-by-test | 16 |
| partial | 6 |
| not-built | 35 |
| uncovered | 1 |

## Spot-check: 3 covered-by-test claims verified against the actual cited test

1. **SC-006** — `packages/engine/tests/scribe-per-fact.test.ts` — the test titled
   `"T-018 residual 3: a per_fact rejection writes an audit record with the thread id,
   student id, rejected keys and reasons, no transcript text"` exists at line 445 (row
   cited line 431; off by ~14 lines but the exact test and assertions are present and
   match the row's claim). CONFIRMED.
2. **SC-013** — `packages/engine/tests/scribe.test.ts:182` (`"B4: no consent row ->
   refusal with zero provider calls and zero writes"`) and `packages/db/tests/consent.test.ts:23`
   (`"B4: requireConsent throws ConsentRequiredError when no consent row exists"`) —
   both tests exist verbatim at (or within a line or two of) the cited locations and
   assert exactly what the row claims (zero provider calls, zero writes, refused status;
   `ConsentRequiredError` thrown). CONFIRMED.
3. **SC-021** — `packages/engine/tests/guard-crisis.test.ts` — all four cited Devanagari
   `ISS-023` tests (मरना चाहता/चाहती, आत्महत्या, खुद को खत्म, जीना नहीं चाहता/चाहती) plus the
   sibling `"ISS-023: benign idioms stay non-crisis (English, Hinglish, Devanagari)"` test
   exist starting at line 111, each asserting `crisisGuard(...).level === "crisis"` on the
   literal Devanagari string cited. CONFIRMED.

All 3 randomly-spot-checked citations held up against the real test source.

## Gap rows — status `not-built` or `uncovered` (36 rows; these are the ones worth a maker unit)

These are rows where no automated test can currently pass because the underlying behavior
either doesn't exist on `main`, or (SC-003 only) is explicitly a qualitative persona-walk
judgment that no automated test could ever target.

| id | persona | owning unit |
|---|---|---|
| SC-001 | gaurav-pm | T-013 (open, D-020 rescope) |
| SC-003 | jaipur-counsellor | n/a — qualitative persona finding, not a test target |
| SC-005 | sapna-expert | T-013 (open, original scope — reasoning fact kind) |
| SC-007 | jaipur-counsellor | no task ID yet — gate answered, build task not created |
| SC-010 | school-counsellor | no task ID — student profile view not scoped |
| SC-022 | jaipur-counsellor | T-012 (open) — Flash-Lite concern classifier |
| SC-023 | school-counsellor | T-012 (open) — admin/counsellor notify |
| SC-024 | jaipur-counsellor | T-022 (open) — concern flag-and-continue |
| SC-025 | jaipur-counsellor | T-010 (open) — live cards + verifier |
| SC-026 | school-counsellor | T-012 (open) — classifier severity re-evaluation |
| SC-028 | gaurav-pm | T-029 (open) — B15 erasure approver double-confirm |
| SC-029 | gaurav-pm | T-029 (open) — approver email-outbox step |
| SC-030 | gaurav-pm | T-029 (open) — purge-after-approval + HMAC pseudonym |
| SC-031 | gaurav-pm | T-029 (open) — B15 erasure approver workflow |
| SC-033 | gaurav-pm | T-029 (open) — B15 erasure approver workflow |
| SC-035 | gaurav-pm | T-010 (open) — visa/country-aware live cards |
| SC-036 | gaurav-pm | T-010 (open) — skip-known-fact suppression (O8) |
| SC-037 | gaurav-pm | T-010 (open) — `doNotAsk` enforcement |
| SC-038 | jaipur-counsellor | T-010 (open) — urgency-aware guidance |
| SC-040 | uk-counsellor | no task ID — B17 international-policy guard |
| SC-041 | uk-counsellor | no task ID — B17 UCAS/UKVI guidance |
| SC-042 | us-counselor | no task ID — B17 FERPA guard |
| SC-043 | us-counselor | no task ID — B17 NACAC-ethics guidance |
| SC-044 | au-agent | no task ID — B17 commission-disclosure guard |
| SC-045 | au-agent | no task ID — B17 PIER/ESOS guidance |
| SC-046 | ca-consultant | no task ID — B17 Canada visa-advice redirect |
| SC-047 | ca-consultant | no task ID — B17 licensed-advice-only rule |
| SC-048 | gaurav-bhaiya | QUEUE.md TODO — Hindi i18n + voice input |
| SC-050 | govt-teacher | QUEUE.md TODO — Hindi-first onboarding |
| SC-051 | govt-teacher | QUEUE.md TODO — onboarding hidden-step audit |
| SC-052 | sapna-expert | QUEUE.md TODO (B22) — novice-vs-expert rubric harness |
| SC-053 | gaurav-pm | T-010 (open) — live cards + verifier |
| SC-054 | gaurav-pm | T-025 (in_progress) — B21 API HTTP server/JWT |
| SC-055 | gaurav-pm | T-025 (in_progress) — B21 API 401/JWT-expiry path |
| SC-056 | school-counsellor | T-027 (in_progress) — B21 webhook signing/delivery |
| SC-057 | school-counsellor | T-027 (in_progress) — B21 webhook invalid-signature |

Every not-built row above already maps to an open or in_progress TASKS.md id (T-010,
T-012, T-013, T-022, T-025, T-027, T-029) or a named QUEUE.md TODO — i.e. these are known,
already-tracked backlog, not newly discovered gaps. The genuinely novel finding here is
**SC-007**: `packages/engine/tests/scribe-per-fact.test.ts` line 86 currently asserts the
*opposite* of the desired provenance behavior (an edited fact keeps its original
transcript-quote source), matching the bug the design gate itself describes — worth a
maker unit once a task ID is assigned.
