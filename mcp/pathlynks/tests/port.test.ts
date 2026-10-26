import { test } from "node:test";
import assert from "node:assert/strict";
import { createPathlynksPort, buildPgConfig, ROW_CAP, STATEMENT_TIMEOUT_MS, type PathlynksPortConfig } from "../src/index.js";
import { createFakePg, manyRows, type FakeOptions } from "./fakes.js";

const TABLES = ["students", "saved_careers", "compare_items", "assessments"] as const;
const ALLOW = [...TABLES, "unrelated_table"];
const SECRET = "hunter2-PASSWORD-VALUE";
const CONN = "postgres://pathlynks_ro:hunter2-PASSWORD-VALUE@db.internal.example:5432/pathlynks";

function setup(fake: FakeOptions = {}, over: Partial<PathlynksPortConfig> = {}) {
  const h = createFakePg(fake);
  const events: unknown[] = [];
  const port = createPathlynksPort({
    allowedTables: ALLOW,
    tables: { profile: "students", savedCareers: "saved_careers", compareList: "compare_items", assessment: "assessments" },
    connect: h.connect,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { h, port, events };
}

const METHODS = ["getStudentProfile", "getSavedCareers", "getCompareList", "getAssessmentStatus"] as const;

// Scenario: the engine hands the port to a student turn; only four read methods exist (no generic query).
test("VA12 port exposes exactly the four read methods", () => {
  const { port } = setup();
  assert.deepEqual(Object.keys(port).filter((k) => k !== "getStatus").sort(), [...METHODS].sort());
});

// Scenario: a verified student asks "show my saved careers"; each method issues parameterised, student-scoped SQL.
for (const m of METHODS) {
  test(`VA12 ${m} binds the verified student id as $1 and sets statement_timeout`, async () => {
    const { h, port } = setup({ rows: [{ student_id: "stu-42", x: 1 }] });
    const res = await port[m]("stu-42");
    assert.equal(res.ok, true);
    const selects = h.statements.filter((s) => /^SELECT\b/i.test(s.text) && !/has_table_privilege/i.test(s.text));
    assert.equal(selects.length, 1);
    assert.match(selects[0]!.text, /WHERE student_id = \$1/);
    assert.deepEqual(selects[0]!.values, ["stu-42"]);
    for (const s of h.statements) assert.ok(!s.text.includes("stu-42"), "id never concatenated into SQL");
    assert.ok(h.statements.some((s) => s.text === `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
    assert.equal(STATEMENT_TIMEOUT_MS, 3000);
    assert.equal(h.connects, 1);
    assert.equal(h.ends, 1, "connection closed after the call");
  });
}

// Scenario: each method reads its own configured table from the allow-list.
test("VA12 each method queries its own configured table", async () => {
  const { h, port } = setup();
  await port.getStudentProfile("s-1");
  await port.getSavedCareers("s-1");
  await port.getCompareList("s-1");
  await port.getAssessmentStatus("s-1");
  const selects = h.statements.filter((s) => /FROM/i.test(s.text)).map((s) => s.text);
  assert.equal(selects.length, 4);
  assert.match(selects[0]!, /FROM "students" /);
  assert.match(selects[1]!, /FROM "saved_careers" /);
  assert.match(selects[2]!, /FROM "compare_items" /);
  assert.match(selects[3]!, /FROM "assessments" /);
});

// Scenario: an injection-shaped id reaches the port (e.g. a bug upstream); it is refused, never executed, never concatenated.
test("VA12 a hostile student id is refused before any connection", async () => {
  const { h, port } = setup();
  for (const bad of ["s-1'; DROP TABLE students;--", "s-1 OR 1=1", "", "a".repeat(200), "s\u0000x", "../x"]) {
    const res = await port.getStudentProfile(bad);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "refused");
  }
  assert.equal(h.connects, 0);
  assert.equal(h.statements.length, 0);
});

// Scenario: Pathlynks returns 500 saved careers; the model gets 50, flagged truncated.
test("VA12 row cap: 500 rows -> 50 truncated; 50 -> not truncated; 51 -> truncated", async () => {
  const big = await setup({ rows: manyRows(500) }).port.getSavedCareers("s-1");
  assert.ok(big.ok);
  if (big.ok) {
    assert.equal(big.rows.length, ROW_CAP);
    assert.equal(big.truncated, true);
  }
  const exact = await setup({ rows: manyRows(50) }).port.getSavedCareers("s-1");
  assert.ok(exact.ok);
  if (exact.ok) assert.equal(exact.truncated, false);
  const over = await setup({ rows: manyRows(51) }).port.getSavedCareers("s-1");
  assert.ok(over.ok);
  if (over.ok) {
    assert.equal(over.rows.length, 50);
    assert.equal(over.truncated, true);
  }
  assert.equal(ROW_CAP, 50);
});

// Scenario: the database role was mis-provisioned with write rights on one table; the port refuses to serve at all.
for (const priv of ["INSERT", "UPDATE", "DELETE"] as const) {
  for (const table of TABLES) {
    test(`VA12 fail closed when ${priv} is true on ${table}`, async () => {
      const { h, port, events } = setup({ privileges: { [table]: { [priv]: true } }, rows: [{ student_id: "s-1" }] });
      for (const m of METHODS) {
        const res = await port[m]("s-1");
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.equal(res.reason, "unavailable");
          assert.equal(res.cause, "privilege_check_failed");
        }
      }
      assert.ok(!h.statements.some((s) => /FROM/i.test(s.text)), "no data SELECT issued after a failed privilege check");
      assert.ok(h.ends >= 1 && h.ends === h.connects);
      assert.ok(events.some((e) => (e as { type: string }).type === "privilege_check_failed"));
      assert.equal(port.getStatus().privilegeCheck, "failed");
    });
  }
}

// Scenario: the privilege probe itself errors (permissions on the catalogue, network drop): still fail closed.
test("VA12 a privilege-check error fails closed and is recorded", async () => {
  const { h, port, events } = setup({ failPrivilege: new Error(`boom ${CONN}`) });
  const res = await port.getStudentProfile("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.cause, "privilege_check_error");
  assert.ok(!h.statements.some((s) => /FROM/i.test(s.text)));
  assert.equal(port.getStatus().privilegeCheck, "error");
  assert.ok(events.some((e) => (e as { type: string }).type === "privilege_check_error"));
  assert.ok(!JSON.stringify([res, events]).includes(SECRET));
});

// Scenario: the probe returns no row (table missing/renamed): treated as failure, not as "no privileges".
test("VA12 an empty privilege result fails closed", async () => {
  const { port } = setup({ emptyPrivilege: true, rows: [{ student_id: "s-1" }] });
  const res = await port.getSavedCareers("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.cause, "privilege_check_error");
});

// Scenario: Pathlynks Postgres is down and the driver error embeds the connection string; the turn continues with "unavailable".
test("VA12 connect error -> typed unavailable, nothing thrown, no secret leaked", async () => {
  const { port, events } = setup({ failConnect: new Error(`connect ECONNREFUSED ${CONN} password=${SECRET}`) });
  const res = await port.getStudentProfile("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.reason, "unavailable");
    assert.equal(res.cause, "connect_error");
  }
  const blob = JSON.stringify([res, events, port.getStatus()]);
  for (const leak of [SECRET, "db.internal.example", "postgres://", "pathlynks_ro"]) assert.ok(!blob.includes(leak), `leaked ${leak}`);
});

test("VA12 query error and SET error -> typed unavailable, no leak, connection closed", async () => {
  for (const fake of [{ failSelect: new Error(`statement timeout ${SECRET}`) }, { failSet: new Error(`bad ${SECRET}`) }] as FakeOptions[]) {
    const { h, port, events } = setup(fake);
    const res = await port.getCompareList("s-1");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "unavailable");
    assert.ok(!JSON.stringify([res, events]).includes(SECRET));
    assert.equal(h.ends, h.connects);
  }
});

// Scenario: the query hangs past the deadline; the port gives up with a typed result instead of hanging the turn.
test("VA12 a hung query times out into unavailable (cause timeout)", async () => {
  const { h, port } = setup({ hangSelect: true }, { queryTimeoutMs: 40 });
  const res = await port.getAssessmentStatus("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.cause, "timeout");
  assert.equal(h.ends, 1);
});

// Scenario: audit of everything the port ever sends to the database.
test("VA12 every statement issued is SELECT or a SET/privilege probe; never INSERT/UPDATE/DELETE/DDL", async () => {
  const allowed = /^(SELECT\b|SET statement_timeout = \d+$|SET default_transaction_read_only = on$)/;
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|COPY|CALL)\b/i;
  const { h, port } = setup({ rows: manyRows(3) });
  for (const m of METHODS) await port[m]("s-1");
  assert.ok(h.statements.length > 0);
  for (const s of h.statements) {
    assert.match(s.text, allowed, s.text);
    if (!/has_table_privilege/i.test(s.text)) assert.doesNotMatch(s.text, forbidden, s.text);
    else assert.deepEqual(s.text.match(/'(INSERT|UPDATE|DELETE)'/g)?.sort(), ["'DELETE'", "'INSERT'", "'UPDATE'"]);
  }
  // privilege probe covers every configured table, with the table name as a parameter
  const probed = h.statements.filter((s) => /has_table_privilege/i.test(s.text)).map((s) => s.values?.[0]);
  for (const t of TABLES) assert.ok(probed.includes(t), `probed ${t}`);
});

// Scenario: sources.json lists the tables Pathlynks may expose; a mapping outside that list is a configuration error.
test("VA12 table names must be in the allow-list and be plain identifiers", () => {
  const base = { allowedTables: ALLOW, tables: { profile: "students", savedCareers: "saved_careers", compareList: "compare_items", assessment: "assessments" } };
  assert.throws(() => createPathlynksPort({ ...base, tables: { ...base.tables, profile: "pg_shadow" } }), /allow-list/);
  assert.throws(
    () => createPathlynksPort({ ...base, allowedTables: ['students"; DROP TABLE x;--', ...ALLOW.slice(1)], tables: { ...base.tables, profile: 'students"; DROP TABLE x;--' } }),
    /identifier/,
  );
  assert.throws(() => createPathlynksPort({ ...base, allowedTables: [] }), /allow-list/);
});

// Scenario: the live driver config: password comes only from the env name, ssl follows sslmode, timeout is on the connection.
test("VA12 buildPgConfig reads the password from the env NAME and never holds a connection string", () => {
  const cfg = buildPgConfig({ host: "h", port: 5432, database: "d", user: "u", sslmode: "verify-full", passwordRef: "PATHLYNKS_DB_PASSWORD" }, { PATHLYNKS_DB_PASSWORD: SECRET });
  assert.ok(cfg);
  assert.equal(cfg.password, SECRET);
  assert.equal(cfg.statement_timeout, 3000);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
  assert.equal("connectionString" in cfg, false);
  const req = buildPgConfig({ host: "h", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "P" }, { P: "x" });
  assert.deepEqual(req?.ssl, { rejectUnauthorized: true }, "require never downgrades to an unverified TLS session");
  assert.equal(buildPgConfig({ host: "h", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "MISSING" }, {}), undefined);
});

test("VA12 missing password env -> unavailable (not_configured) without connecting", async () => {
  const port = createPathlynksPort({
    allowedTables: ALLOW,
    tables: { profile: "students", savedCareers: "saved_careers", compareList: "compare_items", assessment: "assessments" },
    connection: { host: "h", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "NOT_SET_ANYWHERE" },
    env: {},
  });
  const res = await port.getStudentProfile("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.cause, "not_configured");
});
