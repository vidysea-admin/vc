# You are /checker: U11 coverage report (p1-u11-coverage-report), tier S, one checker, fresh context
- Protocol C:/Users/Lenovo/.claude/skills/checker/SKILL.md Mode A. Policy: the manifest pin.
- Worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u11 (p1/u11 head 9509c35; code 13ad807; base p1/u8 + main merge 82db70f). Read-only toward code. Never touch .claude/**. Do NOT push.
- Contract: D:/vc/qa/evidence/p1-briefs/p1-u11-build.md (A17 criteria) and the manifest.
- Known weaknesses: the maker's falsifications ran IN the worktree, not in copies; C2b was a crash-kill (weak); red-first was never shown. Run your own falsification floor (1 per criterion) in a throwaway COPY, with named-assertion kills.
- Verify: the 22 tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C <copy>/packages/engine exec tsx --test evals/coverage.test.ts`; the A17 command run twice gives byte-identical output; no turn text in the report (SENTINEL grep = 0, plus a hostile fixture with PII-like turn text that you add in the copy); `--real` is refused; diff scope is only packages/engine/evals + the package.json script line + qa; typecheck.
- Write qa/verdicts/p1-u11-coverage-report.md, checkpoint, Metrics. Commit narrow pathspecs. Return ONE line: PASS/FAIL + sha + reason.
