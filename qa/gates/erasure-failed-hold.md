# Gate: erasure hold on failed outbox rows
Opened: 2026-10-25T07:30:28+05:30 (w1-erasure-outbox close-out; ISS-w1-erasure-outbox-1)

Question: when a partner webhook for a student returns a non-retryable 4xx (outbox row status failed), should that student's erasure keep waiting?

Options:
- (a) keep holding until an operator drains it, and add an alert when a failed row is older than N days (recommended, N = 3; the erasure is never reported complete while a partner may still hold data).
- (b) after N days treat failed as dead and let the erasure complete, logging that the partner was not notified.
- (c) hold with no alert (current behaviour).

Blocks: nothing today (auto-delete is off); blocks enabling VC_ERASURE_AUTO_DELETE in production together with ISS-w1-erasure-outbox-2.
Answer format: "Answered: <date> - (a|b|c), N=<days> - <where>"
