# Verdict: t-026-kb-client

**Date:** 2026-09-27
**Cycle checked:** 0
**Checker:** fresh Claude Opus subagent (Mode A, unit check), bound to `D:\vc\.worktrees\t-026-kb-client` (worktree of `D:\vc`, branch `wave/t-026-kb-client`, head `6188d2d`).
**Contract judged against:** `D:\vc\qa\contracts\counselling-engine.md` on **main** (current ground truth, per brief), primarily B21 "Knowledge" clause + B2/B8/B11/B14. Note: main has amended B2 (auto-verify-property, D-026) and B21's Auth bullet (placeholder issuer note) since this worktree branched from `b207b16`; neither amendment touches the Knowledge clause, the citation-pass-through requirement, or anything else this unit implements, so the delta does not affect this verdict.

## What I re-ran myself
- `node_modules/.bin/tsx --test tests/*.test.ts` in `mcp/university-kb` (behind `vc-testlock`, after waiting for the lock to free and free RAM ≥ 2GB): **29/29 pass**, matching the manifest's pasted output exactly (same test names, same counts).
- `pnpm -r typecheck` (whole repo, behind the lock): all 9 workspaces **Done**, no errors, including `mcp/university-kb`.
- `python contracts/verify_contracts.py --repo-root <worktree>`: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity` (`contracts/contracts.json` stages: `{}` — confirmed empty).
- `git diff 6188d2d~1 6188d2d --stat` / `--name-only`: exactly the 8 files the manifest's "Scope" section lists (`.env.example`, `bin.ts`, `index.ts`, `kb-client.ts`, `fakeKb.ts`, `index.test.ts`, `kb-client.test.ts`, the manifest itself). No deleted/renamed function, export, test, or config key; no file touched outside the declared scope.
- `git log -p` + `git diff` grep for `VC_KB_API_KEY`/`apiKey` literals: only test-only synthetic strings (`"test-key-1"`, `"synthetic-test-key"`, etc.) and the two bare key NAMES in `.env.example` (CRLF, no values). No real key value anywhere in the diff or history.
- Read `kb-client.ts`'s request-body construction directly: `body: JSON.stringify({ query })` — the only field sent to the KB is the query string itself; no student id, profile data, or other field is attached by this unit.

## Capability coverage (B14) — all 10 rows independently reproduced
Built my own throwaway copy (`git ls-files | tar` snapshot, never the live tree) at `C:/Users/Lenovo/AppData/Local/Temp/claude/checker-t026-copy`, ran `pnpm install --offline` there, confirmed **GREEN (29/29)** before any edit. Then, for each of the manifest's 10 rows: applied the exact single-hunk falsifying edit named in the manifest (never a shell command, never a multi-file edit), re-ran only the named test file, captured the real RED output, reverted byte-for-byte, and reconfirmed GREEN before moving to the next row. All 10 reproduced exactly as claimed:

1. Citations carried through verbatim → RED: `deepStrictEqual` failure, empty citations instead of the real one.
2. Zero-citations never served as an answer → RED: `status` `'ok'` instead of `'unavailable'`.
3. HTTP 401/403 → `unauthorized` → RED (both): `'http_error'` instead of `'unauthorized'`.
4. HTTP 5xx → `http_error` → RED: `'ok'` instead of `'unavailable'`.
5. Non-JSON body → `malformed_response`, distinct from `invalid_schema` → RED: `'invalid_schema'` instead of `'malformed_response'`.
6. Schema-invalid body → `invalid_schema` (Zod guard load-bearing) → RED: uncaught `TypeError` (worse than a clean assertion failure, confirming the guard is necessary) — matches the manifest's own characterization exactly.
7. Real network failure → `network_error` → RED: `'timeout'` instead of `'network_error'`.
8. Client's own timeout bounds the wait → RED: `'ok'` at 309ms instead of aborting near 50ms.
9. `ask_knowledge_base` gated on `kb` supplied → RED (both named tests): tool list includes `ask_knowledge_base` unconditionally.
10. Outage/uncited → tool error, never fabricated → RED (both named tests): `isError` `undefined` instead of `true`, using the manifest's own "sharper edit" (schema-valid placeholder strings, not just removing the throw — the first, weaker edit the manifest also disclosed producing no red is consistent with what I'd expect and was correctly superseded).

Final check: after all 10 reverts, the copy was byte-identical (`diff`, exit 0) to the live worktree's `kb-client.ts` and `index.ts`, and a full re-run was GREEN 29/29. The throwaway copy never touched the bound tree; no edit was made in `D:\vc` or the worktree itself.

## Diff scope (4c)
No function, export, test, or config key was removed; no file outside the manifest's declared scope was touched (see stat above). The manifest's "Not touched" list (`.claude/**`, DECISIONS.md, ARCHITECTURE.md, TASKS.md, contracts, other packages/apps) holds.

## Persona / UI surface
Changed paths are `mcp/university-kb/{src,tests}`, `.env.example`, `qa/manifests/`, `mcp/university-kb/src/bin.ts` — no `apps/web`, no `apps/api`, no screen or navigation. Not a UI-touching unit: Mode D and the persona walk (B17/5bb) do not apply. B19 scenario matrix is likewise not triggered (UI-touching units and releases only).

## Data boundary / secrets
B8: every automated test is offline, against an in-process real `node:http` server (`fakeKb.ts`) or a deliberately-refused local port (`127.0.0.1:1`) — never the real D:/KnowledgeBase or the real network. B11: only key NAMES land in `.env.example`, CRLF-consistent with the existing file; no value anywhere in tree, diff, or history. B2/B21 Knowledge clause: citations pass through verbatim on success, and every outage class (timeout, network error, 401/403, 5xx, malformed body, schema-invalid body, zero-citations) is uniformly typed as `unavailable` and surfaced as an MCP tool error, never a fabricated or uncited answer — this is the unit's core claim, and it is evidenced end-to-end (real HTTP round trip, not construction-only), consistent with B14.

## Residuals (as disclosed by the manifest, judged and accepted as legitimate scope limits, not defects)
404 folded into generic `http_error` (not a named outage case in the brief); `apps/api` wiring explicitly out of scope (T-025's unit); no retry/backoff (not requested); `insufficient_coverage` passed through as data, not an outage (correct per B21's wording, which is specifically about citations); ARCHITECTURE.md §6 Q1 left open by design. None of these weaken B2/B21/B11/B14/B8 as written.

```
VERDICT: PASS
SCOREBOARD: 5/5 criteria met (B21 Knowledge clause, B2 citation pass-through, B8 offline/no-egress, B11 secrets, B14 outcome-not-construction), 0/0 invariants at issue
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 10/10 rows reproduced
LIVE-BROWSER: not-applicable (changed paths: mcp/university-kb/src, mcp/university-kb/tests, .env.example, qa/manifests — no UI surface)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (maker build subagent) (checker: claude-sonnet-subagent)
EXPLANATION: All 29 tests re-run GREEN, typecheck clean repo-wide, verify_contracts.py PASS-by-vacuity, and diff scope matches the manifest exactly with nothing removed or touched outside it. All 10 capability-coverage rows were independently falsified and reverted in a throwaway copy (never the bound tree), each producing the exact RED the manifest claimed, with the copy diff-identical to the live tree afterward. No student PII beyond the query string reaches the KB request body, and no secret value appears anywhere in the diff or history.
```
