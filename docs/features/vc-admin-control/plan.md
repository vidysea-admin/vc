# Plan — vc-admin-control (2026-10-26)
Approved plan: C:/Users/Lenovo/.claude/plans/https-docs-google-com-document-d-11pekfe-ticklish-dragon.md (G0 Answered). Spec: ./spec.md.
One feature, one manifest, one check (dual: auth trigger). Builders work in `D:/vc/.worktrees/vca-<unit>` on `wave/vca-<unit>`, merged into `wave/vc-admin-control`.

## Wave 1 (parallel, disjoint files)
| Unit | Spec | files (owner) | consumes | lanes | Persona walk | criticality |
|---|---|---|---|---|---|---|
| B1 store | S1, S2 | config/sources.json, .env.example, packages/schemas/src/sources.ts (+barrel), packages/db/src/{admin-store,secrets,collections,erasure}.ts, packages/db/scripts/db-init.ts, packages/db/tests/admin-store.test.ts | — | code | skip (backend) | high |
| B3 widget | S7 | apps/widget/src/vc-widget.js, apps/widget/tests/floater.test.js, apps/widget/README.md | — | code, browser | required (student, visitor) | medium |
| B4 ingest | S4 | packages/engine/src/ingest/**, packages/engine/tests/ingest*.test.ts, fixture repos under packages/engine/tests/fixtures/ingest/ | — | code | skip | medium |
| B5 pathlynks | S5 | mcp/pathlynks/** (new package, `pg` dep), pnpm-workspace if needed | — | code | skip | high |
| B7 tools+skill | S6 | packages/engine/src/student/{graph,classify}.ts, packages/engine/src/tools/navigate.ts, skills/vc-navigation/SKILL.md, skills/vc-capabilities/SKILL.md, engine tests | S4 NavCatalogue type, S5 PathlynksPort type (code to the spec types; integrator reconciles) | code | skip | high |
| B6 admin UI | S8 | apps/web/src/app/admin/**, apps/web/src/app/api/admin-session/** | S3 HTTP API (fetch to spec) | code, browser | required (super-admin, admin, viewer) | medium |
Builders never edit `packages/engine/src/index.ts`, `apps/api/src/index.ts`, `apps/api/src/main.ts`: CORE-REQUEST lines; the integrator (B2) wires them.

## Wave 2 (after wave 1 merges)
| B2 api+integrate | S3 + wiring | apps/api/src/{admin-auth,admin-routes,admin-cli}.ts, partners.ts (updatePartner, unrevokePartner), chat.ts (turn_usage record + tool deps), index.ts, main.ts, engine index.ts exports | S2, S4, S5, S6 | code, mongo_write(virtual_counsellor fake only) | skip | critical (auth) |

## Check
Dual check (dual-trigger: auth apps/api/src/admin-auth.ts). Reviews in the same message: senior-software-engineer, data-engineer (ingest), ai-engineer (tools/skill), /aios-config-auditor not needed (no config/hook paths).
6c: full suite (.13-2 a: auth unit + dependency bump `pg`). Then push gate → ask Umesh.

## Held (not built live)
Live Pathlynks sync and live GitHub sync wait on G1/G2. Videshi (G3). Pathlynks embed (G4/A11).
