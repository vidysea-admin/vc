# gl-d-devops-runbook

Write the complete DevOps go-live runbook for VC, IN PLACE in docs/partner-integration.md, extending the existing "S13 release configuration" section and keeping its facts. Verify every claim against the repo (give file:line in your report, not in the doc). Numbered, executable steps:
1. Build and run the VC API: Node version (package.json engines / .nvmrc), pnpm install --frozen-lockfile, the exact start command (tsx src/main.ts today, or a compiled build if one exists: say which), port, and a minimal container recipe as a code block (the repo has no Dockerfile). Health checks GET /health and GET /ready are being added by a parallel lane; reference them.
2. Every env key the API reads: grep process.env and env loaders across apps/api, packages/*, mcp/*, cross-check .env.example. Table: key, required/optional, purpose, example shape (never a real value), secret yes/no. Flag keys read in code but missing from .env.example and vice versa.
3. Network: outbound to Mongo virtual_counsellor (and read-only pathlynks_journey on the same host), Vidysea Postgres (read-only role, TLS CA), Pathlynks RDS 5432 (allowlist the VC egress IP), Gemini API, KB host (VC_KB_BASE_URL). Inbound HTTPS only behind the reverse proxy; origins = registered partner origins.
4. Widget hosting: the immutable release directory recipe already in the section, with the exact files and the SHA256 command.
5. Admin console (apps/web): build/start commands, env, origin.
6. Partner provisioning: create the Vidysea and Pathlynks partners and keys in the admin console; the env each host backend needs; order: VC up, keys, host deploys, live walk.
7. Post-deploy checklist: /health, /ready, anonymous widget turn, logged-in turn on each host, voice and crisis on a TEST user, admin login, usage dashboard.
8. Rollback.
Concise and executable. Report the env-key mismatches you found.
