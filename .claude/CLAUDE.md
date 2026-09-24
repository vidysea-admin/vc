# PROJECT RULES — Lab Protocol active
(extends the user-global CLAUDE.md; on conflict, this file wins)

## Session start (the repo-committed hook injects this automatically; if missing, read manually)
ARCHITECTURE.md (root) → decision index from docs/DECISIONS.md (computed status) → open tasks.
Pick ONE unblocked task.

## Approver
- **Approver:** Umesh — the single named owner of PROCEED/ROLLBACK/PIVOT verdicts,
  /graduate freezes, and enforcement-path changes in THIS repo.

## Update Authorization (the core rule)
- docs/DECISIONS.md: APPEND-ONLY. The only write path is `scripts/append_decision.ps1`
  (direct Edit/Write is denied by the guard; Bash bypasses are caught by the /landplane
  additions-only audit + /compound sweep). Replacement happens only via a new entry
  with a reasoned Supersedes field (v1.1 rule 1 format). Old entries are NEVER touched;
  effective status is computed (v1.1 rule 4).
- ARCHITECTURE.md (Hypotheses §3 / Open Questions §6): the agent may update during
  /landplane ONLY for sections listed in that session's Changes-authorized field, with
  reasoning. No entry → no edit.
- ARCHITECTURE.md (Frozen §2) and contracts/: ONLY via /graduate or an approved PIVOT
  checkpoint. Never during normal landplane.
- Enforcement paths (`.claude/hooks/*`, `scripts/append_decision.ps1`,
  `.claude/settings.json`): Changes-authorized alone is NOT enough — the authorizing
  entry MUST carry `**Approved-by:** <Approver>`, recorded only after the Approver's
  explicit confirmation (F1: authorization is not approval). /landplane refuses the
  commit otherwise.
- This file (project CLAUDE.md): only via /compound with the Approver's approval.

## Definition of done
1. contracts/verify_contracts.py passes (or the project's designated validator).
2. The affected stage runs green on sample data.
3. The immediate downstream stage consumes the output without error.
Evidence (command + output) pasted, or it did not happen.

## Task tracking
Entries in TASKS.md carry a stable ID + status field
(open / in_progress / done). DECISIONS entries cross-reference those IDs in **Links**.
Never keep bare markdown TODO lists without IDs.

## Project specifics
- Sample data location: [ASSUMPTION] none yet. Anonymised counselling transcripts (e.g. D:/ikigai_counsellor/transcripts/) are candidate fixtures, read-only and copied only after anonymisation.
- Pipeline run command: [ASSUMPTION] not yet created. The first code unit (T-002) defines `pnpm test` / `pnpm typecheck`.
- Validator: contracts/verify_contracts.py (empty = PASS by vacuity).

## North star (read before any unit)
Explore → Conclude → Execute; AI assists, the human decides. It is never a script ("cheating platform"). The architecture
choices (D-002..D-005) are LangGraph.js, the Mongo knowledge graph, Langfuse self-hosted, and skills/MCP. Sibling repos
are read-only sources for ports (D-001).
