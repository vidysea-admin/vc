# @vc/mcp-student-profile

MCP server (stdio transport) exposing the Student Profile tool boundary (ARCHITECTURE.md H5/D-005,
contracts B2/B3/B4/B6/B8/B12/B13/B14).

## Tools

- **`get_profile_facts({ studentId, purpose })`** — returns the student's current (open) facts whose
  `purposeTags` include `purpose`. Requires a recorded consent row covering that purpose
  (`@vc/db` `requireConsent`, contract B4). No consent -> a tool error, zero facts.
- **`propose_profile_diff({ studentId, candidateFacts })`** — diffs `candidateFacts` against the
  student's current active facts (`@vc/db` `proposeFactChanges`) and returns a `ProfileDiff`.
  **Writes nothing.** The only write path to the `facts` collection is the counsellor-approved graph
  step (T-007, `applyApprovedDiff`) — this server deliberately never imports or exposes it (B3).

## B13 — no student data to external models without a per-use gate

Both tools can return real student facts (goals, budget, constraints, sensitivity-tagged data). That
data reaches the MCP **caller** only. Any caller (a LangGraph node, a skill, a future orchestrator)
that forwards this data to Gemini or any other external model API must first get Umesh's per-use
approval recorded in `qa/gates/` (contract B13) — this server has no awareness of, and applies no
gate to, what its caller does downstream with the data it returns.

## Running

- `pnpm --filter @vc/mcp-student-profile typecheck`
- `pnpm --filter @vc/mcp-student-profile test` — offline, fake `Db`, no real Mongo connection, no
  `.env` read (contract B8).
- Live stdio server (not run by tests): `tsx src/bin.ts`, requires `MONGODB_URL` in the environment
  (`connectFromEnv`, contract B11/B12).
