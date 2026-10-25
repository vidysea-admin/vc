# Manifest - b15-rev2-note
**Contract:** brief qa/evidence/p2-briefs/b15-rev2-docs.md (docs-lane; ISS-t-029-rev-2)
**Date:** 2026-10-25
**Executor:** claude-sonnet-5-5 (maker build subagent), worktree D:/vc/.worktrees/b15-rev2-note, branch wave/b15-rev2-note (from main 852e0e8)
Policy-Version: proportional-verification/2026-10-19.17
Tier: docs-lane (one documentation row, no code, no DB query)
Status: merged-no-check (docs-lane, merged 22e2134; maker corrected the erasure.ts cite 1587->1711 on read-through)
## What changed
- docs/go-live-checklist.md, section 5 "Still OPEN before production": one appended table row (owner Umesh) for ISS-t-029-rev-2. Legacy erasure request rows with status `failed` lack `approvedBy`; before live cutover they need re-approval or a gated migration. A migration is a production write and so a human gate; nothing runs now.
## Sources for the changed lines
- qa/issues.jsonl ISS-t-029-rev-2 (open, low): "Pre-T-029 'failed' erasure rows lack approvedBy, so executeErasure refuses them (fail-safe)"; where packages/db/src/erasure.ts:1587.
- qa/manifests/w1-erasure-outbox.md (Issues addressed list; failed outbox rows hold an erasure).
- qa/gates/erasure-failed-hold.md (exists; opened 2026-10-25, outbox failed-row hold policy; related, not the same rows).
## Not done
No DB query, no migration, no code change, no push. The brief's "erasure/B15 part" does not exist as its own section in the checklist; the section 5 OPEN table is the place that lists owner-named pre-production items, so the row went there.
