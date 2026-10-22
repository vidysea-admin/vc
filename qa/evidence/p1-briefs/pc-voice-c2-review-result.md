# Review result: pc-voice fix cycle 2 (senior-software-engineer, read-only)
Verdict: Warning (low only, non-blocking). No path ALLOWs voice without A10 PASS or a configured, exactly matching approver.
- low: apps/api/src/index.ts:616 + voice.ts:335-336 assertVoiceGoLive ignores a caller-passed `env`; approver read from process.env (pre-existing, fails closed).
- low: go-live-gate.ts:163,167 approver compared raw (no trim, exact case); mismatches fail closed; checklist says "exactly".
- open: deploy config must set VC_GATE_APPROVER before voice go-live (docs/go-live-checklist.md row added).
REVIEW pc-voice-c2 Warning
