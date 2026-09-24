# Verdict — t-003-student-kg

**Date:** 2026-09-25
**Cycle checked:** 0
**Checker:** fresh claude-sonnet-subagent (Mode A unit check), bound to `D:\vc\.worktrees\t-003-student-kg` (branch `wave/t-003-student-kg`)
**Contract:** qa/contracts/counselling-engine.md — judged B2, B3, B4, B5, B8, B11, B12, B14
**Manifest:** qa/manifests/t-003-student-kg.md (Fix cycle 0)

## What I re-ran myself (bound worktree)
- `pnpm install` → exit 0, "Lockfile is up to date" — matches.
- `pnpm -r typecheck` → exit 0, all 8 packages "Done" incl. `packages/db` — matches.
- `pnpm -r test` → exit 0; `packages/db` 31/31 pass, every other package `fail 0` — matches exactly, same test names/order.
- `python contracts/verify_contracts.py` → exit 0, "PASS by vacuity" — matches.
- `git log -p 996f344..d456621` grepped for `mongodb://`/key/secret patterns → only the documented placeholder `mongodb://h:1/otherdb` in source+tests. No leaked value.
- `git diff --stat 996f344 d456621`: additions only, 18 files, all inside `packages/db/**`, `pnpm-lock.yaml` (126 insertions, 0 deletions), `qa/manifests/t-003-student-kg.md`. No deletion/rename of any existing function, export, route, test, or config key; no file touched outside the manifest's "What changed" list. `d4a0d65` confirmed to be a merge of `main` (contract/ledger only), not unit work.

## Independent verification beyond the manifest (throwaway copy, never the worktree)
Copied worktree (excl. `.git`/`node_modules`) to a scratch dir, `pnpm install`, confirmed GREEN (31/31) before any edit.
- **B12 hostile-variant probe (own script, not the manifest's):** `getVcDb` refused every one of `"Virtual_Counsellor"`, `"virtual_counsellor "`, `" virtual_counsellor"`, `"virtual_counsellor\u0000"`, `"admin"`, `"VIRTUAL_COUNSELLOR"`, `"virtual_counsellor\n"`, `"virtual_counsellor;drop"`. `undefined` correctly defaults to `VC_DB_NAME` (documented, intentional default — not a bypass).
- **Capability-coverage table, all 7 rows reproduced independently:** wrong-DB-name refused, URI-default ignored, no-`.db(`-outside-helper, consent-required, minor-guardian, no-write-without-approve, supersede-not-delete. Each: green-before confirmed in copy, single-hunk falsifying edit applied, named test went red for the exact reason the manifest states, reverted, full suite re-confirmed 31/31 after the last row.
- **B12 static-scanner gap (own probe):** planted `client.db ("x")` (space before paren), `client["db"]("x")` (bracket access), and a `.mts` file calling `.db(` directly — the scanner (`db-scope.test.ts`) missed all three (0 offenders, still green). This does not violate B12's literal wording (a test proving no module calls the literal `.db(` substring outside the helper — which it does for what it scans) so it is a **finding, not a FAIL**. Filed as ISS-t-003-student-kg-1 (medium).
- **B14 (outcome, not construction):** `applyApprovedDiff`/`link`/`requireConsent` tests write through `FakeCollection` (real `Map`-backed storage, not a call-recording mock) and read the outcome back via `.findOne`/`.all`/`.size` — e.g. supersede-not-delete asserts the old doc is still present with `validTo` set, read back after the write. This is a genuine outcome proof, not a "was called with args" assertion. `connectFromEnv`'s claim (URI default ignored) is proven the same way, via `dbCalls` read-back on the fake client. **B14 holds.**
- **B3 scope note:** this unit's write-gate (`applyApprovedDiff` only writes when `decision.approve===true`) is the DB-layer half of B3; the LangGraph `interrupt()` itself is explicitly T-007's job per TASKS.md ("Post-session scribe graph … → interrupt → approve → write", depends on T-003). Correct layering for this unit's scope, not a gap.
- **UI surface:** confirmed from diff — only `packages/db/**`, `pnpm-lock.yaml`, `qa/manifests/**` changed. No `apps/web` or browser-reachable path touched. Mode D not applicable.

## Ledger
- **ISS-012** (`fixed`, noted "verified only when a unit ships the B12 DB helper + its refuse-other-name test") → moved **`fixed → verified`**: this unit ships exactly that, independently re-confirmed above.
- **ISS-t-003-student-kg-1** (new, medium, `contract-B12`): static `.db(` scanner misses whitespace/bracket-access/`.mts`/`.tsx` obfuscation. Does not fail this unit; fix direction filed.
- No other open issue names this unit.

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (B2, B3, B4, B5, B8, B11, B12, B14), 0/0 invariants (contract has no separate `[I*]` invariants section)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 7/7 rows reproduced
LIVE-BROWSER: not-applicable (changed paths: packages/db/**, pnpm-lock.yaml, qa/manifests/t-003-student-kg.md — no UI surface)
ISSUES-WRITTEN: ISS-012 (fixed→verified), ISS-t-003-student-kg-1 (new, medium)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every verify command reproduced exactly as claimed, no secret/URI leakage in the unit's commits, diff scope is additions-only and matches "What changed" exactly. All 7 capability-coverage rows independently re-falsified for the stated reason in a fresh throwaway copy, plus an own hostile-variant probe against B12's guard (8 adversarial names, all refused) and a disclosed (non-blocking) gap in the static `.db(` scanner. B14's outcome proofs are genuine write-then-read-back through real in-process fake storage, not call-recording mocks.
