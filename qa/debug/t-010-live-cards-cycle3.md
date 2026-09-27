# Debug diagnosis: t-010-live-cards (STALLED after fix cycle 3 of 3)

**Debugger:** fresh debugger subagent, Phases 1–2 only (failure capture + root cause). Read-only
toward code; this file is the only thing I wrote. Nothing committed.
**Bound root:** `D:/vc`. Unit branch `wave/t-010-live-cards`, worktree
`D:/vc/.worktrees/t-010-live-cards`, head `fb5959c` (cycle-3 code `bc87287`, manifest `3afe5e0`).
**Read in full:** all four cycles of `qa/verdicts/t-010-live-cards.md` (1641 lines), the manifest
(cycle-3 section and the cycle-0/1/2 dispositions), ledger rows `ISS-t-010-c2-1`, `ISS-t-010-c2-2`,
`ISS-t-010-c3-1`, `ISS-t-010-c3-2`, contract criteria B1/B14/B18,
`skills/exploration-planner/SKILL.md`, `skills/verifier/SKILL.md`,
`packages/engine/src/cards/verifier.ts`, `relevance.ts` (via the verdicts' line cites),
`packages/engine/src/cards/schemas.ts`, `nodes.ts`.

**Open criteria:** B1 (high, `ISS-t-010-c3-1`), B18 (high, `ISS-t-010-c3-2`). B9 is a shared
`checkCrisis` defect owned by T-012/T-035 and is correctly not this unit's.

---

## 1. Failure capture

### 1.1 Cycle-by-cycle, with the real numbers

| | code | verdict | what it changed | score on rows it **had been shown** | score on rows it **had not** |
|---|---|---|---|---|---|
| **c0** | `a252ce1` | FAIL 8/13 | initial build: `liveScriptReason` = "ends with `?`"; `asksFor` clarify branch gated by `citedTopics.has(topic) \|\| citedTopics.size > 0` | n/a (first build) | B1 **2/10** checker rows leaked; B18 leak isolated and reproduced; B19 0/58 run; B17 missing |
| **c1** | `f753e17` | FAIL 10/13 | B1: added `isInterrogativeForm` (26-verb `INSTRUCTION_VERB`, `SUBJECT_AUX_INVERSION`, ≤6-word elliptical hatch, 8-stem `DEVANAGARI_RECITAL`). B18: **refused** the verdict's literal `citedTopics.has(topic)` and substituted a global `buildsOnCitedTopic` boolean. B17 + B19 newly met (34/58 scenarios genuinely run) | c0's 2 B1 rows: **2/2 closed**. c0's B18 row (A1): **closed** | B1 **25/28** fresh rows leaked. B18 **4/5** rows leaked (substitute closed only the one row c0 quoted) |
| **c2** | `ef15287`+`1a68d62` | FAIL 10/13 | B1: `isImperativeMood` (`NON_VERB_OPENERS` head test **+ a second allow-list on the token after the verb**), `isNounPhraseFragment` replacing the word count. B18: `requestsValueOf` — 8 phrase frames in a 70-char window | c1's preserved probes: `chk-attack.mts` **16/16 dropped**, `chk-attack2.mts` **17/17 dropped** (33/33). c1's five-row B18 table **5/5 closed**. CE-054 kept | B1 English **11/14** leaked, Devanagari **7/9** leaked. B18 **9/10** leaked — **a regression** (c1 leaked 1/10); with no profile citation at all, **8/8** leaked where c1 dropped **0/8**. New over-suppression **8/20** legitimate cards dropped |
| **c3** | `bc87287` | FAIL 10/13 · **STALLED** | Structural inversion, no list added as the fix. `requestsValueOf`/`VALUE_DESCRIPTION_TAIL`/`UNKNOWN_VALUE_FRAMES`/`FRAME_WINDOW` **deleted** (checker confirmed: 3 grep hits repo-wide, all comments; no second gate; clarify branch unconditional again). Second-token allow-list **inverted** into `NOT_AN_OBJECT`. `isNounPhraseFragment` rejects a leading bare verb and refuses ASCII rules on Devanagari. `DEVANAGARI_IMPERATIVE_VERB` fires without an addressee. `namedInPassing` added as the single positive CE-054 carve-out. `NOT_BARE_FORM` `s$` narrowed to `[^s]s$` (an **evidenced refusal** of the instruction, endorsed by the checker) | **every** previously-published row: B1 English **0/14**, Devanagari **0/9**, B18 no-citation **0/8**, B18 K-rows **0/10**, O-list over-suppression **0/20**, `chk-attack*` **33/33 still dropped**, CE-054 kept, `namedInPassing` survived four directed attacks | checker's 41 fresh rows: **26 leaked** (homographs in `NON_VERB_OPENERS` 12/12 · `NOT_BARE_FORM` suffix class 6/8 · `NOT_AN_OBJECT` coordinator 5/5 · plain-form Devanagari 3/7 · plain imperatives 0/9). B18 fresh **8/10** leaked. Over-suppression **2/15** |

Harness constant across all four: engine 602/602, schemas 63, db 239, api 41, web 50, typecheck
clean, `contracts/verify_contracts.py` PASS, scenarios 34/58 (32 pass, 2 fail — the real B9 probe),
and **CARDS-EVAL 62/62 in every single cycle**, fixture byte-identical since `a252ce1`.

### 1.2 The number that decides this diagnosis

On **one commit** (`bc87287`), two independent authors each wrote a set of *fresh* hostile B1 rows —
phrasings absent from every preserved probe file — and measured it themselves:

- the **maker's** 67 fresh rows (`mk3.mts`, sets N1–N6): **2 leaks** (both in N4), = **3.0 %**
- the **checker's** 41 fresh rows (`chk3run/p1.mts`, sets C1–C6): **26 leaks**, = **63.4 %**

Same code, same criterion, same day, both samples honestly drawn and self-reported. A twenty-fold
spread in the measured defect rate is not a difference in rigour; it is what happens when the
population being sampled is unbounded and the sample is drawn by hand. **There is no convergent
measurement of B1 on this unit.** Every cycle's score is a statement about the sampler, not about
the code. Four cycles have optimised against four different samplers.

### 1.3 The structural facts underneath the numbers

Two facts, both verified in the tree rather than taken from the verdicts:

**(a) `NON_VERB_OPENERS` is required to be two contradictory things at once.**
`packages/engine/src/cards/verifier.ts:152-202`. Lever C (reproduced by the checker: flip
`if (NON_VERB_OPENERS.has(word) || PLURAL_NOUN_EXCEPTIONS.has(word)) continue;` to `if (false)`)
reddens an **over-suppression** test — so the list is load-bearing for keeping legitimate elliptical
cards alive. Finding 1a shows the same list is the escape hatch for 12/12 imperatives. The list must
therefore be (i) large enough to cover the counselling nouns a card legitimately opens with, and
(ii) contain no word that is also an English bare verb. Those requirements are jointly unsatisfiable,
because the words in question — `note`, `plan`, `open`, `score`, `test`, `profile`, `cost`, `grade`,
`board`, `right`, `reference`, `still` — *are* both. This is not a list that is too short or too long;
it is a list that cannot exist. The maker's own comment in that file states the principle
("deliberately NOT here: `offer`, `shortlist`, `stream`, `frame`, `push`, `pitch` — all of them are
bare verbs a planner could open an instruction with") and then violates it forty times, because
removing those forty would re-break the cards the list exists to protect.

**(b) The B18 guard is switched off by the shape the system is designed to emit.**
`relevance.ts:281-291` ends `return card.type === "clarify" && !citesKnownFact && !namedInPassing(…)`.
`skills/exploration-planner/SKILL.md:47` instructs, verbatim: *"Build on it instead: **cite the fact**
and widen or clarify it."* So the planner is told to produce cited widen/clarify cards, and the guard
exempts exactly cited cards, and exempts widen outright. The two conditions the code uses —
"is it typed `clarify`?" and "does it cite this topic?" — are both **planner-controlled fields**, and
`PlannerCardTypeSchema` (`schemas.ts:45`) lets the model pick the type freely. The guard is not
defeated by hostile phrasing; it is defeated by compliance with our own skill file.

---

## 2. Root cause

### **Loop design. Not execution.**

Stated once, plainly: **four cycles of competent execution failed against a unit boundary that makes
the criteria unverifiable by the mechanism the unit was scoped to use.** A fifth attempt of the same
shape will fail for the same reason, and its score will again be whatever the fifth sampler happens
to write.

The cycle-3 checker's own framing — *"four cycles have tried to decide open-class linguistic
questions with closed word lists, and each cycle scores on whichever rows it was shown"* — is
**correct, and I tested it rather than adopting it.** All four of the evidentiary tests the brief
named come back supporting it, plus one the brief did not name:

| test | result |
|---|---|
| Each cycle scores near-perfectly on rows it was shown, poorly on fresh ones | **Confirmed, monotonically.** c1: 2/2 shown, 3/28 fresh. c2: 33/33 shown, 18/23 fresh leaking. c3: 61/61 shown (14+9+8+10+20), 26/41 fresh leaking |
| Residuals are ordinary language, not adversarial coinages | **Confirmed.** `Note the 20 lakh ceiling for the parents.` · `Nudge and reassure the parents about fees.` · `Is the budget still an unknown for the family?` · `बता दो`. The V-and-V-NP coordination is the commonest two-instruction shape in English. None of these needs to be invented; they need only to be written |
| Same defect class recurs under structurally different implementations | **Confirmed, and this is the strongest single point.** c1 = positive trigger list. c2 = positive trigger list, one level down. c3 = **the exact structural inverse** (default-closed, escape lists). The checker verified the inversion is genuine — deletions confirmed, no second gate, `namedInPassing` unbroken under four directed attacks — and the leak rate on fresh rows went 89 % → 78 % → 63 %. Inverting the polarity of the mechanism did not change its class of failure. That is a property of the mechanism, not of any implementation of it |
| **New:** two honest fresh samples on one commit | **3 % vs 63 %.** No convergence signal exists for the loop to steer on |
| Counter-evidence: a cycle that could have closed a class with information it had | **Found, and it is small.** See §2.2. It accounts for 3 of 26 leaks and closing it would have re-opened over-suppression |

### 2.1 Which of the two B18 findings is primary

**Finding 2b — "citing the fact you re-ask disables the guard" — is primary.** Finding 2a (the
`card.type === "clarify"` test) is a genuine defect but it is a one-line fix with no tension against
anything: making the branch type-blind costs nothing, since `DIRECT_ASK` is already type-blind and no
legitimate widen/compare card needs permission to re-ask a known fact.

2b is primary because it is **unfixable inside the current boundary**, and here is the proof. The
guard must simultaneously:

- **drop** `Is the budget still an unknown for the family?` — `clarify`, citing the budget fact,
  interrogative, names the budget topic; and
- **keep** CE-054 `Is the 20 lakh budget per year or for the whole course?` — `clarify`, citing the
  budget fact, interrogative, names the budget topic.

Identical on every feature the code can see. They differ only in whether the approved fact's *value*
answers the question — an entailment judgement. Every cycle has tried to approximate that with a
different lexical proxy: `citedTopics.size > 0` (c0), `buildsOnCitedTopic` (c1), `requestsValueOf`'s
eight frames (c2), `namedInPassing`'s four positional conditions (c3). `namedInPassing` is the best
of the four — the checker attacked it from four directions and it held, and I agree it is the one
piece of this unit worth keeping — but it holds by being *so narrow* that it recognises approximately
CE-054's own sentence shape and nothing else. Narrowness is why it is safe and also why it cannot
generalise. And because the planner skill instructs the cited shape, the population of cards this
distinction has to be drawn over is the system's **main output**, not its edge case.

### 2.2 Was any cycle's failure avoidable with information it had? Being specific and fair.

Three candidates. Judged on their merits:

**Cycle 2's false fail-closed claim — avoidable, and it was carelessness, not a hidden gate.**
The manifest and the code comment at `verifier.ts:106-111` asserted *"the lexicon that decides
therefore FAILS CLOSED — an opener nobody listed is treated as a possible imperative."* The
falsifying second allow-list was the **return statement of the same 14-line function**
(`isImperativeMood`, `verifier.ts:179-192`):
`return IMPERATIVE_PARTICLE.test(next) || OBJECT_HEAD.has(next) || /^[A-Z]/.test(tokens[1] ?? "")`.
Not a distant file, not a second gate "further down" the pipeline — the last line of the function the
claim was about, written by the same cycle. A maker asserting a safety *property* owes a read of its
own function's exits. **Verdict: avoidable, and the claim should not have been made.** But two things
bound it: the defect it concealed was not itself avoidable (cycle 3 inverted that allow-list exactly
as instructed and B1 still failed at 63 %), and cycle 2 disclosed other leaks it could have hidden.
So this is an error of **over-claiming**, not of building. It cost the loop one cycle of trust, not
one cycle of progress.

**Cycle 2's B18 regression — foreseeable, and it was foreseen and disclosed.** The manifest said in
its own words that `requestsValueOf` *"fails **open** outside its frames."* What it did not do was
measure what that cost against cycle 1. It had the cycle-1 code in git and the checker's probe files
on disk; a two-column run would have shown 1/10 → 9/10 before shipping. **Avoidable, cheaply.**
Severity: this is the one cycle that went backwards, and a before/after column on the *previous*
cycle's behaviour — not just on the current verdict's rows — would have caught it.

**Cycle 3's three self-inflicted leaks (`board`, `right`, `reference`) — avoidable, and the maker
wrote the test it failed to run.** Those three words were added to `NON_VERB_OPENERS` in `bc87287` to
cure over-suppression, and each one is a bare verb; the comment three lines below explicitly reasons
about exactly this risk for six other words. The check is mechanical: *for every word added to an
escape list, run an imperative headed by it.* **Avoidable, and it should be recorded.** It is also
**3 of 26 leaks** — closing it, and the other ~37 homographs with it, would have re-broken the
elliptical cards lever C proves the list is protecting. So it is a real lapse that does not change the
outcome.

**Everything else in cycles 0–3 was competent, and two things were better than competent:** the
cycle-0 refusal of `citedTopics.has(topic)` (vindicated three times, with the CE-054 regression
reproduced by every subsequent checker), and the cycle-3 refusal of the literal `s$` drop (narrowed
to `[^s]s$` with a measured CARDS-EVAL 62→59 justification the checker reproduced and endorsed). A
maker that overrides a wrong instruction with evidence twice, and is right both times, is not the
thing that is broken here.

### 2.3 Is the contract's bar satisfiable? (finding only — I may not amend it and do not recommend relaxing it)

**B1 as written is not satisfiable by any implementation of this shape.** Its three clauses are:
*"No card, prompt or skill output may be a full sentence for the counsellor to recite"* (a universal
quantifier over natural language), *"Cards are question / comparison / evidence types only"*, and
*"**A code guard enforces this** and a test covers it"* — reinforced by B14 (*"a test that only checks
a filter function exists does not count"*). A universal negative over open-class natural language,
enforced deterministically, with an outcome test. The determinism clause and the universality clause
cannot both hold: no finite rule set decides English imperative mood, and the contract's own soft
rules permit `compare`/`challenge`/`evidence` cards to *be* statements, so the guard must separate
"a statement of a cited fact" from "a line to recite" — a distinction of illocutionary force, not of
form.

**B18's second bullet** (*"An approved fact is never asked again as if it were unknown"*) is
satisfiable in principle — it is an entailment check against a known value, which is decidable given
the value — but not by string inspection of the prompt, and not while the card's only machine-readable
fields are `{type, prompt, sources, confidence}`.

I am **stating** this, not deciding it. Amending B1/B18, or scoping them to a supervised-pilot bar,
is a checker amendment plus a human call.

### 2.4 Did the harness contribute? (CARDS-EVAL 62/62 × 4)

**What it is evidence of:** that no cycle touched the fixture (`git diff a252ce1 3afe5e0 --
packages/engine/tests/fixtures/ qa/evals/` is empty, verified by two checkers), that no cycle
regressed the 62 behaviours the fixture does cover, and that the blindness discipline of D-028 held
perfectly. Four cycles of a maker under pressure and not one fixture edit. That is worth something and
it is the reason the 62/62 can be read at all.

**What it is not evidence of:** anything about B1 or B18. The fixture scored 62/62 on a branch with
9/10 B18 leaks (c2) and on a branch with 26/41 B1 leaks (c3). It has never once moved in response to a
real defect in the two criteria this unit exists to enforce.

**So did the harness contribute to the stall? Yes — by omission, and the omission is structural, not
a bug.** CARDS-EVAL is the only *standing* measurement of these criteria. It is blind by design (which
is why it is trusted) and it is therefore also silent on the open class. The consequence is that the
loop had **no regression detector for B1/B18 between cycles**: the only oracle was whichever hostile
rows the next checker happened to invent, and those rows were discarded from the standing suite after
each cycle. That is precisely the condition under which "fix the rows you were shown" is the only
available strategy — not because the maker chose it, but because nothing else was measurable. A blind
fixture must not be widened (that would destroy D-028's value); what is missing is a **second,
growing, non-blind adversarial corpus** that accumulates every row any checker has ever written, and
which a cycle is scored against *in addition to* fresh rows. Cycle 3 would then have inherited 61 rows
as a floor instead of re-deriving them. It happens to have passed all 61 — but it had to be told them
in prose and transcribe them by hand, and the checker explicitly warned that tuning against a
preserved probe file "is how this unit got here".

---

## 3. The smallest recovery

Sized honestly. **This is a boundary and scope change, not a code fix.** The unit cannot be recovered
by a fifth fix cycle on the same scope, and I am not recommending one.

### 3.1 The one change that actually resolves it: move the judgement from prose to schema

`CandidateCardSchema` (`packages/engine/src/cards/schemas.ts:52-57`) is
`{type, prompt: z.string(), sources, confidence}`. Every B1 and B18 decision is therefore forced onto
free-form prose, and both criteria become open-class NL problems. **They need not be.** Both the
planner skill and the schema are ours to change:

- **B18** — require the planner to declare, per card, the `knownFactId` it builds on **and** a
  machine-checkable `asks` enum (e.g. `unit | scope | timing | confidence | source | none`), and have
  `asksFor` check the enum rather than the prose. CE-054 declares `asks: "scope"` on the budget fact
  and is kept; `Is the budget still an unknown for the family?` cannot declare any of them truthfully,
  and a card citing a known fact with `asks: "none"` is dropped. This converts the entailment question
  into a closed-class schema check that fails closed by construction, and it is enforced by a code
  guard, satisfying B18's proof clause and B14. It costs: a schema field, a planner-skill edit, a
  re-generation of the eval fixture's card shapes, and a decision about what to do when the model
  declares a false `asks` (answer: the deterministic guard still runs; a false declaration is a
  citation-integrity problem, which is `skills/verifier`'s existing job).
- **B1** — the same move does **not** fully work, because "is this prose a line to recite" has no
  honest closed-class declaration. What does work is splitting the two jobs `NON_VERB_OPENERS`
  currently does: keep it as the fragment-keeper inside `isNounPhraseFragment` (lever C proves it is
  good at that), and replace the head-is-not-a-verb oracle with a real bare-verb signal — a verb
  lexicon or POS tagger. That is the dependency the maker named in cycle 3 and it is a genuine
  addition to the unit's scope, not a fix cycle: a new dependency, offline-corpus sizing, and a
  licence/bundle decision.

### 3.2 On the semantic verifier skill

The checker's note that *"an optional semantic verifier skill already exists and already fails
closed"* is accurate on both counts but narrower than it reads. `skills/verifier/SKILL.md` judges
**whether a card's sources support its claim** — it is the soft half of **B2**, not of B1/B18 — and
it is wired at `nodes.ts:215-247` behind `semanticVerifier?: boolean` with **default off**. It can
only drop, so extending it is safe in direction. But B1's own text requires *"a code guard enforces
this"*, so an LLM pass cannot be the enforcement of record for B1 — at most a second layer over a
code guard that still has to exist. Using it for B1/B18 means: new skill content, turning on an
extra provider call per live-cards run (latency and cost on a live counsellor surface), a
non-deterministic result on a safety criterion, and an eval to measure the judge itself. That is a
design decision with a cost, not a shortcut.

### 3.3 What I would do with the branch in the meantime

Nothing destructive. The checker's finding stands: the tree is green, append-only, scoped, and
`namedInPassing` plus the cycle-3 inversion are genuine improvements over every earlier state. The
branch should **stay unmerged and be kept**, not reverted. Cycle 3 is the best version of this unit
that the current boundary admits.

### 3.4 The decisions that are not mine, named with their owner

| # | Decision | Owner |
|---|---|---|
| **D1** | Re-scope T-010: split the open-class B1/B18 judgement out of this unit into a successor unit with its own plan gate (schema-declared `asks` for B18; a verb lexicon / POS dependency for B1). Accept T-010 as "verifier built, two criteria deferred to the successor", or keep T-010 open across that work. | **Umesh** (scope + ownership) |
| **D2** | Whether B1/B18 as written are the bar for a supervised pilot, or whether the contract should state a measurable bar (e.g. a named adversarial corpus at a stated rate) instead of an absolute universal. **I may not amend the contract and am not recommending relaxing it** — I am recording that the current wording is not satisfiable deterministically. This is a **checker amendment plus** a human call. | **checker** (amendment) → **Umesh** (approval) |
| **D3** | Whether a non-deterministic LLM pass may be part of the enforcement of a safety criterion on a live counsellor surface, given B1's "a code guard enforces this", and who pays the per-run latency/cost. | **Umesh** |
| **D4** | Whether to add the standing adversarial corpus described in §2.4 as a second, non-blind suite alongside CARDS-EVAL — and confirm that doing so does **not** touch or widen the blind fixture (D-028). | **checker** (owns `qa/contracts/` and the fixtures' blindness) |

Until D1 and D2 are answered, there is nothing a maker can usefully build on this unit. That is the
gate, and it is a human one.

---

## 4. What should NOT be attempted

Explicitly, so that no future session runs cycle 5 of the same thing.

1. **Do not run a fourth fix cycle against the cycle-3 verdict's 41 rows.** It will close them — every
   cycle has closed every row it was shown, at 100 % for three cycles running — and the next fresh
   sample will leak at roughly the same rate. Closing `ISS-t-010-c3-1`'s published rows is not
   evidence about B1 and must not be reported as such.
2. **Do not edit any word list in either direction.** Not adding trigger words, not removing escape
   words. `NON_VERB_OPENERS` is provably required to be two contradictory things (§1.3a); every entry
   removed to close a B1 leak re-opens an over-suppression failure that lever C already demonstrates.
   There is no assignment of those ~300 words that satisfies both sides.
3. **Do not re-litigate `citedTopics.has(topic)` alone.** It has been proposed once and reproduced as
   a CE-054 regression **three** times (cycles 1, 2, 3, each by a different checker). The cycle-0
   instruction that prescribed it is a retracted checker error. Re-proposing it is a protocol
   violation, not a new idea.
4. **Do not re-add `requestsValueOf`, `UNKNOWN_VALUE_FRAMES`, `FRAME_WINDOW` or any successor phrase
   list for B18.** That was cycle 2 and it was the only cycle that went backwards (1/10 → 9/10, and
   8/8 with no citation at all where cycle 1 dropped 8/8).
5. **Do not widen, edit, or add adversarial rows to `qa/evals/cards-eval.jsonl` or
   `packages/engine/tests/fixtures/**`.** Its blindness is the reason its 62/62 can be read (D-028),
   and four cycles have preserved it byte-identically. A growing adversarial corpus belongs in a
   **separate** suite (§2.4, D4), owned by the checker.
6. **Do not attack `namedInPassing`.** Cycle 3's checker attacked all four of its conditions and could
   not engineer a leak. It is the one piece of this unit that is right, and a future cycle should keep
   it, not replace it.
7. **Do not chase B9 here.** It is `checkCrisis`, shared, owned by T-012/T-035, correctly untouched in
   all four cycles, and is not this unit's to fix.
8. **Do not read CARDS-EVAL 62/62, or a scenario run of 34/58, as progress on B1 or B18.** Neither has
   moved in four cycles across two 9/10-leak and 26/41-leak branches.
9. **Do not treat this as a maker-discipline problem.** The maker refused two wrong instructions with
   reproducible measurements and was right both times; it self-disclosed leaks it could have hidden;
   it built the falsification levers that let each checker verify it. The three avoidable items in
   §2.2 are worth recording and total 3 of 26 leaks. Re-briefing the maker to "try harder" or
   "be more hostile in its own probes" will not work: it wrote 67 fresh hostile rows in cycle 3 and
   honestly measured 2 leaks, while the checker's 41 measured 26. Hand-drawn hostility is not a
   convergent oracle, and asking for more of it is asking for cycle 5.
