# Independent secondary check — T047 crisis/privacy

Date: 2026-10-01 (Asia/Calcutta)
Bound root: D:/vc/.worktrees/t047-crisis
Cycle checked: 0
Manifest: qa/manifests/t-047-crisis-privacy.md
Source commit: ec48857b95c20a18faabe4aedd24ca61f0e354a3
Manifest HEAD: 36183f32a9e0a2aca45e1de70893de0f5a3adc0d
Base: 7100f62581c6897e1b8f82a4777985f40e5c218e

VERDICT: PASS
SCOREBOARD: 7/7 bounded T047 criteria met, 6/6 invariants hold
FAILURES: none
LIVE-BROWSER: qa/evidence/t047-secondary-b (own real IAB background browser; subagent visible IAB unsupported; Chrome unavailable)
ISSUES-WRITTEN: none
EXPLANATION: This is a bounded offline T047 privacy/lifecycle acceptance verdict, independently re-derived and executed. It does not certify notification delivery, full persona/scenario coverage, production/client integration or the complete active goal.

## Independence and scope

I read the checker skill, user AGENTS instructions, brain INDEX, bound goal/ARCHITECTURE/contract and ready manifest. Root explicitly supplied same-project docs/plan.md approval inputs at eaee4fd, 9fb7ca0, 0db17af, 82dba68/9397a78 and d1411c7; these distinguish actual classifier timeout fail-open from explicit cancellation/authority refusal and preserve the original D016 oracle. Maker statuses encountered alongside those approvals and in the manifest were not credited as evidence. I did not read the primary T047 verdict, evidence, current results or shared issue ledger. I wrote only my secondary evidence/verdict; no artifact, source, contract, canonical decision history, enforcement or primary QA edits.

The seven criteria below are the independently approved T047 reconciliation/budget/privacy conditions, mapped to B4/B9/B13/B15/B16/B21 and existing canonical approval behavior. PASS is not a blanket certification of every counselling-engine criterion. In particular B17/B19/B22 and real escalation transport remain open.

## Independently rerun manifest

Exact commands, working directories, individual start/end times and exit codes are in qa/evidence/t047-secondary-b/runs.txt; full outputs are retained beside it.

1. packages/engine: `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts evals/*.test.ts` — exit 0; 811 total / 766 pass / 0 fail / 0 cancelled / 45 skipped. The retained command uses the exact bound absolute tsx path with the stated package cwd; duration 91643ms.
2. apps/api: `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts` — exit 0; 51/51 pass, zero fail/cancel/skip; duration 4476ms.
3. Bound root: `node node_modules/typescript/bin/tsc --noEmit -p <config>` — all eleven individually exit 0: packages/engine/tsconfig.json, packages/engine/evals/tsconfig.json, packages/engine/scripts/tsconfig.json, packages/db/tsconfig.json, packages/providers/tsconfig.json, packages/schemas/tsconfig.json, packages/observability/tsconfig.json, apps/api/tsconfig.json, apps/web/tsconfig.json, mcp/student-profile/tsconfig.json, mcp/university-kb/tsconfig.json.

All commands ran through the canonical D:/vc/scripts/vc-testlock.sh with trusted elevated process visibility and Git usr/bin PATH. I owned and polled handles 78317, 72318 and 18003 to actual terminal states. First aggregate runner exit 1 came solely from my initial API oracle fixture mistake described below; every manifest command itself exited 0. Corrected/restored runner exits were 0. No skipped test was converted to PASS.

## Criterion evidence

| Criterion | Independently observed evidence |
|---|---|
| C1 — Every no-consent crisis is strictly minimal, every ordinary refusal performs zero personal processing | QA-copy strict schema controls reject raw message/matched/arbitrary reason, empty/duplicate turn IDs and duplicate input turn IDs. Original and translation-only crises return exactly both identifiers; ordinary request returns fixed refusal. Personal collection spies, graph invocation/checkpoint/tracing spies and actual provider-call counts are all zero. Stored guard-only matches are empty, reason/severity fixed. |
| C2 — Original classifier allowance and reserved review/publication budget; legitimate fail-open preserved | Held private preflight expires before actual model execution, and release executes zero late model work. Genuine timeout and genuine outage each produce authorized unavailable annotation plus two fallback records inside the original reserved budget. Delayed annotation plus recipients exhaust remaining review budget and produce zero notifications. Source captures per-review-turn deadlines before first authority read; all provider retries use the existing preflight/deadline seam. |
| C3 — Terminal typed refusal, cancellation and revocation do not resurrect output | Actual typed leaf refusal rejects directly and leaves prior guard flag without classifier/fallback. Valid held-model results released after explicit abort or consent deletion produce neither annotation nor notification; underlying flag remains. Unknown error labels carry no synthetic private marker. |
| C4 — Four ownership-qualified writer paths and observable late cleanup | Independently rerun default T035 controls reach initial insertion, notifications, classifier annotation and acknowledgement; postwrite fence unreadability, undo rejection, late driver settlement, prior replay and newer-token preservation pass. Own notification control holds the actual writer across expiry, assigns a newer owner, awaits original error.settled and verifies complete newer-owner record plus complete tenant-B record byte-for-byte. Removing token CAS actually deletes the newer-owner record and fails the semantic assertion; restoration passes. |
| C5 — Actual JWT tenant authority, startup validation and no-anchor lifecycle | Own loopback startApi uses locally signed RS256 tokens. Missing token gets 401 before trusted factory; forged body tenant/recipients get 400 without factory authority. Two tenants with the same student/session, two crisis turns and replay produce eight exact tenant-bound recipient records, zero model/personal records. Invalid classifier timeout/sample rates reject before client factory/connect. No-session-anchor export includes own minimal escalation records; real confirmed erasure completes with totalRemaining 0 and tenant-B bytes unchanged. |
| C6 — D016 original fenced/unfenced behavior and bounded fail-safe postcheck | Default original fenced/unfenced D016 assertions rerun unchanged and pass. Own initial-consent held read controls prove unreadable and held postchecks return fenced; held postcheck settles at canonical ~10s backstop. Readable unfenced path throws FencedWriterDeadlineError. Releasing consent/fence gates later produces zero model/personal persistence. The source catch is limited to initial consent-await deadline errors, timer cleared in finally, and readable unfenced rethrows the original error. |
| C7 — T045/T046 and consented canonical approval compatibility | Full default engine/API reruns retain snapshot authority, actor/ALS binding, canonical edit provenance, winner/recovery/replay and tenant/privacy controls. Own actual browser Submit/Retry reaches approval; four approved facts and summary become written, Reload preserves saved state; raw fake-DB readback contains four active transcript-sourced facts, one approved summary and one claim. Own fenced page has no approval payload. |

## Independent oracle and mutation sensitivity

QA-copy engine original: 12/12 pass, zero fail/cancel/skip. An early parent/proposal described 14 engine controls; the actual authored/executed count is 12, and no unexecuted two controls receive credit. Three D016 variants are separate tests; some tests independently run multiple positive/negative cases. QA-copy API corrected: 2/2 pass, zero fail/cancel/skip.

Initial API oracle result was 1/2. My fixture supplied an admin but no counsellor and wrongly expected four records; actual eight records correctly included one explicit unrouted counsellor placeholder per turn/tenant. This was an oracle/fixture count error, not a product defect. The corrected fixture supplies both trusted recipient roles and asserts eight exact role/tenant IDs; `oracle-api-original.log` is preserved and not credited as product RED.

Seven QA-copy semantic mutants each exit 1 at intended reached assertions, never import/parse failures:

- strict guard-only payload passthrough accepts hostile raw extras;
- first-turn-only detection omits translated crisis identifier;
- omitted leaf preflight executes/classifies instead of timing out;
- swallowed typed authorization refusal fails required rejection;
- extended review deadline publishes two records after original budget;
- removed notification ownership token deletes complete newer-owner record;
- omitted D016 fail-safe returns deadline exception instead of fenced for unreadable postcheck.

Each mutation was confined to the checker-owned QA copy and restored in finally. Ownership-token sensitivity was strengthened so the complete actual record assertion precedes the dispatch spy, then rerun and killed again. Restored engine 12/12 and corrected API 2/2 both exit 0 after that strengthening. Full logs and `mutations.txt` are retained.

## Browser evidence and limits

Own Next demo server at 127.0.0.1:3117 used fake Mongo and mock providers with VC_WEB_MODE=demo and telemetry disabled; no .env was opened. Own real IAB tab rendered the reference UI and was controlled through actual UI actions. Visible IAB is unavailable in subagent threads and Chrome is not available; an actual background IAB tab supports rendering/screenshots and interaction. I did not fabricate visible-window evidence.

Observed flow: Submit -> AI unavailable apology with unchanged synthetic transcript -> Retry -> submitted -> generated approval -> approve all four facts and summary -> written -> Reload retains written facts/approved summary. Browser console errors: 0. Independent fenced page renders Erasure in progress with Reload and no personal approval payload; errors: 0. Actual screenshots: browser-retry.png, browser-written.png, browser-fenced.png; saved DOM and console evidence accompany them.

The browser blocked direct navigation to the demo API readback endpoint. Separate localhost HTTP readback, labelled as such, proves four active cited facts, one summary and one claim; it is not substituted for browser interaction. The fixed demo form does not expose arbitrary/no-consent crisis input, so minimal crisis UI has no browser proof. Strict no-consent outcomes are instead independently proved through actual signed-JWT API/runtime controls. No fixture or screenshot claims otherwise.

SCENARIOS: 0/58; every row explicitly `skip` in browser-scenarios.csv because this bounded headless privacy acceptance plus unchanged reference demo cannot drive all persona/fixture flows. This does not close B17/B19 or certify Hindi/voice/all-persona usability. B22 remains not-yet-measurable. Browser server handle6530 was stopped by owned Ctrl-C, actual terminal exit1 expected shutdown; own tab closed.

## Invariants and unchanged artifact

1. All thirteen manifest raw SHA256 hashes match before/after, recorded in hashes-before.txt and hashes-after.txt. Product diff from manifest HEAD36183f3 to current shared HEAD is empty; checker-owned QA-only HEAD progression does not change sourceec48857.
2. Offline synthetic fake DB/JWT/loopback/mock only; no external paid provider, production, integration, notification sending, deployment, install, secrets or publishing.
3. No product source/helper/new module, canonical contracts, ARCHITECTURE, decision history or enforcement edits.
4. Primary T047 verdict/evidence/current results and shared issue ledger remain unread; secondary writes stay in own evidence and .b verdict.
5. record_only/queued means records only; recipient correctness, real transport delivery/acknowledgement/drain and complete active goal remain unverified/open.
6. Existing 45 engine skips, own initial fixture mistake, actual 12+2 oracle counts, browser limitations and all 58 scenario skips are retained honestly.

No new reproducible >80%-confidence artifact defect was found. Shared ledger was intentionally not read or mutated under this deliberate blind-secondary dispatch.
