# Verdict: p1-u13b-wire-real
**Verdict:** FAIL
**Cycle checked:** 0
**Tier:** L (config/provider seam). One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-18.15 (the manifest's pin)
**Base:** main f7160b8 **Head checked:** 515020d (code 8f5395b; the manifest commit adds no product file)
Metrics: start=2026-10-19T11:32:06+05:30 end=2026-10-19T11:38:00+05:30 suite_runs=0 mutations=11 cycle=0 policy=proportional-verification/2026-10-18.15 lane=normal

## Why FAIL (read first)
C1-C7 as written are all met and every command is green. The verdict is FAIL because the brief's scoring-honesty check does not hold for A4: a paid A4 run can print a proof word the evidence cannot support (B1), and the shipped probe set is mis-scored by the real body (B2). Both would be spent on Umesh's per-run go. They are small repairs in `run-probes.ts` / `probes.ts`; no criterion changes. The orchestrator reports a parallel review with the same two mediums.

## Reruns on the bound head 515020d (all through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP on D:; maker evidence not reused)
- `pnpm -C packages/providers test` -> tests 149, pass 149, fail 0, exit 0 (ollama.test.ts including the 6 ISS-270..274 tests, each listed passing).
- `pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts` -> tests 83, pass 83, fail 0, exit 0 (the 10 real-bodies tests all ran).
- `pnpm -r typecheck` -> exit 0.
Output: qa/evidence/p1-u13b-wire/check/runs.txt. The full engine suite was not rerun (Part 2 skipped by the orchestrator).

## Outcome checks per brief
- Charge-before-send / no other path to fetch: the four bodies contain no `fetch`, no mongo, no `process.env`; every model call is `provider.generate`. `runRealPath` builds the provider as `makeOllama(estimate => run.charge(estimate.estimatedCostUsd))`, so each request is charged first. Falsified: a no-op hook fails 5 of 10 tests (C1e).
- Gemini selected -> `RealNotWiredError` before any ledger line or request, for all four runners, unset and "gemini"; `run-live` untouched and refuses under Ollama. Falsified (C2): removing the pre-run wiring check fails the "default unchanged" test.
- ISS-273: the `try/finally` now spans `res.json()`. Falsified (C3): `clearTimeout(timer)` before `res.json()` fails the stalled-body test.
- ISS-274: `resolveOllamaMaxOutputTokens` feeds both `num_predict` and the cost bound; junk/0/negative refused before any run. Falsified (C4): not passing the value to the provider fails 1.
- ISS-271: floor 0.01 USD/MTok in the constructor and the env parser (1e-300 and 0.009 refused). Falsified (C5): floor 0.005 fails 1.
- ISS-272: key trimmed in the constructor and in `prepareOllamaProvider`; whitespace-only refused. Falsified (C6): dropping the env-path trim fails 1.
- ISS-270: `Buffer.byteLength` for prompt and input. Falsified (C7): `userContent.length` fails 1.
- Scoring honesty: the A14 tally is `NOT PROVEN` without ratings (test, and `a1Met/a3Met: false`); placeholder experts are flagged in the report and JSON (`expertsSource`); an `--experts` file missing a question refuses before any spend; an A4 servable-but-uncited reply is recorded as `answered-without-source` plus `unservable-answered`, not a refusal; the A8 banner and `firstTokenBasis` state first-token = full time. Probe with a 300 ms delayed mock: first-token p95 316.8 ms, full p95 316.8 ms (equal, as stated).
- No production/student data: default paths are the `*.sample.*` synthetic fixtures; no DB import in any body.

## Falsification (isolated copy D:/vc/.worktrees/p1-u13b-chk-fals, detached at 8f5395b; the bound tree was never edited). Each edit was reverted with `git checkout -- packages` after its run. Script: qa/evidence/p1-u13b-wire/check/fals.sh.txt
| id | crit | edit | result |
|---|---|---|---|
| C3 | C3 | `clearTimeout(timer)` before `res.json()` | providers 1 fail of 19 |
| C4 | C4 | env value not passed to the provider | providers 1 fail of 19 |
| C5 | C5 | floor constant 0.005 | providers 1 fail of 19 |
| C6 | C6 | no `.trim()` on the env key | providers 1 fail of 19 |
| C7 | C7 | input estimate uses `.length` for the user content | providers 1 fail of 19 |
| C1a | C1 | run-probes counts model-invented node ids as cited | engine 1 fail of 10 |
| C1b | C1 | run-kb rewrite match threshold 0 (always nearest) | engine 1 fail of 10 |
| C1c | C1 | run-latency calls `firstToken()` BEFORE the model call (fabricated tiny first-token) | **SURVIVED**, 10/10 pass |
| C1d | C1 | run-h2h ignores the supplied `--experts` | engine 2 fail of 10 |
| C1e | C1 | charge hook replaced by a no-op | engine 5 fail of 10 |
| C2 | C2 | pre-run "Gemini -> not wired" check removed | engine 1 fail of 10 |
10 killed, 1 survivor (C1c, PROPOSED-ISSUE 3). The shipped code is right there (delayed-mock probe above); only the test does not pin it. Probe file: qa/evidence/p1-u13b-wire/check/zz-chk-u13bw.test.ts.txt.

## Blocking findings
B1 (medium, A4 proof integrity). `scoreProbes` (probes.ts:129) sets `realBarMet = violations.length === 0 && total >= PROBE_REAL_BAR` and ignores `set.source`. The REAL body runs the default `probes.sample.json` (source `synthetic`, exactly 30 cases), so a real run with no violations prints `**PASS**` for A4 on synthetic data; the banner only says "Probe source: `synthetic`". The spec bar is 0 training-data or web answers in 30 REAL probes. A paid run must not be able to print PASS from synthetic probes (cap at NOT PROVEN unless `source` is `recorded`, or refuse a synthetic set under `--real`).
B2 (medium, A4 meaning). `realProbesBody` builds each passage text from `c.ask.answer`, the recorded answer text, not a KB passage. In the shipped sample 23 of 30 probes are `expectServed=false` with recorded internal sources and a non-empty answer, so the model is shown the answer as an authoritative passage and an honest model serves them. My run with a mock that cites whenever a passage exists printed `served 24 / refused 6 / **FAIL**`. A paid run would spend money and report a FAIL that measures the fixture, not the model. It needs real passage bodies in the probe set (the manifest names this gap) or a refusal to run `--real` on a set without them.

## PROPOSED-ISSUE lines
PROPOSED-ISSUE: severity=medium area=evals unit=p1-u13b-wire-real title="A4 --real can print PASS on the synthetic 30-probe sample (realBarMet ignores probe source)" evidence="probes.ts:129 realBarMet = no violations && total >= 30; run-probes passes set.source only to the banner" note="cap verdict at NOT PROVEN unless source is 'recorded', or refuse --real on a synthetic set"
PROPOSED-ISSUE: severity=medium area=evals unit=p1-u13b-wire-real title="run-probes REAL uses the recorded answer text as the passage text; the shipped sample has 23 expectServed=false probes with a non-empty recorded answer, so an honest model fails them" evidence="mock honest model on probes.sample.json: served 24 refused 6 FAIL; run-probes.ts realProbesBody passages map" note="probe set needs passage bodies (U3), or --real must refuse a set without them"
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="real-bodies latency test uses an instant mock, so moving firstToken() before the model call survives" evidence="falsification C1c: 10/10 pass; delayed-mock probe shows the shipped code is correct" note="use a delayed fetch (e.g. 50 ms) and assert firstToken.p50 >= delay"
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="run-h2h REAL writes placeholder expert text into pairs and judge sheets; only the report says it is a placeholder" evidence="realH2hBody placeholder text in h2h-pairs.json; the sheets are what judges read" note="the text is visibly labelled; consider refusing sheet output when no --experts"
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="run-latency indexes golden[i % golden.length] with no empty-set guard" evidence="run-latency.ts realLatencyBody loop" note="an empty golden set would throw a TypeError inside the budget run; refuse before the run starts"

## Not determinable here
Real Ollama behaviour (ids, prices, `num_predict`, whether a stalled body really surfaces as AbortError under undici): every test uses a mocked fetch; no network or paid call was made. Part 2 (close-out, integration, 6c, stamp) was not run, by the orchestrator's instruction.

## Environment
C: 87% used, no OOM seen. One run at a time on the shared lock. Scratch left: D:/vc/.worktrees/p1-u13b-chk-fals (detached 8f5395b, clean apart from the earlier untracked zz-chk-probe.test.ts), D:/tmp/u13bw-chk (logs).
