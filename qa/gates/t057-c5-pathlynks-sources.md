# Gate: C5 citation on the Pathlynks surface
Opened: 2026-10-30T20:28:31+05:30
Question: C5 needs >=1 KB citation on both surfaces. VC sends `sources` in the turn response (apps/api/src/chat.ts:1146), but the Pathlynks backend proxy drops them (quest-pathlynks-backend controllers/pathlynks_quest_controller.js:1338, history :1436), and the Quest Guide widget renders only text (quest-pathlynks-frontend src/components/career-quest/AIChatWidget.jsx:712/724/901).
Options:
 (a) Recommended: build the 2-file fix (backend forwards sources; widget shows a "Sources" list) through maker-checker.
 (b) Amend the demo contract: on Pathlynks, C5 is met by a sourced answer without visible citations.
Blocks: T-057 C5 (Pathlynks).
