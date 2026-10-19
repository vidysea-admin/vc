# Verdict: p1-deepseek-id
**Verdict:** PASS
**Cycle checked:** 0
**Tier:** S. One checker, Dual check: no per manifest. Policy: proportional-verification/2026-10-19.16 (the manifest's pin)
**Base:** origin/main 1aefd96 **Head checked:** 260aaa9 (code f85d806; 260aaa9 adds only the manifest)
Metrics: start=2026-10-19T14:38:50+05:30 end=2026-10-19T14:44:00+05:30 suite_runs=0 mutations=2 cycle=0 policy=proportional-verification/2026-10-19.16 lane=normal

## Plan
Read the code diff (`git diff 1aefd96 260aaa9`, 2 code files) against C1/C2. Detached copy at 260aaa9 (D:/vc/.worktrees/chk-dsid, `pnpm install --offline --frozen-lockfile`, TMP/TEMP on D:/tmp, every run via `VC_TESTLOCK_TIMEOUT_SECS=7200 bash D:/vc/scripts/vc-testlock.sh`). Outcome probe through the real `prepareOllamaProvider` with a mocked fetch (no network, no paid call), plus one falsification per criterion. Builder's wide-set and typecheck are reused by identity; both rerun on the integration head in Part 2.

## Reruns / probe (qa/evidence/p1-deepseek-id/check/probe-run.txt)
- `tsx --test tests/chk-probe.test.ts tests/ollama.test.ts` -> tests 25, pass 25, fail 0 (4 probe tests + the builder's 21; matches the manifest's 21/0).
- C1 outcome: `VC_REAL_MODEL=ollama:deepseek-v4.1-flash`, no `OLLAMA_PRICE_USD_PER_MTOK`: 1 request, body model `deepseek-v4.1-flash`, estimate 0.008208 USD = (16 in x 1 + 2048 out x 4)/1e6, i.e. priced from the table. `ollama:deepseek-4.1-flash` -> OllamaRefusedError "no price". Table keys are exactly [deepseek-v4.1-flash, glm-5.3-flash].
- C2 outcome: `ollama:deepseek-v4.1-flash:1017` -> 1 request, body model `deepseek-v4.1-flash:1017`, `provider.model` the full id, same 0.008208 estimate (priced from base).
- Hostile (all refused with OllamaRefusedError, never priced from Object.prototype): `a:b:c`, `:x`, `x:`, `constructor`, `__proto__:x`, `toString:x`, `__proto__`, `hasOwnProperty:1`, `valueOf`, `DEEPSEEK-V4.1-FLASH`, `Deepseek-v4.1-flash:1017`, `deepseek-v4.1-flash :1017`, `deepseek-v4.1-flash:1017:2`, `deepseek-v4.1-flash::`, `constructor:`, `prototype:x`, `deepseek-v4.1-flash :x`, `deepseek-v4.1-flash:<TAB>`.
- Trailing space: `VC_REAL_MODEL` is trimmed upstream (pre-existing, `selection`), so `ollama:deepseek-v4.1-flash ` becomes the exact valid id and is priced and sent trimmed. That is stated behaviour, not a bypass.

## Falsification (copy only; the bound tree p1/deepseek-id was never edited)
| id | crit | edit | result |
|---|---|---|---|
| M1 | C1 | table key `deepseek-v4.1-flash` -> old `deepseek-4.1-flash` | 6 fail of 25 (probe real-id, old-id, tag, hostile, both builder tests), killed |
| M2 | C2 | `const base = model;` (no tag rule) | 3 fail of 25 (probe tag, probe hostile, builder tag test); the C1 tests stay green, killed |
Both killed, 0 survivors. Source restored from a copy after each.

## Findings
None blocking. The placeholder price (1 in / 4 out USD per MTok) stays [ASSUMPTION - UNVERIFIED]; the ids come from the brief, not a live /api/tags (both disclosed by the manifest).

## Environment
No OOM or environmental failure. Detached copy removed after the run; the probe source in evidence is a summary (the copy's file was deleted with the worktree), the full run log is probe-run.txt.
