# D:/vc landplane classification (READ-ONLY run, 2026-10-17)

Nothing in D:/vc was staged, stashed, reset, checked out or edited. Commands run: `git -C D:/vc status --porcelain=v1 -uall` (6803 entries), `git diff --stat`, `git diff --numstat/-U0`, `git ls-files -o --exclude-standard` (re-listed at end: 6771 untracked files, 3 newer than the first listing, so other sessions are still writing), `git diff --quiet`, `git hash-object`.
Full per-file machine list (path, class, group, reason, bytes): `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/landplane-classes.tsv`

## Counts per class (files, 6806 total = 35 modified + 6771 untracked)

| Class | Files | Meaning |
|---|---|---|
| A | 28 | T-052 product WIP (exactly the 28-path inventory in `qa/.wave.json` currentCandidate; all 28 are the modified source/test files, none missing, none extra) |
| B | 578 | bookkeeping safe to commit: 5 modified docs/qa files + 2 phantom mods (nothing to commit) + 571 untracked (HANDOFF.md, qa/.wave.json, 7 manifests/verdicts/checkpoints, 562 evidence logs/json/md) |
| C | 5898 | junk to gitignore (caches, hook output, pytest scratch, zips, 3387 source-tree clones inside qa/evidence) |
| D | 302 | needs a human (58 qa/.delivery packets/receipts, 241 t035 isolated/parent trees, 3 files over 5 MB) |

After the proposed .gitignore, `git ls-files -o --exclude-standard --exclude-from=<proposed>` leaves 571 B + 302 D untracked files and ignores all 5898 C files and zero B/D files (checked file by file against the classifier).

## Modified tracked files (35) - one row each

| path | class | reason |
|---|---|---|
| apps/api/src/openapi.ts | A | in qa/.wave.json 28-file inventory |
| apps/api/src/server.ts | A | inventory |
| apps/api/tests/server.test.ts | A | inventory |
| apps/web/demo/seed.ts | A | inventory |
| apps/web/tests/session-api.test.ts | A | inventory |
| packages/db/scripts/db-init.ts | A | inventory |
| packages/db/src/collections.ts | A | inventory |
| packages/db/src/decisions.ts | A | inventory |
| packages/db/src/erasure.ts | A | inventory |
| packages/db/src/facts.ts | A | inventory (1795-line diff) |
| packages/db/tests/consent.test.ts | A | inventory |
| packages/db/tests/db-init.test.ts | A | inventory |
| packages/db/tests/decisions.test.ts | A | inventory |
| packages/db/tests/erasure.test.ts | A | inventory |
| packages/db/tests/facts.test.ts | A | inventory |
| packages/db/tests/fakes.ts | A | inventory |
| packages/engine/evals/score.ts | A | inventory |
| packages/engine/src/scribe/checkpointer.ts | A | inventory |
| packages/engine/src/scribe/graph.ts | A | inventory (2075-line diff) |
| packages/engine/src/scribe/nodes.ts | A | inventory |
| packages/engine/tests/b18-suppression-outcome.test.ts | A | inventory |
| packages/engine/tests/crisis-escalation.test.ts | A | inventory |
| packages/engine/tests/scribe-checkpointer.test.ts | A | inventory |
| packages/engine/tests/scribe-erasure-fence.test.ts | A | inventory |
| packages/engine/tests/scribe-fixtures.ts | A | inventory |
| packages/engine/tests/scribe-per-fact.test.ts | A | inventory |
| packages/engine/tests/scribe-persistence.test.ts | A | inventory (2224-line diff) |
| packages/engine/tests/scribe-rules-e2e.test.ts | A | inventory |
| docs/DECISIONS.md | B | ADDITIONS-ONLY PROVEN: `git diff --numstat` = `379 0`; `git diff -U0` has a single hunk `@@ -420,0 +421,379 @@` and `grep -c '^-[^-]'` = 0; adds D-042..D-085 after the HEAD tail (HEAD ends at D-041). Caveat: I cannot prove the write path was `scripts/append_decision.ps1`; the landplane additions-only audit is the check for that. |
| docs/plan.md | B | pure addition: numstat `169 0`, one hunk `@@ -921,0 +922,169 @@` (T055 portal/Clicky scope per qa/.wave.json writers note) |
| TASKS.md | B | `7 5`: T-038/T-048/T-049/T-052/T-054 status text rewritten in place, T-055/T-056 rows added; not additions-only, but it is the task ledger |
| qa/QUEUE.md | B | numstat `2 0` (adds the 2026-10-14 reconciliation paragraph) |
| qa/gates/t049-main-additions.md | B | numstat `3 3`: gate flipped pending-user-answer -> answered (D-079) |
| qa/.last-tick | B (no-op) | PHANTOM: `git diff --quiet` passes and `git hash-object` = HEAD blob 9d6ecb8a; only CRLF working copy (`i/lf w/crlf`). Do not `git add`; nothing to commit |
| qa/evidence/browser-t-021-provider-failover-c1-2026-09-26/report.json | B (no-op) | PHANTOM: `git diff --quiet` passes, empty `git diff --raw`; stat-dirty only. Nothing to commit |

## Untracked files (6771) - grouped

| path / group | class | files | MB | reason |
|---|---|---|---|---|
| HANDOFF.md | B | 1 | 0.004 | pack-up handoff dated 2026-10-16 (may be stale vs 10-17 state; refresh before commit) |
| qa/.wave.json | B | 1 | 0.02 | orchestrator wave state; sibling `qa/.last-tick` is tracked, same kind of file |
| qa/manifests/{t-052-session-lifecycle,vc-release-t052-2026-10-13}.md | B | 2 | 0.11 | maker-checker handshake |
| qa/verdicts/{t-052-session-lifecycle,vc-release-t052-2026-10-13,vc-release-t052-2026-10-13.b}.md | B | 3 | 0.02 | checker verdicts |
| qa/checkpoints/vc-release-t052-{2026-10-13.b,primary-2026-10-13}.md | B | 2 | 0.01 | checkpoints |
| qa/evidence/t052-maker-cycle2/ | B | 161 | 52.9 | logs, hashes, runtime start/end JSON (many 2-3 MB each) |
| qa/evidence/checker-ratio-20261016/ (non-scratch) | B | 271 | 6.72 | handoff/packet/prepare/verdict JSON and md; many have `.json` + `-request.json` pairs |
| qa/evidence/t052-checker-cycle1, t052-checker, t052-maker, t052-plan-20261016, vc-release-t052-primary-20261013, vc-release-t052-2026-10-13.b, browser-t-052-cycle1-2026-10-01-checker | B | 50 | 0.5 | T-052 evidence outside the clones |
| qa/evidence/t038-a, t038-blind-b, t038-checker-b-20261016, t038-cycle1-a, t038-cycle1-b, t038-cycle1-b-runtime, t038-cycle1-b-security | B | 57 | 0.3 | T-038 evidence outside the clones |
| qa/evidence/{crisis-research,hook-bundle,kb-design,meeting-2026-10-15,p1-plan-draft,t048-hindi-review,verdicts}-2026101x | B | 22 | 0.7 | planning / research evidence |
| qa/evidence/t035-checker-cycle0/commit-message.txt | B | 1 | 0 | residue of an already-tracked evidence dir (15 files tracked) |
| qa/.delivery/ (everything except context/) | D | 58 | 0.34 | delivery packets, receipts, snapshots; 0 files tracked ever; docs/plan.md references qa/.delivery. Human decides: keep as durable record (commit) or ignore. Recommend commit packets/receipts, they are small and cited |
| qa/evidence/t035-checker-cycle0/{isolated,scribe-parent,provider-parent}/ | D | 241 | 3.17 | source-tree copies, but committed verdict qa/verdicts/t-035-safety-lifecycle.md cites `scribe-parent/packages/engine/tests/scribe-per-fact.test.ts` as a command path and 1 file under `isolated/` is already tracked. Ignoring would orphan that citation; human decides |
| qa/evidence/t038-blind-b/closure-pins.json | D | 1 | 5.26 | >5 MB single file |
| qa/evidence/t038-cycle1-b-runtime/resume2-copy-seal.json | D | 1 | 20.36 | >5 MB single file |
| qa/evidence/t052-maker-cycle2/t038-offline-install-20261014T081958292Z-end.json | D | 1 | 7.44 | >5 MB single file |
| .pnpm-store/ | C | 2 | 0.01 | pnpm store inside repo |
| .playwright-mcp/ | C | 9 | 0.03 | Playwright MCP console/page dumps (Sep 27) |
| .handoffs/ | C | 47 | 0.05 | PreCompact hook stubs, tool-generated |
| qa/.delivery/context/ | C | 58 | 1.07 | compact-handoff context cache, content-addressed; 1 file appeared during this run |
| qa/evidence/t035-checker-cycle0/{candidate,provider-parent,scribe-parent}.zip | C | 3 | 0.97 | archives of trees also present expanded |
| __pycache__ / *.pyc under qa/evidence/checker-ratio-20261016/isolated | C | 3 | 0.34 | bytecode |
| qa/evidence/checker-ratio-20261016/{scratch/, pytest-*/, independent/*/pytest-own-*, tmp1, tmp2, *-tmp} | C | 2389 | 1.26 | pytest tmp_path scratch |
| qa/evidence/t038-cycle1-a/copies/ (8 mutation clones) | C | 1928 | - | full repo clones; no manifest/verdict/gate/plan cites them (grep) |
| qa/evidence/t038-a/copy-C*/ (5 clones) | C | 885 | - | full repo clones, uncited |
| qa/evidence/t038-cycle1-b-runtime/copy/ | C | 207 | - | repo clone, uncited |
| qa/evidence/t052-checker-cycle1/isolation/ | C | 149 | - | isolation clone, uncited |
| qa/evidence/vc-release-t052-primary-20261013/isolation/ | C | 162 | - | isolation clone, uncited |
| qa/evidence/vc-release-t052-2026-10-13.b/isolated/ | C | 42 | - | isolation clone, uncited |
| qa/evidence/checker-ratio-20261016/{isolated/, independent/report-cycle1/R*/, independent/report-final/clip/} | C | 14 | - | small script clones (token_scan.py), uncited |
| (clone rows together: 3387 files, 45.9 MB) | | | | clone content stays reproducible; sibling JSON keeps the hash pins |

Already ignored (no action): apps/web/AGENTS.md, apps/web/CLAUDE.md, apps/web/next-env.d.ts (apps/web/.gitignore), .pytest_cache/ (own .gitignore), .claude/worktrees/agent-* (4 dirs, ignored upstream).

Secret scan: regex scan for sk-ant/sk-/AKIA/mongodb creds/private-key/ghp tokens over qa/, HANDOFF.md, .handoffs, .playwright-mcp returned no hits (background job completed with empty result; the only `.env*` files are `.env.example` inside clones). Evidence JSON can still contain student-adjacent text; the 2026-10-17 reviewer should glance at qa/evidence/crisis-research-20261017 and meeting-2026-10-15 before pushing anywhere.

## Proposed .gitignore diff (append to D:/vc/.gitignore; validated by simulation, not applied)

```diff
--- a/.gitignore
+++ b/.gitignore
@@ end @@
 !.env.example
 !**/.env.example
+
+# --- landplane 2026-10-17: local caches, hook output, evidence scratch (never evidence) ---
+.pnpm-store/
+.playwright-mcp/
+.handoffs/
+# compact-handoff context cache (content-addressed, regenerable)
+qa/.delivery/context/
+__pycache__/
+*.pyc
+# evidence: archives of trees that also exist expanded
+qa/evidence/**/*.zip
+# evidence: pytest tmp_path / scratch runs
+qa/evidence/checker-ratio-20261016/scratch/
+qa/evidence/checker-ratio-20261016/pytest-*/
+qa/evidence/checker-ratio-20261016/independent/*/pytest-own-*/
+qa/evidence/checker-ratio-20261016/independent/*/tmp[0-9]*/
+qa/evidence/checker-ratio-20261016/independent/*/*-tmp/
+# evidence: full source-tree clones used for mutation / isolation runs
+qa/evidence/checker-ratio-20261016/isolated/
+qa/evidence/checker-ratio-20261016/independent/report-cycle1/R[0-9]/
+qa/evidence/checker-ratio-20261016/independent/report-final/clip/
+qa/evidence/t038-a/copy-*/
+qa/evidence/t038-cycle1-a/copies/
+qa/evidence/t038-cycle1-b-runtime/copy/
+qa/evidence/t052-checker-cycle1/isolation/
+qa/evidence/vc-release-t052-primary-20261013/isolation/
+qa/evidence/vc-release-t052-2026-10-13.b/isolated/
```
Same text is in `.../scratchpad/gitignore-add.txt`. Note: it deliberately does NOT ignore `qa/evidence/t035-checker-cycle0/isolated/` or `*-parent/` (class D). Ignore rules never affect already-tracked files.

## Proposed commit groups (path-scoped; run in D:/vc only AFTER human approval; never `git add -A`, never `git add .`)

Every message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not run `git add` on any class A path. The Lab Protocol landplane order (task update -> DECISIONS entry via append_decision.ps1 -> verification -> additions-only audit) comes before these commits.

G0 - ignore rules (first, so later `git add <dir>` skips clones)
```
git add -- .gitignore
git commit -m "chore: ignore local caches, hook output and evidence clones/scratch"
```

G1 - ledger and plan bookkeeping (7 paths)
```
git add -- TASKS.md docs/plan.md docs/DECISIONS.md qa/QUEUE.md qa/gates/t049-main-additions.md HANDOFF.md qa/.wave.json
git commit -m "docs: record D-042..D-085, T055/T056 scope, T049 gate answer and session handoff"
```
(HANDOFF.md is 2026-10-16 text: regenerate with /pack-up first if it should describe the current state. Do NOT add qa/.last-tick or the t-021 report.json: no-ops.)

G2 - maker-checker handshake files (7 paths)
```
git add -- qa/manifests/t-052-session-lifecycle.md qa/manifests/vc-release-t052-2026-10-13.md qa/verdicts/t-052-session-lifecycle.md qa/verdicts/vc-release-t052-2026-10-13.md qa/verdicts/vc-release-t052-2026-10-13.b.md qa/checkpoints/vc-release-t052-2026-10-13.b.md qa/checkpoints/vc-release-t052-primary-2026-10-13.md
git commit -m "qa: add T052 session-lifecycle manifest, release verdicts and checkpoints"
```

G3 - T-052 evidence (cycle2 alone is 52.9 MB, so it is its own commit)
```
git add -- qa/evidence/t052-maker qa/evidence/t052-checker qa/evidence/t052-checker-cycle1 qa/evidence/t052-plan-20261016 qa/evidence/vc-release-t052-primary-20261013 qa/evidence/vc-release-t052-2026-10-13.b qa/evidence/browser-t-052-cycle1-2026-10-01-checker
git commit -m "qa: T052 checker/plan/release evidence (clones excluded by ignore rules)"
git add -- qa/evidence/t052-maker-cycle2 ':(exclude)qa/evidence/t052-maker-cycle2/t038-offline-install-20261014T081958292Z-end.json'
git commit -m "qa: T052 maker cycle2 runtime and hash evidence"
```

G4 - T-038 evidence
```
git add -- qa/evidence/t038-a qa/evidence/t038-blind-b qa/evidence/t038-checker-b-20261016 qa/evidence/t038-cycle1-a qa/evidence/t038-cycle1-b qa/evidence/t038-cycle1-b-runtime qa/evidence/t038-cycle1-b-security ':(exclude)qa/evidence/t038-blind-b/closure-pins.json' ':(exclude)qa/evidence/t038-cycle1-b-runtime/resume2-copy-seal.json'
git commit -m "qa: T038 cycle0/cycle1 checker evidence (clones and oversize seals excluded)"
```

G5 - delivery/ratio/planning evidence
```
git add -- qa/evidence/checker-ratio-20261016 qa/evidence/crisis-research-20261017 qa/evidence/hook-bundle-20261017 qa/evidence/kb-design-20261017 qa/evidence/meeting-2026-10-15 qa/evidence/p1-plan-draft-20261017 qa/evidence/t048-hindi-review-20261017 qa/evidence/verdicts-20261017 qa/evidence/t035-checker-cycle0/commit-message.txt
git commit -m "qa: checker-ratio, P1 plan draft, crisis research and T048 review evidence"
```

Held for a human (class D, no commit proposed): qa/.delivery/ non-context (58, recommend G6 `git add -- qa/.delivery` after the ignore rule since context/ is then skipped), t035 isolated/*-parent trees (241), the 3 files over 5 MB.

Held, NOT committable now (class A, 28 paths): the T-052 product WIP (+12,723 / -717 lines). Per HANDOFF.md the .12 source baseline is not HEAD, the candidate is "FROZEN_MAKER_PRECHECK_NOT_ACCEPTED", acceptance not-run, and privacy plan approval is REFUSED/awaiting. It commits only after checker PASS, as whole-feature, from a clean worktree, never from D:/vc directly.
