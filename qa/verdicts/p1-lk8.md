# Verdict - p1-lk8 (Mode A, cycle 0): PASS
Cycle checked: 0
Bound to: D:/vc/.worktrees/lk8 (branch p1/lk8), head b9dfdaa, code 8def260, base a11653e. Policy-Version: proportional-verification/2026-10-19.17. Tier L, single checker, fresh context. Checked 2026-10-21T12:2x+05:30. Bound tree not edited.
Evidence: qa/evidence/p1-lk8-check/probe-lk8.test.ts.txt (probe source, saved as .txt so it is not collected).

## Outcome proof (real entry points `crisisGuard` and `routeBeforeGeneration`, imported from packages/engine/src/index.ts, the package surface apps/api uses at chat.ts:431/558, anonymous.ts:425, voice.ts:524)
Command: VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk8/packages/engine exec tsx --test <probe> (TMP/TEMP on D:/tmp) -> 53 tests, 52 pass, 1 fail (the fail is out-of-scope, see below).
- Positives (all level crisis AND route escalate with card.level crisis, 32 of 33): khudkushi, KHUDKUSHI, KhUdKuShI, "khud   kushi", tab gap, "khudkushi." , "khudkushi!!", "khudkushi, please help", zero-width space / ZWJ / ZWNJ / soft-hyphen splits, "k h u d k u s h i", hyphen and underscore joins, full Hinglish sentences (mid and end, with trailing dot), khudkhushi, khudkusi, khudkushee, "khud kushi", full-width Latin; Devanagari plain, precomposed nukta, decomposed nukta (U+093C), spaced, trailing danda and dot, ZWJ/ZWNJ-split, खुदकशी, खुदखुशी, Devanagari-inside-Hinglish, mixed-script sentence.
- Negatives (16 of 16 stay none and route continue): khud, khushi, "khud se", "main khud se padhunga", "khud ki khushi", "mujhe bahut khushi hai", "main khud khush hoon", kushal, खुशी, खुद, "मैं खुद से पढ़ूंगा", khuda, खुदा, "kushi nagar", "खुद पढ़ूंगा", khudh.
- Reply text: the card message for "khudkushi" is byte-identical to that for "I want to commit suicide" (CRISIS_MESSAGE); `git diff a11653e 8def260 -- packages/engine/src/guards/crisis.ts` touches only CRISIS_PATTERNS entries and a comment table, no message constant.

## Repo suites (head b9dfdaa, via vc-testlock)
- pnpm -C D:/vc/.worktrees/lk8 --filter @vc/engine test -> 1795 tests, 1750 pass, 0 fail, 45 skipped (matches manifest; skips pre-existing).
- pnpm -C D:/vc/.worktrees/lk8 --filter @vc/engine typecheck -> exit 0 (src, evals, scripts tsconfigs).

## Criteria
L1 MET. L2 MET. L3 MET. L4 MET.

## Findings (none blocking)
1. Residual, out of manifest scope: a half-Latin/half-Devanagari single word "khud कुशी" returns none (probe "POS mixed2"). The manifest's "mixed script" claim is whole-word per script, which passes. Not a regression and not a realistic spelling; noted only.
2. Manifest open risk 1 confirmed as designed: spaced "khud khushi" is flagged through the squeezed twin (safe direction, D-020). Not a defect.
3. Scope: other romanised suicide spellings (e.g. aatmahatya) unchanged, as the manifest states.
Capability coverage table in the manifest was not re-run mutant by mutant; the outcome probes above plus the green baseline stand on their own for a vocabulary-only addition.
