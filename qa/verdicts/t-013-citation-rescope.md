# Verdict — t-013-citation-rescope

**Cycle checked:** 1
**Date:** 2026-09-26
**Checker:** fresh Claude subagent (Mode A unit check), bound to `D:/vc/.worktrees/t-013-citation-rescope`
**Authority:** docs/DECISIONS.md D-020, qa/gates/citation-guarantee-scope.md, contract B2 (as amended 2026-09-26), B3, B15, B20
**Base commit for diff scope:** bd24712 (merge-base main / wave/t-013-citation-rescope); unit HEAD ee59295. Prior cycle: FAIL @ 7dda413 (cycle 0, base 6f32318..30f3316).

## What I re-ran myself

- `pnpm -r typecheck` — clean, all 9 workspace projects, exit 0.
- `pnpm --filter <pkg> test`, per package (RAM discipline, never `pnpm -r test` in one shot): schemas 56/56,
  providers 31/31, observability 57/57, db 212/212, api 8/8, mcp-student-profile 12/12, mcp-university-kb 9/9,
  engine 303/303, web 24/24 — **every count matches the manifest exactly**, including the two rewritten
  pre-existing tests (`score-case-drift.test.ts`, `scribe-per-fact.test.ts`), which now assert the fix rather than
  the bug and add a backward-compatibility assertion, never a weaker one.
- `python contracts/verify_contracts.py` — vacuous PASS (no frozen contracts yet), matches.
- `pnpm --filter @vc/engine eval:scribe -- --provider={perfect,case-drift,fabricator,lazy}` — re-run myself.
  perfect/case-drift both `38 kept — 7 verified, 31 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 13
  · fabricated-verified: 0`; fabricator `0 kept`, `fabricated-verified: 0`; lazy `0 kept`. Byte-for-byte match
  with the manifest's cycle-1 table.
- **My own hostile-variant suite**, beyond everything the manifest or cycle-0 verdict tested, run against
  `assessFactForReview`/`verifyCandidateFact` directly in a throwaway `git worktree add <scratch> ee59295
  --detach` + `pnpm install --offline` copy (confirmed green baseline first: `@vc/engine test` 303/303 in the
  copy before any probing):
  - negation far from the value in the same turn, and a double negative (EN) → both `needsReview:true`
    (`negation:`); a plain affirmative control stayed `needsReview:false` as a sanity check.
  - "mere bhai ko Canada jana hai" and Devanagari "मेरे भाई को कनाडा जाना है" → `needsReview:true`
    (`third-party:`). "unka budget 20 lakh" and Devanagari "उनका बजट 20 लाख है" → `needsReview:true` with BOTH
    `third-party:` and `unit-multiplier:` named.
  - "₹20L", "20k", "1.5 cr" → all `needsReview:true` (`unit-multiplier:`, plus the ₹ case also fails the exact
    number-token match).
  - a number embedded in a digit run that also has a genuine standalone occurrence elsewhere in the same turn
    (a phone-number hostile variant) → the embedded occurrence inside the longer digit run does NOT falsely
    match (confirmed separately with only-the-phone-number-present, which correctly stays `needsReview:true`,
    "not a whole number token").
  - a first-person quote that also names a third party ("I want the UK like my cousin") → `needsReview:true`
    (`third-party:` wins over the first-person anchor, as D-020 requires).
  - a citation span that does not exist in the stored transcript → `verifyCandidateFact` still **DROPS** it as
    fabricated (unchanged, correct — this is the genuine-fabrication guard, not the D-020 kept-fact promise).
  - a reasoning fact whose citation is genuine → kept, always `needsReview:true`, `explains` preserved.
  - **One genuine residual, not a contract violation:** a day-of-month/bare-year value that is genuinely
    first-person, unnegated, un-third-partied and quoted verbatim (e.g. "I am flying on 20 September…",
    "I plan to join in 2026…") auto-verifies as a typed number. This is not a citation-fabrication or
    misattribution case (the number really is there, really is first-person) — it is an extraction-quality
    question (should such a fact ever be proposed with that key), not a B2 grounding violation, and the
    manifest's own "Open gaps" note already discloses the closed-marker-list residual-risk class this falls
    under. Filed as advisory ISS-t-013r-c1-1 (low, non-blocking).
- **Capability coverage (protocol 4b) — all 11 rows of the cycle-1 table reproduced BY ME, in my own throwaway
  copy, never the manifest's**: for every row I confirmed the named check GREEN in the fresh copy before editing
  (proof the copy is real), applied the manifest's exact falsifying edit, confirmed the named test(s) and ONLY
  the expected test(s) went RED, then reverted and confirmed `git diff` was empty (byte-identical) before moving
  to the next row:
  1. negation (`const negated = ...` → `false`) → isolates ISS-t-013r-c0-1 + 1 multi-reason test. ✓
  2. third-party (`const thirdParty = ...` → `false`) → isolates ISS-t-013r-c0-2 + 3 directly-dependent tests. ✓
  3. first-person required (`const firstPerson = ...` → `true`) → isolates the no-first-person test + 1
     multi-reason test. ✓
  4. multiplier/currency guard disabled → isolates ISS-t-013r-rev-2 + 1 multi-reason test. ✓
  5. rev-1 two-pass `explains` (gate pass-1 push on `writtenIdByKey.has(fact.explains)`, simulating the old
     single-pass order-dependence) → isolates both named rev-1 tests **plus** the pre-existing "already active
     in the DB" test (a legitimate, correctly-scoped side effect: that case also never gets a same-call write to
     satisfy the simulated old gate). 209/212 → all 3 failures are explains-edge tests. ✓
  6. c0-3 erasure hard-deletes the transcript (removed the `ERASURE_PLAN` transcript step) → isolates the named
     test **plus 17 other pre-existing B15/D-015/D-016 tests**, because the copy's seed helper now always writes
     transcript turns — this is BROADER regression protection than the manifest's own row claimed, not a
     mis-isolation (every one of the 18 reddened tests is a generic "zero residue across every collection" or
     transcript-specific assertion; none is unrelated). ✓
  7. c0-3 export carries the transcript verbatim (`transcripts` → `transcripts: []`) → isolates exactly the
     named test, nothing else (my first attempt hit the wrong line via an off-by-one and broke six files with a
     syntax error — caught by "an edit that reddens everything isolates nothing," reverted, and redone on the
     correct line with a clean single-test isolation). ✓
  8/9. c0-3 no TTL ever (scanner + plan guard) — one edit (`expireAfterSeconds: 60` on the transcript index)
     reddens both named tests together, exactly as the manifest's table structure implies. ✓
  10. c0-3 startScribe persists the chat (removed the `recordSessionTranscript` call in `graph.ts`) → isolates
      the named test plus one directly related "second run adds only new turns" test in the same file. ✓
  11. c0-3 fence compensation removes this call's turns (`if (false && created.transcriptTurns...)`) → isolates
      exactly the named test. ✓
  12. rev-3 hostile rows make `fabricatedVerified` meaningful — disabled all four fail-safe guards together in
      the copy and re-ran `eval:scribe --provider=perfect` myself: **`fabricated-verified: 10`**, exactly matching
      the manifest's non-vacuity proof; reverted back to `fabricated-verified: 0`.
  All reverts confirmed via `git diff --stat` (empty) in the scratch worktree, never the bound tree. The scratch
  worktree was removed afterward (`git worktree prune` after directory deletion).
- **Diff scope (4c):** `git diff bd24712...ee59295 --stat` (37 files, +5426/-350) matches the manifest's "What
  changed" list exactly — no file touched outside it. Read the full diff for `facts.ts`, `erasure.ts`,
  `nodes.ts`, `graph.ts`, `schemas.ts` (both packages) and `mcp/student-profile/src/index.ts`: every `-` line is
  the OLD implementation of the same mechanism being replaced (the old single-tier case-sensitive `.includes()`
  citation check, the old un-transcript-aware `invokeFenceAware` call site), never an unrelated deletion. The two
  rewritten pre-existing tests strengthen their assertions (exact `deepEqual` on false-drop counts, a new
  backward-compatibility check added), never weaken them. No existing export/function/test/config-key was
  removed without a matching reason in this unit's own claims.
- **UI surface:** `git diff --name-only bd24712...ee59295 -- apps/web` and `-- '*.tsx'` are both empty. Mode D
  not required; the manifest's "not UI-touching" / persona-walk `skip` claim holds.
- **Secrets/config:** no `.env`, key or config file touched by this diff; no grep hit.
- **Issue reconciliation:** ISS-t-013r-c0-1, c0-2, c0-3, c0-4, c0-5 and rev-1, rev-2, rev-3 all flipped `open →
  fixed` on my own reproduced evidence above (qa/issues.jsonl updated, regression_check set). The much older
  `ISS-t-013-rev-*` / `-c2-rev-*` / `-c3-rev-*` rows (from the abandoned `wave/t-013-citation-robustness` branch)
  reference functions (`matchCitationQuote`, `AMOUNT_CLAIM`) that do not exist anywhere in this branch's history
  (confirmed by grep) — they are moot for this unit, not addressed and not reopened by it; left untouched as the
  manifest states, but flagged as ledger hygiene debt, not this unit's responsibility to resolve.

## New findings this cycle

- **ISS-t-013r-c1-1** (low, advisory): a date/ordinal-context typed number that is genuinely first-person,
  unnegated and un-third-partied still auto-verifies — not a grounding violation, an extraction-quality question.
  Non-blocking.
- **ISS-t-013r-c1-2** (low, ledger integrity): `qa/issues.jsonl` has a duplicate id `ISS-t-013-rev-5` used for two
  unrelated entries. Non-blocking for this unit; flagged for a future sweep.

## SCOREBOARD

Every contract item this unit claims (B2/D-020 auto-verify surface + fail-safe rule, requirement 4 explains edge,
requirement 5 transcript persistence/erasure/export) is now evidenced clean, on my own independently-reproduced
falsifications, not a re-read of the manifest's. All 5 cycle-0 FAILURES (critical negation bypass, high
third-party bypass, high transcript-readback overreach, medium process, low persona-walk-line) and both
data-engineer/ai-engineer review Warnings (rev-1 explains ordering, rev-2 multiplier) are closed on reproduced
evidence. The rev-3 golden-set gap is closed with 13 new hostile rows and a metric proven non-vacuous
(`fabricated-verified: 0` → `10` with the guards disabled).

## FAILURES

None at ≥80% confidence.

## CAPABILITY-COVERAGE

11/11 rows reproduced by the checker in its own throwaway copy (git worktree, never the manifest's own runs),
byte-for-byte matching every claimed BEFORE/AFTER count and isolating the assertion each row is named for. One
row (c0-3 erasure hard-delete) reddened even more tests than the manifest's own row claimed — broader coverage,
not mis-isolation, confirmed by reading every reddened test name.

## LIVE-BROWSER

not-applicable (changed paths confirmed via `git diff --name-only bd24712...ee59295`: `mcp/student-profile/**`,
`packages/{schemas,engine,db}/**`, `skills/fact-extraction/SKILL.md`, `qa/**` — no `apps/web` or `*.tsx` path).

## ISSUES-WRITTEN

Flipped to `fixed`: ISS-t-013r-c0-1, ISS-t-013r-c0-2, ISS-t-013r-c0-3, ISS-t-013r-c0-4, ISS-t-013r-c0-5,
ISS-t-013r-rev-1, ISS-t-013r-rev-2, ISS-t-013r-rev-3. New: ISS-t-013r-c1-1 (low, advisory, non-blocking),
ISS-t-013r-c1-2 (low, ledger-integrity, non-blocking).

## EXECUTOR

claude-sonnet-subagent (manifest's own Executor: claude-sonnet-subagent — schema/db-write unit, never delegated;
self != executor holds trivially, this checker is not the tool that built the unit).

## VERDICT

**PASS** — every criterion this rescope claims is independently evidenced on the checker's own reproduction, not
a re-read of the manifest's numbers: all three cycle-0 critical/high correctness gaps (negation bypass,
third-party pronoun/kinship bypass, transcript-readback overreach) are closed and confirmed with my own hostile
inputs beyond what the manifest tested (Devanagari forms, combined third-party+multiplier cases, glued currency
forms, phone-number boundary cases); both review Warnings (explains-edge ordering, multiplier auto-verify) are
closed; the hostile golden set makes the fabricated-verified metric genuinely non-vacuous (0 → 10 with the
fail-safe rule disabled); all 11 capability-coverage rows reproduce cleanly in an independent throwaway copy;
diff scope is clean with no unlisted files or unexplained deletions; no UI surface is touched. Two low-severity,
non-blocking advisories are filed for future work (a disclosed date-context auto-verify residual, and an
unrelated pre-existing ledger id collision found during reconciliation).

```
VERDICT: PASS
SCOREBOARD: 4/4 contract-relevant claims evidenced (B2/D-020 fail-safe auto-verify surface, requirement 4 explains edge, requirement 5 transcript persistence+erasure+export, rev-3 non-vacuous fabricatedVerified metric), 8/8 cycle-0+review findings closed on reproduced evidence
FAILURES: none
CAPABILITY-COVERAGE: 11/11 rows reproduced by the checker in its own throwaway copy (git worktree add + pnpm install --offline)
LIVE-BROWSER: not-applicable (no apps/web or *.tsx path in git diff bd24712...ee59295)
ISSUES-WRITTEN: ISS-t-013r-c0-1, ISS-t-013r-c0-2, ISS-t-013r-c0-3, ISS-t-013r-c0-4, ISS-t-013r-c0-5, ISS-t-013r-rev-1, ISS-t-013r-rev-2, ISS-t-013r-rev-3 (all flipped fixed); ISS-t-013r-c1-1, ISS-t-013r-c1-2 (new, low, non-blocking)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All three cycle-0 correctness FAILs (negation, third-party pronoun/kinship, transcript-readback overreach) and both review Warnings (explains-edge ordering, multiplier) are closed and independently reproduced with hostile inputs beyond the manifest's own tests, including Devanagari and combined third-party+multiplier cases. All 11 capability-coverage rows and the non-vacuity of the fabricatedVerified metric (0 -> 10 with guards disabled) are reproduced in the checker's own throwaway copy. Diff scope is clean, no UI surface is touched, and no secrets/config were touched. Two low-severity advisories are filed for future work but do not block this unit: a disclosed date-context auto-verify residual (extraction-quality, not a grounding violation) and a pre-existing duplicate ledger id found during reconciliation. Recommend the maker still dispatch the fresh senior-software-engineer/data-engineer review named in the manifest's own "Open gaps" before calling the wider T-013 effort fully closed, per this project's lifecycle rule, though it is not a Mode A gate.
```

---

# FIX CYCLE 2 (answers the ai-engineer BLOCK: rev-4/rev-5/rev-6/rev-8/c1-1)

**Cycle checked:** 2
**Date:** 2026-09-26
**Checker:** fresh Claude subagent (Mode A unit check), bound to `D:/vc/.worktrees/t-013-citation-rescope`
**Authority:** contract B2 (as amended 2026-09-26 by D-020), B3; qa/gates/citation-guarantee-scope.md
**Base commit for diff scope:** b851687 (reopen cycle 2) → 3dc7725 (cycle-2 build). Unit HEAD checked:
fecde27 (= 3dc7725 with main merged in, bringing T-021/T-028 landed changes that are NOT part of this
unit's own diff).

## What I re-ran myself

- `pnpm install --offline` in the bound worktree (main added `@vc/observability` as a workspace dep) — exit 0.
- `pnpm -r typecheck` — clean, all 9 workspace projects, exit 0.
- `pnpm --filter <pkg> test`, one package at a time (RAM discipline, checked free RAM >= 2.0 GB before every
  run, never `pnpm -r test`): schemas 56/56, db 213/213, engine 310/310, api 8/8, mcp-student-profile 12/12,
  mcp-university-kb 9/9, web 31/31 — **exactly matching the manifest's cycle-2 numbers** for schemas/db/engine
  (56, 213, 310). providers came back 47/47 and observability 59/59 and web 31/31 against the manifest's
  31/57/24 — this is **not a regression**: it is the T-021/T-028 main-merge landing extra tests in those
  packages after the manifest's cycle-2 numbers were recorded (confirmed: `git log` shows `867b733`/`8d6b6e2`
  T-021 provider-failover commits merged into this branch after `3dc7725`). All packages 0 fail.
- `python contracts/verify_contracts.py` — vacuous PASS, matches.
- `pnpm --filter @vc/engine eval:scribe -- --provider={perfect,case-drift,fabricator,lazy}` — re-run myself.
  perfect/case-drift: `64 kept — 14 verified, 50 needsReview, 1 reasoning · D-020 hostile (mustReview) kept: 27
  · fabricated-verified: 0`, recall 64/64 — **byte-for-byte match** with the manifest. fabricator/lazy: `0 kept`,
  `fabricated-verified: 0` — matches.

## My own hostile-variant suite (none from the maker's test set)

Run directly against the real `verifyCandidateFact`/`assessFactForReview`/`resolveCitationSpan` in the bound
worktree's own source (read-only import, no edits — `tsx` executing a script from outside the tree that imports
the tree's `.ts` files by absolute `file://` URL):

- **Questions with no "?":** "kya main UK jaun" and "should I pick Canada" -> both `needsReview:true`.
- **Hindi "chahiye" with no kya/?:** "mujhe UK jana chahiye" and "mujhe Canada jana chahiye kya" -> both
  `needsReview:true` (caught by the allow-list's `unrecognised-form`, since no template ends in "chahiye").
- **Conditionals hidden mid-sentence:** "I will go to Canada if my visa gets approved on time", and a
  template-shaped quote ("I want to study in the UK") cited from a turn whose OTHER clause is conditional
  ("Well, if things work out, ...") -> both `needsReview:true`.
- **Trailing punctuation / extra whitespace / zero-width characters around a template:** a trailing period +
  extra whitespace in the turn does not block the legitimate template match (positive control, not vacuous); a
  zero-width space (U+200B) injected into the quote/turn fails SAFE to `needsReview:true` rather than silently
  mis-verifying a different value.
- **Template phrase embedded in a longer sentence with a deny marker elsewhere in the turn:** "My cousin thinks
  I want to study in the UK, but I am not sure yet." (quote = "I want to study in the UK") -> `needsReview:true`.
- **Fullwidth / Devanagari digits in the number slot:** "I scored 92 (fullwidth digits) in my class 12 boards"
  and "boards mein 92 (Devanagari digits) percent aaye" both cited for value `92` -> both `needsReview:true`
  (the digit-slot match requires the literal ASCII string, so a non-ASCII-digit rendering never auto-verifies).
- **Mismatch between slot value and fact value:** value `"Canada"` cited against a quote that plainly says "UK",
  and value `88` cited against a quote that says "92" -> both `needsReview:true`.
- **In-law third party in Devanagari:** "ससुराल" and "साली" (both named in ISS-t-013r-rev-6) elsewhere in the
  turn force `needsReview:true` even though the cited clause matches a template exactly.
- **Date number:** "I was born in 2007" and "I am currently in 12th standard" -> both `needsReview:true`
  (ISS-t-013r-c1-1, confirmed fixed structurally by the allow-list, not by a targeted date guard).
- **Positive controls (not vacuous):** clean English, Hinglish and Devanagari templates for country and score
  all correctly auto-verify (`needsReview:false`).
- **Combined hostile turn:** a question+conditional turn together is KEPT (not dropped) and flagged
  `needsReview:true` -- confirms the "never dropped" guarantee holds even for a doubly-hostile input.
- **rev-8, my own mixed NFC/NFD Devanagari fixtures** (not the manifest's): (1) a raw stored turn combining a
  decomposed KA+NUKTA cluster with an NFC-composed word -- `resolveCitationSpan` finds the span and
  `doc.text.slice(start,end)` equals the cited quote exactly; (2) a raw turn where one word's grapheme cluster is
  itself partially decomposed mid-word -- span still resolves. Both pass.

**23/23 of my own hostile+positive cases behaved exactly as required -- until I went one step further.**

### A genuine new bypass: reported-speech attribution (ISS-t-013r-c2-1, filed this cycle, CRITICAL)

I then tested the one structural class rev-6's own diagnosis ("deny-list design keeps leaking... every unlisted
risk class auto-verify") predicts should still exist: a REPORTING/ATTRIBUTION clause using a person-noun that is
not on the closed `THIRD_PARTY_MARKERS`/`IN_LAW_RE` list.

- `verify("targetCountry", "UK", "main UK jaana chahta hoon" [Devanagari], turn: "mere samdhi kehte hain, main UK
  jaana chahta hoon")` -> **`needsReview: false`** (auto-verified). Translation: "my samdhi [in-law relation,
  unlisted] says, I want to go to UK."
- `verify("targetCountry", "UK", "I want to study in the UK", turn: "My landlord says, I want to study in the
  UK")` -> **`needsReview: false`** (auto-verified).
- **Control** (same structure, a word that IS listed): "According to my classmate's brother, I want to study in
  the UK" -> correctly `needsReview:true` (`third-party:`), confirming the deny layer works whenever the noun
  happens to be listed and fails open whenever it is not.

This is the exact grounding failure D-020's own founding example warns about ("my cousin is in the UK must not
verify as the student's own"), reproduced through a reporting-verb structure instead of a possessive/kinship
word. It is **not** the unbounded "aboutness" judgment the rescope explicitly declined to solve -- it is a small,
closed, nameable lexical class (reporting/attribution verbs: says/said/told/according to/kehta hai/kehte
hain/bola/ke mutabik...), exactly analogous to the negation/conditional/interrogative marker sets already in the
file, just not yet added. Filed as `ISS-t-013r-c2-1` (critical, open) with full reproduction, a working control,
and a concrete fix direction in the ledger.

**This directly violates the checker brief's hard requirement that every hostile case land `needsReview`, and it
is a hostile case squarely inside the class rev-6 itself was written to close.** I therefore cannot PASS this
cycle.

## Capability coverage -- 3 of the manifest's rows falsified in my OWN throwaway copy

`git worktree add <scratch> HEAD --detach` (HEAD = fecde27) + `pnpm install --offline`, cleaned up afterward
(`git worktree remove --force` failed on Windows path length; `rm -rf` succeeded; `git worktree list` no longer
shows it). The bound worktree was never mutated (confirmed `git status --short` clean before and after, modulo
eval report JSON/MD files regenerated by my own `eval:scribe` re-runs in the BOUND tree, which I reverted with
`git checkout -- qa/evals/scribe/reports/` before finishing).

| capability | falsifying edit (copy only) | BEFORE (GREEN, in the copy) | AFTER (RED) |
|---|---|---|---|
| rev-4: a question never auto-verifies | `nodes.ts` `hasInterrogative` body -> `return false;` | pass 1/1 | pass 0/1, AssertionError: named interrogative reason |
| rev-8: mixed NFC/NFD span resolves | `facts.ts` `nfcWithRawOffsets`: `m[0].normalize("NFC")` -> `m[0]` | pass 1/1 | pass 0/1, AssertionError: a mixed-normalisation span must resolve |
| rev-6 allow-list not vacuous on the negative side | `nodes.ts` `matchesAllowedTemplate` -> `return true;` (ALWAYS ALLOW) inserted as its first line | pass 1/1 | pass 0/1, unrecognised shape must not auto-verify: I heard great things about the UK |

Each row: green confirmed in the copy BEFORE editing, the named test and only that test reddened after the
edit, then `git checkout --` reverted the file and `diff` against my own pre-edit backup confirmed byte-identical
before moving to the next row.

## Diff scope

`git diff b851687...3dc7725 --stat`: `packages/db/src/facts.ts`, `packages/db/tests/facts.test.ts`,
`packages/engine/evals/score-perfect.test.ts`, `packages/engine/src/scribe/nodes.ts`,
`packages/engine/tests/scribe-citation-rescope.test.ts`, `qa/evals/scribe/reports/*` (generated),
`qa/evals/scribe/sessions.jsonl`, `qa/manifests/t-013-citation-rescope.md` -- exactly the files named in the
manifest's "What changed", no others. Grepped the diff for removed `export`/`function`/`const NAME =` lines in
the two touched source files: none found. No deletions beyond the manifest's own claims.

## Persona walk

Skip is correct: `git diff --name-only b851687..3dc7725 -- apps/web` is empty, confirmed independently.

## LIVE-BROWSER

not-applicable -- confirmed via the same diff: no `apps/web` or `*.tsx` path touched by this unit's own diff
(the wider merge-in of T-021/T-028 into `fecde27` does touch `apps/web`, but that is inherited from `main`, not
this unit's work, and was already checked by T-021's own PASS).

## ISSUES-WRITTEN

Flipped to `fixed` (own reproduced evidence): `ISS-t-013r-rev-4`, `ISS-t-013r-rev-5`, `ISS-t-013r-rev-6`,
`ISS-t-013r-rev-8`, `ISS-t-013r-c1-1`. New: `ISS-t-013r-c2-1` (**critical**, open -- reported-speech attribution
bypass, reproduced twice, English + Devanagari, with a working control and a concrete fix direction).
`ISS-t-013r-rev-7` (review load) left untouched -- it is a disclosed, contract-authorized product trade-off
(B2's own text: "every other text fact... is kept... marked needs-review"), not a defect this unit must fix.

## EXECUTOR

claude-sonnet-subagent (manifest's own Executor: claude-sonnet-subagent -- schema/db-write unit, never
delegated; checker: claude-sonnet-subagent, fresh session, no `ANTHROPIC_BASE_URL` override -- self != executor
holds).

## VERDICT

**FAIL.** Every issue this cycle specifically targeted (rev-4 interrogative, rev-5 conditional, rev-6 allow-list
+ named in-law words, rev-8 mixed-normalisation span, c1-1 date/ordinal numbers) is genuinely fixed and
independently reproduced -- including 3 rows falsified in my own throwaway copy and 21 of my own hostile
variants beyond the manifest's tests. But the checker's mandate is to find hostile inputs the maker didn't test,
and doing exactly that surfaced a new, critical, reproducible instance of the SAME pattern rev-6 itself
diagnosed ("deny-list design keeps leaking... every unlisted risk class auto-verify"): a reporting/attribution
clause ("my samdhi says, I want to go to UK" / "my landlord says, I want to study in the UK") auto-verifies as
the student's own decided fact, exactly the grounding failure D-020 was written to prevent. This is a bounded,
closeable lexical gap (a reporting-verb marker set, same shape as the existing negation/conditional/third-party
sets), not the unbounded aboutness problem the rescope declined to solve -- but it is unresolved today, and a
hostile input that should land `needsReview` instead lands `needsReview:false`. Per this project's rules, this
is the LAST fix cycle (max 3); the recommendation is a human decision (accept a residual + disclose, same as
rev-7, or a 4th cycle) rather than an automatic re-dispatch, since this pair has now found a structurally-similar
new leak on every one of its last three checks.

```
VERDICT: FAIL
SCOREBOARD: 5/5 targeted cycle-2 issues fixed and verified (rev-4, rev-5, rev-6, rev-8, c1-1); 1 new critical finding from the checker's own hostile testing (ISS-t-013r-c2-1) not covered by any existing criterion's test set
FAILURES:
- [B2/D-020] sev: critical - a reporting/attribution clause ("X says, I want to study in <country>") auto-verifies as the student's own fact when X is not on the closed THIRD_PARTY_MARKERS/IN_LAW_RE list - add a small closed REPORTING_MARKERS lexicon (says/said/told/according to/kehta/kehte/bola/ke mutabik + Devanagari) to the deny layer, same treatment as the existing marker sets - issue: ISS-t-013r-c2-1
CAPABILITY-COVERAGE: 3/3 rows independently falsified by the checker in its own throwaway git worktree (rev-4, rev-8, rev-6 allow-list), GREEN-before/RED-after/byte-identical-revert confirmed for each
LIVE-BROWSER: not-applicable (git diff --name-only b851687..3dc7725 -- apps/web is empty)
ISSUES-WRITTEN: ISS-t-013r-c2-1 (new, critical, open); ISS-t-013r-rev-4, ISS-t-013r-rev-5, ISS-t-013r-rev-6, ISS-t-013r-rev-8, ISS-t-013r-c1-1 (all flipped fixed, own reproduced evidence)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All five issues this cycle targeted are genuinely fixed and independently reproduced, including capability-coverage falsification in a throwaway worktree and 21 of the checker's own hostile variants beyond the manifest's tests (no-? questions, bare "chahiye", mid-sentence conditionals, ZWSP/whitespace, fullwidth/Devanagari digits, slot/value mismatches, in-law Devanagari, date/ordinal numbers) all landing needsReview as required, with positive templates still auto-verifying (not vacuous). However, pushing one step further than the manifest's own hostile set found a new, critical, twice-reproduced bypass: reported-speech attribution lets a third party's stated intent auto-verify as the student's own decided fact, the exact failure mode D-020 exists to prevent, via a lexical class (reporting verbs) the deny layer does not yet cover. This is a bounded, fixable gap, not the unbounded aboutness problem the rescope declined to solve, but it is real and unresolved, so the unit cannot PASS this cycle.
```
