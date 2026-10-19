# /checker — p1-u13b-ollama-adapter (one checker, Cycle checked: 0)

Manifest: qa/manifests/p1-u13b-ollama-adapter.md in worktree D:/vc/.worktrees/p1-u13b-ollama (branch p1/u13b-ollama, head b52550f; code 9bc857b). Judge under the manifest's pinned Policy-Version. Authority D-100. Brief the builder followed: qa/evidence/p1-briefs/p1-u13b-ollama-adapter.md.

Verify outcomes, not construction:
- Default unchanged: VC_REAL_MODEL unset/"gemini" → no Ollama provider, behaviour identical to main.
- Refusals before any ledger write or request: missing OLLAMA_API_KEY, unknown price, junk VC_REAL_MODEL, VC_G_REAL not set.
- Budget: per-run USD 50 and monthly USD 200 caps stop an Ollama run unsent (charge-before-send). Hostile variants: a price of 0 / negative / NaN via OLLAMA_PRICE_USD_PER_MTOK must refuse, not run free; a trailing-space or mixed-case VC_REAL_MODEL.
- The key never appears in logs, errors, toString/JSON/inspect, reports.
- No real network call anywhere in tests (mocked fetch only). Make NO network or paid call yourself.
Reuse maker evidence only on full identity match; otherwise rerun via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh ...` (TMP/TEMP on D:, long lock waits normal): `pnpm -C packages/providers test`, `pnpm -C packages/engine exec tsx --test evals/p1-runners.test.ts evals/budget.test.ts`, `pnpm -r typecheck`. No full suite (not a security/prod-write L unit). 1 falsification per criterion in a copy, never the bound tree; leave copies in place and list them.
Write qa/verdicts/p1-u13b-ollama-adapter.md (PASS/FAIL, PROPOSED-ISSUE lines for findings), commit narrow pathspec on p1/u13b-ollama. Do not merge or push. Report verdict sha and findings.
