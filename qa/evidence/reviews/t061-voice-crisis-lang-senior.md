# Senior review: t061-voice-crisis-lang (66eef499..941a682e)

VERDICT: **Approve** (fresh senior-software-engineer agent, read-only, 2026-10-30)

Low findings:
- L1 voice.ts:27 and :311-312: the header and LiveVoiceRouteConfig comments still say the crisis message is the fixed STUDENT/ANONYMOUS constant, which is stale now. Fix in place to "crisisMessageFor(lang, mode)".
- L2 voice.ts:741: a Roman-script Hinglish crisis with fewer than 2 HINGLISH_MARKERS gets English. This is the safe vetted fallback and the same threshold chat uses, so it is a UX limit, not a regression.

Checks: per-connection getter, no shared state; ordering is synchronous (detect → capture → fireCrisis); the detector-throw fallback is English; the anonymous mode string matches chat; no new crisis strings.
Reviewer runs: 61/61 (voice-crisis-lang, voice-crisis-turn, partner-voice), tsc 0, worktree clean.
Test gaps (low): a Hindi crisis on the anonymous voice route; detectLanguageOffline throwing.
