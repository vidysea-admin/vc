# S13 security review (2026-10-29, D-136)

Fresh read-only senior-software-engineer review, saved by the main session.

**Verdict: Warning**

## Findings
- **[medium] chat.ts:1100 with chat-threads.ts:391-441.** A crisis turn can lose its helpline reply. A memory-policy or memory-decision change between stage and release makes completeChatTurn throw ChatTurnMemoryChanged, which returns 409 with no helpline text, after escalation has already fired. Proven by a test.
  - Fix: for crisis, catch the error, abandon, and still respond 200.
- **[low] untracked files that must not be committed** (all now in .gitignore, main session):
  - qa/.delivery/completion-mongo-data/ (a 307 MB mongod directory)
  - qa/.delivery/s13-host-build-temp/
  - qa/.delivery/completion-host-link.json (a synthetic local partner key)
  - qa/evidence/s13-real-* (real-account screenshots)

## Open questions
- Voice runs a memoryCurrent DB check on every frame, with no cache.
- The breaker is shared between anonymous and authenticated traffic.
- KB query strings carry student text in the URL; the KB side must not log them.
- A crashed memory-policy update leaves memory off for that partner (fail-closed), with no reset path.

## Verified clean
- authz and tenant isolation: hostile cursors, cross-student, cross-tenant, a minor without consent
- admin memory policy
- no student text in logs or URLs; the widget uses no storage
- voice token handling
- widget config parsing
- the secret scan of 821 untracked files

## Tests
| Suite | Result |
|---|---|
| api (17 files) | 638/639 (C16 load flake; 67/67 alone, twice) |
| widget | 121 |
| web | 86 |
| db | 204 |
| providers live | 75 |
| schemas | 20 |

tsc is clean.
