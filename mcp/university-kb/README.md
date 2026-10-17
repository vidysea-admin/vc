# @vc/mcp-university-kb

MCP server (stdio transport) exposing the University Knowledge Base tool boundary (ARCHITECTURE.md
H5/D-005 §5/§6 Q1, contract B2).

ARCHITECTURE §6 Q1 (whether the KB is seeded from scratch or from an existing Vidysea source) is an
**open question**. Until it resolves, this server serves only what is already stored in the
`virtual_counsellor` `courses` collection — no LLM calls, no web calls, no invented records. Every
returned course carries `sourceUrl` + `fetchedAt` (B2); a stored record missing either is excluded
from results and counted in `dropped`, never served uncited.

## Tools

- **`search_courses({ query, country?, level? })`** — case-insensitive substring search over course
  names, with optional country/level filters.
- **`get_course({ courseId })`** — a single course by id. Not found, or found but uncited (missing
  `sourceUrl`/`fetchedAt`), is a tool error — never a fabricated or partial record.

### KnowledgeBase tools (P1/U2; registered only when a KB client is configured)

All return a typed `status` (`ok` | `unavailable`); an outage is never a thrown tool error and never a
fabricated hit. Fixtures in `kb-fixture/` are synthetic and contract-shaped (derived from the KB route
code, not recordings of the live KB).

- **`ask_knowledge_base({ query })`** — `POST /ask` with the serve rule: `status: "answered"` only when
  `verdict == "correct"` AND `insufficient_coverage == false` AND `web_used == false` AND at least one
  internal source; otherwise `no_sourced_answer` (or `unavailable` on an outage) with the fixed text and
  no generated answer. `sources.web` never reaches a response.
- **`search_kb({ query, k? })`** — `GET /search`; each hit has inline turn text, session date, `sourceId`
  and a `sourceKind` (`internal-seminar` | `toc` | `whatsapp` | `unknown`; unknown = restricted).
- **`get_session({ sessionId })`** — `GET /sessions/:id`; 404 is `unavailable` / `not_found`.
- **`kb_gaps()`** — `GET /gaps`. **`kb_sources()`** — `GET /sources` reduced to `{ id, kind }`.
- **Anonymous profile** (`createUniversityKbServer({ kb, profile: "anonymous" })`, no Db): only
  `search_kb` and `kb_sources`; build the client with `createAnonymousKbClient` and the separate
  `VC_KB_ANON_API_KEY` (`loadAnonymousKbConfigFromEnv`).
- Source-kind lists (seminar / TOC) come from Vidysea config (`SourceKindConfigSchema`); nothing is
  listed by default.

## B13 — no student data to external models without a per-use gate

This server never touches student data itself, but any caller composing its results with student
facts before sending to an external model must still clear the per-use gate in `qa/gates/`
(contract B13) — see `mcp/student-profile/README.md`.

## Running

- `pnpm --filter @vc/mcp-university-kb typecheck`
- `pnpm --filter @vc/mcp-university-kb test` — offline, fake `Db`, no real Mongo connection, no
  `.env` read (contract B8).
- Live stdio server (not run by tests): `tsx src/bin.ts`, requires `MONGODB_URL` in the environment
  (`connectFromEnv`, contract B11/B12).
