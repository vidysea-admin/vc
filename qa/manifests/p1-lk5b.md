# Manifest — p1-lk5b
**Contract:** D-106 rule (a) (English sentence decides what is factual); senior review `qa/evidence/p1-briefs/p1-lk5-rewrite-review-result.md` (medium B1, lows B2 and B3); brief `qa/evidence/p1-briefs/p1-lk5b-build.md`.
**Criteria:**
- B1 (medium) `isFactualSentence` treats an English sentence with a spelled-out cardinal (incl. hyphenated), an ordinal, a month name, or a bare currency/unit word (euro, dollar, pound, rupee, yen, yuan, franc, krona/kronor, won, rand, percent, per cent) as factual, so the English wording is shown end to end
- B2 (low) `localizedFollowUpOk` compares against `fl.normalize("NFC")`, so a precomposed-nukta localized follow-up is not falsely rejected
- B3 (low) the host (DOMAIN_RE) scan is skipped when the text has no "." or dot variant; a 2000-char unbroken Devanagari claim is classified in under 50 ms
- B4 no regression: fact-free sentences (greetings, encouragement) stay localized; lk5, lang, student-graph, claims-guard, crisis-defaults green; crisisGuard untouched; engine tsc green
**Goal task:** none
**Date:** 2026-10-20
**Status:** checked-PASS (qa/verdicts/p1-lk5b.md, acfdbb4)
**Fix cycle:** 0
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** M (lang.ts, graph.ts follow-up), single checker
**Dual check:** no (no security/auth/tenancy/prod-write)
**Persona walk:** skip (no human screen)
**Executor:** claude-sonnet-subagent (maker/builder p1-lk5b-build)
**Executor rationale:** one small in-place change in lang.ts and graph.ts on top of LK5.

## What changed
Branch `p1/lk5b` from `f53f20c`. Code commit `15a7bdc`; this manifest is a later commit.
- `packages/engine/src/student/lang.ts` (in place): new `WORD_FACT_RE` and `MAY_RE` (capitalised "May" only) used in `isFactualSentence` (B1); `linksIn` skips URL_RE unless the text has "//" or "www.", skips EMAIL_RE unless it has "@", and skips DOMAIN_RE unless it has a "." (B3; EMAIL_RE was the real quadratic cost on a long dot-free word, DOMAIN_RE guard is as briefed).
- `packages/engine/src/student/graph.ts:725` (`localizedFollowUpOk`, in place): compare to `fl.normalize("NFC")` (B2).
- `packages/engine/tests/lk5.test.ts`: 4 new tests (B1 x2, B2, B3). Red first: 4 failed, 61 passed; green after: 65 passed.
- Not touched: crisisGuard, `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md. No file added besides this manifest. `pnpm install --offline --frozen-lockfile` was run in the worktree only (node_modules, gitignored).

## Verification scope
Round: est 20 min; targeted tests only. Base / checked state: `p1/lk5b` at `15a7bdc`.
Tests[B1]: tests/lk5.test.ts "B1 (LK5b): English sentences with a spelled-out figure ...", "B1 (LK5b): localizedClaimText gives the English wording end to end ..." — all review examples plus hyphenated, ordinals, months; the modal "may" stays non-factual; written red first (61 passed, 4 failed)
Tests[B2]: tests/lk5.test.ts "B2 (LK5b): a precomposed-nukta localized follow-up is not falsely rejected ..." — the follow-up is shown through the real turn, so a false rejection fails it
Tests[B3]: tests/lk5.test.ts "B3 (LK5b): a 2000-char unbroken Devanagari claim is classified fast ..." — timing bound 50 ms (was 119.8 ms red); a dot variant and "daad.de" are still found
Tests[B4]: existing K2/K3 and M3 tests in lk5.test.ts; lang, student-graph, claims-guard, crisis-defaults suites — they pin fact-free sentences localized and the guards unchanged
Pre-check[B1]: 15a7bdc VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 npx tsx --test tests/lk5.test.ts (cwd packages/engine, TMP/TEMP on D:) -> green: 65 passed, 0 failed
Pre-check[B2]: 15a7bdc same command -> green 65/0
Pre-check[B3]: 15a7bdc same command -> green 65/0 (timing under 10 ms)
Pre-check[B4]: 15a7bdc same wrapper, one file at a time: lang 34/0, student-graph 64/0, claims-guard 33/0, crisis-defaults 17/0; npx tsc --noEmit in packages/engine -> exit 0
Metrics: start=2026-10-20T01:56:56+05:30 end=2026-10-20T02:04:44+05:30 builder_min=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=3 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=3 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion in a detached throwaway worktree of `15a7bdc` outside the bound tree, since removed; baseline lk5.test.ts 65/0; each edit reverted with git checkout)
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-B1 | B1 | the `WORD_FACT_RE`/`MAY_RE` line removed from `isFactualSentence` | 2 fail of 65 (both B1 tests) |
| F-B2 | B2 | compare back to `=== fl` | 1 fail of 65 (B2) |
| F-B3 | B3 | URL/EMAIL needle guard and the `rest.includes(".")` guard removed | 1 fail of 65 (B3 timing) |

## Open risks
1. B3 only skips the scans for dot-free / @-free text. A 2000-char unbroken word that does contain a "." (not followed by a space) or an "@" still takes about 40 to 60 ms in the quadratic host / e-mail regexes; the brief asked only for the dot-free case. Not a correctness issue (over-match is English).
2. B1 over-matches by design ("no one", "second option", "won the place", month words used as verbs): the result is the English wording, which is safe, but it localizes slightly fewer fact-free sentences.
