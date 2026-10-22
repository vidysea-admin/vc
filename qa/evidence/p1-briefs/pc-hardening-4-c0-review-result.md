# Review result: pc-hardening-4 c0 — Approve (senior-software-engineer, read-only)
- P1: diverges from old behaviour only with a custom env object lacking VC_GATE_APPROVER (intended K3 semantics, same as voice.ts:347); production paths (startApi env=process.env, createChatApi) unchanged; B13 'skipped when no approver' is the pre-existing b13Signed condition.
- P2: fires only when httpSetup and pepper unset; one warn line naming VC_PARTNER_KEY_PEPPER only; no connection, startup not blocked.
- P3: regex covers request_body(_file), cookie_*, http_*; shipped conf clean.
- low: go-live-gate.test.ts now imports chat.ts; P2 note can print before a later refused startup.
Tests: 4/4 (P1, P2, K2, K3) via vc-testlock.
REVIEW pc-hardening-4-c0 Approve
