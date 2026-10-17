# Skills

Per D-005, prompts and soft rules live as `SKILL.md` files under `skills/<name>/`, loaded on demand
by the graph nodes rather than hardcoded into TypeScript — this keeps prompts portable and swappable
across model providers (see ARCHITECTURE.md H5). Hard rules (no-script, citation-required,
crisis/distress, consent/purpose) stay out of skills entirely; they are deterministic code guards
that run before any LLM call (`packages/schemas/src/guards.ts` is the first of these, `isScriptLike`
for B1). Planned skill names, one per P1 graph node named in docs/plan.md §3/§5: `signal-extractor`,
`exploration-planner`, `verifier`, `profile-synthesizer`, `fit-scorer`.
