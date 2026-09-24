# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

- **qa/gates/mongo-host.md** — unanswered (ISS-012, high). Is `MONGODB_URL` a dev/work server? Blocks T-003+ (any Mongo write) only; T-002b/T-004/T-005 proceed.

- **qa/gates/config-audit-fixes.md** — unanswered. (a) Authorize a DECISIONS entry
  (Approved-by: Umesh) to fix ISS-001 (decisions-append-guard fails open), ISS-004
  (unframed injected DECISIONS text) and ISS-005 (cwd-relative hook paths vs
  `${CLAUDE_PROJECT_DIR}`) — shared-template bugs, fix upstream in
  `D:/ai_os/templates/lab-protocol` too? (b) ISS-003: operator email in append-only
  `docs/DECISIONS.md` D-006 makes `data_boundary.py` exit 1 permanently — accept as a
  documented false positive, or authorize a one-time redaction? Re-confirmed this sweep:
  `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc` still exits 1
  on `D:\vc\docs\DECISIONS.md` only (1 email) — no new violation, matches ISS-003 as-is.
  Does not block the build path (T-002+ proceed); re-raised every sweep until answered.

## Top-3 recommended next units (TASKS.md order; T-002 is currently being built in
## `.worktrees/t-002-scaffold`, not judged by this sweep)

1. **T-003** — Student Knowledge Graph collections + consent/purpose model (work DB).
   Depends on T-002 (monorepo scaffold + Zod schemas) — blocked until T-002 PASSes.
2. **T-004** — Langfuse self-hosted compose + tracing wiring. Depends on T-002 — blocked
   until T-002 PASSes.
3. **T-005** — Skill loader + first skills; hard-rule guards. Depends on T-002 — blocked
   until T-002 PASSes.

## Sweep notes

- No unbacked bypass found: every commit on `main` since init traces to a manifest+verdict
  (T-001) or an authorized D-entry (D-006 wiring, genesis/scaffold commits).
- Pair-state clean: `t-001-plan-doc` manifest Fix cycle 1 / Status `checked-PASS` matches
  verdict `Cycle checked: 1` (commit `748e4e4`).
- Feedback-inbox: both entries folded this sweep (already substantively carried by contract
  A8 and A3; no new amendment required) — see `qa/feedback-inbox.md` FOLDED annotations.
- Enforcement liveness: hooks installed per D-006 (Approved-by Umesh), repo has commits,
  `qa/loop.md` Stop line lists all 7 of the maker's terminal states, human-gate list is not
  contradicted by `qa/adapter.json`.
- No code has PASSed yet (T-001 is a doc unit) — silent-failure hunt and structural-erosion
  checks have nothing to scan on `main`.
- `.worktrees/t-002-scaffold` intentionally excluded from every check above (in-progress
  maker build, out of this sweep's binding).
