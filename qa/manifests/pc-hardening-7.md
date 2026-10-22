# Manifest — pc-hardening-7
**Contract:** ISS-pc-partner-keys-8, ISS-pc-hardening-3-2, ISS-pc-hardening-5-1, ISS-pc-hardening-6-1 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-7.md, criteria R1-R3 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Status:** ready-for-check
**Dual check:** no
**Dual-check reason:** test-only change (five files under apps/api/tests); apps/api/src is untouched, so no request authentication, tenancy, gate or production-write behaviour changes. Tier L only because existing assertions about the real repo gates are rewritten.
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (tests only)
**Issues addressed:** ISS-pc-partner-keys-8, ISS-pc-hardening-3-2, ISS-pc-hardening-5-1, ISS-pc-hardening-6-1
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-7, branch wave/pc-hardening-7, base 78b9123).

## What changed (all in place, no new module)
- apps/api/tests/anonymous-fixtures.ts: new helper `realGatesWithB13Pending()` (+ `REAL_REPO_GATES`) next to the existing `gatesFixture`/`cleanupGates`: a temp copy of the five REAL gate records (read only) with the `B13-signed:` line reset to PENDING; it throws if the real B13 record has no line to reset, so a test can never silently run against an open gate. Real files are never written.
- chat.test.ts "A20 flag on but gate closed: ..." (R1, ISS-pc-partner-keys-8) and anonymous-route.test.ts "A20 state ON but gate closed: ..." (R1, ISS-pc-hardening-5-1): now use the temp copy; the assertion is the same `GoLiveRefusedError` and is stricter (the failure list must name the B13 record).
- chat-profile.test.ts "startApi: flag on with a temp copy of the real repo gates ..." (R1/R2, ISS-pc-hardening-3-2) and anonymous-route.test.ts "startApi: flag on with a temp copy ..." (R1/R2, ISS-pc-hardening-5-1): gatesDir passed explicitly; the "refuses BEFORE connecting to Mongo" check (`connected === 0`) and the `GoLiveRefusedError` check are unchanged. Cleanup: chat-profile uses the file's existing `mustRefuse` (stops a server that wrongly started); anonymous-route stops any started server in `finally`; both remove the temp dir.
- chat.test.ts and anonymous-route.test.ts: new "A20 real gates: ..." test (R2): reads the REAL repo qa/gates, with VC_GATE_APPROVER unset, empty or blank (env passed, never process.env) the routes refuse with `B13-signed needs VC_GATE_APPROVER (the repo approver) to be set` when B13 is signed by any person; if B13 were ever reset to pending, the refusal must still name the B13 record. Not skipped, not hard-coded to one signer.
- go-live-gate.test.ts "H2 (pc-hardening-6 ...)" (R3, ISS-pc-hardening-6-1): padded approvers " Umesh ", "Umesh ", " Umesh", "Umesh\n" with a valid Owner-override signed "Umesh" are refused with "Owner-override signer is not the repo approver", and the override note is not in the report.
- No test deleted or skipped. apps/api/src untouched. pnpm-lock.yaml restored after the offline install, not committed. No python, no real Mongo, no live LLM calls, qa/gates and .claude untouched.

## Deviations and findings the checker should know
1. Test names keep their prefix ("A20 flag on but gate closed:", "A20 state ON but gate closed:", "startApi: flag on with ...") but the tail changed to say "temp copy of the real repo gates (B13 set back to pending)".
2. go-live-gate.test.ts still has one pre-existing skipped test ("A20: the real repo qa/gates refuses every target while B13 is not signed", skip: !REAL_B13_PENDING). Not touched here (not in R1-R3); the new "A20 real gates" tests cover the real-gates path instead.
3. Files are CRLF in the working copy and LF in the index (autocrlf); the diff carries no line-ending noise.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (protected test change), Dual check: no (reason above). Base 78b9123, code commit 293e568.

R1 (ISS-pc-partner-keys-8, ISS-pc-hardening-3-2, ISS-pc-hardening-5-1): the stale tests (chat.test.ts A20 "flag on but gate closed: the real repo qa/gates (B13 pending)...", chat-profile.test.ts "startApi: flag on with the real repo gates refuses to start, BEFORE connecting to Mongo", anonymous-route.test.ts "A20 state ON but gate closed..." and "startApi: flag on with the real repo gates refuses to start") keep what they protect (a closed gate refuses to build the routes / refuses startApi BEFORE any Mongo connection) but no longer depend on the live state of the repo's qa/gates: point them at a temp gates dir copied from the real one with B13 set back to pending (or the existing fixture helper if one exists). The refusal assertions stay as strict as before (same error type/message checks, same "no Mongo connection attempted" check). No test is deleted or skipped.
R2: each of those startApi tests closes any server or handle it opened, success or failure, so each full test file (chat, chat-profile, anonymous-route) finishes well inside the timeout; record each full-file run time and result. Add one test that reads the REAL repo qa/gates and asserts the current reality without hard-coding it brittlely: with the real gates and VC_GATE_APPROVER unset, chat/anonymous go-live refuses with the "needs VC_GATE_APPROVER" reason (this stays true whatever the signer), so the real-gates path is still covered.
R3 (ISS-pc-hardening-6-1): the H2 test in go-live-gate.test.ts also pins that a padded approver (" Umesh ") with a valid Owner-override signed "Umesh" is refused; record the trim mutant red.

Tests[R1]: chat.test.ts "A20 flag on but gate closed: ...", anonymous-route.test.ts "A20 state ON but gate closed: ...", chat-profile.test.ts and anonymous-route.test.ts "startApi: flag on with a temp copy ..." — prove a closed gate (real records, B13 pending) refuses the routes and startApi before any Mongo connect
Tests[R2]: the same startApi tests (server/handle closed, whole files finish in seconds) plus chat.test.ts and anonymous-route.test.ts "A20 real gates: ..." — prove the real gates refuse with the needs-VC_GATE_APPROVER reason when no approver is set
Tests[R3]: go-live-gate.test.ts "H2 (pc-hardening-6, ISS-pc-hardening-5-4) ..." with the padded-approver rows — proves the Owner-override signer compare is exact (no trim)

Red runs before the change (base tree, apps/api, `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`):
- `timeout 900 pnpm exec tsx --test --test-name-pattern="^A20 flag on but gate closed" tests/chat.test.ts` -> exit 1 (red, 4 s)
- `timeout 900 pnpm exec tsx --test --test-name-pattern="^A20 state ON but gate closed" tests/anonymous-route.test.ts` -> exit 1 (red, 3 s)
- `timeout 150 pnpm exec tsx --test --test-name-pattern="^startApi: flag on with the real repo gates refuses to start" tests/chat-profile.test.ts` -> exit 124 (hung until the 150 s timeout: server left open)
- same pattern on tests/anonymous-route.test.ts -> exit 124 (hung until the 150 s timeout)

Falsifications (in a COPY under scratchpad build-pch7/fals, never in the worktree; the copy has junctions to the worktree node_modules; baseline of the unmodified copy: 6 of 6 and H2 1 of 1 pass):
- R1 mutant, the fixture helper leaves B13 signed (gate open): the 4 closed-gate tests (chat A20, anonymous A20, both startApi) -> 4 tests, 0 pass, 4 fail, 4 s (no hang: the started server is stopped). RED.
- R2 mutant, `b13Signed` no longer fails closed without an approver (the needs-VC_GATE_APPROVER line deleted in the copy): the two "A20 real gates" tests -> 0 pass, 2 fail. RED.
- R3 mutant, `ownerOverrideProblem` compares `m[2] !== approver.trim()`: H2 -> 0 pass, 1 fail. RED.

Round: 1 round, 5 files (all tests), 3 criteria, est 30 min — diff of 293e568 vs 78b9123
Tests[R4a]: chat.test.ts, chat-profile.test.ts, anonymous-route.test.ts whole files
Tests[R4b]: go-live-gate, chat-privacy, voice, partners, index, main, server whole files
Tests[R4c]: tsc --noEmit (apps/api)
Pre-check[R1]: 293e568 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 300 pnpm exec tsx --test --test-name-pattern="^(A20 (flag on but gate closed|state ON but gate closed|real gates)|startApi: flag on with a temp copy)" tests/chat.test.ts tests/anonymous-route.test.ts tests/chat-profile.test.ts` (apps/api, run in the copy baseline and per file in the worktree) -> exit 0, 6 tests, 6 passed, 0 failed (chat 2, anonymous-route 3, chat-profile 1)
Pre-check[R2]: 293e568 `... timeout 900 pnpm exec tsx --test tests/chat.test.ts` -> exit 0, 36 passed, 0 failed, 4 s; `... tests/chat-profile.test.ts` -> exit 0, 48 passed, 0 failed, 5 s; `... tests/anonymous-route.test.ts` -> exit 0, 35 passed, 0 failed, 4 s (no file run idles; the "A20 real gates" tests are inside these runs)
Pre-check[R3]: 293e568 `... timeout 900 pnpm exec tsx --test --test-name-pattern="^H2 " tests/go-live-gate.test.ts` -> exit 0, 1 passed, 0 failed
Pre-check[R4a]: 293e568 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test tests/chat.test.ts` (apps/api) -> exit 0, 36 passed, 0 failed, 0 skipped; same for tests/chat-profile.test.ts -> exit 0, 48 passed, 0 failed; tests/anonymous-route.test.ts -> exit 0, 35 passed, 0 failed
Pre-check[R4b]: 293e568 `... tests/go-live-gate.test.ts` -> exit 0, 25 tests, 24 passed, 0 failed, 1 skipped (pre-existing skip guard); chat-privacy 39/39; voice 67/67; partners 74/74; index 9/9; main 10/10; server 34/34; all exit 0
Pre-check[R4c]: 293e568 `... timeout 900 pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output
