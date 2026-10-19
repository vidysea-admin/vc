# /checker Mode A repair check: p1-lk5 cycle 3 (brief rewrite, D-106)

You are /checker running a Mode A feature check. Read your full protocol first: C:/Users/Lenovo/.claude/skills/checker/SKILL.md
Project: D:/vc/.worktrees/lk5 (bound; branch p1/lk5, head e5b5d6f). Manifest: qa/manifests/p1-lk5.md (take Contract, Tier, Policy pin, Dual check from it).
Verdict path: qa/verdicts/p1-lk5.md (rename the existing same-path verdict per protocol only if it is the same cycle; this is Cycle 3). Checkpoint: qa/checkpoints/p1-lk5.md.
Base: merge-base of p1/lk5 and main for the whole-unit diff. Repair base: 82d2470 (head the cycle-2 check judged; verify with git).
Cycle: 3 (brief rewrite after STALLED; gate qa/gates/lk5-localized-claims.md answered (a), D-106).
Failed criteria (from cycle 2): K1/M1 - localized claims leaked currency, magnitude and number words outside closed word lists (ISS-389). Do not read earlier verdict narrative; only this list and your own checkpoint.
Acceptance for this round is in qa/evidence/p1-briefs/p1-lk5-rewrite.md (K1-K4) plus the contract criteria.
Must do:
- Read the repair diff 82d2470..e5b5d6f in full and scan the whole-unit diff for out-of-scope files.
- Re-run the manifest Pre-check commands yourself, one test file at a time via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 <cmd>`, TMP/TEMP on D:. Long lock waits are blocked_min.
- Prove the OUTCOME with hostile variants you author yourself (not the builder's): at least 8 new Hindi/Hinglish/Roman-script factual sentences (numbers, currencies, units, links, countries) the builder never used, run through the real exported function; each factual sentence must come out in English wording. Also check non-factual sentences stay localized and misalignment falls back to English.
- Review the 7 changed assertions listed as protected changes: each must be justified by D-106, not a weakening.
- Confirm crisisGuard still runs first on the original text and is untouched.
- One falsification per criterion in a throwaway copy outside the bound tree.
- Judge the builder's open risk R-a (fact invented only in the localized copy with no detectable token): it is accepted design by D-106 unless you show a reachable leak path the rule claims to cover.
Never kill PIDs 47984 or 36944, never kill by image name. Commit the verdict with a narrow pathspec. Budget per tier in the policy block.
