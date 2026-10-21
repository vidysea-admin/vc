# Verdict — p1-grounding-hardening (cycle 2, last)
Cycle checked: 2
Bound to: D:/vc/.worktrees/p1-grounding-hardening, branch wave/p1-grounding-hardening, head d0810f0 (code 8e748a8), repair base 1bfd97f. Policy-Version: proportional-verification/2026-10-19.17 (pinned). Dual check: no.
Checked: 2026-10-22T03:45:04+05:30 to 03:51:00+05:30. Cycle-0 verdict kept at qa/verdicts/p1-grounding-hardening.r0-1.md, cycle-1 verdict (FAIL H1) renamed to qa/verdicts/p1-grounding-hardening.r1-1.md.
Evidence: qa/evidence/p1-grounding-hardening-check-c2/ (probe sources as .txt, logs, falsification scripts). Proofs ran in copies under D:/tmp-chk/c2 (git archive of d0810f0, node_modules symlinked); the bound tree was used only for the pre-check re-runs and stayed clean apart from the untracked brief files.

## Check plan (step 0)
TIER: L (privacy: outbound redaction in lang.ts redactStudentDetails). Checks: diff-scope read of 1bfd97f..8e748a8, pre-check re-run one file at a time under vc-testlock, tsc, outcome proof with hostile variants the builder did not test (real runStudentTurn graph with MockGroundedAnswerer, and redactStudentDetails directly), a ReDoS/perf probe of the new regex, falsification in copies. Mode D: Not UI-touching (diff paths are packages/engine/src/student/lang.ts and two engine test files). No live LLM or Gemini call.

## Diff scope (4c) 1bfd97f..8e748a8
3 files, +109/-6: packages/engine/src/student/lang.ts (redactStudentDetails only: INTRO_ANY_CASE_RE gains `naam\s*[:=–-]`, the age-after-name regex gains `\(?`, PIN_CITY_RE and NOT_A_PLACE are replaced by PIN_QUANTITY_BEFORE / PIN_QUANTITY_AFTER / PIN_TOKEN_RE), tests/lang.test.ts, tests/student-graph.test.ts. `git diff 1bfd97f 8e748a8 | grep -ciE "crisisGuard|CRISIS_MESSAGE|14416|Tele-MANAS"` = 0: crisisGuard, LK10 wording, the D-110 Tele-MANAS rule and graph.ts (H3 outage behaviour) are untouched. The H2-H7 inputs are untouched, so the cycle-1 PASS evidence for H2 H3 H4 H5 H6 H7 is reused; the lang/graph/lk5 re-runs below also cover the H4/H5 floor code in lang.ts.

## Re-run (my own runs, real exit codes, bound tree, each file alone under vc-testlock; logs in the evidence dir)
- packages/engine: lang.test 57 pass 0 fail (rc 0); student-graph 113 pass 0 fail (rc 0); lk5 65 pass 0 fail (rc 0).
- `npx tsc --noEmit` in packages/engine: rc 0, no output.
These match the manifest's Pre-check lines (lang 57/0).

## Outcome proof (H1)
Probe source chk-probe-c2.test.ts.txt, output probe-c2.log: 55 must-redact phrasings run both through redactStudentDetails directly and through the real graph wire (grounded call body of MockGroundedAnswerer), 20 quantity keep-cases both ways, plus the two headline phrasings on the anonymous path.
- Every cycle-1 failing phrasing is now clean on the wire and directly: "I'm riya sharma from pune 411001" -> `I'm [name] from pune [pin]`, "pin no 411001", "PIN No: 411001", "pin no. 411001", "pin no 560037", "PIN number 411001", "my pin number is 411001", "PIN code number is 560037", "the pin of my area is 411001", "pin code of my city is 411001", "pin (411001)", "Naam: Riya Sharma", "i am Riya Sharma (16)" (-> `i am [name] ([age])`).
- Other hostile variants the builder did not test, all redacted: "pincode-411001", "PIN:411001.", "my area code 411001", "411001 pune", "Pune-411001", "pune,411001", "Pune 411 001", "411 001 pune", "(411001)", "pin=411001", "Pin411001", "zip 411001", "postal code: 411001", "my address is Flat 4, Baner Road, Pune 411045", "Address: Fees Road, Pune 411001", "411001.", "it is 411001!", "560037 is my pincode", "my locality is 411001", "i live in 411001", "411001pune", "PIN" + newline + "411001", "PIN" + NBSP + "411001", "pin 411001 and phone 9876543210", "pin code 411001, 560037 marks" (PIN redacted, the marks number kept), "pin 411001, marks 560037", "Naam - riya", "Naam: riya", "NAAM: riya", "naam : riya sharma", "Naam – Riya Sharma (16)", "name: riya (16)", "i am riya (16)", "i am Riya Sharma, aged 16". Totals: 43 of 55 redacted; the 12 that survive are listed below, none is a cycle-1 phrasing and none is an ASCII 6-digit PIN written as one token with natural wording.
- Keep-cases (usefulness): 19 of 20 stay intact on the wire: "I scored 560037 marks", "fees ₹350000", "my fees ₹350000 per year", "Rs. 450000 is my budget", "Rs 450000", "rank 120345 in JEE", "my rank is 120345", "AIR 120345", "budget is 500000", "salary of 600000 per year", "350000 INR", "around 350000 per year", "120000 euros", "1,20,000 rupees", "120000.50", "loan of 2000000", "$250000 total cost", "total cost 350000", "scholarship 300000". Over-redacted: "i have 400000 in savings" -> `i have [pin] in savings` (a 6-digit amount with no currency marker, unit or listed noun right before or after it). This is the accepted privacy-first tradeoff the builder documented; noted, not a FAIL.
- Perf (chk-perf-c2.test.ts.txt, perf-c2.log): the variable-length lookbehind PIN_TOKEN_RE handles 40-60k-char adversarial strings ("1 " x20000, "rs " x20000, "411001 " x5000, 50k spaces then a PIN, "budget is " x5000) in 1-11 ms: no ReDoS.
- Surviving leaks (12 of 55; judgement below):
  1. Obfuscated or non-ASCII PIN formats: single spaced digits "4 1 1 0 0 1" (x3 phrasings), Devanagari digits "४११००१" (x3), hyphen split "411-001", the word form "pin is four one one zero zero one" (brief: note only).
  2. "I live in Pune, 411001 marks my area" keeps the PIN because a following "marks" is treated as a unit (contrived: needs the verb "marks"; the same exemption is what keeps "560037 marks").
  3. Names with no self-introduction cue: "riya sharma, age 16" (age redacted, bare name kept), "riya sharma, 16", and the Hinglish "naam riya sharma hai" without "mera" or a colon. Also "Naam-Riya" (no space).
  Judgement: H1 reads "Indian PIN code (6 digits)" and "person names in 'I am X / my name is X / main X hoon' forms"; its test strings are Latin-digit. The cycle-1 FAIL was that natural Latin phrasings around the PIN leaked because the rule was a list of exact connectors; that class is closed (any standalone ASCII 6-digit token is redacted unless the context marks a quantity). The leaks above need deliberate digit obfuscation, a non-Latin numeral script (the redactor is ASCII-digit throughout, as for phone, age and DOB), or a name with no introduction cue (outside the "self-introduced" wording). They are recorded as low ledger rows below and do not fail the criterion.

## Falsification (copies of d0810f0 under D:/tmp-chk/c2/fal, green before, red after, restored from `git show d0810f0:` and green again; bound tree untouched; logs fals.txt, fals2.txt)
- M1 lang.ts `t = t.replace(PIN_TOKEN_RE, "[pin]");` -> `t = t;`: lang "H1 F2" 3 pass -> 2 pass 1 fail ("a standalone 6-digit PIN is redacted ..."); student-graph "H1 F2" 1 pass -> 1 fail; restored 3/0 and 1/0.
- M2 PIN_QUANTITY_BEFORE alternation neutralised: lang 1 fail ("a 6-digit number marked as a quantity ... stays"), graph 1 fail; restored green.
- M3 `|naam\s*[:=–-]` removed: lang 1 fail ("H1 F2-G2/G3"), graph 1 fail; restored green.
- M4 `\(?` removed from the age-after-name regex: lang 1 fail ("H1 F2-G2/G3"), graph 1 fail; restored green.
(fals.txt holds the first M1-M4 attempt, whose sed-based M3/M4 edits did not apply cleanly and whose diff output is noise from a line-ending rewrite; M1 was re-verified as a single-line change, and M2-M4 were re-run with the exact-string mutate.js in fals2.txt, which prints MUTATION APPLIED.)

## Notes (non-blocking low ledger rows; none burns a cycle)
1. H1 obfuscated/non-ASCII PIN formats (Devanagari digits, "4 1 1 0 0 1", "411-001", word form) are not redacted. If Hindi-script input is common, add a numeral-normalising pass (Devanagari to ASCII, then strip single separators between digits) in redactStudentDetails; it would also cover phone, age and DOB.
2. H1 names without a cue: bare "riya sharma, age 16", "naam riya sharma hai", "Naam-Riya", "this is riya", "I go by Riya Sharma", "Riya here" keep the name (cycle-1 note 1, unchanged).
3. H1 over-redaction: a 6-digit amount with no marker ("i have 400000 in savings") becomes `[pin]` (accepted tradeoff); "I am Indian, do I need APS?" still loses "APS" (cycle-1 note 2).
4. H1 residuals from cycle 1 note 1 (school plus city, locality) are unchanged and not regressed.
5. F5 sentence-opener false positives and H4 floor gaps from cycle 1 are unchanged (no diff touches them).

VERDICT: PASS
SCOREBOARD: 7/7 criteria met (H1 H2 H3 H4 H5 H6 H7); H2-H7 PASS reused from cycle 1 (their inputs are byte-identical across 1bfd97f..8e748a8)
TIER: L (privacy: lang.ts redactStudentDetails)
FAILURES: none
CAPABILITY-COVERAGE: H1 reproduced in own copies through the real graph wire and directly; Mode D: Not UI-touching
ISSUES-WRITTEN: none (low rows proposed in Notes)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: the cycle-1 failure class (PIN wording-specific rules) is replaced by "redact every standalone 6-digit token unless the context marks a quantity", and it holds: all 12 cycle-1 failing phrasings and 31 further hostile Latin-digit variants are redacted on the wire, the quantity keep-cases survive (one over-redaction accepted as the privacy-first tradeoff), the regex is linear on adversarial input, and four falsifications go green, red, green. The remaining leaks require digit obfuscation, Devanagari numerals or an uncued bare name and are ledger rows, not criterion failures. crisisGuard, LK10 wording, H3 outage behaviour and the D-110 Tele-MANAS rule are not in the diff.
Metrics: start=2026-10-22T03:45:04+05:30 end=2026-10-22T03:51:00+05:30 wall_min=6 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=2 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=356 mutants=4 defects_unit=0 defects_6c=0
