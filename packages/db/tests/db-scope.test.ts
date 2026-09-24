/**
 * B12 static proof: the ONLY source file allowed to call the mongodb driver's
 * `client.db(` is packages/db/src/client.ts. Every other .ts source file under
 * packages/**, apps/** and mcp/** (excluding node_modules, dist, and any
 * "tests" directory or *.test.ts file) is grepped for the literal substring
 * ".db(" and must not contain it. This is a repo-wide guard, not a
 * packages/db-only one — it fails the build the moment any future module
 * reaches for the driver directly instead of going through getVcDb/connectFromEnv.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// packages/db/tests -> repo root
const repoRoot = join(here, "..", "..", "..");

const SCAN_DIRS = ["packages", "apps", "mcp"];
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "tests"]);
const ALLOWED_RELATIVE_PATH = "packages/db/src/client.ts";

function listTsSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory may legitimately not exist yet
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      listTsSourceFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

test("B12: no module outside packages/db/src/client.ts calls `.db(`", () => {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    const files = listTsSourceFiles(join(repoRoot, dir));
    for (const file of files) {
      const relPath = relative(repoRoot, file).split(sep).join("/");
      if (relPath === ALLOWED_RELATIVE_PATH) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes(".db(")) offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `.db( found outside the helper in: ${offenders.join(", ")}`);
});

test("sanity: the scanner actually walks packages/db/src (finds at least client.ts + collections.ts)", () => {
  const files = listTsSourceFiles(join(repoRoot, "packages", "db", "src")).map((f) =>
    relative(repoRoot, f).split(sep).join("/"),
  );
  assert.ok(files.includes("packages/db/src/client.ts"));
  assert.ok(files.includes("packages/db/src/collections.ts"));
});
