# Gate: what happens when the AI provider goes down? (T-019 follow-up)
**Asked:** 2026-09-25 · **Answered:** (blank) · **Blocks:** the provider-failover follow-up; the live LiteLLM smoke run

**Background:** T-019 added a second real provider (LiteLLM gateway) and a no-AI "rules" mode. But the
switch is **config-time only**: if the provider goes down mid-session, the session errors and someone has to
restart it with another `VC_LLM_PROVIDER`. That is the exact risk the lead raised.

**Q1: Runtime failover?**
- **(a) Recommended:** automatic chain: litellm (with the gateway's own fallbacks) → on failure the rules provider
  gives a form-based draft, clearly marked "AI unavailable". The counsellor approves as usual (B3).
- (b) Only litellm → the gateway's own model fallbacks; no drop to rules.
- (c) Keep it as it is today (manual redeploy).

**Q2: May I run the live smoke run?** A real LiteLLM gateway call on the 3 classes (fast-cheap / balanced /
smart-coding), with **synthetic** transcripts only (B13), to prove JSON output works on every model.
Answer: yes / no.
