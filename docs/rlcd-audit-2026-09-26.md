# /rlcd audit — calibrated decision routing

Date: 2026-09-26
Scope: bound to **D:\vc only**. Sibling repos (D:/KnowledgeBase, D:/ikigai_counsellor, etc.) are out of scope and were not scanned.
Read-only: this audit did not edit, stage, or commit any code or contract file. Only this report was written.

Sources:
- `umesh/operating-brain/wiki/patterns/calibrated-decision-routing.md` — the routing pattern (Jev hosted / LAYA self-hosted / LLM-judge / human bands, tau formula, adoption steps).
- `umesh/operating-brain/wiki/concepts/ai/jev-laya-system1-decision-models.md` — the System-1 decision-model concept page, including the repo-scan note naming T-012 the "Strong" LAYA candidate.

One line: vendor speedups (the Anthus 71-72% figure, vendor claims of 40-200x) are cited context only — **not expected results for this repo.** Every number in this report is either measured on disk or marked `[ASSUMPTION]`.

## Node table

| Node (file:line) | Current method | Options | Volume / latency | Data class → model | Labels source | Rank |
|---|---|---|---|---|---|---|
| T-012 concern classifier — additive "likely-benign" hint. Regex guard: `packages/engine/src/guards/crisis.ts:399` (`crisisGuard`), `:441` (`routeBeforeGeneration`); called from `packages/engine/src/scribe/nodes.ts:101` (`checkCrisis`); task row `TASKS.md:22`; gate doc `qa/gates/crisis-guard-precision.md` | Deterministic regex guard in production (patterns + homoglyph/separator folding), recall-only by design (D-020), 3-way none\|concern\|crisis. T-012 hint layer itself is unbuilt | Binary per already-concern-flagged turn: likely-benign hint vs no hint. May never re-label crisis, may never suppress (B9/B16) | Guard: every turn, sub-ms, blocking hot path (unchanged). T-012 layer: concern-flagged turns + stratified "none" sample, async, off hot path | safety-critical → self-hosted LAYA (see model-choice note below) | `qa/evals/crisis-eval.jsonl`, 114 hand-labeled rows; same-author set (ISS-039), not independently reviewed | strong |
| Card / citation Verifier. Deterministic backstop: `packages/engine/src/guards/citation.ts:23` (`citationGuard`), `:50` (`dropUncited`); planned node: `docs/plan.md` step 6; prompt at `skills/verifier/SKILL.md`; future call site `packages/engine/src/index.ts:5` | Not implemented. `citationGuard` + `evals/citation.ts`'s 6-way `classifyCitation` check quote fidelity only, not whether the source supports the claim | 3-way per card (plan.md): keep \| drop \| flag unverified. A separate raw framing named a narrower cited/uncited binary — needs reconciling into one option set before build | Every candidate Card, multiple per turn, live interactive session — latency matters | pii → self-hosted LAYA by default (mixed public-KB + transcript-quote input); a provably public-KB-only subset could route to hosted Jev, worth designing before build | none. The 6-way heuristic scores near-misses, not the actual support judgment | medium |
| Card-type chooser (ExplorationPlanner). Schema stub: `packages/schemas/src/schemas.ts:75-76` (`CardTypeSchema`) | None built. `CardTypeSchema = z.enum(['widen','challenge','clarify','compare','evidence'])` exists only as a type; T-010 open, gated on scribe (T-007, done) | Fixed one-of-5 per the schema and per `docs/plan.md:91` and `:105` (all 5 types, including clarify) | Live, in-session, turn-by-turn; counsellor sees at most 3 cards at a time — tightest latency budget in the app | pii → self-hosted LAYA (small structured JSON input, <512 tokens, carries student facts) | none. T-009's golden sessions cover scribe/fact eval, not card-type labels | medium |
| Context-relevance / already-known-fact suppression filter. Spec only: contract B18 | None built — pure spec, no relevance-scoring or suppression logic in `packages/` | Two bundled binaries not yet split into separate nodes: (1) topic-irrelevant → suppress, (2) fact already known/do-not-ask → never resurface | Every candidate topic/question/card once built, synchronous with generation, latency-sensitive | pii → self-hosted LAYA once built | none. B18's own proof plan is synthetic transcripts, no human-reviewed queue | weak |
| No-script (recital-cue) guard. `packages/schemas/src/guards.ts:79` (`isScriptLike`) → `schemas.ts:95`; `packages/engine/src/guards/no-script.ts:22-23` (`noScriptGuard`) → `hard-rules.ts:28` (`applyHardRules`) | Deterministic regex v2 (recital-cue phrase list + per-CardType rule, ISS-008). Already near-zero latency, no model call | Binary: script-like yes/no | Every generated Card + every session summary — high volume, synchronous, negligible latency today | pii → benchmark-against-existing (regex already fast; no case to replace it) | ~40 hand-labeled pairs across four test files (`packages/schemas/tests/guards.test.ts`, `card.test.ts`, `apps/web/tests/new-session-ui.test.tsx:32`, `apps/web/tests/ui.test.tsx:132`) — below the 100-150 label bar | weak |

## Dropped candidates

- **`packages/providers/src/index.ts:495` (`isRetryableProviderError`)**, test table `packages/providers/tests/failover.test.ts:279-296` — deterministic, exhaustive whitelist over a typed error object / HTTP status. 12 `assert.equal` cases (timeout, malformed, network, HTTP 429/500/503 true, HTTP 400/401/403/404 false, plus ZodError true / generic Error false), not the 17 first claimed — the test table is already 100% deterministic ground truth. Not an RLCD candidate.
- **Planned contract B22** (blocked per `docs/intent.md` Open questions; Sapna ma'am's rubric not yet recorded) — fails the volume/latency test (eval/release time only, not live) and is blocked by a missing human-authored rubric rather than a labelling-volume gap. Shape is multi-hop transcript judging against a rubric, closer to an LLM-judge than a short fixed-option pick.

## Top node — tau routing and benchmark recipe

**Node:** T-012 concern classifier (additive likely-benign hint, `crisis.ts:399/441`).

**Model-choice correction (skeptic):** Contract B16 and `TASKS.md:22` both name **Flash-Lite** (hosted Gemini) as the classifier for this node — not LAYA. Routing it to self-hosted LAYA instead is a deliberate substitution, justified by B13 (no real student/counselling data to external services) and already recorded in `D:/ai_os/umesh/decisions/log.md` (2026-09-26 entry naming the same Flash-Lite→LAYA swap). The recommendation below assumes that substitution; it is not what B16's plain text says.

**tau (all costs [ASSUMPTION], pending real numbers from Umesh/finance):**

tau = (C_err − C_human) / (C_err − C_auto)

- C_err [ASSUMPTION] = $50/turn — cost of a WRONG "likely-benign" hint. This is bounded, not a missed-crisis cost, because B9/B16 force the underlying crisis/concern flag to stay visible to the counsellor regardless of the hint (recall-only, additive-only design). The exposure is a delay/attention-dilution cost, not a suppressed crisis.
- C_human [ASSUMPTION] = $2/turn — loaded cost of a counsellor/admin manually triaging one concern-flagged turn.
- C_auto [ASSUMPTION] = $0.001/turn — self-hosted LAYA inference (compute only, no vendor fee).
- tau = (50 − 2) / (50 − 0.001) = 48 / 49.999 ≈ **0.96**.

Reading: a wrong benign-hint is judged far costlier than the human-review alternative even though the flag is never hidden, so the auto-accept confidence bar should sit very high (~0.96 normalised confidence) before the hint is shown without a human also seeing the raw flag context. Anything below that band leans to human/LLM-judge review. Revisit all three costs with Umesh before wiring an actual threshold into code.

**Benchmark recipe:**

1. Expand `qa/evals/crisis-eval.jsonl` (114 rows) using T-012's own spec: add a stratified "none" sample and hard negatives. Split into a frozen dev/test partition before any tuning.
2. On the same held-out set, measure BOTH the deterministic guard alone and guard+LAYA-hint on:
   - accuracy on the hint label (likely-benign vs no-hint)
   - ECE (target <0.03, per the Anthus reference — a reference point, not a promise)
   - p50 and p95 latency per call
   - cost per 1k calls (self-hosted LAYA compute-only)
   - share auto-accepted at a target precision — report the number measured on THIS data; do not carry over the Anthus 71-72% figure or vendor 40-200x figures as expected results.
3. **Non-negotiable gate, not a tradeoff metric:** recall of guard+hint combined must not regress below the bar contract **B16** sets (recall ≥ 0.95, measured on an offline golden set before any real-student pilot). Correction: `qa/gates/crisis-guard-precision.md` was checked in full and carries no numeric recall bar — it only records the recall-only-vs-suppression decision (Option B, 2026-09-26). The 0.95 figure comes from `qa/contracts/counselling-engine.md` B16, not the gate doc.
4. Prefer a calibration layer (temperature/Platt scaling) on a frozen small LAYA over full fine-tuning — the Anthus study found a 42% off-task drift from full fine-tuning.
5. Ship behind a flag, tau logged per-decision. The current regex guard stays the fallback path. Record the result (adopted/rejected + numbers) in a decisions-log entry per the calibrated-decision-routing pattern's adoption steps.

## Contract guard-rails binding any change

- **B2 (fail-safe direction, amended D-020, 2026-09-26):** text facts are kept, never dropped — a model may only move a fact TO needs-review, never away from it. Note for the Verifier node (T-010): `docs/plan.md:71`'s Mermaid box still says "every fact needs a source, else drop or label unverified" — stale wording against the amended B2. `docs/plan.md:93`'s prose clarifies the Verifier actually acts on Cards, not KG Facts, so there is no live code violation today, but the diagram wording must be corrected before T-010 is built, or it risks reintroducing the exact violation B2 forbids.
- **B9/B16 (never-suppress):** the concern/crisis flag stays visible to the counsellor regardless of any hint. T-012's hint is additive-only by construction; no recommendation in this report instructs suppression or hiding of the flag.
- **B13 (no real data to external services):** counselling/student text never goes to a hosted model. This is why T-012 and the Verifier route to self-hosted LAYA rather than the hosted Flash-Lite/Jev path even though B16's plain text names Flash-Lite.
- **Data class → model:** any node touching student/counselling text (pii or safety-critical) routes to self-hosted LAYA. Only a node confirmed to touch public-KB-only data could route to hosted Jev — no node in this table currently qualifies outright; the Verifier's public-KB-only subset is a possible future exception, not a present one.

## Evaluate, don't switch — next step per top-3 node

1. **T-012 concern classifier (strong):** benchmark a calibration layer on frozen LAYA against the expanded `qa/evals/crisis-eval.jsonl` dev/test split (step 1-2 above), gated on the B16 recall ≥ 0.95 floor. Do not wire a threshold into code before Umesh confirms the three tau costs.
2. **Card / citation Verifier (medium):** before benchmarking anything, reconcile the 3-way keep/drop/flag option set against the separately-named cited/uncited binary into one shape, and fix `docs/plan.md:71`'s drop-language against amended B2. Then start a human-reviewed keep/drop/flag label queue from T-010's first shipped version — there is no labelled set to benchmark on yet.
3. **Card-type chooser (medium):** ship a rule-based v1 against the existing 5-type `CardTypeSchema` (schemas.ts:75), log its outputs as the seed label queue, then benchmark LAYA against that seed set once it has enough rows. No naming mismatch to resolve — the schema, plan.md prose (:91, :105) and TASKS.md all reconcile once the diagram shorthand at `docs/plan.md:70` is read as shorthand, not as a fourth option set.

## Skeptic corrections applied

- Card-type chooser: removed the false claim that contract B17/B20 name only 4 card types — the contract never names any card type; the "mismatch" was a diagram/task-note shorthand (`docs/plan.md:70`, `TASKS.md:20`) against prose/schema that already agree on 5.
- Benchmark recipe: recall ≥ 0.95 floor re-attributed from `qa/gates/crisis-guard-precision.md` (no numeric bar found on read) to contract B16 (has the bar).
- Dropped candidate `isRetryableProviderError`: test-table count corrected from 17 to 12 `assert.equal` cases (`failover.test.ts:279-296`).
- No-script guard labels: test-file count corrected from three to four files that call `isScriptLike` directly.
- Card Verifier: added the B2 fail-safe staleness flag on `docs/plan.md:71`'s "drop" language, per the amended B2 (D-020).
- T-012 model field: reattributed "self-hosted LAYA" from an apparent contract mandate to a documented substitution (B13-justified, recorded in `umesh/decisions/log.md` 2026-09-26) over B16's plain-text "Flash-Lite".

No correction changed the top-line verdict: T-012 remains the strongest node, no node is misclassified public while touching student data, and no recommendation suppresses or hides the B9 flag.
