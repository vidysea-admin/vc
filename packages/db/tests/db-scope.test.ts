/**
 * B12 static proof: the ONLY source file allowed to call the mongodb driver's
 * `client.db(` is packages/db/src/client.ts. Every other source file under
 * packages/**, apps/** and mcp/** (excluding node_modules, dist, any "tests"
 * directory, and *.test./*.spec. files — see SOURCE_EXTENSIONS/TEST_MARKERS
 * below) is scanned for a direct call to a `db` property and must not contain
 * one. This is a repo-wide guard, not a packages/db-only one — it fails the
 * build the moment any future module reaches for the driver directly instead
 * of going through getVcDb/connectFromEnv.
 *
 * ISS-t-003-student-kg-1: the original scanner matched only the literal
 * substring ".db(" in files whose name ended in the literal string ".ts",
 * which a checker showed misses three obfuscated-but-real variants:
 *   - whitespace before the call: `client.db ("x")`
 *   - bracket property access: `client["db"]("x")` / `client['db']("x")`
 *   - non-".ts" TypeScript source: `.mts`, `.cts`, `.tsx`
 * `containsDirectDbCall` and `isScannableSourceFile` below are exercised
 * directly (in-memory string fixtures) so each variant has its own
 * regression test, independent of what currently happens to exist on disk.
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

const SOURCE_EXTENSIONS = [".ts", ".mts", ".cts", ".tsx"];
const TEST_MARKERS = [".test.", ".spec."];

/** True for a TypeScript/TSX source file that isn't itself a test/spec file. */
function isScannableSourceFile(name: string): boolean {
  const hasSourceExtension = SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasSourceExtension) return false;
  if (TEST_MARKERS.some((marker) => name.includes(marker))) return false;
  return true;
}

// Matches `.db(`, tolerant of whitespace before the parenthesis:
// `.db(`, `.db (`, `.db  (`.
const DOT_DB_CALL_PATTERN = /\.db\s*\(/;
// Matches bracket property access calling "db": `["db"](`, `['db'](`,
// with optional whitespace around the brackets/quotes.
const BRACKET_DB_CALL_PATTERN = /\[\s*(["'`])db\1\s*\]\s*\(/;

/** True if `content` contains a direct call to a `db` property, dot or bracket form. */
function containsDirectDbCall(content: string): boolean {
  return DOT_DB_CALL_PATTERN.test(content) || BRACKET_DB_CALL_PATTERN.test(content);
}

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
    } else if (isScannableSourceFile(entry)) {
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
      if (containsDirectDbCall(content)) offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `.db( found outside the helper in: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// ISS-t-003-student-kg-1: regression fixtures for each variant the original
// substring/extension check missed.
// ---------------------------------------------------------------------------

test("B12 scanner: catches `.db(` with whitespace before the call", () => {
  assert.equal(containsDirectDbCall('const x = client.db ("oops");'), true);
  assert.equal(containsDirectDbCall("const x = client.db   (\"oops\");"), true);
});

test('B12 scanner: catches bracket property access client["db"](', () => {
  assert.equal(containsDirectDbCall('const x = client["db"]("oops");'), true);
});

test("B12 scanner: catches bracket property access with single quotes client['db'](", () => {
  assert.equal(containsDirectDbCall("const x = client['db']('oops');"), true);
});

test("B12 scanner: catches bracket property access with backticks and internal whitespace", () => {
  assert.equal(containsDirectDbCall("const x = client[ `db` ] (\"oops\");"), true);
});

test("B12 scanner: does not flag unrelated `.db` usage that isn't a call (e.g. a property read)", () => {
  assert.equal(containsDirectDbCall("const name = someConfig.dbName;"), false);
  assert.equal(containsDirectDbCall("const isDb = row.db;"), false);
});

test("B12 scanner: file filter now includes .mts/.cts/.tsx and excludes .test./.spec. variants", () => {
  assert.equal(isScannableSourceFile("client.ts"), true);
  assert.equal(isScannableSourceFile("client.mts"), true);
  assert.equal(isScannableSourceFile("client.cts"), true);
  assert.equal(isScannableSourceFile("widget.tsx"), true);
  assert.equal(isScannableSourceFile("client.test.ts"), false);
  assert.equal(isScannableSourceFile("client.spec.ts"), false);
  assert.equal(isScannableSourceFile("README.md"), false);
  assert.equal(isScannableSourceFile("client.d.ts"), true, "declaration files are still .ts source");
});

test("sanity: the scanner actually walks packages/db/src (finds at least client.ts + collections.ts)", () => {
  const files = listTsSourceFiles(join(repoRoot, "packages", "db", "src")).map((f) =>
    relative(repoRoot, f).split(sep).join("/"),
  );
  assert.ok(files.includes("packages/db/src/client.ts"));
  assert.ok(files.includes("packages/db/src/collections.ts"));
});
