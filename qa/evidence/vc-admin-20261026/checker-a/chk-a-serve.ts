import { addPartner } from "../src/partners.js";
import { createApiServer } from "../src/server.js";
import { adminWorld, fakeGithub, fakePostgres } from "./admin-fixtures.js";

const port = Number(process.env.CHK_API_PORT ?? 4411);
const w = await adminWorld({
  nowMs: Date.now,
  clientKey: () => `k${Math.random()}`,
  github: () => fakeGithub({ "migrations/20260101-init.js": "module.exports={up:async q=>{await q.createTable('users',{id:{type:'INTEGER'}})}}" }),
  postgres: fakePostgres({ ok: true }),
});
await addPartner(w.partnerStore, { name: "Pathlynks", origins: ["https://pathlynks.example"] }, w.deps.partnerCtx!);
await w.store.sources.upsert({ id: "gh-1", siteId: "pathlynks", kind: "github", config: { owner: "acme", repo: "backend", branch: "main", service: "school" } });
for (let i = 0; i < 6; i++) {
  await w.store.usage.record({ at: new Date(Date.now() - i * 3600_000).toISOString(), siteId: "pathlynks", studentKey: String(i % 3).repeat(64), mode: i % 2 ? "voice" : "chat", inputTokens: 100, outputTokens: 50, costUsd: 0.01, latencyMs: 900 + i * 100, answered: i !== 4, ...(i === 3 ? { guardrail: "crisis" } : {}) });
}
const server = createApiServer(w.handler);
server.listen(port, "127.0.0.1", () => console.error(`chk-a admin api on ${port} pid ${process.pid}`));
