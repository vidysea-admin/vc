#!/usr/bin/env node
/**
 * PROPOSAL, NOT RUN (p1-lk6, D-104/D-105, design result section 2 "Migration of existing non-English facts").
 *
 * Question it answers before go-live: does any stored fact value contain letters of a non-Latin script? The student knowledge graph is English,
 * so `profile_facts.value` (chat/voice facts) and `facts.value` (counsellor scribe facts) should have none. The design reads the code as
 * "no model-written chat fact can exist in production yet"; this script turns that reading into a count.
 *
 * READ-ONLY by construction: it opens find() cursors with a projection and never calls an update, insert, delete or index method. It prints
 * counts per tenant and collection, and the _id of each hit (an opaque hash), never a value, a quote or a student id. Run it only against
 * the `virtual_counsellor` database, with a human-approved read credential, e.g.:
 *
 *   VC_AUDIT_MONGODB_URL=... node qa/evidence/p1-lk6/audit-fact-value-language.proposal.mjs
 *
 * If it finds rows, the next step is a PROPOSAL FILE listing them for re-extraction through createStudentFactExtractor. Nothing is written
 * to the database by this script, and a production write stays behind the human gate.
 */
import { pathToFileURL } from "node:url";

/** Same test as the extractor's guard: a letter of any script other than Latin. */
export const NON_LATIN_LETTER_RE = /(?!\p{Script=Latin})\p{L}/u;
const COLLECTIONS = ["profile_facts", "facts"];

/** @param {{ collection(name: string): { find(filter: object, options?: object): AsyncIterable<any> } }} db */
export async function auditFactValueLanguage(db) {
  const report = { collections: {}, totalHits: 0 };
  for (const name of COLLECTIONS) {
    const stat = { scanned: 0, nonLatin: 0, byTenant: {}, ids: [] };
    const cursor = db.collection(name).find({}, { projection: { _id: 1, tenantId: 1, value: 1 } });
    for await (const row of cursor) {
      stat.scanned += 1;
      const text = typeof row.value === "string" ? row.value : "";
      if (!NON_LATIN_LETTER_RE.test(text)) continue;
      stat.nonLatin += 1;
      const tenant = typeof row.tenantId === "string" ? row.tenantId : "(none)";
      stat.byTenant[tenant] = (stat.byTenant[tenant] ?? 0) + 1;
      if (stat.ids.length < 200) stat.ids.push(String(row._id));
    }
    report.collections[name] = stat;
    report.totalHits += stat.nonLatin;
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.VC_AUDIT_MONGODB_URL;
  if (!url) {
    console.error("VC_AUDIT_MONGODB_URL is not set; nothing was read.");
    process.exit(2);
  }
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url, { readPreference: "secondaryPreferred", appName: "vc-audit-readonly" });
  try {
    await client.connect();
    console.log(JSON.stringify(await auditFactValueLanguage(client.db("virtual_counsellor")), null, 2));
  } finally {
    await client.close();
  }
}
