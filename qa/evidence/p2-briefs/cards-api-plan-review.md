# Plan review brief: cards-api (independent plan approval, D-030 route)
You are a fresh, independent plan reviewer. You did not write the plan, and you judge it only against the sources.

- **Plan:** qa/evidence/p2-cards-api/plan.md, commit 0c93cfe on main.
- **Sources:**
  - The contract rows the plan cites in qa/contracts/.
  - qa/gates/plan-approved.md:14-16.
  - The branch source, read only with `git show wave/t-010-live-cards:<path>`.
  - Main's code: apps/api/src/{server,openapi,index}.ts, apps/api/tests/server.test.ts, packages/engine/src/cards/**.
  - T-050 in qa/QUEUE.md or qa/issues.jsonl.
  - D-029, D-030 and D-079 in docs/DECISIONS.md.

## Check
1. **Criteria:** C1-C11 must be verbatim and correctly scoped, and no in-scope contract line may be missing.
2. **Anchors:** spot-check at least 6 hunk anchors (main file:line, branch file:line) against the real files.
3. **Tenancy, JWT and consent:** every route must have tenancy/JWT/consent checks, and every route needs a cross-tenant and a no-consent negative test.
4. **No bypass:** the engine's mandatory semantic verifier and the crisis guard must stay on the path. No route may bypass the engine.
5. **New error mappings:** confirm that ProviderAuthorizationRefusedError, AbortError and CardFeedbackUnavailableError really are thrown on main's path, and that the plan's name-based match is safe.
6. **liveCards without requireSession:** is that safe against probing another tenant's student id?
7. **Open-question defaults:** rule on each of the 5 defaults: accept, or change with a reason. Escalate only if one needs product intent, as a HUMAN_GATE line.

## Output
- Write ONLY qa/evidence/p2-cards-api/review-1.md. It ends with `PLAN-APPROVE` (with any binding conditions, numbered) or `PLAN-REFUSE` (with the blocking reasons).
- Commit it on main by pathspec. End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Never
- Code edits, tests, python, live calls or Mongo.
- Editing .claude/**, qa/contracts or qa/gates.
- `git add -A`, or a push.

## Return
`PLAN-APPROVE|PLAN-REFUSE <sha>`, plus at most 6 lines.
