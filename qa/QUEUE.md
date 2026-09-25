# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

Six gates are UNANSWERED (sweep 2026-09-25 18:45):
- **crisis-guard-precision.md** blocks the T-005b merge. Recommended: (A) recall-only.
- **citation-guarantee-scope.md** blocks T-013. Recommended: (a) numbers + fixed vocabulary auto-accepted, the rest needs review.
- **edit-provenance.md** blocks the T-008 follow-up (ISS-051, high). Recommended: (a) source = counsellor-edit, original quote kept as 'edited from'.
- **counsellor-auth.md** blocks live mode and any deployment of apps/web (ISS-052, high). Recommended: (a) the existing Vidysea/Pathlynks login; which system?
- **erasure-fencing.md** blocks nothing now. Recommended: (b) confirm -> completion + 24h, plus HMAC audit key.
- **scribe-concern-level.md** blocks nothing now. Recommended: (a) flag and continue.

## Top-3 recommended next units (sweep 2026-09-25 18:45)

1. **Hygiene, high:** ISS-045 (`git worktree prune`, remove the orphan dirs incl. t-018 and otel.d.ts.tmp; restores the B8 data-boundary check) and ISS-044 (stamp qa/.last-tick every tick).
2. **ISS-t-008-c0-1 (medium):** type-check the edit value on the approval POST (B5).
3. **T-018 approval follow-ups:** the ungated parts first. ISS-051 and ISS-052 wait on the edit-provenance and counsellor-auth gates.

## Sweep notes (2026-09-25 18:45, shards 1+3 and 2 (shard 2 stalled; its checks finished by the consolidator) + consolidation)

- **Main re-verified by the checker:** typecheck 9/9, `pnpm -r test` 495/495.
- **Merged since the last sweep:** T-017 (cycle 2; checker probe 4/4 onError shapes safe, senior Approve) and T-008 approval UI (checker Mode D with its own Playwright script: submit gating, 0 writes before approval, exact approved facts after, 409 on a stale tab, 423 when fenced; console errors all from deliberate negative scenarios).
- **Bypass:** CLEAN. **Silent failures:** none. **Erosion:** none (the web layer delegates all approval logic to the engine).
- **Web safety:** demo mode unless VC_WEB_MODE is exactly 'live'; live mode uses connectFromEnv; the db-scope test scans apps/**; no NEXT_PUBLIC env; invalid decision bodies get 400 and write nothing. B11: 0 secret hits.
- **New ledger rows:** ISS-051 (edit provenance, high), ISS-052 (no login, high). Escalated: ISS-t-008-c0-1 to medium, ISS-044 to high. ISS-045 reconfirmed high and worsening.
