# Debug — T-005b (crisis keyword guard), stall diagnosis after cycle 3

**Scope:** Phases 1–2 only (failure capture + root cause). Read-only toward code. No fix applied here.
**Unit:** `packages/engine/src/guards/crisis.ts`, worktree `D:\vc\.worktrees\t-005b-guard-hardening`, branch `wave/t-005b-guard-hardening`.
**Status:** fix-cycle budget exhausted (3 of 3). Cycle-2 checker PASS (`qa/verdicts/t-005b-guard-hardening.md`, cycle 2) was overridden by an ai-engineer Block on the cycle-3 code. Per the manifest's own header, "A FAIL here is STALLED." This unit needs a scoping decision, not a cycle-4 patch.

## 1. Failure capture

### 1.1 The cycle-by-cycle pattern (from the manifest + issues.jsonl, independently re-verified below)

| cycle | what it fixed | precision device added | what it broke |
|---|---|---|---|
| 0 | ported base + Devanagari/Hinglish patterns | whole-turn flatten (`normalise`/`squeeze`) | ISS-040: cross-word/cross-sentence FPs ("needs an end. It all comes together" → crisis) |
| 1 | ISS-040 (sentence-punctuation hard boundary before matching) | `splitSentences`, unconditional period-boundary | ISS-t-005b-c1-1 (zero-width inside keyword), c1-2 (dot-space letter-spacing shredded by splitSentences), c1-4 (newline treated as boundary) |
| 2 | c1-1/2/4 (recall-first detection views + narrow `isStrongBoundary` suppression) | boundary = punctuation + (whitespace OR capitalised-next) | ISS-t-005b-c2-1 (Block): a stop **followed by a space** hides the pattern's own trigger words — "kill. myself" → none |
| 3 | c2-1 (boundary = punctuation + capitalised-next only, whether or not whitespace follows) + c2-4 (zero-width join precision) | `isCapitalised(after)` + `INFINITIVE_MARKERS` exception + `FORMAT_RUN_BETWEEN_WORDS` lookbehind | ai-engineer Block (this diagnosis): "I hurt./cut. Myself" still missed; `FORMAT_RUN_BETWEEN_WORDS` is quadratic; Devanagari "।" reopens ISS-040-shaped cross-sentence FPs |

Each cycle's fix commit: `2fe3e54`..cycle-0 base, `7f2bd35` (cycle 1), `9946c4d` (cycle 2), `073a96d` (cycle 3, HEAD). Verified via `git -C .worktrees/t-005b-guard-hardening log --oneline -- packages/engine/src/guards/crisis.ts`.

### 1.2 The three cycle-3 findings, independently reproduced this session

All three were reproduced directly against the actual `crisisGuard()` at HEAD (`073a96d`), via a scratch probe run inside the worktree (`npx tsx`, deleted after use — no code touched):

**(a) "I hurt. Myself" / "I cut. Myself" still missed, unlike the manifest's own accepted-residual list:**
```
crisisGuard("I hurt. Myself, nobody else.")                    -> none   []
crisisGuard("I cut. Myself, that's the plan.")                 -> none   []
crisisGuard("I want to hurt. Myself, that's the plan.")        -> crisis ["\b(cut|cutting|hurt|hurting|harm|harming)\s+myself\b"]
```
Root cause, `isStrongBoundary` rule 5 (`crisis.ts:286-296`): the infinitive exception only fires when the word *two back* from "Myself" is in `INFINITIVE_MARKERS = {"to","wanna","gonna"}`. That only covers the pattern `(want|going|gonna|trying|wanna) to (die|kill myself|end...)`. It does **not** cover the separate, marker-less pattern `/\b(cut|cutting|hurt|hurting|harm|harming)\s+myself\b/i` (`crisis.ts:85`), which never requires "to" before it. So "kill. Myself" (has "to" earlier in real phrasing) is rescued by the gate; "hurt. Myself" / "cut. Myself" typed as two short sentences are not — a second, undocumented recall hole in the same mechanism the manifest just shipped as "the fix."

**(b) `FORMAT_RUN_BETWEEN_WORDS` is quadratic, confirmed independently (not the same shape as the maker's own ReDoS suite):**
```
const FORMAT_RUN_BETWEEN_WORDS = /(?<=\p{L}\p{M}*\p{L}\p{M}*)\p{Cf}+(?=\p{L}\p{M}*\p{L})/gu;
```
This lookbehind and lookahead both contain a variable-length `\p{M}*` quantifier. Timed on synthetic input shaped like stacked Unicode combining marks around a zero-width join (the shape the checker's own focus list named: "Devanagari matras sit next to ZWJ/ZWNJ inside conjuncts") — not the maker's ReDoS suite, which only tests flat ASCII repeats (`'k '×5000`, `'k.i.l.l 'x1250`, etc.) and never combines many stacked `\p{M}` marks with a format run:

| n (combining marks per side) | input length | time |
|---|---|---|
| 100 | 405 | 1.55 ms |
| 200 | 805 | 6.20 ms |
| 400 | 1605 | 24.66 ms |
| 800 | 3205 | 98.18 ms |

Time roughly quadruples as `n` doubles (400→800: 24.66ms→98.18ms, ratio 3.98) — textbook O(n²), confirming the reported 16.7s at a larger stacked-combining-mark input is a real, reachable DoS vector, not a one-off measurement artifact. The comment at `crisis.ts:382-383` shows the maker already fixed exactly this class of bug once this cycle (`WORD_OR_JOIN_RUN` was rewritten from a nested quantifier to a single-class linear scan after a 637ms case) but the *new* `FORMAT_RUN_BETWEEN_WORDS` lookbehind, added in the same cycle, reintroduces the same bug class via a different mechanism (variable-length lookaround instead of nested quantifiers) that the existing ReDoS suite's input shapes don't probe for.

**(c) Devanagari "।" reopens ISS-040-shaped cross-sentence false positives, systematically, not as an edge case:**
```
crisisGuard("मुझे लगता है खुद को। खत्म करना इस निबंध को है, ना कि किसी और चीज़ को।")
  -> crisis ["खुद\s+को\s+खत्म"]     (two unrelated Devanagari clauses, "। " between them)

crisisGuard("उसने कहा था कि वह अब मरना। चाहता तो वो भी नहीं था, बस थक गया था।")
  -> crisis ["मरना\s+चाहत[ाी]"]     (same shape, second Devanagari crisis pattern)

crisisGuard("I think I'm done with this essay. Finally finishing this project, not anything else.")
  -> none    (English analogue stays protected, confirming the asymmetry is script-specific)
```
Root cause, `isStrongBoundary` rule 4's own documented behaviour (`crisis.ts:273-274`): *"Devanagari has no case, so '।' before a Devanagari word is NEVER a boundary."* `isCapitalised()` is defined over `\p{Lu}`/`\p{Ll}` (Latin case), which Devanagari script does not have, so the function returns `false` for every Devanagari continuation, unconditionally. This is not a narrow miss on an exotic construction (contrast ISS-t-005b-c2-1/2/3, which needed adversarial code/URL/email/ellipsis inputs) — it means the entire cycle-1 ISS-040 fix (sentence-boundary suppression) has **zero effect for Devanagari script**, full stop. Any two adjacent, unrelated Devanagari sentences whose words happen to straddle a crisis pattern reproduce the exact bug class ISS-040 was opened to close, for that script only.

## 2. Which side the failure is on: loop design (a), not execution (b)

**Verdict: (a), the contract/unit scoping is wrong — not (b), execution/tooling.**

Evidence against (b): the manifest and the cycle-2 verdict show unusually strong engineering execution — TDD (RED/GREEN pasted each cycle), a falsification table isolating each mechanism by deliberately breaking it and confirming the right tests go red, an independent checker re-running probe tables from every prior cycle with zero regressions, a confusion matrix, and a ReDoS suite. The maker did not skip verification, misread the contract's literal text, or make a tooling mistake. Every cycle's fix is a correct, narrowly-targeted response to the specific finding from the cycle before it. This rules out a garden-variety execution failure.

Evidence for (a): the task's stated hypothesis holds up under direct testing. **A deterministic regex guard was asked to maximise both recall and precision against open-ended, multi-script, informally-punctuated natural language sentence boundaries — a problem regex/capitalisation heuristics cannot solve, only approximate.** Three cycles show the exact same shape:

1. Cycle 0 → ISS-040 (ai-engineer review, filed **high severity, blocking**, class `safety-precision`): whole-turn flattening produces cross-sentence FPs.
2. Fixing #1 (cycle 1's sentence-boundary split) → **loses recall** on zero-width, dotted letter-spacing, and newline-split phrasing (c1-1/2/4, all `safety-recall`/`contract-B9`, **blocking**).
3. Fixing #2 (cycle 2's recall-first views) → **reopens precision** exactly where the boundary rule is weakest (c2-1, a stop+space hides the pattern's own two trigger words — **Blocked by ai-engineer**, overriding a checker PASS).
4. Fixing #3 (cycle 3's capitalised-only boundary + narrow infinitive exception) → **still misses** the marker-less "hurt./cut. Myself" case, **reopens precision for Devanagari entirely** (no case = no boundary, ever), and the new lookaround needed to make the zero-width precision fix (c2-4) work is **quadratic**.

Each fix is locally correct and well-tested against the specific case named. The oscillation is structural: every rule added to suppress a false positive removes recall from some other, not-yet-enumerated phrasing of the same underlying signal, because "is this punctuation mark the end of a sentence" is not decidable by regex/capitalisation alone in mixed-register chat text (lower-case-after-period is common; Devanagari has no case signal at all; code/URL/email shapes look like keyword collisions). Three fix cycles is exactly the mechanism meant to catch a *bounded* number of holes — it is not built to converge on an *unbounded* one, and this is unbounded by construction.

**The B9 tension this surfaces:** the contract states false positives are the accepted/safe failure mode for this guard (`crisis.ts:5`, echoed throughout the manifest, verdict and issues log as the reason cycle-2/3's residual FPs — c2-1's own FP list, c2-2, c2-3 — don't block). But ISS-040, the finding that started the whole suppression chain in cycle 1, is itself a false-positive report, and it was filed and treated as **high-severity, blocking**, not logged as a safe-direction residual the way c2-1/2/3 later were. That inconsistency is the actual origin of the oscillation: the project accepted the "FPs are safe" principle for the FPs discovered *after* precision-suppression logic existed, but never applied it to the FP that justified *building* the suppression logic in the first place. Nothing in `qa/contracts/counselling-engine.md` B9 or B16 (both read in full this session) states a precision bar for this guard — B16 only names a **recall** threshold ("crisis recall is measured on an offline golden set... before any real-student pilot"), and the classifier described there is explicitly the async, non-blocking, second layer for exactly this kind of judgment call. There is no textual contract requirement forcing crisis.ts to suppress ISS-040-shaped false positives at all.

## 3. Recovery options (smallest first)

### Option A — revert to recall-only matching, drop all boundary suppression (smallest, cleanest)
Strip `isStrongBoundary`, `detectionViews`' capitalisation/infinitive/format-run-between-words machinery, `crossesStrongGap`, and `hasUncrossedMatch`'s boundary check entirely. Every pattern runs on the whole flattened turn, unconditionally — closer to cycle 0's `normalise()` than to cycles 1–3's sentence-aware matching. **Keep**: zero-width deletion (c1-1's fix — still needed, orthogonal to boundary logic), newline-as-space folding (c1-4's fix — same), and `collapseLetterSpacedRuns`'s single-letter-token-run collapse (c1-2's fix, does not create cross-word FPs by design since it only touches runs of 1-character tokens). **Remove**: `FORMAT_RUN_BETWEEN_WORDS` (the quadratic lookbehind) and `squeezedAcrossWholeFragments`'s join-point logic entirely — they exist only to serve the boundary-suppression precision goal this option abandons.

- **What happens to ISS-040 under this option:** it returns, in full. "That hurt my self-esteem a lot, but I'm working through it." → crisis. "I want to attend it all this semester, every workshop." → crisis. "My essay needs an end. It all comes together in the conclusion paragraph." → crisis. This is the exact regression the cycle-1 fix was built to prevent. Under the literal text of B9's "false positives are the safe failure mode," this is compliant — but it is a real, measurable, counsellor-facing cost: every one of these ordinary sentences routes to a crisis escalation card instead of continuing the session, which is alert-fatigue risk for both the counsellor and (per B16, once wired) the admin/counsellor notification.
- **`SELF_COMPOUND`** ("myself-esteem" → "my self-esteem") is a different kind of fix — it's a tokenisation-level disambiguation, not an after-the-fact match suppression, and it costs no recall (it only stops a hyphenated compound from mimicking the reflexive "myself"). It can be kept regardless of which option is chosen.
- **Needs a decision, and it is Umesh's.** This is not a contract-literal question (B9 already permits it) but a product/safety-scope call: is it acceptable, until T-012 ships, for the deterministic guard to escalate on "attend it all," "hurt my self-esteem," and similar ordinary phrasing? That is a real UX and counsellor-trust cost being knowingly accepted, on minors-safety-adjacent infrastructure — squarely "a decision only Umesh can make" (product direction / risk acceptance), not one the maker or checker should settle by picking a side of the same B9 clause everyone has already been citing both ways.

### Option B — Option A, plus route every crisis/concern flag through a "reviewed" downgrade layer (larger, needs T-012 to exist first)
Same code change as A, plus: any flagged turn is also passed to an async classifier (B16 already specifies this layer, not yet built — T-012) that can mark the escalation card "reviewed, likely benign" for a counsellor's attention, but the original flag is never deleted or hidden. This is the shape the task's hypothesis proposes and is consistent with B16's existing async/non-blocking design and with the "guardrails" brain pattern already cited in `qa/gates/crisis-safety-layers.md` (deterministic guard first, cheap model judge for the borderline/high-FP cases, defense in depth).
- Directly reduces Option A's alert-fatigue cost without reintroducing any of cycles 1-3's recall holes, because the deterministic layer never suppresses.
- **Needs both a contract amendment and a decision, and both are Umesh's.** B16 as written names the classifier's job as flagging "concern-level turns plus a stratified sample of 'none' turns" — it does not currently say the classifier also reviews crisis-level flags from the deterministic guard, or that its output is constrained to "downgrade never silence." That constraint would need to be written into B16 (or a new B-clause) before T-012 is built to it, the same way B12's CRUD scope and B15's confirm-before-delete were amendment-gated single sentences with real consequences if gotten wrong. It is also a bigger unit than this diagnosis's scope (T-012 doesn't exist yet) — not something to fold into a cycle-4 patch of crisis.ts.

### Option C — do nothing to the boundary logic; only fix the two independently-confirmed non-controversial bugs
Fix the "I hurt./cut. Myself" gap narrowly (extend the infinitive-marker check to also treat "myself" as boundary-blocking when the pattern match itself is one of the marker-less `CRISIS_PATTERNS` entries, not just after `to/wanna/gonna`) and replace `FORMAT_RUN_BETWEEN_WORDS`'s variable-length lookaround with a linear scan (same technique already used to fix `WORD_OR_JOIN_RUN`'s prior quadratic bug this same cycle). Leave the Devanagari "।" gap and the general precision/recall tension unresolved.
- This is the "cycle 4" the fix-cycle budget explicitly forbids (manifest: "3 of max 3, the FINAL one"; "A FAIL here is STALLED"). Recommended against on process grounds alone, independent of whether the patch would work — and given the pattern in section 2, a 4th narrow patch has a demonstrated track record of opening a 5th hole rather than converging. Listed only for completeness, not as a recommendation.

## 4. Recommendation for Phase 3 (out of this diagnosis's scope — for whoever runs it next)

Option A, gated by an explicit decision from Umesh (not a maker/checker call) on the alert-fatigue trade-off, with Option B named as the follow-on shape once T-012 exists. This keeps the deterministic layer doing only what B9's own text asks of it (never miss a signal) and stops asking a regex to do multi-script sentence-segmentation, which is the actual unbounded problem this diagnosis identifies. This unit (T-005b) should not reopen a 4th fix cycle on the same boundary-suppression mechanism; if Option A or B is approved, it is new scope (arguably its own unit / decision entry), not a continuation of the stalled one.

## 5. Sources read this session
- `qa/manifests/t-005b-guard-hardening.md`, `qa/verdicts/t-005b-guard-hardening.md` (worktree copies)
- `qa/issues.jsonl` (worktree copy — ISS-040, ISS-t-005b-c1-1..5, ISS-t-005b-c2-1..4; no ISS-t-005b-c3-* rows exist yet, this diagnosis is upstream of that logging)
- `qa/feedback-inbox.md`
- `qa/contracts/counselling-engine.md` (B9, B16, amendment log)
- `qa/gates/crisis-safety-layers.md` (T-012 / classifier scope, Umesh's "go with your recommendation" answer)
- `ARCHITECTURE.md` H5 (D-005, portable core / hard-rule guards)
- `packages/engine/src/guards/crisis.ts` at HEAD (`073a96d`), full file
- `git log --oneline -- packages/engine/src/guards/crisis.ts`: `2fe3e54`, `7f2bd35` (cycle 1), `9946c4d` (cycle 2), `073a96d` (cycle 3)
- Independent reproductions this session: scratch `tsx` probes inside the worktree (created and deleted, no tracked files touched) for the three cycle-3 findings, plus a standalone Node perf timing of the `FORMAT_RUN_BETWEEN_WORDS` regex shape
