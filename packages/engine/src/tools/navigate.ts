/**
 * vc-admin-control VA14 (spec S6): the `navigate_steps` tool. Given the navigation catalogue (spec S4: the routes of the host site's app,
 * built at sync time, never read at chat time) and a free-text intent, it returns ordered TEXT steps and the routes they name.
 *
 *  - Every returned route is a path that is present in the supplied catalogue (and shaped like a same-site path). The intent text is only
 *    ever used to SCORE catalogue routes; no part of it is copied into an output step, so a hostile intent (an absolute URL, `../`,
 *    `javascript:`) can not make a step name anything outside the catalogue.
 *  - At most NAVIGATE_MAX_STEPS steps. An unknown intent, or an empty / missing / malformed catalogue, is the fixed
 *    NAVIGATE_UNKNOWN_TEXT with no routes, never an invented route.
 *  - Output is text only: this tool does not click or drive the host site.
 */

export interface NavRoute {
  /** The URL path with route groups stripped, e.g. "/careers/[id]". */
  path: string;
  /** Route-group metadata, e.g. "(admin)". Never part of the URL. */
  group?: string;
  /** The source file the route came from. */
  file?: string;
}

export interface NavCatalogue {
  routes: NavRoute[];
}

export interface NavigateResult {
  steps: string[];
  routes: string[];
}

export const NAVIGATE_UNKNOWN_TEXT = "I don't know that page yet";
export const NAVIGATE_MAX_STEPS = 7;

const INTENT_MAX_CHARS = 500;
const ROUTE_MAX_CHARS = 200;
/** A same-site path: leading "/", segments of URL-safe characters only. No scheme, host, "//", "..", "%", "\" or ":". */
const SAFE_ROUTE = /^\/(?:[A-Za-z0-9._~@()[\]-]+(?:\/[A-Za-z0-9._~@()[\]-]+)*)?$/;

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "for", "and", "or", "is", "are", "am", "i", "me", "my", "mine", "we", "our", "you", "your",
  "do", "does", "can", "could", "would", "should", "how", "where", "what", "which", "when", "show", "see", "view", "open", "go", "get", "take",
  "find", "want", "need", "like", "please", "page", "pages", "screen", "section", "tab", "menu", "link", "site", "website", "app", "portal",
  "navigate", "navigation", "steps", "way", "there", "here", "it", "this", "that", "with", "from", "by", "be", "so", "pathlynks",
]);

function isSafeRoute(path: unknown): path is string {
  return typeof path === "string" && path.length <= ROUTE_MAX_CHARS && SAFE_ROUTE.test(path) && !path.includes("..");
}

const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

function intentTokens(intent: unknown): Set<string> {
  if (typeof intent !== "string") return new Set();
  const words = intent.slice(0, INTENT_MAX_CHARS).normalize("NFKC").toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => w.length >= 2 && !STOPWORDS.has(w)).map(stem));
}

const isDynamic = (segment: string) => segment.startsWith("[");
const segmentsOf = (path: string) => path.split("/").filter(Boolean);

/** Match words of a route: its static segments, split on punctuation. The root route answers to "home". */
function routeTokens(path: string): Set<string> {
  const tokens = new Set<string>();
  const segs = segmentsOf(path);
  if (segs.length === 0) tokens.add("home");
  for (const seg of segs) {
    if (isDynamic(seg)) continue;
    for (const w of seg.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 2) tokens.add(stem(w));
  }
  return tokens;
}

function labelOf(path: string): string {
  const segs = segmentsOf(path);
  const last = segs.at(-1);
  if (last === undefined) return "Home";
  if (isDynamic(last)) return "Details";
  const words = last.replace(/[^A-Za-z0-9]+/g, " ").trim().toLowerCase();
  return words ? words.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : "Next";
}

/** Validated, de-duplicated catalogue paths in catalogue order. Anything that is not a safe same-site path is dropped. */
function usableRoutes(catalogue: unknown): string[] {
  const routes = (catalogue as { routes?: unknown } | null | undefined)?.routes;
  if (!Array.isArray(routes)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of routes) {
    const path = (r as { path?: unknown } | null | undefined)?.path;
    if (isSafeRoute(path) && !seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

const unknown = (): NavigateResult => ({ steps: [NAVIGATE_UNKNOWN_TEXT], routes: [] });

export function navigateSteps(catalogue: NavCatalogue | null | undefined, intent: string): NavigateResult {
  const paths = usableRoutes(catalogue);
  if (paths.length === 0) return unknown();
  const want = intentTokens(intent);
  if (want.size === 0) return unknown();

  let best: { path: string; score: number; depth: number } | undefined;
  for (const path of paths) {
    const have = routeTokens(path);
    let score = 0;
    for (const w of want) if (have.has(w)) score++;
    if (score === 0) continue;
    const depth = segmentsOf(path).length;
    if (!best || score > best.score || (score === best.score && depth < best.depth)) best = { path, score, depth };
  }
  if (!best) return unknown();

  // The chain: every catalogue route that is a path prefix of the target (the root is only the target itself), then the target.
  const inCatalogue = new Set(paths);
  const segs = segmentsOf(best.path);
  const chain: string[] = [];
  for (let i = 1; i < segs.length; i++) {
    const prefix = `/${segs.slice(0, i).join("/")}`;
    if (inCatalogue.has(prefix)) chain.push(prefix);
  }
  chain.push(best.path);
  const routes = chain.slice(-NAVIGATE_MAX_STEPS);

  const steps = routes.map((path, i) => {
    const page = `the ${labelOf(path)} page (${path})`;
    if (routes.length === 1) return `Open ${page}.`;
    if (i === 0) return `Open ${page}.`;
    return i === routes.length - 1 ? `Finally, open ${page}.` : `Then open ${page}.`;
  });
  return { steps, routes };
}
