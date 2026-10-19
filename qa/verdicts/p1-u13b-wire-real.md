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

---

# Cycle 1 (repair re-check)
**Verdict:** PASS
**Cycle checked:** 1
**Head checked:** 42c6f5f (code df77893; `git diff df77893 -- packages apps` is empty at the head). Providers code is byte-identical to cycle 0 (`git diff 8f5395b 42c6f5f -- packages/providers` empty).
Metrics: start=2026-10-19T11:49:24+05:30 end=2026-10-19T12:16:00+05:30 suite_runs=3 mutations=15 cycle=1 policy=proportional-verification/2026-10-18.15 lane=normal

## Why PASS (read first)
Both cycle-0 blockers are closed by outcome, not by construction: a 30-case synthetic set with 0 violations reports NOT PROVEN and the word "PASS" appears nowhere in its markdown or JSON (B1); a probe with internal sources and no passage text makes 0 requests, is excluded and counted, and the recorded /ask answer token never appears in any request body (B2). G1 and the labels hold, including the hostile variants below. C1-C7 and the ISS-270..274 fixes still hold. The residual gap (bare-array `--experts` declares no source) is the one the manifest names; it is not a regression.

## Reruns on the bound head 42c6f5f (all through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP on D:; maker evidence not reused)
- `pnpm -C packages/providers test` -> tests 149, pass 149, fail 0, exit 0.
- `pnpm -C packages/engine exec tsx --test evals/real-bodies.test.ts evals/p1-runners.test.ts evals/budget.test.ts` -> tests 89, pass 89, fail 0, exit 0 (6 more than cycle 0: the repair tests).
- `pnpm -r typecheck` -> exit 0.
Output: qa/evidence/p1-u13b-wire/check/runs-c1.txt. No network or paid call (mocked fetch only; no key used).

## Hostile and outcome checks (own probe file, run in an isolated copy so the bound tree stays unedited: qa/evidence/p1-u13b-wire/check/zz-chk-r1.test.ts.txt; output hostile-c1.txt, 4 of 4 pass)
- B1: 30 synthetic cases, honest model, 30 requests, 0 violations -> verdict NOT PROVEN, realBarMet false, no "PASS" substring in markdown or JSON. The same set declared `recorded` with `--anonymised` can PASS (maker test, falsified below).
- B2: 30 synthetic cases with internal sources and no `text` -> 0 requests, 0 ledger charges, `excluded` 30, scored total 0, NOT PROVEN, report line "30 probe(s) excluded: no passage text". With `text` present: 30 requests, the token `LEAKTOKEN-RECORDED-ANSWER` (the recorded answer) is absent from every raw request body and the passage text is present. Blank/whitespace text is excluded (maker test); a probe with no internal sources is still sent with an empty list.
- G1 matrix, `source: "recorded"` without `--anonymised`: run-kb, run-latency, run-h2h (--fixture), run-h2h (--experts `{source:"recorded"}`), run-probes (--cases) each throw `... is source "recorded" ... Refusing` with 0 ledger lines and 0 requests. Mixed case `"Recorded"`: --fixture and --cases are rejected by the schema enum (`source: Invalid enum value`), and an `{source:"Recorded"}` --experts file by the union schema, so no mixed-case bypass; the error text is a schema error, not the G1 message. Bare-array `--experts`: the run completes (declared gap, a bare array cannot declare a source), noted, not a failure.
- Labels: kb markdown has "rewrite-fidelity (not Hit@3)" and no plain "A2b Hindi/Hinglish hit@3" row; latency markdown has "(model-hop only)" and JSON `verdictScope` "model-hop only"; the A8 banner and `firstTokenBasis` still state first-token = full time (delayed-mock test, 60 ms, first-token p50 >= 55).
- Charge-before-send: for run-kb, run-latency, run-h2h and run-probes the ledger already held >= N charges when the Nth request reached fetch. The bodies contain no `fetch`, `process.env` or mongo reference (grep). Gemini selected (unset and "gemini") -> `RealNotWiredError` for all four, 0 ledger, 0 requests; run-live refuses under Ollama.
- Provider fixes through `prepareOllamaProvider` (probe provider-env-probe-c1.ts.txt): price `1e-300,4` and `0.009,4` refused; whitespace key refused; `OLLAMA_MAX_OUTPUT_TOKENS` abc / 0 / -5 / 1.5 refused; 512 accepted. ISS-273 stall, ISS-270 Devanagari bytes and ISS-272 header trim are the existing named tests, falsified below.

## Falsification (isolated copy D:/vc/.worktrees/p1-u13b-chk-fals1, detached at 42c6f5f; restored with `git checkout -- packages` after each run; script fals-c1.py.txt, output fals-c1.txt). Baselines green first: engine 20/20 (real-bodies + my probe file), providers ollama 19/19.
| id | crit | edit | result |
|---|---|---|---|
| C3 | C3 | `clearTimeout(timer)` right after fetch | providers 1 fail of 19 (ISS-273 stall test) |
| C4 | C4 | env tokens ignored | providers 1 fail of 19 |
| C5 | C5 | price floor 0 | providers 3 fail of 19 |
| C6 | C6 | no `.trim()` on the key in the constructor | providers 1 fail of 19 |
| C7 | C7 | UTF-16 `.length` for the input estimate | providers 1 fail of 19 |
| B1 | C1 | provenance cap removed | engine 2 fail of 20 (maker B1 test and mine) |
| B2a | C1 | passage text = recorded answer | engine 3 fail of 20 |
| B2b | C1 | exclusion removed | engine 3 fail of 20 |
| G1a | C2 | guard never throws | engine 2 fail of 20 |
| G1b | C2 | --experts guard removed | engine 2 fail of 20 |
| G1c | C2 | --cases guard removed | engine 2 fail of 20 |
| L1 | C1 | A2b label dropped | engine 2 fail of 20 |
| L2 | C1 | model-hop label dropped | engine 2 fail of 20 |
| H1 | C1 | charge hook replaced by a no-op | engine 7 fail of 20 |
| W1 | C2 | pre-run "Gemini -> not wired" check removed | engine 2 fail of 20 |
15 of 15 killed, 0 survivors. (My first falsification run was invalid: the harness ran from the wrong directory and the edits were not tested; it was discarded and rerun from the copy, and the table above is the rerun.)

## PROPOSED-ISSUE lines (cycle 1; the cycle-0 lines for B1/B2 are fixed, and the cycle-0 latency-test and empty-golden lows are fixed or redundant-guard)
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="run-h2h --experts as a bare array declares no source, so the G1 recorded-input guard cannot check it" evidence="ExpertsFileSchema bare-array branch transforms to source synthetic; checker run: bare-array experts completes under --real" note="declared gap in the manifest; require the {source, experts} form under --real, or an explicit --anonymised for any experts file"
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="G1 refusal for a mixed-case 'Recorded' source is a raw schema error, not the G1 message" evidence="kb MIX / probes MIX / h2h MIX in hostile-c1.txt: schema enum error (h2h shows a long invalid_union dump)" note="safe (refused before any ledger or request); only the message is unhelpful"
PROPOSED-ISSUE: severity=low area=evals unit=p1-u13b-wire-real title="Cycle-0 reviewer lows L1 (Devanagari combining-mark split in run-kb words()) and L3 (A14 blinding leaks via fixed texts) remain open" evidence="manifest 'Not changed'; review result lows" note="candidates for a later unit; not in the brief"

## Not determinable here
Real Ollama behaviour (ids, prices, whether `num_predict` is honoured, whether a stalled body surfaces as AbortError under undici): every test uses a mocked fetch. The first paid run still needs Umesh's per-run go and real model ids/prices (ISS-277).

## Environment
No OOM. One run at a time on the shared lock. Scratch: D:/vc/.worktrees/p1-u13b-chk-fals1 (detached 42c6f5f; only the untracked zz-chk-r1.test.ts), D:/tmp/u13bw-r1chk (logs).
