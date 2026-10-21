# Checker brief: /checker Mode A for p1-lk10 (policy .17, single checker, Cycle checked: 0)
Manifest D:/vc/.worktrees/lk10/qa/manifests/p1-lk10.md, branch p1/lk10 (code 85ee514 3f2ebc5, api test 4377a44, HEAD ed246cb, base 20c24b9). Worktree D:/vc/.worktrees/lk10. Read-only toward the artifact; write only qa/verdicts/p1-lk10.md and commit it on p1/lk10. Spec: qa/evidence/hindi-crisis-validation.md (on main).
Prove outcomes with hostile variants:
- crisisMessageFor returns the spec's en / hi / hi-Latn text VERBATIM (diff against the spec file); other langs get English; hi-Latn no longer folds to hi.
- Every crisis card (all 3 langs, guard + concern + anonymous paths) contains 14416, Tele-MANAS; crisis cards contain 112; iCALL only as 022-25521111 Mon-Sat 8am-10pm "not an emergency line"; 9152987821, "anytime", "confidential", "trained for exactly this" absent everywhere incl. skills/safety-escalation/SKILL.md.
- CRISIS_FORBIDDEN_PATTERNS Hindi/Hinglish additions catch their targets and do NOT match the new crisis/concern texts themselves (self-block check) or ordinary counselling replies.
- crisisGuard detection unchanged (git diff on patterns region).
- Replaced assertions (lang.test.ts Devanagari-in-English, anonymous-zero-persistence 406/611) are behaviour updates, not weakenings.
Run affected engine + apps/api tests and typechecks; one falsification per criterion in a copy. Tests via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>` (long lock waits normal), TMP/TEMP on D:. Wording approval is NOT your call (Merge-hold stays). Never kill processes, never touch .claude/**, never push/merge.
Report PASS/FAIL, findings file:line, verdict sha.
