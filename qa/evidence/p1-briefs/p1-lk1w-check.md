You are /checker running a Mode A feature check. Read your full protocol first:
C:/Users/Lenovo/.claude/skills/checker/SKILL.md

Contract:  D:/vc/qa/contracts/ (the rows cited in the manifest), plus D-105 in D:/vc/docs/DECISIONS.md
Manifest:  D:/vc/.worktrees/lk1w/qa/manifests/p1-lk1w.md
Project:   D:/vc/.worktrees/lk1w (bound; read and write only inside it)
Verdict path: D:/vc/.worktrees/lk1w/qa/verdicts/p1-lk1w.md
Checkpoint:   D:/vc/.worktrees/lk1w/qa/checkpoints/p1-lk1w.md
Tier:      L (config/flags: VC_TEXT_CHAIN selects the provider for student chat and anonymous chat)
Policy:    proportional-verification/2026-10-19.17 (as pinned). Dual check: no (no auth/tenancy/prod-write trigger).
Budget:    wall 45 min, agent-minutes 135. Lock waits count as blocked_min.
Base:      5310e8f. Judge only 5310e8f..e13f850; 2819876 is the qa-only manifest commit.
Cycle:     0

Prove the OUTCOME: drive startApi with fetch stubbed (no network) and show which provider and endpoint actually serve chat, anonymous chat, the scribe and the classifier, with VC_TEXT_CHAIN set, unset and malformed.
Hostile variants you must try yourself:
- VC_TEXT_CHAIN=default with a hop key missing: startApi must fail before connect, and the error must contain no key value;
- a malformed chain value;
- the classifier base set to ollama: it throws;
- first hop timeout or 5xx: the second hop answers within the deadline;
- a crisis text in anonymous and student chat: zero chain calls, the fixed helpline reply (this is not yet falsified; falsify it);
- .env.example contains no secret value.
Re-run the manifest's pre-check commands yourself, one file at a time, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with TMP/TEMP on D:. Wrap each run in `timeout 600` and never pipe it. Lock waits are long and normal. Never run a full suite. One falsification per criterion, in a throwaway copy outside the bound tree.
Never kill a PID you did not start. PID 47984 is a known hung run owned by the user; leave it alone.
Write new issues as PROPOSED-ISSUE lines in the verdict.
Write the verdict with `Cycle checked: 0` and a Metrics line, and commit it on p1/lk1w with a narrow pathspec. Return PASS or FAIL, with each failure's file:line.
