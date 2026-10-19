# Verdict: p1-lk4
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** M (crisis text path plus one new engine module and two call sites; the manifest says L with dual check, the brief fixes a single checker under rule .8-3). Policy: proportional-verification/2026-10-19.16 (.17 6c rules apply)
**Base:** ae48596 **Head checked:** d057b13 (code 4d20c71; d057b13 adds only the manifest)
Metrics: start=2026-10-19T16:37:34+05:30 end=2026-10-19T17:27:00+05:30 wall_min=50 agent_min=unavailable blocked_min=35 suite_runs=0 repeat_runs=1 mutations=15 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 check_s=unavailable mutants=15 defects_unit=0 defects_6c=0 slow=shared-testlock-wait

mutant-cap-raise: 15 distinct falsifiers over 10 criteria (L1-L7, D1-D3 plus extra falsifiers on the D1 failure modes, the D2 allow-list, and byte identity), crisis-text path where the brief names one falsification per criterion and the failure modes are separate behaviours; policy .17-2

## Check plan
Language and crisis logic on the student path -> outcome probe through `runStudentTurn` (real graph, MockProvider, the real `createModelLanguageDetector` over the same provider so one call counter covers every model call), crisis in each script, hostile detector failures, hostile `VC_REPLY_LANGS`, byte comparison against the old graph.ts at ae48596 (imported as a copy), one falsifying edit per criterion in a detached copy `.worktrees/chk-lk4`, builder regression set rerun.

## Why PASS (read first)
Every criterion holds on the bound code under my own probe (`chk-lk4.test.ts`, 34 tests, 0 fail), and each criterion has a falsifying edit that turns a test red for the named reason. No blocking defect; non-blocking notes below.

## Outcome checks (own probe: qa/evidence/p1-lk4/check/chk-lk4.test.ts.txt; green run probe-green.txt: tests 34 pass 34 fail 0; baseline with the builder files: engine 149/0, api voice-crisis-turn 14/0)
- Ordinary turns through `runStudentTurn`, model path, offline path (no detector) and anonymous mode, as detectedLang/replyLang: English en/en; Devanagari hi/hi; Latin Hinglish hi-Latn/hi-Latn; Devanagari-majority mixed hi/hi; Tamil ta/en; Bengali bn/en. Uncovered scripts map to en. The offline path gives the same result for all six and makes zero detector calls.
- Crisis turns (English, Devanagari, Latin Hinglish x2, Devanagari+English mixed, Tamil-majority + English phrase, Bengali-majority + English phrase), authenticated and anonymous: state escalated, provider calls 0 (this includes `lang-detect`, same provider), message has 14416, the not-a-counsellor and no-counsellor-connected statements, the safe-adult question (authenticated), no CRISIS_FORBIDDEN_PATTERNS hit. Escalation `lang`: en, hi, hi-Latn, hi-Latn, hi, ta, bn; the escalated text is the original text. Latin Hinglish crisis is `hi-Latn`.
- Detector failure: a hung model returns at 1.4 to 2.0 s with the offline result (measured); a throwing provider, `{garbage}`, a non-JSON string, `lang:"x"` (too short), `lang:""`, `confidence:7` (out of range) are all fallbacks (reasons: 1 error, 5 invalid, 2 inconsistent, 1 timeout); `en` and `hi-Latn` answers for Devanagari text fall back to `hi`; `hi` for Latin text becomes `hi-Latn`. Through `runStudentTurn` (Devanagari) all five failure modes still answer the turn with detectedLang hi / replyLang hi. A detector that never resolves does not hold an ordinary graph turn longer than 2.1 s and the turn is answered (state ok, replyLang en).
- `VC_REPLY_LANGS` hostile: undefined, empty, spaces, tab/newline -> default en,hi,hi-Latn; "," -> en; unknown codes plus `__proto__`, `constructor`, `toString` -> en; duplicates collapse; case, spaces, `hi_IN`, `hinglish` normalise; `resolveReplyLang` with `__proto__`, `constructor`, empty, an empty allow-list, an allow-list of ["ta"] -> en. The graph with `replyLangs` = [], ["ta"], ["__proto__"], ["hi","hi"] is safe and answers.
- Byte identity: the eight fixed/crisis constants imported from ae48596's graph.ts equal the current exports byte for byte (Buffer.equals); `CRISIS_FORBIDDEN_PATTERNS` identical; `CRISIS_MESSAGES.en/hi` and `crisisMessageFor("ta")` equal the old messages; `fixedText("ta", ...)` is the English text.
- B24.7 / A11b: crisis-defaults.test.ts and student-graph.test.ts (builder files, unchanged) pass in the same run (engine 149 tests, 0 fail).

## Falsification (one per criterion, copy .worktrees/chk-lk4 of d057b13, edits by mutate.py.txt, restored after each; baseline green first; log falsification.txt)
| id | crit | edit | result |
|---|---|---|---|
| F-L1 | L1 | SCRIPT_DEFAULT_LANG devanagari "hi" -> "en" | 10 red (Devanagari fixtures, C5 escalation) |
| F-L2 | L2 | voice.ts back to the inline Devanagari regex | 1 red engine (C7 source check) + 1 red api (voice escalation language) |
| F-L3 | L3 | graph.ts escalation lang back to the old Devanagari test | 6 red (C5 escalation lang, Hinglish crisis probes) |
| F-L4 | L4 | `crisisMessageFor` stops routing hi-Latn to the hi entry | 2 red (catalog routing, graph catalog) |
| F-L5 | L5 | CRISIS_CORE loses "not a counsellor" | 10 red (A11b, C4 substring fixture, byte identity) |
| F-L6 | L6 | crisis node calls the model detector | 11 red (no-model-call, order, escalation) |
| F-L7 | L7 | " This stays confidential." appended to the crisis core | 10 red (A11b forbidden list, C4, byte identity) |
| F-D1a | D1 | timeout returns `und` instead of the offline result | 4 red |
| F-D1b | D1 | graph hard stop (LANG_DETECT_TIMEOUT_MS + 500) made 1 h | my graph-hang probe red; the node process then stayed alive on the pending timer and was killed, so no summary count (Findings 1) |
| F-D1c | D1 | script-inconsistent answers accepted | 3 red |
| F-D1d | D1 | reported script taken as "latin" instead of the deterministic script | 1 red |
| F-D2a | D2 | `resolveReplyLang` returns the detected tag unfiltered | 12 red |
| F-D2b | D2 | empty `VC_REPLY_LANGS` no longer means the default | 2 red |
| F-D3 | D3 | a `ta` entry added to CRISIS_MESSAGES | 1 red |
| F-BYTE | L5/L7 | TELE_MANAS_LINE "24x7" -> "24/7" | 1 red (byte identity vs ae48596) |
15 of 15 killed; D1 and D2 each have more than one falsifier. The bound tree was never edited; `git status` of the copy after the run shows only my two untracked files.

## Diff scope (4c)
`git diff ae48596..d057b13 --stat`: packages/engine/src/student/lang.ts (new, D-105 Q3), graph.ts, index.ts, apps/api/src/voice.ts, two test files, the manifest. Nothing deleted. No `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, skills/, no auth or tenancy code. Matches "What changed".

## Findings (none blocking)
1. Test gap (low): the builder's suite does not exercise the graph-level 2 s hard stop in `buildStudentGraph` (a detector that never resolves on an ordinary turn); only my probe kills F-D1b. The model detector's own 1.5 s timeout is covered (C2). Row ISS-380.
2. Pre-existing recall limit (medium, not LK4): `crisisGuard` flags none of a Tamil-only or a Bengali-only crisis sentence, so such a turn is answered as an ordinary turn. LK4 neither causes nor worsens it (manifest risk 3, design R1: the model safety screen is LK5). Row ISS-381.
3. Contract question for Umesh (not a FAIL, as the brief says): A15b / B24.6 say no LLM sees the text to classify in anonymous routing; D-105 orders a model detector. The detector is an optional dep and is not wired in apps/api, so production uses the offline result until LK5. Row ISS-382.
4. No vetted Hindi crisis text yet: `CRISIS_MESSAGES.hi` is the existing English message with the Hindi helpline line, as the manifest states. The substring fixture passes on it but cannot vouch for future Hindi wording.
5. Process: the check ran 50 min wall, about 35 min of it waiting on the shared testlock (long waits are normal). One probe run failed on my own wrong expected count (5 invalid fallbacks, I wrote 4); the code was right and the expectation was fixed (probe-first-run-my-expectation-error.txt).
6. Not covered by me: the fresh-context senior-software-engineer review is the caller's to dispatch; integration results (merge, install, verify_contracts, typecheck, one full suite via the testlock, 6c stamp) are in the final report.

EXPLANATION: Language detection picks the right language and script for English, Hindi, Latin Hinglish, mixed and uncovered scripts, falls back to the offline script test on any model failure, and a crisis turn never reaches a model and gets the unchanged vetted message with the right escalation language. Evidence is my own probe through `runStudentTurn` plus fifteen falsifying edits that each turn it red.
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent); self != executor.
