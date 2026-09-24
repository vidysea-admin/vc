# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

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

## Top-3 recommended next units (TASKS.md order; T-002b and T-004 are currently in
## `.worktrees/`, checker verdicts pending there — not judged by this sweep)

1. **T-003** — Student Knowledge Graph collections + consent/purpose model, in
   `virtual_counsellor`. Depends on T-002b (schema hardening) merging first.
2. **T-005** — Skill loader + first skills; hard-rule guards. Waits on T-002b merge.
3. **T-006** — MCP servers: student-profile, university-kb. Depends on T-003, so also waits
   on T-002b merge.

## Sweep notes (2026-09-25, this sweep)

- **Bypass detection:** CLEAN. Every commit on `main` since `7c84eb6` traces to a manifest+verdict
  (T-002 scaffold: `4e845fd` → PASS `253d70d` → merge `468234d`), an authorized D-entry (D-007, D-008),
  or a checker-owned surface (contract amendments, ledger, gates, ticks). `dee1b8e` (.env.example +
  .gitignore) is a trivial single-file config fix tied to ISS-013, not a unit requiring ceremony.
- **Pair-state:** clean for `t-001-plan-doc` and `t-002-scaffold` (both `checked-PASS`, cycle numbers
  match their verdicts). `t-002b-schema-hardening` and `t-004-langfuse` manifests/verdicts live only in
  their worktrees, out of this sweep's binding.
- **Feedback-inbox:** both entries already marked FOLDED from the prior sweep; nothing new to fold.
- **Contract staleness / consistency (NEW FINDING, ISS-015):** `qa/contracts/counselling-engine.md` B12
  was amended (`6ff9dd9`, critical, human-approved) to grant full CRUD inside `virtual_counsellor` with
  only `dropDatabase` gated — but `ARCHITECTURE.md` §5 and `qa/adapter.json`'s `isolation.forbidden`
  list still say drops/bulk deletes need a gate. D-008's `Changes-authorized` covered the earlier
  single-DB-name update to those two files, not this later loosening. Filed `ISS-015` (medium): update
  both files to match B12; the drift is in the conservative direction (over-restrictive, not
  under-restrictive), so nothing was unsafely widened, but the docs and the contract now disagree.
- **Enforcement liveness:** hooks installed per D-006 (Approved-by Umesh) — `decisions-append-guard.ps1`,
  `mc-precommit.ps1`, `mc-sessionstart.ps1`, `lab-session-start.ps1`/`lab-session-end.ps1` all wired in
  `.claude/settings.json`; repo has commits. `qa/loop.md` Stop line lists all 7 maker terminal states;
  human-gate list not contradicted by `qa/adapter.json` (no `improve` block). Loop-Doctor-lite's 3
  questions (spin / Goodhart / wrong-answer-to-completion): no "yes" found.
- **B11 secrets check:** re-ran `git log -p --all -S<prefix>` for both `.env.example` key names.
  `GEMINI_API_KEY`: not found. `MONGODB_URL`: the generic 8-char scheme prefix (`mongodb:`) matches
  prose in the contract/gate/adapter describing the URL *shape* — not a leak. Re-checked with a
  host:port-specific fingerprint (not printed): not found anywhere in tracked history or the working
  tree outside `.env`. No secret values in the tree.
- **Data boundary:** `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/vc` — same
  single hit as ISS-003 (`docs/DECISIONS.md`, 1 email, D-006's Links line), no new violation on `main`.
- **Silent-failure hunt** over code PASSed since the last sweep (T-002 scaffold, `468234d`): CLEAN —
  every touched file is boilerplate (8-9 line index.ts stubs, Zod schemas, tests); no catch/except,
  no masking fallback, no unguarded side effect in the diff.
- **Token ledger:** `opus_sub_share` 0.017 (well under the 25% flag threshold); no unit at fix cycle
  ≥3 (`t-002b` is at cycle 1). No finding.
- **Goal coverage / drift:** no `.goal/goal.json` in this project — checks 5/6 not applicable.
- **Structural erosion / code-graph blast radius:** no `graph.json` exists yet; too little code on
  `main` (one PASSed scaffold unit) for churn/duplication signal to be meaningful. Skipped, not run.
