# Gate: counsellor login / identity on the approval screen (T-008 residual 4)
**Asked:** 2026-09-25 · **Answered:** (blank) · **Blocks:** any non-local deployment of apps/web and live mode

**Why you're being asked:** The approval screen (T-008) has no login today. Anyone who can reach the server
can approve. In demo/local that is fine. Before any real counsellor uses it, we need an identity source.

**Question:** Where does counsellor identity come from?
- **(a) Recommended:** the existing Vidysea/Pathlynks login (SSO/JWT), if the platform has one. Tell me which system.
- (b) A separate login inside this app, email magic link (Auth.js).
- (c) Keep it local-only for now and decide later (live mode stays blocked).
