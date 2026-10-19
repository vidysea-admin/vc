You are /checker running a Mode A feature check. Read your full protocol first:
C:/Users/Lenovo/.claude/skills/checker/SKILL.md

Contract:  D:/vc/qa/contracts/ (the rows cited in the manifest), plus D-104 and D-105 in D:/vc/docs/DECISIONS.md
Manifest:  D:/vc/.worktrees/lk6/qa/manifests/p1-lk6.md
Project:   D:/vc/.worktrees/lk6 (bound; read and write only inside it)
Verdict path: D:/vc/.worktrees/lk6/qa/verdicts/p1-lk6.md
Checkpoint:   D:/vc/.worktrees/lk6/qa/checkpoints/p1-lk6.md
Tier:      L (student-data path into the profile-facts store, chat and voice wiring)
Policy:    proportional-verification/2026-10-19.17 (as pinned). Dual check: no (no auth/tenancy change, no production write, mocked provider only).
Budget:    wall 45 min, agent-minutes 135. Lock waits count as blocked_min.
Base:      ae48596. Judge only ae48596..c54f7a2; 133634d is the qa-only manifest commit.
Cycle:     0

The manifest lists criteria C1-C10. Prove the OUTCOME, not the construction: drive the real extractor and the chat/voice routes with a fake provider, and show what lands in the store and in the logs.
Hostile variants you must try yourself:
- a quote that is a translation, a case drift, a trailing-space or Unicode-normalisation variant (NFC vs NFD Devanagari), or a substring spanning two turns;
- a value in Devanagari, in Arabic-Indic digits, with an e-mail or a phone number (must be redacted in the store), or as an object/array;
- a key with spaces, uppercase or non-ASCII;
- a provider that throws, times out, or returns malformed JSON: the turn still succeeds, and the log has no student words;
- crisisGuard fires on an explicit self-harm phrase in Hindi and in Hinglish with zero provider calls;
- an unconsented under-18 student and blank text make zero provider calls on both chat and voice;
- re-proposing the same key leaves no stale quote, and old rows without quote/sourceLang still read;
- the audit proposal script never calls a write method.
Re-run the manifest's pre-check commands yourself, only through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh <cmd>`, with TMP/TEMP on D:. Lock waits are long and normal; keep waiting. Never run a full suite. Do one falsification per criterion, in a throwaway copy outside the bound tree.
Never kill a PID you did not start. PID 47984 is a known hung run owned by the user; leave it alone.
Write new issues as PROPOSED-ISSUE lines in the verdict, not in qa/issues.jsonl.
Write the verdict with `Cycle checked: 0` and a Metrics line, and commit it on p1/lk6 with a narrow pathspec. Return a short structured verdict: PASS or FAIL, with each failure's file:line.
