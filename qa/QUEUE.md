# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

**No gate is unanswered** (checker, 2026-09-26). Umesh answered the last three plus the lead-review scope in chat; they are folded into the contract:
- counsellor-auth → new **B21**: API-first headless engine, a JWT from the client backend, tenant stamping, KB via `/ask`, webhooks; the production UI is the client's, and apps/web is the reference UI.
- edit-provenance → **B2**: `counsellor-edit` + `editedFrom`, held by both VC and the client.
- erasure-fencing → **B15**: double confirm, then an email-outbox approver, then the purge; `autoDelete` defaults to false; fence + 24 h; HMAC audit pseudonym.
- Lead-review scope → **B17**, a 10-persona ladder (Sapna ma'am as the benchmark, Gaurav bhaiya Hindi + voice, UK/US/AU/CA policy personas), and new **B22**, the novice + VC ≥ 90 % of expert metric. Bulk import is a non-goal. The release video goes to Sapna ma'am + Gaurav bhaiya with a Hindi voice-over, and **Umesh sends it** (outward-facing).
- **Maker, first:** write **D-021** via `scripts/append_decision.ps1` covering B21 + B22 + the persona ladder (a direction change approved by Umesh 2026-09-26), then update ARCHITECTURE H-rows / §4 (apps/api is no longer a placeholder target) in /landplane.

**Answered and folded (D-020, this sweep):** crisis-guard-precision → B9+B16 (recall-only guard, downgrade-never-hide); citation-guarantee-scope → B2 (numbers+vocabulary auto-verify, everything else needs-review, transcript persisted under B15); scribe-concern-level → new B20 (concern never stops the scribe); provider-fallback → B6 (3-model runtime failover, ~10 retries, no drop to rules, alert + input-preserving Retry). T-005c, T-013, T-021, T-022 can now build against these criteria.

## Top-3 recommended next units (Mode B sweep 2026-09-26T19:44 IST)

1. **Let the in-flight wave land, then D-021 + the B21 API unit.** As of this sweep: T-021 just built (`0fa58c1`, ready-for-check, checker c0 + Mode D + ai-engineer review dispatched), T-005c fix-cycle-1 has a checker verdict on disk (`Cycle checked: 1` matching `Fix cycle: 1`) with senior re-review already WARNING-closed, and T-013 fix-cycle-1 is queued behind the RAM ceiling. Once those close out, D-021 (write it via `scripts/append_decision.ps1`, covering B21+B22, still not on disk — `grep D-021 docs/DECISIONS.md` is empty) is the next unstarted item, then the B21 API unit (`apps/api` HTTP server + JWT + tenant stamping).
2. **Hygiene — stale/superseded worktrees (ISS-045, broadened this sweep):** `t-006-mcp-servers` is still registered despite merged+checked-PASS; `t-005b-guard-hardening` (STALLED c3, superseded by T-005c) and `t-013-citation-robustness` (STALLED old c3, superseded by `t-013-citation-rescope`) are abandoned worktrees also still registered. `data_boundary.py` no longer crashes (confirmed this sweep — the WinError3 blocker is resolved), so this is now pure cleanup, not an enforcement blocker: `git worktree remove` the three once each unit's successor has closed out.
3. **B19 + B17 groundwork:** add `personas` and `scenarios` to `qa/adapter.json` (a D-entry first), and author `qa/scenarios/counselling-engine.csv` (≥50 rows, see B19) — still not started.

## TODO (maker)

- [x] DONE · ISS-056: stale Status line removed on main (confirmed by this sweep's merge test — merging `wave/t-005c-recall-only-guard` into main does NOT reintroduce the duplicate, git's 3-way merge keeps main's single-line fix since that branch never touched the file).
- [ ] TODO · ISS-061: docs/intent.md — add O8 "personalise: never re-ask what is known; questions change with the child" (CEO north star, B18); tick the answered failover-scope open question (e88f784); add a Non-goals section (bulk import, production UI — D-021). Follow-up to the approved plan, not a blocker.
- [ ] TODO · ISS-054 + ISS-045: hook counts worktree manifests; close-out removes merged/superseded worktrees (D-entry with Approved-by for the hook change). data_boundary.py's WinError3 crash is now resolved on its own (confirmed this sweep) — this TODO is pure hygiene now, not an enforcement blocker.
- [ ] IN FLIGHT · T-013: fix-cycle-1 building against amended B2 (checker c0 FAIL + DE/AI Warnings reopened it; T-024 folded in) — queued behind the RAM ceiling per `.last-tick`.
- [ ] IN FLIGHT · T-021: built `0fa58c1`, ready-for-check, checker c0 (Mode A+D) + ai-engineer review dispatched. T-022 (B20 concern continuation) not yet started.
- [ ] TODO · D-021 (see gates above), then **B21 API unit**: an HTTP server in `apps/api`, an OpenAPI doc, JWT verification (signature/expiry/issuer; `tenant`/`counsellorId`/`role`), tenant stamping + a cross-tenant refusal test, over the existing engine functions. Test JWT signed locally; no real Pathlynks connection.
- [ ] TODO · B21 KB client: `POST /ask` to the KnowledgeBase with a Bearer key from `.env`; citations carried through; a KB outage → "knowledge unavailable", never uncited.
- [ ] TODO · B21 webhooks: signed fact-approved (with B2 provenance), erasure-requested and concern-flag events.
- [ ] TODO · B2 edit provenance (ISS-051): `counsellor-edit` + `editedFrom` on edited facts.
- [ ] TODO · B15 erasure approver workflow: two confirmations, an email outbox (logged in dev), approver approval, `autoDelete` default false, fence + 24 h, HMAC `VC_AUDIT_HMAC_KEY`.
- [ ] TODO · B17/B19: `qa/adapter.json` gains `personas` (the 10 ids in B17) and `scenarios` (D-entry first)
- [ ] TODO · B17 `gaurav-bhaiya`: Hindi i18n for every counsellor-facing label in apps/web (plain-language copy), plus counsellor voice input for approval edits (Hindi STT → proposed value → counsellor confirms, B3).
- [ ] TODO · Lead review: a student activity timeline (read API + reference view: sessions, approved facts with provenance, decisions, in order).
- [ ] TODO · B22: a golden-session "novice + VC vs expert" eval harness (rubric grader); stays NOT-YET-MEASURABLE until Sapna ma'am's reference rubric is recorded (a human step, Umesh arranges it).
- [ ] TODO · B19: author `qa/scenarios/counselling-engine.csv`, ≥50 persona-tagged rows (India-only, leaving in 2 years, Hinglish, concern turn, erasure mid-session, rules/AI-down path)
- [ ] TODO · B18: an outcome test proving the scribe suppresses irrelevant and known items (India-only → zero visa facts; a known fact is not re-asked)
- [ ] TODO · ISS-053: backfill `regression_check` on the remaining fixed high rows (the 6 criticals are done 2026-09-26; 52 rows remain)
- [ ] TODO · ISS-057 (signal only, not blocking): a human structural read-through of `packages/db/src/erasure.ts` (1249 lines, 7+ units) before the next erasure-path change.
- [ ] TODO · ISS-058 (medium): bootstrap `qa/delegation-ledger.jsonl` if external-executor delegation is ever wanted here, or explicitly decide this project stays Claude-only (no ledger needed then, but say so).
- [ ] TODO · ISS-059 (medium): this project pre-dates the `docs/intent.md` → `qa/gates/plan-approved.md` convention (2026-09-26); no action needed unless a future unit's changed paths add a new user-facing screen/flow, which would then need a backfilled plan artifact.
- [ ] TODO · ISS-060 (low, informational): widen D-011's accepted-false-positive note to cover `qa/` internal artifacts explicitly, or add a `pass@` URL-credential regex exclusion to data_boundary.py's handling, so real breaches don't hide in this noise.
- [ ] TODO · Lead review: enable the maker's second-opinion tester for UI units via LiteLLM, synthetic data only (B13); its findings enter as leads
- [ ] TODO · Lead review: a recorded release walkthrough video (checker Playwright run of the full counsellor flow) under `qa/evidence/release-<date>/`, with a Hindi voice-over, plus a 7–8 point pre-release checklist the release verdict cites. Umesh sends it to Sapna ma'am + Gaurav bhaiya; the VC never sends it itself.

## Sweep notes (2026-09-26T19:44 IST, Mode B single-agent sweep — only qa/ + TASKS commits landed since the last sweep 38c426e, so sharding buys nothing)

- **Bypass / pair-state (1):** no uncommitted or unmanifested code changes on main (`git status` shows only `qa/.last-tick` + `.handoffs/`). `t-021-provider-failover`'s worktree, snapshotted mid-sweep with ~15 uncommitted files, was committed (`0fa58c1`) by the live maker session between this sweep's first and second look — confirms the maker is active, not a bypass.
- **ISS-055 (maker asleep) reconciled, not reopened as new:** the dispatch's known-state (`.last-tick` last entry 09:08, ~10h old) was already stale by the time this sweep ran — the actual last line is 19:40:44 IST, ~4 minutes before this sweep started. Appended a note to ISS-055 rather than minting a duplicate; re-checked from scratch next sweep.
- **Worktree registry vs. the dispatch's known state:** confirmed live — `t-005c-recall-only-guard` (a separate checker is running on it, not judged here, cycle-1 verdict already on disk with `Cycle checked: 1` matching `Fix cycle: 1`); `t-013-citation-robustness` (old cycle-3, manifest still stuck at `ready-for-check`, superseded by `t-013-citation-rescope` which is genuinely at fix-cycle-1, not yet built); `t-005b-guard-hardening` (STALLED c3, superseded); `t-006-mcp-servers` (checked-PASS, merged, still registered — ISS-045). `t-021-provider-failover` moved from "abandoned, ~15 uncommitted files" to "built + ready-for-check" during this sweep (see above).
- **ISS-056 merge-safety, verified by actually merging:** cloned the repo to a scratch dir and ran `git merge --no-commit --no-ff wave/t-005c-recall-only-guard` against main — no conflict, and the resulting `qa/manifests/t-015-erasure-hardening.md` has only the single fixed `Status:` line. Standard 3-way merge favours the side that changed the hunk (main, via `6f32318`) over the side that left it untouched (t-005c never touched that file), so the merge will NOT reintroduce ISS-056. TODO item marked done.
- **Inbox fold-in (2):** every 2026-09-26 entry in `qa/feedback-inbox.md` carries a `FOLDED:` tag. CLEAN.
- **Contract staleness (3):** amendment log is current through D-021's would-be entry (contract text names D-021 as the vehicle for B21/B22, but D-021 itself is still missing from `docs/DECISIONS.md` — tracked via the existing "Maker, first" gate line above, not a new issue). No stale criteria found.
- **Enforcement liveness (4):** `.claude/settings.json` carries all 5 hook commands, `$CLAUDE_PROJECT_DIR`-anchored; repo has 251 commits; `qa/loop.md`'s Stop line lists all 7 terminal states, Human gate list uncontradicted (no `improve` block). CLEAN.
- **Delegation (1b):** `qa/delegation-ledger.jsonl` absent while manifests have been built well past 2026-09-22 → ISS-058 (new, medium).
- **Regression coverage (1c):** unchanged from ISS-053's backlog; new fixed rows this window (ISS-t-018-c0-1/rev-1/rev-2) already carry `regression_check`. No new finding.
- **PLAN bypass (1d):** neither `qa/gates/plan-approved.md` nor `docs/intent.md` exists → ISS-059 (new, medium, one-time finding per the rule, not a per-manifest re-check).
- **Data-boundary (4b) — the WinError3 crash is RESOLVED:** `data_boundary.py` ran to completion across root + all 6 registered worktrees for the first time in 6 sweeps. It still exits 1 on 34 files; every one was manually verified as a false positive (the already-accepted staff email, or a `pass@<host>` credential-URL fragment in captured test output). ISS-045 updated with the resolved-crash note + broadened worktree scope; ISS-060 (new, low) opened for the FP-noise itself.
- **Goal-coverage (5):** no `.goal/goal.json` and no `docs/intent.md` — check not applicable (the intent.md gap is already ISS-059).
- **Goal-drift / re-grill (6):** no trigger. `qa/.regrill-due` absent; no unit re-PASSed twice on the same evidence; all 12 gate files have a non-blank `Answered:` line matching what's on disk (no "gate answered off-disk" findings). Stall diagnosis (6b): no STALLED/EXHAUSTED tick since the last sweep without a matching `qa/debug/` report.
- **Silent-failure hunt (7):** diffed the T-020 range (`fe111a0~1..9cee660`) across `apps/web` + `packages/engine` touched files — no empty catches, no masked fallbacks, no lost propagation; the only new `throw`s tighten error handling (ISS-t-018-rev-1's timeout fix). CLEAN.
- **Structural erosion (9):** no new signal beyond the existing ISS-057.
- **Token ledger:** appended (`opus_sub_share` 0.029, well under the 25% flag threshold; no unit at fix-cycle ≥3 in this window — T-013 and T-005c are both at cycle 1).

## CORRECTION (2026-09-26T19:49 IST, re-read fresh — the maker committed concurrently while the sweep above was being written)

The maker was never asleep and kept advancing past this sweep's first read. Re-read `git log -1` (now `0b1d89b`) and `qa/.last-tick` fresh: **T-005c is DONE** (checker c1 PASS `c825ecf` + senior Warning → closed out → merged `0e13394`, `bd24712`) and its worktree, along with `t-005b-guard-hardening` and `t-013-citation-robustness`, **were removed by the maker's own close-out** — `git worktree list` now shows only `t-006-mcp-servers`, `t-013-citation-rescope`, `t-021-provider-failover`. T-021 has since drawn an ai-engineer WARNING (`ISS-t-021-rev-1` high, `ISS-t-021-rev-2` medium) and a non-blocking gate `failover-scope`; its fix cycle 1 opens once the T-021 checker c0 verdict lands. Superseding the stale bits above:
- **Top-3 #1** is stale where it lists T-005c as "waiting" — it's closed. Current in-flight: T-021 checker c0 + ai review response pending, T-013 c1 building (opus) behind the RAM ceiling. D-021 is still the next unstarted item (still absent from `docs/DECISIONS.md`, confirmed again at 19:49).
- **Top-3 #2 / TODO ISS-054+ISS-045** narrows to `t-006-mcp-servers` only — the other two worktrees this item named are already gone.
- ISS-055 is now `verified-resolved` (ledger), not merely "resolved-for-now" — 4 ticks landed in the 18 minutes after this sweep's first read, unambiguous liveness.
No new contract/process finding from this correction; it is a liveness/staleness reconciliation only. See `qa/issues.jsonl` ISS-055 and ISS-045 for the matching append-only ledger notes.
