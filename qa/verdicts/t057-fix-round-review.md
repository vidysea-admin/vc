# T-057 fix round review (2026-10-29)

Two fresh read-only reviewers ran: senior-software-engineer and ai-engineer. The main session recorded their verdicts.

## SSE: Warning
- **[medium, safety]** `apps/api/src/chat.ts:993-1013`. The deadline race returns PROVIDER_APOLOGY_TEXT even when the model safety screen has already returned "possible". `finish` (graph.ts:960-967) is the only place that swaps in the crisis message, so a student in distress gets "try again". Fix: when the deadline fires, consult or await the screen verdict. If it is "possible", return the crisis/helpline reply. Add a test with the screen stubbed to "possible" and the answer hung.
- **[medium]** VC_KB_TIMEOUT_MS=25000. The reviewer read D:/vc/.env, but the API loads the worktree .env, which main already set to 8000. In code, /search is still uncapped (only /ask is capped).
- **[low]** The abandoned graph keeps running after the deadline: late recordGap, flag writes, unmetered spend. Known limitation; AbortSignal is backlog.
- **[low]** The service rules return "I don't know that page yet" when the catalogue is unsynced. They should fall through to the KB.
- **[low]** cleanCopy leaves bare domains and emails in place.
- **[low, scope]** Two changes in the Vidysea next.config.mjs are not demo-gated: microphone=(self) on /student/* and the widget script-src origin. They come from D-126 and need product sign-off for prod.

## AI engineer: BLOCK on Lane D (services). Lane A Warning, Lane C Approve, VF config Approve
I ran a probe (scratchpad probe/run.mts): classifyIntent + navigateSteps against a synthetic 7-service catalogue.

**These KB questions are wrongly routed to navigate_steps:**
- "Do you have scholarships for Canada?"
- "What services does the university offer for international students?"
- "Can you help me understand visa requirements for Germany?"
- "How long does test preparation for GRE take?"
- "Can you help me choose between CBSE board and ICSE?"
- "Can you provide the visa fee for UK?"

**These return the wrong service or none:**
- "help me with visa for study abroad" returns Counselling (tie on study/abroad).
- "Do you help with GMAT?" returns the Help page.
- "What services do you offer?" returns only /services, with no list.

**Causes:**
- classify.ts:224 rule A uses a loose verb set, a 40-char gap and no end anchor.
- classify.ts:225 has a bare `test prep` alternative.
- classify.ts:226 has no "you/Vidysea" subject.
- graph.ts:1110 returns NAVIGATE_UNKNOWN_TEXT instead of falling through to the KB.
- In navigate.ts:459-479, study/abroad/student are not generic tokens, ties go to the first entry, and the `?? pick(want)` fallback steals unmatched topics.
- cleanCopy is weaker than hasExplicitLink.

**Required fixes:**
- Two-stage tight match: (you|Vidysea) + help/assist/offer/provide + (with|for)? + service noun, anchored at the end. A trailing qualifier goes to the KB.
- Drop the bare test-prep, board and what-services rules.
- At graph.ts:1110, fall through to answerFromKb when there is no labelled service.
- Make study/abroad/student(s)/studying generic; require a non-generic label or slug hit, otherwise return unknown (no pick(want)).
- A list reply for "what services do you offer".
- Apply hasExplicitLink plus an email strip to the copy at sync time and at print time.

**Lane A (Warning):**
- Cap /search at ~8 s in code.
- Node caps total ~48 s against the 25 s deadline. Pass the remaining budget into expertGuidance, and skip the general call when under ~4 s remains.
- Skip recordGap when searchFailed.
- Add a text-free turn_deadline_hit log.
- /ask with an 8 s cap is probably dead code; measure p50.

**Backlog:**
- AbortSignal through the graph.
- A deterministic post-check in guardedGuidance for service names.
- A product decision: should anonymous users get service answers?

**Rubric:**
- 0/40 near-miss KB questions go to navigate_steps.
- ≥18/20 service intents return the correct line with a relative path only.
- A service match with no labelled route falls through to the KB.
- With the KB timing out and grounded Gemini healthy, a grounded answer comes back in under 25 s.
- With all nodes failing, the apology comes back in ≤25.5 s.
- A crisis message is returned on the deadline path.
- A KB outage writes no gap record.

## R2 re-review (2026-10-29)

### AI engineer: Warning (the BLOCK is cleared)
- KB near-misses: 40/40 stay on the KB.
- Service intents: 26/30 routed correctly, with 0 wrong services and 0 link leaks.

Open items:
- **W1 (policy, Umesh):** at the deadline, with the screen unavailable, the student gets the crisis message instead of the apology.
- **W2:** navigate.ts:226 strips ask/generic words only when copy.size > 0. With an unsynced catalogue, "do you help with visa" therefore goes to /help.
- **W3:** graph.ts:1443, an /ask throw records a gap. It should pass searchFailed=true.
- **W4:** "have" and "available" are not in ASK_WORDS.

### SSE: BLOCK (high)
classify.ts:355 SVC_NOUN `study(?:ing)?(?:[- ]abroad)?` overlaps with the `abroad` alternative inside a repeated group, which gives exponential backtracking.

| Input | Time |
|---|---|
| "do you help with " + "study abroad "x26 | 31 s, event loop stalled |

Fix: drop `(?:[- ]abroad)?`, or use `(?:\s+|-)`. Add a hostile-length test: 300 repeats must classify in under 100 ms.

Low: stripExplicitLinks keeps `javascript:` tokens and `/path` text inside the service copy. Drop tokens that start with `/` or contain `:`.

Everything else from R1 is resolved.

## R3 re-review (2026-10-29): SSE **Approve**
- **ReDoS closed.** 37,044 hostile cases, none over 20 ms.
- **navOnly tenant isolation holds.** The catalogue-only runtime cannot reach liveProfile or voice.
- **Tests:** engine 68+129, api chat-pathlynks 14, tsc clean.
- **Backlog (low):**
  - quadratic whitespace in the classify tails (≤37 ms at 4k chars)
  - cubic data_erasure/export rules (pre-existing; 215 ms at 4k chars)
  - hasBareDomain is quadratic on huge sync tokens (slice before cleaning)
- **Live R3b:** 7 of 8 OK. "what services are available" misses the list rule; deferred to the tool-first round.

## Gemini thinking-config (2026-10-29): SSE **Approve**
geminiThinkingConfig (providers/src/index.ts:453-457) matching is correct. Providers tests 208/208 pass and tsc is clean.

**Operational rule:** never set VC_LLM_MODEL, VC_CONCERN_MODEL or VC_GROUNDING_MODEL to an unprobed id (3.6/3.7/3.8, gemini-3-flash*, *-latest) until it is probed and added to the helper. An unprobed model runs on default thinking and can hit the 8 s screen race. A screen that misses the race is treated as unavailable, which yields the crisis message.

**Backlog (low):**
- stale comment at 1023-1025
- add 5 edge-case test rows (-preview, flash2, 3.6, flash-latest, uppercase)
