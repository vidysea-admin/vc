# U7 senior review result (2026-10-18) — Warning, no Block
- M1 [medium] apps/api/src/anonymous.ts:405-423 — limiter after body parse + crisisGuard on up to 256 KiB (77-106 ms sync per call); unlimited CPU burn per client. Fix: MAX_ANONYMOUS_BODY_BYTES ~32-64 KiB or byte budget before scan.
- L1 [low] anonymous.ts:422-424, graph.ts:474 — crisis/concern bypasses limiter; each does $inc upsert on ${date}:crisis; flood inflates counter. Fix: second generous limiter that skips only the counter write.
- Sound: A20 gate, socket-only client key (no XFF), fail-closed limiter, zero persistence, crisis ordering, helpline on every refusal, strict body shape.
- Open: EMAIL regex O(n^2) on 4000 chars unmeasured; trailing-slash 405 path untested.
- Test gaps: large-body CPU cost; crisis-flood write count.
