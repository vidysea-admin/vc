# Langfuse (self-hosted) — T-004

Self-hosted observability for the counselling engine's LangGraph runs (D-004, ARCHITECTURE.md H4
and §5, `umesh/operating-brain/wiki/patterns/agentic-architecture-standard.md` rule 5).

## MUSTs (non-negotiable — see docker-compose.yml comments)

1. `TELEMETRY_ENABLED=false` on **every** Langfuse container (web and worker). Langfuse OSS
   defaults this to `true` and reports aggregated usage counts (project/trace/score counts, SDK
   version, user email domains) to PostHog otherwise. No raw traces or prompts are ever sent even
   when this is `true`, but the standard requires it off regardless.
2. **OSS edition only.** No `LANGFUSE_EE_LICENSE_KEY` anywhere in this stack. Enterprise
   self-hosted telemetry cannot be disabled at all — that's why we never add a license key.
3. **Never Langfuse Cloud.** This stack always runs on our own infrastructure
   (`http://localhost:3000` in dev). Never point `LANGFUSE_BASE_URL` (or `NEXTAUTH_URL`) at
   `cloud.langfuse.com`, `us.cloud.langfuse.com`, `eu.cloud.langfuse.com`, `jp.cloud.langfuse.com`
   or `hipaa.cloud.langfuse.com` — traces carry full prompts and student transcripts, and a hosted
   tracer counts as an external service under the hard boundary ("student data never goes to an
   external service without per-use approval"). `packages/observability`'s `loadTracingConfig()`
   refuses those hosts in code as a second, independent guard.
4. **127.0.0.1 only.** Every port this compose file publishes is bound to `127.0.0.1`. This is a
   local dev/CI stack; it is never exposed to the network and is never a substitute for a real
   deploy.

## Start / stop

```bash
cd infra/langfuse
cp .env.example .env        # then fill in every CHANGE_ME (see .env.example header for openssl commands)
docker compose up -d        # first boot pulls 6 images and runs Postgres/ClickHouse migrations
docker compose logs -f langfuse-web   # watch until "ready" / the web UI answers on :3000
docker compose down          # stop (add -v to also drop the named volumes / all data)
```

Validate the compose file without starting anything (what the T-004 manifest's VERIFY step runs):

```bash
docker compose -f infra/langfuse/docker-compose.yml config --quiet
```

Once running, open `http://localhost:3000`, sign up (or use the `LANGFUSE_INIT_*` auto-provisioned
account from `.env` if you set those), create a project, and copy its API keys into
`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` in `.env` (or wherever the app
that imports `@vc/observability` reads its own env from) — see
`../../packages/observability/README.md` for the one-line wiring into a LangGraph graph, which
lands for real in T-007.

## Why these 6 services

`langfuse-web` (UI + ingestion API) and `langfuse-worker` (async trace processing) need Postgres
(config/metadata), ClickHouse (trace/observation storage), Redis (job queue), and S3-compatible
object storage (MinIO here, for media/event blobs) — the standard architecture for Langfuse v3/v4
self-hosting. Source: https://langfuse.com/self-hosting/docker-compose ·
https://github.com/langfuse/langfuse/blob/main/docker-compose.yml (fetched 2026-09-25; the live
file ships `langfuse/langfuse-worker:4` / `langfuse/langfuse:4` images — there is no `v3` tag any
more, so this compose pins to `:4`, the current stable line) · telemetry:
https://langfuse.com/self-hosting/security/telemetry · full env var reference (this file is a
curated subset — add a var from there if a feature needs it):
https://langfuse.com/self-hosting/configuration
