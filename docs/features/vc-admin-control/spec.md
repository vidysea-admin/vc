# Spec — vc-admin-control (2026-10-26)
Serves: docs/features/vc-admin-control/intent.md outcomes 1-8. Facts: qa/evidence/vc-admin-20261026/fact-F{1,2,3}.md.
Audience: internal-tool (admin console) + external-ui (widget). Gate answers: qa/gates/vc-admin-control.md.

## User types and navigation
| User type | Flow | Steps to goal |
|---|---|---|
| Super-admin | `/admin/login` → Dashboard → Admins (create admin, set role) / Sources (secrets) | 3 |
| Admin | login → Sites (add site + origins) → Keys (create, copy once, rotate, revoke) → Sources (add GitHub/Postgres, Test, Sync) → Dashboard | 3-4 |
| Viewer | login → Dashboard (read-only lists; write buttons hidden, API returns 403) | 2 |
| Pathlynks student | host page → VC logo → floater opens (Chat) → asks "what careers did I save?" → answer from own rows; toggles to Voice | 2 |
| Vidysea visitor (anon) | host page → logo → floater → general answers only; no "about me" data | 2 |
Negative paths: wrong password (generic error, rate-limited 5/min/IP); expired JWT → back to login; viewer write → 403; revoked key → widget 401 card;
student asks about another student → refused; Postgres down → "I can't see your Pathlynks data right now", answer continues without it.

## Fixed interfaces (builders code to these exactly)

### S1 Config — `config/sources.json` + `packages/schemas/src/sources.ts`
```ts
SourceConfig = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("github"), id: z.string(), owner: z.string(), repo: z.string(), branch: z.string(),
             service: z.enum(["frontend","auth","school","career","other"]), tokenRef: z.string().optional() }).strict(),
  z.object({ kind: z.literal("postgres"), id: z.string(), host: z.string(), port: z.number().int(), database: z.string(),
             user: z.string(), sslmode: z.enum(["require","verify-full"]), passwordRef: z.string(),
             tables: z.array(z.string()).min(1) }).strict() ])
SourcesFile = z.object({ version: z.literal(1), siteId: z.string(), sources: z.array(SourceConfig) }).strict()
loadSourcesFile(path): SourcesFile   // throws on any value that looks like a secret (no field named password/secret/token holding a value)
```
`*Ref` fields hold env NAMES only (`PATHLYNKS_DB_PASSWORD`, `GITHUB_TOKEN`). `.env.example` lists names only.

### S2 Admin store — `packages/db/src/admin-store.ts`
Collections (all in COLLECTION_NAMES, INDEX_PLAN, ERASURE_EXEMPT with reason, no TTL):
`admin_users {_id, email(unique lower), passwordHash, role: super-admin|admin|viewer, disabled, createdAt}` ·
`sources {_id=id, siteId, kind, config(non-secret), secretEnc?: {iv,tag,ct}, lastSync?: {at,status,counts}}` ·
`source_artifacts {_id, sourceId, kind: schema_map|nav_catalogue, data, builtAt}` ·
`audit_log {_id, at, actorId, action, target, ok}` (append-only) ·
`turn_usage {_id, at, siteId, studentKey(hmac), mode: chat|voice, inputTokens, outputTokens, costUsd, latencyMs, guardrail?: string, answered: boolean}` (NO message text).
```ts
createAdminStore(db): { users: {create,findByEmail,list,setRole,disable}, sources: {upsert,get,list,setSecret,recordSync},
  artifacts: {put,getLatest}, audit: {append,list}, usage: {record} }
encryptSecret(plain, key32): {iv,tag,ct} ; decryptSecret(enc, key32): string   // AES-256-GCM, key from VC_ADMIN_MASTER_KEY (base64 32 bytes)
aggregateMetrics(db, {from,to,siteId?}): { perSiteDay: [{siteId,day,conversations}], activeStudents, chatVsVoice: {chat,voice},
  tokens, costUsd, costPerStudentInr, latencyP50, latencyP95, guardrailHits, unanswered }
```

### S3 Admin auth + API — `apps/api/src/admin-auth.ts`, `apps/api/src/admin-routes.ts`
- Password: scrypt (N=2^15, r=8, p=1, 16-byte salt), constant-time compare. JWT HS256 with `VC_ADMIN_JWT_SECRET`, 8 h, claims `{sub, role, typ:"vc-admin"}`.
  A token without `typ:"vc-admin"` is refused (voice tickets cannot be replayed). Login rate limit 5/min/IP.
- Mounted by `withAdminRoutes(...)` in the index.ts:852 wrapper chain. All routes under `/admin/api/`:
  `POST login` · `GET me` · `GET|POST admins` (super-admin) · `GET|POST sites`, `PATCH sites/:id` (name, origins), `POST sites/:id/keys/rotate`, `POST sites/:id/revoke`, `POST sites/:id/unrevoke`
  (reuse partners.ts: addPartner/rotatePartner/revokePartner/listPartners + new `updatePartner`, `unrevokePartner`) ·
  `GET|POST sources`, `PUT sources/:id/secret` (super-admin), `POST sources/:id/test`, `POST sources/:id/sync` · `GET metrics?from&to&siteId` · `GET audit`.
- Role matrix: viewer = GET only; admin = all except admins + secrets; super-admin = all. Every non-GET writes audit_log (ok true/false).
- Secrets are never returned by any route (only `hasSecret: boolean`). Created API keys are returned once.
- CLI: `pnpm -C apps/api admin create <email> --role super-admin` reads the password from a TTY prompt, never argv.

### S4 Ingest — `packages/engine/src/ingest/{migrations,routes,github}.ts`
```ts
parseSequelizeMigrations(files: {path,content}[]): SchemaMap   // {tables: {[name]: {columns: {[col]: {type, allowNull?}}, sourceFiles}}}; applies createTable, addColumn, removeColumn, renameColumn, dropTable in filename order
parseNextAppRoutes(paths: string[]): NavCatalogue             // {routes: [{path:"/careers/[id]", group:"(admin)", file}]}; strips route groups from the URL, keeps them as metadata; ignores api/ and _private
fetchRepoFiles(port: GithubPort, src, globs): Promise<{path,content}[]>  // GithubPort = {listTree(owner,repo,branch), getBlob(owner,repo,sha)}; fake in tests
```
Sync = fetch → parse → `artifacts.put` → `sources.recordSync`. Nothing from GitHub is read at chat time.

### S5 Pathlynks port — `mcp/pathlynks` (server + `createPathlynksPort`)
```ts
PathlynksPort = { getStudentProfile(studentId), getSavedCareers(studentId), getCompareList(studentId), getAssessmentStatus(studentId) }
```
Parameterised SQL only, every query `WHERE student_id = $1` from the verified identity, `statement_timeout=3000`, row cap 50, SELECT only.
On connect: refuse if `has_table_privilege(current_user, t, 'INSERT')` is true for any configured table (fails closed; gate G1).
Tests use a fake `pg` client; no live connection until G1+G2 are answered.

### S6 Engine tools + skill
New STUDENT_TOOLS rows `pathlynks_profile`, `pathlynks_saved_careers`, `pathlynks_compare`, `pathlynks_assessment`, `navigate_steps`,
wired through StudentGraphDeps (graph.ts:289) and ChatApiDeps (chat.ts:229) like rank_options; vc-capabilities SKILL.md table updated to match.
`skills/vc-navigation/SKILL.md` + `navigateSteps(catalogue, intent) → {steps: string[], routes: string[]}` (ordered, ≤ 7 steps, only routes present in the catalogue; unknown → "I don't know that page yet").
Crisis path unchanged: crisisGuard runs before any tool.

### S7 Widget — `apps/widget/src/vc-widget.js` (VERSION → "1.1.0")
Floater: drag by header (pointer events, clamped to viewport), resize from the corner (min 300×380), pop-out (opens `/vc-popout?site=…` in a new window),
header Chat|Voice toggle (Voice hidden when voice unavailable), one shared in-memory history across modes, no storage (stays true to :7).
Existing key/proxy modes, crisis block and 401/429 handling unchanged.

### S8 Admin UI — `apps/web/src/app/admin/**`
Pages: login, dashboard, sites, keys (inside sites/[id]), sources, admins, audit. JWT kept in memory + httpOnly cookie set by a Next route handler;
plain CSS, en labels. The dashboard renders S2 aggregateMetrics, cost per student vs ₹50.

## Non-goals
Google SSO; Videshi source (G3, later, no code change); live Pathlynks connection before G1/G2; the Pathlynks embed (A11, their repo).
