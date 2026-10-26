// VA11: parseNextAppRoutes over a path list modelled on the Pathlynks src/app tree
// (tests/fixtures/ingest/pathlynks-app-paths.txt). Scenario: an admin syncs the frontend source and the
// repo tree listing (not file contents) is turned into the navigation catalogue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseNextAppRoutes } from "../src/ingest/routes.js";

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
