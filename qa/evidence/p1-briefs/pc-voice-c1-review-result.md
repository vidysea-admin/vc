# pc-voice fix cycle 1 senior review: Approve (2026-10-22, diff 91950b2..8f841e4)
Caps not bypassable (upgrade check + conns.add in one synchronous turn; start re-check before "starting"; slots freed in finalize on close/error). Default override owner only tightens. W6 still a refusal case. Crisis path safe.
Low findings (Candidates, not this round):
- voice.ts:1600-1602 a NaN cap value disables the cap (Math.max(0,NaN)); guard with Number.isFinite. Not env-wired today.
- An upgrade-time 429 shows the widget's generic network fallback (Retry-After not visible to onclose).
- A hostile visitor with 25+ client keys can fill a partner's 50 anonymous slots (spend protected, availability not).
Test gaps: 5 parallel upgrades vs cap 2; terminate() mid-session frees the slot; NaN/negative cap.
