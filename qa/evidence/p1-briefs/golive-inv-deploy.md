# Brief: investigate production entrypoint + KB for launch (read-only)
You are a read-only investigation agent bound to D:/vc. Edit nothing. Never print key values. Sibling repos read-only.
Finding from a boot smoke on main: apps/api/src/index.ts startApi is a library function; there is no production launcher script that supplies the KB port, speakers file, trustSocketAddress/clientKey and Mongo client. The anonymous answers ended no_sourced_answer against a synthetic KB.
Answer precisely with file:line:
1. How is VC meant to be deployed today? Search package.json scripts, apps/*, infra/, Dockerfiles, docs/runbook-golive.md, docs/go-live-checklist.md, docs/plan.md, HANDOFF.md, ARCHITECTURE.md, DECISIONS (G-PROD, deploy). Is there any server entry (e.g. apps/api/src/main.ts, apps/web Next server) that calls startApi with real ports? Who serves the student UI (apps/web?) and how does it reach the API?
2. The KB port: is there a real knowledge-base adapter (HTTP client to the KnowledgeBase service, Mongo vector search, etc.)? What config does it need (URLs/keys; U3 "KB keys" was blocked)? Is a real KB required for any answer, or is there a no-KB mode?
3. Speakers file, trustSocketAddress/clientKey: what are they and what production values make sense.
4. The minimum missing pieces to have a runnable production process for text-only launch, as a list: piece | file to create/edit | est lines | needs a human input (which).
Return <= 30 lines.
