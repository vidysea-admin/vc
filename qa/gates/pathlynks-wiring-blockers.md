# HUMAN_GATE — pathlynks-wiring-blockers
Opened: 2026-11-02T18:52:38+05:30
Blocks: pathlynks-wiring-blockers (qa/QUEUE.md line 77). Evidence: qa/evidence/pr-wiring-inventory.md (899c4bb7), re-checked 2026-11-02T18:52:38+05:30 by a read-only agent: all 7 blockers STILL-OPEN, 0/4 host worktrees PR-ready.
Scope correction: the blockers live in the 4 host-repo worktrees (D:/vc/.worktrees/{vc-vidysea-backend,vc-vidysea-frontend,quest-pathlynks-backend,quest-pathlynks-frontend}), NOT in root D:/vc. Root's 329 files are T-057/quest-successor VC-side work plus qa bookkeeping (14 files are byte-identical to codex/vc-completion).

Answer format: "D1 <option>, D2 <option>, ..." or "defaults". Recommended default first.

- D1 (blocker 3): no production minter of vc_eligibility exists (D-125). Stripping the demo mint makes every student 403.
  (a) RECOMMENDED: ship the PR inert (flag off) and document the gap; the minter is a Vidysea gateway-team change. (b) build a minter in app/core/security.py in this unit. (c) the gateway team provides it before the PR.
  Also: keep age/guardian-consent gating in production? Default: yes.
- D2 (blocker 5): NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED is not a build arg. (a) RECOMMENDED: add ARG/ENV to Dockerfile and --build-arg to buildspec.yml, like the widget URL. (b) another path (name it).
- D3: D-125/D-126 demo patches. (a) RECOMMENDED: keep them as a local-only patch file outside git so the headed demo still works. (b) discard them.
- D4 (blocker 7): quest-pathlynks-frontend tracks a .env (pre-existing, not opened). (a) RECOMMENDED: separate security unit; Umesh checks whether it holds credentials and rotates them. (b) git rm --cached it in this PR.
- D5: scope and owner. (a) RECOMMENDED: scope = the 4 host worktrees, work in a new codex/pw-wiring-prep worktree per host repo, nothing pushed; opening/pushing any PR needs a separate go from Umesh. Verification runs that spawn local Postgres or Chrome are included. (b) other.
