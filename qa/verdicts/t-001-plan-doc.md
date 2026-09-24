# Verdict — t-001-plan-doc

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh claude-sonnet-subagent, read-only, bound to `D:\vc`, no builder context
**Contract:** qa/contracts/counselling-engine.md, section A (criteria A1-A9)
**Rubric:** qa/rubrics/plan-doc.md (MUST M1-M9, SCORE S1-S5)

## What I re-ran myself (never trusted the manifest's pasted output)

1. **Mermaid parse** — `npx -y @mermaid-js/mermaid-cli@latest -i docs/plan.md -o <scratch-outside-D:\vc>/out.md`
   from `D:\vc`. Real output: `Found 3 mermaid charts in Markdown input`, `out-1.svg`/`out-2.svg`/`out-3.svg`
   written, exit clean. Matches the manifest's claim independently.
2. **Section-fence / stop-rule position** — `grep -n '^```|Stop rule' docs/plan.md`: Diagram-3 closing fence
   is line 136, blank line 137, `**Stop rule:**` at line 138 — directly follows Diagram 3. Confirmed
   independently (own grep, not the manifest's script output).
3. **Node counts / classDefs / direction** — read all 3 fenced mermaid blocks myself: Diagram 1
   (LR, 6 nodes: C/A/S/E/P/K), Diagram 2 (TD, 10 nodes: S1-S9 + DB), Diagram 3 (TD, 11 nodes:
   A1-A10 + L). All ≤12, single direction each, `classDef human/ai/data` with goal.md's exact
   colours (`#d4edda`/`#28a745`, `#d6e4ff`/`#2f54eb`, `#eeeeee`/`#888`) in all three blocks.
4. **FAQ cross-question coverage (M6)** — read goal.md §7 myself and counted 11 cross-questions
   there; matched each against plan.md §7's 11 FAQ headers 1:1 in the same order. All 11 answered.
5. **Exit gates (M5)** — read compass lines 214-217 myself; plan.md §6's "Exit gates (verbatim...)"
   bullets are a verbatim match to compass L215-217.
6. **Number traceability (M7)** — independently traced 21 figures from the manifest's table to
   compass/goal.md source lines myself (14%/34% - compass L6,L17; exit-gate numbers - compass
   L215-217; Phase 0/1/2/3 week counts - compass gantt L198-211, converted correctly from day
   counts (14d=2wk, 21d=3wk, 28d=4wk); top 150 - compass L199; session costs $1.0-1.5/$2-2.5 -
   compass L227; $1.8-3k/month - compass L231; 13 May 2027 - compass L8/L239; DPDP fines
   ₹200cr/₹250cr - compass L259; ~50% autonomous - compass L258; avatar $0.01-0.10/min -
   goal.md L146, consistent with compass L187's Simli/LiveAvatar range; max 10-12 boxes -
   goal.md L27). Every figure checked traced cleanly. No unsourced figure found.
7. **A8/M9 "nothing claimed built"** — grepped `built|implemented|already exists|is live|in
   production|deployed` across docs/plan.md: the only "built" hits are (a) the moat sentence
   ("built up over years of sessions" — describes the *future* student model, not D:/vc code),
   (b) the explicit disclaimer at L207 ("Nothing described above is built yet in D:/vc"), and
   (c) a design-intent sentence at L286 ("Consent and purpose-tagging are built into the data
   model from day one" — describes the planned schema, not a present-tense D:/vc claim). No
   violation.
8. **Diff scope** — `git status --short` / `git diff HEAD --stat`: untracked `docs/plan.md` and
   `qa/manifests/` (as declared), plus a modified `qa/.last-tick` (an append-only maker-tick
   log line, not a deletion/rename of any function/class/export/route/test/config key, and not
   part of the artifact under check). Not a diff-scope violation — noted, not a finding.
9. **Independent rubric grading** — dispatched a fresh, stateless grader subagent (Agent tool,
   general-purpose) per the /outcome-grader protocol, given ONLY `qa/rubrics/plan-doc.md` and
   `docs/plan.md` as paths (plus goal.md/compass as the rubric's own referenced sources for
   M5/M6/M7 — no builder reasoning, no chat history). Its independent re-derivation matches my
   own points 1-7 above, and it additionally caught a real gap I confirmed myself (below).

## FAILURES

- **[M8 / A4]** sev: medium · Module I/O lines are missing for 4 of the 18 numbered P1+P2 diagram
  steps: P1 step 2 ("Session starts, student speaks" — no I/O bullet in §3, which jumps from
  step 1 to step 3), and P2 steps 1 ("Decision final"), 5 ("Student logs in to portal") and 6
  ("Known portal?" branch) — §4's I/O list only covers steps 2, 3, 4, 7a, 7b, 8, 9 plus an
  unlabeled "Application Packet (assembly)" bullet. I counted the bullets myself: §3 has 8 I/O
  lines (not the 9 the manifest's self-check table claims), §4 also has 8 (not 9) — the
  manifest's own evidence miscounted, which is the likely reason this gap wasn't caught before
  submission. Rubric M8 and contract A4 both read as literal ("every P1 node and every P2 step" /
  "every module has one line"), with no stated exception in the doc for human-only or pure-branch
  steps, so this is a genuine MUST failure on the artifact as written, not a benefit-of-the-doubt
  call. Fix direction: add one I/O line each for the 4 missing steps, or add an explicit sentence
  scoping M8/A4 to steps that transform data (excluding pure human actions and boolean branches)
  and apply it consistently. Issue: ISS-006.
- **[S3 AI-tool readiness]** sev: medium · scored 3/5 (< 4 required for PASS) — same root cause as
  above: an AI coding tool pasting §3-5 as-is has to infer the I/O boundary for 4 of 18 steps
  rather than reading it off the doc. Fixing M8 raises this score. Issue: ISS-006 (same root
  cause, not filed twice).

## SCOREBOARD

MUST: 8/9 met (M1, M2, M3, M4, M5, M6, M7, M9 met; M8 not met).
SCORE: S1=5, S2=5, S3=3, S4=5, S5=4.
Contract A1-A9: A1, A2, A3, A5, A6, A7, A8, A9 met; A4 not met (mirrors M8).

Rubric rule: "PASS = every MUST met, and ≥4/5 on every SCORE item." M8 fails and S3 < 4 →
**does not meet the rubric's PASS bar.**

## Capability coverage

Doc artifact — no isolating falsification, as declared in the manifest. Accepted on that basis
because the rubric verdict is carried in full above (this checker independently re-ran the
grading rather than trusting the manifest's self-check table alone, and found a real gap the
self-check table's own miscount had papered over).

## Live browser evidence

Not applicable — no UI surface changed (`docs/plan.md`, `qa/manifests/` only).

## Issues

Written: ISS-006 (medium, open, class doc-gap).
`Issues addressed` in the manifest: none claimed, none to reconcile.

## Executor

Manifest's Executor: claude-sonnet-subagent. Checker: claude-sonnet-subagent (fresh instance,
no `ANTHROPIC_BASE_URL` override, independent of the builder's context).

---

VERDICT: FAIL
SCOREBOARD: 8/9 criteria met, N/A invariants (document unit, no invariants in section A)
FAILURES (if any):
- [M8/A4] sev: medium · Module I/O lines missing for 4/18 P1+P2 steps (P1 step 2; P2 steps 1, 5, 6) · add the missing I/O bullets or an explicit human/branch-step exemption sentence · issue: ISS-006
- [S3] sev: medium · AI-tool-readiness scored 3/5 (< 4 required), same root cause as M8/A4 · fixing M8 raises this score · issue: ISS-006
CAPABILITY-COVERAGE: not-applicable (document artifact, no isolating falsification — rubric verdict carried in full above)
LIVE-BROWSER: not-applicable (changed paths: docs/plan.md, qa/manifests/ only)
ISSUES-WRITTEN: ISS-006
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: 8 of 9 MUST criteria hold with independently re-derived evidence (own Mermaid CLI run, own node/classDef/direction count, own FAQ and exit-gate cross-check, own 21-figure traceability trace, own diff-scope check) plus a fresh independent /outcome-grader dispatch that found the same picture. M8/A4 fails because 4 of 18 numbered P1/P2 diagram steps have no Module I/O line, which also caps S3 at 3/5 — a narrow, mechanically fixable gap, not a structural or honesty problem.
