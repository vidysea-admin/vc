# Debug: T-013 (citation rescope), stall diagnosis after fix cycle 3 (the D-023 extra cycle)

**Scope:** Phases 1–2 only (failure capture and root cause). The work was read-only toward code: no fix was applied, no test suite was run and nothing was committed.
**Unit:** `t-013-citation-rescope`. Worktree `D:/vc/.worktrees/t-013-citation-rescope`, branch `wave/t-013-citation-rescope`. Diagnosed at `6736ee2` (checker cycle-3 PASS).
**Status at start:** STALLED by rule. Three fix cycles plus the one extra cycle from D-023 are used. Checker c3 PASSed, the data-engineer review Approved, and the ai-engineer review BLOCKed on ISS-t-013r-rev-14.
**Changed during this diagnosis:** Umesh answered D-024 ("Merge now, T-030 follows"). The maker closed the unit (`2ff8766`, manifest only) and main merged it (`7b14a55`). `git diff 6736ee2 2ff8766` touches only `qa/manifests/t-013-citation-rescope.md`, so `nodes.ts` is byte-identical and every finding below applies to the code now on main.
**Sibling report:** `qa/debug/t-013-citation-robustness-cycle3.md` diagnosed the first T-013 stall, before the rescope. This report finds the same root cause one level up.

---

## 1. Failure capture

- **Session / task:** make the scribe's `needsReview:false` ("auto-verified") safe. Under D-020 only typed numbers and a fixed country vocabulary may auto-verify. Every other fact is kept and marked needs-review.
- **Goal in progress (cycle 3):** close rev-9 (a retraction or attribution in another clause), rev-10 (zero-width characters), c2-1 (reported speech with an unlisted subject) and rev-12 (span widening).
- **Error:** there is no runtime error, and every verify command reproduces. The failure is a review BLOCK after a checker PASS. The ai-engineer c3 review ran `verifyCandidateFact` on "I want to study as landlord suggested in the UK" and got `needsReview:false`. The cause is an open wildcard, `(?: [\p{L}]+){0,4}?`, inside `COUNTRY_TEMPLATES[0]` (`nodes.ts:464`).
- **Last successful step:** checker c3 at `6736ee2`. It reran 34 of its own hostile variants plus 8 positive controls with 0 leaks. It also falsified 3 capability rows in a throwaway worktree, and all four eval providers matched the manifest byte for byte.
- **Repeated pattern:** every independent check found a structurally new leak class, and each fix closed exactly the class it was shown. Two of the four discoveries came after a checker PASS, from the design review.
- **Environment checked:** HEAD, the diffs and the worktree state were verified directly with git. Main's ledger is reconciled after the merge (last status wins). There is no tool, RAM or environment fault anywhere in the history.

### 1.1 Cycle table: where each hole was

| Check | Verdict | New class found | Where the hole was | Fix applied | Hostile eval rows added after the fact |
|---|---|---|---|---|---|
| c0 checker (`7dda413`) + reviews | FAIL | negation (c0-1), pronoun or kinship third party (c0-2), an unscaled "20 lakh" (rev-2) | open deny lexicon | more lexicons plus a first-person rule (cycle 1) | +13 (h01–h13). Before the fix, **10** were fabricated-verified. |
| c1 checker (`4330182`) PASS, then ai review BLOCK | PASS → BLOCK | question (rev-4), conditional (rev-5), unlisted in-law words (rev-6), dates (c1-1) | open deny lexicon | allow-list templates plus more lexicons (cycle 2). **The rev-14 wildcard was written here (`fd7407e`).** | +14 (h14–h27). Before the fix, **14** were fabricated-verified, exactly the new rows. |
| c2 checker (`d94f323`) + ai and DE reviews | FAIL | reported speech with an unlisted subject (c2-1), a retraction in another clause (rev-9), zero-width characters (rev-10) | **turn scope** (other clauses were unconstrained) | single-clause rule, a REPORTING lexicon and an invisible-character strip (cycle 3) | +9 (h28–h36). Before the fix, **8** were fabricated-verified, exactly h28–h35. |
| c3 checker (`6736ee2`) PASS, then ai review BLOCK | PASS → BLOCK | an open wildcard inside the template (rev-14) | **inside the allow-list itself** | T-030 (in progress) | none yet ("eval has no suggest/advise/recommend rows") |

Each fix narrowed one dimension. Each next hole sat on a dimension nobody had written down. The rev-14 wildcard survived four reviews: the c2 checker, the c2 ai review (which recommended *widening* the templates, rev-11), the c2 DE review and the c3 checker's 34 variants.

### 1.2 One discriminating check run this session (read-only probe, not a test suite)

A scratchpad script (`<scratchpad>/probe-t013-c3.mts`) imported the bound worktree's real `verifyCandidateFact` by file URL. It wrote nothing into the tree: `git status` was clean before and after, and HEAD was `2ff8766` with the same `nodes.ts` as `6736ee2`. Every case is a genuine, verbatim quote in a single-clause turn with no deny word, so no fabrication is involved:

| Class | Input (cited turn → proposed fact) | Result |
|---|---|---|
| control | "I want to study in the UK" → `targetCountry: UK` | `needsReview=false` (correct) |
| **K: key never checked** | "I want to study in the UK" → `nationality: UK` | **`false`** |
| K | "I scored 92 in my class 12 boards" → `ieltsBand: 92` | **`false`** |
| K | "My budget is 1500000" → `budget_usd: 1500000` (implicitly INR) | **`false`** |
| K | "My budget is 2500000 per year" → `budget_inr_total: 2500000` | **`false`** |
| **S: speaker never checked** | *counsellor* turn "I prefer Canada" → student `targetCountry: Canada` | **`false`** |
| S | *counsellor* anecdote "I chose Canada" → student `targetCountry: Canada` | **`false`** |
| **X: context outside the cited turn** | counsellor: "Imagine money is no issue at all. Where would you go?" / student: "I want to study in the USA" | **`false`** |
| X | student: "I want to study in the UK" / next student turn: "Sorry, scratch that. Canada." | **`false`** |
| X (rev-15's own repro) | "Rahul ne kaha" / "ki main UK jaana chahta hoon" | `true` (unrecognised-form: the `^main` anchor saves it) |
| **P: translation provenance** | text "UK ke baare mein soch raha hoon" (thinking about UK); machine `translatedText` "I want to study in the UK" | **`false`** |
| W (rev-14, known) | "I want to study as landlord suggested in the UK" | **`false`** |

The code confirms why:
- The gate receives only `{kind, value}`. See `assessFactForReview(candidate: { kind: string; value: unknown }, …)` at `nodes.ts:664-668` and the call site at `nodes.ts:797`, so the fact's **key** never reaches it.
- `TranscriptTurnSchema.speaker: "student" | "counsellor"` exists (`packages/schemas/src/schemas.ts:159`), but the word `speaker` appears nowhere in `packages/engine/src/scribe/`.
- Only the cited turn is read.
- `translatedText` is Gemini's output (`docs/plan.md:68,89`), yet a template match on it counts the same as a match on the student's words.

T-030's diff so far (connector set plus a static wildcard audit) touches none of these four dimensions.

---

## 2. Root cause

### 2.1 Which side: **LOOP DESIGN** (contract, verify method and unit scope), with one small execution slip. Not tool or environment.

**Evidence against execution failure.**
- Every cycle's numbers were reproduced independently: tests, typecheck, eval tables and falsification rows.
- Each fix closed its class; the c3 checker's 34 variants found nothing in the fixed classes.
- There were no flaky tests, no environment drift and no hallucinated success.

**Evidence for loop design.**

1. **The contract names a mechanism, not a property.**
   - B2 as amended says: "Only two kinds auto-verify at full confidence: typed numbers, and values matching a fixed country/alias vocabulary, matched as whole words". It also says a test proves "a number/vocabulary match is accepted without review".
   - Read literally, "UK" in "my cousin is in the UK" satisfies B2.
   - Every finding since c0 was judged against an **unwritten** property: "`needsReview:false` means the student affirmed this value, for this key, in their own words, as current". Reviewers rebuild that property from D-020's cousin example.
   - That property is open natural-language understanding: polarity, mood, attribution, speaker, discourse scope and key meaning.
   - The rescope narrowed the **value** surface to a closed vocabulary. It did not narrow the **proposition** that "verified" asserts, and it did not change the bar (zero leaks, critical severity).
   - The previous stall report's option (a) was carried out as a value cut. Its companion option (c), changing the bar, was never adopted. So the unbounded judgment that stalled T-013-robustness at entity level (is "britain" part of "new britain") moved to sentence and discourse level.

2. **The severity bar does not match the product.**
   - B2's "accepted without review" conflicts with B3: every fact still needs the counsellor's approve or reject click.
   - The only consumer of `needsReview` is a warning chip (`apps/web/src/components/ApprovalScreen.tsx:316-327`). No batch-approve exists.
   - Even so, c0-1, rev-4, rev-5 and c2-1 were filed **critical**. The real effect of a leak is one missing chip on a fact a human still approves.
   - A zero bar plus critical severity turns every new sentence a reviewer can write into a Block.

3. **The verify method is reactive (example-based), and the eval cannot express whole classes.**
   - Every hostile row was written after a reviewer had named its class (the table above: 10, 14 and 8 before-fix fabricated-verified, each exactly equal to the new rows).
   - At every PASS the set measured 0 and held **0** rows of the next class, 4 times out of 4. So `fabricatedVerified = 0` certifies "no named class regressed". It has no power on an unnamed class.
   - The eval's adversary model is 4 provider modes (perfect, case-drift, fabricator, lazy). None of them emits a *genuine* quote with a wrong key, a counsellor turn or a translation-only citation.
   - Of 70 sessions, **0** gold facts cite a counsellor turn and **0** rows are mis-keyed or cross-turn. **10** gold quotes exist only in `translatedText`, all of them as positives.

4. **The unit scope defines evidence as "whatever the code reads".**
   - The gate decides over (value, quote, one turn's text plus translation).
   - The meaning of a fact also depends on the key, the speaker, the neighbouring turns, and whether the text is original or machine-translated. Each of these unread inputs is a latent class (§1.2).

**Execution slip (minor, and caused by the verify-method gap):**
- The rev-6 design was "a small positive template set", fail-safe by construction.
- `fd7407e` wrote an open `{0,4}` letter-word gap into template 0, which contradicts that premise.
- Example-based probing *around* the templates, which is how every checker worked, cannot find a hole *inside* them. Only a whole-grammar read found it.

### 2.2 The four candidate causes, tested

| Candidate | Verdict | Evidence |
|---|---|---|
| The eval set comes from the maker's imagination, so it never holds the next class | **Confirmed, and wider than stated.** The rows come from reviewers' *found* cases, added after the fact. Separately, the provider modes cannot generate the K, S and P classes at all. | 4 of 4 cycles: the new class was absent at the PASS, and the before-fix count equals exactly the rows added. The counts in §2.1 item 3. |
| The gate mixes a closed shape surface with open lexicons | **Confirmed as a contributor, not the root.** | Cycles 0–2 were all lexicon additions (c0-1, c0-2, rev-2, rev-4, rev-5, rev-6 in-law, c2-1 REPORTING), which is the patching style an open lexicon invites. After cycle 2 the allow-list carried the guarantee, but the checks still pushed on the lexicons (c3: reporting-verb tenses, invisible characters) while the allow-list had an open wildcard. Mixing the layers hid which one was load-bearing. With a truly closed grammar the lexicons are only defence in depth. |
| The templates were never audited as a whole | **Confirmed.** | The rev-14 gap lived from `fd7407e` (cycle 2) through four reviews. T-030's `AUTO_VERIFY_TEMPLATE_SOURCES` scan (no open class, no unbounded repeat, a no-widening enumeration) is the first whole-template audit. It proves the intra-clause dimension closed, and only that one. |
| "Auto-verify" is the wrong product surface, given B3 | **Largely confirmed, on value and cost.** | 12 of 73 kept facts verify, and all 12 are template-positive rows written to verify. **0 of 24** realistic value facts verify (manifest, c3 open gaps). The only effect is a chip, and B3 needs a click regardless. Auto-verify is a *triage/UX* signal (it helps review load, rev-7) that was verified as if it were a *safety* surface. |

**Root cause, in one sentence:** the unit is asked to make "auto-verified" mean "the student affirmed this value for this key". That is an open natural-language property. Meanwhile:
- the contract names only a mechanism,
- the gate reads only part of the evidence that fixes meaning,
- the acceptance evidence is a reactive example set, and
- the severity bar treats a missing chip as a critical write.

So every independent review can build a sentence on an unread dimension, and the bar turns each one into a Block. The first T-013 stall had the same root cause.

---

## 3. Is the design closed by construction once rev-14 is fixed?

**No, and this is already demonstrated, not predicted.** At the code now on main, 8 probes on 4 dimensions that T-030 does not touch auto-verify (§1.2 K, S, X, P). T-030 as scoped closes the intra-clause dimension, which is W. A fifth class exists today; four do.

"Closed by construction" is only meaningful against a written property over an explicit set of evidence. The proposed property P, for the B2 amendment:

> `needsReview:false` iff
> (a) the cited turn's `speaker === "student"`;
> (b) the fact's `key` is in the key set of the matching template. Each template declares its keys: country templates → `targetCountry`; the budget template → the budget key whose period and currency match the clause; score templates → the key of the exam named in the clause;
> (c) the **original-language** `text`, not the machine translation, is exactly one non-trivial clause, that clause is in L(template), and the slot equals the value;
> (d) cross-turn discourse is **out of scope**: "auto-verify judges the cited turn alone; context from other turns is the counsellor's call under B3". The alternative is an in-scope, lexicon-based check of the neighbouring turns, which reopens an open surface; it is not recommended.

(a), (b) and (c) are structural. Each is a few lines in `assessFactForReview`/`verifyCandidateFact` (`nodes.ts:664-800`), and none adds a lexicon. Caveat for (c): some of the 10 translation-only gold positives may move to review, so measure that before and after.

**The proof that would settle it.** Make it T-030's acceptance evidence, and have the checker re-run it and falsify it:

1. **Grammar closure (exhaustive).**
   - Enumerate the finite accepted language L from `AUTO_VERIFY_TEMPLATE_SOURCES` (T-030 already exports it) for every canonical value.
   - For every sentence s in L and every token position, apply single-token insert, substitute and delete edits drawn from a vocabulary V. V is the union of: all deny lexicons, every token of the 70 eval transcripts, a Hinglish/Devanagari word list, and random letter strings.
   - Assert `needsReview === true` unless the edited sentence is in L. Membership must be decided by the enumerator, never by the regex under test.
   - Add seeded 2-token edits.
   - This test flags rev-14 on day one: inserting "suggested" after "study" gives a sentence outside L that verified.
2. **Out-of-grammar generation (soundness).**
   - Generate random sentences over V of length 1 to 12 with a fixed seed. fast-check or a seeded PRNG both work; no new dependency is needed.
   - Assert that the regexes accept nothing outside L, so every such sentence gets `needsReview:true`.
3. **Metamorphic invariants over the evidence tuple.**
   - For every s in L (or a seeded sample), take a verifying fact and change exactly one thing. Assert `needsReview` flips to `true`:
     - speaker becomes `counsellor`;
     - key becomes any key outside the template's key set (the 13 gold keys plus random keys);
     - the quote is found only in `translatedText`, and `text` is a different sentence;
     - (only if (d) is taken in scope) a hostile preceding or following turn is added.
4. **An eval provider mode `misattributor`.** It emits genuine quotes with a wrong key, cites counsellor turns, and cites translation-only text, so `fabricatedVerified` can measure the K, S and P classes.
5. **Falsification.** Reopening the `{0,4}` gap, dropping the speaker check or dropping the key binding must each turn the matching property test RED.

With P written into B2 and this proof in place, any later review finding is one of two things:
- **a P violation:** the proof has a hole, so fix the proof (bounded);
- **outside P** (irony, a cross-turn hypothetical under (d)): file it low/advisory, because B3 owns it. It is not a Block.

That split is what stops the oscillation.

---

## 4. Smallest recovery and recommendation

**Recommendation: (A), which Umesh already chose in D-024 and is merged as `7b14a55`, but only with T-030 re-scoped from "close rev-14" to "prove the property".**

- **(B) fold rev-14 into T-013 as cycle 4:** rejected. It would be the fifth pass of a 3-cycle budget on a merged unit. It fixes W and leaves K, S, P and X open, so the next review Blocks again. This is exactly the pattern diagnosed above.
- **(C) re-plan T-013:** rejected as unnecessary. The shipped code is fail-safe in the direction that matters: it never drops a fact, B3 gates every write, and a leak costs one missing chip. T-025, T-022, T-029 and T-012 are built on it. The fix is additive and local to `nodes.ts:664-800`.
- **(A) as currently scoped is not enough.** T-030's brief ("close the connector gap, audit templates for wildcards") closes only W. If it merges like that, the next ai review will Block T-030 on K or S. The probe already reproduces them.

**Smallest recovery (the maker queues it; nothing in it is irreversible):**
1. **File the four classes as ledger rows through the checker, which owns `qa/issues.jsonl`:**
   - K, key not bound: high. Realistic, e.g. per-year versus total budget.
   - S, speaker not bound: high. The field already exists; the fix is one line.
   - P, translation-only match: medium.
   - X, cross-turn framing or retraction: its severity depends on the gate below.
2. **Widen T-030 before it is checked:** add bindings (a) speaker, (b) key and (c) provenance, plus proof items 1–5 as its acceptance evidence. Record the scope change in a D-entry linked to D-024. If T-030 is already close to ready-for-check, a sibling unit (T-034) on the same `nodes.ts` region is acceptable, but then run it serially after T-030, because both edit the same function.
3. **One gate question for Umesh** (a B2 amendment is a critical, human-approved contract change):
   - **Question:** "What does `needsReview:false` promise?"
   - **(i) Recommended:** property P as written above, with cross-turn out of scope. An auto-verify leak is at most *high*, because B3 bounds it, and it Blocks only when it violates P.
   - **(ii) Drop auto-verify entirely:** every fact shows as needs-review. This is closed trivially and costs almost nothing today, since 0 of 24 realistic facts verify.
   - **(iii) Later:** replace the templates with a calibrated classifier trained on B3's approve/reject clicks. The `/rlcd` audit's route applies: self-hosted LAYA, because the data is PII.
4. **Checker brief for T-030:** judge by the property proof plus its falsification, not by "N more hostile variants". This matches the memory note "Checker briefs: prove outcome, not construction".

**Preventive changes to encode later** (maker/checker skills and the contract, via /compound):
- For any B14 allow-list or deny-list gate, the manifest must name the **evidence tuple** the gate decides over. It must also carry an **exhaustive or generative closure test** over the accepted language, not only example rows.
- Contract criteria for a gate must state the **property** its output asserts, not the mechanism.
- Severity must be calibrated against the actual product consequence (chip versus write).
- A unit whose reviews find a new class twice in a row moves to a "property, not example" re-scope before a third cycle is spent. T-013 hit this pattern twice (the robustness stall and this one).

## 5. Sources read this session
- `qa/manifests/t-013-citation-rescope.md` (worktree; cycles 0–3 and the close-out diff `6736ee2..2ff8766`)
- `qa/verdicts/t-013-citation-rescope.md` (worktree; cycles 1–3)
- `qa/issues.jsonl` (main and both worktrees): the ISS-t-013r-* rows c0-1 to rev-15
- `docs/DECISIONS.md`: D-020 and D-023 (root), plus D-024 (`git show main:`, which landed during this diagnosis)
- `qa/contracts/counselling-engine.md`: B2, B3 and B14, plus the amendment log
- `qa/gates/citation-guarantee-scope.md` and `qa/gates/t013-extra-cycle.md`
- `qa/debug/t-013-citation-robustness-cycle3.md` (the first T-013 stall)
- `packages/engine/src/scribe/nodes.ts:115-830` and `packages/engine/src/scribe/schemas.ts` (worktree); `packages/schemas/src/schemas.ts:72-170`
- `apps/web/src/components/ApprovalScreen.tsx` (the `needsReview` consumer); `docs/plan.md` (translation step); `TASKS.md` (T-013 and T-030 rows)
- The T-030 worktree's uncommitted test diff (`scribe-citation-rescope.test.ts`, the template audit)
- `qa/evals/scribe/sessions.jsonl` (70 rows, profiled for strata, keys, speakers and translation-only quotes)
- `docs/rlcd-audit-2026-09-26.md` (the verifier decision node)
