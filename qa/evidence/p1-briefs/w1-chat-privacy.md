# Build brief: w1-chat-privacy (/maker build subagent)

**Slug:** w1-chat-privacy. Follow every rule in qa/evidence/p1-briefs/w1-common-rules.md, and read that file first.

- **Tier:** L.
- **Dual check:** required. `dual-trigger: security apps/api/src/chat.ts:<line of the redaction / limiter call>`.
- **Authorized by:** D-112.

## Read first
- The `qa/issues.jsonl` rows for ISS-157, ISS-147, ISS-148, ISS-156, ISS-198 and ISS-152.
- `apps/api/src/chat.ts`.
- The chat redaction helper that chat.ts uses.
- Only the FAILURES and notes sections of `qa/verdicts/p1-u8-chat-api.md` and `p1-u8r-*.md`.

## Acceptance

### C1: repeated crisis turns stay bounded (ISS-157)
- Crisis turns still get the fixed crisis reply immediately.
- They count against a separate, bounded limiter. Repeated crisis phrases must not cause unbounded `chat_turns` writes or escalations.
- A student's first crisis turn is never blocked.
- Test: N rapid crisis turns each get the reply, and the number of writes and escalations is capped.

### C2: the student's name is redacted (ISS-147, ISS-148, ISS-156)
- Redact the student's name from stored `chat_turns` and from replays, in every case those rows name: a lowercase name, the name inside the reply, and name variants.
- Write one test per case.

### C3: redaction fails closed (ISS-198)
- When the profile port throws, redaction fails closed: the turn is stored redacted or refused, never raw.
- Test this with a fake port that throws.

### C4: raw crisis text is not passed on (ISS-152)
- Do not send the raw crisis text onward to `escalateTurns` or the classifier beyond what D-093 6A allows.
- The stored rationale must never restate the raw text.
- The test asserts that the stored rationale contains none of the raw phrase.

## Regression
- Test files: chat, chat-privacy, chat-profile, anonymous-route, anonymous-zero-persistence, partners, partner-voice, main and server.
- Typecheck: tsc for apps/api.
