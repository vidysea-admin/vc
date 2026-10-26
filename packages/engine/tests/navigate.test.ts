/**
 * vc-admin-control VA14 (spec S6): `navigateSteps(catalogue, intent)` only ever emits routes that are in the supplied catalogue, at most 7
 * ordered text steps, never a URL, never a click. Catalogue = the shape `parseNextAppRoutes` produces (spec S4); the fixture below stands in
 * for VA11's fixture (a separate unit) with the same shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listSkills, loadSkill } from "../src/skills/loader.js";
import { NAVIGATE_UNKNOWN_TEXT, NAVIGATE_MAX_STEPS, navigateSteps, type NavCatalogue } from "../src/tools/navigate.js";
import { SKILLS_DIR } from "./student-fixtures.js";

const CATALOGUE: NavCatalogue = {
  routes: [
    { path: "/", file: "app/page.tsx" },
    { path: "/careers", group: "(main)", file: "app/(main)/careers/page.tsx" },
    { path: "/careers/saved", group: "(main)", file: "app/(main)/careers/saved/page.tsx" },
    { path: "/careers/[id]", group: "(main)", file: "app/(main)/careers/[id]/page.tsx" },
    { path: "/assessment", file: "app/assessment/page.tsx" },
    { path: "/assessment/results", file: "app/assessment/results/page.tsx" },
    { path: "/profile", file: "app/profile/page.tsx" },
    { path: "/profile/settings", file: "app/profile/settings/page.tsx" },
    { path: "/compare", file: "app/compare/page.tsx" },
  ],
};
const CATALOGUE_PATHS = new Set(CATALOGUE.routes.map((r) => r.path));

test("VA14: the skill exists, has single-line frontmatter and loads through the existing loader", () => {
  const meta = listSkills(SKILLS_DIR).find((s) => s.name === "vc-navigation");
  assert.ok(meta, "skills/vc-navigation/SKILL.md must be listed");
  assert.ok(meta.description.length > 0);
  const body = loadSkill(SKILLS_DIR, "vc-navigation");
  assert.match(body, /navigate_steps/);
  const raw = readFileSync(join(SKILLS_DIR, "vc-navigation", "SKILL.md"), "utf8");
  const front = raw.split("---")[1]!;
  assert.ok(/^name: vc-navigation\s*$/m.test(front) && /^description: \S.*$/m.test(front), "single-line name/description");
});

test("VA14: a known intent gives ordered steps ending at the page, every route from the catalogue", () => {
  const out = navigateSteps(CATALOGUE, "where do I see my saved careers");
  assert.deepEqual(out.routes, ["/careers", "/careers/saved"]);
  assert.equal(out.steps.length, out.routes.length);
  assert.ok(out.steps.length <= NAVIGATE_MAX_STEPS);
  assert.match(out.steps[0]!, /Careers/);
  assert.match(out.steps.at(-1)!, /Saved/);
  assert.match(out.steps.at(-1)!, /\/careers\/saved/);
});

test("VA14: fixed intents map to the expected target page", () => {
  const target = (intent: string) => navigateSteps(CATALOGUE, intent).routes.at(-1);
  assert.equal(target("take me to the assessment results"), "/assessment/results");
  assert.equal(target("how do I open profile settings"), "/profile/settings");
  assert.equal(target("where is the compare page"), "/compare");
  assert.equal(target("I want to find my careers"), "/careers");
});

test("VA14: an unknown intent returns the fixed text and no routes", () => {
  for (const intent of ["how do I fly to the moon", "", "   ", "the", "????"]) {
    const out = navigateSteps(CATALOGUE, intent);
    assert.deepEqual(out.steps, [NAVIGATE_UNKNOWN_TEXT], intent);
    assert.deepEqual(out.routes, []);
  }
  assert.equal(NAVIGATE_UNKNOWN_TEXT, "I don't know that page yet");
});

test("VA14: an empty or missing catalogue is the unknown text, never an invented route", () => {
  for (const cat of [{ routes: [] }, undefined, null, {} as never, { routes: "x" } as never, { routes: [null, 3, {}] } as never]) {
    const out = navigateSteps(cat as never, "take me to the careers page");
    assert.deepEqual(out.steps, [NAVIGATE_UNKNOWN_TEXT]);
    assert.deepEqual(out.routes, []);
  }
});

test("VA14: a hostile catalogue entry (absolute URL, protocol-relative, javascript:, ..) is never returned", () => {
  const hostile: NavCatalogue = {
    routes: [
      { path: "https://evil.example/careers" },
      { path: "//evil.example/careers" },
      { path: "javascript:alert(1)//careers" },
      { path: "/../careers/secret" },
      { path: "/careers/..%2fadmin" },
      { path: "/careers" },
    ],
  };
  const out = navigateSteps(hostile, "careers");
  assert.deepEqual(out.routes, ["/careers"]);
  for (const s of out.steps) assert.doesNotMatch(s, /evil|javascript|https?:/i);
});

test("VA14: at most 7 steps even for a deep route chain", () => {
  const deep: NavCatalogue = { routes: [] };
  let p = "";
  for (const seg of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "tail"]) {
    p += `/${seg}`;
    deep.routes.push({ path: p });
  }
  const out = navigateSteps(deep, "tail");
  assert.equal(out.steps.length, NAVIGATE_MAX_STEPS);
  assert.equal(out.routes.at(-1), "/a/b/c/d/e/f/g/h/i/tail");
});

// ---- seeded property loop (>= 200 cases) ----
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const ATOMS = [
  "careers", "saved", "assessment", "results", "profile", "settings", "compare", "page", "open", "go", "to", "the", "my", "where", "how",
  "../", "../../etc/passwd", "/careers/saved", "/admin", "/admin/secret", "https://evil.example/x", "http://evil.example", "//evil.example",
  "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "\\host\share", "%2e%2e/", "<script>", "ftp://h/", "careers/../admin",
  "/careers/[id]", "/nope", "mailto:a@b.c", "\u0000", "\n", "ＣＡＲＥＥＲＳ", "C:\Windows",
];
test("VA14 property: for 300 seeded random intents no route is outside the catalogue and no foreign host appears", () => {
  const rnd = lcg(20261026);
  let known = 0;
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const intent = Array.from({ length: n }, () => ATOMS[Math.floor(rnd() * ATOMS.length)]).join(rnd() < 0.5 ? " " : "");
    const out = navigateSteps(CATALOGUE, intent);
    assert.ok(out.steps.length >= 1 && out.steps.length <= NAVIGATE_MAX_STEPS, `steps bound for ${JSON.stringify(intent)}`);
    for (const r of out.routes) assert.ok(CATALOGUE_PATHS.has(r), `route ${r} not in catalogue for ${JSON.stringify(intent)}`);
    assert.equal(new Set(out.routes).size, out.routes.length, "no duplicate routes");
    for (const s of out.steps) {
      assert.doesNotMatch(s, /https?:|\/\/|javascript:|data:|file:|mailto:|evil|\.\./i, `foreign target in step for ${JSON.stringify(intent)}`);
    }
    if (out.routes.length === 0) assert.deepEqual(out.steps, [NAVIGATE_UNKNOWN_TEXT]);
    else known++;
  }
  assert.ok(known > 20, "the property loop must reach the known-route branch too");
});

test("VA14: output is text only (no click or drive instruction object, JSON-serialisable)", () => {
  const out = navigateSteps(CATALOGUE, "open compare");
  assert.deepEqual(Object.keys(out).sort(), ["routes", "steps"]);
  assert.ok(out.steps.every((s) => typeof s === "string"));
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});
