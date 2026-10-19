Do a read-only senior review of branch p1/lk6 in D:/vc/.worktrees/lk6, diff ae48596..c54f7a2. Never edit anything in the repo.
Focus:
(1) packages/engine/src/scribe/nodes.ts, the (c2) section. Can a fabricated or translated quote, or a non-English value, pass the substring and value guards (Unicode normalisation, whitespace, digits)? Does crisisGuard run first on the original text?
(2) packages/db/src/profile-facts.ts. Are the new fields additive and optional? Is the quote redacted? Can a stale quote outlive its value? Any change in behaviour for old rows or old callers?
(3) apps/api/src/chat.ts, voice.ts and index.ts. Is the extraction call only on the stores-text branch? Is the failure swallowed with no student words logged? Is the default extractor wired while an injected one still wins? Any added latency on the reply path (is the extraction awaited before the response)?
(4) Whether the read-only audit proposal script is truly read-only.
Return Approve / Warning / Block with file:line evidence at >80% confidence. Write the result to D:/vc/qa/evidence/p1-briefs/p1-lk6-review-result.md (that one file only).
