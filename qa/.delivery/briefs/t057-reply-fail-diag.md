# t057-reply-fail-diag

On 2026-10-29 ~06:31 IST a Vidysea student turn "i want to make an entrie journey map for study abroad" showed "Could not get a reply. Your question is kept for Retry." in the VC widget. Umesh says the AI fails often and is very slow.
Using the VC API log C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/logs/vc-api.log (and other logs in that folder), plus source under D:/vc/.worktrees/vc-completion (apps/api/src/chat.ts, packages/engine/src/graph.ts, packages/providers/src/index.ts, the KB search client, apps/widget/src/vc-widget.js), find:
1. Root cause of failed turns: which error (GeminiTimeout / Http status / Malformed, KB /search timeout, turn deadline, safety screen), with log line excerpts (no student text beyond the quoted question, no secrets). Count failed vs successful turns in the last 12h.
2. Per-turn latency breakdown for recent turns: KB /search ms, safety screen ms, Gemini answer ms, total. If the log lacks timings, say which spans exist and what is missing.
3. Which widget/API path produces "Could not get a reply" (file:line) and what status or condition triggers it (e.g. a widget fetch timeout shorter than the server turn).
4. Concrete fixes ranked by impact, with file:line. Do not apply them.
Write your report to qa/evidence/t057/reply-fail-diagnosis.md and return it.
