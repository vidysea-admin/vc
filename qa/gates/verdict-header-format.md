# Gate: verdict-header-format
**Opened:** 2026-09-28T01:12:59+05:30 (maker; opened because three independent fields have now reached the same
conclusion and it is a convention change, not a bug fix. Recorded as a gate so it cannot die in
chat prose — the failure mode that hid the hook-raw-count decision for a full day.)
**Status:** awaiting Umesh.

## The ask

Mandate a **machine-readable header** on verdict and manifest files — an exact line format that
writers emit and readers may trust — instead of continuing to fix readers.

## Why this is a format question and not a reader question

Three fields have independently reached "position is not a readable property", each measured, none
predicted from the others:

| field | what was measured |
|---|---|
| `Cycle checked` | 8 verdicts carry multiple cycle lines and the first differs from the last in **every one**. `t-017-residuals.md` is written newest-first (2, 1, 0, 0), so last-occurrence returns 0 for a unit checked through cycle 2 — the same wrong answer first-wins gives, from the other end. Neither first nor last is correct. |
| `severity` | whole-row last-wins mis-reads **122 of 278 ids**; first-value mis-reads 11, in **both directions** (7 escalations, 4 de-escalations). `ISS-045` runs medium→high→high→low→high→high, so position gives a different answer per row. |
| `VERDICT` | census of **151 verdict files**, root plus four worktrees, digits normalised: `VERDICT: PASS` ×102 · `## VERDICT: PASS` ×17 · `VERDICT: FAIL` ×15 · **bare `## VERDICT` ×12** · `**VERDICT: FAIL` ×4 · `## VERDICT: FAIL` ×4. **Four prefix shapes.** The 12 bare lines put the value on a *different line* from the word, so any reader whose gap matches `\s` crosses the newline and captures whatever follows. Reproduced independently by both sessions; figures identical. |

**The count that settles it: five readers of these surfaces were written in one day by two sessions,
and all five were wrong, each invisibly from its own output.** Anchored bare-word (matched 0 of 42);
prefix-tolerant first-wins; prefix-tolerant last-wins; a VERDICT reader that captured file *titles*
as verdict values (85 spurious captures, right answers only by positional luck); and its
replacement, which matched nothing at all because a shell heredoc ate a backslash level and `\b`
reached the file as a literal backspace — then printed `verdict NONE` for two units **and carried
on**, reporting an instrument failure as a fact about the project.

No reader-side discipline survived contact, including readers written by whoever had just diagnosed
the previous failure. A reader fixed for the six shapes that exist today does not stop a seventh
being written tonight.

## Question for Umesh

Do we mandate a writer-side machine-readable header?

**Options:**
- **(a) Mandate an exact header line in the maker/checker skills' step 7, and make readers refuse
  anything else.** Writers emit one canonical form; a reader that cannot parse it **raises** rather
  than returning `NONE`. Cost: this edits `~/.claude/skills/{maker,checker}/SKILL.md`, which is
  AIOS-level and affects every maker-checker project, not just this one. The 151 existing files
  stay readable only if the reader keeps a legacy path, so this is additive, not a migration.
- **(b) Same header, this project only** — a `qa/` convention documented in the project CLAUDE.md,
  leaving other projects alone. Cheaper and reversible; does not stop the same five readers being
  rewritten wrongly in the next project.
- **(c) Keep fixing readers.** Honest cost, measured: five wrong readers in one day, one of which
  silently reported a clean scan over zero matches and one of which reported an instrument failure
  as project state.

**Recommendation: (a), with the reader-raises clause as the load-bearing half.** The header alone is
a convention; the clause that a reader must raise rather than return a plausible empty answer is
what converts a silent wrong answer into a loud one. Every instance tonight was survivable only
because a second party happened to re-run it.

**Not urgent, and it should not jump the queue** — nothing is blocked on it, and the readers that
matter are now correct. It is recorded because the argument is complete and will otherwise be
re-derived from scratch.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry. Option
(a) additionally touches an enforcement-adjacent path and needs `Approved-by: Umesh`.

## Provenance

`VERDICT` census by the peer session (vc-f5) at `cf4f523`, independently reproduced here before
this gate was written — 151 files, all six shape counts identical. `Cycle checked` and `severity`
measurements: `qa/gates/hook-raw-count-fixes.md`. Issue rows: ISS-095, ISS-103, ISS-108.
Answered: 2026-10-25T06:48:16+05:30 — (a) AIOS-level machine-readable verdict header plus reader-raises; not urgent, does not jump the queue; Approved-by: Umesh — Umesh chat 2026-10-25 "go with the recomemended ones"
