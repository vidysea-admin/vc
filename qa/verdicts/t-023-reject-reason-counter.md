# Verdict: t-023-reject-reason-counter

**Cycle checked: 0**
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (Opus, isolated context) — no session context shared with the maker
**Bound root (checked):** D:/vc/.worktrees/t-023-reject-reason-counter, branch wave/t-023-reject-reason-counter, HEAD d20dfe7
**Contract:** qa/contracts/counselling-engine.md (no frozen contracts for the engine yet; verify_contracts.py PASSes by vacuity — reconfirmed below)
**Manifest:** qa/manifests/t-023-reject-reason-counter.md (Status: ready-for-check, Fix cycle 0)

## What I re-ran myself (never trusted the manifest's pasted output)

1. **Typecheck** — `pnpm -C D:/vc/.worktrees/t-023-reject-reason-counter --filter @vc/web typecheck`
   through the machine-wide lock. Exit clean, zero diagnostics. Matches the manifest.
2. **Tests** — `pnpm -C D:/vc/.worktrees/t-023-reject-reason-counter --filter @vc/web test` through
   the lock, on the real bound-tree code. **38/38 pass**, identical test names/order to the manifest's
   pasted output (fresh run, not a diff of the paste).
3. **Contracts** — `python contracts/verify_contracts.py`: `PASS by vacuity` (no frozen contracts for
   the engine phase yet). Matches the manifest.
4. **Diff scope (step 4c)** — `git diff <merge-base main HEAD>...HEAD --stat` and the full diff.
   Changed files: `apps/web/demo/browser-evidence.ts`, `apps/web/src/components/ApprovalScreen.tsx`,
   `apps/web/src/components/labels.ts`, `apps/web/tests/ui.test.tsx`, plus the manifest and
   `qa/evidence/t-023-reject-reason-counter/` + `qa/evidence/browser-t-023-reject-reason-counter-2026-09-26/`.
   This is **exactly** the manifest's "What changed" / "Scope" section. No file outside that list was
   touched, no existing function/export/test was deleted or renamed. Clean.

## Capability-coverage — reproduced independently, in my OWN throwaway worktree outside the bound root

Worktree: `<scratchpad>/vc-t023-checker-falsify` (`git worktree add ... HEAD --detach`,
`pnpm install --offline`), removed afterward (`git worktree remove --force`, confirmed absent from
`git worktree list`). **All 3 of the manifest's 3 capability-coverage rows were falsified** (every
row, since there are fewer than the 3-row minimum floor):

Before touching anything, I added my OWN hostile test file
(`apps/web/tests/checker-hostile-t023.test.tsx`, never copied from the maker) with 5 independent
cases: `reasonCounter` at `max=0`, a UTF-16 surrogate-pair (emoji) length check, a boundary check at
`max=1`, an obfuscation-resistant `SetInnerHTML`-fragment scan (catches string-concatenation bypass,
not just the literal), and a fresh XSS payload set (`<svg/onload>`, mixed-case `<ScRiPt>`,
`javascript:` URI) through the dropped-facts render path. **Green baseline: all 43 tests (38 maker +
5 mine) pass** in the copy before any falsifying edit — this proves the copy is real, per the
skill's "green must come from the copy" rule.

| Row | Falsifying edit (single-hunk, matches manifest) | RED (maker's test) | RED (my own hostile test) | Restored GREEN |
|---|---|---|---|---|
| F1 — clamp | `Math.max(0, max - used)` → `max - used` | `reasonCounter: a value longer than max ... clamps remaining at 0` failed (`remaining: -10`) | `CHECKER: reasonCounter with max=0 ...` failed | yes — 43/43 |
| F2 — atLimit boundary | `atLimit: used >= max` → `used > max` | `reasonCounter: exactly at the cap is atLimit with 0 remaining` failed | `CHECKER: reasonCounter with max=0` and `CHECKER: ... boundary at max=1` both failed | yes — 43/43 |
| F3 — dangerouslySetInnerHTML | inserted a real `dangerouslySetInnerHTML` call (via a probe function ahead of `reasonCounter`) | `T-023 (T-020 verdict note): ... never use dangerouslySetInnerHTML ...` failed | `CHECKER: no SetInnerHTML fragment anywhere ...` failed | yes — 43/43 |

Final confirmation run after all three restores: **43/43 pass, 0 fail** (own log:
`f-checker final-green.output`). Every falsifying edit was applied only to the throwaway copy;
`git diff --stat` on that copy showed no residue after each restore, and the copy was deleted at the
end. **CAPABILITY-COVERAGE: 3/3 rows reproduced** — none unverified, none surviving.

## Live-browser (Mode D) — REQUIRED (apps/web diff) — my own script, my own server, my own browser

- Dev server: `next dev --webpack --port 3163` started by me from the bound worktree
  (`VC_WEB_MODE=demo`, no `MONGODB_URL`, no Gemini — fake in-process db), PID 40804, stopped by PID
  after the run.
- Test lock held for the whole browser session (mkdir-based lock, acquired and released around the
  session as instructed).
- Driven with the Playwright MCP tools directly (browser_navigate / browser_type / browser_evaluate /
  browser_find / browser_console_messages / browser_take_screenshot) — a script I wrote myself, never
  the maker's `demo/browser-evidence.ts`.
- Verified, independently:
  - the counter renders immediately on selecting Reject (`Characters left 0/500`);
  - a **fresh hostile payload** of my own
    (`<img src=x onerror="window.__checkerPwned=true"><script>window.__checkerPwned2=true</script>`)
    typed into the real input never executes (`window.__checkerPwned`/`__checkerPwned2` both `false`),
    creates **zero** `<script>`/`<img>` elements inside the article, and is held verbatim as the
    input's `value` — confirmed via `browser_evaluate` reading the live DOM, not a screenshot;
  - at exactly 500/500 the counter shows `500/500 · Limit reached`, `aria-describedby` on the input
    resolves to the counter's own `id`, `aria-live="polite"`, `data-at-limit="true"` — all read live
    from the DOM;
  - one character back under the cap (499), "Limit reached" disappears again;
  - **zero console errors or warnings** at every checkpoint (`browser_console_messages`, `all: true`);
  - persona walk (**jaipur-counsellor**, the exact persona that raised ISS-t-020-c0-1, B17): walked
    the fixed flow, no finding at `high` or above — see
    `qa/evidence/browser-t-023-reject-reason-counter-c0-checker/persona-walk-jaipur-counsellor.md`.
- Evidence: `qa/evidence/browser-t-023-reject-reason-counter-c0-checker/` (`report.json`,
  `01-limit-reached-500.png`, `persona-walk-jaipur-counsellor.md`), committed alongside this verdict.

**LIVE-BROWSER: qa/evidence/browser-t-023-reject-reason-counter-c0-checker/**

## Findings

One low-severity, non-blocking finding, filed to the ledger:

- **ISS-t-023-c0-1** (low): the manifest carries no `Persona walk:` field (the 2026-09-26 cost-gate
  line). Per the checker skill's own rule ("a newer one without the field gets a low-severity
  finding"), this does not block PASS, and I ran the relevant persona walk myself anyway (see above),
  since it is the persona that originated the defect this unit fixes.

ISS-t-020-c0-1 (the defect this unit fixes) is flipped `open → fixed` with a real
`regression_check` (`pnpm -r test -- apps/web/tests/ui.test.tsx`, a verbatim adapter command plus the
test-file argument).

## Scorecard

- Criteria: this is a follow-up unit against an open issue and a verdict note, not a frozen `[C*]`
  contract clause; both the issue fix and the verdict-note invariant (no `dangerouslySetInnerHTML`,
  stored reason never becomes markup) are evidenced above.
- Invariants: B1 (no-script labels — "Characters left" / "Limit reached" are short, plain labels,
  not sentences), B8/B11/B13 (offline, no secrets, no real data) — all clean on inspection of the
  diff and the test run.
- No unexplained scope creep, no deletions, no touched files outside the manifest's list.

## VERDICT: PASS

```
VERDICT: PASS
SCOREBOARD: 2/2 criteria met (ISS-t-020-c0-1 fix; T-020 verdict-note XSS invariant), 3/3 invariants hold (B1 no-script, no dangerouslySetInnerHTML, offline/no-secrets)
FAILURES: none
CAPABILITY-COVERAGE: 3/3 rows reproduced (checker's own throwaway worktree, own hostile tests added, RED-before/GREEN-after confirmed for all 3)
LIVE-BROWSER: qa/evidence/browser-t-023-reject-reason-counter-c0-checker/
ISSUES-WRITTEN: ISS-t-023-c0-1 (low, manifest missing Persona walk field, non-blocking)
EXECUTOR: claude-sonnet-subagent (maker build subagent) (checker: claude-opus-subagent, fresh, self != executor)
EXPLANATION: Fresh typecheck/test/contracts re-runs match the manifest exactly. All 3 capability-coverage rows were independently falsified in a throwaway worktree using the checker's own hostile tests (not copied from the maker), with green-before/red-after/green-restored on every row. Mode D live browser (own script, own server, own hostile payload) confirms the counter, the accessibility wiring, and the XSS-safety claim live in the DOM with zero console errors, plus a clean jaipur-counsellor persona walk. One low-severity, non-blocking finding filed for a missing manifest field.
```
