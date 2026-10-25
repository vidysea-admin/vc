# Wave 1 common rules (every w1-* build brief includes this file by reference)

`<slug>` below is the slug named in your brief.

- **Worktree.** Create it with `git -C D:/vc worktree add D:/vc/.worktrees/<slug> -b wave/<slug> main`. Work ONLY inside that worktree.
- **Policy.** Pin `Policy-Version: proportional-verification/2026-10-19.17`.
- **Issue rows.** Read issue rows with grep in `qa/issues.jsonl`. One id may have several rows; the latest row wins for status.
- **Manifest.** Write `qa/manifests/<slug>.md`, in this order:
  1. The pin.
  2. The criteria, verbatim.
  3. The Dual check line. When the dual check is required, add a `dual-trigger: <kind> <path.ext:line>` line.
  4. A `Round:` line.
  5. One `Tests[<id>]` line and one `Pre-check[<id>]` line per criterion id, taken on the final sha (sha + full command + green result).
  6. The falsification for each criterion.
  7. A Metrics line.
  8. `Fix cycle: 0`.
  9. `Status: ready-for-check`.
- **Lint.** From inside the worktree, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/<slug>.md --root D:/vc/.worktrees/<slug>` until it exits 0.
- **TDD.**
  - Write the failing test first, run it red, and record the result.
  - Edit existing functions in place, citing `file:line`.
  - Add code and tests. Never delete or rename code or tests that the criteria do not name.
  - Each new test names the real scenario that reaches it.
- **Running tests.** Use `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test [--test-name-pattern=...] <file>`. Put the pattern BEFORE the file. Long lock waits are normal; keep waiting.
- **Removed or renamed symbols.** For each one, run `git grep -l -- '<name>'` and add every hit to the scope.
- **Falsification.** Run one per criterion, in a COPY under `C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/build-<slug>/`. Never falsify in the worktree.
- **Typecheck.** Run `tsc --noEmit` on the touched packages.
- **Never:**
  - Run a full suite or a whole tests directory.
  - Make live LLM, Gemini, STT or search calls.
  - Use real Mongo. Use fakes only.
  - Kill any process you did not start.
  - Delete anything outside your scratchpad subfolder and the temp dirs your tests create.
  - Edit `.claude/**`, `qa/contracts`, `qa/gates`, `docs/DECISIONS.md` or `ARCHITECTURE.md`.
  - Print keys or secrets.
  - Run python, unless your brief allows it. Even then, never pipe a heredoc into python.
- **Unchanged behaviour.** LK10 wording, the D-110 helpline rule and anonymous zero persistence stay as they are.
- **Staging.** Run `git add` with named files only. Never run `git add -A`. Do not commit `pnpm-lock.yaml`.
- **Budget.** Tier L: 45 min wall time.
- **Before building.** List the files you will touch and compare them with your brief. On a conflict, stop and return `BLOCKED`.
- **Finish.** Commit on the branch. Return `READY <slug> <sha>` plus at most 8 lines, or `BLOCKED <reason>`.
