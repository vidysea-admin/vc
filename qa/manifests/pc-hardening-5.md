# Manifest — pc-hardening-5
**Contract:** ISS-pc-hardening-4-1 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-5.md, criteria G1-G2 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Status:** checked-PASS (qa/verdicts/pc-hardening-5.md, d66d9bd; merged b736e34)
**Dual check:** no
**Dual-check reason:** go-live approval gate, not request auth/tenancy: the change only makes the B13 go-live gate stricter (an unset, empty or blank approver now refuses instead of skipping the signer match); no request authentication, tenant scoping or production write is touched.
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (api and test only)
**Issues addressed:** ISS-pc-hardening-4-1
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-5, branch wave/pc-hardening-5, base c5a5c6c).

## What changed (all in place, no new module)
- apps/api/src/go-live-gate.ts `b13Signed` (~115): `if (approver === undefined || approver.trim() === "") return "B13-signed needs VC_GATE_APPROVER (the repo approver) to be set"`, then `m[2] !== approver` refuses a mismatch. Same wording style and fail-closed shape as `ownerOverrideProblem`. Header comment updated. With the approver set, behaviour is unchanged (match allows, mismatch refuses). Every caller goes through `evaluateGoLive`/`assertGoLive` (grep: chat.ts `assertChatGoLive`, voice.ts `assertVoiceGoLive`, anonymous.ts `createAnonymousApi`, scripts/go-live-gate.ts CLI), so all of them refuse.
- apps/api/src/anonymous.ts `createAnonymousApi` (~429): the approver is now `route.approver ?? env[VC_GATE_APPROVER] ?? ""` with `env = route.env ?? process.env`, exactly the chat (pc-hardening-4 P1) and voice (pc-hardening-3 K3) shape; `GATE_APPROVER_ENV` imported. Reason (deviation 1): it was the one go-live caller that ignored the env passed in (it passed `route.approver` only, so `assertGoLive` fell back to process.env), so a started process configured through the env passed to `startApi` could never satisfy the now-required approver. Production: `startApi` passes process.env, so the value read is the same.
- Tests added: go-live-gate.test.ts "G1 ..." (chat + voice + evaluateGoLive, all 4 targets), anonymous-route.test.ts "G1 ..." (anonymous twin).
- Tests changed because they relied on an unset approver passing B13 (G2; none weakened, each listed below).
- pnpm-lock.yaml restored after the offline install, not committed. LK10 wording, crisisGuard and anonymous zero persistence untouched.

## G2: every test that relied on an unset approver, and why
1. go-live-gate.test.ts "A20: the B13 signer must be a personal name ...": `ev("Umesh")` and `ev("Sapna Rao")` with no approver asserted `true` ("no approver configured: any personal name"). That is exactly the bug; they now assert `false`, plus `ev("Sapna Rao","Sapna Rao") === true`. The role/malformed loop used the unset approver; it now passes the role text itself as the approver, so only the signer rules (role, shape) can refuse it: a stricter instrument. Mismatch cases (`ev("Sapna","Umesh")` etc.) unchanged.
2. go-live-gate.test.ts "V1 signer (fail closed)": `assert.deepEqual(only(r), [a10])` for the unset-approver cases; with no approver both records now fail, so it asserts `[b13, a10]` (a10 still named, with its NEEDS reason asserted unchanged).
3. go-live-gate.test.ts "A20 CLI ...": the complete-directory `voice` run now sets `VC_GATE_APPROVER` (B13 is signed by APPROVER); a new assertion proves the same directory is REFUSED (exit 1, names "B13-signed needs VC_GATE_APPROVER") with the variable removed.
4. go-live-gate.test.ts "P1 (pc-hardening-4 ...)": `assertChatGoLive({ ...base, env: {} })` asserted `doesNotThrow` ("process.env approver ignored when an env was passed ... the gate records alone decide"); it is now `throws GoLiveRefusedError` (process.env is still not consulted, and no approver in that env fails closed).
5. startApi/launch tests that enabled chat, voice or anonymous with an env lacking the approver now carry `VC_GATE_APPROVER: "Umesh"` (the fixture B13 signer) as the first key of the env object: chat-profile.test.ts (14 env objects), anonymous-route.test.ts (10), partners.test.ts (4), voice-wiring.test.ts (2), partner-voice.test.ts (1), main.test.ts (1), alerts.test.ts (1). Assertions untouched. First regression run without this edit: chat-profile 23 fail, partners 7, partner-voice 3, voice-wiring 6, main 1, anonymous-route 3, alerts 1, all `GoLiveRefusedError ... B13-signed needs VC_GATE_APPROVER`.
6. Real repo qa/gates (A20): B13 in the repo is SIGNED by Umesh (2026-10-21), so the "real gates" tests are decided by the approver as before; behaviour unchanged (chat.test.ts A20 stays the one allowed red).

## Deviations and findings the checker should know
1. The anonymous.ts change above is beyond the brief's literal G1 text but required by G2 (no existing caller may silently regress) and by G1 (every caller must work with the approver set only in the passed env); it is the third twin of K3/P1. Test: anonymous-route.test.ts G1 (red before the fix at the "passed env approver matches the B13 signer" case, green after).
2. Baseline red, not caused here: chat.test.ts "A20 flag on but gate closed: the real repo qa/gates (B13 pending) refuses ..." (ISS-pc-partner-keys-8, the allowed red). The full anonymous-route.test.ts (not in the brief's pattern list; ran once for information, 32 pass 2 fail, exit 124 from my 600 s cap at the end of the run) also shows two same-class reds: "A20 state ON but gate closed: the real repo qa/gates (B13 PENDING ...)" and "startApi: flag on with the real repo gates refuses to start". Both assume the real B13 is still PENDING; it is signed. Pre-existing (they pass the approver explicitly, and with the real B13 signed they could not refuse before this change either). The second one would go green if its env dropped the approver I added; left alone as out of scope.
3. chat-profile.test.ts ran with the brief's skip pattern "real repo gates refuses to start".
4. Process note: one `python3 --version` was issued once by mistake while preparing an edit; the brief says never run python. Nothing was read or written by it.
5. Files in this worktree are CRLF in the working copy and LF in the index (autocrlf); the diff against the index carries no line-ending noise.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config/flag: go-live gate B13 signer check), Dual check: no. Base c5a5c6c, code commit 7a33647 (short form used in every line below).

G1 (ISS-pc-hardening-4-1): `b13Signed` fails closed when no approver is configured (VC_GATE_APPROVER unset or empty/blank and none passed): it returns a reason like "B13-signed needs VC_GATE_APPROVER (the repo approver) to be set", so every caller of the B13 check (assertChatGoLive, assertVoiceGoLive, and any other user of the gate evaluation; grep for them) refuses. With the approver set, behaviour is unchanged (match allows, mismatch refuses). Tests: signed gate + approver unset refuses; + approver "" or whitespace refuses; + matching approver allows; + other name refuses; for both the chat and the voice go-live paths.
G2: no existing caller silently regresses: every test or script that relied on an unset approver passing B13 now sets the approver explicitly (never weaken an assertion; list each such change in the manifest with why). The real repo qa/gates behaviour (B13 pending -> refuse, A20) is unchanged.

Tests[G1]: go-live-gate.test.ts "G1 (pc-hardening-5, ISS-pc-hardening-4-1): a signed B13 with no approver configured fails closed on the chat and voice go-live paths and on evaluateGoLive ..." (approver unset / "" / " " / "   " / tab as passed env, as explicit approver, and not passed at all; assertChatGoLive and assertVoiceGoLive both throw GoLiveRefusedError; evaluateGoLive refuses every target in GO_LIVE_TARGETS with the B13 reason; matching approver allows chat, voice and all targets; "Mallory" refuses chat and voice; blank process.env refuses, matching process.env allows when no env is passed) and anonymous-route.test.ts "G1 (pc-hardening-5, ...): the anonymous go-live gate reads the approver from the env it is passed ..." (env {} / "" / "   " / Mallory refuse; no env and none in process.env refuses; matching env allows; matching process.env but env {} passed refuses; no env: process.env fallback allows). — these cover b13Signed for every caller (chat, voice, evaluateGoLive, anonymous) with the approver unset, blank, matching and mismatching
Tests[G2]: every file in the regression list below plus the changed legacy tests listed under "G2" above; the real-gates assertions (V1 real gates, A20 CLI against the real qa/gates, A20 real repo skip-guarded) pass unchanged. — they prove each legacy caller still passes with an explicit approver and the real-gates behaviour is unchanged

Red run before the fix (tree at base src + new tests): `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="G1 " apps/api/tests/go-live-gate.test.ts` -> 1 test, 0 pass, 1 fail (`Missing expected exception (GoLiveRefusedError): chat env undefined`). Anonymous G1 red before the anonymous.ts edit (src with only the b13 fix): 1 test, 0 pass, 1 fail (`GoLiveRefusedError ... B13-signed needs VC_GATE_APPROVER` thrown for the matching passed env).

Falsifications (in a COPY under the scratchpad build-pch5/fals, never in the worktree; the copy has its own node_modules junction):
- G1: copy of go-live-gate.ts reverted to the base `b13Signed` (approver unset skips the match), new tests kept: go-live-gate.test.ts 24 tests, 17 pass, 6 fail, including "G1 (pc-hardening-5 ...)" and the updated "A20: the B13 signer ...", "P1" and "V1 signer" tests (so the new and updated assertions bite). The "V1: a FAIL record plus ..." and CLI tests also fail in the copy from the scratchpad cwd; in the worktree they pass.
- G2: the base go-live-gate.test.ts (git show c5a5c6c) against the FIXED go-live-gate.ts in the copy: 23 tests, 17 pass, 5 fail ("A20: the B13 signer ...", "P1", "V1 signer", "V1: a FAIL record plus ...", "A20 CLI"): the legacy tests that relied on the unset approver, i.e. the set that needed updating.

Round: 10 files, 2 criteria, est 40 min — diff of 7a33647 vs c5a5c6c
Tests[R5a]: go-live-gate.test.ts whole file
Tests[R5b]: chat.test.ts, chat-privacy.test.ts, chat-profile.test.ts (skip pattern per brief)
Tests[R5c]: partners.test.ts, partner-voice.test.ts whole files
Tests[R5d]: voice.test.ts, voice-wiring.test.ts, voice-crisis-turn.test.ts
Tests[R5e]: index.test.ts, main.test.ts, server.test.ts, auth.test.ts, alerts.test.ts
Tests[R5f]: anonymous-route.test.ts H2|H6|G5|K2|K4 (and G1)
Tests[R5g]: tsc --noEmit (apps/api)
Pre-check[G1]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^G1 " tests/go-live-gate.test.ts` (apps/api; the same command on tests/anonymous-route.test.ts) -> exit 0 each, 1 passed + 1 passed, 0 failed
Pre-check[G2]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/go-live-gate.test.ts` (apps/api) -> exit 0, 23 passed, 0 failed, 1 skipped (pre-existing skip guard); the regression lines below cover the remaining callers
Pre-check[R5a]: 7a33647 same command as Pre-check[G2] -> exit 0, 23 passed, 0 failed
Pre-check[R5b]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/chat.test.ts` (apps/api) -> exit 1, 34 passed, 1 failed (only the allowed red A20 flag on but gate closed, ISS-pc-partner-keys-8); `... tests/chat-privacy.test.ts` -> exit 0, 39 passed, 0 failed; `... --test-skip-pattern="real repo gates refuses to start" tests/chat-profile.test.ts` -> exit 0, 47 passed, 0 failed
Pre-check[R5c]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partners.test.ts` (apps/api; the same command on tests/partner-voice.test.ts) -> exit 0 each, 73 passed + 40 passed, 0 failed
Pre-check[R5d]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/voice.test.ts` (apps/api; the same command on tests/voice-wiring.test.ts and tests/voice-crisis-turn.test.ts) -> exit 0 each, 67 + 16 + 14 passed, 0 failed
Pre-check[R5e]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/index.test.ts` (apps/api; the same command on tests/main.test.ts, tests/server.test.ts, tests/auth.test.ts, tests/alerts.test.ts) -> exit 0 each, 9 + 10 + 34 + 15 + 14 passed, 0 failed
Pre-check[R5f]: 7a33647 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` (apps/api) -> exit 0, 9 passed, 0 failed
Pre-check[R5g]: 7a33647 `pnpm exec tsc --noEmit` (apps/api) -> exit 0
