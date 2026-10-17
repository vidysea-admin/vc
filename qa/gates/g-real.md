# HUMAN_GATE: G-REAL (paid, real-model evaluation runs, with a budget cap)
**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; plan v8 U0/U4/U13b, spec A24, D-088 Q18, contract B24.9)
**Status:** OPEN

**Question:** may P1 spend money on real-model and real-audio evaluation runs, and under what cap? The runs are
`run-h2h` (A14, with the REAL parts of A1/A3), `run-probes` (A4), `run-latency` (A8), `run-live` (A10 voice) and
`eval:kb --real` (A2b). They use synthetic or anonymised inputs only (B13); no production student text is involved.

**Proposed cap (D-088 Q18, [ASSUMPTION, adjustable]):** USD 50 per run and USD 200 per month. Every REAL runner
hard-stops and reports when a run would pass USD 50, or when the month's recorded spend would pass USD 200. Spend is
recorded per run (spec A24, mock-tested in `tests/budget-cap.test.ts`).

**Options:**
- **(a) Approve the caps as proposed (USD 50 per run, USD 200 per month),** with a per-run go from Umesh before each
  paid run starts.
- **(b) Approve different caps** (name them).
- **(c) Per-use approval only,** no standing cap; each run asks first.
- **(d) No paid runs yet.** REAL criteria stay NOT PROVEN, and text P1 cannot be called done (contract B24.9).

**Blocks:** every REAL run and therefore unit U13b (A2b, A4 probes, A8, A10, A14). It does not block U0-U13a (mock and
frozen-fixture work).
**Per-use rule:** an approval here is a cap, not a blank cheque: each paid run is still started only on a go from Umesh.
**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option> - <caps>` here.
