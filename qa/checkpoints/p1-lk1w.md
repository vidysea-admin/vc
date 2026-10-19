# Checkpoint - p1-lk1w (cycle 0, checker, completed checks)
Base 5310e8f, code e13f850, manifest 2819876. Env: win32, node v24, tsx, fetch stubbed (synthetic Ollama and LiteLLM hosts), no network. Identity (sha256 prefix): apps/api/src/index.ts 9ec82ebef9fe8f26, packages/engine/src/guards/concern-classifier.ts 238ce22cf7fd0a4e, pnpm-lock.yaml 215e0d3dcb174860, package.json 7663dee6314bf110.
- testlock slot 1, one file at a time, timeout 600, unpiped: apps/api chat-profile 14/14, anonymous-route 18/18, index 8/8, server 34/34, voice-wiring 16/16; engine concern-classifier 23/23; tsc apps/api exit 0; engine typecheck exit 0.
- outcome (qa/evidence/p1-lk1w-check/outcome.test.ts): 11/11 pass (unset, default, deepseek-first, failover 503/500/hang, both-down, crisis x3, 14 hostile configs, classifier base, .env.example).
- falsification (copy D:/chk-lk1w/copy, restored, cmp-verified): C1, C2, C2-crisis, C3a, C3b, C4, C5 green->red; C6 re-derived by file read.
- Result: PASS. Findings are low process/wording rows only (PROPOSED-ISSUE in verdict). Hung PID 47984 left untouched.
Attribution: checker p1-lk1w-check (this file).
