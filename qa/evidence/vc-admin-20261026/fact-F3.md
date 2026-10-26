# Fact F3 — widget, mcp, engine, skills (saved by maker from the read-only F3 agent report, 2026-10-26)
- apps/widget/src/vc-widget.js: 615 lines; VERSION "1.0.0" :12; parseConfig :46-80; voiceAvailable :94; css :247-289 (.root/.panel position:fixed :251/:254);
  mount :309-572 in a shadow root; header :335-340; mic attachVoice :495-551. No storage by design (:7). voice.js is logic only. Tests: apps/widget/tests/*.test.js.
- mcp/university-kb: McpServer + registerTool pattern; tests use InMemoryTransport.
- Engine consumes ports, not MCP: createStudentKbPort wired in apps/api main.ts:25,105,124.
- Engine graph nodes: gate / crisis / route / answer_from_kb / coach / feature_tool / finish. classifyIntent classify.ts:128; TOOL_MESSAGES.
  STUDENT_TOOLS must match the skills/vc-capabilities/SKILL.md table (assertManifestMatches, capability-manifest.test.ts). crisisGuard in guards/crisis.ts.
- Skills: skills/<name>/SKILL.md, single-line name/description frontmatter; loader packages/engine/src/skills/loader.ts.
- No GitHub client and no Postgres client anywhere: both are new dependencies.
