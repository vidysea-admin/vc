import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "file:///D:/vc/.worktrees/pc-partner-keys/packages/db/src/testing.ts";
import {
  addPartner, createMongoPartnerStore, createPartnerRegistry, revokePartner, rotatePartner, runPartnerCli, PartnerError, PartnerRegistryUnavailableError, RESERVED_PARTNER_IDS,
  type PartnerStore,
} from "file:///D:/vc/.worktrees/pc-partner-keys/apps/api/src/partners.ts";

const PEPPER = "synthetic-pepper-".padEnd(40, "x");
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const unhandled: unknown[] = [];
process.on("unhandledRejection", (e) => unhandled.push(e));

function world() {
  const { db } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const clock = { ms: T0 };
  const ctx = { pepper: PEPPER, now: () => new Date(clock.ms) };
  const fresh = () => createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => clock.ms });
  return { store, clock, ctx, fresh };
}
/** get() holds callers until n have read. */
function barrier(real: PartnerStore, n: number): PartnerStore {
  let waiting = 0; let release!: () => void; const gate = new Promise<void>((r) => (release = r));
  return { ...real, get: async (id) => { const d = await real.get(id); if (++waiting === n) release(); await gate; return d; } };
}
/** update() whose predicate says "mine" is held until the test opens the gate. */
function delayedUpdate(real: PartnerStore, which: (i: number, patch: object) => boolean) {
  let i = 0; let open!: () => void; const gate = new Promise<void>((r) => (open = r));
  const store: PartnerStore = { ...real, update: async (id, patch) => { const mine = which(i++, patch); if (mine) await gate; return real.update(id, patch); } };
  return { store, open };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("H1: three overlapping rotates (pub, srv, pub): srv new works, exactly one pub works, all olds dead", async () => {
  const w = world();
  const old = await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
  const s = barrier(w.store, 3);
  const [a, b, c] = await Promise.all([rotatePartner(s, "race-co", "pub", w.ctx), rotatePartner(s, "race-co", "srv", w.ctx), rotatePartner(s, "race-co", "pub", w.ctx)]);
  const r = w.fresh();
  assert.ok(await r.authenticate(b.key, "srv"));
  const works = (await Promise.all([a.key, c.key].map((k) => r.authenticate(k, "pub")))).filter(Boolean).length;
  assert.equal(works, 1);
  assert.equal(await r.authenticate(old.keys.pub, "pub"), undefined);
  assert.equal(await r.authenticate(old.keys.srv, "srv"), undefined);
});

test("H2: staggered: one scope's WRITE is held until the other scope's rotate has fully finished (both orders): both new keys work", async () => {
  for (const delayed of ["pub", "srv"] as const) {
    const w = world();
    const old = await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
    const other = delayed === "pub" ? "srv" : "pub";
    const d = delayedUpdate(barrier(w.store, 2), (_i, patch) => `keys.${delayed}` in patch);
    const p1 = rotatePartner(d.store, "race-co", delayed, w.ctx);
    const p2 = rotatePartner(d.store, "race-co", other, w.ctx);
    const second = await p2;
    await tick();
    d.open();
    const first = await p1;
    const r = w.fresh();
    assert.ok(await r.authenticate(first.key, delayed), `${delayed} new`);
    assert.ok(await r.authenticate(second.key, other), `${other} new`);
    assert.equal(await r.authenticate(old.keys[delayed], delayed), undefined);
    assert.equal(await r.authenticate(old.keys[other], other), undefined);
  }
});

test("H3: rotate overlapping revoke in every interleaving: a revoked partner never ends with a working key", async () => {
  for (const scope of ["pub", "srv"] as const) for (const order of ["revoke-between-read-and-write", "revoke-after-write", "revoke-before-read"] as const) {
    const w = world();
    const old = await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
    let rot: Promise<unknown>;
    let newKey = "";
    if (order === "revoke-before-read") {
      await revokePartner(w.store, "race-co");
      rot = rotatePartner(w.store, "race-co", scope, w.ctx).then((x) => (newKey = x.key), () => undefined);
    } else if (order === "revoke-after-write") {
      const x = await rotatePartner(w.store, "race-co", scope, w.ctx); newKey = x.key;
      await revokePartner(w.store, "race-co"); rot = Promise.resolve();
    } else {
      const d = delayedUpdate(w.store, () => true);
      rot = rotatePartner(d.store, "race-co", scope, w.ctx).then((x) => (newKey = x.key));
      await tick();
      await revokePartner(w.store, "race-co");
      d.open();
    }
    await rot;
    const r = w.fresh();
    const doc = (await w.store.get("race-co"))!;
    assert.equal(doc.status, "revoked", `${scope}/${order}`);
    for (const [k, s] of [[old.keys.pub, "pub"], [old.keys.srv, "srv"], [newKey, scope]] as const) if (k) assert.equal(await r.authenticate(k, s), undefined, `${scope}/${order} ${s}`);
  }
});

test("H3b: revoke whose read precedes a concurrent rotate, with the revoke write held: status still ends revoked and nothing authenticates", async () => {
  const w = world();
  const old = await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
  const d = delayedUpdate(w.store, (_i, patch) => "status" in patch);
  const rv = revokePartner(d.store, "race-co");
  await tick();
  const x = await rotatePartner(w.store, "race-co", "srv", w.ctx);
  d.open();
  await rv;
  const r = w.fresh();
  assert.equal((await w.store.get("race-co"))!.status, "revoked");
  for (const [k, s] of [[old.keys.pub, "pub"], [old.keys.srv, "srv"], [x.key, "srv"]] as const) assert.equal(await r.authenticate(k, s), undefined);
});

test("H4: store.update fails after the read (reject, and false): old keys stay, nothing half-written, no key leaks in errors", async () => {
  const w = world();
  const old = await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
  const before = JSON.stringify(await w.store.get("race-co"));
  const boom: PartnerStore = { ...w.store, update: async () => { throw new Error("mongo down"); } };
  await assert.rejects(() => rotatePartner(boom, "race-co", "pub", w.ctx), /mongo down/);
  const nf: PartnerStore = { ...w.store, update: async () => false };
  await assert.rejects(() => rotatePartner(nf, "race-co", "srv", w.ctx), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  assert.equal(JSON.stringify(await w.store.get("race-co")), before);
  const r = w.fresh();
  assert.ok(await r.authenticate(old.keys.pub, "pub")); assert.ok(await r.authenticate(old.keys.srv, "srv"));
  await assert.rejects(() => runPartnerCli(["rotate", "race-co", "--scope", "pub"], { store: boom, pepper: PEPPER }), (e: unknown) => !/vck_(pub|srv)_/.test(String((e as Error).message)));
});

test("H5: rotate on revoked / unknown / bad scope is clean", async () => {
  const w = world();
  await addPartner(w.store, { name: "Race", id: "race-co" }, w.ctx);
  await revokePartner(w.store, "race-co"); await revokePartner(w.store, "race-co");
  await assert.rejects(() => rotatePartner(w.store, "race-co", "pub", w.ctx), (e: unknown) => e instanceof PartnerError && e.code === "partner_revoked");
  await assert.rejects(() => rotatePartner(w.store, "nobody", "pub", w.ctx), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  await assert.rejects(() => rotatePartner(w.store, "race-co", "both" as never, w.ctx), (e: unknown) => e instanceof PartnerError);
});

test("H6: rotate does not touch other fields", async () => {
  const w = world();
  await addPartner(w.store, { name: "Race", id: "race-co", origins: ["https://a.example"] }, w.ctx);
  const before = (await w.store.get("race-co"))!;
  await rotatePartner(w.store, "race-co", "pub", w.ctx);
  const after = (await w.store.get("race-co"))!;
  assert.deepEqual({ ...after, keys: undefined }, { ...before, keys: undefined });
  assert.deepEqual(after.keys.srv, before.keys.srv);
  assert.notDeepEqual(after.keys.pub, before.keys.pub);
});

test("H7: reserved ids: case, whitespace, slug, newline, unicode, zero-width", async () => {
  const w = world();
  const cases: Array<[string, { name: string; id?: string }]> = [
    ["sandbox", { name: "x", id: "sandbox" }], ["SANDBOX", { name: "x", id: "SANDBOX" }], [" sandbox", { name: "x", id: " sandbox" }], ["sandbox_sp", { name: "x", id: "sandbox " }],
    ["sandbox_nl", { name: "x", id: "sandbox\n" }], ["name Sandbox", { name: "Sandbox" }], ["name '  SANDBOX! '", { name: "  SANDBOX! " }], ["name sandbox-", { name: "sandbox-" }],
    ["name -sandbox-", { name: "-sandbox-" }], ["name Admin", { name: "Admin" }], ["name Root", { name: "Root" }], ["fullwidth name", { name: "ｓａｎｄｂｏｘ" }],
    ["sandbox_zw", { name: "x", id: "sandbox\u200b" }], ["sand_box", { name: "x", id: "sand_box" }], ["SYSTEM", { name: "x", id: "SYSTEM" }], ["default", { name: "Default" }],
  ];
  const out: string[] = [];
  for (const [label, input] of cases) {
    try { const r = await addPartner(w.store, input, w.ctx); out.push(`ALLOWED ${label} -> ${r.partner.partnerId}`); } catch (e) { out.push(`refused ${label}: ${(e as PartnerError).code}`); }
  }
  console.log(out.join("\n"));
  assert.deepEqual(out.filter((l) => l.startsWith("ALLOWED")), []);
});

test("H8: sandbox-1 is NOT reserved (documented gap: exact ids only)", async () => {
  const w = world();
  const r = await addPartner(w.store, { name: "x", id: "sandbox-1" }, w.ctx);
  console.log("sandbox-1 allowed:", r.partner.partnerId, "| reserved list:", RESERVED_PARTNER_IDS.join(","));
});

test("H9: registry sync throw under concurrency: concurrent callers coalesce into one read and reject; next call reads again; no unhandled rejection", async () => {
  const w = world();
  const k = await addPartner(w.store, { name: "Path", id: "path-co" }, w.ctx);
  let calls = 0;
  const flaky: PartnerStore = { ...w.store, list: (() => { calls++; if (calls === 1) throw new Error("sync"); if (calls === 2) return Promise.reject(new Error("async")); return w.store.list(); }) as PartnerStore["list"] };
  const r = createPartnerRegistry({ store: flaky, pepper: PEPPER, nowMs: () => w.clock.ms });
  const res = await Promise.allSettled([1, 2, 3, 4, 5].map(() => r.authenticate(k.keys.srv, "srv")));
  assert.ok(res.every((x) => x.status === "rejected" && x.reason instanceof PartnerRegistryUnavailableError));
  assert.equal(calls, 1);
  await assert.rejects(() => r.authenticate(k.keys.srv, "srv"), PartnerRegistryUnavailableError);
  assert.equal(calls, 2);
  assert.ok(await r.authenticate(k.keys.srv, "srv"));
  assert.equal(calls, 3);
  await tick(); await tick();
  assert.deepEqual(unhandled, []);
});

test("H10: registry K2 window: cached at +59 s, revoked at +61 s; failed reload after expiry fails closed then recovers; rotate-out visible after the window", async () => {
  const w = world();
  const k = await addPartner(w.store, { name: "Path", id: "path-co", origins: ["https://p.example"] }, w.ctx);
  const r = w.fresh();
  assert.ok(await r.authenticate(k.keys.srv, "srv"));
  await revokePartner(w.store, "path-co");
  w.clock.ms += 59_000;
  assert.ok(await r.authenticate(k.keys.srv, "srv"), "cached at 59 s");
  w.clock.ms += 2_000;
  assert.equal(await r.authenticate(k.keys.srv, "srv"), undefined, "revoked at +61 s");

  const w2 = world();
  const k2 = await addPartner(w2.store, { name: "Path", id: "path-co" }, w2.ctx);
  let down = false;
  const st: PartnerStore = { ...w2.store, list: (() => { if (down) throw new Error("down"); return w2.store.list(); }) as PartnerStore["list"] };
  const r2 = createPartnerRegistry({ store: st, pepper: PEPPER, nowMs: () => w2.clock.ms });
  assert.ok(await r2.authenticate(k2.keys.srv, "srv"));
  down = true; w2.clock.ms += 61_000;
  await assert.rejects(() => r2.authenticate(k2.keys.srv, "srv"), PartnerRegistryUnavailableError);
  down = false;
  assert.ok(await r2.authenticate(k2.keys.srv, "srv"), "recovers");
  const rot = await rotatePartner(w2.store, "path-co", "srv", w2.ctx);
  w2.clock.ms += 61_000;
  assert.equal(await r2.authenticate(k2.keys.srv, "srv"), undefined);
  assert.ok(await r2.authenticate(rot.key, "srv"));
});
