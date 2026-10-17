T049: PASS

Checker c9-t049-checker, 2026-10-17T07:02+05:30. Commit fe0937e (parent 13207bd, 19 files).

1. Patch identity
- Patch: D:/vc/.worktrees/b1-recovery/node_modules/.b1-verification/frozen-candidate-cycle1.patch (cited in qa/gates/t049-main-additions.md, D-079).
- sha256sum = bb859974...0c92, matches the gate's BB859974CCC1496433C0B8FC08797990C4B4108BDF19475204EC2F6900800C92. 19 `diff --git` headers.
- `git diff 13207bd fe0937e` (CR-stripped) is byte-identical to the patch (cmp IDENTICAL, same sha256; also identical with `index` lines removed).
2. Worktree (removed afterwards)
- pnpm install --prefer-offline --frozen-lockfile: exit 0.
- pnpm typecheck (pnpm -r, 9 projects incl. engine evals/scripts, api, web): all Done, exit 0.
- @vc/schemas test via vc-testlock: 63 tests, 63 pass, 0 fail.
- @vc/engine test via vc-testlock: 899 tests, 852 pass, 2 fail, 45 skipped, 0 cancelled. The 2 fails are timing-sensitive tests in files this commit does not touch (crisis-escalation "T047 publication budget..." and guard-crisis "doubling zalgo... ratio 3.68 < 3.5"). Rerun of those two files alone: 324/324 pass, 0 fail. Load flake, not caused by the patch.
- New/changed T-049 suites cards-verifier + cards-graph + cards-eval: 83/83 pass.
3. Hostile mutation
- verifier.ts QUESTION_CARD_TYPES `new Set(["widen","clarify","check-in"])` -> `new Set(["widen"])`.
- Same 3 suites: 83 tests, 82 pass, 1 FAIL ("T-010 B1 / ISS-t-010-c1-1: the checker's hostile rows ... all drop"). RED as required.
- Restored with git checkout (worktree only): 83/83 pass; worktree clean.
Never staged/committed/reset in D:/vc.
