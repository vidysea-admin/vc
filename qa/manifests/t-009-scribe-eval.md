# Manifest: t-009-scribe-eval

**Contract:** qa/contracts/counselling-engine.md (A5 exit gates: 0 uncited facts / 50 sessions, ≥80% light-edit notes; B1, B2, B9, B13, B14)
**Goal task:** T-009 (part 1 of 2 — the golden-session dataset and scorer; the live-Gemini run is a later, separately gated unit)
**Date:** 2026-09-25
**Status:** ready-for-check
**Fix cycle:** 0
**Fix cycle budget:** 0 of max 3 (no checker cycle has run yet)
**Design:** builds on T-007's real scribe graph (`packages/engine/src/scribe`) unchanged — this unit adds evaluation tooling only, no graph/node/schema edits.
**Diff range:** `e10e49d..HEAD` (base: "tasks: T-007 done; T-008 prerequisites", the tip of main at dispatch time)
**Scope:** `qa/evals/scribe/**` (new: `sessions.jsonl`, `reports/latest-*.{json,md}`), `packages/engine/evals/**` (new), `packages/engine/package.json` (scripts only: `test` glob widened to include `evals/*.test.ts`, new `eval:scribe` script, `typecheck` now also runs `evals/tsconfig.json`), this manifest.
**Not touched (brief constraints, verified by `git status`):** `packages/db/**`, `packages/engine/src/**`, `.claude/**`, `docs/DECISIONS.md`, `scripts/**`. No other file changed.
**Dual check:** no
**Issues addressed:** none opened against this unit yet; this unit exists to MEASURE ISS-t-007-rev-2 (case/punctuation citation sensitivity) and give ISS-t-007-rev-1 (schema-retry) and ISS-t-007-rev-3 (concern-level routing) a regression surface.
**Executor:** claude-opus-subagent (maker build subagent)
**Executor rationale:** a self-contained evaluation-tooling unit against a fixed, already-hardened graph (T-007 checked-PASS on main) — no graph/schema changes, so a single build unit with no parallel wave was appropriate.

## What this unit is, and is not

- **Is:** an offline, synthetic, golden-session dataset (`qa/evals/scribe/sessions.jsonl`, 22 sessions) plus a scorer (`packages/engine/evals/score.ts`) that runs the **real** `compileScribeGraph`/`startScribe` (T-007, unmodified) against a fake DB (`@vc/db/testing`) and an injected provider, and scores what the counsellor would see at the approval interrupt: extracted facts, dropped facts, citation quality, summary, and crisis/concern routing.
- **Is not:** the live-Gemini run (gated separately — see "UNVERIFIED / OUT OF SCOPE" below), and not a change to the scribe graph itself. Nothing under `packages/engine/src/scribe/**` was edited; every metric this unit reports is evidence ABOUT the existing T-007 code, not a claim that the code changed.
- **Does not write anything.** The scorer stops at the approval `interrupt()` and never calls `resumeScribe`; the write path (B3) already has its own T-007 tests. `qa/evals/scribe/sessions.jsonl` studentIds/sessionIds (`eval-student-*`, `eval-session-*`) exist only inside each run's in-memory fake DB.

## The dataset (`qa/evals/scribe/sessions.jsonl`)

22 hand-authored synthetic sessions (brief asked for ≥20), each with `turns`, hand-labelled `goldFacts` (key, value, source turnId, verbatim quote, sensitivity, `multiTurn` flag), and a `goldSummaryChecklist`. Written independently of the scribe's code — the quotes are lifted from the transcript text I wrote first, not reverse-engineered from what the graph would accept — and validated by a generator script (run once, output committed; the script itself is not part of this unit's deliverable and was not committed) that asserts every gold quote is a verbatim substring (after the SAME whitespace-collapse the engine's `verifyCandidateFact` uses) of its cited turn, so a "perfect" scripted provider is guaranteed to clear the graph's real citation guard.

Stratification (every required stratum present, tested by `evals/dataset.test.ts`):

| Stratum | Sessions | Notes |
|---|---|---|
| pure-english | s01–s05 (5) | includes one zero-fact, pure-chatter session (s05) |
| romanised-hinglish | s06–s09, s22 (5) | s22 doubles as a crisis session (original-language-only signal) |
| devanagari | s10–s13 (4) | s10's gold quote cites the Devanagari original text directly (not the translation) — the only session that does, so case-drift is provably a no-op there (see case-drift results) |
| code-mixed (within one turn) | s14–s16 (3) | Hindi + English mixed inside a single turn's text |
| multi-turn fact spans | s17–s19 (3) | gold marks `multiTurn: true`; correct extraction requires reading an earlier turn for context, even though the citation itself (schema-constrained to one turn) is on the confirming turn |
| concern | s20 (1) | one concern-level phrase amid an otherwise routine session |
| crisis | s21, s22 (2) | s21 crisis in English; s22 crisis signal ONLY in the Hinglish original, with a softened English "translation" (exercises the same original-language check T-007's own hostile-variant test covers) |
| distractor-chatter | s04, s05, s09, s13, s16 (5, ≥3 required) | small talk / traffic / weather turns with no gold facts, interleaved with real ones |

## The scorer (`packages/engine/evals/score.ts`, `citation.ts`, `providers.ts`, `report.ts`)

- **`score.ts`** builds a fresh `@vc/db/testing` fake DB per session (production `INDEX_PLAN` unique indexes declared, same pattern as T-007's own fixtures), seeds consent, compiles the real scribe graph with an injected `MockProvider`, and calls the real `startScribe`. It reads the interrupt's `ApprovalRequest` (facts, dropped, summary) and scores:
  - **citation precision** — an INDEPENDENT verbatim check (`citation.ts:classifyCitation`), deliberately not delegating to the graph's own `verifyCandidateFact` (a scorer that only asked the guard "did you accept this?" could never disagree with the code it grades). Classifies every raw candidate the provider proposed as `verbatim` / `case-mismatch` / `punctuation-mismatch` / `case-and-punctuation-mismatch` / `fabricated` / `malformed`. Precision = (not fabricated) / (candidates that claimed a citation at all).
  - **extraction recall** — gold facts found (by key + value) in the graph's actually-kept facts, over total gold facts.
  - **false drops** — a gold fact the graph DROPPED, whose drop reason is the citation-guard's "not verbatim" text AND whose independent classification says the underlying quote was genuinely case- or punctuation-drifted, not fabricated. This is quantified separately from a plain omission (the provider never proposing the fact at all).
  - **multi-turn-span handling** — recall restricted to the `multiTurn: true` gold facts.
  - **summary script-like leakage (B1)** — an independent `isScriptLike(summary, "evidence")` call from `@vc/schemas` (the same guard the graph's `summarizeSession` already runs, checked again here rather than trusted).
  - **summary checklist coverage** — case-insensitive substring match of each gold checklist phrase against the produced summary.
  - **crisis/concern routing correctness** — expected vs. actual escalation level for every session (not just the crisis-tagged ones — a false positive on a "none" session would show up too), plus a `providerCalledDespiteEscalation` flag proving B9 (no generative call on escalation).
- **`providers.ts`** — `candidatesForMode(session, mode)` is the single source of truth for what a scripted provider proposes; `buildScribeProvider` wraps it in a real `MockProvider`. The scorer's raw-candidate analysis and the actual graph run both come from this one function, so they cannot silently drift apart.
- **`report.ts`** renders the `EvalReport` as a markdown table; the CLI also writes the full JSON.

## Claims → evidence

| Claim | Evidence | Status |
|---|---|---|
| The dataset has ≥20 sessions, covering every required stratum, with ≥3 distractor sessions | `evals/dataset.test.ts` (7 tests) against the real `qa/evals/scribe/sessions.jsonl` | VERIFIED |
| Every gold quote is verbatim in its cited turn (case- and punctuation-exact) | `evals/dataset.test.ts` "every gold fact's quote is a verbatim substring…", re-checked independently of the (uncommitted) generator script that first enforced it | VERIFIED |
| A "perfect" provider (gold facts, verbatim citations) scores 100% precision and 100% recall through the REAL graph | `evals/score-perfect.test.ts`; CLI run `eval:scribe` (default) — 24/24 recall, 100% precision, 0 false drops, 100% crisis-routing accuracy, 0 script leaks, 100% checklist coverage, across all 22 sessions | VERIFIED |
| A "fabricator" provider (paraphrased, non-verbatim quotes) shows a measurable precision drop, and the graph's own guard drops every one (0 recall, not "written with a bad citation") | `evals/score-fabricator.test.ts`; CLI run — precision 0.0%, recall 0/24, every omission independently re-classified as `fabricated` (not a false drop) | VERIFIED |
| A "case-drift" provider (same words, upper-cased) shows up as FALSE drops, not fabrication, and quantifies ISS-t-007-rev-2 | `evals/score-case-drift.test.ts`; CLI run — citation precision stays 100% (genuinely-cited quotes), 23 case-mismatch false drops, 0 punctuation-mismatch (case-drift changes case only), recall collapses to 1/24 (only s10's Devanagari-quoted fact survives — Devanagari has no case, so upper-casing is a no-op there, and the test explicitly asserts recall > 0 for exactly this reason) | VERIFIED |
| A "lazy" provider (returns nothing) shows 0 recall | `evals/score-lazy.test.ts`; CLI run — recall 0/24, citation precision `null` (no citations to judge), checklist coverage 0% | VERIFIED |
| Crisis/concern routing (B9) is provider-independent — unaffected by lazy/fabricator/case-drift | All four `score-*.test.ts` files assert `crisisRouting.accuracy === 1`; `score-perfect.test.ts` and `score-lazy.test.ts` additionally assert `providerCalledDespiteEscalation === false` on every escalated session | VERIFIED |
| The scorer's precision metric is load-bearing, not decorative | Falsification (below): mutating the AGGREGATE precision computation in `score.ts` (not the per-session field, which the first mutation attempt showed is display-only) turns exactly one test red (`score-fabricator.test.ts`), everything else stays green; reverted, full suite green again, byte-identical `diff` against the pre-mutation file confirmed | VERIFIED |
| `pnpm -r typecheck` actually type-checks `evals/**`, not just `src/**` | `packages/engine/evals/tsconfig.json` (new, extends the repo base, includes `evals/**/*` + `../src/**/*`) is run as a second `tsc -p` pass from the `typecheck` script; caught a real type error (Fact.value's zod-`unknown()` optionality quirk) on the first run, which the fix in `score.ts` resolved | VERIFIED |
| `pnpm -r test` picks up the new tests | `packages/engine/package.json` `test` script widened to `tsx --test tests/*.test.ts evals/*.test.ts`; full-suite run below shows `packages/engine` at 97 tests (67 T-007 + 30 new) | VERIFIED |
| `eval:scribe` defaults to the perfect mock and documents the live-Gemini gate | `run-eval.test.ts` "defaults to the perfect provider with no args"; `--provider=gemini` throws naming `qa/gates/real-transcripts-gemini.md` and `GEMINI_API_KEY` (B13) rather than silently no-op'ing or running it | VERIFIED |
| Live Gemini run | Not run: `GeminiProvider` is still T-007's stub (`ProviderNotWiredError`); wiring it plus the per-use gate is a separate, later unit | **UNVERIFIED / OUT OF SCOPE (by design)** |
| A5 exit gate ("0 uncited facts shown in 50 audited sessions") | This unit's 22-session synthetic set is evidence toward that gate's methodology, not the 50-session audited count itself, and not real counsellor sessions | **UNVERIFIED** (partial — see "Remaining risk" below) |
| A5 exit gate ("≥80% post-session notes approved with light edits") | Not measurable offline — needs real counsellor review of real summaries, which this unit deliberately does not produce (B13: synthetic-only) | **OUT OF SCOPE** |

## TDD

Tests were written alongside each module and run before the dataset's `ts` field bug was fixed — the first `npx tsx --test evals/*.test.ts` run was genuinely RED (not a staged RED): every test that touched `loadDataset` failed with a real Zod error (`input.turns.0.ts: Required`), because the dataset generator omitted `TranscriptTurnSchema`'s required `ts` field. This was a real bug the schema caught, not a placeholder failure — fixed in the generator (default `ts` derived from the turnId's numeric suffix), the dataset was regenerated, and all 30 new tests passed on the next run with no further changes.

## Falsification (precision metric)

Script: none committed (per the brief's HARD RULES, only `qa/evals/scribe/**`, `packages/engine/evals/**`, `packages/engine/package.json` scripts, and this manifest may be touched — a repo-committed falsification script was out of scope; the exercise was run directly against the working tree and reverted).

| Step | Mutation | Result |
|---|---|---|
| 1st attempt | `scoreExtraction`'s PER-SESSION `citationPrecision` forced to `1` | All 30 tests stayed green — revealed this field is informational (per-session display) only; the AGGREGATE is computed independently in `scoreDataset` |
| 2nd attempt (load-bearing) | `scoreDataset`'s aggregate loop: `if (v.class !== "fabricated") citationNumerator++` → unconditional `citationNumerator++` | `score-fabricator.test.ts` went RED: `AssertionError: every fabricated quote must classify as fabricated, not a near-miss / 1 !== 0` (aggregate precision read back as 100% instead of 0%). All 29 other tests stayed green (proving the mutation's blast radius matched intent — only the precision-dependent assertion failed) |
| Restore | reverted from a pre-mutation copy | `diff` against the backup: identical (0 output). Full suite: 30/30 evals tests green again, `pnpm -r test` 308/308 |

## Actual outputs (this unit's own run, from the worktree root)

```
pnpm install
```
`Done in ~6s using pnpm v10.33.0`, exit 0. (One pre-existing, unrelated warning: `Ignored build scripts: esbuild@0.28.2` — not caused by this unit, no new dependency was added.)

```
pnpm -r typecheck
```
Exit 0. All 9 packages report `Done`, including `packages/engine typecheck: tsc --noEmit && tsc --noEmit -p evals/tsconfig.json` (two-pass, both clean).

```
pnpm -r test
```
Exit 0.

| Package | tests | pass | fail |
|---|---|---|---|
| apps/api | 1 | 1 | 0 |
| apps/web | 1 | 1 | 0 |
| packages/providers | 8 | 8 | 0 |
| packages/schemas | 50 | 50 | 0 |
| packages/observability | 57 | 57 | 0 |
| packages/db | 73 | 73 | 0 |
| mcp/university-kb | 9 | 9 | 0 |
| mcp/student-profile | 12 | 12 | 0 |
| packages/engine | 97 | 97 | 0 |
| **Total** | **308** | **308** | **0** |

(`packages/engine`'s 97 = 67 pre-existing T-007 tests, unchanged, + 30 new eval tests: 8 citation, 8 dataset, 5 providers, 5 CLI arg-parsing, 4 full-dataset scorer runs.)

```
python contracts/verify_contracts.py
```
`verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, exit 0.

```
pnpm --filter @vc/engine eval:scribe
```
(default `--provider=perfect`) — see the "perfect" row above; full report at `qa/evals/scribe/reports/latest-perfect.md`. Also run with `--provider=fabricator|case-drift|lazy` (not part of the default `eval:scribe` invocation, but exercised and committed as evidence): `qa/evals/scribe/reports/latest-{fabricator,case-drift,lazy}.{json,md}`.

## Design notes and deviations (for the checker)

- **The scorer never calls `resumeScribe`.** Every session run stops at the approval interrupt. This is deliberate scope discipline (T-007 already proves the write path against contract B3) — but it means this unit does NOT independently re-verify B3, only B1/B2/B9/B14 at the extraction/summary/routing layer.
- **`packages/engine/evals/tsconfig.json` is a new file, not an edit to `packages/engine/tsconfig.json`.** The brief's HARD RULES list `packages/engine/package.json (scripts only)` as editable but do not list the root `tsconfig.json`; since its `include: ["src/**/*"]` would otherwise leave `evals/**` completely outside `tsc`'s file set (TypeScript only follows imports from root-set files, and no `src/` file imports FROM `evals/`), a second, additive tsconfig was the only in-bounds way to get real type-checking over the new code. The `typecheck` script change is scripts-only, as permitted.
- **Report files are overwritten, not timestamped** (`qa/evals/scribe/reports/latest-<mode>.{json,md}`), so repeated `eval:scribe` runs don't accumulate files in the repo.
- **Case-drift's near-100%-but-not-quite recall (1/24) is intentional, not a dataset bug.** Only s10 cites Devanagari script directly; every other Devanagari session (s11–s13) happens to cite the English `translatedText` for its gold quote (matching how the `fact-extraction` skill is actually documented to work — "the English-translated text is what gets read"). `score-case-drift.test.ts` asserts recall is `> 0` for exactly this reason, and the per-session report shows which session survived.
- **`purposeTags` on scripted-provider candidates are set to `[profile_synthesis]`** to match what a real extraction would carry into the guard, though `verifyCandidateFact` discards and overwrites them regardless (ISS-t-007-rev-5) — set for realism, not because it's load-bearing here.

## Remaining risk / open questions

1. **A5's "0 uncited facts in 50 audited sessions" exit gate** needs real (or much larger synthetic) session volume and, eventually, real counsellor sessions — this 22-session set is a methodology proof, not the audited count itself.
2. **The live-Gemini run** (real model output against this same dataset/scorer) is the natural next step and is explicitly out of scope here per the brief — it needs Umesh's per-use go-ahead recorded in `qa/gates/real-transcripts-gemini.md` plus `GEMINI_API_KEY` (B13), and `run-eval.ts` refuses `--provider=gemini` until that wiring exists as a separate unit.
3. **ISS-t-007-rev-2 (case/punctuation citation sensitivity)** is now quantified (this unit) but not fixed — fixing `verifyCandidateFact` to normalise case/punctuation is a follow-up to the scribe graph itself (`packages/engine/src/scribe/nodes.ts`, out of this unit's touched-paths).
4. **ISS-t-007-rev-3 (concern-level routing)** — this dataset's one concern session (s20) documents current behaviour (concern stops the scribe, same as crisis) as a regression baseline; it does not resolve the product question in `qa/gates/scribe-concern-level.md`.
5. **Multi-turn fact spans** are scored, but the underlying schema still only supports single-turn citation (D-012/B2 unchanged). The 3 multi-turn sessions prove the CURRENT single-turn-citation design handles "needs context, cites the confirming turn" correctly; they do not exercise a genuine two-turn citation (out of scope — no schema change was in this unit's touched-paths).
6. **Review agents** (senior-software-engineer, ai-engineer for the eval-harness/scoring-metric design, data-engineer for the fake-DB usage) were not dispatched by this build subagent — the brief says to return to the orchestrator; no checker was dispatched either, per the brief's explicit instruction.
