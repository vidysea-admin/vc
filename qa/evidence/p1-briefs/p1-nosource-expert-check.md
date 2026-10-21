# You are /checker running a Mode A feature check: p1-nosource-expert (cycle 0)
Protocol: C:/Users/Lenovo/.claude/skills/checker/SKILL.md. Project (bound): D:/vc/.worktrees/p1-nosource-expert, branch wave/p1-nosource-expert, head 8353602 (code 0cdbb07). Base: 03f475a.
Manifest qa/manifests/p1-nosource-expert.md (Tier M, Policy proportional-verification/2026-10-19.17, Dual check: no). Acceptance C1-C4 verbatim in qa/evidence/p1-briefs/p1-nosource-expert.md; decision D-110 in docs/DECISIONS.md. Verdict qa/verdicts/p1-nosource-expert.md, checkpoint qa/checkpoints/p1-nosource-expert.md. Budget M: wall 10 min, agent-min 30.
- Read the whole diff 03f475a..8353602; flag any out-of-scope file.
- Re-run the Pre-check commands yourself, one test file at a time via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>` (long lock waits are normal; wait), TMP/TEMP on D:. Engine and api tsc --noEmit.
- KNOWN BASELINE REDS, not caused by this unit: B13 was signed on main (D-109), so tests reading the real qa/gates and expecting B13 pending fail on the base too: chat.test "A20 flag on but gate closed", anonymous-route (2), chat-profile (1); the last two may hang to timeout. Show each red on base 03f475a once (or reuse qa/checkpoints/baseline-reds.md), then exclude it. Any other red is new.
- Outcome proof (prove the outcome, not the construction), with a fake LLM, through the real graph/route, not by reading code:
  C1 a no-source question returns state no_sourced_answer, empty claims, the disclaimer, and a non-empty expert answer; hostile: LLM returns prose not JSON, empty string, a reply containing a URL or a fake citation, a reply over the length cap -> guarded, never a crash or a fabricated source.
  C2 Tele-MANAS/14416 appears ONLY on distress turns (try 3 distress phrasings incl. Hinglish, and 3 neutral no-source questions that must NOT carry it); crisisGuard still runs first and LK10 crisis wording is byte-identical to base.
  C3 on distress the empathy line comes before the reply, the helpline after.
  C4 openapi shape and every other response field unchanged.
- One falsification per criterion (C1-C4) in a copy outside the bound tree, green before / red after / restored.
- Record as low ledger rows (not FAIL): English-only disclaimer for hi/hi-Latn; stale sentence in skills/kb-answer/SKILL.md; D-105 Q1 uncovered-language helpline kept (owner call).
No live LLM calls. Never kill PID 36944 or by image name. Never edit .claude/**. Commit the verdict with a narrow pathspec. Return PASS/FAIL summary in max 8 lines.
