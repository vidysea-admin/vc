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

// ---------------------------------------------------------------------------
// ISS-t-011-c2-rev-2 / D-016: the fence-writer discipline, enforced like B12.
//
// The erasure fence (D-015/D-016) binds only writers that check it. A raw write to a student-data
// collection from any other module would silently reopen ISS-t-011-c1-1 (a write the non-atomic
// read-back can miss). So: every source file under packages/**/src, mcp/**/src and apps/**/src
// that BOTH references a student-data collection AND mentions a write must be on the explicit
// fence-aware allowlist below (with the reason it is safe). Conservative on purpose: a mention in
// a comment counts, and a dynamic `collection(<expr>)` counts as a student-data reference, so a
// false positive forces a review instead of a silent hole.
// Residual (same class as B12): a method name assembled at runtime from variables can not be proven
// statically; concatenated string-literal keys (`x["insert" + "One"]`) and \u escapes ARE caught.
// ---------------------------------------------------------------------------

const FENCE_SCAN_DIRS = ["packages", "mcp", "apps"];

/** file -> why its writes are fence-aware. Adding a file here is a reviewed decision. */
const FENCE_AWARE_WRITERS: Record<string, string> = {
  "packages/db/src/facts.ts":
    "applyApprovedDiff: pre-check, writes under FENCED_WRITER_DEADLINE_MS (driver timeoutMS + app deadline), finally post-check + compensation (D-015/D-016). " +
    "T-016 ensureScribeSessionRow: called only from scribe/graph.ts (start under its deadline + fence pre-check, row compensated by invokeFenceAware). " +
    "T-024 recordSessionTranscript: same discipline as ensureScribeSessionRow — called only from scribe/graph.ts startScribe under its deadline + fence pre-check; the turn documents it CREATED are deleted by invokeFenceAware's compensation. " +
    "ISS-t-016-rev-1: recordApprovedSessionSummary is now fence-aware on its OWN (pre-check + writes under a WriterDeadline + finally post-check that unsets exactly the fields it wrote, matched on its own summaryApprovedAt), mirroring applyApprovedDiff — but that ONLY covers a fence that exists by the time its own post-check runs. " +
    "ISS-t-017-rev-1: a fence confirmed strictly AFTER that post-check, but before or during the applyApprovedDiff call right after it, was invisible to either write alone and left the summary behind for executeErasure to find; exporting `undoApprovedSessionSummary` (same match-key undo) lets the caller (writeApproved, nodes.ts, on the fence-aware allowlist below) close that window too, so the full two-write approval path now leaves zero summary residue on any `fenced` outcome",
  "packages/db/src/erasure.ts": "the erasure purge itself (deletes under the fence) plus the fence and audit rows",
  "packages/db/src/decisions.ts":
    "T-018 recordRejectReasons: pre-check, a WriterDeadline-bounded insert into `decisions` (a deterministic _id, so a checkpoint replay collides idempotently rather than duplicating), finally post-check + compensation that deletes exactly the document this call inserted (D-015/D-016, mirroring facts.ts's recordApprovedSessionSummary)",
  "packages/engine/src/scribe/graph.ts":
    "startScribe/resumeScribe: session row, claim insert (+ run lease) and graph.invoke under the writer deadline, finally post-check + compensation (invokeFenceAware)",
  "packages/engine/src/scribe/checkpointer.ts":
    "constructs the MongoDBSaver; its checkpoint writes run only inside graph.invoke, which graph.ts wraps fence-aware",
  "packages/db/src/tenant.ts":
    "T-025 tenant scope (B21): a pass-through wrapper that initiates no write of its own. It only forwards a caller's " +
    "operation with tenantId stamped / filtered and string _ids tenant-prefixed, so every write through it is the " +
    "caller's write, and every caller that writes student data (facts.ts, erasure.ts, decisions.ts, scribe/graph.ts, " +
    "the checkpoint saver) is itself on this allowlist. Unsupported operations throw instead of being forwarded",
};

const STUDENT_DATA_COLLECTIONS = [
  "students",
  "sessions",
  "facts",
  "decisions",
  "consents",
  "edges",
  "scribe_resolutions",
  "scribe_checkpoints",
  "scribe_checkpoint_writes",
  "session_transcripts",
];
const STUDENT_DATA_ACCESSORS = [
  "studentsCollection",
  "sessionsCollection",
  "factsCollection",
  "decisionsCollection",
  "consentsCollection",
  "edgesCollection",
  "scribeResolutionsCollection",
  "sessionTranscriptsCollection",
];
const WRITE_METHODS = [
  "insertOne",
  "insertMany",
  "updateOne",
  "updateMany",
  "replaceOne",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
  "deleteOne",
  "deleteMany",
  "bulkWrite",
];

const names = STUDENT_DATA_COLLECTIONS.join("|");
/** A call of the `collection` member: `.collection`, `?.collection`, `["collection"]`, optionally generic. No capture groups. */
const COLLECTION_CALL = `(?:\\??\\.\\s*collection|\\[\\s*(?:"collection"|'collection'|\`collection\`)\\s*\\])\\s*(?:<[^>]*>)?`;
const STUDENT_DATA_PATTERNS = [
  new RegExp(`\\b(${STUDENT_DATA_ACCESSORS.join("|")})\\b`),
  new RegExp(`COLLECTION_NAMES\\s*(\\?\\.|\\.)\\s*(${names})\\b`),
  new RegExp(`COLLECTION_NAMES\\s*(\\?\\.)?\\s*\\[\\s*(["'\`])(${names})\\2\\s*\\]`),
  // db.collection("facts") / db?.collection<T>('facts') / db["collection"]("facts")
  new RegExp(`${COLLECTION_CALL}\\s*\\(\\s*(["'\`])(${names})\\1`),
  // a collection whose name is not a literal: unknown, so treated as student data
  new RegExp(`${COLLECTION_CALL}\\s*\\(\\s*(?!["'\`)\\s])`),
  /\b(MongoDBSaver|SCRIBE_CHECKPOINT_COLLECTIONS)\b/,
];
const WRITE_PATTERNS = [
  new RegExp(`\\b(${WRITE_METHODS.join("|")})\\b`),
  /\blink\s*\(/, // @vc/db link(): an edges upsert
  /\bnew\s+MongoDBSaver\b/,
  /\[\s*(["'`])[^"'`]*\1\s*\+/, // x["insert" + "One"]: a concatenated member name
];

/** Resolves `\uXXXX` / `\u{X}` identifier escapes, so `insertOne` reads as `insertOne`. */
function unescapeIdentifiers(content: string): string {
  return content
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** True if `content` writes (or may write) to a student-data collection. */
function writesStudentData(content: string): boolean {
  const code = unescapeIdentifiers(content);
  return STUDENT_DATA_PATTERNS.some((p) => p.test(code)) && WRITE_PATTERNS.some((p) => p.test(code));
}

function listFenceScanFiles(): string[] {
  const out: string[] = [];
  for (const top of FENCE_SCAN_DIRS) {
    let pkgs: string[] = [];
    try {
      pkgs = readdirSync(join(repoRoot, top));
    } catch {
      continue;
    }
    for (const pkg of pkgs) {
      const src = join(repoRoot, top, pkg, "src");
      try {
        if (!statSync(src).isDirectory()) continue;
      } catch {
        continue;
      }
      listTsSourceFiles(src, out);
    }
  }
  return out.map((f) => relative(repoRoot, f).split(sep).join("/"));
}

test("D-016 / ISS-t-011-c2-rev-2: only allowlisted fence-aware modules write to student-data collections (packages|mcp|apps/**/src)", () => {
  const writers = listFenceScanFiles().filter((rel) => writesStudentData(readFileSync(join(repoRoot, rel), "utf8")));
  const offenders = writers.filter((rel) => !(rel in FENCE_AWARE_WRITERS));
  assert.deepEqual(offenders, [], `student-data writes outside the fence-aware allowlist: ${offenders.join(", ")}`);
  // The allowlist stays honest: every entry exists and really is a writer (no stale exemptions).
  assert.deepEqual([...writers].sort(), Object.keys(FENCE_AWARE_WRITERS).sort());
});

test("D-016 scanner: hostile variants are caught (bracket, whitespace, optional chaining, bind alias, raw and dynamic collection(), link(), saver, \\u escape, concatenated key)", () => {
  const hostile = [
    "const c = factsCollection(db); await c.insertOne(doc);",
    'await factsCollection(db)["insertOne"](doc);',
    "await edgesCollection(db) ?. updateOne ({ _id }, u);",
    "const del = sessionsCollection(db).deleteMany.bind(x); await del({});",
    'await db.collection("facts").bulkWrite(ops);',
    "await db.collection<FactDoc>('students').replaceOne(f, d);",
    "await db.collection(name).insertMany(docs);",
    "await db.collection(COLLECTION_NAMES.consents).updateMany(f, u);",
    'await db.collection(COLLECTION_NAMES["decisions"]).findOneAndUpdate(f, u);',
    'await db["collection"]("sessions").deleteOne(f);',
    "await db?.collection(`edges`).insertOne(e);",
    "await link(edgesCollection(db), from, to, 'has');",
    "const saver = new MongoDBSaver({ client });",
    "await factsCollection(db).insert\\u004Fne(doc);",
    'await scribeResolutionsCollection(db)["insert" + "One"](doc);',
    "const { deleteOne } = consentsCollection(db);",
  ];
  for (const code of hostile) assert.equal(writesStudentData(code), true, code);
});

test("D-016 scanner: no false positive for read-only access or for a write to a non-student collection", () => {
  const benign = [
    "const docs = await factsCollection(db).find({ studentId }).toArray();",
    "const n = await edgesCollection(db).countDocuments({});",
    'await db.collection("courses").insertOne(course);',
    "export const x = 1;",
    "/** the `edges` collection (ARCHITECTURE.md H3), written by link() elsewhere */ export type T = 1;",
  ];
  for (const code of benign) assert.equal(writesStudentData(code), false, code);
});
