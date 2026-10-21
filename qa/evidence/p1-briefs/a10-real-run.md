# Brief A10 real voice run (go-live evidence, approved spend D-100 / g-real (a): <= USD 50 per run)
Read qa/gates/a10-voice-gate.md and docs/go-live-checklist.md. Goal: produce the A10 voice report with a recorded Result.
Rules (.15): first a cheap provider probe (Gemini Live reachable, key present - never print the key); if the probe fails, stop and report. Deterministic/fake-provider tests must already be green before the live run. ONE real run only, no retries on identical failures. No student data; synthetic utterances only. Never touch .claude/**, never kill processes, never git add -A, do not push.
If the gate requires a human listening judgement you cannot give, run everything else, record the evidence, and mark that item HUMAN.
Deliver: the report file the gate names (commit it on branch p1/a10-real in a new worktree D:/vc/.worktrees/a10real), with Result PASS/FAIL and cost spent. Report path, sha, result, cost.
