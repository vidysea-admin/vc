# Manifest: t057-widget-resize

Status: ready-for-check
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (one product file, UI geometry; no security/auth/data write)
Dual check: no (no security/auth/tenancy/prod-write trigger)
Base: f3455075
Candidate: 259520ea (commits a41bf67d + 259520ea)
Source: Umesh, 2026-11-01, during the T-057 browser walk: the widget panel is too small to read; he wants to resize it himself.

## Acceptance criteria
- R1: The panel opens larger by default (440x680), clamped to the viewport (100vw-24px wide, 100dvh-100px high, with a 100vh fallback).
- R2: A top-left grip resizes the panel up and left. The right and bottom edges stay fixed. The size is clamped to the viewport (left/top >= 0) and to MIN_W/MIN_H.
- R3: The grip is visible on any brand colour, because it uses the header text colour --ct. It does not cover the header buttons.
- R4: Nothing is stored: no localStorage, sessionStorage, cookie or IndexedDB (privacy rule at vc-widget.js:8).

## Changed files
- apps/widget/src/vc-widget.js
- apps/widget/tests/floater.test.js

Tests[R1,R2,R3,R4]: cd apps/widget && npm test

Pre-check[R1]: 259520ea npm test (apps/widget) -> pass 129 fail 0
Pre-check[R2]: 259520ea node --test tests/floater.test.js -> t057 run7 resize test green
Pre-check[R3]: 259520ea grep grip-tl vc-widget.js -> background uses var(--ct)
Pre-check[R4]: 259520ea grep -E "localStorage|sessionStorage|indexedDB|document.cookie" src/vc-widget.js -> comment line 8 only

## Falsification (R2)
The new floater test was written first and was red (no grip-tl element). It went green after the change.

## Browser evidence
At 127.0.0.1:8791 in an 800x600 viewport, dragging the top-left grip from (453,18) to (120,6) grew the panel from about 343 px wide to about 676 px. The right and bottom edges stayed fixed.

## Review
senior-software-engineer: Approve, with 3 low findings.
- The white grip was invisible on light brand colours. Fixed in 259520ea.
- NaN input is pre-existing and not reachable from real pointer events.
- The grip overlaps the first 4 px of the title. Accepted.

## Metrics
builder_min=25
