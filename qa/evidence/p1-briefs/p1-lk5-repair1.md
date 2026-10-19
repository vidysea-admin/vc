You are the /maker builder for repair cycle 1 of p1-lk5. Work only in D:/vc/.worktrees/lk5 on branch p1/lk5 (head 14ffd70). Edit in place: no new files except tests, and never edit qa/contracts, .claude/**, docs/DECISIONS.md or ARCHITECTURE.md.

Inputs, read first:
- The checker verdict: D:/vc/.worktrees/lk5/qa/verdicts/p1-lk5.md (FAIL on K1). The repro is at qa/evidence/p1-lk5/repro-k1-empty-localized.test.ts.txt.
- The senior review: D:/vc/qa/evidence/p1-briefs/p1-lk5-review-result.md (findings M1-M3).
- The manifest: qa/manifests/p1-lk5.md.

Step 0: merge origin/main into p1/lk5 (`git fetch origin`; LK4 and LK1 are there). Then fix the issue ID collision: main already holds ISS-380, -381 and -382 from LK4. Renumber this branch's three new rows to the next free IDs after main's highest, and update every reference to them in the verdict, checkpoint and evidence on this branch.

Fix, test first (red before green), for each item:
1. K1 / ISS-380: make `localized`, `followUpLocalized` and `replyLang` tolerant in the kb-answer schema (packages/engine/src/student/graph.ts:392-406). Empty, null or over-long becomes undefined, and the student gets the English reply. Keep `text`, `kind` and `sourceIds` strict. Turn the repro into a real test in the existing test file.
2. M1 + the scheme-less domain row: the localized claim must pass the same number, country and link guards as the English claim. That includes scheme-less domains such as `evil.test`, and a link different from the English one even when English also carries a link. On any failure, show English. See lang.ts:238-246 and graph.ts:714-735.
3. M2: run `violatesCrisisRules` on the text actually shown, after the localized swap (graph.ts:811-814).
4. M3: the localized follow-up goes through noScriptGuard, countriesIn and findPersonalIdentifiers the same way the English follow-up does (graph.ts:731). On failure, use the English follow-up.
Do not touch crisisGuard: it still runs first on the original text. No other scope; the low review findings stay as they are.

Run the affected tests one file at a time, unpiped, inside `timeout 600`, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with TMP/TEMP on D:. Long lock waits are normal: keep waiting. Then run the typecheck for packages/engine and apps/api. Never run a full suite.
Do one falsification per changed criterion, in a copy outside the bound tree.
Never kill a PID you did not start (leave 47984 alone).
Update the manifest:
- set Fix cycle to 1;
- write a Pre-check[<id>] line per criterion at the final sha;
- set Status to ready-for-check.
Commit with narrow pathspecs. Finish with exactly: `p1-lk5 <sha> ready`.
