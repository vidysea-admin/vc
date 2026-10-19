# p1-u10w-repair2 — /maker build subagent, fix cycle 2 (LAST allowed cycle)
Project: D:/vc/.worktrees/p1-u10w (branch p1/u10w). Read `git log -4` first; build on its HEAD (contains both cycle-1 verdict commits). Read only qa/manifests/p1-u10w-voice-wiring.md and the code below — do NOT read qa/verdicts/*, qa/checkpoints/* or qa/evidence/p1-u10w-*-c1/ (keep the next check blind).

## Failing criterion (both blind checkers, cycle 1): W5
`voiceEnabledFromEnv` (apps/api/src/voice.ts:~160-162) calls `.trim()` on VC_VOICE_ENABLED, so " true", "true ", "\ttrue\n" enable voice. W5 (manifest ~line 44): only the exact string "true" enables voice.

## Required change (minimal, in place)
1. Remove the trim in voiceEnabledFromEnv. Exact "true" -> on; unset / "" / "false" -> off (unchanged); any other value (including padded " true ", "TRUE", "1", "yes") -> the existing VoiceConfigError fail-closed path (unchanged behaviour for other values). Do NOT touch chat.ts:124 (out of scope; ledger row).
2. TDD: first add failing cases to the existing W5/W6 test (voice-wiring.test.ts): " true", "true ", "\ttrue\n", " true ", "TRUE", "1", "yes" must NOT enable voice (no session mint, no WS upgrade). Show red, then fix, then green.
3. Record 1 falsification for W5 (re-add trim in an isolated copy under D:/vc/.worktrees/ -> new test red -> restored).
4. Run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh` (long lock waits are normal, keep waiting): the api voice+chat set (voice*, chat*, audit, history, limits, wiring, crisis-turn test files) and `pnpm -r typecheck`. Set TMP/TEMP to a dir under D:/vc/.worktrees/ for every run. No full suite.
5. Manifest: set `Fix cycle: 2`, add `Pre-check[W5]: <sha> <cmd> -> <result>` (and refresh any Pre-check line whose files changed), note the W5 resolution (no trim; non-exact values fail closed via VoiceConfigError), `Status: ready-for-check`. Keep Policy-Version and dual-trigger lines.
6. Commit with narrow pathspecs only (never `git add -A`); commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push, do not merge. Do not edit .claude/**, qa/contracts, qa/verdicts.
Report: final sha, red->green output lines, falsification result, test counts, typecheck exit.
