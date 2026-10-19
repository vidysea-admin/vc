# Backstop sweep (Mode B) - origin/main d7319b9, 2026-10-19

VERDICT: PASS-WITH-LOWS (no S1/S2, no HOLD)
Checker: fresh-context Mode B, read-only toward code. Worktree: .worktrees/sweep-20261019 (detached at origin/main d7319b9, tree 8dd6890889b37cef24258b0d3d61c2b5c8848ee6).
Previous sweep: 2026-09-30T16:27 (bounded, BLOCKED); last full sweep 2026-09-28. Window: ce6a1bf..d7319b9 (420 commits, 81 touching apps/ packages/ mcp/).

## 1. Install, typecheck, suites (TMP/TEMP on D:)
- `pnpm install --offline --frozen-lockfile`: exit 0.
- `pnpm -r typecheck`: exit 0 (db, providers, mcp x2, engine incl. evals+scripts, api, web all Done).
- `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test`: exit 1 at @vc/api; pnpm stopped, so apps/web was run separately.

| package | tests | pass | fail | skipped |
|---|---|---|---|---|
| observability | 59 | 59 | 0 | 0 |
| schemas | 98 | 98 | 0 | 0 |
| db | 284 | 284 | 0 | 0 |
| providers | 143 | 143 | 0 | 0 |
| mcp/student-profile | 12 | 12 | 0 | 0 |
| mcp/university-kb | 72 | 72 | 0 | 0 |
| engine | 1357 | 1312 | 0 | 45 |
| api | 336 | 335 | 1 | 0 |
| web (separate lock run, `pnpm test`) | 44 | 44 | 0 | 0 |

The one failure: apps/api tests/voice.test.ts:1504, "C16: the supersede loop's second pass is needed". It is an event-ordering race (bare assert on the client event list right after a held read, no wait). `voice.test.ts` alone, 3 runs under the lock: 64/64 pass each time. The file is unchanged since merge 54cb095. Load-flake rule applies: ISS-278 (low), not a regression, no HOLD.

## 2. Bypass detection (commits touching apps/ packages/ mcp/ since the last sweep)
First-parent merges are all of the form "merge p1/<unit> (PASS ...)" with matching checked-PASS manifests: u2, u4, u5a, u6, u6h, u6b, u6w, u7, u8, u8r, u9, u10 (u10s, u10w), u11, u12, eng3, testlock, u13b. Release/test merges: ISS-123 and ISS-124 have verdicts (iss-123-litellm-abort.md, iss-124-crisis-deadline.md); `test/flaky-timing` is test-only; `worktree-agent-a7ea...` (ISS-t-034 concern hook) is covered by t-034 / t-042 verdicts; T-049 cards/verifier (fe0937e) has a checker verdict (qa/evidence/verdicts-20261017/verdicts-20261017-c9-verdict.md, byte-identical patch, 83/83 + hostile mutation RED).
Direct commits with a checked-PASS or historical-PASS manifest: 5a543e3 (t-035 checked-PASS), 4727d44 (t-045 checked-PASS), 13207bd (t-054 checked-PASS), 4e71afe (t-046), c781019 (t-047), 0e267dc (t-051), 93c5a94 (t-053), these four at "integrated (historical bounded checker PASS; current release pending)" (ISS-281, low).

Bypass list:
1. 36bae79 "T-048: integrate D-078 Hindi UI prerequisite (independent PASS)": 11 apps/web files, no manifest, no qa/verdicts file, cited verdict path absent on main (ISS-280, low). apps/web is green (44/44) and typecheck clean.
2. No other commit without a checked-PASS, historical-PASS or merged-with-verdict trail.

## 3. Crisis-path spot check
- 14416 helpline text present: packages/engine/src/student/graph.ts:74 (TELE_MANAS_LINE) and :85 (fixed crisis message "Please call Tele-MANAS on 14416 ... मुफ़्त, 24x7"), packages/engine/src/guards/crisis.ts:830; asserted in apps/api tests (acceptance-student-journey, anonymous-route, anonymous-zero-persistence, chat-privacy, voice-fixtures) and packages/engine tests (crisis-defaults, student-graph).
- Crisis test files present: engine crisis-defaults, crisis-escalation, crisis-eval, guard-crisis; api voice-crisis-turn. In the full-suite log, 459 lines mention crisis, 0 are failures; 19 passing lines mention 14416/helpline (A11b, U6h L5, D-093 2A among them).
- Crisis path GREEN.

## 4. Feedback-inbox fold-in (6 entries since the last sweep, all untagged)
- 291 (2026-09-30 rule change, plan approval by a checker agent): process rule, no code action; noted as superseded context.
- 293 (D-093 contract amendments, need Umesh's signature): ISS-279 (low, HUMAN_GATE).
- 294 (crisis audio mute, D-096): implemented in U9; covered by the PASS (f53b50a). No new row.
- 295 (ISS id numbering on feature branches): applied by makers; main max ISS id was 277, this sweep took 278-282.
- 296 (6c stamp): ISS-282 (low).

## 5. Regressions / HOLD
None traced to a feature's changed files. No HOLD written to qa/QUEUE.md.

## Open risks (not sweep failures)
- vc-release-t052-2026-10-13 is checked-FAIL and t-052 manifest is in-progress; the uncommitted T-052 WIP in D:/vc is outside this sweep.
- Engine skipped 45 tests; not investigated in this sweep.
