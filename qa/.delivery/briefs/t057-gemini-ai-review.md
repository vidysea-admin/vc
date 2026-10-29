# t057-gemini-ai-review

Read-only AI-engineering review (never edit, never call paid APIs, never touch DBs) of the T-057 Gemini text provider.

Files: packages/providers/src/index.ts (GeminiProvider ~440-620), apps/api/src/index.ts 600-720, and the safety screen / concern classifier and fact-extraction prompts they serve (packages/engine/src/guards/concern-classifier.ts, packages/engine/src/scribe/nodes.ts, plus the extraction call site in apps/api/src/chat.ts). All paths are under D:/vc/.worktrees/vc-completion.

Assess:
1. Gemini JSON mode (responseMimeType / responseSchema): is it used correctly for these structured outputs, and does schema-validation failure fail closed?
2. Are the model choices right for each role? VC_LLM_MODEL=gemini-2.5-flash is used for the safety classifier, extraction and the answer. Should the classifier use a cheaper/faster model via VC_CONCERN_MODEL?
3. Latency budget against C5 (<30 s): one turn makes 3 sequential calls (screen, extract, answer). Can the turn hold that budget?
4. Grounding and citations: does the answer path still carry the student-context and KB citations C4/C5 require?
5. Safety: the crisis path stays deterministic with zero LLM calls (C9), and the no-script rule holds.

Return Approve / Warning / Block with file:line evidence, and concrete fixes.
