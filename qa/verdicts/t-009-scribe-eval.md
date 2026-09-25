# Verdict: t-009-scribe-eval

**Verdict:** PASS
**Cycle checked:** 0
**Date:** 2026-09-25
**Diff range:** `e10e49d..87152b3` (commit 87152b3)
**Contract rows:** B1 (script-like summary, re-checked independently), B2 (cited facts), B9 (crisis before generative call), B13 (no student data to external models / Gemini gate), B14 (outcome, not construction)

This is a part-1 unit: offline, synthetic golden-session dataset + scorer for the T-007 scribe graph. No product code (`packages/engine/src/**`) is touched; this unit is evidence tooling only, scored against T-007's already-checked-PASS graph.

## 1. Verify commands (fresh, in the worktree)

```
pnpm install                 -> Done in 568ms, exit 0 (pre-existing esbuild build-script warning only)
pnpm -r typecheck             -> 9/9 packages "Done", including packages/engine's two-pass
                                  (tsc --noEmit && tsc --noEmit -p evals/tsconfig.json), exit 0
python contracts/verify_contracts.py -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0
```

`pnpm -r test`, recomputed independently, matches the manifest's table exactly (308/308, 0 fail):

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

`pnpm --filter @vc/engine eval:scribe` re-run for all four provider modes, matching the manifest's claimed numbers exactly:

| Mode | Citation precision | Recall | False drops (case/punct) | Crisis routing |
|---|---|---|---|---|
| perfect (default) | 100.0% | 24/24 (100%) | 0/0 | 22/22 |
| fabricator | 0.0% | 0/24 (0%) | 0/0 | 22/22 |
| case-drift | 100.0% | 1/24 (4.2%) | 23/0 | 22/22 |
| lazy | n/a (0 citations) | 0/24 (0%) | 0/0 | 22/22 |

Diff scope confirmed via `git diff e10e49d..87152b3 --stat`: only `packages/engine/evals/**` (new), `packages/engine/package.json` (scripts only — `typecheck`, `test`, `eval:scribe`), `qa/evals/scribe/**` (new), and this manifest. No touch to `packages/db/**`, `packages/engine/src/**`, `.claude/**`, `docs/DECISIONS.md`, `scripts/**`, as claimed.

## 2. Dataset integrity

All 22 sessions read in full (not just a 10-session sample) and dumped alongside their gold facts, checklist and strata to `qa/evals/scribe/sessions.jsonl` → scratchpad text.

- **Verbatim-quote check, scripted independently of the repo's own `dataset.test.ts`**: parsed every gold fact's `quote` against its cited turn's `text` and `translatedText` with a whitespace-collapse (Python, not the shipped TS test). 25/25 gold facts (across all 22 sessions, including the concern session's one fact) verify as a genuine verbatim substring. 0 failures.
- **Fact correctness, spot-checked by hand across all 22 sessions**: currency conversions are arithmetically correct (20 lakh → 2,000,000; 15 lakh → 1,500,000; 18 lakh → 1,800,000), multi-turn sessions (s17–s19) correctly cite the *confirming* turn while the earlier turn supplies context only, and the distractor sessions (s04, s09, s13, s16 etc.) correctly cite the real fact's turn and not the distractor turns around it.
- **Strata labels**: spot-checked against content — devanagari sessions (s10–s13) genuinely contain Devanagari script, code-mixed sessions (s14–s16) genuinely mix Hindi/English within one turn, multi-turn sessions genuinely require the earlier turn for interpretation (e.g. s17's "Let's go with Canada" only resolves against t1's "torn between Canada and Australia"). Correct.
- **No real student data (B13)**: all 22 sessions are plainly synthetic — generic names of countries/courses/budgets, no resemblance to real transcripts, no reference to `D:/ikigai_counsellor/transcripts/` or any external fixture. Confirmed.
- **Independence of gold from the scribe's code**: the manifest's claim ("quotes lifted from transcript text written first... validated by an uncommitted generator script") is **not independently re-verifiable** by the checker — the generator script that first enforced verbatim-quoting was run once and not committed, per the brief's touched-path restriction. This is a real, if narrow, residual-trust gap: nothing in the repo proves the gold facts weren't written with knowledge of `verifyCandidateFact`'s behaviour. It does not block this PASS (the dataset's actual verbatim-quote property is independently checked above, and a "perfect" provider scoring 100% is unsurprising and expected either way; what matters more is the fabricator/case-drift/lazy behaviour, which is scored on catching *wrong* citations, not helped by foreknowledge of the guard). Logged as ISS-t-009-c0-1 for future units to close (commit the generator, or regenerate independently).

## 3. Scorer validity

**My own middle-ground provider, run through the REAL graph** (not the shipped `perfect`/`fabricator`/`case-drift`/`lazy` modes): built a scratch script (`packages/engine/.checker-scratch-falsify.ts`, deleted before commit, never part of the diff) that, across the dataset's 19 non-escalated sessions (24 gold facts), alternates a verbatim candidate and a differently-paraphrased-fabricated candidate per gold fact (12/12 split), plus one decoy candidate for a key not in gold with a wholly invented quote. Ran the real `compileScribeGraph`/`startScribe` against this custom `MockProvider`, and the real, exported `classifyCitation` against my own candidates.

Hand-calculated expectation: recall 12/24 = 50.00% (only verbatim ones get written by the real guard), citation precision 12/25 = 48.00% (12 verbatim / 25 total raw candidates including the decoy), 0 false drops (pure fabrication has no case/punctuation near-miss).

Actual, from the real graph + real classifier: recall 12/24 = 50.00%, precision 12/25 = 48.00%, 0 false drops. **Exact match.**

- **Citation precision uses an independent classifier, not the graph's own guard**: confirmed by reading both implementations. `packages/engine/evals/citation.ts:classifyCitation` and `packages/engine/src/scribe/nodes.ts:verifyCandidateFact` are two separately-defined functions (each defines its own local `collapseWhitespace`, not a shared import) — the eval harness does not call into or wrap the product guard for its verdicts, it only reuses the guard's own normalisation convention on purpose (documented). Genuinely independent.
- **False-drop categories are correct**: `score-case-drift.test.ts` asserts every false drop's `class` is `case-mismatch` (never punctuation) for a provider that only upper-cases text, and the CLI run confirms `case: 23, punctuation: 0, both: 0` — matches the mode's actual transformation.
- **Crisis routing is scored against gold labels, not tautologically**: `scoreSession` compares the real graph's `outcome.result.escalation.level` against `session.expectedCrisisLevel`, a hand-authored field in the dataset, not anything derived from the graph itself. Confirmed by reading `score.ts:126-132`.

## 4. Gemini refusal

`packages/engine/evals/run-eval.ts:parseArgs` special-cases `--provider=gemini` to `throw` before `loadDataset`/`scoreDataset` ever run, naming `qa/gates/real-transcripts-gemini.md` and `GEMINI_API_KEY`. `ProviderMode` (`providers.ts`) is a closed union of `"perfect" | "fabricator" | "case-drift" | "lazy"` — `"gemini"` is not a member, so nothing downstream can silently accept it; the CLI's `isProviderMode` guard would independently reject it even without the explicit throw. `git diff e10e49d..87152b3` greps clean for `gemini`/`GEMINI_API_KEY` outside this refusal path, its test, and doc comments — no provider implementation exists to accidentally invoke. `packages/engine/package.json`'s `test` script (`tsx --test tests/*.test.ts evals/*.test.ts`) never passes `--provider=gemini`, and `run-eval.test.ts` covers the refusal directly (`refuses --provider=gemini with a message naming the gate (B13)`), which re-ran green above.

No `MONGODB_URL` or secret-shaped strings anywhere in the diff (`git diff | grep -i "MONGODB_URL\|mongodb://\|AIza\|sk-\|api_key"` — clean). `@vc/db/testing` (pre-existing T-007 infra, unchanged) has no `MongoClient`/`connect(` — genuinely in-memory, offline.

## 5. Falsification (own mutation, distinct from the maker's manifest exercise)

The maker's manifest already falsified the *aggregate citation-precision loop*. I independently falsified a **different** load-bearing line — the recall-matching logic in `scoreExtraction` (`score.ts:65-67`):

```
- if (match) recalledKeys.add(gf.key); else omittedKeys.push(gf.key);
+ if (true) recalledKeys.add(gf.key); else omittedKeys.push(gf.key);   // always "recall"
```

Mutated directly in the worktree (not a copy — a from-scratch scratchpad copy can't resolve the pnpm workspace's `@vc/*` packages or run the real LangGraph graph; this is the same in-worktree mutate/restore pattern the t-007 checker used, with a guaranteed revert). Ran `pnpm --filter @vc/engine test`:

- **RED**, exactly as predicted: `case-drift`, `fabricator`, `lazy` provider tests all failed (each asserts `recall === 0` or `< 1`), because recall was now unconditionally 100%.
- **perfect** stayed green (it already recalls 100%, so the mutation is a no-op there) — correctly narrow blast radius, confirming the mutation targets exactly the recall computation and nothing else.
- All other tests (citation, dataset, providers, CLI arg-parsing) stayed green, as expected — this mutation only touches recall.

Restored via `Edit` back to the original line; `git diff --stat packages/engine/evals/score.ts` is empty (byte-identical). The scratch script (`packages/engine/.checker-scratch-falsify.ts`) was deleted; `qa/evals/scribe/reports/*` (touched by my own `eval:scribe` re-runs in §1) were reverted with `git checkout --`. `git status --short` at the end of this check showed a clean tree before I wrote this verdict.

## 6. Design notes accepted as documented, non-blocking

- The scorer stops at the approval `interrupt()` and never calls `resumeScribe` — B3 is intentionally out of scope here (already covered by T-007). Confirmed true: no `resumeScribe` call anywhere in `evals/**`.
- `evals/tsconfig.json` is additive (`include: ["**/*", "../src/**/*"]`, `extends` the base config) — does not touch `packages/engine/tsconfig.json`, matches the manifest's stated reasoning (TS's `include`-set-only traversal would otherwise leave `evals/**` untype-checked).
- A5's "0 uncited facts / 50 sessions" and "≥80% light-edit notes" exit gates are correctly labelled UNVERIFIED / OUT OF SCOPE in the manifest, not falsely claimed as met by this 22-session synthetic set. Appropriately conservative.

## 7. Verdict rationale

Every verify command reproduces the manifest's claimed numbers exactly, with no discrepancy (308/308 tests, all four provider-mode metrics bit-for-bit). Dataset integrity holds on full-set (not just sampled) verbatim-quote and fact-correctness checks; the one residual gap (uncommitted generator script, so "written independently of the code" can't be re-proven) is real but narrow and logged as ISS-t-009-c0-1 rather than silently accepted. The scorer was stress-tested with a genuinely new, checker-authored provider run through the real graph and the real independent classifier, and its aggregate math matched a hand calculation exactly (50% recall, 48% precision, 0 false drops). The citation-precision classifier is confirmed structurally independent of the product guard it grades. The Gemini refusal is closed at the type level, the CLI level, and the test level, with no live-provider code path to accidentally reach. My own falsification of a different formula than the maker's (recall matching, not the aggregate precision loop) turned exactly the predicted three tests red and nothing else, and the worktree was fully restored (`git diff` empty) before this verdict was written. No blocking issues found. The unit **PASSes** cycle 0.
