/**
 * University Knowledge Base MCP server (ARCHITECTURE.md H5/D-005 §5/§6 Q1, contract B2).
 *
 * ARCHITECTURE §6 Q1 is an OPEN QUESTION: whether the KB is seeded here from
 * scratch or from D:/KnowledgeBase / global_university_db is undecided. Until
 * that lands, this server serves ONLY what already exists in the
 * `virtual_counsellor` `universities`/`courses` collections -- no LLM calls,
 * no web calls, no invented records. `packages/db` deliberately exposes no
 * accessor for these two collections yet (they are "owned by the
 * university-kb unit" per packages/db/src/collections.ts); this package
 * reaches them via the shared `COLLECTION_NAMES` constant and `db.collection`
 * on the already `virtual_counsellor`-scoped `Db` -- the same pattern
 * packages/db/src/collections.ts itself uses. It never opens a database
 * handle off the raw driver itself (B12's repo-wide scan test confines that
 * call to packages/db/src/client.ts and covers mcp/** too).
 *
 * Every returned course record MUST carry `sourceUrl` and `fetchedAt` (B2). A
 * stored record missing either is excluded from the result and counted in
 * `dropped`, never invented or silently coerced.
 *
 * D-007: consumed as TypeScript source (no build step); everything callers
 * need lives in this one file.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Collection, Db, Filter } from "mongodb";
import { z } from "zod";
import { COLLECTION_NAMES } from "@vc/db";

// ---------------------------------------------------------------------------
// Course shape -- local to this unit (ARCHITECTURE Q1 leaves the KB shape
// open; this is the minimal shape B2 requires plus the fields search_courses/
// get_course need). sourceUrl/fetchedAt are REQUIRED so a record missing
// either fails safeParse and is dropped rather than served uncited.
// ---------------------------------------------------------------------------
export const CourseLevelSchema = z.enum(["undergraduate", "postgraduate", "diploma", "doctoral"]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

export const CourseDocSchema = z.object({
  courseId: z.string().min(1),
  universityId: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1).optional(),
  level: CourseLevelSchema.optional(),
  sourceUrl: z.string().min(1),
  fetchedAt: z.string().datetime(),
});
export type CourseDoc = z.infer<typeof CourseDocSchema>;

/** The raw shape as stored -- includes Mongo's own `_id`, which CourseDocSchema strips on parse. */
type StoredCourseDoc = CourseDoc & { _id: string };

function coursesCollection(db: Db): Collection<StoredCourseDoc> {
  return db.collection<StoredCourseDoc>(COLLECTION_NAMES.courses);
}

export interface UniversityKbServerDeps {
  /** An already-scoped `virtual_counsellor` Db; tests inject a fake. */
  db: Db;
}

/** Builds the university-kb MCP server. No transport is attached -- the caller connects it. */
export function createUniversityKbServer(deps: UniversityKbServerDeps): McpServer {
  const { db } = deps;
  const server = new McpServer({ name: "vc-mcp-university-kb", version: "0.1.0" });

  server.registerTool(
    "search_courses",
    {
      title: "Search courses",
      description:
        "Case-insensitive substring search over course names in the `courses` collection, with optional " +
        "country/level filters. No LLM, no web calls -- serves only what is already stored. Every returned " +
        "record carries sourceUrl + fetchedAt (B2); a stored record missing either is excluded and counted " +
        "in `dropped` rather than invented or served uncited.",
      inputSchema: {
        query: z.string().min(1),
        country: z.string().min(1).optional(),
        level: CourseLevelSchema.optional(),
      },
      outputSchema: {
        courses: z.array(CourseDocSchema),
        dropped: z.number().int().nonnegative(),
      },
    },
    async ({ query, country, level }) => {
      const filter: Filter<StoredCourseDoc> = {};
      if (country) filter.country = country;
      if (level) filter.level = level;

      const rawDocs = await coursesCollection(db).find(filter).toArray();
      const needle = query.toLowerCase();
      const nameMatched = rawDocs.filter(
        (doc) => typeof doc.name === "string" && doc.name.toLowerCase().includes(needle),
      );

      const courses: CourseDoc[] = [];
      let dropped = 0;
      for (const doc of nameMatched) {
        const parsed = CourseDocSchema.safeParse(doc);
        if (parsed.success) {
          courses.push(parsed.data);
        } else {
          dropped += 1; // B2: uncited (or otherwise malformed) records are dropped, not served
        }
      }

      return {
        content: [
          { type: "text" as const, text: `Found ${courses.length} course(s) for "${query}" (${dropped} dropped).` },
        ],
        structuredContent: { courses, dropped },
      };
    },
  );

  server.registerTool(
    "get_course",
    {
      title: "Get course",
      description:
        "Returns a single course by courseId. Not found, or found but missing sourceUrl/fetchedAt, is a tool " +
        "error (B2) -- never a fabricated or partial record.",
      inputSchema: {
        courseId: z.string().min(1),
      },
      outputSchema: {
        course: CourseDocSchema,
      },
    },
    async ({ courseId }) => {
      const raw = await coursesCollection(db).findOne({ courseId });
      if (!raw) {
        throw new Error(`get_course: no course found for courseId "${courseId}"`);
      }
      const parsed = CourseDocSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `get_course: course "${courseId}" is missing sourceUrl/fetchedAt or otherwise fails validation ` +
            `and cannot be returned uncited (contract B2)`,
        );
      }
      return {
        content: [{ type: "text" as const, text: `get_course: "${courseId}" -> "${parsed.data.name}"` }],
        structuredContent: { course: parsed.data },
      };
    },
  );

  return server;
}
