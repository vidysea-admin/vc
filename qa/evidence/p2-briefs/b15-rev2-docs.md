# Build brief: b15-rev2-note (/maker build subagent, docs-lane)
Edit only docs/go-live-checklist.md, on branch wave/b15-rev2-note in worktree D:/vc/.worktrees/b15-rev2-note (from main HEAD).

Add, under the erasure/B15 part, an OPEN ops item (owner Umesh) for ISS-t-029-rev-2: legacy erasure rows with status "failed" lack approvedBy; before live cutover they need re-approval or a gated migration (a production write = human gate; nothing runs now). Cite qa/issues.jsonl ISS-t-029-rev-2, the w1-erasure-outbox manifest, and qa/gates/erasure-failed-hold.md if present. Do not run any DB query.

Write qa/manifests/b15-rev2-note.md with `Policy-Version: proportional-verification/2026-10-19.17`, `Status: merged-no-check (docs-lane)` as candidate text, and the changed lines with their sources.

Never edit anything else; no python; no git add -A; no push. Commit by pathspec, message ending Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Return `READY b15-rev2-note <sha>`.
