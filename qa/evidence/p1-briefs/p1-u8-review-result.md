# U8 senior review result (2026-10-18): Warning, no Block

## Medium
- **M1** (chat.ts:401-408, 412-413). Name redaction fails OPEN when deps.profile.facts throws: knownNames stays [] and a Pathlynks name is stored raw (D-093 6A). The profile route returns 503 on the same outage.
  - Fix: on a port failure, set persistText=false or return 503. Add a test.
  - Side effect: requestHash differs on retry, so the retry gets a 409.
- **M2** (chat.ts:390-393, 412-428). A crisis phrase bypasses the 30 rpm limiter for every write as well: 2 turn rows, a flag, usage and possibly an escalation per request, so the writes are unbounded.
  - Fix: cap persisted or escalated crisis turns per student per window, or dedupe escalation per thread.

## Low
- Fact values are redacted without knownNames, and the key is not redacted (profile-facts.ts:51).
- profileFactsUsed is not redacted. It is empty today.
- A schema-parse failure is not abandon()ed, so the turn lease blocks for 90 s.
- textStored is fixed at thread creation.
- An erased fact is re-proposed.

## OK
- JWT
- the under-18 rule
- tenant scoping
- idempotency
- erasure and export
- indexes
- error mapping

## Test gaps
- A profile outage during a turn.
- An over-long crisis message on the chat route.
- A crisis flood.
