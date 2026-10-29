/**
 * Next.js App Router path parser (spec S4, VA11).
 *
 * parseNextAppRoutes(paths) takes repo file PATHS (no file contents) and returns the navigation
 * catalogue of `src/app/**` page routes. Pure and deterministic: route groups "(name)" are stripped
 * from the URL and kept as metadata; dynamic "[id]", catch-all "[...slug]" and optional catch-all
 * "[[...slug]]" segments are kept verbatim; api/ trees, private "_folders", parallel "@slots" and
 * intercepting "(.)x" folders produce no route; only page.{js,jsx,ts,tsx} files count.
 */
import type { BackendKg, FrontendKg, IngestDiagnostic, KgSource, ModelTable, NavCatalogue, NavRoute, ProductKg, ProductTool, RepoFile } from "./types.js";
import { stripExplicitLinks } from "../tools/navigate.js";

const PAGE_FILE = /^page\.(?:js|jsx|ts|tsx)$/;
const INTERCEPTING = /^\(\.{1,3}\)/;
const GROUP = /^\([^()]+\)$/;

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Normalise separators and a leading "./"; returns null for anything that is not a usable relative path. */
function normalise(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim().replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  if (p.length === 0 || p.startsWith("/")) return null;
  return p;
}

function toRoute(file: string): NavRoute | null {
  const parts = file.split("/").filter((s) => s.length > 0);
  if (parts.some((s) => s === "." || s === ".." || s === "node_modules")) return null;
  // The Next app directory is the first "src/app" pair (a monorepo prefix before it is allowed).
  let at = -1;
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === "src" && parts[i + 1] === "app") {
      at = i + 2;
      break;
    }
  }
  if (at < 0 || at >= parts.length) return null;
  const name = parts[parts.length - 1]!;
  if (!PAGE_FILE.test(name)) return null;

  const groups: string[] = [];
  const url: string[] = [];
  for (let i = at; i < parts.length - 1; i++) {
    const seg = parts[i]!;
    if (seg.startsWith("_") || seg.startsWith("@") || INTERCEPTING.test(seg)) return null;
    if (GROUP.test(seg)) {
      groups.push(seg);
      continue;
    }
    url.push(seg);
  }
  if (url[0] === "api") return null;
  const route: NavRoute = { path: "/" + url.join("/"), file };
  if (groups.length > 0) route.group = groups.join("/");
  return route;
}

export function parseNextAppRoutes(paths: string[]): NavCatalogue {
  const byFile = new Map<string, NavRoute>();
  const input: unknown[] = Array.isArray(paths) ? paths : [];
  for (const raw of input) {
    const file = normalise(raw);
    if (file === null || byFile.has(file)) continue;
    const route = toRoute(file);
    if (route !== null) byFile.set(file, route);
  }
  const routes = [...byFile.values()].sort(
    (a, b) => cmp(a.path, b.path) || cmp(a.group ?? "", b.group ?? "") || cmp(a.file, b.file),
  );
  return { routes };
}

/**
 * T-057: the `services.meta.<key>` entries of the Vidysea frontend's next-intl `en.json`, keyed to the `/services/<slug>` page they describe.
 * Only these seven pages can receive a label and summary; a key that is not listed here is ignored, so copy can never name a route.
 */
const SERVICE_SLUGS: Record<string, string> = {
  board_recommender: "board-recommender",
  counselling: "counselling-for-study-abroad",
  overseas_consultant: "overseas-education-consultant",
  scholarship: "scholarship-assistance-for-students-studying-abroad",
  loan: "study-abroad-student-loan-assistance",
  visa: "study-visa-assistance",
  test_prep: "test-preparation-to-study-abroad",
};
const LABEL_MAX = 80;
const SUMMARY_MAX = 300;

/** One line of plain text: tags, URLs, e-mail addresses, bare domains and control characters removed, whitespace collapsed, capped. Empty string when nothing is left. */
function plainText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return stripExplicitLinks(
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, max)
    .trim();
}

/** "Student Loan Assistance | Financial Support - Vidysea" -> "Student Loan Assistance". */
function labelFromTitle(raw: unknown): string {
  const head = plainText(raw, 200).split("|")[0] ?? "";
  return plainText(head.replace(/\s+-\s+Vidysea\s*$/i, ""), LABEL_MAX);
}

/**
 * Attach a label and one-line summary to the `/services/<slug>` routes of a catalogue, from the host's next-intl messages JSON
 * (`services.meta.<key>.{title,description}`). Pure and deterministic; returns a new catalogue and never mutates its input. Anything
 * missing, malformed or not a string leaves the route exactly as it was, and no route is ever added.
 */
export function applyServiceCopy(catalogue: NavCatalogue, messagesJson: string): NavCatalogue {
  let meta: unknown;
  try {
    const parsed = JSON.parse(messagesJson) as { services?: { meta?: unknown } } | null;
    meta = parsed !== null && typeof parsed === "object" ? parsed.services?.meta : undefined;
  } catch {
    return catalogue;
  }
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return catalogue;
  const copy = new Map<string, { label?: string; summary?: string }>();
  for (const [key, slug] of Object.entries(SERVICE_SLUGS)) {
    const entry = (meta as Record<string, unknown>)[key];
    if (entry === null || typeof entry !== "object") continue;
    const label = labelFromTitle((entry as { title?: unknown }).title);
    const summary = plainText((entry as { description?: unknown }).description, SUMMARY_MAX);
    if (label === "" && summary === "") continue;
    copy.set(`/services/${slug}`, { ...(label === "" ? {} : { label }), ...(summary === "" ? {} : { summary }) });
  }
  if (copy.size === 0) return catalogue;
  return { routes: catalogue.routes.map((r) => (copy.has(r.path) ? { ...r, ...copy.get(r.path) } : r)) };
}


// ---------------------------------------------------------------------------------------------------------------------------------
// T8 (tf-t8-product-db-kg): the FRONTEND half of the product + DB knowledge graph. The Vidysea student portal is one hub route
// (`/student/journey-details?section=<key>`): its section keys, sidebar labels and the section -> component switch live in three files, not in the
// page tree, so the route catalogue alone cannot name a tool. These parsers read those files (untrusted text: scanned line by line, never run).
// ---------------------------------------------------------------------------------------------------------------------------------

/** The files the hub parser reads: the section list, the sidebar, and (matched by name) the StudentOS component holding the switch. */
export const STUDENT_HUB_FILES = {
  navigation: "src/lib/student/navigation.ts",
  sidebar: "src/components/student/StudentPortalSidebar.tsx",
  osGlob: "src/app/student/**/StudentOS.tsx",
} as const;
const DEFAULT_HUB = "/student/journey-details";
const SECTION_KEY = /^[a-z][a-z0-9-]{0,40}$/;
const HUB_PATH = /^\/[A-Za-z0-9/_-]{1,120}$/;
const SKIP_COMPONENTS = new Set(["Suspense", "PortalText", "SectionBack", "Fragment"]);
const MAX_HUB_LINES = 20_000;

function hubFile(files: RepoFile[], match: (p: string) => boolean): { path: string; lines: string[] } | undefined {
  const f = (Array.isArray(files) ? (files as unknown[]) : []).find(
    (x): x is RepoFile => typeof (x as RepoFile)?.path === "string" && typeof (x as RepoFile)?.content === "string" && match((x as RepoFile).path),
  );
  return f === undefined ? undefined : { path: f.path, lines: f.content.split(/\r?\n/, MAX_HUB_LINES) };
}

export function parseStudentHub(files: RepoFile[]): { tools: ProductTool[]; diagnostics: IngestDiagnostic[] } {
  const diagnostics: IngestDiagnostic[] = [];
  const nav = hubFile(files, (p) => p === STUDENT_HUB_FILES.navigation);
  if (nav === undefined) return { tools: [], diagnostics };
  // 1. STUDENT_SECTIONS = [ "a", "b", ... ] as const  (keys + the line each one is on)
  const keys: { key: string; line: number }[] = [];
  const seen = new Set<string>(); // O(1) de-dup: keys.some() was quadratic on a hostile navigation file
  let hub = DEFAULT_HUB;
  let inList = false;
  nav.lines.forEach((s, i) => {
    const home = /\bSTUDENT_HOME\s*=\s*"([^"]*)"/.exec(s)?.[1];
    if (home !== undefined && HUB_PATH.test(home)) hub = home;
    if (!inList && /\bSTUDENT_SECTIONS\s*=\s*\[/.test(s)) inList = true;
    if (!inList) return;
    const body = s.replace(/\/\/.*$/, "");
    for (const m of body.matchAll(/"([^"]*)"/g)) {
      if (SECTION_KEY.test(m[1]!) && !seen.has(m[1]!)) { seen.add(m[1]!); keys.push({ key: m[1]!, line: i + 1 }); }
    }
    if (/\]/.test(body.replace(/"[^"]*"/g, ""))) inList = false;
  });
  if (keys.length === 0) return { tools: [], diagnostics };
  const known = new Set(keys.map((k) => k.key));

  // 2. sidebar ITEMS: { key: "x", icon: Y, label: "Z" [, href: "..."] }
  const labels = new Map<string, string>();
  const sidebar = hubFile(files, (p) => p === STUDENT_HUB_FILES.sidebar);
  if (sidebar !== undefined) {
    let inItems = false;
    for (const s of sidebar.lines) {
      if (!inItems && /\bconst\s+ITEMS\b/.test(s)) {
        inItems = true;
        continue;
      }
      if (!inItems) continue;
      if (/^\s*\];?\s*$/.test(s)) break;
      const m = /\{\s*key:\s*"([^"]*)"[^}]*?label:\s*"([^"]*)"([^}]*)\}/.exec(s);
      if (m === null) continue;
      const [, key, label, rest] = m;
      if (/\bhref:/.test(rest!) || key === "services") continue; // a real-route link or the services submenu: not a hub section
      if (!known.has(key!)) {
        diagnostics.push({ code: "sidebar_key_unknown", file: sidebar.path, message: `sidebar key ${key!.slice(0, 60)} is not in STUDENT_SECTIONS; ignored` });
        continue;
      }
      const clean = plainText(label, 80);
      if (clean !== "") labels.set(key!, clean);
    }
  }

  // 3. the StudentOS switch (active): case "key": ... first component tag
  const os = hubFile(files, (p) => /(?:^|\/)StudentOS\.tsx$/.test(p));
  const cases = new Map<string, { component?: string; line: number }>();
  if (os !== undefined) {
    const start = os.lines.findIndex((s) => /\bswitch\s*\(\s*active\s*\)\s*\{/.test(s));
    if (start >= 0) {
      const indent = /^\s*/.exec(os.lines[start]!)![0].length;
      let pending: { key: string; line: number }[] = [];
      const settle = (component?: string): void => {
        for (const p of pending) if (!cases.has(p.key)) cases.set(p.key, { ...(component === undefined ? {} : { component }), line: p.line });
        pending = [];
      };
      for (let i = start + 1; i < os.lines.length; i++) {
        const s = os.lines[i]!;
        if (/^\s*\}/.test(s) && /^\s*/.exec(s)![0].length <= indent) break;
        const c = /^\s*case\s+"([^"]+)"\s*:/.exec(s);
        if (c !== null) pending.push({ key: c[1]!, line: i + 1 });
        if (/^\s*default\s*:/.test(s)) {
          settle();
          continue;
        }
        if (pending.length === 0) continue;
        const rest = c === null ? s : s.slice(c[0].length);
        const tag = [...rest.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]!).find((n) => !SKIP_COMPONENTS.has(n));
        if (tag !== undefined) settle(tag);
      }
      settle();
    }
  }

  const tools: ProductTool[] = keys.map(({ key, line }) => {
    const label = labels.get(key);
    const k = cases.get(key);
    const tool: ProductTool = {
      id: `section:${key}`,
      kind: "section",
      key,
      route: hub,
      ...(label === undefined ? {} : { label }),
      sidebar: label !== undefined,
      ...(k?.component === undefined ? {} : { component: k.component }),
      source: os !== undefined && k !== undefined ? { file: os.path, line: k.line } : { file: nav.path, line },
    };
    if (k === undefined) diagnostics.push({ code: "section_without_case", file: os?.path ?? nav.path, message: `section ${key} has no case in the StudentOS switch` });
    return tool;
  });
  return { tools, diagnostics };
}

interface ToolSeed {
  purpose: string;
  steps: string[];
  /** Row number of the tool in qa/evidence/t057/tool-first-inventory.md section 1. */
  row: number;
}
const T = (row: number, purpose: string, steps: string[]): ToolSeed => ({ row, purpose, steps });
const PLANNER_STEPS = ["Open the section from the sidebar or a link.", "Add your items, or tick the ones you have done.", "Come back to see the dates and totals."];

/** Reviewed section seeds, from the inventory (never from the student's text). A key the repo no longer has is reported as `seed_section_missing`. */
const SECTION_SEEDS: Record<string, ToolSeed> = {
  market: T(1, "Natural-language search for universities and programmes inside the portal (no filters in this view).", ["Sign in.", "Open University Explorer in the sidebar.", "Type the question, with country and subject.", "Open a card for programmes and fees.", "Tick compare, or the star to shortlist."]),
  recommend: T(3, "AI-ranked programme recommendations from your saved preferences.", ["Save your preferences in the AI University Finder.", "Open Recommendations for the ranked programmes.", "Shortlist the ones you like."]),
  favourites: T(5, "Universities and courses you hearted.", ["Heart a university or course on a card.", "Open Favourites in the sidebar.", "Use Move to shortlist on an item."]),
  shortlisted: T(6, "Your programme shortlist, counsellor verification, priority and fit.", ["Shortlist a programme from a card.", "Open Shortlisted in the sidebar.", "Send it for counsellor verification.", "Set the priority.", "When verified, generate journey maps."]),
  compare: T(7, "Side-by-side comparison of up to 6 programmes or colleges, with an AI summary.", ["Tick compare on up to 6 cards.", "Open Compare in the sidebar.", "Review the table and the AI summary.", "Save the comparison."]),
  comparisons: T(7, "Your saved comparisons.", ["Save a comparison from the Compare screen.", "Open Saved Comparisons to reopen it."]),
  testreq: T(8, "The tests each shortlisted programme needs; you choose the tests and record dates and scores.", ["Shortlist programmes first.", "Open Test Requirements.", "Choose the tests per programme.", "Enter dates and scores."]),
  journey: T(9, "Journey Map: one map per shortlisted programme with 5 phases and milestone dates. The bulk Generate on Shortlisted covers counsellor-verified items only.", ["Shortlist at least one programme.", "On the programme card press Generate Journey Map, and confirm nationality and tests.", "Wait 60 to 120 seconds for it to generate.", "Open Journey Map in the sidebar and pick a phase.", "Update milestone status and dates as you go."]),
  applications: T(10, "Start and track applications for your shortlisted programmes.", ["Shortlist and verify a programme.", "Open Application Status in the sidebar.", "Press Start application.", "Use the Track tab to follow the status."]),
  myservices: T(10, "Your services and applications (opens Application Status, Track tab).", ["Open Application Status.", "Use the Track tab."]),
  visa: T(11, "Visa application checklist and status for each application.", ["Start an application first.", "Open Visa in the sidebar.", "Create the visa application.", "Tick the checklist and record biometrics and interview dates."]),
  scholarships: T(12, "AI scholarship suggestions; save the ones you want to track.", ["Complete your profile and shortlist.", "Open Scholarships in the sidebar.", "Run the suggestions.", "Heart a scholarship to save it."]),
  schpipeline: T(12, "Track the status of saved scholarships (interested, applying, applied, won, rejected).", ["Save a scholarship first.", "Open Scholarship Pipeline.", "Update the status as you go."]),
  tools: T(13, "Tools Library: AI helpers such as the SOP checker, GPA calculator and cost calculator; each run can be saved.", ["Open Tools Library in the sidebar.", "Pick a tool.", "Fill the form (it is prefilled from your profile).", "Run it; the result is saved to your history."]),
  documents: T(14, "Document Vault: upload documents and answer counsellor requests.", ["Open Document Vault in the sidebar.", "Upload each required document.", "Answer counsellor requests."]),
  docchecklist: T(14, "Document checklist progress.", ["Open Document Checklist.", "Tick the documents you have ready."]),
  profile: T(15, "Academic Profile: basic details, academic history, preferences.", ["Open Academic Profile in the sidebar.", "Fill basic details, academic history and preferences."]),
  "profile-building": T(15, "Further profile assessment and actions.", ["Open Profile Building.", "Complete the assessment and its actions."]),
  "basic-details": T(15, "Basic personal details.", ["Open Basic Details.", "Fill and save your details."]),
  "source-of-fund": T(15, "Source of funds for your studies.", ["Open Source of Fund.", "Add your funding sources."]),
  deadlines: T(16, "Deadlines across applications, milestones and documents (read-only summary).", PLANNER_STEPS),
  apptracker: T(16, "Application tracker summary.", PLANNER_STEPS),
  goals: T(16, "Goals planner.", PLANNER_STEPS),
  finance: T(16, "Finance planner: budget plan and savings.", PLANNER_STEPS),
  testprep: T(16, "Test preparation log.", PLANNER_STEPS),
  reportcard: T(16, "Report card snapshot.", PLANNER_STEPS),
  lorsop: T(16, "Recommenders and SOP/LOR drafts.", PLANNER_STEPS),
  predeparture: T(16, "Pre-departure checklist.", PLANNER_STEPS),
  journeystory: T(16, "Journey story (read-only summary of your activity).", PLANNER_STEPS),
  ctasks: T(17, "My Counsellor: your assigned counsellor and requests.", ["Open My Counsellor in the sidebar.", "Request a session with a topic and one or more time slots.", "Wait for the counsellor to confirm."]),
  counselor: T(17, "My Counsellor details and expert requests.", ["Open My Counsellor.", "Raise an expert request if you need one."]),
  mail: T(19, "Mail Manager: in-app notifications.", ["Open Mail Manager in the sidebar.", "Open a message; mark it read."]),
  rewards: T(20, "Vidysea Credits ledger.", ["Open Rewards.", "Earn credits by shortlisting and starting applications."]),
};

interface RouteSeed extends ToolSeed {
  path: string;
  label?: string;
  auth: "public" | "student";
}
const SERVICE_STEPS = ["Open the service page.", "Read what is offered.", "Fill the enquiry form."];
const R = (row: number, path: string, auth: "public" | "student", purpose: string, steps: string[], label?: string): RouteSeed => ({ row, path, auth, purpose, steps, ...(label === undefined ? {} : { label }) });
const ROUTE_SEEDS: RouteSeed[] = [
  R(2, "/search", "public", "University search page with filters (country scope, fees, ranking); the query box must be filled first.", ["Open the site search or the portal search box.", "Type the question.", "Use Filters (country tab, fees, ranking).", "Open a university and pick a programme.", "Shortlist it or add it to compare."], "University Search"),
  R(3, "/ai-university-finder-study-abroad", "public", "AI University Finder: a preference chat that builds your preferences.", ["Open AI University Finder.", "Answer the preference questions.", "Save the preferences."], "AI University Finder"),
  R(3, "/student/recommendation", "student", "AI Recommendations: ranked programmes from your saved preferences.", ["Save preferences in the AI University Finder.", "Open Recommendations.", "Shortlist the programmes you like."], "AI Recommendations"),
  R(7, "/course-compare", "public", "Compare programmes side by side.", ["Pick programmes to compare.", "Review the table."], "Course Compare"),
  R(7, "/college-compare", "public", "Compare colleges side by side.", ["Pick colleges to compare.", "Review the table."], "College Compare"),
  R(4, "/country/[slug]", "public", "Country guide: static content per country.", ["Open Countries.", "Pick the country.", "Read the sections and FAQs."], "Country guides"),
  R(18, "/services/counselling-for-study-abroad", "public", "Counselling service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/study-visa-assistance", "public", "Visa assistance service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/study-abroad-student-loan-assistance", "public", "Student loan assistance service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/scholarship-assistance-for-students-studying-abroad", "public", "Scholarship assistance service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/test-preparation-to-study-abroad", "public", "Test preparation service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/board-recommender", "public", "Board recommender service page and enquiry form.", SERVICE_STEPS),
  R(18, "/services/overseas-education-consultant", "public", "Overseas education consultant service page and enquiry form.", SERVICE_STEPS),
];
const INVENTORY = "qa/evidence/t057/tool-first-inventory.md";

/** The frontend half: the hub's section tools plus the seeded real-route tools the catalogue holds, with reviewed purpose/steps merged in. Pure. */
export function buildFrontendKg(files: RepoFile[], catalogue: NavCatalogue, source: KgSource): FrontendKg {
  const hub = parseStudentHub(files);
  const diagnostics = [...hub.diagnostics];
  const tools = hub.tools.map((t): ProductTool => {
    const seed = t.key === undefined ? undefined : SECTION_SEEDS[t.key];
    const blob = source.files[t.source.file];
    return {
      ...t,
      source: { ...t.source, ...(blob === undefined ? {} : { blob }) },
      ...(seed === undefined ? {} : { auth: "student" as const, purpose: seed.purpose, steps: [...seed.steps], seed: `${INVENTORY}#${seed.row}` }),
    };
  });
  if (tools.length > 0) {
    const have = new Set(tools.map((t) => t.key));
    for (const key of Object.keys(SECTION_SEEDS)) {
      if (!have.has(key)) diagnostics.push({ code: "seed_section_missing", file: STUDENT_HUB_FILES.navigation, message: `reviewed seed for section ${key} has no matching section in the repo` });
    }
  }
  for (const seed of ROUTE_SEEDS) {
    const route = catalogue.routes.find((r) => r.path === seed.path);
    if (route === undefined) {
      diagnostics.push({ code: "seed_route_missing", file: "nav_catalogue", message: `reviewed seed for route ${seed.path} is not in the route catalogue; not added` });
      continue;
    }
    const label = route.label ?? seed.label;
    const blob = source.files[route.file];
    tools.push({
      id: `route:${seed.path}`,
      kind: "route",
      route: seed.path,
      ...(label === undefined ? {} : { label }),
      purpose: seed.purpose,
      steps: [...seed.steps],
      auth: seed.auth,
      source: { file: route.file, ...(blob === undefined ? {} : { blob }) },
      seed: `${INVENTORY}#${seed.row}`,
    });
  }
  return { version: 1, tools, diagnostics, source };
}

/** Resolve the two stored halves by tool id: each tool with the tables it writes (owner key, verified flag), every table with whether VC may read it, and edges that point nowhere. */
export function joinProductKg(front: FrontendKg, back: BackendKg): ProductKg {
  const toolIds = new Set(front.tools.map((t) => t.id));
  const vcReads = new Set(back.readEdges.map((e) => e.table));
  const tables: ProductKg["tables"] = {};
  for (const [name, t] of Object.entries(back.tables)) Object.defineProperty(tables, name, { value: { ...(t as ModelTable), vcReads: vcReads.has(name) }, enumerable: true, writable: true, configurable: true });
  const danglingEdges = back.toolEdges.filter((e) => !e.tableFound || !toolIds.has(e.tool));
  const tools = front.tools.map((t) => ({
    ...t,
    writes: back.toolEdges
      .filter((e) => e.tool === t.id && e.tableFound)
      .map((e) => {
        const verifiedBy = e.verifiedBy ?? (e.writerFound ? "router" : "none"); // an artifact stored before kg-fix-1 has no verifiedBy
        return { table: e.table, ...(back.tables[e.table]?.ownerKey === undefined ? {} : { owner: back.tables[e.table]!.ownerKey! }), verified: verifiedBy === "router" || verifiedBy === "service", definedInModel: verifiedBy === "model", verifiedBy, seed: e.seed };
      }),
  }));
  return { tools, tables, danglingEdges };
}

/** A graph summary for the keep-last-good check: the counts are all it looks at (a FrontendKg has `tools`, a BackendKg has `tables`; extra keys are fine). */
export interface KgShape {
  tools?: readonly unknown[];
  tables?: Readonly<Record<string, unknown>> | readonly unknown[];
  /** Files the sync could not read (the sync's `skipped` count). */
  skipped?: number;
}
export interface KeepLastGood {
  keep: boolean;
  reasons: string[];
}
/** The largest drop in tools or tables a sync may store without a human looking (30%). */
export const KG_MAX_SHRINK = 0.3;

function kgCount(v: readonly unknown[] | Readonly<Record<string, unknown>> | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v.length : Object.keys(v as Record<string, unknown>).length;
}

/**
 * Should the sync keep the stored (last good) graph instead of replacing it with `next`? Pure; the sync route decides what to do with the answer.
 * Keep when: there is no graph at all or it is empty (no tools and no tables) ["no_graph" | "empty_graph"]; tools or tables shrank by more than
 * `maxShrink` (default 30%) against `prev` ["tools_shrank" | "tables_shrank"]; any file was skipped (`opts.skipped` or `next.skipped`) ["skipped_files"].
 * With no `prev` there is nothing to keep, so only a missing/empty graph is kept out (never store an empty graph); skipped files alone are reported
 * in `reasons` but do not block the very first graph. A dimension `prev` has and `next` lacks counts as shrunk to zero.
 */
export function shouldKeepLastGood(prev: KgShape | null | undefined, next: KgShape | null | undefined, opts: { skipped?: number; maxShrink?: number } = {}): KeepLastGood {
  const reasons: string[] = [];
  if (next === null || next === undefined) return { keep: true, reasons: ["no_graph"] };
  const nTools = kgCount(next.tools);
  const nTables = kgCount(next.tables);
  if ((nTools ?? 0) === 0 && (nTables ?? 0) === 0) reasons.push("empty_graph");
  const limit = opts.maxShrink ?? KG_MAX_SHRINK;
  const hasPrev = prev !== null && prev !== undefined;
  if (hasPrev) {
    for (const [name, p, n] of [["tools", kgCount(prev.tools), nTools], ["tables", kgCount(prev.tables), nTables]] as const) {
      if (p !== undefined && p > 0 && (p - (n ?? 0)) / p > limit) reasons.push(`${name}_shrank`);
    }
  }
  const skipped = opts.skipped ?? next.skipped ?? 0;
  if (Number.isFinite(skipped) && skipped > 0) reasons.push("skipped_files");
  const keep = hasPrev ? reasons.length > 0 : reasons.includes("empty_graph");
  return { keep, reasons };
}
