# TASKS — Vidysea AI Counselling Engine
> Stable IDs + status (open / in_progress / done / blocked). DECISIONS entries cite these IDs in **Links**.
> Plan: C:/Users/Lenovo/.claude/plans/you-are-the-maker-soft-music.md

| ID | Status | Task | Notes |
|---|---|---|---|
| T-000 | open | Backfill interview: capture the 4–6 biggest past decisions and REJECTED approaches (run /grill or /init-lab resume) | deferred by AUTO mode |
| T-001 | done | Unit 1: the 7-section plan doc (`docs/plan.md`) per goal.md, covering CEO/team/AI-tool zoom levels, 3 Mermaid diagrams, the tech map extended with D-002..D-005, milestones and FAQ | checker PASS cycle 1, verdict `748e4e4` |
| T-002 | done | Monorepo scaffold (pnpm TS: apps/api, apps/web, packages/engine, packages/schemas, packages/providers, skills/, mcp/) + Zod schemas | checker PASS `253d70d`, merged `468234d`; review Warning → T-002b |
| T-002b | open | Schema hardening: fix ISS-007..011 (package exports, type-aware isScriptLike, discriminated FactSource, datetime validity, Card.id) | from senior review of T-002; blocks T-003/T-005/T-006 |
| T-003 | open | Student Knowledge Graph collections + consent/purpose model (work DB) | depends T-002b |
| T-004 | open | Langfuse self-hosted compose + tracing wiring | depends T-002 |
| T-005 | open | Skill loader + first skills; hard-rule guards | depends T-002 |
| T-006 | open | MCP servers: student-profile, university-kb | depends T-003 |
| T-007 | open | Post-session scribe graph (transcript → facts → summary → profile diff → interrupt → approve → write) | depends T-003..T-006 |
| T-008 | open | Counsellor diff-approval UI (Next.js) | depends T-007 |
| T-009 | open | Golden-session eval set (anonymised) + scribe eval | depends T-007 |
| T-010 | open | Live cards (Widen/Challenge/Compare/Evidence) + verifier | gated on the scribe passing |
