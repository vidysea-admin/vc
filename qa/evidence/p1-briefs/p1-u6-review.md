# P1 U6 review — fresh, read-only, no edits anywhere
Code: S/p1-u6 (branch p1/u6), diff cd2c092..e6f64a1 (packages/engine/src/student/*, guards/no-quote.ts, skills/kb-answer, skills/vc-capabilities, tests). S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad.
Spec: D:/vc/qa/evidence/p1-plan-draft-20261017/spec.md and plan.md line 24. North star: sounding board, never a script; student safety first (minors).
Return Approve / Warning / Block with file:line evidence (>80% confidence), focus per your role:
- senior-software-engineer: correctness, edit-in-place vs duplicated logic (citationGuard, routeBeforeGeneration, escalateTurns, FailoverProvider, no-script reused?), error paths, state/graph wiring, test quality (would tests catch regressions?).
- ai-engineer: claims verification soundness (word-match risk), hallucination/uncited-content leak paths to the student, no-quote guard robustness, crisis-first ordering, prompt/skill files, threshold assumptions, what an eval must measure before real-model use.
You may run `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u6/packages/engine test` (lock waits normal) and write probes only under S/probe-u6-<role>/. Report under 40 lines.
