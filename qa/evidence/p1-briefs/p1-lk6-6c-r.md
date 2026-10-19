# p1-lk6 6c re-dispatch (merge already done)

Follow `qa/evidence/p1-briefs/p1-lk6-6c.md` with these changes:

1. **Skip the merge step.** Worktree D:/vc/.worktrees/int-lk6 (branch int/lk6) is already merged at a35c4d7 (merge 988ff0a + one-token fix).
   Instead, verify the resolution:
   - apps/api/src/index.ts imports carry both the LK1w and LK6 symbols, and nothing is dropped.
   - index.ts ~343: the default extractor uses `httpSetup.studentProvider` (D-105 Q4: the cheap chain for student-facing calls; falls back to the base provider when VC_TEXT_CHAIN is unset).
   - apps/api/tests/chat-profile.test.ts: the LK1w section is verbatim from main (`git diff main -- <file>` shows only LK6 additions), then the LK6 section follows.
2. Already green on a35c4d7 (logs in D:/vc/.tmp/lk6m2-*.log): chat-profile 21/21, index 8/8, voice 67/67, voice-wiring 16/16, tsc exit 0. Reuse them if you confirm the HEAD and the files are unchanged; do not re-run them.
   Re-run on a35c4d7 one file at a time: server, chat, anonymous-route (those were green only on 988ff0a).
3. Then ONE full `pnpm -r --workspace-concurrency=1 test` under the test lock, plus `python contracts/verify_contracts.py`.
   Long lock waits are normal: PID 47984 and 36944 hold or held slots, and you must never kill either.
4. If everything is green, run `--stamp-6c-green` from the int-lk6 worktree. Never commit `qa/.6c-green`. Do not push.
5. Return one line: `int-lk6 <sha> 6c GREEN|RED <full-run counts>`, and for RED, the failing test ids.
