/** Checker B: concurrent rotate of the two scopes of one partner (two operators or two CLI processes). Outside the bound tree. */
import { test } from "node:test";
import assert from "node:assert/strict";
const W = "file:///D:/vc/.worktrees/pc-partner-keys/apps/api";
const P: any = await import(`${W}/src/partners.ts`);
const DBT: any = await import("file:///D:/vc/.worktrees/pc-partner-keys/packages/db/src/testing.ts");
const PEPPER = "checker-b-pepper-".padEnd(40, "z");
const T0 = Date.parse("2026-11-01T10:00:00.000Z");

test("H9 two rotates of different scopes that overlap: both new keys must work and both old keys must be dead", async () => {
  const { db } = DBT.createFakeDb();
  const real = P.createMongoPartnerStore(db);
  const ctx = { pepper: PEPPER, now: () => new Date(T0) };
  const added = await P.addPartner(real, { name: "Race Co", origins: ["https://race.example"] }, ctx);
  const old = added.keys;
  // Barrier: both rotations read the partner before either writes (what two operators / two CLI processes can do).
  let waiting = 0; let release!: () => void; const gate = new Promise<void>((r) => (release = r));
  const store = { ...real, get: async (id: string) => { const d = await real.get(id); if (++waiting === 2) release(); await gate; return d; } };
  const [a, b] = await Promise.all([P.rotatePartner(store, "race-co", "pub", ctx), P.rotatePartner(store, "race-co", "srv", ctx)]);
  const reg = P.createPartnerRegistry({ store: real, pepper: PEPPER, nowMs: () => T0 });
  const res = {
    newPubWorks: !!(await reg.authenticate(a.key, "pub")),
    newSrvWorks: !!(await reg.authenticate(b.key, "srv")),
    oldPubStillWorks: !!(await reg.authenticate(old.pub, "pub")),
    oldSrvStillWorks: !!(await reg.authenticate(old.srv, "srv")),
  };
  console.log("H9 RESULT", JSON.stringify(res));
  assert.deepEqual(res, { newPubWorks: true, newSrvWorks: true, oldPubStillWorks: false, oldSrvStillWorks: false });
});
