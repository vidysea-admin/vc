# HUMAN_GATE: T-057 C10 voice tool timeout
Opened: 2026-10-30T11:27:25+05:30
Question: voice answers are generic because each voice tool call is capped at 5 s (apps/api/src/index.ts:133 createQuestVoiceTools) while the same graph turn takes ~17 s in chat. Build a fix? It is outside D-138 Changes-authorized, so it needs a new DECISIONS entry.
Options: (a) raise the voice tool timeout to ~20 s plus a filler line while waiting; (b) a fast snapshot read path for voice with no LLM graph turn; (c) wait (demo without C10 context).
Recommended default: (a).
Blocks: T-057 C10; checker run against docs/demo-contract.md C1-C11.
Evidence: qa/evidence/t057/c10-voice-real.md
Answered: 2026-10-30 17:03 Umesh: (a) "20s timeout + filler" -> D-139
