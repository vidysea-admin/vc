# Verdict: t-029-erasure-approver

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Sonnet 5), root `D:/vc/.worktrees/t-029-erasure-approver`, branch `wave/t-029-erasure-approver`, HEAD `ed9d995`.

## What I re-ran myself

- `pnpm --filter @vc/db test` -> 246/246 pass (matches manifest).
- `pnpm --filter @vc/db typecheck` -> clean.
- `pnpm --filter @vc/api test` -> 38/38 pass (matches manifest).
- `pnpm --filter @vc/api typecheck` -> clean.
- `pnpm --filter @vc/engine test` -> 544/544 pass (matches manifest).
- `pnpm --filter @vc/schemas test` -> 61/61 pass (matches manifest).
- `python contracts/verify_contracts.py` -> PASS by vacuity (no frozen contracts yet).
- All runs wrapped in the test lock, one package at a time.

## Diff scope (`git diff b261c4d...HEAD --stat`)

Every changed file matches the manifest's declared Scope. No file outside it was touched. Two
pre-existing exports were removed (`ErasureSelfConfirmError`, the old zero-arg `confirmErasure`
signature, the old 1-arg `erasureRequestMatchesStudent`, `ERASURE_FENCE_GRACE_MS = 0`) — all are the
documented consequence of the gate `erasure-fencing` answer ("the requester confirms twice", grace
24h) and are disclosed in the manifest's own Open gap #1. Not an undisclosed deletion.

## Capability coverage — reproduced independently (own hostile edits, own throwaway worktree)

Worktree: `git worktree add <scratch>/t029fz ed9d995 --detach` + `pnpm install --offline`
(removed afterwards). Baseline green in the copy, same test ids the manifest names:
`tsx --test tests/erasure-approver.test.ts tests/erasure.test.ts` (db) -> 79/79;
`tsx --test tests/server.test.ts` (api) -> 15/15. Matches the manifest's own M0 baseline.

| Claim | My own falsifying edit (not copied from the manifest) | Result |
|---|---|---|
| A missing/short `VC_AUDIT_HMAC_KEY` is a config error (T029-A7) | `assertAuditKey`'s length gate changed from `< MIN_AUDIT_HMAC_KEY_LENGTH` to `< 1` (weakens, does not disable, the check — a different mutation than the manifest's "made a no-op") | RED: T029-A7 fails as expected |
| An `approved`/`failed` request still fences (D-016/D-015) | Removed `"approved"` from `FENCING_STATUSES` (manifest only falsified `"awaiting_approval"`) | RED: "D-016 no stuck fence" fails — an open request no longer keeps the fence |
| Read-back zero includes `session_transcripts` (SC-030) | Deleted the `session_transcripts` line from `ERASURE_PLAN` (a different attack than any manifest row: the plan silently stops purging a whole collection) | RED: read-back assertion fails, listing 4 surviving transcript turns |
| approve/reject are for role `approver` only | Widened `APPROVER` from `["approver"]` to `["approver","counsellor"]` in `apps/api/src/server.ts` | RED: the OpenAPI/route-table parity test fails on the widened role list |
| HMAC dictionary recovery fails without the key | My own script (`auditPseudonym`) hashing 50k candidate ids with a wrong key against a real target hash | 0/50000 matches without the key; the true id verifies only with the correct key |
| The approver must differ from requester/confirmer (self-approval) | Dropped `secondConfirmedBy` from the `others` array in `approveErasure` | Both suites stayed GREEN — **not a real gap**: `reconfirmErasure` already requires the second confirmer to be the *same* actor as the first confirmer (an invariant enforced elsewhere), so `secondConfirmedBy` always equals `confirmedBy` by construction and listing it separately is redundant, not a coverage hole. No finding filed for this row. |

5/6 independent hostile edits produced the expected RED; the sixth showed the redundant list entry
carries no exploitable behavior, which I verified is genuinely structural (not a missed test) by
reading `reconfirmErasure`'s own actor check.

## B15 acceptance criteria (contract `qa/contracts/counselling-engine.md`)

- Two distinct recorded confirmations before anything can purge — confirmed in code and by the
  falsified T029-A2/T029-A8 paths (I re-ran the manifest's own `no single call purges` assertions
  as part of the full suite; not separately re-derived beyond that, since my own edits above already
  attack the same invariant from a different angle and hold).
- Email outbox is a record only, no SMTP/network — confirmed by reading `erasure.ts`'s outbox code
  (no `fetch`/`net`/mail import anywhere in the file) and the `email_outbox` fake-Mongo-only test in
  `erasure-approver.test.ts`.
- `autoDelete` defaults to false, and the true path is tested (`server.test.ts` "T-029 api:
  autoDelete=true...", re-run above, green).
- Fence from first confirm until completion + 24h, re-enrolment after — `ERASURE_FENCE_GRACE_MS`
  is 24h; the technical D-016 hold and the 24h policy are exercised by the suite I re-ran.
- HMAC audit pseudonym, no fallback — independently reproduced above.

## Persona walk / Mode D

Not applicable: the diff touches no `apps/web`, no `.tsx`/`.jsx`, no route rendered by a browser —
only `packages/db`, `packages/schemas`, `apps/api/src` (API layer) and their tests. No UI surface
changed, so Mode D live-browser is not owed. The manifest carries no `Persona walk:` line (the
2026-09-26 field); per checker SKILL.md step 5bb this is a low-severity, non-blocking finding for a
non-UI unit (same precedent as `ISS-t-033-c0-2`).

## Findings

- [manifest-field-missing] `qa/manifests/t-029-erasure-approver.md` carries no `Persona walk:`
  line. Severity low, non-blocking: the unit touches no UI surface (`apps/web`, `.tsx`), so no walk
  is owed regardless; this is a template-completeness gap only. Filed as `ISS-t-029-c0-1`.

No other findings. Every criterion I checked is evidenced by a re-run I produced myself, and the
capability-coverage table is reproduced with my own, independently-designed hostile edits (5 of 6
genuinely red; the sixth exposed only redundant, non-exploitable code, not a gap).

## Scenario mapping (SC-028..034)

Spot-checked against the re-run suite and my own falsifications above: SC-028 (one confirm, exit
via the manifest's own passing test, unmodified by me), SC-029 (two confirms/no approver — outbox
row asserted, re-run green), SC-030 (approve -> purge -> read-back zero incl. session_transcripts —
independently falsified above), SC-031 (autoDelete=true — re-run green), SC-032 (deleteMany failure
recorded as failed — part of the green `@vc/db` suite, not independently re-attacked this cycle),
SC-033 (fence until completion+24h — independently falsified via FENCING_STATUSES above), SC-034 (a
write inside the fence window is compensated — part of the green `@vc/db` suite covering D-015/D-016,
not independently re-attacked this cycle: out of the 3-row minimum I owed, I did 6).

## Verdict

PASS.
