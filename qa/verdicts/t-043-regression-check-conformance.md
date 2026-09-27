# Verdict — t-043-regression-check-conformance
**Cycle checked:** 0
**Branch/commits:** wave/t-043-regression-check-conformance, 589d57b + 3f3d6ae
**Checker:** fresh-context, Mode A unit check, D:\vc

## VERDICT: FAIL

## The central question, answered plainly

**Yes, this is the Goodhart failure the brief suspected — but only for one shape, and it is the majority shape.**

Five of the six new `verify.narrowing` shapes hold up under independent re-derivation:
`package-filter`, `package-dir`, `direct-tsx`, `doc-grep`, and the `null_bucket` are all either
genuinely re-runnable commands (validated against real `package.json` files, not just regex) or
narrow, legitimately-scoped doc/config checks whose 16 backfilled instances I spot-checked and
re-ran myself and which do reproduce.

The sixth, **`repo-file-arg`** (`pnpm -r (test|typecheck) -- <path>`), is **functionally inert**,
and it is the single most-used shape: **69 of 125 (55.2%)** of the ledger's fixed/verified rows use
it. I verified this three separate ways, all reproducible from a clean state:

1. `pnpm -r test -- packages/engine/tests/index.test.ts` and a plain `pnpm -r test` with **no**
   argument produce byte-identical results: `packages/engine test: tests 689 pass 644 fail 0`,
   identical 1422-line output, in both cases. Repeated for `packages/db -- packages/db/tests/erasure.test.ts`
   against a plain run: `tests 248 pass 248 fail 0`, identical again.
2. Root cause: every package's own `"test"` script is a shell glob (`tsx --test tests/*.test.ts
   evals/*.test.ts` for engine, `tsx --test tests/*.test.ts` for db). `pnpm -r` runs that script,
   unmodified, in **every** workspace and appends the trailing `-- <path>` to all of them; the glob
   has already matched the package's full file set before the extra path is appended, so node's test
   runner runs (glob matches) + (one more path) — never fewer. The path never restricts anything.
3. The checker's own instrument (`scripts/vc-regression-check-conformance.py`, `RE_REPO_FILE_ARG`)
   validates only that the path string **exists on disk** — not that it is a test file, not that it
   narrows execution. Proof: a synthetic row
   `{"regression_check": "pnpm -r test -- ARCHITECTURE.md"}` (a doc, not a test) is reported
   `conforming: 1/1 (100.0%)` by the maker's unmodified script, and running that exact command
   still executes the full 689-test engine suite unchanged.

This means 69 rows now marked "conforming" carry, in substance, exactly the **"BARE allowlist
command, no test-file argument"** class that ISS-076's own prior sweep explicitly and correctly
flagged as inadequate for narrowing — just wearing a cosmetic path suffix that the new checker
validates for existence only, never for effect. **The convention was widened by adding a shape that
looks narrower than "run everything" but isn't.** That is the ISS-081 pattern named in my brief, and
it is real, not a false alarm — filed as **ISS-092** (high), with the full reproduction steps.

I also appended an update to **ISS-076** itself (still `status: open`) explaining this in the
ledger, since the unit's manifest claims to close it and the ledger must reflect that the checker
disagrees.

## Answering the three central-question sub-tasks

**1. Reproduce the 41.6% independently.** Not cleanly reproducible with one well-defined script —
which is itself a finding. Using the base ledger at `e4bfa5b` (`git show e4bfa5b:qa/issues.jsonl`,
459 lines / 268 ids / 125 fixed-verified, matching the manifest's own stated baseline):
- Strict verbatim-3-commands-only reading (my own from-scratch script, not the maker's):
  **115/125 (92.0%) non-conforming** — because this also flags all `repo-file-arg` rows, which the
  original sweep evidently did **not** flag wholesale (its own bucket breakdown never lists this
  form among the ~35 "not in allowlist" examples).
- A charitable reading that additionally tolerates `repo-file-arg` by shape (not the maker's script —
  my own second, independent script): **46/125 (36.8%) non-conforming**.

Neither lands exactly on 50/120 (41.6%), but both are the right order of magnitude, and the ISS-076
ledger text itself states its own count came from an ad hoc "own re-derivation" during a Mode B
sweep — informal human judgment, not a script run. So: I could not reproduce the exact figure, and
I attribute that to ISS-076's own number being an approximate manual count rather than a
reproducible measurement, not to the number being fabricated. That is consistent with, not contrary
to, this unit's root-cause diagnosis (no machine-checkable convention existed) — it just means the
"before 87.2%" comparison in the manifest is not apples-to-apples with "the 50/120 ISS-076 cites,"
exactly as the manifest's own "Open gaps" section already half-admits.

**2. Are the 7 shapes legitimate or retrofitted?** `package-filter`/`package-dir` are genuine and
re-runnable (I confirmed they invoke the target package's own `test` script, validated against real
`package.json` "scripts" keys). `direct-tsx` and `doc-grep` are genuine for their narrow, correctly-
stated scope (doc-grep only for doc/config text, verified true for its only 4 ledger uses). `repo-
file-arg` is broken — see above. `scenario-ref` and `rubric-ref` are **not shell-executable at
all** — they are symbolic references the checker's script resolves for existence only (a CSV id or
a rubric path match), never behaviorally re-run. For their only two ledger uses (ISS-006 rubric-ref,
ISS-t-028-c0-1 scenario-ref) this happens to be honest, because in both cases the actual "fix" *was*
the referenced artifact itself (the plan doc against its rubric; a new, honestly-worded scenario
CSV row), so reverting the fix would indeed make the reference fail to resolve. But the checker
script cannot tell the difference between that legitimate case and a future row where someone points
`regression_check` at an unrelated scenario/rubric id to paper over a real code regression — nothing
enforces "the fix IS the referenced artifact." Worth tightening, not itself blocking, given current
usage is narrow and I found no misuse.

**3. Attempt 2–3 fixed→verified transitions for real.** `package-filter` works as claimed: running
`pnpm --filter @vc/engine test` / `@vc/providers test` and the corrected conjunction
`pnpm -C packages/providers test && pnpm -C packages/engine test && pnpm -r typecheck` (the ISS-066 /
ISS-t-037-2 backfill) both ran clean once I controlled for a resource-contention flake (see below).
`repo-file-arg` does **not** support a meaningfully different transition than the bare whole-suite
command already known inadequate — see the central question above. I did not force a synthetic
revert against historical production code (the original fixing commits for these old rows are not
individually identified in the ledger), but the shape-level falsification above is decisive on its
own: if the path argument has zero effect on what runs, no amount of "it happened to pass" tells you
the check is *specific* to the claimed fix.

**Note on a transient false alarm during my own testing:** a direct isolated run of the ISS-066
conjunction hit `FencedWriterDeadlineError` in `packages/engine/tests/scribe-erasure-fence.test.ts`
once, while I had a full-suite `vc-testlock.sh pnpm -r test` running concurrently in the background
(RAM/CPU contention skewing a wall-clock fence-deadline test — the same flake class already logged
as ISS-089/ISS-091). Re-running `packages/engine` alone afterward gave a clean `689 tests, 644 pass,
0 fail, 45 skipped`. Not a product defect; noted so the next checker doesn't re-discover it cold.

## Also verified

- **Field-level merge:** confirmed correct, including the ISS-t-032-rev-1 inheritance case
  (regression_check lives only on the earlier non-`update` row; the merge correctly carries it
  forward) and Test 17/18 in the unit's own suite, which I ran myself
  (`bash scripts/vc-regression-check-conformance.test.sh` → `30 passed, 0 failed`). No
  "occurrences not distinct entities" (ISS-084/ISS-056 class) bug found.
- **Append-only ledger:** `git diff e4bfa5b -- qa/issues.jsonl` on the unit's branch is
  **16 additions, 0 deletions/modifications** — genuinely append-only, confirmed with my own diff
  (not reused from the manifest).
- **16 backfilled values:** spot-checked ISS-013, ISS-015, ISS-t-039-3 (doc-grep) by re-running
  their exact grep commands myself against the current worktree — all matched as claimed.
  ISS-t-033-rev-1/-2's corrected path (`packages/engine/tests/crisis-eval.test.ts`) exists on disk
  (the old path did not). ISS-t-032-c0-1's simplification to match its sibling ISS-t-032-rev-1 is a
  reasonable data-quality correction. ISS-006's `rubric_ref` reuses the already-established doc_units
  mechanism honestly. No fabricated backfill value found.
- **The 4 WEAK-flagged null rows** (`ISS-t-013r-c0-4/-5`, `ISS-059`, `ISS-083`): leaving them
  unbackfilled is defensible — they're outside ISS-076's own named scope and null already conformed
  for them before this unit. Reporting "100% conforming" while the instrument itself still prints 4
  WEAK rows is a minor honesty wrinkle (the headline number omits a caveat the tool itself surfaces),
  worth a one-line fix in the next cycle's summary but not blocking on its own.
- **Baseline suite:** `pnpm -r typecheck` (9/9 clean), `python contracts/verify_contracts.py` (PASS
  by vacuity), and the full suite via `bash scripts/vc-testlock.sh pnpm -r test` all ran clean;
  package counts I independently observed (`apps/web` 38, `apps/api` 46, `packages/engine` 689/644,
  `packages/db` 248) match the documented 1236/1191/0/45 baseline. This unit changed no test
  outcomes anywhere in the monorepo, as claimed.
- **Feedback inbox:** read in full; nothing pending relevant to this unit (the only recent entries
  are T-039's B18 quarantined open questions, unrelated).

## Is ISS-076 honestly closed?

**No — only narrowed, and only partially.** The root-cause diagnosis (no per-package/per-file
narrowing convention existed) is correct and valuable, and roughly half the fix (package-filter,
package-dir, direct-tsx, doc-grep, null_bucket, plus the 16 individually-corrected backfill rows) is
sound work that should survive into the next cycle largely as-is. But the `repo-file-arg` shape —
carrying the majority of rows — does not deliver the one property a regression check must have: the
ability to fail specifically because *this* fix was reverted. Shipping it as "100% conforming"
overstates what was actually achieved. Fix cycle 1 needs to either make `repo-file-arg` real (verify
empirically, the way this verdict did, that a different path changes what actually runs) or retire
it in favor of the already-working `package-filter`/`package-dir` shapes plus a real sub-file
narrowing syntax, then re-derive the conformance numbers honestly before ISS-076 can be marked
verified.

## New issues filed

- **ISS-092** (high, open) — `repo-file-arg` shape is functionally inert; full reproduction in
  `qa/issues.jsonl`.
- **ISS-076** update appended (status remains `open`) — records this cycle's disagreement with the
  manifest's close claim.

Both appended to `D:/vc/qa/issues.jsonl`, additions-only, confirmed via `git diff`.

---

# FIX CYCLE 1

**Cycle checked:** 1
**Date:** 2026-09-27
**Branch/commit:** wave/t-043-regression-check-conformance, fix-cycle-1 commit `15ef1ab` (on top of
cycle-0's `3f3d6ae`)
**Checker:** fresh-context, Mode A unit check, D:\vc (independent of the cycle-0 checker session)

## VERDICT: FAIL

Narrower than cycle 0, but still FAIL. The majority-shape Goodhart failure (ISS-092) is genuinely
retired, not papered over. But sampling 3 of the 69 remapped rows for a real revert-and-restore
found **1 whose regression_check does not actually catch its own regression** — a new, different
instance of the same underlying disease (a check that reports green regardless of whether the fix
it names is present), just relocated from the shape/mechanism level (cycle 0) to a single row's test
content (cycle 1). Filed as **ISS-093** (high). ISS-076 stays open.

## 1. The three real revert-and-restore transitions (the brief's central ask)

I picked 3 remapped rows across 3 different packages, not the maker's own spot-checked files, and
did the full cycle myself each time: revert the actual product-code fix → run the exact ledger
`regression_check` string → confirm RED → restore (`git diff --stat` empty) → confirm GREEN.
Timestamps are `$(date -Iseconds)` from my own shell, not composed.

**a) ISS-009 (`packages/schemas/tests/fact-source.test.ts`, direct-tsx, no tsconfig) — PASS.**
Fix: `FactSourceSchema`'s `kb` branch requires `fetchedAt: z.string().datetime()`
(`packages/schemas/src/schemas.ts:32`). Baseline `npx tsx --test packages/schemas/tests/fact-source.test.ts`
→ 11/11 (2026-09-27T22:26:56+05:30). Reverted to `.optional()`. Re-ran → **1 fail**
(`kb: missing fetchedAt is rejected`, `AssertionError: Missing expected exception`). Restored
(`git diff --stat` on the file: empty). Re-ran → 11/11 again (2026-09-27T22:27:25+05:30). The
regression_check is real and specific.

**b) ISS-t-020-c0-1 (`apps/web/tests/ui.test.tsx`, the new `direct-tsx+tsconfig` shape) — PASS.**
This is the one new syntax this cycle invented, held to the same bar as the retired shape. Fix:
`reasonCounter`'s `remaining: Math.max(0, max - used)` clamp (`apps/web/src/components/ApprovalScreen.tsx:99`).
First confirmed the manifest's own claim independently: bare `npx tsx --test apps/web/tests/ui.test.tsx`
from repo root **does** fail with `ReferenceError: React is not defined`; the `--tsconfig apps/web/tsconfig.json`
qualified form passes 18/18, narrowing against the 38-test apps/web baseline — both reproduced myself,
not taken on the manifest's word. Then reverted the clamp to `max - used` (unclamped). Re-ran the exact
ledger command → **1 fail** (`a value longer than max ... clamps remaining at 0`, `actual: {remaining: -10}
vs expected: {remaining: 0}`). Restored, `git diff --stat` empty, re-ran → 18/18
(2026-09-27T22:30:37+05:30). The `--tsconfig` flag's own justification (bare form fails, qualified
form passes and narrows) and its gating are both real — separately confirmed the workspace-mismatch
and nonexistent-path rejections still fire (§3 below).

**c) ISS-t-013-rev-1 (`packages/engine/tests/scribe-citation-rescope.test.ts`, direct-tsx) — FAIL.**
This is the row that broke. Fix: `containsNumberToken`'s anchored-boundary regex
(`packages/engine/src/scribe/nodes.ts:799-804`), which the ledger's own history says exists so that
"15" never auto-verifies by matching inside "115". Baseline: 42/42
(2026-09-27T22:28:18+05:30). Reverted `containsNumberToken` to a plain
`normaliseVerbatim(rawText).toLowerCase().includes(String(value))` substring check — reproducing the
exact historical fabrication bug this row is named after. Re-ran the **same regression_check
command** → **still 42/42, 0 failures** (no red at all). Root cause: the one test written to guard
this ("auto-verify NEGATIVE: a number embedded inside a LARGER digit run never auto-verifies ...
e.g. 15 inside 115", line 140) uses the fixture `"115 students applied from that batch"` for value
`15`, which has **no first-person marker** — so `verifyCandidateFact`'s `noFirstPerson` guard already
forces `needsReview: true` before `containsNumberToken`'s return value is ever load-bearing for the
assertion. The test asserts the right outcome for the wrong reason, and is blind to the actual
defect it's named for. Restored the file afterward (`git diff --stat` empty), re-ran → 42/42
(2026-09-27T22:29:42+05:30).

**Verdict on the central ask: 2 of 3 real. 1 of 3 decorative.** This is not the shape (`direct-tsx`)
failing — the shape is doing exactly what it's supposed to (running only the named file, nothing
more, nothing less; the mismatched-workspace and nonexistent-path guards both hold, see §3). It is a
single row's **test content** that fails to exercise the property its own regression_check name
implies. Filed as ISS-093 (full repro in `qa/issues.jsonl`). Because this was found by sampling only
3 of 69 remapped rows, I do not know the true rate among the other 66 — the recommendation is a
broader content spot-check, not just another shape audit, before treating the remap as reliably
regression-safe rather than merely shape-conforming.

## 2. `mcp/student-profile`, 12/12 — is "conforming" honest?

Yes, and it is a materially different situation from `repo-file-arg`, not the same defect through a
side door. Confirmed: `mcp/student-profile/package.json`'s `"test"` script is
`tsx --test tests/*.test.ts`, and `tests/` contains exactly one file (`index.test.ts`). Ran both
independently: `npx tsx --test mcp/student-profile/tests/index.test.ts` → 12/12; `pnpm -C
mcp/student-profile test` → 12/12, same tests. The distinguishing question is whether the argument is
*provably load-bearing*: for `repo-file-arg`, **any** existing path — including a doc, `ARCHITECTURE.md`
— produced byte-identical output to no argument at all (the argument was provably inert everywhere,
for every package). For `direct-tsx` here, the argument **is** the entire specification of what
runs — point it at a different file, or a nonexistent one, and the outcome changes (confirmed
separately in §5). It just happens that in this one package, "the one file" and "the whole package"
are the same set, because there's only one file. That's a real narrowing property with a coincidental
package-level ceiling, not an inert wrapper. The manifest's own phrasing ("no further narrowing
available but still correct") is accurate. The convention could usefully name this class explicitly
(a `single-test-file` note) rather than leaving it to prose, but that's a documentation nicety, not a
defect.

## 3. The `--tsconfig` flag — held to the empirical bar

Reproduced independently (not from the manifest's numbers): bare form fails with
`ReferenceError: React is not defined`; qualified form passes 18/18 and narrows against the 38-test
apps/web baseline (§1b). Adversarially probed the same-workspace gate myself against the live
`Checker` class (not a copy):

```
mismatched-workspace tsconfig (packages/engine/tsconfig.json for an apps/web test)
  -> nonconform: "--tsconfig ... is not the test file's own workspace tsconfig
     (test file is under 'apps/web', tsconfig is under 'packages/engine')"
nonexistent tsconfig path -> nonconform: "--tsconfig path does not exist: ..."
```

Both rejected correctly. The gate is real, not decorative. `scripts/vc-regression-check-conformance.test.sh`
Tests 15/15b/15c/15d cover exactly this and all passed in my own run (§6).

## 4. The WEAK discrepancy — resolved, not averaged

**Cycle 1 is right; cycle 0's "4 WEAK rows" claim does not reproduce, and never did.** I extracted
the cycle-0-committed script (`git show 3f3d6ae:scripts/vc-regression-check-conformance.py`) and the
cycle-0-committed ledger (`git show 3f3d6ae:qa/issues.jsonl`) into isolated files and ran that exact
script against that exact ledger, byte for byte as cycle 0 would have seen it: **0 WEAK rows**,
`125/125 (100.0%)`, no WEAK block printed at all — matching the manifest's own "after" run, not the
prior verdict's claim. I then confirmed the 4 named rows' explanatory fields
(`ISS-t-013r-c0-4`: `class: "process"`; `ISS-t-013r-c0-5`: `checker_note` text; `ISS-059`: merged
`note: "reconciled: ..."`; `ISS-083`: `note: "Folded ... inbox ..."`) are **byte-identical across
`e4bfa5b` (the base commit, before T-043 even started), `3f3d6ae`, and `15ef1ab`** — nothing about
these 4 rows' content ever changed in this unit's history — and directly called
`note_looks_like_null_class()` on each merged row: all 4 return `True`, matching keywords `doc`/
`process`/`no code`, `process`, `doc`/`reconciled`/`no bypass`, and `fold`/`inbox` respectively. So:
the instrument's behaviour has not changed, the ledger content these 4 rows carry has not changed,
and running the actual cycle-0 code against the actual cycle-0 ledger produces 0 WEAK, not 4. The
prior checker's cycle-0 verdict was mistaken on this one point — likely eyeballing the earlier
"before" block's WEAK output (which *does* show 4 WEAK, pre-backfill, at 87.2%) and attributing it to
the "after" state instead. Not a silently-changed instrument; a stale reading in the prior report.

## 5. Falsifying "126/126 (100.0%)" — adversarial rows against the live checker

Constructed and ran directly against `Checker.conforms()` (not a copy, not hypothetical):

| probe | result |
|---|---|
| retired `repo-file-arg` resurrected (`pnpm -r test -- packages/engine/tests/index.test.ts`) | **rejected**, names ISS-092 and the retirement explicitly |
| ISS-092's original falsification, doc via retired grammar (`pnpm -r test -- ARCHITECTURE.md`) | **rejected**, same reason |
| `direct-tsx` path that exists but is a source file, not a test (`packages/engine/src/scribe/nodes.ts`) | **rejected**, "matches no allowed shape" |
| `direct-tsx` path that does not exist | **rejected**, "path does not exist" |
| mismatched-workspace `--tsconfig` | **rejected** (§3) |
| nonexistent `--tsconfig` path | **rejected** (§3) |

One adversarial probe the instrument does **not** reject, found by construction, not guessed: a real
`.test.ts` file containing **zero** `test()` calls. Created
`packages/engine/tests/__adversarial-empty.test.ts` (one comment, no test/describe), asked the live
checker: `('conforms', 'direct-tsx')`. Actually ran it: `npx tsx --test` on that file exits **0**
with `tests 1 / pass 1 / fail 0` — Node's test runner counts the whole empty file as one implicit
passing test. So a `direct-tsx` regression_check pointed at a content-free file would pass both the
static conformance check and a real execution, indistinguishable from a genuine one. Deleted the
probe file afterward (never committed); confirmed no row in the current 126-row ledger is actually in
this state (spot-checked the test counts I and the manifest both observed — all nonzero, matching
real file content). Filed as **ISS-094** (low, latent, not blocking on its own — no known instance).

Execution-based Tests 20/21/22 do genuinely execute, confirmed by re-running
`scripts/vc-regression-check-conformance.test.sh` myself and reading the test file's Test 20/21/22/23
blocks directly (`mktemp -d` fixtures, real `node --test` invocations, real count assertions on stdout
— not `conforms_one()` return-value assertions the way cycle 0's Test 3/15 were). This closes the B14
construction-not-outcome gap ISS-092 named, for the shape mechanism — but ISS-093 shows that gap can
still exist one level up, in a specific row's test content, which no generic shape-level test can
catch.

## 6. Ledger integrity + the merge-time wrinkle

`git diff e4bfa5b HEAD --numstat -- qa/issues.jsonl` → **89  0** (89 insertions, 0 deletions) —
append-only holds for the whole unit including this checker's own two prior appends and this cycle's
backfill. Cycle-1-alone (`git diff 3f3d6ae 15ef1ab`) → **73  0**.

The flagged wrinkle: cycle 1 copied the checker's own `ISS-092` (original) and `ISS-076` (first
update) lines from the **main tree's** `qa/issues.jsonl` into the branch, verbatim. Confirmed
byte-identical between `git show 4130d0b:qa/issues.jsonl` (main) and `git show 15ef1ab:qa/issues.jsonl`
(branch) for both lines. To answer the brief's question directly rather than reason about it in the
abstract, I ran the actual merge: `git -C D:/vc merge-tree --write-tree 4130d0b wave/t-043-regression-check-conformance`
resolved cleanly (no conflict markers), and the resulting tree's `qa/issues.jsonl` blob hash
(`9934b0c...`) is **byte-identical** to the branch's own blob hash — zero duplication, zero
reordering. Git's merge correctly recognised the two copied lines as a shared prefix insertion at the
same tail position on both sides. So: **no, it will not produce duplicate rows on this specific
merge** — verified empirically, not assumed. I would still flag hand-copying already-committed lines
across a branch boundary as fragile practice going forward (it worked here only because the copy was
byte-for-byte identical and in the same relative position; a reformatted or reordered copy would not
be guaranteed to resolve the same way) — worth a process note, not a blocker.

## 7. Full suite + instrument, my own runs

- `bash scripts/vc-testlock.sh pnpm -r typecheck` → 9/9 clean.
- `bash scripts/vc-testlock.sh pnpm -r test` → **1236 tests / 1191 pass / 0 fail / 45 skipped**,
  exact match to the documented baseline (schemas 61, observability 59, db 248, providers 54,
  mcp-university-kb 29, mcp-student-profile 12, engine 689/644/45-skip, apps/api 46, apps/web 38 —
  summed and cross-checked). No flake encountered this run; ISS-089/ISS-091's load-dependent class
  was not observed.
- `bash scripts/vc-regression-check-conformance.sh` → `548 ledger lines, 269 distinct ids, 126
  fixed/verified rows, conforming: 126/126 (100.0%)`.
- `bash scripts/vc-regression-check-conformance.test.sh` → **48 passed, 0 failed** (24 blocks, up
  from cycle 0's 19/30 — Tests 20-23 confirmed execution-based, §5).
- `python contracts/verify_contracts.py` → PASS by vacuity, unchanged.
- `qa/feedback-inbox.md` read in full: nothing new relevant to this unit (the only T-043 string match
  refers to a different project's own task numbering, already folded by a prior checker sweep).

## Is ISS-076 closed?

**No — narrowed further, not closed.** Cycle 1's own contribution (retiring `repo-file-arg`,
remapping 69 rows, adding execution-based tests) is real and holds up: the majority-shape Goodhart
failure from cycle 0 does not recur, and the `--tsconfig` addition is empirically justified and
correctly gated. But "126/126 shape-conforming" is not the same claim as "126/126 regression-safe,"
and this cycle only established the second claim for a 3-row sample — one of which failed. ISS-093
(a row whose regression_check is decorative, for test-content reasons rather than shape reasons) must
be fixed, and a wider (not 3-row) content spot-check of the other 68 remapped rows should be done,
before `fixed -> verified` transitions on this ledger can be trusted at scale. ISS-094 is a latent,
currently-inactive hardening gap worth closing opportunistically. `scenario-ref`/`rubric-ref` remain
existence-only (cycle 0's note, untouched, still accurate). Only `/checker` can move ISS-076 further.

## New issues filed this cycle

- **ISS-093** (high, open) — ISS-t-013-rev-1's regression_check does not fail when its named fix is
  reverted (test confounded by an unrelated guard). Blocks a clean cycle-1 PASS.
- **ISS-094** (low, open) — a content-free `.test.ts` file would pass both the static conformance
  check and real execution; latent, no known instance in the current ledger.
- **ISS-076** update appended — records this cycle's FAIL and why, cross-referencing ISS-093.

All three appended to `D:/vc/qa/issues.jsonl` (main tree), additions-only, confirmed via
`git diff --numstat` (5 insertions, 0 deletions for this cycle's own appends on top of the
already-uncommitted cycle-0 appends).

---

# FIX CYCLE 2

**Cycle checked:** 2
**Date:** 2026-09-28 (checker run started 2026-09-27T23:40 IST, spanned midnight)
**Branch/commit:** wave/t-043-regression-check-conformance, fix-cycle-2 commit `81436bd` (on top of
cycle-1's `15ef1ab`)
**Checker:** fresh-context, Mode A unit check, D:\vc, worktree
`D:\vc\.worktrees\t-043-regression-check-conformance` (independent of the cycle-0 and cycle-1
checker sessions)

## VERDICT: PASS (with recorded issues — not closed)

This is the last permitted fix cycle. Both of cycle 1's FAIL reasons (ISS-093, ISS-094) are
genuinely fixed, independently reproduced by me from scratch, not taken on the manifest's word. This
cycle also surfaced two new, real findings on its own initiative (a third Goodhart species on a
pre-existing row, and a merge-hazard that has gone from theoretical to actual since cycle 1) — both
are disclosed honestly in the manifest or found by my own further digging, neither is something this
cycle claimed to have fixed, and neither undermines the two specific defects this cycle was
dispatched to close. Per the brief's own instruction not to FAIL on something a PASS-with-recorded-
issue handles better: I am passing this unit, filing **ISS-099** and **ISS-100** as new open issues,
and requiring **ISS-100's dedup as a mandatory pre-merge step** (not a reason to stall the whole
unit). ISS-076 remains **open**, narrower than before.

## 1. ISS-093 — my own revert-and-restore, and the structural-unreachability claim checked against the code

Reproduced independently, not copied from the manifest. Baseline: `npx tsx --test
packages/engine/tests/scribe-citation-rescope.test.ts` → 43/43 (2026-09-27T23:40:05+05:30). Edited
`containsNumberToken` (nodes.ts:816-821) to a plain
`normaliseVerbatim(rawText).toLowerCase().includes(String(value))` substring match. Re-ran →
**42/43, 1 named failure**: `containsNumberToken: a value embedded inside a LARGER digit run is
never a whole-token match (ISS-093 direct unit proof, e.g. 15 inside 115)` (23:40:45). Confirmed the
*original* confounded test (`auto-verify NEGATIVE: ... e.g. 15 inside 115`, line 158) stayed green
throughout — exactly the manifest's claim that this test is confounded by `noFirstPerson`, not a
proof of the boundary property. Also ran `scribe-auto-verify-property.test.ts` on the reverted code:
9/9 green, matching the manifest's claim that the whole property suite is blind to this revert too.
Restored (23:42:13) → 43/43, `git diff --stat` empty.

I then read `packages/engine/src/scribe/nodes.ts` myself (not just the comment block) to check
whether "a fixture-only fix was structurally impossible" is a real structural fact or a
rationalisation for the easier route. It is real: `declaredKeysForClause` (line 757) requires
`m.groups.n === String(value)` **exactly** (line 762) before a template's keys are added to the
matched set, and `assessFactForReview`'s auto-verify branch (line 954) requires **both**
`containsNumberToken`'s `matched` **and** `guards.length === 0` (which folds in
`matchesAllowedTemplate`'s verdict, i.e. the template equality check) before it will return
`needsReview: false`. Since the template's NUM slot is an anchored, exact digit-run equality on the
same normalised clause, any string for which that equality holds is *by construction* also a
substring match — so `containsNumberToken`'s stricter token-boundary check can never be the
differentiator between a correct and an incorrect outcome through the public `verifyCandidateFact`
path, for any currently-declared numeric key (`budget_inr_per_year` and the score-exam family). This
is a genuine, checkable structural fact, not spin: the direct unit test on the exported function is
the only way left to keep this boundary property honestly regression-tested. **ISS-093: confirmed
fixed.**

**Does anything now catch a containsNumberToken regression through the real verification path?** No
— by the same structural argument, nothing can, for any key this codebase currently declares. That is
not a gap in this fix; it is a fact about the codebase's current template design (every declared
numeric key is guarded by an independent, stricter equality check upstream of this function). If a
future numeric key is ever declared *without* an anchored exact-equality template, this boundary
property would become reachable again through the public path, and would need a fixture proving it
there too — worth a one-line note in the export's comment for the next person who adds a numeric key,
not a blocker here.

## 2. ISS-094 — reproduced

`bash scripts/vc-regression-check-conformance.test.sh` (own run) → **52 passed, 0 failed**, including
Test 24 exactly as described: a content-free `.test.ts` fixture is rejected by the static checker
(naming ISS-094) while `node:test` itself silently reports it as "1 test, 1 pass". **ISS-094:
confirmed fixed.**

## 3. Species 3 (`ISS-t-013-c2-rev-3`) — my ruling

Confirmed independently: `grep -n -i "five six lakh|600000|CASE3b|approximate range|adjacent
bare-number" packages/engine/tests/scribe-citation-rescope.test.ts` over the full 957-line file
returns **zero matches**. No test anywhere in this row's own `regression_check` file exercises the
scenario the row's title names. This is a real, third species, distinct from both ISS-092 (inert
shape) and ISS-093 (confounded assertion): a **coverage-absence** row, where the static conformance
check and ISS-094's own `has_real_test_declaration()` both pass it, because both only check that the
*file* has real tests somewhere, never that any of them relate to *this row's own claim*.

**Ruling, as the brief asked for explicitly:** by the same reasoning that retired `repo-file-arg` and
fixed `ISS-093`, this row's regression_check does **not** prove the property ISS-076 exists for, and
may **not** honestly be counted "regression-safe conforming" even though the instrument correctly
reports it shape-conforming. The instrument has a genuine third blind spot it does not model — filed
as **ISS-099**.

**Does this block PASS?** No, and I want to be precise about why not, since the brief calls this the
core judgment of the cycle. `ISS-t-013-c2-rev-3` is a **pre-existing** row (from before T-043 even
started — it dates to a "T-013 c2 ai-engineer review" long predating this unit); this cycle's own
assigned scope, per its manifest and per cycle 1's FAIL, was ISS-093 and ISS-094, both of which are
genuinely fixed. Cycle 2 found this row **through its own voluntary due diligence** (a systematic
8-row sample it was not strictly required to run at all — the brief only required fixing 093/094),
and the manifest **reports it plainly as FAIL-but-not-fixed**, names it as a successor unit, and does
not fold it into any "100%" claim. That is exactly the honest-disclosure behaviour a maker-checker
loop should reward, not punish with a FAIL that sends a genuinely-fixed pair of defects to STALLED
over a pre-existing row the cycle was never asked to fix and did not hide. The right instrument is a
PASS with the gap named and ledgered (ISS-099), not a FAIL.

## 4. The sample rule — re-derived from scratch, and 2 independent re-reverts

Re-extracted the 69 remapped ids myself, independently of the manifest's own numbers: `git diff
3f3d6ae 15ef1ab -- qa/issues.jsonl` shows 73 new lines; removing the 2 ids that are checker-status
rows rather than remapped test rows (`ISS-092`, `ISS-076`, each appearing twice — once copied from
main, once as a new cycle-1 status update) leaves exactly **69**, in the diff's own order. Removing
the checker's own 3 cycle-1-tested ids (`ISS-009`, `ISS-t-020-c0-1`, `ISS-t-013-rev-1`) leaves **66**.
Taking `remaining[3::8]` in Python gives:

```
['ISS-010', 'ISS-019', 'ISS-027', 'ISS-t-007-rev-1', 'ISS-t-011-rev-1', 'ISS-t-011-c2-rev-1',
 'ISS-t-013-c2-rev-3', 'ISS-t-008-c0-1']
```

**Exactly the 8 ids the manifest reports, in the exact same order.** The sample rule is genuine —
stated before selection, not reverse-engineered from a clean-looking result.

Independently re-ran revert-and-restore on 2 of the 8, chosen because the manifest did **not**
emphasise them (it singled out `ISS-t-008-c0-1` and `ISS-t-013-c2-rev-3` for extra discussion; I
picked the other two least-discussed ones):

- **ISS-027** (`packages/db/scripts/db-init.ts`, `INDEX_PLAN`'s 5 plain `studentId` entries →
  regression_check `packages/db/tests/db-init.test.ts`). Baseline 25/25 (23:46:22). Removed 4 of the
  5 plain-`studentId` entries (kept only `consents_studentId`). Re-ran → **24/25, 1 named failure**:
  `ISS-027: every studentId-bearing collection has a plain (non-partial, non-unique) index led by
  studentId`, with the assertion naming exactly `"facts"` as the missing collection (23:47:21).
  Restored → 25/25 (23:47:46), `git diff --stat` empty. **PASS, exactly as claimed.**
- **ISS-t-011-c2-rev-1** (`packages/db/src/erasure.ts`, `fenceReleaseTime`'s
  `created + MINIMUM_FENCE_HOLD_MS` floor → regression_check `packages/db/tests/erasure.test.ts`).
  Baseline 68/68 (23:48:11). Dropped the floor term (`Math.max(completed + Math.max(0, graceMs),
  priorRelease(fence))` only). Re-ran → **64/68, 4 named failures**, including exactly
  `D-016 KEY PROBE (ISS-t-011-c2-1): a real writer paused before its insert and released only AFTER
  completion AND the fence-release call is still fenced -> compensated, zero residue; the sweep
  removes the fence only after the hold` (23:48:35). Restored → 68/68 (23:49:17), `git diff --stat`
  empty. **PASS, exactly as claimed.**

Both of my own reverts match the manifest's reported outcome exactly, including the specific named
failing assertions. Combined with the manifest's own 8 and the checker's earlier 3, this cycle's
sample now stands at **11 real revert-and-restore results, independently corroborated for 4 of them
(2 by cycle-1's checker, 2 by me) — none contradicted my own re-check.**

## 5. The heuristic — reproduced, and one undisclosed blind spot found

`bash scripts/vc-confounded-guard-heuristic.test.sh` (own run) → self-test **4/4 passed**. Real-repo
run (own run): `python3 scripts/vc-confounded-guard-heuristic.py packages/engine/tests/` → **7
candidates, all in `scribe-citation-rescope.test.ts`** (lines 140, 181, 211, 221, 229, 239, 258), **0
elsewhere** — matches the manifest exactly.

Checked the docstring's stated blind spots against the tool, per the brief's instruction to confirm
they are "real and complete." Three of the four stated ones are accurate on inspection. But I found
**one real blind spot the docstring does not name**: `scribe-auto-verify-property.test.ts` calls
`verifyCandidateFact` only through a local `run()` wrapper (line 377), never directly inside a
`test(...)` body — so `CALLS_TARGET_RE` never matches inside that file's test blocks, and the tool's
"0 elsewhere" finding for this file means **"invisible to the tool,"** not **"confirmed
well-formed."** By direct inspection, most of that file's `needsReview: true` assertions do pin a
specific reason immediately (e.g. `assert.deepEqual([r.needsReview, r.reasons], [true, [...]])`), but
at least one bare assertion (line 655, `assert.equal(run(...).needsReview, true)`, no reason pinned)
does not — and the heuristic cannot see it either way, because of the wrapper indirection, not
because it correctly judged the assertion well-formed. This is **low severity**: the tool is
explicitly advisory-only (`Exit code: always 0`), not a merge gate, and the one unpinned assertion
sits alongside many pinned ones checking the same probes, so it is not evidence of an active defect —
but the docstring's "what it cannot catch" list should name test-helper indirection as a real
limitation, since it is exactly the kind of local convention (like the `reviewReasons` convention it
already keys on) this codebase actually uses. Not filed as a separate issue — folded into ISS-099's
"successor unit" note (heuristic scope) rather than opening a fourth ledger row for a documentation
gap in an advisory-only tool.

## 6. The +1 test count — confirmed fully attributable

`git diff 15ef1ab 81436bd --stat` touches exactly 2 files in `packages/engine`:
`src/scribe/nodes.ts` (19 lines, the export + comment) and
`tests/scribe-citation-rescope.test.ts` (35 lines). `git diff ... | grep -c '^\+test('` → exactly
**1** new `test(...)` block added. Ran the full suite twice via `vc-testlock.sh` (own runs,
2026-09-27T23:53 and again as part of this review): both times **1237 tests / 1192 pass / 0 fail / 45
skipped**, `packages/engine` moving from 689→690 / 644→645, every other package's count unchanged, no
flake of the ISS-089/ISS-091 class in either run. Matches the claimed delta exactly, both times.

## 7. Cross-branch ledger copying — byte-identical, but the merge-hazard check now FAILS against current main

Confirmed byte-identical: the branch's `ISS-093` and `ISS-094` lines are byte-for-byte identical to
main's own committed copies (`diff` on extracted lines, empty). Internal append-only holds: 551
lines, all valid JSON (own parse check), `ISS-093`/`ISS-094` each appear exactly once in the branch's
own file, `ISS-092` appears twice (its original + status-update rows, both legitimate, not a
duplication artifact), `ISS-095`/`ISS-096` (unrelated, main-only) are correctly absent from the
branch.

**But re-running the merge-hazard check against CURRENT main, as the brief specifically asked,
changes the answer from cycle 1's.** Cycle 1's checker ran `git merge-tree --write-tree 4130d0b
wave/t-043-regression-check-conformance` and found zero duplication. I ran the equivalent check
against current main (`HEAD` `24dc6b0` at review time): `git merge-tree --write-tree 24dc6b0
wave/t-043-regression-check-conformance` still resolves with **no conflict markers** — but the
resulting tree's `qa/issues.jsonl` (575 lines, all valid JSON, own check) contains the `ISS-093` line
**twice** (positions 462 and 573, byte-identical) and the `ISS-094` line **twice** (positions 463 and
574, byte-identical). Root cause: the branch/main common ancestor (`e4bfa5b`) predates both main's own
addition of these lines (by the checker, directly to main) and the branch's later hand-copy of them
(by the maker, in cycle 1 and reconciled again in cycle 2) — git's line-based 3-way merge cannot
recognise two independent same-content insertions as one, so it silently keeps both. This is exactly
the fragility cycle 1's checker flagged as "worth a process note, not a blocker" — now materialised
into an actual hazard because main moved. **Filed as ISS-100.**

**Does this block PASS?** No — it blocks a **clean merge**, which is a distinct, later step from this
unit's own correctness. The ISS-093/ISS-094 fixes are sound regardless of how the ledger lines get
reconciled at merge time. I am making ISS-100's dedup a **named precondition for merging this branch**
(see the issue's own note for the mechanical fix — drop the duplicate lines as part of the merge,
don't trust an unattended auto-merge on `qa/issues.jsonl`), not a reason to FAIL a unit whose actual
code and test changes are correct.

## 8. Full suite + instrument, my own runs

- `bash scripts/vc-testlock.sh pnpm -r typecheck` → 9/9 clean (2026-09-27T23:52:17+05:30).
- `bash scripts/vc-testlock.sh pnpm -r test` → **1237 tests / 1192 pass / 0 fail / 45 skipped**, run
  twice, identical both times, no flake of the ISS-089/ISS-091 class observed either time.
- `bash scripts/vc-regression-check-conformance.sh` → `551 ledger lines, 271 distinct ids, 126
  fixed/verified rows, conforming: 126/126 (100.0%)`. (271 vs cycle-1's reported 269 is exactly the
  +2 new ids `ISS-093`/`ISS-094` this cycle's reconciliation added — accounted for, not a
  discrepancy.)
- `bash scripts/vc-regression-check-conformance.test.sh` → **52 passed, 0 failed**, including Test 24
  (ISS-094).
- `bash scripts/vc-confounded-guard-heuristic.test.sh` → **4 passed, 0 failed**.
- `python contracts/verify_contracts.py` → PASS by vacuity, unchanged.
- `qa/feedback-inbox.md` read in full: nothing T-043-specific pending (the only recent entries are
  T-039 B18 blind-fixture contract questions, already folded, and an unrelated counsellor-portal
  review note — neither applies to this unit).

## Is ISS-076 closed?

**No — narrower again, not closed, and this cycle's own "no 100%-style headline" framing holds up
under my checking.** Both cycle-1 FAIL reasons (ISS-093, ISS-094) are genuinely fixed — independently
reproduced, not taken on trust. The sample-rule and 2 of the 8 claimed row-level PASSes reproduce
exactly. The heuristic reproduces exactly, with one undisclosed (low-severity, advisory-only) blind
spot. The +1 test count is fully accounted for. But:

- `ISS-t-013-c2-rev-3` (species 3, coverage-absence) is real, and by this cycle's own stated
  reasoning cannot be counted regression-safe — filed as **ISS-099**, a genuine new gap the
  instrument does not and structurally cannot close without a claim-to-test cross-reference.
- The cross-branch ledger copy, safe at cycle 1, is **no longer merge-safe** against current main —
  filed as **ISS-100**, blocking a clean merge (not this PASS).
- `scenario-ref`/`rubric-ref` remain existence-only (unchanged, out of scope again).
- The 4 pre-existing WEAK-eligible null rows remain unbackfilled by design (unchanged).
- 58 of the 69 remapped rows remain content-unverified (named as a successor unit by cycle 2, not
  hidden by it).

**Credit where due:** this cycle's honesty holds up under scrutiny. It did not claim a 100%-style
headline for content-safety, stated an ~18% (2/11) estimate with an explicitly wide small-n interval,
named exactly which 58 rows are unverified, and reported its own new species-3 finding as
FAIL-but-not-fixed rather than folding it into "100% conforming." That reporting discipline is what
makes a PASS-with-recorded-issues the right call here, rather than either extreme (a clean PASS that
hides ISS-099/ISS-100, or a FAIL that punishes disclosure).

## New issues filed this cycle

- **ISS-099** (high, open) — the coverage-absence species: `ISS-t-013-c2-rev-3`'s regression_check
  file has zero test coverage of its own claimed scenario; the instrument cannot detect this without a
  claim-to-test cross-reference. Not blocking this PASS (pre-existing row, honestly disclosed,
  outside this cycle's scope).
- **ISS-100** (medium, open) — the cross-branch ledger hand-copy, safe against the main commit cycle
  1 checked, now produces an actual duplicate `git merge-tree` result against current main. **Blocks
  a clean merge** — must be deduped as part of merging this branch, not a reason to FAIL this cycle.
- **ISS-076** update appended — records this cycle's PASS verdict and the full accounting above.

All three appended to `D:/vc/qa/issues.jsonl` (main tree), additions-only, confirmed via
`git diff --numstat` (3 insertions, 0 deletions) and a full JSON-parse check (486 lines, 0 invalid).

## Status: PASS — cycle closed. Merge gated on ISS-100's dedup being handled at merge time.

