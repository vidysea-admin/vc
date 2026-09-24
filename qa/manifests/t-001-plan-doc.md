# Manifest — t-001-plan-doc
**Contract:** qa/contracts/counselling-engine.md (section A)
**Goal task:** T-001
**Date:** 2026-09-25
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-006
**Executor:** claude-sonnet-subagent
**Executor rationale:** synthesis doc from 3 sources; needs full rubric context

## What changed
- `docs/plan.md` — new, the 7-section plan doc (306 lines)

## How to verify (commands + expected)
1. Mermaid parse (from `D:\vc`):
   `npx -y @mermaid-js/mermaid-cli@latest -i docs/plan.md -o <scratch>/out.md`
   Expected: exits 0, reports "Found 3 mermaid charts in Markdown input", writes 3 SVGs + out.md.
   (Note: the tool's own bin is already named `mmdc`; passing `mmdc` again as a second arg after
   `npx -y @mermaid-js/mermaid-cli@latest` throws "too many arguments" — call it without repeating
   the subcommand name, as shown above.)
2. Node-count / classDef / direction / section / FAQ / stop-rule check:
   `PYTHONIOENCODING=utf-8 python <scratch>/verify_plan.py` (script reads `D:\vc\docs\plan.md`,
   regex-checks the 7 `## N.` headings in order, counts nodes + classDefs + direction per mermaid
   block, checks the stop-rule sentence directly follows Diagram 3's closing fence, and counts the
   FAQ `**"..."**` questions in §7).
3. Number-traceability: `grep -n` each numeric figure in `docs/plan.md` against
   `compass_artifact_wf-0a02aa9b-8e26-5c0b-a050-24d0309fb592_text_markdown (1).md` and `goal.md`.

## Actual outputs (from maker's own run)

**Mermaid CLI (real run, D:\vc, no repo files touched — output went to the session scratch dir):**
```
Found 3 mermaid charts in Markdown input
 ✅ ./out-3.svg
 ✅ ./out-1.svg
 ✅ ./out-2.svg
 ✅ C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/4028b141-b4f9-4793-84a0-f900414a84fb/scratchpad/mmd-check/out.md
```
(First attempt used `mmdc -i ... -o ...` as a second npx arg and failed with `error: too many
arguments. Expected 0 arguments but got 1.` — corrected by dropping the repeated `mmdc` token.)

**verify_plan.py (real run):**
```
=== 1. Section headings (in order) ===
Found headings: ['1. Why', '2. Big picture', '3. Phase 1 step-by-step (counsellor session)',
'4. Phase 2 step-by-step (application filling)', '5. Tech map', '6. Milestones and success metrics',
'7. Risks and FAQ']
7 sections present in order: True

=== 2. Mermaid blocks: node count, classDefs, direction ===
Number of mermaid blocks: 3
--- Block 1 ---  direction: LR   classDefs: ['human','ai','data']   node count: 6   <=12: True   3-classDefs: True
--- Block 2 ---  direction: TD   classDefs: ['human','ai','data']   node count: 10  <=12: True   3-classDefs: True
--- Block 3 ---  direction: TD   classDefs: ['human','ai','data']   node count: 11  <=12: True   3-classDefs: True

=== 3. Stop rule follows Diagram 3 ===
(fixed a bug in the first cut of the offset-finder; confirmed directly by reading docs/plan.md
lines 136-139: Diagram 3's closing ``` is line 136, blank line 137, then line 138:
"**Stop rule:** the agent stops at login, 2FA, CAPTCHA, payment and the declaration.")
Stop rule sentence immediately after Diagram 3: True

=== 4. FAQ questions (11 expected) ===
Found 11 FAQ questions:
 - Isn't this just a cheating platform?
 - What if the AI states a wrong fact?
 - Will the application really be done in 15 minutes?
 - Why doesn't the AI just click Submit?
 - Why no avatar yet?
 - What does this cost to run?
 - How much time for one developer?
 - What about Hindi and regional languages?
 - What if Gemini goes down or gets expensive?
 - What's the legal risk with minors' data?
 - How will we know it's actually working?
```

## Number traceability (M7)

| Figure in docs/plan.md | Line(s) in plan.md | Source |
|---|---|---|
| 14% / 34% (issues resolved/hr) | §1 | compass L6, L17 |
| ≥40% card acceptance | §6, §7 | compass L215; goal.md L165 |
| zero uncited facts / 50 audited sessions | §6, §7 | compass L215; goal.md L166 |
| counsellors ≥4/5 | §6, §7 | compass L215; goal.md L167 |
| post-session notes ≥80% light edits | §6 | compass L215 |
| ≥90% field accuracy, top 5 portals | §6 | compass L216 |
| 0 unintended submissions | §6 | compass L216 |
| ≥100 shadow-mode sessions (P3) | §6 | compass L217 |
| Phase 0: 2 weeks consent/model, 3 weeks KB v0 (top 150) | §6 | compass L198-199 |
| Phase 1 ~10–12 weeks | §6, §7 | compass L3, L268(context), gantt L200-204; goal.md L152 |
| Phase 1 sub-steps (2/3/3 weeks) | §6 | compass gantt L201-204 |
| Phase 2 sub-steps (2/4/4 weeks) | §6 | compass gantt L205-208 |
| Phase 3 sub-steps (4/3 weeks) | §6 | compass gantt L209-211 |
| top 150 universities/courses | §6 | compass L199, L268 |
| $0.01–0.10/min avatar | §7 | goal.md L146; compass L187 |
| 45-minute session, $1.0–1.5 / $2–2.5 after Jan 2027 doubling | §7 | goal.md L149; compass L227, L180 |
| 1,000 sessions + 300 drafts ≈ $1.8–3k/month | §7 | goal.md L149; compass L231 |
| 13 May 2027 (DPDP child-data enforcement) | §7 | goal.md L161; compass L8, L239 |
| ₹200 crore / ₹250 crore DPDP fines | §7 | compass L259 |
| ~50% autonomous success, long tail | §7 (risk table) | compass L258 |
| max 10–12 boxes per diagram | (design constraint, not doc text) | goal.md L27 |

No figure in docs/plan.md is unsourced; every number above traces to goal.md or the compass report.
No figures from the Google Doc were needed beyond what goal.md already quotes from it.

## Capability coverage (each new claim -> its isolating falsification)
(doc artifact: NO ISOLATING FALSIFICATION -- document; the slot-1 verdict (/outcome-grader vs
qa/rubrics/plan-doc.md) is the only discriminator — plus per-criterion self-check table below)

### A1–A9 (contract) / M1–M9 (rubric) self-check

| # | Criterion | Evidence |
|---|---|---|
| A1/M1 | 7 sections, goal.md order, audience guide | plan.md L1-4 (audience guide), headings verified by script: True |
| A2/M2 | 3 valid Mermaid blocks | mermaid-cli run: "Found 3 mermaid charts", all 3 rendered to SVG, exit clean |
| A2/M3 | ≤12 nodes, one direction, 3 classDefs, numbered steps matching section numbers | script: blocks have 6/10/11 nodes, LR/TD/TD, classDefs {human,ai,data} each; step numbers 1-9 in Diagram 2 match §3 text numbering 1-9; step numbers 1-9 in Diagram 3 match §4 text numbering 1-9 |
| A3/M4 | Tech map covers goal.md's 11 rows + D-002..D-005 layers (LangGraph.js, typed nodes, SKILL.md, MCP, Mongo KG, Langfuse, hard/soft split), each with why | plan.md §5 table: all 11 goal.md rows present (voice input, STT, reasoning, fact check, memory, university data, UI, backend/orchestrator, form filling x2, avatar) plus 7 added rows (workflow graph, agents, skills, tools, hard rules, knowledge graph, observability), every row has a "why" cell |
| A4/M8 | Input->output JSON shape per module, P1 + P2 | plan.md §3 has 9 I/O lines (pre-brief through approval); §4 has 9 I/O lines (requirements builder through submit) |
| A5/M5 | Exit gates verbatim vs compass §6 | plan.md §6 gate bullets copied verbatim from compass L215-217 (diffed by eye during authoring; wording matches exactly including "zero uncited facts shown in 50 audited sessions" and "0 unintended submissions") |
| A6/M6 | All 11 FAQ cross-questions answered; stop rule under Diagram 3 | script found 11/11 FAQ questions; stop rule confirmed at L138, directly after Diagram 3 fence at L136 |
| A7/M7 | Every number sourced, none invented | traceability table above; all entries map to compass or goal.md lines |
| A8/M9 | Names which sibling repo supplies which piece; no claim anything in D:/vc is built | plan.md §5 "Reuse, don't rebuild" table (6 rows, from ARCHITECTURE.md H6) + explicit sentence "Nothing described above is built yet in D:/vc" |
| A9 | Document content in English | plan.md is entirely English; Hinglish source content translated during drafting |
| S1 CEO clarity | non-technical reader gets north star + phases from §1-2 fast | §1 is one paragraph, ends with the moat statement; §2 is one diagram + one sentence |
| S2 Team actionability | §3-6 sufficient to start T-002 without re-reading compass | §3/§4 give per-step I/O JSON shapes; §5 gives full tech stack with D-refs; §6 gives roadmap + gates |
| S3 AI-tool readiness | §3-5 + Mermaid + I/O shapes pastable as-is | Mermaid blocks are fenced and self-contained; I/O shapes given as compact JSON literals |
| S4 Honesty | limits stay visible | §7 explicitly: "15 min" is data-entry only (2x), filling stops at declaration, avatar is rented not built, DPDP legal review flagged as still open (cross-referenced to ARCHITECTURE.md Q3) |
| S5 Concision | no section repeats another, one idea per diagram | Diagram 1 = surfaces/phases only; Diagram 2 = P1 flow only; Diagram 3 = P2 flow only; tech map appears once (§5), not restated in §3/§4 |

## Live browser evidence
Not UI-touching — no surface changed (docs/plan.md, qa/manifests only)

## Fix cycle 1 (2026-09-25), answering qa/verdicts/t-001-plan-doc.md (Cycle checked: 0, VERDICT: FAIL)
Quoted failures:
- "[M8/A4] sev: medium · Module I/O lines missing for 4/18 P1+P2 steps (P1 step 2; P2 steps 1, 5, 6) · add the missing I/O bullets or an explicit human/branch-step exemption sentence · issue: ISS-006"
- "[S3] sev: medium · AI-tool-readiness scored 3/5 (< 4 required), same root cause as M8/A4 · fixing M8 raises this score · issue: ISS-006"
Change: added 4 I/O bullets in docs/plan.md (added lines only, no other text touched):
- §3 "Session start / audio capture (step 2)" → AudioChunk stream, consentId required
- §4 "Decision final (step 1)" → Decision → {portalId, courseId}
- §4 "Student login (step 5)" → PortalSession, credentials never leave the browser
- §4 "Portal router (step 6)" → {route: scripted|computer-use, scriptId?}
Recount (maker run, python over the Module I/O blocks):
§3 9 I/O lines; steps covered: step 1..step 9 (all 9)
§4 11 I/O lines; steps covered: step 1..6, 7a, 7b, step 8, step 9 (all 10 diagram steps + the packet-assembly line)
Correction of the cycle-0 self-check: it claimed 9 I/O lines in each of §3/§4; the true count was 8 in each.

## Status: checked-PASS — qa/verdicts/t-001-plan-doc.md (Cycle checked: 1, commit 748e4e4)
