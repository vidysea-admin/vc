# Verdict — t-037-failover-cancellation
**Cycle checked:** 0
**Checker:** /checker, Mode A, full protocol, fresh context
**Bound root:** D:/vc/.worktrees/t-037-failover-cancellation (branch wave/t-037-failover-cancellation, base 2dabcb0, head e0f57b6)
**Date:** 2026-09-27

## Verdict: PASS

## What I re-ran myself (bound root, head e0f57b6, git status clean throughout)
- `pnpm -C packages/providers test` -> 54/54, 0 fail (manifest claimed 54/54, was 50 before). Matches.
- `pnpm -C packages/engine test` -> 620/620, 0 fail (manifest claimed unchanged). Matches.
- `pnpm -r typecheck` -> clean across 9/10 scoped workspace projects (apps/web excluded, same as prior units). Matches.

## Independent falsification (throwaway `git archive HEAD` copy, outside the bound root, `pnpm install --offline --filter @vc/providers...`; bound root's `git status` and HEAD (e0f57b6) confirmed unchanged before/during/after; scratchpad copy deleted after use)

**Lever A** — removed the single line `controller.abort();` from `raceDeadline`'s deadline-timer callback (`packages/providers/src/index.ts`):
- GREEN baseline first: 54/54.
- RED after the edit: 52 pass / 2 fail, and the two failures are exactly the two new `failover.test.ts` tests, with the exact assertion text the manifest quoted (`FailoverProvider must pass a per-attempt signal into the chain member's request`; `the hang server must observe the connection actually close ...`). Not an import/parse error — genuine assertion failures.
- Reverted, diffed byte-identical against the pristine bound-root file, re-ran GREEN (54/54).

**Lever B** — removed `observedSignal = request.signal;` from the fake `hangsForeverButRecordsSignal` fixture in `failover.test.ts` (a fixture edit, not a source edit — the fixture's own behaviour toward `FailoverProvider` is otherwise identical):
- GREEN baseline reconfirmed: 54/54.
- RED after the edit: 53 pass / 1 fail — only "the deadline timer aborts the LOSING attempt's own AbortSignal ..." fails, proving that assertion is load-bearing against the fixture's own correctness, not vacuous.
- Reverted, diffed byte-identical, re-ran GREEN (54/54).

Both levers reproduce the manifest's claimed falsification exactly (same pass/fail counts, same failing test names, same assertion text). I did not additionally re-falsify the two `litellm.test.ts` rows (already-aborted / mid-flight abort against `LiteLlmProvider` directly) — I agree with the manifest that these are a strict subset of the same `request.signal?.aborted` branch already exercised by Lever A/B, and inspected them directly instead (see judgment 1 below); re-running them in the bound-root suite (`pnpm -C packages/providers test`, both green, both present) is the coverage that matters for these.

## Judgment on the five specific questions

**1. Is the abort real, or theatre?** Real, not theatre. Both new server-observed tests (`failover.test.ts`'s hang-server test and `litellm.test.ts`'s mid-flight-abort test) use a genuine `node:http` server via `createServer(...)`, register `httpReq.on("close", ...)` on the SERVER side, and assert on a variable the server's own event handler sets (`hangServerAbortedAt` / `abortedAt`) — this is the TCP/HTTP layer itself observing the client's FIN, not a client-side inference about what "should" have happened. I ran these tests myself (both in the bound-root suite and, implicitly, inside the falsification copy) and watched them pass with real elapsed-time assertions (abort lands near the 150ms deadline, not the 5s per-attempt timeout). The claim is not overstated. One honest caveat, already disclosed by the maker: there is a real 200ms `setTimeout` wait inserted before asserting on the server-side effect, needed because the FIN takes a genuine (if tiny) loopback round trip after the client promise settles — this is a legitimate flakiness fix, not evidence-weakening, since the assertion is still on a server-observed event, not a timer proxy for one.

**2. `LiteLlmAbortedError` excluded from `isRetryableProviderError`'s whitelist — correct, and I traced the "does a genuine transient failure ever surface as an abort" question through the actual control flow rather than taking the manifest's word:** `LiteLlmAbortedError` is thrown by `LiteLlmProvider.generate()` in exactly two places (index.ts:471-474 pre-check, and the catch block at index.ts:498-502) — both gated on `request.signal?.aborted` / `externalSignal?.aborted` being true. It is never thrown for a genuine timeout (that stays `LiteLlmTimeoutError`) or a genuine network/HTTP failure (those stay their own typed errors). Separately, I confirmed the abort path can never let a losing attempt's rejection reach `FailoverProvider.generate()`'s own catch block ahead of the deadline's own rejection: `raceDeadline`'s timeout callback calls `controller.abort()` then `reject(new FailoverDeadlineExceededError(...))` synchronously in the same tick, so that rejection's microtask is always queued before the fetch-abort-triggered rejection inside the raced-out `LiteLlmProvider.generate()` call — `Promise.race` therefore always settles with `FailoverDeadlineExceededError`, which is handled by its own dedicated branch (`if (err instanceof FailoverDeadlineExceededError)`), never by the `isRetryableProviderError` whitelist at all. So in the current code `LiteLlmAbortedError` never actually reaches that whitelist check from the deadline path; excluding it is correct and, more importantly, harmless-by-construction today. No regression path found where a real transient failure gets mislabeled as an abort and silently exits the chain — the chain "goes quiet" only via the existing, already-alerted `FailoverDeadlineExceededError` -> `onExhausted` -> `AiUnavailableError` route, which is not silent (console.error + Langfuse span + typed error to the caller).

**3. Optional-parameter / caller-unchanged claim — verified directly, not by inspection alone:** `grep -rn "\.generate(" packages/engine/src` (excluding tests and doc comments) turns up exactly the two call sites the manifest names — `concern-classifier.ts:249` and `scribe/nodes.ts:1096` — and I read both in context. Neither sets `request.signal`; both pass through unchanged records/fields the same way they did before this unit. I also grepped for any other `.generate(` call anywhere in `packages/engine/src` and `apps/*/src` and found nothing beyond the two named sites, so "no other caller was missed" holds.

**4. Unchanged failover semantics for the non-abort path — confirmed by reading the removed/changed lines, not just the added ones:** `git diff` shows every removed line in `index.ts` is a straight replacement (doc comments updated in place, `raceDeadline`'s parameter changed from an already-started `Promise<T>` to a `(signal) => Promise<T>` factory, its one new call to `controller.abort()` before the pre-existing `reject(...)`). `isRetryableProviderError`'s existing five `instanceof` branches are untouched; the chain-cycling, attempt-budget, and backoff logic in `generate()` is untouched except for passing `signal` through the existing `{ ...request, signal }` spread that already existed pre-unit for other fields. No quiet behavioural change found riding along with the fix.

**5. The two disclosed gaps:**
- **(a) `concern-classifier.ts` has the same abandon-on-timeout shape, untouched.** Confirmed by reading the file (index.ts:249-258): a `Promise.race([call, timeout])` with no cancellation of `call` on timeout — structurally identical to the pre-fix `raceDeadline` bug. I judge this **correctly scoped out of T-037** (this unit's named scope is `packages/providers/src/index.ts:651`, and this call site has its own tests and its own retry semantics, generateWithRetry-adjacent but distinct) but **not acceptable to leave untracked** — it is the same real-money/socket-leak bug class as ISS-066, just on an async, off-the-live-turn path (lower blast radius, not zero). I logged it as **ISS-t-037-2, severity medium, open** rather than accepting the manifest's prose as the only record of it.
- **(b) `FailoverProvider` drops an externally-supplied `request.signal`.** Confirmed in code: `provider.generate<T>({ ...request, signal })` spreads the per-attempt `signal` AFTER `request`, so it always wins over anything the caller set. Inert today (no caller sets one), correctly scoped out, but a real interface trap for later. Logged as **ISS-t-037-3, severity low, open**.
- **isRetryableProviderError not recognising LiteLlmAbortedError:** by design per judgment 2 above; not a gap, no issue needed.

## Ordinary Mode A checks
- **Diff scope:** `git diff 2dabcb0..HEAD --stat` shows exactly `packages/providers/src/index.ts`, `packages/providers/tests/failover.test.ts`, `packages/providers/tests/litellm.test.ts`, and the manifest itself. Nothing else touched, nothing renamed or deleted.
- **No weakening:** both test-file diffs are pure additions (0 deletions in either file per `git diff --stat`); no export, function or config key removed from `index.ts` (every removed line is a same-purpose replacement, see judgment 4).
- **Secrets / network:** grepped the diff for key-shaped strings and non-loopback URLs — the only hit (`apiKey: "super-secret-key"`) is a pre-existing, untouched context line in a different, already-merged test, not part of this unit's added lines. All new network activity in the new tests is real `node:http` servers bound to `127.0.0.1` — no external calls, no skipped tests.
- **Governance files untouched:** `git diff 2dabcb0..HEAD --stat -- qa/contracts docs/DECISIONS.md ARCHITECTURE.md .claude` is empty.
- **Persona walk: skip, TRUE.** Verified against the diff, not just the manifest's word: every changed/added path is under `packages/providers/`; no `apps/web` file appears anywhere in the diff, so there is no UI surface for this unit to walk.

## Process item — vc-testlock.sh
Confirmed the repo genuinely lacks it: `git log --all --diff-filter=A --name-only | grep -i testlock` returns nothing on any branch, and there is no such file at the repo root, under `scripts/`, or on `PATH`. It is, however, referenced by name in 11 committed manifests (t-012 through this one), meaning every maker since at least t-012 has apparently been improvising an equivalent local wrapper rather than sharing a committed one. Logged as **ISS-t-037-1, severity low, open** (a repo-hygiene/process gap, not a defect in this unit). Did not create the script myself, per instruction.

## Issues logged this cycle (qa/issues.jsonl)
- `ISS-066` — updated to **fixed**, with the regression-check commands and the falsification method that verified it.
- `ISS-t-037-1` (low, open) — vc-testlock.sh referenced but never committed.
- `ISS-t-037-2` (medium, open) — concern-classifier.ts shares ISS-066's bug shape, correctly out of scope for T-037 but tracked.
- `ISS-t-037-3` (low, open) — FailoverProvider silently drops an externally-supplied request.signal.

None of the three new issues block this unit's PASS — none is a regression introduced by T-037, and (a)/(b) are the manifest's own honestly-disclosed, correctly-scoped-out gaps that I am simply making sure survive as ledger entries rather than only as manifest prose.

## Summary
The maker's central claim — that a losing/timed-out FailoverProvider attempt's real HTTP request is now actually cancelled, not merely abandoned — holds up under independent, from-scratch falsification in an isolated copy, with the abort verified at the server/socket level rather than inferred client-side. All three verify commands reproduce independently. Callers, error taxonomy and non-abort failover timing are unchanged. The two disclosed gaps are correctly scoped out of this unit and are now tracked as open issues rather than resting only on manifest prose.
