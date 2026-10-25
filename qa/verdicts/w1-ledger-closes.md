# Verdict: w1-ledger-closes (ledger maintenance, brief + addendum)

**Cycle checked:** 0
**Checker:** /checker (fresh context), read-only except `qa/issues.jsonl` and this file
**Code HEAD tested:** 4d86fc6 (working tree clean for code; only qa/.6c-green, qa/.last-tick, qa/.wave.json modified)
**Policy-Version:** proportional-verification/2026-10-19.17
**Run at:** 2026-10-25T07:00 to 07:25 +05:30
**Overall:** 8 of 11 rows verified (ISS-054 and ISS-095 with residuals noted, ISS-pc-widget-1 at config level); 3 rows left open with reasons (ISS-052, ISS-056, ISS-084); 1 new low row.

## One line per row

| Id | Verdict | Evidence |
|---|---|---|
| ISS-051 | VERIFIED | api `T046 verified JWT edit provenance...` 1/1 pass (source.type=counsellor-edit, JWT counsellorId, editedFrom=original, identical in profile and webhook); web `T046 demo persists trusted canonical edit provenance` 1/1 pass |
| ISS-052 | STILL-OPEN | apps/web still has no counsellor identity (no JWT/counsellorId in apps/web/src/server); the 2026-09-27 premise check (5-counsellor pilot approves on this flow) has no Umesh answer on disk. Needs Umesh |
| ISS-t-005c-c0-1 | VERIFIED | `tsx --test tests/guard-crisis.test.ts` 618/618 pass; all five repro phrases pinned as crisis (test lines 545-549, from 8c90a04) |
| ISS-t-012-rev-3 | VERIFIED | D-027 implemented in scribe/graph.ts:610-620; `crisis-escalation.test.ts` 42/42 (E13 no-consent crisis, T047 RED); `crisis-eval.test.ts` (37-line heldout slice) 5/5 |
| ISS-t-034-concern-hook | VERIFIED | 975a606 is an ancestor of HEAD; verdict `verdicts-20261017-c8b` line 1 `CONCERN_FIX: PASS`; `webhooks-emission.test.ts` 10/10, `server.test.ts -pattern concern` 7/7 |
| ISS-pc-widget-1 | VERIFIED (config level) | nginx-vc.conf lines 136-157 serve `/widget/vc-widget.js`, `.v1.js`, `-voice.v1.js`; `node --test -pattern nginx tests/voice.test.js` 3/3. No live nginx started |
| ISS-golive-a20-1 | VERIFIED | 173bd45: real-gate assertions guarded on REAL_B13_PENDING, all-targets run on a B13-pending copy; `go-live-gate.test.ts` 25/25, 0 skipped |
| ISS-054 | VERIFIED (residuals) | LIVE: hook printed `Checks pending: 0` before, then `Checks pending: 1 [w1-data-boundary-config]` at 07:01:36 for a manifest that exists only in .worktrees/w1-data-boundary-config; fixture: worktree-only ready manifest -> Pending, worktree-only verdict -> honoured |
| ISS-056 | STILL-OPEN (one reader) | mc-sessionstart/mc-precommit fixed (stale-ready then checked-PASS -> not counted). `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:66` still first-wins: same input returns `ready-for-check` there, `other` in the resolver. 38e751d never touched it |
| ISS-095 | VERIFIED (residual) | fixture of t-017-residuals.md (2,1,0,0 newest-first): Fix cycle 2 -> Unclosed (cycle 2 read), Fix cycle 3 control -> Pending; markdown-prefix form parsed; verdict in a worktree found |
| ISS-084 | STILL-OPEN (partial) | instance 1 verified: hook 327 open (high 25 / info 7 / low 217 / medium 78) == independent python merge (551 ids, 901 rows), raw status:open lines = 522. Instance 2 (`data_boundary.py`, ai_os) not exercised; instance 3 open via ISS-056 |
| ISS-w1-ledger-closes-1 | NEW (low) | resolver 8 s budget truncates the scan with 89 worktrees (`Truncated=True`, 11.4 s default run); real hook prints `Tree scan: PARTIAL (time budget)` |

## Commands run and results

Hook (read-only), against D:/vc:
- `powershell -NoProfile -File .claude/hooks/mc-sessionstart.ps1` (empty stdin), twice: first `Checks pending: 0 | PASS not closed out: 1 | Open issues: 327`; second (07:01:36) `Checks pending: 1 [w1-data-boundary-config]`.
- Resolver block extracted from mc-sessionstart.ps1 and mc-precommit.ps1: both 212 lines, identical sha256 `b812271d...`. `delivery-gate-stop.ps1`: 0 matches for `handshake-resolver`.
- Fixture tree (in the scratchpad, not D:/vc): worktree-only ready manifest -> Pending; stale ready then checked-PASS -> absent; newest-first verdict Fix cycle 2 -> Unclosed, Fix cycle 3 -> Pending; verdict in worktree only -> Unclosed. All as expected.
- Live resolver, default budget: `Trees=89 Truncated=True`, Ready = t-010-live-cards, t-049-b1-recovery, w1-data-boundary-config.

Tests (each under `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 ...`):
- engine `tests/guard-crisis.test.ts`: 618 tests, 618 pass, 0 fail
- engine `tests/crisis-eval.test.ts`: 5/5
- engine `tests/crisis-escalation.test.ts`: 42/42
- engine `tests/webhooks-emission.test.ts`: 10/10
- api `tests/go-live-gate.test.ts`: 25/25, 0 skipped
- api `tests/server.test.ts --test-name-pattern=concern`: 7/7
- api `tests/server.test.ts --test-name-pattern="T046 verified JWT edit provenance"`: 1/1
- web `tests/api.test.ts --test-name-pattern="T046 demo persists trusted canonical edit provenance"`: 1/1
- widget `node --test --test-name-pattern=nginx tests/voice.test.js`: 3/3
No full suite and no live LLM calls were run. The first pass of the runner filtered for `# tests` and so printed no counts; all nine commands were re-run with the correct filter and the counts above are from that second pass.

## Open risks
- Hook residuals need an Approver-gated hook edit (not made): delivery-gate-stop first-wins header and root-only scan; resolver time budget.
- ISS-052 is an owner decision, not a code gap.
- ISS-pc-widget-1 is proven at config text level only.
