# Verdict: p1-u13b-ollama-adapter
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** L (config/provider seam). One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-18.15 (the manifest's pin)
**Base:** main 08b23f0 **Head checked:** b52550f (code 9bc857b; the manifest commit adds no product file)
Metrics: start=2026-10-19T10:59:54+05:30 end=2026-10-19T11:17:00+05:30 suite_runs=0 mutations=6 cycle=0 policy=proportional-verification/2026-10-18.15 lane=normal

## Plan
Read the diff (providers/src/index.ts, engine/evals/run-eval.ts, both test files) against C1-C5; rerun the three pinned commands through vc-testlock.sh myself (maker evidence not reused); one falsification per criterion in an isolated copy; hostile-variant probe through the real runner entry with mocked fetch; no network, no paid call, no full suite (not a security / prod-write L unit).

## Reruns on the bound head b52550f (all through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP on D:)
- `pnpm -C packages/providers test` -> tests 143, pass 143, fail 0, exit 0.
- `pnpm -C packages/engine exec tsx --test evals/p1-runners.test.ts evals/budget.test.ts` -> tests 73, pass 73, fail 0, exit 0.
- `pnpm -r typecheck` -> exit 0 (9 workspace projects).
Same counts as the manifest's Pre-checks. Output: qa/evidence/p1-u13b/check/base-run.txt.

## Outcome checks per brief
- Default unchanged: `prepareOllamaProvider` returns `undefined` for unset / empty / "gemini" (also " gemini", "gemini " after trim); `runRealPath` then calls `realBody(run, undefined)`, so the body path is identical to main. Probe H3: `" gemini"` -> completed, 0 requests; the "default unchanged" test passes for all five runners.
- Refusals before any ledger write or request (probe through `runKb`, mocked fetch, asserting ledger file absent and 0 requests): VC_G_REAL unset (GRealRefusedError, H1); missing OLLAMA_API_KEY ("" refused, H4); unknown price ("ollama:mystery-model", "ollama:GLM-5.3-flash", ":cloud" suffix, "constructor", "__proto__", "toString" all refused, H3); junk VC_REAL_MODEL ("OLLAMA:...", "Ollama:...", "Gemini", "GEMINI", "ollama:", "ollama:  " refused, H3). Case variants are refused, never silently routed to a default.
- Hostile OLLAMA_PRICE_USD_PER_MTOK, all refused with ledger absent and 0 requests: "0,0" "0,1" "1,0" "-1,-1" "NaN,1" "1,NaN" "Infinity,1" "1,-Infinity" "  ,  " "," "1e999,1" "0x0,1" "0,0,0" "free" (H2). Trailing/leading space in VC_REAL_MODEL is trimmed and runs on the named model (H3), which is the intended behaviour.
- Budget: the 50 per-run and 200 per-month cap tests (5 runners + month test) pass; the hook charges `run.charge(estimatedCostUsd)` before `fetch`, a BudgetExceededError is rethrown unchanged from the "pre" phase and the run ends `aborted-budget` with the third request never sent.
- Key never visible: provider key is a `#private` field; JSON/String/inspect clean; error messages for HTTP 500 and network failure, the ledger and the reports contain no key (H5, key-not-in-files assertion in the runner tests).
- No network: providers and engine tests use an injected `fetchImpl`; I made no network or paid call.

## Falsification (isolated copy D:/vc/.worktrees/p1-u13b-chk-fals, detached at b52550f, `pnpm install --offline`; the bound tree was never edited). Each edit was reverted with `git checkout -- .` after its run.
| id | crit | edit | providers ollama.test.ts (13) | engine p1-runners.test.ts (51) |
|---|---|---|---|---|
| F1 | C1 | request URL `/api/chat` -> `/api/generate` | 3 fail | 5 fail (one per runner) |
| F2 | C2 | `runRealPath` passes `undefined` instead of the Ollama provider | 0 fail | 10 fail (select + cap test per runner) |
| F3 | C3 | price override accepts 0 / negative (positivity check dropped in `resolveOllamaPrice`) | 1 fail | 0 fail (the constructor guard still refuses; caught at the provider layer) |
| F3b | C3 | engine hook charges estimate / 100 (under-count) | 0 fail | 6 fail (5 per-run cap + month cap) |
| F4 | C4 | first try appended the env key to the HTTP error text: SURVIVED, but invalid (the test env never sets process.env.OLLAMA_API_KEY, the key is private to the provider) | 0 | 0 |
| F4b | C4 | the provider's own `#apiKey` appended to OllamaNetworkError message | 1 fail | 0 fail |
| F5 | C5 | HTTP `res.ok` check removed | 1 fail | 0 fail |
All six valid edits killed, 0 survivors. F4 was replaced by F4b, not counted. Output: qa/evidence/p1-u13b/check/fals-run.txt (the F4 pattern-count abort line is the first attempt's pattern matching two classes). The hostile probe file is saved as qa/evidence/p1-u13b/check/hostile-probe.test.ts.txt (7 tests, pass 7; it asserts the must-hold refusals and prints the recorded behaviours).

## Findings (not blocking; PROPOSED-ISSUE lines for the maker/orchestrator to put in the ledger)
PROPOSED-ISSUE: severity=low area=budget unit=p1-u13b-ollama-adapter title="Ollama cost estimate is called an upper bound but counts one token per UTF-16 char; Devanagari/Hinglish text can exceed that" evidence="probe H7: 1060 chars, 2780 UTF-8 bytes, estimatedInputTokens 1069" note="input side only, output side (2048 x output price) dominates at the placeholder prices; use UTF-8 byte length for a true bound, or reword the comment"
PROPOSED-ISSUE: severity=low area=budget unit=p1-u13b-ollama-adapter title="OLLAMA_PRICE_USD_PER_MTOK accepts a positive but vanishing price (1e-300,1e-300), which charges 0.00 USD per run" evidence="probe H6: run completed, month spend 0" note="add a sanity floor (e.g. >= 0.01 USD per MTok) so an operator typo cannot disable the cap"
PROPOSED-ISSUE: severity=low area=config unit=p1-u13b-ollama-adapter title="A whitespace-only OLLAMA_API_KEY is accepted and a request goes out" evidence="probe H4: key '   ' -> 1 request; '' is refused" note="trim before the presence check"
Not determinable here (carried from the manifest, true): real Ollama model ids and prices are [ASSUMPTION - UNVERIFIED] placeholders (USD 1 in / 4 out per MTok) and must be set before the first paid run; whether `options.num_predict` is honoured by Ollama cloud is untested (mocked fetch only), and the cap's output term depends on it; the runners' REAL bodies are still not wired (RealNotWiredError), so no paid run is possible from this unit alone. Each paid run still needs its own go from Umesh.

## Environment
C: free-space or OOM problems: none seen. One run at a time on the shared lock (slot 0 each time). Copies left in place: D:/vc/.worktrees/p1-u13b-chk-fals (detached b52550f, clean apart from the untracked probe file packages/engine/evals/zz-chk-probe.test.ts).
