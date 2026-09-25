import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createUniversityKbServer } from "../src/index.js";
import { createFakeDb, type FakeDb } from "./fakes.js";

interface CourseRow {
  _id: string;
  courseId: string;
  universityId: string;
  name: string;
  country?: string;
  level?: string;
  sourceUrl?: string;
  fetchedAt?: string;
}

function seedCourse(fakeDb: FakeDb, row: CourseRow): void {
  fakeDb.collection<CourseRow>("courses").seed(row);
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((c) => c.text ?? "").join(" ");
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

test("tool registered and callable through MCP: both tools appear in tools/list", async () => {
  const { db } = createFakeDb();
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["get_course", "search_courses"]);
  } finally {
    await cleanup();
  }
});

test("uncited course excluded: search_courses drops a stored record missing sourceUrl/fetchedAt and counts it in `dropped`", async () => {
  const { fakeDb, db } = createFakeDb();
  seedCourse(fakeDb, {
    _id: "c1",
    courseId: "course-1",
    universityId: "uni-1",
    name: "BSc Computer Science",
    country: "Canada",
    level: "undergraduate",
    sourceUrl: "https://example.edu/cs",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });
  // Missing sourceUrl -- must be excluded, not invented.
  seedCourse(fakeDb, {
    _id: "c2",
    courseId: "course-2",
    universityId: "uni-1",
    name: "BSc Computer Engineering",
    country: "Canada",
    level: "undergraduate",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });
  // Missing fetchedAt -- must be excluded, not invented.
  seedCourse(fakeDb, {
    _id: "c3",
    courseId: "course-3",
    universityId: "uni-1",
    name: "MSc Computer Science",
    country: "Canada",
    level: "postgraduate",
    sourceUrl: "https://example.edu/mcs",
  });

  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "search_courses",
      arguments: { query: "computer" },
    });
    assert.notEqual(result.isError, true);
    const { courses, dropped } = result.structuredContent as {
      courses: Array<{ courseId: string }>;
      dropped: number;
    };
    assert.equal(courses.length, 1);
    assert.equal(courses[0].courseId, "course-1");
    assert.equal(dropped, 2);
  } finally {
    await cleanup();
  }
});

test("search_courses filters by country and level and is case-insensitive", async () => {
  const { fakeDb, db } = createFakeDb();
  seedCourse(fakeDb, {
    _id: "c1",
    courseId: "course-1",
    universityId: "uni-1",
    name: "MSc Data Science",
    country: "Canada",
    level: "postgraduate",
    sourceUrl: "https://example.edu/mds",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });
  seedCourse(fakeDb, {
    _id: "c2",
    courseId: "course-2",
    universityId: "uni-2",
    name: "MSc Data Science",
    country: "UK",
    level: "postgraduate",
    sourceUrl: "https://example.edu/uk-mds",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });

  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "search_courses",
      arguments: { query: "DATA science", country: "Canada" },
    });
    const { courses } = result.structuredContent as { courses: Array<{ courseId: string }> };
    assert.equal(courses.length, 1);
    assert.equal(courses[0].courseId, "course-1");
  } finally {
    await cleanup();
  }
});

test("get_course returns the record for a known courseId", async () => {
  const { fakeDb, db } = createFakeDb();
  seedCourse(fakeDb, {
    _id: "c1",
    courseId: "course-1",
    universityId: "uni-1",
    name: "BSc Computer Science",
    country: "Canada",
    level: "undergraduate",
    sourceUrl: "https://example.edu/cs",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });

  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({ name: "get_course", arguments: { courseId: "course-1" } });
    assert.notEqual(result.isError, true);
    const { course } = result.structuredContent as { course: { name: string } };
    assert.equal(course.name, "BSc Computer Science");
  } finally {
    await cleanup();
  }
});

test("unknown courseId: get_course returns a not-found tool error, never a fabricated record", async () => {
  const { db } = createFakeDb();
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({ name: "get_course", arguments: { courseId: "does-not-exist" } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
  } finally {
    await cleanup();
  }
});

test("get_course on a stored-but-uncited record (missing sourceUrl) is also a tool error, not a partial record", async () => {
  const { fakeDb, db } = createFakeDb();
  seedCourse(fakeDb, {
    _id: "c2",
    courseId: "course-2",
    universityId: "uni-1",
    name: "BSc Computer Engineering",
    fetchedAt: "2026-09-25T00:00:00.000Z",
  });
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({ name: "get_course", arguments: { courseId: "course-2" } });
    assert.equal(result.isError, true);
  } finally {
    await cleanup();
  }
});

test("hostile: empty query is rejected by Zod (min length 1)", async () => {
  const { db } = createFakeDb();
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({ name: "search_courses", arguments: { query: "" } });
    assert.equal(result.isError, true);
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});

test("hostile: a NoSQL-operator object as courseId ({\"$ne\": null}) is rejected by Zod, not passed to the DB", async () => {
  const { db } = createFakeDb();
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({ name: "get_course", arguments: { courseId: { $ne: null } } });
    assert.equal(result.isError, true);
    // Specifically the SDK's Zod input-validation error, not the tool's own
    // "no course found" error, which a broken/absent type guard would still
    // reach (the fake's findOne returns null for a filter it can't match) and
    // would also set isError -- this is what makes the falsification below valid.
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});

test("hostile: level not in the enum is rejected by Zod", async () => {
  const { db } = createFakeDb();
  const server = createUniversityKbServer({ db });
  const { client, cleanup } = await connectedClient(server);
  try {
    const result = await client.callTool({
      name: "search_courses",
      arguments: { query: "science", level: "phd-but-not-really" },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result as any), /Input validation error/);
  } finally {
    await cleanup();
  }
});
