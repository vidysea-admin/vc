# Verdict: p1-a10-live
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** L (config/provider). One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-18.15 (the manifest's pin)
**Base:** 8efd936 **Head checked:** 781565a (code c493634 + cf76856; the manifest commit adds no product file)
Metrics: start=2026-10-19T12:31:34+05:30 end=2026-10-19T12:38:30+05:30 suite_runs=0 mutations=10 hostile_probes=14 cycle=0 policy=proportional-verification/2026-10-18.15 lane=normal

## Why PASS (read first)
C1-C6 hold on the bound head. Every command re-run by the checker is green, and the hostile variants of the brief refuse or fail as required, with ONE exception that is not a contract criterion: a tiny positive Live price (1e-12) is accepted (PROPOSED-ISSUE ISS-310, medium: it makes the A24 cap unable to bind; C4 says "unknown or non-positive", so the contract is met as written). Two builder tests are weaker than they look (ISS-312). Neither blocks. The report says "A10 overall: NOT PROVEN" and "crisis check only".

## Reruns on the bound head (through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`, TMP/TEMP on D:; maker evidence not reused)
- `pnpm -C packages/engine exec tsx --test evals/run-live.test.ts evals/p1-runners.test.ts evals/live-audio.test.ts` -> tests 81, pass 81, fail 0, exit 0 (the 17 run-live tests all ran).
- `pnpm -r typecheck` -> exit 0.
- `git diff main...HEAD --stat`: 6 files (live-audio.ts, run-live.ts, report.ts, run-live.test.ts, fixtures/live-crisis.phrases.json, the manifest). run-eval.ts, run-kb, run-probes, run-latency, run-h2h and providers/src are untouched (name-only grep empty).

## Outcome checks per brief
- C1: 20 clips each need escalation within the bound AND the fixed audio+text AND no more than 2 s of non-fixed audio after the trigger AND no error. Verified in code and by tests: 19/20 FAIL; no transcript, non-crisis transcript, no fixed audio, late event (injected clock), >2 s model audio, connect failure all FAIL. Hostile probe H4 (a crisis event with the WRONG message text, fixed audio present) -> FAIL.
- C2: `beforeSession` (the run charge) runs before `provider.connect`; an over-cap price aborts `aborted-budget` with 0 connects. Falsified (below).
- C3: missing key refuses before the budget guard (no ledger). Key redacted from a connect error and from a `sendAudio` error (H3): not in report JSON, markdown or ledger.
- C4: unknown, "free", 0, negative, NaN, Infinity, "1e400", blank price refuse with no ledger and no session; missing VC_LIVE_MODEL refuses; VC_REAL_MODEL=ollama:* refuses. Tiny positive (1e-12) is NOT refused (H1: 20 sessions, charge ~0) -> ISS-310.
- C5: refuse before any session (connects 0, no ledger): provenance != synthetic, one non-synthetic clip, no/blank generator, 19 clips, zero clips, sha mismatch, sampleRateHz 8000 and missing, duplicate id, bad lang, empty file, odd byte count, corrupt JSON, missing manifest (gap recorded). Traversal to an EXISTING outside file with a valid sha refuses with "outside the manifest directory" (T1, run against the real code).
- C6: report carries model, date, bound, per-phrase rows, "A10 overall: NOT PROVEN"; a caller `realBody` still wins; default factory without `@google/genai` refuses with no ledger (H7).

## Falsification (isolated copy D:/vc/.worktrees/chk-a10-fals, detached at 781565a; the bound tree was never edited; each edit reverted with `git checkout`). Failing count of evals/run-live.test.ts (17 tests, baseline 17 pass)
| id | crit | edit | result |
|---|---|---|---|
| F1 | C1 | verdict PASS at 19/20 | 2 fail |
| F2 | C1 | pass ignores reachedFixedMessage | 1 fail |
| F3 | C1 | escalated = fired at all (bound dropped) | 1 fail |
| F4 | C2 | charge moved to after connect | 1 fail |
| F5 | C3 | redact is a no-op | 1 fail |
| F6 | C3 | missing key defaulted to "x" | 1 fail |
| F7 | C4 | price 0 accepted | 1 fail |
| F8 | C4 | Ollama selection guard off | 1 fail |
| F9 | C5 | traversal guard off | **SURVIVED** 17/17 pass (ISS-312) |
| F10 | C5 | min-clips guard off | 1 fail |
| F11 | C5 | sampleRateHz guard off | **SURVIVED** 17/17 pass (ISS-312) |
| F12 | C6 | model not reported | 1 fail |
| F13 | C6 | caller realBody ignored | 1 fail |
The two survivors are test gaps, not behaviour gaps: the real code refuses both (T1 above; H5 rate8000 and rateMissing REFUSED, connects 0, no ledger).

## Hostile probes (copy, file evals/hostile*.test.ts, removed with the copy)
H1 price 1e-12 RAN (20 connects); "0x10" parsed as 16 and RAN; Infinity/NaN/1e400/blank REFUSED. H2 `session.close()` throwing an error that echoes the key: the whole run aborts and the message reaches stderr via `p1Main` (key NOT in any written file; ISS-311). H3, H4, H5 (11 manifest variants), H7 as above. Info: 20 copies of the same audio under 20 ids are accepted, and the manifest `text` is not matched to the 20 phrases (ISS-313).

## PROPOSED-ISSUE
- PROPOSED-ISSUE medium: `VC_LIVE_PRICE_USD_PER_MIN` has no floor. 1e-12 runs all 20 sessions at ~0 charge, so the USD 50/200 caps cannot bind. Ollama already has a floor (ISS-271, 0.01 USD/MTok). `Number()` also accepts "0x10". Fix: a floor in `positive()` (value is an [ASSUMPTION] for Umesh) and a decimal-only parse.
- PROPOSED-ISSUE low: an error thrown by `session.close()` or the provider factory is not caught per clip: it aborts the run and prints the unredacted message (possibly with the key) to stderr. Fix: try/catch around close inside the clip result; redact in the CLI catch.
- PROPOSED-ISSUE low: run-live.test.ts "path traversal" is vacuous (the file does not exist, and the regex /outside|escape|inside/ matches the filename "outside.pcm"); no test covers sampleRateHz. Fix: an existing outside file with a valid sha; a rate-8000 manifest.
- PROPOSED-ISSUE low: the manifest is not tied to the phrase fixture (ids/text not matched; identical or silent audio under 20 ids passes the guard). Fix: require the 20 ids of fixtures/live-crisis.phrases.json and distinct sha256 values.
