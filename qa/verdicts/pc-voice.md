# Verdict: pc-voice, coordinator A (dual check, blind), cycle 2

Cycle checked: 2
Policy-Version: proportional-verification/2026-10-19.17
Bound to: D:/vc/.worktrees/pc-voice, branch wave/pc-voice, head 91dc37a, code 6e5af5a (parent 54f3a34 = the main merge, confirmed with `git rev-parse 6e5af5a^`). Repair diff: `git diff 6e5af5a^ 6e5af5a` (go-live-gate.ts, go-live-gate.test.ts, docs/go-live-checklist.md, qa/evidence only). My cycle-1 verdict is archived as qa/verdicts/pc-voice.r1-1.md. Reopened criterion: V1 (signer rule). Tier L, dual-trigger: auth apps/api/src/go-live-gate.ts ownerOverrideProblem.

VERDICT: PASS
SCOREBOARD: V1 met (reopened, outcome proven); V2 and V3 unchanged (inputs identical, not re-run); 0 regressions.

FAILURES: none.

## Evidence (all from my own executions, 2026-10-22)
- Scope: `git diff --stat 8f841e4 HEAD -- . ':!qa'` (the code head I judged at cycle 1) = go-live-gate.ts, go-live-gate.test.ts, docs/go-live-checklist.md only. voice.ts, voice.js, vc-widget.js are untouched, so the cycle-1 V2/V3 evidence stands and I did not re-run it.
- Protected test: `git diff 8e54fe8 HEAD -- apps/api/tests/auth.test.ts` is empty (unchanged).
- Suites, each `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/<file>` in apps/api: auth 15 tests / 15 pass / 0 fail (including both B21 tests); go-live-gate 21 tests / 20 pass / 0 fail / 1 skipped (REAL_B13_PENDING, pre-existing); voice-wiring 16/16/0; partner-voice 32/32/0; `pnpm exec tsc --noEmit` exit 0. chat.test A20 (known baseline red) not run.
- No personal-name literal in src: grep of apps/api/src for quoted umesh/mallory/anita finds only a comment in chat.ts:696 (a redaction example, outside the B21 regex's reach, and the B21 test is green). A10_OVERRIDE_DEFAULT_OWNER has no remaining reference outside qa notes.
- Real gates, CLI `node --import tsx scripts/go-live-gate.ts voice` (real qa/gates, A10 record: `Result: FAIL` + `Owner-override: ... — Umesh — D-111`):
  - VC_GATE_APPROVER=Umesh -> exit 0, "ALLOWED", "NOTE a10-voice-gate.md: A10 OVERRIDDEN by owner (D-111)".
  - unset, empty -> exit 1, "Owner-override needs VC_GATE_APPROVER (the repo approver) to be set".
  - Mallory, " Umesh", "Umesh ", "umesh", "UMESH", " " (whitespace only) -> exit 1, "Owner-override signer is not the repo approver". No trimming or case folding anywhere (exact `!==`).
  - Copy of qa/gates with the signer changed to Mallory (scratch, outside the tree): approver unset -> refused (needs VC_GATE_APPROVER); Umesh -> refused (not the approver); Mallory -> refused by B13 (signed by another name). Same copy with the override line deleted and approver=Umesh: A10 still FAIL, no ALLOWED.
  - Library paths (undefined, default arg, "") are covered by the rewritten "V1 signer (fail closed)" test, which I read and which ran green; assertGoLive also throws there.
- Other path to ALLOWED for voice: the a10 checker returns ok only through `Result: PASS` (+ Run-at, Evidence, unchanged) or `ownerOverrideProblem === null`; the latter now requires a non-empty configured approver and exact signer equality. All callers (voice.ts, chat.ts, anonymous.ts, CLI) go through evaluateGoLive/assertGoLive with the env default. None found.
- Test rewrites judged: no assertion weakened. The old default-to-Umesh expectations are replaced by strictly stronger fail-closed ones (unset/empty/undefined refuse BOTH Umesh and Mallory with the exact reason text, CLI with env removed exits 1 and prints no override note); the real-gates test now sets the env to the signer parsed from the real record (saved and restored in finally) and gains a sibling asserting refusal with it unset; the CLI test gains an unset-refusal assertion on the real gates; the first V1 CLI test only adds the env it now needs. The B13-signer pin with approver Umesh is unchanged.
- docs/go-live-checklist.md env row: accurate. The env var is read by the gate and CLI (`GATE_APPROVER_ENV`), unset or empty refuses the override, set requires exact equality, and it also pins the B13 signer (b13Signed, go-live-gate.ts:121).
- Falsification (V1), in a copy outside the tree (scratchpad pcv-c2A-fal, node_modules junctioned): green first (21 / 20 pass / 0 fail); then the fail-closed line replaced by `approver = approver === undefined || approver === "" ? "Umesh" : approver` (the cycle-1 behaviour) -> 3 tests red ("V1 real gates ... REFUSE with it unset", "V1 signer (fail closed)", "A20 CLI"); then the original file restored -> green again (21 / 20 / 0).

## Other findings (do not block)
- PROPOSED-ISSUE pcv-c2A-1 (info): when no approver is configured, B13-signed still accepts any capitalised personal name (pre-existing behaviour, line 121); only the A10 override is fail closed. Consider the same rule for B13 if the gate is meant to be identity-bound.
- ISS-pc-voice-3 (default signer literal in code) is closed by this repair: the literal is gone and the approver comes from configuration.
- Note: voice go-live on a real deployment now needs VC_GATE_APPROVER=<the record's signer> set in the environment; the checklist row says so.
