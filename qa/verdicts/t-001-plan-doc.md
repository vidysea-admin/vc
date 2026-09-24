# Verdict — t-001-plan-doc

**Cycle checked:** 1
**Date:** 2026-09-25
**Checker:** fresh claude-sonnet-subagent, read-only, bound to `D:\vc`, no builder context
**Contract:** qa/contracts/counselling-engine.md, section A (criteria A1-A9)
**Rubric:** qa/rubrics/plan-doc.md (MUST M1-M9, SCORE S1-S5)
**Answering:** qa/verdicts/t-001-plan-doc.md cycle 0 (VERDICT: FAIL on M8/A4 + S3, ISS-006)

## What I re-ran myself (never trusted the manifest's pasted output)

1. **Diff scope** — `git status --short` / `git diff --stat HEAD`: only `qa/.last-tick` modified
   (+2 append-only lines) and `docs/plan.md` / `qa/manifests/` untracked (new). No unexpected file
   touched; no deletion/rename of anything.
2. **Mermaid parse (M2)** — own `npx -y @mermaid-js/mermaid-cli@latest -i docs/plan.md -o
   <scratch>/out.md` run: "Found 3 mermaid charts in Markdown input", 3 SVGs written, exit clean.
3. **Node count / classDef / direction (M3)** — own Python regex pass over all 3 fenced blocks:
   Block 1 (LR, 6 nodes), Block 2 (TD, 10 nodes), Block 3 (TD, 11 nodes); all ≤12, single
   direction, `classDef human/ai/data` present in all three.
4. **Section headings + FAQ + stop rule (M1/M6)** — own `grep`: 7 `## N.` headings in
   goal.md order; 11 `**"..."**` FAQ blocks; Diagram 3's closing fence at line 137, blank line
   138, `**Stop rule:**` at line 139 — directly under Diagram 3.
5. **Exit gates (M5)** — own `grep` of the compass file lines 215-217: verbatim match to
   plan.md §6's P1/P2/P3 exit-gate bullets.
6. **M8/A4 — the fixed criterion** — own Python extraction of every `- **...(step N)**` bullet in
   §3 and §4: §3 has 9 I/O lines covering steps 1-9 (all present, including the previously-missing
   step 2 "Session start / audio capture"); §4 has 11 I/O lines covering steps 1, 2, 3, 4, (an
   extra "Application Packet assembly" bullet), 5, 6, 7a, 7b, 8, 9 — all 9 numbered P2 steps
   (7 split into 7a/7b) now have an I/O line, including the previously-missing steps 1 ("Decision
   final"), 5 ("Student login") and 6 ("Portal router"). No P1 node or P2 step lacks an I/O line.
   **M8/A4 is now MET.**
7. **No built-claims (M9)** — own `grep -i 'built|implemented|already exists|is live|in
   production|deployed'`: same 3 hits as cycle 0 (future-student-model moat sentence, the explicit
   "Nothing described above is built yet in D:/vc" disclaimer, and a planned-schema sentence about
   consent). No violation, unchanged from cycle 0.
8. **Independent rubric grading** — dispatched a fresh, stateless grader subagent (Agent tool,
   general-purpose) per the /outcome-grader protocol, given only `qa/rubrics/plan-doc.md`,
   `docs/plan.md`, `goal.md` and the compass file as paths — no builder reasoning, no chat history,
   no knowledge of this being a re-check. Its independent MUST/SCORE grading matched mine on 8/9
   MUSTs and confirmed M8 fixed; it additionally flagged M3 as "not met" on the theory that Diagram
   1 (§2 Big picture) lacks numbered-step labels on its boxes, unlike Diagrams 2/3.
9. **Resolving the grader's M3 flag myself** — read `goal.md` lines 25-58 (the "Flowchart rules"
   section and goal.md's own canonical Diagram 1). Diagram 1 in `docs/plan.md` is a **verbatim
   reproduction** of goal.md's own reference Diagram 1 (identical node IDs C/A/S/E/P/K, identical
   labels including "Phase 1"/"Phase 2"/"Phase 3" sub-labels, identical edges) — and goal.md's own
   canonical Diagram 1 **also carries no numbered-step labels**, despite goal.md's general
   "Steps numbered hon (1,2,3…)" flowchart rule. Diagram 1's boxes are parallel surfaces (three
   product phases converging on one engine), not a sequence, so the numbering rule was never
   applied to it even in the source template the contract is derived from. This is a faithful
   match to the source, not a new gap — **I do not adopt the grader's M3 finding.** M3/A2 stands
   MET, consistent with both my own and cycle 0's independent reads.

## SCORE (adopting the independent grader's grounded scores, spot-checked against my own read)

S1=4 (§1's dense inline research citation costs a CEO reader a beat, otherwise clear in <2 min),
S2=5 (§3-6 fully sufficient to start T-002 without the compass), S3=5 (raised from cycle 0's 3 —
every P1/P2 step now carries a pasteable I/O JSON shape, the sole cause of the 3/5 score is fixed),
S4=5 (all four honesty markers explicit and un-hedged), S5=4 (P1 exit-gate numbers are restated
near-verbatim in both §6 and §7, a minor cross-section repeat, otherwise one idea per diagram).

All SCORE items ≥4 — meets the rubric's SCORE bar.

## SCOREBOARD

MUST: 9/9 met (M1-M9 all met; M8 newly fixed this cycle).
SCORE: S1=4, S2=5, S3=5, S4=5, S5=4 — all ≥4.
Contract A1-A9: all 9 met (A4 fixed, mirrors M8).

Rubric rule: "PASS = every MUST met, and ≥4/5 on every SCORE item." **Both hold — PASSES the
rubric's bar.**

## Capability coverage

Doc artifact — no isolating falsification, as declared in the manifest. Accepted on that basis;
the rubric verdict (independently re-derived by both this checker and a fresh grader subagent) is
the discriminator.

## Live browser evidence

Not applicable — no UI surface changed (`docs/plan.md`, `qa/manifests/` only).

## Issues

ISS-006 resolved this cycle — flipped to `fixed` by appending a new ledger line (append-only
ledger; original `open` line preserved for history).
`Issues addressed` in the manifest: ISS-006 — verifiably fixed, reconciled above.

## Executor

Manifest's Executor: claude-sonnet-subagent. Checker: claude-sonnet-subagent (fresh instance, no
`ANTHROPIC_BASE_URL` override, independent of the builder's context, independent of cycle 0's
checker instance).

---

VERDICT: PASS
SCOREBOARD: 9/9 criteria met, N/A invariants (document unit, no invariants in section A)
FAILURES (if any): none
CAPABILITY-COVERAGE: not-applicable (document artifact, no isolating falsification — rubric verdict carried in full above, cross-checked by an independent grader subagent)
LIVE-BROWSER: not-applicable (changed paths: docs/plan.md, qa/manifests/ only)
ISSUES-WRITTEN: none (ISS-006 flipped to fixed, not a new issue)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All 9 MUST criteria now hold, independently re-derived (own Mermaid CLI run, own node/classDef/direction count, own FAQ/stop-rule/exit-gate re-check, own I/O-bullet extraction for M8, own diff-scope check) and cross-checked by a fresh /outcome-grader subagent. M8/A4's 4 missing I/O lines (P1 step 2; P2 steps 1, 5, 6) are now present, confirmed by direct extraction, which also raises S3 to 5/5. The grader's one dissenting flag (M3, Diagram 1 lacking numbered steps) does not hold: Diagram 1 is a verbatim reproduction of goal.md's own canonical Diagram 1, which itself carries no step numbers — not a gap introduced by this artifact.
