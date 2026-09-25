# @vc/db

Mongo access layer for the engine's one database, `virtual_counsellor`, on the production Mongo
server (contract B12, D-008/D-009, `qa/gates/mongo-host.md`).

- `src/client.ts` — `VC_DB_NAME`, `getVcDb`, `connectFromEnv`. The only place in the repo allowed
  to call the driver's `client.db(` (proven by `tests/db-scope.test.ts`, which greps
  `packages/**`, `apps/**` and `mcp/**` source).
- `src/collections.ts` — typed accessors for `students`, `sessions`, `facts`, `decisions`,
  `consents`, `edges`. `universities`/`courses` are name constants only (owned by the
  university-kb unit).
- `src/consent.ts` — `requireConsent` (contract B4).
- `src/facts.ts` — `proposeFactChanges` (pure, writes nothing) and `applyApprovedDiff` (the only
  function that writes to `facts`; contract B3, supersede-not-delete via `validTo`).
- `src/edges.ts` — the generic `{from, to, rel}` edge shape and the idempotent `link()` helper.
- `src/erasure.ts` — DPDP erasure and export (contract B15, T-011): `requestErasure` (pending) →
  `confirmErasure` (a different staff actor) → `executeErasure` (hard delete across every engine
  collection, two-phase so a failed step leaves the anchor collections for the retry, then a
  read-back with the same selectors and a counts-only receipt; throws `ErasureIncompleteError` on
  any failure). The `erasure_requests` audit row keeps only a salted studentId hash, staff actor
  ids, a reason code and the receipt once completed. `exportStudent` returns the student's own
  access bundle (not purpose-filtered; release only to the authenticated student/guardian).

## Live DB init (NOT run by T-003)

`scripts/db-init.ts` creates the engine's collections and a small set of indexes inside
`virtual_counsellor` on the real server named in `.env` `MONGODB_URL`. It is written and reviewed
but deliberately not executed by this unit (contract B8: automated work stays offline).

To run it later, as an explicit human-invoked step:

```sh
pnpm --filter @vc/db db:init
```

This requires a real `.env` with `MONGODB_URL` set. It never touches any database other than
`virtual_counsellor` (enforced by `getVcDb`), and it never calls `dropDatabase` — that stays gated
per D-009.
