# You are a /maker build subagent: U8 repair unit p1-u8r (privacy/redaction + crisis flood), tier L
- S = C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad. Worktree: `git -C D:/vc worktree add S/p1-u8r -b p1/u8r b1aadea` (p1/u8 at the coordinator-A verdict; code == e2b805d). Work ONLY there. Never `git add -A`. Never touch .claude/**. Do NOT push. Do not edit qa/contracts.
- Policy proportional-verification/2026-10-18.15. New manifest qa/manifests/p1-u8r-chat-privacy.md (Policy-Version pinned, tier L, `Dual check: required` with `dual-trigger: security <file:line>` citing the redaction/persistence site you change).
- Read: D:/vc/qa/evidence/p1-briefs/p1-u8-review-result.md; in the worktree qa/verdicts/p1-u8-chat-api.md (A) and qa/verdicts/p1-u8-chat-api.b.md (B). Gates: D-093 6A (persist redacted), 4A (unconsented minor: no text), D-096/D-097.

## Fix (failing test first for each)
1. M1, apps/api chat.ts ~401-413: name redaction fails OPEN when profile.facts throws. Fail CLOSED: do not persist turn text (text-free marker) or return 503; never store unredacted text.
2. M2, chat.ts ~390-428: crisis messages bypass the limiter, so writes and escalations are unbounded. Keep the helpline response always available, but cap or dedupe crisis WRITES and escalation records per student per window (e.g. at most 1 escalation per thread per 10 min; extra crisis turns still get the helpline text). Keep crisis detection BEFORE the limiter.
3. A1: lowercase self-introductions ("my name is devika nair", "i am kabir") are stored verbatim. Extend name redaction to lowercase intro phrases without over-redacting ("i am tired", "i am from delhi" must survive; add negative tests).
4. A2: a name the student stated earlier is not redacted in the model reply. Redact known/stated names in assistant text before persistence and replay.
5. B medium: the stored crisis escalation rationale (up to 500 chars) can restate raw text. Store a redacted rationale and never raw student text.
- Lows only if trivial, each with a test: fact `key` redaction; profileFactsUsed redaction.
- Tests through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (2 slots now; long waits are normal): the api, db and schemas packages you touch, plus typecheck of every touched package. No full suite. One falsification per fixed item, in a throwaway COPY (green before, red after, restored).

## Finish
Manifest: criteria C1..C5 (one per fix), Round line, Pre-check[<id>] lines on the final sha, Tests[<id>] lines, falsifications, Metrics, Status: ready-for-check. Run `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --lint-manifest <manifest>` (exit 0). Commit narrow pathspecs. Return ONE line: `p1-u8r-chat-privacy <sha> ready`.
