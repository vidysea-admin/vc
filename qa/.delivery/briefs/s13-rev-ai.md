# s13-rev-ai

Tool-first files already have a checker PASS (qa/verdicts/tf-checker-final-2.md): packages/engine/src/ingest/**, tools/navigate.ts, the tool-first parts of classify.ts/graph.ts, mcp/pathlynks/src/port.ts, packages/db/src/client.ts openReadOnlyDb, schemas sources.ts, admin-routes.ts sync. Do NOT re-review those. Your scope is the REST of git diff HEAD (the S13 workstream).
AI-engineering review of the S13 LLM paths: grounding and the KB answer path (packages/engine/src/student/graph.ts answerFromKb, noAnswer, the general-guidance D-110 path), memory-in-context (profile facts reaching the prompt), the fact extractor (scribe), the voice finality contract (apps/api/src/voice.ts + packages/providers/src/live.ts), language handling (lang.test changes), and the model and role config (providers index).
Focus:
- the hallucination guards: the served-claim rule, the disclaimer on general guidance
- prompt-injection via stored facts or KB text
- crisis handling in voice and chat
- no unprobed model ids
- cost guards
Run the eval/budget tests in packages/engine/evals if they are cheap (no paid calls).
Find your scope with git diff --stat HEAD and git status (untracked files too), excluding the tool-first files. Re-run the focused tests for each file you review, plus tsc. Return Approve/Warning/Block with file:line, most severe first, with a concrete fix for each finding. Prove behaviour with your own hostile inputs, not by reading construction.
