# Intent — partner-chatbot (2026-10-22)

## Problem
In Umesh's words: "hmari team ko isko apne system mai integrate krna hoga ... they have to show it like a chatbot and multiple partners and alls can connect all togehter and vocie chat se bhi ho skta hai kaam".
Today VC can only be used through its own student page. There is one JWT issuer, no CORS, no ready widget, no per-partner key, and nginx exposes only the anonymous route.

## Proposed outcome
1. Any Vidysea team or partner adds VC to their site with one script tag, and it shows up as a chatbot bubble.
2. Teams that want their own UI call the same API from their backend.
3. Many partners connect at the same time, each with its own simple API key, which can be added, rotated and revoked without a code change.
4. Voice chat works in the widget.

## Affected users and systems
- **Vidysea website visitor (anonymous):** chats in the bubble, with no login.
- **Pathlynks student (logged in):** chats in the bubble on Pathlynks. Pathlynks' backend vouches for the student.
- **Partner developer:** pastes the snippet or calls the API, using the guide and the OpenAPI.
- **Vidysea ops:** adds, rotates and revokes partner keys with one command.
- **Systems:** apps/api (auth, CORS, routes), a new apps/widget, nginx, the virtual_counsellor `partners` collection.

## Constraints
- Crisis handling stays the same as today: the LK10 wording, crisisGuard, and the 14416/112 footer always visible.
- Minors fail closed.
- A partner never sees another partner's students.
- A raw key is shown once and never stored.

## Decisions (mini-grill, Umesh, 2026-10-22)
- **Embed form:** a widget plus the API.
- **Partner auth:** a simple API key per partner.
- **Voice:** goes on without an A10 PASS. Umesh accepts the risk recorded in the A10 gate: only 10 of 20 crisis phrases were caught in time. Recorded as D-111.
- **First partners:** the Vidysea website and Pathlynks.

## Open questions
None blocking. PARKED: the real domain/TLS (golive-launch); a per-partner usage dashboard (later).
