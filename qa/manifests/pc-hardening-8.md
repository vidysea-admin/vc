# Manifest — pc-hardening-8
**Contract:** ISS-pc-hardening-7-1, ISS-pc-hardening-7-2, ISS-pc-hardening-7-3, ISS-pc-hardening-7-4 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-8.md, criteria S1-S4 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Status:** ready-for-check
**Dual check:** no
**Dual-check reason:** test-only change (four files under apps/api/tests); apps/api/src is untouched, so no request authentication, tenancy, gate or production-write behaviour changes. Tier L only because existing assertions about the real repo gates are rewritten.
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (tests only)
**Issues addressed:** ISS-pc-hardening-7-1, ISS-pc-hardening-7-2, ISS-pc-hardening-7-3, ISS-pc-hardening-7-4
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-8, branch wave/pc-hardening-8, base 56c2067).

## What changed (all in place, no new module)
- apps/api/tests/anonymous-fixtures.ts `realGatesWithB13Pending(source = REAL_REPO_GATES, tmpParent = tmpdir())` (S1): everything after `mkdtempSync` is in a try; on any throw the temp root is removed before the error is rethrown. A missing B13 record now throws too (it used to be skipped like the other records, which could have silently produced a copy with no B13 line). The two optional parameters let a test point the helper at a broken source and a private temp parent; the defaults are unchanged. New exported helpers `assertRefusedNamingB13(e)` (GoLiveRefusedError whose failures name the B13 record; returns that line) and `realB13IsSigned()` (read only).
- apps/api/tests/anonymous-route.test.ts: new test "realGatesWithB13Pending (pc-hardening-8 S1 ...)" (S1: two broken sources, each throws /B13/ and leaves the private temp parent empty; a positive control copy is created and removed). The existing "startApi: flag on with a temp copy ..." test now also requires `assertRefusedNamingB13` (S2). New test "startApi: anonymous flag on, NO gatesDir and VC_GATE_APPROVER unset ..." (S3).
- apps/api/tests/chat-profile.test.ts: `mustRefuse` takes an optional third `check` argument (existing callers unchanged); the "startApi: flag on with a temp copy ..." test passes `assertRefusedNamingB13` (S2). New test "startApi: chat flag on, NO gatesDir and VC_GATE_APPROVER unset ..." (S3).
- apps/api/tests/go-live-gate.test.ts: the skipped "A20: the real repo qa/gates refuses every target while B13 is not signed" is now "A20: a temp copy of the real repo qa/gates with B13 set back to pending refuses every target and names B13", run on `realGatesWithB13Pending()` for every GO_LIVE_TARGETS entry, no skip option (S4). The file now has 0 skipped tests.
- No test deleted or weakened, no skip added. apps/api/src untouched. pnpm-lock.yaml restored after the offline install, not committed. No python, no real Mongo, no live LLM calls, qa/gates, qa/contracts and .claude untouched.

## Deviations and findings the checker should know
1. S3 asks for "one test"; the two startApi wirings are separate lines (anonymous ~655, chat ~665) and the anonymous check runs first, so one test could cover only one of them. There is one test per wiring (anonymous-route.test.ts and chat-profile.test.ts), each refusing before any Mongo connection (`connected === 0`) with no gatesDir and VC_GATE_APPROVER absent from the passed env. Neither opens a server when it passes; a wrongly started server is stopped in both.
2. S3 reads the REAL repo gates (read only). With B13 signed the asserted reason is "B13-signed needs VC_GATE_APPROVER (the repo approver) to be set" (true for any signer); if B13 were reset to pending the refusal must still name the B13 record. The B13 failure is always required.
3. S1 changes one behaviour of the helper beyond the leak fix: a missing B13 file throws instead of being skipped (the brief's "a missing-B13 source dir throws"). Other missing records are still skipped.
4. Files are CRLF in the working copy and LF in the index (autocrlf); the diff carries no line-ending noise.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (protected test change), Dual check: no (reason above). Base 56c2067, code commit 87c8ce6.

S1 (ISS-pc-hardening-7-1): realGatesWithB13Pending removes its temp root before rethrowing when it fails after mkdtempSync. Test: a missing-B13 source dir throws and leaves no new temp dir.
S2 (ISS-pc-hardening-7-2): the two startApi closed-gate tests (anonymous-route, chat-profile) also assert the refusal names the B13 record (as the createXApi tests do).
S3 (ISS-pc-hardening-7-3): one test drives startApi WITHOUT gatesDir and with VC_GATE_APPROVER unset, so the DEFAULT_GATES_DIR wiring (apps/api/src/index.ts ~655/665) is exercised against the real repo gates; it must refuse BEFORE any Mongo connection (connected === 0) and close any server it opened.
S4 (ISS-pc-hardening-7-4): the go-live-gate A20 all-targets test runs on the B13-pending copy instead of being skipped when the real B13 is signed (no remaining conditional skip), asserting every target refuses.
Regression: whole files chat, chat-profile, anonymous-route, go-live-gate (now 0 skipped), anonymous-zero-persistence, chat-privacy, main, partners, partner-voice; tsc --noEmit for apps/api. Expected: 0 failed.

Tests[S1]: anonymous-route.test.ts "realGatesWithB13Pending (pc-hardening-8 S1 ...)" — proves a missing B13 record and a B13 record with no signature line both throw and leave the private temp parent empty
Tests[S2]: anonymous-route.test.ts and chat-profile.test.ts "startApi: flag on with a temp copy ..." — prove the startApi refusal is a GoLiveRefusedError whose failure list names the B13 record
Tests[S3]: anonymous-route.test.ts "startApi: anonymous flag on, NO gatesDir ..." and chat-profile.test.ts "startApi: chat flag on, NO gatesDir ..." — prove startApi's default gates wiring reaches the real repo gates (needs-VC_GATE_APPROVER reason on B13) and refuses before any Mongo connection
Tests[S4]: go-live-gate.test.ts "A20: a temp copy of the real repo qa/gates with B13 set back to pending refuses every target and names B13" — proves every GO_LIVE_TARGETS entry is refused naming B13 with the real B13 signed

Red runs before the change (S1 test written first, `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="^realGatesWithB13Pending" tests/anonymous-route.test.ts`, apps/api of the worktree): exit 1, 1 test, 0 pass, 1 fail ("Missing expected exception", the helper had no source parameter and did not throw); after the helper change the same command is exit 0, 1 pass. S2, S3 and S4 strengthen or add assertions over behaviour that already holds (the src is unchanged), so they have no red-before run; their reds are the falsifications below. Before the change go-live-gate.test.ts ran 25 tests, 24 passed, 1 skipped (pc-hardening-7 manifest); after it 25 tests, 25 passed, 0 skipped.

Falsifications (in a COPY under scratchpad build-pch8/fals, never in the worktree; the copy has junctions to the worktree node_modules and its own qa/gates and skills; baseline of the unmodified copy: 6 of 6 pass, and again 6 of 6 after the last restore; script scratchpad/build-pch8/fals.sh, logs fals-*.log):
- S1 mutant, the helper's catch no longer removes the temp root: the S1 test -> 1 test, 0 pass, 1 fail ("a failed helper left a temp dir behind"). RED.
- S2 mutant, the temp copy leaves B13 signed and closes g-publish instead (the gate still refuses with GoLiveRefusedError): both "startApi: flag on with a temp copy" tests -> 2 tests, 0 pass, 2 fail ("the refusal does not name the B13 record: g-publish.md: no Answered line"). RED.
- S3 mutant a, startApi's anonymous branch defaults to a missing gates dir instead of DEFAULT_GATES_DIR: the anonymous S3 test -> 0 pass, 1 fail (B13 failure is "p1-u0-amendment-signatures.md: missing", not the needs-VC_GATE_APPROVER reason). RED. Mutant b, same on the chat branch (assertChatGoLive default): the chat S3 test -> 0 pass, 1 fail. RED.
- S4 mutant, the temp copy leaves B13 signed: the A20 all-targets test -> 0 pass, 1 fail (a target is allowed, "student-routes"). RED.

Round: 1 round, 4 files (all tests), 4 criteria, est 40 min — diff of 87c8ce6 vs 56c2067
Tests[R1]: chat, chat-profile, anonymous-route, go-live-gate whole files
Tests[R2]: anonymous-zero-persistence, chat-privacy, main, partners, partner-voice whole files
Tests[R3]: tsc --noEmit (apps/api)
Pre-check[S1]: 87c8ce6 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test --test-name-pattern="^realGatesWithB13Pending" tests/anonymous-route.test.ts` (apps/api of the worktree) -> exit 0, 1 test, 1 passed, 0 failed
Pre-check[S2]: 87c8ce6 `... timeout 900 pnpm exec tsx --test --test-name-pattern="^startApi: flag on with a temp copy" tests/anonymous-route.test.ts tests/chat-profile.test.ts` -> exit 0, 2 tests, 2 passed, 0 failed
Pre-check[S3]: 87c8ce6 `... timeout 900 pnpm exec tsx --test --test-name-pattern="^startApi: (anonymous|chat) flag on, NO gatesDir" tests/anonymous-route.test.ts tests/chat-profile.test.ts` -> exit 0, 2 tests, 2 passed, 0 failed
Pre-check[S4]: 87c8ce6 `... timeout 900 pnpm exec tsx --test --test-name-pattern="^A20: a temp copy" tests/go-live-gate.test.ts` -> exit 0, 1 test, 1 passed, 0 failed
Pre-check[R1]: 87c8ce6 `... timeout 900 pnpm exec tsx --test tests/<file>.test.ts` per file (apps/api) -> exit 0 on all four files: go-live-gate 25 tests, 25 passed, 0 failed, 0 skipped (5 s); anonymous-route 37 passed, 0 failed (2 s); chat-profile 49 passed, 0 failed (2 s); chat 36 passed, 0 failed (3 s)
Pre-check[R2]: 87c8ce6 same command shape -> exit 0 on all five files: anonymous-zero-persistence 36 passed, 0 failed; chat-privacy 39 passed, 0 failed; main 10 passed, 0 failed; partners 74 passed, 0 failed; partner-voice 40 passed, 0 failed (all 0 skipped)
Pre-check[R3]: 87c8ce6 `... timeout 900 pnpm exec tsc --noEmit` (apps/api) -> exit 0, no output
