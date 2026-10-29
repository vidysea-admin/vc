import { test } from "node:test";
import assert from "node:assert/strict";
import { createPathlynksPort, buildPgConfig, ROW_CAP, STATEMENT_TIMEOUT_MS, type PathlynksPortConfig } from "../src/index.js";
import { createFakePg, createFixturePg, populatedFixture, REAL_TABLES, manyRows, createQuestFake, type FakeOptions } from "./fakes.js";
import { createQuestReader, QUEST_COLLECTIONS, QUEST_MAX_TIME_MS, QUEST_READ_PREFERENCE } from "../src/port.js";

const TABLES = ["users", "user_grade", "grade", "student_saved_careers", "student_career_compare", "career_option", "assessment_response"] as const;
const ALLOW = [...TABLES, "unrelated_table"];
const SECRET = "hunter2-PASSWORD-VALUE";
const CONN = "postgres://pathlynks_ro:hunter2-PASSWORD-VALUE@db.internal.example:5432/pathlynks";

function setup(fake: FakeOptions = {}, over: Partial<PathlynksPortConfig> = {}) {
  const h = createFakePg(fake);
  const events: unknown[] = [];
  const port = createPathlynksPort({
    allowedTables: ALLOW,
    tables: { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option" },
    connect: h.connect,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { h, port, events };
}

const METHODS = ["getStudentProfile", "getSavedCareers", "getCompareList", "getAssessmentStatus"] as const;

const FIT_METHODS = ["getCategoryFits", "getCareerFits", "getTraitScores", "getCombinedReportSummary"] as const;
const QUEST_METHODS = ["getQuestProfile", "getQuestGoals", "getQuestPlan"] as const;
const FIT_TABLES = { categoryFit: "user_category_fitscore", categoryOption: "category_option", subcategoryFit: "user_subcategory_fitscore", subcategoryOption: "subcategory_option", traitScores: "student_trait_score_point", combinedReport: "combined_report_llm_data" };

// Scenario: the engine hands the port to a student turn; only named read methods exist (no generic query).
test("VA12 port exposes exactly the named read methods", () => {
  const { port } = setup();
  assert.deepEqual(Object.keys(port).filter((k) => k !== "getStatus").sort(), [...METHODS, ...FIT_METHODS, ...QUEST_METHODS].sort());
});

// Scenario: a verified student asks "show my saved careers"; each method issues parameterised, student-scoped SQL.
for (const m of METHODS) {
  test(`VA12 ${m} binds the verified student id as $1 and sets statement_timeout`, async () => {
    const { h, port } = setup({ rows: [{ student_id: "stu-42", x: 1 }] });
    const res = await port[m]("stu-42");
    assert.equal(res.ok, true);
    const selects = h.statements.filter((s) => /^SELECT\b/i.test(s.text) && !/has_table_privilege/i.test(s.text));
    assert.equal(selects.length, 1);
    assert.match(selects[0]!.text, /u\.id = \$1/);
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
  assert.match(selects[0]!, /FROM "users" u/);
  assert.match(selects[1]!, /JOIN "student_saved_careers" sc/);
  assert.match(selects[2]!, /JOIN "student_career_compare" cc/);
  assert.match(selects[3]!, /FROM "assessment_response" ar/);
});

// G2 (pathlynks-inventory 2b): student_saved_careers holds CATEGORY, SUBCATEGORY and CAREER saves under one (student_id, id) key, so a career join
// without save_type shows a saved category as an unrelated career (id collision). Live save_type values are exactly CAREER / CATEGORY / SUBCATEGORY.
test("G2 getSavedCareers reads CAREER saves only (save_type filter in the SQL)", async () => {
  const { h, port } = setup({ rows: [] });
  await port.getSavedCareers("s-1");
  const sel = h.statements.find((s) => /JOIN "student_saved_careers" sc/.test(s.text))!;
  assert.match(sel.text, /sc\.save_type = 'CAREER'/);
  assert.deepEqual(sel.values, ["s-1"], "the filter is a literal, the id stays the only bound value");
});
test("G2 a saved CATEGORY whose id collides with a career id is not shown as a career", async () => {
  const h = createFixturePg();
  const port = createPathlynksPort({ allowedTables: Object.values(REAL_TABLES), tables: REAL_TABLES, connect: h.connect, env: {} });
  const res = await port.getSavedCareers("stu-A");
  assert.deepEqual(res, { ok: true, rows: [{ career: "Architect" }, { career: "Pilot" }], truncated: false });
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
  const base = { allowedTables: ALLOW, tables: { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option" } };
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
    tables: { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option" },
    connection: { host: "h", port: 5432, database: "d", user: "u", sslmode: "require", passwordRef: "NOT_SET_ANYWHERE" },
    env: {},
  });
  const res = await port.getStudentProfile("s-1");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.cause, "not_configured");
});


test("Q1 R4: explicit owner-rooted projections and every joined table are guarded", async () => {
  const { h, port } = setup();
  for (const method of METHODS) await port[method]("s-1");
  const sql = h.statements.filter(s => /^SELECT\b/.test(s.text) && !/has_table_privilege/.test(s.text)).map(s => s.text);
  for (const q of sql) {
    assert.doesNotMatch(q, /SELECT\s+\*|u\.(student_id|email|password|phone|date_of_birth)/i);
    assert.match(q, /u\.id = \$1/);
    assert.match(q, /u\.deleted_at IS NULL AND u\.disabled_at IS NULL/);
  }
  assert.match(sql[0]!, /ug\.user_id = u\.id[\s\S]*ug\.grade_status = 'active'[\s\S]*ORDER BY ug\.id DESC LIMIT 1/);
  assert.match(sql[0]!, /g\.id = ug\.grade_id/);
  assert.match(sql[1]!, /sc\.student_id = u\.id[\s\S]*sc\.id = co\.id/);
  assert.match(sql[1]!, /co\.preferred_label AS career[\s\S]*ORDER BY co\.preferred_label, sc\.id LIMIT 51/);
  assert.match(sql[2]!, /cc\.student_id = u\.id[\s\S]*cc\.career_id = co\.id/);
  assert.match(sql[2]!, /ORDER BY cc\.slot, cc\.career_id LIMIT 51/);
  assert.match(sql[3]!, /DISTINCT ON \(ar\.assessment_id\)/);
  assert.match(sql[3]!, /ar\.modified_date DESC NULLS LAST, ar\.id DESC/);
  assert.match(sql[3]!, /is_draft_saved IS FALSE/);
  assert.match(sql[3]!, /detailed_report IS NOT NULL/);
  assert.doesNotMatch(sql[3]!, /LIMIT 51|ar\.status/);
  for (const missing of ["user_grade", "grade", "career_option"]) {
    assert.throws(() => setup({}, { allowedTables: ALLOW.filter(t => t !== missing) }), /allow-list/);
  }
});

test("Q7 TLS: configured CA file is loaded, missing CA fails closed, verification always stays on", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { rootCertificates } = await import("node:tls");
  const dir = mkdtempSync(join(tmpdir(), "vc-pathlynks-ca-"));
  const file = join(dir, "ca.pem");
  const conn = { host: "db.example", port: 5432, database: "d", user: "u", sslmode: "verify-full" as const, passwordRef: "P", caFileRef: "PATHLYNKS_DB_CA_FILE" };
  try {
    writeFileSync(file, rootCertificates[0]!);
    const config = buildPgConfig(conn, { P: "synthetic", PATHLYNKS_DB_CA_FILE: file });
    assert.equal(config?.ssl.rejectUnauthorized, true);
    assert.equal(config?.ssl.ca, rootCertificates[0]);
    assert.equal(buildPgConfig(conn, { P: "synthetic" }), undefined);
    assert.equal(buildPgConfig(conn, { P: "synthetic", PATHLYNKS_DB_CA_FILE: join(dir, "missing") }), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("Q7 populated relational fixture: NULL legacy student_id, latest active grade, labelled joins and latest mixed/draft responses", async () => {
  const db = populatedFixture();
  const h = createFixturePg(db);
  const port = createPathlynksPort({ allowedTables: Object.values(REAL_TABLES), tables: REAL_TABLES, connect: h.connect, env: {} });
  const ok = (rows: unknown[]) => ({ ok: true, rows, truncated: false });
  assert.deepEqual(await port.getStudentProfile("stu-A"), ok([{ name: "Asha Rao", grade: "Grade12" }]));
  assert.deepEqual(await port.getSavedCareers("stu-A"), ok([{ career: "Architect" }, { career: "Pilot" }]));
  assert.deepEqual(await port.getCompareList("stu-A"), ok([{ career: "Pilot" }, { career: "Architect" }]));
  assert.deepEqual(await port.getAssessmentStatus("stu-A"), ok([{ completed: 1, inProgress: 2, reportsAvailable: 1, totalResponses: 3, status: "in_progress" }]));
  db.assessment_response = db.assessment_response.filter(r => r.assessment_id === 1);
  assert.deepEqual(await port.getAssessmentStatus("stu-A"), ok([{ completed: 1, inProgress: 0, reportsAvailable: 1, totalResponses: 1, status: "completed" }]));
  assert.deepEqual(await port.getAssessmentStatus("empty"), ok([{ completed: 0, inProgress: 0, reportsAvailable: 0, totalResponses: 0, status: "none" }]));
  for (const id of ["empty", "disabled", "deleted", "missing"]) {
    assert.deepEqual(await port.getSavedCareers(id), ok([]));
    assert.deepEqual(await port.getCompareList(id), ok([]));
  }
  assert.deepEqual(await port.getStudentProfile("empty"), ok([{ name: "Empty", grade: null }]));
  assert.equal(h.connects, h.ends);
});

test("Q7 assessment aggregation stays untruncated beyond list cap; late connections are closed after timeout", async () => {
  const db = populatedFixture();
  db.assessment_response = Array.from({ length: 80 }, (_, id) => ({ id, assessment_id: id, student_id: "stu-A", modified_date: null, is_draft_saved: false, detailed_report: null }));
  const h = createFixturePg(db);
  const cfg = { allowedTables: Object.values(REAL_TABLES), tables: REAL_TABLES, env: {} };
  const port = createPathlynksPort({ ...cfg, connect: h.connect });
  assert.deepEqual(await port.getAssessmentStatus("stu-A"), { ok: true, rows: [{ completed: 80, inProgress: 0, reportsAvailable: 0, totalResponses: 80, status: "completed" }], truncated: false });
  let closed = 0;
  const slow = createPathlynksPort({ ...cfg, queryTimeoutMs: 10, connect: async () => {
    await new Promise(r => setTimeout(r, 40));
    return { query: async () => { throw new Error("must never query late connection"); }, end: async () => { closed++; } };
  } });
  assert.deepEqual(await slow.getStudentProfile("stu-A"), { ok: false, reason: "unavailable", cause: "timeout" });
  await new Promise(r => setTimeout(r, 60));
  assert.equal(closed, 1);
});


test("Q7 TLS certificate rejection is unavailable without driver details", async () => {
  const { port, h } = setup({ failConnect: new Error("self-signed certificate in certificate chain at db.internal.example password=PRIVATE-CERT-SECRET") });
  const result = await port.getStudentProfile("s-1");
  assert.deepEqual(result, { ok: false, reason: "unavailable", cause: "connect_error" });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|certificate|internal/);
  assert.equal(h.statements.length, 0);
});

// S12: native Vidysea projections remain distinct from Pathlynks careers/psychometrics.
const VIDYSEA_TABLES = { profile: "users", student: "students", shortlist: "student_shortlisted_courses", assessment: "ai_profile_assessments" };
const VIDYSEA_OWNER = "12345678-1234-4123-8123-123456789abc";

test("S12 Vidysea finite owner joins, labelled native data and SQL/row bounds", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ source: "vidysea" }] });
  const port = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  for (const m of ["getStudentProfile", "getShortlistedProgrammes", "getProfileAssessment"] as const) assert.equal((await port[m](VIDYSEA_OWNER)).ok, true);
  const queries = h.statements.filter(s => /^SELECT/.test(s.text) && !/has_table_privilege/.test(s.text));
  assert.equal(queries.length, 3);
  for (const q of queries) {
    assert.deepEqual(q.values, [VIDYSEA_OWNER]);
    assert.match(q.text, /u.id = s.id/);
    assert.match(q.text, /u.id = \$1/);
    assert.match(q.text, /s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL/);
    assert.match(q.text, /'vidysea' AS source/);
    assert.doesNotMatch(q.text, /SELECT\s+\*|u.deleted_at|s.user_id|password|passport|assessment_data_json|student_note|counsellor_remarks|career_option|Vanced_new/i);
  }
  assert.match(queries[0]!.text, /LIMIT 1$/);
  assert.match(queries[0]!.text, /json_typeof\(s.preferred_countries\)/);
  assert.match(queries[0]!.text, /json_typeof\(v.value\) = 'string'/);
  assert.match(queries[1]!.text, /s.id = q.student_id/);
  assert.match(queries[1]!.text, /q.deleted_at IS NULL[\s\S]*ORDER BY q.created_at DESC, q.id DESC LIMIT 51$/);
  assert.match(queries[2]!.text, /s.id = a.student_id[\s\S]*LIMIT 1$/);
  assert.equal("getSavedCareers" in port, false);
  assert.deepEqual(await port.getCompareList(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "unsupported" });
  assert.equal(h.connects, 3, "unsupported browser-local comparisons do not connect");
  assert.equal(h.ends, h.connects);
  for (const count of [0, 20, 21, 50, 51]) {
    const rows = Array.from({ length: count }, (_, id) => ({ id }));
    const fixture = createFakePg({ rows });
    const bounded = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: fixture.connect, env: {} });
    const result = await bounded.getShortlistedProgrammes(VIDYSEA_OWNER);
    assert.ok(result.ok);
    if (result.ok) {
      assert.deepEqual(result.rows, rows.slice(0, 50), `preserves ordered rows for ${count} picks`);
      assert.equal(result.truncated, count > 50, `truthful truncation for ${count} picks`);
    }
  }
});

test("S12 Vidysea rejects invalid owners, wrong tables and Pathlynks privileged-role override", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ privileges: { students: { UPDATE: true } } });
  const config = { allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: h.connect, env: { PATHLYNKS_ALLOW_PRIVILEGED_ROLE: "1" } };
  const port = createVidyseaPort(config);
  for (const id of ["stu-1", "", "x'; SELECT 1--"]) assert.deepEqual(await port.getStudentProfile(id), { ok: false, reason: "refused", cause: "invalid_student_id" });
  assert.equal(h.connects, 0);
  assert.deepEqual(await port.getStudentProfile(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "privilege_check_failed" });
  assert.ok(!h.statements.some(s => /FROM/.test(s.text)));
  assert.throws(() => createVidyseaPort({ ...config, tables: { ...VIDYSEA_TABLES, student: "users" } }), /read model/);
  assert.throws(() => createVidyseaPort({ ...config, allowedTables: ["users"] }), /allow-list/);
});

test("S12 Vidysea driver refuses unbound/cross-platform/destination/CA refs before lookup", () => {
  const conn = { host: "vidysea-prod-ecs.clk264aaira9.ap-south-1.rds.amazonaws.com", port: 5432, database: "vidyseaprodecs", user: "readonly_fixture", sslmode: "verify-full" as const, passwordRef: "VIDYSEA_DB_PASSWORD" };
  const binding = { platform: "vidysea" as const, siteId: "vidysea", sourceId: "vidysea-db", seed: conn };
  const env = { VIDYSEA_DB_PASSWORD: "synthetic", PATHLYNKS_DB_PASSWORD: "other", VC_ADMIN_MASTER_KEY: "private" };
  assert.equal(buildPgConfig(conn, env), undefined);
  assert.equal(buildPgConfig(conn, env, binding)?.ssl.rejectUnauthorized, true);
  assert.equal(buildPgConfig({ ...conn, host: "attacker.invalid" }, env, binding), undefined);
  assert.equal(buildPgConfig({ ...conn, passwordRef: "PATHLYNKS_DB_PASSWORD" }, env, binding), undefined);
  assert.equal(buildPgConfig(conn, env, { ...binding, siteId: "pathlynks" }), undefined);
  assert.equal(buildPgConfig({ ...conn, caFileRef: "VC_ADMIN_MASTER_KEY" }, env, binding), undefined);
});


test("S12 Vidysea connection never reads Pathlynks or generic environment credentials", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const lookups: string[] = [];
  const env = new Proxy({} as Record<string, string | undefined>, { get(_target, key) { lookups.push(String(key)); return undefined; } });
  for (const passwordRef of ["PATHLYNKS_DB_PASSWORD", "VC_ADMIN_MASTER_KEY", "VIDYSEA_DB_PASSWORD"]) {
    const port = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, env, connection: { host: "fixture.invalid", port: 5432, database: "fixture", user: "fixture", sslmode: "verify-full", passwordRef } });
    assert.deepEqual(await port.getStudentProfile(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "not_configured" });
  }
  assert.deepEqual(lookups, [], "unbound Vidysea ports fail before env reads or connection creation");
});


test("S12 same external owner id stays in its separately constructed platform adapter", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const pathlynks = setup({ rows: [{ name: "Pathlynks fixture", grade: "Grade12" }] });
  const native = createFakePg({ rows: [{ source: "vidysea", name: "Vidysea fixture", academic_level: "master" }] });
  const vidysea = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: native.connect, env: {} });
  assert.deepEqual(await pathlynks.port.getStudentProfile(VIDYSEA_OWNER), { ok: true, rows: [{ name: "Pathlynks fixture", grade: "Grade12" }], truncated: false });
  assert.deepEqual(await vidysea.getStudentProfile(VIDYSEA_OWNER), { ok: true, rows: [{ source: "vidysea", name: "Vidysea fixture", academic_level: "master" }], truncated: false });
  assert.equal(pathlynks.h.connects, 1);
  assert.equal(native.connects, 1);
  assert.ok(!native.statements.some(s => /user_grade|career_option/.test(s.text)));
  assert.ok(!pathlynks.h.statements.some(s => /student_shortlisted_courses|ai_profile_assessments/.test(s.text)));
});

test("S13 real PostgreSQL driver: both platforms, TLS, native ownership, 50-row boundary and read-only enforcement", {
  skip: !process.env.S13_POSTGRES_QA_DIRECTORY,
  timeout: 30_000,
}, async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { randomBytes } = await import("node:crypto");
  const { default: pg } = await import("pg");
  const { createVidyseaPort } = await import("../src/index.js");
  const fixture = path.resolve(fileURLToPath(new URL("../../../qa/.delivery/s13-postgres/", import.meta.url)));
  assert.equal(path.resolve(process.env.S13_POSTGRES_QA_DIRECTORY!), fixture, "only the owned local fixture is accepted");
  const pid = (await fs.readFile(path.join(fixture, "data/postmaster.pid"), "utf8")).split(/\r?\n/);
  assert.equal(path.resolve(pid[1]!), path.join(fixture, "data"));
  assert.equal(pid[3], "15432");
  assert.equal(pid[5], "127.0.0.1");
  const caFile = path.join(fixture, "server.crt");
  const adminConfig = {
    host: "127.0.0.1", port: 15432, user: "s13qa_admin", database: "postgres",
    password: (await fs.readFile(path.join(fixture, "password"), "utf8")).trim(),
    ssl: { rejectUnauthorized: true, ca: await fs.readFile(caFile, "utf8") },
    connectionTimeoutMillis: 3000, query_timeout: 5000,
  };
  const admin = new pg.Client(adminConfig);
  const suffix = randomBytes(8).toString("hex");
  const database = `s13_qa_${suffix}`;
  const role = `s13_ro_${suffix}`;
  const roPassword = randomBytes(32).toString("hex");
  let db: InstanceType<typeof pg.Client> | undefined;
  let createdDb = false;
  let createdRole = false;
  await admin.connect();
  try {
    const location = await admin.query("SHOW data_directory");
    assert.equal(path.resolve(location.rows[0].data_directory), path.join(fixture, "data"), "never bootstrap another server");
    assert.equal((await admin.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0].ssl, true);
    await admin.query(`CREATE DATABASE "${database}"`);
    createdDb = true;
    await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${roPassword}'`);
    createdRole = true;
    db = new pg.Client({ ...adminConfig, database });
    await db.connect();
    await db.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, first_name text, last_name text, is_active boolean, disabled_at timestamptz);
      CREATE TABLE students (id uuid PRIMARY KEY REFERENCES users, deleted_at timestamptz, academic_level text,
        field_of_interest text, target_intake text, budget_min numeric, budget_max numeric, budget_currency text,
        budget_range_text text, nationality text, updated_at timestamptz, preferred_countries json, preferred_courses json);
      CREATE TABLE student_shortlisted_courses (id integer PRIMARY KEY, student_id uuid REFERENCES students,
        programme_id text, university_id text, programme_name text, university_name text, verification_status text,
        is_verified boolean, added_by text, programme_priority integer, student_decision text, is_finalized boolean,
        application_started boolean, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz);
      CREATE TABLE ai_profile_assessments (student_id uuid PRIMARY KEY REFERENCES students, academic_strength text,
        english_proficiency text, work_experience text, financial_capability text, previous_visa_history text,
        preferred_intake text, updated_at timestamptz);
      GRANT CONNECT ON DATABASE "${database}" TO "${role}";
      GRANT USAGE ON SCHEMA public TO "${role}";
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}";
      ALTER ROLE "${role}" SET default_transaction_read_only = on;
    `);
    const other = "22345678-1234-4123-8123-123456789abc";
    for (const id of [VIDYSEA_OWNER, other]) {
      await db.query("INSERT INTO users VALUES ($1, $2, 'Fixture', true, NULL)", [id, id === other ? "Other" : "Owner"]);
      await db.query("INSERT INTO students (id, academic_level, preferred_countries, preferred_courses) VALUES ($1, 'master', $2::json, $3::json)",
        [id, JSON.stringify([null, 5, {}, ...Array.from({ length: 22 }, (_, i) => `Country${i}`)]), JSON.stringify(["Biology", false])]);
    }
    await db.query("INSERT INTO ai_profile_assessments (student_id, academic_strength) VALUES ($1, 'strong')", [VIDYSEA_OWNER]);
    const connection = { host: "127.0.0.1", port: 15432, database, user: role, sslmode: "verify-full" as const,
      passwordRef: "VIDYSEA_DB_PASSWORD", caFileRef: "VIDYSEA_DB_CA_FILE" };
    const config = { allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connection,
      credentialBinding: { platform: "vidysea" as const, siteId: "vidysea", sourceId: "vidysea-db", seed: connection },
      env: { VIDYSEA_DB_PASSWORD: roPassword, VIDYSEA_DB_CA_FILE: caFile } };
    const port = createVidyseaPort(config); // Deliberately no injected connect(): exercises pg and production SQL.
    const profile = await port.getStudentProfile(VIDYSEA_OWNER);
    assert.ok(profile.ok, JSON.stringify(profile));
    assert.equal(profile.rows[0]!.name, "Owner Fixture");
    assert.deepEqual(profile.rows[0]!.preferred_countries, Array.from({ length: 20 }, (_, i) => `Country${i}`));
    assert.deepEqual(profile.rows[0]!.preferred_courses, ["Biology"]);
    const assessment = await port.getProfileAssessment(VIDYSEA_OWNER);
    assert.ok(assessment.ok);
    assert.equal(assessment.rows[0]!.kind, "profile_classification");
    assert.equal(assessment.rows[0]!.academic_strength, "strong");
    for (const count of [0, 20, 21, 50, 51]) {
      await db.query("DELETE FROM student_shortlisted_courses");
      await db.query("INSERT INTO student_shortlisted_courses (id,student_id,programme_name,created_at) SELECT n,$1,'Owner '||n,'2026-10-01'::timestamptz FROM generate_series(1,$2::int) n", [VIDYSEA_OWNER, count]);
      await db.query("INSERT INTO student_shortlisted_courses (id,student_id,programme_name,created_at,deleted_at) VALUES (900,$1,'Other owner',now(),NULL),(901,$2,'Deleted',now(),now())", [other, VIDYSEA_OWNER]);
      const shortlist = await port.getShortlistedProgrammes(VIDYSEA_OWNER);
      assert.ok(shortlist.ok, JSON.stringify(shortlist));
      assert.deepEqual(shortlist.rows.map(row => row.item_id), Array.from({ length: Math.min(count, 50) }, (_, i) => count - i));
      assert.equal(shortlist.truncated, count > 50);
      assert.ok(shortlist.rows.every(row => row.source === "vidysea" && row.sourceTable === "student_shortlisted_courses"));
    }
    for (const [off, on] of [
      ["UPDATE users SET is_active=false", "UPDATE users SET is_active=true"],
      ["UPDATE users SET disabled_at=now()", "UPDATE users SET disabled_at=NULL"],
      ["UPDATE students SET deleted_at=now()", "UPDATE students SET deleted_at=NULL"],
    ]) {
      await db.query(`${off} WHERE id=$1`, [VIDYSEA_OWNER]);
      for (const method of ["getStudentProfile", "getShortlistedProgrammes", "getProfileAssessment"] as const)
        assert.deepEqual(await port[method](VIDYSEA_OWNER), { ok: true, rows: [], truncated: false });
      await db.query(`${on} WHERE id=$1`, [VIDYSEA_OWNER]);
    }
    await db.query(`GRANT UPDATE ON students TO "${role}"`);
    assert.deepEqual(await port.getStudentProfile(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "privilege_check_failed" });
    await db.query(`REVOKE UPDATE ON students FROM "${role}"`);
    const readonly = new pg.Client(buildPgConfig(connection, config.env, config.credentialBinding)!);
    await readonly.connect();
    try {
      assert.equal((await readonly.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only, "on");
      await readonly.query("SET default_transaction_read_only=off");
      await assert.rejects(readonly.query("UPDATE students SET academic_level='changed'"), (error: { code?: string }) => error.code === "42501");
    } finally { await readonly.end(); }
    // Exercise the separate Pathlynks SQL through the same real driver, never the Vidysea read model.
    await db.query(`
      ALTER TABLE users ADD COLUMN deleted_at timestamptz;
      CREATE TABLE grade (id integer PRIMARY KEY, name text);
      CREATE TABLE user_grade (id integer PRIMARY KEY, user_id uuid REFERENCES users, grade_id integer REFERENCES grade, grade_status text);
      CREATE TABLE career_option (id integer PRIMARY KEY, preferred_label text);
      CREATE TABLE student_saved_careers (id integer, student_id uuid REFERENCES users, save_type varchar);
      CREATE TABLE student_career_compare (career_id integer REFERENCES career_option, student_id uuid REFERENCES users, slot integer);
      CREATE TABLE assessment_response (id integer PRIMARY KEY, assessment_id integer, student_id uuid REFERENCES users,
        is_draft_saved boolean, detailed_report json, modified_date timestamptz);
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}";
      INSERT INTO grade VALUES (1,'Grade 11'),(2,'Grade 12');
      INSERT INTO career_option VALUES (1,'Biologist'),(2,'Other owner career');
    `);
    await db.query("INSERT INTO user_grade VALUES (1,$1,1,'active'),(2,$1,2,'active'),(3,$2,1,'active')", [VIDYSEA_OWNER, other]);
    await db.query("INSERT INTO student_saved_careers VALUES (1,$1,'CAREER'),(2,$2,'CAREER'),(2,$1,'CATEGORY')", [VIDYSEA_OWNER, other]);
    await db.query("INSERT INTO student_career_compare VALUES (1,$1,1),(2,$2,1)", [VIDYSEA_OWNER, other]);
    await db.query("INSERT INTO assessment_response VALUES (1,1,$1,true,NULL,'2026-10-01'),(2,1,$1,false,'{}','2026-10-02'),(3,2,$1,true,NULL,'2026-10-03'),(4,3,$2,false,'{}','2026-10-04')", [VIDYSEA_OWNER, other]);
    const pathConnection = { ...connection, passwordRef: "PATHLYNKS_DB_PASSWORD", caFileRef: "PATHLYNKS_DB_CA_FILE" };
    const pathPort = createPathlynksPort({ allowedTables: Object.values(REAL_TABLES), tables: REAL_TABLES,
      connection: pathConnection, allowPrivilegedRole: false,
      credentialBinding: { platform: "pathlynks", siteId: "pathlynks", sourceId: "pathlynks-db", seed: pathConnection },
      env: { PATHLYNKS_DB_PASSWORD: roPassword, PATHLYNKS_DB_CA_FILE: caFile } });
    assert.deepEqual(await pathPort.getStudentProfile(VIDYSEA_OWNER), { ok: true, rows: [{ name: "Owner Fixture", grade: "Grade 12" }], truncated: false });
    for (const method of ["getSavedCareers", "getCompareList"] as const)
      assert.deepEqual(await pathPort[method](VIDYSEA_OWNER), { ok: true, rows: [{ career: "Biologist" }], truncated: false });
    assert.deepEqual(await pathPort.getAssessmentStatus(VIDYSEA_OWNER), { ok: true, rows: [{ completed: 1, inProgress: 1, reportsAvailable: 1, totalResponses: 2, status: "in_progress" }], truncated: false });
    for (const column of ["disabled_at", "deleted_at"]) {
      await db.query(`UPDATE users SET ${column}=now() WHERE id=$1`, [VIDYSEA_OWNER]);
      for (const method of ["getStudentProfile", "getSavedCareers", "getCompareList"] as const)
        assert.deepEqual(await pathPort[method](VIDYSEA_OWNER), { ok: true, rows: [], truncated: false });
      assert.deepEqual(await pathPort.getAssessmentStatus(VIDYSEA_OWNER), { ok: true, rows: [{ completed: 0, inProgress: 0, reportsAvailable: 0, totalResponses: 0, status: "none" }], truncated: false });
      await db.query(`UPDATE users SET ${column}=NULL WHERE id=$1`, [VIDYSEA_OWNER]);
    }
  } finally {
    if (db) await db.end();
    if (createdDb) await admin.query(`DROP DATABASE "${database}"`);
    if (createdRole) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
});

// Scenario (D-124 C2/C4): fit scores, traits and the Combined Report are owner-bound, bounded reads, and are
// unsupported (no connection) when the site has not configured their tables.
test("T057 fit/trait/report reads are owner-bound, bounded and unsupported when unconfigured", async () => {
  const bare = setup();
  for (const m of FIT_METHODS) assert.deepEqual(await bare.port[m]("stu-42"), { ok: false, reason: "unavailable", cause: "unsupported" });
  assert.equal(bare.h.connects, 0, "unconfigured fit reads never connect");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createPathlynksPort({
    allowedTables: [...ALLOW, ...Object.values(FIT_TABLES)],
    tables: { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option", ...FIT_TABLES },
    connect: h.connect,
  });
  for (const m of FIT_METHODS) {
    const before = h.statements.length;
    const res = await port[m]("stu-42");
    assert.equal(res.ok, true, m);
    const selects = h.statements.slice(before).filter((s) => /^\s*SELECT\b/i.test(s.text) && !/has_table_privilege/i.test(s.text));
    assert.equal(selects.length, 1, m);
    assert.match(selects[0]!.text, /u\.id = \$1/, m);
    assert.match(selects[0]!.text, /LIMIT (51|1)\b/, m);
    assert.doesNotMatch(selects[0]!.text, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, m);
  }
  assert.throws(() => createPathlynksPort({ allowedTables: ALLOW, tables: { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option", ...FIT_TABLES }, connect: h.connect }), /allow-list/);
});

// Scenario (D-123): the Vidysea override is Vidysea's own flag; the Pathlynks flag never unlocks it.
test("T057 Vidysea privileged override comes only from VIDYSEA_ALLOW_PRIVILEGED_ROLE", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const owner = VIDYSEA_OWNER;
  const tables = VIDYSEA_TABLES;
  for (const [env, opens] of [[{ PATHLYNKS_ALLOW_PRIVILEGED_ROLE: "1" }, false], [{ VIDYSEA_ALLOW_PRIVILEGED_ROLE: "0" }, false], [{ VIDYSEA_ALLOW_PRIVILEGED_ROLE: "1" }, true]] as const) {
    const h = createFakePg({ privileges: { students: { UPDATE: true } }, rows: [{ x: 1 }] });
    const port = createVidyseaPort({ allowedTables: Object.values(tables), tables, connect: h.connect, env });
    const res = await port.getStudentProfile(owner);
    assert.equal(res.ok, opens, JSON.stringify([env, res]));
  }
  const h = createFakePg({ rows: [{ x: 1 }] });
  const withSnap = createVidyseaPort({ allowedTables: [...Object.values(tables), "pathlynks_student_snapshot"], tables: { ...tables, snapshot: "pathlynks_student_snapshot" }, connect: h.connect, env: {} });
  const snapRes = await withSnap.getPathlynksSnapshot(owner);
  assert.equal(snapRes.ok, true, JSON.stringify(snapRes));
  const snap = h.statements.find((s) => /pathlynks_student_snapshot/.test(s.text) && !/has_table_privilege/i.test(s.text));
  assert.ok(snap && /\$1/.test(snap.text) && /LIMIT 1\b/.test(snap.text));
  const noSnap = createVidyseaPort({ allowedTables: Object.values(tables), tables, connect: h.connect, env: {} });
  assert.deepEqual(await noSnap.getPathlynksSnapshot(owner), { ok: false, reason: "unavailable", cause: "unsupported" });
  assert.throws(() => createVidyseaPort({ allowedTables: [...Object.values(tables), "users2"], tables: { ...tables, snapshot: "users2" }, connect: h.connect, env: {} }), /read model|snapshot/);
});

// Review W1: a jsonb array element that is an object is shown only by name/title/label, never as its raw JSON text; preferences are scalars only.
test("T057 review: jsonb list SQL never falls back to an object's raw JSON", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: [...Object.values(VIDYSEA_TABLES), "pathlynks_student_snapshot"], tables: { ...VIDYSEA_TABLES, snapshot: "pathlynks_student_snapshot" }, connect: h.connect, env: {} });
  await port.getPathlynksSnapshot(VIDYSEA_OWNER);
  const sql = h.statements.find((s) => /pathlynks_student_snapshot/.test(s.text) && !/has_table_privilege/i.test(s.text))!.text;
  assert.match(sql, /WHEN 'object' THEN COALESCE\(e\.v ->> 'name', e\.v ->> 'title', e\.v ->> 'label', e\.v ->> 'trait', e\.v ->> 'category'\) END/);
  assert.doesNotMatch(sql, /'label', e\.v #>> '\{\}'\)/, "no raw-JSON fallback for objects");
  assert.doesNotMatch(sql, /university_preferences_json::text/, "preferences are never raw JSON text");
  assert.match(sql, /jsonb_typeof\(kv\.value\) IN \('string', 'number'\)/);
});

// T-TF-T2 (tool-first S7, TF-7..TF-9): owner-bound journey / application / visa / favourite / scholarship reads.
const TF_NEW_TABLES = { journeyMap: "user_course_journey_map", journeyPhases: "journey_phases", milestones: "milestones", applications: "applications", visa: "visa_applications", favourites: "user_favourites", savedScholarships: "saved_scholarships" } as const;
const TF_ALL_TABLES = [...Object.values(VIDYSEA_TABLES), ...Object.values(TF_NEW_TABLES)];
const TF_METHODS = ["getJourneyMaps", "getApplications", "getVisaApplications", "getFavourites", "getSavedScholarships"] as const;
const TF_FORBIDDEN_COLUMNS = /\b(raw|link|status_notes|summary|checklist_json|comments|offer_letter_url|rejection_reason|service_details_json|commercial_snapshot|document_path|description|notes|reason|dedupe_key|journey_topic_key|sub_stages|input|output|password)\b|SELECT\s+\*/i;
const tfData = (h: { statements: { text: string; values: readonly unknown[] | undefined }[] }) =>
  h.statements.filter(s => /^\s*SELECT\b/i.test(s.text) && !/has_table_privilege/.test(s.text));

test("TF-7 new Vidysea reads: owner-bound, SELECT-only, LIMIT 51, read-only session first, fixed columns", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  for (const m of TF_METHODS) assert.deepEqual(await port[m]!(VIDYSEA_OWNER), { ok: true, rows: [{ x: 1 }], truncated: false }, m);
  const queries = tfData(h);
  assert.equal(queries.length, TF_METHODS.length);
  const tableFor = ["user_course_journey_map", "applications", "visa_applications", "user_favourites", "saved_scholarships"];
  queries.forEach((q, i) => {
    assert.deepEqual(q.values, [VIDYSEA_OWNER]);
    assert.match(q.text, /u\.id = \$1 AND s\.deleted_at IS NULL AND u\.is_active IS TRUE AND u\.disabled_at IS NULL/);
    assert.match(q.text, /JOIN "users" u ON u\.id = s\.id/);
    assert.match(q.text, /'vidysea' AS source/);
    assert.ok(q.text.includes(`'${tableFor[i]}' AS "sourceTable"`), tableFor[i]);
    assert.match(q.text, /LIMIT 51$/);
    assert.doesNotMatch(q.text, TF_FORBIDDEN_COLUMNS);
    assert.ok(!q.text.includes(VIDYSEA_OWNER), "id never concatenated into SQL");
    assert.doesNotMatch(q.text, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
  });
  // The session is made read-only and time-bounded before the first data SELECT on every connection.
  const firstData = h.statements.findIndex(s => /FROM/.test(s.text) && !/has_table_privilege/.test(s.text));
  const ro = h.statements.findIndex(s => s.text === "SET default_transaction_read_only = on");
  const to = h.statements.findIndex(s => s.text === `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  assert.ok(ro >= 0 && to >= 0 && ro < firstData && to < firstData);
  assert.equal(h.ends, h.connects);
});

test("TF-7 shape: soft-deleted rows excluded, archived maps and removed milestones excluded, free text never projected", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  for (const m of TF_METHODS) await port[m]!(VIDYSEA_OWNER);
  const [journey, apps, visa, favs, sch] = tfData(h).map(q => q.text);
  assert.match(journey!, /j\.user_id = s\.id/);
  assert.match(journey!, /j\.archived_at IS NULL/);
  assert.match(journey!, /m\.removed_at IS NULL/);
  assert.match(journey!, /next_due_date/);
  assert.doesNotMatch(journey!, /m\.name|m\.description|m\.reason|m\.document_path|\bmilestone_updates\b/);
  assert.match(apps!, /a\.student_id/);
  assert.match(apps!, /a\.deleted_at IS NULL/);
  for (const col of ["university_name", "program_name", "application_status", "application_deadline", "submission_date"]) assert.match(apps!, new RegExp(`a\\.${col}`));
  for (const col of ["visa_type", "status", "interview_date", "biometrics_status", "visa_fee_status", "country"]) assert.match(visa!, new RegExp(`v\\.${col}`));
  for (const col of ["item_type", "item_name", "university_name", "created_at"]) assert.match(favs!, new RegExp(`f\\.${col}`));
  assert.match(favs!, /f\.user_id/);
  assert.doesNotMatch(favs!, /f\.item_id|f\.university_id/);
  for (const col of ["name", "provider", "country", "amount", "deadline", "status", "applied_at", "result_at"]) assert.match(sch!, new RegExp(`c\\.${col}\\b`));
  assert.match(sch!, /c\.student_id/);
});

test("TF-7 T4: the journey read counts the live 'Pending' milestone status in its own bucket (t2-live.md), after the three model values", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  await port.getJourneyMaps!(VIDYSEA_OWNER);
  const sql = tfData(h)[0]!.text;
  assert.match(sql, /COUNT\(m\.id\) FILTER \(WHERE m\.status = 'Pending'\)::integer AS milestones_pending/);
  assert.match(sql, /COALESCE\(agg\.milestones_pending, 0\) AS milestones_pending/);
  assert.match(sql, /m\.status IS DISTINCT FROM 'Completed'/, "next_due_date still includes Pending");
});

test("TF-7 T4: the five tool-first reads are part of the VidyseaPort contract (required, not optional)", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const port = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, env: {} });
  for (const m of TF_METHODS) assert.equal(typeof port[m], "function", m);
});

test("TF-7 shortlist read exposes application_started and is_finalized", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  await port.getShortlistedProgrammes(VIDYSEA_OWNER);
  assert.match(tfData(h)[0]!.text, /q\.is_finalized, q\.application_started/);
});

test("TF-7 truncation: each new read keeps 50 ordered rows and flags the 51st", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  for (const m of TF_METHODS) {
    for (const count of [0, 50, 51]) {
      const rows = Array.from({ length: count }, (_, id) => ({ id }));
      const h = createFakePg({ rows });
      const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
      const r = await port[m]!(VIDYSEA_OWNER);
      assert.ok(r.ok);
      if (r.ok) { assert.deepEqual(r.rows, rows.slice(0, 50)); assert.equal(r.truncated, count > 50, `${m} ${count}`); }
    }
  }
});

test("TF-8 cross-student: invalid or foreign-shaped ids are refused before any connection; the id is only ever a bound parameter", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  for (const m of TF_METHODS) for (const id of ["", "stu-1", "x'; SELECT 1--", `${VIDYSEA_OWNER} OR 1=1`, undefined as unknown as string]) {
    assert.deepEqual(await port[m]!(id), { ok: false, reason: "refused", cause: "invalid_student_id" }, `${m} ${id}`);
  }
  assert.equal(h.connects, 0);
  const other = "99999999-9999-4999-8999-999999999999";
  await port.getApplications!(other);
  const q = tfData(h)[0]!;
  assert.deepEqual(q.values, [other]);
  assert.ok(!q.text.includes(other));
});

test("TF-9 allow-list: a read whose table is not allow-listed is unsupported and opens no connection; wrong names are refused", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const base = Object.values(VIDYSEA_TABLES);
  const port = createVidyseaPort({ allowedTables: base, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  for (const m of TF_METHODS) assert.deepEqual(await port[m]!(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "unsupported" }, m);
  assert.equal(h.connects, 0);
  // Journey needs all three of its tables; a partial grant reads nothing and probes nothing.
  const partial = createVidyseaPort({ allowedTables: [...base, "user_course_journey_map", "journey_phases"], tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  assert.deepEqual(await partial.getJourneyMaps!(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "unsupported" });
  assert.equal(h.connects, 0);
  // A single new table enables only its own read.
  const one = createVidyseaPort({ allowedTables: [...base, "applications"], tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  assert.equal((await one.getApplications!(VIDYSEA_OWNER)).ok, true);
  assert.equal((await one.getVisaApplications!(VIDYSEA_OWNER)).ok, false);
  assert.ok(!h.statements.some(s => /visa_applications|user_favourites|saved_scholarships|milestones/.test(s.text)));
  // Declared names must be exact and allow-listed.
  assert.throws(() => createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: { ...VIDYSEA_TABLES, applications: "users" }, connect: h.connect, env: {} }), /read model/);
  assert.throws(() => createVidyseaPort({ allowedTables: base, tables: { ...VIDYSEA_TABLES, applications: "applications" }, connect: h.connect, env: {} }), /read model/);
  assert.throws(() => createVidyseaPort({ allowedTables: [...base, "applications; DROP"], tables: VIDYSEA_TABLES, connect: h.connect, env: {} }), /identifier/);
  assert.equal(createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: { ...VIDYSEA_TABLES, ...TF_NEW_TABLES }, connect: h.connect, env: {} }).getStatus().privilegeCheck, "unchecked");
});

test("TF-9 privilege probe covers every enabled new table and fails closed on a writable one; disabled tables are not probed", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const clean = createFakePg({ rows: [{ x: 1 }] });
  const full = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: clean.connect, env: {} });
  await full.getFavourites!(VIDYSEA_OWNER);
  const probed = clean.statements.filter(s => /has_table_privilege/.test(s.text)).map(s => String(s.values?.[0])).sort();
  assert.deepEqual(probed, [...TF_ALL_TABLES].sort());
  for (const table of Object.values(TF_NEW_TABLES)) {
    const h = createFakePg({ privileges: { [table]: { UPDATE: true } }, rows: [{ x: 1 }] });
    const p = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
    assert.deepEqual(await p.getSavedScholarships!(VIDYSEA_OWNER), { ok: false, reason: "unavailable", cause: "privilege_check_failed" }, table);
    assert.equal(tfData(h).length, 0, `${table}: no data SELECT after a failed probe`);
  }
  const bare = createFakePg({ rows: [{ x: 1 }] });
  const none = createVidyseaPort({ allowedTables: Object.values(VIDYSEA_TABLES), tables: VIDYSEA_TABLES, connect: bare.connect, env: {} });
  await none.getShortlistedProgrammes(VIDYSEA_OWNER);
  assert.deepEqual(bare.statements.filter(s => /has_table_privilege/.test(s.text)).map(s => String(s.values?.[0])).sort(), [...Object.values(VIDYSEA_TABLES)].sort());
});

test("TF-7 a failed SET default_transaction_read_only aborts the read: no data SELECT, typed unavailable, connection closed", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const seen: string[] = [];
  let ended = 0;
  const connect = async () => ({
    async query(text: string) {
      seen.push(text);
      if (/^SET default_transaction_read_only/i.test(text)) throw new Error(`cannot set host=db.internal ${SECRET}`);
      return { rows: [{ x: 1 }] };
    },
    async end() { ended += 1; },
  });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect, env: {} });
  for (const m of [...TF_METHODS, "getShortlistedProgrammes", "getStudentProfile"] as const) {
    const r = await port[m]!(VIDYSEA_OWNER);
    assert.deepEqual(r, { ok: false, reason: "unavailable", cause: "query_error" }, m);
    assert.ok(!JSON.stringify(r).includes(SECRET));
  }
  assert.ok(!seen.some(t => /\bFROM\b/.test(t)), "no SELECT is issued after the read-only SET failed");
  assert.equal(ended, TF_METHODS.length + 2);
});


// ---------------------------------------------------------------------------
// D-134 Career Quest reader (Mongo pathlynks_journey). Synthetic documents only.
// ---------------------------------------------------------------------------
const QUEST_ME = "stu-A";
const QUEST_OTHER = "stu-B";
const day = (iso: string) => new Date(iso);
const QUEST_TABLES = { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option" };
function questData() {
  const secrets = { reflection: "PRIVATE-REFLECTION", description: "PRIVATE-DESCRIPTION", proof_files: ["PRIVATE-PROOF"], proof_url: "PRIVATE-PROOF-URL", shareToken: "PRIVATE-SHARE-TOKEN", factualAnswers: { q: "PRIVATE-FACT" }, personaGraph: "PRIVATE-PERSONA", aiSession: "PRIVATE-AI-SESSION" };
  return {
    pathlynks_quest_profiles: [
      { studentId: QUEST_ME, gradeLabel: "Grade 11", board: "CBSE", ...secrets,
        avatarState: { level: 3, xp: 240, hp: 9, hpState: "ok" },
        islandStates: { knowYourself: { completed: true, unlocked: true, progressPct: 100 }, profileBuilding: { completed: false, unlocked: true, progressPct: 40 }, careerSelection: { completed: false, unlocked: true, progressPct: 0 }, universitySelection: { completed: false, unlocked: false, progressPct: 0 } },
        selectedCareer: { category: "Engineering", categoryId: 7, selectedAt: day("2026-10-01") },
        allCareerPicks: [{ category: "Engineering", categoryId: 7, rank: 1 }, { category: "Design", categoryId: 9, rank: 2 }],
        targetUniversity: { name: "Example University", location: "Nowhere", approxCutoff: "99", selectedAt: day("2026-10-02") },
        yearPlan: { planTitle: "Grade 11 plan", level: 2, overview: "PRIVATE-OVERVIEW", completedStepTitles: ["Join a club"], history: [{ areas: [] }],
          areas: [
            { area: "Leadership", status: "active", studentRemark: "PRIVATE-REMARK", activities: [{ step: 2, title: "Run an event", what: "PRIVATE-WHAT", resourceUrl: "PRIVATE-URL" }, { step: 1, title: "Join a club", what: "PRIVATE-WHAT" }] },
            { area: "Science", status: "not_started", activities: [{ step: 1, title: "Build a robot" }] },
          ] } },
      { studentId: QUEST_OTHER, gradeLabel: "OTHER-GRADE", selectedCareer: { category: "OTHER-CAREER" }, targetUniversity: { name: "OTHER-UNIVERSITY" }, yearPlan: { planTitle: "OTHER-PLAN", areas: [] } },
      { studentId: "empty-plan", gradeLabel: "Grade 9" },
    ],
    pathlynks_goals: [
      { studentId: QUEST_ME, title: "Win a science fair", status: "active", targetDate: day("2026-12-01"), ...secrets },
      { studentId: QUEST_ME, title: "Learn Python", status: "completed", targetDate: day("2026-11-01"), ...secrets },
      { studentId: QUEST_ME, title: "Old goal", status: "archived", targetDate: day("2026-01-01") },
      { studentId: QUEST_OTHER, title: "OTHER-GOAL", status: "active", targetDate: day("2026-12-01") },
    ],
    pathlynks_activities: [
      { studentId: QUEST_ME, type: "eca", title: "Chess", verified: true, ...secrets }, { studentId: QUEST_ME, type: "eca", title: "Debate", verified: false, ...secrets },
      { studentId: QUEST_ME, type: "sports", title: "Football", verified: true }, { studentId: QUEST_OTHER, type: "other", title: "OTHER-ACTIVITY", verified: true },
    ],
    pathlynks_skill_activities: [{ studentId: QUEST_ME, title: "skill" }, { studentId: QUEST_OTHER, title: "OTHER-SKILL" }],
  };
}
function questPort(over: { failWith?: Error; hang?: boolean; queryTimeoutMs?: number } = {}) {
  const fake = createQuestFake(questData(), { ...(over.failWith ? { failWith: over.failWith } : {}), ...(over.hang ? { hang: true } : {}) });
  const events: unknown[] = [];
  const port = createPathlynksPort({
    allowedTables: ALLOW, tables: QUEST_TABLES, connect: createFakePg().connect, env: {}, questDb: async () => fake.db, onEvent: (e) => events.push(e),
    ...(over.queryTimeoutMs ? { queryTimeoutMs: over.queryTimeoutMs } : {}),
  });
  return { fake, port, events };
}
const FORBIDDEN_QUEST = /PRIVATE|OTHER|reflection|description|proof|shareToken|factualAnswers|persona|aiSession|resourceUrl|studentRemark/;

test("D-134 the quest reader exposes only find / aggregate / count and is frozen", () => {
  const fake = createQuestFake(questData());
  const reader = createQuestReader(fake.db);
  assert.deepEqual(Object.keys(reader).sort(), ["aggregate", "count", "find"]);
  assert.equal(Object.isFrozen(reader), true);
  for (const w of ["insertOne", "updateOne", "deleteMany", "bulkWrite", "drop", "createIndex"]) assert.equal(w in reader, false, w);
  assert.deepEqual([...QUEST_COLLECTIONS].sort(), ["pathlynks_activities", "pathlynks_goals", "pathlynks_quest_profiles", "pathlynks_skill_activities"]);
});

test("D-134 running every quest read reaches no write method and only the four allow-listed collections", async () => {
  const { fake, port } = questPort();
  for (const m of QUEST_METHODS) assert.equal((await port[m](QUEST_ME)).ok, true, m);
  assert.deepEqual(fake.writeCalls, []);
  assert.deepEqual([...fake.collectionsTouched].sort(), [...QUEST_COLLECTIONS].sort());
  const reader = createQuestReader(fake.db);
  await assert.rejects(reader.find("pathlynks_ai_sessions" as never, QUEST_ME, { projection: { title: 1 }, limit: 1 }));
  await assert.rejects(reader.find("pathlynks_persona_graphs" as never, QUEST_ME, { projection: { title: 1 }, limit: 1 }));
  assert.ok(!fake.collectionsTouched.has("pathlynks_ai_sessions") && !fake.collectionsTouched.has("pathlynks_persona_graphs"));
});

test("D-134 every quest read is owner-bound, time-boxed, secondary-preferred and limited", async () => {
  const { fake, port } = questPort();
  for (const m of QUEST_METHODS) await port[m](QUEST_ME);
  assert.ok(fake.calls.length >= 5);
  for (const c of fake.calls) {
    const owner = c.op === "aggregate" ? (c.pipeline![0] as { $match: Record<string, unknown> }).$match : c.filter!;
    assert.equal(owner.studentId, QUEST_ME, `${c.collection}.${c.op}`);
    assert.equal(c.options!.maxTimeMS, QUEST_MAX_TIME_MS);
    assert.equal(QUEST_MAX_TIME_MS, 3000);
    assert.equal(c.options!.readPreference, QUEST_READ_PREFERENCE);
    if (c.op === "find") assert.ok(Number(c.options!.limit) <= ROW_CAP + 1);
    if (c.op === "aggregate") assert.deepEqual(c.pipeline!.at(-1), { $limit: ROW_CAP + 1 });
  }
  // a caller-supplied filter can narrow the owner's rows but never replace the owner
  const hostile = await createQuestReader(fake.db).find("pathlynks_goals", QUEST_ME, { projection: { title: 1 }, where: { studentId: QUEST_OTHER }, limit: 5 });
  assert.ok(hostile.length > 0 && hostile.every((d) => d.title !== "OTHER-GOAL"));
});

test("D-134 projection allow-list: no private field is requested, mapped or returned", async () => {
  const { fake, port } = questPort();
  const results = await Promise.all(QUEST_METHODS.map((m) => port[m](QUEST_ME)));
  const text = JSON.stringify(results);
  assert.ok(!FORBIDDEN_QUEST.test(text), text.match(FORBIDDEN_QUEST)?.[0]);
  for (const c of fake.calls) if (c.op === "find") assert.ok(!FORBIDDEN_QUEST.test(JSON.stringify(c.options!.projection)), `${c.collection} projection`);
  // the fixture really holds the private fields, so the clean result above is the allow-list at work
  const whole = createQuestFake(questData());
  const raw = whole.db.collection("pathlynks_quest_profiles") as unknown as { find: (f: object) => { toArray: () => Promise<unknown[]> } };
  assert.ok(JSON.stringify(await raw.find({ studentId: QUEST_ME }).toArray()).includes("PRIVATE-SHARE-TOKEN"));
});

test("D-134 getQuestProfile maps islands, level, selected career, picks and target university for the owner only", async () => {
  const { port } = questPort();
  assert.deepEqual(await port.getQuestProfile(QUEST_ME), { ok: true, truncated: false, rows: [{
    gradeLabel: "Grade 11", board: "CBSE", level: 3, xp: 240, islandKnowYourself: "completed", islandProfileBuilding: "in progress (40%)", islandCareerSelection: "unlocked",
    islandUniversitySelection: "locked", selectedCareer: "Engineering", picksCount: 2, targetUniversity: "Example University" }] });
  assert.deepEqual(await port.getQuestProfile("nobody"), { ok: true, rows: [], truncated: false }, "no profile is zero rows, not an error");
});

test("D-134 getQuestGoals returns title, status and due for the owner, drops archived goals, and zero goals is an empty list", async () => {
  const { port } = questPort();
  assert.deepEqual(await port.getQuestGoals(QUEST_ME), { ok: true, truncated: false, rows: [{ title: "Learn Python", status: "completed", due: "2026-11-01" }, { title: "Win a science fair", status: "active", due: "2026-12-01" }] });
  assert.deepEqual(await port.getQuestGoals("nobody"), { ok: true, rows: [], truncated: false });
});

test("D-134 getQuestPlan gives step counts, the next step, activity counts by type and skill activities; nothing for a student with none", async () => {
  const { port } = questPort();
  assert.deepEqual(await port.getQuestPlan(QUEST_ME), { ok: true, truncated: false, rows: [{
    planTitle: "Grade 11 plan", planLevel: 2, areasTotal: 2, areaStatuses: "active 1, not_started 1", stepsTotal: 3, stepsCompleted: 1, nextArea: "Leadership", nextStep: "Run an event",
    activitiesLogged: 3, activitiesVerified: 2, activitiesByType: "eca 2, sports 1", skillActivities: 1 }] });
  assert.deepEqual(await port.getQuestPlan("nobody"), { ok: true, rows: [], truncated: false });
});

test("D-134 a database outage is unavailable (never zero rows), typed with a fixed cause and no driver text", async () => {
  const SECRET_TEXT = "mongodb://user:hunter2@db.internal:27017 ECONNRESET";
  for (const m of QUEST_METHODS) {
    const down = questPort({ failWith: new Error(SECRET_TEXT) });
    const r = await down.port[m](QUEST_ME);
    assert.deepEqual(r, { ok: false, reason: "unavailable", cause: "query_error" }, m);
    assert.ok(!JSON.stringify([r, down.events]).includes("hunter2"));
    const slow = await questPort({ hang: true, queryTimeoutMs: 40 }).port[m](QUEST_ME);
    assert.deepEqual(slow, { ok: false, reason: "unavailable", cause: "timeout" }, m);
  }
  const noOpen = createPathlynksPort({ allowedTables: ALLOW, tables: QUEST_TABLES, connect: createFakePg().connect, env: {}, questDb: async () => { throw new Error(SECRET_TEXT); } });
  assert.deepEqual(await noOpen.getQuestGoals(QUEST_ME), { ok: false, reason: "unavailable", cause: "connect_error" });
  const bare = createPathlynksPort({ allowedTables: ALLOW, tables: QUEST_TABLES, connect: createFakePg().connect, env: {} });
  assert.deepEqual(await bare.getQuestProfile(QUEST_ME), { ok: false, reason: "unavailable", cause: "not_configured" });
});

test("D-134 a hostile student id is refused before the quest database is opened, and aggregation stages that write or join are refused", async () => {
  let opened = 0;
  const fake = createQuestFake(questData());
  const port = createPathlynksPort({ allowedTables: ALLOW, tables: QUEST_TABLES, connect: createFakePg().connect, env: {}, questDb: async () => { opened += 1; return fake.db; } });
  for (const bad of ["x'; db.dropDatabase();//", "", "a".repeat(200), "s\u0000x", "../x", "$ne"]) {
    for (const m of QUEST_METHODS) assert.deepEqual(await port[m](bad), { ok: false, reason: "refused", cause: "invalid_student_id" }, `${m} ${bad}`);
  }
  assert.equal(opened, 0);
  const reader = createQuestReader(fake.db);
  for (const stage of [{ $out: "x" }, { $merge: { into: "x" } }, { $lookup: { from: "pathlynks_goals" } }, { $set: { a: 1 } }, { $match: {}, $limit: 1 }]) {
    await assert.rejects(reader.aggregate("pathlynks_activities", QUEST_ME, [stage as Record<string, unknown>]), JSON.stringify(stage));
  }
  assert.deepEqual(fake.writeCalls, []);
});

// route-fix-1 item 6: next_due_date is the earliest OPEN milestone that is not already past (IST calendar day), so a reply never labels an overdue date "next due".
test("RF1-6: next_due_date skips milestones whose end_date is before today (IST)", async () => {
  const { createVidyseaPort } = await import("../src/index.js");
  const h = createFakePg({ rows: [{ x: 1 }] });
  const port = createVidyseaPort({ allowedTables: TF_ALL_TABLES, tables: VIDYSEA_TABLES, connect: h.connect, env: {} });
  await port.getJourneyMaps!(VIDYSEA_OWNER);
  const sql = tfData(h)[0]!.text;
  assert.match(sql, /MIN\(m\.end_date\) FILTER \(WHERE m\.status IS DISTINCT FROM 'Completed' AND m\.end_date >= \(now\(\) AT TIME ZONE 'Asia\/Kolkata'\)::date\) AS next_due_date/);
});
