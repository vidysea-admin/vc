Task t057-widget-resize (item 7, Umesh asked): make the VC chat widget box stretchable/compactable. You own ONLY apps/widget/** (src/vc-widget.js, its CSS, tests, README). Nobody else edits these.

Build, keeping the current blue-and-white theme and all existing behaviour:
1. The message input auto-grows with its content (textarea) up to ~6 lines / 160px, then scrolls internally; shrinks back after send or when text is deleted. Keep the current Enter/Shift+Enter send semantics (Enter sends, Shift+Enter newline if not already defined).
2. A header button toggles the panel between compact (current size) and expanded (e.g. width min(720px, 92vw), height min(85vh, 900px)); aria-label + aria-pressed; state remembered per viewer in localStorage wrapped in try/catch (must work when storage throws).
3. On desktop the panel can be drag-resized from an edge/corner (CSS resize or a handle) with sane min/max; on narrow screens (<640px) expanded = full-screen and drag-resize is off.
4. No horizontal page scroll; the message list keeps scrolling to the latest message.
TDD: failing tests first in apps/widget/tests (follow the config.test.js / floater.test.js style), run the widget test command (see apps/widget/package.json) and report counts. Record one falsification per behaviour (break it in a copy, test red, restore). Update apps/widget/README.md briefly. The widget is served live from apps/widget/src by a static server on :8790, so no restart is needed; do NOT start/stop any server.
