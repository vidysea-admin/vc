# syntax=docker/dockerfile:1
# Virtual Counsellor API (@vc/api) for Google Cloud Run.
#
# - No compile step: the API runs its TypeScript through tsx (a runtime dependency of @vc/api).
# - The repo layout is kept (/app/apps/api, /app/packages, /app/mcp, /app/skills, /app/config, /app/qa/gates) because the
#   API reads skills/, config/sources.json and the go-live gate records in qa/gates relative to its own source.
# - Fail closed: every enabled surface (anonymous / chat / voice) checks its go-live gate record at startup and refuses to
#   start without it, naming the missing record. Surfaces are switched on only by env vars set in Cloud Run.
# - No secrets are baked in: .dockerignore drops every .env file. Secrets come from Secret Manager as env vars.
# - Cloud Run sets PORT; the API reads VC_API_PORT, so the start command maps one onto the other.

FROM node:20.18.1-bookworm-slim AS deps
WORKDIR /app
# pnpm via npm, pinned to package.json "packageManager": corepack in this Node release ships expired npm signing keys.
RUN npm install -g pnpm@10.33.0 && npm cache clean --force
COPY . .
# The API and the workspace packages it depends on, production dependencies only (tsx stays: it is a runtime dependency).
RUN pnpm install --frozen-lockfile --prod --filter "@vc/api..." \
 && rm -rf /root/.local/share/pnpm /root/.cache

FROM node:20.18.1-bookworm-slim
ENV NODE_ENV=production \
    VC_BIND_HOST=0.0.0.0 \
    VC_CLIENT_IP_SOURCE=cloud-run \
    PORT=8080
WORKDIR /app
COPY --from=deps --chown=node:node /app /app
USER node
EXPOSE 8080
WORKDIR /app/apps/api
# exec: node is PID 1's direct child of sh replaced, so Cloud Run's SIGTERM reaches the API's own graceful shutdown.
CMD ["sh", "-c", "export VC_API_PORT=\"${VC_API_PORT:-${PORT:-8080}}\" && exec node --import tsx src/main.ts"]
