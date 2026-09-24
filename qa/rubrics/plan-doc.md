# Rubric: docs/plan.md (T-001)
Graded by /outcome-grader. PASS = every MUST met, and ≥4/5 on every SCORE item.

## MUST (binary)
| # | Criterion | How to check |
|---|---|---|
| M1 | The 7 sections appear in goal.md order, with an audience guide (CEO §1,2,7 · team §2–6 · AI tool §3,4,5) | read the headings |
| M2 | 3 Mermaid blocks parse | `npx -y @mermaid-js/mermaid-cli mmdc -i docs/plan.md -o <scratch>/out.md` exits 0, or an equivalent parser |
| M3 | Each diagram has ≤12 nodes, one direction (LR or TD), 3 classDefs human/ai/data with goal.md colours, numbered steps | count nodes per block |
| M4 | The tech map includes goal.md's 11 rows plus the rows for LangGraph.js, typed agent nodes, SKILL.md skills, MCP tools, Mongo knowledge graph, Langfuse self-hosted and hard/soft rule split, each with a "why" | table rows |
| M5 | Exit gates for P1/P2/P3 match the compass numbers verbatim | diff against compass §6 |
| M6 | The FAQ covers all 11 cross-questions from goal.md §7; the stop rule appears under Diagram 3 | checklist |
| M7 | No figure lacks a source: every $, %, week count and date is present in the compass, goal.md or the Google Doc | grep numbers, trace each |
| M8 | Module I/O lines exist for every P1 node and every P2 step | checklist |
| M9 | It does not claim that anything in D:/vc is built; reuse sources are named by repo path | read |

## SCORE (1–5)
- **S1 CEO clarity:** a non-technical reader grasps the north star and phases from §1–2 in under 2 minutes.
- **S2 Team actionability:** §3–6 are enough to start T-002 without re-reading the compass.
- **S3 AI-tool readiness:** §3–5 plus the Mermaid code plus the I/O shapes can be pasted into a coding agent as-is.
- **S4 Honesty:** limits stay visible (the "15 min" is data-entry only, filling is draft-only, the avatar is rented,
  DPDP is on the critical path).
- **S5 Concision:** no section repeats another; one idea per diagram.
