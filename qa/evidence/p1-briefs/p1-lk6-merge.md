You are a /maker build subagent. Your job is a merge resolution only, with no new behaviour.

Worktree: D:/vc/.worktrees/int-lk6 (branch int/lk6 at 5d5df6f = main, which carries LK1w). Work only there.

1) Run `git -C D:/vc/.worktrees/int-lk6 merge --no-edit p1/lk6`. It conflicts in two files:
   - apps/api/src/index.ts, in the imports. Take the union: `createStudentFactExtractor` goes in the @vc/engine import, and `loadTextChainConfig` stays in the @vc/providers import. Then check that the rest of startApi carries BOTH the LK1w studentProvider wiring and the LK6 default extractor wiring.
   - apps/api/tests/chat-profile.test.ts:
     - Imports: keep both sets (CHAIN_ENV, GOOD_CLAIM, stubOllamaFetch from ./anonymous-fixtures.js; MockProvider from @vc/providers; createStudentFactExtractor from @vc/engine).
     - Body: keep the "P1 LK1w" section in full first, then the "p1-lk6 (D-104, D-105)" section in full. Rebuild the function and brace boundaries by hand. Take each section verbatim from its own branch (`git show main:apps/api/tests/chat-profile.test.ts` and `git show p1/lk6:apps/api/tests/chat-profile.test.ts`). Do not change any assertion.
   Also decide this: the LK6 default extractor is built from `httpSetup.provider`, while LK1w moved student chat to `studentProvider`. Keep the extractor on `httpSetup.provider`, as LK6 shipped it; do not change behaviour. Note the choice in the commit message.
2) Commit the merge with a narrow pathspec.
3) Run one file at a time, unpiped, inside `timeout 900`, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with TMP/TEMP=D:/vc/.tmp. Lock waits are long and normal; keep waiting. Run:
   - apps/api: chat-profile, index, server, chat, voice, voice-wiring, anonymous-route;
   - `pnpm -C apps/api exec tsc --noEmit`.
   Every test must pass. Never run a full suite.
4) Do not stamp 6c and do not push. Never kill a PID you did not start (leave 47984 and 36944 alone).
Return one line: `int-lk6 <sha> merged <pass counts>`, or the failing test node ids.
