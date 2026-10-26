/** Checker A cycle-2: sync no longer reports a false error from diagnostics (R6/F4); real failures still fail. Run in a throwaway copy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_PATH, adminWorld, fakeGithub } from "./admin-fixtures.js";

const mig = (n: number, raw: boolean, table = true) =>
  `module.exports = { up: async (queryInterface, Sequelize) => { ${table ? `await queryInterface.createTable('t${n}', { id: { type: Sequelize.INTEGER, primaryKey: true } });` : ""}${raw ? " await queryInterface.sequelize.query('CREATE INDEX x ON t' + " + n + ");" : ""} }, down: async (queryInterface) => { await queryInterface.dropTable('t${n}'); } };`;

async function run(files: Record<string, string>) {
  const w = await adminWorld({ github: () => fakeGithub(files), env: {} });
  await w.store.sources.upsert({ id: "gh-school", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school" } as never });
  const r = await w.call("POST", `${ADMIN_PATH}sources/gh-school/sync`, { token: await w.token("admin"), body: {} });
  return { r, w };
}

test("C2-R6 the cycle-1 probe: 4 files, each a valid createTable plus one raw query -> status ok, 4 tables, diagnostics recorded", async () => {
  const files: Record<string, string> = {};
  for (let i = 1; i <= 4; i++) files[`migrations/2026010${i}-t${i}.js`] = mig(i, true);
  const { r } = await run(files);
  console.log("R6c2 raw-query repo:", r.body.slice(0, 500));
  assert.equal(r.json.status, "ok");
  assert.equal(r.json.counts.tables, 4);
  assert.ok(r.json.counts.diagnostics >= 4);
});

test("C2-R6 real failures still fail: no files, files without tables (even with diagnostics), and the stored artifact is kept", async () => {
  const none = await run({ "README.md": "x" });
  console.log("R6c2 no migrations:", none.r.body.slice(0, 300));
  assert.equal(none.r.json.status, "error");
  const files: Record<string, string> = {};
  for (let i = 1; i <= 3; i++) files[`migrations/2026010${i}-t${i}.js`] = mig(i, true, false);
  const nt = await run(files);
  console.log("R6c2 tables=0 with diagnostics:", nt.r.body.slice(0, 400));
  assert.equal(nt.r.json.status, "error");
});

test("C2-R6 mixed: 5 files, 1 table, 4 unparseable raw-only -> ok (diagnostics >= files no longer errors)", async () => {
  const files: Record<string, string> = { "migrations/20260101-t1.js": mig(1, false) };
  for (let i = 2; i <= 5; i++) files[`migrations/2026010${i}-t${i}.js`] = mig(i, true, false);
  const { r } = await run(files);
  console.log("R6c2 mixed:", r.body.slice(0, 400));
  assert.equal(r.json.status, "ok");
});
