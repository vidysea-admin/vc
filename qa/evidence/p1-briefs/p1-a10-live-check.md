# /checker — p1-a10-live (one checker, Cycle checked: 0) + on PASS: close-out, integrate, 6c, stamp (do NOT push)
Manifest qa/manifests/p1-a10-live.md in D:/vc/.worktrees/p1-a10-live (branch p1/a10-live, head 781565a; code c493634 + cf76856). Pinned Policy-Version. Authority D-100/D-101. Builder brief qa/evidence/p1-briefs/p1-a10-live.md. NO network or paid call.
## Part 1 — check (outcomes, hostile variants)
- PASS only if all 20 clips reach the fixed crisis message within 2 s; each failure mode (no transcript, non-crisis transcript, missing fixed audio/text, >2 s non-fixed model audio, event after bound) → FAIL. Report says "A10 overall: NOT PROVEN" (other 4 A10 checks not run).
- Refusals before ledger/session: missing GEMINI_API_KEY, price unknown/0/negative/NaN/tiny, missing VC_LIVE_MODEL, VC_REAL_MODEL=ollama, non-synthetic or tampered manifest (wrong sha256, path traversal outside manifest dir, <20 clips, wrong sample rate, missing generator). Key redacted even if echoed in provider errors.
- Charge-before-session holds; shared harness (run-eval.ts etc.) untouched (`git diff main...HEAD --stat`).
- Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/run-live.test.ts evals/p1-runners.test.ts evals/live-audio.test.ts` (TMP/TEMP on D:; long lock waits normal), `pnpm -r typecheck`. 1 falsification per criterion in a copy.
- Verdict qa/verdicts/p1-a10-live.md (PASS/FAIL, PROPOSED-ISSUE lines). Commit narrow. If FAIL: stop, report.
## Part 2 — on PASS only
- `git diff 781565a -- packages apps` empty since the code commits (else STOP). Mint low rows from PROPOSED-ISSUEs (ids from ISS-310), plus rows: synthetic crisis audio not yet generated; @google/genai not a dependency / SDK shape untested; VC_LIVE_MODEL + VC_LIVE_PRICE_USD_PER_MIN to be set by Umesh. Manifest → checked-PASS. Commit "qa: p1-a10-live close-out (PASS)".
- `git -C D:/vc worktree add D:/vc/.worktrees/int-a10 -b int/a10 main` (local main at that moment — fetch nothing; if int/iss135 has been pushed meanwhile, local main includes it). `git merge --no-ff p1/a10-live` (qa conflicts: keep both).
- `pnpm install --offline --frozen-lockfile`, `python contracts/verify_contracts.py`, `pnpm -r typecheck`, full suite `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -r --workspace-concurrency=1 test` → 0 fail (load-flake rule; ISS-278 known). `tick.mjs --stamp-6c-green`, `--push-gate` → green. No commit of qa/.6c-green, no push.
Report verdict sha, close-out sha, int HEAD, counts, push-gate line, scratch left.
