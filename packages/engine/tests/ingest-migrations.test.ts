// VA10: parseSequelizeMigrations over tests/fixtures/ingest/migrations.
// Scenario for each test: an admin syncs a GitHub source whose migrations/ folder reaches the parser
// (fetchRepoFiles output order is not guaranteed, files can be malformed, hostile or huge).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSequelizeMigrations } from "../src/ingest/migrations.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "fixtures", "ingest", "migrations");

function load(dir: string, only?: string[]): { path: string; content: string }[] {
  return readdirSync(join(FIX, dir))
    .filter((f) => !only || only.includes(f))
    .map((f) => ({ path: `migrations/${f}`, content: readFileSync(join(FIX, dir, f), "utf8") }));
}
const OK = (n: number) => load("ok").slice(0, n);

test("empty list returns an empty schema map with no diagnostics", () => {
  const r = parseSequelizeMigrations([]);
  assert.deepEqual(r.tables, {});
  assert.deepEqual(r.diagnostics, []);
});

test("createTable: columns, types, allowNull; down() is never applied", () => {
  const r = parseSequelizeMigrations(OK(1));
  assert.deepEqual(r.diagnostics, []);
  const users = r.tables["users"]!;
  assert.deepEqual(Object.keys(users.columns), ["id", "name", "email", "role", "createdAt"]);
  assert.deepEqual(users.columns["id"], { type: "INTEGER", allowNull: false });
  assert.deepEqual(users.columns["name"], { type: "STRING(100)", allowNull: false });
  assert.deepEqual(users.columns["email"], { type: "STRING" });
  assert.deepEqual(users.columns["role"], { type: "ENUM('student', 'counsellor')" });
  assert.deepEqual(users.columns["createdAt"], { type: "DATE", allowNull: false });
  assert.deepEqual(users.sourceFiles, ["migrations/20240101000000-create-users.js"]);
});

test("filename order, not input order: reversed and shuffled input give the identical map", () => {
  const files = OK(5);
  const forward = parseSequelizeMigrations(files);
  const reversed = parseSequelizeMigrations([...files].reverse());
  const shuffled = parseSequelizeMigrations([files[3]!, files[0]!, files[4]!, files[2]!, files[1]!]);
  assert.deepEqual(reversed, forward);
  assert.deepEqual(shuffled, forward);
  assert.ok(forward.tables["users"], "users exists even though add/rename come before it in the reversed input");
});

test("create + add + rename + drop sequence", () => {
  const r = parseSequelizeMigrations(OK(5));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.tables["posts"], undefined, "dropped table is absent");
  const users = r.tables["users"]!;
  assert.equal(users.columns["name"], undefined, "old name gone after rename");
  assert.deepEqual(users.columns["full_name"], { type: "STRING(100)", allowNull: false }, "rename keeps the type");
  assert.deepEqual(users.columns["age"], { type: "INTEGER", allowNull: true });
  assert.deepEqual(users.sourceFiles, [
    "migrations/20240101000000-create-users.js",
    "migrations/20240102000000-add-user-age.js",
    "migrations/20240103000000-rename-user-name.js",
  ]);
});

test("a table created inside a transaction wrapper with an object table name is found", () => {
  const posts = parseSequelizeMigrations(OK(4)).tables["posts"]!;
  assert.deepEqual(Object.keys(posts.columns), ["id", "user_id", "body"]);
  assert.deepEqual(posts.columns["id"], { type: "UUID" });
  assert.deepEqual(posts.sourceFiles, ["migrations/20240104000000-create-posts.js"]);
});

test("a dropped table's drop migration is not listed on any surviving table", () => {
  const r = parseSequelizeMigrations(OK(5));
  for (const t of Object.values(r.tables)) assert.ok(!t.sourceFiles.some((f) => f.includes("drop-posts")));
});

test("removeColumn drops the column", () => {
  const r = parseSequelizeMigrations([
    ...OK(2),
    {
      path: "migrations/20240106000000-remove-age.js",
      content: "module.exports={up:async(queryInterface)=>{await queryInterface.removeColumn('users','age');}}",
    },
  ]);
  assert.equal(r.tables["users"]!.columns["age"], undefined);
  assert.equal(r.tables["users"]!.sourceFiles.length, 3);
});

test("malformed file is skipped and reported, the rest still parse", () => {
  const r = parseSequelizeMigrations([...OK(2), ...load("bad", ["malformed.js"])]);
  assert.equal(r.tables["ghost"], undefined);
  assert.ok(r.tables["users"]!.columns["age"], "good files still applied");
  assert.equal(r.diagnostics.length, 1);
  assert.equal(r.diagnostics[0]!.code, "parse_error");
  assert.equal(r.diagnostics[0]!.file, "migrations/malformed.js");
});

test("file with no up() is reported, and its down() is not applied", () => {
  const r = parseSequelizeMigrations([...OK(1), ...load("bad", ["no-up.js"])]);
  assert.ok(r.tables["users"], "users was not dropped by the down() in no-up.js");
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["no_up"]);
});

test("unknown methods are ignored with a diagnostic; known calls in the same file still apply", () => {
  const r = parseSequelizeMigrations([...OK(1), ...load("bad", ["unknown-method.js"])]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["unknown_method", "unknown_method"]);
  assert.match(r.diagnostics[0]!.message, /bulkInsert/);
  assert.match(r.diagnostics[1]!.message, /changeColumn/);
  assert.deepEqual(r.tables["users"]!.columns["email"], { type: "STRING" }, "changeColumn did not alter anything");
  assert.deepEqual(r.tables["users"]!.columns["nickname"], { type: "STRING" }, "addColumn after the unknown calls applied");
});

test("operations on a table that does not exist are reported", () => {
  const r = parseSequelizeMigrations([
    {
      path: "m/1.js",
      content:
        "module.exports={up:async(queryInterface,S)=>{await queryInterface.addColumn('nope','a',{type:S.TEXT});await queryInterface.dropTable('nope');}}",
    },
  ]);
  assert.deepEqual(r.tables, {});
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["missing_table", "missing_table"]);
});

test("non-literal arguments are reported and skipped", () => {
  const r = parseSequelizeMigrations([
    {
      path: "m/1.js",
      content:
        "const T='users';module.exports={up:async(queryInterface,S)=>{await queryInterface.createTable(T,{id:{type:S.INTEGER}});await queryInterface.createTable('ok',{id:{type:S.INTEGER}});}}",
    },
  ]);
  assert.deepEqual(Object.keys(r.tables), ["ok"]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["unresolved_args"]);
});

test("a hostile column or table name like __proto__ is a plain own key, not a prototype write", () => {
  const r = parseSequelizeMigrations([
    {
      path: "m/1.js",
      content:
        "module.exports={up:async(queryInterface,S)=>{await queryInterface.createTable('__proto__',{'__proto__':{type:S.TEXT},constructor:{type:S.TEXT}});}}",
    },
  ]);
  assert.ok(Object.hasOwn(r.tables, "__proto__"));
  const t = Object.getOwnPropertyDescriptor(r.tables, "__proto__")!.value as { columns: Record<string, unknown> };
  assert.deepEqual(Object.keys(t.columns), ["__proto__", "constructor"]);
  assert.equal(Object.getPrototypeOf(t.columns), Object.prototype);
  assert.equal(Object.getPrototypeOf(r.tables), Object.prototype);
  assert.equal(({} as Record<string, unknown>)["type"], undefined, "Object.prototype not polluted");
});

test("non-string path or content entries are reported, not thrown", () => {
  const r = parseSequelizeMigrations([{ path: 1, content: "x" }, { path: "a.js", content: null }, null] as never);
  assert.deepEqual(r.tables, {});
  assert.equal(r.diagnostics.length, 3);
});

test("regex literals, comments and template strings holding braces do not derail the scan", () => {
  const content = [
    "// up: { not code",
    "/* up() { */",
    "const re = /['\"{(]/g;",
    "module.exports = {",
    "  up: async (queryInterface, Sequelize) => {",
    "    const note = `has ${'{'} and a ) paren`;",
    "    await queryInterface.createTable('t', { a: { type: Sequelize.TEXT, allowNull: true } });",
    "  },",
    "};",
  ].join("\n");
  const r = parseSequelizeMigrations([{ path: "m/1.js", content }]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.tables["t"]!.columns["a"], { type: "TEXT", allowNull: true });
});

test("TypeScript-style signature and exported function form are understood", () => {
  const content =
    "export async function up(queryInterface: QueryInterface, Sequelize: typeof DataTypes): Promise<void> {\n" +
    "  await queryInterface.createTable('ts_t', { id: { type: Sequelize.INTEGER } });\n}\n" +
    "export async function down(queryInterface: QueryInterface) { await queryInterface.dropTable('ts_t'); }\n";
  const r = parseSequelizeMigrations([{ path: "m/1.ts", content }]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.tables), ["ts_t"]);
});

test("1 MB migration completes within 2 s", () => {
  const calls: string[] = [];
  let size = 0;
  for (let i = 0; size < 1_000_000; i++) {
    const c = `    await queryInterface.addColumn('big', 'c${i}', { type: Sequelize.STRING(255), allowNull: true });\n`;
    calls.push(c);
    size += c.length;
  }
  const content =
    "module.exports = {\n  async up(queryInterface, Sequelize) {\n" +
    "    await queryInterface.createTable('big', { id: { type: Sequelize.INTEGER } });\n" +
    calls.join("") +
    "  },\n};\n";
  assert.ok(content.length >= 1_000_000);
  const t0 = performance.now();
  const r = parseSequelizeMigrations([{ path: "migrations/1.js", content }]);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `took ${ms}ms`);
  assert.equal(Object.keys(r.tables["big"]!.columns).length, calls.length + 1);
});

test("1 MB hostile inputs (deep nesting, unterminated string/comment/template) neither throw nor hang", () => {
  const MB = 1_000_000;
  const hostile: { path: string; content: string }[] = [
    { path: "h/deep-open.js", content: "module.exports={up:async(q)=>{" + "{".repeat(MB) },
    {
      path: "h/deep-both.js",
      content: "module.exports={up:async(q)=>{q.createTable('t',{a:" + "[".repeat(MB / 2) + "]".repeat(MB / 2) + "})}}",
    },
    { path: "h/unterminated-string.js", content: "module.exports={up:async(q)=>{q.dropTable('" + "a".repeat(MB) },
    { path: "h/unterminated-comment.js", content: "/*" + "x".repeat(MB) },
    { path: "h/template-nest.js", content: "x=" + "`${".repeat(MB / 3) },
    { path: "h/binary.js", content: "\u0000\u0001\u0002".repeat(MB / 3) },
  ];
  const t0 = performance.now();
  const r = parseSequelizeMigrations(hostile);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `took ${ms}ms`);
  assert.deepEqual(r.tables, {});
  assert.equal(r.diagnostics.length, hostile.length, "every hostile file is reported, none silently skipped");
});

test("content beyond the hard size cap is skipped with a diagnostic", () => {
  const r = parseSequelizeMigrations([{ path: "h/huge.js", content: " ".repeat(6_000_000) }]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["too_large"]);
});

test("the parser executes nothing: a migration with side effects leaves no trace", () => {
  const g = globalThis as Record<string, unknown>;
  g["__ingest_pwned"] = undefined;
  const content =
    "globalThis.__ingest_pwned = true; module.exports={up:async(queryInterface)=>{globalThis.__ingest_pwned = true; await queryInterface.dropTable(process.exit(3));}}";
  parseSequelizeMigrations([{ path: "m/evil.js", content }]);
  assert.equal(g["__ingest_pwned"], undefined);
});
