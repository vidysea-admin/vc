# Checkpoint: pc-reserved-ids-2, coordinator B (blind), cycle 0
Worktree D:/vc/.worktrees/pc-reserved-ids-2, branch wave/pc-reserved-ids-2, head 360ff8c (code eaeab58), merge-base with main eb2c132 (verified). Policy-Version proportional-verification/2026-10-19.17. Tier L, dual.
Did not read the other coordinator's verdict or checkpoint.

Plan: (1) read the diff eb2c132..HEAD; (2) trace the scope claim in chat.ts, voice.ts, anonymous.ts and packages/db/src/tenant.ts; (3) run the regression set in the worktree; (4) write hostile variants in a scratch copy (git archive eaeab58, pnpm install --offline with store D:\.pnpm-store\v10) at scratchpad/fals/apps/api/tests/zz-checkerB-hostile.test.ts; (5) one mutation per criterion plus a scope mutant, restored and byte-compared; (6) doc accuracy against the code.

Scope trace: chat.ts:855 and voice.ts:1712 set tenantId = partner.partnerId. Every chat route (thread create/get, turn, profile get, fact decision) goes through the same handle() and dbForTenant(ctx.tenantId). The voice session route is the same; the voice stream uses the minted claims. Anonymous text and voice (vck_pub_) get NO_DB (voice.ts:1517) and anonymous.ts reads no tenant. tenantScopedDb filters tenantId exactly. No route lets a vck_srv_ key name another tenant.
