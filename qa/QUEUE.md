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

## Top-3 recommended next units (full sweep 2026-09-26)

1. **T-013 (citation robustness) and T-005c (recall-only guard):** both were waiting on contract amendments that landed this sweep (B2, B9/B16). T-013's worktree already exists (`.worktrees/t-013-citation-robustness`, STALLED c3) — rebuild against the rescoped B2, not another narrow patch. T-005c is already building per `.last-tick`.
2. **Hygiene:** ISS-056 (new, medium) — `qa/manifests/t-015-erasure-hardening.md` has two conflicting `**Status:**` lines (a stale `ready-for-check` left behind under the real `checked-PASS`); this is the most likely cause of the recurring "1 PASS not closed out" signal, so the fix is to **delete the stale line**, not re-run close-out. ISS-045 (still open, reopened) — t-006/t-018/t-019 worktrees are merged + checked-PASS but still registered; their leftover `node_modules` is also now the confirmed root cause of the ISS-045-linked data_boundary.py WinError 3 crash (ISS-045 note), so removing them likely fixes both at once. ISS-054 (hook blind to worktree manifests) still needs its D-entry.
3. **B19 + B17 groundwork:** add `personas` and `scenarios` to `qa/adapter.json` (a D-entry first), and author `qa/scenarios/counselling-engine.csv` (≥50 rows, see B19) — still not started.

## TODO (maker)

- [ ] TODO · ISS-056: remove the stale `**Status:** ready-for-check` line (line 6) from `qa/manifests/t-015-erasure-hardening.md` — the real status (line 5, `checked-PASS`) is correct and unit is genuinely closed; no rebuild needed.
- [ ] TODO · ISS-054 + ISS-045: hook counts worktree manifests; close-out removes merged worktrees (D-entry with Approved-by for the hook change) — also expected to clear the ISS-045 data_boundary.py crash.
- [ ] TODO · T-013: rebuild against amended B2 (numbers + fixed vocabulary auto-verify; everything else + `reasoning` kind kept as needs-review, cited to the persisted transcript span).
- [ ] TODO · T-021/T-022: build against amended B6 (runtime failover) and new B20 (concern continuation).
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
- [ ] TODO · Lead review: enable the maker's second-opinion tester for UI units via LiteLLM, synthetic data only (B13); its findings enter as leads
- [ ] TODO · Lead review: a recorded release walkthrough video (checker Playwright run of the full counsellor flow) under `qa/evidence/release-<date>/`, with a Hindi voice-over, plus a 7–8 point pre-release checklist the release verdict cites. Umesh sends it to Sapna ma'am + Gaurav bhaiya; the VC never sends it itself.

## Sweep notes (2026-09-26, full sweep — checks 1–9, following the targeted sweep f8e8b50)

- **Priority 1 — inbox fold-in (done):** the four 2026-09-26 D-020 gate-answer entries in `qa/feedback-inbox.md` are folded into the contract and marked `FOLDED: 2026-09-26`: B9+B16 (crisis guard recall-only, downgrade-never-hide), B2 (citation scope rescoped to numbers+vocabulary auto-verify / everything else needs-review), B6 (runtime provider failover), new B20 (concern-level continuation). Commit carries all four criteria.
- **New findings:** ISS-056 (medium, manifest duplicate Status field on t-015 — likely root cause of the recurring close-out-confusion signal); ISS-057 (medium, structural-erosion signal on `packages/db/src/erasure.ts`, informational only per the checker's own limits on this check). ISS-045 updated with the confirmed root cause of the data_boundary.py crash (stale t-018 worktree's node_modules path).
- **Gate reconciliation:** QUEUE's gate list was stale — it still listed all 7 gates as unanswered after 4 were answered same-day by D-020. Corrected above; only erasure-fencing, counsellor-auth and edit-provenance remain genuinely unanswered (verified by reading each gate file for a non-blank `Answered:` line, not by the presence of the field).
- **Pair-state / bypass:** no uncommitted or unmanifested code changes found since the last sweep (`git status` shows only qa/-internal files). No new bypass. T-020's checker is running separately per this sweep's dispatch — not judged here.
- **Enforcement liveness:** `.claude/settings.json` hooks present (lab-session-start, mc-sessionstart, lab-session-end, decisions-append-guard, mc-precommit); repo has 490+ commits; `qa/loop.md` present with all 7 terminal states on its Stop line and a Human gate list consistent with `qa/adapter.json` (no `improve` block to contradict it). CLEAN.
- **Data-boundary (4b):** `data_boundary.py` still crashes (WinError 3) on the stale t-018 worktree's deep pnpm path — 5th consecutive sweep unable to complete this check; tracked under ISS-045 (not a new row; same root cause).
- **Goal-coverage (5):** no `.goal/goal.json` in this project — check not applicable, no change.
- **Goal-drift / re-grill (6):** no trigger fired. `qa/.regrill-due` absent; no requirement marked `missing` with nothing to source (check 5 doesn't run without a goal.json); no unit re-PASSed twice on the same evidence. The "Lead-review scope" open item above is real but not currently blocking, so it stays a QUEUE bullet, not a GRILL row.
- **Silent-failure hunt (7):** scanned the T-018/T-019 diff (`3190ad2..e07c11b`, excludes T-020 per this sweep's scope) for empty catches / masked fallbacks / lost propagation. All `catch` blocks in `packages/providers/src/index.ts` (LiteLlmProvider) re-throw typed, key-free errors; none swallow. CLEAN.
- **Token ledger:** appended (`opus_sub_share` 0.19, under the 25% flag threshold; no unit at fix-cycle ≥3 in this window).
- **Structural erosion (9):** see ISS-057 above — signal only, not a blocker.
- **Stall diagnosis (6b):** no STALLED/EXHAUSTED tick stamp since the last sweep without a matching `qa/debug/` report — t-013's STALLED-c3 already has `qa/debug/t-013-citation-robustness-cycle3.md` (pre-existing).
