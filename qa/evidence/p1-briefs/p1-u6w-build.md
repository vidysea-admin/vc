# You are a /maker build subagent: U6w, wire U6b profile ranking into the chat API (CORE-REQUEST, fixes ISS-163)
- Protocol C:/Users/Lenovo/.claude/skills/maker/SKILL.md, policy proportional-verification/2026-10-18.15. Use `git -C <dir>`, never `cd X && cmd`. Never `git add -A`. Never touch .claude/**. Do NOT push. Tests ONLY via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (long waits on the shared lock are normal; never quit on a busy lock).
- C: is nearly full. Create your worktree on D: only: `git -C D:/vc worktree add D:/vc/.worktrees/p1-u6w -b p1/u6w main` (main = 7d2840e, which already has U6b and U8r). Then run `pnpm install --offline --frozen-lockfile` there.
- Read first: ARCHITECTURE.md, qa/manifests/p1-u6b-profile-ranking.md, qa/verdicts/p1-u6b-profile-ranking.md (FINDINGS 1), the ISS-163 row in qa/issues.jsonl, apps/api/src/chat.ts (U8r privacy logic: do not regress it), and D-097 item 3 in docs/DECISIONS.md (real per-option numbers are NOT PROVEN, ISS-167).

## Goal
After `runStudentTurn` in apps/api/src/chat.ts, the chat path uses the U6b ranking (rankOptions) on the student's confirmed profile facts, so the counselling turn can show the student's options ranked.
1. ISS-163: profile facts stored by the chat path carry `source: 'chat'` (the db label), and rankOptions ignores them unless they are mapped. Map `chat` to the confirmed source the ranker accepts, in ONE place, with a test that fails before the fix (hostile H4 from the U6b verdict: a 'chat'-sourced fact must change the ranking; an unconfirmed or 'chat-extracted' fact must not).
2. Any per-option number (cost, scholarship chance, visa ease) that reaches the student carries a visible `NOT PROVEN` label (D-097 item 3, ISS-167). No number is presented as fact.
3. No change in tenancy: ranking reads only this tenant's and this student's facts. Add a test with two tenants in which tenant B's facts never affect tenant A's ranking.
4. Ranking failure never breaks the chat turn: the reply still returns, and a server log line names the failure. No raw profile text is logged (U8r redaction holds).
5. Anonymous mode (U7) never calls ranking with stored facts.
- TDD: write a failing test first for each item. Do not weaken or delete any existing assertion.

## Manifest + pre-check
- Create qa/manifests/p1-u6w-rank-wiring.md (copy the field layout of qa/manifests/p1-u6b-profile-ranking.md). Pin `Policy-Version: proportional-verification/2026-10-18.15`. Give one criterion per item above, verbatim. Derive the tier from the triggers. If the diff touches a tenancy-scoped read, add `dual-trigger: tenancy <path.ext:line>` and `Dual check: required`; otherwise set `Dual check: no` with the reason. Add `Tests[<id>]` lines (.13-6).
- Pre-check[<id>] lines on the final sha: the touched apps/api test files plus chat.test.ts, chat-privacy.test.ts, the anonymous-route tests, the U6b ranking tests, and `pnpm -r typecheck`.
- Record one falsification per criterion, run on a scratch copy UNDER D:/vc/.worktrees/ (not C:).
- Set `Status: ready-for-check`, run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>` and fix every ERROR, then commit with narrow pathspecs on p1/u6w.
- Return ONE line: `p1-u6w-rank-wiring <sha> ready (tier X, dual yes|no)` or `BLOCKED <reason>`.
