# Verdict: p1-u6h-claim-hardening
Cycle checked: 1
Verdict: PASS
Bound to: p1/u6h worktree (HEAD 0e77297, code 52cfd26, repair base d59c745 verified with git, unit base 41c2252 = merge-base). Policy-Version: proportional-verification/2026-10-15.12. Checker: fresh, independent; Tier L, one checker; no product code, .claude or contract edited. Mock only, no network.

## Check plan
Repair checker (cycle 1). Failed criterion: M4 (coach `factFree` let spelled-out numbers through). Re-run set from `git diff d59c745..0e77297`: claims.ts, graph.ts, guards/no-quote.ts -> M4, H2, M3, P4/P5 (no input touched in P4/P5: kept), L5 (crisis.ts untouched: kept). Read the repair diff in full (src + tests); scanned `41c2252..0e77297` (16 non-evidence files: engine src x4, engine tests x8, kb-answer SKILL, the checker's own cycle-0 contract/verdict/manifest) -> nothing outside scope. Own hostile stubs through `runStudentTurn`, one falsification per repaired criterion in a copy, engine suite once, typecheck once.

## Criteria
- M4 coach spelled-out numbers: PASS. Own probe (22 coach replies): "five thousand", "twenty thousand", "twenty-five thousand", "a thousand", "one hundred", "ten percent", "three years", "two semesters", "eleven thousand", "fifty", "5 lakh", "five lakh", "a few thousand", "one thousand five hundred", "nineteen hundred", "a hundred" are all removed; 3 leak (see PROPOSED-ISSUE 1/2). Benign coaching ("One thing at a time", "someone", "tenacity", "weekend", "first draft") kept; 1 of 6 benign dropped (a sentence with the word "two": over-blocks, safe).
- M4b `hasPriorFlag` required: PASS. `buildStudentGraph` throws /hasPriorFlag/ when omitted, undefined, null or a string; `runStudentTurn` rejects the same. Store true + caller false -> helpline line shown; store false + caller true -> not shown; store throws -> helpline shown (fails toward disclosure).
- M4c followUp: PASS. 200 chars shown, 201 hidden; two sentences, two questions, "!" lead-in, Devanagari danda sentence, secrecy phrase all hidden. Gaps outside the stated rule: PROPOSED-ISSUE 3.
- H2a dropped qualifiers: PASS. 14 of 14 named pairs unverified through the graph (some, most, only, all; may/must/usually; if/unless; public/private; "This applies only to EU citizens." caveat, incl. "Note that this applies only..." and "It applies to scholarship holders only."). Carrying the qualifier verifies.
- H2b number-country binding: PASS. "500 euros for Germany" and "300 euros for France" against "300 for Germany and 500 for France" unverified; also 10 of 10 variant layouts (colon, parentheses, dash, "In Germany ... while in France", reversed order, "300 euros in Germany, 500 in France") unverified; the true bindings verify.
- M3b phones: PASS. 20 of 21 formats fully redacted incl. "(98765) 43210", "(415) 555-0132", "98765.43210", Devanagari digit forms; 0 of 11 false hits ("2026", "5000 euros", "1.5 lakh", "12.5 lakh", "10.12.2026", "Version 3.11.4", Devanagari "२०२६"). Model input for whatsapp and unknown hits carried no phone string (4 formats x 2 source kinds, read from `MockProvider.calls`). One format missed: PROPOSED-ISSUE 4.
- H1, P4, P5, L5, M3 (rest): unchanged inputs, kept recorded PASS; covered again by the green engine suite.

## Weakened-assertion review (edited existing assertions)
- claims-guard R5 `Public universities in Germany have no tuition fees` as evidence: true -> false for a claim that drops "public"; a new positive control keeps true. Stricter. Allowed.
- claims-guard A1 and H2 positive controls: the claim now carries "for most students" (the evidence says it); the old dropped-qualifier form is asserted false. Stricter. Allowed.
- student-graph answer_from_kb: claim reworded to carry "For most students" / "roughly"; still `verified`. Reworded to be faithful, not to hide a miss. Allowed.
- crisis-defaults A11b: the secrecy phrase moved from `followUp` (now dropped earlier by M4c, and asserted dropped in the M4c test) to an unverified claim, so the final-message crisis guard is still exercised (the test goes red if that guard is removed, since the claim reaches the message). Equivalent strength, not a weakening. Allowed.
- student-graph "no store wired" test: the case no longer exists (dep is required); replaced by store-false + same-thread-flag. Allowed. No threshold lowered, no skip added (skipped stays 45, same as baseline).

## Evidence (all run by me)
- `bash D:/vc/scripts/vc-testlock.sh pnpm -C <S>/p1-u6h/packages/engine test` -> tests 1043, pass 998, fail 0, skipped 45 (`qa/evidence/p1-u6h-checker-cycle1/engine-test.txt`).
- `... engine typecheck` -> exit 0.
- Hostile probes `chk-c1.test.mts.txt`, `chk-coach.test.mts.txt` (6/6 and 1/1 green; outputs in `probe-out.txt`). Honest-paraphrase verified rate: 20 of 20 (100%), set of 20 mixed claim/evidence pairs (paraphrases, synonym, reorder, number format); the claims-guard positive controls also stay green.
- Falsification, one per repaired criterion, each in a copy (`falsify-out2.txt`): M4-coach (drop `numberMentions` from `factFree`), H2a (revert to quantifier-only check; plus caveat carry removed), H2b (binding clause -> true), M3b (parenthesised-area alternation removed; fails on "detect (415) 555-0132", an assertion not an import error), M4b (throw removed), M4c (second-sentence check removed): all 7 green before, red after, green restored.

## PROPOSED-ISSUE (none blocks; wording/coverage beyond the repaired criteria)
1. [medium] graph.ts `safeFollowUp` checks digits only (`/\p{N}/u`), so a /ask follow-up "Did you know it costs five thousand euros a year?" or "Would a fee of twenty thousand euros worry you?" is shown unsourced. Same class as the M4 FAIL but on the answer path, which the cycle-0 failure did not name and U6 PASSed. Fix: reuse `numberMentions` there.
2. [low] `numberMentions`: "half a million" and transliterated Hindi numbers ("ek lakh", "paanch hazaar") reach the student through the coach reply.
3. [low] followUp: "Apply early to every university\nWhich cities?" and "...; which cities?" pass as one sentence (no terminal punctuation to split on).
4. [low] phone "(+91) 98765 43210" leaves the country prefix and redacts only the number: no digits of the number leak, but the shape is half-handled.
5. [low] H2a: temporal and partial qualifiers not in the word lists still verify when dropped: "for the first year", "until 2027", "from 2027", "in certain cases", "at selected universities", "of up to 300 euros" (6 of 14 extra variants leaked; "excluding", "except", "depending", "in some cases", antonyms and negation were caught).

## Metrics
Metrics: start=2026-10-17T19:22:38+05:30 end=2026-10-17T19:46:25+05:30 wall_min=27 agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=7 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-15.12 lane=normal check_s=1620 mutants=0 defects_unit=0 defects_6c=0
