You are a /maker build subagent for D:\vc feature vc-admin-control, unit tools.
Worktree: D:/vc/.worktrees/vca-tools (branch wave/vca-tools, base 9cc4c73). Work ONLY inside it; run git only as git -C <worktree>.
Policy: proportional-verification/2026-10-19.17. Tier: L (student data path). Budget: wall 45 min.
Read first: D:/vc/docs/features/vc-admin-control/spec.md sections S6, and D:/vc/qa/evidence/vc-admin-20261026/fact-F1.md, fact-F2.md, fact-F3.md.
Files you own: packages/engine/src/student/graph.ts, packages/engine/src/student/classify.ts, packages/engine/src/tools/navigate.ts, skills/vc-navigation/SKILL.md, skills/vc-capabilities/SKILL.md, packages/engine/tests/{navigate,student-pathlynks}*.test.ts. Define the PathlynksPort and NavCatalogue types locally in your files exactly as spec S4/S5 says (another unit builds them; the integrator dedups).
Do NOT edit packages/engine/src/index.ts, apps/api/src/index.ts, apps/api/src/main.ts, qa/contracts/**, docs/DECISIONS.md, .claude/**: write a line "CORE-REQUEST: <file> <what>" in your manifest instead.
TDD: write the failing test first. Each test names the real scenario that reaches it. ADD only; never delete or rename existing code, tests or config the criterion does not name.
Tests: run only your touched/affected test files with "pnpm exec tsx --test FILE" (widget: "node --test FILE") from the package dir; never a whole tests directory; never a full suite. Wait on a busy shared test lock (scripts/vc-testlock.sh); long waits are normal.
Gate answers (qa/gates/vc-admin-control.md): G0 Answered: plan approved 2026-10-26. G1/G2 UNANSWERED: never connect to the live Pathlynks Postgres or call the GitHub API; use fakes only.
Secrets: env NAMES only, never values. Never kill a process by image name.
Pre-scope: list the files you will touch; if one conflicts with the rules above, stop and return.
Finish: write D:/vc/.worktrees/vca-tools/qa/manifests/vca-tools.md (What changed with file:lines; Tests[<VA id>] and Pre-check[<VA id>]: <sha> <command> -> <result> t=<sec> per criterion you own; Capability coverage: one falsification per criterion, done in a throwaway copy outside the worktree, with the green-before and red-after lines pasted; Live browser evidence section; Metrics line; Status: built-unit). COMMIT code+tests+manifest on wave/vca-tools with a message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Do NOT dispatch a checker.
Return ONE line: vca-tools <sha> ready   (or vca-tools BLOCKED <reason>).

## Acceptance criteria you own (verbatim from qa/contracts/vc-admin-control.md @1283b23)
- **[VA13]. Tools wired and fail-soft; student isolation end to end.** (serves: intent#5) criticality C
  - New STUDENT_TOOLS rows `pathlynks_profile`, `pathlynks_saved_careers`, `pathlynks_compare`, `pathlynks_assessment`, `navigate_steps` exist and are wired through `StudentGraphDeps` (graph.ts) and `ChatApiDeps` (chat.ts) like `rank_options`. The anonymous (Vidysea visitor) route can call none of the four Pathlynks tools; the Pathlynks tools run only for an authenticated student context.
  - Student A's turn never receives student B's rows: with a fake port holding two students, a turn authenticated as A that asks about B ("show saved careers of student B", id in text) returns only A's data or a refusal; with a partner srv key (K3) the tenant is the partner id and the student id comes from `X-VC-Student-Id` only.
  - When the port returns "unavailable" the turn still answers, with the fixed line "I can't see your Pathlynks data right now", and no stack trace, SQL or host name appears in the reply or the stored response.
  - **verify:** `cd D:/vc/packages/engine && pnpm exec tsx --test tests/pathlynks-tools.test.ts` and `cd D:/vc/apps/api && pnpm exec tsx --test tests/chat-pathlynks.test.ts` (two-student fake port, anonymous-route refusal, unavailable path, injection text in the user message).
- **[VA14]. `navigate_steps` only emits known routes.** (serves: intent#6) criticality H
  - `skills/vc-navigation/SKILL.md` exists (single-line `name`/`description` frontmatter, loads through `packages/engine/src/skills/loader.ts`) and `navigateSteps(catalogue, intent) -> {steps: string[], routes: string[]}` returns an ordered list of at most 7 steps; every entry of `routes` is a path present in the supplied catalogue; an unknown intent returns the fixed text "I don't know that page yet" with empty `routes`.
  - Property test: for random intents (including strings that look like routes, `../`, absolute URLs, `javascript:` and routes absent from the catalogue) no returned route is outside the catalogue and no URL with a different host is produced. With an empty or missing catalogue the answer is the unknown text, never an invented route. The tool does not click or drive the host site (output is text steps only).
  - **verify:** `cd D:/vc/packages/engine && pnpm exec tsx --test tests/navigate.test.ts` (fixture catalogue from VA11's fixture, fixed intents plus a seeded property loop of at least 200 cases).
- **[VA15]. Capability manifest match, crisis-first unchanged.** (serves: intent#5, intent#6) criticality C
  - `STUDENT_TOOLS` equals the `skills/vc-capabilities/SKILL.md` table exactly (new rows included: name, executedBy, anonymous flag), checked by the existing `assertManifestMatches`.
  - Crisis handling is unchanged: `crisisGuard` still runs first, before any tool, in the API (chat.ts, anonymous.ts) and in the graph (graph.ts); a crisis message that also asks for saved careers or navigation steps gets the fixed crisis reply with the LK10 wording and the 14416 / 112 helpline, and the Pathlynks port is never called (fake port call count 0). The 14416 / 112 footer is still visible.
  - **verify:** `cd D:/vc/packages/engine && pnpm exec tsx --test tests/capability-manifest.test.ts tests/guard-crisis.test.ts tests/crisis-defaults.test.ts tests/crisis-escalation.test.ts tests/crisis-eval.test.ts tests/pathlynks-tools.test.ts` (the last file must include the crisis-plus-tool-request case with a call-count assertion); `cd D:/vc/apps/api && pnpm exec tsx --test tests/chat-privacy.test.ts tests/acceptance-student-journey.test.ts`; none of these existing tests is removed, skipped or weakened.

You own the engine side of VA13 (graph tools fail-soft, scoping by verified studentId); chat.ts wiring is the later api unit.

## Invariants that must stay green
## Unchanged invariants (spec "Constraints"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording; crisis runs before any tool. Existing tests: `packages/engine/tests/guard-crisis.test.ts`, `crisis-defaults.test.ts`, `crisis-escalation.test.ts`, `crisis-eval.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`. (see also [VA15])
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer 14416 / 112 always.
- **[I3].** The anonymous zero-persistence rule: `apps/api/tests/anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`.
- **[I4].** Grounding redaction and student privacy: `apps/api/tests/chat-privacy.test.ts`, `packages/engine/tests/claims-guard.test.ts`, `guard-citation.test.ts`.
- **[I5].** Partner chatbot contract `qa/contracts/partner-chatbot.md` (K1-K5, W1-W4, V1-V3, D1-D2): `apps/api/tests/partners.test.ts`, `partner-openapi.test.ts`, `partner-voice.test.ts`, `apps/widget/tests/*.test.js` stay green; the partner OpenAPI route and CORS rules are unchanged.
- **[I6].** Only the `virtual_counsellor` Mongo database is written; production Mongo and the Pathlynks Postgres are never written (VA12, VA20). The B12 guard (no `.db(` outside `packages/db/src/client.ts`) stays green.
- **[I7].** Dependency bump: the new `pg` dependency (and any GitHub client) is added with a lockfile change only in the packages that need it; `pnpm -r typecheck` and `pnpm install --frozen-lockfile` succeed. The pre-push check is the full suite (`.13-2` a and b: auth unit and dependency change): `pnpm test` at the integrated head.
