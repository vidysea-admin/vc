# Manifest — pc-hardening-4
**Contract:** ISS-pc-hardening-3-1, ISS-pc-hardening-3-4, ISS-pc-hardening-3-7 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-4.md, criteria P1-P3 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Status:** ready-for-check
**Dual check:** no
**Dual-check reason:** no security/auth/tenancy behaviour change and no production write: P1 only moves where the go-live approver is read from (the env startApi already passes; fail closed unchanged, and in production that env IS process.env), P2 adds one log line and an optional log sink (behaviour otherwise unchanged), P3 is a test-instrument change on an unchanged nginx conf.
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (api and test only)
**Issues addressed:** ISS-pc-hardening-3-1, ISS-pc-hardening-3-4, ISS-pc-hardening-3-7
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-4, branch wave/pc-hardening-4, base bf48a51).

## What changed (all in place, no new module)
- apps/api/src/chat.ts `assertChatGoLive`: the approver is `route.approver ?? env[VC_GATE_APPROVER] ?? ""` with `env = route.env ?? process.env`; the "" (never undefined) stops assertGoLive's own process.env default being re-read. Same shape as `assertVoiceGoLive` (pc-hardening-3 K3). `GATE_APPROVER_ENV` is now imported from go-live-gate.js.
- apps/api/src/index.ts: `logPartnerNote(event, message, sink?)` takes an optional sink (default unchanged: one JSON line on stderr); new exported type `PartnerNoteSink`; `StartApiHttpOptions.partners.log?` (tests only). In the existing `else` branch of the pepper check (HTTP server set up, `VC_PARTNER_KEY_PEPPER` unset), after the existing `reserved_tenant_ids_ignored` note, one new `partner_tenant_guard_off` line: level warn, message names only the variable `VC_PARTNER_KEY_PEPPER`, no ids, no secrets. It runs before the Mongo connect, opens no connection, blocks nothing.
- apps/api/tests/partners.test.ts: K2 `SECRET_VARS` now also matches `$request_body`, `$request_body_file`, `$cookie_*` and any `$http_*` (replacing the four named header patterns, which it subsumes); instrument assertions for ten variables added. The shipped conf (infra/ubuntu/nginx-vc.conf) is unchanged and still green.
- Tests added: go-live-gate.test.ts P1, partners.test.ts P2.
- pnpm-lock.yaml restored after the offline install, not committed. LK10 wording, crisisGuard and anonymous zero persistence untouched.

## Deviations and findings the checker should know
1. P1 "set only in process.env with a passed env lacking it refuses" cannot be shown against `student-routes`: unlike voice (whose A10 owner-override needs a configured approver), the only approver-dependent record for student-routes is B13-signed, and an unconfigured approver ("" or unset) skips the signer-equality check on that target already today. So the process.env-only case is asserted as "not consulted" (allowed, identical to an unconfigured approver), and the refusal cases are: passed env names a different approver than the B13 signer (refused even when process.env matches), and no env passed with a mismatching process.env approver (refused: the fallback). Fail closed is unchanged: a missing gate record refuses whatever the approver.
2. The P2 line is emitted whenever the HTTP server is set up with the pepper unset (not only when chat/voice are enabled), because the brief keys it on the pepper alone. The existing S1/S3 tests filter on the `VC_RESERVED_TENANT_IDS` name, which the new message does not contain, and stay green.
3. Baseline red (not caused here): chat.test.ts "A20 flag on but gate closed" (ISS-pc-partner-keys-8), the only allowed red. chat-profile.test.ts run with the brief's skip pattern.
4. Process note: one `python -` (stdin, no script, stderr discarded) was issued once by mistake inside a shell line early on while preparing an edit; the brief says never run python. Nothing was read or written by it.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config/flag: go-live gate), Dual check: no. Base bf48a51, code commit 4915760 (short form used in every line below).

P1 (ISS-pc-hardening-3-1): assertChatGoLive (apps/api/src/chat.ts ~277) uses the caller-passed env for the approver when one is passed, falling back to process.env only when none is passed, exactly as assertVoiceGoLive now does; fail-closed behaviour unchanged. Test: approver set only in the passed env allows; set only in process.env with a passed env lacking it refuses; no env passed falls back.
P2 (ISS-pc-hardening-3-4): when VC_PARTNER_KEY_PEPPER is unset (partner registry off, so the student-JWT partner-tenant guard is not installed) startApi logs one line `partner_tenant_guard_off` (no ids, no secrets) so operators see the guard is off; behaviour otherwise unchanged (no new Mongo connection, startup not blocked). Test with a fake logger.
P3 (ISS-pc-hardening-3-7): the K2 nginx test in apps/api/tests/partners.test.ts also rejects $request_body, $cookie_* and any $http_* variable in the voice stream log format (the current conf stays green; record a mutant per new pattern red).

Tests[P1]: go-live-gate.test.ts "P1 (pc-hardening-4, ISS-pc-hardening-3-1): assertChatGoLive reads the approver from the env it is passed ..." (passed env approver only: signer match allowed, different approver refused; process.env matching but passed env different: refused; process.env mismatching but passed env matching: allowed; passed env lacking it: process.env not consulted; no env passed: process.env fallback refuses a mismatch and allows a match; explicit approver decides; missing gate record refuses with and without env).
Tests[P2]: partners.test.ts "P2 (pc-hardening-4, ISS-pc-hardening-3-4): ..." (fake sink via the new partners.log: exactly one line, event partner_tenant_guard_off, level warn, names VC_PARTNER_KEY_PEPPER, no JWT secret / KB key / Mongo URI / host in the line, stderr empty for it; startup returns a port; exactly the one connection startApi always opens; default sink: exactly one JSON line on stderr with that event; pepper set: no such line in either sink).
Tests[P3]: partners.test.ts "K2 (pc-hardening-3): both voice stream locations ..." extended in place (SECRET_VARS widened; ten variables asserted rejected: $request_body, $request_body_file, $cookie_session, $cookie_vc_token, $http_sec_websocket_protocol, $http_authorization, $http_cookie, $http_x_vc_key, $http_user_agent, $http_x_forwarded_for; the shipped format asserted clean; the conf test itself unchanged and green).

Red runs before each fix (recorded, tree at base src + new tests): P1 `--test-name-pattern="^P1 "` go-live-gate.test.ts: 1 test, 0 pass, 1 fail (`Missing expected exception (GoLiveRefusedError)` at the passed-env Mallory case: the passed env approver was ignored). P2 `--test-name-pattern="^P2 "` partners.test.ts: 1 test, 0 pass, 1 fail (`exactly one line`, actual 0, expected 1). P3 red-before: the widened test run against the OLD regex (copy, below): `$request_body is rejected in a voice stream log format` fails.

Falsifications (in a COPY under the scratchpad build-pch4/copy, never in the worktree; clean control of the copy ran green first: P1 1 pass, P2 1 pass, K1+K2 2 pass; each mutant restored and `cmp` equal to the worktree afterwards):
- P1: `assertGoLive(..., route.approver)` (old behaviour) in chat.ts: P1 fails `Missing expected exception (GoLiveRefusedError)`. Red.
- P2: the `logPartnerNote("partner_tenant_guard_off", ...)` call removed: P2 fails `exactly one line`. Red.
- P3, one mutant per pattern, each adds the variable to the `log_format vc_voice_stream` of the conf copy: `$request_body`, `$request_body_file`, `$cookie_vc_session`, `$http_user_agent`, `$http_x_forwarded_for`: the K2 test fails for each (1 test, 0 pass, 1 fail). The test's regex reverted to the old pattern (instrument red-before): fails at `$request_body is rejected`. Clean conf control: 1 pass.

Round: 4 files, 3 criteria, est 30 min — diff of 4915760 vs bf48a51
Tests[R4a]: go-live-gate.test.ts whole file — regression for chat.ts approver change
Tests[R4b]: chat.test.ts, chat-privacy.test.ts, chat-profile.test.ts (skip pattern per brief) — chat.ts importers
Tests[R4c]: partners.test.ts, partner-voice.test.ts whole files — index.ts partner wiring and the K2 conf test
Tests[R4d]: voice.test.ts — voice importers
Tests[R4e]: index.test.ts, main.test.ts, server.test.ts, auth.test.ts, student-auth.test.ts — index.ts importers
Tests[R4f]: anonymous-route.test.ts H2|H6|G5|K2|K4
Tests[R4g]: tsc --noEmit (apps/api)
Pre-check[P1]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^P1 " tests/go-live-gate.test.ts` (apps/api) -> exit 0, 1 passed, 0 failed
Pre-check[P2]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^P2 " tests/partners.test.ts` (apps/api) -> exit 0, 1 passed, 0 failed
Pre-check[P3]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^K2 \(pc-hardening-3\)" tests/partners.test.ts` (apps/api) -> exit 0, 1 passed, 0 failed
Pre-check[R4a]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/go-live-gate.test.ts` (apps/api) -> exit 0, 22 passed, 0 failed, 1 skipped (pre-existing SKIP)
Pre-check[R4b]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/chat.test.ts` (apps/api) -> exit 1, 34 passed, 1 failed (only the allowed red A20 flag on but gate closed, ISS-pc-partner-keys-8); `... tests/chat-privacy.test.ts` -> exit 0, 39 passed, 0 failed; `... --test-skip-pattern="real repo gates refuses to start" tests/chat-profile.test.ts` -> exit 0, 47 passed, 0 failed
Pre-check[R4c]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partners.test.ts` (apps/api; the same command on tests/partner-voice.test.ts) -> exit 0 each, 73 passed + 40 passed, 0 failed
Pre-check[R4d]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/voice.test.ts` (apps/api) -> exit 0, 67 passed, 0 failed
Pre-check[R4e]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/index.test.ts` (apps/api; the same command on tests/main.test.ts, tests/server.test.ts, tests/auth.test.ts, tests/student-auth.test.ts) -> exit 0 each, 9 + 10 + 34 + 15 + 11 passed, 0 failed
Pre-check[R4f]: 4915760 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` (apps/api) -> exit 0, 9 passed, 0 failed
Pre-check[R4g]: 4915760 `pnpm exec tsc --noEmit` (apps/api) -> exit 0
