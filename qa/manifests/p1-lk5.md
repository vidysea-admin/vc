# Manifest — p1-lk5
**Contract:** D-104, D-105 (Q1 allow-list, Q2 runtime English query rewrite, safety screen next to the crisisGuard floor); design rows LK5 and sections 1B, 1D, R1 in `qa/evidence/p1-briefs/p1-lang-kg-design-result.md`; brief `qa/evidence/p1-briefs/p1-lk5-build.md`; coordinator addendum from the LK4 senior review (detector robustness, dropped `VC_REPLY_LANGS` entries); A15b / B24.6 (see Open risk 1).
**Criteria:**
- K1 reply language: the answer prompt gets `replyLang`; claims are written twice (English `text` for every guard, `localized` for the student); guards that need English check the English claims; a reply that drifts to a language other than the one asked, or whose localized copy fails the language-neutral checks (script, number parity, restricted verbatim run, link/e-mail), is the English reply
- K2 query rewrite: a non-English turn is searched with a one-off English rewrite (one cheap call, nothing stored); on error, empty answer or timeout the original text is used; an English turn makes no rewrite call
- K3 model safety screen: `concern-classifier` runs on every non-crisis turn in parallel with the answer call; the reply is held until it returns; "possible" (severity at or above the escalation line), error, timeout or invalid output returns the fixed crisis message; option defaults ON for authenticated and OFF for anonymous; crisis turns never reach it
- K4 a reply to a student writing a language outside the allow-list always carries the English+Hindi helpline line
- K5 (addendum) the standalone model language detector falls back to the offline result when `provider.generate` throws synchronously or resolves null
- K6 (addendum) dropped `VC_REPLY_LANGS` entries are logged by tag only
- K7 no regression: crisisGuard first and unweakened, LK4 and student-graph suites, typecheck
**Goal task:** none
**Date:** 2026-10-19
**Status:** ready-for-check
**Fix cycle:** 3
**Brief-rewrite:** 1 (D-106, after STALLED 82d2470)
**Policy-Version:** proportional-verification/2026-10-19.16
**Tier:** L (safety path in graph.ts plus a new live safety screen)
**Dual check:** brief says single checker; a second look at the crisis-adjacent paths is the orchestrator's call
**Persona walk:** skip (no human screen)
**Issues addressed:** cycle 2: ISS-386 (K1/M1, the cycle-1 FAIL), ISS-387, cycle-1 review medium (IDN host marks) and low (dot variants). Cycle 1: ISS-383 (K1, the checker FAIL), ISS-384 (link check narrow); senior review M1, M2, M3. Ledger rows renumbered from ISS-380..382 to ISS-383..385 because main already holds LK4's ISS-380..382. ISS-385 ('und' counts as outside the allow-list) is untouched.
**Executor:** claude-sonnet-subagent (maker/builder p1-lk5-build)
**Executor rationale:** one coherent change in graph.ts / lang.ts / concern-classifier.ts, all call-site level on top of LK4.

## What changed
Branch `p1/lk5` from `d057b13` (p1/lk4 head). Code commit `090b558`; this manifest is a later commit.
- `packages/engine/src/student/graph.ts` (in place): `KbAnswerOutputSchema` gains optional `replyLang`, `claims[].localized`, `followUpLocalized`; `answerFromKb` rewrites the search query for a non-English turn (`searchKb` only; the `ask` fallback and the answer prompt keep the original text), passes `replyLang` to the model and swaps in the localized copies through the new `localizedMessage` (only when every shown claim passes `localizedClaimOk` and the model reported the asked language; a non-English reply never mixes in the English follow-up; names and phones redacted as in the English path); the crisis node body moved unchanged into `crisisResult` (also used by the screen override); the route node starts the safety screen before it awaits anything, the finish node awaits it and replaces the reply with the fixed crisis message on "possible" or an outage; `finish()` appends the English+Hindi helpline line outside the allow-list. New optional deps `safetyScreen` and `rewriteTimeoutMs`; new text-free write kind `safety_screen`.
- `packages/engine/src/guards/concern-classifier.ts` (in place, appended): `safetyScreen()` over `classifyConcern`, fail closed (`SAFETY_SCREEN_BLOCK_AT` = `ESCALATE_AT` = high).
- `packages/engine/src/student/lang.ts` (in place): `HELPLINE_GLOSS` (verbatim from the approved crisis wording; `CRISIS_CORE` reuses it, same bytes) and `HELPLINE_LINE_EN_HI`; `isOutsideAllowList`, `isNonEnglish`, `replyScript`, `replyLangIs`, `localizedClaimOk`, `rewriteToEnglishQuery`; detector robustness fix (sync throw, null result); `parseReplyLangs(raw, onDropped)` logs dropped tags (default `console.warn`, tags only).
- `packages/engine/src/student/claims.ts` (in place, 3 lines): `DraftClaim.localized` / `GuardedClaim.localized` ride through `guardClaims` untouched (the guards still read `text`).
- `packages/engine/src/index.ts`: new lang.ts names exported. `skills/kb-answer/SKILL.md`: language rule, `replyLang`, `localized`, `followUpLocalized` in the input and output shapes.
- Tests: new `packages/engine/tests/lk5.test.ts` (34), all mocked providers, no network.
- Not touched: `.claude/**`, ARCHITECTURE.md, docs/DECISIONS.md, qa/contracts, TASKS.md, QUEUE.md, HANDOFF.md, `apps/api` (nothing wired, see Open risk 2).

## Verification scope
Round: est 30 min; targeted tests only, never the full suite. Base / checked state: `p1/lk5` at `090b558`.
Tests[K1]: tests/lk5.test.ts "R1 ..." x11 (replyLang in prompt input, Hindi and Hinglish localized shown, claims stay English, unsupported English claim not shown, model-language drift, wrong script, number parity, restricted verbatim run, link, allow-list narrowing, follow-up)
Tests[K2]: tests/lk5.test.ts "R2 ..." x3 (rewrite used for searchKb only and not in the response; English turn no call; error/empty/hang fall back)
Tests[K3]: tests/lk5.test.ts "R3 ..." x12 (clear/possible/low/moderate, error, invalid output, timeout, PARALLEL, HELD, default ON/OFF and both switches, anonymous crisis count, crisis turn never reaches it, no option = no screen)
Tests[K4]: tests/lk5.test.ts "R4 ..." x4 (ok answer, no-answer, provider failure, anonymous sign-in and no-answer with gloss once, allow-listed and English unchanged, crisis messages untouched)
Tests[K5]: tests/lk5.test.ts "D a provider that throws synchronously ...", "D a provider that resolves null ..."
Tests[K6]: tests/lk5.test.ts "D dropped VC_REPLY_LANGS ...", "D the default dropped-entry logger ..."
Tests[K7]: existing suites unchanged: lang, student-graph, crisis-defaults, guard-crisis, student-classify, coach-first, capability-manifest, crisis-escalation, no-quote, concern-classifier, claims-guard, loader, index; apps/api voice-crisis-turn, anonymous-*, chat*, acceptance-student-journey, voice*
Pre-check[K1]: 13ac9b7 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk5/packages/engine exec tsx --test --test-timeout=30000 tests/lk5.test.ts (TMP/TEMP on D:) -> green: 53 passed, 0 failed (was 34; red before the fix: 39 passed, 14 failed, qa/evidence/p1-lk5/repair1/red-before-lk5.txt). K1 repair tests: localized "" / null / >2000, replyLang null / >16, followUpLocalized null / >500, English turn with localized ""/null -> the English (or Hindi without follow-up) reply, never the apology; text stays strict
Pre-check[K2]: 13ac9b7 same command as Pre-check[K1] -> green: 53 passed, 0 failed
Pre-check[K3]: 13ac9b7 same command as Pre-check[K1] -> green: 53 passed, 0 failed
Pre-check[K4]: 13ac9b7 same command as Pre-check[K1] -> green: 53 passed, 0 failed
Pre-check[K5]: 13ac9b7 same command as Pre-check[K1] -> green: 53 passed, 0 failed
Pre-check[K6]: 13ac9b7 same command as Pre-check[K1] -> green: 53 passed, 0 failed
Pre-check[K7]: 13ac9b7 through vc-testlock.sh (TMP/TEMP on D:), ONE file at a time, each inside timeout 600 (qa/evidence/p1-lk5/repair1/k7-*.txt): engine lk5 53, lang 34, student-graph 64, crisis-defaults 17, guard-crisis 580, student-classify 5, coach-first 5, capability-manifest 3, crisis-escalation 42, no-quote 17, concern-classifier 22, claims-guard 33, loader 23, index 2 -> 900 passed, 0 failed; apps/api voice-crisis-turn 14, anonymous-zero-persistence 32, anonymous-route 16, chat 32, chat-privacy 36, acceptance-student-journey 3, voice 64, voice-wiring 16 -> 213 passed, 0 failed
Pre-check[K1-c2/ISS-386]: 036fc87 VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk5/packages/engine exec tsx --test --test-timeout=60000 tests/lk5.test.ts (TMP/TEMP on D:) -> green: 58 passed, 0 failed
Pre-check[ISS-387]: 036fc87 same command -> green 58/0 (test "ISS-387: DEVANAGARI_MAGNITUDE keeps its \p escapes")
Pre-check[M1-IDN]: 036fc87 same command -> green 58/0 (test "review medium: a Devanagari IDN host ...")
Pre-check[M1-dots]: 036fc87 same command -> green 58/0 (test "review low: the dot variants ...")
Pre-check[K7-c2]: f635f13 (lang.ts unchanged since) same wrapper, one file at a time: lang 34/0, student-graph 64/0, claims-guard 33/0, crisis-defaults 17/0; pnpm -C packages/engine exec tsc --noEmit -> exit 0
Pre-check[types]: 13ac9b7 pnpm -C packages/engine typecheck (tsc over src, evals, scripts); pnpm -C apps/api typecheck -> exit 0, 0 (tc-engine.txt, tc-api.txt in repair1/; the third `pnpm -r --filter` run was not repeated, engine and api cover the changed code)
Metrics: start=2026-10-19T16:38:00+05:30 end=2026-10-19T18:20:00+05:30 builder_min=102 wall_min=unavailable agent_min=unavailable blocked_min=about 60 (waiting for the shared test lock) suite_runs=0 repeat_runs=2 mutations=12 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.16 lane=normal check_s=unavailable mutants=12 defects_unit=0 defects_6c=0

## Capability coverage (one falsifying edit per criterion in a detached throwaway worktree `D:/vc/.worktrees/lk5-fals` of `090b558`; the bound tree was never edited)
Baseline in the copy: lk5.test.ts 34 passed 0 failed. Each row: failing count after the edit; the file was restored and the copy re-checked clean.

| id | crit | falsifying edit | result |
|---|---|---|---|
| F-R1 | K1 | `localizedMessage` no longer requires the model's `replyLang` to be the asked one | 2 fail of 34 |
| F-R1b | K1 | `localizedClaimOk` drops the number-parity check | 1 fail of 34 |
| F-R1c | K1 | `localizedClaimOk` drops its restricted-run check only | SURVIVED 0 of 34: the second restricted-run check on the joined localized message in `localizedMessage` still catches it (two layers by design) |
| F-R1c-both | K1 | both restricted-run checks removed | 1 fail of 34 |
| F-R2 | K2 | `searchKb(input.text)` instead of the rewrite | 1 fail of 34 |
| F-R3a | K3 | screen outage counts as "clear" | 3 fail of 34 |
| F-R3b | K3 | finish stops waiting for the screen after 50 ms | 1 fail of 34 (the HELD test) |
| F-R3c | K3 | authenticated default ON -> OFF | 7 fail of 34 |
| F-R4 | K4 | `outside` forced false | 3 fail of 34 |
| F-D5a | K5 | detector's generate call no longer wrapped (sync throw escapes) | 1 fail of 34 |
| F-D5b | K5 | null-result guard removed | 1 fail of 34 |
| F-D6 | K6 | dropped-entry callback never fires | 2 fail of 34 |

K7 needs no mutant (it is the existing suites). All falsifiers are killed (F-R1c is a designed redundancy, killed once both layers are removed).

## Repair cycle 1 (checker FAIL on K1, cycle 0)
Code commit `13ac9b7` on `p1/lk5`, after merging origin/main (LK4 and LK1) into the branch. All edits in place: `packages/engine/src/student/graph.ts`, `packages/engine/src/student/lang.ts`, `packages/engine/tests/lk5.test.ts`; the three ledger rows and their references in the verdict and checkpoint renumbered. No new file except the evidence folder `qa/evidence/p1-lk5/repair1/`.
- K1 / ISS-383 (graph.ts `KbAnswerOutputSchema`): `localized`, `followUpLocalized` and `replyLang` are tolerant (`.optional().catch(undefined)`): empty, null or over-long becomes undefined, which is the English reply (Hindi reply without a follow-up for a bad follow-up). `text`, `kind`, `sourceIds` are unchanged and strict. The schema is passed to the provider as `z.ZodType<z.output<...>>` because `.catch` widens the schema's input type to unknown.
- M1 + ISS-384 (lang.ts `localizedClaimOk`): the localized claim must now match the English claim on figures (digits in any digit system plus spelled-out English / transliterated Hindi figures via `numberMentions`, and a Devanagari magnitude word such as हज़ार / लाख when English carries no figure), on units (a unit the English claim lacks fails), on countries (new `countriesInLocalized`: the claims.ts list and demonyms plus Devanagari spellings, with usa/uk/uae/korea aliases merged; a country English does not name fails) and on links (URL, e-mail and scheme-less hosts such as `evil.test` are normalised; every localized link must be one the English claim carries, so a different link fails even when English has one). Any failure is the English reply.
- M2 (graph.ts `answerFromKb`): the forbidden-crisis-pattern check for a prior-flag student now also runs on the text actually shown, after the localized swap (the English check stays).
- M3 (graph.ts new `localizedFollowUpOk`): the localized follow-up goes through the same checks as `safeFollowUp` (one question ending in ?, length, no-script guard, crisis patterns, no digits or figures, no country, no personal identifier, no restricted run) plus the language-neutral comparison with the English follow-up. If a present localized follow-up fails, the whole reply is the English reply, which carries the English follow-up (judgment call on the brief's "use the English follow-up": a Hindi reply never mixes in an English sentence). An absent or blank localized follow-up still means no follow-up in the Hindi reply.
- crisisGuard untouched and still first. The low review findings (L1, L2), the English-as-hi-Latn acceptance noted in M1 and ISS-385 are left as they were (outside the repair brief).
- Tests (lk5.test.ts, 19 new: 34 -> 53): the K1 matrix, M1 (spelled-out and Devanagari-magnitude figures, swapped or added country in Devanagari and Latin, scheme-less host / www / e-mail / path, `localizedClaimOk` direct with an English link), M2 (prior-flag student, Hinglish reply containing "secret ... between us" -> the fixed crisis message), M3 (country, personal name, digit, recital cue, second sentence, not a question -> English follow-up; a clean localized follow-up still shown). Red first: 14 of 53 failed on the unrepaired source.
- Falsification (copies in `D:/chk-tmp/lk5r1/fals/`, outside the bound tree, junction to the node_modules, removed after; `qa/evidence/p1-lk5/repair1/falsification.txt`; baseline copy 53 passed): k1a localized catch removed -> 4 fail; k1b followUpLocalized catch removed -> 2 fail; k1c replyLang catch removed -> 2 fail; m1a spelled-out figures ignored -> 1 fail; m1a2 Devanagari magnitude check removed -> 1 fail; m1b claim country check removed -> 1 fail; m1b2 Devanagari country names ignored -> 2 fail; m1c link comparison removed -> 3 fail; m1c2 scheme-less hosts ignored -> 2 fail; m2 shown-text crisis check removed -> 1 fail; m3a follow-up guard call removed -> 1 fail; m3b personal-identifier check removed -> 1 fail; m3c no-script guard removed -> 1 fail; m3d both country checks removed -> 2 fail. Mutants surviving: 0. (Removing only the follow-up country check survives by design: `localizedClaimOk` also rejects the country; m3d removes both.)
- Not done by this repair: the live-browser walk (no UI), the PID 47984 lock owner was not touched.
Metrics (repair): start=2026-10-19T20:30:56+05:30 end=2026-10-19T21:37:48+05:30 blocked_min=about 45 (shared lock held by another session's run, PID 36944 per the lock file, not touched) suite_runs=0 mutations=14 survivors_final=0 cycle=1 policy=proportional-verification/2026-10-19.16

## Repair cycle 2 (checker FAIL on K1/M1, cycle 1: ISS-386)
Code commits `f635f13` (lang.ts + tests) and `036fc87` (test hosts only) on `p1/lk5`. All edits in place in `packages/engine/src/student/lang.ts` and `packages/engine/tests/lk5.test.ts`; no new module.
- ISS-386 (lang.ts new `devanagariWordFigures`, called from `localizedClaimOk`): the localized claim is tokenised (nukta removed, candrabindu folded). Devanagari number words 1-99 (common spellings), magnitudes सौ/हज़ार/लाख/करोड़/मिलियन/बिलियन and the fractions डेढ़/ढाई/सवा/पौने are read. A run of number words becomes a value ("पाँच हज़ार" -> 5000), which joins the localized figures for the existing parity check, so an added or different word figure fails. A fraction is never mapped, so it fails. A magnitude right after digits ("3.5 लाख") needs the same magnitude word in English. Currency and unit words (यूरो/रुपये/डॉलर/पाउंड/येन/दिरहम/प्रतिशत/साल/वर्ष/महीने/हफ्ते/दिन/घंटे/सेमेस्टर, with inflections) need the same unit in the English claim. Every check applies whether or not English has a figure, and any failure gives the English reply. A lone एक is treated as the article, not a figure (see risk 15).
- ISS-387: `DEVANAGARI_MAGNITUDE` is built from `String.raw` parts and exported. Its source carries `\p{L}\p{M}`, and सौंदर्य no longer matches.
- Review medium: the `DOMAIN_RE` label classes and the TLD (and the `EMAIL_RE` TLD) accept `\p{M}`, so `शिक्षा.संस्थान` and `example.शिक्षा` are links.
- Review low: `linksIn` folds 。．｡․ to "." before the URL, e-mail and host matching.
- Tests (lk5.test.ts 53 -> 58): all 7 cycle-1 probes plus 2 more (पांच साल, बीस प्रतिशत, तीन सौ पचास) through the real `runStudentTurn` give the English reply. The controls stay localized: the same figure in Devanagari digits, the figure-free claim, पाँच हज़ार यूरो = 5000 euros, and a bare एक. Also: ISS-387 source and सौंदर्य; IDN hosts; dot variants. Red first: the file failed on the unrepaired source (the import of the then-unexported regex; the new assertions needed the code).
- Falsification (copy `D:/tmp-lk5/fals/base`, junction to the node_modules; `qa/evidence/p1-lk5/repair2/falsification.txt`). Each mutant was green on the baseline copy:
  - word figures and unit words ignored -> ISS-386 tests 0 pass / 2 fail
  - plain-string magnitude regex -> ISS-387 0/1
  - `\p{M}` removed from DOMAIN_RE -> IDN 0/1
  - dot fold removed -> dots 0/1
  - Mutants surviving: 0.
Metrics (repair 2): end=2026-10-19T22:26:54+05:30 mutations=4 survivors_final=0 cycle=2 policy=proportional-verification/2026-10-19.16; lock waits on the shared test lock, PIDs 47984/36944 not touched.

## Brief rewrite 1 (D-106, after STALLED 82d2470; gate lk5-localized-claims answered (a))
Brief `qa/evidence/p1-briefs/p1-lk5-rewrite.md`. Branch `p1/lk5` merged with main (6a7a547, no conflicts). Code commit `af84edb`. In this section K1..K4 are the BRIEF's acceptance ids (all inside contract criterion K1, reply language); contract K2..K7 are untouched.
- `packages/engine/src/student/lang.ts` (in place): `localizedClaimOk` (word-list parity) replaced by `localizedClaimText(english, localized, replyLang, restricted)`. It splits both texts into sentences (`splitSentences`: after . ! ? । ॥ and fullwidth forms when whitespace follows, and at line breaks). Different count -> undefined (the whole English reply). Per aligned pair: if the English sentence or its localized counterpart is factual (`isFactualSentence`), the English sentence is shown verbatim, else the localized one. Script check and restricted-run check kept.
- `isFactualSentence`: any `\p{N}` (all digit systems), any `\p{Sc}` currency symbol, an ISO 4217 code (40 codes), % and its variants, a `numberMentions` hit (claims.ts spelled-out figures / unit+number), a link (`linksIn`, with the cycle-2 `\p{M}` IDN and dot-fold fixes kept), a country (`countriesInLocalized`: claims.ts list + demonyms + Devanagari spellings), or a capitalised word after in/to/from/at/near.
- DELETED: `HI_NUMBER_WORDS`, `HI_NUMBER`, `HI_MAGNITUDE`, `HI_UNIT`, `DEV_TOKEN_RE`, `foldDev`, `devanagariWordFigures`, `DEVANAGARI_MAGNITUDE`, `figures`, `unitsOf`, `digitRuns` (the parity code). No Hindi/Hinglish number, currency or magnitude list remains.
- `graph.ts` `localizedMessage`: uses the mixed text from `localizedClaimText` (redaction as before); `localizedFollowUpOk` keeps its own checks and then requires `localizedClaimText(...) === fl` (a factual follow-up is the English reply, as before). `index.ts` exports `localizedClaimText`, `isFactualSentence`, `splitSentences` instead of `localizedClaimOk`. crisisGuard untouched.
- Protected test changes (lk5.test.ts, each pinned behaviour the rule (a) decision changes): (1) the shared fixture `EN_CLAIM`/`HI_LOCAL`/`HING_LOCAL` no longer names Germany (a country sentence is now English, so the old fixture could not show a localized sentence); the old one is kept as `GERMANY_EN`/`GERMANY_HI`. (2) R1 number parity: the Devanagari-digit control (३००) is now the English wording. (3) M1 same-figure control ("lagbhag 300 euros") is now the English wording. (4) M1 country cases build the swapped country by prefix (fixture has no जर्मनी). (5) the `localizedClaimOk` direct tests (links, IDN hosts, dot variants) rewritten against `localizedClaimText` / `isFactualSentence`, same hosts. (6) ISS-386 controls and the ISS-387 `DEVANAGARI_MAGNITUDE` test removed with the lists; their fact-free controls (सौंदर्य, bare एक) moved into K3. (7) M2: the forbidden phrase moved inside the one aligned sentence (as a 2nd sentence it is now an alignment failure, i.e. English).
Round: est 45 min; targeted files only, one at a time through vc-testlock, never the full suite. Checked state: `af84edb` (working tree identical: `git diff af84edb -- packages` empty).
Tests[K1]: tests/lk5.test.ts "K1 (D-106): every cycle-1 probe and every word the cycle-2 verdict cited ..." (23 probes through runStudentTurn), "ISS-386: ..." (cycle-1 probes) — every probe of repair1-check/probes.txt and each word of verdict d907e64 as one aligned sentence, English wording asserted
Tests[K2]: tests/lk5.test.ts "K2 (D-106): 13 new hostile ..." and "K2 (D-106): isFactualSentence on ENGLISH ..." — 13 sentences with words never in a list (फ़्रैंक, रिंगित, दीनार, शतक लीरा, पौन हज़ार शेकेल, दशमलव, तीसरे/ढाई गुना, fifty hazaar baht, teen point paanch sau kroner, tisre mahine zloty, peso, dedh sau kwacha, kilo-rupiah), through runStudentTurn and against a country-only English sentence
Tests[K3]: tests/lk5.test.ts "K3 (D-106): non-factual sentences ..." plus R1/M3 controls — greeting, encouragement, question back, सौंदर्य, bare एक stay localized; a mixed claim gives Hindi sentence + English figure sentence + Hindi follow-up (exact string)
Tests[K4]: tests/lk5.test.ts "K4 (D-106): sentence alignment failure ..." — 1 vs 2 and 2 vs 1 sentences -> undefined; two-claim turn with one misaligned claim -> exact whole English reply
Pre-check[K1]: af84edb VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk5/packages/engine exec tsx --test --test-timeout=60000 tests/lk5.test.ts (TMP/TEMP on D:) -> green: 61 passed, 0 failed
Red-before[K1..K4]: the same command on the tests-only change failed the file on the missing exports (rewrite/red-before-lk5.txt); green output rewrite/green-lk5.txt
Pre-check[K2]: af84edb same command as Pre-check[K1] tests/lk5.test.ts -> green: 61 passed, 0 failed
Pre-check[K3]: af84edb same command as Pre-check[K1] tests/lk5.test.ts -> green: 61 passed, 0 failed
Pre-check[K4]: af84edb same command as Pre-check[K1] tests/lk5.test.ts -> green: 61 passed, 0 failed
Pre-check[K7-rw]: af84edb same wrapper, one file at a time: tests/lang.test.ts 34 passed 0 failed, tests/student-graph.test.ts 64/0, tests/claims-guard.test.ts 33/0, tests/crisis-defaults.test.ts 17/0 (rewrite/k7-*.txt); pnpm -C packages/engine exec tsc --noEmit -> exit 0 (rewrite/tsc.txt)
Falsification (copy D:/tmp-lk5/fals/base with a node_modules junction, bound tree never edited; qa/evidence/p1-lk5/rewrite/falsification.txt; baseline copy 61/0, restored 61/0):
Falsification[K1]: F-K1b the factual test removed (every aligned localized sentence shown) -> 10 fail of 61, including the K1 probe test, ISS-386 and K2
Falsification[K2]: F-K1 only the localized side is tested (the English sentence no longer decides) -> 3 fail (K2 hostile set, K3 mixed claim, R1 number parity); F-K2 country detection removed -> 2 fail (K2 isFactualSentence, M1 country)
Falsification[K3]: F-K3 fact-free sentences also shown in English -> 12 fail (K3, R1 localized, follow-up tests)
Falsification[K4]: F-K4 the sentence-count equality dropped (zip) -> 6 fail (K4, ISS-386, M1 figure/country/domain)
Mutants surviving: 0.
Metrics (rewrite): start=2026-10-20T01:31:05+05:30 end=2026-10-20T01:41:30+05:30 builder_min=11 blocked_min=0 suite_runs=0 repeat_runs=1 mutations=5 survivors_final=0 cycle=3 policy=proportional-verification/2026-10-19.16
mutant-cap-raise: the cycle-0 Metrics line counts 12 single-criterion falsifiers over contract K1..K6 (history, one per criterion); this rewrite adds 5, one or two per brief criterion
Open risks (rewrite) - these replace risks 13, 15 and 16 (the lists are gone):
- R-a. A fact the model invents ONLY in the localized copy of a fact-free English sentence, written in words no detector reads (e.g. Hindi "सत्तर युआन" with no digit, country or link), is shown. Rule (a) decides by the English sentence; this is translation drift, not checkable by code (design R2). Detectors on the localized side (digits, symbols, links, Devanagari country names, claims.ts number words) catch the structural forms.
- R-b. Over-English by design: every sentence naming a country (including demonyms such as "German", "English") or a place after in/to/from is English, so many fee/destination replies are mostly English with Hindi connective sentences.
- R-c. Abbreviations ("e.g. ", "U.S. ") or a translator merging/splitting sentences give an alignment failure -> the whole English reply (safe, costs localization).
- R-d. The ISO code list is 40 codes; an unlisted code without a digit is not factual on its own (a code nearly always sits next to a figure, which is).

## Open risks / not determined
1. A15b / B24.6 conflict: those lines say no LLM sees anonymous text to classify; D-105 orders a screen on every turn. The option defaults OFF for anonymous turns as the brief says; the contract owner and Umesh decide. The model detector, the rewrite and the answer call still send anonymous text to a model.
2. Nothing is wired in `apps/api` (`index.ts` / `anonymous.ts`): `safetyScreen` is an optional dep and `createModelLanguageDetector` is still unwired, as in LK4. With no `safetyScreen` option no screen runs, so "default ON for authenticated" holds once the option is supplied, not by mere absence. Wiring (a screen provider, `VC_REPLY_LANGS` through `parseReplyLangs`) is a follow-up.
3. "Possible" has no verdict in the classifier; it is mapped to severity at or above `high` (`SAFETY_SCREEN_BLOCK_AT`, injectable as `blockAt`). `moderate` is NOT blocked. A lower line is a threshold decision for Umesh; every blocked ordinary turn is a false crisis message.
4. The screen gates every authenticated reply: a slow or down screen model yields the fixed crisis message (D-105), default timeout 8 s. A cheap chain with p95 above that will show crisis messages to healthy students. Needs LK9 latency data before it is switched on.
5. Meaning drift between `text` and `localized` is not checkable by code (design R2). Name or fact differences in Devanagari / Hinglish cannot be caught by the no-quote guard (Latin speaker lists) beyond redaction. Eval and per-language rollout stay with the allow-list.
6. A prior-flag thread (authenticated) gets the English forbidden-pattern check on the English message only; the localized message cannot be pattern-checked.
7. The "(unverified)" suffix and the helpline gloss are English fixed text inside an otherwise Hindi reply (no vetted Hindi fixed text exists, LK4 risk 6).
8. When the screen overrides a completed answer, side effects of that answer path (authenticated gap record, anonymous "answered"/"no_answer" counter) have already happened.
9. Trimming to 8000 characters to keep the helpline line could cut a sentence.
10. The dropped-entry log uses `console.warn`; `parseReplyLangs` has no caller in apps/api yet.
11. A `senior-software-engineer` review is still due (orchestrator's single checker); a crisis-adjacent dual check is recommended.
12. Environment: the shared test lock sat on a stale owner (PID 36944, no child process) for about an hour; runs went through slot 1 once the script's own stale handling released it. I did not touch the lock.
13. (repair 1) The Devanagari country and magnitude lists are hand-written: a spelling not on the list is not recognised, so a swapped country written in an unlisted spelling still reaches the student (the same limit the English path has for a country it does not list). A false positive only falls back to the English reply.
15. (repair 2) A lone एक (no magnitude after it) is not counted as a figure, because it is the Hindi article; "एक साल" is still caught by the unit check and "एक लाख" by the value check. A Devanagari number or unit word missing from the hand-written lists is not seen (it fails open, like risk 13). The common words दो (also "give") and दिन/साल/वर्ष fail closed to English when English has no such figure or unit, which costs some faithful translations.
16. (repair 2) A Devanagari word that contains a "." (for example यू.एस.ए) now matches as an IDN host and falls back to English.
14. (repair 1) The figure and link comparisons are strict, so a faithful translation that rewrites "five thousand" as "5000" or drops/changes a link now shows the English reply; that is the safe direction.
