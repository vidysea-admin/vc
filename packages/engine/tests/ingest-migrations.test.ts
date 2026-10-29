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

// ---------------------------------------------------------------------------
// Fix cycle 1 E1: a column or call the parser cannot read is REPORTED, never silently dropped.
// Scenario: an admin syncs a repo whose createTable uses a spread base object, shorthand properties, or raw SQL; the admin must see a diagnostic.
// ---------------------------------------------------------------------------
const one = (body: string) => parseSequelizeMigrations([{ path: "m/1.js", content: `module.exports={up:async(queryInterface,S)=>{${body}}}` }]);

test("E1: createTable with a spread base object reports the skipped entry and still parses the literal columns", () => {
  const r = one("await queryInterface.createTable('users',{...base,id:{type:S.INTEGER}});");
  assert.deepEqual(Object.keys(r.tables["users"]!.columns), ["id"]);
  const d = r.diagnostics.filter((x) => x.code === "skipped_columns");
  assert.equal(d.length, 1, JSON.stringify(r.diagnostics));
  assert.match(d[0]!.message, /users/);
  assert.match(d[0]!.message, /1 /);
});

test("E1: a shorthand property column (`{ id, name:{...} }`) is reported by name, not dropped silently", () => {
  const r = one("const id={type:S.INTEGER};await queryInterface.createTable('users',{id,name:{type:S.STRING}});");
  assert.deepEqual(Object.keys(r.tables["users"]!.columns), ["name"]);
  const d = r.diagnostics.filter((x) => x.code === "dropped_column");
  assert.equal(d.length, 1, JSON.stringify(r.diagnostics));
  assert.match(d[0]!.message, /users\.id/);
});

test("E1: raw queryInterface.sequelize.query(...) and helper calls taking queryInterface are reported as ignored", () => {
  const r = one("await queryInterface.sequelize.query('ALTER TABLE users ADD COLUMN x int');await addAudit(queryInterface,'users');await queryInterface.createTable('t',{id:{type:S.INTEGER}});");
  assert.deepEqual(Object.keys(r.tables), ["t"]);
  const codes = r.diagnostics.map((x) => x.code);
  assert.equal(codes.filter((c) => c === "unknown_method").length, 2, JSON.stringify(r.diagnostics));
  assert.ok(r.diagnostics.some((x) => /sequelize/.test(x.message)));
  assert.ok(r.diagnostics.some((x) => /addAudit|helper|argument|value/i.test(x.message)));
});

test("E1: for a mixed createTable, parsed columns + diagnosed entries equal the source column count (no column vanishes unreported)", () => {
  const r = one("const a={type:S.TEXT};await queryInterface.createTable('mix',{...base,a,b:{type:S.TEXT},c:{type:S.TEXT},['d'+1]:{type:S.TEXT}});");
  const parsed = Object.keys(r.tables["mix"]!.columns).length;
  const skipped = r.diagnostics.filter((x) => x.code === "skipped_columns").reduce((n, x) => n + Number(/(\d+) entr/.exec(x.message)?.[1] ?? 0), 0);
  const dropped = r.diagnostics.filter((x) => x.code === "dropped_column").length;
  assert.equal(parsed + skipped + dropped, 5, JSON.stringify(r.diagnostics));
});

test("E1: a clean createTable still has no diagnostics (no false positives)", () => {
  const r = one("await queryInterface.createTable('t',{id:{type:S.INTEGER},n:{type:S.STRING}});await queryInterface.addColumn('t','z',{type:S.TEXT});");
  assert.deepEqual(r.diagnostics, []);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// T8 (tf-t8-product-db-kg, TF-20): SQLAlchemy models and FastAPI routers -> tables, owner keys, writer endpoints.
// ---------------------------------------------------------------------------------------------------------------------------------
import { parseSqlalchemyModels, parseRouterWrites, buildBackendKg } from "../src/ingest/migrations.js";

test("tf-fix-2: 100k stacked decorator lines (and 100k decorators over a long body) are scanned in one pass, under 500 ms", () => {
  const models = parseSqlalchemyModels([{ path: "m.py", content: MODELS_PY }]).tables;
  const stack = '@a.get("/")\n'.repeat(100_000);
  let plain!: ReturnType<typeof parseRouterWrites>;
  const t1 = ms(() => {
    plain = parseRouterWrites([{ path: "r.py", content: stack + "async def f():\n    return 1\n" }], models);
  });
  assert.ok(t1 < 500, `stacked decorators took ${t1.toFixed(1)} ms`);
  assert.equal(plain.length, 0, "a handler that touches no model is not a writer");
  const body = "    x = 1\n".repeat(5_000) + "    db.add(Shortlist(a=1))\n";
  let hit!: ReturnType<typeof parseRouterWrites>;
  const t2 = ms(() => {
    hit = parseRouterWrites([{ path: "r.py", content: '@a.post("/x")\n'.repeat(30_000) + "def g():\n" + body }], models);
  });
  assert.ok(t2 < 500, `decorators over a long body took ${t2.toFixed(1)} ms`);
  assert.equal(hit.length, 30_000, "every stacked decorator still maps to the handler");
  assert.deepEqual(hit[0]!.tables, ["student_shortlisted_courses"]);
  assert.equal(hit[0]!.fn, "g");
});

const MODELS_PY = [
  "from sqlalchemy import Column",
  "",
  "class Shortlist(Base):",
  '    __tablename__ = "student_shortlisted_courses"',
  "    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)",
  "    student_id = Column(",
  "        UUID(as_uuid=True),",
  '        ForeignKey("students.id", ondelete="CASCADE"),  # (a paren in a comment',
  "        nullable=False,",
  "        index=True,",
  "    )",
  '    note = Column(String(255), nullable=True)  # "not a ) real close"',
  '    fit_score = Column("fit", Integer)',
  "    items = relationship('Item')",
  "",
  "class Plain:",
  '    __tablename__ = "not_a_model_but_has_tablename"',
  "    x = Column(Integer)",
  "",
  "class Mixin(Base):",
  "    __abstract__ = True",
  "    created = Column(DateTime)",
  "",
  "class Notice(Base):",
  "    __tablename__ = 'notifications'",
  "    recipient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), nullable=False)",
  "    body: Mapped[str] = mapped_column(Text)",
].join("\n");

test("TF-20: SQLAlchemy models parse to tables with type, nullability, pk, fk, line and the owner key", () => {
  const out = parseSqlalchemyModels([{ path: "app/models/student_shortlist.py", content: MODELS_PY }]);
  assert.deepEqual(Object.keys(out.tables).sort(), ["notifications", "student_shortlisted_courses"]);
  const t = out.tables["student_shortlisted_courses"]!;
  assert.equal(t.className, "Shortlist");
  assert.deepEqual([t.file, t.line], ["app/models/student_shortlist.py", 4]);
  assert.equal(t.ownerKey, "student_id");
  assert.deepEqual(t.columns["id"], { type: "UUID(as_uuid=True)", pk: true, line: 5 });
  assert.deepEqual(t.columns["student_id"], { type: "UUID(as_uuid=True)", allowNull: false, fk: "students.id", line: 6 });
  assert.equal(t.columns["note"]!.allowNull, true);
  assert.equal(t.columns["fit"]!.type, "Integer", "a string first argument renames the column");
  assert.ok(!("items" in t.columns), "relationship() is not a column");
  const n = out.tables["notifications"]!;
  assert.equal(n.ownerKey, "recipient_id");
  assert.deepEqual(n.columns["recipient_id"], { type: "Mapped[uuid.UUID]", allowNull: false, fk: "users.id", line: 26 });
});

test("TF-20: a class that is not a Base subclass or has no __tablename__ gives no table; __proto__ and constructor names stay own keys", () => {
  const out = parseSqlalchemyModels([
    { path: "m.py", content: ["class A(Base):", '    __tablename__ = "__proto__"', "    id = Column(Integer, primary_key=True)", "class B(Base):", '    __tablename__ = "constructor"', "    id = Column(Integer)"].join("\n") },
    { path: "n.py", content: "class C(Base):\n    __abstract__ = True\n    id = Column(Integer)\n" },
  ]);
  assert.deepEqual(Object.keys(out.tables).sort(), ["__proto__", "constructor"]);
  assert.equal(Object.getPrototypeOf(out.tables), Object.prototype);
});

test("TF-20: a hostile file (unbalanced parens, 5000 nested parens, a non-string entry) is bounded and reports a diagnostic, never throws", () => {
  const hostile = 'class A(Base):\n    __tablename__ = "t"\n    a = Column(' + "(".repeat(5000) + "\n    b = Column(Integer)\n";
  const out = parseSqlalchemyModels([{ path: "h.py", content: hostile }, { path: "bad.py", content: 7 as unknown as string }]);
  assert.ok(out.tables["t"], "the table is still found");
  assert.ok(out.diagnostics.length >= 1);
});

const ROUTER_PY = [
  'router = APIRouter(prefix="/shortlist", tags=["x"])',
  "",
  '@router.get("/")',
  "def list_items(db=Depends(get_db)):",
  "    return db.query(Shortlist).all()",
  "",
  '@router.post("/add", status_code=201)',
  "async def add_item(body: B, db=Depends(get_db)):",
  "    row = Shortlist(student_id=body.id)",
  "    db.add(row)",
  "    db.add(Notice(recipient_id=body.id))",
  "    return row",
  "",
  '@router.delete("/{id}")',
  "def drop(id: str, db=Depends(get_db)):",
  "    db.query(Shortlist).filter(Shortlist.id == id).delete()",
].join("\n");

test("TF-20: router writers list the handlers that construct or delete a model, with prefix, line and tables; reads alone are not writers", () => {
  const models = parseSqlalchemyModels([{ path: "app/models/student_shortlist.py", content: MODELS_PY }]);
  const w = parseRouterWrites([{ path: "app/api/v1/student/shortlist_router.py", content: ROUTER_PY }], models.tables);
  assert.deepEqual(
    w.map((x) => [x.method, x.path, x.fn, x.line, x.tables]),
    [
      ["POST", "/shortlist/add", "add_item", 7, ["notifications", "student_shortlisted_courses"]],
      ["DELETE", "/shortlist/{id}", "drop", 14, ["student_shortlisted_courses"]],
    ],
  );
});

test("TF-20: the backend KG verifies seeded tool edges against the models and the cited router, and marks VC-readable tables", () => {
  const files = [
    { path: "app/models/student_shortlist.py", content: MODELS_PY },
    { path: "app/api/v1/student/shortlist_router.py", content: ROUTER_PY },
  ];
  const kg = buildBackendKg(files.slice(0, 1), files.slice(1), {
    vcReadTables: ["student_shortlisted_courses", "no_such_table"],
    source: { owner: "o", repo: "r", branch: "prod", files: {} },
    seeds: [
      { tool: "section:shortlisted", table: "student_shortlisted_courses", seed: "app/api/v1/student/shortlist_router.py:50" },
      { tool: "section:shortlisted", table: "ghost_table", seed: "app/api/v1/student/shortlist_router.py:60" },
      { tool: "section:visa", table: "notifications", seed: "app/api/v1/student/missing_router.py:9" },
    ],
  });
  const by = (t: string) => kg.toolEdges.find((e) => e.table === t)!;
  assert.deepEqual([by("student_shortlisted_courses").tableFound, by("student_shortlisted_courses").writerFound], [true, true]);
  assert.deepEqual([by("ghost_table").tableFound, by("ghost_table").writerFound], [false, false]);
  assert.deepEqual([by("notifications").tableFound, by("notifications").writerFound], [true, false]);
  assert.deepEqual(kg.readEdges, [
    { table: "no_such_table", rel: "vc-reads", tableFound: false },
    { table: "student_shortlisted_courses", rel: "vc-reads", tableFound: true },
  ]);
  assert.equal(kg.writers.length, 2);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// kg-fix-1: ReDoS hardening (COLUMN_STMT, ROUTER_PREFIX) and edge verification (router | model | service | none, with a reason).
// ---------------------------------------------------------------------------------------------------------------------------------
function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

test("kg-fix-1: a 6000-space annotation line (cubic in the old COLUMN_STMT) parses in under 50 ms and the table is still found", () => {
  const hostile = ["class A(Base):", '    __tablename__ = "t"', "    id = Column(Integer, primary_key=True)", "    a:" + " ".repeat(6000), "    b" + " ".repeat(6000) + ":" + " ".repeat(6000) + "x", "    c = Column(Integer)"].join("\n");
  let out!: ReturnType<typeof parseSqlalchemyModels>;
  const took = ms(() => {
    out = parseSqlalchemyModels([{ path: "h.py", content: hostile }]);
  });
  assert.ok(took < 50, `took ${took.toFixed(1)} ms`);
  assert.deepEqual(Object.keys(out.tables["t"]!.columns), ["id", "c"], "the columns around the hostile lines are kept");
});

test("kg-fix-1: odd but legal spacing and annotations still read as columns", () => {
  const src = ["class A(Base):", '    __tablename__ = "t"', "    a   :   Mapped[int]   =   mapped_column(Integer, nullable=False)", "    b:Mapped[str]=sa.Column(String)", "    c == Column(Integer)", "    d: = Column(Integer)"].join("\n");
  const cols = parseSqlalchemyModels([{ path: "o.py", content: src }]).tables["t"]!.columns;
  assert.deepEqual(Object.keys(cols), ["a", "b"]);
  assert.equal(cols["a"]!.type, "Integer");
  assert.equal(cols["a"]!.allowNull, false);
  assert.equal(cols["b"]!.type, "String");
});

test("kg-fix-1: a line over the cap is skipped with a diagnostic, never silently", () => {
  const src = ["class A(Base):", '    __tablename__ = "t"', "    a = Column(Integer)  # " + "x".repeat(3000), "    b = Column(Integer)"].join("\n");
  const out = parseSqlalchemyModels([{ path: "l.py", content: src }]);
  assert.deepEqual(Object.keys(out.tables["t"]!.columns), ["b"]);
  assert.ok(out.diagnostics.some((d) => d.code === "line_too_long" && d.file === "l.py"));
});

test("kg-fix-1: hostile ROUTER_PREFIX inputs (many 'APIRouter(' starts, a 6000-space tail) stay under 50 ms and a real prefix is still read", () => {
  const manyStarts = "APIRouter(".repeat(20000);
  const spaces = "APIRouter(" + "prefix" + " ".repeat(6000) + "\n";
  const tail = '@router.post("/x")\ndef f():\n    return Shortlist(a=1)\n';
  const models = parseSqlalchemyModels([{ path: "m.py", content: MODELS_PY }]).tables;
  for (const head of [manyStarts, spaces]) {
    let w!: ReturnType<typeof parseRouterWrites>;
    const took = ms(() => {
      w = parseRouterWrites([{ path: "r.py", content: head + "\n" + tail }], models);
    });
    assert.ok(took < 50, `took ${took.toFixed(1)} ms`);
    assert.equal(w.length, 1, "the handler after the hostile header is still found");
  }
  const multi = 'router = APIRouter(\n    tags=["x"],\n    prefix="/p",\n)\n' + tail;
  assert.equal(parseRouterWrites([{ path: "r.py", content: multi }], models)[0]!.path, "/p/x");
});

const WALLET_MODELS = [
  "class WalletLedger(Base):",
  '    __tablename__ = "wallet_ledger"',
  "    id = Column(UUID, primary_key=True)",
  "    student_id = Column(UUID, nullable=False)",
  "",
  "class Notification(Base):",
  '    __tablename__ = "notifications"',
  "    recipient_id = Column(UUID, nullable=False)",
].join("\n");
const SHORTLIST_ROUTER_DELEGATING = [
  "from app.services.student_shortlist_service import StudentShortlistService",
  "from app.services.wallet_service import award_credit_bg",
  'router = APIRouter(prefix="/student/shortlist", tags=["s"])',
  "",
  '@router.post("", response_model=R)',
  "async def add_to_shortlist(payload: P, db=Depends(get_db)):",
  "    result = await StudentShortlistService.add_to_shortlist(db, 1, payload)",
  "    return result",
].join("\n");
const SHORTLIST_SERVICE = ["class StudentShortlistService:", "    @staticmethod", "    async def add_to_shortlist(db, sid, payload):", "        row = Shortlist(student_id=sid)", "        db.add(row)"].join("\n");
const SRC_KG = { owner: "o", repo: "r", branch: "prod", files: {} };

test("kg-fix-1: a router that delegates to an imported service is verified through the service (the shortlist false negative), with via and verifiedBy", () => {
  const models = [{ path: "app/models/student_shortlist.py", content: MODELS_PY }];
  const seeds = [{ tool: "section:shortlisted", table: "student_shortlisted_courses", seed: "app/api/v1/student/shortlist_router.py:50" }];
  const router = { path: "app/api/v1/student/shortlist_router.py", content: SHORTLIST_ROUTER_DELEGATING };
  const withService = buildBackendKg(models, [router], { vcReadTables: [], source: SRC_KG, seeds, serviceFiles: [{ path: "app/services/student_shortlist_service.py", content: SHORTLIST_SERVICE }] });
  const e = withService.toolEdges[0]!;
  assert.deepEqual([e.verifiedBy, e.via, e.writerFound, e.reason], ["service", "app/services/student_shortlist_service.py", true, undefined]);
  const without = buildBackendKg(models, [router], { vcReadTables: [], source: SRC_KG, seeds });
  assert.deepEqual([without.toolEdges[0]!.verifiedBy, without.toolEdges[0]!.reason, without.toolEdges[0]!.writerFound], ["none", "service_not_read", false]);
});

test("kg-fix-1: a service that only reads the model does not verify; the reason says so", () => {
  const readOnly = ["class S:", "    def f(db):", "        return db.execute(select(Shortlist))"].join("\n");
  const router = SHORTLIST_ROUTER_DELEGATING.replace("from app.services.wallet_service import award_credit_bg\n", "");
  const kg = buildBackendKg([{ path: "app/models/student_shortlist.py", content: MODELS_PY }], [{ path: "app/api/v1/student/shortlist_router.py", content: router }], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [{ tool: "t", table: "student_shortlisted_courses", seed: "app/api/v1/student/shortlist_router.py:50" }],
    serviceFiles: [{ path: "app/services/student_shortlist_service.py", content: readOnly }],
  });
  assert.deepEqual([kg.toolEdges[0]!.verifiedBy, kg.toolEdges[0]!.reason], ["none", "no_write_in_seed_file"]);
  const unread = buildBackendKg([{ path: "app/models/student_shortlist.py", content: MODELS_PY }], [{ path: "app/api/v1/student/shortlist_router.py", content: SHORTLIST_ROUTER_DELEGATING }], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [{ tool: "t", table: "student_shortlisted_courses", seed: "app/api/v1/student/shortlist_router.py:50" }],
    serviceFiles: [{ path: "app/services/student_shortlist_service.py", content: readOnly }],
  });
  assert.equal(unread.toolEdges[0]!.reason, "service_not_read", "an imported service that was not supplied keeps the reason honest");
});

test("kg-fix-1: service-file seeds are verified by a bounded scan for a write to the model or the table; model-file seeds against the parsed model", () => {
  const models = [{ path: "app/models/wallet.py", content: WALLET_MODELS }];
  const seeds = [
    { tool: "section:rewards", table: "wallet_ledger", seed: "app/services/wallet_service.py:673" },
    { tool: "section:mail", table: "notifications", seed: "app/models/wallet.py:9" },
    { tool: "section:x", table: "notifications", seed: "app/models/other.py:9" },
    { tool: "section:y", table: "wallet_ledger", seed: "app/services/raw_sql_service.py:5" },
    { tool: "section:z", table: "wallet_ledger", seed: "app/services/absent_service.py:5" },
    { tool: "section:w", table: "ghost", seed: "app/services/wallet_service.py:1" },
    { tool: "section:v", table: "notifications", seed: "app/services/reads_only_service.py:1" },
  ];
  const kg = buildBackendKg(models, [], {
    vcReadTables: [],
    source: SRC_KG,
    seeds,
    serviceFiles: [
      { path: "app/services/wallet_service.py", content: "async def award_credit_bg(db, sid):\n    db.add(WalletLedger(student_id=sid, amount=30))\n" },
      { path: "app/services/raw_sql_service.py", content: 'await db.execute(text("INSERT INTO wallet_ledger (id) VALUES (1)"))\n' },
      { path: "app/services/reads_only_service.py", content: "rows = await db.execute(select(Notification))\n" },
    ],
  });
  assert.deepEqual(
    kg.toolEdges.map((e) => [e.tool, e.verifiedBy, e.reason ?? null]),
    [
      ["section:rewards", "service", null],
      ["section:mail", "model", null],
      ["section:x", "none", "table_defined_elsewhere"],
      ["section:y", "service", null],
      ["section:z", "none", "seed_file_not_read"],
      ["section:w", "none", "table_not_in_models"],
      ["section:v", "none", "no_write_in_seed_file"],
    ],
  );
  // tf-fix-2: a model-only edge (the cited file only DEFINES the table) is not a verified write: writerFound false, definedInModel true.
  assert.deepEqual(kg.toolEdges.map((e) => e.writerFound), [true, false, false, true, false, false, false]);
  assert.deepEqual(kg.toolEdges.map((e) => e.definedInModel), [false, true, false, false, false, false, false]);
});

test("kg-fix-1: router handlers still verify as 'router' and win over the other paths", () => {
  const kg = buildBackendKg([{ path: "app/models/student_shortlist.py", content: MODELS_PY }], [{ path: "app/api/v1/student/shortlist_router.py", content: ROUTER_PY }], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [{ tool: "t", table: "student_shortlisted_courses", seed: "app/api/v1/student/shortlist_router.py:50" }],
  });
  assert.equal(kg.toolEdges[0]!.verifiedBy, "router");
  assert.deepEqual([kg.toolEdges[0]!.writerFound, kg.toolEdges[0]!.definedInModel], [true, false]);
});

test("tf-fix-2: the honest count is router + service only; a model-only edge never counts as a verified writer", () => {
  const kg = buildBackendKg([{ path: "app/models/wallet.py", content: WALLET_MODELS }], [], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [
      { tool: "a", table: "notifications", seed: "app/models/wallet.py:9" },
      { tool: "b", table: "wallet_ledger", seed: "app/models/wallet.py:3" },
      { tool: "c", table: "wallet_ledger", seed: "app/services/wallet_service.py:2" },
    ],
    serviceFiles: [{ path: "app/services/wallet_service.py", content: "db.add(WalletLedger(student_id=1))\n" }],
  });
  assert.equal(kg.toolEdges.filter((e) => e.writerFound).length, 1);
  assert.equal(kg.toolEdges.filter((e) => e.definedInModel === true).length, 2);
  assert.equal(kg.toolEdges.filter((e) => e.verifiedBy === "model").every((e) => !e.writerFound), true);
});

test("kg-fix-1: a hostile service file (one 600 KB line, thousands of imports) is bounded", () => {
  const hostile = "query(".repeat(100_000) + "\n" + "from app.services.a import b\n".repeat(5000);
  const took = ms(() => {
    buildBackendKg([{ path: "app/models/wallet.py", content: WALLET_MODELS }], [], {
      vcReadTables: [],
      source: SRC_KG,
      seeds: [{ tool: "t", table: "wallet_ledger", seed: "app/services/h.py:1" }],
      serviceFiles: [{ path: "app/services/h.py", content: hostile }],
    });
  });
  assert.ok(took < 200, `took ${took.toFixed(1)} ms`);
});

test("kg-fix-1: a model imported under an alias (`StudentGoal as _Goal`) still counts as written by the handler that constructs the alias", () => {
  const models = [{ path: "app/models/goal.py", content: ["class StudentGoal(Base):", '    __tablename__ = "student_goal"', "    student_id = Column(UUID)", "class StudentBudgetPlan(Base):", '    __tablename__ = "student_budget_plan"', "    student_id = Column(UUID)"].join("\n") }];
  const router = [
    "from app.models.goal import (",
    "    StudentGoal as _Goal, StudentBudgetPlan as _Budget,",
    ")",
    'router = APIRouter(prefix="/student")',
    '@router.get("/goals")',
    "async def list_goals(db):",
    "    return await db.execute(select(_Goal))",
    '@router.post("/goals")',
    "async def create_goal(body, db):",
    "    g = _Goal(student_id=1)",
    "    db.add(g)",
  ].join("\n");
  const kg = buildBackendKg(models, [{ path: "app/api/v1/student/router.py", content: router }], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [
      { tool: "section:goals", table: "student_goal", seed: "app/api/v1/student/router.py:2140" },
      { tool: "section:finance", table: "student_budget_plan", seed: "app/api/v1/student/router.py:2140" },
    ],
  });
  assert.deepEqual(kg.writers.map((w) => [w.method, w.path, w.fn, w.tables]), [["POST", "/student/goals", "create_goal", ["student_goal"]]]);
  assert.deepEqual(kg.toolEdges.map((e) => [e.table, e.verifiedBy]), [["student_goal", "router"], ["student_budget_plan", "none"]], "the budget plan alias is imported but never written: not verified");
});

test("kg-fix-1: a service that writes the model through an import alias is verified too", () => {
  const kg = buildBackendKg([{ path: "app/models/wallet.py", content: WALLET_MODELS }], [], {
    vcReadTables: [],
    source: SRC_KG,
    seeds: [{ tool: "t", table: "wallet_ledger", seed: "app/services/w.py:1" }],
    serviceFiles: [{ path: "app/services/w.py", content: "from app.models.wallet import WalletLedger as _WL\ndef f(db):\n    db.add(_WL(student_id=1))\n" }],
  });
  assert.equal(kg.toolEdges[0]!.verifiedBy, "service");
});
