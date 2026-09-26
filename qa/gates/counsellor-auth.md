# Gate: counsellor login / identity on the approval screen (T-008 residual 4)
**Asked:** 2026-09-25 · **Answered:** 2026-09-26 (see below) · **Blocks:** any non-local deployment of apps/web and live mode

**Why you're being asked:** The approval screen (T-008) has no login today. Anyone who can reach the server
can approve. In demo/local that is fine. Before any real counsellor uses it, we need an identity source.

**Question:** Where does counsellor identity come from?
- **(a) Recommended:** the existing Vidysea/Pathlynks login (SSO/JWT), if the platform has one. Tell me which system.
- (b) A separate login inside this app, email magic link (Auth.js).
- (c) Keep it local-only for now and decide later (live mode stays blocked).

Answered: 2026-09-26 — Umesh in chat, checker session 64d95bcd (follow-up confirmed via AskUserQuestion).
- Verbatim: "rahega ye system rahega hamara API base … JWT token wala … knowledge base … link rahega ye wala directory poori API ke through … backend team ke saath JWT token ke through connect kar denge API system ko to knowledge yahan se aayegi … UI me jo jo kaise deliver karna hai ye hum wahan dekh lenge lekin intelligence yahan se chali jayegi". Follow-up on UI ownership: "jo best rhee, i guess api based ho, ui vo log khud bnaa lenge".
- Reading: none of (a)/(b)/(c) as worded. VC is a headless API service. It verifies a JWT issued by the Pathlynks backend (tenant, counsellorId, role claims), with no login screen in VC. The production UI is built by the Pathlynks team; apps/web stays VC's reference/test UI. The KnowledgeBase is consumed through its API (`POST /ask`, Bearer key). Contract: new B21. Unit: HTTP API + JWT + tenant stamping.
