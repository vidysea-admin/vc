# /maker build subagent — U13b eval low leftovers (D-101), small, NO network/paid call
Worktree: `git -C D:/vc worktree add D:/vc/.worktrees/p1-u13b-lows -b p1/u13b-lows main` (main 649273f). Do NOT touch packages/engine/evals/run-live.ts or packages/providers/src/live.ts (another builder owns A10).
Fix (edit in place; ids are qa/issues.jsonl rows):
- Golden-file guard: `--golden` JSONL under REAL must declare provenance (a first-line `{"source": ...}` header or a sidecar field — pick the least invasive); "recorded" needs `--anonymised`, missing provenance under REAL → refuse before ledger/request. Mock mode unchanged.
- ISS-296: bare-array `--experts` under REAL → refuse (require `{source, experts}`).
- ISS-297: mixed-case/unknown source values give a clear refusal message, not a raw schema error.
- ISS-294 / ISS-298 L3: A14 judge sheets/pairs must not leak which side is VC (fixed NO_SOURCED_ANSWER_TEXT, [PLACEHOLDER…] markers): placeholder experts → refuse REAL h2h unless `--allow-placeholder-experts`, and neutralise fixed VC-only texts in the blinded sheets.
- ISS-298 L1: words() in run-kb keeps Devanagari combining marks (\p{M}).
Rules: TDD; tests only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts evals/probes.test.ts evals/h2h.test.ts evals/kb-eval.test.ts` (TMP/TEMP on D:; long lock waits normal); `pnpm -r typecheck` exit 0; 1 falsification per criterion in a copy; manifest qa/manifests/p1-u13b-evals-lows.md (current Policy-Version, Tests/Pre-check lines, tier M, Dual check: no), Status ready-for-check, lint exit 0. Narrow commits; no push/merge; no .claude/** or .env edits; no background processes left. Report head sha, counts.
