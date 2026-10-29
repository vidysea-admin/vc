# t057-kb-slowness-analysis

Read-only root-cause analysis: why is the KnowledgeBase /search slow (VC student KB turns sit at 14-15 s, bounded by the 8 s /search timeout in mcp/university-kb/src/kb-client.ts)?

1. Locate the KB service VC calls: read mcp/university-kb/src/kb-client.ts and the worktree .env (key NAMES only, e.g. the KB base-URL/timeout keys) to find the host/port. Find the sibling KB repo on disk (likely under D:/ — search for the KnowledgeBase repo referenced by T-013/T-050, e.g. D:/vidysea/*KnowledgeBase* or similar) and the process serving that port (Get-NetTCPConnection / Get-CimInstance Win32_Process: command line, cwd, CPU, working set).
2. In the KB repo, read the /search handler end to end: embedding model (local vs API, which one), vector store / index type and size (doc/chunk counts, index file sizes on disk), reranker, any LLM call inside /search, k handling, caching, cold-start loading per request.
3. Time it: ~10 sequential /search calls (k=5) with 3-4 representative student questions (e.g. "cost of living in Toronto for students", "IELTS requirement for UK masters"), plus a trivial/repeat query to see warm vs cold. If the KB exposes health/metrics/logs with stage timings, use them. If you can add zero-cost timing by reading existing logs, do so. Record p50/p95 per query and which stage dominates.
4. Check resources: KB process CPU%/RAM during the probe, machine free RAM, whether it is swapping (pagefile), whether it is single-worker/blocking.
5. Conclude: the root cause(s) ranked with evidence, and concrete fixes ranked by gain/effort (e.g. keep model warm, cache embeddings, smaller/faster embedding model, ANN index, drop in-search LLM rerank, more workers), each with the expected latency. Flag which fixes are in the KB repo (not ours to edit without approval) vs in VC.

Write qa/evidence/t057/kb-slowness-analysis.md with commands, raw timings and the conclusion. Return a short summary (<= 25 lines).
