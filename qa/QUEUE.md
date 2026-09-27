# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

**No gate is unanswered** (checker, 2026-09-26). Umesh answered the last three plus the lead-review scope in chat; they are folded into the contract:
- counsellor-auth → new **B21**: API-first headless engine, a JWT from the client backend, tenant stamping, KB via `/ask`, webhooks; the production UI is the client's, and apps/web is the reference UI.
- edit-provenance → **B2**: `counsellor-edit` + `editedFrom`, held by both VC and the client.
- erasure-fencing → **B15**: double confirm, then an email-outbox approver, then the purge; `autoDelete` defaults to false; fence + 24 h; HMAC audit pseudonym.
- Lead-review scope → **B17**, a 10-persona ladder (Sapna ma'am as the benchmark, Gaurav bhaiya Hindi + voice, UK/US/AU/CA policy personas), and new **B22**, the novice + VC ≥ 90 % of expert metric. Bulk import is a non-goal. The release video goes to Sapna ma'am + Gaurav bhaiya with a Hindi voice-over, and **Umesh sends it** (outward-facing).
- ~~**Maker, first:** write **D-021**...~~ **DONE** (checker sweep 2026-09-27 confirmed: `docs/DECISIONS.md:210`, D-021, status ACTIVE, covers B21+B22+persona ladder). Drop this line going forward.

**Answered and folded (D-020, this sweep):** crisis-guard-precision → B9+B16 (recall-only guard, downgrade-never-hide); citation-guarantee-scope → B2 (numbers+vocabulary auto-verify, everything else needs-review, transcript persisted under B15); scribe-concern-level → new B20 (concern never stops the scribe); provider-fallback → B6 (3-model runtime failover, ~10 retries, no drop to rules, alert + input-preserving Retry). T-005c, T-013, T-021, T-022 can now build against these criteria.

**Answered and folded (D-027, 2026-09-27):** crisis-escalation-consent → B4 named exception (a crisis turn escalates even without recorded consent; ids + flag only, never transcript text; nothing else processed without consent). T-035 implements it directly, not behind a config flag, and closes ISS-t-012-rev-3.

## Top-3 recommended next units (Mode B sweep 2026-09-27T13:52 IST, sharded consolidation)

1. **T-035 (escalation wiring, D-027 scope) — the next build unit once its two blockers land.** Now
   fully unblocked and scoped: register `escalation_notifications` + `crisis_flag_reviews` in
   `@vc/db` `COLLECTION_NAMES`/`INDEX_PLAN`/the T-029 erasure plan/D-016 scanner
   (ISS-t-012-rev-1), wire a recipient resolver into `apps/api` `createTenantWiring`
   (ISS-t-012-rev-2), and ship the no-consent-still-escalates path directly per D-027 (closes
   ISS-t-012-rev-3). `.last-tick` (13:47) already flags `SERIAL: T-035 waits on T-034
   (erasure.ts) + T-010 (apps/api server.ts)` — both are mid-flight (T-034 building, T-010 under
   check by peer session vc-f5), so this is the next unit to dispatch the moment either lands, not
   one to start cold today.
2. **Tighten the regression_check writer — now consolidated under ISS-076 (high, supersedes
   ISS-063 + ISS-074).** Re-derived scope: 48 of 116 fixed/verified rows (13 with no
   `regression_check` at all, 10 with a bare allowlisted command and no test-file argument, 25
   using a command outside the adapter's 3-command allowlist, mostly `pnpm --filter @vc/<pkg>
   test`). No safe auto-correction exists without inventing an unverified command — the
   underlying gap is that this monorepo's `-r` recursive adapter commands have no established
   "plus a test-file argument" convention, which the per-package `pnpm --filter` form the maker
   already uses everywhere would naturally fix, as an adapter amendment.
3. **Queue a build row for O4 (ISS-077, medium) — the north-star outcome with zero tracking.**
   `docs/intent.md`'s O4 ("the application is drafted in 15 minutes and submitted by the
   student", P2 draft-only, contract B10) has no TASKS.md row and no QUEUE.md TODO row anywhere —
   the only one of the 8 outcomes with literally nothing queued. O8 (B18, context relevance) at
   least has a QUEUE.md TODO line (below) even though it also lacks a TASKS.md T-ID.

Also this sweep: ISS-t-012-rev-4 (crisis-guard held-out recall 10/28) noted as the **tracked pilot
blocker as of 2026-09-27 per Umesh** — stays open/high, no unit queued for it (Umesh deferred
further action to later). B4/B9/B16 checked against D-027 and found not in conflict as written;
B4 gained a named exception recording what D-027 already decided (routine amendment,
`qa/contracts/counselling-engine.md`). B8 (data boundary) is **verified-clean this sweep**, after
being unverified (instrument didn't complete) in the two immediately prior sweeps. New this
sweep: ISS-076 (high, consolidated regression-check scope), ISS-077 (medium, O4 has no build
row), ISS-079/ISS-080 (medium, structural-erosion signal on `scribe/nodes.ts` 1456 lines and
`scribe/graph.ts` 964 lines), ISS-081 (medium, loop-design Goodhart-risk class covering
ISS-t-030-rev-1 + ISS-t-010-rev-4). ISS-063, ISS-074 and ISS-053 marked superseded by ISS-076.

Also still open and unaffected by this sweep: D-021 (B21+B22) is confirmed present in
`docs/DECISIONS.md:210`, status ACTIVE — no longer an open item; the enforcement-path fix for
ISS-056's root cause (`.claude/hooks/mc-sessionstart.ps1`, `delivery-gate-stop.ps1` — last-Status-
wins) is pending Umesh's Approved-by on a DECISIONS entry, already asked per `.last-tick` 13:47.
**Correction to the prior sweep:** B19+B17 groundwork is NOT still-unstarted — `qa/adapter.json`
already carries all 10 `personas` and `qa/scenarios/counselling-engine.csv` already has 58
persona-tagged rows (≥50). Verified this sweep; see the TODO section below.

## TODO (maker)

- [ ] IN FLIGHT · T-010: built `53fbebd`, manifest ready-for-check c0 in `.worktrees/t-010-live-cards`; checker Mode A+D running under peer session vc-f5 (do not duplicate). Senior review Approve → ISS-t-010-rev-1..4 (rev-4 medium, see ISS-081).
- [ ] IN FLIGHT · T-034: B21 webhook outbox (Mongo-backed, tenant-scoped, idempotent enqueue) building on base `1e040e5`.
- [ ] IN FLIGHT · T-036: independent auto-verify oracle for ISS-t-030-rev-1, built `2448a15` (102-row hand-authored fixture), checker c0 dispatched — not yet verdicted.
- [ ] TODO · T-035: escalation wiring per D-027 (see Top-3 #1) — dispatch as soon as T-034 and T-010 both land; `SERIAL` per `.last-tick`.
- [ ] TODO · ISS-076 (high, consolidated — see Top-3 #2): tighten/reformat the 48 non-conforming `regression_check` values; consider a `pnpm --filter @vc/<pkg> test` adapter amendment so a real narrowing convention exists.
- [ ] TODO · ISS-077 (medium, O4 build row — see Top-3 #3): add a TASKS.md row for the application-drafting/P2 unit (B10); O8/B18 already has a QUEUE.md line below but still needs a TASKS.md T-ID.
- [ ] TODO · ISS-056 residual (medium, enforcement path, gated): `.claude/hooks/mc-sessionstart.ps1:19` and `delivery-gate-stop.ps1` take any `Status:` line match instead of the LAST one, which is the actual root cause (there is no close-out script to patch). Needs a DECISIONS entry with `Approved-by: Umesh` before either hook is edited — the question is already asked per `.last-tick` 13:47, awaiting an answer.
- [ ] TODO · ISS-066 (medium): `packages/providers/src/index.ts:651` `FailoverProvider.raceDeadline` abandons in-flight LiteLLM requests with no cancellation — add a `signal` parameter to `LlmProvider.generate()` and propagate an `AbortSignal`.
- [ ] TODO · ISS-t-025-rev-2 (low): concern_flagged edges reach the API only through the admin-only export route; no counsellor-facing cards/timeline route exists yet (owner: T-010 or a later API unit).
- [ ] TODO · B21 webhooks emission hooks (T-034 covers the outbox scaffolding; wiring fact-approved/erasure-requested/concern-flag emission through it is the remaining piece, same unit).
- [ ] TODO · B15 erasure approver workflow follow-ups: ISS-t-029-rev-1 (pending-erasure TTL), ISS-t-029-rev-2 (legacy failed-row re-approval before live cutover).
- [x] DONE · B17/B19 groundwork: `qa/adapter.json` already carries all 10 `personas`, and `qa/scenarios/counselling-engine.csv` already has 58 persona-tagged rows (≥50, B19's bar) — this sweep found both already authored; the stale "not started" note in the prior sweep is corrected. Remaining B19 work is wiring these scenarios into a UI-check/release run (Mode D/C), not authoring more rows.
- [ ] TODO · B17 `gaurav-bhaiya`: Hindi i18n for every counsellor-facing label in apps/web (plain-language copy), plus counsellor voice input for approval edits (Hindi STT → proposed value → counsellor confirms, B3).
- [ ] TODO · Lead review: a student activity timeline (read API + reference view: sessions, approved facts with provenance, decisions, in order).
- [ ] TODO · B22: a golden-session "novice + VC vs expert" eval harness (rubric grader); stays NOT-YET-MEASURABLE until Sapna ma'am's reference rubric is recorded (a human step, Umesh arranges it).
- [ ] TODO · B18 (O8, ISS-077 companion): an outcome test proving the scribe suppresses irrelevant and known items (India-only → zero visa facts; a known fact is not re-asked) — no TASKS.md T-ID yet.
- [ ] TODO · ISS-079/ISS-080 (signal only, not blocking): a human structural read-through of `packages/engine/src/scribe/nodes.ts` (1456 lines, 19 commits) and `graph.ts` (964 lines, 15 commits) before the next scribe-graph change.
- [ ] TODO · ISS-057 (signal only, not blocking): a human structural read-through of `packages/db/src/erasure.ts` (now 1844 lines, 19 commits) before the next erasure-path change.
- [ ] TODO · ISS-058 (medium): bootstrap `qa/delegation-ledger.jsonl` if external-executor delegation is ever wanted here, or explicitly decide this project stays Claude-only (no ledger needed then, but say so).
- [ ] TODO · ISS-060 (low, informational): widen D-011's accepted-false-positive note to cover `qa/` internal artifacts explicitly, or add a `pass@` URL-credential regex exclusion to data_boundary.py's handling, so real breaches don't hide in this noise.
- [ ] TODO · ISS-081 (medium, loop-design Goodhart-risk class): do not close ISS-t-030-rev-1 or ISS-t-010-rev-4 until a genuinely independent, hand-authored-before-reading-the-code fixture is checker-verified for each.
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

## Sweep notes (2026-09-26T23:05 IST, Mode B sharded sweep — 3 shards, 0 failed, this consolidation is the single writer)

- **Dedupe against the live ledger:** re-read `qa/issues.jsonl` immediately before writing (322 lines going in). New issues minted ISS-063..ISS-068 (max prior id was ISS-062). Two shard findings were folded into existing rows rather than minted new: the t-021 duplicate-Status-line recurrence → appended to **ISS-056** (its defect class, now confirmed in a second manifest); the data_boundary.py non-completion this sweep → appended to **ISS-045** (same instrument, different failure mode — timeout, not the earlier WinError3 crash).
- **Status-vocabulary fix:** ISS-055's `verified-resolved` is not a valid status (`open|fixed|verified|wontfix`) — corrected to `verified` via a full-row append with a note. No `wontfix-accepted` rows found in the ledger (the task's example did not match anything on disk).
- **Check 1 — manifest-duplicate-status-line:** confirmed recurring (ISS-056 update above); root cause is the close-out script, not per-manifest carelessness — queued as Top-3 #3.
- **Check 1c — unallowlisted regression_check (new, ISS-063, high):** ISS-045's and ISS-061's `fixed` rows both carry a regression_check value outside the two allowed forms. Filed, not auto-corrected (rewriting those values is a ledger-schema edit, not a hygiene note) — queued as Top-3 #1.
- **Check 2 — inbox fold-in gap (new, ISS-064, low):** two `qa/feedback-inbox.md` entries are substantively addressed but never marked `FOLDED:`. Low-cost hygiene, not queued in Top-3.
- **Check 4b — data-boundary instrument unavailable (ISS-045 update):** `data_boundary.py` did not complete in two attempts (120s, then an explicit 480s timeout) against the now-9-worktree tree; not forced a third time given ~1.5GB free RAM and the live maker build in the same worktrees. B8's automatic check is unverified this sweep, not confirmed clean or confirmed breached — re-run once headroom exists.
- **Check 5 — goal-coverage untagged (new, ISS-065, medium):** manual O1..O8 mapping performed this sweep (all gaps already tracked elsewhere in TASKS.md/QUEUE.md); the finding is scoped to the missing `serves: intent#O<n>` tagging convention on `qa/contracts/counselling-engine.md`, so future sweeps can check mechanically instead of by hand.
- **Check 6 — goal-drift / re-grill:** no trigger this sweep (per shard 2's clean-check report) — no `GRILL:` row added.
- **Check 7 — silent-failure hunt (2 new, ISS-066 high-value/medium-severity, ISS-067 low):** FailoverProvider's abandoned in-flight request (Top-3 #2) and session-service.ts's silent diagnostic-field default. Both read-only findings over the T-021/T-028 diff range; no swallowed exceptions or masked record loss found otherwise.
- **Check 9 — structural erosion (new, ISS-068, medium, signal only):** the err.name cross-bundled-error-identity idiom now exists independently in two server files with no shared helper — a human-read-through flag, never auto-fixed, never a blocker.
- **Token ledger:** appended shard 3's `token_scan.py` line (`opus_sub_share` 0.127, 67 sub-agents, still under the 25% flag threshold; T-013 separately reached fix-cycle 3 but that is already D-023 human-approved, not a new spend-without-cause signal).
- **Ledger validated:** all lines in `qa/issues.jsonl` parse as JSON (python, line-by-line) after this sweep's appends.

## Sweep notes (2026-09-27T13:52 IST, Mode B sharded sweep — 3 shards, 0 failed, this consolidation is the single writer)

Full report: `qa/sweeps/2026-09-27T13-52-consolidation.md`.

- **Dedupe against the live ledger:** re-read `qa/issues.jsonl` immediately before writing (394 lines going in, unchanged from the sweep dispatch). Minted ISS-076, ISS-077, ISS-079, ISS-080, ISS-081 (14 rows total including updates; max prior plain id was ISS-075).
- **Status-count method correction:** the session-start hook's "209 open" and shard 1's own alternate count both come from counting every raw JSONL line's `status` field without deduping to the latest row per id — the ledger is append-only and later rows supersede earlier ones for the same id. The correct method (latest-row-per-id merge, 223 distinct ids): **open=102 (9 high / 37 medium / 56 low), fixed=112, verified=4, wontfix=5** (now 8 wontfix after this sweep's 3 supersede-marks). No non-standard status values remain in the latest view (`verified-resolved`/`resolved-for-now`/`wontfix-accepted` were already corrected by a prior sweep, confirmed by re-derivation).
- **Check 1c — regression_check, fixed not just re-filed:** re-derived the full scope independently (48/116 rows, 3 buckets — see ISS-076) and confirmed it matches shard 1's count exactly. Superseded ISS-063 and ISS-074 (their narrower samples) and marked ISS-053 stale (its blanket "all 58" claim no longer true) rather than stacking more partial rows. No auto-correction applied to any of the 48 — none had an obvious already-correct value elsewhere to copy, and inventing a `pnpm --filter`-style value not in the adapter's literal allowlist would itself violate the ledger rule; left named for the maker in ISS-076.
- **ISS-056:** corroborated shard 1's manifest-side claim independently (`ready-for-check` absent from all four named manifests). Narrowed the row's residual to the real root cause per the maker's own 13:47 tick note: two enforcement-path readers (`mc-sessionstart.ps1`, `delivery-gate-stop.ps1`) match any Status line instead of the last one; no close-out script exists to patch. Left both hooks untouched — Lab Protocol requires a DECISIONS entry with `Approved-by: Umesh` first, already asked, not yet answered.
- **ISS-t-012-rev-4:** recorded Umesh's direct decision (asked this sweep) — tracked pilot blocker as of 2026-09-27; no unit queued; further action deferred to later per his explicit instruction.
- **Contract check (the one contract edit this sweep made):** read B4/B9/B16 in full against D-027. B9 and B16 do not mention consent as a precondition for the guard match or the escalation notification, so neither needed a change. B4's literal "cannot be processed" text did conflict with D-027's now-live exception, so applied a routine amendment (criticality-gate table: "record what D-027 already decided" is the ordinary case, not a weakening — B4 consent-first stays the rule for every other path) adding the named exception, plus an amendment-log entry. This is the only edit made to `qa/contracts/counselling-engine.md` this sweep.
- **Check 4b — data boundary:** completed cleanly for the first time in three sweeps (no crash, no timeout): exit 1, 31 VIOLATION + 5 ADVISORY, all re-derived to the known accepted classes (D-011/ISS-003 staff email, ISS-060 langfuse credential-URL fragment). **B8 recorded as verified-clean this sweep**, explicitly reversing the "unverified" state of the two prior sweeps. ISS-045 and ISS-060 updated with notes, not duplicated.
- **Check 5 — goal coverage:** refreshed ISS-065's day-stale O-mapping (O2/O5/O7 all moved from partial/missing to covered/partial as T-013/T-029/T-025-027 landed). Filed the more specific ISS-077: O4 (application-drafting/P2, contract B10) has zero build tracking anywhere (TASKS.md or QUEUE.md) — the "already tracked" claim in ISS-065 was accurate for O8 (a QUEUE.md line exists) but wrong for O4. Also found and corrected a second stale claim while verifying: B17/B19 groundwork (adapter `personas`, `qa/scenarios/counselling-engine.csv`) is NOT unstarted as the prior sweep's QUEUE.md said — both already exist (10 personas; 58 scenario rows, over B19's 50-row bar).
- **Check 6 — goal-drift / re-grill:** confirmed clean independently: `qa/.regrill-due` absent, no re-PASS-twice escalation, all 18 gate files (including the newly-answered `crisis-escalation-consent`) carry a matching on-disk `Answered:` line, all three STALLED stamps have matching `qa/debug/` reports. No `GRILL:` row.
- **Check 4 loop-design — Goodhart risk:** answers YES, substantiated by two live instances (ISS-t-030-rev-1, ISS-t-010-rev-4) rather than hypothetically. Filed the general finding this sweep-check requires (ISS-081) pointing at both instances rather than re-describing them; do not close either until T-036's (or a follow-up's) independent fixture is checker-verified.
- **Check 9 — structural erosion (2 new, ISS-079/ISS-080, medium):** verified line counts and commit history myself (`wc -l`, `git log --follow`) rather than trusting shard 3's figures verbatim — `scribe/nodes.ts` 1456 lines/19 commits, `scribe/graph.ts` 964 lines/15 commits. Appended growth notes to ISS-057 (erasure.ts now 1844 lines) and ISS-060 (31 vs 34 files) rather than new rows.
- **Check 7 — silent-failure hunt:** no new rows; shard 3's CLEAN read accepted (every catch/fallback in the T-012/T-022..T-033 window is explicit and documented, not silent).
- **Token ledger:** appended a fresh `token_scan.py --days 1 --json` line (not shard 3's pasted one, per the task's own preference) — `opus_sub_share` 0.218 combined; per-day breakdown reproduces shard 3's flag: 2026-09-26 ≈ 17.9% (under), **2026-09-27 ≈ 29.5% (over the 25% threshold)**, consistent with today's Opus-heavy build wave (T-013 fix-cycle 3 already D-023-approved; no new flag beyond noting the day is over threshold with a known cause).
- **Blast radius:** no `/code-graph` graph exists for this repo — correctly skipped, none built.
- **Ledger validated:** all 408 lines of `qa/issues.jsonl` parse as JSON (python, line-by-line) after this sweep's 14 appends.

**Terminal state: FINDINGS: 8** (5 new — ISS-076, ISS-077, ISS-079, ISS-080, ISS-081; 9 updates — ISS-063, ISS-074, ISS-053 superseded, ISS-t-012-rev-4, ISS-056, ISS-065, ISS-045, ISS-060, ISS-057). No BLOCKED, no EXHAUSTED.
