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
  Measured today: it reports **262**; the correct distinct-id count is **134**. Roughly 2x
  overstatement, every session, in the first line an agent reads.

All three are the same bug class: **counting occurrences instead of distinct entities.** The same
class just cost a full fix cycle on T-043 (ISS-092), so it is not theoretical.

## Why this needs you specifically
`.claude/hooks/*` is an enforcement path. Per this repo's CLAUDE.md and the `append_decision.ps1`
V7 check, the authorizing DECISIONS entry must carry `**Approved-by:** Umesh`, recorded only after
your own explicit confirmation. **A relay of your approval through another agent session is
explicitly not sufficient** — that was tried on 2026-09-27 and correctly refused.

## Question
Do you approve editing the three hook files to fix the three counting defects above?

**Options:**
- **(a) Approve all three.** One D-entry, one fix unit, one `/aios-config-auditor` pass before the
  commit. Recommended: the hooks are how every future session learns what is pending, and two of
  the three defects have already caused measured losses.
- **(b) Approve only ISS-054** (the invisible-worktree-manifest one, the only high). Smallest change
  to the enforcement surface; leaves the inflated issue count in place.
- **(c) Not now.** The hooks keep over-reporting issues and under-reporting pending manifests; every
  session keeps paying the ~10h-class risk on worktree manifests.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry carrying
`Approved-by: Umesh` before any hook file is touched.
