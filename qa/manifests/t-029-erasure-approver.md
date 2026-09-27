# Manifest: t-029-erasure-approver

**Contract:** qa/contracts/counselling-engine.md (B15 primary; B19 erasure mid-session, B21 tenancy, B8/B13 offline)
**Goal task:** T-029 (TASKS.md), gate `erasure-fencing` answered 2026-09-26
**Fix cycle:** 0 of max 3
**Base:** `b261c4d` on branch `wave/t-029-erasure-approver`. Code commit `d1c1038`, plus a follow-up commit carrying T029-A13 and this manifest.
**Executor:** maker build subagent (Opus). **Offline:** fake Mongo only (`packages/db/tests/fakes.ts`); every id, key and address is synthetic; no SMTP and no network.

## Scope

- `packages/db/src/erasure.ts` (extended in place)
- `packages/db/src/collections.ts` (`email_outbox`)
- `packages/db/src/testing.ts` (`TEST_ERASURE_CONFIG`, `confirmTwiceAndApprove`)
- `packages/db/scripts/db-init.ts` (the partial unique index now covers the 5 open statuses)
- `packages/schemas/src/schemas.ts` (ErasureStatus: `awaiting_approval | approved | rejected | expired`)
- `apps/api/src/server.ts`, `auth.ts`, `index.ts`, `openapi.ts`
- `.env.example` (variable names only)
- Tests:
  - `packages/db/tests/erasure-approver.test.ts` (new)
  - `packages/db/tests/erasure.test.ts`, `tenant.test.ts`, `decisions.test.ts`, `db-init.test.ts`
  - `packages/engine/tests/scribe-concern.test.ts`, `scribe-erasure-fence.test.ts`, `scribe-persistence.test.ts`
  - `apps/api/tests/server.test.ts`, `auth.test.ts`

**Not touched:** `qa/contracts/`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`, `.claude/**`, `apps/web`, `packages/engine/src/scribe/nodes.ts`, `packages/providers`, `mcp/university-kb`.

## What changed

1. **Flow** (`erasure.ts`):
   1. `requestErasure` writes no hash.
   2. `confirmErasure` is the 1st confirmation. It sets the fence and returns a fresh single-use `confirmToken` (sha256 stored, 15-min TTL). Its signature is `{confirmToken, confirmTokenExpiresAt}`.
   3. `reconfirmErasure(db, {requestId, confirmedBy, confirmToken}, config)` is the 2nd confirmation. It requires the same actor and the unused token; the CAS includes the token hash. It writes the HMAC pseudonym, then:
      - When `autoDelete` is false (the default), it writes the `email_outbox` record (`_id erasure-approval:<id>`, to the configured approver, no student id) and moves the request to `awaiting_approval` (7-day TTL).
      - When `autoDelete` is true, it moves straight to `approved` by `system:auto-delete`.
   4. `approveErasure` requires an approver who is not the requester or either confirmer (normalised). An expired approval is closed as `expired`.
   5. `rejectErasure` purges nothing. It unsets the clear id and releases the fence.
   6. `executeErasure` runs only from `approved` or `failed`, and requires `approvedBy`. `awaiting_approval` is `ErasureNotApprovedError`.
2. **Fence:**
   - The fence is armed at the first confirmation. Fencing statuses are `confirmed`, `awaiting_approval`, `approved` and `failed`.
   - `ERASURE_FENCE_GRACE_MS` is 24h (the gate Q1 policy), so writes are refused from the first confirm until completion + 24h.
   - A re-armed fence keeps an earlier completion's grace (`priorReleaseAfter`).
   - A rejected or expired request releases its fence at once, unless it inherited a grace.
   - The sweep takes an optional `auditHmacKey`. With it, the sweep closes stale confirmed or awaiting requests as `expired`; without it, it keeps them (fail safe).
3. **Audit pseudonym:**
   - The pseudonym is `HMAC-SHA256(VC_AUDIT_HMAC_KEY, "vc-erasure-v2|salt|studentId")`.
   - A missing key, or a key shorter than 32 characters, is `ErasureConfigError`, with no fallback.
   - `validateErasureConfig` and `erasureConfigFromEnv` validate the config. `VC_ERASURE_AUTO_DELETE` must be `true` or `false`. An approver email is required unless autoDelete is true.
   - `erasureRequestMatchesStudent` now needs the key.
4. **API (`/v1`):**
   - Roles are now `counsellor | admin | approver`.
   - New routes:
     - `POST …/confirm` (any role, returns the token)
     - `POST …/reconfirm` with body `{confirmToken}`: 202 awaiting, or 200 `{autoDeleted:true}` with the purge done
     - `POST …/approve` and `POST …/reject` (role `approver` only; the approver identity comes from the JWT subject)
   - Existing: `…/execute` (admin retry).
   - New error codes: `self_approve_refused` 403, `confirm_token_invalid` 403, `erasure_not_approved` 409, `erasure_expired` 410, and `erasure_not_configured` 503 when the config is missing or invalid.
   - OpenAPI documents all of these, and the route-table parity test covers them.
5. **`apps/api/src/index.ts`:** the handler reads `erasureConfigFromEnv(env)` lazily, so a misconfiguration gives a 503 rather than a boot failure. The sweep gets the key only if it is at least 32 characters.

## Scenario mapping

| Scenario | Test |
|---|---|
| SC-028 (one confirmation purges nothing) | `erasure-approver.test.ts` "SC-028 T029-A1" |
| SC-029 (two confirmations, no approver: nothing purged, outbox record) | "SC-029 T029-A2" |
| SC-030 (approved: read-back ZERO in every collection incl. session_transcripts and concern_flagged edges, tenant B untouched, HMAC receipt) | "SC-030 T029-A3"; also `server.test.ts` "T-029 api: request -> confirm -> reconfirm …" |
| SC-031 (autoDelete=true skips the approver, default false) | "SC-031 T029-A4"; `server.test.ts` "T-029 api: autoDelete=true …" |
| SC-032 (a deleteMany failure is recorded as failed, then retried) | `erasure.test.ts` "B15: a deleteMany failure on edges is REPORTED …" and "B15: a failure on an anchor collection …" (now via the full approve flow) |
| SC-033 (fenced from the 1st confirmation until completion + 24h, then re-enrolment) | "SC-033 T029-A5"; also T029-A12, T029-A13 |
| SC-034 (a write inside the fence window is compensated, zero residue) | `erasure.test.ts` "D-015 H4 …", "D-015: a writer that starts BEFORE confirm …", "D-016 KEY PROBE …" |

## How to verify (exact commands)

```
bash "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/6c22744a-b397-4515-a226-3516f0a93a31/scratchpad/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/db test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/db typecheck
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/api test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/api typecheck
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/engine test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/engine typecheck
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/schemas test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/web test
bash ".../vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-029-erasure-approver --filter @vc/web typecheck
python D:/vc/.worktrees/t-029-erasure-approver/contracts/verify_contracts.py
```

## Capability-coverage table

Falsification ran in a throwaway worktree (`git worktree add <scratchpad>/fz029 HEAD --detach`, `pnpm install --offline`, since removed). The driver edited one site per run, ran `tsx --test tests/erasure-approver.test.ts tests/erasure.test.ts` (db) or `tests/server.test.ts` (api) under the test lock, then restored the file with `git checkout`.

GREEN before: `M0 baseline db -> exit 0: tests 79 | pass 79 | fail 0` and `M0 baseline api -> exit 0: tests 15 | pass 15 | fail 0`.

| Claim | Test id | Falsifying edit | RED after (real) |
|---|---|---|---|
| No purge without the approver | SC-029 T029-A2, B15/T-029 self-approval | `executeErasure` accepts `awaiting_approval` and drops the `approvedBy` check | exit 1, pass 76, fail 2: SC-029 T029-A2; B15/T-029 |
| The pseudonym is a keyed HMAC, and dictionary recovery fails without the key | T029-A6, SC-030 T029-A3 | `createHmac("sha256", key)` changed to `createHash("sha256")` | exit 1, fail 2: SC-030 T029-A3; T029-A6 |
| A missing or short key is a config error with no fallback | T029-A7 | `assertAuditKey` made a no-op | exit 1, fail 1: T029-A7 |
| autoDelete=true skips the approver | SC-031 T029-A4 | `if (config.autoDelete)` changed to `if (false)` | exit 1, fail 1: SC-031 T029-A4 |
| An awaiting_approval request keeps its fence | T029-A13 | `awaiting_approval` removed from `FENCING_STATUSES` | first run: **survived** (0 fail), so T029-A13 was added; re-run: exit 1, pass 78, fail 1: T029-A13 |
| Fence until completion + 24h | SC-033 T029-A5, T029-A12, D-016 hold | `ERASURE_FENCE_GRACE_MS = 0` | exit 1, fail 3: SC-033 T029-A5; T029-A12; D-016 hold |
| The approver differs from the requester and the confirmers | B15/T-029 self-approval | the self-approve check line removed | exit 1, fail 1: B15/T-029 |
| The second confirmation needs the unused token | T029-A8 | `tokenMatches` returns true | exit 1, fail 1: T029-A8 |
| Reject or expiry releases the fence and purges nothing | T029-A9, T029-A10, T029-A8 | the `releaseUnpurgedFence` call disabled | exit 1, fail 3: T029-A8; T029-A9; T029-A10 |
| approve and reject are for the approver role only | server.test "role outside a route's roles is 403", "OpenAPI … matches the route table" | `APPROVER = ["counsellor","admin","approver"]` | exit 1, pass 13, fail 2: both named tests |
| The outbox is a record only (no SMTP or network) | T029-A11 | (static scan of erasure.ts imports and fetch) | not mutated; the assertion is a direct source scan |

## Real outputs (bound worktree, under the lock)

- `@vc/db test`: `ℹ tests 246 ℹ pass 246 ℹ fail 0` (after T029-A13); `@vc/db typecheck`: `tsc --noEmit` clean
- `@vc/api test`: `ℹ tests 38 ℹ pass 38 ℹ fail 0`; typecheck clean
- `@vc/engine test`: `ℹ tests 544 ℹ pass 544 ℹ fail 0`; typecheck clean
- `@vc/schemas test`: `ℹ tests 61 ℹ pass 61 ℹ fail 0`; typecheck clean
- `@vc/web test`: `ℹ tests 38 ℹ pass 38 ℹ fail 0`; typecheck clean (the web seed still calls `confirmErasure` without a token)
- `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`

## Open gaps

1. The first confirmation accepts any staff actor, including the requester, because `apps/web/demo/seed.ts` (out of scope) calls it. The second confirmation must be the same actor. Separation of duties is therefore enforced at the approver, not between requester and confirmer.
2. The fence key (`erasureFenceKey`) is still an unsalted sha256 of the student id. Only the audit pseudonym moved to HMAC.
3. Pending requests (never confirmed) never expire. They hold no fence, but they block a new request through the one-open index.
4. Pre-T-029 `failed` rows have no `approvedBy`, so `executeErasure` refuses them with `ErasureNotApprovedError`. They need a data migration or a manual re-approval.
5. An approved request whose execute crashed holds its fence until an admin retries `…/execute`. There is no auto-execute in the sweep.
6. The outbox record is not marked when its request is rejected or expired. No sender exists yet: the outbox is only a record, as the brief says.
7. `isStudentFenced` (the write gate) trusts only the fence row. A fence row past its `releaseAfter` does not fence, even if the student has an `awaiting_approval` request. This state is unreachable through the API, because the re-arm at the first confirm unsets `releaseAfter`. T029-A13 pins only the sweep's defence.
8. The sweep expires stale requests only when `VC_AUDIT_HMAC_KEY` is configured, because the HMAC is needed to close a request. Without the key, abandoned requests keep their fences (fail safe).

## Status: ready-for-check
