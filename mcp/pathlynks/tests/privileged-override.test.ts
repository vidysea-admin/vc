/**
 * G1 (answered 2026-10-26): the Pathlynks pool user (pathlynksadm) holds write privileges, so the connect-time refusal can be skipped by the explicit
 * override PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1 (default off). Everything else stays: SELECT-only SQL, the read-only transaction, the timeout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPathlynksPort, type PathlynksPortConfig } from "../src/index.js";
import { createFakePg, type FakeOptions } from "./fakes.js";

const TABLES = { profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare", assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option" };
const ALLOW = Object.values(TABLES);
const WRITER: FakeOptions["privileges"] = Object.fromEntries(ALLOW.map((t) => [t, { INSERT: true, UPDATE: true, DELETE: true }]));

function setup(fake: FakeOptions, over: Partial<PathlynksPortConfig> = {}) {
  const h = createFakePg({ rows: [{ student_id: "stu-1", career: "Pilot" }], ...fake });
  const events: unknown[] = [];
  const port = createPathlynksPort({ allowedTables: ALLOW, tables: TABLES, connect: h.connect, onEvent: (e) => events.push(e), env: {}, ...over });
  return { h, port, events };
}

test("G1: without the override a writer role is refused and no data SELECT is issued (fail closed, as built)", async () => {
  const { h, port, events } = setup({ privileges: WRITER });
  const res = await port.getSavedCareers("stu-1");
  assert.deepEqual(res, { ok: false, reason: "unavailable", cause: "privilege_check_failed" });
  assert.equal(h.statements.filter((s) => /JOIN "student_saved_careers"/.test(s.text)).length, 0);
  assert.ok(!events.some((e) => (e as { type: string }).type === "privileged_role_override"));
});

test("G1: with PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1 a writer role reads, through SELECT-only SQL in a read-only transaction, with one startup warning event and no secret in it", async () => {
  const { h, port, events } = setup({ privileges: WRITER }, { env: { PATHLYNKS_ALLOW_PRIVILEGED_ROLE: "1" } });
  assert.deepEqual(events, [{ type: "privileged_role_override" }], "announced once at construction, before any read");
  const res = await port.getSavedCareers("stu-1");
  assert.equal(res.ok, true);
  assert.ok(res.ok && res.rows.length === 1);
  const texts = h.statements.map((s) => s.text);
  assert.ok(texts.some((t) => /^SET default_transaction_read_only = on$/.test(t)), "read-only transaction stays");
  assert.ok(texts.some((t) => /^SET statement_timeout = 3000$/.test(t)), "timeout stays");
  const data = texts.filter((t) => !/^SET\b/i.test(t));
  assert.equal(data.length, 1);
  assert.match(data[0]!, /^SELECT co\.preferred_label AS career[\s\S]*WHERE u\.id = \$1[\s\S]*LIMIT 51$/);
  assert.ok(data.every((t) => /^SELECT\b/i.test(t)), "only SELECT is ever sent");
  assert.ok(!texts.some((t) => /has_table_privilege/i.test(t)), "the probe is skipped under the override");
  assert.ok(!texts.some((t) => /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b\s+(INTO|FROM|TABLE)?/i.test(t.replace(/has_table_privilege.*/i, ""))), "no write statement of any kind");
  assert.ok(!JSON.stringify(events).match(/password|secret|host/i));
});

test("G1: only the exact value 1 turns the override on (true, yes, 0, empty and ' 1' do not), and the explicit config option wins over the env", async () => {
  for (const v of ["true", "yes", "0", "", " 1", "on"]) {
    const { port, events } = setup({ privileges: WRITER }, { env: { PATHLYNKS_ALLOW_PRIVILEGED_ROLE: v } });
    assert.equal((await port.getSavedCareers("stu-1")).ok, false, JSON.stringify(v));
    assert.deepEqual(events.filter((e) => (e as { type: string }).type === "privileged_role_override"), [], JSON.stringify(v));
  }
  const forcedOff = setup({ privileges: WRITER }, { env: { PATHLYNKS_ALLOW_PRIVILEGED_ROLE: "1" }, allowPrivilegedRole: false });
  assert.equal((await forcedOff.port.getSavedCareers("stu-1")).ok, false);
  const forcedOn = setup({ privileges: WRITER }, { env: {}, allowPrivilegedRole: true });
  assert.equal((await forcedOn.port.getSavedCareers("stu-1")).ok, true);
});

test("G1: the override does not weaken the other guards: a bad student id is refused, a failed SET still fails closed, a SELECT error is a typed unavailable", async () => {
  const over = { env: { PATHLYNKS_ALLOW_PRIVILEGED_ROLE: "1" } };
  const bad = setup({ privileges: WRITER }, over);
  assert.deepEqual(await bad.port.getStudentProfile("x'; DROP TABLE students;--"), { ok: false, reason: "refused", cause: "invalid_student_id" });
  assert.equal(bad.h.connects, 0, "no connection for a refused id");
  const failSet = setup({ privileges: WRITER, failSet: new Error("boom host=db.internal.example password=hunter2") }, over);
  const r1 = await failSet.port.getStudentProfile("stu-1");
  assert.deepEqual(r1, { ok: false, reason: "unavailable", cause: "query_error" });
  assert.ok(!JSON.stringify(r1).includes("hunter2"));
  const failSelect = setup({ privileges: WRITER, failSelect: new Error("relation does not exist") }, over);
  assert.deepEqual(await failSelect.port.getStudentProfile("stu-1"), { ok: false, reason: "unavailable", cause: "query_error" });
});
