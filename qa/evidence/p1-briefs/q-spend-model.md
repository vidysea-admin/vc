# Read-only analysis for Umesh: what costs money in VC, how much, where, which models; DeepSeek vs GLM
Repo D:/vc (read-only; never print API keys or .env values, only key NAMES). Answer in plain short English with numbers + file:line sources:
1. Which LLM/voice providers and exact model ids are configured per feature (chat text chain VC_TEXT_CHAIN, extraction LK6, safety screen, language detect, voice Gemini Live, embeddings). Where each is called (file:line).
2. Why does spend happen (which call per student turn, how many calls per turn), price per 1M tokens (from repo price tables/config; if absent, say "not in repo"), and measured tokens/cost from qa/token-ledger.jsonl, qa/evidence, g-real runs (D-100). Give: cost per chat turn, per 15-min session, and a monthly estimate for 1,000 and 10,000 students x 4 sessions (state assumptions).
3. DeepSeek vs GLM: any repo evidence (latency, quality, failure/timeout rates, Hindi/Hinglish quality, price) from LK1w manifests/verdicts/evidence. Recommend which goes first and why, with evidence; say clearly where evidence is missing.
4. Recommend a monthly cap number with reasoning.
