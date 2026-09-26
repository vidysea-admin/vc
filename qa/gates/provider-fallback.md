# Gate: what happens when the AI provider goes down? (T-019 follow-up)
**Asked:** 2026-09-25 · **Answered:** 2026-09-26 (see bottom) · **Blocks:** the provider-failover follow-up; the live LiteLLM smoke run

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

Answered: 2026-09-26 — Umesh via AskUserQuestion (maker session 6c22744a).
- Q1 verbatim: "model 1, fallback model 2, fallback 3 and with about 10 retry". All-fail verbatim: "it must need to be highlighted first for the engineering team and for the person useing that, there should be an apologetic msg and also a retry msg so they dont have to retype or again give all the content again". Maker reading: a 3-model chain with a total retry budget of about 10 and backoff; NO drop to the rules provider; when everything fails, an engineering alert (structured error log + Langfuse error trace; no paging channel exists yet [ASSUMPTION]) plus an apologetic message with a Retry that preserves the user's input.
- Q2: "Yes, synthetic only (Recommended)" — one live LiteLLM gateway smoke run across the 3 model classes, synthetic transcripts only (B13).
