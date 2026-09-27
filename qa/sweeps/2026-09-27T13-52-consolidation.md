# Mode B sweep — 2026-09-27T13:52 IST — sharded consolidation

**Form:** 3 read-only shards (checks 1/1b/1c/1d · 4/4b/5/6 · 7-9 + token ledger + blast radius) +
this single-writer consolidation. All 3 shards returned; 0 failed. Baseline for check 1:
`qa/sweeps/2026-09-26T23-05*` (SHA `7942702`).

**HEAD at write time:** `07c380511a0663aedfcab55e0924cef733ca98b2` (branch
`wave/t-010-live-cards`, but this sweep operated on `D:/vc` root per the checker's project
binding, not the T-010 worktree — see "Scope" below).

**Scope note:** this consolidation ran from a `D:/vc/.worktrees/t-010-live-cards` invocation, but
every read/write below is against `D:/vc` (the bound project root), per the checker skill's
project-binding rule. T-010's own manifest/verdict/check is peer session vc-f5's, not touched here.

## Check-by-check outcome

1. **Bypass detection + pair-state.** CLEAN. Every unit merged since the baseline (T-012, T-021..
   T-023, T-025..T-030, T-032, T-033) carries a manifest + matching-cycle PASS verdict. T-032's
   verdict legitimately carries cycle-0 FAIL then cycle-1 PASS appended, cycles match.
   ISS-056's four symptom manifests (t-015, t-021, t-026, t-027, t-032) independently re-verified
   clean (`grep ready-for-check` returns nothing on any of them) — that half is fixed. The
   residual (two enforcement-path readers matching any Status line, not the last one) stays open,
   gated on an unanswered Approved-by question already put to Umesh (`.last-tick` 13:47) — see
   the ISS-056 ledger update. Status-count method correction made this sweep: the "209 open"
   figure (session-start hook and shard 1's own alternate count) comes from counting every raw
   JSONL line rather than deduping to the latest row per id. Correct method, re-derived
   independently: 223 distinct issue ids, **open=102 (9 high / 37 medium / 56 low), fixed=112,
   verified=4, wontfix=5 before this sweep's appends** (8 wontfix after, from the 3 supersede
   marks below). No non-standard status values remain in the latest-row view.
1b. **Delegation health.** CLEAN, no duplicate. `qa/delegation-ledger.jsonl` still absent;
   already covered by ISS-058, no new finding.
1c. **Regression coverage.** FINDINGS. Re-derived the full scope independently (own
   latest-row-per-id merge, cross-checked against `qa/adapter.json` `verify.shell.commands`):
   **48 of 116** fixed/verified rows carry a `regression_check` the ledger rule does not allow —
   13 null, 10 bare-allowlist (no test-file argument), 25 using a command outside the 3-item
   allowlist entirely (mostly `pnpm --filter @vc/<pkg> test`). Exactly matches shard 1's
   independent count. Consolidated into **ISS-076** (new, high), superseding ISS-063 and ISS-074
   (their narrower samples) and marking ISS-053 stale (its "all 58" blanket claim no longer
   holds — 68/116 now carry a valid value). No row was auto-corrected: none had an obviously
   correct value already sitting elsewhere in the ledger to copy, and every "not in the
   allowlist" command uses a per-package `pnpm --filter` or a different runner entirely, which is
   not verbatim-prefixed by any of the adapter's 3 whole-monorepo commands — inventing a
   plausible-looking fix here would itself violate the rule. Left fully named, bucketed, for the
   maker in ISS-076.
1d. **PLAN bypass.** CLEAN. `qa/gates/plan-approved.md` carries all 3 `Answered:` lines (confirmed
   by the prior sweep's ISS-059 reconciliation, re-verified this sweep: still fixed). T-010's
   plan-artifact question (screen-level spec for a new UI surface) is judged **exempt**: T-010 was
   a pre-gate TASKS.md row, the plan gate approved `docs/plan.md` + TASKS.md wholesale, and
   `docs/plan.md` names live cards at roadmap level (lines 70, 91, 221-222). No `docs/features/`
   directory exists anywhere in the repo and none is required for a pre-gate row.
2. **Inbox fold-in.** CLEAN. No `2026-09-27` entries in `qa/feedback-inbox.md` at all; the one
   known gap (two 2026-09-26 entries unmarked) is already ISS-064, not duplicated.
3. **Contract staleness.** One routine amendment applied this sweep (see "Contract check" below).
   No other stale criteria found.
4. **Enforcement liveness.** CLEAN on wiring: all 4 hook commands present,
   `$CLAUDE_PROJECT_DIR`-anchored; 405+ commits; D-006 already authorizes the wiring with
   `Approved-by: Umesh`, so the Lab-Protocol two-outcome rule is N/A here. `qa/loop.md` lists all
   7 terminal states; `Human gate` list not contradicted. **Loop-design "can it Goodhart the
   verifier" answers YES** — substantiated by this project's own history (T-030's property-test
   oracle found to be a copy of the production regex it graded, ISS-t-030-rev-1; T-010's 62-row
   cards eval found to be self-graded by its own author, ISS-t-010-rev-4). Filed the general
   loop-design finding this sub-check requires: **ISS-081** (new, medium, `verifier-proxy-risk`),
   naming both live instances rather than re-describing them. Do not close either instance until
   an independently hand-authored fixture is checker-verified (T-036 built one for the T-030 case
   this session, base `2448a15`, checker c0 dispatched but not yet verdicted).
4b. **Data-boundary check.** COMPLETED cleanly for the first time in three sweeps: exit 1, 31
   VIOLATION + 5 ADVISORY. Every VIOLATION re-derived to the known accepted class
   (`umeshsugara@vidysea.com`/`himanshu@vidysea.com` staff/approver addresses per D-011/ISS-003,
   or the `pass@eu.cloud.langfuse.com` credential-URL false match per ISS-060). The 5 ADVISORY are
   unreadable webpack `.pack.gz` dev-cache files. No new/real student or production data.
   **B8 recorded as verified-clean this sweep**, reversing the "unverified" state of the two prior
   sweeps (crash, then timeout). ISS-045 and ISS-060 updated with notes; no new row.
5. **Goal-coverage gap analysis.** Refreshed ISS-065's mapping (one day stale): O2 now COVERED
   (T-013 done), O5 now PARTIAL (T-029 done, T-035 open for the rest), O7 now PARTIAL (T-025..027
   done, T-034 in progress). Filed the more specific **ISS-077** (new, medium): O4
   (application-drafting/P2, contract B10) has **zero** build tracking anywhere — no TASKS.md row,
   no QUEUE.md row — which ISS-065's "already tracked elsewhere" claim got wrong for O4
   specifically (it was right only for O8, which has a QUEUE.md line). Also corrected, while
   verifying: the prior sweep's QUEUE.md claim that B17/B19 groundwork "has still not started" is
   false — `qa/adapter.json` already carries all 10 personas and `qa/scenarios/counselling-engine.csv`
   already has 58 persona-tagged rows (over B19's 50-row bar). QUEUE.md corrected.
6. **Goal-drift / re-grill.** CLEAN, no trigger. `qa/.regrill-due` absent; no unit re-PASSed twice
   on the same evidence; all 18 gate files (including the freshly-answered
   `crisis-escalation-consent`) carry a matching on-disk `Answered:` line — no "gate answered
   off-disk" findings. All 3 STALLED stamps (T-013 x2, T-005b) have matching `qa/debug/` reports.
   No `GRILL:` row added.
7. **Silent-failure hunt.** CLEAN. Every catch/fallback in the code touched by units PASSed since
   the last sweep (T-012, T-022..T-033 window) is explicit and documented — erasure.ts's
   best-effort fence releases, concern-classifier.ts/escalation.ts's explicit `unavailable`/
   `alert()` paths, providers/index.ts's typed rethrows (except the already-filed ISS-066 site),
   session-service.ts's already-filed ISS-067 site. No new rows.
9. **Structural erosion.** 2 new signals, medium, never a blocker: **ISS-079**
   (`packages/engine/src/scribe/nodes.ts`, 1456 lines, 19 commits across --follow history) and
   **ISS-080** (`packages/engine/src/scribe/graph.ts`, 964 lines, 15 commits), both verified with
   my own `wc -l` / `git log --follow` rather than trusting the shard's figures verbatim. Growth
   notes appended (not new rows) to **ISS-057** (`erasure.ts` now 1844 lines, up from 1249) and
   **ISS-060** (31 vs 34 flagged files this run). Partial-check declaration honoured: the "large
   diff with unchanged verify command" sub-criterion was not run exhaustively this sweep either.

## Contract check (the one edit made to `qa/contracts/` this sweep)

Read B4, B9 and B16 in full against **D-027** (Umesh's answer to `crisis-escalation-consent`: a
crisis escalates even without recorded consent; ids + flag only, never transcript text; nothing
else processed without consent). B9 and B16 do not condition the guard match or the escalation
notification on consent being present, so neither needed a change. B4's literal text ("A session
without a recorded consent row cannot be processed") did conflict with the now-live exception.
Per the criticality gate, recording what a human decision already settled is the routine case, not
a weakening — applied a routine amendment adding the named exception to B4 (consent-first stays the
rule for every other path) plus an append-only amendment-log entry citing D-027. This is the only
edit made to `qa/contracts/counselling-engine.md` this sweep.

## Ledger + token ledger

- 14 lines appended to `qa/issues.jsonl` (5 new: ISS-076, ISS-077, ISS-079, ISS-080, ISS-081; 9
  updates: ISS-063, ISS-074, ISS-053 marked superseded/stale; ISS-t-012-rev-4 noted per Umesh;
  ISS-056 residual narrowed; ISS-065 evidence refreshed; ISS-045 B8-clean note; ISS-060 growth
  note; ISS-057 growth note). Re-read the ledger immediately before writing (394 lines, unchanged
  from the dispatch); all 408 lines validated as parseable JSON afterward, line by line.
- Appended a fresh `python D:/ai_os/scripts/token_scan.py --project "D:/vc" --days 1 --json` line
  to `qa/token-ledger.jsonl` (not the pasted line from the dispatch, per its own stated
  preference for a current run). Combined `opus_sub_share` 0.218. Per-day breakdown reproduces
  the dispatch's own flag: 2026-09-26 ≈ 17.9% (under the 25% threshold), **2026-09-27 ≈ 29.5%
  (over)** — consistent with today's Opus-heavy build wave; T-013's separate fix-cycle-3 spend is
  already D-023 human-approved. No new token-spend row filed (informational, already named in the
  dispatch and in this report).
- No `/code-graph` graph exists for this repo — blast radius correctly skipped, none built.

## Umesh's decision, recorded verbatim per instruction

**ISS-t-012-rev-4** (held-out crisis recall 10/28 = 0.357 against the 0.95 bar): asked directly
this sweep. Umesh said: record it as the tracked pilot blocker as of 2026-09-27; whether to
process the other actions (a live-LLM classifier unit, a gateway request, anything else) is for
later. No unit queued, no scope widened — a note-only ledger update.

## Terminal state

**FINDINGS: 8** substantive items this sweep (5 new ledger rows — ISS-076, ISS-077, ISS-079,
ISS-080, ISS-081 — plus 3 supersede/stale marks — ISS-063, ISS-074, ISS-053 — beyond the routine
evidence-refresh and growth-tracking updates). No BLOCKED, no EXHAUSTED.

## Top-3 (see `qa/QUEUE.md` for the maintained copy)

1. T-035 (escalation wiring, D-027 scope) — dispatch the moment T-034 or T-010 lands.
2. Tighten the regression_check writer — ISS-076 (high, consolidated, supersedes ISS-063/ISS-074).
3. Queue a build row for O4 — ISS-077 (medium): the one north-star outcome with zero tracking.
