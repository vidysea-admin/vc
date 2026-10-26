/**
 * Next.js App Router path parser (spec S4, VA11).
 *
 * parseNextAppRoutes(paths) takes repo file PATHS (no file contents) and returns the navigation
 * catalogue of `src/app/**` page routes. Pure and deterministic: route groups "(name)" are stripped
 * from the URL and kept as metadata; dynamic "[id]", catch-all "[...slug]" and optional catch-all
 * "[[...slug]]" segments are kept verbatim; api/ trees, private "_folders", parallel "@slots" and
 * intercepting "(.)x" folders produce no route; only page.{js,jsx,ts,tsx} files count.
 */
import type { NavCatalogue, NavRoute } from "./types.js";

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
