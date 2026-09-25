# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

- **qa/gates/crisis-guard-precision.md — UNANSWERED (blocks T-005b merge).** T-005b STALLED after 3 cycles (diagnosis qa/debug/t-005b-guard-hardening-cycle3.md). Umesh chooses: (A) recall-only keyword guard now, false alarms accepted until T-012; (B) A + a later 'reviewed, likely benign' downgrade layer from T-012 (needs a B16 amendment); (C) a 4th narrow patch (not recommended). Main still runs the pre-hardening T-005 guard.

- **2026-09-25 gate answers (checker scribed):** `dpdp-erase-design` = (a) hard delete + confirm + read-back verification (B15); `crisis-safety-layers` = (b) + escalate to admin and concerned counsellors (B16, SLA not set); `config-audit-fixes` = (a) YES, fix ISS-001/004/005 (Approved-by: Umesh), (b) email accepted, correct approver to umeshsugara@vidysea.com via a new D-entry; `real-transcripts-gemini` = anonymise first, raw allowed as a fallback (B13). **Maker owes:** the D-entries recording these via append_decision.ps1, plus the hook fix unit.

- **qa/gates/mongo-host.md**: ANSWERED 2026-09-25. Production server, engine's only database is
  `virtual_counsellor` (contract B12, now full CRUD except `dropDatabase`). Of the three items this
  sweep previously listed as owed: (a) `qa/adapter.json` isolation line — DONE (`b1e6e83`, now reads
  "Mongo: database 'virtual_counsellor' only..."); (b) a DECISIONS entry for the production-server DB
  choice — DONE (D-008, `b1e6e83`); (c) the B12 DB helper + its refuse-other-name test — still owed,
  ships with the first Mongo unit (T-003).

- **qa/gates/config-audit-fixes.md** — still unanswered. (a) Authorize a DECISIONS entry
  (Approved-by: Umesh) to fix ISS-001 (decisions-append-guard fails open), ISS-004
  (unframed injected DECISIONS text) and ISS-005 (cwd-relative hook paths vs
  `${CLAUDE_PROJECT_DIR}`) — shared-template bugs, fix upstream in
  `D:/ai_os/templates/lab-protocol` too? (b) ISS-003: operator email in append-only
  `docs/DECISIONS.md` D-006 makes `data_boundary.py` exit 1 permanently — accept as a
  documented false positive, or authorize a one-time redaction? Re-confirmed this sweep:
  `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc` still hits
  `D:\vc\docs\DECISIONS.md` (1 email) — same known cause as ISS-003, no new violation. (The
  scanner also flagged the same file inside `.worktrees/t-002b-schema-hardening` and
  `.worktrees/t-004-langfuse` — identical tracked content checked out twice, not a new issue,
  out of this sweep's binding either way.) Does not block the build path; re-raised every
  sweep until answered.

## Top-3 recommended next units (sweep 2026-09-25 10:55)

1. **T-013 cycle 3 (last cycle)** — answer the cycle-2 FAIL (verdict 5e7d85c, 10:25). Fix gap open.
2. **T-014** — T-011 erasure follow-ups; carries ISS-t-011-c3-rev-1 (high: linkTracked over-deletes a pre-existing edge) and the missing client timeoutMS.
3. **T-008 prerequisite ISS-t-007-rev-6 (high)** — checkpoint collections governance, before the diff-approval UI.
Hygiene (not a unit): ISS-044 re-arm .last-tick stamping; ISS-045 `git worktree prune` + remove the 5 orphaned dirs so data_boundary.py runs again.

## Sweep notes (2026-09-25 10:55, sharded: 3 shards + consolidation)

- **Main re-verified by the checker itself:** typecheck clean in 9/9 packages; `pnpm -r test` 373/373 pass; contracts validator PASS (vacuity).
- **Bypass:** CLEAN. Every merge since 25d6b5e (t-002b, t-004, t-003, t-005, t-003b, t-006, t-007, t-009, t-011) traces to a matching-cycle PASS; config commits trace to D-010/D-011.
- **Pair-state:** T-013 FAIL c2, maker response pending; T-005b STALLED c3 with diagnosis, gate unanswered; T-014 not started. Done units T-007/T-011 carry open highs that are forward-tasked to T-008/T-014 (accepted convention).
- **Safety invariants (outcome-proven by shard runs):** B7 COVERED (real export path via LangfuseSpanProcessor + RecordingExporter; hostile host variants incl. trailing dot, punycode, homoglyph); B11 COVERED (0 secret hits in full history); B12 COVERED (single helper getVcDb, refuse-other-name + static no-`.db(` scan, no dropDatabase call site); B13 COVERED; B15 COVERED (confirm/read-back-zero/partial-failure/fencing against fakes with production indexes). B9 PARTIAL (main guard is pre-hardening); B16 MISSING (T-012 not started).
- **Silent failures:** none high. The erasure undo() deleteMany has no timeoutMS (same root as the T-014 item, not re-filed).
- **Erosion signal:** crisis.ts regex-boundary patching churned for 3 cycles without converging (see the gate above).
- **Checker-quality signal:** review agents overrode a checker PASS 3 times (T-003b, T-007, T-005b), plus the T-004 PASS overridden by review. Standing rule: review agents run alongside the checker, and a Block overrides a PASS.
- **Inbox:** entry 04:47:54 folded into B16 (recall >= 0.95).
- **Token ledger:** opus_sub_share 0.212 (<0.25). Fix cycle >=3: T-011 (closed), T-005b (stalled).
