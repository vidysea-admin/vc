# s13-checker-final-4

Independent re-check of fix round C3 (you wrote none of it). Prior verdict: qa/verdicts/s13-checker-final-3.md (WARNING).
C3a: packages/engine/src/student/graph.ts INDEFINITE_NEG_CLAUSE / WARNING_SENTENCE / CALLED_SCAM_AFTER / inWarningContext (~:740-762) and its use in promisesOutcome (~:810); tests appended at the end of packages/engine/tests/student-graph.test.ts (CRLF, stray NUL: grep -a).
C3b: apps/api/src/voice.ts assistantTurnOpen / readoutEarlierTurnOpen (~:641-645), dispatch sites (~:975, ~:1021), output handlers (~:1176-1186), turn_complete (~:1198-1204), new case "interrupted" (~:1224); tests in apps/api/tests/voice-history.test.ts before "frame-time memory checks".
Prove outcomes with YOUR OWN hostile variants:
- C3a: can a real promise now slip through by adding a warning word? e.g. "No scam: admission guaranteed", "Avoid stress, admission guaranteed", "Beware: this offer guarantees admission", "Nobody else can, but I guarantee your visa", "Anyone can apply and admission is guaranteed", "It is a scam to doubt it - admission guaranteed", Hinglish ("koi bhi nahi rok sakta, admission pakka"). List false negatives AND remaining false positives. Linear time at 20k chars (new regexes: check for backtracking).
- C3b: replay your cycle-3 scratch repro (earlier output after dispatch + its turn_complete + yes) and confirm it no longer decides; the real readout still arms; interrupted closes the earlier turn; check no stuck state (assistantTurnOpen/readoutEarlierTurnOpen across repeat readout, confirm, new extraction, error/close). Assess the fail-closed edge (merged turns => disarmed until repeat readout): is the student ever stuck?
Run under scripts/vc-testlock.sh: engine student-graph + claims-guard; api voice-history/voice-wiring/voice-audit/partner-voice; tsc --noEmit engine and api.
Return VERDICT: PASS | WARNING | FAIL with file:line, counts, severities. PASS/WARNING with nothing above low means shippable.
