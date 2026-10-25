# Build brief: cards-api (T-010 slice a) (/maker build subagent)
Policy-Version: proportional-verification/2026-10-19.17.
- **Plan:** qa/evidence/p2-cards-api/plan.md (0c93cfe).
- **Approval:** qa/evidence/p2-cards-api/review-1.md (3640726), PLAN-APPROVE with 8 binding conditions. Every one of the 8 conditions overrides the plan where they differ. Cite each condition id in the manifest with how it is met.
- **Branch source:** wave/t-010-live-cards (fb5959c). Read it with `git show` only, and never edit that worktree.

## Workspace
- Create a new worktree at D:/vc/.worktrees/cards-api on branch wave/cards-api, from main HEAD.
- Link node_modules only via a junction to D:/vc/node_modules.

## Scope
- Edit only apps/api/src/{server,openapi,index}.ts and apps/api/tests/server.test.ts, in place, citing file:line for each hunk.
- Create no new file and make no packages/ edit. If the review or the plan forces either, stop and return BLOCKED-SCOPE.
- The card-feedback writer stays unbuilt: the route returns the typed 503, and the OpenAPI text and the manifest say it never persists (T-050 stays open).

## Steps
1. **TDD in the plan's order, with the review's corrections applied:**
   - fence = 403 consent_required;
   - mapError scoped to the cards routes, or pinned by a test;
   - tenant-B-with-consent negatives on all routes;
   - the corrected criteria cites;
   - the anchors :205 and :884.
2. **Manifest** qa/manifests/cards-api.md, containing:
   - the criteria verbatim;
   - `Dual check: required`, plus `dual-trigger: tenancy apps/api/src/server.ts:<line>`;
   - Pre-check[<id>] lines on the final sha;
   - one falsification per criterion, each run in a copy;
   - Tests[] lines;
   - the KB-wiring go-live gap (main.ts supplies no http.kb), recorded as an open note.
3. **Tests:** run the affected apps/api tests and tsc for apps/api. Use `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 900 pnpm exec tsx --test <files>`. Long waits on the lock are normal. No full suite.
4. **Lint** with `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/cards-api.md --root <worktree>`. Set `Status: ready-for-check` with `Fix cycle: 0` only when everything is green.

## Never
- python, live LLM or provider calls, or real Mongo.
- Edits to .claude/**, qa/contracts, qa/gates, qa/verdicts, qa/issues.jsonl or docs/DECISIONS.md.
- `git add -A`, or a push.
- Killing processes you did not start.

## Commit and return
- Commit by pathspec, with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Return `READY cards-api <sha>` plus at most 6 lines: conditions 1-8 met y/n, and test counts.
