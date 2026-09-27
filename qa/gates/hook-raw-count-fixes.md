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
