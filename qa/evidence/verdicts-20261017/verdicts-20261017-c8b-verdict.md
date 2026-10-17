CONCERN_FIX: PASS

Checked b61434e (on 975a606) in worktree C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/c8b, 2026-10-17T07:03:49+05:30.
- pnpm typecheck (all 9 packages, via vc-testlock): exit 0, no errors.
- pnpm --filter @vc/api test: 57 pass / 0 fail (includes both new ISS-t-034-concern-hook tests).
- engine tests/webhooks-*.test.ts + tests/scribe-concern.test.ts: 88 pass / 0 fail.
- Hostile M1 (catch body replaced by 'throw err'): api 56 pass / 1 FAIL (the read-back-throws test). RED as expected. Restored.
- Hostile M2 (outcome.kind !== "fenced" guard removed): api 56 pass / 1 FAIL (fenced-student test). RED as expected. Restored.
- W1: try/catch confirmed in diff; logs webhook_readback_failed via errorLabel, records readback-gap row (idempotent gapId), test asserts 200 + 1 gap + 0 outbox rows.
- W2: fenced start emits nothing; test pre-seeds a stored concern edge so the guard is load-bearing.
- PII: log/gap strings carry only errorLabel (name+code), route id, student/session ids; no quotes or transcript text.
Tree after mutations: clean (git status empty). Worktree removed.
