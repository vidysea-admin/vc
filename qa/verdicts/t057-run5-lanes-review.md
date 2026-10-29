# T-057 run-5 lanes review (2026-10-29)

Fresh read-only senior-software-engineer review. The reviewer could not write files, so the main session saved it.

**Verdict: Warning** (lane 1 Warning; lanes 2 and 3 Approve; nothing high or critical)

## Re-runs

| Package | Tests | tsc |
|---|---|---|
| mcp/university-kb | 106/106 | clean |
| engine: fact-extractor | 15/15 | clean |
| engine: student-graph | 129/129 | |
| providers: rules | 11/11 | |
| mcp/pathlynks | 59 pass, 1 skip | clean |
| schemas | 18/18 | clean |
| api: chat-pathlynks, admin-sync, admin-routes, main | 149/149 | clean |

## Lane 1: KB breaker, 4 s caps, route-first (Warning)

- **[medium] kb-client.ts:450-469, 576-621.** The breaker is per base URL and shared by all tenants and anonymous visitors, so two poison queries can switch KB retrieval off for everyone for 120 s. Turns fall back to general guidance; nothing breaks. Accepted for now, because natural-language /search already exceeds 40 s, which makes "open" the correct state. To do: confirm the anonymous rate limit bounds this.
- **[low] kb-client.ts:578.** The endpoint log keeps path ids (`/sessions/<id>`). A KB record id is not student text.
- **[low] kb-client.ts:174-176.** The 4 s /ask cap is far below /ask's real latency, so /ask is effectively off. This is a product call.
- **Clean:** half-open race; no student text in logs; the shared hit parser keeps the /search filtering; route fallback; test isolation.
- **Gate before setting VC_KB_ROUTE=1:** the KB team must confirm that /route applies the same visibility and withdrawn filter as /search, and the request contract (an [ASSUMPTION], kb-client.ts:689).

## Lane 2: fact extractor (Approve)

- The strict object schema still rejects bad payloads.
- verifyCandidateFact still guards every fact.
- The log is text-free.
- **[low]** nodes.ts:1341 has a literal newline inside a template string.

## Lane 3: vidysea-db enabled (Approve)

- Every read is a SET read-only session plus fixed SELECT text with a uuid parameter.
- The allow-list is unchanged.
- There is no write path: sync returns not_syncable for non-GitHub sources.
- Tenant isolation holds.
- **[low]** Optional defence in depth: a SHOW transaction_read_only check, or BEGIN READ ONLY.

## Follow-ups

- **Done by main:** the API restart and the .env.example keys.
- **No longer needed:** graph.ts:1090 wording. The Vidysea port now exists, so Vidysea wording applies.
- **Test gaps:** a half-open probe answered with 404/401, and a failed SET aborting a Vidysea read.
