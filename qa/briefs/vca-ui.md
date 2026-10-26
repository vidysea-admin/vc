You are a /maker build subagent for D:\vc feature vc-admin-control, unit ui.
Worktree: D:/vc/.worktrees/vca-ui (branch wave/vca-ui, base 9cc4c73). Work ONLY inside it; run git only as git -C <worktree>.
Policy: proportional-verification/2026-10-19.17. Tier: M (admin UI). Budget: wall 45 min.
Read first: D:/vc/docs/features/vc-admin-control/spec.md sections S8 (calls S3 API), and D:/vc/qa/evidence/vc-admin-20261026/fact-F1.md, fact-F2.md, fact-F3.md.
Files you own: apps/web/src/app/admin/**, apps/web/src/app/api/admin-session/**, apps/web tests for admin pages
Do NOT edit packages/engine/src/index.ts, apps/api/src/index.ts, apps/api/src/main.ts, qa/contracts/**, docs/DECISIONS.md, .claude/**: write a line "CORE-REQUEST: <file> <what>" in your manifest instead.
TDD: write the failing test first. Each test names the real scenario that reaches it. ADD only; never delete or rename existing code, tests or config the criterion does not name.
Tests: run only your touched/affected test files with "pnpm exec tsx --test FILE" (widget: "node --test FILE") from the package dir; never a whole tests directory; never a full suite. Wait on a busy shared test lock (scripts/vc-testlock.sh); long waits are normal.
Gate answers (qa/gates/vc-admin-control.md): G0 Answered: plan approved 2026-10-26. G1/G2 UNANSWERED: never connect to the live Pathlynks Postgres or call the GitHub API; use fakes only.
Secrets: env NAMES only, never values. Never kill a process by image name.
Pre-scope: list the files you will touch; if one conflicts with the rules above, stop and return.
Finish: write D:/vc/.worktrees/vca-ui/qa/manifests/vca-ui.md (What changed with file:lines; Tests[<VA id>] and Pre-check[<VA id>]: <sha> <command> -> <result> t=<sec> per criterion you own; Capability coverage: one falsification per criterion, done in a throwaway copy outside the worktree, with the green-before and red-after lines pasted; Live browser evidence section; Metrics line; Status: built-unit). COMMIT code+tests+manifest on wave/vca-ui with a message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Do NOT dispatch a checker.
Return ONE line: vca-ui <sha> ready   (or vca-ui BLOCKED <reason>).

## Acceptance criteria you own (verbatim from qa/contracts/vc-admin-control.md @1283b23)
## Admin UI
- **[VA19]. Admin UI browser walk for the three roles.** (serves: intent#1, intent#2, intent#3, intent#7) criticality H
  - Pages `login`, `dashboard`, `sites` (with keys inside `sites/[id]`), `sources`, `admins`, `audit` exist under `apps/web/src/app/admin/**`. The JWT is held in memory plus an httpOnly cookie set by the Next route handler `apps/web/src/app/api/admin-session/**`; it is never in `localStorage` / `sessionStorage` or in a URL, and the cookie is `HttpOnly`, `SameSite` set, `Secure` outside localhost.
  - Walk per role against the dev server with a stub admin API: super-admin (login -> Dashboard -> Admins create admin, set role -> Sources set secret); admin (login -> Sites add site + origins -> Keys create, key shown once and gone after reload, rotate, revoke -> Sources add, Test, Sync -> Dashboard); viewer (login -> Dashboard, lists visible, every write button absent or disabled, a forced write call returns 403 shown as an error). Wrong password shows the generic error; an expired / missing session redirects to login; the dashboard shows conversations per site per day, active students, chat vs voice, tokens, cost per student against the 50 INR target, latency, guardrail hits and unanswered; a secret field never re-displays a stored secret (only "set" / "not set"). Page works at 360 px without horizontal scroll.
  - **verify:** `cd D:/vc/apps/web && pnpm exec tsx --test tests/admin-*.test.ts*` (render / route-handler unit tests: cookie flags, no storage use, role-gated controls) and `pnpm -C apps/web typecheck` and `pnpm -C apps/web build`; plus a browser walk per role by the checker (Playwright against `pnpm -C apps/web dev` with the stub API), screenshots and a written step log saved under `qa/evidence/vc-admin-20261026/`. A role walk that is not performed is a missing mandatory check, not a PASS.

The admin API (S3) is built later; code the fetch calls to spec S3 paths and test against a mocked fetch. Browser smoke with a mocked API is a smoke only; the real walk happens after integration.

## Invariants that must stay green
## Unchanged invariants (spec "Constraints"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording; crisis runs before any tool. Existing tests: `packages/engine/tests/guard-crisis.test.ts`, `crisis-defaults.test.ts`, `crisis-escalation.test.ts`, `crisis-eval.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`. (see also [VA15])
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer 14416 / 112 always.
- **[I3].** The anonymous zero-persistence rule: `apps/api/tests/anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`.
- **[I4].** Grounding redaction and student privacy: `apps/api/tests/chat-privacy.test.ts`, `packages/engine/tests/claims-guard.test.ts`, `guard-citation.test.ts`.
- **[I5].** Partner chatbot contract `qa/contracts/partner-chatbot.md` (K1-K5, W1-W4, V1-V3, D1-D2): `apps/api/tests/partners.test.ts`, `partner-openapi.test.ts`, `partner-voice.test.ts`, `apps/widget/tests/*.test.js` stay green; the partner OpenAPI route and CORS rules are unchanged.
- **[I6].** Only the `virtual_counsellor` Mongo database is written; production Mongo and the Pathlynks Postgres are never written (VA12, VA20). The B12 guard (no `.db(` outside `packages/db/src/client.ts`) stays green.
- **[I7].** Dependency bump: the new `pg` dependency (and any GitHub client) is added with a lockfile change only in the packages that need it; `pnpm -r typecheck` and `pnpm install --frozen-lockfile` succeed. The pre-push check is the full suite (`.13-2` a and b: auth unit and dependency change): `pnpm test` at the integrated head.
