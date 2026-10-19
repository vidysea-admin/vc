You are /checker running a Mode A feature check. Read your full protocol first:
C:/Users/Lenovo/.claude/skills/checker/SKILL.md

Contract:  D:/vc/qa/contracts/ (the P1 contract rows cited in the manifest, plus D-105 in D:/vc/docs/DECISIONS.md)
Manifest:  D:/vc/.worktrees/lk5/qa/manifests/p1-lk5.md
Project:   D:/vc/.worktrees/lk5 (bound; read and write only inside it)
Verdict path: D:/vc/.worktrees/lk5/qa/verdicts/p1-lk5.md
Checkpoint:   D:/vc/.worktrees/lk5/qa/checkpoints/p1-lk5.md
Tier:      L (crisis-adjacent safety screen gating replies, concurrency: the screen runs in parallel with the answer and the finish waits on it)
Policy:    proportional-verification/2026-10-19.16 (as pinned; the .17 6c rules apply at the next dispatch). Dual check: no (no security/auth/tenancy/prod-write trigger; crisis text alone gets one checker).
Budget:    wall 45 min, agent-minutes 135. Lock waits count as blocked_min.
Base:      d057b13 (p1/lk4 head; LK4 is in its own check; judge only d057b13..HEAD)
Cycle:     0

Criteria K1-K7 are in the manifest. Prove the OUTCOME, not the construction: for each criterion drive the real function with a fake provider and show the student-visible result.
Hostile variants you must try yourself:
- localized copy with a new URL, an e-mail, a different number, Latin text claiming hi, an empty string;
- the safety screen returning "possible", throwing, timing out, returning malformed JSON, and resolving after the answer finished;
- crisisGuard still fires first on the original text (an explicit self-harm phrase in Hindi and in Hinglish) before any model call;
- the rewrite returning empty, a throw, or injected instructions (it must only feed searchKb, never the stored text);
- a reply language outside VC_REPLY_LANGS: the helpline line is present exactly once;
- lang.ts detector sync throw and null resolve fall back offline.
Re-run the manifest pre-check commands yourself, but only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>` with TMP/TEMP on D:. Never run a full suite. One falsification per criterion in a throwaway copy outside the bound tree.
Never kill a PID you did not start. PID 47984 is a known hung run owned by the user: leave it.
Write new issues to qa/issues.jsonl starting at ISS-380, but only on this branch; if that would conflict, put them as PROPOSED-ISSUE lines in the verdict instead.
Write the verdict with `Cycle checked: 0` and a Metrics line, commit it with a narrow pathspec, and return a short structured verdict (PASS/FAIL plus failures with file:line).
