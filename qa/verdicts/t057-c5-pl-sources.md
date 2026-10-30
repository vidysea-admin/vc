# Verdict: t057-c5-pl-sources

Cycle checked: 0
Checked: 2026-10-30T20:54:00+05:30
Verdict: FAIL
Artifact: uncommitted hunks in D:/vc/.worktrees/quest-pathlynks-backend (controllers/pathlynks_quest_controller.js :1338 :1435, tests/parent-journey-regression.test.js) and D:/vc/.worktrees/quest-pathlynks-frontend (AIChatWidget.jsx :525 :547 :736 :916, scripts/student-contract-browser.test.cjs). Mode A, tier M, Dual check: no. Read-only toward both trees; all falsification in a throwaway copy under the session scratchpad (junctioned node_modules, junctions removed afterwards, targets intact).
Policy-Version: proportional-verification/2026-10-19.17

## Executed checks (this checker)
- Backend `node --test tests/parent-journey-regression.test.js` (real tree): 35 tests, 34 pass, 1 fail. The new C5 test passes. The one fail is "real PostgreSQL compare-and-set ... board selection": `Isolated initdb failed: spawnSync C:\Program Files\PostgreSQL\17\bin\initdb.exe ENOENT` (PostgreSQL 17 not installed on this machine). Pre-existing and environmental: the same failure reproduces in a copy running the HEAD version of the test file (9 tests, 8 pass, 1 fail, same initdb ENOENT). It never reaches the sources code.
- Frontend `node --test --test-name-pattern="C5" scripts/student-contract-browser.test.cjs` (real tree): 2/2 pass (Chromium).

## Per criterion
- C5a PASS. Mutant M1 (drop `sources:` from the aiChat response) -> the C5 test fails at its `chat.body.sources` deepEqual (test file :157); green before. Absent sources yield `[]`; reply/turnId/status unchanged.
- C5b PASS (passthrough). The manifest says "no dedicated history test"; that is wrong, the same backend test also covers history (:170). Mutant M2 (drop the history `sources` spread) -> fails at `hist.body.data[1].sources` (:170). Sources ride only on assistant turns. Note (non-blocking): mutant M3 (drop the `role === 'assistant'` guard) survives, because the fixture's user turns carry no sources. The guard is untested but harmless.
- C5c FAIL, one defect (below). The rest of the criterion holds: mutants F1 (reply path drops cleaned sources) -> both C5 tests fail; F3 (href accepts any scheme) -> browser test fails on the `javascript:` row; F4 (drop `rel="noopener"`) -> browser test fails on rel; F5 (drop the Sources block) -> browser test fails. The label is title or kind, target=_blank, rel=noopener, nothing renders for an empty list, and text goes through JSX children (no dangerouslySetInnerHTML).

## Defect D1 (C5c: "http(s) links only"): history path keeps RAW sources when cleaning yields nothing
AIChatWidget.jsx:547: `const sources = m?.role==='assistant' ? cleanSources(m.sources) : undefined; return sources ? { ...m, sources } : m;`. When `cleanSources` returns `undefined` (every entry lacks a string title and kind, or none is an object), the original `m`, still carrying the unsanitised `m.sources`, is returned. The render at :916 gates on `Array.isArray(msg.sources) && msg.sources.length > 0` and uses `src.url` and `src.title || src.kind` unfiltered.
Repro in the copy: history turn `{role:'assistant', sources:[{id:'x', url:'javascript:alert(1)'}]}` -> `messages[...].sources` is the raw array (test "XTRA hostile history sources are stripped": fails, "raw hostile sources survived history cleaning: [{"id":"x","url":"javascript:alert(1)"}]"). The same input on the reply path (:736) passes, so the two paths are inconsistent. React 19 rewrites `javascript:` hrefs, which softens the XSS but does not satisfy the stated invariant. By code reading, the same hole also lets a non-string `title`/`kind` object reach `{label}` and throw a React child error (not run).
Test gap that hid it: mutant F2 (history path never calls `cleanSources`) SURVIVES, 2/2 green, because the history assertion in "C5 Guide keeps KB sources..." uses well-formed sources and `m` already carries them raw, so the test cannot tell cleaning from passthrough.
Required fix (in place, :547): when the turn is assistant, always replace `m.sources` with the cleaned value or drop it, e.g. `return m?.role==='assistant' && m.sources !== undefined ? { ...m, sources } : m;` (with `sources` undefined that removes the key from the object, and `{...m, sources: undefined}` also fails `Array.isArray`). Add a hostile history case to the C5 test (an entry with `url:'javascript:...'` and no title/kind, plus a mixed list) so F2 and this input turn red.

## Notes
- Evidence files named in the manifest (qa/evidence/t057/c5-pl-*.md) were not needed; every claim above is from this checker's own runs.
- No secrets or real student text touched. Only PIDs started by this checker were used (node test processes ran to completion).

Metrics: start=2026-10-30T20:46:00+05:30 end=2026-10-30T20:54:00+05:30 wall_min=8 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=480 mutants=9 defects_unit=1 defects_6c=0
