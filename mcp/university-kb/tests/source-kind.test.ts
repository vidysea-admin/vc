/**
 * P1/U2 (plan.md U2, spec A22 tagger part + G1). The source-kind tagger: `/sources` `kind`
 * `whatsapp-batch` = whatsapp; seminar and TOC come ONLY from a named sourceId/title list in config;
 * anything else (unlisted recording, document, unknown source, `/sources` unavailable, a listing that
 * conflicts) is `unknown` = restricted (non-quotable paraphrase). Fails closed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SourceKindConfigSchema,
  createSourceKindResolver,
  tagSourceKind,
  type SourceKindConfig,
} from "../src/source-kind.js";
import { createAnonymousKbClient, type KbSourcesResult } from "../src/kb-client.js";
import { startFakeKb } from "./fakeKb.js";
import { readFixture } from "./kb-fixture.js";

const CONFIG: SourceKindConfig = SourceKindConfigSchema.parse({
  internalSeminar: { sourceIds: ["src-sem-1"], titles: ["Study in Germany seminar"] },
  toc: { sourceIds: ["src-toc-1"] },
});
const KINDS = new Map<string, string>([
  ["src-sem-1", "recording"],
  ["src-toc-1", "document"],
  ["src-wa-1", "whatsapp-batch"],
  ["src-rec-9", "recording"],
]);

test("A22 fixtures: whatsapp-batch -> whatsapp, listed seminar -> internal-seminar, listed toc -> toc, unlisted recording -> unknown, no determinable kind -> unknown", () => {
  assert.equal(tagSourceKind({ sourceId: "src-wa-1" }, KINDS, CONFIG), "whatsapp");
  assert.equal(tagSourceKind({ sourceId: "src-sem-1" }, KINDS, CONFIG), "internal-seminar");
  assert.equal(tagSourceKind({ sourceId: "src-toc-1" }, KINDS, CONFIG), "toc");
  assert.equal(tagSourceKind({ sourceId: "src-rec-9" }, KINDS, CONFIG), "unknown");
  assert.equal(tagSourceKind({ sourceId: "src-never-seen" }, KINDS, CONFIG), "unknown");
  assert.equal(tagSourceKind({ sourceId: "" }, KINDS, CONFIG), "unknown");
});

test("hostile: a WhatsApp source listed as seminar by mistake is STILL whatsapp (whatsapp wins)", () => {
  const cfg = SourceKindConfigSchema.parse({ internalSeminar: { sourceIds: ["src-wa-1"] } });
  assert.equal(tagSourceKind({ sourceId: "src-wa-1" }, KINDS, cfg), "whatsapp");
});

test("hostile: a source listed in BOTH seminar and toc is ambiguous -> unknown (fail closed)", () => {
  const cfg = SourceKindConfigSchema.parse({
    internalSeminar: { sourceIds: ["src-rec-9"] },
    toc: { sourceIds: ["src-rec-9"] },
  });
  assert.equal(tagSourceKind({ sourceId: "src-rec-9" }, KINDS, cfg), "unknown");
});

test("title list applies only to a known, non-whatsapp source; an unlisted title never upgrades", () => {
  assert.equal(tagSourceKind({ sourceId: "src-rec-9", title: "Study in Germany seminar" }, KINDS, CONFIG), "internal-seminar");
  assert.equal(tagSourceKind({ sourceId: "src-rec-9", title: "something else" }, KINDS, CONFIG), "unknown");
  // a title match on a source /sources does not know about stays unknown
  assert.equal(tagSourceKind({ sourceId: "src-ghost", title: "Study in Germany seminar" }, KINDS, CONFIG), "unknown");
});

test("hostile: /sources unavailable (null map) makes even a listed seminar unknown", () => {
  assert.equal(tagSourceKind({ sourceId: "src-sem-1" }, null, CONFIG), "unknown");
});

test("default (empty) config: nothing is quotable except by an explicit list; whatsapp is still recognised", () => {
  const empty = SourceKindConfigSchema.parse({});
  assert.equal(tagSourceKind({ sourceId: "src-sem-1" }, KINDS, empty), "unknown");
  assert.equal(tagSourceKind({ sourceId: "src-wa-1" }, KINDS, empty), "whatsapp");
});

test("config schema is strict: an unknown key is rejected rather than ignored", () => {
  assert.throws(() => SourceKindConfigSchema.parse({ seminar: { sourceIds: ["a"] } }));
});

test("resolver fetches /sources ONCE across many tags and keeps only {id, kind} (rows hold path, hash, consent)", async () => {
  let sourcesCalls = 0;
  const server = await startFakeKb((req) => {
    if (req.url === "/sources") {
      sourcesCalls += 1;
      return { status: 200, body: JSON.stringify(readFixture("sources.json")) };
    }
    return { status: 404, body: "{}" };
  });
  try {
    const client = createAnonymousKbClient({ baseUrl: server.url, apiKey: "anon-key" });
    const resolver = createSourceKindResolver({ client, config: CONFIG });
    const kinds = await Promise.all([
      resolver.tag({ sourceId: "src-wa-1" }),
      resolver.tag({ sourceId: "src-sem-1" }),
      resolver.tag({ sourceId: "src-rec-9" }),
    ]);
    assert.deepEqual(kinds, ["whatsapp", "internal-seminar", "unknown"]);
    assert.equal(await resolver.tag({ sourceId: "src-toc-1" }), "toc");
    assert.equal(sourcesCalls, 1, "/sources must be fetched once");
    assert.equal(JSON.stringify(resolver.snapshot()).includes("/private/data"), false);
    assert.deepEqual(resolver.snapshot().find((r) => r.id === "src-wa-1"), { id: "src-wa-1", kind: "whatsapp-batch" });
  } finally {
    await server.close();
  }
});

test("resolver: an unavailable /sources is NOT cached; everything is unknown meanwhile, and a later success is used", async () => {
  let calls = 0;
  const server = await startFakeKb(() => {
    calls += 1;
    return calls === 1
      ? { status: 503, body: "{}" }
      : { status: 200, body: JSON.stringify(readFixture("sources.json")) };
  });
  try {
    const client = createAnonymousKbClient({ baseUrl: server.url, apiKey: "anon-key" });
    const resolver = createSourceKindResolver({ client, config: CONFIG });
    assert.equal(await resolver.tag({ sourceId: "src-sem-1" }), "unknown");
    assert.equal(await resolver.tag({ sourceId: "src-sem-1" }), "internal-seminar");
    assert.equal(calls, 2);
  } finally {
    await server.close();
  }
});

test("resolver tolerates a client that returns unavailable without throwing", async () => {
  const unavailable: KbSourcesResult = { status: "unavailable", reason: "timeout", detail: "x" };
  const resolver = createSourceKindResolver({ client: { sources: async () => unavailable }, config: CONFIG });
  assert.equal(await resolver.tag({ sourceId: "src-wa-1" }), "unknown");
});
