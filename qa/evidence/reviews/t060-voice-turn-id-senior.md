# Senior review: t060-voice-turn-id (66eef499..1fe5be88)

VERDICT: **Warning** (fresh senior-software-engineer agent, read-only, 2026-10-30). Both findings are low and fail closed, and neither can happen today because Gemini sends no turn id.
- L1 voice.ts:1237-1241, :1259: in id mode `readoutEarlierTurnOpen`/`readoutOutputSeen` stay stale. A later event without an id then swallows the readout's own turn_complete, so the yes/no never arms (fails closed). Fix: clear `readoutEarlierTurnOpen` when the byId match hits.
- L2 voice.ts:1237-1239: if a transport's sendText id differs from the id it stamps on output, the readout never completes, with no timeout. Fix: document on LiveBackend.sendText that the returned id MUST equal the output id, or return nothing.
Checks OK: live.ts public types are additive and optional, `string|void` is source-compatible; readoutTurnId lifecycle has no leak; the fallback is used only when both sides lack an id; no event can arrive before readoutTurnId is set; the crisis path is untouched.
YAGNI: acceptable to carry, but record it as inert in production, not as live protection.
Reviewer runs: voice-readout-turn + voice-history 30/30, live-turn-id 3/3.
Test gaps: mixed-id events, mismatched-id, interrupted with turnId, stale-flag follow-up.
