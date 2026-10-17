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
 * P1/U2 (plan.md U2) adds the KnowledgeBase READ tools -- `search_kb` (GET /search), `get_session`
 * (GET /sessions/:id), `kb_gaps` (GET /gaps), `kb_sources` (GET /sources) -- each registered only when
 * the injected client has the method, all returning a typed `status: "ok" | "unavailable"` (an outage is
 * never a thrown tool error and never a fabricated hit). `ask_knowledge_base` now applies the /ask serve
 * rule (`applyServeRule`, kb-client.ts). Hits and sessions are source-kind tagged (source-kind.ts;
 * unknown = restricted). `profile: "anonymous"` registers ONLY `search_kb` and `kb_sources` and needs no
 * Db: the anonymous student route (spec A15c) gets no `/ask`, no session read and no Mongo access.
 *
 * D-007: consumed as TypeScript source (no build step); everything callers
 * need lives in this one file.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Collection, Db, Filter } from "mongodb";
import { z } from "zod";
import { COLLECTION_NAMES } from "@vc/db";
import {
  KbCitationsSchema,
  applyServeRule,
  type KbAskUnavailable,
  type KnowledgeBaseClient,
  type KnowledgeBaseReadClient,
} from "./kb-client.js";
import { createSourceKindResolver, type SourceKindConfig } from "./source-kind.js";

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
  /**
   * An already-scoped `virtual_counsellor` Db; tests inject a fake. Required for the default `"full"`
   * profile (the two course tools read it); the `"anonymous"` profile never touches Mongo and omits it.
   */
  db?: Db;
  /**
   * T-026 (B21 "Knowledge" clause). OPTIONAL -- the two Mongo-backed tools above work with no KB
   * configured at all (ARCHITECTURE.md §6 Q1 stays open; this file's own docstring guarantee of
   * "no LLM calls, no web calls" for `search_courses`/`get_course` is unchanged). When present,
   * `ask_knowledge_base` is additionally registered. Tests inject a fake `KnowledgeBaseClient`.
   * P1/U2: each KB read tool is registered only when the client has the matching read method.
   */
  kb?: Partial<KnowledgeBaseClient> & Partial<KnowledgeBaseReadClient>;
  /** P1/U2: Vidysea-maintained seminar/TOC source lists for the source-kind tagger (default: none listed). */
  sourceKinds?: SourceKindConfig;
  /** P1/U2: `"anonymous"` registers only `search_kb` and `kb_sources` (A15c). Default `"full"`. */
  profile?: "full" | "anonymous";
}

/** Builds the university-kb MCP server. No transport is attached -- the caller connects it. */
export function createUniversityKbServer(deps: UniversityKbServerDeps): McpServer {
  const { kb } = deps;
  const profile = deps.profile ?? "full";
  if (profile === "full" && !deps.db) {
    throw new Error('createUniversityKbServer: `db` is required unless profile is "anonymous"');
  }
  const db = deps.db as Db; // undefined only in the anonymous profile, which never reaches the course tools
  const server = new McpServer({ name: "vc-mcp-university-kb", version: "0.1.0" });

  if (profile === "full") {
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
  }

  if (kb) {
    const kbClient = kb; // a fresh const so the nested tool handlers keep the non-undefined type

    if (profile === "full" && kbClient.ask) {
      const ask = kbClient.ask.bind(kbClient);
      server.registerTool(
        "ask_knowledge_base",
        {
          title: "Ask the KnowledgeBase",
          description:
            "Calls the sibling KnowledgeBase's live POST /ask endpoint (contract B21) for university/seminar " +
            "knowledge beyond what is already stored locally. SERVE RULE (P1 spec scope item 3): an answer is " +
            "served (status \"answered\") ONLY when verdict is \"correct\", insufficient_coverage is false, " +
            "web_used is false and at least one internal source exists; anything else is status " +
            "\"no_sourced_answer\" with the fixed no-answer text and no generated answer, no reason text and " +
            "no citations. Web sources never reach the response. A KB outage (timeout, network error, HTTP " +
            "5xx, HTTP 401/403, a malformed/schema-invalid response, or an answer with zero citations) is " +
            "status \"unavailable\" with the same fixed text -- never a fabricated answer. Internal citations " +
            "of a served answer are carried through verbatim (B2).",
          inputSchema: {
            query: z.string().min(1),
          },
          outputSchema: {
            status: z.enum(["answered", "no_sourced_answer", "unavailable"]),
            answer: z.string(),
            citations: KbCitationsSchema,
            verdict: z.string(),
            reason: z.string(),
            withheld: z.array(z.string()).optional(),
            unavailableReason: z.string().optional(),
            detail: z.string().optional(),
          },
        },
        async ({ query }) => {
          const served = applyServeRule(await ask(query));
          return {
            content: [{ type: "text" as const, text: served.answer }],
            structuredContent: { ...served },
          };
        },
      );
    }

    // -----------------------------------------------------------------------
    // P1/U2 read tools. Each is registered only when the client has the method, returns a typed
    // `status`, and never echoes the query into its text content (anonymous turns carry user text in q).
    // -----------------------------------------------------------------------
    const unavailableShape = {
      unavailableReason: z.string().optional(),
      detail: z.string().optional(),
    };
    const unavailable = (r: KbAskUnavailable, tool: string) => ({
      content: [{ type: "text" as const, text: `${tool}: knowledge unavailable (${r.reason})` }],
      structuredContent: { status: "unavailable" as const, unavailableReason: r.reason, detail: r.detail },
    });

    const readSources = kbClient.sources?.bind(kbClient);
    const resolver = readSources
      ? createSourceKindResolver({ client: { sources: readSources }, config: deps.sourceKinds })
      : null;
    const kindOf = async (subject: { sourceId: string; title?: string }) =>
      resolver ? resolver.tag(subject) : ("unknown" as const);

    if (kbClient.search) {
      const search = kbClient.search.bind(kbClient);
      server.registerTool(
        "search_kb",
        {
          title: "Search the KnowledgeBase",
          description:
            "GET /search over KnowledgeBase transcript turns. Each hit carries its inline turn text, session " +
            "date and sourceId (so a claim can be checked against it without another call) and a sourceKind " +
            "(internal-seminar | toc | whatsapp | unknown; unknown = restricted, non-quotable). A hit whose " +
            "turn or session is missing is dropped and counted in `dropped`. An outage is status " +
            "\"unavailable\", never a thrown error.",
          inputSchema: {
            query: z.string().min(1).max(1000),
            k: z.number().int().min(1).max(50).optional(),
          },
          outputSchema: {
            status: z.enum(["ok", "unavailable"]),
            hits: z
              .array(
                z.object({
                  turnId: z.string(),
                  sessionId: z.string(),
                  score: z.number(),
                  text: z.string(),
                  speakerLabel: z.string().optional(),
                  occurredAt: z.string().optional(),
                  sessionDate: z.string(),
                  sessionTitle: z.string().optional(),
                  sourceId: z.string(),
                  sourceKind: z.enum(["internal-seminar", "toc", "whatsapp", "unknown"]),
                }),
              )
              .optional(),
            dropped: z.number().int().nonnegative().optional(),
            ...unavailableShape,
          },
        },
        async ({ query, k }) => {
          const result = await search(query, k);
          if (result.status !== "ok") return unavailable(result, "search_kb");
          const hits = await Promise.all(
            result.hits.map(async (h) => ({
              turnId: h.turnId,
              sessionId: h.sessionId,
              score: h.score,
              text: h.turn.text,
              ...(h.turn.speakerLabel !== undefined ? { speakerLabel: h.turn.speakerLabel } : {}),
              ...(h.turn.occurredAt !== undefined ? { occurredAt: h.turn.occurredAt } : {}),
              sessionDate: h.session.date,
              ...(h.session.title !== undefined ? { sessionTitle: h.session.title } : {}),
              sourceId: h.session.sourceId,
              sourceKind: await kindOf({ sourceId: h.session.sourceId, title: h.session.title }),
            })),
          );
          return {
            content: [{ type: "text" as const, text: `search_kb: ${hits.length} hit(s) (${result.dropped} dropped).` }],
            structuredContent: { status: "ok" as const, hits, dropped: result.dropped },
          };
        },
      );
    }

    if (profile === "full" && kbClient.getSession) {
      const getSession = kbClient.getSession.bind(kbClient);
      server.registerTool(
        "get_session",
        {
          title: "Get a KnowledgeBase session",
          description:
            "GET /sessions/:id: the session (date, sourceId, title) and its turns, used to check that a cited " +
            "turn's text supports a claim. A session that cannot be re-read (404) is status \"unavailable\" " +
            "with reason not_found and must never be served as sourced.",
          inputSchema: {
            sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
          },
          outputSchema: {
            status: z.enum(["ok", "unavailable"]),
            session: z
              .object({ id: z.string(), title: z.string().optional(), date: z.string(), sourceId: z.string() })
              .optional(),
            sourceKind: z.enum(["internal-seminar", "toc", "whatsapp", "unknown"]).optional(),
            turns: z
              .array(
                z.object({
                  turnId: z.string(),
                  text: z.string(),
                  speakerLabel: z.string().optional(),
                  tStart: z.number().optional(),
                  tEnd: z.number().optional(),
                  occurredAt: z.string().optional(),
                }),
              )
              .optional(),
            dropped: z.number().int().nonnegative().optional(),
            ...unavailableShape,
          },
        },
        async ({ sessionId }) => {
          const result = await getSession(sessionId);
          if (result.status !== "ok") return unavailable(result, "get_session");
          const turns = result.turns.map((t) => ({
            turnId: t._id,
            text: t.text,
            ...(t.speakerLabel !== undefined ? { speakerLabel: t.speakerLabel } : {}),
            ...(t.tStart !== undefined ? { tStart: t.tStart } : {}),
            ...(t.tEnd !== undefined ? { tEnd: t.tEnd } : {}),
            ...(t.occurredAt !== undefined ? { occurredAt: t.occurredAt } : {}),
          }));
          return {
            content: [{ type: "text" as const, text: `get_session: ${turns.length} turn(s).` }],
            structuredContent: {
              status: "ok" as const,
              session: result.session,
              sourceKind: await kindOf({ sourceId: result.session.sourceId, title: result.session.title }),
              turns,
              dropped: result.dropped,
            },
          };
        },
      );
    }

    if (profile === "full" && kbClient.gaps) {
      const gaps = kbClient.gaps.bind(kbClient);
      server.registerTool(
        "kb_gaps",
        {
          title: "KnowledgeBase knowledge-health gaps",
          description: "GET /gaps: standing-ask rows (kind, status, description, requestedAt, dueAt). Who the ask went to is not returned.",
          inputSchema: {},
          outputSchema: {
            status: z.enum(["ok", "unavailable"]),
            gaps: z
              .array(
                z.object({
                  id: z.string(),
                  kind: z.string(),
                  status: z.string(),
                  description: z.string().optional(),
                  requestedAt: z.string().optional(),
                  dueAt: z.string().optional(),
                }),
              )
              .optional(),
            dropped: z.number().int().nonnegative().optional(),
            ...unavailableShape,
          },
        },
        async () => {
          const result = await gaps();
          if (result.status !== "ok") return unavailable(result, "kb_gaps");
          return {
            content: [{ type: "text" as const, text: `kb_gaps: ${result.gaps.length} gap(s).` }],
            structuredContent: { status: "ok" as const, gaps: result.gaps, dropped: result.dropped },
          };
        },
      );
    }

    if (readSources) {
      server.registerTool(
        "kb_sources",
        {
          title: "KnowledgeBase sources (id and kind only)",
          description:
            "GET /sources reduced to { id, kind }. Path, hash and consent are never returned or kept. Used for " +
            "source-kind tagging (whatsapp-batch = WhatsApp); safe for anonymous turns (no user text sent).",
          inputSchema: {},
          outputSchema: {
            status: z.enum(["ok", "unavailable"]),
            sources: z.array(z.object({ id: z.string(), kind: z.string() })).optional(),
            dropped: z.number().int().nonnegative().optional(),
            ...unavailableShape,
          },
        },
        async () => {
          const result = await readSources();
          if (result.status !== "ok") return unavailable(result, "kb_sources");
          return {
            content: [{ type: "text" as const, text: `kb_sources: ${result.sources.length} source(s).` }],
            structuredContent: { status: "ok" as const, sources: result.sources, dropped: result.dropped },
          };
        },
      );
    }
  }

  return server;
}
