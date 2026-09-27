# Verdict — t-041-concern-classifier-abort
**Cycle checked:** 0
**Checker:** /checker, Mode A, full protocol, fresh context
**Bound root:** D:/vc/.worktrees/t-041-concern-classifier-abort (branch wave/t-041-concern-classifier-abort, base d02168f, head 67c861a, code 1c1b5e6)
**Date:** 2026-09-27

## Verdict: PASS

This is the concern/crisis path (B16). The safety question was judged first, before anything else, per brief.

## The safety question

**1. Can an abort ever read as "no concern found"?** No. Traced every path from a cancelled classification to `escalationDecision`:
- `classifyConcern` only returns `status: "classified"` from the `try` block's own line `ConcernClassifierOutputSchema.parse(await Promise.race([call, timeout]))` — that requires the race to *resolve*, not reject. Both the abort mechanism (`LiteLlmProvider.generate()`, `packages/providers/src/index.ts:470-507`) and every hand-rolled test fixture (`HangingProvider`, `SignalRecordingHangingProvider`, `AsyncAbortingProvider`) only ever *reject* on an aborted signal, never resolve — confirmed by reading `LiteLlmProvider.generate()` itself: the pre-check `if (request.signal?.aborted) throw new LiteLlmAbortedError(...)` and the catch-block branch `if (externalSignal?.aborted) throw new LiteLlmAbortedError(...)` are both `throw`, no code path returns a value after an abort is observed.
- Every rejection lands in `classifyConcern`'s `catch (err)` block, which maps to `reason: err instanceof ConcernClassifierTimeoutError ? "timeout" : "error"` — never to `"classified"`. There is no `catch` inside `catch`, no default value, no type coercion that could turn a rejection into a classified/benign result.
- The one theoretical way an abort's rejection *could* leak past the timeout's own rejection is if the abort-triggered rejection (from the abandoned `call` promise) won the `Promise.race` ahead of the timeout's own rejection. It cannot: `controller.abort()` is called synchronously, immediately before `reject(new ConcernClassifierTimeoutError(...))`, in the same synchronous tick of the `setTimeout` callback. A real provider's own abort-triggered rejection (fetch's `AbortError`, or the `AsyncAbortingProvider` test fixture's deliberately-delayed rejection) is necessarily queued as a *later* microtask/macrotask — never in the same tick as the synchronous call that produced it — so the timeout's rejection always wins the race. This is the identical ordering guarantee the checker already re-derived and PASSed for `FailoverProvider.raceDeadline` in T-037 (traced there via microtask ordering; the same reasoning applies verbatim here since the code shape is copied).
- Verified this holds under real conditions, not just by reading code: ran the "a timeout aborts the abandoned provider call's own AbortSignal" test and the real-`node:http`-stub test myself (see Verify below) — both resolve to `unavailable`/`timeout`, never anything else.

**Conclusion: no route exists, in this diff, for an abort to read as "no concern found."**

**2. Is the timeout's observable behaviour genuinely unchanged?** Yes, confirmed by direct comparison, not by reading the new code alone. The pre-existing test `"T-012 classify: a hung provider resolves to unavailable/timeout within the timeout (never blocks)"` (added at T-012, untouched by this diff) still passes byte-for-byte unchanged against `HangingProvider` (a fixture that never even *observes* a signal — proving the annotation shape a caller sees is identical whether or not the provider honours the new `signal` field at all). The new tests add proof of *cancellation*, not a changed annotation shape: all three new tests assert `out.status === "unavailable"` / `out.reason === "timeout"`, the exact same fields the old test already asserted.

**3. `escalationDecision` / `reviewedFlagView` unchanged, crisis branch never reads the classifier.** Confirmed both ways:
- `git diff d02168f 1c1b5e6 -- packages/engine/src/guards/concern-classifier.ts` shows the diff touches only the module docstring, `classifyConcern`'s own doc comment, and the body of `classifyConcern` itself (binding `controller`, adding `signal: controller.signal`, moving `controller.abort()` into the timeout callback). `reviewedFlagView` (line 334) and `escalationDecision` (line 357) have zero lines changed.
- Read `escalationDecision` directly: `if (guard.level === "crisis") return { escalate: true, reason: "guard_crisis", severity: "critical" };` is the first line of the function body — it returns before the `classifier` parameter is read at all. A guard-flagged crisis turn's escalation can never be affected by whether its classification was cancelled, abandoned, or completed.

**4. Late rejection never becomes an unhandled rejection.** Confirmed two ways:
- Ran the new test myself (`process.on("unhandledRejection", ...)` for the duration of the test plus a 100ms grace window past `AsyncAbortingProvider`'s deliberately-delayed 5ms rejection) — passes, `unhandled` array stays empty.
- Independently re-derived *why*: `Promise.race([call, timeout])` attaches a rejection handler to `call` synchronously, at the moment `Promise.race` is invoked — not lazily when/if it settles. So `call`'s eventual (later-tick) rejection, whatever fires it, already has a handler by construction; it can never surface as unhandled, regardless of timing. This is the identical guarantee T-037's checker verdict already re-derived for `raceDeadline`'s own `Promise.race`; the reasoning transfers exactly because the shape is the same (`Promise.race([call, timeout])` there too).

## Ordinary Mode A work

**Verify commands, re-run myself in the bound root (git status clean before/during/after, HEAD never moved):**
```
$ pnpm -C packages/engine test    -> 623/623 (was 620, +3). Matches manifest.
$ pnpm -C packages/providers test -> 54/54, unchanged. Matches manifest.
$ pnpm -r typecheck                -> clean, 9/10 scoped workspace projects (apps/web excluded per convention). Matches manifest.
```
Ran the engine suite twice more (3 total) — clean 623/623 every time in the bound root.

**Independent falsification** (throwaway `git archive 1c1b5e6` copy in the scratchpad, `pnpm install --offline --filter @vc/providers... --filter @vc/engine...`; bound root's `git status` confirmed clean before/during/after; scratchpad deleted after use):

**Lever A** — removed the single line `controller.abort();` from the timeout's `setTimeout` callback (`concern-classifier.ts`):
- GREEN baseline first (isolated file run, to avoid conflating with the unrelated full-suite flake logged below): 16/16.
- RED after the edit: 14 pass / 2 fail, exact assertion text matching the manifest —
  `AssertionError [ERR_ASSERTION]: the signal must be aborted once the timeout has fired / false !== true`
  and
  `AssertionError [ERR_ASSERTION]: the stub server must observe the connection actually close — the request was really cancelled, not merely abandoned client-side`.
  The third new test (late-rejection/unhandled-rejection) stayed green, exactly as the manifest disclosed and reasoned (with no `controller.abort()`, `AsyncAbortingProvider`'s `"abort"` listener never fires, so its rejection never fires either — same as `HangingProvider`, nothing to leak).
- Reverted (restored from a pre-edit backup), diffed byte-identical against the pristine copy, re-ran GREEN (16/16).

**Lever B** — removed `this.observedSignal = request.signal;` from `SignalRecordingHangingProvider` (a test-fixture edit, not a source edit):
- GREEN baseline reconfirmed: 16/16.
- RED after the edit: 15 pass / 1 fail — `AssertionError [ERR_ASSERTION]: the provider must have been handed a signal`. Only the one test whose whole point is that assertion goes red; proves the assertion is load-bearing against the fixture's own correctness, not vacuous.
- Reverted, diffed byte-identical, re-ran GREEN (16/16).

Both levers reproduce the manifest's claimed falsification exactly (same pass/fail counts, same failing test names, same assertion text).

**Test 2's mechanism, confirmed directly:** `packages/engine/tests/concern-classifier.test.ts:213-220` creates a real `createServer((req, res) => { ...; req.on("close", () => { if (!res.writableEnded) closedAt = Date.now(); }); })` — the `close` event and `closedAt` variable are both set inside the server's own request handler, not inferred client-side. This is genuinely server-observed cancellation, matching the brief's ask.

**Scrutiny of the maker's own disclosure on Lever A (test 3 staying green under the falsifying edit):** I judge this sound, not weaker than it looks. Test 3's whole claim is "a late rejection after an abort never becomes an unhandled rejection or misreads the outcome" — it is fundamentally a claim about what happens *after* an abort fires. With the abort mechanism removed, the premise (an abort fires) is false, so the fixture correctly produces no signal, no late rejection, and nothing to check — the test doesn't silently pass a wrong claim, it has nothing to assert against, which is the honest, disclosed limit of this particular test's scope, not a hidden weakness. The two tests that DO redden under Lever A are exactly the two whose claims are actually being exercised by the edit (aborts the signal; cancels the real socket). I agree with the maker's framing.

**ISS-t-037-3 orthogonality claim — verified, not accepted on the manifest's word:** `concernClassifierProviderConfig` (`concern-classifier.ts:181-187`) explicitly strips `models` and `maxAttempts` from a litellm-shaped `ProviderConfig` before handing it to `createProvider`. Read `createProvider` (`packages/providers/src/index.ts:977-1004`) directly: it only constructs a `FailoverProvider` `if (parsed.models && parsed.models.length > 0)` — with `models` always absent for the classifier's config, `createProvider` can only ever return a bare `LiteLlmProvider` (or Mock/Rules/Gemini) for this call site, never a `FailoverProvider`. The claim holds structurally, not just today by absence of a caller.

**Diff scope, secrets, protected paths:**
- `git diff d02168f 1c1b5e6 --name-only` → exactly `packages/engine/src/guards/concern-classifier.ts` and `packages/engine/tests/concern-classifier.test.ts`. Nothing else.
- `git diff d02168f 1c1b5e6 -- qa/contracts docs/DECISIONS.md ARCHITECTURE.md .claude qa/issues.jsonl` → empty. All untouched.
- `git diff d02168f 1c1b5e6 -- pnpm-lock.yaml` → empty. Lockfile genuinely unchanged, confirming the manifest's `pnpm install` disclosure didn't touch resolution.
- Grepped the diff for key-shaped strings (`sk-[a-z0-9]`, `api[_-]?key`, `secret`) — the only hit (`sk-SYNTHETIC-DO-NOT-LEAK`) is inside a **pre-existing, unchanged** test (`ThrowingProvider`, line 91, part of T-012's original file, not this diff's added lines) and is explicitly a synthetic non-secret the test asserts is never leaked.
- All new network activity is real `node:http` servers bound to `127.0.0.1` (`stub.listen(0, "127.0.0.1", ...)`). No external calls.
- No test passes by being skipped — `git diff` shows 0 deletions from the test file's existing tests, only additions.
- `apps/web` untouched (`git diff --name-only | grep apps/web` → empty), confirming the `Persona walk: TRUE (backend-only)` claim.

## An open gap I found myself, not disclosed by the maker: test 2's timing margin is fragile under real load

Running the SAME falsification copy's **full** `packages/engine` suite (not the isolated single-file run used for Levers A/B above) failed the real-HTTP-cancellation test 3 times in a row, on the identical, unmodified, pristine code:
```
✖ T-041 (ISS-t-037-2): a real in-flight LiteLLM HTTP request is actually cancelled ...
  AssertionError [ERR_ASSERTION]: the stub must have received the request before the timeout fires
```
— note this is a *different* assertion than either falsification lever's failure; it means the outbound `fetch` never even reached the stub server within the 50ms window, before any abort logic is exercised at all. Run in isolation (`npx tsx --test tests/concern-classifier.test.ts`, no other test files competing for the event loop), the same test passed cleanly 3/3. The bound worktree's own full-suite run passed cleanly for me twice — this is genuinely load-dependent, not deterministic, most likely `tsx --test tests/*.test.ts` running multiple test files' event loops concurrently (default Node test-runner concurrency, 20 CPUs available) causing occasional scheduling delay past the 50ms margin under contention (this machine visibly runs many concurrent agent sessions/worktrees per the temp-directory listing). This is a genuine CI-flakiness risk on a crisis-adjacent test, distinct from the ~5s wall-clock cost the maker did disclose. Not a correctness regression (the mechanism itself is proven independently via test 1, which never touches the network and is not time-sensitive), so it does not block PASS, but it is real and undisclosed. Logged as an issue below.

## Judgment on the disclosed open gaps

- **~5s wall-clock cost** — accepted, same cost profile as T-037's equivalent test, no cheaper way to keep the server-observed assertion.
- **No observability on a timed-out classification** — I agree with the maker's own framing that this is arguably the more important gap on a crisis-adjacent path than the socket leak this unit fixes. The failure mode itself is safe (fail-open: `escalationDecision` still escalates a guard-flagged turn on `classifier_unavailable` regardless of *why* it's unavailable), but an operator has zero signal that the classifier tier is timing out systematically — which could mask a real capacity/latency problem (e.g. a misconfigured `VC_CONCERN_MODEL` deployment, or the classifier's endpoint being down) for an arbitrarily long time, silently degrading every guard-flagged turn to fail-open escalation without anyone ever finding out why. Logging this as an open issue, not blocking this unit (it was correctly out of named scope, and correctly disclosed rather than filed unilaterally per this project's maker-checker discipline).
- **ISS-t-037-3 orthogonality** — verified true, see above; correctly not re-litigated.

## Issues logged this cycle (qa/issues.jsonl)
- `ISS-t-037-2` — flipped to **fixed**. Regression check: `pnpm -C packages/engine test` (623/623, was 620), `pnpm -C packages/providers test` (54/54, unchanged), `pnpm -r typecheck` (9/9 clean).
- `ISS-t-041-1` (low-medium, open, new) — the real-HTTP cancellation test's 50ms margin flakes under full-suite concurrent load (reproduced 3/3 in an isolated throwaway copy; passes 3/3 in single-file isolation).
- `ISS-t-041-2` (medium, open, new) — no engineering alert/metric on a timed-out concern classification; silent-to-observability fail-open on a crisis-adjacent path, disclosed by the maker as an open gap and elevated to a tracked issue.

Neither new issue blocks this unit's PASS: neither is a regression introduced by T-041, both are the kind of gap this project's discipline asks the checker (not the maker) to file as a ledger row rather than leaving only in manifest/verdict prose.

## Summary
The central safety claim holds under independent, from-scratch scrutiny: an aborted/cancelled concern classification cannot read as "no concern found" — it can only ever resolve to the pre-existing `unavailable`/`timeout` annotation, exactly as before this unit, because the abort mechanism only ever rejects (never resolves) and the timeout's own rejection is structurally guaranteed to win the race. `escalationDecision`'s guard-crisis branch never reads the classifier at all, unchanged. The late-rejection/unhandled-rejection guarantee is real, reproduced, and independently re-derived from `Promise.race`'s handler-attachment semantics. Both falsification levers reproduce exactly as claimed. Diff scope is exactly the two named files, lockfile unchanged, no secrets, no protected paths touched. One real, previously-undisclosed gap found (test 2's tight timing margin flakes under concurrent load) — logged, non-blocking.

VERDICT: PASS
SCOREBOARD: engine 623/623 (was 620, +3), providers 54/54 unchanged, typecheck 9/9 clean. 2 capability-coverage levers reproduced exactly (2/2).
FAILURES: none
CAPABILITY-COVERAGE: 2/2 falsification levers reproduced (Lever A: 2 of 3 new tests redden on the named assertions; Lever B: 1 fixture-shortcut test reddens); the third new test's claim (unchanged timeout outcome) is additionally covered by the pre-existing, untouched T-012 hung-provider test, unaffected by either lever.
LIVE-BROWSER: not-applicable (changed paths: packages/engine/src/guards/concern-classifier.ts, packages/engine/tests/concern-classifier.test.ts — no apps/web surface, persona walk TRUE/backend-only confirmed against the diff)
ISSUES-WRITTEN: ISS-t-037-2 (fixed); ISS-t-041-1 (new, low-medium, open, test fragility under load); ISS-t-041-2 (new, medium, open, no observability on classifier timeout)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The safety property this unit turns on — that cancelling an abandoned classification can never read as a benign/no-concern result — is independently re-derived and holds: the abort mechanism only ever rejects, the timeout's own rejection is synchronously guaranteed to win the Promise.race, and escalationDecision's crisis branch never reads the classifier argument at all (verified from the diff and the code, not assumed). Both falsification levers reproduce exactly as claimed, in an isolated copy, worktree never touched. Verify commands reproduce exactly (623/623, 54/54, 9/9). Diff scope, lockfile, secrets and protected paths all check out clean. One real gap the maker did not disclose was found independently — the real-HTTP test's 50ms margin flakes under concurrent full-suite load (reproduced 3/3) though never in isolation (3/3) — logged as non-blocking. The maker's own disclosed observability gap is judged the more operationally important of the two disclosed gaps and elevated to a tracked issue.
