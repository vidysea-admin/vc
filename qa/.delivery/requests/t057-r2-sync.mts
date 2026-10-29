// One-off (t057-r2-restart-sync-probe): runs the REAL admin route POST /admin/api/sources/vidysea-frontend/sync in-process with the same deps index.ts builds.
// No admin user is created: findByEmail is wrapped to answer a synthetic in-memory super-admin; the token is minted in memory from VC_ADMIN_JWT_SECRET.
// Mongo access is virtual_counsellor only (connectFromEnv). Prints counts and /services/* label+summary only; no secret value.
import { connectFromEnv, createAdminStore } from "../../../packages/db/src/index.ts";
import { loadSourcesFile } from "../../../packages/schemas/src/index.ts";
import { withAdminRoutes, createGithubPort } from "../../../apps/api/src/admin-routes.ts";
import { adminJwtSecretFromEnv, signAdminToken } from "../../../apps/api/src/admin-auth.ts";
import { DEFAULT_SOURCES_FILE } from "../../../apps/api/src/index.ts";

const env = process.env as Record<string, string | undefined>;
const { client, db } = connectFromEnv(env);
try {
  const real = createAdminStore(db, { masterKey: env.VC_ADMIN_MASTER_KEY! });
  const email = "sync-probe@local.invalid";
  const store = { ...real, users: { ...real.users, findByEmail: async (e: string) => (e === email ? { email, role: "super-admin", disabled: false, createdAt: new Date(0).toISOString() } : real.users.findByEmail(e)) } } as typeof real;
  const sourcesFile = loadSourcesFile(DEFAULT_SOURCES_FILE);
  const secret = adminJwtSecretFromEnv(env)!;
  const handler = withAdminRoutes((async () => ({ status: 404, headers: {}, body: "{}" })) as never, {
    store, db: db as never, partnerStore: {} as never, jwtSecret: secret,
    github: (token) => createGithubPort(token), env, seededSources: sourcesFile.sources, defaultSiteId: sourcesFile.siteId,
    log: (l) => console.error(JSON.stringify(l)),
  });
  const { token } = await signAdminToken({ sub: email, role: "super-admin" }, secret, Date.now());
  const t0 = Date.now();
  const res = await handler({ method: "POST", url: "/admin/api/sources/vidysea-frontend/sync", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, readBody: async () => "{}" } as never);
  console.log("SYNC", res.status, `${Date.now() - t0}ms`, res.body);
  const art = await real.artifacts.getLatest("vidysea-frontend", "nav_catalogue");
  const routes = ((art?.data as { routes?: Array<{ path: string; label?: string; summary?: string }> } | undefined)?.routes) ?? [];
  console.log("ROUTES", routes.length);
  for (const r of routes.filter((x) => x.path.startsWith("/services/"))) console.log("SVC", JSON.stringify({ path: r.path, label: r.label, summary: r.summary }));
  const src = await real.sources.get("vidysea-frontend");
  console.log("SOURCE", JSON.stringify({ id: src?.id, lastSync: (src as { lastSync?: unknown } | null)?.lastSync }));
} finally {
  await client.close();
}
