/** Checker A cycle-1 P3 end-to-end: the web dashboard window through the REAL metrics route. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_PATH, adminWorld } from "./admin-fixtures.js";
import { defaultRange, metricsWindow } from "../../web/src/app/admin/_lib/format.ts";

const usage = (at: string, siteId = "pathlynks") => ({ at, siteId, studentKey: "ab".repeat(32), mode: "chat" as const, inputTokens: 10, outputTokens: 5, costUsd: 0.01, latencyMs: 100, answered: true });
const sum = (rows: { conversations: number }[]) => rows.reduce((n, c) => n + c.conversations, 0);

test("C1-P3: default window (today, and the last ms of today) contains today's rows via the real route; tomorrow is excluded; from==to day works", async () => {
  const w = await adminWorld({ env: {} });
  const viewer = await w.token("viewer");
  const now = new Date(w.clock.ms); // 2026-10-26T10:00Z
  for (const at of [now.toISOString(), "2026-10-26T23:59:59.999Z", "2026-10-27T00:00:00.000Z", "2026-10-20T00:00:00.000Z", "2026-10-19T23:59:59.999Z"]) await w.store.usage.record(usage(at));
  const win = metricsWindow(defaultRange(now));
  const r = await w.call("GET", `${ADMIN_PATH}metrics?from=${win.from}&to=${win.to}`, { token: viewer });
  console.log("P3 window", JSON.stringify(win), r.status, JSON.stringify(r.json?.perSiteDay ?? r.body.slice(0, 200)));
  assert.equal(r.status, 200, r.body);
  assert.equal(sum(r.json.perSiteDay), 3, "10:00Z today, 23:59:59.999Z today, and 2026-10-20 (from) are in; 10-27T00:00 and 10-19 are out");
  const one = metricsWindow({ from: "2026-10-26", to: "2026-10-26" });
  const r2 = await w.call("GET", `${ADMIN_PATH}metrics?from=${one.from}&to=${one.to}`, { token: viewer });
  assert.equal(r2.status, 200, r2.body);
  assert.equal(sum(r2.json.perSiteDay), 2);
  const raw = defaultRange(now);
  const r3 = await w.call("GET", `${ADMIN_PATH}metrics?from=${raw.from}&to=${raw.to}`, { token: viewer });
  const rawTotal = sum(r3.json.perSiteDay);
  console.log("P3 raw window total (pre-fix behaviour)", rawTotal);
  assert.equal(rawTotal, 1, "without metricsWindow today's rows are lost (only the 10-20 row remains)");
  assert.deepEqual(metricsWindow({ from: "2026-10-20", to: "garbage" }), { from: "2026-10-20", to: "garbage" });
});
