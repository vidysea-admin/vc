# Manifest — p1-lk8
**Contract:** brief `qa/evidence/p1-briefs/lk8-crisis-vocab.md`; qa/verdicts/p1-lk6.md finding 1 (crisisGuard returns level none for "khudkushi"); B9 (crisis routes to escalation before any generative call).
**Criteria:**
- L1 `crisisGuard` returns level `crisis` and `routeBeforeGeneration` escalates for the romanised forms khudkushi, khudkhushi, khud kushi (also khud-kushi, khudkusi, khudkushee, upper case, letter-spaced, zero-width-split)
- L2 the same for the Devanagari forms खुदकुशी, ख़ुदकुशी (precomposed nukta), खुद कुशी, खुदकशी, खुदखुशी, and mixed script
- L3 unrelated words stay level `none` (khushi, khud khush, khud ki khushi, kushal, खुशी, खुद पढ़ूंगा, खुद कशिश, कुशी नगर, खुदा)
- L4 the crisis reply text is unchanged (no edit to REDIRECT/escalation message), and no existing crisis test regresses
**Goal task:** none
**Date:** 2026-10-21
**Status:** checked-PASS (verdict a36e74a)
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** L (safety: crisis detection)
**Dual check:** no (no security/auth/tenancy/prod-write)
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker/builder lk8-crisis-vocab)
**Executor rationale:** one in-place vocabulary addition in the crisisGuard module plus its tests.

## What changed
Branch `p1/lk8` from `a11653e`, worktree `D:/vc/.worktrees/lk8`. Code commit `8def260`; this manifest is a later commit.
- `packages/engine/src/guards/crisis.ts` (in place, CRISIS_PATTERNS): 1 Latin pattern after the Hinglish "sab kuch khatam" line (`/\bkhud(?:\s*kush?(?:i|ee)|khush?(?:i|ee))\b/i`), 3 Devanagari patterns after `/आत्महत्या/` (`खुद\s*क[ुू]श[ीि]`, `खुदकशी`, `खुदखुश[ीि]`), and 2 rows in the classification table comment. The nukta form is covered by the existing `foldDevanagariSpelling`.
- `packages/engine/tests/guard-crisis.test.ts`: 19 positive turns, 12 negatives, a reply-text-unchanged test, 2 accepted-residual turns. The generic per-pattern tests (spaced forms, squeezed twin, NFKC stability, star height) cover the 4 new patterns automatically.
- Not touched: the crisis reply/escalation message text, `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md, qa/evals. `pnpm install --offline --frozen-lockfile` run in the worktree only.

## Verification scope
Round: targeted engine tests + engine typecheck. Base / checked state: `p1/lk8` at `8def260`.
Tests[L1]: tests/guard-crisis.test.ts "LK8: ... is level 'crisis' and escalates before generation" (romanised + evasion rows); written red first
Tests[L2]: same block, Devanagari and mixed-script rows
Tests[L3]: tests/guard-crisis.test.ts "LK8 negative stays 'none'" (12 rows; all green before AND after the change)
Tests[L4]: "LK8: the crisis reply text is unchanged ..." plus full @vc/engine suite
Pre-check[L1-L4]: red at a11653e+tests only: VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk8/packages/engine exec tsx --test tests/guard-crisis.test.ts -> 612 tests, 592 pass, 20 fail (19 positives + reply-text test)
Pre-check[green]: 8def260 same command -> 618 tests, 618 pass, 0 fail
Pre-check[L4 suite]: 8def260 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 590 pnpm -C D:/vc/.worktrees/lk8 --filter @vc/engine test -> 1795 tests, 1750 pass, 0 fail, 45 skipped (pre-existing live/skip); pnpm --filter @vc/engine typecheck -> no errors
Metrics: start=2026-10-21T12:08:00+05:30 end=2026-10-21T12:18:37+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=7 survivors_final=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=7 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion, in the lk8 worktree, each reverted from a saved copy; baseline guard-crisis.test.ts 616/0 at the time)
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-L1 | L1 | Latin pattern replaced by `\bqqqq\b` | 13 fail of 616 |
| F-L2a | L2 | `खुद\s*क[ुू]श[ीि]` removed | 6 fail |
| F-L2b | L2 | `खुदकशी` removed | 1 fail |
| F-L2c | L2 | `खुदखुश[ीि]` removed | 1 fail |
| F-L3a | L3 | Latin ending made optional (`(?:i\|ee)?`) | 2 fail (negatives "khud kush hoon ab", "main khud khush hoon ...") |
| F-L3b | L3 | Devanagari vowel made optional (`क[ुू]?श`) | 1 fail (negative "खुद कशिश है ...") |
| F-L3c | L3 | Latin allows a spaced "khud khushi" | SURVIVED by design: the squeezed twin flags "khud khushi" anyway, so the plain-form choice is unobservable; pinned instead as D-020 accepted residuals (2 tests) |

## Open risks
1. D-020 residual: ordinary "khud khushi" / "खुद खुशी" (own happiness) flags via the squeezed twin (safe direction, documented in tests and comment). The same squeezed twin means any run "...khud" + "kushi..." across a word gap flags.
2. Vocabulary scope: only the khudkushi family was added; other romanised spellings of suicide (e.g. "aatmahatya") were not in scope and are unchanged.
3. Hindi reply text vetting remains a separate human decision (not touched).
