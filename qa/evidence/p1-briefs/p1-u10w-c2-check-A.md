# p1-u10w-c2-check-A — You are /checker, Mode A REPAIR check, coordinator A (dual check, blind)
Read your protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
- Contract: D:/vc/.worktrees/p1-u10w/qa/manifests/p1-u10w-voice-wiring.md (criteria are listed verbatim in the manifest; U10 contract per qa/contracts/ if present)
- Manifest: D:/vc/.worktrees/p1-u10w/qa/manifests/p1-u10w-voice-wiring.md
- Project: D:/vc/.worktrees/p1-u10w (bound; read/write only inside it, scratch copies under D:/vc/.worktrees/ only)
- Verdict path: D:/vc/.worktrees/p1-u10w/qa/verdicts/p1-u10w-voice-wiring.A.md (a same-cycle file does not exist; cycle-1 file exists: rename it to p1-u10w-voice-wiring.A.r1-1.md WITHOUT reading its content, then write fresh)
- Checkpoint: D:/vc/.worktrees/p1-u10w/qa/checkpoints/p1-u10w-voice-wiring.A.md (your own side only; you may read it for evidence identities)
- Tier: L (security: voice enable flag gates a minor-facing voice route). Policy: the manifest's pinned Policy-Version, verbatim.
- Budget: wall 45 min, agent-minutes 135 (aim for ~15: this is a few-line repair).
- Base (whole unit): 76b89c5. Repair base: 0c2b981 (verify with git). Head: 1c9fafb (code commit 6addcba).
- Cycle: 2
- Failed criteria (your side): W5 — only the exact string "true" enables voice; padded/other values must not.
- Scope (repair checker rule): re-run W5 plus any criterion whose input files the repair diff 0c2b981..1c9fafb touches (voice.ts voiceEnabledFromEnv; voice-wiring.test.ts → W5, W6); read the repair diff in full; scan the whole-unit diff 76b89c5..1c9fafb for files outside declared scope; one falsification for W5 in an isolated copy; reuse other criteria by your checkpoint's evidence identity. Run the api voice+chat set once via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh` (long waits are normal) with TMP/TEMP on D:. No full suite (6c runs it).
- You are an independent coordinator. Do NOT read, list, grep or git-show the other coordinator's verdict, checkpoint or evidence (any qa/verdicts/*, qa/checkpoints/*, qa/evidence/* of the other letter, or their git log subjects — use `git log -- apps/` paths only). Do not read your own cycle-1 verdict narrative.
- Dual check: put findings as PROPOSED-ISSUE lines; write no issues.jsonl rows. Verdict carries "Cycle checked: 2" and a Metrics line. Commit the verdict + checkpoint + your evidence dir with narrow pathspecs (never git add -A). Do not push or merge. Kill only PIDs you started.
Return: verdict, failing criteria if any, verdict commit sha.
