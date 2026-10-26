/** Checker A cycle-1: does R6's "diagnostics >= files" heuristic reject a repo whose tables parse fine? */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_PATH, adminWorld, fakeGithub } from "./admin-fixtures.js";

const mig = (n: number, raw: boolean) =>
  `module.exports = { up: async (queryInterface, Sequelize) => { await queryInterface.createTable('t${n}', { id: { type: Sequelize.INTEGER, primaryKey: true } });${raw ? " await queryInterface.sequelize.query('CREATE INDEX x ON t' + " + n + ");" : ""} }, down: async (queryInterface) => { await queryInterface.dropTable('t${n}'); } };`;

test("C1-R6 heuristic: 4 migration files, each a valid createTable plus one raw sequelize.query (which E1 now reports as 1 diagnostic each)", async () => {
  const files: Record<string, string> = {};
  for (let i = 1; i <= 4; i++) files[`migrations/2026010${i}-t${i}.js`] = mig(i, true);
  const w = await adminWorld({ github: () => fakeGithub(files), env: {} });
  await w.store.sources.upsert({ id: "gh-school", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school" } as never });
  const r = await w.call("POST", `${ADMIN_PATH}sources/gh-school/sync`, { token: await w.token("admin"), body: {} });
  console.log("R6-HEUR with raw queries:", r.body.slice(0, 400));
  const files2: Record<string, string> = {};
  for (let i = 1; i <= 4; i++) files2[`migrations/2026010${i}-t${i}.js`] = mig(i, false);
  const w2 = await adminWorld({ github: () => fakeGithub(files2), env: {} });
  await w2.store.sources.upsert({ id: "gh-school", siteId: "pathlynks", kind: "github", config: { owner: "a", repo: "b", branch: "main", service: "school" } as never });
  const r2 = await w2.call("POST", `${ADMIN_PATH}sources/gh-school/sync`, { token: await w2.token("admin"), body: {} });
  console.log("R6-HEUR control without raw queries:", r2.body.slice(0, 300));
});
