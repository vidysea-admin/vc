# Manifest: time-bombs-6c

Status: building
Fix cycle: 0
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (test-only: fixture dates and clock injection in three existing test files; no product file)
Dual check: no (no security/auth/tenancy/prod-write trigger in the diff)
Base: 904d3b81
Source: qa/QUEUE.md row 6c-time-bombs-20261102, approved by Umesh 2026-11-02 in chat; evidence qa/verdicts/devops-handover-6c.md.
Round: 3 files, 3 criteria, est 20 min - read three failing tests, pass an injected now, run three touched files once.
Owners: tests-owner
SERIAL: none, a single builder owns all three test files

## Acceptance criteria
- T1: packages/db/tests/student-store.test.ts "S12: stale extraction successful cleanup never rewinds the explicit forget history cutoff" passes on the real clock today (2026-11-02) and would still pass on any later date, because every clock-stamping call in it receives the test's own fixed now.
- T2: apps/api/tests/chat-profile.test.ts "Q10-Q14: actual handler passes only owned completed context and confirmed memory..." passes the same way (no dependence on the real clock).
- T3: apps/api/tests/voice-history.test.ts "Q14/I1 repair: voice memory numbers remain untrusted..." passes the same way.
- T4 (scope): the diff touches only test files; no product file, no assertion deleted or weakened, no skip or xfail added; sibling tests that mix a fixed date with real-clock calls are listed, not silently fixed beyond these three.

## Changed files
(filled at ready-for-check)
