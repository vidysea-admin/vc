# s13-checker-final-3

Independent re-check of fix round C after the S13 final checker FAILED (qa/verdicts/s13-checker-final.md). You did not write these fixes.
C1: packages/engine/src/student/graph.ts promisesOutcome (~:782), deobfuscate (~:754), collapseSpelledOut (~:768), SPELLED_OUT_RUN (~:749), new 100-percent pattern (~:729); tests packages/engine/tests/student-graph.test.ts:1730-1775 (CRLF, contains a stray NUL; use grep -a).
C2: apps/api/src/voice.ts readoutOutputSeen (~:640, reset ~:975/:1019, set ~:1176/:1184, used in turn_complete ~:1193); test apps/api/tests/voice-history.test.ts:516.
Prove OUTCOMES with your own hostile variants, not construction:
- C1: write your own promise list of >= 30 obfuscations (spaced, dotted, hyphenated, soft hyphen, word joiner, ZWJ, small caps, fullwidth, Cyrillic/Greek look-alikes, Hinglish pakka/guarantee, Devanagari, 100%/100 percent) and >= 30 neutral/negated sentences, incl. normal prose with initials ("A. P. J. Abdul Kalam", "U S A visa process", "I T I courses", "B.Tech at I I T"), lists "a, b, c", grades "A B C". Report false negatives AND false positives. Linear-time check at 20k/100k chars. Does deobfuscation ever alter the text shown to the student (it must only affect matching)?
- C2: confirm a bare earlier turn_complete no longer arms; the real readout still arms; the existing early-yes and S12 tests still pass; no path leaves readoutOutputSeen stuck true/false across readouts (repeat readout, cancel, new extraction, reconnect).
Run under scripts/vc-testlock.sh: engine student-graph + claims-guard, api voice-history/voice-wiring/voice-audit/partner-voice, tsc --noEmit engine and api.
Return VERDICT: PASS | FAIL with file:line evidence, counts and any defects (severity).
