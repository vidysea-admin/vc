# S13 fix round B (AI and voice), D-136

Worktree `D:\vc\.worktrees\vc-completion`. Each finding was written red first (the failing run is noted), then made green. Not touched: chat.ts, chat-threads.ts, profile-facts.ts, db-init.

| # | Finding | Change (file:line) | Tests | Red evidence |
|---|---|---|---|---|
| 1 | voice consent armed only after the readout | `apps/api/src/voice.ts:973,1017,1191,1665` (`readoutPromptId` / `readoutDonePromptId`; armed in `turn_complete` after the sendText readout) | `voice-history.test.ts`: updated "S12 voice: only fresh finalized microphone yes/no..." (old :477 decided on audio alone), new "S13 fix-b: a yes/no spoken before the model finished reading ... changes nothing" | early yes decided and closed the session |
| 2 | promised-outcome floor, KB floor, mid-line draft | `packages/engine/src/student/graph.ts:723` (`PROMISE_PATTERNS`), `:743` (`promisesOutcome`), `:1706` (guardedGuidance), `:1930` (answerFromKb), `isDraftLike` mid-line patterns | `student-graph.test.ts`: promise list (EN and Hinglish), neutral list ("admission is not guaranteed", "Rest assured, I will help..."), 5000-char hostile linear test, KB-injected "visa guaranteed", mid-line "Here is my SOP: Dear ..." | SyntaxError, missing export |
| 3 | Gemini metering and roles | `packages/providers/src/index.ts:615` (`loadGeminiPrice`), `:631` (`reportGeminiUsage`, text and grounded), `:331`/`:363` (`RoleRoutedProvider`, `withRoleModels`); `apps/api/src/index.ts:640-651,672,758` wiring (meter into base, student, classifier, grounded; roles summary on the scribe, answer and router on the student provider); `.env.example` `GEMINI_PRICE_USD_PER_MTOK=` | providers `index.test.ts` 7 new tests; `chat-profile.test.ts` 3 new API tests (usage row sums Gemini tokens; price gives cost, none gives tokens only; `VC_MODEL_ANSWER` moves only answer calls; unset unchanged; bad id names the key) | usage row had 0 tokens; role call stayed on base model |
| 4 | isServedAsk malformed ask | `packages/engine/src/student/claims.ts:90-91` | `claims-guard.test.ts` "S13 fix-b: isServedAsk ..." | TypeError |
| 5 | canonicalPreferenceKey on voice proposals | `apps/api/src/voice.ts:998` | covered by voice-history / voice suites (no regressions) | n/a (low) |
| 6 | per-frame memoryCurrent TTL | `apps/api/src/voice.ts:132` (`FRAME_MEMORY_TTL_MS = 1000`), `:899` (`memoryCurrentForFrame`), `:1665`; output and decision boundaries still call `memoryCurrent` | `voice-history.test.ts` "S13 fix-b: frame-time memory checks are cached for a short TTL..." (100 ms injected policy latency, 40 x 48 KiB frames, no overflow, <= 5 policy calls) | timed out |

Notes: usage is reported before content validation (tokens are spent either way). Without `GEMINI_PRICE_USD_PER_MTOK` only tokens are metered. No model id is set by default; a role key only takes effect when set. Fact extraction runs after the metered turn window, so it is not in the per-turn row.

## Commands and results (all run from the worktree)
- `apps/api`: `npx tsx --test tests/voice.test.ts tests/voice-history.test.ts tests/voice-wiring.test.ts tests/voice-audit.test.ts tests/partner-voice.test.ts tests/main.test.ts tests/index.test.ts` -> 179 pass, 0 fail
- `apps/api`: `npx tsx --test tests/chat-profile.test.ts tests/chat.test.ts tests/chat-usage.test.ts tests/chat-pathlynks.test.ts tests/anonymous-route.test.ts` -> 176 pass, 0 fail (regression sweep for the index.ts wiring)
- `packages/engine`: `npx tsx --test tests/*.test.ts` -> 1959 tests, 1914 pass, 0 fail (45 skip); includes student-graph, lang, student-fact-extractor, claims-guard, routing-probe
- `packages/providers`: `npx tsx --test tests/*.test.ts` -> 225 pass, 0 fail
- `npx tsc --noEmit -p .` in apps/api, packages/engine, packages/providers -> exit 0 each
