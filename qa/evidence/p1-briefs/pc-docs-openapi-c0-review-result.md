# pc-docs-openapi cycle-0 senior review: Warning (head 7019e29)
After the checker verdict (do not edit the bound tree mid-check):
- [medium] docs/partner-integration.md Node proxy: threads.set stores undefined threadId on a failed create (401/429/503) -> every later turn 404s; async Express handler without try/catch hangs on a fetch throw. Fix: set only on 201; try/catch -> 502. (docs-lane edit)
- [low] crisis turns are rate-limit exempt on the student turn route too (chat.ts:652-656 A23); document crisisExempt on that op + one guide sentence.
- [low] undocumented: 405+Allow on student routes (chat.ts:832-834), 403 sandbox_synthetic_only (chat.ts:866), Retry-After: 2 on 409 turn_in_progress.
- [low] public doc names VC_PARTNER_KEY_REQUIRED; say "when the deployment requires a key".
- [low] guide: Origin check is browser-side only; a script without Origin passes; abuse bounded by per-client limit.
K5 test change judged a legitimate placeholder follow-through.
