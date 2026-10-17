# HUMAN_GATE: G-PROD (go-live: real students, the public anonymous route, voice)
**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; plan v8 U0, spec A20, contract B13 and B24.9)
**Status:** OPEN

**Question:** may the P1 student surface be exposed to real students in production? The go-live script (spec A20,
delivered in U5a) refuses to enable the voice flag, the public anonymous route or partner publication until all of
these are on disk in `qa/gates/`:
1. `B13-signed:` signed in `p1-u0-amendment-signatures.md` (minors' text and voice to Gemini, the KB's LLM provider and
   Tavily, with the processor register filled in).
2. For voice only: a passing A10 report (real Gemini Live, synthetic audio, 20-phrase crisis set, 2 s bound) in
   `qa/evidence/`.
3. `g-publish.md` answered.
4. A recorded Nights mode in `nights.md` (`funded` or `tele-manas-disclosed`).

**Decisions Umesh records here with the go (not asserted by the contract):**
- Whether minors are served **before counsel clears DPDP** (crisis proposal, decision 2), and whether the Q3 DPDP legal
  review (contract non-goals) must be complete before a Pathlynks-supplied profile reaches VC.
- Who owns the clinical-safety policy (crisis proposal, decision 3).
- Tele-MANAS 14416 test-call for adolescents and Hindi/Hinglish coverage done (unverified today).
- Whether authenticated-student exposure, the public anonymous route and voice go live together or one at a time.

**Options:** (a) go live for authenticated text first; (b) go live for text and anonymous mode; (c) all three including
voice (needs item 2); (d) hold.
**Blocks:** real-user exposure, the public anonymous route and the voice flag. It does not block building or testing.
**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option> - <decisions above>` here.
