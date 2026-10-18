# P1 U5a checker — /checker Mode A, fresh, independent
Role: checker. Unit: qa/manifests/p1-u5a-api-contract.md in worktree S/p1-u5a (branch p1/u5a, head e658f80), S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Follow ~/.claude/skills/checker/SKILL.md, Policy-Version proportional-verification/2026-10-15.12. Never touch D:\vc working tree. Never edit .claude/** or product code.
Read the manifest and the contract criteria it cites in S/p1-u5a/qa/contracts/counselling-engine.md (B24 / A20 rows) yourself.
Prove OUTCOME, not construction, with hostile variants:
- go-live gate (apps/api/src/go-live-gate.ts): refuses all 4 targets today against the real U0 gates (copy S/p1-u0/qa/gates into a temp dir). Hostile: `B13-signed: SIGNED <iso> by Claude`, `B13-signed: PENDING ` with trailing space/dot, trailing-dot or lowercase variants, a later "Answered:" line for option c overriding an earlier a, missing a10 evidence file, Nights-mode line commented in a code fence. Each must refuse. Construct one fully valid temp gate set and show it allows exactly the intended targets (publish does not need g-prod; voice needs a10).
- STUDENT_API_DRAFT: every operation x-enabled:false; OPENAPI_DOCUMENT and API_ROUTES unchanged vs origin/main (git diff); no new route actually mounted in server.ts (grep + run api tests).
- Zod: claims status only verified|attributed|unverified; anonymous counter strict (extra key rejected); isSyntheticStudentId("syn-x") true, ("SYN-x"," syn-x") per spec.
- Reuse the builder's test runs only after identity checks; run missing affected tests via `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u5a/packages/schemas test` and `... -C <S>/p1-u5a/apps/api test` (lock waits are normal). No full suite.
- One falsification per acceptance criterion, in a copy.
Write verdict to S/p1-u5a/qa/verdicts/p1-u5a-api-contract.md (Cycle checked: 0, PASS/FAIL, Metrics line, PROPOSED-ISSUE lines) and commit it on p1/u5a with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Report verdict + commit SHA in under 20 lines.
