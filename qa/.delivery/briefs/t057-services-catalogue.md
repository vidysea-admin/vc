# t057-services-catalogue

Implement ranked fixes 1-4 from qa/evidence/t057/services-knowledge-audit.md (source 2), in place. Files you own: config/sources.json, packages/engine/src/ingest/types.ts, packages/engine/src/ingest/routes.ts, apps/api/src/admin-routes.ts (syncGithubSource only, ~722-740), packages/engine/src/tools/navigate.ts, packages/engine/src/student/classify.ts (~145-149), packages/engine/src/**/lang.ts (one prompt line only), the vc-capabilities / vc-navigation skill text, and their existing tests. Do NOT touch graph.ts, kb-client.ts, chat.ts, source-kind.ts (another lane owns them).
1. Add a Vidysea frontend github source to config/sources.json (repo from 'git -C D:/vc/.worktrees/vc-vidysea-frontend remote -v', branch per the existing pathlynks entries' shape).
2. NavRoute gains optional label + summary; syncGithubSource reads the services copy from the next-intl messages file (src/messages/en.json or wherever it lives) via the existing fetchRepoFiles and attaches label/summary to /services/* routes. Check DEFAULT_MAX_BYTES vs that file size.
3. navigateSteps scores on label/summary and returns "name: purpose (path)"; classify routes service-intent wording (e.g. "do you help with loans", "visa help", "test prep", "scholarship", "journey map") to it.
4. One prompt line: name only services the tool returned; never invent services or links.
Do NOT run the real GitHub sync (main will, after a restart). Use the existing fakes for tests. Run focused engine + apps/api admin-sync tests and tsc for touched packages.
