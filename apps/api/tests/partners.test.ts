/**
 * pc-partner-keys (D-111; spec K1-K5): per-partner API keys. Outcome tests over the real registry, the real anonymous and chat handlers, the in-memory
 * fake Db (B8) and generated keys only (B13). Each test name states the real scenario that reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFakeDb, createFakeMongoClient } from "@vc/db/testing";
import {
  KNOWN_TENANT_IDS,
  PARTNER_ID_PATTERN,
  PARTNER_KEY_REQUIRED_ENV,
  PARTNER_OWN_TENANTS_ENV,
  PARTNER_PEPPER_ENV,
  PARTNER_USAGE,
  PartnerConfigError,
  PartnerError,
  PartnerRegistryUnavailableError,
  RESERVED_TENANT_IDS_ENV,
  addPartner,
  createMongoPartnerStore,
  createPartnerRegistry,
  hashPartnerKey,
  isReservedPartnerId,
  listPartners,
  parsePartnerKey,
  partnerCliFailureLine,
  partnerOwnTenantsFromEnv,
  partnerKeyRequiredFromEnv,
  partnerPepperFromEnv,
  reservedTenantIdsFromEnv,
  reservedTenantIdsWarning,
  revokePartner,
  rotatePartner,
  runPartnerCli,
  withPartnerRoutes,
  type PartnerStore,
} from "../src/partners.js";
import { PARTNER_OPENAPI, STUDENT_API_DRAFT } from "../src/openapi.js";
import { ANONYMOUS_PATH } from "../src/anonymous.js";
import { launch } from "../src/main.js";
import type { ApiHandler, ApiRequest, ApiResponse } from "../src/server.js";
import { respond } from "../src/server.js";
import { SKILLS_DIR, anonRequest, anonWorld, ask, cleanupGates, gatesFixture, kbAnswerProvider, nonEmptyCollections } from "./anonymous-fixtures.js";
import { CRISIS_TEXT, GERMANY_QUESTION, call, chatRequest, chatWorld, studentToken, adult, newThread, threadsPath, turnsPath } from "./chat-fixtures.js";

const PEPPER = "synthetic-pepper-".padEnd(40, "x");
const T0 = Date.parse("2026-11-01T10:00:00.000Z");

interface PartnerWorld {
  store: PartnerStore;
  clock: { ms: number };
  registry: ReturnType<typeof createPartnerRegistry>;
  fakeDb: ReturnType<typeof createFakeDb>["fakeDb"];
  /** Registers a partner and returns its two keys: `pub` (page key, public chat route only) and `srv` (server key, student routes only). */
  add(name: string, origins?: string[], id?: string): Promise<{ id: string; pub: string; srv: string }>;
}
function partnerWorld(): PartnerWorld {
  const { db, fakeDb } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const clock = { ms: T0 };
  const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => clock.ms });
  return {
    store,
    clock,
    registry,
    fakeDb,
    async add(name, origins = [], id) {
      const r = await addPartner(store, { name, origins, ...(id ? { id } : {}) }, { pepper: PEPPER, now: () => new Date(clock.ms) });
      return { id: r.partner.partnerId, pub: r.keys.pub, srv: r.keys.srv };
    },
  };
}

const UNAUTHORIZED_BODY = (res: ApiResponse) => `${res.status} ${JSON.stringify(Object.entries(res.headers).sort())} ${res.body}`;
const PUB_KEY_RE = /vck_pub_[a-z0-9-]+_[A-Za-z0-9_-]{43}/;
const SRV_KEY_RE = /vck_srv_[a-z0-9-]+_[A-Za-z0-9_-]{43}/;
const ANY_KEY_RE = /vck_(pub|srv)_[a-z0-9-]+_[A-Za-z0-9_-]{43}/;

// ---------------------------------------------------------------------------
// K1. The registry and the CLI
// ---------------------------------------------------------------------------

test("K1: ops adds Pathlynks: two keys come back once (vck_pub_ and vck_srv_ form), and only their HMACs and short prefixes are stored", async () => {
  const w = partnerWorld();
  const { id, pub, srv } = await w.add("Pathlynks", ["https://pathlynks.example"]);
  assert.equal(id, "pathlynks");
  assert.match(pub, /^vck_pub_pathlynks_[A-Za-z0-9_-]{43}$/);
  assert.match(srv, /^vck_srv_pathlynks_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(pub.slice(-43), srv.slice(-43), "two independent secrets");
  const stored = (await w.store.get("pathlynks"))!;
  assert.equal(stored.keys.pub.hash, createHmac("sha256", PEPPER).update(pub).digest("hex"), "HMAC-SHA256(key, pepper)");
  assert.equal(stored.keys.srv.hash, hashPartnerKey(srv, PEPPER));
  assert.notEqual(stored.keys.pub.hash, stored.keys.srv.hash);
  assert.deepEqual(Object.keys(stored).sort(), ["_id", "allowedOrigins", "createdAt", "keys", "name", "partnerId", "status"]);
  assert.deepEqual(Object.keys(stored.keys).sort(), ["pub", "srv"]);
  assert.equal(stored.status, "active");
  assert.equal(stored.keys.pub.rotatedAt, null);
  assert.equal(stored.keys.srv.rotatedAt, null);
  assert.deepEqual(stored.allowedOrigins, ["https://pathlynks.example"]);
  assert.ok(pub.startsWith(stored.keys.pub.prefix) && stored.keys.pub.prefix.length < pub.length - 30, "a prefix only");
  assert.ok(srv.startsWith(stored.keys.srv.prefix) && stored.keys.srv.prefix.length < srv.length - 30, "a prefix only");
  const everything = JSON.stringify(w.fakeDb.collection<{ _id: string }>("partners").all());
  for (const key of [pub, srv]) assert.ok(!everything.includes(key) && !everything.includes(key.slice(-30)), "the raw key (or its tail) is nowhere in the database");
});

test("K1: two partners get different keys, and a key is never accepted for a different partner id even with a copied secret", async () => {
  const w = partnerWorld();
  const a = await w.add("Site A", [], "site-a");
  const b = await w.add("Site B", [], "site-b");
  assert.notEqual(a.pub.slice(-43), b.pub.slice(-43));
  const swapped = `vck_pub_site-b_${a.pub.split("_").slice(3).join("_")}`;
  assert.equal(await w.registry.authenticate(swapped, "pub"), undefined);
  assert.equal((await w.registry.authenticate(a.pub, "pub"))?.partnerId, "site-a");
  assert.equal((await w.registry.authenticate(a.srv, "srv"))?.partnerId, "site-a");
});

test("K1: partner ids follow ^[a-z0-9-]{2,32}$ so a key splits on its first three underscores (clarified default 2)", async () => {
  assert.equal(PARTNER_ID_PATTERN.source, "^[a-z0-9-]{2,32}$");
  const w = partnerWorld();
  for (const bad of ["a", "Site", "site_a", "a".repeat(33), "-", "site a", "site.a", ""]) {
    await assert.rejects(() => w.add("X", [], bad), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id", `id ${JSON.stringify(bad)}`);
  }
  const ok = await w.add("Edge", [], "ab");
  assert.deepEqual(parsePartnerKey(ok.pub), { scope: "pub", partnerId: "ab", secret: ok.pub.slice(-43) });
  assert.equal(parsePartnerKey(ok.srv)?.scope, "srv");
  // a secret that itself contains underscores and hyphens still splits correctly
  const tricky = `vck_srv_ab_${"_".repeat(10)}${"-".repeat(10)}${"A".repeat(23)}`;
  assert.equal(parsePartnerKey(tricky)?.partnerId, "ab");
  const A43 = "A".repeat(43);
  for (const malformed of ["", "vck_", "vck_pub_ab_short", `vck_ab_${A43}`, `vck_any_ab_${A43}`, `vck_PUB_ab_${A43}`, `vck_pub_a_${A43}`, `vck_pub_AB_${A43}`, `vck_pub_ab_${"A".repeat(44)}`, `xyz_pub_ab_${A43}`, `vck_pub_ab_${"A".repeat(42)}!`, `vck_pub_a_b_${A43}`]) {
    assert.equal(parsePartnerKey(malformed), undefined, JSON.stringify(malformed));
  }
});

test("K1: a name with no usable letters, a duplicate id and an unsafe origin are all refused before anything is written", async () => {
  const w = partnerWorld();
  await assert.rejects(() => addPartner(w.store, { name: "!!!", origins: [] }, { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  await w.add("Site A", [], "site-a");
  await assert.rejects(() => w.add("Site A again", [], "site-a"), (e: unknown) => e instanceof PartnerError && e.code === "partner_exists");
  for (const origin of ["*", "null", "https://*.example", "https://site.example/path", "https://site.example?x=1", "http://site.example", "ftp://site.example", "site.example", "https://user@site.example", ""]) {
    await assert.rejects(() => w.add("Bad", [origin], "bad-origin"), (e: unknown) => e instanceof PartnerError && e.code === "invalid_origin", `origin ${JSON.stringify(origin)}`);
  }
  assert.equal(await w.store.get("bad-origin"), null, "nothing written for a refused origin");
  const ok = await addPartner(w.store, { name: "Dev", origins: ["https://Site.Example/", "http://localhost:5173", "http://127.0.0.1:8080", "https://site.example"], id: "dev" }, { pepper: PEPPER });
  assert.deepEqual(ok.partner.allowedOrigins, ["https://site.example", "http://localhost:5173", "http://127.0.0.1:8080"], "normalised, de-duplicated");
});

test("K1: rotating the page key leaves the server key working (and the other way round); the old key stops working within the 60 s cache bound", async () => {
  const w = partnerWorld();
  const { pub: oldPub, srv: oldSrv } = await w.add("Pathlynks");
  assert.ok(await w.registry.authenticate(oldPub, "pub"), "old keys work and are now cached");
  w.clock.ms += 5_000;
  const ctx = { pepper: PEPPER, now: () => new Date(w.clock.ms) };
  const rotated = await rotatePartner(w.store, "pathlynks", "pub", ctx);
  assert.equal(rotated.scope, "pub");
  assert.notEqual(rotated.key, oldPub);
  assert.match(rotated.key, /^vck_pub_pathlynks_[A-Za-z0-9_-]{43}$/);
  assert.equal(rotated.partner.keys.pub.rotatedAt, new Date(w.clock.ms).toISOString());
  assert.equal(rotated.partner.keys.srv.rotatedAt, null, "the other scope was not touched");
  const fresh = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.equal(await fresh.authenticate(oldPub, "pub"), undefined, "a freshly started server rejects the old page key at once");
  assert.equal((await fresh.authenticate(rotated.key, "pub"))?.partnerId, "pathlynks");
  assert.equal((await fresh.authenticate(oldSrv, "srv"))?.partnerId, "pathlynks", "rotate one scope leaves the other working");
  w.clock.ms += 60_001;
  assert.equal(await w.registry.authenticate(oldPub, "pub"), undefined, "the running server rejects it within 60 s (clarified default 1)");
  assert.equal((await w.registry.authenticate(rotated.key, "pub"))?.partnerId, "pathlynks");
  assert.equal((await w.registry.authenticate(oldSrv, "srv"))?.partnerId, "pathlynks", "still the original server key");
  const rotatedSrv = await rotatePartner(w.store, "pathlynks", "srv", ctx);
  assert.match(rotatedSrv.key, /^vck_srv_pathlynks_/);
  w.clock.ms += 60_001;
  assert.equal(await w.registry.authenticate(oldSrv, "srv"), undefined);
  assert.equal((await w.registry.authenticate(rotatedSrv.key, "srv"))?.partnerId, "pathlynks");
  assert.equal((await w.registry.authenticate(rotated.key, "pub"))?.partnerId, "pathlynks", "rotating the server key left the new page key working");
  await assert.rejects(() => rotatePartner(w.store, "no-such", "pub", { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  await assert.rejects(() => rotatePartner(w.store, "pathlynks", "both" as never, { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "usage");
});

test("K1: a revoked partner's keys (both) are refused within 60 s on a running server, rotating does not bring them back, and re-adding the id is refused", async () => {
  const w = partnerWorld();
  const { pub, srv } = await w.add("Old Partner", [], "old-partner");
  assert.ok(await w.registry.authenticate(pub, "pub"));
  const revoked = await revokePartner(w.store, "old-partner");
  assert.equal(revoked.status, "revoked");
  w.clock.ms += 59_000;
  assert.equal((await w.registry.authenticate(pub, "pub"))?.partnerId, "old-partner", "inside the cache window the running server may still accept (bounded, not instant)");
  w.clock.ms += 2_000;
  assert.equal(await w.registry.authenticate(pub, "pub"), undefined, "at 61 s the revoke is in force for the page key");
  assert.equal(await w.registry.authenticate(srv, "srv"), undefined, "and for the server key");
  for (const scope of ["pub", "srv"] as const) {
    await assert.rejects(() => rotatePartner(w.store, "old-partner", scope, { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "partner_revoked");
  }
  await assert.rejects(() => w.add("Old Partner", [], "old-partner"), (e: unknown) => e instanceof PartnerError && e.code === "partner_exists");
  assert.equal((await revokePartner(w.store, "old-partner")).status, "revoked", "revoking twice is harmless");
});

test("K1: list shows ids, names, status and the key prefixes but never a hash or a key", async () => {
  const w = partnerWorld();
  const a = await w.add("Alpha", ["https://a.example"], "alpha");
  await w.add("Beta", [], "beta");
  await revokePartner(w.store, "beta");
  const rows = await listPartners(w.store);
  assert.deepEqual(rows.map((r) => [r.partnerId, r.status]), [["alpha", "active"], ["beta", "revoked"]]);
  const text = JSON.stringify(rows);
  for (const key of [a.pub, a.srv]) assert.ok(!text.includes(key) && !text.includes(key.slice(-30)));
  assert.ok(!text.includes("hash") && !text.includes("keyHash"));
  assert.ok(rows[0]!.keys.pub.prefix.startsWith("vck_pub_alpha_"));
  assert.ok(rows[0]!.keys.srv.prefix.startsWith("vck_srv_alpha_"));
});

test("K1: the CLI prints both raw keys on add and one on rotate --scope; list and revoke print none", async () => {
  const w = partnerWorld();
  const deps = { store: w.store, pepper: PEPPER, now: () => new Date(w.clock.ms) };
  const added = (await runPartnerCli(["add", "Vidysea Website", "--origin", "https://vidysea.example", "--origin", "http://localhost:3000"], deps)).join("\n");
  const pub1 = /vck_pub_vidysea-website_[A-Za-z0-9_-]{43}/.exec(added)?.[0];
  const srv1 = /vck_srv_vidysea-website_[A-Za-z0-9_-]{43}/.exec(added)?.[0];
  assert.ok(pub1 && srv1, "add prints both keys");
  assert.match(added, /once/i);
  assert.match(added, /page|public/i, "the output says which key goes in a web page");
  assert.match(added, /server/i, "and which stays on the server");
  const stored = await w.store.get("vidysea-website");
  assert.deepEqual(stored?.allowedOrigins, ["https://vidysea.example", "http://localhost:3000"]);
  const listed = (await runPartnerCli(["list"], deps)).join("\n");
  assert.ok(!listed.includes(pub1) && !listed.includes(srv1) && !ANY_KEY_RE.test(listed), "list prints no key");
  assert.match(listed, /vidysea-website/);
  const rotated = (await runPartnerCli(["rotate", "vidysea-website", "--scope", "pub"], deps)).join("\n");
  const pub2 = PUB_KEY_RE.exec(rotated)?.[0];
  assert.ok(pub2 && pub2 !== pub1, "a new page key");
  assert.ok(!SRV_KEY_RE.test(rotated), "the server key is not printed or touched");
  assert.equal((await w.registry.authenticate(srv1, "srv"))?.partnerId, "vidysea-website");
  const rotatedSrv = (await runPartnerCli(["rotate", "vidysea-website", "--scope", "srv"], deps)).join("\n");
  const srv2 = SRV_KEY_RE.exec(rotatedSrv)?.[0];
  assert.ok(srv2 && srv2 !== srv1 && !PUB_KEY_RE.test(rotatedSrv));
  const revoked = (await runPartnerCli(["revoke", "vidysea-website"], deps)).join("\n");
  assert.ok(!ANY_KEY_RE.test(revoked), "revoke prints no key");
  for (const bad of [[], ["frobnicate"], ["add"], ["rotate"], ["rotate", "vidysea-website"], ["rotate", "vidysea-website", "--scope"], ["rotate", "vidysea-website", "--scope", "both"], ["rotate", "vidysea-website", "--scope", "pub", "extra"], ["revoke"], ["add", "X", "--origin"], ["add", "X", "--nope", "1"]]) {
    await assert.rejects(() => runPartnerCli(bad, deps), (e: unknown) => e instanceof PartnerError && e.code === "usage", JSON.stringify(bad));
  }
});

test("K1: the pepper and the required flag are read strictly: a short pepper is a config error, a mistyped flag is never silently on or off", () => {
  assert.equal(partnerPepperFromEnv({}), undefined);
  assert.equal(partnerPepperFromEnv({ [PARTNER_PEPPER_ENV]: "  " }), undefined);
  assert.equal(partnerPepperFromEnv({ [PARTNER_PEPPER_ENV]: PEPPER }), PEPPER);
  assert.throws(() => partnerPepperFromEnv({ [PARTNER_PEPPER_ENV]: "short" }), (e: unknown) => e instanceof PartnerConfigError && e.message.includes(PARTNER_PEPPER_ENV) && !e.message.includes("short\""));
  assert.equal(partnerKeyRequiredFromEnv({}), false);
  assert.equal(partnerKeyRequiredFromEnv({ [PARTNER_KEY_REQUIRED_ENV]: "false" }), false);
  assert.equal(partnerKeyRequiredFromEnv({ [PARTNER_KEY_REQUIRED_ENV]: "true" }), true);
  assert.throws(() => partnerKeyRequiredFromEnv({ [PARTNER_KEY_REQUIRED_ENV]: "yes" }), PartnerConfigError);
});

// ---------------------------------------------------------------------------
// Key scopes (D-111 c0b): a page key opens only the public chat route, a server key only the student routes
// ---------------------------------------------------------------------------

test("scope: a page key copied from the Vidysea website cannot read a Pathlynks student (pub key on the student routes is the uniform 401, nothing read or written)", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", ["https://pathlynks.example"], "pathlynks");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    const created = await call(w, "POST", threadsPath("stu-1"), { token: pl.srv, headers: studentHeaders("stu-1") });
    assert.equal(created.status, 201, "the server key works there");
    const bad = await call(w, "POST", threadsPath("stu-1"), { token: "not.a.jwt" });
    const seen = new Set<string>([UNAUTHORIZED_BODY(bad)]);
    const calls = w.provider.calls.length;
    for (const [method, path] of [["POST", threadsPath("stu-1")], ["GET", `${threadsPath("stu-1")}/${created.json.threadId}`], ["POST", turnsPath("stu-1", created.json.threadId)], ["GET", "/v1/students/stu-1/chat/profile"]] as const) {
      const res = await call(w, method, path, { token: pl.pub, headers: studentHeaders("stu-1"), ...(method === "POST" ? { body: { text: GERMANY_QUESTION, clientTurnId: "scope-1" } } : {}) });
      assert.equal(res.status, 401, `${method} ${path}`);
      seen.add(UNAUTHORIZED_BODY(res));
    }
    assert.equal(seen.size, 1, "indistinguishable from a bad token");
    assert.equal(w.provider.calls.length, calls, "no model call for a page key");
    assert.equal(w.fakeDb.collection<{ _id: string }>("chat_turns").size(), 0, "nothing written");
  } finally {
    w.cleanup();
  }
});

test("scope: a server key pasted into a web page is refused on the public route, with the same 401 as any bad key, and gets no CORS", async () => {
  const p = partnerWorld();
  const site = await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    const refusedBodies = new Set<string>();
    for (const headers of [{ "x-vc-key": site.srv }, { "x-vc-key": site.srv, origin: "https://vidysea.example" }, { "x-vc-key": `vck_pub_vidysea-web_${"A".repeat(43)}` }]) {
      const res = await ask(w, GERMANY_QUESTION, { headers });
      assert.equal(res.status, 401, JSON.stringify(Object.keys(headers)));
      refusedBodies.add(UNAUTHORIZED_BODY(res));
    }
    assert.equal(refusedBodies.size, 1, "a wrong-scope key looks exactly like an unknown key");
    assert.equal(w.kb.calls.length, 0);
    assert.equal(w.counterCalls.length, 0);
    // and the wrapper never grants CORS to a server key, even from the partner's own site
    const inner = innerSpy();
    const h = withPartnerRoutes(inner.handler, p.registry);
    const res = await h(corsReq("POST", ANONYMOUS_PATH, { origin: "https://vidysea.example", "x-vc-key": site.srv }));
    assert.equal(res.headers["access-control-allow-origin"], undefined);
    const viaBearer = await h(corsReq("POST", ANONYMOUS_PATH, { origin: "https://vidysea.example", authorization: `Bearer ${site.srv}` }));
    assert.equal(viaBearer.headers["access-control-allow-origin"], undefined);
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": site.pub } })).status, 200, "the page key works");
  } finally {
    w.cleanup();
  }
});

test("scope: a page key sent with an Origin the partner did not list is refused, one sent with no Origin (a script) or the listed Origin is answered", async () => {
  const p = partnerWorld();
  const site = await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    for (const origin of ["https://evil.example", "https://vidysea.example.evil.com", "http://vidysea.example", "null", "", "https://VIDYSEA.example"]) {
      const res = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": site.pub, origin } });
      assert.equal(res.status, 401, JSON.stringify(origin));
    }
    const repeated = await w.handler({ ...anonRequest({ text: GERMANY_QUESTION }), headers: { "x-vc-key": site.pub, origin: ["https://vidysea.example", "https://vidysea.example"] } });
    assert.equal(repeated.status, 401, "a repeated Origin header");
    assert.equal(w.kb.calls.length, 0);
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": site.pub, origin: "https://vidysea.example" } })).status, 200);
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": site.pub } })).status, 200, "no Origin header: not a browser");
  } finally {
    w.cleanup();
  }
});

test("scope: the two keys of one partner are independent: revoking the partner ends both, and neither key opens the other's routes before or after", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  assert.equal((await p.registry.authenticate(pl.pub, "srv")), undefined);
  assert.equal((await p.registry.authenticate(pl.srv, "pub")), undefined);
  assert.equal((await p.registry.authenticate(pl.pub, "pub"))?.partnerId, "pathlynks");
  assert.equal((await p.registry.authenticate(pl.srv, "srv"))?.partnerId, "pathlynks");
  assert.equal(await p.registry.authenticate("vck_pathlynks_" + "A".repeat(43), "srv"), undefined, "the old unscoped key format is refused");
});

// ---------------------------------------------------------------------------
// K2. The anonymous route
// ---------------------------------------------------------------------------

test("K2: the Vidysea website widget sends its active key and is answered; the partner id reaches the usage count and the log, and no turn text is stored", async () => {
  const p = partnerWorld();
  const site = await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    const res = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": site.pub } });
    assert.equal(res.status, 200);
    assert.equal(res.json.state, "ok");
    assert.deepEqual(p.registry.usage().get("vidysea-web")?.turns, 1);
    const line = w.logs.find((l) => (l as { event?: string }).event === "anonymous_partner_turn") as { partnerId: string; state: string } | undefined;
    assert.equal(line?.partnerId, "vidysea-web");
    assert.ok(!JSON.stringify(w.logs).includes("Germany"), "the log carries no text");
    assert.ok(!JSON.stringify(w.logs).includes(site.pub.slice(-30)), "nor the key");
    assert.deepEqual(Object.keys(nonEmptyCollections(w.fakeDb)), ["anonymous_counters"], "anonymous zero persistence: only the text-free counter");
    for (const doc of w.fakeDb.collection<{ _id: string }>("anonymous_counters").all()) assert.deepEqual(Object.keys(doc).sort(), ["_id", "count", "date", "kind"]);
  } finally {
    w.cleanup();
  }
});

test("K2: a malformed, unknown, revoked or repeated key all get the same 401, and the route is not reached", async () => {
  const p = partnerWorld();
  const live = await p.add("Live", [], "live");
  const gone = await p.add("Gone", [], "gone");
  await revokePartner(p.store, "gone");
  p.clock.ms += 61_000; // the revoke is in force
  const unknown = `vck_pub_nobody_${"A".repeat(43)}`;
  const wrongSecret = `vck_pub_live_${"B".repeat(43)}`;
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    const bodies = new Set<string>();
    const rawBodies = new Set<string>();
    for (const header of [gone.pub, unknown, wrongSecret, "garbage", "", "   ", `${live.pub}x`, "Bearer " + live.pub]) {
      const res = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": header } });
      assert.equal(res.status, 401, JSON.stringify(header));
      bodies.add(UNAUTHORIZED_BODY(res));
      rawBodies.add(res.body);
    }
    const repeated = await w.handler({ ...anonRequest({ text: GERMANY_QUESTION }), headers: { "x-vc-key": [live.pub, live.pub] } });
    assert.equal(repeated.status, 401);
    bodies.add(UNAUTHORIZED_BODY(repeated));
    rawBodies.add(repeated.body);
    assert.equal(bodies.size, 1, "one uniform 401 for every kind of bad key");
    assert.equal(JSON.parse([...rawBodies][0]!).error, "unauthorized");
    assert.equal(w.kb.calls.length, 0, "no knowledge-base call for a refused key");
    assert.equal(w.provider.calls.length, 0);
    assert.equal(w.counterCalls.length, 0, "not even the counter");
  } finally {
    w.cleanup();
  }
});

test("K2: a refused key still carries the static helpline in the 401 body, like every other refusal on this route", async () => {
  const p = partnerWorld();
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    const res = await ask(w, CRISIS_TEXT, { headers: { "x-vc-key": `vck_pub_nobody_${"A".repeat(43)}` } });
    assert.equal(res.status, 401);
    assert.match(res.json.helpline, /14416/);
  } finally {
    w.cleanup();
  }
});

test("K2: a visitor whose site sends no key is unchanged unless VC_PARTNER_KEY_REQUIRED is on, and then gets 401", async () => {
  const p = partnerWorld();
  const open = anonWorld({ deps: { partners: p.registry } });
  const strict = anonWorld({ deps: { partners: p.registry, partnerKeyRequired: true } });
  const none = anonWorld();
  try {
    assert.equal((await ask(open, GERMANY_QUESTION)).status, 200);
    assert.equal((await ask(none, GERMANY_QUESTION)).status, 200, "no registry at all: exactly today's behaviour");
    const refused = await ask(strict, GERMANY_QUESTION);
    assert.equal(refused.status, 401);
    assert.equal(strict.kb.calls.length, 0);
    assert.equal(p.registry.usage().size, 0, "an unkeyed turn counts for no partner");
    assert.ok(!open.logs.some((l) => (l as { event?: string }).event === "anonymous_partner_turn"));
  } finally {
    open.cleanup();
    strict.cleanup();
    none.cleanup();
  }
});

test("K2: a key sent to a server that has no partner registry configured is refused (fail closed), not silently ignored", async () => {
  const w = anonWorld();
  try {
    const res = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": `vck_pub_live_${"A".repeat(43)}` } });
    assert.equal(res.status, 401);
    assert.equal(w.kb.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("K2: the limit is per partner and client: one partner exhausting its 10 a minute from one address does not limit another partner or another address", async () => {
  const p = partnerWorld();
  const a = await p.add("A", [], "partner-a");
  const b = await p.add("B", [], "partner-b");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub }, ip: "203.0.113.7" })).status, 200, `turn ${i}`);
    const limited = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub }, ip: "203.0.113.7" });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": b.pub }, ip: "203.0.113.7" })).status, 200, "partner B, same address");
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub }, ip: "203.0.113.8" })).status, 200, "partner A, another address");
    assert.equal((await ask(w, GERMANY_QUESTION, { ip: "203.0.113.7" })).status, 200, "an unkeyed visitor from that address has the old, separate bucket");
  } finally {
    w.cleanup();
  }
});

test("K2: a crisis message from a keyed visitor is answered with the fixed message and is never rate limited", async () => {
  const p = partnerWorld();
  const a = await p.add("A", [], "partner-a");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    for (let i = 0; i < 10; i++) await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } });
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } })).status, 429);
    const crisis = await ask(w, CRISIS_TEXT, { headers: { "x-vc-key": a.pub } });
    assert.equal(crisis.status, 200);
    assert.equal(crisis.json.state, "escalated");
    assert.match(crisis.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

test("K2: a partner revoked while a widget page is open is refused within 60 s of the revoke", async () => {
  const p = partnerWorld();
  const a = await p.add("A", [], "partner-a");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } })).status, 200);
    await revokePartner(p.store, "partner-a");
    p.clock.ms += 61_000;
    assert.equal((await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": a.pub } })).status, 401);
  } finally {
    w.cleanup();
  }
});

test("K2: when the partner store is down, a keyed turn fails closed with a 503 that carries the helpline and no cause, never an answer", async () => {
  const down: PartnerStore = {
    get: async () => { throw new Error("mongodb://user:secret@host exploded"); },
    list: async () => { throw new Error("mongodb://user:secret@host exploded"); },
    insert: async () => { throw new Error("x"); },
    update: async () => { throw new Error("x"); },
  };
  const registry = createPartnerRegistry({ store: down, pepper: PEPPER, nowMs: () => T0 });
  await assert.rejects(() => registry.authenticate(`vck_pub_live_${"A".repeat(43)}`), PartnerRegistryUnavailableError);
  const w = anonWorld({ deps: { partners: registry } });
  try {
    const res = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": `vck_pub_live_${"A".repeat(43)}` } });
    assert.equal(res.status, 503);
    assert.ok(!res.body.includes("secret") && !res.body.includes("mongodb"));
    assert.match(res.json.helpline, /14416/);
    assert.equal(w.kb.calls.length, 0);
  } finally {
    w.cleanup();
  }
});

test("K2: the registry looks a key up through one cached list (at most one store read per 60 s), however many keys are presented", async () => {
  const p = partnerWorld();
  const a = await p.add("A", [], "partner-a");
  let reads = 0;
  const counting: PartnerStore = { ...p.store, list: async () => { reads++; return p.store.list(); }, get: async (id) => { reads++; return p.store.get(id); } };
  const registry = createPartnerRegistry({ store: counting, pepper: PEPPER, nowMs: () => p.clock.ms });
  for (let i = 0; i < 20; i++) await registry.authenticate(i % 2 ? a.pub : `vck_pub_rand${i}_${"A".repeat(43)}`);
  assert.equal(reads, 1, "one read serves a flood of random ids");
  p.clock.ms += 60_001;
  await registry.authenticate(a.pub);
  assert.equal(reads, 2);
});

// ---------------------------------------------------------------------------
// K3. Server-to-server student chat
// ---------------------------------------------------------------------------

const studentHeaders = (id: string, extra: Record<string, string> = {}) => ({ "x-vc-student-id": id, "x-vc-student-age": "25", ...extra });
const bearer = (key: string) => key;

test("K3: Pathlynks' backend starts a thread and asks a question for its adult student with its key and the student headers; the tenant is the partner id", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    const created = await call(w, "POST", threadsPath("stu-1"), { token: bearer(pl.srv), headers: studentHeaders("stu-1") });
    assert.equal(created.status, 201);
    const turn = await call(w, "POST", turnsPath("stu-1", created.json.threadId), { token: pl.srv, headers: studentHeaders("stu-1"), body: { text: GERMANY_QUESTION, clientTurnId: "k3-1" } });
    assert.equal(turn.status, 200);
    assert.equal(turn.json.state, "ok");
    assert.ok(turn.json.claims.length >= 1);
    const threads = w.fakeDb.collection<{ _id: string; tenantId?: string }>("chat_threads").all();
    assert.equal(threads.length, 1);
    assert.equal(threads[0]!.tenantId, "pathlynks", "the tenant is the partner's id");
  } finally {
    w.cleanup();
  }
});

test("K3: Pathlynks' backend sends a key for another partner's student: the thread, the history and the profile answer 404, and nothing of the other partner is written or read", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const other = await p.add("Other School", [], "other-school");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    const thread = await call(w, "POST", threadsPath("stu-1"), { token: pl.srv, headers: studentHeaders("stu-1") });
    const turn = await call(w, "POST", turnsPath("stu-1", thread.json.threadId), { token: pl.srv, headers: studentHeaders("stu-1"), body: { text: GERMANY_QUESTION, clientTurnId: "k3-2" } });
    assert.equal(turn.status, 200);
    const calls = w.provider.calls.length;
    // The other partner names the SAME student id and thread id.
    const history = await call(w, "GET", `${threadsPath("stu-1")}/${thread.json.threadId}`, { token: other.srv, headers: studentHeaders("stu-1") });
    assert.equal(history.status, 404);
    const replay = await call(w, "POST", turnsPath("stu-1", thread.json.threadId), { token: other.srv, headers: studentHeaders("stu-1"), body: { text: GERMANY_QUESTION, clientTurnId: "k3-2" } });
    assert.equal(replay.status, 404, "cannot write into another partner's thread");
    const profile = await call(w, "GET", `/v1/students/stu-1/chat/profile`, { token: other.srv, headers: studentHeaders("stu-1") });
    assert.equal(profile.status, 200, "its own (empty) profile view, not the other partner's");
    assert.equal(w.provider.calls.length, calls, "no model call for the foreign thread");
    const turns = w.fakeDb.collection<{ _id: string; tenantId?: string }>("chat_turns").all();
    assert.ok(turns.every((t) => t.tenantId === "pathlynks"), "every stored turn is the owning partner's");
    // And the path student must be the header student.
    const mismatch = await call(w, "GET", `${threadsPath("stu-2")}/${thread.json.threadId}`, { token: pl.srv, headers: studentHeaders("stu-1") });
    assert.equal(mismatch.status, 404);
  } finally {
    w.cleanup();
  }
});

test("K3: a backend that forgets the student headers, or sends an unsafe student id, is told 400 and nothing is read or written", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    for (const headers of [{}, { "x-vc-student-id": "" }, { "x-vc-student-id": "../etc" }, { "x-vc-student-id": "a b" }, { "x-vc-student-id": "x".repeat(200) }]) {
      const res = await call(w, "POST", threadsPath("stu-1"), { token: pl.srv, headers });
      assert.equal(res.status, 400, JSON.stringify(headers));
    }
    const repeated = await w.handler({ ...chatRequest("POST", threadsPath("stu-1"), { token: pl.srv }), headers: { authorization: `Bearer ${pl.srv}`, "x-vc-student-id": ["stu-1", "stu-2"] } });
    assert.equal(repeated.status, 400);
    assert.equal(w.fakeDb.collection<{ _id: string }>("chat_threads").size(), 0);
  } finally {
    w.cleanup();
  }
});

test("K3: a missing, blank, non-numeric or out-of-range age is a minor with no model call; an adult age is answered; consent counts only when exactly true", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    let n = 0;
    const turn = async (headers: Record<string, string>) => {
      const id = `stu-${++n}`;
      const th = await call(w, "POST", threadsPath(id), { token: pl.srv, headers: { "x-vc-student-id": id, ...headers } });
      assert.equal(th.status, 201);
      return call(w, "POST", turnsPath(id, th.json.threadId), { token: pl.srv, headers: { "x-vc-student-id": id, ...headers }, body: { text: GERMANY_QUESTION, clientTurnId: `c-${id}` } });
    };
    for (const headers of [{}, { "x-vc-student-age": "" }, { "x-vc-student-age": "abc" }, { "x-vc-student-age": "17" }, { "x-vc-student-age": "-5" }, { "x-vc-student-age": "18.5" }, { "x-vc-student-age": "1e3" }, { "x-vc-student-age": "0x20" }, { "x-vc-student-age": "999" }, { "x-vc-student-age": "17", "x-vc-guardian-consent": "yes" }, { "x-vc-student-age": "17", "x-vc-guardian-consent": "TRUE" }]) {
      const before = w.provider.calls.length;
      const res = await turn(headers);
      assert.equal(res.status, 200, JSON.stringify(headers));
      assert.match(res.json.message, /guardian/i, JSON.stringify(headers));
      assert.equal(w.provider.calls.length, before, `no model call: ${JSON.stringify(headers)}`);
    }
    const adultRes = await turn({ "x-vc-student-age": "25" });
    assert.equal(adultRes.json.state, "ok");
    assert.ok(adultRes.json.claims.length >= 1);
    const consented = await turn({ "x-vc-student-age": "16", "x-vc-guardian-consent": "true" });
    assert.equal(consented.json.state, "ok", "a minor whose guardian consent is exactly true is answered");
  } finally {
    w.cleanup();
  }
});

test("K3: a keyed minor's crisis message still gets the fixed crisis message and helpline", async () => {
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const w = chatWorld({ deps: { partners: p.registry } });
  try {
    const h = { "x-vc-student-id": "stu-1" };
    const th = await call(w, "POST", threadsPath("stu-1"), { token: pl.srv, headers: h });
    const res = await call(w, "POST", turnsPath("stu-1", th.json.threadId), { token: pl.srv, headers: h, body: { text: CRISIS_TEXT, clientTurnId: "cr-1" } });
    assert.equal(res.status, 200);
    assert.match(res.json.message, /14416/);
  } finally {
    w.cleanup();
  }
});

test("K3: a revoked, unknown or malformed vck_ bearer gets the same 401 as a bad JWT, and never reaches the JWT verifier", async () => {
  const p = partnerWorld();
  const gone = await p.add("Gone", [], "gone");
  await revokePartner(p.store, "gone");
  p.clock.ms += 61_000;
  let verified = 0;
  const w = chatWorld({ deps: { partners: p.registry } });
  const realVerify = w.deps.verifier.verify.bind(w.deps.verifier);
  w.deps.verifier.verify = async (t: string) => { verified++; return realVerify(t); };
  try {
    const bad = await call(w, "POST", threadsPath("stu-1"), { token: "not.a.jwt" });
    assert.equal(bad.status, 401);
    verified = 0;
    const seen = new Set<string>([UNAUTHORIZED_BODY(bad)]);
    for (const token of [gone.srv, `vck_srv_nobody_${"A".repeat(43)}`, "vck_", `vck_${"A".repeat(60)}`]) {
      const res = await call(w, "POST", threadsPath("stu-1"), { token, headers: studentHeaders("stu-1") });
      assert.equal(res.status, 401, token);
      seen.add(UNAUTHORIZED_BODY(res));
    }
    assert.equal(seen.size, 1, "indistinguishable from a bad JWT");
    assert.equal(verified, 0, "a vck_ bearer is never handed to the JWT verifier");
  } finally {
    w.cleanup();
  }
});

test("K3: without a partner registry a vck_ bearer is a 401, and a real student JWT keeps working unchanged next to the partner path", async () => {
  const bare = chatWorld();
  const p = partnerWorld();
  const pl = await p.add("Pathlynks", [], "pathlynks");
  const both = chatWorld({ deps: { partners: p.registry } });
  try {
    assert.equal((await call(bare, "POST", threadsPath("stu-1"), { token: pl.srv, headers: studentHeaders("stu-1") })).status, 401);
    for (const w of [bare, both]) {
      const jwt = await studentToken(adult("stu-1"));
      const threadId = await newThread(w, jwt, "stu-1");
      const res = await call(w, "POST", turnsPath("stu-1", threadId), { token: jwt, body: { text: GERMANY_QUESTION, clientTurnId: "jwt-1" } });
      assert.equal(res.status, 200);
      assert.equal(res.json.state, "ok");
    }
    // a JWT is not charged to the partner registry
    assert.equal(p.registry.usage().size, 0);
    const jwtOnly = await studentToken(adult("stu-2"));
    assert.equal((await call(both, "POST", threadsPath("stu-1"), { token: jwtOnly })).status, 404, "JWT path still binds the path student to the token's");
  } finally {
    bare.cleanup();
    both.cleanup();
  }
});

test("K3: a key whose partner id is not a valid tenant cannot be minted, so no key can address a tenant that the JWT path could not", () => {
  assert.ok(PARTNER_ID_PATTERN.test("pathlynks"));
  assert.ok(!PARTNER_ID_PATTERN.test("a/../b"));
});

// ---------------------------------------------------------------------------
// K4. CORS (and the K5 openapi route, which rides the same wrapper)
// ---------------------------------------------------------------------------

function innerSpy() {
  const seen: ApiRequest[] = [];
  const handler: ApiHandler = async (req) => {
    seen.push(req);
    return respond(200, { ok: true });
  };
  return { seen, handler };
}
function corsReq(method: string, url: string, headers: Record<string, string | string[]>): ApiRequest {
  return { method, url, headers, remoteAddress: "203.0.113.9", readBody: async () => "" };
}
const cors = (res: ApiResponse) => Object.fromEntries(Object.entries(res.headers).filter(([k]) => k.toLowerCase().startsWith("access-control-") || k.toLowerCase() === "vary"));
const VOICE_SESSION = "/v1/students/stu-1/chat/threads/th-1/voice/sessions";
const ELIGIBLE = [ANONYMOUS_PATH, "/v1/partner/openapi.json"];

test("K4: a browser preflight from a partner's own site is answered 204 with exactly that origin, never *, on the public chat and openapi routes", async () => {
  const p = partnerWorld();
  await p.add("Vidysea Website", ["https://vidysea.example", "http://localhost:5173"], "vidysea-web");
  await p.add("Other", ["https://other.example"], "other");
  const inner = innerSpy();
  const h = withPartnerRoutes(inner.handler, p.registry);
  for (const path of ELIGIBLE) {
    for (const origin of ["https://vidysea.example", "http://localhost:5173", "https://other.example"]) {
      const res = await h(corsReq("OPTIONS", path, { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-vc-key" }));
      assert.equal(res.status, 204, `${path} ${origin}`);
      assert.equal(res.headers["access-control-allow-origin"], origin);
      assert.notEqual(res.headers["access-control-allow-origin"], "*");
      assert.match(res.headers.vary ?? "", /Origin/i);
      assert.equal(res.headers["access-control-allow-methods"], "POST,GET,OPTIONS");
      assert.equal(res.headers["access-control-allow-headers"], "Content-Type,X-VC-Key,Authorization");
      assert.equal(res.headers["access-control-max-age"], "600");
      assert.equal(res.body, "");
    }
  }
  assert.equal(inner.seen.length, 0, "a preflight never reaches the routes");
});

test("K4: a preflight from any other origin gets a 204 with no CORS headers (a look-alike host, another scheme or port, a revoked partner, the null origin)", async () => {
  const p = partnerWorld();
  await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  await p.add("Gone", ["https://gone.example"], "gone-partner");
  await revokePartner(p.store, "gone-partner");
  p.clock.ms += 61_000;
  const h = withPartnerRoutes(innerSpy().handler, p.registry);
  for (const origin of ["https://evil.example", "https://vidysea.example.evil.com", "http://vidysea.example", "https://vidysea.example:8443", "https://VIDYSEA.example", "https://gone.example", "null", "*", "", "https://vidysea.example/", "https://vidysea.example, https://evil.example"]) {
    const res = await h(corsReq("OPTIONS", ANONYMOUS_PATH, { origin, "access-control-request-method": "POST" }));
    assert.equal(res.status, 204, JSON.stringify(origin));
    assert.deepEqual(Object.keys(cors(res)).filter((k) => k.toLowerCase().startsWith("access-control-")), [], JSON.stringify(origin));
  }
});

test("K4: a preflight for any student route (chat, voice session or stream) or a counsellor route is never granted CORS, because only a server key opens them and a server key never gets CORS", async () => {
  const p = partnerWorld();
  await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const h = withPartnerRoutes(innerSpy().handler, p.registry);
  for (const path of ["/v1/students/stu-1/chat/threads", "/v1/students/stu-1/chat/profile", "/v1/openapi.json", "/v1/students/stu-1/sessions/s-1/scribe", "/v1/students/stu-1/chat/threads/th-1/voice/stream", VOICE_SESSION]) {
    const res = await h(corsReq("OPTIONS", path, { origin: "https://vidysea.example", "access-control-request-method": "POST" }));
    assert.equal(res.headers["access-control-allow-origin"], undefined, path);
  }
});

test("K4: the actual request gets Allow-Origin only when its key is active and the Origin is in THAT key's list; every other combination gets no CORS header", async () => {
  const p = partnerWorld();
  const web = await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const other = await p.add("Other", ["https://other.example"], "other");
  const inner = innerSpy();
  const h = withPartnerRoutes(inner.handler, p.registry);
  const post = (headers: Record<string, string>) => h(corsReq("POST", ANONYMOUS_PATH, headers));

  const good = await post({ origin: "https://vidysea.example", "x-vc-key": web.pub });
  assert.equal(good.status, 200);
  assert.equal(good.headers["access-control-allow-origin"], "https://vidysea.example");
  assert.match(good.headers.vary ?? "", /Origin/i);
  assert.match(good.headers["access-control-expose-headers"] ?? "", /Retry-After/i);
  assert.equal(inner.seen.length, 1);

  const crossed = await post({ origin: "https://other.example", "x-vc-key": web.pub });
  assert.equal(crossed.headers["access-control-allow-origin"], undefined, "partner A's key from partner B's site");
  const noKey = await post({ origin: "https://vidysea.example" });
  assert.equal(noKey.headers["access-control-allow-origin"], undefined, "no key");
  const badKey = await post({ origin: "https://vidysea.example", "x-vc-key": `vck_pub_vidysea-web_${"A".repeat(43)}` });
  assert.equal(badKey.headers["access-control-allow-origin"], undefined, "wrong secret");
  const noOrigin = await post({ "x-vc-key": web.pub });
  assert.deepEqual(cors(noOrigin), {}, "a server-to-server call has no Origin and gets no CORS header");
  for (const res of [crossed, noKey, badKey, noOrigin, good]) assert.notEqual(res.headers["access-control-allow-origin"], "*");

  await revokePartner(p.store, "other");
  p.clock.ms += 61_000;
  const revoked = await post({ origin: "https://other.example", "x-vc-key": other.pub });
  assert.equal(revoked.headers["access-control-allow-origin"], undefined, "revoked partner");
});

test("K4: the inner route's own 401 or 429 reaches the browser only for an allowed origin so the widget can read Retry-After; a failure never widens CORS", async () => {
  const p = partnerWorld();
  const web = await p.add("Vidysea Website", ["https://vidysea.example"], "vidysea-web");
  const limited: ApiHandler = async () => respond(429, { error: "rate_limited" }, { "retry-after": "7" });
  const h = withPartnerRoutes(limited, p.registry);
  const res = await h(corsReq("POST", ANONYMOUS_PATH, { origin: "https://vidysea.example", "x-vc-key": web.pub }));
  assert.equal(res.status, 429);
  assert.equal(res.headers["retry-after"], "7");
  assert.equal(res.headers["access-control-allow-origin"], "https://vidysea.example");
  const crashed: ApiHandler = async () => { throw new Error("boom"); };
  await assert.rejects(() => withPartnerRoutes(crashed, p.registry)(corsReq("POST", ANONYMOUS_PATH, { origin: "https://vidysea.example", "x-vc-key": web.pub })), /boom/, "the wrapper does not swallow a failure");
});

test("K4: when the partner store is down the wrapper adds no CORS header and still lets the inner handler answer", async () => {
  const down: PartnerStore = { get: async () => { throw new Error("down"); }, list: async () => { throw new Error("down"); }, insert: async () => { throw new Error("x"); }, update: async () => { throw new Error("x"); } };
  const registry = createPartnerRegistry({ store: down, pepper: PEPPER, nowMs: () => T0 });
  const inner = innerSpy();
  const h = withPartnerRoutes(inner.handler, registry);
  const pre = await h(corsReq("OPTIONS", ANONYMOUS_PATH, { origin: "https://vidysea.example", "access-control-request-method": "POST" }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers["access-control-allow-origin"], undefined);
  const res = await h(corsReq("POST", ANONYMOUS_PATH, { origin: "https://vidysea.example", "x-vc-key": `vck_pub_vidysea-web_${"A".repeat(43)}` }));
  assert.equal(res.status, 200);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

// ---------------------------------------------------------------------------
// K5. The partner OpenAPI route and nginx
// ---------------------------------------------------------------------------

test("K5: a partner developer fetches /v1/partner/openapi.json and gets PARTNER_OPENAPI, the partner OpenAPI 3.1 document (not the student draft)", async () => {
  assert.notEqual(PARTNER_OPENAPI, STUDENT_API_DRAFT);
  assert.equal((PARTNER_OPENAPI as { openapi?: string }).openapi, "3.1.0");
  const inner = innerSpy();
  for (const registry of [undefined, partnerWorld().registry]) {
    const h = withPartnerRoutes(inner.handler, registry);
    const res = await h(corsReq("GET", "/v1/partner/openapi.json", {}));
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), JSON.parse(JSON.stringify(PARTNER_OPENAPI)));
    assert.match(res.headers["content-type"] ?? "", /application\/json/);
    const post = await h(corsReq("POST", "/v1/partner/openapi.json", {}));
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, "GET, OPTIONS");
    assert.equal((await h(corsReq("GET", "/v1/partner/openapi.json?x=1", {}))).status, 200, "a query string does not change the route");
    assert.equal((await h(corsReq("GET", "/v1/partner/other.json", {}))).status, 200, "other paths still reach the inner handler untouched");
  }
  assert.equal(inner.seen.length, 2, "only the unrelated path reached the inner handler, once per registry");
});

const NGINX = readFileSync(fileURLToPath(new URL("../../../infra/ubuntu/nginx-vc.conf", import.meta.url)), "utf8");
const nginxCode = NGINX.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
function locationBlock(header: RegExp): string {
  const m = header.exec(nginxCode);
  assert.ok(m, `nginx location ${header} is present and uncommented`);
  const start = nginxCode.indexOf("{", m!.index);
  let depth = 0;
  for (let i = start; i < nginxCode.length; i++) {
    if (nginxCode[i] === "{") depth++;
    else if (nginxCode[i] === "}" && --depth === 0) return nginxCode.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}

test("K5: nginx proxies the public chat route, the student chat routes, the partner openapi route and the voice stream; everything else under /v1/ is still 404", () => {
  assert.equal((nginxCode.match(/{/g) ?? []).length, (nginxCode.match(/}/g) ?? []).length, "balanced braces");
  const anon = locationBlock(/location\s*=\s*\/v1\/public\/chat\/turns\s*{/);
  const chat = locationBlock(/location\s*~\s*\^\/v1\/students\/\[\^\/\]\+\/chat\(\/\|\$\)\s*{/);
  const openapi = locationBlock(/location\s*=\s*\/v1\/partner\/openapi\.json\s*{/);
  const stream = locationBlock(/location\s*~\s*\^\/v1\/students\/\[\^\/\]\+\/chat\/threads\/\[\^\/\]\+\/voice\/stream\$\s*{/);
  // pc-voice V2: the anonymous voice session route and its WebSocket stream (page key) are proxied the same way.
  const pubVoiceSessions = locationBlock(/location\s*=\s*\/v1\/public\/voice\/sessions\s*{/);
  const pubVoiceStream = locationBlock(/location\s*=\s*\/v1\/public\/voice\/stream\s*{/);
  for (const [name, block] of Object.entries({ anon, chat, openapi, stream, pubVoiceSessions, pubVoiceStream })) {
    assert.match(block, /proxy_pass\s+http:\/\/127\.0\.0\.1:8080;/, name);
    assert.match(block, /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/, `${name}: X-Real-IP is SET from the socket peer`);
    assert.doesNotMatch(block, /proxy_set_header\s+X-Real-IP\s+\$http_/, name);
    assert.doesNotMatch(block, /limit_except/, `${name}: no method restriction, so OPTIONS reaches the API`);
    assert.doesNotMatch(block, /add_header\s+['"]?Access-Control/i, `${name}: CORS is decided by the API per key, never by nginx`);
    assert.doesNotMatch(block, /proxy_set_header\s+X-VC-Key\b/i, `${name}: the key header is passed through unchanged`);
  }
  for (const block of [anon, chat, openapi, pubVoiceSessions, pubVoiceStream]) assert.match(block, /limit_req\s+zone=vcchat/);
  assert.match(pubVoiceStream, /proxy_http_version\s+1\.1;/);
  assert.match(pubVoiceStream, /proxy_set_header\s+Upgrade\s+\$http_upgrade;/);
  assert.match(pubVoiceStream, /proxy_set_header\s+Connection\s+["']?upgrade["']?;/);
  assert.match(stream, /proxy_http_version\s+1\.1;/);
  assert.match(stream, /proxy_set_header\s+Upgrade\s+\$http_upgrade;/);
  assert.match(stream, /proxy_set_header\s+Connection\s+["']?upgrade["']?;/);
  assert.match(stream, /proxy_read_timeout\s+\d{3,}s;/);
  assert.ok(nginxCode.indexOf("voice/stream") < nginxCode.indexOf("chat(/|$)"), "the stream location comes first: nginx takes the first matching regex");
  const rest = locationBlock(/location\s+\/v1\/\s*{/);
  assert.match(rest, /return\s+404;/);
  assert.doesNotMatch(rest, /proxy_pass/);
  // nothing else under /v1/ is proxied: the only proxied v1 locations are the six above, plus the catch-all 404
  const v1Locations = [...nginxCode.matchAll(/location\s+(?:=\s*|~\s*)?(\^?\/v1\/\S*)/g)].map((m) => m[1]);
  assert.equal(v1Locations.length, 7, v1Locations.join(" | "));
});

test("K5 (clarified default 5): nginx serves the widget statically with a one-year immutable cache for the versioned file and 300 s for the alias", () => {
  const versioned = locationBlock(/location\s*=\s*\/widget\/vc-widget\.v1\.js\s*{/);
  const alias = locationBlock(/location\s*=\s*\/widget\/vc-widget\.js\s*{/);
  assert.match(versioned, /Cache-Control\s+["']public, max-age=31536000, immutable["']/);
  assert.match(alias, /Cache-Control\s+["']public, max-age=300["']/);
  for (const block of [versioned, alias]) assert.doesNotMatch(block, /proxy_pass/);
});

// ---------------------------------------------------------------------------
// Wiring: the real launcher over real HTTP
// ---------------------------------------------------------------------------

test("wiring: over real HTTP through launch(), a keyed browser is answered with CORS for its own site only, a revoked key is refused within 60 s, and VC_PARTNER_KEY_REQUIRED refuses a keyless call", async () => {
  const fake = createFakeMongoClient();
  const gates = gatesFixture();
  const baseEnv = {
    MONGODB_URL: "mongodb://fake-host/ignored",
    VC_JWT_ISSUER: "https://issuer.synthetic.test",
    VC_JWT_ALGORITHMS: "HS256",
    VC_JWT_HS256_SECRET: "j".repeat(40),
    VC_ANONYMOUS_ENABLED: "true",
    VC_KB_BASE_URL: "http://127.0.0.1:1",
    VC_KB_ANON_API_KEY: "synthetic-anon-key",
    [PARTNER_PEPPER_ENV]: PEPPER,
  };
  const clock = { ms: Date.now() };
  const api = await launch(baseEnv, { clientFactory: () => fake.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, partners: { nowMs: () => clock.ms } } });
  try {
    const realStore = createMongoPartnerStore(fake.dbFor("virtual_counsellor") as never);
    const { keys } = await addPartner(realStore, { name: "Vidysea Website", origins: ["https://vidysea.example"] }, { pepper: PEPPER });
    clock.ms += 61_000; // the running server's cached (empty) list has expired
    const url = `http://127.0.0.1:${api.port}`;
    const post = (headers: Record<string, string>) =>
      fetch(`${url}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", ...headers }, body: JSON.stringify({ text: GERMANY_QUESTION }) });

    const pre = await fetch(`${url}${ANONYMOUS_PATH}`, { method: "OPTIONS", headers: { origin: "https://vidysea.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-vc-key" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "https://vidysea.example");
    const pre2 = await fetch(`${url}${ANONYMOUS_PATH}`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    assert.equal(pre2.headers.get("access-control-allow-origin"), null);

    const ok = await post({ origin: "https://vidysea.example", "x-vc-key": keys.pub });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://vidysea.example");
    const evil = await post({ origin: "https://evil.example", "x-vc-key": keys.pub });
    assert.equal(evil.headers.get("access-control-allow-origin"), null);

    const spec = await fetch(`${url}/v1/partner/openapi.json`);
    assert.equal(spec.status, 200);
    assert.equal(((await spec.json()) as { openapi?: string }).openapi, (PARTNER_OPENAPI as { openapi: string }).openapi);

    await revokePartner(realStore, "vidysea-website");
    clock.ms += 61_000;
    assert.equal((await post({ origin: "https://vidysea.example", "x-vc-key": keys.pub })).status, 401);
  } finally {
    await api.stop();
  }

  const strictApi = await launch({ ...baseEnv, [PARTNER_KEY_REQUIRED_ENV]: "true" }, { clientFactory: () => createFakeMongoClient().client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } });
  try {
    const res = await fetch(`http://127.0.0.1:${strictApi.port}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" }, body: JSON.stringify({ text: GERMANY_QUESTION }) });
    assert.equal(res.status, 401);
  } finally {
    await strictApi.stop();
    cleanupGates(gates);
  }
});

test("wiring: VC_PARTNER_KEY_REQUIRED=true with no pepper, or a short pepper, refuses to start naming the variable and never echoing a value", async () => {
  const gates = gatesFixture();
  const env = { MONGODB_URL: "mongodb://fake-host/ignored", VC_JWT_ISSUER: "https://i.synthetic.test", VC_JWT_ALGORITHMS: "HS256", VC_JWT_HS256_SECRET: "j".repeat(40), VC_ANONYMOUS_ENABLED: "true", VC_KB_BASE_URL: "http://127.0.0.1:1", VC_KB_ANON_API_KEY: "k" };
  const opts = { clientFactory: () => createFakeMongoClient().client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } };
  try {
    await assert.rejects(() => launch({ ...env, [PARTNER_KEY_REQUIRED_ENV]: "true" }, opts), (e: unknown) => e instanceof Error && e.message.includes(PARTNER_PEPPER_ENV));
    await assert.rejects(() => launch({ ...env, [PARTNER_PEPPER_ENV]: "tooshort-secret" }, opts), (e: unknown) => e instanceof Error && e.message.includes(PARTNER_PEPPER_ENV) && !e.message.includes("tooshort-secret"));
    await assert.rejects(() => launch({ ...env, [PARTNER_KEY_REQUIRED_ENV]: "maybe", [PARTNER_PEPPER_ENV]: PEPPER }, opts), (e: unknown) => e instanceof Error && e.message.includes(PARTNER_KEY_REQUIRED_ENV));
  } finally {
    cleanupGates(gates);
  }
});

// ---------------------------------------------------------------------------
// Fix cycle 1: K1 concurrent rotate, registry load, reserved ids, lookalike Origin
// ---------------------------------------------------------------------------

/** A store whose get() holds every caller until `n` of them have read, so n operations are all past their read before any writes. */
function readBarrierStore(real: PartnerStore, n: number): PartnerStore {
  let waiting = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return {
    ...real,
    get: async (id) => {
      const d = await real.get(id);
      if (++waiting === n) release();
      await gate;
      return d;
    },
  };
}

test("K1 (c1): two operators rotate the page key and the server key of one partner at the same moment: both new keys work and both old keys are dead", async () => {
  const w = partnerWorld();
  const old = await w.add("Race Co", ["https://race.example"], "race-co");
  const ctx = { pepper: PEPPER, now: () => new Date(w.clock.ms) };
  const store = readBarrierStore(w.store, 2);
  const [a, b] = await Promise.all([rotatePartner(store, "race-co", "pub", ctx), rotatePartner(store, "race-co", "srv", ctx)]);
  const fresh = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => w.clock.ms });
  assert.equal((await fresh.authenticate(a.key, "pub"))?.partnerId, "race-co", "the new page key works");
  assert.equal((await fresh.authenticate(b.key, "srv"))?.partnerId, "race-co", "the new server key works");
  assert.equal(await fresh.authenticate(old.pub, "pub"), undefined, "the old page key is dead");
  assert.equal(await fresh.authenticate(old.srv, "srv"), undefined, "the old server key is dead");
  const stored = (await w.store.get("race-co"))!;
  assert.deepEqual(Object.keys(stored.keys).sort(), ["pub", "srv"], "the keys object holds exactly the two scopes (no literal dotted field)");
  assert.deepEqual(Object.keys(stored).sort(), ["_id", "allowedOrigins", "createdAt", "keys", "name", "partnerId", "status"]);
});

test("K1 (c1): two overlapping rotates of the SAME scope leave exactly one printed key working (the last writer), and never the old key", async () => {
  const w = partnerWorld();
  const old = await w.add("Race Co", [], "race-co");
  const ctx = { pepper: PEPPER, now: () => new Date(w.clock.ms) };
  const store = readBarrierStore(w.store, 2);
  const [a, b] = await Promise.all([rotatePartner(store, "race-co", "pub", ctx), rotatePartner(store, "race-co", "pub", ctx)]);
  assert.notEqual(a.key, b.key);
  const fresh = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => w.clock.ms });
  const works = [!!(await fresh.authenticate(a.key, "pub")), !!(await fresh.authenticate(b.key, "pub"))];
  assert.equal(works.filter(Boolean).length, 1, `exactly one of the two printed keys works (got ${JSON.stringify(works)})`);
  assert.equal(await fresh.authenticate(old.pub, "pub"), undefined, "the old page key is dead");
  assert.equal((await fresh.authenticate(old.srv, "srv"))?.partnerId, "race-co", "the other scope is untouched");
});

test("K1 (c1): rotate sends the store only the one scope's dotted path, never the whole keys object", async () => {
  const w = partnerWorld();
  await w.add("Race Co", [], "race-co");
  const patches: string[][] = [];
  const spy: PartnerStore = { ...w.store, update: async (id, patch) => (patches.push(Object.keys(patch)), w.store.update(id, patch)) };
  const ctx = { pepper: PEPPER, now: () => new Date(w.clock.ms) };
  await rotatePartner(spy, "race-co", "pub", ctx);
  await rotatePartner(spy, "race-co", "srv", ctx);
  assert.deepEqual(patches, [["keys.pub"], ["keys.srv"]]);
});

test("registry (c1): a store.list() that throws synchronously once does not poison the registry: the next call reads again and authenticates", async () => {
  const w = partnerWorld();
  const { pub } = await w.add("Pathlynks", ["https://pathlynks.example"]);
  let calls = 0;
  const flaky: PartnerStore = {
    ...w.store,
    list: (() => {
      calls++;
      if (calls === 1) throw new Error("sync boom"); // a plain (non-async) throw, before any promise exists
      return w.store.list();
    }) as PartnerStore["list"],
  };
  const registry = createPartnerRegistry({ store: flaky, pepper: PEPPER, nowMs: () => w.clock.ms });
  await assert.rejects(() => registry.authenticate(pub, "pub"), (e: unknown) => e instanceof PartnerRegistryUnavailableError);
  assert.equal((await registry.authenticate(pub, "pub"))?.partnerId, "pathlynks", "the next call is not stuck on the first failure");
  assert.equal(calls, 2);
});

test("K1 (c1): a partner id equal to the sandbox tenant id (or another reserved or configured tenant id) is refused, naming only the id, and nothing is written", async () => {
  const w = partnerWorld();
  for (const id of ["sandbox", "admin", "system"]) {
    await assert.rejects(
      () => w.add("Anything", [], id),
      (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && e.message.includes(`"${id}"`) && !ANY_KEY_RE.test(e.message),
      id,
    );
    assert.equal(await w.store.get(id), null);
  }
  await assert.rejects(() => addPartner(w.store, { name: "Sandbox" }, { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id", "the slug of the name is checked too");
  await assert.rejects(() => runPartnerCli(["add", "Sandbox"], { store: w.store, pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  await assert.rejects(() => addPartner(w.store, { name: "Acme", id: "acme-tenant" }, { pepper: PEPPER, reservedIds: ["acme-tenant"] }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id", "a caller-supplied tenant id");
  assert.equal(await w.store.get("acme-tenant"), null);
  assert.equal((await w.add("Pathlynks")).id, "pathlynks", "an ordinary id is unaffected");
});

test("K4 (c1): a look-alike Origin on the actual request path (vidysea.com.evil.io, evil-vidysea.com) gets no Allow-Origin and the real anonymous route answers 401", async () => {
  const p = partnerWorld();
  const site = await p.add("Vidysea Website", ["https://vidysea.com"], "vidysea-web");
  const w = anonWorld({ deps: { partners: p.registry } });
  try {
    const h = withPartnerRoutes(w.handler, p.registry);
    for (const origin of ["https://vidysea.com.evil.io", "https://evil-vidysea.com", "https://vidysea.com.", "https://sub.vidysea.com"]) {
      const res = await h(anonRequest({ text: GERMANY_QUESTION }, { headers: { "x-vc-key": site.pub, origin } }));
      assert.equal(res.status, 401, origin);
      assert.equal(res.headers["access-control-allow-origin"], undefined, `no Allow-Origin for ${origin}`);
      assert.deepEqual(cors(res), {}, `no CORS header at all for ${origin}`);
    }
    assert.equal(w.kb.calls.length, 0, "the route was never reached");
    const ok = await h(anonRequest({ text: GERMANY_QUESTION }, { headers: { "x-vc-key": site.pub, origin: "https://vidysea.com" } }));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["access-control-allow-origin"], "https://vidysea.com", "the listed origin still works");
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------
// pc-reserved-ids (ISS-pc-partner-keys-1, tenancy): a partner id is the tenant id of every record its server key writes (K3), so it must never equal,
// or look like, a tenant that already exists.
// ---------------------------------------------------------------------------

/** A partner record as an older build wrote it (before the reserved-id rule): the real key format and HMACs, but no reserved-id check on the id. */
async function legacyPartner(store: PartnerStore, id: string, origins: string[] = []): Promise<{ pub: string; srv: string }> {
  const secret = (c: string) => c.repeat(43);
  const pub = `vck_pub_${id}_${secret("P")}`;
  const srv = `vck_srv_${id}_${secret("S")}`;
  const rec = (key: string) => ({ hash: hashPartnerKey(key, PEPPER), prefix: key.slice(0, 20), rotatedAt: null });
  await store.insert({ _id: id, partnerId: id, name: `Legacy ${id}`, keys: { pub: rec(pub), srv: rec(srv) }, allowedOrigins: origins, status: "active", createdAt: "2026-10-01T00:00:00.000Z" });
  return { pub, srv };
}

test("R1: add refuses sandbox-1, SANDBOX, Sandbox-x, admin_2, root.x and every other built-in reserved name or name+separator+suffix, case-insensitively, and writes nothing", async () => {
  const w = partnerWorld();
  const refused = ["sandbox", "sandbox-1", "SANDBOX", "Sandbox-x", "SANDBOX-1", "admin_2", "ADMIN_2", "root.x", "system-9", "default-tenant", "internal-api", "root:1", "admin 3"];
  for (const id of refused) {
    await assert.rejects(
      () => w.add("Anything", [], id),
      (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && e.message.includes("reserved") && !ANY_KEY_RE.test(e.message),
      id,
    );
  }
  assert.equal((await w.store.list()).length, 0, "nothing was written for any refused id");
  // the same through the CLI and through the slug of a name
  await assert.rejects(() => runPartnerCli(["add", "x", "--id", "sandbox-1"], { store: w.store, pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && e.message.includes("reserved"));
  await assert.rejects(() => runPartnerCli(["add", "Sandbox 1"], { store: w.store, pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && e.message.includes("reserved"));
  assert.equal((await w.store.list()).length, 0);
  // ids that merely start with the same letters are NOT a reserved family (no separator after the name)
  for (const id of ["sandboxed", "administrator", "rooted", "systemic", "defaults", "pathlynks", "vidysea-web", "vidysea-website"]) {
    assert.equal((await w.add("Fine", [], id)).id, id, `${id} still adds`);
  }
});

test("R1: add refuses an id equal to any configured tenant id (case-insensitive) and to the repo's own known tenants, but only the exact id", async () => {
  const w = partnerWorld();
  const ctx = { pepper: PEPPER, reservedIds: ["Acme-Tenant", "pathlynks-prod"] };
  for (const id of ["acme-tenant", "pathlynks-prod", ...KNOWN_TENANT_IDS]) {
    await assert.rejects(() => addPartner(w.store, { name: "X", id }, ctx), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && e.message.includes("reserved"), id);
  }
  assert.deepEqual([...KNOWN_TENANT_IDS], ["vc-synthetic-demo", "scribe-evaluation"], "the tenants this repo itself writes under (apps/web/demo/seed.ts, packages/engine/evals/score.ts)");
  assert.equal((await w.store.list()).length, 0);
  assert.equal((await addPartner(w.store, { name: "Acme", id: "acme-tenant-2" }, ctx)).partner.partnerId, "acme-tenant-2", "a configured id is exact, not a prefix family");
  assert.equal((await addPartner(w.store, { name: "Pathlynks", id: "pathlynks" }, ctx)).partner.partnerId, "pathlynks");
});

test("R1: isReservedPartnerId normalises case and width, and ids are ASCII-validated so a unicode look-alike cannot reach the check or a key", async () => {
  assert.equal(isReservedPartnerId("sandbox-1"), true);
  assert.equal(isReservedPartnerId("SANDBOX"), true);
  assert.equal(isReservedPartnerId("ｓandbox"), true, "full-width s folds to sandbox (NFKC)");
  assert.equal(isReservedPartnerId("sandboxed"), false);
  assert.equal(isReservedPartnerId("acme", ["ACME"]), true);
  const w = partnerWorld();
  for (const id of ["ѕandbox", "sandbоx", "sandbox​", "adminı"]) {
    await assert.rejects(() => w.add("X", [], id), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id", JSON.stringify(id));
  }
  assert.equal((await w.store.list()).length, 0);
  for (const id of ["ѕandbox", "sandbоx"]) assert.equal(parsePartnerKey(`vck_srv_${id}_${"A".repeat(43)}`), undefined, "a key with a non-ASCII id is not even well-formed");
  assert.equal(PARTNER_ID_PATTERN.source, "^[a-z0-9-]{2,32}$", "ids stay ASCII-validated");
});

test("R1: the CLI takes the configured tenant ids from the environment by itself (VC_RESERVED_TENANT_IDS), and a malformed list fails closed naming the variable", async () => {
  assert.deepEqual(reservedTenantIdsFromEnv({}), []);
  assert.deepEqual(reservedTenantIdsFromEnv({ [RESERVED_TENANT_IDS_ENV]: "  " }), []);
  assert.deepEqual(reservedTenantIdsFromEnv({ [RESERVED_TENANT_IDS_ENV]: "tenant-a, Tenant_B  sandbox-1,,tenant-a" }), ["tenant-a", "Tenant_B", "sandbox-1"]);
  for (const bad of ["ok,bad:id", "has.dot", "-lead", "a$b", "x".repeat(65)]) {
    assert.throws(() => reservedTenantIdsFromEnv({ [RESERVED_TENANT_IDS_ENV]: bad }), (e: unknown) => e instanceof PartnerConfigError && e.message.includes(RESERVED_TENANT_IDS_ENV), bad);
  }
  // the actual CLI entry point passes them: apps/api/scripts/partner.ts must feed reservedTenantIdsFromEnv(process.env) into runPartnerCli's deps
  const script = readFileSync(fileURLToPath(new URL("../scripts/partner.ts", import.meta.url)), "utf8");
  assert.match(script, /reservedTenantIdsFromEnv\(process\.env\)/);
  assert.match(script, /runPartnerCli\(argv, \{[^}]*reservedIds/);
  // and runPartnerCli forwards deps.reservedIds into addPartner
  const w = partnerWorld();
  const reservedIds = reservedTenantIdsFromEnv({ [RESERVED_TENANT_IDS_ENV]: "student-jwt-tenant" });
  await assert.rejects(() => runPartnerCli(["add", "Student JWT Tenant", "--id", "student-jwt-tenant"], { store: w.store, pepper: PEPPER, reservedIds }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  assert.equal(await w.store.get("student-jwt-tenant"), null);
});

test("R2: a partner record made before the fix (sandbox-1, or an id later configured as a tenant) is refused at request time on the real student chat route: uniform 401, nothing read or written", async () => {
  const { db } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const clock = { ms: T0 };
  const configured: string[] = [];
  const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => clock.ms, reservedIds: () => configured });
  const ok = await addPartner(store, { name: "Pathlynks" }, { pepper: PEPPER });
  const legacy = await legacyPartner(store, "sandbox-1");
  const later = await addPartner(store, { name: "Later Tenant", id: "later-tenant" }, { pepper: PEPPER });
  const w = chatWorld({ deps: { partners: registry } });
  try {
    const bad = await call(w, "POST", threadsPath("stu-1"), { token: "not.a.jwt" });
    const seen = new Set<string>([UNAUTHORIZED_BODY(bad)]);
    // 1. a pre-fix partner whose id matches the built-in family
    for (const token of [legacy.srv, legacy.pub]) {
      const res = await call(w, "POST", threadsPath("stu-1"), { token, headers: studentHeaders("stu-1") });
      assert.equal(res.status, 401);
      seen.add(UNAUTHORIZED_BODY(res));
    }
    // 2. a partner that was fine when added, and whose id becomes a configured tenant id afterwards: refused on the very next request, no cache wait
    assert.equal((await call(w, "POST", threadsPath("stu-1"), { token: later.keys.srv, headers: studentHeaders("stu-1") })).status, 201, "fine before the tenant is configured");
    configured.push("Later-Tenant");
    const res = await call(w, "POST", threadsPath("stu-1"), { token: later.keys.srv, headers: studentHeaders("stu-1") });
    assert.equal(res.status, 401);
    seen.add(UNAUTHORIZED_BODY(res));
    assert.equal(seen.size, 1, "every refusal is the same bytes as a bad token");
    assert.equal((await call(w, "POST", threadsPath("stu-1"), { token: ok.keys.srv, headers: studentHeaders("stu-1") })).status, 201, "an unrelated partner is unaffected");
    const tenants = new Set(w.fakeDb.collection<{ _id: string; tenantId?: string }>("chat_threads").all().map((d) => d.tenantId));
    assert.ok(!tenants.has("sandbox-1"), "nothing was created under the reserved tenant");
    assert.ok(tenants.has("later-tenant"), "the one pre-configuration thread exists, and no second one was added after");
    assert.equal(w.fakeDb.collection<{ _id: string }>("chat_threads").all().filter((d) => (d as { tenantId?: string }).tenantId === "later-tenant").length, 1);
  } finally {
    w.cleanup();
  }
});

test("R2: the same refusal on the public chat route (vck_pub_), and no CORS is granted to the blocked partner's origin", async () => {
  const { db } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => T0 });
  const legacy = await legacyPartner(store, "admin-2", ["https://admin2.example"]);
  const fine = await addPartner(store, { name: "Fine Site", origins: ["https://fine.example"] }, { pepper: PEPPER });
  assert.equal(await registry.authenticate(legacy.pub, "pub"), undefined);
  assert.equal(await registry.authenticate(legacy.srv, "srv"), undefined);
  assert.equal((await registry.authenticate(fine.keys.pub, "pub"))?.partnerId, "fine-site");
  assert.equal(await registry.originAllowedByAnyPartner("https://admin2.example"), false, "a blocked partner's origin gets no preflight grant");
  assert.equal(await registry.originAllowedByAnyPartner("https://fine.example"), true);
  const w = anonWorld({ deps: { partners: registry } });
  try {
    const good = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": fine.keys.pub } });
    assert.equal(good.status, 200);
    const calls = w.kb.calls.length;
    const bad = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": legacy.pub, origin: "https://admin2.example" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers["access-control-allow-origin"], undefined);
    assert.equal(w.kb.calls.length, calls, "the knowledge base was not called");
    const unknown = await ask(w, GERMANY_QUESTION, { headers: { "x-vc-key": `vck_pub_nobody_${"A".repeat(43)}` } });
    assert.equal(UNAUTHORIZED_BODY(bad), UNAUTHORIZED_BODY(unknown), "indistinguishable from an unknown key");
  } finally {
    w.cleanup();
  }
});

test("R2 wiring: through launch(), VC_RESERVED_TENANT_IDS and chat.sandboxTenantId both reach the running registry; a bad list refuses to start before connecting", async () => {
  const fake = createFakeMongoClient();
  const gates = gatesFixture();
  const baseEnv = {
    MONGODB_URL: "mongodb://fake-host/ignored",
    VC_JWT_ISSUER: "https://issuer.synthetic.test",
    VC_JWT_ALGORITHMS: "HS256",
    VC_JWT_HS256_SECRET: "j".repeat(40),
    VC_ANONYMOUS_ENABLED: "true",
    VC_KB_BASE_URL: "http://127.0.0.1:1",
    VC_KB_ANON_API_KEY: "synthetic-anon-key",
    [PARTNER_PEPPER_ENV]: PEPPER,
    [RESERVED_TENANT_IDS_ENV]: "jwt-tenant-9",
  };
  const clock = { ms: Date.now() };
  const api = await launch(baseEnv, {
    clientFactory: () => fake.client,
    http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, chat: { sandboxTenantId: "sbx-main" } as never, partners: { nowMs: () => clock.ms } },
  });
  try {
    const store = createMongoPartnerStore(fake.dbFor("virtual_counsellor") as never);
    const fine = await addPartner(store, { name: "Fine Site" }, { pepper: PEPPER });
    const byEnv = await legacyPartner(store, "jwt-tenant-9");
    const bySandbox = await legacyPartner(store, "sbx-main");
    clock.ms += 61_000;
    const url = `http://127.0.0.1:${api.port}`;
    const post = (key: string) =>
      fetch(`${url}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", "x-vc-key": key }, body: JSON.stringify({ text: GERMANY_QUESTION }) });
    assert.equal((await post(fine.keys.pub)).status, 200);
    assert.equal((await post(byEnv.pub)).status, 401, "a tenant id from VC_RESERVED_TENANT_IDS");
    assert.equal((await post(bySandbox.pub)).status, 401, "the configured sandbox tenant id");
  } finally {
    await api.stop();
  }
  try {
    let connected = 0;
    const f2 = createFakeMongoClient();
    (f2.client as { connect: () => Promise<void> }).connect = async () => {
      connected += 1;
    };
    await assert.rejects(
      () => launch({ ...baseEnv, [RESERVED_TENANT_IDS_ENV]: "ok,bad:id" }, { clientFactory: () => f2.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } }),
      (e: unknown) => e instanceof Error && e.message.includes(RESERVED_TENANT_IDS_ENV),
    );
    assert.equal(connected, 0, "refused before anything connected");
  } finally {
    cleanupGates(gates);
  }
});

// ---------------------------------------------------------------------------
// pc-reserved-ids-2 (ISS-pc-reserved-ids-1..5): S1 empty list is loud, S2 a partner's own tenant is bound explicitly, S3 a malformed list is fatal only with
// partners on, S4 programmatic entries are trimmed and folded, S5 rotate refuses a reserved id.
// ---------------------------------------------------------------------------

/** Runs `fn` with console.error captured; returns the lines. */
async function captureStderr(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const real = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = real;
  }
  return lines;
}
const warningLines = (lines: string[]) => lines.filter((l) => l.includes(RESERVED_TENANT_IDS_ENV));

function reservedWiringEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    MONGODB_URL: "mongodb://fake-host/ignored",
    VC_JWT_ISSUER: "https://issuer.synthetic.test",
    VC_JWT_ALGORITHMS: "HS256",
    VC_JWT_HS256_SECRET: "j".repeat(40),
    VC_ANONYMOUS_ENABLED: "true",
    VC_KB_BASE_URL: "http://127.0.0.1:1",
    VC_KB_ANON_API_KEY: "synthetic-anon-key",
    ...extra,
  };
}

test("S1: partner add and partner list warn on stderr when VC_RESERVED_TENANT_IDS is empty or unset, and say nothing when it is set", async () => {
  const w = partnerWorld();
  const warned: string[] = [];
  const deps = { store: w.store, pepper: PEPPER, warn: (l: string) => void warned.push(l) };
  assert.ok(reservedTenantIdsWarning().includes(RESERVED_TENANT_IDS_ENV), "names the variable");
  assert.match(reservedTenantIdsWarning(), /unprotected/i, "names the consequence");
  await runPartnerCli(["add", "Acme"], { ...deps, reservedIds: [] });
  assert.deepEqual(warned, [reservedTenantIdsWarning()], "add warns once");
  await runPartnerCli(["list"], deps);
  assert.deepEqual(warned, [reservedTenantIdsWarning(), reservedTenantIdsWarning()], "list warns too (reservedIds unset)");
  warned.length = 0;
  await runPartnerCli(["add", "Beta"], { ...deps, reservedIds: ["jwt-tenant"] });
  await runPartnerCli(["list"], { ...deps, reservedIds: ["jwt-tenant"] });
  assert.deepEqual(warned, [], "no warning when the list is set");
  // the real script wires the warning to stderr
  const script = readFileSync(fileURLToPath(new URL("../scripts/partner.ts", import.meta.url)), "utf8");
  assert.match(script, /warn:\s*\(?\w*\)?\s*=>\s*console\.error/);
});

test("S1: startApi logs one warning naming VC_RESERVED_TENANT_IDS when partners are on and the list is empty or unset; none when set or when partners are off; the server still starts", async () => {
  const gates = gatesFixture();
  const opts = (): Parameters<typeof launch>[1] => ({ clientFactory: () => createFakeMongoClient().client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } });
  try {
    for (const empty of [undefined, "", "  "]) {
      let started = false;
      const lines = await captureStderr(async () => {
        const api = await launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [RESERVED_TENANT_IDS_ENV]: empty }), opts());
        started = api.port > 0;
        await api.stop();
      });
      assert.equal(started, true, "the server still starts");
      const w = warningLines(lines);
      assert.equal(w.length, 1, `exactly one warning for ${JSON.stringify(empty)}`);
      assert.match(w[0]!, /unprotected/i);
    }
    const set = await captureStderr(async () => {
      const api = await launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [RESERVED_TENANT_IDS_ENV]: "jwt-tenant" }), opts());
      await api.stop();
    });
    assert.deepEqual(warningLines(set), [], "no warning when the list is set");
    const off = await captureStderr(async () => {
      const api = await launch(reservedWiringEnv(), opts());
      await api.stop();
    });
    assert.deepEqual(warningLines(off), [], "no partner registry, no warning");
  } finally {
    cleanupGates(gates);
  }
});

test("S2: an operator can list a tenant equal to an existing partner's own id and bind it, and only that exact partner stays usable; any other partner on that tenant is refused at add and per request", async () => {
  const { db } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const reservedIds = ["pathlynks", "acme-tenant"];
  const ownTenants = ["pathlynks"];
  // bound partner: adds and authenticates although its id is a listed tenant
  const pl = await addPartner(store, { name: "Pathlynks" }, { pepper: PEPPER, reservedIds, ownTenants });
  assert.equal(pl.partner.partnerId, "pathlynks");
  const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => T0, reservedIds, ownTenants });
  assert.equal((await registry.authenticate(pl.keys.srv, "srv"))?.partnerId, "pathlynks");
  assert.equal((await registry.authenticate(pl.keys.pub, "pub"))?.partnerId, "pathlynks");
  // without the binding the same id is blocked (the ISS-pc-reserved-ids-2 trap) at add and per request
  await assert.rejects(() => addPartner(createMongoPartnerStore(createFakeDb().db), { name: "Pathlynks" }, { pepper: PEPPER, reservedIds }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  const unbound = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => T0, reservedIds });
  assert.equal(await unbound.authenticate(pl.keys.srv, "srv"), undefined, "no binding, no exemption");
  // another listed tenant is NOT exempted by pathlynks' binding, at add and per request
  await assert.rejects(() => addPartner(store, { name: "Acme", id: "acme-tenant" }, { pepper: PEPPER, reservedIds, ownTenants }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  const legacyAcme = await legacyPartner(store, "acme-tenant");
  assert.equal(await registry.authenticate(legacyAcme.srv, "srv"), undefined);
  // the binding is exact: it does not exempt a look-alike (case/width), nor another id
  assert.equal(isReservedPartnerId("pathlynks", reservedIds, ownTenants), false);
  assert.equal(isReservedPartnerId("PATHLYNKS", reservedIds, ownTenants), true, "a differently cased id is not the bound partner");
  assert.equal(isReservedPartnerId("ｐathlynks", reservedIds, ownTenants), true, "a full-width look-alike is not the bound partner");
  assert.equal(isReservedPartnerId("pathlynks", reservedIds, []), true);
  assert.equal(isReservedPartnerId("pathlynks", reservedIds, ["pathlynks-2"]), true, "binding another id exempts nothing");
});

test("S2: built-in names, the repo tenants and the sandbox tenant can never be exempted, in the env parser, in addPartner, in the registry and at startApi", async () => {
  // env parser
  assert.deepEqual(partnerOwnTenantsFromEnv({}), []);
  assert.deepEqual(partnerOwnTenantsFromEnv({ [PARTNER_OWN_TENANTS_ENV]: " pathlynks:pathlynks, acme:acme pathlynks:pathlynks" }), ["pathlynks", "acme"]);
  for (const bad of ["pathlynks", "pathlynks:", ":pathlynks", "pathlynks:other", "Pathlynks:Pathlynks", "a:a", "x:y:z", "sandbox:sandbox", "sandbox-1:sandbox-1", "admin:admin", "vc-synthetic-demo:vc-synthetic-demo", "scribe-evaluation:scribe-evaluation", "bad$id:bad$id"]) {
    assert.throws(() => partnerOwnTenantsFromEnv({ [PARTNER_OWN_TENANTS_ENV]: bad }), (e: unknown) => e instanceof PartnerConfigError && e.message.includes(PARTNER_OWN_TENANTS_ENV), bad);
  }
  // programmatic: a binding never lifts a built-in or repo tenant, whatever the caller passes
  const w = partnerWorld();
  for (const id of ["sandbox", "sandbox-1", "admin_2", ...KNOWN_TENANT_IDS]) {
    assert.equal(isReservedPartnerId(id, [id], [id]), true, id);
    await assert.rejects(() => addPartner(w.store, { name: "X", id }, { pepper: PEPPER, reservedIds: [id], ownTenants: [id] }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id", id);
  }
  const registry = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => T0, reservedIds: ["sandbox-1"], ownTenants: ["sandbox-1", "admin-2"] });
  const legacy = await legacyPartner(w.store, "sandbox-1");
  const legacy2 = await legacyPartner(w.store, "admin-2");
  assert.equal(await registry.authenticate(legacy.srv, "srv"), undefined);
  assert.equal(await registry.authenticate(legacy2.srv, "srv"), undefined);
  // startApi: binding the configured sandbox tenant is a config error before anything connects
  const gates = gatesFixture();
  try {
    let connected = 0;
    const f = createFakeMongoClient();
    (f.client as { connect: () => Promise<void> }).connect = async () => {
      connected += 1;
    };
    await assert.rejects(
      () => launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [PARTNER_OWN_TENANTS_ENV]: "sbx-main:sbx-main" }), { clientFactory: () => f.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, chat: { sandboxTenantId: "sbx-main" } as never } }),
      (e: unknown) => e instanceof PartnerConfigError && e.message.includes(PARTNER_OWN_TENANTS_ENV),
    );
    assert.equal(connected, 0);
  } finally {
    cleanupGates(gates);
  }
});

test("S2 wiring: through launch(), VC_PARTNER_OWN_TENANTS lets the bound partner (id = listed JWT tenant) in on the running server, and keeps every other listed tenant out", async () => {
  const fake = createFakeMongoClient();
  const gates = gatesFixture();
  const env = reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [RESERVED_TENANT_IDS_ENV]: "pathlynks, acme-tenant", [PARTNER_OWN_TENANTS_ENV]: "pathlynks:pathlynks" });
  const clock = { ms: Date.now() };
  const api = await launch(env, { clientFactory: () => fake.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, partners: { nowMs: () => clock.ms } } });
  try {
    const store = createMongoPartnerStore(fake.dbFor("virtual_counsellor") as never);
    const bound = await addPartner(store, { name: "Pathlynks" }, { pepper: PEPPER, reservedIds: ["pathlynks"], ownTenants: ["pathlynks"] });
    const other = await legacyPartner(store, "acme-tenant");
    clock.ms += 61_000;
    const post = (key: string) =>
      fetch(`http://127.0.0.1:${api.port}${ANONYMOUS_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", "x-vc-key": key }, body: JSON.stringify({ text: GERMANY_QUESTION }) });
    assert.equal((await post(bound.keys.pub)).status, 200, "the bound partner is answered");
    assert.equal((await post(other.pub)).status, 401, "an unbound partner on another listed tenant is refused");
  } finally {
    await api.stop();
    cleanupGates(gates);
  }
});

test("S3: a malformed VC_RESERVED_TENANT_IDS is fatal only when partners are enabled; with the pepper unset startup ignores it and logs a note, no throw", async () => {
  const gates = gatesFixture();
  const opts = () => ({ clientFactory: () => createFakeMongoClient().client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates } } });
  try {
    await assert.rejects(
      () => launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [RESERVED_TENANT_IDS_ENV]: "ok,bad:id" }), opts()),
      (e: unknown) => e instanceof Error && e.message.includes(RESERVED_TENANT_IDS_ENV),
      "still fatal with partners on",
    );
    let started = false;
    const lines = await captureStderr(async () => {
      const api = await launch(reservedWiringEnv({ [RESERVED_TENANT_IDS_ENV]: "ok,bad:id", [PARTNER_OWN_TENANTS_ENV]: "x:y" }), opts());
      started = api.port > 0;
      await api.stop();
    });
    assert.equal(started, true, "starts with the pepper unset");
    const note = warningLines(lines);
    assert.equal(note.length, 1, "one note naming the variable");
    assert.match(note[0]!, /ignored/i);
    assert.ok(!note[0]!.includes("bad:id"), "the value is not echoed");
  } finally {
    cleanupGates(gates);
  }
});

test("S4: programmatic reservedIds entries are trimmed and case-folded like the env parser, in isReservedPartnerId, addPartner and createPartnerRegistry", async () => {
  assert.equal(isReservedPartnerId("acme", ["  ACME\t"]), true);
  assert.equal(isReservedPartnerId("acme", [" \n"]), false, "a blank entry reserves nothing");
  assert.equal(isReservedPartnerId("a-b", [""]), false);
  const w = partnerWorld();
  await assert.rejects(() => addPartner(w.store, { name: "Acme", id: "acme-tenant" }, { pepper: PEPPER, reservedIds: ["  Acme-Tenant \n"] }), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  assert.equal(await w.store.get("acme-tenant"), null);
  const ok = await addPartner(w.store, { name: "Later", id: "later-tenant" }, { pepper: PEPPER });
  const reg = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => T0, reservedIds: ["\t Later-Tenant  "] });
  assert.equal(await reg.authenticate(ok.keys.srv, "srv"), undefined, "array form");
  const fn = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => T0, reservedIds: () => [" LATER-TENANT "] });
  assert.equal(await fn.authenticate(ok.keys.srv, "srv"), undefined, "function form");
  // a padded binding still binds the exact id
  assert.equal(isReservedPartnerId("pathlynks", [" Pathlynks "], [" pathlynks "]), false);
  assert.equal(isReservedPartnerId("pathlynks", [" Pathlynks "], []), true);
});

test("S5: partner rotate on a partner whose id is reserved refuses with a clear message and mints no key; revoke still works", async () => {
  const w = partnerWorld();
  await legacyPartner(w.store, "sandbox-1");
  await addPartner(w.store, { name: "Later", id: "later-tenant" }, { pepper: PEPPER });
  const before = JSON.stringify(await w.store.get("sandbox-1"));
  const beforeLater = JSON.stringify(await w.store.get("later-tenant"));
  const deps = { store: w.store, pepper: PEPPER, reservedIds: ["later-tenant"] };
  for (const [id, scope] of [["sandbox-1", "srv"], ["sandbox-1", "pub"], ["later-tenant", "srv"]] as const) {
    await assert.rejects(
      () => runPartnerCli(["rotate", id, "--scope", scope], deps),
      (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id" && /reserved/.test(e.message) && /no key/i.test(e.message) && e.message.includes(`"${id}"`) && !ANY_KEY_RE.test(e.message),
      `${id} ${scope}`,
    );
  }
  await assert.rejects(() => rotatePartner(w.store, "sandbox-1", "srv", deps), (e: unknown) => e instanceof PartnerError && e.code === "invalid_partner_id");
  assert.equal(JSON.stringify(await w.store.get("sandbox-1")), before, "no key was minted or stored");
  assert.equal(JSON.stringify(await w.store.get("later-tenant")), beforeLater);
  // revoke still works, and a bound partner can still rotate
  const out = await runPartnerCli(["revoke", "sandbox-1"], deps);
  assert.match(out.join("\n"), /revoked sandbox-1/);
  assert.equal((await w.store.get("sandbox-1"))?.status, "revoked");
  await addPartner(w.store, { name: "Pathlynks" }, { pepper: PEPPER, reservedIds: ["pathlynks"], ownTenants: ["pathlynks"] });
  const rot = await runPartnerCli(["rotate", "pathlynks", "--scope", "srv"], { store: w.store, pepper: PEPPER, reservedIds: ["pathlynks"], ownTenants: ["pathlynks"] });
  assert.match(rot.join("\n"), SRV_KEY_RE);
});

// ---------------------------------------------------------------------------
// pc-hardening: H4 (ISS-pc-reserved-ids-7), H5 (ISS-pc-reserved-ids-8), H6 (ISS-pc-reserved-ids-9)
// ---------------------------------------------------------------------------

test("H4: the sandbox-tenant exemption guard folds case and width like isReservedPartnerId: a mixed-case sandbox id with a lowercase (or full-width) binding is refused at startup, before anything connects", async () => {
  const gates = gatesFixture();
  try {
    for (const [sandbox, binding] of [["SBX-Main", "sbx-main"], ["sbx-main", "sbx-main"], ["ｓbx-Main", "sbx-main"]] as const) {
      let connected = 0;
      const f = createFakeMongoClient();
      (f.client as { connect: () => Promise<void> }).connect = async () => {
        connected += 1;
      };
      // the binding half must itself parse (lower-case partner id); an upper-case partner half is a parse error of its own, which is also a refusal
      await assert.rejects(
        async () => {
          const api = await launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [PARTNER_OWN_TENANTS_ENV]: `${binding}:${binding}` }), { clientFactory: () => f.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, chat: { sandboxTenantId: sandbox } as never } });
          await api.stop(); // not refused: do not leave the server open (this is the failing path)
        },
        (e: unknown) => e instanceof PartnerConfigError && e.message.includes(PARTNER_OWN_TENANTS_ENV),
        `${sandbox} vs ${binding}`,
      );
      assert.equal(connected, 0, `${sandbox}: refused before connecting`);
    }
    // a binding for a different tenant than the sandbox one still starts
    const f = createFakeMongoClient();
    const api = await launch(reservedWiringEnv({ [PARTNER_PEPPER_ENV]: PEPPER, [RESERVED_TENANT_IDS_ENV]: "pathlynks", [PARTNER_OWN_TENANTS_ENV]: "pathlynks:pathlynks" }), { clientFactory: () => f.client, http: { port: 0, provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, anonymous: { gatesDir: gates.gates }, chat: { sandboxTenantId: "SBX-Main" } as never } });
    await api.stop();
  } finally {
    cleanupGates(gates);
  }
});

test("H5: partner list marks every partner whose id is currently reserved (built-in family, repo tenant, listed tenant) with RESERVED and the reason, and spares a bound or clean partner; list --check exits non-zero (PartnerError reserved_ids) when any is flagged; no key material in the flags", async () => {
  const w = partnerWorld();
  await legacyPartner(w.store, "sandbox-1");
  await legacyPartner(w.store, "vc-synthetic-demo");
  await addPartner(w.store, { name: "Later", id: "later-tenant" }, { pepper: PEPPER });
  await addPartner(w.store, { name: "Clean", id: "clean-partner" }, { pepper: PEPPER });
  await addPartner(w.store, { name: "Pathlynks", id: "pathlynks" }, { pepper: PEPPER });
  const deps = { store: w.store, pepper: PEPPER, reservedIds: ["later-tenant", "pathlynks"], ownTenants: ["pathlynks"] };
  const lines = await runPartnerCli(["list"], deps);
  const lineOf = (id: string) => lines.find((l) => l.startsWith(`${id}  `)) ?? "";
  for (const id of ["sandbox-1", "vc-synthetic-demo", "later-tenant"]) assert.match(lineOf(id), /RESERVED/, id);
  assert.match(lineOf("sandbox-1"), /built-in/i);
  assert.match(lineOf("vc-synthetic-demo"), /repo writes under/i);
  assert.match(lineOf("later-tenant"), new RegExp(RESERVED_TENANT_IDS_ENV));
  assert.doesNotMatch(lineOf("clean-partner"), /RESERVED/);
  assert.doesNotMatch(lineOf("pathlynks"), /RESERVED/, "a bound partner is not flagged");
  // without --check the listing stays exit 0 (it returns); with --check it fails and names exactly the flagged ids
  await assert.rejects(
    () => runPartnerCli(["list", "--check"], deps),
    (e: unknown) =>
      e instanceof PartnerError &&
      e.code === "reserved_ids" &&
      ["sandbox-1", "vc-synthetic-demo", "later-tenant"].every((id) => e.message.includes(id)) &&
      !e.message.includes("clean-partner") &&
      !e.message.includes("pathlynks") &&
      !ANY_KEY_RE.test(e.message) &&
      !/[A-Za-z0-9_-]{43}/.test(e.message),
  );
  // --check with nothing flagged returns the listing and does not throw; other options stay usage errors
  const clean = partnerWorld();
  await addPartner(clean.store, { name: "Clean", id: "clean-partner" }, { pepper: PEPPER });
  const ok = await runPartnerCli(["list", "--check"], { store: clean.store, pepper: PEPPER, reservedIds: ["x-tenant"] });
  assert.equal(ok.length, 1);
  assert.doesNotMatch(ok.join("\n"), /RESERVED/);
  // a REVOKED partner with a reserved id is still marked in the listing but does not fail the pre-deploy check (its keys are dead already)
  await legacyPartner(clean.store, "admin-9");
  await revokePartner(clean.store, "admin-9");
  const withRevoked = await runPartnerCli(["list", "--check"], { store: clean.store, pepper: PEPPER, reservedIds: ["x-tenant"] });
  assert.match(withRevoked.find((l) => l.startsWith("admin-9  ")) ?? "", /revoked.*RESERVED/);
  await assert.rejects(() => runPartnerCli(["list", "--bogus"], deps), (e: unknown) => e instanceof PartnerError && e.code === "usage");
  await assert.rejects(() => runPartnerCli(["list", "extra"], deps), (e: unknown) => e instanceof PartnerError && e.code === "usage");
  // the same flag is raised for a partner made BEFORE the tenant was listed (the pre-deploy case), and the script and the runbook use it
  const script = readFileSync(fileURLToPath(new URL("../scripts/partner.ts", import.meta.url)), "utf8");
  assert.match(script, /list \[--check\]/);
  const runbook = readFileSync(fileURLToPath(new URL("../../../docs/runbook-golive.md", import.meta.url)), "utf8");
  assert.match(runbook, /partner list --check/);
  assert.ok(PARTNER_USAGE.join(" ").includes("--check"));
});

test("H6: listing pathlynks in VC_RESERVED_TENANT_IDS does not refuse partner pathlynks-2 (a configured tenant matches by exact id, folded; only built-in names have suffix families), at add and per request, and the integration doc says so", async () => {
  const { db } = createFakeDb();
  const store = createMongoPartnerStore(db);
  const reservedIds = reservedTenantIdsFromEnv({ [RESERVED_TENANT_IDS_ENV]: "pathlynks" });
  assert.equal(isReservedPartnerId("pathlynks", reservedIds), true);
  assert.equal(isReservedPartnerId("PathLynks", reservedIds), true, "the exact id is folded");
  for (const id of ["pathlynks-2", "pathlynks-prod", "pathlynksx", "my-pathlynks"]) {
    assert.equal(isReservedPartnerId(id, reservedIds), false, id);
    const added = await addPartner(store, { name: "Other", id }, { pepper: PEPPER, reservedIds });
    const registry = createPartnerRegistry({ store, pepper: PEPPER, nowMs: () => T0, reservedIds });
    assert.equal((await registry.authenticate(added.keys.srv, "srv"))?.partnerId, id, `${id} authenticates per request`);
  }
  // the built-in names do have a family (the contrast the doc line draws)
  assert.equal(isReservedPartnerId("sandbox-2", reservedIds), true);
  const doc = readFileSync(fileURLToPath(new URL("../../../docs/partner-integration.md", import.meta.url)), "utf8");
  assert.match(doc, /pathlynks-2/);
});

// ---------------------------------------------------------------------------
// pc-hardening-2: J4 (ISS-pc-partner-keys-3) and J5 (ISS-pc-partner-keys-6)
// ---------------------------------------------------------------------------

test("J4: two overlapping rotates of the same key scope cannot both report success: the loser's update is refused (compare-and-set on the hash it read), it says to run again and prints no key, and the winner's printed key is the one that authenticates", async () => {
  const w = partnerWorld();
  const { id, pub: original } = await w.add("Race Site", ["https://race.example"], "race-site");
  // Both rotates read the partner (and so the old hash) before either writes: the interleaving of two ops terminals.
  let reads = 0;
  let open!: () => void;
  const bothRead = new Promise<void>((resolve) => (open = resolve));
  const racing: PartnerStore = {
    ...w.store,
    get: async (partnerId) => {
      const doc = await w.store.get(partnerId);
      if (++reads === 2) open();
      await bothRead;
      return doc;
    },
  };
  const rotate = () => runPartnerCli(["rotate", id, "--scope", "pub"], { store: racing, pepper: PEPPER, reservedIds: [], now: () => new Date(T0) });
  const settled = await Promise.allSettled([rotate(), rotate()]);
  const won = settled.filter((s): s is PromiseFulfilledResult<string[]> => s.status === "fulfilled");
  const lost = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  assert.equal(won.length, 1, "exactly one rotate reports success");
  assert.equal(lost.length, 1, "the other one fails visibly");
  const err = lost[0]!.reason as unknown;
  assert.ok(err instanceof PartnerError, String(err));
  assert.equal(err.code, "rotated_concurrently");
  assert.match(err.message, /rotated concurrently, run again/);
  assert.doesNotMatch(String(err.message), ANY_KEY_RE, "the loser prints no key");
  // the winner printed exactly one key, it authenticates, and it is what the store holds; the old key is gone
  const printed = won[0]!.value.join("\n").match(new RegExp(PUB_KEY_RE.source, "g")) ?? [];
  assert.equal(printed.length, 1);
  const fresh = createPartnerRegistry({ store: w.store, pepper: PEPPER, nowMs: () => T0 });
  assert.equal((await fresh.authenticate(printed[0]!, "pub"))?.partnerId, id, "the printed key of the winner authenticates");
  assert.equal(await fresh.authenticate(original, "pub"), undefined, "the original key no longer works");
  assert.equal((await w.store.get(id))!.keys.pub.hash, hashPartnerKey(printed[0]!, PEPPER));
  // running it again (no overlap) works
  const again = await runPartnerCli(["rotate", id, "--scope", "pub"], { store: w.store, pepper: PEPPER, reservedIds: [] });
  assert.match(again.join("\n"), PUB_KEY_RE);
});

test("J4: a rotate of an unknown or vanished partner is still partner_not_found, and overlapping rotates of DIFFERENT scopes both succeed (the K1 guarantee is kept)", async () => {
  const w = partnerWorld();
  const { id } = await w.add("Two Scopes", [], "two-scopes");
  const both = await Promise.all([
    runPartnerCli(["rotate", id, "--scope", "pub"], { store: w.store, pepper: PEPPER, reservedIds: [] }),
    runPartnerCli(["rotate", id, "--scope", "srv"], { store: w.store, pepper: PEPPER, reservedIds: [] }),
  ]);
  assert.match(both[0]!.join("\n"), PUB_KEY_RE);
  assert.match(both[1]!.join("\n"), SRV_KEY_RE);
  await assert.rejects(() => rotatePartner(w.store, "no-such-partner", "pub", { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
  // the partner disappears between the read and the write: not found, not "concurrent"
  let gets = 0;
  const vanishing: PartnerStore = { ...w.store, update: async () => false, get: async (p) => (gets++ === 0 ? w.store.get(p) : null) };
  await assert.rejects(() => rotatePartner(vanishing, id, "pub", { pepper: PEPPER }), (e: unknown) => e instanceof PartnerError && e.code === "partner_not_found");
});

test("J5: the partner CLI's catch-all prints a fixed message plus the error class and code only, never a raw driver message: a mongodb:// URI with a password in the message appears nowhere on stdout or stderr", () => {
  const URI = "mongodb://admin:Sup3rS3cretPw@db.internal.example:27017/virtual_counsellor?authSource=admin";
  const driver = Object.assign(new Error(`getaddrinfo ENOTFOUND db.internal.example (${URI})`), { name: "MongoServerSelectionError", code: "ENOTFOUND" });
  const line = partnerCliFailureLine(driver);
  assert.doesNotMatch(line, /mongodb:\/\/|Sup3rS3cretPw|admin:|db\.internal/);
  assert.match(line, /^partner: failed/);
  assert.match(line, /MongoServerSelectionError/);
  assert.match(line, /ENOTFOUND/);
  // a non-Error and an error with an odd name or code stay a fixed line, and a hostile name cannot smuggle the URI back in
  assert.equal(partnerCliFailureLine("boom"), "partner: failed");
  const sneaky = Object.assign(new Error("x"), { name: URI, code: URI });
  assert.doesNotMatch(partnerCliFailureLine(sneaky), /mongodb:\/\/|Sup3rS3cretPw/);
  // the real script: connectFromEnv rejects a bad MONGO_CLIENT_TIMEOUT_MS and quotes it in its message (no network is touched). Put a URI with a password there.
  const script = fileURLToPath(new URL("../scripts/partner.ts", import.meta.url));
  const run = spawnSync(process.execPath, ["--import", "tsx", script, "list"], {
    encoding: "utf8",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", [PARTNER_PEPPER_ENV]: PEPPER, MONGODB_URL: "mongodb://127.0.0.1:1/virtual_counsellor", MONGO_CLIENT_TIMEOUT_MS: URI },
    timeout: 60_000,
  });
  assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
  const out = `${run.stdout}\n${run.stderr}`;
  assert.doesNotMatch(out, /mongodb:\/\/|Sup3rS3cretPw|admin:|db\.internal/, "no URI, host or password reaches stdout or stderr");
  assert.match(out, /partner: failed/);
});
