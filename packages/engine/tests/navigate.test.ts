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
import { NAVIGATE_UNKNOWN_TEXT, NAVIGATE_MAX_STEPS, SECTION_KEYS, VIDYSEA_RECIPES, navigateSteps, type NavCatalogue } from "../src/tools/navigate.js";
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


// T-057 Q4: observed host task routes and controls, never an inferred selection state.
const QUEST_CATALOGUE: NavCatalogue = {
  routes: ["/career-repository", "/career-quest/career-selection", "/career-compare", "/favorite", "/my-report"].map((path) => ({ path, file: "fixture" })),
};

test("Q4: English, Hindi and Hinglish career selection reach the task rather than repository", () => {
  for (const intent of ["career selection", "how do I select careers", "career kaise select karu", "mujhe career chunna hai", "मुझे करियर चुनना है", "कैरियर चयन कैसे करें?"]) {
    const out = navigateSteps(QUEST_CATALOGUE, intent);
    assert.deepEqual(out.routes, ["/career-quest/career-selection"], intent);
    assert.match(out.steps.join(" "), /Top Picks For You/);
    assert.match(out.steps.join(" "), /preview/i);
    assert.match(out.steps.join(" "), /Add to picks/);
    assert.match(out.steps.join(" "), /(?:up to|maximum) 5/);
    assert.match(out.steps.join(" "), /rank/i);
    assert.ok(out.steps.length <= NAVIGATE_MAX_STEPS);
    assert.doesNotMatch(out.steps.join(" "), /you have selected|your current picks|already selected/i);
  }
});

test("Q4: compare task follows Category, Subcategory, Career, at least 2, Compare", () => {
  for (const intent of ["how do I compare careers", "career compare kaise karu", "करियर की तुलना कैसे करें?"]) {
    const out = navigateSteps(QUEST_CATALOGUE, intent);
    assert.deepEqual(out.routes, ["/career-compare"], intent);
    assert.match(out.steps.join(" "), /Category[\s\S]*Subcategory[\s\S]*Career[\s\S]*at least 2[\s\S]*Compare/);
    assert.ok(out.steps.length <= NAVIGATE_MAX_STEPS);
  }
});

test("Q4: known missing or locked tasks cannot fall through to a repository or unsafe route", () => {
  for (const routes of [
    [{ path: "/career-repository", file: "fixture" }],
    [{ path: "https://evil.example/career-quest/career-selection", file: "fixture" }],
    [{ path: "/career-quest/../career-selection", file: "fixture" }],
  ]) {
    const out = navigateSteps({ routes }, "career selection");
    assert.deepEqual(out.routes, []);
    assert.match(out.steps.join(" "), /don't know that page yet/);
  }
  const locked = { routes: QUEST_CATALOGUE.routes.map((r) => ({ ...r, locked: r.path === "/career-quest/career-selection" })) };
  const out = navigateSteps(locked, "career selection");
  assert.deepEqual(out.routes, []);
  assert.match(out.steps.join(" "), /locked/i);
  const conflicting = { routes: [...QUEST_CATALOGUE.routes, { path: "/career-quest/career-selection", locked: true, file: "fixture" }] };
  assert.deepEqual(navigateSteps(conflicting, "career selection").routes, []);
  assert.deepEqual(navigateSteps({ routes: [{ path: "/career-quest", locked: true, file: "fixture" }, ...QUEST_CATALOGUE.routes] }, "career selection").routes, []);
  assert.deepEqual(navigateSteps({ routes: [{ path: "/career-repository", locked: true, file: "fixture" }] }, "repository").routes, []);
  assert.deepEqual(navigateSteps(QUEST_CATALOGUE, "https://evil.example/../../moon").routes, []);
});

// T-057 services catalogue: label + summary routes answer "name: purpose (path)", only from the catalogue.
const SERVICES: NavCatalogue = {
  routes: [
    { path: "/services", file: "x" },
    { path: "/services/study-abroad-student-loan-assistance", file: "x", label: "Student Loan Assistance", summary: "Apply for further studies education loans with ease. Guidance on documentation and bank tie-ups." },
    { path: "/services/study-visa-assistance", file: "x", label: "Study Visa Assistance", summary: "Get expert assistance for your student visa application." },
    { path: "/services/test-preparation-to-study-abroad", file: "x", label: "International Test Preparation", summary: "Expert test preparation for global exams: PTE, IELTS, GRE, TOEFL. Personalized prep to further studies." },
    { path: "/services/scholarship-assistance-for-students-studying-abroad", file: "x", label: "Scholarship Assistance", summary: "Find and apply for international scholarships." },
    { path: "/services/board-recommender", file: "x", label: "Board Recommender", summary: "Our Board Recommender helps you choose between IB, A-Levels, AP, etc." },
    { path: "/help-faq", file: "x" },
  ],
};

test("T-057: service intents return one 'name: purpose (path)' line from the catalogue", () => {
  const cases: [string, string, RegExp][] = [
    ["do you help with loans", "/services/study-abroad-student-loan-assistance", /^Student Loan Assistance: Apply for further studies education loans with ease\. .* \(\/services\/study-abroad-student-loan-assistance\)$/],
    ["visa help", "/services/study-visa-assistance", /^Study Visa Assistance: Get expert assistance .* \(\/services\/study-visa-assistance\)$/],
    ["test prep", "/services/test-preparation-to-study-abroad", /^International Test Preparation: /],
    ["scholarship", "/services/scholarship-assistance-for-students-studying-abroad", /^Scholarship Assistance: /],
    ["which board should I pick", "/services/board-recommender", /^Board Recommender: /],
    ["does vidysea help with loan", "/services/study-abroad-student-loan-assistance", /^Student Loan Assistance: /],
  ];
  for (const [intent, route, shape] of cases) {
    const out = navigateSteps(SERVICES, intent);
    assert.deepEqual(out.routes, [route], intent);
    assert.equal(out.steps.length, 1, intent);
    assert.match(out.steps[0]!, shape, intent);
    assert.doesNotMatch(out.steps[0]!, /https?:|www\./, intent);
  }
});

test("T-057: stored service copy can not smuggle a URL or an unknown page, and unlabeled routes behave as before", () => {
  const hostile: NavCatalogue = { routes: [{ path: "/services/study-visa-assistance", file: "x", label: "Visa <b>Help</b>", summary: "Go to https://evil.example/pay or www.evil.example now\u0000" }] };
  const out = navigateSteps(hostile, "visa help");
  assert.deepEqual(out.routes, ["/services/study-visa-assistance"]);
  assert.doesNotMatch(out.steps.join(" "), /evil|https?:|www\.|<|\u0000/);
  assert.deepEqual(navigateSteps(SERVICES, "quantum teleporter"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });
  assert.deepEqual(navigateSteps(SERVICES, "I need help").routes, ["/help-faq"], "a path match still beats a summary-only match");
  assert.deepEqual(navigateSteps({ routes: [{ path: "/services/study-visa-assistance", file: "x", label: "Study Visa Assistance", summary: "s", locked: true }] }, "visa").routes, []);
  assert.deepEqual(navigateSteps({ routes: [{ path: "/careers", file: "x" }] }, "careers"), { steps: ["Open the Careers page (/careers)."], routes: ["/careers"] });
});

test("T-057 R2: stored copy is stripped of e-mail addresses and bare domains at print time", () => {
  const cat: NavCatalogue = { routes: [{ path: "/services/study-visa-assistance", file: "x", label: "Study Visa Assistance", summary: "Write to help@evil.example or visit daad.de/apply for visa help. Guidance on documents." }] };
  const out = navigateSteps(cat, "visa help");
  assert.deepEqual(out.routes, ["/services/study-visa-assistance"]);
  assert.doesNotMatch(out.steps.join(" "), /@|evil|daad|\.de/);
  assert.match(out.steps[0]!, /Guidance on documents\./);
});

// ---------------------------------------------------------------------------
// tool-first T1 (spec S1-S4, TF-1..TF-4): Vidysea tool recipes with ?section=<key> deep links from a closed list.
// ---------------------------------------------------------------------------
const HUB = "/student/journey-details";
const VIDYSEA_PATHS = [HUB, "/ai-university-finder-study-abroad", "/student/shortlisted-programmes", "/student/favourites", "/student/visa-management", "/student/test-requirements", "/country/canada", "/services/study-visa-assistance"];
const VIDYSEA_CATALOGUE: NavCatalogue = { routes: [{ path: "/", file: "x" }, ...VIDYSEA_PATHS.map((path) => ({ path, file: "x" }))] };
const SECTION_LINK = new RegExp(`^${HUB}\\?section=(${SECTION_KEYS.join("|")})$`);

test("TF-1: 'best universities in Canada' gives label, purpose, 3-6 numbered constant steps and the Explorer deep link", () => {
  const out = navigateSteps(VIDYSEA_CATALOGUE, "best universities in Canada");
  assert.deepEqual(out.routes, [`${HUB}?section=market`]);
  assert.match(out.steps[0]!, /^University Explorer: .+ \(\/student\/journey-details\?section=market\)$/);
  const numbered = out.steps.slice(1);
  assert.ok(numbered.length >= 3 && numbered.length <= 6, `3-6 steps, got ${numbered.length}`);
  numbered.forEach((s, i) => assert.ok(s.startsWith(`${i + 1}. `), s));
  assert.ok(out.steps.length <= NAVIGATE_MAX_STEPS);
  assert.doesNotMatch(out.steps.join("\n"), /https?:|www\.|\/\//);
});

test("TF-1: the country is echoed only from the closed list and only when its /country page is in the catalogue", () => {
  const withCountry = navigateSteps(VIDYSEA_CATALOGUE, "best universities in Canada").steps.join("\n");
  assert.match(withCountry, /best universities in Canada/);
  const noPage = navigateSteps({ routes: VIDYSEA_CATALOGUE.routes.filter((r) => r.path !== "/country/canada") }, "best universities in Canada").steps.join("\n");
  assert.doesNotMatch(noPage, /Canada/);
  const unlisted = navigateSteps(VIDYSEA_CATALOGUE, "best universities in Narnia").steps.join("\n");
  assert.doesNotMatch(unlisted, /Narnia/);
  assert.match(unlisted, /University Explorer/);
  const both = navigateSteps(VIDYSEA_CATALOGUE, "best universities in canada or germany").steps.join("\n");
  assert.doesNotMatch(both, /Germany/);
});

test("TF-2: every recipe link is path or path?section=<closed key>; student text can not change it", () => {
  const asks = [
    "best universities in Canada", "which country should I choose", "how do I shortlist a university", "compare universities",
    "make my full journey", "how do I start an application", "where do I track my visa", "where are my favourites", "my scholarships",
    "upload documents", "which tests do I need for my shortlisted programmes", "open the tools library",
  ];
  const seen = new Set<string>();
  for (const ask of asks) {
    const out = navigateSteps(VIDYSEA_CATALOGUE, ask);
    assert.equal(out.routes.length, 1, ask);
    const link = out.routes[0]!;
    assert.ok(SECTION_LINK.test(link) || VIDYSEA_PATHS.includes(link), `${ask} -> ${link}`);
    assert.ok(out.steps[0]!.endsWith(`(${link})`), ask);
    seen.add(link);
  }
  assert.ok(seen.size >= 9, `distinct links ${[...seen].join(",")}`);
  // hostile: a typed section, query, absolute URL or traversal can not reach the link (the ask no longer matches a recipe)
  for (const hostile of [
    "best universities in Canada?section=admin", "best universities in canada&section=documents", "open journey map section=../admin",
    "best universities in https://evil.example/x", "best universities in //evil.example", "best universities in javascript:alert(1)",
    "compare universities?section=visa", "make my journey ?section=admin", "make my journey <script>",
  ]) {
    const out = navigateSteps(VIDYSEA_CATALOGUE, hostile);
    for (const r of out.routes) assert.ok(VIDYSEA_CATALOGUE.routes.some((c) => c.path === r.split("?")[0]) && (!r.includes("?") || SECTION_LINK.test(r)), `${hostile} -> ${r}`);
    assert.doesNotMatch(out.steps.join("\n"), /evil|admin|javascript|script|\.\./i, hostile);
  }
});

test("TF-2: SECTION_KEYS is the closed list of the spec, as const", () => {
  assert.deepEqual([...SECTION_KEYS], ["dashboard", "market", "journey", "shortlisted", "compare", "comparisons", "favourites", "scholarships", "schpipeline", "applications", "visa", "tools", "documents", "docchecklist", "testreq"]);
});

test("TF-3: a recipe fires only when its base path is in the synced catalogue; otherwise the unknown text", () => {
  const without = (p: string): NavCatalogue => ({ routes: VIDYSEA_CATALOGUE.routes.filter((r) => r.path !== p) });
  assert.deepEqual(navigateSteps(without(HUB), "best universities in Canada"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });
  assert.deepEqual(navigateSteps(without(HUB), "make my full journey"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });
  assert.deepEqual(navigateSteps(without("/ai-university-finder-study-abroad"), "which country should I choose"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });
  assert.deepEqual(navigateSteps(CATALOGUE, "best universities in Canada"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] }, "an unrelated catalogue never gets a Vidysea link");
  assert.deepEqual(navigateSteps({ routes: [] }, "make my full journey"), { steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });
  const locked: NavCatalogue = { routes: VIDYSEA_CATALOGUE.routes.map((r) => ({ ...r, locked: r.path === HUB })) };
  const out = navigateSteps(locked, "compare universities");
  assert.deepEqual(out.routes, []);
  assert.match(out.steps.join(" "), /locked/i);
});

test("TF-4: 'make my full journey' says per programme, shortlist first, 60-120 s, bulk needs counsellor verification; never one 'full journey' object", () => {
  for (const ask of ["make my full journey", "create my journey map", "generate my roadmap", "Can you make me a full journey plan?"]) {
    const out = navigateSteps(VIDYSEA_CATALOGUE, ask);
    assert.deepEqual(out.routes, [`${HUB}?section=journey`], ask);
    const text = out.steps.join("\n");
    assert.match(text, /per programme|each programme|every programme/i, ask);
    assert.match(text, /shortlist/i, ask);
    assert.match(text, /Generate Journey Map/, ask);
    assert.match(text, /60-120 seconds/, ask);
    assert.match(text, /counsellor/i, ask);
    assert.match(text, /no single/i, ask);
    assert.doesNotMatch(text, /your full journey (?:is|has been)|we (?:have )?(?:made|created|generated)/i, ask);
    assert.ok(out.steps.length <= NAVIGATE_MAX_STEPS);
  }
});

test("TF-1: the Pathlynks recipes are unchanged and a KB-shaped find question gets no Vidysea link", () => {
  assert.deepEqual(navigateSteps(QUEST_CATALOGUE, "how do I compare careers").routes, ["/career-compare"]);
  assert.equal(navigateSteps(VIDYSEA_CATALOGUE, "how can I find universities in Germany").routes.includes(`${HUB}?section=market`), false);
});

test("TF-2: every recipe is a reviewed constant (3-6 steps, no URL, no parentheses beyond the link) and uses the closed section list", () => {
  assert.ok(VIDYSEA_RECIPES.length >= 12);
  for (const r of VIDYSEA_RECIPES) {
    assert.ok(r.steps.length >= 3 && r.steps.length <= 6, r.id);
    assert.ok(r.section === undefined || (SECTION_KEYS as readonly string[]).includes(r.section), r.id);
    for (const s of [r.label, r.purpose, ...r.steps]) assert.doesNotMatch(s, /https?:|www\.|\/\/|[()]|\?section=/, `${r.id}: ${s}`);
    assert.ok(r.auth === "public" || r.auth === "student", r.id);
  }
  assert.equal(new Set(VIDYSEA_RECIPES.map((r) => r.id)).size, VIDYSEA_RECIPES.length);
});

test("TF-5 (ReDoS): every new recipe pattern is linear on hostile input (300 repeats < 100 ms, and 4000-char fillers)", () => {
  const heads = ["", "best ", "best universities in ", "find ", "compare ", "make my ", "how do i ", "where do i ", "my ", "help me ", "can you help me ", "which country ", "mujhe ", "kaun si ", "यूनिवर्सिटी "];
  const units = ["universities ", "in ", "me ", "me me ", "the ", "full ", "journey ", "map ", "karo ", "a ", " ", ",", "बेस्ट ", "यूनिवर्सिटी "];
  const tails = ["!", "?", "x", ""];
  for (const r of VIDYSEA_RECIPES) {
    for (const head of heads) for (const unit of units) for (const tail of tails) {
      const text = head + unit.repeat(300) + tail;
      const t0 = performance.now();
      r.pattern.test(text);
      const ms = performance.now() - t0;
      assert.ok(ms < 100, `${r.id} ${JSON.stringify(head + unit)}x300+${JSON.stringify(tail)} took ${ms.toFixed(1)} ms`);
    }
    for (const filler of ["a", " ", "ab ", "me ", ",", "!"]) {
      for (const lead of ["best universities in ", "find universities", "make my journey", "compare universities", "how do i start an application", "my scholarships", "upload documents"]) {
        const text = (lead + filler.repeat(4000)).slice(0, 4000) + "#";
        const t0 = performance.now();
        r.pattern.test(text);
        const ms = performance.now() - t0;
        assert.ok(ms < 100, `${r.id} 4000-char ${JSON.stringify(lead)}+${JSON.stringify(filler)} took ${ms.toFixed(1)} ms`);
      }
    }
  }
});

// route-fix-1 item 1: a bounded budget slot and a second "for <subject>" slot on the university-search recipe. The budget never reaches a link or a reply.
test("RF1-1: budget and subject slots route to university_search; the budget is never echoed", () => {
  for (const ask of [
    "best universities in Canada with 20 lakh budget",
    "best universities in Canada under 20 lakhs",
    "best universities in Canada within 25 lac",
    "best universities in Canada with a 1.5 crore budget",
    "top universities for MBA in Germany",
    "top universities for data science in the UK under 30 lakhs",
    "find universities in Australia with 40k budget",
  ]) {
    const out = navigateSteps(VIDYSEA_CATALOGUE, ask);
    assert.deepEqual(out.routes, [`${HUB}?section=market`], ask);
    const text = out.steps.join("\n") + out.routes.join("\n");
    assert.doesNotMatch(text, /lakh|lac\b|crore|\b20\b|\b25\b|\b30\b|\b40k\b|\b1\.5\b|MBA|data science/i, ask);
  }
  assert.match(navigateSteps(VIDYSEA_CATALOGUE, "best universities in Canada with 20 lakh budget").steps.join("\n"), /best universities in Canada\./);
});

test("RF1-1: near-miss KB questions with a budget or subject stay unmatched", () => {
  for (const ask of [
    "best universities in Canada with 20 lakh budget and scholarships",
    "best universities in Canada with GRE 320",
    "tell me about the best universities for computer science in the UK with scholarships",
    "how to shortlist universities for MBA in USA with GRE 320",
    "best universities in Canada with 20 lakh budget for my sister who is weak at maths",
  ]) {
    assert.equal(navigateSteps(VIDYSEA_CATALOGUE, ask).routes.includes(`${HUB}?section=market`), false, ask);
  }
});

test("RF1-1 (ReDoS): the budget and subject slots stay linear on 5000-char hostile input", () => {
  const university = VIDYSEA_RECIPES.find((r) => r.id === "university_search")!;
  const bodies = [" with ", " under ", " in ", " for ", " for a b in c d ", " with 20 ", " with 20 lakh ", " with 2 lakh budget ", " budget ", " lakh "];
  for (const lead of ["best universities", "find universities in canada", "top universities for mba"]) {
    for (const unit of bodies) for (const tail of ["", "x", "!"]) {
      const text = (lead + unit.repeat(5000)).slice(0, 5000) + tail;
      const t0 = performance.now();
      university.pattern.test(text);
      const ms = performance.now() - t0;
      assert.ok(ms < 100, `${JSON.stringify(lead + unit)} took ${ms.toFixed(1)} ms`);
    }
    for (const digits of ["9", "9 ", "9.9 "]) {
      const text = (lead + " with " + digits.repeat(5000)).slice(0, 5000) + "#";
      const t0 = performance.now();
      university.pattern.test(text);
      assert.ok(performance.now() - t0 < 100, `${lead} digits ${JSON.stringify(digits)}`);
    }
  }
});

// route-fix-1 item 4: every SECTION_KEYS key exists in the frontend STUDENT_SECTIONS. The fixture is the section list of the latest synced nav_catalogue for
// vidysea-frontend (virtual_counsellor.source_artifacts, read-only, 2026-10-29), frozen. A recipe `section` outside it would be a silent dead link.
test("RF1-4: every SECTION_KEYS key and every recipe section exists in the synced frontend STUDENT_SECTIONS", () => {
  const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "student-sections.json"), "utf8")) as { sectionKeys: string[] };
  assert.ok(fixture.sectionKeys.length >= 15);
  const synced = new Set(fixture.sectionKeys);
  assert.deepEqual([...SECTION_KEYS].filter((k) => !synced.has(k)), []);
  assert.deepEqual(VIDYSEA_RECIPES.filter((r) => r.section !== undefined && !synced.has(r.section)).map((r) => r.id), []);
  const src = readFileSync(join(import.meta.dirname, "..", "src", "tools", "navigate.ts"), "utf8");
  const doc = src.slice(src.lastIndexOf("/**", src.indexOf("export const SECTION_KEYS")), src.indexOf("export const SECTION_KEYS"));
  assert.doesNotMatch(doc, /ASSUMPTION/, "all keys match the synced list, so the [ASSUMPTION] tag is dropped");
});
