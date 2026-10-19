# Verdict: p1-greal-bold
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** S. One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16 (the manifest's pin)
**Base:** origin/main c1027c9 **Head checked:** 8ab1141 (code 7c50ed5; 8ab1141 adds only the manifest)
Metrics: start=2026-10-19T14:57:50+05:30 end=2026-10-19T15:01:55+05:30 suite_runs=0 mutations=1 cycle=0 policy=proportional-verification/2026-10-19.16 lane=normal

## Plan
Read the code diff (`git diff c1027c9 7c50ed5`, budget.ts one regex plus comment, budget.test.ts two tests). Prove the outcome against the REAL `qa/gates/g-real.md` taken from origin/main (`git show origin/main:qa/gates/g-real.md`), in a detached copy outside the bound tree (D:/vc/.tmp/greal-check, budget.ts copied from 7c50ed5), TMP/TEMP on D:.

## Outcome (qa/evidence/p1-greal-bold/check/probe-run.txt, 0 MISMATCH)
- C1: the real g-real.md (bold `**Answered:** 2026-10-19T10:41:00+05:30 - (a) ...` line, plus the `Answer format` line quoting `Answered: <ISO>` in backticks) is ACCEPTED with LF and with CRLF. `Answered: x`, `**Answered**: x`, `**Answered:**<TAB>x` accepted (LF and CRLF).
- C2: the same real file with the Answered line removed is REFUSED (LF, CRLF). Hostile variants, each swapped in for the real Answered line, all REFUSED with GRealRefusedError (LF and CRLF): label then only whitespace; `**Answered:**` then nothing / then spaces; bold or plain label with content on the NEXT line; `Answered:` only inside backticks mid-line; the verbatim `Answer format` line; `Not Answered:`; `**Not Answered:**`; `> Answered:`; `> **Answered:**`; `**Answered:` (unclosed); `Answered` and `**Answered**` with no colon; indented `  Answered:`; `Status Answered:`; lowercase `answered:`; `Answered** :`; empty file; env flag unset; gate file missing.
- Judged (reported, not required): `***Answered:*** x` is REFUSED (triple star is not a listed form); `- Answered: x` (list item) is REFUSED. Both fail closed, the safe direction.
- Builder test file rerun via the lock: `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh pnpm -C packages/engine exec tsx --test evals/budget.test.ts` -> tests 24, pass 24, fail 0 (matches the manifest; budget-test.txt).

## Falsification (copy only; the bound tree p1/greal-bold was never edited)
| id | crit | edit | result |
|---|---|---|---|
| M1 | C1 | regex reverted to the old `/^Answered:[ \t]*\S/m` | real g-real.md REFUSED (LF, CRLF), `**Answered**:` and `**Answered:**<TAB>` refused: 6 mismatches, exactly the bold cases; every refuse case unchanged; killed (mutant-old-regex-run.txt) |
The manifest's own M2 (drop the line-start anchor) was not re-run; the outcome probe covers it independently: the real file's `Answer format` line is refused because the anchor holds.

## Findings
None blocking. Disclosed by the manifest: the gate still only needs some qualifying line, it does not parse the option letter or ISO instant; the first real run after merge is the live check.

## Environment
No OOM or environmental failure. Probe copy lives in D:/vc/.tmp (untracked, not committed).
