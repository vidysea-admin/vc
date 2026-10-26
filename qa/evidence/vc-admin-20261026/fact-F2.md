# Fact F2 — apps/web, packages/db, observability, schemas (saved by maker from the read-only F2 agent report, 2026-10-26)
- apps/web: Next 16.3.6 App Router, React 19.3, dev with `--webpack`, port 3108. No auth, no admin page. Plain CSS, en/hi labels. transpilePackages at next.config.ts:11.
- packages/db: getVcDb / connectFromEnv at client.ts:125. B12 guard: no `.db(` outside client.ts. COLLECTION_NAMES at collections.ts:24-90.
  A new collection must: be in COLLECTION_NAMES; be in ERASURE_PLAN or ERASURE_EXEMPT_COLLECTIONS (erasure.ts:1582, reason > 10 chars);
  have an INDEX_PLAN entry (scripts/db-init.ts:82, tenant-led); carry NO TTL and no `ttl:` / `ttl =` identifier (db-init.test.ts:344-376);
  never use `db.collection(variable)` (FENCE_AWARE_WRITERS). No encryption helper exists.
  Fakes: createFakeMongoClient (@vc/db/testing); partial filters support only $eq, $exists:true, $gt, $in, $type, $and, $or.
- observability: Langfuse self-hosted only; student chat tracing OFF. ChainSpendGuard is in-memory (index.ts:169-250).
  student_usage = per student per month {textTurns, voiceMs}. chat_turns carry no tokens/cost/latency -> dashboard needs a new text-free per-turn usage record.
- schemas: zod, barrel index.ts, requests use `.strict()`.
- Root: no tsconfig paths. Test lock: scripts/vc-testlock.sh.
