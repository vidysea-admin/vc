/**
 * T8 live population (tf-t8-product-db-kg). Runs the REAL admin sync route (apps/api/src/admin-routes.ts syncGithubSource) for `vidysea-frontend` and
 * `vidysea-backend` against the live GitHub repos, on an in-memory store (no admin login is forged: the test fixture world signs its own token), then
 * copies the two resulting artifacts into the `virtual_counsellor` source_artifacts collection and checks them against the inventory.
 *
 * Run (from the repo root):  node --env-file=.env --import tsx qa/evidence/tool-first/t8-live-sync.ts <dbcols.json> <out.json>
 * <dbcols.json> = one read-only information_schema.columns result (table -> column -> {type, nullable}); names and types only.
 * Prints counts and names only: never a token, a secret or a row.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connectFromEnv, createAdminStore } from "../../../packages/db/src/index.js";
import { joinProductKg, type BackendKg, type FrontendKg } from "../../../packages/engine/src/index.js";
import { loadSourcesFile } from "../../../packages/schemas/src/index.js";
import { ADMIN_PATH, adminWorld } from "../../../apps/api/tests/admin-fixtures.js";
import { createGithubPort, seedSourcesFromConfig } from "../../../apps/api/src/admin-routes.js";

const env = process.env as Record<string, string | undefined>;
const token = env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is not set");
const [dbColsPath, outPath] = process.argv.slice(2);
if (!dbColsPath || !outPath) throw new Error("usage: t8-live-sync.ts <dbcols.json> <out.json>");

const seeded = loadSourcesFile(new URL("../../../config/sources.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const w = await adminWorld({ github: () => createGithubPort(token), seededSources: seeded.sources, env: { GITHUB_TOKEN: token } });
await seedSourcesFromConfig(w.store, seeded);
const admin = await w.token("admin");

const outcome: Record<string, unknown> = {};
for (const id of ["vidysea-frontend", "vidysea-backend"]) {
  const res = await w.call("POST", `${ADMIN_PATH}sources/${id}/sync`, { token: admin, body: {} });
  outcome[id] = { http: res.status, status: res.json?.status, counts: res.json?.counts, message: res.json?.message };
}
console.log(JSON.stringify(outcome));
if ((outcome["vidysea-frontend"] as { status?: string }).status !== "ok" || (outcome["vidysea-backend"] as { status?: string }).status !== "ok") process.exit(2);

// The commit sha for the provenance (the tree listing exposes the tree sha only): one read-only GET per repo.
async function commitOf(owner: string, repo: string, branch: string): Promise<string | undefined> {
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, { headers: { accept: "application/vnd.github+json", "user-agent": "vc-t8", authorization: `Bearer ${token}` } });
  if (!r.ok) return undefined;
  return ((await r.json()) as { sha?: string }).sha;
}

const fe = (await w.store.artifacts.getLatest("vidysea-frontend", "nav_catalogue"))!;
const be = (await w.store.artifacts.getLatest("vidysea-backend", "schema_map"))!;
const feKg = fe.data.kg as FrontendKg;
const beKg = be.data.kg as BackendKg;
for (const kg of [feKg, beKg]) {
  const c = await commitOf(kg.source.owner, kg.source.repo, kg.source.branch);
  if (c) kg.source.commit = c;
}

// Write to the real virtual_counsellor store (source_artifacts only).
const { client, db } = connectFromEnv(env);
try {
  const real = createAdminStore(db, { masterKey: env.VC_ADMIN_MASTER_KEY! });
  const feDoc = await real.artifacts.put({ sourceId: "vidysea-frontend", kind: "nav_catalogue", data: fe.data });
  const beDoc = await real.artifacts.put({ sourceId: "vidysea-backend", kind: "schema_map", data: be.data });
  const feBack = (await real.artifacts.getLatest("vidysea-frontend", "nav_catalogue"))!;
  const beBack = (await real.artifacts.getLatest("vidysea-backend", "schema_map"))!;
  console.log(JSON.stringify({ stored: [feDoc._id, beDoc._id], readBack: [feBack._id === feDoc._id, beBack._id === beDoc._id], bytes: [JSON.stringify(feBack.data).length, JSON.stringify(beBack.data).length] }));
  var joined = joinProductKg(feBack.data.kg as FrontendKg, beBack.data.kg as BackendKg);
} finally {
  await client.close();
}

// ---- diff against the inventory (qa/evidence/t057/tool-first-inventory.md section 1; row -> tools and the "Tables written" column)
const INV: { row: number; name: string; tools: string[]; tables: string[] }[] = [
  { row: 1, name: "University Explorer", tools: ["section:market"], tables: ["open_search_history"] },
  { row: 2, name: "University Search", tools: ["route:/search"], tables: ["open_search_history"] },
  { row: 3, name: "AI Finder and Recommendations", tools: ["route:/ai-university-finder-study-abroad", "route:/student/recommendation"], tables: ["student_preference_snapshots", "user_preferences", "recommendation_feedback", "recommendation_ratings"] },
  { row: 4, name: "Country guides", tools: ["route:/country/[slug]"], tables: [] },
  { row: 5, name: "Favourites", tools: ["section:favourites"], tables: ["user_favourites"] },
  { row: 6, name: "Shortlist", tools: ["section:shortlisted"], tables: ["student_shortlisted_courses", "student_shortlist_versions", "audit_logs", "wallet_ledger"] },
  { row: 7, name: "Compare", tools: ["section:compare", "section:comparisons", "route:/course-compare", "route:/college-compare"], tables: ["student_compare_snapshot"] },
  { row: 8, name: "Test Requirements", tools: ["section:testreq"], tables: ["student_test_scores", "student_test_attempts", "milestone_test_details"] },
  { row: 9, name: "Journey Map", tools: ["section:journey"], tables: ["user_course_journey_map", "journey_phases", "milestones", "milestone_updates", "milestone_date_changes", "student_journey_buffer", "applications", "application_timeline"] },
  { row: 10, name: "Applications hub", tools: ["section:applications", "section:myservices"], tables: ["applications", "application_timeline", "student_shortlisted_courses", "wallet_ledger"] },
  { row: 11, name: "Visa", tools: ["section:visa"], tables: ["visa_applications"] },
  { row: 12, name: "Scholarships", tools: ["section:scholarships", "section:schpipeline"], tables: ["saved_scholarships"] },
  { row: 13, name: "Tools Library", tools: ["section:tools"], tables: ["student_tool_results"] },
  { row: 14, name: "Document Vault", tools: ["section:documents", "section:docchecklist"], tables: ["student_documents", "document_requests", "student_doc_checklist_progress"] },
  { row: 15, name: "Profile", tools: ["section:profile", "section:profile-building", "section:basic-details", "section:source-of-fund"], tables: ["students", "student_academic_history", "student_work_experience", "fund_sources", "further_profile_assessments", "further_profile_actions"] },
  { row: 16, name: "Planning suite", tools: ["deadlines", "apptracker", "goals", "finance", "testprep", "reportcard", "lorsop", "predeparture", "journeystory"].map((k) => `section:${k}`), tables: ["student_goal", "student_budget_plan", "student_savings_entry", "student_study_log", "student_report_snapshot", "student_recommender", "student_doc_draft", "pre_departure_checklists", "student_test_prep"] },
  { row: 17, name: "My Counsellor", tools: ["section:ctasks", "section:counselor"], tables: ["expert_requests"] },
  { row: 18, name: "Platform services", tools: joined.tools.filter((t) => t.id.startsWith("route:/services/")).map((t) => t.id), tables: ["service_enquiries"] },
  { row: 19, name: "Mail Manager", tools: ["section:mail"], tables: ["notifications"] },
  { row: 20, name: "Rewards", tools: ["section:rewards"], tables: ["wallet_ledger"] },
  { row: 21, name: "Pathlynks link", tools: [], tables: ["pathlynks_student_snapshot"] },
  { row: 22, name: "Vidya AI chat", tools: ["section:ai"], tables: [] },
];
const byId = new Map(joined.tools.map((t) => [t.id, t]));
const diff = INV.map((r) => {
  const present = r.tools.filter((id) => byId.has(id));
  const missingTools = r.tools.filter((id) => !byId.has(id));
  const got = new Set(present.flatMap((id) => byId.get(id)!.writes.map((x) => x.table)));
  const want = new Set(r.tables);
  return {
    row: r.row,
    name: r.name,
    toolsExpected: r.tools.length,
    toolsPresent: present.length,
    missingTools,
    tablesExpected: r.tables.length,
    missingTables: [...want].filter((t) => !got.has(t)),
    extraTables: [...got].filter((t) => !want.has(t)),
    verifiedEdges: present.flatMap((id) => byId.get(id)!.writes.filter((x) => x.verified)).length,
    unverifiedEdges: present.flatMap((id) => byId.get(id)!.writes.filter((x) => !x.verified)).length,
  };
});

// ---- DB cross-check (information_schema names/types only vs the parsed models)
const dbCols = JSON.parse(readFileSync(dbColsPath, "utf8")) as Record<string, Record<string, { type: string; nullable: boolean }>>;
const modelTables = Object.keys(joined.tables);
const seedTables = [...new Set(beKg.toolEdges.map((e) => e.table))];
const colDiff: Record<string, { modelNotInDb: string[]; dbNotInModel: string[] }> = {};
for (const t of seedTables) {
  const m = joined.tables[t];
  const d = dbCols[t];
  if (!m || !d) continue;
  const mc = Object.keys(m.columns);
  const dc = Object.keys(d);
  const a = mc.filter((c) => !dc.includes(c));
  const b = dc.filter((c) => !mc.includes(c));
  if (a.length || b.length) colDiff[t] = { modelNotInDb: a, dbNotInModel: b };
}
const sections = joined.tools.filter((t) => t.kind === "section");
const summary = {
  frontend: { tools: joined.tools.length, sections: sections.length, withComponent: sections.filter((t) => t.component).length, sidebar: sections.filter((t) => t.sidebar).length, seeded: joined.tools.filter((t) => t.steps).length, routeTools: joined.tools.filter((t) => t.kind === "route").length, diagnostics: feKg.diagnostics.map((d) => `${d.code}: ${d.message}`), source: { ...feKg.source, files: Object.keys(feKg.source.files).length } },
  backend: { tables: modelTables.length, withOwnerKey: modelTables.filter((t) => joined.tables[t]!.ownerKey).length, writers: beKg.writers.length, toolEdges: beKg.toolEdges.length, edgesTableFound: beKg.toolEdges.filter((e) => e.tableFound).length, edgesWriterFound: beKg.toolEdges.filter((e) => e.writerFound).length, readEdges: beKg.readEdges.length, vcReadsTablesFound: beKg.readEdges.filter((e) => e.tableFound).length, dangling: joined.danglingEdges.map((e) => `${e.tool}->${e.table}`), diagnostics: beKg.diagnostics.length, source: { ...beKg.source, files: Object.keys(beKg.source.files).length } },
  db: { dbTables: Object.keys(dbCols).length, modelTables: modelTables.length, modelTablesNotInDb: modelTables.filter((t) => !dbCols[t]).length, dbTablesNotInModels: Object.keys(dbCols).filter((t) => !joined.tables[t]).length, seedTablesChecked: seedTables.length, seedTablesWithColumnDiff: Object.keys(colDiff).length, colDiff },
  inventory: { rows: INV.length, rowsAllToolsPresent: diff.filter((d) => d.missingTools.length === 0).length, rowsAllTablesCovered: diff.filter((d) => d.missingTables.length === 0).length, diff: diff.filter((d) => d.missingTools.length || d.missingTables.length || d.extraTables.length) },
  sectionsWithoutSeed: sections.filter((t) => !t.steps).map((t) => t.key),
};
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary).slice(0, 6000));
