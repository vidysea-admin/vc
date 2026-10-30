# Verdict: t057-c5-pl-sources

Cycle checked: 1
Checked: 2026-10-30T20:58:40+05:30
Verdict: PASS
Artifact: uncommitted hunk in D:/vc/.worktrees/quest-pathlynks-frontend (src/components/career-quest/AIChatWidget.jsx :547 history mapper; scripts/student-contract-browser.test.cjs :556 new test). Mode A repair check, tier M, Dual check: no. C5a and C5b PASSed at cycle 0 (r0-1 verdict) with unchanged inputs (backend files not touched this cycle) and are reused, not re-run. Read-only toward both Pathlynks trees; all falsification in a throwaway copy under the session scratchpad (node_modules junction removed afterwards, target intact, copy deleted).
Policy-Version: proportional-verification/2026-10-19.17

## Executed checks (this checker)
- Frontend `node --test scripts/student-contract-browser.test.cjs` (real tree): 32 tests, 32 pass, 0 fail (C5 3/3, Chromium).
- Throwaway copy, baseline: C5 3/3 green.

## Per criterion
- C5c PASS. D1 is closed at AIChatWidget.jsx:547. The mapper now strips raw `sources` from every history item that carries the key (`const { sources: raw, ...rest } = m`), re-adds only the cleaned value, and the key is absent when nothing survives. Mutants run in the copy, each over the three C5 tests:
  - Old (cycle-0) mapper restored -> new test "C5 Guide history: hostile or unlabeled sources are cleaned, never passed through raw" FAILS (other two green). The new test is red against the defect it was written for.
  - F2 (history path skips `cleanSources`, passes `raw`) -> the new test FAILS. The cycle-0 survivor is now killed.
  - F6 (cleaned value discarded, item returned with raw spread) -> the new test FAILS.
  - F7 (drop the `role === 'assistant'` guard) -> SURVIVES, 3/3 green. Same as cycle-0 M3: the fixture has no user turns carrying sources. Non-blocking: the guard only decides whether a user turn keeps cleaned (never raw) sources, and the render path is unaffected.
  - Copy restored -> 3/3 green.
- The new test asserts the hostile input directly: `{id:'x',url:'javascript:alert(1)'}` with no title/kind -> `sources` undefined; mixed list with a labelled `javascript:` entry, an object-title entry and a non-object -> only `{id:'y',kind:'career'}` survives (url stripped). This closes both the href and the React-child-object holes named in D1.
- C5a, C5b: reused from cycle 0 (PASS). The backend hunks are unchanged by the fix.

## Notes
- The pre-existing real-PostgreSQL board-selection failure in backend parent-journey-regression.test.js (initdb ENOENT, PostgreSQL 17 not installed) is environmental and unrelated; it was not re-run this cycle.
- No secrets or real student text touched. No PIDs left running; node test processes ran to completion.

Metrics: start=2026-10-30T20:55:00+05:30 end=2026-10-30T20:58:40+05:30 wall_min=4 agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=220 mutants=4 defects_unit=0 defects_6c=0
