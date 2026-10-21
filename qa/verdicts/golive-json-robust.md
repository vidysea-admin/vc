# Verdict: golive-json-robust (Mode A, cycle 0)

Cycle checked: 0
Bound root: D:/vc/.worktrees/golive-json-robust (branch wave/golive-json-robust, HEAD f6727fd, base 5305e82 = merge-base with main)
Policy-Version: proportional-verification/2026-10-19.17
Date: 2026-10-21 (checker: claude-sonnet-subagent, fresh context, no builder reasoning)

## Check plan (step 0)
Logic changed on a shared provider module on the safety path (tier M). Routed checks: affected tests (2 touched files + typecheck), 1 falsification per criterion (C1, C2, C3) in a copy outside the worktree, diff-scope read (4c), plus the dispatch's safety focus as adversarial probes (deterministic only, no live calls, no security-review/browser/persona routing: no auth/UI/data-write surface). No live re-run: the maker's `live:` line is not re-measured (see notes).

## Diff scope (4c)
`git diff 5305e82...HEAD --stat`: 5 files = the 2 src files, the 2 test files, the manifest; all listed in the manifest's Touched line. Removed lines: only `JSON.parse(content)` -> `parseModelJson(content)`, `const call = ...; ZodParse(await race)` -> `attempt()` closure with the same arguments (skillName, skillPrompt, outputSchema, input, signal, preflight unchanged), and one array literal gaining "LiteLlmMalformedResponseError". No export, function, test or config removed. apps/api and mcp/ untouched.

## Criteria (all evidenced by my own runs)
- [C1] fence / unquoted-key parse in LiteLlmProvider: `pnpm -C packages/providers exec tsx --test tests/litellm.test.ts` -> tests 19, pass 19, fail 0. Neighbours `tests/*.test.ts` in packages/providers: 188/188. `pnpm -C packages/providers typecheck` exit 0. MET.
- [C2] one bounded retry on LiteLlmMalformedResponseError, then fail closed: `pnpm -C packages/engine exec tsx --test tests/concern-classifier.test.ts` -> tests 27, pass 27, fail 0. `pnpm -C packages/engine typecheck` (3 tsc projects) exit 0. Plus my own end-to-end probes through the REAL LiteLlmProvider against a stub HTTP server (see Safety focus). MET.
- [C3] errorName recorded: malformed-twice test asserts `errorName: "LiteLlmMalformedResponseError"`; safetyScreen carries it into `basis: "unavailable"`. MET.

## Falsification floor (copy at scratchpad/chk, outside the worktree; green-before in the copy first)
- C1: `parsed = parseModelJson(content)` -> `JSON.parse(content)`. Before: 6/6 `golive-json-robust` tests green. After: 5 red (fence, bare fence, unquoted, in-string-colon, repaired-schema), garbage control stays green. Fired assertions are the named ones. Restored (cmp identical).
- C2: `if (!(first instanceof ... Malformed)) throw first;` -> `throw first;` (no retry). Before 4/4 green; after 3 red (retry-once, bounded-twice, safetyScreen). Restored.
- C3: drop "LiteLlmMalformedResponseError" from the errorName whitelist. Before 4/4 green; after 2 red (errorName falls to "Error" in the twice-malformed and safetyScreen tests). Restored.

## Safety focus (answers to the dispatch questions; probe file: qa/evidence/golive-json-robust/checker-probe.test.ts.txt, 23/23 green)
1. Garbage becoming a schema object? No. 12 hostile bodies (prose before fence, trailing junk after fence or bare, double fence, single quotes, unquoted values, truncated, empty fence, trailing comma, line comment, two concatenated objects, refusal prose) each produce exactly 2 HTTP calls and `{possible, unavailable, LiteLlmMalformedResponseError}`, never clear. Fence stripping is anchored (`^` and `$`), so trailing junk fails the strict JSON.parse. The caller's `.strict()` Zod schema (severity enum, boolean, non-empty rationale) still judges every parse.
2. Key-quoting changing string values? No: the split on `"(?:[^"\\]|\\.)*"` leaves odd segments untouched; escaped quotes with `, key:` inside a value survive (probe). Regex cost is linear (400 KB adversarial inputs: 27-30 ms).
3. Retry bounded to exactly one? Yes: garbage,garbage,valid -> 2 calls, unavailable (third never sent). Non-Malformed errors are not retried (builder test, HTTP error = 1 call). Shared deadline: slow malformed (150 ms) then hang with timeoutMs 300 -> unavailable/timeout at 314 ms, 2 calls. External abort during the 2nd attempt rethrows ProviderAuthorizationRefusedError (not swallowed), 2 calls. Abort fired before the 2nd attempt: the timeout leg of the race has already rejected with the refusal, so it rejects (the second generate is invoked at most with an aborted signal, which LiteLlmProvider.generate refuses before opening a socket, index.ts:611-614). `preflight` is forwarded on both attempts.
4. Other paths fail closed and valid JSON is unchanged: valid `none` still -> clear, valid `critical` -> possible; plain JSON takes the unchanged first `JSON.parse`; fenced valid JSON now parses in 1 call (no retry).
5. One residual, non-blocking (low): a reply that mixes a quoted and an unquoted copy of the same key with different values, e.g. `{"severity":"critical",...,severity:"none"}`, previously threw (fail closed) and now repairs to last-wins `none` -> `clear`. Pure-JSON duplicate keys (`"severity":"critical",...,"severity":"none"`) already did the same on base (probe prints `clear` for both), so this adds no new class of risk beyond a model contradicting itself; it needs the model to emit both. PROPOSED low ledger row: reject duplicate keys in parseModelJson output (the ambiguous reply should fail closed). Not a FAIL: no criterion names it and the base already had the behaviour.

## Notes (non-blocking, not FAILs)
- Manifest bookkeeping gaps vs pin .17: `tick.mjs --lint-manifest` reports `ERROR no-pre-check`, `ERROR no-test-selection`, `ERROR live-before-fake`, `WARN no-round-line`; the manifest also has no single `Metrics:` line and its Pre-check/Tests lines are untagged and carry no sha. Product evidence is complete and was re-run by me, so I judged on evidence, but the maker should amend the manifest lines (bookkeeping only, no product change) before close-out so the lint is clean.
- The manifest's live result (0/6 unavailable, 3/6 non-plain replies handled by the parser) was not re-run by me (deterministic-only dispatch). It is the maker's claim, n=6 is small, and the 25% base rate is the screen-verify agent's figure; nothing in this verdict depends on it.
- Deviation from the brief (regex applied only outside string literals) is an improvement and is proven by a test.

VERDICT: PASS
SCOREBOARD: 3/3 criteria met, 0/0 invariants
TIER: M (shared provider module on the safety path, packages/providers/src/index.ts parseModelJson used by every LiteLlmProvider.generate caller; no L trigger: no auth/data-write/concurrency/config change)
FAILURES: none
CAPABILITY-COVERAGE: 3/3 rows reproduced (C1, C2, C3)
LIVE-BROWSER: not-applicable (no UI paths changed)
ISSUES-WRITTEN: none (PROPOSED low: duplicate-key rejection in parseModelJson, see Safety focus 5)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Fence strip and bounded unquoted-key repair add acceptance only for syntactically valid JSON that the strict Zod schema then judges; every hostile body I tried still failed closed after exactly two calls and the retry respects the shared deadline and abort signal. All three criteria were re-run and falsified in a copy with the asserting tests being the named ones.
Metrics: start=2026-10-21T15:57:21+05:30 end=2026-10-21T16:02:30+05:30 wall_min=7 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=450 mutants=0 defects_unit=0 defects_6c=0
