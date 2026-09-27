# Manifest: t-012-crisis-escalation

**Contract:** qa/contracts/counselling-engine.md (B16 primary; B4, B6, B8, B9, B12, B13, B14, B20)
**Goal task:** T-012 (TASKS.md line 22)
**Fix cycle:** 0 of max 3
**Design:** D-020 "downgrade, never hide" (a classifier may annotate a guard flag, never hide, drop or
lower it); B9 recall-only guard stays the only gate; T-025 tenant-scoped db for every write.
**Diff range:** `3b8609a..HEAD` on branch `wave/t-012-crisis-escalation`:
`6f98e5a` (held-out slice, committed BEFORE any pattern read or guard run: provenance by git order),
`f15995a` (implementation + tests + golden-set growth), then this manifest commit.

**Scope (all within the bound root):**
`packages/engine/src/guards/concern-classifier.ts` (new), `packages/engine/src/guards/escalation.ts`
(new), `packages/engine/src/guards/index.ts`, `packages/engine/src/scribe/graph.ts`,
`packages/engine/src/scribe/nodes.ts`, `skills/concern-classifier/SKILL.md` (new),
`packages/engine/tests/concern-classifier.test.ts` (new), `packages/engine/tests/crisis-escalation.test.ts`
(new), `packages/engine/tests/crisis-eval.test.ts`, `packages/engine/tests/loader.test.ts`,
`qa/evals/crisis-eval.jsonl` (+19 rows), `qa/evals/crisis-eval-heldout.jsonl` (new, 37 rows),
`.env.example` (3 variable NAMES), this manifest.

**Not touched:** `packages/db/src/erasure.ts` (T-029), `packages/providers/**` (T-032), `apps/web/**`,
no cards module (T-010), `qa/contracts/**`, `docs/DECISIONS.md`, `ARCHITECTURE.md`, `TASKS.md`,
`.claude/**`, `qa/issues.jsonl` (the checker folds ISS-t-033-rev-1/-2 status).

**TDD order note (honest):** tests were written after the implementation in this cycle, not before.
Each capability's RED was therefore shown by falsification in a throwaway worktree (table below)
instead of by a test-first run.

## What changed

### 1. Concern classifier (`packages/engine/src/guards/concern-classifier.ts`)
- `CONCERN_CLASSIFIER_SKILL` / `CONCERN_CLASSIFIER_DEFAULT_MODEL = "flash-lite"` / 8 s timeout (:39-42).
- Severity ladder none<low<moderate<high<critical, `guardSeverityFloor` (crisis->critical,
  concern->moderate), `ESCALATE_AT = "high"` (:48-68).
- Zod input/output schemas `{severity, likelyBenign, rationale<=500}` (:74-85).
- `loadConcernClassifierConfig(env)` (:141): `VC_CONCERN_MODEL`, `VC_CONCERN_TIMEOUT_MS`,
  `VC_CONCERN_SAMPLE_RATES` (defaults latin 0.1, devanagari 0.25, other 0.25; malformed -> throws
  naming the key).
- `concernClassifierProviderConfig` (:172): the deployment's provider config with the model swapped
  for the tier and any litellm failover chain dropped (one bounded attempt; the path fails open).
  Provider-agnostic: goes through `@vc/providers` `LlmProvider`; tests use `MockProvider`/fakes.
- `sampleStratum` / `sampleUnit` (sha256, deterministic) / `selectForReview` (:188-218): every guard
  flag (any speaker) is reviewed; unflagged turns are sampled only for students, per script stratum.
- `classifyConcern` (:243) never throws: races a timeout, schema-validates, and returns
  `unavailable {reason: timeout|error, errorName}` with the error CLASS name only (no message).
- `reviewedFlagView` (:297): guard fields copied verbatim; a guard flag is always `visible`;
  `effectiveSeverity = max(floor, classifier)`; "likely benign" is an annotation
  (`LIKELY_BENIGN_LABEL`) next to the flag, never instead of it.
- `escalationDecision` (:320): guard crisis -> `guard_crisis` decided FIRST without reading the
  annotation; guard concern with a null/unavailable review -> `classifier_unavailable` (fail-open);
  classified severity >= high -> `classifier_severity`.

### 2. Escalation records (`packages/engine/src/guards/escalation.ts`)
- Collections `escalation_notifications` and `crisis_flag_reviews` (:56-57), in the
  `virtual_counsellor` DB through the T-025 tenant-scoped `Db` only; `requireTenantScope` (:160)
  throws `TenantScopeError` on an unscoped db. Nothing is sent over the network: `channel:
  "record_only"`, `status: "queued"`.
- `EscalationNotificationDoc`: `_id = <sessionId>:<turnId>:<role>:<id>`, `kind:
  "crisis_escalation"`, `escalationId`, `recipient {role: admin|counsellor|unrouted, id}`,
  `sessionId`, `studentId`, `turnId`, `guardLevel`, `matched`, `severity`, `reason`, `flaggedAt`,
  `notifiedAt`, `acknowledgedAt: null`, `acknowledgedBy: null`. No transcript text is stored.
- `notifyAll` (:203): ONE `bulkWrite` of upserts with a single `notifiedAt` for the admin(s) AND
  every concerned counsellor; resolver failure / missing admin or counsellor -> `unrouted` records
  plus an `escalation_unrouted` alert (an escalation is never dropped).
- `escalateTurns` (:254): guards `text` and `translatedText` (max), upserts review docs
  (`$setOnInsert` for the guard, never updated), writes guard-crisis notifications IMMEDIATELY,
  then starts `runReview` (:326) in the background (never rejects; handed to `deps.onReview`).
- `readEscalations` (:373), `readFlagReviews` (:385, returns `reviewedFlagView`),
  `acknowledgeEscalation` (:397, sets `acknowledgedAt` once).
- **SLA PARKED:** only `flaggedAt` / `notifiedAt` / `acknowledgedAt` timestamps are recorded; no SLA
  number is invented anywhere.

### 3. Scribe wiring (`packages/engine/src/scribe/graph.ts`, `nodes.ts`)
- `ScribeDeps.escalation?: EscalationDeps` (nodes.ts:71-75); absent = old behaviour (E14).
- `compileScribeGraph` refuses `escalation` with an unscoped db (graph.ts:251-253).
- `startScribe` calls `escalateSessionFlags` after `recordSessionConcerns` (graph.ts:554);
  `escalateSessionFlags` (graph.ts:626) checks consent first (B4) and is NOT part of fence
  compensation (a sent-to-admin record is not withdrawn by a fence).

### 4. Skill + env
- `skills/concern-classifier/SKILL.md` (B6), loader test count 10 -> 11 (`tests/loader.test.ts`).
- `.env.example`: `VC_CONCERN_MODEL=`, `VC_CONCERN_TIMEOUT_MS=`, `VC_CONCERN_SAMPLE_RATES=` (names only).

### 5. Golden set + ISS-t-033-rev-1 / rev-2
- `qa/evals/crisis-eval.jsonl` +19 rows: 18 `hard_negative`/none (exam/visa idioms in en,
  Hinglish, Devanagari, e.g. "This exam is killing me.", "I'm dying to go to Canada."), and one
  `accepted_residual`/crisis ("Mar jaunga padhai se, itna syllabus hai." - the guard flags it; D-020
  accepts the false alarm).
- **ISS-t-033-rev-1:** `tests/crisis-eval.test.ts:108,137-143,176-182` adds a TRUE-crisis recall line
  excluding `BENIGN_INTENT` categories, asserts its denominator is strictly smaller than the counted
  one, and holds the >= 0.95 bar on it.
- **ISS-t-033-rev-2:** `qa/evals/crisis-eval-heldout.jsonl` (37 rows, `intent` labels only, 28
  crisis: en 14 / hi-Latn 8 / hi-Deva 6; 9 benign), written independently of the patterns (commit
  `6f98e5a` precedes any pattern read). Tests at `crisis-eval.test.ts:240` (labelled, >= 5 per
  script, no `expected` field, disjoint from the golden set) and `:259` (printed recall line +
  missed rows, no-regression floor `HELDOUT_BASELINE = {caught: 10, total: 28}` at :230).
  **Result: the keyword guard catches 10/28 held-out crises. It fails the bar.** The patterns were
  deliberately NOT tuned to these rows (that would spend the slice).

## How to verify

```
bash "scripts/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/engine test
bash "scripts/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/engine typecheck
bash "scripts/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/db test
bash "scripts/vc-testlock.sh" pnpm -C D:/vc/.worktrees/t-012-crisis-escalation --filter @vc/api test
python D:/vc/.worktrees/t-012-crisis-escalation/contracts/verify_contracts.py
```

## Capability coverage (falsified in a throwaway worktree)

Worktree `C:/Users/Lenovo/AppData/Local/Temp/claude/t012-falsify` from HEAD `f15995a`
(`git worktree add ... HEAD --detach`, `pnpm install --offline`), harness applies one edit, runs the
named test via `tsx --test --test-name-pattern`, reverts. Worktree removed afterwards.

| # | Claim | Test id | Falsifying edit | Expected RED | GREEN before -> after |
|---|---|---|---|---|---|
| M1b | a "likely benign" answer never hides a guard crisis | cc `never-hide: a 'likely benign'…CRISIS` ; es `E2` | `visible: classified?.likelyBenign === true ? false : …` | both RED | ok -> not ok ; ok -> not ok |
| M1c | classifier can not lower severity below the guard floor | cc never-hide (both) ; es `E2` | `effectiveSeverity = classified.severity` (no max) | RED | ok -> not ok (both) ; ok -> not ok |
| M1 | never-hide on a guard concern | cc `never-hide: …can not lower a guard CONCERN` | `visible: (!likelyBenign && guard!=none) \|\| sev>=high` | concern test RED | ok -> not ok (crisis test + E2 stay ok: critical severity keeps it visible, an equivalent mutant for crisis; M1b covers it) |
| M2 | guard crisis decided before reading the annotation | cc `never-hide: …CRISIS` | benign check inserted before the crisis branch | RED | ok -> not ok |
| M3 | outage/timeout escalates on the regex flag alone | cc `fail-open` ; es `E3`, `E3b`, `E12` | classifier_unavailable branch -> `if (false)` | all RED | ok -> not ok x4 |
| M4 | notifications written before the classifier answers | es `E1` | `await review` before return | RED | ok -> not ok |
| M5 | admin AND every counsellor notified | es `E1`, `E11` | drop the counsellor recipients line | RED | ok -> not ok x2 |
| M6 | tenant scope required | es `E9` | remove `requireTenantScope` in escalateTurns | RED | ok -> not ok |
| M7 | a hung classifier never blocks | cc `a hung provider…` | `await call` (no race) | RED (timeout) | ok -> not ok |
| M8 | stratified sample per script | cc `stratified by script` | `rates[stratum]` -> `rates.latin` | RED | ok -> not ok |
| M9 | every guard flag is reviewed | cc `every guard flag is reviewed` | drop the guard_flag early return | RED | ok -> not ok |
| M10 | no error message leak | cc `class name only` | `errorName: err.message` | RED | ok -> not ok |
| M11 | consent first (B4) | es `E13` | drop the consent check in escalateSessionFlags | RED | ok -> not ok |
| M12 | scribe wired | es `E11`, `E12` | delete the escalateSessionFlags call | RED | ok -> not ok x2 |
| M13 | ISS-t-033-rev-1 true-crisis line excludes accepted_residual | ev `every row matches…` | drop `BENIGN_INTENT.has(...)` from the true-crisis loop | RED | ok -> not ok |
| M14 | ISS-t-033-rev-2 held-out disjoint from golden | ev `…disjoint from the golden set` | append held-out row 1 to crisis-eval.jsonl | RED | ok -> not ok |

(cc = tests/concern-classifier.test.ts, es = tests/crisis-escalation.test.ts, ev = tests/crisis-eval.test.ts)

Pasted harness lines (verbatim, abridged to one per test):
```
## M1b hide-crisis-on-benign
GREEN-before [concern-classifier :: never-hide: a] ok 1 - T-012 never-hide: a 'likely benign / none' answer on a guard CRISIS keeps the flag visible, critical, and escalating
GREEN-before [crisis-escalation :: E2:] ok 1 - T-012 E2: the classifier says 'likely benign, none' on a guard-crisis idiom — the flag still shows and still notifies
RED-after    [concern-classifier :: never-hide: a] not ok 1 - T-012 never-hide: a 'likely benign / none' answer on a guard CRISIS keeps the flag visible, critical, and escalating
RED-after    [crisis-escalation :: E2:] not ok 1 - T-012 E2: the classifier says 'likely benign, none' on a guard-crisis idiom — the flag still shows and still notifies
## M2 annotation-first
GREEN-before ok 1 - T-012 never-hide: a 'likely benign / none' answer on a guard CRISIS ...   RED-after not ok 1 - (same)
## M3 no-fail-open
GREEN-before ok 1 - T-012 fail-open: ... | ok E3 | ok E3b | ok E12
RED-after    not ok 1 - T-012 fail-open: ... | not ok E3: a classifier OUTAGE on a guard concern still escalates, on the flag alone | not ok E3b | not ok E12
## M4 await-review
GREEN-before ok 1 - T-012 E1: a guard crisis notifies the admin AND every concerned counsellor at the same moment, before the classifier answers
RED-after    not ok 1 - T-012 E1: (same)
## M5 drop-counsellors       E1 ok -> not ok ; E11 ok -> not ok
## M6 no-tenant-scope        E9 ok -> not ok
## M7 no-timeout-race        "a hung provider resolves to unavailable/timeout within the timeout" ok -> not ok
## M8 no-strata              "the unflagged sample is stratified by script and deterministic" ok -> not ok
## M9 guard-flag-not-always  "every guard flag is reviewed (any speaker)" ok -> not ok
## M10 error-message-leak    "unavailable/error with the class name only (no message leak)" ok -> not ok
## M11 no-consent-check      E13 ok -> not ok
## M12 scribe-not-wired      E11 ok -> not ok ; E12 ok -> not ok
## M13 rev1-no-exclusion     "crisis-eval: every row matches its documented expected level; crisis recall >= 0.95 (B16)" ok -> not ok
## M14 heldout-leak          "crisis-eval held-out (ISS-t-033-rev-2): labelled by intent, all three scripts, disjoint from the golden set" ok -> not ok
```

## Real outputs (run in the bound root at `f15995a`, 2026-09-27)

```
@vc/engine test:   ℹ tests 594  ℹ pass 594  ℹ fail 0
@vc/engine typecheck: exit 0 (tsc --noEmit && -p evals && -p scripts)
@vc/db test:       ℹ tests 233  ℹ pass 233  ℹ fail 0
@vc/api test:      36/36 pass, typecheck exit 0 (run before the implementation commit, same tree)
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity

B16 crisis recall (golden set, bar >= 0.95):
  counted rows:                  117/117 (1.0000)
  TRUE-crisis rows (counted, excl. benign-intent accepted_residual): 102/102 (1.0000)
  known_gap rows (not counted):  0/0 caught — none outstanding
  all crisis rows incl. known_gap: 117/117 (1.0000)
  false positives on benign-intent rows (D-020: accepted, measured, not suppressed): 15/73 (0.2055)
B16 HELD-OUT slice (independent of the patterns; NOT counted toward the golden-set bar):
  keyword-guard crisis recall: 10/28 (0.3571) — BELOW the 0.95 pilot bar: the guard alone is not pilot-ready
  benign rows flagged: 0/9
```
Missed held-out crises include plain phrasings in every script, e.g. "I'm so tired of being alive.",
"I've started cutting again, my arms are covered.", "Neend ki goliyan jama kar raha hoon.",
"मुझे मरने का मन करता है।", and all three abuse disclosures.

## Open gaps

1. **Pilot blocker (headline):** held-out keyword recall is 0.357. The regex guard alone is not
   pilot-ready. The classifier's real recall is unmeasured (tests use a fake provider). A fresh
   held-out slice is needed after any pattern tuning (this one is spent the moment patterns are fit to it).
2. New collections `escalation_notifications` / `crisis_flag_reviews` hold `studentId` but are NOT
   in `COLLECTION_NAMES`, db-init indexes, erasure (T-029) or the D-016 student-data scanner list
   (call sites use string literals, so the scanner does not see them). Reconcile after T-029 merges.
3. Shape reconciliation with T-029's email outbox: mine is `{kind, recipient{role,id}, status:
   "queued", channel: "record_only", notifiedAt, acknowledgedAt}` with recipient IDs; T-029's
   `EmailOutboxDoc` uses `to/subject/body` + `createdAt`. A delivery worker must map one to the other.
4. `apps/api` `createTenantWiring` does not pass `escalation` yet, and no recipient directory exists
   (the admin/counsellor resolver is injected). Until wired, production scribe runs write no escalations.
5. The background review writes happen outside the fence deadline.
6. Consent-first (B4): a no-consent session with a crisis turn gets NO escalation record. This is a
   human decision for Umesh (safety vs consent).
7. Sample rates (0.1 / 0.25 / 0.25) are a cost/recall knob with no decision behind them.
8. Guard-flagged COUNSELLOR turns are also reviewed/escalated (the guard runs on every speaker).
9. The loader test's skill count (11) may conflict with T-010 adding skills.
10. SLA parked: timestamps only, no number.
11. ISS-t-033-rev-1 addressed (true-crisis line); ISS-t-033-rev-2 addressed via the independent
    slice, whose result fails the bar (gap 1). Ledger status left for the checker.

## Close-out
Checker c0 PASS (verdict 2ad171e; ISS-t-033-rev-1/2 fixed). ai-engineer Approve (3 Warnings) + senior-software-engineer Approve (2 low) → ISS-t-012-rev-1..3 + gate crisis-escalation-consent; the erasure/scanner registration and apps/api wiring go to T-035. Held-out guard recall 10/28 = pilot blocker (ISS-t-012-rev-4).

## Status: checked-PASS
