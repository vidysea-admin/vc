# Manifest — pc-hardening-6
**Contract:** ISS-pc-hardening-5-2, ISS-pc-hardening-5-3, ISS-pc-hardening-5-4, ISS-pc-hardening-3-6 (qa/issues.jsonl); brief qa/evidence/p1-briefs/pc-hardening-6.md, criteria H1-H3 (verbatim below). Not an edit to qa/contracts.
**Goal task:** none
**Date:** 2026-10-22
**Fix cycle:** 0
**Status:** ready-for-check
**Dual check:** no
**Dual-check reason:** no request authentication, tenancy or production-write behaviour change: H1 is test-only, H2 makes the go-live owner-override check treat a blank approver like an unset one (it already refused; only the reason text changes), H3 is a deploy doc plus a log-level line in the nginx conf (a rejection is logged below error). Nothing on the request path changes.
**Persona walk:** skip (no new screen or flow)
**Live browser:** Not run (api, docs and nginx conf only; nginx is never started)
**Issues addressed:** ISS-pc-hardening-5-2, ISS-pc-hardening-5-3, ISS-pc-hardening-5-4, ISS-pc-hardening-3-6
**Executor:** claude-sonnet-subagent
**Executor rationale:** one build unit in one worktree (D:/vc/.worktrees/pc-hardening-6, branch wave/pc-hardening-6, base ab15b2b).

## What changed (all in place, no new module)
- apps/api/tests/go-live-gate.test.ts "G1 (pc-hardening-5 ...)" (H1): after the matching-approver assertions, for every target in GO_LIVE_TARGETS a B13 signed by "Umesh" is allowed with approver "Umesh" and refused with signer variants "umesh" and "UMESH" (approver "Umesh"), and with approver variants " Umesh " and "Umesh\n" (the refusal is the "signer is not the repo approver" reason); the padded approvers also make assertChatGoLive and assertVoiceGoLive throw GoLiveRefusedError through the passed env. No trim or case-fold was added to the comparison (`m[2] !== approver` unchanged).
- apps/api/src/go-live-gate.ts `ownerOverrideProblem` (~166) (H2): `approver === ""` became `approver.trim() === ""`, same "Owner-override needs VC_GATE_APPROVER (the repo approver) to be set" message as before; doc comment says "unset, empty or blank". Test: new go-live-gate.test.ts "H2 (pc-hardening-6 ...)" (approver undefined, "", " ", "   ", tab, " tab ": voice refused with the NEEDS reason for the override and never the "signer is not the repo approver" reason; matching approver still accepts the override).
- docs/go-live-checklist.md (H3): the `VC_GATE_APPROVER` row now says that unset, empty or blank refuses every go-live target (B13), that the value is matched exactly (no surrounding whitespace, same case as the signer), and that the refusal does not echo it; new section 4 "nginx deploy steps": `sudo nginx -t`, the logrotate stanza for /var/log/nginx/vc-voice-stream.access.log (/etc/logrotate.d/vc-voice-stream, dry run with `logrotate -d`), and the error_log rule.
- infra/ubuntu/nginx-vc.conf (H3, option chosen: CHANGE THE CONF, and document the operator rule): both voice stream locations (`= /v1/public/voice/stream` and the student voice/stream regex) now carry `limit_req_log_level warn;`, so a limit_req refusal is logged at warn, below the default error_log level (error), and the request line is not written to the error log; the 429 stays in the voice access log (path only). Header comment updated. The operator step (documented in the checklist and the conf header): do not lower error_log to warn or below on this server. Other locations unchanged. The existing K2 (pc-hardening-3) conf test and K5 tests stay green; the new assertion is apps/api/tests/partners.test.ts "H3 (pc-hardening-6 ...)" (both stream blocks match `limit_req_log_level (info|notice|warn);` once, keep limit_req and status 429, and the directive appears exactly twice in the file; the matcher is itself checked against `error` and a missing directive).
- pnpm-lock.yaml restored after the offline install, not committed. LK10 wording, crisisGuard and anonymous zero persistence untouched. No python was run, nginx was never started, no real Mongo, no live LLM calls.

## Deviations and findings the checker should know
1. H1 needs no source change: the code was already exact-match, so the new H1 assertions are green on the base source; their value is shown by the mutants below (red). The "umesh" signer is already refused by the signer-shape regex (first letter must be uppercase); the case-insensitive mutant is caught by "UMESH".
2. Baseline red, not caused here: chat.test.ts "A20 flag on but gate closed: the real repo qa/gates (B13 pending) refuses to build the chat routes" (ISS-pc-partner-keys-8, the allowed red).
3. The G1 test name keeps its pc-hardening-5 title (edited in place, per the edit-in-place rule); the H1 assertions are marked with an "H1 (pc-hardening-6, ...)" comment.
4. Files in this worktree are CRLF in the working copy and LF in the index (autocrlf); the diff carries no line-ending noise.

## Acceptance criteria and evidence
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config/flag: go-live gate message + nginx conf), Dual check: no (reason above). Base ab15b2b, code commit 84313c9 (short form used in every line below).

H1 (ISS-pc-hardening-5-2): the G1 test in apps/api/tests/go-live-gate.test.ts also asserts that a signed B13 with approver "Umesh" refuses signer variants "umesh", "UMESH" and approver variants " Umesh ", "Umesh\n" (exact match stays; no trim or case-fold added to the comparison). Record the case-insensitive mutant red.
H2 (ISS-pc-hardening-5-4): ownerOverrideProblem (apps/api/src/go-live-gate.ts ~166) treats a whitespace-only approver like unset (same `trim() === ""` test and the same "needs VC_GATE_APPROVER" message as b13Signed); still fails closed. Test: blank approver gives the "needs VC_GATE_APPROVER" reason for the override.
H3 (ISS-pc-hardening-5-3, ISS-pc-hardening-3-6): docs/go-live-checklist.md says that with VC_GATE_APPROVER unset, empty or blank every go-live target is refused (B13), that the value is matched exactly (no surrounding whitespace, same case as the signer), and adds the nginx deploy steps: run `nginx -t` on the server, a logrotate entry for the new voice access log file (give the stanza), and that nginx error_log can print the request line on a limit_req rejection: either set `limit_req_log_level` / the error_log level in infra/ubuntu/nginx-vc.conf so voice-stream rejections are not logged with the request line (if you change the conf, the existing K2 conf test in apps/api/tests/partners.test.ts must stay green and you add an assertion for it), or document the risk with the operator step. Say which in the manifest. (Chosen: change the conf and document the operator rule; see "What changed".)

Tests[H1]: go-live-gate.test.ts "G1 (pc-hardening-5, ISS-pc-hardening-4-1) ..." with the H1 block (all four targets; signer "umesh"/"UMESH", approver " Umesh "/"Umesh\n"; exact match allowed; chat and voice env path). — proves the signer comparison is exact (no case-fold, no trim)
Tests[H2]: go-live-gate.test.ts "H2 (pc-hardening-6, ISS-pc-hardening-5-4) ..." — proves a blank approver gives the override's "needs VC_GATE_APPROVER" reason and never the signer-mismatch reason
Tests[H3]: partners.test.ts "H3 (pc-hardening-6, ISS-pc-hardening-3-6) ..." (conf assertion) plus the existing K2 (pc-hardening-3) and K5 conf tests in the same file; the docs part: none — docs (read the checklist: VC_GATE_APPROVER row and section 4)

Red runs before the fix (tree at base src + new tests): H2: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^(G1|H2) " tests/go-live-gate.test.ts` (apps/api) -> 2 tests, 1 pass (G1, H1 already green on the correct code), 1 fail (H2: `" ": ... Result is not PASS, and Owner-override signer is not the repo approver`). H3 (conf without the directive): `... --test-name-pattern="^H3 " tests/partners.test.ts` -> 1 test, 0 pass, 1 fail (`public stream: a limit_req rejection is not logged at error level`).

Falsifications (in a COPY under the scratchpad build-pch6/fals, never in the worktree; the copy has junctions to the worktree node_modules):
- H1 mutant A, signer match made case-insensitive (`m[2].toLowerCase() !== approver.toLowerCase()`): G1 -> 1 test, 0 pass, 1 fail (`student-routes: signer "UMESH" vs approver "Umesh"`). RED.
- H1 mutant B, approver trimmed before the compare (`m[2] !== approver.trim()`): G1 -> 0 pass, 1 fail (`student-routes: approver " Umesh " vs signer "Umesh"`). RED.
- H2 mutant, `ownerOverrideProblem` back to `approver === ""`: H2 -> 0 pass, 1 fail (`" ": ... Owner-override signer is not the repo approver`). RED.
- H3 mutant, conf copy with both `limit_req_log_level warn;` lines deleted: H3 -> 0 pass, 1 fail (`public stream: a limit_req rejection is not logged at error level`). RED.
- Baseline (the unmodified copy of the committed files): G1 + H2 pass, H3 pass.

Round: 1 round, 5 files (2 tests, 1 src, 1 conf, 1 doc), 3 criteria, est 30 min — diff of 84313c9 vs ab15b2b
Tests[R6a]: go-live-gate.test.ts whole file
Tests[R6b]: partners.test.ts whole file
Tests[R6c]: chat.test.ts (A20 known red), voice.test.ts
Tests[R6d]: anonymous-route.test.ts H2|H6|G5|K2|K4
Tests[R6e]: tsc --noEmit (apps/api)
Pre-check[H1]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^(G1|H2) " tests/go-live-gate.test.ts` (apps/api) -> exit 0, 2 tests, 2 passed, 0 failed (covers H1 and H2; the same run covers Pre-check[H2])
Pre-check[H2]: 84313c9 same command as Pre-check[H1] -> exit 0, 2 passed, 0 failed (H2 test passed)
Pre-check[H3]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="^H3 " tests/partners.test.ts` (apps/api) -> exit 0, 1 passed, 0 failed; docs part: none — docs
Pre-check[R6a]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/go-live-gate.test.ts` (apps/api) -> exit 0, 25 tests, 24 passed, 0 failed, 1 skipped (pre-existing skip guard)
Pre-check[R6b]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/partners.test.ts` (apps/api) -> exit 0, 74 passed, 0 failed
Pre-check[R6c]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test tests/chat.test.ts` (apps/api) -> exit 1, 34 passed, 1 failed (only the allowed red A20 flag on but gate closed, ISS-pc-partner-keys-8); `... tests/voice.test.ts` -> exit 0, 67 passed, 0 failed
Pre-check[R6d]: 84313c9 `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm exec tsx --test --test-name-pattern="H2|H6|G5|K2|K4" tests/anonymous-route.test.ts` (apps/api) -> exit 0, 9 passed, 0 failed
Pre-check[R6e]: 84313c9 `pnpm exec tsc --noEmit` (apps/api) -> exit 0
