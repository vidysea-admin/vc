# Fact pass — feature vc-admin-control (2026-10-26)

Feature (approved by Umesh 2026-10-26, plan C:/Users/Lenovo/.claude/plans/https-docs-google-com-document-d-11pekfe-ticklish-dragon.md):
an Admin Console for the VC service (admin login + roles, register host sites, API-key management, a "knowledge sources"
registry where admins add GitHub repos and DB connections then trigger ingestion, connectivity config, guardrail config,
tracking dashboard), plus Pathlynks read-only Postgres tools, a navigation catalogue built from the Pathlynks repos,
and a widget floater (drag/resize/pop-out + Chat|Voice header toggle). It EXTENDS the finished partner-chatbot feature
(docs/features/partner-chatbot/*, qa/contracts/partner-chatbot.md) — edit in place, never duplicate.

READ-ONLY. Do not edit any file except your own output file. Report facts with file:line, no opinions beyond a short
"integration point" note per item. Output <= 120 lines.

## F1 — apps/api  (output: qa/evidence/vc-admin-20261026/fact-F1.md)
1. Server framework, route registration pattern (file:line), how a new route module is mounted (index.ts/server.ts/main.ts).
2. partners.ts: the partner registry — storage (Mongo collection name + document shape), key format/hash, CLI entry
   (`pnpm -C apps/api partner add|rotate|revoke|list`), origin lock, rate limit. Exported functions we can reuse from an admin API.
3. auth.ts: what it verifies; WHO issues counsellor/admin JWTs today (is there any login/issuer in the repo? grep `SignJWT`,
   `login`, `password`, `argon`, `bcrypt`). Roles. Env names.
4. chat.ts / voice.ts / anonymous.ts: K3 server-to-server student chat — how student identity arrives (headers), what the
   chat turn calls into in packages/engine, where tools would be injected.
5. Test runner + test file pattern (node:test? tsx?), commands to run one api test file. Typecheck command.
6. go-live-gate.ts purpose (one line).

## F2 — apps/web + packages/db + packages/observability + packages/schemas  (output: fact-F2.md)
1. apps/web: framework/version (Next.js app router?), route tree (src/app/**/page.tsx list), existing auth/login for
   counsellors (how a counsellor gets a JWT), UI library/styling, i18n, how it calls the API (base URL env), test/run cmds.
   Is there any admin page already?
2. packages/db: Mongo client creation (file:line), `virtual_counsellor` collections defined (names), index creation
   pattern, any encryption helper (grep `createCipheriv`, `aes`, `encrypt`), TTL/erasure conventions every new
   collection must follow (there is a db-init test scanning collections — find it, e.g. packages/db/tests/db-init.test.ts,
   and state what a new collection must declare to pass).
3. packages/observability: Langfuse config, what is traced per chat turn (fields: tokens, cost, latency, partner/site id?),
   any existing usage/cost aggregation (VC_CHAIN_MONTHLY_CAP_USD usage), where turn records are stored.
4. packages/schemas: validation lib (zod?), file pattern, how schemas are exported.
5. Root package.json scripts, pnpm-workspace packages, tsconfig.base paths.

## F3 — apps/widget + mcp/ + packages/engine + skills/  (output: fact-F3.md)
1. apps/widget/src/vc-widget.js: structure — where the bubble, panel and header are built (line ranges), how voice.js is
   loaded and toggled (data-vc-voice), message history storage, config attributes parse function, VERSION constant.
   What changes are needed for drag/resize/pop-out and a Chat|Voice header toggle (integration points only).
2. mcp/university-kb: MCP server pattern (SDK, transport, tool registration file:line), how the engine/student graph
   consumes MCP tools (or not), test pattern.
3. packages/engine: the student chat graph (packages/engine/src/student/*): nodes, where retrieval/tools happen, how a
   new tool set (Pathlynks student profile, saved careers, compare list) and a navigation-steps skill would plug in.
   crisisGuard / guardrail location.
4. skills/: what a skill is in this repo (format, loader file:line).
5. Any existing GitHub or Postgres client code anywhere (grep `@octokit`, `api.github.com`, `pg`, `postgres` in package.json files).
