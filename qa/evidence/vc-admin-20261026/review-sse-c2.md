# senior-software-engineer review — vc-admin-control fix cycle 2, diff 78ddaef..6b8674c (persisted by the maker; the reviewer has no Write tool)
VERDICT: Approve (no High/Critical; 4 low).
Runs: apps/api admin-routes, admin-sync, admin-auth, admin-secrets-leak -> 122/122; apps/web admin-session-routes -> 16/16; packages/schemas sources -> 15/15.
Checked safe: boundEnvRef (admin-routes.ts:117-129) requires seeded id+kind and exact host (case-insensitive)/port/database/user/sslmode/passwordRef or owner/repo/tokenRef, returns the seeded ref; both env read sites go through it (credentialFor :460-470 used by test :690/:695 and sync :725; live port build :991-992); no seeded list -> fail closed; index.ts passes the list at :804 and :948; kind-prefix binding in credentialFor and schema (sources.ts:22-38); NoCredentialError -> fixed message; no route edits a stored source config; seeded id collision 409; github port hardcodes api.github.com with encoded segments.
Low findings:
1. session-handlers.ts:97, :180-190 LRU eviction: >10,000 fresh emails can reset a locked email's web-layer budget; API X-Real-IP limiter still applies.
2. admin-routes.ts:290-298 one audit row per API login attempt; anonymous floods fill audit_log; attempts refused by the web guard (session-handlers.ts:95/:97) never reach the API and get no row (VA6 scope question).
3. admin-routes.ts:762-767 after F4 a mostly-unparsed repo (files>0, tables>0) can replace a full schema_map with a tiny one; a ratio guard would address it.
4. seedSourcesFromConfig never updates an existing doc: editing config/sources.json host/port later denies the env credential with a "No credential is set" message (fails closed, misleading).
Open: createNavCatalogueLoader (:1038-1042) trusts any github source of the site, including admin-created ones (not a credential leak).
