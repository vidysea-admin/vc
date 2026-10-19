# Checkpoint p1-u10w-voice-wiring A (cycle 2, repair check): COMPLETE, PASS
Checker A, blind dual check, Mode A repair check, tier L. Bound tree D:/vc/.worktrees/p1-u10w, branch p1/u10w, head 1c9fafb (code 6addcba), repair base 0c2b981 (ancestor of HEAD, verified with git merge-base --is-ancestor), whole-unit base 76b89c5.
Evidence identities (all at HEAD 1c9fafb, worktree clean):
- api voice+chat set (voice, voice-audit, voice-history, voice-limits, voice-wiring, voice-crisis-turn, chat .test.ts) via vc-testlock: 133/133, exit 0. Output qa/evidence/p1-u10w-A-c2/api-voice-chat.txt. Code hashes: apps/api/src/voice.ts and apps/api/tests/voice-wiring.test.ts as of 1c9fafb.
- W5 falsification in isolated worktree copy (detached 1c9fafb, removed afterwards): green 4/4 (-> W5|W6 name filter, voice-wiring + voice), trim re-added -> red (W5 voiceEnabledFromEnv test and W6 padded-flag rows), restored 4/4. qa/evidence/p1-u10w-A-c2/fals/.
- Independent hostile probe chkA2-w5.test.ts (30 padded/cased/unicode/quoted variants + off-values + key spelling): 3/3 on fixed code, 1 red under the trim mutant. qa/evidence/p1-u10w-A-c2/fals/probe-*.txt.
- apps/api tsc --noEmit at 1c9fafb: exit 0 (qa/evidence/p1-u10w-A-c2/typecheck-api.txt).
Reused from cycle-1 checkpoint by input-file identity (repair diff 0c2b981..1c9fafb touches only voiceEnabledFromEnv in voice.ts and voice-wiring.test.ts): db 101/101, providers live 70/70, importers 78/78 (packages/db, packages/providers unchanged in the repair diff; the only caller of voiceEnabledFromEnv outside tests is index.ts:321).
Open: none.
