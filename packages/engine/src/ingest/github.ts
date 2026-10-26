/**
 * Repo file fetch for the admin Sync button (spec S4, VA8/VA9).
 *
 * fetchRepoFiles(port, src, globs) lists a repo tree through an injected GithubPort, keeps the paths
 * that match the globs, and downloads those blobs. It is ONLY called from the sync path; chat never
 * imports this module (VA9b). The token lives inside the injected port and never passes through here;
 * errors raised from this module are built from fixed text plus repo coordinates, never from the
 * port's own error text (which can echo an Authorization header).
 */

export interface GithubTreeEntry {
  path: string;
  /** "blob" for files; "tree" / "commit" entries are ignored. Missing is treated as a blob. */
  type?: string;
  sha?: string;
  size?: number;
}

export interface GithubBlob {
  content: string;
  /** GitHub's blob API returns base64; "utf-8" / "utf8" means content is already text. */
  encoding?: string;
  size?: number;
}

export interface GithubPort {
  listTree(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GithubTreeEntry[] | { tree: GithubTreeEntry[]; truncated?: boolean }>;
  getBlob(owner: string, repo: string, sha: string): Promise<string | GithubBlob>;
}

export interface RepoCoordinates {
  owner: string;
  repo: string;
  branch: string;
}

export type SkipReason = "binary" | "oversize";

export interface FetchRepoOptions {
  /** Per-file byte cap (default 1 MB). Larger blobs are skipped, not truncated. */
  maxBytes?: number;
  /** Max matched files (default 2000); more than that fails closed. */
  maxFiles?: number;
  /** Concurrent blob downloads (default 4). */
  concurrency?: number;
  /** Literal values (for example a token) scrubbed from any error message built here. */
  redact?: string[];
  onSkip?: (path: string, reason: SkipReason) => void;
}

export class GithubFetchError extends Error {
  readonly stage: "listTree" | "getBlob" | "limit" | "glob";
  readonly status?: number;
  constructor(stage: GithubFetchError["stage"], message: string, status?: number) {
    super(message);
    this.name = "GithubFetchError";
    this.stage = stage;
    if (status !== undefined) this.status = status;
  }
}

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_FILES = 2000;
const MAX_GLOB_LEN = 256;
const MAX_GLOB_WILDCARDS = 8;
const MAX_PATH_LEN = 1024;

function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join("[redacted]");
  return out;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599) return s;
  }
  return undefined;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Glob -> anchored regex. Supports * ? ** and one level of {a,b}; everything else is literal. */
function globToRegExp(glob: string): RegExp {
  if (glob.length > MAX_GLOB_LEN) throw new GithubFetchError("glob", `glob longer than ${MAX_GLOB_LEN} chars`);
  const wild = glob.match(/[*?]/g)?.length ?? 0;
  if (wild > MAX_GLOB_WILDCARDS) throw new GithubFetchError("glob", `glob has more than ${MAX_GLOB_WILDCARDS} wildcards`);
  const conv = (g: string): string => {
    let out = "";
    for (let i = 0; i < g.length; i++) {
      const c = g[i]!;
      if (c === "*") {
        if (g[i + 1] === "*") {
          if (g[i + 2] === "/") {
            out += "(?:.*/)?";
            i += 2;
          } else {
            out += ".*";
            i += 1;
          }
        } else out += "[^/]*";
      } else if (c === "?") out += "[^/]";
      else out += escapeRe(c);
    }
    return out;
  };
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const open = glob.indexOf("{", i);
    const close = open < 0 ? -1 : glob.indexOf("}", open);
    if (open < 0 || close < 0) {
      re += conv(glob.slice(i));
      break;
    }
    re += conv(glob.slice(i, open));
    re += "(?:" + glob.slice(open + 1, close).split(",").map(conv).join("|") + ")";
    i = close + 1;
  }
  return new RegExp("^" + re + "$");
}

function compileGlobs(globs: readonly string[]): (path: string) => boolean {
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  for (const g of globs) {
    if (typeof g !== "string" || g.length === 0) continue;
    if (g.startsWith("!")) exclude.push(globToRegExp(g.slice(1)));
    else include.push(globToRegExp(g));
  }
  return (path) => include.some((r) => r.test(path)) && !exclude.some((r) => r.test(path));
}

function unsafePath(p: unknown): boolean {
  if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_LEN || p.startsWith("/") || p.includes("\\")) return true;
  return p.split("/").some((s) => s === ".." || s === "." || s === "");
}

type Decoded = { ok: true; content: string } | { ok: false; reason: SkipReason };

function decode(blob: string | GithubBlob, maxBytes: number): Decoded {
  let bytes: Buffer;
  if (typeof blob === "string") bytes = Buffer.from(blob, "utf8");
  else {
    const enc = (blob.encoding ?? "base64").toLowerCase();
    bytes = enc === "utf-8" || enc === "utf8" ? Buffer.from(blob.content, "utf8") : Buffer.from(blob.content, "base64");
    if (typeof blob.size === "number" && blob.size > maxBytes) return { ok: false, reason: "oversize" };
  }
  if (bytes.length > maxBytes) return { ok: false, reason: "oversize" };
  if (bytes.includes(0)) return { ok: false, reason: "binary" };
  try {
    return { ok: true, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "binary" };
  }
}

export async function fetchRepoFiles(
  port: GithubPort,
  src: RepoCoordinates,
  globs: readonly string[],
  opts: FetchRepoOptions = {},
): Promise<{ path: string; content: string }[]> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const workers = Math.max(1, Math.min(opts.concurrency ?? 4, 16));
  const secrets = opts.redact ?? [];
  const where = scrub(`${src.owner}/${src.repo}@${src.branch}`, secrets);
  const wanted = compileGlobs(globs);

  let listed: Awaited<ReturnType<GithubPort["listTree"]>>;
  try {
    listed = await port.listTree(src.owner, src.repo, src.branch);
  } catch (err) {
    const status = statusOf(err);
    throw new GithubFetchError("listTree", `GitHub listTree failed for ${where}${status ? ` (HTTP ${status})` : ""}`, status);
  }
  const entries = Array.isArray(listed) ? listed : listed?.tree;
  if (!Array.isArray(entries)) throw new GithubFetchError("listTree", `GitHub listTree returned no tree for ${where}`);
  if (!Array.isArray(listed) && listed.truncated) {
    throw new GithubFetchError("listTree", `GitHub tree for ${where} was truncated; refusing a partial listing`);
  }

  const matched = entries
    .filter((e) => e && (e.type === undefined || e.type === "blob") && !unsafePath(e.path) && typeof e.sha === "string" && wanted(e.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (matched.length > maxFiles) {
    throw new GithubFetchError("limit", `${matched.length} files match in ${where}, over the ${maxFiles} file limit`);
  }

  const results: ({ path: string; content: string } | null)[] = new Array(matched.length).fill(null);
  let next = 0;
  let failure: GithubFetchError | null = null;
  const run = async (): Promise<void> => {
    while (failure === null) {
      const idx = next++;
      if (idx >= matched.length) return;
      const entry = matched[idx]!;
      if (typeof entry.size === "number" && entry.size > maxBytes) {
        opts.onSkip?.(entry.path, "oversize");
        continue;
      }
      let blob: string | GithubBlob;
      try {
        blob = await port.getBlob(src.owner, src.repo, entry.sha!);
      } catch (err) {
        const status = statusOf(err);
        failure ??= new GithubFetchError(
          "getBlob",
          `GitHub getBlob failed for ${scrub(entry.path, secrets)} in ${where}${status ? ` (HTTP ${status})` : ""}`,
          status,
        );
        return;
      }
      const d = decode(blob, maxBytes);
      if (!d.ok) opts.onSkip?.(entry.path, d.reason);
      else results[idx] = { path: entry.path, content: d.content };
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, matched.length) }, run));
  if (failure !== null) throw failure;
  return results.filter((r): r is { path: string; content: string } => r !== null);
}
