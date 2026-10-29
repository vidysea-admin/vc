# t057-headed-walk-script

Write (do NOT run) a headed Playwright walk script for the T-057 demo: C:/Users/Lenovo/AppData/Local/Temp/claude/D--vc/3729a82a-387f-4051-a933-dfde6424d2aa/scratchpad/walk.mjs, run with `node walk.mjs pathlynks|vidysea` from D:/vc/.worktrees/vc-completion/apps/web (that dir has node_modules/playwright; import it via createRequire from that path so cwd does not matter).

Browser: chromium.launch({ headless: false, channel: "chrome", slowMo: 250 }) - the user watches it live. Keep the browser open at the end until the user closes it (await page.waitForEvent("close", { timeout: 0 })), so they can poke around.

Credentials: read D:/vc/.worktrees/vc-completion/.env at runtime (parse KEY=VALUE lines); use VC_TEST_PATHLYNKS_EMAIL / VC_TEST_VIDYSEA_EMAIL and VC_TEST_PASSWORD. NEVER console.log them; never put them in screenshots' filenames.

Pathlynks walk (frontend http://localhost:3000, checkout D:/vc/.worktrees/quest-pathlynks-frontend): log in through the real login page, go to Career Quest, open the native AIChatWidget, then send the demo-contract prompts in order, waiting for each reply (poll until the reply bubble count increases and its text stops changing; up to 60 s; KB /search takes ~14 s): C4 "which careers suit me?"; C5 a KB question (e.g. "what are the admission requirements for a BTech in computer science at IIT Bombay?"); C6 "summarise my combined report"; C9 per the contract text (read docs/demo-contract.md C5-C9 and use its exact prompts/criteria where given). Then reload the page (C7: the thread/history should persist) and screenshot. Then logout and screenshot.
Vidysea walk (frontend http://localhost:3001, checkout D:/vc/.worktrees/vc-vidysea-frontend): log in, open student central where the VC widget mounts (NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED), send "which careers suit me?" (C3 surface: answered from the Vidysea pathlynks snapshot) plus one KB question, reload, screenshot.

Find the real selectors by reading the frontend code (login form inputs/buttons, route paths, the chat widget launcher, input, send button, message list). Cite file:line for each selector in a comment. Prefer role/placeholder/text locators that are robust. If the Vidysea VC widget is the VC script widget (D:/vc/.worktrees/vc-completion/apps/widget/src/vc-widget.js, possibly in shadow DOM or an iframe), read it and handle that.

After each step save a screenshot to D:/vc/.worktrees/vc-completion/qa/evidence/t057/<platform>-<nn>-<step>.png and print ONE line per step: step, OK/FAIL, reply length in chars and elapsed ms - never the reply text (it holds real student data). Wrap each step in try/catch so one failure does not stop the walk; on failure save a screenshot and continue. Run `node --check walk.mjs` at the end.

