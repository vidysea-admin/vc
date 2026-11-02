# Plan — authority-guard-120-121 (ISS-120, ISS-121) — drafted 2026-11-02T18:53:26+05:30 by a read-only planner at HEAD 10a43628
Status: AWAITING PLAN APPROVAL (multi-file security change; plan mode first per CLAUDE.md). after: export-token-strip (dual: B PASS, A pending).

## Guard
Random per-session-row `incarnation` on SessionDoc, stamped $setOnInsert by ensureScribeSessionRow (facts.ts:694-704, collections.ts:122); a NEW small reader (return shape of ensureScribeSessionRow unchanged: facts.test.ts:756-758). Captured at invocation start into invocation-private authority beside approvalInvocation (graph.ts:79), never in graph State (graph.ts:118-119). Bound in: (1) summary selector facts.ts:801 -> recreated row = matchedCount 0 -> SessionRowMissingError before applyApprovedDiff; (2) authorize before/after the write node graph.ts:249-266 (pattern escalation.ts:227-234, alwaysUndo on lostAuthority); (3) choke point authorizeSnapshot/deps.authorize graph.ts:120,:311 (covers readOutcome, resume, recover, inspect). Failure = existing {kind:"fenced"} / ProviderAuthorizationRefusedError; no API change. Legacy rows: absent==absent. Not threadId (scribe:${sessionId} is deterministic) and not consent (no product writer).

## Criteria (red first)
- A1 ISS-120 db: facts.test.ts near :810-930 — held stale recordApprovedSessionSummary after erase+purge+release+regrant+same-ID recreate rejects; winner summary byte-identical.
- A2 ISS-120 facts: scribe-persistence.test.ts ~:423-650 via writeApproved — zero stale facts/edges after release.
- A3 ISS-121: scribe-erasure-fence.test.ts :61-300 — held final getState then erase/regrant -> outcome not awaiting_approval (fenced or refused), no summary/facts returned.
- A4 no false positive: normal start->approve->written; idempotent resume/deadline retry on same incarnation; inspect/already_resolved unchanged.
- A5 scope: those suites + db-scope.test.ts green, db+engine typecheck 0, no assertion weakened, diff limited to listed files.
Red tests note: real-clock window is bounded by D-016 (90 s fence hold); oracle uses simulated now; guard = defense in depth.

## Facts
files: packages/db/src/{facts,collections}.ts, packages/engine/src/scribe/{nodes,graph}.ts; tests packages/db/tests/facts.test.ts, packages/engine/tests/{scribe-persistence,scribe-erasure-fence}.test.ts. schema: yes (one optional field, no index/migration). surface: library only. lanes: code/test, fake db. owner: one builder. Tier L, dual-trigger: security packages/db/src/facts.ts:801. Dual check: required. Round: 7 files, 5 criteria, est 75 min — export-token-strip 2 files/25 min plus async-race tests; slow-plan: three held-driver race tests across db+engine. Starting harness: maker scratchpad oracle-authority.test.mts (f655eb21 session).

## Maker defaults (Umesh may override)
- P1 incarnation in exportStudent: record as non-secret comparison key, no erasure.ts edit (keeps files disjoint from profile-facts-token-strip). Alt: strip it.
- P2 residual window inside applyApprovedDiff (facts.ts:529-532, hold after summary succeeded): file as a ledger row, not in this round. Alt: add incarnation to its pre-check.
- Report-only: decisions.ts recordRejectReasons can leave a stale audit row for an erased thread.
