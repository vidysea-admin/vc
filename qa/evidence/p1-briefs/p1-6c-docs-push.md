# You are /checker running the 6c pre-push integration check (docs/bookkeeping batch)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md (Mode A, the 6c integration check). Policy: proportional-verification/2026-10-17.14.
S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.

**Batch.** D:\vc local `main` is at 5feb135. It is 6 commits ahead of origin/main 47ab62a: d2dda19, 0dcc4a6, 2368db5, eeb0a6a, 95214c4, 5feb135. 47ab62a already carries a green 6c stamp, b2ed3d59 (in S/p1-u6h-int/qa/.6c-green).

**Steps**
1. Create the worktree with `git -C D:/vc worktree add S/int-docs 5feb135 --detach`. Do all the work there; never touch the D:\vc working tree.
2. Independently confirm that every path in `git diff --name-only 47ab62a..5feb135` is docs markdown or qa bookkeeping. Use the `isDocsMarkdown`/bookkeeping rules in `D:/ai_os/.claude/skills/maker/tools/tick.mjs`. Any product, test, config, `.claude/` or `qa/contracts` path is red: stop and report it.
3. Run `python contracts/verify_contracts.py` in S/int-docs.
4. **Collection check:** `pnpm install --offline --frozen-lockfile` if node_modules is missing, then `bash D:/vc/scripts/vc-testlock.sh pnpm -r exec vitest list --filesOnly`. Every package must list its files with no import or collection error.
   - If install is impossible offline, use `git -C D:/vc worktree list` to find a worktree already at 47ab62a with node_modules. Run the collection there and state that the diff is test-inert by step 2.
   - The behaviour-scoped set is empty: there are no product or test changes.
5. **If green:** run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green` inside S/int-docs (the tree must be clean), then `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --push-gate`.
6. Do NOT push. Do not commit anything to main.

**Return** at most 6 lines: the step-2 result, the validator line, the collection result (packages and file counts), the stamp line, the push-gate stdout line and its exit code.
