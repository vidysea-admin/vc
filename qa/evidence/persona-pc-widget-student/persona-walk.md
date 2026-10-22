# Persona walk: Pathlynks student (proxy mode), pc-widget cycle 0
Driver: checker's own Chromium script, 1280x800, demo.html?mode=proxy, a pl_session cookie set for the origin to stand in for the Pathlynks session.
Audience lenses: school student on the Pathlynks site; the widget sits behind the host backend.
| screen | what they tried | what blocked them | severity |
|---|---|---|---|
| open panel | opened the bubble | nothing; panel 380 px wide on desktop | none |
| ask | "Which course after class 12?" | nothing; POST goes to /api/vc with body {"text":...}, no X-VC-Key, the session cookie reaches the host backend (stub log shows cookie present, key null) | none |
| distress | typed a crisis message | red crisis block with 14416 / 112 | none |
| compose | Shift+Enter then more text | newline inserted, nothing sent | none |
| second embed | host loads the script twice | one widget only | none |
Note (low, not a unit defect): the student chat API's TURN_STATES include "concern" (packages/schemas/src/student-api.ts:99), the widget maps any unknown state to "ok", so a concern reply renders as a normal bubble. Proxy mode talks to the host backend, which decides what to forward.
No high finding.
