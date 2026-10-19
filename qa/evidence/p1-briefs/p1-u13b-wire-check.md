# /checker — p1-u13b-wire-real (one checker, Cycle checked: 0) + on PASS: close-out, integrate, 6c, stamp (do NOT push)

Manifest qa/manifests/p1-u13b-wire-real.md in D:/vc/.worktrees/p1-u13b-wire (branch p1/u13b-wire, head 515020d, code 8f5395b). Pinned Policy-Version. Authority D-100. Builder brief: qa/evidence/p1-briefs/p1-u13b-wire-real.md.

## Part 1 — check (outcomes, hostile variants; make NO network or paid call)
- Every model call in the 4 real bodies (run-kb, run-probes, run-latency, run-h2h) goes through the passed provider → charge-before-send; a body cannot reach fetch any other way. Gemini selected → RealNotWiredError before ledger/request; run-live untouched and refuses.
- Fixes: ISS-273 timer covers res.json (stalled body aborts); ISS-274 OLLAMA_MAX_OUTPUT_TOKENS (junk/0/negative refused; bound uses it); ISS-271 price < 0.01 refused (try 1e-300, 0.009); ISS-272 whitespace key refused; ISS-270 UTF-8 bytes (Devanagari).
- Scoring honesty: A14 tally stays NOT PROVEN without counsellor ratings; placeholder experts flagged; A4 uncited reply = violation; A8 report states first-token = full time. No body reads production/student data (fixtures only, B13).
- Rerun via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (TMP/TEMP on D:; long waits normal) unless evidence identity matches: providers test, `pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts`, `pnpm -r typecheck`. 1 falsification per criterion in a copy (never the bound tree).
- Write qa/verdicts/p1-u13b-wire-real.md (PASS/FAIL, PROPOSED-ISSUE lines). Commit narrow pathspec. If FAIL: stop and report.

## Part 2 — on PASS only
- Close-out: `git diff 8f5395b -- packages apps` empty (else STOP). Mint low qa/issues.jsonl rows from PROPOSED-ISSUEs (ids from ISS-280; follow last row's fields). Flip ISS-270..274 to fixed citing the verdict (append rows per convention). Manifest → `Status: checked-PASS`. Commit "qa: p1-u13b-wire-real close-out (PASS)".
- `git -C D:/vc worktree add D:/vc/.worktrees/int-u13b-wire -b int/u13b-wire main`; `git merge --no-ff p1/u13b-wire` (qa ledger/QUEUE conflicts: keep both). QUEUE: wiring done; next = Umesh's per-run go + real model ids/prices.
- int worktree: `pnpm install --offline --frozen-lockfile`, `python contracts/verify_contracts.py`, `pnpm -r typecheck`, full suite `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` → 0 fail (load-flake rule: passes alone + timing assertion + file untouched → low row).
- `tick.mjs --stamp-6c-green` then `--push-gate` → green. Do NOT commit qa/.6c-green. Do NOT push.
Report verdict sha, close-out sha, int HEAD sha, counts, push-gate line, scratch left.
