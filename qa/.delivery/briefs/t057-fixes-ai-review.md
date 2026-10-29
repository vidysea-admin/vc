# t057-fixes-ai-review

Read-only AI-engineering review (never edit, never call paid APIs) of the T-057 fix round.
Changed this turn (all under D:/vc/.worktrees/vc-completion unless noted):
Lane A KB latency: packages/engine/src/student/graph.ts (~1336-1356, searchFailed -> noAnswer, skip /ask), mcp/university-kb/src/kb-client.ts (timer armed through body read, KB_DEFAULT_TIMEOUT_MS 8000, KB_ASK_TIMEOUT_CAP_MS), mcp/university-kb/src/source-kind.ts (k=5), apps/api/src/chat.ts (~154,319,503,985-1010 turn deadline VC_TURN_DEADLINE_MS default 25000; returns 200 PROVIDER_APOLOGY_TEXT retryable; crisis exempt; abandoned graph keeps running).
Lane C widget: apps/widget/src/vc-widget.js (~754-758 turn_in_progress 409 text).
Lane D services catalogue: config/sources.json (vidysea-frontend source, branch prod), packages/engine/src/ingest/{types.ts,routes.ts applyServiceCopy,index.ts}, apps/api/src/admin-routes.ts syncGithubSource ~733-746, packages/engine/src/tools/navigate.ts, packages/engine/src/student/classify.ts ~149, packages/engine/src/student/lang.ts ~568, skills/vc-capabilities/SKILL.md, skills/vc-navigation/SKILL.md.
Vidysea frontend (D:/vc/.worktrees/vc-vidysea-frontend/next.config.mjs): demo-gated connect-src localhost:8000 (~252) and experimental.proxyTimeout 130000 (~11-13).
Use 'git -C <repo> diff' to see the exact changes; tests named in the evidence reports.
Focus: the services path (classify rules: false positives that steal real KB questions; navigate scoring; the prompt line 'name a service only if a tool returned it'; repo copy treated as untrusted data), and the graceful no-answer behaviour when the KB is slow (does the student get a useful grounded fallback within the 25 s deadline, or just an apology?). Return Approve/Warning/Block with concrete fixes and file:line.
