# Build brief: w1-golive-docs (/maker build subagent, docs-lane)

**Slug:** w1-golive-docs. Follow the worktree, commit, scope and "never" rules in `qa/evidence/p1-briefs/w1-common-rules.md`. Read that file first.

This is a docs-only unit. Edit `docs/go-live-checklist.md` and nothing else. There are no tests and no TDD steps.

## Manifest

Write `qa/manifests/w1-golive-docs.md`. It must contain:
- the line `Policy-Version: proportional-verification/2026-10-19.17`
- the status line `Status: merged-no-check (docs-lane)`, as candidate text
- a list of every line you changed, each with its source

## Task

Bring `docs/go-live-checklist.md` in line with the recorded answers below. Every line you change must cite its source gate file or D-entry.

- **B13:** SIGNED 2026-10-21 by Umesh (D-109).
- **g-publish:** answered (b).
- **Nights:** answered, tele-manas-disclosed FINAL.
- **A10 voice:** owner override (D-111).
- **Clinical-safety owner:** Umesh (D-108).
- **D-112:** today's answers.

Keep these items clearly marked OPEN, each with its owner:
- KB keys
- Mongo allowlist
- domain/TLS
- Pathlynks JWT format
- env vars
- `nginx -t` / `logrotate -d` output
- Tele-MANAS test call
- Hindi text sign-off

## Return

Commit on the branch, then return `READY w1-golive-docs <sha>`.
