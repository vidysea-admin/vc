# Verdict — t-015-erasure-hardening

**Verdict:** PASS
**Cycle checked:** 0
**Unit:** T-015 (erasure hardening: per-op timeouts, sweep logging, startApi cleanup, tick guard, timeout cap)
**Contract:** B15 primary; B8, B12, B14
**Diff range checked:** `63b1e77..13b21b9` (single commit `13b21b9`, "fix(db,api): t-015 erasure hardening
(per-op timeouts, sweep logging, startApi cleanup, tick guard, timeout cap)")
**Manifest read:** `qa/manifests/t-015-erasure-hardening.md` (Status: ready-for-check, Fix cycle: 0)
**Issues addressed:** ISS-t-014-rev-1 (medium), ISS-t-014-rev-2 (medium), ISS-t-014-rev-3 (medium),
ISS-t-014-rev-4 (low), ISS-t-014-c0-2 (medium)

## 1. Verification commands re-run (worktree `D:\vc\.worktrees\t-015-erasure-hardening`)

```
$ pnpm install
Scope: all 10 workspace projects; Lockfile is up to date. Done in 1.5s (exit 0)

$ pnpm -r typecheck
apps/web, packages/providers, packages/schemas, packages/observability, packages/db, apps/api,
mcp/student-profile, mcp/university-kb, packages/engine (+ evals/tsconfig.json) — all "Done" (exit 0, 9/9 clean)

$ pnpm -r test
apps/web 1/1 · packages/schemas 50/50 · packages/providers 8/8 · packages/observability 57/57 ·
packages/db 157/157 · apps/api 6/6 · mcp/student-profile 12/12 · mcp/university-kb 9/9 ·
packages/engine 105/105
TOTAL 405/405, 0 fail (exit 0) — matches the manifest's claimed counts exactly.

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity (exit 0)
```

## 2. Method

Read `packages/db/src/erasure.ts` (`ERASURE_PURGE_OP_TIMEOUT_MS`, the loop in `executeErasure`,
`startErasureFenceSweep`'s `inFlight` guard, `releaseExpiredErasureFences`), `packages/db/src/client.ts`
(`resolveClientTimeoutMs`, `connectFromEnv`), `packages/db/scripts/db-init.ts` (`createPlannedIndexes`),
`apps/api/src/index.ts` (`defaultSweepErrorLogger`, `startApi`), `packages/db/tests/fakes.ts`'s new
call-recording additions, all 4 test files' diffs, the manifest in full, and the relevant contract
clauses (B8, B12, B14, B15) in `qa/contracts/counselling-engine.md`.

Falsification and my own hostile probes were done in a **separate scratch copy**
(`C:\Users\Lenovo\AppData\Local\Temp\claude\d--vc\...\scratchpad\t015`, `robocopy` of the worktree
minus `.git`/`node_modules`, then `pnpm install` there — 14.7s, reusing the local store). The
reviewed worktree (`D:\vc\.worktrees\t-015-erasure-hardening`) was never mutated; `git status
--porcelain` there was clean before and after (confirmed). I wrote 4 probe files there
(`packages/db/tests/checker-probe.client.test.ts`, `checker-probe.erasure.test.ts`,
`apps/api/tests/checker-probe.api.test.ts`), run via `npx tsx --test`, scratch-only, never committed.

## 3. rev-1 — per-op `timeoutMS`: independently confirmed, plus the "every round" claim

The maker's own test (`erasure.test.ts` "REALLY CARRIES...") proves the option reaches the fake's
recorded call for a single-round purge. I additionally read `executeErasure`'s loop structure
directly (`erasure.ts:986` `while (rounds < ERASURE_MAX_ROUNDS)`): both the `deleteMany` call
(`erasure.ts:1016`) and the `countDocuments` call (`erasure.ts:1031`) are **inside** the round loop,
with `{ timeoutMS: ERASURE_PURGE_OP_TIMEOUT_MS }` written literally at each call site — not hoisted
into a variable that could be set once and skipped on a later round. This is a static code-shape
guarantee, not merely inferred from a fixture that happens to complete in one round: **every round
and every retry (a fresh `executeErasure` call on a failed request re-enters the same code path)
carries the explicit timeout.** `db-init.ts`'s `createPlannedIndexes` split-out is clean: `main()` is
still never run by tests (B8 unaffected), and the loop is now testable offline. **Confirmed, no gap
found.**

## 4. rev-2 — default `onError`: confirmed working, but a real gap in what `message` can carry

The maker's two tests (structured line fires; caller override suppresses the default) are genuine
outcome tests — I re-ran them and independently reproduced the same behaviour with my own probe
using `mock.timers` + a forced `fences.find` throw.

**Finding (`ISS-t-015-c0-1`, medium):** `defaultSweepErrorLogger` (`apps/api/src/index.ts`) passes
`err.message` through **verbatim, unredacted**, into the logged JSON line. The brief specifically
asked "check what `message` can contain" — I built a realistic MongoDB-shaped error (an E11000
duplicate-key message, which real Mongo servers DO embed the offending document's field values
into) and confirmed the logged line contains that embedded value byte-for-byte (probe B, logged
line printed and asserted against). **Today this is not exploitable through the two collections this
specific sweep touches**: `erasure_fences._id`/`studentKey` is `erasureFenceKey(studentId)`, a SHA-256
hash (`erasure.ts:401`), never the raw `studentId`, and `db-init.ts`'s `ensureCollection` sets no
`$jsonSchema` validator on any collection (validator-echo is the other realistic vector for
document-content-in-error-message). So no current code path feeds this logger a message containing
raw personal data. But the guarantee is **implicit and untested, not enforced**: nothing stops a
future validator, a future collection with human-readable keys, or a future reuse of this logger
elsewhere from silently starting to leak personal data into logs, and no test would catch it. Given
this project's own B14 ("outcome, not construction") and B7 (hostile-variant testing for guards)
ethos, and that this is exactly the class of gap ISS-017/ISS-016 called out before, this is worth a
follow-up: either a redaction/allowlist on `message`, or at minimum a test pinning "a Mongo-shaped
error whose message embeds a value must not have that value survive in the logged line" so a future
regression is caught.

## 5. rev-3 — `startApi` closes the client on failure: confirmed for the documented case, gap on `close()` itself throwing

The maker's two tests (close-and-rethrow after a post-connect failure; no close on a successful
start) both re-ran green and I reproduced the close-and-rethrow behaviour independently.

**Finding (`ISS-t-015-c0-2`, low-medium):** the brief specifically asked to check "including when
`close()` itself throws." `apps/api/src/index.ts`'s catch block is:
```
} catch (err) {
  await client.close();
  throw err;
}
```
There is no protection around `client.close()` itself. Probe A forced `close()` to throw and
confirmed: `close()` is attempted (once), but its own thrown error **replaces** `err` — the
*original* failure (e.g. `startErasureFenceSweep`'s `RangeError`, the actual root cause a caller
needs to diagnose) is silently discarded, and only the close() failure propagates. It is also
unclear whether the client was actually released in this path (the attempt failed). Not a data-loss
or security issue, but a real diagnostic/resource-leak edge case that the manifest's own tests do
not cover, and the fix does not handle. Recommend wrapping `close()` in its own try/catch inside the
catch block (log/swallow a close() failure, always rethrow the original `err`), or chaining both
via `AggregateError`.

## 6. rev-4 — in-flight guard: confirmed, plus one adjacent reliability gap surfaced by hostile probing

The maker's own test (`erasure.test.ts` "an in-flight tick is not overlapped...") correctly proves:
tick 2 is skipped while tick 1 is stuck, and tick 3 (after tick 1 finishes) is not skipped — I
re-ran it green. The brief also asked to confirm "recovers after a tick rejects (no permanently
stuck `inFlight`)" — this is covered by the **unmodified, pre-existing** T-014 test ("a failing tick
is reported via `onError`... and does not stop the interval": a synchronously-throwing `find()`
still lets the *next* tick run normally), which I re-read and confirm is a genuine outcome test of
exactly this property, still green after this diff.

**Finding (`ISS-t-015-c0-3`, medium, root cause pre-dates this unit but is directly on code this
diff touched and is exactly the surface T-015's own new tests target):** `tick()`'s internal chain
is `releaseExpiredErasureFences(...).catch((err) => options.onError?.(err)).finally(() => { inFlight
= false; })`. If a **caller-supplied** `onError` itself throws, nothing consumes the resulting
rejection after `.finally()`. My probe confirmed this produces a real Node `unhandledRejection`
event (captured via `process.on('unhandledRejection', ...)`, count = 1) — under Node's default
policy since Node 15 (`--unhandled-rejections=throw`), an unhandled rejection **crashes the
process**. This is not new in this diff (T-014's original `.catch(onError)` had the same unconsumed
chain; T-015 only added `.finally()` on top of it), and the **shipped default** `defaultSweepErrorLogger`
never throws in practice (`JSON.stringify` of primitives + `console.error` do not throw), so nothing
ships broken today. But it is directly adjacent to, and within the scope of, the very hardening this
unit set out to do (rev-2's whole point is making sweep failures visible instead of silently fatal —
a buggy caller `onError` doing the opposite, crashing the whole API process, is the worst-case
inversion of that goal), and it was never tested or documented as a caller contract ("`onError` must
never throw"). Recommend a defensive `try { onError?.(err) } catch { /* ... */ }` inside `tick()`,
or at minimum documenting the non-throwing contract loudly in `ErasureFenceSweepOptions.onError`'s
docstring.

## 7. c0-2 — reject over clamp: confirmed correct and complete

Re-ran the maker's 3 tests (above-cap rejected, huge override rejected, exact boundary accepted) —
all green. I additionally probed the boundary from the other side (`FENCE_MARGIN_MS + 1` rejected,
`FENCE_MARGIN_MS` accepted — both confirmed) and a battery of format hostile-variants the manifest
did not test: fractional ms (`"30000.5"`), exponential notation (`"1e5"`), whitespace-padding
(`" 5000 "`), whitespace-only (falls back to default, not rejected as NaN — correct), a leading `+`
sign, and **hex notation** (`"0x1000"` — `Number()` silently parses this as decimal 4096, and
`"0x7531"` = decimal 30001, one over the cap, which **is** correctly rejected). The one substantive
observation: **the safety property itself never breaks** — every format tested that decimal-equals
a value above `FENCE_MARGIN_MS` is rejected regardless of notation, because all of them funnel
through the same `Number(raw) > FENCE_MARGIN_MS` comparison. The only residual is a UX/robustness
one (an operator writing `0x...` or `1e5` gets a surprising-but-not-unsafe numeric interpretation,
and a fractional value like `30000.5` is silently accepted as a non-integer `timeoutMS`) — low
severity, not blocking, filed as `ISS-t-015-c0-4` (low) for completeness rather than left unrecorded.

## 8. Judgment on the manifest's two open questions

1. **Are the 120s values reasonable without an SLA?** Yes, as a judgment call: 4x the client
   default, documented rationale (headroom for a multi-round, multi-collection purge / a slow index
   build), and — critically — a timeout here degrades to `failed`/retry per the module's own
   partial-failure design, never silent data loss. Same class of "no SLA yet, flagged honestly for a
   later decision" residual this project has already accepted at T-014 (the sweep interval default).
   **Acceptable**, not blocking.
2. **Does the in-code docstring satisfy "document it" for reject-over-clamp, or does it also need a
   DECISIONS entry?** Checked the project's own Update Authorization rule (`d:\vc\.claude\CLAUDE.md`):
   the DECISIONS-entry-first requirement applies to `ARCHITECTURE.md` (Hypotheses/Open Questions) and
   to `contracts/`/enforcement-path changes. `resolveClientTimeoutMs` is ordinary application code —
   neither. The docstring is substantive (names the rejected alternative and the specific reasoning:
   a silent clamp is a worse trap than a loud failure at startup). **The in-code docstring is
   sufficient; no DECISIONS entry is required for this change.**

## 9. Regression

The full `pnpm -r test` run (§1) is the complete regression set: 405/405 green, including every
T-011/T-014 test (fence, deadline, minimum hold, one-open-request index, B12/D-016 scanners, the
edge-ownership writerToken fixes) plus all new T-015 tests, matching the manifest's claimed totals
exactly (405 overall, 157 in `packages/db`, 6 in `apps/api`). No regression found.

## 10. Verdict rationale

All 5 in-scope issues (rev-1..4, c0-2) are genuinely fixed: I independently re-verified each
claims-to-evidence row, re-ran every committed test, and confirmed the core static guarantees by
reading the actual call sites (not just trusting the fixture's pass/fail) — most importantly that
rev-1's timeout is embedded at the literal call site inside the round loop (every round, every
retry) and that c0-2's cap holds regardless of numeric-string notation. My own hostile-variant
probing (client timeout format probes, a realistic Mongo-shaped error message probe, a `close()`-
itself-throws probe, and a throwing-`onError` probe) surfaced four genuine, non-blocking findings —
none of them falsifies any claim in the manifest's evidence table, none is a regression this unit
introduced relative to what it already had (c0-3's root cause pre-dates T-015), and all four are the
same class of "real but not urgent, flag for a follow-up cycle" residual this project has already
accepted repeatedly (T-011 cycle 3, T-014 cycle 0). **PASS.**

## 11. Issues ledger

- `ISS-t-014-rev-1` → **fixed**, verified this cycle (per-op timeoutMS reaches every round/retry;
  confirmed by reading the loop structure directly, not just the fixture's single-round pass).
- `ISS-t-014-rev-2` → **fixed**, verified this cycle (default structured logger; caller override).
  New residual filed: `ISS-t-015-c0-1` (message content not redaction-guarded).
- `ISS-t-014-rev-3` → **fixed**, verified this cycle (close-and-rethrow on the documented path).
  New residual filed: `ISS-t-015-c0-2` (close() itself throwing masks the original error).
- `ISS-t-014-rev-4` → **fixed**, verified this cycle (in-flight guard + recovery). New residual
  filed: `ISS-t-015-c0-3` (a throwing caller `onError` can crash the process — pre-existing root
  cause, adjacent to this unit's own new surface).
- `ISS-t-014-c0-2` → **fixed**, verified this cycle (reject-over-clamp, boundary exact, format
  hostile variants). New residual filed: `ISS-t-015-c0-4` (low — surprising-but-safe numeric-string
  formats accepted).
