# Verdict - p1-lk1w (Mode A, cycle 0)
Cycle checked: 0
Bound to: D:/vc/.worktrees/lk1w (branch p1/lk1w). Judged range 5310e8f..e13f850 (2819876 is the qa-only manifest commit). Policy-Version: proportional-verification/2026-10-19.17. Checker: claude-sonnet-subagent, fresh context.
Evidence dir: qa/evidence/p1-lk1w-check/ (outcome test, jsonl, run logs, one before/after log per falsification).

## Check plan (step 0)
Logic/config diff, tier L (config/flags: VC_TEXT_CHAIN selects the provider for student chat and anonymous chat), no UI, no data artifact, no prompt change, no auth/tenancy/prod-write change, so one checker (Dual check: no confirmed from the diff). Instruments: (1) manifest pre-checks re-run one file at a time under the lock; (2) checker-owned outcome test driving the real startApi over loopback HTTP with fetch stubbed (synthetic Ollama and LiteLLM hosts answered by the stub, any other host blocked and recorded: 0 blocked); (3) one falsification per criterion in a throwaway copy outside the bound tree; (4) step 4c diff-scope read; (5) .env.example scan.
TIER: L (dispatched floor kept; `apps/api/src/index.ts:269-270` config/flags selection, no tier change).

## Step 3 - pre-checks re-run (lock slot 1, TMP/TEMP on D:, `timeout 600`, unpiped, one file at a time)
chat-profile 14/14 pass; anonymous-route 18/18; index 8/8; server 34/34; voice-wiring 16/16; engine concern-classifier 23/23; `tsc --noEmit` apps/api exit 0; `pnpm run typecheck` packages/engine exit 0. All match the manifest's counts.

## Outcome proof (outcome.test.ts, 11/11 pass on the bound tree, `outcome-run.txt`)
- Chain UNSET (O1): chat, anonymous and scribe answered via litellm `/chat/completions` model main-model-x; classifier via litellm model classifier-model-x; Ollama calls 0.
- Chain SET default (O2): chat -> exactly 1 Ollama `/api/chat` call, model glm-5.3-flash; anonymous -> the same; litellm calls during the chat turn are classifier-only. Scribe and classifier stay on litellm (main-model-x and classifier-model-x), Ollama calls 0. DeepSeek-first order (O3): first hop is deepseek-v4.1-flash for chat and anonymous.
- First hop 503, 500 or hang (hop timeout 400 ms, deadline 5000 ms) (O4): second hop answers, chat and anonymous both `ok`, call order [glm, deepseek], 43-707 ms.
- Both hops 503 (O5, informational): bounded (<=107 ms), HTTP 200 with the existing apology text, no hang.
- Crisis (O6), 3 texts (English, Hinglish, "end my life"), chain set: anonymous `escalated` with message === ANONYMOUS_CRISIS_MESSAGE, chat `escalated` with STUDENT_CRISIS_MESSAGE, Ollama calls 0 and model calls 0 (anonymous), Ollama 0 and litellm 0 (chat).
- Hostile config (O7), 14 cases: OLLAMA_API_KEY missing or blank, unknown-price model, `,`, `ollama:`, no prefix, `gemini:`, `;` separator, upper-case prefix, hop timeout abc/0, deadline -5/1.5, VC_LLM_PROVIDER=ollama: every one refuses with connected=0 and the client factory never called; no error name/message/stack/cause contains either secret value (the env carried invented secrets). Blank, whitespace-only and `default`/`DEFAULT`/` default ` are tolerated by design (O8).
- Classifier base (O9): an ollama chain config throws "not a classifier base (D-105 Q4)"; litellm (chain dropped, model swapped) and mock bases still work.
- `.env.example`: added non-comment lines are `VC_TEXT_CHAIN=`, `OLLAMA_API_KEY=`, `VC_TEXT_CHAIN_HOP_TIMEOUT_MS=`, `VC_TEXT_CHAIN_DEADLINE_MS=`, `OLLAMA_BASE_URL=`, all empty (lines 78/80 confirmed with `cat -A`); no non-empty value for any KEY/SECRET/TOKEN/PASSWORD name and no 32+ char token in the file; both chain orders present (count 2).

## Criteria
- C1 MET (O1/O2, maker chat tests; falsified). C2 MET including the crisis half (O6; the crisis half the manifest called unfalsified is now falsified). C3 MET (scribe and classifier on litellm with the chain set; falsified at both sites). C4 MET. C5 MET. C6 MET.

## Falsification (4b, copy at D:/chk-lk1w/copy outside the bound tree, green-before from the copy, restored and cmp-verified; logs `fals-<id>-before/after.txt`)
| id | edit (single hunk) | green -> red, assertion that fired |
|---|---|---|
| C1 | index.ts chat `provider: httpSetup.studentProvider` -> `httpSetup.provider` | 1/1 -> 0/1, "the chain hop was called" |
| C2 | index.ts anonymous `studentProvider` -> `provider` | 1/1 -> 0/1, "the chain hop was called" |
| C2 crisis | student/graph.ts `if (guard.level === "none") return {};` -> `if (true) return {};` | O6 and the maker's anonymous crisis test both green -> red ("chat crisis #0: zero chain calls"; strict-equal on the crisis state) |
| C3a | index.ts scribe wiring `provider: httpSetup.provider` -> `studentProvider` | O2 green -> red, "scribe + classifier never reach the chain" |
| C3b | index.ts classifier base -> `httpSetup.studentProvider` | O2 green -> red, same assertion |
| C4 | concern-classifier.ts ollama guard -> `if (false as boolean)` | 1/1 -> 0/1, "Missing expected exception" |
| C5 | index.ts `textChain = undefined` | maker bad-chain test and O7 both green -> red ("startApi started, but it must have refused") |
| C6 | grep of the order pattern in .env.example (maker's drop-line mutant, re-derived by reading the file) | 2 present, one per order |
Setup failures excluded: the first O6 run failed on my own wrong constant (TELE_MANAS_LINE vs the crisis message); fixed in the instrument, rerun, run2 log shows it.

## Step 4c diff scope
Changed files: .env.example, apps/api/src/index.ts, packages/engine/src/guards/concern-classifier.ts, 4 test files; all in "What changed". No function, export, route, test or config key is deleted or renamed. Candidates (.13-8): `concernClassifierProviderConfig` has one product caller (index.ts:273) and one test file; `createProvider(` siblings are apps/web/src/server/runtime.ts (no student surface, not affected) and index.ts:262 (scribe base, intentionally unchanged). `loadTextChainConfig` untouched (LK1).

FAILURES: none.
CAPABILITY-COVERAGE: 8/8 falsification rows reproduced red with the named assertion firing.
LIVE-BROWSER: not-applicable (api and config only).
ISSUES-WRITTEN: none.

PROPOSED-ISSUE: {"sev":"low","type":"process","title":"p1-lk1w manifest fails tick.mjs --lint-manifest: no-pre-check (Pre-check lines not parsed), tests-not-run (final.sh does not name the test files), mutant-cap (mutants=7 counts the 6-criteria floor falsifications, which are not .9-4 mutants), round-est-unparsed, no '## Test selection (haiku)' section","where":"qa/manifests/p1-lk1w.md:30,39-46,56"}
PROPOSED-ISSUE: {"sev":"low","type":"process","title":"Hung PID 47984 (maker first run) still holds test-lock slot 0 (owner PID 36944); only slot 1 is usable, so units queue behind each other. Needs a human or owner to clear it; this checker did not touch it","where":"C:/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock/owner"}
PROPOSED-ISSUE: {"sev":"low","type":"wording","title":"Refusal messages repeat the class name, e.g. 'OllamaRefusedError: OllamaRefusedError: OLLAMA_API_KEY is required...' (message prefix plus name); cosmetic, in packages/providers","where":"packages/providers/src/index.ts:1163-1165"}
PROPOSED-ISSUE: {"sev":"low","type":"observation","title":"When both chain hops fail the student surfaces return HTTP 200 state ok with the apology text (existing retryable-apology behaviour, bounded by the deadline); no fallback to the VC_LLM_* provider by design. Product decision for LK9, not this unit","where":"qa/evidence/p1-lk1w-check/outcome.jsonl (O5)"}

EXPLANATION: With fetch stubbed, VC_TEXT_CHAIN selects the Ollama chain for student chat and anonymous chat only, in config order, with failover on 5xx and timeout inside the deadline, and unset leaves every surface on the VC_LLM_* provider; the scribe and the classifier never reach the chain, and an ollama classifier base is refused. Bad chains (missing hop key, unknown price, malformed value) fail before connect with no secret value in the message, crisis text makes zero chain calls and returns the fixed reply, and `.env.example` holds names only. Every criterion was falsified red in a copy; the only gaps are manifest lint and process findings, none of which is a product defect.

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0/0 invariants (contract rows cited are D-105/B13; B13 holds: no network call, all hosts synthetic, 0 blocked)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-19T20:27:42+05:30 end=2026-10-19T20:55:55+05:30 wall_min=21 agent_min=21 blocked_min=7 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1700 mutants=3 defects_unit=0 defects_6c=0
