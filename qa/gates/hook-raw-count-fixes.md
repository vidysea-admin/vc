# Gate: hook-raw-count-fixes
**Opened:** 2026-09-27 (maker; corrective — this decision has been pending since 2026-09-27 morning but
existed only as ledger rows and queue prose, never as a gate file. That means the sweep's gate check
could not see it and it would have died with the session. Recorded properly now.)
**Status:** awaiting Umesh. **Enforcement path — F1 applies: authorization is not approval.**

## The ask
Three issues share one root cause and one fix window:

- **ISS-056** (medium) — three readers (`.claude/hooks/mc-sessionstart.ps1:19`,
  `.claude/hooks/mc-precommit.ps1:5`, `.claude/hooks/delivery-gate-stop.ps1`) match ANY
  `Status:` line in a manifest instead of the LAST one. A manifest that records its history
  (`Status: ready-for-check` earlier in the file, `Status: checked-PASS` at the end) can be read
  as either, depending on line order.
- **ISS-054** (high) — the session-start hook counts only `qa/manifests` in the root tree, so a
  `ready-for-check` manifest inside a wave worktree is invisible. Measured cost: t-020 sat
  unchecked ~10 hours while the hook reported zero pending.
- **ISS-084** (medium) — the same hook's open-issue count is raw-line, not latest-row-per-id.
  Re-measured 2026-09-28 against the current ledger by three instruments written differently
  (two peer-authored, one here; one deliberately avoiding any JSON library so a parse-side quirk
  would show as divergence) — **all three agree**: 577 rows, 278 distinct ids, **288 raw
  `status=="open"` lines vs 137 genuinely open**, inflation **2.10x**, every session, in the
  first line an agent reads. (An earlier version of this gate said 262 vs 134; those were correct
  when written and the ledger has since grown. The ratio is what is stable.)

All three are the same bug class: **counting occurrences instead of distinct entities.** The same
class just cost a full fix cycle on T-043 (ISS-092), so it is not theoretical.

## Why this needs you specifically
`.claude/hooks/*` is an enforcement path. Per this repo's CLAUDE.md and the `append_decision.ps1`
V7 check, the authorizing DECISIONS entry must carry `**Approved-by:** Umesh`, recorded only after
your own explicit confirmation. **A relay of your approval through another agent session is
explicitly not sufficient** — that was tried on 2026-09-27 and correctly refused.

## Question
Do you approve the hook fixes below? **The options changed at 2026-09-27 ~23:55** — an earlier
version of this block offered "approve only ISS-054", which the measurements further down this
file refute (ISS-054 and ISS-056 cancel each other; fixing either alone makes the reported count
wrong in a new direction). That option has been **struck**, not annotated, and ISS-095 — which now
carries the whole reader contract — has been added, because no earlier option authorised it.
Found by the peer checker session as ISS-098.

**Options:**
- **(a) Approve the co-landing unit: ISS-054 + ISS-056 + ISS-095, together.** One D-entry carrying
  `Approved-by: Umesh`, one fix unit, one `/aios-config-auditor` pass before the commit.
  **Recommended.** These three are one defect wearing three numbers: the reader must search every
  worktree (ISS-054), must resolve cycles by max rather than position (ISS-056), and must follow
  the five-condition contract in ISS-095. Landing any subset leaves the pending count wrong in a
  new direction — see the Scope correction below, which measures exactly that. The D-entry must
  state that **the reported numbers will move** when this lands, or the correction reads as a
  regression to whoever sees it next.
- **(b) Approve (a), and also ISS-084's raw-count fix.** ISS-084 (the session-start line
  reporting 288 open issues where the distinct-id count is 137) is genuinely separable — it is a
  different counter in the same file, and it does not interact with the cycle-resolution defects.
  Costs one more edit in the same pass; the benefit is that the first line every future session
  reads stops being ~2x wrong. **Read the narrowing below before implementing it** — the obvious
  implementation fixes the visible defect and leaves a worse one.
- **(c) Not now.** The hooks keep over-reporting open issues and under-reporting pending manifests.
  The measured cost so far: t-020 sat unchecked ~10 hours while the hook printed zero pending, and
  t-010 printed "Checks pending: 0" while sitting at fix cycle 3.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry carrying
`Approved-by: Umesh` before any hook file is touched. Nothing in `.claude/hooks/` is edited until
your own word lands in this session — a relay through another agent session is not sufficient.

---

## Scope correction — the two defects CANCEL, so a partial fix looks like a regression

Added after `mc-sessionstart.ps1:26` was tested the rest of the way. **This changes the
recommendation from "three independent fixes" to "ISS-054 and ISS-056 must be fixed together."**

An earlier reading of mine said the committed hook was unaffected because its patterns tolerate
leading markdown. That is true and it is not sufficient. Line 26 ends in `Select-Object -First 1`,
so it is **first-wins** on any verdict that has had cycles appended to it. Measured across the
tree — 8 verdict files carry more than one `Cycle checked` line, and in **every one** the first
differs from the last:

| verdict | first | last |
|---|---|---|
| `t-010-live-cards` (in its worktree) | 0 | 3 |
| `t-013-citation-rescope` | 1 | 3 |
| `t-017-residuals` | 2 | 0 (appended out of order) |
| `t-004`, `t-032`, `t-039`, `t-042`, `t-043` | 0 | 1 |

So the hook compares a manifest's `Fix cycle: N` against a **stale cycle 0** and concludes "check
pending" for a unit that has already been checked N times. This is the same first-wins-versus-
last-wins root cause as ISS-056, on a different line of the same file.

**Why they must land together.** `t-010` sat at `Fix cycle 3` while the session line printed
`Checks pending: 0`. First-wins alone would have reported it *pending*; it printed *clean* only
because ISS-054's root-only scan never looked inside the worktree where that verdict lives. **Two
defects in one reader are cancelling out.** Fix either alone and the reported count becomes wrong
in a new direction — fix ISS-054 first and previously-invisible units start reporting a stale
cycle 0; fix ISS-056 first and the root-only blindness remains. Whoever implements this should
expect the count to move, and the DECISIONS entry should say so, or the correction will read as a
regression to the next person.

**Credit where due:** this was found by the peer session (vc-f5) after it shipped the same
first-wins bug in a tolerant reader it wrote to *replace* the broken one — its replacement used
`head -1` and reported t-010 as "never checked" for a unit checked four times. Prefix tolerance is
not the fix; **readers must take the last occurrence.** That is the durable lesson, and it is an
argument for writers emitting a machine-readable header rather than for more careful greps.

### Remedy correction: position is not a readable property at all

The caveat above said "readers must take the last occurrence, except t-017". Verified directly, and
the exception is fatal to the rule: `qa/verdicts/t-017-residuals.md` is written **newest-first** —
`Cycle checked` 2 at line 4, 1 at line 246, 0 at line 456, 0 at line 642, strictly descending. So
last-occurrence returns **0 for a unit checked through cycle 2** — the same "never checked" answer
first-wins produces, reached from the other end. On that one file, first-wins is the correct reader.

Writers in this project do not agree on append order. **Therefore neither first nor last is
correct, and position must not be read at all.** The fix is **max-cycle**, or an explicit terminal
marker the writers emit and the readers trust.

**The measurement that settles it:** three readers were written for this one surface in a single
day by two sessions — anchored bare-word, prefix-tolerant first-wins, prefix-tolerant last-wins —
and **all three were wrong, each invisibly from its own output**. That is the argument for writers
emitting a machine-readable header. No reader-side discipline survived contact, including two
written by people who had just diagnosed the previous failure.

### The fix is now one row, not three — ISS-095 carries the whole reader contract

`ISS-095` (high, open) has been bound to carry all five conditions together, so whoever implements
this reads one row rather than reconstructing the rule from four:

1. **prefix-tolerant and case-insensitive** — `^Cycle checked:` matches 0 of 42 verdict files;
2. **resolve by MAX, never by position** — first-wins is the committed hook's defect, last-wins
   fails on `t-017-residuals`'s descending file, and 8 verdicts disagree between the two;
3. **search the root tree AND every worktree**, per slug;
4. **take the max cycle across all copies found**;
5. **prefer the root copy on disagreement** — verdicts are authored on main, so a worktree copy is
   inherited or stale.

**Still gated on `Approved-by: Umesh`, and still must land together with ISS-054 and ISS-056** — a
partial fix makes the pending count wrong in a new direction rather than right.

**The cause, stated once instead of four bug reports.** Four readers of this one field were written
in a single day by two sessions, and all four were wrong — each written by whoever had just fixed
the previous one. That is not carelessness; it is two facts neither session had modelled: **writers
do not guarantee position, and this repo is never a single checkout.** A reader that models both is
correct. A reader that fixes one symptom becomes the next row in the ledger, which is exactly what
happened four times.


---

## Narrowing on ISS-084: entity resolution and merge semantics are two requirements, not one

Added 2026-09-28 after the open count was re-derived by three independently-written instruments,
which agreed on every figure: 577 rows · 278 ids · 288 raw open lines · **137 genuinely open** ·
2.10x inflation · open by severity 20 high / 49 medium / 67 low / 1 `low-medium`.

**The trap, stated before the fix is written.** `status` is present on **all 577 rows, none
missing**. So for `status` alone, last-row-wins and merge-in-order give the *same* answer — both
137, verified here. A last-row-wins implementation therefore **corrects the 2.10x inflation
completely** and passes the obvious check.

It is still wrong — but only in one of its two variants, and an implementer needs the distinction,
not the slogan. `severity` is omitted on 177 rows. Measured three ways against the field-level
merge, at HEAD:

| reader | disagrees with merge on |
|---|---|
| take the final ROW wholesale (naive last-wins) | **122 of 278 ids** — reads them as severity-less |
| take the last row that CARRIES severity | **0 of 278** — exactly correct |
| take the FIRST value (what the committed hook does) | **11 of 278** — mis-severities them |

**Every id has a severity somewhere** (0 ids lack one entirely), so no case is irrecoverable.
**Per-field last-value-wins is a correct implementation here; whole-row last-wins is not.** Those
two have been written as one phrase — "last-row-wins" — in this gate, in the queue prose and in
both sessions' messages, and they are not the same thing. The count comes out right under both;
the triage order comes out wrong under only the first.

The 11 first-wins failures are ids whose severity was revised over the row's life — **7 escalations
and 4 de-escalations**, so a first-wins reader is not merely conservative, it under-reports real
highs *and* over-reports resolved ones: `ISS-044` medium→high · `ISS-045` medium→high→high→low→high→high ·
`ISS-061` medium→low · `ISS-071` high→medium · `ISS-077` medium→high · `ISS-100` medium→medium→high ·
`ISS-101` medium→low · `ISS-t-007-rev-8` medium→high→high · `ISS-t-008-c0-1` low→medium→medium ·
`ISS-t-017-c0-1` high→medium→medium · `ISS-t-037-1` low→high→high. ISS-045's excursion to `low` and
back to `high` means any position-based reader gets a different answer for that id depending which
row it lands on — the same "position is not a readable property" conclusion this gate already
reached for `Cycle checked`, now measured on a second field.

- **Entity resolution** (one row per id) fixes the **count**.
- **Field-level merge in file order** (later non-null fields win, absent fields inherit) fixes the
  **triage order**.
- They are **not the same requirement**, and only the first is visible in the session line.

This is precisely the shape this project has been paying for all night: a fix that looks complete,
passes the check anyone would run, and leaves the part nobody is measuring broken. **The DECISIONS
entry for option (b) must state both requirements explicitly**, alongside the existing note that
the reported numbers will move when this lands.

`scripts/vc-regression-check-conformance.py` already implements the field-level merge correctly
and is the reference, not a new design.

**This corrects a flat claim made in the queue prose** — "never last-row-wins" was written as an
unconditional rule and overstates it: for `status` on this ledger, last-row-wins is exactly right.
The rule holds for `severity` and for any field a row may omit. Corrected in place by the peer
session rather than appended to, per the ISS-098 lesson.

Found by the peer session (vc-f5) at `8bbba6b`; all figures independently re-derived here with a
third instrument before being recorded. Still gated on `Approved-by: Umesh`.
