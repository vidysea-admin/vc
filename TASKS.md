# TASKS — Vidysea AI Counselling Engine
> Stable IDs + status (open / in_progress / done / blocked). DECISIONS entries cite these IDs in **Links**.
> Plan: C:/Users/Lenovo/.claude/plans/you-are-the-maker-soft-music.md

| ID | Status | Task | Notes |
|---|---|---|---|
| T-000 | open | Backfill interview: capture the 4–6 biggest past decisions and REJECTED approaches (run /grill or /init-lab resume) | deferred by AUTO mode |
| T-001 | done | Unit 1: the 7-section plan doc (`docs/plan.md`) per goal.md, covering CEO/team/AI-tool zoom levels, 3 Mermaid diagrams, the tech map extended with D-002..D-005, milestones and FAQ | checker PASS cycle 1, verdict `748e4e4` |
| T-002 | done | Monorepo scaffold (pnpm TS: apps/api, apps/web, packages/engine, packages/schemas, packages/providers, skills/, mcp/) + Zod schemas | checker PASS `253d70d`, merged `468234d`; review Warning → T-002b |
| T-002b | done | Schema hardening: fix ISS-007..011 (package exports, type-aware isScriptLike, discriminated FactSource, datetime validity, Card.id) | checker PASS cycle 1 `8f9a445`, merged `1d4bf97` |
| T-003 | done | Student Knowledge Graph collections + consent/purpose model in `virtual_counsellor` (B12 DB helper, D-009) | checker PASS `a4dd339`, merged `793a327`; reviews → T-003b |
| T-003b | open | DB hardening: ISS-018..021 (vacuous consent tests, unique open-fact index + ordering, idempotent fact ids, edge indexes, deep-equal, read re-validation) | blocks T-007 (first real caller of applyApprovedDiff) |
| T-004 | done | Langfuse self-hosted compose + tracing wiring | depends T-002 |
| T-005 | done | Skill loader + first skills; hard-rule guards (no-script incl. ISS-t-002b-schema-hardening-2, citation-required, crisis) | depends T-002b |
| T-005b | open | Guard hardening: ISS-022 (skill path containment), ISS-023 (crisis Devanagari/indirect Hinglish/evasion + crisis eval set), ISS-024 (block-scalar), ISS-t-005-skills-guards-1 (Hinglish no-script, low) | from T-005 reviews; blocks T-010 |
| T-006 | open | MCP servers: student-profile, university-kb | depends T-003 |
| T-007 | open | Post-session scribe graph (transcript → facts → summary → profile diff → interrupt → approve → write) | depends T-003..T-006 |
| T-008 | open | Counsellor diff-approval UI (Next.js) | depends T-007 |
| T-009 | open | Golden-session eval set (anonymised) + scribe eval | depends T-007 |
| T-010 | open | Live cards (Widen/Challenge/Compare/Evidence) + verifier | gated on the scribe passing |
| T-011 | open | DPDP erasure + export (B15): confirm step in audit log, hard delete across all engine collections, read-back-zero verification, counts-only receipt, per-student JSON export; adds cards/feedback + audit collections | depends T-003b (studentId indexes) |
| T-012 | open | Crisis escalation (B16): async Flash-Lite concern classifier on concern turns + stratified none sample; notify admin + concerned counsellors at the same moment; grow crisis golden set with hard negatives | depends T-005b, T-007 |
