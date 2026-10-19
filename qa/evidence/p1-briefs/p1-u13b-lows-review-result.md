# U13b evals-lows review (senior-software-engineer, fc34f5a) — Warning, no Block
- medium: dataset.ts parseGoldenFile JSON.parse(line) ~:88 — a UTF-8 BOM golden is refused as "invalid JSON" (fail-closed, misleading). Fix: strip /^\uFEFF/ first + dataset-level header tests (BOM/CRLF/blank-first-line). -> ISS-330
- Confirmed: refusals before ledger/network; h2h withholding leaks no VC side (withheldQuestionIds only in operator-side report); ProvenanceSchema mock-mode unchanged; \p{M} tokenizer correct.
- Test gaps: no dataset-level header unit tests; header-only --real refusal untested (low).
- Checks: real-bodies 20/20; dataset+kb+runners+h2h 87/87; tsc clean.
