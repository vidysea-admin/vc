# P1 U6 AI-engineering review (fresh, read-only, returns findings only)
Worktree S/p1-u6 (S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad), branch p1/u6, review `git diff cd2c092..743d78b -- packages/engine/src`.
Scope: the student turn graph for an AI counsellor talking to Indian students (many minors): KB grounding, claim verification (packages/engine/src/student/claims.ts), no-quote guard (guards/no-quote.ts), intent classify, crisis path ordering, skills/kb-answer and skills/vc-capabilities prompts.
Look for: hallucination paths where an unsupported claim ships as verified; prompt-injection from KB text; private WhatsApp text or speaker names leaking; crisis turns reaching the model/KB first; grade/age-inappropriate output; eval gaps.
Read-only: never edit, never run network or real models. Return Approve / Warning / Block with file:line evidence, under 30 lines.
