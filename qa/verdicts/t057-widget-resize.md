# Verdict: t057-widget-resize (Mode A feature check, Tier S, single check)

Cycle checked: 0
Overall: PASS

Bound: manifest 979192af (tree HEAD 67aa4577 adds only qa files), candidate 259520ea, base f3455075. Policy proportional-verification/2026-10-19.17.
Check plan: diff scope, R1-R4 in a real browser (own stub server on 127.0.0.1:8795, started and stopped by this checker, PID 33036), hostile drags, phone width, 1 falsification in a copy, manifest test run. Audience: partner-site visitors, desktop and phone; no spec user-type walk beyond the widget.

## Diff scope
`git diff --stat f3455075 259520ea` -> apps/widget/src/vc-widget.js (+12/-2) and apps/widget/tests/floater.test.js (+16): exactly the 2 listed files.

## Manifest command, run by the checker in the bound tree
`cd apps/widget && npm test` -> tests 129, pass 129, fail 0, skipped 0 (matches the manifest's 129/0).

## Outcome proof in a real browser (Playwright, real mouse drags, computed rects)
- R1: viewport 1280x800 -> panel 440x680 (l828 t36 r1268 b716). Viewport 800x600 -> 440x500 (height = 100vh-100). Viewport 360x640 -> 329 wide, 8px inside the right edge (CSS min(440, 100vw-24) with max-width 100vw-16).
- R2 normal drag at 800x600: grip (352,20) -> (120,6): panel l348->115, t16->1, w440->673, h500->515; right 788 and bottom 516 unchanged.
- R2 hostile, past viewport edge: drag to (-500,-500) -> l0 t0 (never negative), bottom 516 fixed. Right edge 784 (see PROPOSED-ISSUE-1).
- R2 hostile, below the floor: drag from the top-left grip to (799,599) -> 300x380 exactly (MIN_W x MIN_H), right 788 / bottom 516 still fixed. Then back to (-1000,-1000) regrows to the viewport edge.
- R2 hostile, phone 360x640: grow to (-300,-300) -> l0 t0 w337 h560 (right 337 fixed, no overflow); shrink to (359,639) -> 300x380, right 337 / bottom 560 fixed. scrollWidth equals the viewport (no horizontal scroll).
- R3: yellow brand (#ffeb3b): head text rgb(27,31,35), grip drawn dark, clearly visible in the screenshot; blue brand (#1d4ed8): head text white, grip white. Grip box 18x18 at the panel's top-left (right 846.8); header buttons start at x=1167, so no overlap.
- R4: after clearing, reload, open, drag: localStorage [], sessionStorage [], document.cookie "", indexedDB.databases() []. grep of src/vc-widget.js for localStorage|sessionStorage|indexedDB|document.cookie matches line 8 (the privacy comment) only. (The first probe saw keys hei.panw and hei.country in localStorage: they are not in this repo (grep over the worktree finds none) and are not recreated after clear; they came from the browser profile.)

## Falsification (R2, in a copy under the scratchpad, bound tree untouched)
Copy of src/ and tests/ with the top-left clamp broken (removed Math.min(..., right) / (..., bottom) at vc-widget.js:875): `node --test tests/floater.test.js` -> the new test "t057 run7 resize ..." FAILS (actual [0,0,1280,800], expected [0,0,1268,716]), 50 pass 1 fail. Restored: 51 pass 0 fail. A second change (MIN_W floor to 0) also turns the test red.

## Review of the diff
Logic at vc-widget.js:872-877 is correct: right/bottom are taken from the start rectangle, size is capped by the room left and above and floored at MIN_W/MIN_H, then clampRect applies. The grip is aria-hidden like the existing one; no new event surface beyond gesture().

## Residuals (none block PASS)
PROPOSED-ISSUE-1 (S3, pre-existing): when a resize reaches the full viewport width, JS stores width = vw (788 at 800 wide) but the CSS max-width 100vw-16px renders 784, so the right edge shifts left by 4px and geom is 4px wider than what is on screen. The old bottom-right grip has the same cap mismatch. Fix: use the same 16px margin in clampRect or drop max-width once geom is set.
PROPOSED-ISSUE-2 (S4): the top-left 18x18 grip sits under the 14px corner radius, so the outer ~4px of the grab area is clipped and a press at (3,3) hits the page behind. Presses 8px or more inside work. Accepted by the manifest as cosmetic.

Metrics: start=unavailable end=2026-11-01T10:08:34+05:30 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=unavailable mutants=2 defects_unit=0 defects_6c=0
