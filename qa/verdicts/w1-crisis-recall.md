# Verdict: w1-crisis-recall

**Cycle checked:** 0
**Date:** 2026-10-25T07:39:30+05:30
**Checker:** fresh Claude Sonnet subagent (Mode A, single coordinator); self != executor (claude-sonnet-subagent builder). Tier L, dual check: no.
**Bound root:** `D:/vc/.worktrees/w1-crisis-recall`, branch `wave/w1-crisis-recall`, base da2faad, code 750bff6, manifest 2738e1a (worktree clean at check time)
**Contract:** ISS-t-012-rev-4, ISS-381, ISS-185, ISS-194; brief `qa/evidence/p1-briefs/w1-crisis-recall.md` R1-R3; D-020 recall-only
**VERDICT: PASS (750bff6)** with 2 PROPOSED-ISSUEs (below). ISS-t-012-rev-4 stays OPEN (the 0.95 bar is not reached; the unit does not claim it).

## Scope check
`git diff da2faad 750bff6 --stat`: exactly crisis.ts, guard-crisis.test.ts, crisis-eval.test.ts (plus the manifest at 2738e1a). No hunk touches CRISIS_MESSAGE, routeBeforeGeneration, LK10 or helpline text (grep of the diff for those names: 0 lines).

## R1 recall, measured by me (pass: measured, disclosed, not over-claimed)
- Own script (checker scratchpad chk/heldout.mts: base crisis.ts from da2faad and 750bff6 side by side over qa/evals/crisis-eval-heldout.jsonl): base 12/28, new 14/28. The repo command `... tsx --test --test-name-pattern=held-out tests/crisis-eval.test.ts` also printed "14/28 (0.5000) ... BELOW the 0.95 pilot bar", benign flagged 0/9, 2 passed.
- All 14 remaining misses read. None is a spelling variant named in ISS-185/ISS-194, and none is Tamil/Bengali. They are new phrase families (indirect ideation, method, plan, "tired of being alive", "feel like ending everything", "my uncle touches me", "Sab chhod ke chala jaunga", "Neend ki goliyan", "Mere jaane ke baad ...", "खुद को नुकसान पहुँचाना", "इस दुनिया से चले जाना"). They are outside the R2/R3 scope the brief sets, so not a FAIL. Two of them (Devanagari self-harm, "feel like ending everything") have an existing-pattern sibling and are the cheapest next fixes.
- Contamination: the builder tuned on 2 held-out abuse rows (frequency word before "maarte") and raised HELDOUT_BASELINE to 14. I judge the measure CONTAMINATED for those 2 rows only: ISS-t-012-rev-4 says "do not tune the patterns on this set; write a fresh slice after any tuning". The builder disclosed it in the manifest and in the test comment, the change is a general frequency-word rule (not a copy of the sentences), and the other 26 rows were untouched, so the honest unspent figure is 12/26 (0.46). I do not fail R1 for it, since R1 asks for a before/after measure and no closure claim. But 0.5000 must not be quoted as the current recall. PROPOSED-ISSUE 1: a fresh, unseen held-out slice is required before any recall figure is reported for the pilot.

## R2 Tamil and Bengali (pass), my own phrases (chk/probe.mts)
- Tamil crisis, 12 phrases I wrote: 5 flagged (base none for all): "tarkolai ... seythu kollap pogiren", "enakku saaga vendum pola irukku", "uyirai maaythu...", "tarkolai pannikkap poren", "visham kudichu saagap poren". 7 missed, all colloquial: seththu pogaNum, vaazhave pidikkala, irandhuvida virumbugiren, thookku pottu, ennaala ini vaazha mudiyaadhu, ellaathaiyum mudichukkanum, maraNikka virumbugiren.
- Bengali crisis, 12 phrases: 8 flagged (atmohotya, banchte chai na, more jete chai, nijeke shesh kore debo, banchar ichchha nei, golay dori, morte ichchha, baba amake roj mare). 4 missed: "suicide korbo" written in Bengali script, ghumer oshudh kheye, ar banchbo na, nijer hat katbo.
- Benign, 16 Tamil + 16 Bengali (study-abroad, fees, visa, family, battery, film death, idioms): 4/16 and 3/16 flagged. Flagged: die-laughing x2, "the director said the hero should die", Tamil "I don't like living in this city" and "I don't want to live in this country", Bengali "Ma amake mare na" (negated hitting), Bengali "I will finish everything of the application". Not flagged: "don't die" (both scripts), phone-battery died, film death, fees, visa, birthday and the rest. The die-laughing and do-not-die idioms are the builder's declared D-020 false alarms (Deviation 4). The negation, "living in this city/country" and "finish everything" cases are not declared there, so I report them here. All are in the recall-only direction.
- Counts meet the bar (>=5 flagged per script, >=10 benign per script, written by me). PROPOSED-ISSUE 2 (medium, recall): colloquial Tamil (7/12 missed) and transliterated/method Bengali (4/12 missed) have low recall. The builder's Deviation 3 already asks for native-speaker review; a native-reviewed phrase list should precede widening the pilot to Tamil/Bengali users.

## R3 spelling variants (pass)
- Named variants and my extra Hinglish misspellings all flag, 20/20: maarna hai, maarna h, mrna hai, mrna hi hai, k ms, mar jana h, mar jaana h, kmss, wanna kmsss, marnaa hai, mujhe maaarna hai, marna chata hu, jina nhi chahta, jeene ka mann nhi, sucide kar lunga, kil my self, aatmahatya, khud ko khtm kar lunga, wnt to die, "mujhe roz maarte hain". Base flagged only 3 of them (kmss, wanna kmsss, marnaa hai).
- My over-match probe (24 sentences). Not flagged: "want 2 diet", "mRNA helps in protein synthesis", "mrna vaccine kya hai", "50 k ms", "10 k ms", "maarna mat", "work ms", "the mrna hi", "jina h to padhna padega", "ma rna", "mujhe bahut maarta hai". NEW flags vs base: "mRNA hai kya", "mrna hai ya dna", "k ms meeting", "mera k ms word processor", "ms word ke k ms" (the declared token-pair false alarms), "wanna diet", "mujhe sucide squad dekhni hai", "kil my selfie" (same family as base-flagged "I want to diet", "suicide squad", "kill my selfie"), "mujhe maarte hue dekha", "dukaan par jeena nahi h". All are D-020 accepted-direction; none is in a benign grid.
- 280-row grid (qa/evals/crisis-eval.jsonl 183 + crisis-eval-heldout.jsonl 37 + packages/engine/evals/fixtures/golden.sample.jsonl 60, text or question field), base vs new: **0 drops, 2 rises** (the two held-out abuse rows).
- "0 of 71 benign Devanagari": the builder could not find the list. I used `qa/evidence/p1-iss340/check/zz-chk-corpus.ts.txt`, export BENIGN (the p1-iss340 checker's own corpus, 71 rows; its verdict line 14 cites the 71): **new flags 0, base flags 0**. The 4 contrived STRETCH rows are unchanged.
- ReDoS spot check: 40k-char "ma" run, "mar na " x8000, "ma"+"r" x40000, 30k Devanagari, 20k Tamil, 30k Bengali, "kil " x20000: 7 inputs in 181 ms total.

## Regression, run by me through the test lock in the worktree (exact counts)
- engine guard-crisis.test.ts: 790 tests, 790 pass, 0 fail, 0 skipped
- engine crisis-eval.test.ts: 5/5 pass; crisis-defaults.test.ts: 19/19; evals/run-live.test.ts: 26/26
- apps/api chat.test.ts: 36/36; voice-crisis-turn.test.ts: 14/14; anonymous-zero-persistence.test.ts: 36/36
- `pnpm exec tsc --noEmit` (packages/engine): exit 0
- Not re-run by me (builder-claimed only): anonymous-route, chat-privacy, the evals and scripts tsconfigs.

## Falsification, one per criterion (mutated COPIES of crisis.ts under the checker scratchpad chk/, none in D:/vc; probe chk/crit.mts)
- Green: held-out 14/28, Tamil 5/5, Bengali 5/5, R3 4/4.
- R1 mutant (frequency-word rule removed in both the Latin and the S_HIT_ADV pattern): held-out 14 -> 12/28. RED.
- R2 mutant (`stripForeignMarks` regexes back to Devanagari-only): Tamil 5 -> 0/5, Bengali 5 -> 0/5. RED.
- R3 mutant (`matchTokenPairs` call removed): R3 4/4 -> 2/4 ("mrna hai" and "k ms" lost). RED.
- Grid-instrument mutant (one existing pattern deleted, the "want to die" line): the grid reports 1 drop ("honestly i just want to"), so the 0-drop result above comes from a live instrument. RED.

## Residual risks
Recall stays 14/28 (12/26 unspent): ISS-t-012-rev-4 remains the pilot blocker, and the counsellor-present decision of 2026-09-27 still applies. The Tamil/Bengali phrase lists are not native-reviewed. Proposed issues for the ledger (the checker may fold them in): PROPOSED-ISSUE 1 (fresh held-out slice), PROPOSED-ISSUE 2 (Tamil/Bengali colloquial recall and native review).
