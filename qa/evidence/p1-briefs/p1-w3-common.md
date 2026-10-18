# Wave 3 builder rules (all builders)
You are a /maker build subagent. S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
- Policy-Version proportional-verification/2026-10-17.14. Put a `Round: est <n> min` line in your manifest.
- Work ONLY inside your worktree. Never touch the D:\vc working tree or .claude/**.
- Mock only: no network and no real model calls (G-REAL is closed).
- TDD: write the failing test first. Add what the criteria ask. Never delete or rename existing code or tests that the criteria do not name. Never weaken an assertion.
- Run tests only with `bash D:/vc/scripts/vc-testlock.sh pnpm -C <wt>/<pkg> test` (long lock waits are normal: keep waiting) plus `pnpm -C <wt> -r typecheck`. Never run a whole-repo suite.
- Each new test's name says which real scenario reaches it. Do one falsification per criterion, in a throwaway copy.
- Kill only PIDs you started yourself.
- Before building, list the files you will touch. If any of them conflicts with your ownership, stop and return.
- Gate answers that bind you: D:/vc/docs/DECISIONS.md D-086..D-093. Read D-093 in full.
- Write qa/manifests/<slug>.md with `Status: ready-for-check`. It must contain:
  - one `Pre-check[<id>]: <sha> <cmd> -> <result>` line per criterion;
  - the Capability coverage table;
  - the Live browser section;
  - the Metrics line;
  - one `CORE-REQUEST: <file> <what>` line for any change you need in a file you do not own.
- Commit the code, the manifest and the evidence on your branch, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do NOT dispatch a checker. Return ONE line: `<slug> <sha> ready`, or `<slug> blocked <reason>`.
