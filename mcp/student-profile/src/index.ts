/**
 * Student Profile MCP server (ARCHITECTURE.md H5/D-005, contracts B2/B3/B4/B6/B8/B12/B13/B14).
 *
 * Exposes exactly two tools over the `virtual_counsellor` `facts` collection
 * (consumed only through @vc/db's exported accessors — this package never
 * opens a database handle off the raw driver itself, and never imports
 * `applyApprovedDiff`):
 *
 *   - get_profile_facts:    read-only. Requires a recorded consent row for the
 *                            given purpose (B4, via @vc/db requireConsent) —
 *                            no consent, no data, just a tool error.
 *   - propose_profile_diff: pure diff (via @vc/db proposeFactChanges). WRITES
 *                            NOTHING (B3) — the only write path is the
 *                            counsellor-approved graph step in T-007.
 *                            `applyApprovedDiff` is deliberately not exposed
 *                            here.
 *
 * D-007: this package is consumed as TypeScript source (no build step) via
 * `"exports": {".": "./src/index.ts"}` — everything callers need lives in
 * this one file.
 *
 * B12: this file never opens a database handle off the raw driver itself
 * (that call is confined to packages/db/src/client.ts; a repo-wide scan test
 * there proves it) — it only ever receives an already-scoped `Db` via
 * `StudentProfileServerDeps`.
 *
 * B13: tool results carry real student data back to the MCP caller only.
 * Callers (graph nodes, skills) must NOT forward that data to an external
 * model (Gemini or any other API) without Umesh's per-use approval recorded
 * in qa/gates/ (see mcp/student-profile/README.md).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db, Filter } from "mongodb";
import { z } from "zod";
import { FactSchema, ProfileDiffSchema, type Fact } from "@vc/schemas";
import { factsCollection, requireConsent, proposeFactChanges, type FactDoc } from "@vc/db";

/**
 * The purposes this tool boundary understands (distinct from the free-text
 * `Consent.purposes` / `Fact.purposeTags` arrays in packages/schemas, which
 * stay open strings per D-003 — no fixed enum exists there yet).
 * [ASSUMPTION, T-006]: no ARCHITECTURE/plan.md page fixes this list, so this
 * is the smallest enum that covers the three places plan.md §3/§4 name a
 * purpose for reading a student's facts. Revisit if a future unit needs more.
 */
export const ProfilePurposeSchema = z.enum(["counselling_session", "profile_synthesis", "application_filling"]);
export type ProfilePurpose = z.infer<typeof ProfilePurposeSchema>;

function toFact(doc: FactDoc): Fact {
  return {
    key: doc.key,
    value: doc.value,
    source: doc.source,
    confidence: doc.confidence,
    validFrom: doc.validFrom,
    validTo: doc.validTo,
    purposeTags: doc.purposeTags,
    sensitivity: doc.sensitivity,
  };
}

export interface StudentProfileServerDeps {
  /** An already-scoped `virtual_counsellor` Db — production callers get this from @vc/db connectFromEnv/getVcDb; tests inject a fake. */
  db: Db;
}

/** Builds the student-profile MCP server. No transport is attached — the caller connects it. */
export function createStudentProfileServer(deps: StudentProfileServerDeps): McpServer {
  const { db } = deps;
  const server = new McpServer({ name: "vc-mcp-student-profile", version: "0.1.0" });

  server.registerTool(
    "get_profile_facts",
    {
      title: "Get profile facts",
      description:
        "Returns the student's current (open, i.e. no validTo) facts whose purposeTags include the given purpose. " +
        "Requires a recorded consent row covering that purpose (contract B4) -- with no consent, this returns a " +
        "tool error and zero facts, never partial data.",
      inputSchema: {
        studentId: z.string().min(1),
        purpose: ProfilePurposeSchema,
      },
      outputSchema: {
        facts: z.array(FactSchema),
      },
    },
    async ({ studentId, purpose }) => {
      // B4: throws ConsentRequiredError (-> a tool error, no data) when there
      // is no consent row, the row doesn't cover `purpose`, or the student is
      // a minor without guardianConsent. This call happens before any read.
      await requireConsent(db, studentId, purpose);

      const filter: Filter<FactDoc> = {
        studentId,
        validTo: { $exists: false },
        // Mongo matches an array field against a scalar by element membership
        // -- this returns only facts whose purposeTags array contains `purpose`.
        purposeTags: purpose,
      };
      const docs = await factsCollection(db).find(filter).toArray();
      const facts = docs.map(toFact);

      return {
        content: [{ type: "text" as const, text: `Found ${facts.length} fact(s) for purpose "${purpose}".` }],
        structuredContent: { facts },
      };
    },
  );

  server.registerTool(
    "propose_profile_diff",
    {
      title: "Propose profile diff",
      description:
        "Diffs candidateFacts against the student's current active facts and returns a ProfileDiff. " +
        "Writes nothing to the facts collection (contract B3) -- the only write path is the " +
        "counsellor-approved graph step (T-007); this tool deliberately does not expose applyApprovedDiff.",
      inputSchema: {
        studentId: z.string().min(1),
        candidateFacts: z.array(FactSchema),
      },
      outputSchema: {
        diff: ProfileDiffSchema,
      },
    },
    async ({ studentId, candidateFacts }) => {
      // All facts (active + superseded) for this student -- proposeFactChanges
      // itself filters to the active ones (no validTo) before diffing.
      const existingFacts = await factsCollection(db).find({ studentId }).toArray();

      const diff = proposeFactChanges({
        studentId,
        summary: `Proposed diff for student "${studentId}" from ${candidateFacts.length} candidate fact(s).`,
        existingFacts,
        candidateFacts,
      });

      return {
        content: [{ type: "text" as const, text: `Proposed ${diff.changes.length} change(s).` }],
        structuredContent: { diff },
      };
    },
  );

  return server;
}
