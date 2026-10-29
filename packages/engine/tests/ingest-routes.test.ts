// VA11: parseNextAppRoutes over a path list modelled on the Pathlynks src/app tree
// (tests/fixtures/ingest/pathlynks-app-paths.txt). Scenario: an admin syncs the frontend source and the
// repo tree listing (not file contents) is turned into the navigation catalogue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyServiceCopy, parseNextAppRoutes } from "../src/ingest/routes.js";

const here = dirname(fileURLToPath(import.meta.url));
const PATHS = readFileSync(join(here, "fixtures", "ingest", "pathlynks-app-paths.txt"), "utf8")
  .split("\n")
  .filter((l) => l.length > 0);

const R = (path: string, file: string, group?: string) => (group === undefined ? { path, file } : { path, group, file });

test("fixture tree produces exactly the expected sorted catalogue", () => {
  const got = parseNextAppRoutes(PATHS);
  assert.deepEqual(got, {
    routes: [
      R("/", "src/app/page.tsx"),
      R("/assessments/[...slug]", "src/app/(student)/assessments/[...slug]/page.tsx", "(student)"),
      R("/careers", "src/app/(student)/careers/page.tsx", "(student)"),
      R("/careers/[id]", "src/app/(student)/careers/[id]/page.tsx", "(student)"),
      R("/careers/[id]/compare", "src/app/(student)/careers/[id]/compare/page.tsx", "(student)"),
      R("/dashboard", "src/app/(admin)/dashboard/page.tsx", "(admin)"),
      R("/dashboard", "src/app/(student)/dashboard/page.tsx", "(student)"),
      R("/forgot-password", "src/app/(auth)/forgot-password/page.js", "(auth)"),
      R("/login", "src/app/(auth)/login/page.tsx", "(auth)"),
      R("/monthly", "src/app/(admin)/(reports)/monthly/page.tsx", "(admin)/(reports)"),
      R("/pricing", "src/app/(marketing)/pricing/page.tsx", "(marketing)"),
      R("/profile/[[...tab]]", "src/app/(student)/profile/[[...tab]]/page.tsx", "(student)"),
      R("/settings/notifications", "src/app/settings/notifications/page.tsx"),
      R("/signup", "src/app/(auth)/signup/page.jsx", "(auth)"),
      R("/terms", "src/app/(marketing)/(legal)/terms/page.tsx", "(marketing)/(legal)"),
      R("/users", "src/app/(admin)/users/page.ts", "(admin)"),
    ],
  });
});

test("route groups are stripped from the URL and kept as metadata; ungrouped routes carry no group key", () => {
  const { routes } = parseNextAppRoutes(["src/app/(admin)/users/page.tsx", "src/app/about/page.tsx"]);
  assert.deepEqual(routes[1], { path: "/users", group: "(admin)", file: "src/app/(admin)/users/page.tsx" });
  assert.deepEqual(routes[0], { path: "/about", file: "src/app/about/page.tsx" });
  assert.ok(!("group" in routes[0]!));
});

test("dynamic, catch-all and optional catch-all segments are kept verbatim", () => {
  const { routes } = parseNextAppRoutes([
    "src/app/a/[id]/page.tsx",
    "src/app/b/[...slug]/page.tsx",
    "src/app/c/[[...slug]]/page.tsx",
  ]);
  assert.deepEqual(routes.map((r) => r.path), ["/a/[id]", "/b/[...slug]", "/c/[[...slug]]"]);
});

test("the same URL from two groups is listed twice, each with its group", () => {
  const { routes } = parseNextAppRoutes(["src/app/(student)/dashboard/page.tsx", "src/app/(admin)/dashboard/page.tsx"]);
  assert.deepEqual(routes.map((r) => [r.path, r.group]), [
    ["/dashboard", "(admin)"],
    ["/dashboard", "(student)"],
  ]);
});

test("api trees, private folders, layout/loading/route files and parallel/intercepting slots yield nothing", () => {
  const dropped = [
    "src/app/api/health/route.ts",
    "src/app/api/webhook/page.tsx",
    "src/app/(admin)/api/export/page.tsx",
    "src/app/_components/page.tsx",
    "src/app/careers/_drafts/page.tsx",
    "src/app/layout.tsx",
    "src/app/loading.tsx",
    "src/app/error.tsx",
    "src/app/not-found.tsx",
    "src/app/x/route.ts",
    "src/app/x/template.tsx",
    "src/app/x/default.tsx",
    "src/app/@modal/page.tsx",
    "src/app/@modal/login/page.tsx",
    "src/app/x/@slot/page.tsx",
    "src/app/@modal/(.)careers/[id]/page.tsx",
    "src/app/careers/(..)photo/[id]/page.tsx",
    "src/app/feed/(...)gallery/page.tsx",
    "src/app/feed/(..)(..)deep/page.tsx",
  ];
  assert.deepEqual(parseNextAppRoutes(dropped), { routes: [] });
});

test("only page.{js,jsx,ts,tsx} under src/app counts", () => {
  const { routes } = parseNextAppRoutes([
    "src/app/ok1/page.js",
    "src/app/ok2/page.jsx",
    "src/app/ok3/page.ts",
    "src/app/ok4/page.tsx",
    "src/app/no/page.mdx",
    "src/app/no/page.d.ts",
    "src/app/no/page.test.tsx",
    "src/app/no/pagex.tsx",
    "src/app/no/mypage.tsx",
    "src/pages/legacy/page.tsx",
    "src/components/page.tsx",
    "page.tsx",
    "node_modules/pkg/src/app/page.tsx",
  ]);
  assert.deepEqual(routes.map((r) => r.path), ["/ok1", "/ok2", "/ok3", "/ok4"]);
});

test("a page nested under a non-api folder that happens to be called api is a real route", () => {
  const { routes } = parseNextAppRoutes(["src/app/docs/api/page.tsx"]);
  assert.deepEqual(routes.map((r) => r.path), ["/docs/api"]);
});

test("output is deterministic: input order and duplicates do not matter", () => {
  const a = parseNextAppRoutes(PATHS);
  const b = parseNextAppRoutes([...PATHS].reverse());
  const c = parseNextAppRoutes([...PATHS, ...PATHS]);
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

test("windows separators, leading ./ and a monorepo prefix are normalised; file keeps the repo path", () => {
  const { routes } = parseNextAppRoutes([".\\src\\app\\win\\page.tsx", "./src/app/dot/page.tsx", "apps/web/src/app/mono/page.tsx"]);
  assert.deepEqual(routes.map((r) => [r.path, r.file]), [
    ["/dot", "src/app/dot/page.tsx"],
    ["/mono", "apps/web/src/app/mono/page.tsx"],
    ["/win", "src/app/win/page.tsx"],
  ]);
});

test("hostile inputs do not throw: traversal, empty segments, non-strings, huge lists", () => {
  const { routes } = parseNextAppRoutes([
    "src/app/../../etc/page.tsx",
    "src/app/./x/page.tsx",
    "src/app//y//page.tsx",
    "",
    "   ",
    null,
    42,
    { path: "src/app/z/page.tsx" },
    "src/app/" + "a/".repeat(5000) + "page.tsx",
  ] as never);
  assert.deepEqual(routes.map((r) => r.path).filter((p) => !p.startsWith("/a/")), ["/y"]);
  const big = Array.from({ length: 50_000 }, (_, i) => `src/app/p${i}/page.tsx`);
  const t0 = performance.now();
  assert.equal(parseNextAppRoutes(big).routes.length, 50_000);
  assert.ok(performance.now() - t0 < 2000);
  assert.deepEqual(parseNextAppRoutes([]), { routes: [] });
  assert.deepEqual(parseNextAppRoutes(undefined as never), { routes: [] });
});

// T-057 services catalogue: label + summary from the next-intl messages file, attached to /services/* routes only.
const SERVICE_TREE = [
  "src/app/(public)/services/page.tsx",
  "src/app/(public)/services/study-abroad-student-loan-assistance/page.tsx",
  "src/app/(public)/services/study-visa-assistance/page.tsx",
  "src/app/(public)/services/test-preparation-to-study-abroad/page.tsx",
  "src/app/(public)/services/not-in-messages/page.tsx",
  "src/app/(public)/careers/page.tsx",
];
const MESSAGES = JSON.stringify({
  services: {
    meta: {
      loan: { title: "Student Loan Assistance | Financial Support - Vidysea", description: "Apply for further studies education loans with ease.\n Guidance on documentation. See https://evil.example/x for more" },
      visa: { title: "Study Visa Assistance | Smooth Visa Process - Vidysea", description: "Get expert assistance for your student visa application." },
      test_prep: { title: "International Test Preparation", description: 42 },
      unknown_key: { title: "Ghost | x", description: "never attached" },
    },
  },
});

test("applyServiceCopy attaches label and summary to the matching /services/* routes only", () => {
  const out = applyServiceCopy(parseNextAppRoutes(SERVICE_TREE), MESSAGES);
  const by = new Map(out.routes.map((r) => [r.path, r]));
  const loan = by.get("/services/study-abroad-student-loan-assistance")!;
  assert.equal(loan.label, "Student Loan Assistance");
  assert.match(loan.summary!, /^Apply for further studies education loans with ease\. Guidance on documentation\./);
  assert.doesNotMatch(loan.summary!, /https?:|evil\.example/);
  assert.equal(by.get("/services/study-visa-assistance")!.label, "Study Visa Assistance");
  assert.equal(by.get("/services/test-preparation-to-study-abroad")!.label, "International Test Preparation");
  assert.equal(by.get("/services/test-preparation-to-study-abroad")!.summary, undefined, "a non-string description is dropped");
  for (const p of ["/services", "/services/not-in-messages", "/careers"]) {
    assert.equal(by.get(p)!.label, undefined, p);
    assert.equal(by.get(p)!.summary, undefined, p);
  }
  assert.equal(out.routes.length, parseNextAppRoutes(SERVICE_TREE).routes.length, "no route added or removed");
});

test("applyServiceCopy is a no-op for missing, malformed or hostile messages and never mutates its input", () => {
  const base = parseNextAppRoutes(SERVICE_TREE);
  const snapshot = JSON.stringify(base);
  for (const bad of ["", "not json", "[]", "null", JSON.stringify({ services: "x" }), JSON.stringify({ services: { meta: null } }), JSON.stringify({ services: { meta: { loan: "x" } } })]) {
    assert.deepEqual(applyServiceCopy(base, bad), base, bad);
  }
  applyServiceCopy(base, MESSAGES);
  assert.equal(JSON.stringify(base), snapshot);
});

test("T-057 R2: applyServiceCopy strips e-mail addresses and bare domains from the synced copy", () => {
  const msgs = JSON.stringify({ services: { meta: { visa: { title: "Study Visa Assistance | x - Vidysea", description: "Mail help@evil.example or see daad.de/apply and ucas.com. Expert help for your visa application." } } } });
  const out = applyServiceCopy(parseNextAppRoutes(SERVICE_TREE), msgs);
  const visa = out.routes.find((r) => r.path === "/services/study-visa-assistance")!;
  assert.doesNotMatch(visa.summary!, /@|evil|daad|ucas|\.com|\.de/);
  assert.match(visa.summary!, /Expert help for your visa application\./);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// T8 (tf-t8-product-db-kg, TF-20): the StudentOS hub parsed into tool nodes, then joined to the backend half.
// ---------------------------------------------------------------------------------------------------------------------------------
import { buildFrontendKg, joinProductKg, parseStudentHub, STUDENT_HUB_FILES } from "../src/ingest/routes.js";
import { buildBackendKg } from "../src/ingest/migrations.js";

const NAV_TS = [
  'export const STUDENT_HOME = "/student/journey-details";',
  "",
  "export const STUDENT_SECTIONS = [",
  '  "dashboard", "profile", "journey", "market",',
  '  "shortlisted", "ai",',
  "] as const;",
].join("\n");
const SIDEBAR_TSX = [
  'const HUB = "/student/journey-details";',
  "const ITEMS: { key: string; icon: LucideIcon; label: string; href?: string }[] = [",
  '  { key: "dashboard", icon: LayoutGrid, label: "Dashboard" },',
  '  { key: "journey", icon: MapPin, label: "Journey Map" },',
  '  { key: "market", icon: GraduationCap, label: "University Explorer" },',
  '  { key: "shortlisted", icon: ListChecks, label: "Shortlisted <b>https://evil.example/x</b>" },',
  "];",
  "const SERVICE_LINKS: { slug: string; label: string; icon: string }[] = [",
  '  { slug: "study-visa-assistance", label: "Visa Assistance", icon: "x" },',
  "];",
].join("\n");
const OS_PATH = "src/app/student/(main)/journey-details/_components/StudentOS.tsx";
const OS_TSX = [
  "export function StudentOS() {",
  '  // case "ghost": return <Ghost />;  (a comment outside the switch)',
  "  const renderSection = () => {",
  "    switch (active) {",
  '      case "dashboard": {',
  "        return useDecisionOS ? <DecisionOSDashboard {...p} /> : <DashboardV2 {...p} />;",
  "      }",
  '      case "profile":',
  "        return <ProfileSection />;",
  '      case "journey":',
  "        return (",
  "          <><SectionBack onBack={b} /><JourneyMapSection /></>",
  "        );",
  '      case "market":',
  '        return <Suspense fallback={<div><PortalText value={"x"} /></div>}><MarketSection /></Suspense>;',
  '      case "ai":',
  "        return <VidyaAISection />;",
  "      default:",
  "        return null;",
  "    }",
  "  };",
  '  const later = "case \\"shortlisted\\": return <Wrong />";',
  "}",
].join("\n");
const hubFiles = () => [
  { path: STUDENT_HUB_FILES.navigation, content: NAV_TS },
  { path: STUDENT_HUB_FILES.sidebar, content: SIDEBAR_TSX },
  { path: OS_PATH, content: OS_TSX },
];

test("TF-20: the hub parser reads section keys, sidebar labels and the switch component, each with file:line", () => {
  const out = parseStudentHub(hubFiles());
  assert.deepEqual(out.tools.map((t) => t.key), ["dashboard", "profile", "journey", "market", "shortlisted", "ai"]);
  const journey = out.tools.find((t) => t.key === "journey")!;
  assert.equal(journey.id, "section:journey");
  assert.equal(journey.route, "/student/journey-details");
  assert.equal(journey.label, "Journey Map");
  assert.equal(journey.sidebar, true);
  assert.equal(journey.component, "JourneyMapSection");
  assert.deepEqual(journey.source, { file: OS_PATH, line: 10 });
  assert.equal(out.tools.find((t) => t.key === "market")!.component, "MarketSection");
  assert.equal(out.tools.find((t) => t.key === "dashboard")!.component, "DecisionOSDashboard");
  // a section with no switch case: a key only, flagged, never invented
  const sl = out.tools.find((t) => t.key === "shortlisted")!;
  assert.equal(sl.component, undefined);
  assert.ok(out.diagnostics.some((d) => d.code === "section_without_case" && d.message.includes("shortlisted")));
  assert.ok(!out.tools.some((t) => t.key === "ghost"), "a case in a comment or a string is not a section");
});

test("TF-20: sidebar copy is plain text (tags and URLs removed) and a sidebar key outside STUDENT_SECTIONS is a diagnostic, not a tool", () => {
  const files = hubFiles();
  files[1] = { ...files[1]!, content: SIDEBAR_TSX.replace('key: "journey"', 'key: "rogue"') };
  const out = parseStudentHub(files);
  assert.equal(out.tools.find((t) => t.key === "shortlisted")!.label, "Shortlisted");
  assert.ok(!out.tools.some((t) => t.key === "rogue"));
  assert.ok(out.diagnostics.some((d) => d.code === "sidebar_key_unknown" && d.message.includes("rogue")));
  assert.equal(out.tools.find((t) => t.key === "journey")!.sidebar, false);
});

test("TF-20: no hub files means no tools (an empty parse is the caller's signal to keep the last good graph)", () => {
  assert.deepEqual(parseStudentHub([]).tools, []);
  assert.deepEqual(parseStudentHub([{ path: STUDENT_HUB_FILES.navigation, content: "export const X = 1;" }]).tools, []);
});

const SRC = { owner: "o", repo: "r", branch: "prod", files: { "a.ts": "sha1" } };

test("TF-20: seeds add purpose and steps to the tools the repo really has; a stale seed is a diagnostic; route tools need the catalogue", () => {
  const catalogue = parseNextAppRoutes(["src/app/(public)/search/page.tsx", "src/app/student/(main)/journey-details/page.tsx"]);
  const kg = buildFrontendKg(hubFiles(), catalogue, SRC);
  const journey = kg.tools.find((t) => t.id === "section:journey")!;
  assert.ok(journey.purpose && journey.steps && journey.steps.length >= 3, "the journey seed is merged");
  assert.ok(journey.seed?.includes("tool-first-inventory.md"));
  assert.equal(kg.tools.find((t) => t.id === "section:ai")!.steps, undefined, "an unseeded section stays mechanical");
  assert.ok(kg.tools.some((t) => t.id === "route:/search" && t.auth === "public"));
  assert.ok(!kg.tools.some((t) => t.id === "route:/course-compare"), "a seeded route absent from the catalogue is not added");
  assert.ok(kg.diagnostics.some((d) => d.code === "seed_route_missing" && d.message.includes("/course-compare")));
  assert.ok(kg.diagnostics.some((d) => d.code === "seed_section_missing"), "a seed for a section the repo no longer has is flagged");
  assert.deepEqual(kg.source, SRC);
});

test("TF-20: join resolves tool -> table by tool id, flags a dangling edge, and marks the VC-readable tables", () => {
  const front = buildFrontendKg(hubFiles(), parseNextAppRoutes([]), SRC);
  const back = buildBackendKg(
    [
      {
        path: "app/models/x.py",
        content: ["class UserCourseJourneyMap(Base):", '    __tablename__ = "user_course_journey_map"', "    id = Column(UUID, primary_key=True)", '    student_id = Column(UUID, ForeignKey("students.id"), nullable=False)'].join("\n"),
      },
    ],
    [],
    { vcReadTables: ["user_course_journey_map"], source: SRC },
  );
  const joined = joinProductKg(front, back);
  const journey = joined.tools.find((t) => t.id === "section:journey")!;
  assert.deepEqual(journey.writes.map((w) => [w.table, w.owner, w.verified]), [["user_course_journey_map", "student_id", false]]);
  assert.equal(joined.tables["user_course_journey_map"]!.vcReads, true);
  assert.ok(joined.danglingEdges.some((e) => e.table === "milestones"), "a seeded table the models do not define is dangling");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// kg-fix-1: keep-last-good guard (a pure helper; the sync route calls it).
// ---------------------------------------------------------------------------------------------------------------------------------
import { shouldKeepLastGood } from "../src/ingest/routes.js";

const toolsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));
const tablesOf = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, {}]));

test("kg-fix-1: shouldKeepLastGood keeps the old graph on an empty graph, a >30% shrink in tools or tables, or any skipped file", () => {
  assert.deepEqual(shouldKeepLastGood({ tools: toolsOf(50) }, { tools: toolsOf(50) }), { keep: false, reasons: [] });
  assert.deepEqual(shouldKeepLastGood({ tools: toolsOf(50) }, { tools: toolsOf(35) }), { keep: false, reasons: [] }, "exactly 30% is not over the limit");
  assert.deepEqual(shouldKeepLastGood({ tools: toolsOf(50) }, { tools: toolsOf(34) }), { keep: true, reasons: ["tools_shrank"] });
  assert.deepEqual(shouldKeepLastGood({ tables: tablesOf(294) }, { tables: tablesOf(150) }), { keep: true, reasons: ["tables_shrank"] });
  assert.deepEqual(shouldKeepLastGood({ tables: tablesOf(294) }, { tables: tablesOf(0) }), { keep: true, reasons: ["empty_graph", "tables_shrank"] });
  assert.deepEqual(shouldKeepLastGood({ tools: toolsOf(5) }, { tools: [] }).reasons, ["empty_graph", "tools_shrank"]);
  assert.deepEqual(shouldKeepLastGood({ tables: tablesOf(10) }, { tables: tablesOf(10) }, { skipped: 2 }), { keep: true, reasons: ["skipped_files"] });
  assert.deepEqual(shouldKeepLastGood({ tables: tablesOf(10) }, { tables: tablesOf(10), skipped: 1 }), { keep: true, reasons: ["skipped_files"] });
  assert.deepEqual(shouldKeepLastGood({ tables: tablesOf(10) }, null), { keep: true, reasons: ["no_graph"] });
  assert.deepEqual(shouldKeepLastGood({ tools: toolsOf(5) }, {}).reasons, ["empty_graph", "tools_shrank"], "a graph with neither tools nor tables is empty");
  assert.equal(shouldKeepLastGood({ tools: toolsOf(10) }, { tools: toolsOf(14) }, { maxShrink: 0.1 }).keep, false, "growth is never a shrink");
});

test("kg-fix-1: with no previous graph there is nothing to keep, except that an empty graph is never stored", () => {
  assert.deepEqual(shouldKeepLastGood(undefined, { tools: toolsOf(3), skipped: 4 }), { keep: false, reasons: ["skipped_files"] });
  assert.deepEqual(shouldKeepLastGood(null, { tools: [] }), { keep: true, reasons: ["empty_graph"] });
  assert.deepEqual(shouldKeepLastGood(undefined, { tables: tablesOf(2) }), { keep: false, reasons: [] });
});

test("kg-fix-1: the join treats a stored edge as verified by verifiedBy, and falls back to writerFound on an artifact stored before kg-fix-1", () => {
  const front = buildFrontendKg(hubFiles(), parseNextAppRoutes([]), SRC);
  const back = buildBackendKg([{ path: "app/models/x.py", content: ["class Milestone(Base):", '    __tablename__ = "milestones"', "    student_id = Column(UUID)"].join("\n") }], [], { vcReadTables: [], source: SRC });
  const edge = back.toolEdges.find((e) => e.table === "milestones")!;
  const legacy = { ...back, toolEdges: back.toolEdges.map((e) => ({ ...e, ...(e === edge ? { writerFound: true } : {}), verifiedBy: undefined })) };
  const verifiedOf = (b: typeof back) => joinProductKg(front, b).tools.find((t) => t.id === "section:journey")!.writes.find((w) => w.table === "milestones")!;
  assert.equal(verifiedOf(back).verified, false);
  assert.equal(verifiedOf(back).verifiedBy, "none");
  assert.equal(verifiedOf(legacy as typeof back).verified, true, "legacy artifact: writerFound decides");
  const viaService = { ...back, toolEdges: back.toolEdges.map((e) => (e === edge ? { ...e, verifiedBy: "service" as const, writerFound: true } : e)) };
  assert.deepEqual([verifiedOf(viaService).verified, verifiedOf(viaService).verifiedBy], [true, "service"]);
  // tf-fix-2: a model-only edge is NOT verified; it is flagged definedInModel instead (also when a stored artifact claims writerFound).
  const viaModel = { ...back, toolEdges: back.toolEdges.map((e) => (e === edge ? { ...e, verifiedBy: "model" as const, writerFound: true } : e)) };
  assert.deepEqual([verifiedOf(viaModel).verified, verifiedOf(viaModel).verifiedBy, verifiedOf(viaModel).definedInModel], [false, "model", true]);
  assert.deepEqual([verifiedOf(viaService).definedInModel, verifiedOf(back).definedInModel], [false, false]);
});

test("checker-final: parseStudentHub is linear on a hostile navigation file (120k unique keys)", () => {
  const files = hubFiles();
  const keysLines = Array.from({ length: 20000 }, (_, i) => Array.from({ length: 6 }, (_, j) => `"k${i}x${j}",`).join(" "));
  files[0] = { ...files[0]!, content: `export const STUDENT_SECTIONS = [\n${keysLines.join("\n")}\n] as const;\n` };
  const t0 = performance.now();
  parseStudentHub(files);
  assert.ok(performance.now() - t0 < 2000, `took ${Math.round(performance.now() - t0)} ms`);
});
