# ai-engineer review (read-only): p1-nosource-expert
Repo D:/vc/.worktrees/p1-nosource-expert, diff 03f475a..0cdbb07. Decision D-110 (docs/DECISIONS.md), brief qa/evidence/p1-briefs/p1-nosource-expert.md.
Review the no-source expert-answer prompt and guards in packages/engine/src/student/lang.ts and graph.ts for an audience that includes minors (13-18):
- Hallucination risk: does the prompt stop invented numbers, deadlines, fees, cut-offs, rankings or links being presented as fact? Is the disclaimer always attached, and is it visible on the student page?
- Output guards: non-JSON, empty, URLs, citations, length, prompt-injection from the student question.
- Safety: crisisGuard first; helpline only on distress; no harmful content in the general guidance path.
- Privacy: what student text is sent to the LLM.
Return Approve / Warning / Block with file:line evidence, max 15 lines. Never edit, never run live LLM calls.
