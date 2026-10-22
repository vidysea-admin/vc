# Browser validation brief: pc-hardening-2 widget busy + off notes with helpline (D-024)
Role: browser validation subagent (not a checker; the dual check already PASSed). Worktree D:/vc/.worktrees/pc-hardening-2, branch wave/pc-hardening-2, code 6b578a7. Read-only toward product code.
Goal: show in a real headless browser (Playwright chromium, the same tooling earlier qa/evidence/browser-*/report.json runs used; find it with `git -C D:/vc log --oneline -- qa/evidence/browser-t-053-session-outcomes-2026-10-01` and that unit's script) that the partner widget (apps/widget/src/vc-widget.js + voice.js, data-vc-voice=on) shows the voice busy note:
1. Serve a minimal static host page from your session scratchpad that loads the worktree widget files with a fake page key (vck_pub_ + random test chars, never a real key) and data-vc-voice=on. No API server: intercept the network with page.route.
2. Scenario en: `<html lang="en">`, POST /v1/public/voice/sessions fulfilled 429 `{"error":"voice_busy"}` with Retry-After 30. Click the voice control; screenshot; record the visible busy note text.
3. Scenario hi: same with `<html lang="hi">`; record the Hindi note.
4. Control: the same mint fulfilled 429 `{"error":"rate_limited"}` shows the old rate-limit/fallback text, not the busy note.
5. Control: a text chat turn whose response carries the crisis flag still shows the HELP / Tele-MANAS text unchanged (fulfil the chat route with the shape the widget tests use).
Record console errors per page. If the widget needs microphone permission before the mint, grant a fake media stream via chromium flags (--use-fake-ui-for-media-stream --use-fake-device-for-media-stream).
Write qa/evidence/browser-pc-hardening-2-2026-10-22/report.json in the same shape as earlier reports (unit, date, generatedAt from `date -Iseconds`, baseUrl, mode, browser, pages[{url,label,consoleErrors,messages,visibleText}]) plus the screenshots next to it. Commit only that folder on wave/pc-hardening (git add the named folder).
No live LLM/Gemini calls, no real Mongo, no real keys, never run python from a heredoc or stdin, never kill processes you did not start, never stop servers on 8080/8787/3399, no edits to product code, .claude/** or qa/contracts. Return `BROWSER pc-hardening-2 <sha> OK|FAIL` plus max 6 lines with the en and hi texts seen.
Additions for pc-hardening-2 (start from the committed script qa/evidence/browser-pc-hardening-2026-10-22/smoke.cjs; copy it into the new folder and extend it):
6. In scenarios 2 and 3 the busy note must be followed by the helpline: en shows the English HELP line, hi shows exactly "Tele-MANAS: 14416, मुफ़्त, 24x7 · 112 पर फ़ोन करें". Record both.
7. Scenario off: mint fulfilled 403 `{"error":"voice_unavailable"}` (no Retry-After) in en and hi: the "voice is not available here" note plus the helpline, and no busy wording.
8. The voice_busy error frame path (WebSocket error frame before a 1008 close) if the widget can be driven to it with a fake WebSocket via page.addInitScript; otherwise say it was unit-tested only.
Worktree-local work only; use your own subfolder of the session scratchpad (e.g. scratchpad/browser-pc2/), never the scratchpad root.
