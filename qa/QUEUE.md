# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

Four gates are UNANSWERED (sweep 2026-09-25 16:45 confirmed there is no off-disk answer):
- **crisis-guard-precision.md** blocks the T-005b merge. (A) recall-only / (B) A + a later downgrade layer / (C) 4th patch. Recommended: A.
- **citation-guarantee-scope.md** blocks T-013 (STALLED c3). (a) auto-accept only numbers + fixed vocabulary; every other text fact needs counsellor review. Recommended: a.
- **erasure-fencing.md** blocks nothing now. Q1 fence: (b) confirm -> completion + 24h. Q2 audit pseudonym: HMAC with `VC_AUDIT_HMAC_KEY`. Recommended: b + yes.
- **scribe-concern-level.md** blocks nothing now. (a) concern = flag and continue. Recommended: a.
Answered, on record: mongo-host, dpdp-erase-design, crisis-safety-layers, config-audit-fixes (ISS-001/004/005 verified fixed this sweep), real-transcripts-gemini, maker-start.

## Top-3 recommended next units (sweep 2026-09-25 16:45)

1. **T-017 fix cycle 1.** The checker's independent check FAILED cycle 0 (a708ee7): an async onError crashes the fence-sweep host. Fix: `await` the handler inside try/catch, plus a 0-unhandledRejection test. The maker is already editing erasure.ts (16:37, uncommitted).
2. **Hygiene, ISS-045 (high):** `git worktree prune`, remove the 5 orphan worktree dirs and `.worktrees/otel.d.ts.tmp`, so `data_boundary.py` can run again. Also ISS-044: stamp qa/.last-tick every tick.
3. **T-008 counsellor diff-approval UI.** Its prerequisite ISS-t-007-rev-6 is fixed (T-016). It touches UI, so the checker will run Mode D with its own browser.

## Sweep notes (2026-09-25 16:45, sharded: 3 shards + 1 adjudication + consolidation)

- **Main re-verified by the checker:** typecheck 9/9, `pnpm -r test` 434/434, contracts PASS (vacuity).
- **Bypass:** CLEAN. T-014, T-015 and T-016 each merged after a matching-cycle PASS with no open Block.
- **T-017:** cycle-0 PASS overturned by an INDEPENDENT CONCURRENT CHECK = FAIL. The review Block (async onError -> unhandledRejection) was reproduced 7/7.
- **Stalled:** T-005b (c3, gate crisis-guard-precision), T-013 (c3, gate citation-guarantee-scope).
- **Liveness:** the maker is active (erasure.ts edited 16:37) but has not stamped .last-tick since 06:21 (ISS-044).
- **Safety:** B1-B9, B11, B12, B14 and B15 COVERED with outcome tests (db 162/162, engine 129/129; real exported span; read-back-zero erasure). B13 PARTIAL (no live-provider run yet). B10 and B16 MISSING (T-010 and T-012 not built).
- **Hooks:** ISS-001/004/005 verified fixed. The data-boundary scanner still crashes on orphan worktrees (ISS-045, now high).
- **Ledger hygiene:** stale high rows ISS-t-011-c3-rev-1 and ISS-t-007-rev-6 closed as fixed, citing their closing verdicts.
- **Contract:** B15 clarified to cite D-015/D-016/D-017 (no weakening).
- **Erosion signal:** erasure.ts grew +117 lines over 3 units, one special case per unit. Accreting, not oscillating; watch it.
- **Tokens:** opus_sub_share 0.19. Units at fix cycle >=3: T-013, T-005b.
