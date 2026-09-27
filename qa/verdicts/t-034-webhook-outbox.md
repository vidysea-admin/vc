# Verdict — t-034-webhook-outbox
**Date:** 2026-09-27
**Cycle checked:** 0
**Checker:** fresh Claude subagent, Mode A unit check, bound to `D:/vc/.worktrees/t-034-webhook-outbox`

## What I re-ran myself (not trusted from the manifest)
- `pnpm -C packages/db test` → 247/247 pass (matches manifest).
- `pnpm -C packages/engine test` → 587/587 pass (matches manifest).
- `pnpm -C apps/api test` → 42/42 pass (matches manifest).
- `pnpm -r typecheck` → clean, 9/9 (matches manifest).
- `git diff` (base `1e040e5`, head `fb2811b`) `--stat` and full diff, read in whole.
- All 5 "Capability coverage" rows: reproduced **independently**, not re-run from the manifest's
  pasted output. Method: `git archive fb2811b` into a throwaway copy outside the bound root
  (`.../scratchpad/t034check`), `pnpm install --frozen-lockfile` there, then per row: ran the
  named test GREEN in the copy first (proving the copy is real), applied the single-hunk edit the
  manifest names, re-ran RED, confirmed the exact assertion, then reverted. See CAPABILITY-COVERAGE.

## Findings against the named checks

**1. Erasure coverage with read-back zero — PASS, verified on evidence.**
`webhook_outbox` is registered in `COLLECTION_NAMES` (`packages/db/src/collections.ts`), has two
`INDEX_PLAN` entries (`db-init.ts`: `{tenantId,status}` and the dotted-path
`{"event.data.studentId"}`), and is in `ERASURE_PLAN` at phase 1 via `byEventStudent`
(`erasure.ts:1430`). The builder's claim that the generic "full purge = 0 residue" test never
exercised this path before is correct — no prior fixture ever seeded a `webhook_outbox` document
(confirmed: the pre-existing "receipt counts match" test's hardcoded `expected` map had no entry
for it until this unit added one). The new test (`erasure.test.ts:347`) is not vacuous: it seeds
one queued event for student A and a sibling event for student B, asserts A's event is gone via
the same generic `docsMentioning` scan the file's other B15 tests use, the receipt line shows
`deleted:1, remaining:0, outcome:"purged"`, and B's event is untouched. I independently re-created
this exact failure by commenting out the `ERASURE_PLAN` entry: GREEN before
(`✔ T-034/B15: a queued webhook_outbox event…`), RED after with
`+ ['webhook_outbox:evt:erasure.requested:a-1'] - []` — the assertion that fired is the residue
check itself, not an import/parse error.

**2. D-016 no-TTL scanner — PASS, verified on evidence.**
The collection-specific guard (`NEVER_TTL_COLLECTIONS` in `db-init.test.ts`) does **not** list
`webhook_outbox` — only the transcript/checkpoint collections. Coverage instead comes from the
**second, repo-wide guard**: a regex scan (`ISS-t-013r-c0-3 scanner`) over every source file under
`packages/`, `apps/`, `mcp/` for any `expireAfterSeconds`/`ttl` pattern, anywhere. I added
`expireAfterSeconds: 3600` to the new `webhook_outbox_tenantId_status` index spec in `db-init.ts`
in the throwaway copy: the scanner test went from GREEN to RED, naming exactly the file I edited
(`AssertionError: a TTL was declared … db-init.ts`). This proves the scanner would in fact catch a
TTL on the new collection, even though it isn't singled out in the narrower list.

**3. Tenant scoping — PASS, verified on evidence.**
`MongoWebhookOutbox`'s constructor throws `TenantScopeError` if `tenantIdOf(db) === undefined`
(`outbox.ts:115-120`); I removed that guard in the copy and the "constructor refuses an unscoped
Db" test went from GREEN to RED with `Missing expected exception (TenantScopeError)`. Every query
inside the class goes through the `Db` handed to it, which is always `tenantScopedDb(...)`
(`createTenantWiring.webhookOutboxForTenant`, `server.ts:734-740`) — the same wrapper that T-025's
own extensive test suite (25 tests, all green in my re-run) proves stamps `tenantId` on every
insert and folds it into every filter/update/delete/cursor, and refuses anything that could escape
the scope. I did not find a path that constructs `MongoWebhookOutbox` over an unscoped `Db`
anywhere in `apps/api`. I also flipped ISS-t-027-rev-3 (open: "no top-level tenantId") to `fixed`
in the ledger — `engine/tests/webhooks-outbox-mongo.test.ts` carries a test with that issue's own
id ("every stored document carries a top-level tenantId… ") plus a tenant-isolation test, both
green.

**4. B2 provenance — PASS, verified on evidence.**
`decideApproval` (`server.ts:316-327`) reads back the facts `applyApprovedDiff` just durably wrote
via the new `getFactsByIds(db, studentId, ids)` (`facts.ts:1001-1006`, a plain `find` by `_id`s
scoped to `studentId`), and builds the `fact.approved` event from that fact's own `source` field —
never from the counsellor's raw `ApprovalResponseSchema` body. I confirmed this the same way as
row 2 below (falsified the emission guard, red on `0 !== 2`). The design note is correct:
`ScribeResult.written` only carries `writtenFactIds`, so this read-back is the only route to a
provenance-bearing event.

**5. No network send — PASS, confirmed by absence.**
`drainWebhookOutbox` / `deliverWebhookEvent` (the only functions in this tree that call `fetch`)
are defined in `packages/engine/src/webhooks/delivery.ts` and have **no caller** anywhere under
`apps/api/src` (grepped both `apps/` and `packages/engine/src/`; the only other hit is the
docstring mentioning it as future work). `emitWebhookEvents` (`server.ts:609-627`) only calls
`outbox.enqueue(...)`, a Mongo insert. `VC_WEBHOOK_DESTINATION_URL` (`index.ts:165`) is threaded
into `ApiDeps.webhooks.destinationUrl`, a string stored on the outbox record for a future drain
worker — it never triggers a request from this unit's own code paths.

**6. The logged race (ISS-t-034-erasure-webhook-race) — judged, severity raised low → medium
(not a unit-blocking finding).** VC's own purge is correct and complete (B15 is satisfied — the
`webhook_outbox` row really must go, or B15's "zero residue" breaks). The gap is B21's client-side
guarantee: under `VC_ERASURE_AUTO_DELETE=true` the `erasure.requested` notification to the client
can be silently deleted by the same request's purge before any drain worker sees it, meaning the
client can permanently never learn to erase its own copy. B21's contract text ("go out as signed
webhooks, so the client keeps its own copy") states the goal but not an ordering/delivery
guarantee against a same-request purge, so this is not a written-criterion violation and does not
FAIL the unit. I raised it to **medium** in the ledger (not "low") because: it is a **silent**
failure (nothing logs, nothing alerts — the same shape Mode B's silent-failure hunt treats as high
when it finds one in scanned code), and it sits on the **automated** path that exists specifically
to remove the human approver bottleneck, not a rare hand-run edge case. I left it `open`, not
reopened against this unit, since the maker enumerated it honestly and it is genuinely
out-of-proportion for this unit's own scope to fix — but it should be closed (ordering fix, or a
written B21 amendment accepting the limitation) before `VC_ERASURE_AUTO_DELETE` is used against a
real client.

## Diff scope (step 4c)
`git diff 1e040e5...fb2811b --stat`: 21 files, +1207/-32, every file matches the manifest's "What
changed" list exactly (no file touched outside it). All `-` lines are in-place replacements inside
functions the manifest describes editing (`server.ts` route bodies, `createTenantWiring`'s return
type, `schemas.ts`'s docstring) — no existing function, export, route, test or config key was
deleted or renamed. `qa/manifests/t-034-webhook-outbox.md` is new (expected — this is the unit's
own manifest).

## Secrets (B11)
No key value appears in the diff. `.env.example` documents `VC_WEBHOOK_DESTINATION_URL=` (name
only, no value, matches the existing `.env.example` convention for `VC_WEBHOOK_SECRET`).

## Persona walk / Mode D
Manifest states `skip (backend-only: packages/engine/src/webhooks, packages/db)`. Verified against
the diff myself: every changed/added path is under `packages/engine/src/webhooks`,
`packages/engine/tests`, `packages/db/{src,scripts,tests}`, `apps/api/{src,tests}`, `.env.example`,
`qa/`. `apps/web` (the repo's only UI package) is untouched. The skip reason is true, not a
false-persona-skip. `SCENARIOS: n/a` — `qa/scenarios/counselling-engine.csv` does not yet exist
(B19), consistent with contract wording for a unit checked before that file is authored.

## Ledger
- `ISS-t-027-rev-3`: `open` → `fixed` (evidenced by the tests above; left at `fixed` not `verified`
  — I did not myself revert the tenant-stamping fix for this exact assertion, only the sibling
  unscoped-Db guard).
- `ISS-t-034-erasure-webhook-race`: severity `low` → `medium`, reasoning recorded on the row
  (`checker_note`). Status stays `open`.
- `ISS-t-034-concern-hook`: left as-is (pre-existing, correctly out of this unit's scope — T-012 is
  actively changing the file it would touch).
- No new ISS ids minted; nothing else found that the manifest didn't already enumerate honestly.

```
VERDICT: PASS
SCOREBOARD: 4/4 contract criteria met (B2, B12, B15, B21), 5/5 supporting invariants hold (capability-coverage, diff-scope, no-TTL-scanner-coverage, no-network-send, secrets/B11)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 5/5 rows reproduced independently (throwaway copy, git archive fb2811b + pnpm install; each row's own green-before/red-after re-run, not the manifest's pasted output)
LIVE-BROWSER: not-applicable (backend-only unit — packages/engine/src/webhooks, packages/db, apps/api/{src,tests}, .env.example; apps/web untouched, confirmed against the diff)
ISSUES-WRITTEN: none new; ISS-t-027-rev-3 (open->fixed), ISS-t-034-erasure-webhook-race (severity low->medium)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All four named criteria (B2 provenance, B12 DB boundary, B15 erasure coverage, B21 events/tenancy) hold on evidence I reproduced myself, not the manifest's word — including independently re-triggering all 5 capability-coverage falsifications in a throwaway copy outside the bound root. No network send occurs from this unit's own code paths (drainWebhookOutbox/deliverWebhookEvent have no caller under apps/api). The one open judgment call is ISS-t-034-erasure-webhook-race: correctly enumerated rather than hidden, but "low" undersold a silent, automated-path notification gap that touches B21's client-copy guarantee — raised to medium in the ledger, not blocking this unit since no written criterion is violated.
```
