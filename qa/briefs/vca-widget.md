You are a /maker build subagent for D:\vc feature vc-admin-control, unit widget.
Worktree: D:/vc/.worktrees/vca-widget (branch wave/vca-widget, base 9cc4c73). Work ONLY inside it; run git only as git -C <worktree>.
Policy: proportional-verification/2026-10-19.17. Tier: M (public widget UI). Budget: wall 45 min.
Read first: D:/vc/docs/features/vc-admin-control/spec.md sections S7, and D:/vc/qa/evidence/vc-admin-20261026/fact-F1.md, fact-F2.md, fact-F3.md.
Files you own: apps/widget/src/vc-widget.js, apps/widget/tests/floater*.test.js, apps/widget/README.md, apps/widget demo page if one exists
Do NOT edit packages/engine/src/index.ts, apps/api/src/index.ts, apps/api/src/main.ts, qa/contracts/**, docs/DECISIONS.md, .claude/**: write a line "CORE-REQUEST: <file> <what>" in your manifest instead.
TDD: write the failing test first. Each test names the real scenario that reaches it. ADD only; never delete or rename existing code, tests or config the criterion does not name.
Tests: run only your touched/affected test files with "pnpm exec tsx --test FILE" (widget: "node --test FILE") from the package dir; never a whole tests directory; never a full suite. Wait on a busy shared test lock (scripts/vc-testlock.sh); long waits are normal.
Gate answers (qa/gates/vc-admin-control.md): G0 Answered: plan approved 2026-10-26. G1/G2 UNANSWERED: never connect to the live Pathlynks Postgres or call the GitHub API; use fakes only.
Secrets: env NAMES only, never values. Never kill a process by image name.
Pre-scope: list the files you will touch; if one conflicts with the rules above, stop and return.
Finish: write D:/vc/.worktrees/vca-widget/qa/manifests/vca-widget.md (What changed with file:lines; Tests[<VA id>] and Pre-check[<VA id>]: <sha> <command> -> <result> t=<sec> per criterion you own; Capability coverage: one falsification per criterion, done in a throwaway copy outside the worktree, with the green-before and red-after lines pasted; Live browser evidence section; Metrics line; Status: built-unit). COMMIT code+tests+manifest on wave/vca-widget with a message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Do NOT dispatch a checker.
Return ONE line: vca-widget <sha> ready   (or vca-widget BLOCKED <reason>).

## Acceptance criteria you own (verbatim from qa/contracts/vc-admin-control.md @1283b23)
## Widget
- **[VA18]. Floater: drag, resize, pop-out, Chat|Voice toggle, shared history; existing modes intact.** (serves: intent#8) criticality H
  - `VERSION` is `"1.1.0"`. Drag by the header with pointer events, clamped to the viewport (cannot be dragged fully off-screen, also after a window resize); resize from the corner with minimum 300 x 380 and clamped to the viewport; pop-out opens `/vc-popout?site=<id>` in a new window (`noopener`, same origin as the configured API/host, no key or student token in the URL); header Chat|Voice toggle with Voice hidden when `voiceAvailable` is false; one shared in-memory history, so a message sent in Chat is visible after toggling to Voice and back, and after pop-out the history is not copied through storage or URL.
  - Still true: no `localStorage` / `sessionStorage` / IndexedDB / cookie use; shadow DOM isolation; key mode and proxy mode requests, the crisis block, the 401 and 429 (Retry-After) states, the 14416 / 112 footer, and the voice (mic) behaviour work as before; at 360 px width the floater fits the viewport; keyboard operation (focus order, Esc, toggle by keyboard) and aria roles/labels remain.
  - **verify:** `cd D:/vc/apps/widget && node --test tests/*.test.js` (config, request, voice, hosting tests unchanged and green; new `tests/floater.test.js` with a DOM stub or jsdom-free fake for drag clamping, resize min and clamp, toggle + shared history, pop-out URL, Voice hidden, storage-spy asserting zero storage calls). Browser check: a Playwright run of `apps/widget/demo.html` against the stub API at 360 x 640 and 1280 x 800 (drag, resize, toggle, pop-out) with screenshots saved under `qa/evidence/vc-admin-20261026/`; the checker performs this walk itself for the Pathlynks student and Vidysea visitor user types (spec "User types").

Also run the browser smoke yourself (pnpm demo:up or the widget demo page) and write qa/evidence/browser-vca-widget-<date>/report.json; it is a smoke check, not validation.

## Invariants that must stay green
## Unchanged invariants (spec "Constraints"; must hold after every unit)
- **[I1].** crisisGuard and the LK10 wording; crisis runs before any tool. Existing tests: `packages/engine/tests/guard-crisis.test.ts`, `crisis-defaults.test.ts`, `crisis-escalation.test.ts`, `crisis-eval.test.ts`, `apps/api/tests/voice-crisis-turn.test.ts`. (see also [VA15])
- **[I2].** D-110: Tele-MANAS appears only on distress, and the footer 14416 / 112 always.
- **[I3].** The anonymous zero-persistence rule: `apps/api/tests/anonymous-zero-persistence.test.ts`, `anonymous-route.test.ts`.
- **[I4].** Grounding redaction and student privacy: `apps/api/tests/chat-privacy.test.ts`, `packages/engine/tests/claims-guard.test.ts`, `guard-citation.test.ts`.
- **[I5].** Partner chatbot contract `qa/contracts/partner-chatbot.md` (K1-K5, W1-W4, V1-V3, D1-D2): `apps/api/tests/partners.test.ts`, `partner-openapi.test.ts`, `partner-voice.test.ts`, `apps/widget/tests/*.test.js` stay green; the partner OpenAPI route and CORS rules are unchanged.
- **[I6].** Only the `virtual_counsellor` Mongo database is written; production Mongo and the Pathlynks Postgres are never written (VA12, VA20). The B12 guard (no `.db(` outside `packages/db/src/client.ts`) stays green.
- **[I7].** Dependency bump: the new `pg` dependency (and any GitHub client) is added with a lockfile change only in the packages that need it; `pnpm -r typecheck` and `pnpm install --frozen-lockfile` succeed. The pre-push check is the full suite (`.13-2` a and b: auth unit and dependency change): `pnpm test` at the integrated head.
