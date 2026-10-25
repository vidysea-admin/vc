# Verdict (dual check, coordinator A) - w1-chat-privacy
**Cycle checked:** 0
**Unit:** worktree D:/vc/.worktrees/w1-chat-privacy, branch wave/w1-chat-privacy, head 8c6657e (code 8dba0ac), base da2faad
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier L, dual-trigger: security apps/api/src/chat.ts)
**Checked:** 2026-10-25T07:30+05:30 (read from `date -Iseconds`)

VERDICT: FAIL (C1)

In a dual check this verdict has no side effects: findings are PROPOSED-ISSUE lines; qa/issues.jsonl was not touched.

## Commands run (all through vc-testlock, long waits normal)
- apps/api `tsx --test tests/chat-privacy.test.ts` -> 54 pass, 0 fail (matches manifest).
- packages/schemas `tsx --test tests/redact.test.ts` -> 21 pass, 0 fail.
- apps/api `tsx --test` chat, chat-profile, anonymous-route, anonymous-zero-persistence, partners, partner-voice, main, server, voice, voice-history, voice-crisis-turn, acceptance-student-journey -> 408 pass, 0 fail.
- apps/api `tsc --noEmit` -> exit 0. packages/db `tsx --test tests/student-store.test.ts` (importers chat-threads.ts, profile-facts.ts) -> 19 pass, 0 fail.
- Importers of redact.ts (`git grep -l "redactPii|PII_PLACEHOLDERS"`): chat.ts, voice.ts, db chat-threads.ts, db profile-facts.ts; all covered by the runs above.
- Hostile probes (outside the tree, scratchpad chk-cp-A: hostile.test.ts, redact-probe.test.ts, echo.test.ts) importing the worktree's code and the unit's own fixtures. Read-only toward the artifact.

## C1 - FAIL
Held: 25 sequential threads and 20 concurrent threads, every turn 200, state escalated, helpline 14416, one distinct message text, escalations 10, flags 10, chat_turns 20 (cap holds). Same thread, 15 rapid turns: 1 escalation, all answered. The first crisis turn is escalated; another student's first turn is unaffected. Tenant casing ("Tenant-a" vs "tenant-a") is a separate tenant identity (separate token and db scope), not a reset of the same identity. An over-budget student is answered with the helpline, never silently denied.

Failed (hostile variant H3, chat.ts:722-725 `overBudget`/`takeCrisisBudget`): the budget is level-blind. 12 CONCERN turns ("I feel hopeless about my marks") over 12 threads spend all 10 units (10 escalations, 10 flags). The next turn, a real CRISIS ("I want to kill myself") in a new thread, gets the helpline but is NOT escalated and writes no flag, for the rest of the 10 minute window. Before this unit that turn escalated (U8r H1: concern then crisis escalates twice). So "a student's first crisis turn is never blocked" does not hold for the first crisis-level turn; a low-severity burst suppresses a high-severity escalation. H4 (6 threads of concern+crisis, then a 7th-thread crisis): same, 10 escalations, 7th crisis not escalated. The builder tests use crisis text only and never mix levels, so they cannot see this.
PROPOSED-ISSUE (high, safety): spend a separate concern budget; a crisis-level turn needs its own (or reserved) budget so the first crisis-level turn in a window always escalates. Test: 12 concern turns across threads, then one crisis turn -> escalated.

## C2 - PASS (with lows)
Builder tests green; probes: stated names in upper/lower/mixed case, Hinglish ("mera naam priya sharma hai", "Mera naam Priya hai."), names that are common words when capitalised ("my name is Will/Hope Rose/mark."/"call me May"), name + punctuation (`Priya Sharma, 17`, `I'm Priya; ...`), initials ("p. sharma.", "P. S. Sharma!", "i am s. kumar", "i am priya k. sharma") are all redacted. Reply echo with the stated or profile name (any case, possessive, hyphen/underscore/dot joins, initial + surname, "Sharma ji") is redacted.
PROPOSED-ISSUE (low): "i am j.r.d. tata" (initials with no spaces) leaks "tata" (also leaked on base; not the spaced forms ISS-198 names). "my name is priya "pri" sharma" leaks "sharma" (contrived, also on base).
Builder residuals judged: "my name is will" (lower-case common-word name) and "naam hai X" -> PROPOSED-ISSUE low, documented in the redact.ts header, not in C2's listed cases. In-memory 2x window edge -> see C1 note (acceptable, but it doubles the cap at an edge).
Over-redaction check (30 ordinary English/Hinglish sentences): 29 unchanged; 1 changed that is NEW from the lower-case initial rule: "i am b. tech student" -> "i am [NAME] student" (PROPOSED-ISSUE low; over-redaction is the accepted direction, but "B. Tech" is common). "name is required on the form" -> "[NAME]" is on base too.

## C3 - PASS for the stated criterion (with 2 mediums)
The four throw styles pass; nothing is ever stored raw in any probe (malformed returns, hang). 
PROPOSED-ISSUE (medium): a port that RESOLVES a malformed value (undefined, null, [null], value undefined, value 123) is not treated as an outage: chat.ts:556-564 maps only the throw inside the `try`; `facts.map` and the later `/name/i.test`/redact run outside it, so ordinary AND crisis turns return 500 with no helpline (probed: 5 variants, crisis 500, helpline false). A crisis turn must degrade to the profileDown path instead.
PROPOSED-ISSUE (medium): no timeout on `deps.profile.facts`; a never-resolving port leaves a crisis turn unanswered (probed: no response after 3 s). Nothing raw is stored, so the criterion text holds, but "times out" is not handled. (No production port exists yet in main.ts, so impact is latent.)

## C4 - PASS (with a low)
The builder's two tests pass; the escalation input and stored rationale carry no email, phone, stated name or profile name; `escalationText` no longer returns raw (chat.ts:~505). Escalation input and `translatedText` both go through it.
PROPOSED-ISSUE (low): in the pathological fallback (a profile-name token that is itself the crisis wording), the last resort keeps stated and profile names (only email and phone are redacted), so a stated name can reach the classifier. Accepted trade-off in the manifest; a narrower fallback (redact known names except the wording token) would close it.
Builder residual "profile-only name can reach the classifier during an outage" -> PROPOSED-ISSUE (medium-low), pre-existing since U8r, outside this unit's files (engine).

## Other observation (pre-existing, low)
A replay or stored copy of the crisis reply shows "(or [PHONE])" in place of the second helpline number 1800-891-4416, because the stored response is run through redaction (live reply is intact, 14416 survives). Not changed by this unit.

## Not done
Builder mutation tests were not repeated; the failing finding (C1) is a missing case, shown by a direct outcome probe, not by mutation. No full suite, no live LLM, no real Mongo.
