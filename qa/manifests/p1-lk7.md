# Manifest — p1-lk7
**Contract:** D-105 (model language detection on the cheap chain, model safety screen next to the crisisGuard floor, Q4 per-task chain move); brief `qa/evidence/p1-briefs/lk7-wire.md`; manifests `p1-lk4` (detector, risk 1) and `p1-lk5` (screen, risks 1, 2, 4); A15b / B24.6 (open conflict, see Open risk 1); LK1w (the chain) and LK1 (`beforeRequest` / `onUsage` / `onExhausted` hooks in `createProvider`)
**Criteria:**
- L1 authenticated chat path: when `VC_TEXT_CHAIN` is set, the language of a turn comes from the model detector (`createModelLanguageDetector` over the chain provider) and reaches the answer call as `replyLang`
- L2 with no chain the model detector does not exist: the offline script test only, and the base provider is never asked to classify a language
- C1 `crisisGuard` still runs first on the original text: a crisis turn makes no detector, screen or chain call and gets the fixed message
- S1 the LK5 `safetyScreen` is wired into the authenticated chat graph, ON by default; "possible" returns the fixed crisis message; the screen sees the original text with `guardLevel: none`
- S2 a clear screen releases the answer; a screen outage fails closed to the fixed crisis message (D-105)
- S3 the screen runs on the concern classifier's base provider, never on the chain (D-105 Q4: the classifier moves only after its own eval)
- S4 `chat.safetyScreen = false` turns it off; a supplied provider is the one used
- A1 anonymous route unchanged by default: no screen, no model language detector (also with the chain set); A2 `VC_ANONYMOUS_SAFETY_SCREEN=true` turns the screen on for anonymous turns (provider = classifier base, original text, "possible" = fixed answer); A3 crisis text still bypasses the screen; A4 the flag reads like the other flags (unset / empty / "false" off, exactly "true" on, else a config error); A5 `buildAnonymousGraphDeps` passes a screen only when supplied and marks it on for anonymous
- P1 `VC_TEXT_CHAIN` set and `VC_CHAIN_MONTHLY_CAP_USD` missing or invalid (empty, 0, negative, NaN, Infinity, 1e999, hex, "5 USD", "1,5", "50;") -> `startApi` refuses with `ChainSpendCapError` naming the variable, before connecting; P2 a valid cap starts; with no chain no cap is needed
- G1 the spend guard reserves each request's upper-bound cost before it is sent, refuses one that would pass the cap with a NON-retryable error (no failover to the next hop), logs one text-free line per month; G2 the cap is per UTC calendar month, resets, and a usage settled after the month turned does not touch the new month
- E1 cap exhausted mid-month: student turns get the existing degraded reply (HTTP 200, `PROVIDER_APOLOGY_TEXT`), no request leaves after the stop, spend never passes the cap, never a 500; E2 a reported token usage settles the reservation to the actual figure
- R1..R4 (fix cycle 1, checker finding 1): chat on + safety screen on + a screen provider of kind `rules` (no concern-classifier handling) -> `startApi` REFUSES with `ChatConfigError` (names the screen and `concern-classifier`, no key), before connecting; R2 the same base starts with `chat.safetyScreen = false` or with chat off; R3 the screen's own provider is what is checked (a rules base with a capable `safetyScreen.provider` starts; a rules screen provider over a mock base refuses); R4 a classifier-capable base starts and an ordinary question is answered, not escalated
- X1 `onExhausted` is wired: a fully failed chain is the degraded reply, the default failover alert still fires, and the exhaustion is counted (`Api.chainSpend().chainExhausted`)
**Goal task:** none
**Date:** 2026-10-21
**Status:** ready-for-check
**Fix cycle:** 1
**Policy-Version:** proportional-verification/2026-10-19.17
**Tier:** L (safety path wiring: the screen and the detector sit on every authenticated student turn; plus a spend cap)
**Dual check:** no. No security trigger line applies (no JWT / auth, crypto, tenant-isolation or PII-store change; the screen and detector are call-site wiring over engine code that already passed its own checks). A second look at the crisis-adjacent paths (S1, S2, C1, Open risk 3) is the orchestrator's call.
**Persona walk:** skip (no human screen)
**Issues addressed:** none (new unit)
**Executor:** claude-sonnet-subagent (maker/builder lk7-wire)
**Executor rationale:** one coherent change in the two files the brief names (`apps/api/src/index.ts`, `apps/api/src/anonymous.ts`) plus a 7-line pass-through in `chat.ts` that has no other way to reach the graph deps.

## What changed
Branch `p1/lk7` from `origin/main` `a11653e`, worktree `D:/vc/.worktrees/lk7`. Code commit `6d7ecdc`; this manifest and `qa/evidence/p1-lk7/` are a later commit. Nothing merged or pushed.
- `apps/api/src/index.ts` (in place): new exports `CHAIN_MONTHLY_CAP_ENV`, `ChainSpendCapError`, `ChainBudgetExhaustedError`, `parseChainMonthlyCap`, `createChainSpendGuard` (+ types), `StartApiSafetyScreenOptions`. `startApi`: after `loadTextChainConfig` (so a missing `OLLAMA_API_KEY` still reports first) it requires a valid `VC_CHAIN_MONTHLY_CAP_USD` (fail closed, before anything connects) and builds the chain with `createProvider(textChain, { beforeRequest, onUsage, onExhausted })` from one guard (the line was at index.ts:~195 on main, brief said ~270). `screenBaseProvider` = the concern classifier's provider (`classifierProvider ?? provider`). Chat: `chatGraph = { detectLanguage (only when the chain is set), replyLangs: parseReplyLangs(VC_REPLY_LANGS), safetyScreen: { provider, authenticated: true, anonymous: false } }` handed to `createChatApi`. Anonymous: `safetyScreen` passed to `createAnonymousApi` only when `VC_ANONYMOUS_SAFETY_SCREEN=true`; no detector. `Api.chainSpend()` returns `{ month, capUsd, spentUsd, capRefusals, chainExhausted }` when the chain is set. New option `http.chainSpend` (`now`, `log`) for tests; new `chat.safetyScreen` (`false` or `{ provider, timeoutMs, blockAt }`).
- `apps/api/src/anonymous.ts` (in place): `ANONYMOUS_SAFETY_SCREEN_ENV`, `anonymousSafetyScreenFromEnv`, `AnonymousApiDeps.safetyScreen`, `buildAnonymousGraphDeps` passes it as `{ ...screen, anonymous: true, authenticated: false }`. No language-detector option on purpose.
- `apps/api/src/chat.ts` (in place, 7 lines, NOT in the brief's ownership list): `ChatApiDeps.graph?: Pick<StudentGraphDeps, "detectLanguage" | "replyLangs" | "safetyScreen">`, spread into the cached graph deps of every variant. Needed: `graphDepsFor` builds the deps and offers no other seam.
- `.env.example`: `VC_CHAIN_MONTHLY_CAP_USD`, `VC_ANONYMOUS_SAFETY_SCREEN`, `VC_REPLY_LANGS` (names only).
- Tests: `apps/api/tests/chat-profile.test.ts` (+14 LK7 tests), `anonymous-route.test.ts` (+5), `anonymous-fixtures.ts` (`stubOllamaRouted`, `chainRequestInput`, `CHAIN_ENV` gains the cap, `kbAnswerProvider` gains a clean `concern-classifier` response so existing startApi chat tests keep passing now that the screen is on).
- Protected test change (one): `chat-profile.test.ts` "LK1w: VC_TEXT_CHAIN set -> a student chat turn is answered by the chain ..." asserted `scribe.calls.length === 0`; the screen now runs on that provider (S3, by design), so it asserts instead that no call other than `concern-classifier` reached it. The anonymous twin is unchanged (its screen is off).

## Decisions taken (own calls, stated)
1. Screen provider = the concern classifier's base provider, not the chain (D-105 Q4: a task moves to the chain only after its own eval; LK9 has no data yet). Side effect that matters: a cap stop on the chain does NOT turn every healthy turn into a crisis message through a dead screen.
2. Model detector only when the chain is set; with no chain the base provider would be asked to classify every language, which is a new cost and a behaviour change nobody approved.
3. The cap settles DOWN to the reported actual (unlike the eval ledger in `packages/engine/evals/budget.ts`, which keeps the reservation): a production month counted at the 2048-token worst case would trip about 20x early. Unreported usage and failed requests keep their reservation (fail closed).
4. The authenticated screen is on by default in `startApi` (D-105, LK5 "default ON"); opt-out is in code only (`chat.safetyScreen = false`).

## Tests
Run in `D:/vc/.worktrees/lk7`, `TMP`/`TEMP` on `D:/tmp-lk7/tmp`, each through `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh timeout 600 pnpm -C D:/vc/.worktrees/lk7/apps/api exec tsx --test --test-timeout=60000 <file>`. `node_modules` came from `pnpm install --offline --frozen-lockfile --ignore-scripts`. Tree for all green runs is `6d7ecdc` code (the later commit adds only qa files).
Tests[L1]: tests/chat-profile.test.ts "LK7 L1: ..." (stub on the chain wire: one `lang-detect` request carrying the text; the answer request's input has `replyLang: "hi-Latn"` for text the offline test reads as `en`)
Tests[L2]: "LK7 L2: ..." (no chain: no Ollama request, no `lang-detect` on the base provider)
Tests[C1]: "LK7 C1: ..." (crisis text with chain + screen configured: 0 chain requests, 0 base-provider calls, `escalated` + `STUDENT_CRISIS_MESSAGE`)
Tests[S1]: "LK7 S1: ..." ('high' -> escalated + fixed message; the classifier call's input `text` is the original, `guardLevel` none)
Tests[S2]: "LK7 S2: ..." (clear -> ok; classifier throws -> escalated + fixed message)
Tests[S3]: "LK7 S3: ..." (chain set: classifier call on the base provider, answer on the chain, no chain request carries the concern prompt) and the amended "LK1w ... injected scribe/classifier provider is not called"
Tests[S4]: "LK7 S4: ..." (`safetyScreen: false` -> 0 classifier calls; own provider used, base not called)
Tests[A1..A5]: tests/anonymous-route.test.ts "LK7 A1".."LK7 A5" (default off even with a 'high' classifier and the chain set; flag on -> 1 classifier call with the original text and `escalated`; crisis with flag on -> 0 calls; flag parse table; deps shape)
Tests[P1,P2]: "LK7 P1: ..." (13 bad values, each: `ChainSpendCapError`, message names the variable, no key, `connect` never called) and "LK7 P2: ..."
Tests[G1,G2]: "LK7 G1: ..." / "LK7 G2: ..." (guard unit: reserve, exact-cap allowed, refusal is `ChainBudgetExhaustedError` and `isRetryableProviderError` false, reserves nothing, one log line; month rollover and late settle)
Tests[E1,E2,X1]: "LK7 E1: ..." (cap 0.03, five turns over real HTTP: all 200, first served, later ones the apology, request count frozen after the stop, spend <= cap, text-free log), "LK7 E2: ..." (same cap with reported usage: five turns all served), "LK7 X1: ..." (every hop 503: apology, `provider_failover_exhausted` still printed, `chainExhausted >= 1`)
Red-before[all]: base `a11653e` baseline green first (`qa/evidence/p1-lk7/base-*.txt`: chat-profile 21 passed 0 failed, anonymous-route 18/0); tests only -> both files fail to load on the missing exports (`red-*.txt`, 1 failed each); with only the guard and the anonymous flag helpers in, behaviour tests are red: chat-profile 35 tests 8 failed (L1, S1..S4, E1, E2, X1), anonymous-route 23 tests 1 failed (A2) (`red2-*.txt`)
Pre-check[L1]: 6d7ecdc tests/chat-profile.test.ts -> green: 35 tests, 35 passed, 0 failed (`g2-chat-profile.txt`)
Pre-check[L2..X1]: 6d7ecdc same command, same run (`g2-chat-profile.txt`) -> 35 passed, 0 failed
Pre-check[A1..A5]: 6d7ecdc tests/anonymous-route.test.ts -> green: 23 tests, 23 passed, 0 failed (`g1-anonymous-route.txt`)
Pre-check[no regression]: 6d7ecdc `tsx --test "tests/*.test.ts"` over all of apps/api -> green: 391 tests, 391 passed, 0 failed (`g3-full-api.txt`); `pnpm -C apps/api exec tsc --noEmit` -> exit 0 (`tsc-api.txt`; `tsconfig` includes `src` only). `packages/engine` and `packages/providers` are untouched, so their suites were not re-run.

## Capability coverage (one or two falsifying edits per criterion in a detached throwaway worktree of `6d7ecdc` at `D:/tmp-lk7/fals`; the bound tree was never edited)
Baseline in the copy = the green runs above. Each row: tests failing after the edit; the file was restored with `git checkout` after every row (copy clean at the end). Driver output `qa/evidence/p1-lk7/falsification.txt`, per-row logs not kept beyond that table.
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-L1 | L1 | detector no longer handed to the chat graph | chat-profile 1 fail of 35 (L1) |
| F-L2 | L2 | detector built even with no chain | 1 fail (L2) |
| F-C1 | C1 | engine crisis node never short-circuits (`graph.ts`, copy only) | 2 fail (C1, p1-lk6 crisis test) |
| F-S1 | S1 | screen not handed to the chat graph | 4 fail (S1, S2, S3, S4) |
| F-S3 | S3 | screen on the chain provider | 4 fail (S3, LK1w, E1, X1) |
| F-S4 | S4 | `false` ignored | 1 fail (S4) |
| F-P1 | P1 | cap constant, not read | 2 fail (P1, E1) |
| F-P1b | P1 | cap parsed with `Number()` | 1 fail (P1) |
| F-G1 | G1 | guard never refuses | 3 fail (G1, G2, E1) |
| F-G1c | G1 | guard reserves nothing | 4 fail (G1, G2, E1, E2) |
| F-G2 | G2 | month rollover keeps spend | 1 fail (G2) |
| F-E2 | E2 | usage no longer settles | 2 fail (E2, G1) |
| F-E1 | E1 | `beforeRequest` not wired into `createProvider` | 2 fail (E1, E2) |
| F-X1 | X1 | `onExhausted` not wired | 1 fail (X1) |
| F-A1 | A1 | anonymous screen forced on | anonymous-route 2 fail of 23 (A1, LK1w anonymous) |
| F-A2 | A2 | anonymous screen never wired | 1 fail (A2) |
| F-A5 | A5 | anonymous deps mark the screen off | 2 fail (A2, A5) |
| F-AD | A1 | model detector added to the anonymous graph deps | 2 fail (A1, A5) |
All 18 killed, 0 survivors. Not falsified: that `ChainBudgetExhaustedError` is non-retryable depends on `isRetryableProviderError` in `packages/providers` (asserted in G1, not edited in a copy).

Metrics: start=2026-10-21T12:10:19+05:30 end=2026-10-21T12:31:30+05:30 builder_min=21 wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=1 repeat_runs=0 mutations=18 survivors_final=0 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 lane=normal check_s=unavailable mutants=18 defects_unit=0 defects_6c=0

## Fix cycle 1 (checker FAIL e4d93d6, finding 1)
Defect: with the authenticated screen ON (default) and a base provider that cannot serve `concern-classifier` (RulesProvider), every authenticated turn returned the fixed crisis message while `startApi` started normally.
Fix, in place at `apps/api/src/index.ts` (the `chatScreenOption` block, before `connectFromEnv`): when chat is enabled and the screen is on and the screen's provider (`chatScreenOption.provider ?? screenBaseProvider`) has `kind === "rules"`, throw `ChatConfigError` (fail closed, nothing connected). The capability check is the provider's `kind` only: no network probe at startup. No env kill switch (fail-open under D-105; needs Umesh). `chat.safetyScreen = false` unchanged. Code commit `d55bbad` (index.ts +12 lines, chat-profile.test.ts +4 tests).
Tests[R1..R4]: tests/chat-profile.test.ts "LK7 C1-fix R1".."R4" (helper `startOverBase`)
Red-before: R1 and R3 failed on `6d7ecdc` code with the new tests (R2, R4 hold the unchanged behaviour: already green, by design); R3 and R1 are also killed by F-R1 below.
Pre-check[R1..R4]: d55bbad `tsx --test tests/chat-profile.test.ts` -> 39 tests, 39 passed, 0 failed (`c1/g-chat-profile.txt`)
Pre-check[no regression]: d55bbad `tsx --test "tests/*.test.ts"` over apps/api -> 395 tests, 395 passed, 0 failed (`c1/g-full.txt`); `tests/anonymous-route.test.ts` -> 23 tests, 23 passed, 0 failed (`c1/g-anon.txt`); `pnpm -C apps/api exec tsc --noEmit` -> exit 0 (`c1/tsc.txt`)
Falsification (detached copy of d55bbad, restored after each row; summary `c1/falsification-summary.json`):
| id | crit | falsifying edit | result |
|---|---|---|---|
| F-R1 | R1 | refusal never fires | 2 fail of 39 (R1, R3) |
| F-R2 | R2 | refuses even with `safetyScreen = false` | 1 fail (R2) |
| F-R3 | R3 | ignores the screen option's provider | 1 fail (R3) |
| F-R4 | R4 | refuses every provider kind | 17 fail (R3, R4, C1, E1, E2, L1, L2, S1-S4, X1 ...) |
| F-R5 | R1 | check guarded by `!chatSetup` (never runs on the chat path) | 3 named fails (R1, R2, R3); the run ended without a TAP summary, the named failures are what is counted |
All 5 killed, 0 survivors.
Metrics (cycle 1): start=2026-10-21T12:52:49+05:30 end=2026-10-21T13:22:13+05:30 mutations=5 survivors_final=0 cycle=1 defects_unit=1

Non-blocking risks from the verdict (recorded, not fixed here):
- (verdict 2) an outage burns the cap: every failed request keeps its upper-bound reservation (about USD 0.0097 each at the placeholder prices; 12 turns against 503 hops used 97% of a 0.05 cap), so chat can stay degraded after the provider recovers until the UTC month turns or the process restarts. Needs the settled/durable counter follow-up. An operator alert on `chain_cap_exhausted` belongs in the go-live runbook.
- (verdict 3) a runtime screen outage (classifier down, wrong key, timeout) is logged as `chat_write_failed` with `write: "safety_screen"`, text-free, and every student then gets the crisis message by design (D-105). An alert on that event is the only way anyone learns of it; it belongs in the go-live runbook.
- The startup refusal covers the `rules` kind only. A base `mock` provider with no `concern-classifier` response, or a real provider with a wrong model, key or a down proxy, still starts and then fails closed at runtime (see the previous point); a startup probe was ruled out by the brief.

## Open risks / not determined
1. A15b / B24.6 versus D-105 stays open and is NOT decided here. Anonymous: the screen is behind `VC_ANONYMOUS_SAFETY_SCREEN` (default off) and the model detector is not wired at all. The anonymous route still sends text to a model for the LK5 English query rewrite of a non-English turn and for the answer, as before.
2. (cycle 1: the `rules` case is now a startup refusal, see above.) `VC_CHAT_ENABLED=true` needs a REAL concern-classifier provider. Other incapable providers (wrong key, down proxy, a mock) still fail closed at runtime with the crisis message. The only opt-out is in code (`chat.safetyScreen = false`); an env kill switch is fail-open under D-105 and needs Umesh. The chat go-live gate (A20) does not check this.
3. LK5 risks 3 and 4 stand: "possible" = severity at or above `high`; the default 8 s screen timeout against a slow classifier provider means crisis messages to healthy students. Needs LK9 latency data before it is switched on in production.
4. The cap lives in one process: not persisted, not shared. A restart or a second replica starts the month at zero, so the effective ceiling is `cap x replicas x restarts`. A durable counter needs a `packages/db` collection and is a separate unit.
5. A request that fails after it was sent (timeout, 5xx) keeps its full reservation (no hook says it was cheaper), so a long chain outage burns the cap faster than real spend. At the table's prices that is about USD 0.01 per failed hop. A cap stop is also all-or-nothing for the chain: the language detector, the rewrite and the answer all fall back at once (offline language, original-text search, the apology).
6. Prices are the `[ASSUMPTION - UNVERIFIED]` placeholders in `OLLAMA_PRICE_TABLE_USD_PER_MTOK` (or the `OLLAMA_PRICE_USD_PER_MTOK` override), so the cap is only as true as those. Hosted-key usd is notional.
7. The cap is one global figure: no per-tenant or per-student share, so one heavy student can use it up for everyone.
8. Voice is not wired: `voice.ts` still takes its language from `detectLanguageOffline` and has no screen. The brief named chat and anonymous only.
9. `VC_REPLY_LANGS` is now read by `startApi` for chat (default en, hi, hi-Latn, as the graph's own default), so a dropped entry prints one `console.warn` at start. The anonymous route does not get the allow-list option.
10. `chat.ts` was touched although the brief names only `index.ts` and `anonymous.ts` as this unit's files; if another unit edits `chat.ts` the 7-line hunk may need a hand merge.
11. Review: a `senior-software-engineer` pass is due (the orchestrator's single checker); I did not self-review.
