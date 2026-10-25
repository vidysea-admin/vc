# Manifest - w1-golive-docs
Policy-Version: proportional-verification/2026-10-19.17
**Unit:** w1-golive-docs (wave 1, docs-lane). Only file edited: `docs/go-live-checklist.md`. No code, no tests, no TDD steps.
**Brief:** qa/evidence/p1-briefs/w1-golive-docs.md; common rules qa/evidence/p1-briefs/w1-common-rules.md.
**Date:** 2026-10-25
**Fix cycle:** 0
**Dual check:** no (documentation only; no auth, persistence or safety code touched)
**Status:** merged-no-check (docs-lane), merged a2daf26 after maker read-through 2026-10-25

## Lines changed in docs/go-live-checklist.md (each with its source)
1. Intro paragraph (lines 3-6): states that the four G-PROD records are on disk and that sections 3 to 5 stay open with owners. Sources: `qa/gates/g-prod.md` (D-101, restated 2026-10-21), D-109, D-111.
2. Section 2 B13 item, now ticked: SIGNED 2026-10-21T18:10:00+05:30 by Umesh. Sources: D-109, `qa/gates/p1-u0-amendment-signatures.md` line 13.
3. Section 2 A10 item, now ticked via owner override: report still `Result: FAIL` (10/20), `Owner-override: 2026-10-22T09:42:10+05:30 - Umesh - D-111`. Sources: `qa/gates/a10-voice-gate.md`, D-111.
4. Section 2 g-publish item, now ticked: `Answered: 2026-10-21T15:42:38+05:30 - b`. Sources: `qa/gates/g-publish.md`, `qa/gates/golive-launch.md` Q6.
5. Section 2 Nights item, now ticked: `tele-manas-disclosed`, FINAL. Sources: `qa/gates/nights.md`, D-102.
6. Section 3 minors-before-DPDP item, split: the minors half ticked (consent team owns consent; D-102, `qa/gates/g-prod.md`); the Q3 DPDP legal-review half stays OPEN, owner Umesh (no record on disk).
7. Section 3 clinical-safety owner, ticked: Umesh (D-108 item 1).
8. Section 3 Tele-MANAS test call stays OPEN, owner Umesh: D-108 item 6 says the team did it, but no record exists on disk.
9. Section 3 rollout-order item stays OPEN, owner Umesh; note that voice is allowed by D-111 override.
10. New section 5 table of OPEN items with owners: KB keys (golive-launch Q4, g-kb Q2), Mongo allowlist (mongo-host.md), domain/TLS (D-109, golive-launch Q7), Pathlynks JWT format (counsellor-jwt-partner-tenant.md, D-112), env vars (D-108, D-109), `nginx -t` / `logrotate -d` output (section 4), Tele-MANAS test call (D-108 item 6), Hindi text sign-off (D-108 item 1).

## Acceptance
Docs-lane: no Tests[] or Pre-check[] lines apply (no criteria ids, no code). Verification run: `git diff --stat` shows only `docs/go-live-checklist.md` and this manifest; every changed line cites a gate file or D-entry above.
No lines were taken from memory: each cited gate file and D-108/D-109/D-111/D-112 were read in this worktree.
Metrics: 1 file edited, 1 manifest, 0 tests, 0 code lines.
