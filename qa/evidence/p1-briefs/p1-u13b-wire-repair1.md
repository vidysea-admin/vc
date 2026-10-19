# /maker build subagent — p1-u13b-wire-real repair, fix cycle 1 (small; no over-engineering; NO paid/network call)

Worktree D:/vc/.worktrees/p1-u13b-wire, branch p1/u13b-wire, head e183274 (checker FAIL). Read qa/verdicts/p1-u13b-wire-real.md and D:/vc/qa/evidence/p1-briefs/p1-u13b-wire-review-result.md first. Edit in place.

Fix:
- B1 (packages/engine/evals/probes.ts:~129 / run-probes.ts realProbesBody): a REAL A4 run on a probe set whose source !== "recorded" reports NOT PROVEN (synthetic probe set), never PASS. Test: 30-case synthetic set, 0 violations → NOT PROVEN.
- B2 (run-probes.ts ~56): never use the recorded /ask answer as passage text. Use retrieved passage text from the probe fixture if the format has it; if a case has no passage text, do not send it to the model — record it as "no passage text" (excluded, counted in the report). Remove the dead `c.ask === "unavailable"` ternary. Test: a case with no passage text makes 0 requests; an honest mock no longer mis-scores the sample set.
- G1 (B13/D-100): REAL runners refuse a --fixture/--cases/--experts input with source "recorded" unless `--anonymised` is passed; refusal before any ledger line or request. Test.
- Labels only: A2b hit rate labelled "rewrite-fidelity (not Hit@3)"; A8 verdict labelled "model-hop only". 
- Checker lows (cheap): latency test uses a delayed mock so a fabricated first-token is caught; run-latency refuses an empty golden set before the run.

Verify only via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (TMP/TEMP on D:; long waits normal): `pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts evals/probes*.test.ts` (whatever probe tests exist), `pnpm -C packages/providers test`, `pnpm -r typecheck`. 1 falsification per changed criterion in a copy (never the bound tree).
Manifest qa/manifests/p1-u13b-wire-real.md: `Fix cycle: 1`, Pre-check[<id>] lines for changed criteria, `Status: ready-for-check`, lint exit 0. Narrow-pathspec commits. No push/merge, no .claude/** or .env edits. Do not leave background processes running when you report.
Report head sha, test counts, diff stat.
