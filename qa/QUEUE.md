# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

Seven gates are UNANSWERED (sweep 2026-09-26):
- **crisis-guard-precision.md** blocks the T-005b merge. Recommended: (A) recall-only.
- **citation-guarantee-scope.md** blocks T-013. Recommended: (a) numbers + fixed vocabulary auto-accepted, the rest needs review.
- **edit-provenance.md** blocks the T-008 follow-up (ISS-051, high). Recommended: (a) source = counsellor-edit, original quote kept as 'edited from'.
- **counsellor-auth.md** blocks live mode and any deployment of apps/web (ISS-052, high). Recommended: (a) the existing Vidysea/Pathlynks login; which system?
- **erasure-fencing.md** blocks nothing now. Recommended: (b) confirm -> completion + 24h, plus HMAC audit key.
- **scribe-concern-level.md** blocks nothing now. Recommended: (a) flag and continue.
- **provider-fallback.md** blocks the runtime fallback wiring. Recommended: Q1 (a) auto-switch to `rules` marked "AI unavailable"; Q2 yes, live LiteLLM run on synthetic transcripts only.
- **Lead-review scope (not yet a gate file):** bulk student import (Excel with AI column mapping) Phase 1 / Phase 2 / out of scope? Add a third persona (government-school, first-time laptop user, Hindi-first)? Should the real reviewers (Sapna ma'am, Gaurav) receive the release video? Asked in session ef98f055 and never answered.

## Top-3 recommended next units (sweep 2026-09-26)

1. **T-020 close-out:** Mode A check dispatched 2026-09-26. On PASS, merge and remove the t-020 worktree; on FAIL, fix cycle 1.
2. **Hygiene, high:** ISS-054 (session-start hook must also count `.worktrees/*/qa/manifests/*.md`; an enforcement path, so it needs a D-entry with Approved-by), ISS-045 reopened (close-out must `git worktree remove` + delete the merged branch; t-006, t-018 and t-019 are still registered), ISS-055 (the tick stamp).
3. **B19 + B17 groundwork:** add `personas` and `scenarios` to `qa/adapter.json` (a D-entry first), and author `qa/scenarios/counselling-engine.csv` (≥50 rows, see B19).

## TODO (maker)

- [ ] TODO · T-015 close-out: flip `qa/manifests/t-015-erasure-hardening.md` to `checked-PASS (cycle 0)`. The verdict is PASS cycle 0, the branch is merged into main, and TASKS says done; only the manifest flip was skipped. This is the "1 PASS not closed out" the gates keep reporting.

- [ ] TODO · ISS-054 + ISS-045: hook counts worktree manifests; close-out removes merged worktrees (D-entry with Approved-by for the hook change)
- [ ] TODO · B17/B19: `qa/adapter.json` gains `personas` (Jaipur counsellor, school counsellor; a third is pending Umesh) and `scenarios` (D-entry first)
- [ ] TODO · B19: author `qa/scenarios/counselling-engine.csv`, ≥50 persona-tagged rows (India-only, leaving in 2 years, Hinglish, concern turn, erasure mid-session, rules/AI-down path)
- [ ] TODO · B18: an outcome test proving the scribe suppresses irrelevant and known items (India-only → zero visa facts; a known fact is not re-asked)
- [ ] TODO · ISS-053: backfill `regression_check` on the remaining fixed high rows (the 6 criticals are done 2026-09-26; 52 rows remain)
- [ ] TODO · Lead review: enable the maker's second-opinion tester for UI units via LiteLLM, synthetic data only (B13); its findings enter as leads
- [ ] TODO · Lead review: a recorded release walkthrough video (checker Playwright run of the full counsellor flow) under `qa/evidence/release-<date>/`

## Sweep notes (2026-09-26, targeted sweep: checks 1, 1c + critical re-verification; consolidated by the checker session)

- **The ledger's effective state is 79 open: 0 critical, 7 high, 35 medium, 37 low.** The ledger is append-only; the last line per id wins. The 6 "critical" rows (ISS-016, 017, 019, 026, 029, t-003b-c1-1) were fixed on main, and the sweep re-read the code and re-ran the package tests: observability 57/57, db 196/196, student-profile 12/12. They now carry `regression_check`. ISS-016, 017 and 019 remain `fixed`, not `verified`, until the revert-fails proof is done.
- **Pair state:** T-020 was ready-for-check in its worktree with no verdict, invisible to the hook (ISS-054). The maker was asleep for about 10h (ISS-055). t-005b is waiting on crisis-guard-precision, t-013 is STALLED c3 and waiting on citation-guarantee-scope, and t-006, t-018 and t-019 are stale worktrees (ISS-045 reopened).
- **Check 1c:** 58 fixed/verified rows had no `regression_check`; 52 remain after today.
- **Contract:** B18 (context relevance) and B19 (scenario matrix) were added, commit a7dd1aa.
- Checks 2–9 were not run in this pass (targeted sweep); the next full sweep is due.
