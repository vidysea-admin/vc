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
import type { KbSourceKindRow, KbSourcesResult } from "./kb-client.js";

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
