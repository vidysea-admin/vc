# S13 ai-engineer review (2026-10-29, D-136)

Fresh read-only ai-engineer review, saved by the main session.

**Verdict: Warning.** No Block.

## Findings
1. **[warning] voice.ts:1631 / :942.** Voice yes/no consent is armed by any mic frame, not by the model having read the question aloud, so a "yes" meant for another question can change a stored preference (see voice-history.test.ts:477).
   - Fix: arm on turn_complete after the readout.
2. **[warning] graph.ts:1660-1669 guardedGuidance.** No deterministic floor against promises: "definitely get admission / guaranteed visa" was served behind the disclaimer via injected memory. Also isDraftLike misses a mid-line "Here is my SOP".
   - Fix: add an English/Hinglish guarantee regex floor.
3. **[warning] Role model config is dead, and Gemini spend is unmetered.** VC_MODEL_* and loadRoleProviderConfig have no production caller. onUsage is reported only for Ollama; Gemini usageMetadata is never read.
   - Fix: wire the roles in (or remove them), and meter Gemini.
4. **[low] claims.ts:84 isServedAsk** throws when citations.web is missing.
   - Fix: guard with Array.isArray.
5. **[low] voice.ts:972.** Voice proposals lack the canonicalPreferenceKey filter that chat.ts:781 applies.

## Verified OK
- The served-claim rule and outage-no-gap.
- The link, email and echo guards.
- The grounded path receives only the redacted question.
- Crisis: 0 model calls in chat.
- Voice finality.
- Voice crisis ordering.
- Model ids.

## Open questions for Umesh
- Is the KB-text injection risk accepted? The claim guard is number-based.
- Should Gemini usage count toward the student and tenant cost caps?

## Re-runs
| Suite | Result |
|---|---|
| engine | 239 |
| providers | 117 |
| api voice | 152 |

tsc is clean.
