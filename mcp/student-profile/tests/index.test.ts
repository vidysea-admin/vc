import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStudentProfileServer } from "../src/index.js";
import { createFakeDb, type FakeDb } from "./fakes.js";

interface ConsentRow {
  _id: string;
  studentId: string;
  guardianConsent: boolean;
  purposes: string[];
  recordedAt: string;
  minor: boolean;
}

interface FactRow {
  _id: string;
  studentId: string;
  key: string;
  value: unknown;
  source: { type: "student-direct"; id: string };
  confidence: number;
  validFrom: string;
  validTo?: string;
  purposeTags: string[];
  sensitivity: "low" | "medium" | "high";
}

function seedConsent(fakeDb: FakeDb, row: ConsentRow): void {
  fakeDb.collection<ConsentRow>("consents").seed(row);
}

function seedFact(fakeDb: FakeDb, row: FactRow): void {
  fakeDb.collection<FactRow>("facts").seed(row);
}

/** Connects a real MCP Client to `server` over the SDK's in-memory linked transport pair -- calls go through the actual registered handlers, not a direct function call. */
async function connectedClient(server: McpServer): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join(" ");
}

test("tool registered and callable through MCP: both tools appear in tools/list", async () => {
  const { db } = createFakeDb();
  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["get_profile_facts", "propose_profile_diff"]);
  } finally {
    await cleanup();
  }
});

test("B4 consent required: get_profile_facts with no consent row returns a tool error and zero facts", async () => {
  const { db } = createFakeDb();
  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "get_profile_facts",
      arguments: { studentId: "no-consent-student", purpose: "counselling_session" },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result as any), /ConsentRequiredError|no valid recorded consent/);
    assert.equal((result as any).structuredContent, undefined);
  } finally {
    await cleanup();
  }
});

test("purpose filter: only facts whose purposeTags include the requested purpose come back, superseded facts excluded", async () => {
  const { fakeDb, db } = createFakeDb();
  seedConsent(fakeDb, {
    _id: "c1",
    studentId: "s1",
    guardianConsent: true,
    purposes: ["counselling_session", "profile_synthesis"],
    recordedAt: "2026-09-25T00:00:00.000Z",
    minor: true,
  });
  seedFact(fakeDb, {
    _id: "f1",
    studentId: "s1",
    key: "targetCountry",
    value: "Canada",
    source: { type: "student-direct", id: "answer-1" },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling_session"],
    sensitivity: "low",
  });
  // Different purpose -- must NOT leak into a counselling_session query.
  seedFact(fakeDb, {
    _id: "f2",
    studentId: "s1",
    key: "applicationBudget",
    value: 20000,
    source: { type: "student-direct", id: "answer-2" },
    confidence: 0.8,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["application_filling"],
    sensitivity: "medium",
  });
  // Superseded fact (has validTo) -- must be excluded even though the purpose matches.
  seedFact(fakeDb, {
    _id: "f3",
    studentId: "s1",
    key: "targetCountry",
    value: "USA",
    source: { type: "student-direct", id: "answer-0" },
    confidence: 0.7,
    validFrom: "2026-09-24T00:00:00.000Z",
    validTo: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling_session"],
    sensitivity: "low",
  });
  // Different student entirely -- must never leak across studentId.
  seedFact(fakeDb, {
    _id: "f4",
    studentId: "s2",
    key: "targetCountry",
    value: "UK",
    source: { type: "student-direct", id: "answer-3" },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling_session"],
    sensitivity: "low",
  });

  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "get_profile_facts",
      arguments: { studentId: "s1", purpose: "counselling_session" },
    });
    assert.notEqual(result.isError, true);
    const facts = (result.structuredContent as { facts: Array<{ key: string; value: unknown }> }).facts;
    assert.equal(facts.length, 1);
    assert.equal(facts[0].key, "targetCountry");
    assert.equal(facts[0].value, "Canada");
  } finally {
    await cleanup();
  }
});

test("B3 propose_profile_diff writes nothing: the facts collection is unchanged after the call, read back directly", async () => {
  const { fakeDb, db } = createFakeDb();
  seedFact(fakeDb, {
    _id: "f1",
    studentId: "s1",
    key: "targetCountry",
    value: "Canada",
    source: { type: "student-direct", id: "answer-1" },
    confidence: 0.9,
    validFrom: "2026-09-25T00:00:00.000Z",
    purposeTags: ["counselling_session"],
    sensitivity: "low",
  });
  const before = fakeDb.collection<FactRow>("facts").all();
  assert.equal(before.length, 1);

  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "propose_profile_diff",
      arguments: {
        studentId: "s1",
        candidateFacts: [
          {
            key: "targetCountry",
            value: "Germany", // differs from the stored "Canada" -> should produce an "update" change
            source: { type: "student-direct", id: "answer-2" },
            confidence: 0.85,
            validFrom: "2026-09-25T01:00:00.000Z",
            purposeTags: ["counselling_session"],
            sensitivity: "low",
          },
          {
            key: "budget",
            value: 15000, // new key -> should produce an "add" change
            source: { type: "student-direct", id: "answer-3" },
            confidence: 0.8,
            validFrom: "2026-09-25T01:00:00.000Z",
            purposeTags: ["counselling_session"],
            sensitivity: "medium",
          },
        ],
      },
    });
    assert.notEqual(result.isError, true);
    const diff = (result.structuredContent as { diff: { changes: Array<{ op: string; key: string }> } }).diff;
    assert.equal(diff.changes.length, 2);
    assert.deepEqual(
      diff.changes.map((c) => c.op).sort(),
      ["add", "update"],
    );

    // The one and only assertion that matters for B3: read the fake collection
    // back directly (not through the tool) and prove it is byte-for-byte the
    // same as before the call -- propose_profile_diff wrote nothing.
    const after = fakeDb.collection<FactRow>("facts").all();
    assert.deepEqual(after, before);
  } finally {
    await cleanup();
  }
});

test("hostile: purpose not in the enum is rejected by Zod before any DB read", async () => {
  const { db } = createFakeDb();
  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "get_profile_facts",
      arguments: { studentId: "s1", purpose: "not_a_real_purpose" },
    });
    assert.equal(result.isError, true);
    // Specifically the SDK's Zod input-validation error, not some other tool
    // error (e.g. a downstream ConsentRequiredError) that happens to also set
    // isError -- this is what makes the isolating falsification below valid.
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});

test("hostile: a NoSQL-operator object as studentId ({\"$ne\": null}) is rejected by Zod, not passed to the DB", async () => {
  const { db } = createFakeDb();
  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "get_profile_facts",
      arguments: { studentId: { $ne: null }, purpose: "counselling_session" },
    });
    assert.equal(result.isError, true);
    // Same reasoning as above: must be Zod's own input-validation error, not
    // ConsentRequiredError (which a broken/absent type guard would still
    // reach and would also set isError -- see the falsification row).
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});

test("hostile: an uncited candidate fact in propose_profile_diff is rejected by Zod (FactSchema requires source)", async () => {
  const { db } = createFakeDb();
  const server = createStudentProfileServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "propose_profile_diff",
      arguments: {
        studentId: "s1",
        candidateFacts: [{ key: "targetCountry", value: "Canada", confidence: 0.9, validFrom: "2026-09-25T00:00:00.000Z", purposeTags: ["x"], sensitivity: "low" }],
      },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});
