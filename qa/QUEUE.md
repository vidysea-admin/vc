# QUEUE — D:/vc maker-checker

Updated by /checker sweeps only. Gate lines sit above the TODO table (read first).

## Open gates (HUMAN_GATE)

**Two gates are open, both genuinely new since the last sweep** (checker Mode B consolidation, 2026-09-27T~16:30 IST) — the prior "no gate is unanswered" line is stale, corrected here:
- **`qa/gates/auto-verify-surface.md`** (opened 2026-09-27, T-036 fix cycle 1) — is B2's auto-verify list necessary-only or also sufficient? See the gate file for options (a)/(b)/(c), recommendation (c) first. Blocks nothing today; a product decision before a pilot.
- **`qa/gates/b18-unimplemented.md`** (opened 2026-09-27, T-039 stage 2, independently confirmed by the T-039 checker at commit `0223812`) — B18 has NO engine surface at all on `main` outside the unmerged `wave/t-010-live-cards` branch; the scribe/summary surfaces ship today with zero B18 logic (6 proven under-suppression leaks of 10 runnable blind rows). Question: does the pilot ship without a scribe-side B18 unit (documented gap), or does one go in front of the queue? See the gate file for options.

Umesh answered the prior three plus the lead-review scope in chat; they are folded into the contract:
- counsellor-auth → new **B21**: API-first headless engine, a JWT from the client backend, tenant stamping, KB via `/ask`, webhooks; the production UI is the client's, and apps/web is the reference UI.
- edit-provenance → **B2**: `counsellor-edit` + `editedFrom`, held by both VC and the client.
- erasure-fencing → **B15**: double confirm, then an email-outbox approver, then the purge; `autoDelete` defaults to false; fence + 24 h; HMAC audit pseudonym.
- Lead-review scope → **B17**, a 10-persona ladder (Sapna ma'am as the benchmark, Gaurav bhaiya Hindi + voice, UK/US/AU/CA policy personas), and new **B22**, the novice + VC ≥ 90 % of expert metric. Bulk import is a non-goal. The release video goes to Sapna ma'am + Gaurav bhaiya with a Hindi voice-over, and **Umesh sends it** (outward-facing).
- ~~**Maker, first:** write **D-021**...~~ **DONE** (checker sweep 2026-09-27 confirmed: `docs/DECISIONS.md:210`, D-021, status ACTIVE, covers B21+B22+persona ladder). Drop this line going forward.

**Answered and folded (D-020, this sweep):** crisis-guard-precision → B9+B16 (recall-only guard, downgrade-never-hide); citation-guarantee-scope → B2 (numbers+vocabulary auto-verify, everything else needs-review, transcript persisted under B15); scribe-concern-level → new B20 (concern never stops the scribe); provider-fallback → B6 (3-model runtime failover, ~10 retries, no drop to rules, alert + input-preserving Retry). T-005c, T-013, T-021, T-022 can now build against these criteria.

**Answered and folded (D-027, 2026-09-27):** crisis-escalation-consent → B4 named exception (a crisis turn escalates even without recorded consent; ids + flag only, never transcript text; nothing else processed without consent). T-035 implements it directly, not behind a config flag, and closes ISS-t-012-rev-3.

## Top-3 recommended next units (Mode B sweep 2026-09-27T~16:30 IST, sharded consolidation, second sweep of the day)

1. **ISS-085 (high, NEW) — B21 `fact.approved` webhook can silently under-report to Pathlynks.**
   `packages/db/src/facts.ts:1001-1005` read-back after write silently drops any id not found (its
   own docstring says so); `apps/api/src/server.ts:316-327` emits one event per fact ACTUALLY
   RETURNED with no count check against what was written, so a read-back miss (replication lag, a
   concurrent B15 erasure fence, an `applyApprovedDiff` bug) silently shrinks the webhook batch — no
   log, no error, still 200. A second leak on the same request: `server.ts:609-627` swallows an
   `outbox.enqueue` throw behind a log line and still returns 200, so the event never reaches the
   outbox's own retry/dead-letter path. B21 promises the client "keeps its own copy"; today it can
   silently keep an incomplete one. No gate needed, buildable now.
2. **ISS-076 (high, still open, WORSENING not shrinking) — regression_check conformance.**
   Re-derived this sweep: 50 of 120 fixed/verified rows non-conforming (up from 48/116 last sweep;
   rate flat at ~41.6%). Root cause unchanged: the adapter's 3 whole-monorepo verify commands have no
   "plus a test-file argument" narrowing convention, while the maker already uses per-package `pnpm
   --filter @vc/<pkg> test` everywhere — adding that form to `qa/adapter.json` is the fix, and it is
   also why `verified` (4) has not moved while `fixed` keeps growing (118 now): a `fixed→verified`
   transition needs the checker to reproduce the regression_check failing-with-fix-reverted, which is
   structurally blocked for ~42% of rows.
3. **T-035 (escalation wiring, D-027 scope) — the next build unit, now down to ONE blocker.**
   T-034 (erasure.ts) landed this window, so `SERIAL: T-035 waits on T-034 + T-010` is half-resolved;
   T-010 is mid fix-cycle-2 (peer session), so T-035 dispatches the moment T-010 lands, not cold today.

**Two new HUMAN_GATEs opened this window** (see "Open gates" above) — `auto-verify-surface` and
`b18-unimplemented` — neither blocks a build unit today, but `b18-unimplemented` in particular
changes what "P1 is built" means and should not sit unresolved past this pilot's review.

**Not in the top-3, but worth naming why:** `ISS-t-037-1` (escalated low→high this sweep — two
divergent, uncommitted `vc-testlock.sh` copies made verify non-reproducible across ~11 manifests) is
already being fixed in flight by **T-040** (open, independent, currently building `scripts/vc-testlock.sh`
+ `scripts/vc-testlock.test.sh`); no need to re-queue it. `ISS-084` (medium, metric-inflated — three
tools in this enforcement path count raw occurrences instead of latest-state-per-entity: the
session-start hook's open-issue count 243-vs-123-real, `data_boundary.py`'s cross-worktree file
duplication, and ISS-056's any-Status-match) and `ISS-087` (medium, lock helper has no owner-PID
liveness check) both route through the SAME pending `Approved-by: Umesh` gate as ISS-054/ISS-056 —
already asked, not yet answered — so none of the three displace the top-3 above.

`ISS-t-012-rev-4` (crisis-guard held-out recall 10/28) stays the **tracked pilot blocker per Umesh's
own 2026-09-27 instruction** — open/high, no unit queued, further action deferred to later at his
explicit direction. B8 (data boundary): **re-verified clean in substance this sweep** — the instrument
completed cleanly (52 raw VIOLATION lines, but only 9 distinct root files, all already-accepted staff
emails or the `pass@eu.cloud.langfuse.com` test-name false-positive; see ISS-045's reopen for why it's
reopened anyway — a crash-class risk, not a breach). New this sweep: ISS-082/ISS-083 (fixed —
inbox-fold gaps closed into contract B2), ISS-084/ISS-085/ISS-086(fixed)/ISS-087 (new), ISS-045
(reopened, corrected), ISS-054/ISS-056/ISS-076/ISS-081/ISS-t-037-1 (updated).

D-021 (B21+B22) remains confirmed present in `docs/DECISIONS.md:210`, status ACTIVE. B19+B17
groundwork remains confirmed present (10 personas, 58 scenario rows ≥50). Both re-checked and
unchanged this sweep.

## TODO (maker)

- [ ] IN FLIGHT · T-010: cycle-1 code `f753e17` on `.worktrees/t-010-live-cards`, manifest ready-for-check c1 (cycle-1 FAIL per the maker's own tick, c2 now dispatched to opus — leak moved, not closed: 25/28 hostile rows still leak on `<=6-word` hatch / comma-anchored `SUBJECT_AUX_INVERSION` / a Devanagari rule (c) gap). Senior review Approve → ISS-t-010-rev-1..4 (rev-4 medium, see ISS-081, now IMPROVING). Do not duplicate; peer session live.
- [x] DONE · T-034: B21 webhook outbox merged (`d80c2a5` lineage, checker Mode A c0 PASS `845d281`); fact-approved + erasure-requested emission wired. concern.flagged emission remains a scoped-out TODO, tracked as `ISS-t-034-concern-hook` (open, now unblocked since T-012 merged) — was previously listed as "B21 webhooks emission hooks", corrected here.
- [x] DONE · T-036: independent blind auto-verify oracle merged (`d80c2a5`, checker Mode A c1 PASS `f4f0a7c` after a c0 FAIL); closed ISS-t-030-rev-1 (see ISS-081 update) and ISS-t-036-1; opened ISS-t-036-2/-3 and surfaced the 8 Q1-Q8 contract questions (Q3/Q4/Q6/Q7/Q8 folded this sweep as ISS-082/ISS-083; Q1/Q2/Q5 held on `qa/gates/auto-verify-surface.md`).
- [ ] IN FLIGHT · T-039: B18 suppression-outcome test, built + PASS+merge per the maker's latest tick, fix cycle 1 dispatched; independently confirmed the `b18-unimplemented` gate finding (commit `0223812`).
- [ ] IN FLIGHT · T-040: committing the canonical `scripts/vc-testlock.sh` (+ `scripts/vc-testlock.test.sh`, both currently untracked in the worktree) — fixes ISS-t-037-1 (escalated to high this sweep, see ledger). Checker should also apply the ISS-087 falsification (dead-PID owner file, assert fast recovery) before PASSing.
- [ ] IN FLIGHT · T-041: concern-classifier abort-on-timeout fix (mirrors T-037's `raceDeadline` pattern, ISS-t-037-2), built `1c1b5e6`, checker Mode A c0 dispatched same turn.
- [ ] TODO · T-035: escalation wiring per D-027 (see Top-3 #3) — down to ONE blocker now (T-034 landed); dispatch the moment T-010 lands.
- [ ] TODO · ISS-085 (high, NEW — see Top-3 #1): B21 fact.approved webhook silent partial fact-loss + swallowed enqueue failure. No gate, buildable now.
- [ ] TODO · ISS-076 (high, still open, worsening not shrinking — see Top-3 #2): tighten/reformat the 50 non-conforming `regression_check` values; adopt a `pnpm --filter @vc/<pkg> test` adapter amendment so a real narrowing convention exists.
- [x] DONE · ISS-077 (O4/O8 build rows): both outcomes are now tracked — **T-038** (open, blocked on a scope answer from Umesh, O4/B10 draft-only application filler) and **T-039** (in flight, above, O8/B18 outcome test). No longer "zero tracking"; the row this TODO pointed at is resolved. ISS-077 itself stays open in the ledger until both units close.
- [ ] TODO · ISS-056 residual (medium, enforcement path, gated, scope broadened this sweep to include `mc-precommit.ps1:5`): three readers (`mc-sessionstart.ps1:19`, `mc-precommit.ps1:5`, `delivery-gate-stop.ps1`) take any `Status:` line match instead of the LAST one. Needs a DECISIONS entry with `Approved-by: Umesh` before any is edited — already asked, awaiting an answer.
- [ ] TODO · ISS-084 (medium, NEW): `.claude/hooks/mc-sessionstart.ps1:8`'s open-issue count is raw-line (243) not latest-row-per-id (127) — ~2x overstatement, same "count occurrences not distinct entities" root cause as ISS-056. Same gate as ISS-056/ISS-054, bundle the fix with them.
- [ ] TODO · ISS-t-025-rev-2 (low): concern_flagged edges reach the API only through the admin-only export route; no counsellor-facing cards/timeline route exists yet (owner: T-010 or a later API unit).
- [ ] TODO · ISS-t-034-concern-hook (low, now unblocked): wire `buildConcernFlaggedEvent` from `recordSessionConcerns` — was deliberately deferred until T-012 merged (it has, per TASKS.md); safe to build now, no race with T-012 remaining.
- [ ] TODO · B15 erasure approver workflow follow-ups: ISS-t-029-rev-1 (pending-erasure TTL), ISS-t-029-rev-2 (legacy failed-row re-approval before live cutover).
- [x] DONE · B17/B19 groundwork: `qa/adapter.json` already carries all 10 `personas`, and `qa/scenarios/counselling-engine.csv` already has 58 persona-tagged rows (≥50, B19's bar) — this sweep found both already authored; the stale "not started" note in the prior sweep is corrected. Remaining B19 work is wiring these scenarios into a UI-check/release run (Mode D/C), not authoring more rows.
- [ ] TODO · B17 `gaurav-bhaiya`: Hindi i18n for every counsellor-facing label in apps/web (plain-language copy), plus counsellor voice input for approval edits (Hindi STT → proposed value → counsellor confirms, B3).
- [ ] TODO · Lead review: a student activity timeline (read API + reference view: sessions, approved facts with provenance, decisions, in order).
- [ ] TODO · B22: a golden-session "novice + VC vs expert" eval harness (rubric grader); stays NOT-YET-MEASURABLE until Sapna ma'am's reference rubric is recorded (a human step, Umesh arranges it).
- [x] DONE (in flight, see T-039 above) · B18 (O8, ISS-077 companion): an outcome test proving the scribe suppresses irrelevant and known items — now T-039, PASS+merge per the maker's latest tick, fix cycle 1 dispatched. Also surfaced the larger `b18-unimplemented` gate finding (see Open gates above): the scribe/summary surfaces ship with zero B18 logic outside T-010's unmerged branch.
- [ ] TODO · ISS-079/ISS-080 (signal only, not blocking): a human structural read-through of `packages/engine/src/scribe/nodes.ts` (1456 lines, 19 commits) and `graph.ts` (964 lines, 15 commits) before the next scribe-graph change.
- [ ] TODO · ISS-057 (signal only, not blocking): a human structural read-through of `packages/db/src/erasure.ts` (now 1844 lines, 19 commits) before the next erasure-path change.
- [ ] TODO · ISS-058 (medium): bootstrap `qa/delegation-ledger.jsonl` if external-executor delegation is ever wanted here, or explicitly decide this project stays Claude-only (no ledger needed then, but say so).
- [ ] TODO · ISS-060 (low, informational): widen D-011's accepted-false-positive note to cover `qa/` internal artifacts explicitly, or add a `pass@` URL-credential regex exclusion to data_boundary.py's handling, so real breaches don't hide in this noise.
- [ ] TODO · ISS-081 (medium, loop-design Goodhart-risk class, IMPROVING this sweep): instance 1 (ISS-t-030-rev-1) is now RESOLVED — T-036's blind fixture checker-verified PASS. Instance 2 (ISS-t-010-rev-4, T-010's self-authored cards eval) stays open under active widening (27→78 rows, 0/66 contained); do not close the class until it too is checker-verified independent.
- [ ] TODO · ISS-087 (medium, NEW): both `vc-testlock.sh` copies break a stale lock on age alone with no owner-PID liveness check — a dead holder always costs the full staleness window. Falsification for T-040's checker: write an owner file naming a dead PID, assert fast recovery.
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

## Sweep notes (2026-09-27T~16:30 IST, Mode B sharded sweep — 3 shards + 4 root-session rows, 0 shards failed, this consolidation is the single writer, second full sweep of the day)

Full report: `qa/sweeps/2026-09-27T16-30-consolidation.md` (see there for full detail; this is the summary).

- **CLOCK CORRECTION (governs every age judgement in this sweep):** the maker's tick stamps carried a
  ~4-4.5h forward wall-clock error for most of 2026-09-27 (composing the time from its own sense of it
  instead of reading `date`). Every age in this sweep is derived from `date -Iseconds` or
  `git log --format=%cI`, never from a prose stamp. Filed as ISS-086 (fixed — verified independently
  against 3 post-16:10 commit timestamps, no skew).
- **Dedupe against the live ledger:** re-read `qa/issues.jsonl` immediately before writing (432 lines
  going in, 251 distinct ids). Minted ISS-082..ISS-087 (6 new, 2 immediately folded and closed —
  ISS-082/ISS-083 — 4 open). Updated ISS-045 (REOPENED, corrected), ISS-054, ISS-056, ISS-076, ISS-081,
  ISS-t-037-1 (6 updates). 12 lines appended total; max prior plain id was ISS-081.
- **Check 4b — data boundary, DETERMINATE this run (corrected from the shards' INDETERMINATE):** the
  WinError3 crash the shards hit (from `.worktrees/t-034-webhook-outbox`'s dangling pnpm symlink) was
  resolved mid-sweep by the peer maker removing two orphaned worktree dirs. Re-run independently:
  `data_boundary.py D:/vc` completes cleanly, exit 1, **52 VIOLATION + 5 ADVISORY** (up from 31+5 at
  13:52 in raw count, but that raw number is itself the finding — see ISS-084). Independently verified
  file:line: only **9 distinct files breach in the root tree** — `docs/DECISIONS.md:74,109,110` and
  `qa/gates/config-audit-fixes.md:8,13-14` carry `umeshsugara@vidysea.com`/`himanshu@vidysea.com` (the
  Approver's own and the operator's work emails, accepted under D-011/ISS-003 since 2026-09-25);
  `qa/evidence/{t-008-approval-ui,t-018-approval-followups,t-020-reject-reason-ui}/test.txt:109,131`,
  `qa/sweeps/*.md` and `qa/verdicts/t-028-personas-scenarios.md` all carry the literal test name
  `pass@eu.cloud.langfuse.com` from `ISS-016`/`ISS-t-004-langfuse-1` (a security test asserting a
  credential-bearing URL is REFUSED, not a credential). **Zero student/applicant/Pathlynks/V3.3 data.
  No breach.** The other 43 of 52 are these same 9 files duplicated once per in-flight worktree
  (5 worktrees × ~8-9 files each) — an artefact of the instrument counting occurrences instead of
  distinct files, not a widening breach; filed as ISS-084, cross-referenced from ISS-045's reopen.
  **ISS-045 reopened anyway** (high) because the CRASH CLASS recurred this window and one orphan,
  `.worktrees/t-037-failover-cancellation`, remains on disk unregistered (6 dirs vs 5 registered — a
  live process holds its handle); remedy is the maker's own `git worktree prune` retry, not a checker fix.
- **The count-vs-distinct-entity pattern (ISS-084, NEW, medium) — three instances, one root cause.**
  `.claude/hooks/mc-sessionstart.ps1:8` counts raw ledger lines: live-verified 243 raw vs **127 real**
  (latest-row-per-id, post this sweep's appends; was 123 pre-sweep) — a ~2x overstatement of every
  session's pending-work signal. The identical shape recurs in `data_boundary.py`'s worktree duplication
  above and in `ISS-056`'s any-`Status:`-line match. One fixable habit across three tools, not three
  unrelated bugs — every instance so far skews toward a false alarm, never toward hiding a real one.
  Gated on the same pending `Approved-by: Umesh` DECISIONS entry as ISS-054/ISS-056.
- **Silent-failure hunt (check 7, NEW, ISS-085, high):** B21 `fact.approved` webhook path
  (`packages/db/src/facts.ts:1001-1005`, `apps/api/src/server.ts:316-327,609-627`) can silently emit
  fewer events than facts written and silently swallow an outbox-enqueue failure behind a 200 response.
  Not a deliberate-fallback exemption (B21 Events is new, T-034, not B6/B20). Filed as one row per the
  shared root cause (read-back-then-emit with no consistency check).
- **Root-session findings (C1-C4), filed as ISS-086/ISS-087 + an ISS-t-037-1 update:** C1 (clock defect,
  see above) → ISS-086, fixed, independently verified. C2 (`vc-testlock.sh` referenced by 11 manifests,
  never committed, two logically-divergent copies live only in session scratchpads — md5
  `b6c788b6...` vs `83c0db3f...`) → escalated the existing `ISS-t-037-1` low→high rather than mint a
  duplicate; T-040 is already building the fix. C3 (neither lock copy checks owner-PID liveness, only
  age) → ISS-087, new, medium, with a falsification named for T-040's checker. C4 (the checker
  safety-net takeover rule reads manifest AGE, which is environment not liveness) is a process note on
  a skill outside this root's writable surface — not filed as a ledger row, recorded here only.
- **Contract maintenance — the one edit this sweep made:** folded T-013's implemented negation/unit-
  multiplier/currency fail-safe (ISS-082) and T-036 oracle Q3/Q4/Q6/Q7/Q8 (ISS-083, all independently
  routine — verified none turn on the held necessary-vs-sufficient question) into contract B2 as one
  "Fail-safe + scope clarifications" block, plus an amendment-log entry. **Q1, Q2, Q5 deliberately left
  unfolded**, held on `qa/gates/auto-verify-surface.md` (still open, unaffected). Marked all five
  `qa/feedback-inbox.md` entries `FOLDED:`.
- **Two new gates surfaced this window, not by this checker:** `auto-verify-surface.md` (still open from
  13:52) and **`b18-unimplemented.md`** (new — B18 has no engine surface on `main` outside the unmerged
  `wave/t-010-live-cards` branch; independently confirmed by the T-039 checker, commit `0223812`).
  QUEUE.md's stale "no gate is unanswered" line corrected. No `GRILL:` line — neither gate nor any other
  signal met a check-6 trigger this sweep; none invented.
- **Check 4 loop-design — Goodhart risk (ISS-081), re-derived = IMPROVING:** instance 1
  (ISS-t-030-rev-1) RESOLVED (T-036 checker-verified PASS, `f4f0a7c`); instance 2 (ISS-t-010-rev-4)
  still open, under active widening (27→78 rows, 0/66 contained). Updated, not re-filed.
- **Regression-check conformance (ISS-076):** re-derived independently — 50/120 non-conforming (up from
  48/116), rate flat ~41.6%. `verified` (4) has not moved since 13:52 while `fixed` grew to 118 — named
  as the same structural mechanism, not a new finding.
- **Token ledger:** appended shard 3's prepared line verbatim (`scanned_at` 16:06:34, real-clock
  consistent) — `opus_sub_share` 2026-09-27 ≈ 27.5%, over the 25% threshold, judged JUSTIFIED (a
  genuine 4-parallel-unit wave with T-010 fix-cycle-1 deliberately Opus-executed; no manifest at
  fix-cycle ≥3 today).
- **Blast radius:** no `/code-graph` graph exists for this repo — correctly skipped, none built.
- **Ledger validated:** all 444 lines of `qa/issues.jsonl` parse as JSON (python, line-by-line) after
  this sweep's 12 appends (432 → 444). Distinct ids 251 → 257. Latest-row-per-id status:
  open=127, fixed=118, wontfix=8, verified=4.

**Terminal state: FINDINGS: 6** (4 new open — ISS-084, ISS-085, ISS-087, plus ISS-045 reopened; 2 new
fixed-on-arrival — ISS-082, ISS-083; 6 updates — ISS-054, ISS-056, ISS-076, ISS-081, ISS-t-037-1, plus
the ISS-045 reopen already counted). No BLOCKED, no EXHAUSTED. High-severity open count moved 9→11
(ISS-045 reopened, ISS-085 new, ISS-t-037-1 escalated; ISS-086 closed) inside the corrected 127-open
latest-row-per-id total.
