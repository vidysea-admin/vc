You are a /maker build subagent for D:\vc feature vc-admin-control, unit pathlynks.
Worktree: D:/vc/.worktrees/vca-pathlynks (branch wave/vca-pathlynks, base 9cc4c73). Work ONLY inside it; run git only as git -C <worktree>.
Policy: proportional-verification/2026-10-19.17. Tier: L (production read boundary, new dependency pg). Budget: wall 45 min.
Read first: D:/vc/docs/features/vc-admin-control/spec.md sections S5, and D:/vc/qa/evidence/vc-admin-20261026/fact-F1.md, fact-F2.md, fact-F3.md.
Files you own: mcp/pathlynks/** (new workspace package; add pg + @types/pg; update pnpm-workspace.yaml only if mcp/* is not already globbed; lockfile change allowed)
Do NOT edit packages/engine/src/index.ts, apps/api/src/index.ts, apps/api/src/main.ts, qa/contracts/**, docs/DECISIONS.md, .claude/**: write a line "CORE-REQUEST: <file> <what>" in your manifest instead.
TDD: write the failing test first. Each test names the real scenario that reaches it. ADD only; never delete or rename existing code, tests or config the criterion does not name.
Tests: run only your touched/affected test files with "pnpm exec tsx --test FILE" (widget: "node --test FILE") from the package dir; never a whole tests directory; never a full suite. Wait on a busy shared test lock (scripts/vc-testlock.sh); long waits are normal.
Gate answers (qa/gates/vc-admin-control.md): G0 Answered: plan approved 2026-10-26. G1/G2 UNANSWERED: never connect to the live Pathlynks Postgres or call the GitHub API; use fakes only.
Secrets: env NAMES only, never values. Never kill a process by image name.
Pre-scope: list the files you will touch; if one conflicts with the rules above, stop and return.
Finish: write D:/vc/.worktrees/vca-pathlynks/qa/manifests/vca-pathlynks.md (What changed with file:lines; Tests[<VA id>] and Pre-check[<VA id>]: <sha> <command> -> <result> t=<sec> per criterion you own; Capability coverage: one falsification per criterion, done in a throwaway copy outside the worktree, with the green-before and red-after lines pasted; Live browser evidence section; Metrics line; Status: built-unit). COMMIT code+tests+manifest on wave/vca-pathlynks with a message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Do NOT dispatch a checker.
Return ONE line: vca-pathlynks <sha> ready   (or vca-pathlynks BLOCKED <reason>).

## Acceptance criteria you own (verbatim from qa/contracts/vc-admin-control.md @1283b23)
## Pathlynks read tools
- **[VA12]. Pathlynks student scoping, fail-closed write privilege, timeout and row cap.** (serves: intent#5) criticality C
  - `createPathlynksPort(...)` exposes only `getStudentProfile`, `getSavedCareers`, `getCompareList`, `getAssessmentStatus`. Every query is parameterised (`$1`), SELECT only, and contains `WHERE student_id = $1` bound to the verified student id; no string concatenation of an id, table or column into SQL; the table names come from the `config/sources.json` allow-list.
  - The student id comes only from the verified auth context passed by the engine, never from tool arguments or message text: a tool call carrying another student's id in its arguments, or a prompt-injection attempt in the user text, still queries the verified id (or is refused).
  - Each connection sets `statement_timeout=3000`; results are capped at 50 rows (a fake returning 500 rows yields 50, flagged truncated). A connection or query timeout/error returns a typed "unavailable" result, never throws into the turn and never leaks the connection string or password.
  - On connect the port runs `has_table_privilege(current_user, <table>, 'INSERT')` (and UPDATE/DELETE) for every configured table; if any is true the port refuses to serve (fails closed) and records that the privilege check failed; a privilege-check error also fails closed. No code path issues INSERT/UPDATE/DELETE/DDL; a test asserts that every SQL string issued by the port starts with `SELECT` or is the privilege/`SET` probe.
  - **verify:** `cd D:/vc/mcp/pathlynks && pnpm exec tsx --test tests/*.test.ts` using a fake `pg` client that records `text`/`values` (assert parameterisation, `student_id` binding, timeout setting, row cap, privilege refusal for each of INSERT/UPDATE/DELETE true, privilege-check error, SQL allow-list regexp over all captured statements); `pnpm -C mcp/pathlynks typecheck`. **Live connection: see [VA20] (HELD on G1/G2).**

## Invariants that must stay green
## Unchanged invariants (spec "Constraints"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording; crisis runs before any tool. Existing tests: `packages/engine/tests/guard-crisis.test.ts`, `crisis-defaults.test.ts`, `crisis-escalation.test.ts`, `crisis-eval.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`. (see also [VA15])
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer 14416 / 112 always.
- **[I3].** The anonymous zero-persistence rule: `apps/api/tests/anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`.
- **[I4].** Grounding redaction and student privacy: `apps/api/tests/chat-privacy.test.ts`, `packages/engine/tests/claims-guard.test.ts`, `guard-citation.test.ts`.
- **[I5].** Partner chatbot contract `qa/contracts/partner-chatbot.md` (K1-K5, W1-W4, V1-V3, D1-D2): `apps/api/tests/partners.test.ts`, `partner-openapi.test.ts`, `partner-voice.test.ts`, `apps/widget/tests/*.test.js` stay green; the partner OpenAPI route and CORS rules are unchanged.
- **[I6].** Only the `virtual_counsellor` Mongo database is written; production Mongo and the Pathlynks Postgres are never written (VA12, VA20). The B12 guard (no `.db(` outside `packages/db/src/client.ts`) stays green.
- **[I7].** Dependency bump: the new `pg` dependency (and any GitHub client) is added with a lockfile change only in the packages that need it; `pnpm -r typecheck` and `pnpm install --frozen-lockfile` succeed. The pre-push check is the full suite (`.13-2` a and b: auth unit and dependency change): `pnpm test` at the integrated head.
