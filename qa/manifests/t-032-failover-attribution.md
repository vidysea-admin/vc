# Manifest: t-032-failover-attribution

**Contract:** qa/contracts/counselling-engine.md (D-020 / gate `provider-fallback`; B6, B11, B13, B14)
**Goal task:** T-032 (resume — no TASKS.md row exists yet for this unit at the time of this build;
not added here per the brief's "do not touch TASKS.md" instruction — left for the checker/close-out
step, same convention as T-021's "left open for the checker" line)
**Status:** ready-for-check
**Fix cycle:** 0 of max 3 (this is the RESUME of a unit whose code was already fully written across
two earlier build attempts that died on the test lock / account session limit, never on the code
itself — see "Resume note" below. No checker verdict has ever run against this unit, so cycle 0 is
correct.)
**Reopened by:** ISS-t-021-rev-3 (from the `t-021-provider-failover` fix-cycle-1 AI review, Warning
verdict `912a9d3`): `isRetryableProviderError`'s `if (err instanceof z.ZodError) return true;` line
was too broad — it treats ANY `z.ZodError` raised anywhere inside a chain member's own code as a
retryable "wrong-shape model answer" and silently fails it over, which would also swallow an
unrelated internal bug inside a provider (a Zod validation the provider does for its OWN internal
config/state, not the model's output) as if it were a transient outage.
**Scope:** `packages/providers/src/index.ts`, `packages/providers/tests/failover.test.ts` only (per
the brief). No other file touched.
**Not touched:** `.claude/**`, `docs/DECISIONS.md`, `qa/contracts/**`, `TASKS.md`, `qa/issues.jsonl`,
`ARCHITECTURE.md`, `packages/engine/**` (including `packages/engine/src/scribe/nodes.ts` —
`isSchemaError`'s `err instanceof ZodError || err.name === "ZodError"` check keeps matching
`ModelOutputSchemaError` because it extends `z.ZodError`, so no change was needed there), any other
package.
**Dual check:** no (not requested in the brief; no `.goal/` criticality marking found for this unit)
**Executor:** claude-opus-subagent (maker build subagent, resume attempt 3)
**Executor rationale:** resume of a build whose prior two attempts died on infrastructure (test-lock
contention, then account session limit), not on the code — this attempt reviews and verifies the
already-written implementation rather than rewriting it, per the brief.

## Resume note (why fix cycle is 0, not higher)

Runs 1-2 of this build unit produced the full implementation and test diff below directly in the
worktree, uncommitted, then died — run 1 on the machine-wide test-lock being busy for an extended
period, run 2 on the account's session limit — in both cases before a commit or a manifest could be
written. No checker has ever seen this unit; there is no prior fix cycle to count. This attempt
(3) read the uncommitted diff, reviewed it line-by-line against the contract and D-020, ran the full
test suite and typecheck fresh, performed the falsification in place, and is committing it now for
the first time. Two scratchpad artifacts from run 2 corroborate the implementation is unchanged
since then: `t032-final-test.log` (49/49 pass, timestamped 2026-09-27 00:19 IST) and an earlier
`t032-falsify2.log` (2/49 red, a working falsification snapshot from mid-run-2, timestamped 00:15
IST) — both predate this session and match the diff verified fresh below byte-for-byte (confirmed
via `git diff --stat` before and after this session's own falsify/restore cycle: identical
68 insertions / 16 deletions).

## What changed

### 1. `ModelOutputSchemaError` — a narrowly-tagged subclass of `z.ZodError` (`packages/providers/src/index.ts:204-238`)

New `export class ModelOutputSchemaError extends z.ZodError` (`:222-227`), `name =
"ModelOutputSchemaError"`. Raised ONLY by a new private helper `parseModelOutput<T>(outputSchema,
raw)` (`:233-238`), which wraps `outputSchema.safeParse(raw)` and throws
`new ModelOutputSchemaError(result.error.issues)` on a mismatch instead of the schema's own
`.parse()` throwing a bare `z.ZodError`.

Because it `extends z.ZodError`, `instanceof z.ZodError` still holds for it everywhere that check is
already relied upon outside this unit's scope (`packages/engine/src/scribe/nodes.ts`'s
`isSchemaError`, untouched, still matches it for the un-chained same-provider retry path).

### 2. All three model-output validation sites route through `parseModelOutput` (not `.parse()` directly)

- `MockProvider.generate` (`:286`, was `request.outputSchema.parse(raw)`)
- `LiteLlmProvider.generate` (`:478`, was `request.outputSchema.parse(parsed)`)
- `RulesProvider.generate` (`:896`, was `request.outputSchema.parse(raw)`)

These are the three, and only the three, places a provider validates the MODEL's raw answer against
the caller's `outputSchema` (B5). No other Zod use anywhere in the file (e.g. env-var parsing in
`loadProviderConfig`) was touched or routed through this helper — only the model-output boundary is
tagged.

### 3. `isRetryableProviderError` narrowed from `z.ZodError` to `ModelOutputSchemaError` (`packages/providers/src/index.ts:540`)

`if (err instanceof z.ZodError) return true;` → `if (err instanceof ModelOutputSchemaError) return
true;` — the single-line functional fix for ISS-t-021-rev-3. A bare/unrelated `z.ZodError` (one NOT
raised at the model-output-validation boundary — e.g. a hypothetical internal Zod check inside a
future chain member's own code) now falls through to `return false`, matching D-020's fail-closed
"an unrecognised failure mode fails closed" whitelist design instead of being silently retried as if
it were an outage. The doc-comment above `isRetryableProviderError` (`:495-516`) was extended in
place to explain both directions.

### 4. Deadline attribution fix inside `FailoverProvider.generate` (`packages/providers/src/index.ts:723-763`)

Two call sites that end the retry loop because the wall-clock deadline (not the attempt counter) was
hit now assign `lastError` **unconditionally** to a fresh `FailoverDeadlineExceededError`, instead of
`lastError ?? new FailoverDeadlineExceededError(...)`:

- The pre-attempt deadline check (`:736`, was `lastError = lastError ?? new
  FailoverDeadlineExceededError(this.deadlineMs);` → now `lastError = new
  FailoverDeadlineExceededError(this.deadlineMs);`).
- A new mid-cycle case: the deadline runs out **during the backoff wait between attempts** (`:756-761`,
  new — previously `if (remainingForBackoff <= 0) break;` silently broke out of the loop leaving
  `lastError` as whatever retryable error the just-finished attempt had set, so the reported
  `lastErrorName` on the resulting `AiUnavailableError`/exhaustion alert misattributed the stop to a
  stale ordinary retryable failure instead of the deadline that actually ended the call).

Both are documented in the extended docstring above `generate()` (`:723-729`): "the deadline is what
actually stopped the loop in both cases ... reporting that stale earlier error instead of the
deadline would misattribute the exhaustion cause to the caller and the engineering alert."

## Capability coverage

| # | Claim | Test id | Falsifying edit | Expected RED |
|---|---|---|---|---|
| 1 | `ModelOutputSchemaError` (tagged, model-output boundary only) is retryable; a bare/unrelated `z.ZodError` is not | `isRetryableProviderError: whitelist — ... ModelOutputSchemaError are retryable, everything else (auth/config, a bare unrelated ZodError) is not` (`failover.test.ts:337`) | Revert `:540` to `if (err instanceof z.ZodError) return true;` | `isRetryableProviderError(new z.ZodError([]))` returns `true` instead of the asserted `false` |
| 2 | Direction test: a real output-schema failure fails over; an unrelated internal `ZodError` propagates unchanged, no failover, no exhaustion alert | `T-032 (ISS-t-021-rev-3): isRetryableProviderError scopes ZodError to MODEL-OUTPUT validation only ...` (`failover.test.ts:369`) | Same revert as #1 | The `guardedProvider.generate(req)` call no longer rejects (the "buggy internal ZodError" is now retried and fails over to `nextInChain`, which resolves) — `assert.rejects` reports "Missing expected rejection" |
| 3 | The pre-existing whitelist test's `lastErrorName` for the all-3-wrong-shape case is `"ModelOutputSchemaError"`, not the old bare `"ZodError"` | `T-021 fix cycle 1 (ISS-t-021-rev-2, ...): all 3 models return wrong-shape output ...` (`failover.test.ts:493`) | Same revert as #1 (this test does not directly assert the whitelist function, but exercises the real chain end-to-end through it) | Not independently falsified in this session (covered by #1/#2 exercising the same line); this test stayed green through the falsify/restore cycle below (49/49 both times, name unchanged) |
| 4 | The deadline-during-backoff case attributes the stop to `FailoverDeadlineExceededError`, never a stale earlier retryable error | `T-032 (ISS-t-021-rev-3): the deadline expires BETWEEN attempts (during backoff) ...` (`failover.test.ts:250`) | Not independently falsified in this session (pre-existing from run 1/2; the falsification performed this session targeted the higher-priority ISS-t-021-rev-3 whitelist line per the brief's "revert one fix" instruction) — logically falsifiable by reverting `:756-761` to the old bare `if (remainingForBackoff <= 0) break;`, which would leave `lastError` as the stale `LiteLlmTimeoutError` and fail the test's `assert.equal(err.lastErrorName, "FailoverDeadlineExceededError", ...)` assertion | (not run this session; residual, see Open gaps) |

### Falsification actually run this session (in place, live worktree, per the brief)

Target: capability #1/#2 above, `packages/providers/src/index.ts:540`.

**Before (GREEN, real run):**
```
$ bash vc-testlock.sh pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test
...
ℹ tests 49
ℹ pass 49
ℹ fail 0
```

**Falsifying edit applied:** `packages/providers/src/index.ts:540` changed from
`if (err instanceof ModelOutputSchemaError) return true;` to `if (err instanceof z.ZodError) return
true;` (the exact pre-fix line).

**After (RED, real run, `node --import tsx --test packages/providers/tests/failover.test.ts` through
the lock):**
```
✖ isRetryableProviderError: whitelist — timeout/429/5xx/malformed/network/ModelOutputSchemaError are retryable, everything else (auth/config, a bare unrelated ZodError) is not (5.2405ms)
  AssertionError [ERR_ASSERTION]: a raw/unrelated ZodError is not retryable — only the tagged ModelOutputSchemaError is (T-032, ISS-t-021-rev-3)
  true !== false

✖ T-032 (ISS-t-021-rev-3): isRetryableProviderError scopes ZodError to MODEL-OUTPUT validation only — an output-schema failure fails over, an unrelated internal ZodError propagates unchanged (2.4185ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection.

ℹ tests 18
ℹ pass 16
ℹ fail 2
```

**Restored, re-verified GREEN (real run, full package, through the lock):**
```
$ bash vc-testlock.sh pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test
...
ℹ tests 49
ℹ pass 49
ℹ fail 0
ℹ duration_ms 1694.906
```

`git diff --stat packages/providers/src/index.ts` before and after this falsify/restore cycle:
identical (`84 ++++++++++++++++++++++++++++++++--------`, 68 insertions / 16 deletions) — confirms a
clean revert with no residual edit left in the file. Done in place, per the brief ("no throwaway
worktree install" for this step) — the only OUTSIDE-worktree action taken this session was none; no
scratch worktree was created (not needed for this single-line, non-network falsification).

## Verification (exact commands, run through the lock, real output, this session)

```
$ bash vc-testlock.sh pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test
[testlock] running (free RAM 2.51 GB): pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers test
> tsx --test tests/*.test.ts
... (49 tests, all ✔, listed in full above)
ℹ tests 49
ℹ pass 49
ℹ fail 0
ℹ duration_ms 2775.6472

$ bash vc-testlock.sh pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers typecheck
[testlock] running (free RAM 2.42 GB): pnpm -C D:/vc/.worktrees/t-032-failover-attribution --filter @vc/providers typecheck
> tsc --noEmit
(no output, exit 0)

$ python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
exit: 0
```

Test count: 49/49 for `@vc/providers` (was 47 at T-021 fix-cycle-1 close-out; +2 new this unit:
"T-032 ... the deadline expires BETWEEN attempts" and "T-032 ... scopes ZodError to MODEL-OUTPUT
validation only"; the pre-existing whitelist test was updated in place, title extended, same test
id, per the brief's "2 new tests with 2 updated in place" — the second updated test is the "all 3
models return wrong-shape output" test whose `lastErrorName` assertion changed from `"ZodError"` to
`"ModelOutputSchemaError"`).

No other package was touched or needed re-running — this unit's scope is exactly the two named files
in `packages/providers/`.

## Claims → evidence

| Claim | Evidence |
|---|---|
| A wrong-shape MODEL output (at the three `parseModelOutput` sites) is retryable and fails over within the same call/budget/deadline | `T-021 fix cycle 1 (ISS-t-021-rev-2 ...): a wrong-shape (schema-invalid) response from model 1 fails over to model 2 ...` (unchanged, still green) |
| An unrelated internal `z.ZodError` (not at the model-output boundary) is NOT retryable — propagates unchanged, no failover, no exhaustion alert | `T-032 (ISS-t-021-rev-3): isRetryableProviderError scopes ZodError to MODEL-OUTPUT validation only ...` (new; falsified RED/GREEN above) |
| The whitelist function itself draws the line at `ModelOutputSchemaError`, not bare `z.ZodError` | `isRetryableProviderError: whitelist ...` (updated in place; falsified RED/GREEN above) |
| The deadline, not a stale earlier retryable error, is the reported exhaustion cause when the deadline expires between attempts (during backoff) | `T-032 (ISS-t-021-rev-3): the deadline expires BETWEEN attempts (during backoff) ...` (new; green in every run this session, not independently falsified — see Open gaps) |
| No regression to any of the other 47 pre-existing `@vc/providers` tests | Full 49/49 run above; all pre-existing test names present and green |
| No engine/web/observability code needed to change | `isSchemaError` in `packages/engine/src/scribe/nodes.ts` matches `ModelOutputSchemaError` via `instanceof ZodError` unchanged (class inheritance, not edited); no other package's tests were affected (not re-run, since none of their source or test files changed — `git status` confirms only the two scoped files are modified) |

## Open gaps

1. **Capability #4 (deadline-during-backoff attribution) was not independently falsified this
   session** — it was written and passed green in an earlier build attempt (run 1/2) and stayed
   green through this session's fresh full-suite runs and through the falsify/restore cycle
   targeting capability #1/#2, but this session did not itself revert `:756-761` to the pre-fix
   `if (remainingForBackoff <= 0) break;` and capture a RED line for it. The brief asked for "the
   falsification IN PLACE (revert one fix, show the named test red, restore, show green)" — singular
   — and capability #1/#2 (the ISS-t-021-rev-3 headline fix, `isRetryableProviderError`'s narrowing)
   was chosen as that one fix since it is the fix this unit exists to make; the deadline-attribution
   fix (item 4 in "What changed") is a secondary correctness fix bundled into the same diff. Falsifying
   it too is a two-minute follow-up if the checker wants it before PASS.
2. **No TASKS.md row exists for T-032 at the time of this build.** Per the brief's explicit "Do NOT
   touch ... TASKS.md" instruction, no row was added here; the checker/close-out step is expected to
   reconcile task tracking, as has been the pattern for prior units' "left open for the checker" line
   (e.g. `t-021-provider-failover.md`'s "not requested in the brief" TASKS.md note).
3. **qa/issues.jsonl has no T-032/ISS-t-021-rev-3 row visible in this worktree** (searched, no match).
   The reopening review verdict `912a9d3` (T-021 fix-cycle-1 AI review, Warning) is referenced by
   task/commit history (`git log`) but this unit does not itself append to the issues ledger, per the
   brief's scope and the project rule that `/checker` is the sole maintainer of `qa/issues.jsonl`.
4. **No merge from `main` was performed.** `main` has advanced to `e72f4c5` (T-022 close-out) since
   this worktree's base `c4e2212`; the brief's scope was narrowly the two named files and did not ask
   for a merge/rebase, and `packages/providers/src/index.ts`/`tests/failover.test.ts` are not touched
   by the intervening `main` commits (T-022 is a different unit), so no conflict is expected, but this
   was not verified by actually merging. Left for the checker or a follow-up merge step.

## Status: ready-for-check
