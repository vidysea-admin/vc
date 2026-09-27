# Verdict: t-027-webhooks-core

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (claude-sonnet-subagent), read-only toward the artifact
**Bound root:** D:/vc/.worktrees/t-027-webhooks-core (branch wave/t-027-webhooks-core, HEAD 540fdaf7c9ce09c440e02acc6b4f0efc2adf707f)
**Contract:** qa/contracts/counselling-engine.md — B21 "Events" (primary), B2 provenance, B6 typed
boundaries, B11 secrets, B8/B13 offline/no-student-data, B14 outcome-not-construction

## What I re-ran myself (never trusted the manifest's pasted output)

1. `git status` / `git log` in the bound worktree — working tree clean, all work already committed
   at 540fdaf7. The manifest's "resumed unit, attempt 2" narrative checks out: the resume session
   committed the prior builder's uncommitted work after reviewing it (nothing rewritten).
2. `git diff <merge-base-with-main>...HEAD --stat` — 13 files changed, exactly the manifest's
   declared scope (`packages/engine/src/webhooks/*` new, 4 new test files, `index.ts`/`package.json`/
   `.env.example` extended, the manifest itself). No file outside "What changed" touched, nothing
   deleted or renamed. `packages/db`, `apps/api`, `apps/web`, `packages/engine/src/scribe/**` —
   untouched, as the brief required.
3. Read every source file in `packages/engine/src/webhooks/` line by line
   (schemas.ts, signing.ts, delivery.ts, outbox.ts) against the contract's B21 "Events" clause and
   the unit's original scope (envelope+Zod, HMAC-SHA256 signing/verify with replay window, retry
   with backoff+jitter, pluggable outbox).
4. Re-ran the full `@vc/engine` suite myself through the shared test lock:
   `bash vc-testlock.sh pnpm -C D:/vc/.worktrees/t-027-webhooks-core --filter @vc/engine test`
   → **315/315 pass, 0 fail** (matches the manifest's pasted number exactly, reproduced independently).
5. Re-ran typecheck through the lock: `pnpm --filter @vc/engine typecheck` → exit 0, no diagnostics.
6. Re-ran `python contracts/verify_contracts.py` → PASS by vacuity (no frozen contracts yet).
7. Grepped `.env.example` and git history for `VC_WEBHOOK_SECRET` — name only, no value, ever. Grepped
   `packages/engine/src/webhooks/` for `process.env` — zero hits (the module never touches env
   directly, matches the manifest's claim). B11 holds.
8. Confirmed the delivery tests' "fake receiver" is a real local `node:http` server bound to
   `127.0.0.1` (`createServer` / `server.listen(0, "127.0.0.1", ...)`), not a mocked `fetch` — B8/B13
   satisfied.

## Capability coverage — MY OWN hostile falsifications, in a throwaway worktree

Per B14 (outcome, not construction) I did not trust the manifest's own falsification rows. I built my
own scratch copy outside the bound root (`git worktree add <scratch> HEAD --detach` +
`pnpm install --offline`, in `C:/Users/Lenovo/AppData/Local/Temp/claude/.../vc-t027-chkA`, removed
afterward with `git worktree remove --force` + `rm -rf` + prune — the bound tree at
`D:/vc/.worktrees/t-027-webhooks-core` was never touched) and ran 3 of my own hostile edits
(distinct from the manifest's rows 2/3/6 — I picked different specific assertions inside the same
claims to independently corroborate, not re-run the maker's exact mutation):

| # | Claim | Edit | GREEN-before | RED-after | GREEN-after-revert |
|---|---|---|---|---|---|
| A | A future-dated timestamp (beyond the replay tolerance) is rejected | `signing.ts`: `if (skewMs < -toleranceMs) return {...}` → `if (false) return {...}` | 11/11 signing tests pass | `future_dated` test fails: `actual: {ok:true}` vs `expected: {ok:false, reason:'future_dated'}` | 11/11 (git checkout revert) |
| B | A non-retryable 4xx (400) stops immediately, no retry | `delivery.ts`: `if (!isRetryableDeliveryStatus(response.status))` → `if (false)` | 14/14 delivery tests pass | the 400 test fails: `actual: {attempts:5, delivered:false, status:400}` vs `expected: {attempts:1, ...}` — the guard's removal makes a real rejection retry to exhaustion | 14/14 (git checkout revert) |
| C | Outbox `enqueue` is idempotent by id (no reset of bookkeeping) | `outbox.ts`: commented out `if (existing) return existing;` | 39/39 webhook tests pass (batched run) | idempotency test fails: `actual: 'pending'` vs `expected: 'delivered'` — a second enqueue silently resets a delivered record back to pending | 39/39 (git checkout revert, batched run confirms clean) |

All three: real green-before in the copy, real red-after from my own edit, real green-after-revert,
all commands run and pasted above from my own session — not copied from the manifest.

**CAPABILITY-COVERAGE: 3/3 rows reproduced** (manifest lists 6 rows total; I independently verified 3
distinct claims across all 3 core modules — signing, delivery, outbox — which is sufficient coverage
of the unit's structurally distinct pieces per the "falsify at least 3" instruction). I did not
re-falsify the manifest's remaining rows (idempotency-byte-identity, constant-time-tamper, backoff
formula) since my own 3 rows already exercise signing.ts, delivery.ts and outbox.ts independently and
the full-suite GREEN reproduction (step 4 above) already re-proves every one of the manifest's other
claimed test IDs passes in the real bound tree.

## Diff scope (step 4c)

`git diff` shows only additions inside the declared "What changed" file list — no existing function,
export, test, or config key was deleted or renamed. `.gitignore`/CI/conftest-equivalent files
untouched. No scope creep.

## Persona / UI (B17, Mode D)

Changed paths are entirely under `packages/engine/src/webhooks/**` and its own tests, plus
`index.ts`/`package.json`/`.env.example` (no UI). **LIVE-BROWSER: not-applicable** — no UI surface
touched, and B21's "UI" note is explicit that `apps/web` is untouched here. Persona walk: not
required (no user-facing flow changed).

## Scenario matrix (B19)

Not applicable to this unit — T-027 is a headless library module (no live-card/UI flow), so B19's
"every UI-touching unit... runs every row" does not apply here.

## Issues ledger

No open issues reference `t-027` or `webhook` in `qa/issues.jsonl`. Manifest claims no
"Issues addressed" for this unit — nothing to cross-check there.

## Findings

None. Every criterion evidenced by my own re-run, my own code read, and my own falsifications.

```
VERDICT: PASS
SCOREBOARD: 4/4 criteria met (envelope+schemas, HMAC signing+verify+replay+constant-time,
retry+backoff+jitter+idempotency+4xx-allowlist, pluggable outbox+in-memory impl), 0/0 invariants
flagged as violated (B11 secrets, B8/B13 offline held)
FAILURES: none
CAPABILITY-COVERAGE: 3/3 rows reproduced (own hostile falsifications, signing.ts/delivery.ts/outbox.ts)
LIVE-BROWSER: not-applicable (changed paths: packages/engine/src/webhooks/**, tests, index.ts,
package.json, .env.example — no UI surface)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (maker build subagent, resume/verify pass) (checker: claude-sonnet-subagent)
EXPLANATION: Re-ran the full @vc/engine suite (315/315), typecheck (clean) and contracts verify
(PASS by vacuity) myself in the bound worktree, matching the manifest's pasted numbers exactly. Read
every line of the 4 new webhook modules against B21/B11/B8/B13/B2, confirmed no secret values or
process.env access anywhere, confirmed the delivery tests use a real local node:http fake receiver
(never a mocked fetch). Built my own throwaway scratch worktree outside the bound root and ran 3 of
my own hostile falsifications (future-dated rejection, non-retryable-4xx stop, outbox enqueue
idempotency) across all 3 core modules, each showing a genuine green-before/red-after/green-restored
cycle. Diff scope matches the manifest exactly with no deletions or out-of-scope touches. No UI
surface touched, so Mode D and B19's scenario matrix do not apply to this unit.
```
