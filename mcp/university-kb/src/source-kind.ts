/**
 * Source-kind tagger (P1/U2; spec A22 and gap G1; decision D-088 Q9).
 *
 * Every answer claim is tagged with where its text came from, so the student graph can keep
 * WhatsApp-derived material paraphrase-only. The mapping rule (spec A22):
 *   - KB `/sources` `kind: "whatsapp-batch"`  ->  `whatsapp`.
 *   - Seminar and TOC material has no `kind`; it is recognised ONLY by a named sourceId/title list in
 *     VC config (`source-kinds.json`, maintained by Vidysea). Nothing here invents a list.
 *   - Anything else is `unknown` = restricted (non-quotable paraphrase): an unlisted recording, a
 *     document or URL source, a source `/sources` does not know, a source listed as both seminar and
 *     TOC, or `/sources` being unavailable. Fails closed; WhatsApp always wins over a config listing.
 *
 * `/sources` rows hold path, hash and consent; only `{id, kind}` is kept, in memory, and nothing here
 * logs anything.
 */
import { z } from "zod";
import type { SearchHit, StudentKbPort } from "@vc/engine";
import {
  applyServeRule,
  type KbAskResult,
  type KbSearchHit,
  type KbSearchResult,
  type KbSessionResult,
  type KbSessionTurn,
  type KbSourceKindRow,
  type KbSourcesResult,
} from "./kb-client.js";

export type SourceKind = "internal-seminar" | "toc" | "whatsapp" | "unknown";

const NamedList = z
  .object({
    sourceIds: z.array(z.string().min(1)).default([]),
    titles: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .default({});

/** Strict: an unrecognised key is rejected rather than silently ignored (a typo must not widen quotability). */
export const SourceKindConfigSchema = z
  .object({
    internalSeminar: NamedList,
    toc: NamedList,
  })
  .strict();
export type SourceKindConfig = z.infer<typeof SourceKindConfigSchema>;

/** Empty config: no seminar or TOC source is recognised, so only WhatsApp is distinguished from `unknown`. */
export const EMPTY_SOURCE_KIND_CONFIG: SourceKindConfig = SourceKindConfigSchema.parse({});

export interface SourceKindSubject {
  sourceId: string;
  title?: string;
}

function listed(list: { sourceIds: string[]; titles: string[] }, subject: SourceKindSubject): boolean {
  if (list.sourceIds.includes(subject.sourceId)) return true;
  return subject.title !== undefined && list.titles.includes(subject.title);
}

/**
 * Pure tagger. `kindsById` is the `/sources` `{id -> kind}` map, or `null` when `/sources` could not
 * be read (then nothing can be vouched for and everything is `unknown`).
 */
export function tagSourceKind(
  subject: SourceKindSubject,
  kindsById: ReadonlyMap<string, string> | null,
  config: SourceKindConfig = EMPTY_SOURCE_KIND_CONFIG,
): SourceKind {
  if (!kindsById || subject.sourceId === "") return "unknown";
  const kind = kindsById.get(subject.sourceId);
  if (kind === undefined) return "unknown";
  if (kind === "whatsapp-batch") return "whatsapp";
  const seminar = listed(config.internalSeminar, subject);
  const toc = listed(config.toc, subject);
  if (seminar && toc) return "unknown";
  if (seminar) return "internal-seminar";
  if (toc) return "toc";
  return "unknown";
}

export interface SourceKindResolver {
  tag(subject: SourceKindSubject): Promise<SourceKind>;
  /** The `{id, kind}` rows currently held in memory (empty until a fetch succeeded). */
  snapshot(): KbSourceKindRow[];
}

/**
 * Fetches `/sources` once (concurrent callers share the in-flight request) and keeps only
 * `{id, kind}`. An unavailable `/sources` is not cached: every tag is `unknown` until a later
 * attempt succeeds.
 */
export function createSourceKindResolver(deps: {
  client: { sources(): Promise<KbSourcesResult> };
  config?: SourceKindConfig;
}): SourceKindResolver {
  const config = deps.config ?? EMPTY_SOURCE_KIND_CONFIG;
  let kinds: Map<string, string> | null = null;
  let inflight: Promise<Map<string, string> | null> | null = null;

  async function load(): Promise<Map<string, string> | null> {
    if (kinds) return kinds;
    inflight ??= (async () => {
      try {
        const result = await deps.client.sources();
        if (result.status !== "ok") return null;
        kinds = new Map(result.sources.map((row) => [row.id, row.kind]));
        return kinds;
      } catch {
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async tag(subject) {
      return tagSourceKind(subject, await load(), config);
    },
    snapshot() {
      return kinds ? [...kinds].map(([id, kind]) => ({ id, kind })) : [];
    },
  };
}

// ---------------------------------------------------------------------------
// The KnowledgeBase -> student-graph mapping (golive-launcher). ONE place: the MCP `search_kb` / `get_session`
// handlers (index.ts) and the in-process `StudentKbPort` the API launcher builds (createStudentKbPort) both call
// these, so a hit is source-kind tagged and speaker-label-gated identically on every path.
// ---------------------------------------------------------------------------

/** A speaker label is a person's name: only seminar/toc material may carry it (WhatsApp / unknown never). */
export const labelAllowed = (kind: SourceKind): boolean => kind === "internal-seminar" || kind === "toc";

/** Tags one KB subject (a hit's or session's source). Unknown = restricted. */
export type SourceKindOf = (subject: SourceKindSubject) => Promise<SourceKind>;

/** Maps raw KB /search hits to the student graph's `SearchHit`s (source-kind tagged, label-gated). */
export async function mapSearchHits(hits: readonly KbSearchHit[], kindOf: SourceKindOf): Promise<SearchHit[]> {
  return Promise.all(
    hits.map(async (h) => {
      const sourceKind = await kindOf({ sourceId: h.session.sourceId, title: h.session.title });
      return {
        turnId: h.turnId,
        sessionId: h.sessionId,
        score: h.score,
        text: h.turn.text,
        ...(h.turn.speakerLabel !== undefined && labelAllowed(sourceKind) ? { speakerLabel: h.turn.speakerLabel } : {}),
        ...(h.turn.occurredAt !== undefined ? { occurredAt: h.turn.occurredAt } : {}),
        sessionDate: h.session.date,
        ...(h.session.title !== undefined ? { sessionTitle: h.session.title } : {}),
        sourceId: h.session.sourceId,
        sourceKind,
      };
    }),
  );
}

/** Maps a raw KB session's turns (label-gated by the session's source kind). */
export function mapSessionTurns(
  turns: readonly KbSessionTurn[],
  sourceKind: SourceKind,
): { turnId: string; text: string; speakerLabel?: string; tStart?: number; tEnd?: number; occurredAt?: string }[] {
  return turns.map((t) => ({
    turnId: t._id,
    text: t.text,
    ...(t.speakerLabel !== undefined && labelAllowed(sourceKind) ? { speakerLabel: t.speakerLabel } : {}),
    ...(t.tStart !== undefined ? { tStart: t.tStart } : {}),
    ...(t.tEnd !== undefined ? { tEnd: t.tEnd } : {}),
    ...(t.occurredAt !== undefined ? { occurredAt: t.occurredAt } : {}),
  }));
}

/** What a KB client must offer to back a port: search always; ask / getSession / sources when present. */
export interface StudentKbPortClient {
  search(query: string, k?: number): Promise<KbSearchResult>;
  /** Optional vectorless `GET /route?q=&k=`, same hit shape as `search`. Only tried when the port's route flag is on. */
  route?(query: string, k?: number): Promise<KbSearchResult>;
  sources?(): Promise<KbSourcesResult>;
  ask?(query: string): Promise<KbAskResult>;
  getSession?(sessionId: string): Promise<KbSessionResult>;
}

/** T-057: the student graph keeps at most 5 hits, so `/search` is asked for 5 (the default k returned 240-290 KB bodies). */
export const STUDENT_SEARCH_K = 5;

/**
 * Builds the in-process `StudentKbPort` from a KB client. `searchKb` is always there; `askKnowledgeBase` only when the
 * client can ask (the anonymous client cannot, so an anonymous port is structurally search-only) and `getSession` only
 * when it can read a session. `/ask` goes through `applyServeRule`; a served answer is marked
 * `insufficient_coverage: false` because the serve rule has just proven it (the engine's `isServedAsk` requires the
 * field to be explicitly false). An outage is `status: "unavailable"`, never a thrown error.
 */
export function createStudentKbPort(deps: {
  client: StudentKbPortClient;
  sourceKinds?: SourceKindConfig;
  /** Route-first retrieval; default is env `VC_KB_ROUTE === "1"` (OFF when unset). */
  routeEnabled?: boolean;
}): StudentKbPort {
  const { client } = deps;
  const routeEnabled = deps.routeEnabled ?? (typeof process !== "undefined" && process.env.VC_KB_ROUTE?.trim() === "1");
  const read = client.sources?.bind(client);
  const resolver = read ? createSourceKindResolver({ client: { sources: read }, config: deps.sourceKinds }) : null;
  const kindOf: SourceKindOf = async (subject) => (resolver ? resolver.tag(subject) : "unknown");
  const port: StudentKbPort = {
    async searchKb(query) {
      // Route-first (flag on): the vectorless /route returns the same hit shape, parsed and validated by the same hit parser as
      // /search inside the client. Any route failure (404/405/501, timeout, breaker open, bad body) or an empty route result
      // (design 5.7: lexical /search stays the fallback on empty routing) falls back to /search.
      let result: KbSearchResult | undefined;
      if (routeEnabled && client.route) {
        const routed = await client.route(query, STUDENT_SEARCH_K);
        if (routed.status === "ok" && routed.hits.length > 0) result = routed;
      }
      result ??= await client.search(query, STUDENT_SEARCH_K);
      if (result.status !== "ok") return { status: "unavailable", unavailableReason: result.reason, detail: result.detail };
      return { status: "ok", hits: await mapSearchHits(result.hits, kindOf), dropped: result.dropped };
    },
  };
  if (client.ask) {
    const ask = client.ask.bind(client);
    port.askKnowledgeBase = async (query) => {
      const served = applyServeRule(await ask(query));
      return served.status === "answered" ? { ...served, insufficient_coverage: false } : served;
    };
  }
  if (client.getSession) {
    const getSession = client.getSession.bind(client);
    port.getSession = async (sessionId) => {
      const result = await getSession(sessionId);
      if (result.status !== "ok") return { status: "unavailable", unavailableReason: result.reason, detail: result.detail };
      const sourceKind = await kindOf({ sourceId: result.session.sourceId, title: result.session.title });
      return { status: "ok", session: result.session, sourceKind, turns: mapSessionTurns(result.turns, sourceKind), dropped: result.dropped };
    };
  }
  return port;
}
