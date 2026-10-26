# vca-widget - vc-admin-control, unit widget (VA18)

Status: built-unit
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: M (public widget UI)
Worktree: D:/vc/.worktrees/vca-widget, branch wave/vca-widget, base 9cc4c73
Contract: qa/contracts/vc-admin-control.md @1283b23, criterion VA18 (invariants I2, I5 touched by the unit; both stay green)
Gates: G0 answered; G1/G2 unanswered and not needed (no Postgres, no GitHub, no network beyond a local stub on 127.0.0.1)

## What changed

- apps/widget/src/vc-widget.js (VERSION 1.0.0 -> 1.1.0, header comment too)
  - constants MIN_W/MIN_H/SITE_RE/POPOUT_PATH/POPOUT_FEATURES (:22-26)
  - parseConfig adds `site` (data-vc-site, else the partner id inside a `vck_pub_<id>_...` key, else "") (:60-61, :86-92); no existing field changed
  - new pure functions `clampRect` (:96) and `popoutUrl` (:109), exported with MIN_W/MIN_H
  - css: `.head` is a grab handle (touch-action none), `.modes/.mode`, `.pop`, `.grip`, `.panel[data-mode=voice]` rules, `.panel max-width:calc(100vw - 16px)`; the 480 px media rule that fits 360 px is untouched
  - mount(cfg, doc, fetchImpl, env) (:358-): optional 4th arg `{win}` (default = page window); header gets the `Chat | Voice` group (hidden unless voiceAvailable) and the pop-out button (hidden without a site id/origin); a corner `.grip`; `hist` array behind `add()` (one shared history); floater block `gesture()` (:598) `pin()/applyGeom()/vp()` (pointer events + pointer capture, clamp on every move, on window resize and on open), `setMode` (:637), `voiceFailed` (:647); handle gains `setMode, voiceFailed, mode(), history()`
  - init() :774: voice add-on `onerror` also calls `handle.voiceFailed()` (toggle disappears again)
  - `setLine()` (:471) replaces the one `line.textContent = ...` in the mic transcript path (same effect, also updates history)
- apps/widget/tests/floater.test.js: NEW (30 tests, fake DOM + fake window, no jsdom)
- apps/widget/README.md: floater section, data-vc-site row
- apps/widget/demo.html: data-vc-site="demo", `?voice=on` switch, one help line
- apps/widget/package.json: version 1.0.0 -> 1.1.0 (REQUIRED: tests/config.test.js asserts `VERSION === package.json version`; not in the brief's owned-file list, flagged here; no other change)
- NOT touched: voice.js, stub-server.js, the existing 4 test files, nginx snippet, anything under packages/ apps/api qa/contracts docs .claude

CORE-REQUEST: none for code. Open design gap (contract PROPOSED-ISSUE, line 130): `/vc-popout?site=<id>` must be served by the host or VC (no file in this unit serves it) and the pop-out window starts a FRESH conversation: with `noopener` and "no history via storage or URL" there is no channel to hand the history over. This is documented in the README. A history hand-off would need a decision (e.g. a postMessage channel without noopener, or a server-side thread id).

Decisions inside the brief's latitude (state them so the checker can contest): drag/resize clamp to the LAYOUT viewport (documentElement.clientWidth/Height, smaller of that and innerWidth) so the panel never slides under a page scrollbar; leaving Voice mode stops a live call; Voice mode hides textarea and Send and keeps the mic; geometry is memory-only and resets on reload; pop-out features `popup=yes,width=420,height=680,noopener,noreferrer`; the grip is aria-hidden (pointer-only); no keyboard drag/resize (not in the criterion).

## Tests[VA18]

- 9cc4c73+worktree `cd D:/vc/.worktrees/vca-widget/apps/widget && node --test tests/*.test.js` -> tests 95, pass 95, fail 0 (config 10, request 13, voice 39, hosting 3 unchanged and green; floater 30) t=0.3
- 9cc4c73+worktree `node --test tests/floater.test.js` -> tests 30, pass 30, fail 0 t=0.3
- RED first (TDD), before any src edit: same command -> tests 28, pass 7, fail 21 (28 tests at that time; 2 more were added later: scrollbar clamp, lost pointerup, each seen red then green)
- Scenarios (test names start "VA18 ..."): version; clampRect edges/floor/tiny viewport; header drag to every edge; control buttons never start a drag; scrollbar layout viewport; lost pointerup; window shrink after drag; no explicit placement before any drag; grip resize min and max; 360x640 resize; toggle shown/hidden for 3 voiceAvailable=false cases; shared history across Chat -> Voice -> Chat; header button/tab order; leaving Voice stops the call; add-on load failure hides Voice; popoutUrl (key mode, proxy relative/absolute, 8 bad site ids, no origin, opaque origin); pop-out click -> win.open(url, "_blank", features with noopener) with no key/history in the URL; no button without a site; data-vc-site/key-derived site; storage spy over drag+resize+toggle+pop-out+chat turn (localStorage/sessionStorage/indexedDB getters and document.cookie all spied, zero calls); unchanged behaviour: key vs proxy request shape, crisis block + 14416/112, 401 "Chat unavailable" + disabled box, 429 countdown + message given back, Esc closes with focus to bubble, aria roles/labels, mic attaches only when voice is available, 480 px CSS rule kept.

## Pre-check[VA18]

- 9cc4c73+worktree `node --test tests/floater.test.js tests/config.test.js tests/request.test.js tests/voice.test.js tests/hosting.test.js` (same as the glob) -> 95/95 pass t=0.3
- no `localStorage|sessionStorage|indexedDB|document.cookie|innerHTML|eval|http(s)://` in the code part of vc-widget.js: enforced by the existing request.test.js "the source never uses storage..." (green)

## Capability coverage (one falsification per criterion, throwaway copy OUTSIDE the worktree)

Copy: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/fe5889a6-130f-4952-9226-886a6cea9053/scratchpad/fals1/widget, driver scratchpad/falsify.js (restores the file at the end). Primary falsification for VA18: M1.

```
GREEN-BEFORE (copy, unmutated): tests 30 | pass 30 | fail 0
RED-AFTER M1 position clamp removed: tests 30 | pass 24 | fail 6   (drag clamp, clampRect, header drag edges, window-shrink re-clamp ...)
RED-AFTER M2 size floor removed:     tests 30 | pass 29 | fail 1   (clampRect floor 300 x 380)
RED-AFTER M3 key leaked into pop-out URL: pass 27 | fail 3         (popoutUrl, proxy origin, click test)
RED-AFTER M4 pop-out without noopener:    pass 29 | fail 1
RED-AFTER M5 Voice not hidden when unavailable: pass 29 | fail 1
RED-AFTER M6 localStorage write added:    pass 29 | fail 1         (storage spy)
```

## Live browser evidence (smoke, not validation)

- Playwright MCP chromium against `node apps/widget/tests/stub-server.js 5183` (server stopped afterwards, by PID), `demo.html?voice=on`, voice add-on and `/vc-popout` served by context routes.
- Report: qa/evidence/browser-vca-widget-2026-10-26/report.json. Screenshots: qa/evidence/vc-admin-20261026/vca-widget-{1280x800,360x640}-{1-open,2-dragged,3-resized-max,3b-resized-min,4-voice}.png.
- Result at 1280x800 and 360x640: drag moves the panel and stops at every edge (also dragged to both corners); resize reaches exactly 300 x 380 at the minimum and the layout viewport at the maximum; a browser-window shrink after a drag pulls the panel back inside; Chat -> Voice -> Chat keeps the identical log; header tab order Chat, Voice, pop-out, Close; pop-out opened `http://127.0.0.1:5183/vc-popout?site=demo` with `window.opener === null`, no key, no chat text; localStorage 0, sessionStorage 0, cookie empty, indexedDB 0; Esc closes; no horizontal scroll; 0 console/page errors.
- Found and fixed through this run: (1) innerWidth includes the page scrollbar (panel slid 15 px under it at 360 px) -> layout viewport; (2) a mouse release outside the window left the gesture stuck -> pointermove with `buttons === 0` ends it. Both have a unit test now.
- Not exercised: real microphone, real API, crisis/401/429 in the browser (unit-covered with fakes), the Pathlynks-student and Vidysea-visitor walks (the checker's).

## Review

No senior-software-engineer/checker dispatched, per the brief ("Do NOT dispatch a checker"). The orchestrator owns the independent review.

## Metrics

files=7 (src 1, tests 1 new, README, demo, package.json, manifest, evidence) | src +201/-12 | tests +30 new, 0 existing changed | wall~25 min | falsifications 6 (6 red) | fix cycles 0
