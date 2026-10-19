# /checker verdict - p1-lk1 (tier M, single checker)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.16 (the .17 rules applied at dispatch: runner filter plus parallel flag for non-Python 6c; one full run on the 6c wall, no rerun needed)
VERDICT: PASS
CHECKED-STATE: head 5310e8f on p1/lk1 (code identical to 27fdb9e: `git diff --stat 27fdb9e 5310e8f` touches only qa/manifests/p1-lk1.md), base ae48596. Checked in a detached copy D:/vc/.worktrees/chk-lk1 (installed offline, frozen lockfile). The bound tree D:/vc/.worktrees/lk1 was never mutated (`git status` clean before the verdict files).
CHECK-PLAN: outcome proof through loadTextChainConfig -> createProvider -> generate with a mocked fetch, in a checker-authored file (qa/evidence/p1-lk1-check/chk-lk1-outcome.test.ts.txt, 52 tests) written from the criteria and the source, not from the builder's assertions; hostile variants; 18 mutants in the copy (at least one per criterion); integration onto fresh origin/main (fetched, d05e9d1) with the full suite.
SCOREBOARD: C1 PASS, C2 PASS, C3 PASS, C4 PASS, C5 PASS, C6 PASS, C7 PASS, C8 PASS. Checker file 52/52 green; providers package at head 232/232 (52 checker + 180 builder-listed files); integration full suite green; 18/18 mutants killed.

## Evidence
Providers (checker file + ollama, failover, litellm, index, rules, live), via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C D:/vc/.worktrees/chk-lk1/packages/providers exec tsx --test ...`, TMP/TEMP on D: -> tests 232, pass 232, fail 0 (qa/evidence/p1-lk1-check/providers-232-run.txt). That re-executes the builder's 180 at identical code (27fdb9e == 5310e8f), so Pre-check[C1..C8] is reused only after identity validation and my own run agrees (232 - 52 = 180).
Outcome, per criterion (mocked fetch, config from env strings, only createProvider/generate called):
- C1: timeout (signal-honouring hang and a stalled response BODY), 500, 502, 503, 429, network throw, non-JSON body, 200 empty body, 200 `{}`, 200 empty content, content not JSON, wrong-shape (schema), `[]`, `null` each reach hop 2: wire order [glm, deepseek], deepseek's answer returned, no exhaustion alert, hop 2 sent to the same URL with the Bearer key and its own model id.
- C2: HTTP 400, 401, 403, 404, 405, 408, 413, 418, 422 on hop 1 surface as OllamaHttpError with that status, one request, no alert; hop 1 500 then hop 2 401 surfaces the 401 (not AiUnavailable); a preflight refusal surfaces with zero requests; caller abort mid-flight (on hop 1, and on hop 2 after a hop-1 outage) surfaces OllamaAbortedError; a pre-aborted signal sends nothing.
- C3: both hops 500/429 -> exactly [glm, deepseek], AiUnavailableError, one alert with attempts 2 and kind "ollama"; a one-hop chain sends once; a three-hop chain with a duplicate model sends exactly 3 in order; no inter-hop wait (two 500s in under 300 ms).
- C4: deadline 150 ms over 5000 ms hop timeouts -> AiUnavailableError in about 170 ms, lastErrorName FailoverDeadlineExceededError, the in-flight signal aborted, hop 2 never started; a hop that IGNORES the abort signal is still cut at the deadline; hop 1 times out at its own 60 ms and hop 2 gets the remainder and answers inside the 400 ms deadline; hop 2 is cut by the overall 100 ms deadline though its own timeout is 60 ms; loaded defaults 12000 / 8000.
- C5: a budget stop (beforeRequest throws) on hop 1 sends nothing and surfaces; on hop 2, after a hop-1 outage, it surfaces the budget error and hop 2 is not sent; every hop is charged exactly once, in order, before its request (estimate has positive cost and output bound).
- C6: onUsage fires per answering hop: hop 1 (200 with garbage content, 11/7 tokens) -> reported 11/7; hop 2 with prompt_eval_count -1 -> unreported with no tokens or usd; 1,000,000/1,000,000 -> usd 5 (table 1/4); no call for a 5xx; a throwing hook never discards the answer or re-sends; no hook configured works.
- C7: failover.test.ts, litellm.test.ts, index.test.ts, live.test.ts, rules.test.ts are byte-identical to base (`git diff --stat ae48596 5310e8f` lists only index.ts, ollama.test.ts and the manifest) and green inside the 232. Mutant C7 (singlePass default on) fails 4 of them, so they do guard the unchanged LiteLLM behaviour. Shared code touched: `isRetryableProviderError`, `emitFailoverAlert` (kind, defaults to "litellm"), the FailoverProvider ctor (singlePass, default off).
- C8: `gemini:` refused in any position, case or spacing (not ignored); ` ollama:a , ollama:b `, empty items, leading and trailing commas load in order; duplicates kept; `DEFAULT` / ` default ` select glm then deepseek; `ollama:deepseek-v4.1-flash:1017` is priced from its base id and sent with the full id; `,,,`, `openai:x`, `litellm:x`, `ollama:`, `OLLAMA:x`, `default,ollama:x`, an unpriced model are each refused; missing or blank OLLAMA_API_KEY refused; deadline/hop values 0, -5, 1.5, abc, empty, 1e3, 12000ms refused, messages never echo the key; VC_LLM_PROVIDER=ollama is refused by loadProviderConfig, VC_LLM_PROVIDER=mock plus VC_TEXT_CHAIN still gives mock from loadProviderConfig, and `loadTextChainConfig(env) ?? loadProviderConfig(env)` picks the chain only when VC_TEXT_CHAIN is set; String / inspect(showHidden) / JSON.stringify of the provider and of the AiUnavailableError never contain the key; OLLAMA_BASE_URL (trailing slash trimmed) and OLLAMA_MAX_OUTPUT_TOKENS reach the wire.

Integration (fresh `git fetch origin`, origin/main d05e9d1; worktree D:/vc/.worktrees/int-lk1, branch int/lk1, `git merge --no-ff p1/lk1`, clean, no conflicts; HEAD ca670e2adbedb46f44e12b8e127dee04aa09e02c, parents d05e9d1 and 5310e8f), one lock hold with TMP/TEMP on D: (wall 2026-10-19T18:07:50 to 18:13:34):
- `pnpm install --offline --frozen-lockfile` exit 0
- `python contracts/verify_contracts.py` exit 0 ("no frozen contracts yet (research phase) -- PASS by vacuity")
- `pnpm -r typecheck` exit 0
- `pnpm -r --workspace-concurrency=1 test` exit 0, 0 failures; node:test totals in run order: 59, 98, 284, 180 (providers), 12, 72, 1644 (1599 pass, 45 skipped, 0 fail), 355, 44 (qa/evidence/p1-lk1-check/int-test-counts.txt)
- `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` -> `6c-green: 5ac5ae2029b85914b532213a1d70aeea85d6db56` (qa/.6c-green left uncommitted in int-lk1)

## Falsification (mutants in the detached copy chk-lk1, each reverted; qa/evidence/p1-lk1-check/mutants-run.txt, script mutants.py.txt)
Each mutant ran the checker file plus ollama.test.ts (C7 also failover, litellm, index). Killed means at least one test failed.
| mutant | criterion | failing tests |
|---|---|---|
| Ollama timeout/network/malformed non-retryable | C1 | 16 (incl. 7 checker C1 cases) |
| malformed only non-retryable | C1 | 9 |
| every OllamaHttpError retryable | C2 | 15 (9 status cases, C2b, builder C2) |
| singlePass false | C3 | 4 |
| deadline replaced by 10 min | C4 | 4 |
| unknown errors (budget stop) retryable | C5 | 5 |
| beforeRequest not wired to hops | C5 | 4 |
| onUsage not wired | C6 | 3 |
| onUsage wired to hop 1 only | C6 | 3 |
| singlePass default on | C7 | 4 existing failover/litellm/index tests |
| gemini not refused | C8 | 2 |
| default order flipped | C8 | 2 |
| VC_LLM_PROVIDER=ollama selects the chain | C8 | 2 |
| entries not trimmed, empties kept | C8 | 2 |
| hop timeout ignored | C1/C4 | 4 |
| caller abort retryable | C2 | 4 |
| exhaustion alert still names litellm | C8 | 1 |
| unknown price replaced by a fixed price | C8 | 2 |

18 mutants, 18 killed. Process notes: the first mutant driver used the WSL bash and ran nothing (exit 1, no counts), discarded and redone; one later mutant run hit the 30 min driver timeout while queued on the shared lock (source restored in a `finally`, `git status` clean afterwards); the remaining rows were rerun inside one lock hold. One of my own first-draft checker tests (a signal-ignoring fetch with a 40 ms hop timeout expecting hop 2) failed against the code by design, because the hop timeout works by aborting the signal; it was recast as C4b (deadline backstop) and is not a product defect (real fetch honours abort).

## Findings and notes (none block)
- Out of scope, recorded not failed: student-surface wiring in apps/api (builder open risk 1: `apps/api/src/index.ts` builds one provider with `createProvider(loadProviderConfig(env))` shared by tenant, anonymous route and chat, which also reaches the scribe). It becomes a follow-up unit with a provider split. Until then nothing in apps/ or packages/engine reads VC_TEXT_CHAIN, so the chain is inert in production.
- Latent hazard, confirmed at `packages/engine/src/guards/concern-classifier.ts:181`: `concernClassifierProviderConfig` returns `{ ...base, model }` for any non-litellm base, so an ollama chain config passed to it would keep `chain` and silently ignore the swapped model. Unreachable today (loadProviderConfig never returns ollama, proven above). Proposed ledger row for the owner, not written (qa/issues.jsonl on p1/lk1 lacks rows ISS-357..365, so an append here would conflict at end of file on merge): severity low, area engine/guards, "concernClassifierProviderConfig must refuse or collapse an ollama chain base before the LK wiring unit".
- The per-hop timeout works by aborting the request signal. A fetch that ignores its signal (a mock; undici does not) never times out at hop level, and then the 12 s product deadline cuts the whole call and hop 2 is not tried. Documented behaviour (C4b), not a defect with real fetch.
- Timeouts are total per hop, not first token (LK2). With defaults 8 s / 12 s a GLM answer slower than 8 s is cut and DeepSeek gets at most the remaining 4 s. Defaults are the builder's reading of the design's "suggest 12 s"; LK9 decides any retune.
- No real Ollama call and no model call by the checker (mocked fetch only; `git fetch` only for the base). The processor-register flag, per-hop failover counters and the `senior-software-engineer` lifecycle review were not part of this unit; the review is the owner's to dispatch.
ISSUES-WRITTEN: none
Metrics: start=2026-10-19T16:29:43+05:30 end=2026-10-19T18:16:41+05:30 cycle=0 mutants=18 tests=52 policy=proportional-verification/2026-10-19.16
