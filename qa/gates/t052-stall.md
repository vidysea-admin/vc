# HUMAN_GATE: t-052 STALLED in fix cycle 2 (the last cycle)
Opened: 2026-10-25T12:50+05:30 · Blocks: t-052 (B23.1-B23.7 session lifecycle) · Owner: Umesh

## Why it stalled
Cycle 2 has gone through four plan reviews (delta-1, delta-2, attribution, delta-3). Each review approved a design, and the copy-only probe then found new REDs. The probes for review-delta-3 (main 19c9805, qa/evidence/t052-c2-p0/f-probes/) found:
- **F3 failed.** Design 3a turns rows 5-7 GREEN, but 64-66 stay RED 5/5 in a new way (the W1 gap). M39 is no longer discriminated by the start rows.
- **F5 needs a graph.ts hunk.** Row 43 (and 45/47/49) is a real plan conflict in the graph.ts:1281/1229 compensation aggregates.
- **F7 is a real regression.** T046 private passes on 36bae79 and fails on the T-052 WIP, and there is no approved fix. Pin 12 is a test-harness cause.
- **F8:** row 116 is flaky, and its leaves are in the P1b summary writer.

The branch is unchanged at ad60624. Nothing is merged and production is not affected.

## Question
How should t-052 continue?

## Options
- **A (recommended).** Split and re-plan. The cycle-2 work becomes plan-v3: one fresh plan unit that designs the graph.ts compensation fix (F5, T046) and the op-vs-timer identity (rows 64-66) together, from the evidence on disk. That plan is then reviewed once, and a new fix-cycle count starts. The wave/t052-c2 branch stays as a reference and is never merged as it is.
- **B.** Rewrite the brief once inside cycle 2: one more review round on F3/F5/F7. This is the policy's single brief-rewrite allowance, and the risk is the same loop again.
- **C.** Change the protected oracle of rows 64-66 (D-082/D10). Not recommended: it hides the W1 gap.
- **D.** Park t-052 and pull the other P2 units first.

## Answer format
Reply `t052: A|B|C|D` (plus notes). The maker records it below as `Answered:` before acting.
