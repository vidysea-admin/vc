# T-052 cycle2 narrow release transfer proposal

Status: current D076 release preparation only; exact28 T052 source/test selection retained. T052 remains REPAIRING. Isolated T038 cycle1 coordinator A has scoped PASS; coordinator B remains live/pending, so no dual acceptance or release readiness. No candidate copy, staging, commit, runtime, acceptance review, green stamp or push performed by this agent.
Owner: root release coordinator; this agent owns only this QA prose file.
Policy: proportional-verification/2026-10-10.9, current cycle2; historical FAIL/source-review history remains intact.

## Historical preparation boundary — 27-path D067 update

- Primary: `D:/vc`, main HEAD `13207bd024e6d5e3e01c07843a12d40a9b53c56c`.
- Registered managed release checkout: `C:/Users/Lenovo/.codex/worktrees/vc-release-check/vc`, detached at the same HEAD; tree `c186c90bb82a0620da93803374063675157c4c9c`.
- This D067 update repeated read-only escalated release `status --porcelain=v1 --untracked-files=all`, `rev-parse HEAD` and `rev-parse HEAD^{tree}`: status empty and HEAD/tree exactly as above. Earlier branch read verified detached checkout; no ref was changed. No file/index/ref/process mutation occurred. Only successful escalated reads are credited; root rechecks immediately before actual transfer.
- Historical D063 snapshot: `d063-narrowing-candidate.json`,26 paths, SHA256 `DA856C9371305030949694019FDA4E04D2C94F38ADC429DCDB564E47ECC25610`. Its prior preparation read matched26files, then terminal104/98pass/6early manual reconfirm202-versus200 failures; subsequent D064/D065 decisions and repaired outputs supersede that fixture state. Preserve raw history, never current transfer authority.
- Read-only dependency path check: release `node_modules`, `node_modules/.pnpm`, root tsx/tsc files and API/WEB/DB/engine package dependency directories exist. `apps/api/node_modules/@vc/db` targets the release's own `packages/db`; DB `mongodb` targets release `.pnpm/mongodb@6.21.0/node_modules/mongodb`; engine LangGraph targets its own release `.pnpm` installation. Installed package JSON metadata reads mongodb6.21.0, tsx4.23.15, TypeScript5.8.3 and LangGraph1.4.17. Release/primary lockfiles both SHA256 `562F86492B23EAB44F0FBFF444A89E7FF8D053A7E97928A86B9EEE0AA84FCD6C`. No resolver execution, installation/download, borrowed primary dependency or runtime test was performed here; metadata/path presence is not dependency acceptance.
- D057 frozen input remains historical SHA256 `F1BBF801A864C3F6A22D12559E9A7C132C392D3C4F5FDC8186B6BDE0642607CC`. Its scoped repair later reached current-at-that-time723/678pass/0fail/cancel/45oldskips, then fresh SSE/data/AI source reviews BLOCKED previously untested boundaries. Preserve both that green and those BLOCK records; neither certifies D058-D063 repaired source.
- Current frozen candidate is `qa/evidence/t052-maker-cycle2/d067-candidate.json`, exactly27 paths, SHA256 `A7677D95CDBD232A3300EC55C0D507863580D9FDF9A51D8300DFE59232C804EA`. D06326 read/hash/results above are historical preparation only. The sole added existing edited path is `packages/engine/tests/scribe-rules-e2e.test.ts`; D047's `scribe-erasure-fence.test.ts` was already in26. No original path was removed. Fresh three completed-feature source reviewers are running; formal blind acceptance is NOT dispatched and no review/acceptance result is credited here.
- Attributed current maker evidence, read from terminal D067 artifacts: six CORE396tests/351pass/45existing NOT-RUNNABLE skips and two WEB17/17, combined eight files413tests/368pass/0fail/cancel/45skip. All14 added final-fence controls and all11 formerly failed affected assertions reached GREEN;112pins matched and mutex absent. Unchanged other modules from D065's21 scope are impact-reused, so this is not a fresh whole21 run. Current graph engine typecheck915dfd is recorded separately; unchanged DB/API9c8bd1 retained by impact. Final11types/full6c/browser/blinddual/stamp remain pending.
- Historical first D053-D055 sealed snapshot remains `d053-d055-candidate-frozen1.json`, SHA256 `30FA3FC88299F5ADE3CD780703ABE4C678B29E7F9E51FEBB7D122BF111F0177A`. Its initial failures and later importer/persistence repairs remain preserved; no historical snapshot is final-transfer authority after an approved path changed.
- The earlier `d048-d050-candidate-typefix3.json` 23/23 SHA256/blob match was preparation evidence for an older candidate, retained as history only. Exact inventory comparison now found three additions and zero removals. No final source/test hash match, freeze or runtime acceptance is claimed here.
- Existing primary tracked changes outside the 26-path candidate include `TASKS.md`, `docs/DECISIONS.md`, `docs/plan.md`, `qa/.last-tick`, and the peer browser report `qa/evidence/browser-t-021-provider-failover-c1-2026-09-26/report.json`. Preserve the peer report and all existing untracked material. Do not stage all, clean, reset, stash, archive, or synchronize the whole primary tree.
- The reported 593-ahead/722-old-untracked values are coordinator-provided earlier observations, not re-counted by this task. No full Git history or remote scan was run.

## Exact product/test transfer allowlist

The actual accepted post-D073 final JSON manifest is the executable allowlist; do not infer paths from directory names. D072 adds only existing score.ts as item28; D073 changes three already-listed paths. Historical27 snapshots remain history. The exact current28-path selection is:

1. apps/api/src/openapi.ts
2. apps/api/src/server.ts
3. apps/api/tests/server.test.ts
4. apps/web/demo/seed.ts
5. apps/web/tests/session-api.test.ts
6. packages/db/scripts/db-init.ts
7. packages/db/src/collections.ts
8. packages/db/src/decisions.ts
9. packages/db/src/erasure.ts
10. packages/db/src/facts.ts
11. packages/db/tests/consent.test.ts
12. packages/db/tests/db-init.test.ts
13. packages/db/tests/decisions.test.ts
14. packages/db/tests/erasure.test.ts
15. packages/db/tests/facts.test.ts
16. packages/db/tests/fakes.ts
17. packages/engine/src/scribe/checkpointer.ts
18. packages/engine/src/scribe/graph.ts
19. packages/engine/src/scribe/nodes.ts
20. packages/engine/tests/scribe-checkpointer.test.ts
21. packages/engine/tests/scribe-erasure-fence.test.ts
22. packages/engine/tests/scribe-fixtures.ts
23. packages/engine/tests/scribe-persistence.test.ts
24. packages/engine/tests/b18-suppression-outcome.test.ts
25. packages/engine/tests/crisis-escalation.test.ts
26. packages/engine/tests/scribe-per-fact.test.ts
27. packages/engine/tests/scribe-rules-e2e.test.ts
28. packages/engine/evals/score.ts

Items24-26 are the existing importer paths added under D054; item27 is the sole additional existing edited Rules importer under D066. D064/D065 protected API fixture-stage corrections, D066 restoration/importer/diagnostic alignment and D06714final-fence controls are authorized existing-file deltas. No package/dependency/lockfile/public export is added. Any further path/source/oracle change requires attributable root resolution and new freeze; this inventory grants no implementation authority.

Root must wait for the current owner to finish and freeze the final candidate. Re-check all hashes immediately before copying; any mismatch stops the transfer until a new attributable final manifest and impacted checks exist. Copy each resolved literal source to the identical relative destination with native PowerShell `Copy-Item -LiteralPath`; verify both absolute paths remain under their intended roots. No dependency directory, .git directory, .env, cache, archive, isolated source copy, handoff directory or peer path is included. The release checkout already has its own offline installed dependencies; do not share or reinstall them for transfer.

Immediately after transfer, repeat SHA256 and matching Git blob comparisons in release, compare changed product/test paths to exact28, and inspect actual diff. Record destination HEAD/tree, actual post-D073 final manifest SHA256, installed/config/runtime identities and transferred paths externally. D06727 and pre-D07328 inventories are historical, not current copy authority. Hash match alone grants no runtime evidence reuse. Current affected closure is25CORE+2WEB=27 named modules, distinct from28 transferred paths and final6c/all11types. Historical D067 eight-file rerun and D065 impact-reused21-module evidence do not establish current affected verification.

### Current affected25CORE+2WEB scope, historical21 evidence and transfer exclusions

Readiness A7's original15 CORE are `packages/db/tests/consent.test.ts`, `packages/db/tests/facts.test.ts`, `packages/db/tests/erasure.test.ts`, `packages/db/tests/decisions.test.ts`, `packages/db/tests/db-init.test.ts`, `packages/engine/tests/b18-suppression-outcome.test.ts`, `packages/engine/tests/crisis-escalation.test.ts`, `packages/engine/tests/scribe-checkpointer.test.ts`, `packages/engine/tests/scribe-erasure-fence.test.ts`, `packages/engine/tests/scribe-concern.test.ts`, `packages/engine/tests/scribe-persistence.test.ts`, `packages/engine/tests/scribe-per-fact.test.ts`, `packages/engine/tests/scribe-tracing.test.ts`, `packages/engine/tests/scribe.test.ts`, and `apps/api/tests/server.test.ts`.

The four added verification importers are `packages/db/tests/tenant.test.ts`, `packages/db/tests/erasure-approver.test.ts`, `packages/db/tests/db-scope.test.ts`, and `packages/engine/tests/scribe-rules-e2e.test.ts`. Only Rules is now edited/transfer-listed; the three DB importers remain unedited. W1 is WEB `session-api.test.ts` plus `api.test.ts` with WEB tsconfig. This is the historical19CORE+2WEB=21 scope. Historical closure explicitly combines D0678 rerun with D065 untouched-module impact reuse; don't describe it as a fresh whole21. Old17 results remain history.

Only28 candidate paths above are source/test transfer allowlisted. Unedited affected `tenant`, `erasure-approver`, `db-scope`, `scribe-concern`, `scribe-tracing`, `scribe.test`, scorer consumers and WEB `api.test` already exist at baseline; verification reachability grants no copy/stage scope. Rules is item27 and the scorer is item28, copied only after actual final freeze and required gates. Final6c files `scribe-auto-verify-property.test.ts`, `scribe-citation-rescope.test.ts`, WEB `ui.test.tsx`/`new-session-ui.test.tsx` likewise get no transfer authorization. Exclude package manifests/lockfile/tenant wrapper/serializer public export/adapters/hooks/contracts/ARCHITECTURE/new helpers, .env/credentials, dependencies/stores, archives/isolations/caches, locks/live logs, mutable peer evidence and unrelated primary untracked content; preserve all in primary.

## Bookkeeping and evidence selection

Before the first release commit, root explicitly selects the attributable final versions of:

- `docs/DECISIONS.md` (complete authorization throughD067, replicated ONLY through the existing append safe-door described below), `TASKS.md`, and `docs/plan.md` with honest ready/checked/released status. DECISIONS is stage-allowlisted but NEVER raw-copy/edit/overwrite-allowlisted.
- `qa/manifests/t-052-session-lifecycle.md`, the current release manifest, and final independent verdict/checkpoint files selected by their actual coordinator ownership. Preserve historical FAIL records; never overwrite them with a PASS.
- `qa/QUEUE.md` and `qa/issues.jsonl` only when root actually reconciles the active feature and issue states. Their currently clean status is not a reason to manufacture a change.
- Exact frozen candidate inventory, approved QA plans, maker command/identity outputs, independently selected acceptance instruments/results, bounded falsification/red-green-restoration evidence, runtime/config identities, and scoped publication-content audit needed to reproduce the release claims. Enumerate filenames individually; the entire `qa/evidence/` directory is never an allowlist.

The four existing approved QA plans under this directory are `summary-lineage-plan.md`, `summary-graph-publication-plan.md`, `summary-fresh-admission-plan.md`, and `summary-public-history-plan.md`; their authorized hashes are recorded in D048. Include this proposal only if it remains accurate and useful. Failed/typefail/harness-first results remain historical records; preserve them and label them instead of treating them as final green proof. Historical T035 archives, duplicated isolated workspaces, caches, dependency stores, screenshots from unrelated features, and the peer T021 report are outside the proposed release selection.

Publication-content review must cover the exact final selected bytes, including executable QA, JSON/JSONL, images and any newly selected historical artifact. Earlier audits of seventeen/twenty/twenty-three-path candidates or older untracked snapshots do not establish publication safety for the current twenty-six-path repair plus final evidence. No runtime or acceptance credit is inferred from a publication-content verdict.

### D051-D067 reviewable record selection before final6c

Review DECISIONS D051-D067 and approved versions with current lifecycle manifest/state. Replicate missing decision entries via safe-door, preserving existing release bytes; never splice/rewrite/copy whole DECISIONS. Plans/approvals now append newer sections, so all historical whole-file hashes remain authorization history, not current-file claims. Preserve original approvals/BLOCKs and honest D058 post-edit repin timing. Only approved sections apply; approval is not acceptance.

| Authority | Existing QA plan/approval paths under `qa/evidence/t052-maker-cycle2/` | Scope to check before selecting final bytes |
|---|---|---|
| D051 | `initial-graph-closure-proposed.md`; `initial-facts-oracle-proposed.md` | Bounded graph cancellation/settlement/no-consent closures; invocation-attributed facts raw-driver oracle. Approved plan hashes remain in D051. |
| D052 | `initial-db-closure-proposed.md`; `initial-persistence-oracles-proposed.md`; `initial-persistence-plan-approval.md` | Full immutable same-capability readiness observation and three existing semantic persistence repairs. Preserve original deadlines/full S0/raw comparisons. |
| D053 | `initial-db-concurrency-tests-proposed.md` | Exact actual-driver attribution, ConsentRequiredError, prepared versus open attempts and original late settlement. |
| D054 | `initial-importer-oracles-proposed.md`; `initial-importer-plan-approval.md`; `d054-control-reachability-proposed.md`; `importer-release-hook-proposed.md` | Exactly the three added importer modules; first summarize release site, held-driver drain chronology, independent complete checkpoint snapshots. Approval retains earlier BLOCK history. |
| D055 | `immediate-summary-compensation-proposed.md`; `d055-control-reachability-proposed.md`; `initial-persistence-plan-approval.md` | Private original fence-driver registration/latched cleanup/early summary compensation and additive controls; historical bounded reachability hash6BF482736B19863333019260B8ACC18913D307EA84CF68AD2878D8A34CCC64FD is retained, not latest whole-file identity. |
| D056 | `initial-graph-closure-proposed.md`; `initial-importer-plan-approval.md` | Historical exact approval-binding guard latch authorization, recorded plan6EB82B34/approval697C3406; whole files have since appended later scope. |
| D057 | `initial-db-closure-proposed.md`; `initial-persistence-plan-approval.md` | Historical one-field scoped tenant capture approval, recorded planBCE845D6/approvalD7ED525C; actual internal exception stack was unobserved, and later source-review BLOCK is retained. |
| D058 | `initial-db-closure-proposed.md`; `initial-graph-closure-proposed.md`; `initial-facts-oracle-proposed.md`; `d055-control-reachability-proposed.md`; `initial-persistence-plan-approval.md` | Approved clear transcript/OPEN receipt/concern/OpenAPI sections plus actual-driver tests; baseline RED and scoped repair GREEN preserve original timing and honest post-edit graph repin. |
| D059 | Same DB/graph/facts plans, `d054-control-reachability-proposed.md`, `initial-persistence-plan-approval.md` | Approved direct leaf settlement and two-phase inspection; durable lease source waited separately approved D060 controls and reached baseline; optional private marker/type/export tests do not prove actual lease issuance. |
| D060 | `d055-control-reachability-proposed.md`; `initial-graph-closure-proposed.md`; `initial-persistence-plan-approval.md` | Actual matched unset/held-rejected receipt/foreign-completed ABA controls, preserving complete raw snapshots and original500/2000/10s plus prior budgets. |
| D061 | `initial-facts-oracle-proposed.md`; `initial-persistence-plan-approval.md` | Protected existing old settlement assertions align to approved fixed envelopes while retaining exact actual sentinel DAG identity/all attempts/full rows, never broad any-error matching. |
| D062 | `initial-facts-oracle-proposed.md`; `initial-persistence-plan-approval.md` | Actual trusted tenant-facade promise attribution in two existing nested-child test callbacks, preserving source and all later cause/settlement/original budgets. |
| D063 | `d054-control-reachability-proposed.md`; `initial-persistence-plan-approval.md` | Resolver-only API test patch: createRequire(import.meta.resolve('@vc/db'))('mongodb').BSON. Decision pins whole planF95A9AC2A5F1B1030A8D87CF4AA4CF3D55F3D9AD8B2B4726FE47E32F35EC8C60 and approval04928099326A32FC34A16C5140A9019FE72DCBA3A99722166DDD965D06F269CD. Six API controls were baselineUNRUN; current-source API execution is never old-source baseline evidence, and final semantic falsification must reach the actual API boundary. |

| Authority | Existing plan/approval selection | Exact approved scope and history |
|---|---|---|
| D064 | `d054-control-reachability-proposed.md`; `initial-persistence-plan-approval.md` | Approved exact reconfirm202/awaiting_approval/request/finite ISO expiry correction. Historical plan70444125/approval81621135; real distinct approver/purge/fence/regrant/privacy oracles preserved. |
| D065 | Same two files | Approved persisted actual releaseAfter/max-age real sweeper fixture, not shortened24h grace. Historical plan6FD4FFAFA7AA83A9A8F896124AA816CB8236DCE6800BA3F15569C42E6E96E3D2; approval8DC74ADB350130EA952DECE21A689BBF51F265D2EB80CA90B1558FDFC576F3FE. Six actual API controls then passed;21 affected RED remains retained. |
| D066 | Graph plan, D054/D055 plans, `initial-persistence-oracles-proposed.md`, approval file | Approved graph26FE2311 restoration of3ordinary inspector fence catches; B18 marker546E7B43; D055DF739040 D047acquisition/Rules synthetic seed/original20ms diagnostics; quartetB48BDB5A source frame737-to885 ONLY. Approval4376E9F0. Optional mixed performance.now-Date.now diagnostic remains BLOCKED/omitted. |
| D067 | `d054-control-reachability-proposed.md`; approval file | Current whole plan3EE5947575ECFBDDE7771FEF27AC4AB9EB4A62E706F2C868D69DDF64A0B4C47C and approval349ED06DFE0BBA7838CB46AD46A1F8D19AF4870C838DE8A7650D80931BDBC4CB;14actual final personal/minimal fence controls, exact original outcomes/drain/raw inventories, no old-source final-site baseline fiction. |

Current whole source/probe plan hashes read in this update: graph26FE23112EDA7A0C72E3DC11A66790FAE1C48E7BB9D257B7772C85C448F809D5; D055DF739040092001EE66F21CFCAA3AD22477D5ED7DEB4B0C2061FF69935A1A7FFD; original persistenceB48BDB5AB30F8423CC6BD312D6322BC8DDBCB78072D343FE6AA15FBBCAA83360. Store current complete files with their real hashes and section approvals, retaining historic hash prefixes in DECISIONS/approval history; don't substitute current hashes into earlier approvals.

Also retain the four D048 approved plans listed above. Root verifies selected plan hashes against their authorizing decision/approval at final freeze; an amended plan is not authorized just because its filename is unchanged. Final native approval records that currently exist only as attributable agent handbacks must be durably referenced/recorded by root before readiness, without inventing a reviewer result.

Exact sealed diagnostic records proposed for review and explicit inclusion (all under the same evidence directory):

- `d051-candidate-closure1.json`, `d051-runtime-closure1-start.json`, `d051-runtime-closure1-end.json`, `d051-types-engine.log`, `d051-failed-touched1.log`.
- `d052-candidate-closure1.json`, `d052-candidate-typefix1.json`, `d052-runtime-closure1-start.json`, `d052-runtime-closure1-end.json`, `d052-runtime-typefix1-start.json`, `d052-runtime-typefix1-end.json`, `d052-types-db.log`, `d052-types-db-corrected1.log`, `d052-types-engine.log`, `d052-failed-touched1.log`.
- `d053-d055-candidate-frozen1.json`, `d053-d055-runtime-frozen1-start.json`, `d053-d055-runtime-frozen1-end.json`, `d053-d055-types-api.log`, `d053-d055-types-db.log`, `d053-d055-types-engine.log`, `d053-d055-types-web.log`, `d053-d055-failed-touched1.log`, `d053-d055-failed-touched1-failures.log`.
- `d053-d055-candidate-harnessfix1.json`, `d054-importer-runtime2-start.json`, `d054-importer-runtime2-end.json`, `d054-importer-failed-touched2.log`, `d055-persistence-runtime2-start.json`, `d055-persistence-runtime2-end.json`, `d055-persistence-failed-touched2.log`, `d055-persistence-failed-touched2-failures.log`.
- `d056-candidate-claimfix1.json`, `d056-runtime-claimfix1-start.json`, `d056-runtime-claimfix1-end.json`, `d056-types-engine.log`, `d056-per-fact-failed-touched1.log`.
- `d056-candidate-persistencefix1.json`, `d055-persistence-runtime3-start.json`, `d055-persistence-runtime3-end.json`, `d055-persistence-failed-touched3.log`.
- `affected-final-d056-runtime-start.json`, `affected-final-d056-runtime-end.json`, `affected-final-core-d056.log`, `affected-final-web-d056.log`: the exact sealed17-file affected attempt, including its unignored first scoped API open500 failure.
- Earlier first D048-D050 failure provenance: `d048-d050-candidate-typefix3.json`, `d048-d050-runtime-typefix3-start.json`, `d048-d050-runtime-typefix3-end.json`, `affected-initial-core.log`, `affected-initial-web.log`, `d048-d050-affected-initial-failures.log`; API fixture correction provenance: `d048-d050-candidate-api-fixture1.json`, `d048-d050-runtime-api-fixture1-start.json`, `d048-d050-runtime-api-fixture1-end.json`, `affected-api-fixture1.log`.
- Historical terminal D057 selection: `d057-candidate-scopefix1.json`, `d057-runtime-scopefix1-start.json`, `d057-runtime-scopefix1-end.json`, `d057-types-db.log`, `d057-types-api.log`, `d057-failed-touched1.log`, subject to exact root attribution/security review; its completed diagnostics no longer stand in for current D063 proof.
- D058 selection: `d058-clear-candidate.json`, `d058-facts-baseline-red.log`, `d058-facts-runtime-baseline-start.json`, `d058-facts-runtime-baseline-end.json`, `d058-persistence-baseline-red.log`, `d058-persistence-runtime-baseline-start.json`, `d058-persistence-runtime-baseline-end.json`, `d058-clear-runtime-start.json`, `d058-clear-runtime-end.json`, `d058-clear-focused-runtime-end.json`, `d058-clear-focused-green.log`, `d058-clear-scribe-concern.log`, `d058-clear-types-db.log`, `d058-clear-types-engine.log`, `d058-clear-types-api.log`.
- D059/D060 selection: `d059-projection-runtime-start.json`, `d059-projection-runtime-end.json`, `d059-projection-focused.log`, `d059-projection-types-db.log`, `d059-leaf-baseline-runtime-start.json`, `d059-leaf-baseline-runtime-end.json`, `d059-leaf-baseline-red.log`, `d059-leaf-source-candidate.json`, `d059-leaf-repair-runtime-start.json`, `d059-leaf-repair-runtime-end.json`, `d059-leaf-repair-focused.log`, `d059-leaf-repair-types-db.log`, `d059-d060-graph-baseline-runtime-start.json`, `d059-d060-graph-baseline-runtime-end.json`, `d059-d060-graph-baseline-red.log`. These distinguish reached baseline failures from later previously UNRUN controls and optional projection identity from whole candidate identity.
- D063 prior repaired snapshot selection: `d063-repaired-candidate.json`, `d063-repaired-runtime-start.json`, `d063-repaired-runtime-end.json`, `d063-repaired-types-db.log`, `d063-repaired-types-engine.log`, preserving actual compiler/diagnostic outcomes. Narrowing terminal records now exist: `d063-narrowing-candidate.json`, `d063-narrowing-runtime-start.json`, `d063-narrowing-runtime-end.json`, `d063-narrowing-types-db.log`, `d063-narrowing-types-engine.log`, `d063-narrowing-types-api.log`, `d063-narrowing-focused.log`. Preserve exit1/104tests98pass6fail and exact early202-versus200 fixture phase with later privacy assertions UNREACHED. These are eligible for root's exact security/content/terminal-identity selection, not current acceptance proof. Any forthcoming D064/current run log stays excluded until its own real terminal evidence exists; never overwrite these failure records.
- D064 selected sealed history: `d064-candidate.json`, `d064-api-runtime-start.json`, `d064-api-runtime-end.json`, `d064-api-focused.log`, retaining six fence-age failures after actual approval/purge/foreign checks but before regrant/privacy.
- D065 selected sealed history: `d065-candidate.json`, `d065-api-runtime-start.json`, `d065-api-runtime-end.json`, `d065-api-focused.log`, `d065-affected-runtime-start.json`, `d065-affected-runtime-end.json`, `d065-affected-core.log`, `d065-affected-web.log`. These bind six reached privacy greens and the actual whole21affected11failures, without suppressing the RED.
- D066 selected sealed history: `d066-candidate.json`, `d066-diagnostics-runtime-start.json`, `d066-diagnostics-runtime-end.json`, `d066-diagnostics-focused.log`, `d066-diagnostics-types-engine.log`, `d066-importers-runtime-start.json`, `d066-importers-runtime-end.json`, `d066-importers.log`.
- D067 selected current immutable candidate/runtime results: `d067-candidate.json`, `d067-affected-runtime-start.json`, `d067-affected-runtime-end.json`, `d067-affected-core.log`, `d067-affected-web.log`. Terminal summary413tests368pass45oldNOT-RUNNABLEskip0fail/cancel over eight files,14new controls passed, all112pins matched, mutex absent. Preserve `notFreshWhole21`/untouched-D065 impact-reuse declarations and exact current type reuse915dfd/9c8bd1. These are maker evidence, not formal acceptance or new whole21/full118 test execution.

The exact minimum bookkeeping/document selection is `TASKS.md`, `docs/DECISIONS.md`, `docs/plan.md`, `qa/manifests/t-052-session-lifecycle.md`, and this `qa/evidence/t052-maker-cycle2/release-transfer-proposed.md`. Select root's final current release manifest/verdict/checkpoints by actual filename once ready; preserve existing historical `qa/manifests/vc-release-t052-2026-10-13.md`, `qa/verdicts/vc-release-t052-2026-10-13.md`, `qa/verdicts/vc-release-t052-2026-10-13.b.md`, `qa/checkpoints/vc-release-t052-primary-2026-10-13.md`, and `qa/checkpoints/vc-release-t052-2026-10-13.b.md` as FAIL provenance if included. `qa/QUEUE.md`, `qa/issues.jsonl` and `qa/.last-tick` are optional explicit root reconciliation paths, never copied while still being appended. No other bookkeeping path enters the allowlist by directory membership.

Additional exact existing QA prose selected for review before readiness is `readiness-mapping-proposed.md`, `browser-acceptance-proposed.md`, and `publication-impact-d048-d050.md` under this evidence directory. Owners refresh hashes/content for D06727/current21affected impact reuse and final bytes. Publication-impact prose/earlier safe audits are inputs only; this task grants no final SAFE. Final content security audit binds actual outgoing history/current27 and selected executable QA/JSON/log/images/artifact identities. Active logs/temp output/unaudited deltas remain excluded.

### Immutable DECISIONS replication through the existing safe-door

Read-only verification found release live history endsD041 and primary endsD067: exactly missingD042-D067. The primary starts with the release history after CRLF/LF normalization; raw prefix differs only in existing checkout line endings, so do NOT overwrite the release prefix to manufacture a whole-file primary SHA match. Existing `scripts/append_decision.ps1` is identical in both checkouts, SHA256 `EE1FD137F8BA476E51694BD43BDEA1CAC8897EBF9F11210CFE6CAE63657627F2`. Its only legitimate write call is `powershell -ExecutionPolicy Bypass -File <release>/scripts/append_decision.ps1 -EntryFile <single-existing-entry-file> -RepoRoot <release>`; it validates exactly one entry and sequential live+archive IDs, then AppendAllText UTF8-no-BOM without editing prior bytes. There is no clone/import bypass mode and no interprocess lock in this implementation; root must hold sole DECISIONS replication ownership.

Later root procedure, not executed here: freeze primary DECISIONS/approval records; capture release decision bytes/hash and full current release/archive ID set; verify normalized existing prefix again. For each missing ID in orderD042...D067, extract that exact complete already-authorized single entry from frozen primary (header through next header, no rewriting/renumbering/approval fabrication). Reuse original entry draft if available; otherwise root may materialize exact temporary EntryFile input outside release in approved scratch, not a new helper/product file. Assert exactly one expected header and exact normalized entry equality, and invoke the EXISTING release appender with explicit `-RepoRoot`. Require exit0 and `APPENDED: D-NNN` each time, then read the actual appended entry and verify exact field/content equality. On refusal, preserve all files, stop replication and diagnose; never raw-copy/Set-Content/Edit/AppendAllText DECISIONS directly or change/archive existing IDs to bypass validation.

After all appends, verify every byte of the captured original release prefix is unchanged, sequential missing entries each occur exactly once, and the complete resulting log equals frozen primary after CRLF/LF normalization (including all fields/separators; no history filtering). Record the replica's OWN SHA256 as its selected-artifact identity; line-ending differences mean that hash may differ from primary. Verify whole primary bytes still match the pre-replication freeze and no peer appended/mutated it mid-transfer. Stage only this appender-produced `docs/DECISIONS.md` alongside the explicit selected records. Entry inputs/logs stay external; no script/helper/.git/archive change is authorized. If normalized prefix or exact entry comparison fails, this is a genuine bookkeeping transfer blocker, not permission to overwrite immutable history.

These records preserve raw failed/typefail/cancellation results and reached/unreached boundaries. Frozen1's six-file maker run was547tests/492pass/5fail/5cancel/45existing skips. One sealed historical final17 attempt was723tests/677pass/1fail/0cancel/45old B18skips:15 CORE706/660pass/1APIopen500 plus2 WEB17/17; later D057 had723/678pass/0fail/cancel/45skips and subsequent fresh source BLOCK. D063 narrowing now retains104/98pass/6early API fixture failures with later privacy assertions UNREACHED. All are diagnostics, not acceptance; preserve full logs and distinct historical identities. Root adds actual next terminal repair/verification and new final frozen inventory if changed, current21 affected closure, all11type outputs, fresh source reviews and blind acceptance artifacts by exact filename after they exist. Unaffected reuse requires all applicable current loaded source/test/config/runtime identities and permitted impact reasoning; do not silently turn historical green/current early-stage failures into a current21 pass or repeat unchanged maker unions solely for packaging. Selected historical diagnostics are committed before final6c only after publication-content review; unrelated caches/active locks/live temporary output/raw credentials/provider or production exports/secrets are excluded. `.log` is ignored in Git; intentionally retained logs need `git add -f -- <each approved log>`, never a forced directory. Actual final6c/browser outputs remain external.

### Concrete later transfer/staging command specification

This is an inline later root specification, not a new helper; no mutation commands were executed here. Run after exact final freeze, fresh source review closure/blind acceptance and final selected-content review. Set `$taskFinalManifestPath` to the actual accepted post-D073 complete final freeze; D06727 and pre-D07328 are not eligible substitutes. Set `$taskExpectedPaths` to items1-28 and `$taskApprovedRecordPaths` to exact reviewed records plus actual terminal final artifacts, including appender-produced DECISIONS. Neither list comes from globs/enumeration. Check clean baseline BEFORE any copy/append, then candidate copy, lawful decision replication and explicit record copy/staging. The record loop excludes DECISIONS writes and unsealed/live output.

```powershell
$taskPrimaryRoot = [IO.Path]::GetFullPath('D:/vc')
$taskReleaseRoot = [IO.Path]::GetFullPath('C:/Users/Lenovo/.codex/worktrees/vc-release-check/vc')
$taskExpectedHead = '13207bd024e6d5e3e01c07843a12d40a9b53c56c'
$taskFinalManifestPath = (Resolve-Path -LiteralPath '<actual-accepted-post-d073-final-frozen-json>').Path
if ($null -eq $taskExpectedPaths -or @($taskExpectedPaths).Count -ne 28) { throw 'Set the explicit reviewed 28-path list first' }
if ($null -eq $taskApprovedRecordPaths -or @($taskApprovedRecordPaths).Count -eq 0) { throw 'Set the explicit reviewed record list first' }
$taskCandidate = @(Get-Content -LiteralPath $taskFinalManifestPath -Raw | ConvertFrom-Json)
if ($taskCandidate.Count -ne 28 -or @($taskCandidate.path | Sort-Object -Unique).Count -ne 28) { throw 'Final inventory must contain exactly 28 unique paths' }
if (Compare-Object @($taskExpectedPaths | Sort-Object) @($taskCandidate.path | Sort-Object)) { throw 'Final inventory differs from the approved 28-path selection' }
$taskReleaseHead = git -C $taskReleaseRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $taskReleaseHead -ne $taskExpectedHead) { throw 'Release baseline changed' }
$taskReleaseDirt = @(git -C $taskReleaseRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $taskReleaseDirt.Count -ne 0) { throw 'Release checkout is not clean' }
foreach ($taskRow in $taskCandidate) {
    if ($taskRow.path -match '(^/|^[A-Za-z]:|\\|(^|/)\.\.(/|$))') { throw 'Unexpected inventory path syntax' }
    $taskSource = [IO.Path]::GetFullPath((Join-Path $taskPrimaryRoot $taskRow.path))
    $taskDestination = [IO.Path]::GetFullPath((Join-Path $taskReleaseRoot $taskRow.path))
    if (-not $taskSource.StartsWith($taskPrimaryRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
        -not $taskDestination.StartsWith($taskReleaseRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped its intended root' }
    if ((Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash -ne $taskRow.sha256) { throw "Source changed: $($taskRow.path)" }
    $taskSourceBlob = git -C $taskPrimaryRoot hash-object -- $taskRow.path
    if ($LASTEXITCODE -ne 0 -or $taskSourceBlob -ne $taskRow.gitBlob) { throw "Source Git blob changed: $($taskRow.path)" }
    Copy-Item -LiteralPath $taskSource -Destination $taskDestination
    if ((Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash -ne $taskRow.sha256) { throw "Destination bytes differ: $($taskRow.path)" }
    $taskDestinationBlob = git -C $taskReleaseRoot hash-object -- $taskRow.path
    if ($LASTEXITCODE -ne 0 -or $taskDestinationBlob -ne $taskRow.gitBlob) { throw "Destination Git blob differs: $($taskRow.path)" }
}
$taskCopiedRecordIdentities = @()
# At this boundary perform the exact sequential safe-door replication above.
# Set this flag ONLY after original-prefix/exact-entry/full normalized readback
# and unchanged frozen-primary checks actually succeed; it is not permission.
foreach ($taskRecordPath in $taskApprovedRecordPaths) {
    if ($taskRecordPath -eq 'docs/DECISIONS.md') {
        if ($taskDecisionReplicationVerified -ne $true) { throw 'Lawful decision replication/readback not verified' }
        # Already reproduced by sequential existing append_decision.ps1 calls,
        # immutable-prefix + exact-entry checks above. NEVER Copy-Item this file.
        $taskDecisionReplica = Join-Path $taskReleaseRoot 'docs/DECISIONS.md'
        $taskCopiedRecordIdentities += [pscustomobject]@{path=$taskRecordPath;sha256=(Get-FileHash -LiteralPath $taskDecisionReplica).Hash;method='existing-append-safe-door'}
        continue
    }
    if ($taskRecordPath -in $taskCandidate.path -or $taskRecordPath -match '(^/|^[A-Za-z]:|\\|(^|/)\.\.(/|$))') { throw 'Record overlap or invalid path' }
    $taskRecordSource = [IO.Path]::GetFullPath((Join-Path $taskPrimaryRoot $taskRecordPath))
    $taskRecordDestination = [IO.Path]::GetFullPath((Join-Path $taskReleaseRoot $taskRecordPath))
    if (-not $taskRecordSource.StartsWith($taskPrimaryRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
        -not $taskRecordDestination.StartsWith($taskReleaseRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Record escaped its intended root' }
    $taskRecordHash = (Get-FileHash -LiteralPath $taskRecordSource -Algorithm SHA256).Hash
    $taskRecordParent = Split-Path -Parent $taskRecordDestination
    if (-not (Test-Path -LiteralPath $taskRecordParent)) { New-Item -ItemType Directory -Path $taskRecordParent -Force | Out-Null }
    Copy-Item -LiteralPath $taskRecordSource -Destination $taskRecordDestination
    if ((Get-FileHash -LiteralPath $taskRecordDestination -Algorithm SHA256).Hash -ne $taskRecordHash -or
        (Get-FileHash -LiteralPath $taskRecordSource -Algorithm SHA256).Hash -ne $taskRecordHash) { throw "Record changed during transfer: $taskRecordPath" }
    $taskCopiedRecordIdentities += [pscustomobject]@{ path = $taskRecordPath; sha256 = $taskRecordHash }
}
# Save the selected record identities externally before final6c; do not add a
# generated identity output to the release checkout after its final commit.
$taskStagePaths = @($taskCandidate.path) + @($taskApprovedRecordPaths)
foreach ($taskPath in $taskStagePaths) {
    if ($taskPath.EndsWith('.log', [StringComparison]::OrdinalIgnoreCase)) {
        git -C $taskReleaseRoot add -f -- $taskPath
    } else {
        git -C $taskReleaseRoot add -- $taskPath
    }
    if ($LASTEXITCODE -ne 0) { throw "Explicit staging failed: $taskPath" }
}
$taskStagedPaths = @(git -C $taskReleaseRoot diff --cached --name-only)
if ($LASTEXITCODE -ne 0 -or (Compare-Object @($taskStagePaths | Sort-Object -Unique) @($taskStagedPaths | Sort-Object))) { throw 'Staged paths differ from explicit reviewed selection' }
git -C $taskReleaseRoot diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
git -C $taskReleaseRoot diff --cached --stat
git -C $taskReleaseRoot diff --cached
# After actual staged review, use an external exact-text message file:
git -C $taskReleaseRoot commit -F '<root-owned-external-commit-message-file>'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed; preserve all files/index for diagnosis' }
git -C $taskReleaseRoot rev-parse HEAD
git -C $taskReleaseRoot rev-parse 'HEAD^{tree}'
git -C $taskReleaseRoot diff-tree --no-commit-id --name-only -r HEAD
git -C $taskReleaseRoot status --porcelain=v1 --untracked-files=all
```

Root supplies two explicit arrays from these lists; unset variables/placeholders fail before copy. Perform clean-baseline check before all mutations; safe-door replication flag requires real verification. Check all post-copy/append paths against explicit selection and require no unstaged/untracked leftovers after commit. An unchanged selected artifact is explicitly excluded from expected staged set with recorded reason, never modified to fake a diff. Recheck whole28candidate hashes/blobs after all copy/appends/commit while source freeze holds; mixed snapshot is forbidden. No primary source/Gitref/index mutation or release reset occurs. Final6c runs on reviewable committed tree with external output/normal mutex; only its actual integration checker stamps.

## Commit, final verification and clean-stamp sequencing

1. Root freezes the candidate after affected checks/types and completed-feature source review obligations are resolved. Root pins readiness policy/protocol identities and dispatches the required blind final acceptance according to the complete current approved plan. No checker starts during BUILDING/REPAIRING.
2. Root transfers only28named product/test paths plus explicit bookkeeping/evidence selection, with DECISIONS appended solely by existing safe-door. Require diff/check/staged-allowlist/stat/actual review. Stage individual paths; `-f` only individually reviewed ignored logs, never add-all/forced-directory.
3. Root records the proposed commit message in an evidence text file and invokes `git commit -F <message-file>` from the release checkout. Record exact commit SHA, parent SHA, tree hash, changed paths and source/test blob identities. A local detached commit is reversible; it is not pushed, deployed or accepted.
4. Both independent final acceptance PASS outcomes must identify this frozen committed product/test content and actual runtime identity. The full coalesced integration suite, all required type configurations, criterion falsification, actual English reference Retry/approval/withheld-summary/reload browser evidence and publication audit remain separate required checks. Do not substitute the old FAIL candidates, the maker's green runs or source reviews for independent PASS.
5. Any acceptance instrumentation required in the committed tree must be selected and committed before final6c. Keep all NEW final6c, type, browser, JSON/PNG and process-identity outputs outside the release checkout, for example in root-owned evidence under `D:/vc/qa/evidence/`; output paths must be absolute and distinct by owner. Existing `.gitignore` ignores `*.log`, node_modules, dist and .next, but does not exempt JSON/images/test harnesses. External output avoids reliance on ignored-path accidents and prevents evidence dirt from blocking the stamp.
6. Immediately before and after the final6c run, record the release HEAD/tree and tracked source/test/config identity. After all required checks pass, confirm clean `git status --porcelain=v1 --untracked-files=all`. Any build/browser/test dirt is inventoried; preserve it externally or commit the explicitly approved artifacts. Never delete or stash unknown material. If product/test/config or blocking evidence is changed after the green run, perform the required impacted acceptance and a new final6c on the final commit before stamping.
7. Only the checker that performed the final6c integration check runs `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --stamp-6c-green --root C:/Users/Lenovo/.codex/worktrees/vc-release-check/vc`. Record exit0, exact `6c-green: <tree>` and read back `qa/.6c-green`; compare to `git rev-parse HEAD^{tree}`. The maker and per-unit acceptance checkers cannot issue this stamp.
8. After stamping, root may commit only narrowly allowed bookkeeping or genuine unloaded docs. New JSON/log/image/executable QA evidence is outside that allowance and requires a new green-tree sequence. Keep final evidence external and reference its durable exact paths/hashes from allowed manifests/verdicts; do not transfer broad artifacts after stamping merely to package the release.

## Source helper facts and installed capability gap

The inspected implementation is `D:/ai_os/.claude/skills/maker/tools/tick.mjs`:

- Lines1056-1060 ignore only `qa/.6c-green`, `qa/.last-tick`, `qa/.wave.json`, and `qa/.wave.mark` when stamping. Untracked paths are checked. Dirty docs/manifests/evidence still block stamp issuance.
- Lines1195-1206 stamp the full 40-hex HEAD tree, not the commit SHA, and refuse other dirt with exit1; a missing commit/repo is exit2. The helper itself checks cleanliness/identity only; the checker's actual successful fullsuite evidence is indispensable.
- Lines361-367 whitelist bookkeeping only: `qa/issues.jsonl`, `qa/.last-tick`, `qa/.wave.json`, `qa/.wave.mark`, `qa/lane-ledger.jsonl`, `qa/QUEUE.md`, `qa/token-ledger.jsonl`, and top-level `qa/manifests/*.md`/`qa/verdicts/*.md`.
- Lines372-387 and1070-1104 additionally allow true docs Markdown only when it is not instruction/data/contract/hook content and is not named by tracked source/tests. All other post-stamp paths remain blocking. Each non-merge commit and cumulative diff since the stamped ancestor are checked, so changing product then reverting it does not qualify as a docs-only post-stamp history.
- `--push-gate` returns green immediately for an exact tree stamp; it does NOT establish clean working-tree state, test execution, checker PASS, remote ancestry, secret safety or authorization. These are explicit separate gates.
- The installed Codex helper `C:/Users/Lenovo/.agents/skills/maker/tools/tick.mjs` does not implement `--stamp-6c-green` or `--push-gate`; no project `qa/tools/tick.mjs` exists. Use the inspected shared source helper with explicit `--root`, subject to root's current protocol/hash pin. Do not adapt/update helper code, create a replacement helper or manufacture a stamp.

## Private push and remote readback

Only after the mandatory independent PASS, full6c/types/browser/publication checks and checker-issued green stamp exist, root runs the required source helper:

`node D:/ai_os/.claude/skills/maker/tools/tick.mjs --push-gate --root C:/Users/Lenovo/.codex/worktrees/vc-release-check/vc`

Record exit0 and exact `push-gate: green <tree>`. Separately re-check clean status and that final source/test blobs still match checked content. Read `git ls-remote origin refs/heads/main`, verify the actual remote tip is an ancestor of the final candidate, and audit the exact outgoing history/content; the previously reported 593-ahead value is not itself an outgoing-commit approval. If the remote advanced or ancestry/content is unresolved, stop that push and retain all local work.

If the user-authorized private destination is still existing `origin` main (`https://github.com/umeshsugara-ai/vc.git`), use normal non-force `git push origin HEAD:refs/heads/main` from the detached release checkout. No force/reset/primary checkout move is proposed. Read back `git ls-remote origin refs/heads/main` and require the exact candidate commit SHA, then record pushed commit/tree, gate output and remote URL. A private Git push is a separate state from Ubuntu deployment and production live validation.

Leave primary `D:/vc` untouched after release push: its main ref and dirty files may remain at the prior base. Do not move its shared branch with update-ref/reset/checkout to make status appear clean. Root can reconcile the primary later using an attributable per-path plan that preserves peer/untracked content. Remote readback proves publication; it does not prove primary reconciliation or deployment.

## Current blockers

Preparation: READY for root's later27path transfer; no missing checkout/dependency or lawful decision-append capability was found. Current D067 maker closure is413tests368pass45oldNOT-RUNNABLEskip0fail/cancel on eight files,14new+11oldfailures reached GREEN,112stablepins; untouched D06521scope outputs are explicitly impact-reused, not newly executed whole21. Source reviewers SSE/data/AI are running and formal acceptance is NOT dispatched. Their current closure, two fresh blind cycle2 complete B23 C1-C7 outcomes/falsification and all release gates remain pending; current maker greens/plan approvals are no PASS. Each blind coordinator derives own API/inspection/lease/foreignABA/direct/nestedsettlement/CAS/public-content compatibility evidence; cap10 cannot omit mandatory distinct risks, supported increase names file:line/risk. Neither reads the other's verdict/evidence.

After independent current acceptance and reviewable narrow committed transfer, the actual primary integration checker alone runs one complete final6c/all11 applicable types and visible English Retry/approval/withheld-summary/reload browser validation with its own build/session identity. Secondary runs no duplicate fullsuite. Preserve all45old skipped B18 controls as skips; no voice/Hindi/production-client/issuer/expert/full-goal completion is inferred. Final publication-content audit must bind current outgoing history and selected exact artifacts; only successful actual final6c checker issues the clean-tree stamp. Root then performs source-helper push-gate, clean-status/content checks, actual private-origin/remote-tip/ancestry checks, nonforce push and exact remote-SHA readback. Failed acceptance/security/current suite or unresolved proof blocks push; a private push remains separate from deployment/live validation.

This owner ran no runtime/resolver/test/DB/provider probe, acceptance/security review, transfer/install/decision append/staging/commit/ref change or push; only existing QA prose changed. D067 inventory readback, clean baseline/dependency metadata and safe-door/prefix analysis are preparation facts. Root owns final selected coverage/security, lawful DECISIONS appends and independent source/dual/integration/browser/stamp/privatepush gates. No routine human permission question is needed for prepared reversible work.

## Proposed OpenAPI lifecycle response correction (read-only source plan, 2026-10-14)

Scope: documentation declaration correction only, carried as a low finding after the completed SSE review. Candidate 26F1BB remains frozen. This section authorizes no implementation, runtime, test change, feature PASS, redeployment or push; root must obtain the fresh quality approval and append the authorizing decision before changing source. All earlier release-transfer text remains preserved and may describe earlier candidate states.

Exact existing seam: apps/api/src/openapi.ts, OPENAPI_DOCUMENT.paths, the existing prepare/open/close Object.fromEntries map at lines89-101, its post.responses object at lines98-99. It currently declares200/400/401/403 and omits two already possible response classes. The corresponding ROUTES map in apps/api/src/server.ts:284-295 passes the JWT-derived tenantId/actorId plus validated operation/body into ensureScribeSessionRow. The single existing mapError at server.ts:590-609 maps StudentFencedError to409/{error:"student_fenced"} at603, Mongo duplicate-key11000 to409/{error:"conflict"} at604, and FencedWriterDeadlineError to503/{error:"writer_deadline"} at605. This is observed source mapping, not a new live-response assertion.

Smallest proposed in-place change: add only the following two entries to that existing lifecycle post.responses object. Keep200/400/401/403, paths, operationIds, roles, parameters, request bodies and every route/error handler unchanged. Reuse the existing Conflict component and existing Error schema; do not add a response helper, component, file, enum restriction or shared-errors spread that incidentally changes other operations.

```typescript
"409": { $ref: "#/components/responses/Conflict" },
"503": { description: "The bounded writer deadline expired", ...json({ $ref: "#/components/schemas/Error" }) },
```

The existing Conflict response at openapi.ts:85 already describes conflict with current state. The existing Error schema at46-49 requires the error string and accepts the mapper's three exact response bodies. No new model/schema or role authorization is required. Lifecycle routes do not invoke a provider, so this503 description refers to writer_deadline; it does not claim ai_unavailable occurs on prepare/open/close.

Verification after approved implementation, owned and scheduled by root: inspect the two added declarations and resolve both refs against the unchanged components; run the existing @vc/api typecheck script (pnpm --filter @vc/api typecheck); retain the existing API server checks and the signed-JWT lifecycle test at tests/server.test.ts:48 plus the OpenAPI route-table test at927. The latter checks method/path/roles and public document availability only, so do not describe it as checking response statuses or schema conformance. In the already approved synthetic API acceptance/runtime, read the actual existing /v1/openapi.json output and confirm all three lifecycle operations declare409 and503 with the referenced Error shape; compare the served document to the checked source identity. Do not create a source-mirroring snapshot/assertion test, extra fixture, helper or standalone server merely for this low documentation correction. Current runtime error-path proof remains the separate existing acceptance evidence and is not manufactured by changing OpenAPI.

No source changes, suites, build, server launch, HTTP request, provider call, credential read or real database access were performed for this proposal. Future source changes invalidate the old frozen candidate identity and need root's normal impacted-check/final-identity handling before any completion/publication claim.

## Historical D067 source-review BLOCK addendum - current D073 replay specification below

### First later step: exact safe-door decision replay, no raw overwrite

This addendum is append-only; all earlier plan/history bytes remain. Read it before executing older readiness language. The commands below are a later root procedure, not performed here. Clean managed release baseline was reverified read-only: HEAD13207bd024e6d5e3e01c07843a12d40a9b53c56c, treec186c90bb82a0620da93803374063675157c4c9c, porcelain status empty. Release DECISIONS endsD041; primary endsD067, D068 is absent at this boundary. Normalized existing prefix matches. Preserve release raw prefix bytes/line endings; the replica's own hash can differ from primary. Existing identical safe-door script hashEE1FD137F8BA476E51694BD43BDEA1CAC8897EBF9F11210CFE6CAE63657627F2 is the sole permitted decision-log writer.

Later root freezes the primary decision log and exact source entry inputs, captures release existing bytes/hash and live+archive IDs, and verifies clean release BEFORE any copy/append. Use original single-entry draft inputs when available; otherwise materialize only exact single-entry temporary input files in approved external scratch, never a new helper or altered approval. No input/artifact is created by this addendum. Supply `$taskEntryFiles` as an explicit ID-to-absolute-EntryFile map for all actual missing entries through the later frozen source maximum; currently D042...D076. Each file must contain exactly the matching complete immutable source entry (header through before next header, same fields/text). Sole root owns appends; the existing script has no interprocess lock. Do not execute this while a peer is appending either log.

```powershell
$taskReleaseRoot = 'C:/Users/Lenovo/.codex/worktrees/vc-release-check/vc'
$taskPrimaryLog = 'D:/vc/docs/DECISIONS.md'
$taskReleaseLog = Join-Path $taskReleaseRoot 'docs/DECISIONS.md'
$taskSafeDoor = Join-Path $taskReleaseRoot 'scripts/append_decision.ps1'
$taskFrozenSourceHash = (Get-FileHash -LiteralPath $taskPrimaryLog -Algorithm SHA256).Hash
$taskFrozenSourceText = Get-Content -LiteralPath $taskPrimaryLog -Raw
$taskOriginalPrefixBytes = [IO.File]::ReadAllBytes($taskReleaseLog)
$taskOriginalPrefixText = Get-Content -LiteralPath $taskReleaseLog -Raw
if (-not $taskFrozenSourceText.Replace("`r`n","`n").StartsWith($taskOriginalPrefixText.Replace("`r`n","`n"),[StringComparison]::Ordinal)) { throw 'Immutable decision prefix mismatch' }
$taskSourceEntries = [regex]::Matches($taskFrozenSourceText,'(?ms)^## D-(?<id>\d{3,}) \|.*?(?=^## D-\d{3,} \||\z)')
$taskFrozenSourceMax = (@($taskSourceEntries | ForEach-Object { [int]$_.Groups['id'].Value }) | Measure-Object -Maximum).Maximum
$taskFrozenReleaseIds = @([regex]::Matches($taskOriginalPrefixText,'(?m)^## D-(\d+) \|') | ForEach-Object { [int]$_.Groups[1].Value })
$taskFrozenReleaseMax = ($taskFrozenReleaseIds | Measure-Object -Maximum).Maximum
if ($null -eq $taskFrozenSourceMax -or $null -eq $taskFrozenReleaseMax -or $taskFrozenSourceMax -lt $taskFrozenReleaseMax) { throw 'Invalid frozen decision maxima' }
$taskReplayIds = @()
if ($taskFrozenSourceMax -gt $taskFrozenReleaseMax) { $taskReplayIds = @(($taskFrozenReleaseMax + 1)..$taskFrozenSourceMax) }
# Current official primary maximum is D076; replay only actual frozen entries.
# Verify exact approved scope and EntryFile for each missing actual entry.
# The existing appender independently enforces max(live + archive)+1.
foreach ($taskReplayId in $taskReplayIds) {
    $taskExpectedId = 'D-' + $taskReplayId.ToString('000')
    $taskSourceMatch = @($taskSourceEntries | Where-Object { [int]$_.Groups['id'].Value -eq $taskReplayId })
    if ($taskSourceMatch.Count -ne 1) { throw "Missing/duplicate frozen source entry: $taskExpectedId" }
    $taskEntryFile = $taskEntryFiles[$taskExpectedId]
    if ([string]::IsNullOrWhiteSpace($taskEntryFile) -or -not (Test-Path -LiteralPath $taskEntryFile)) { throw "Exact EntryFile unavailable: $taskExpectedId" }
    $taskInput = (Get-Content -LiteralPath $taskEntryFile -Raw).Trim().Replace("`r`n","`n")
    if ($taskInput -cne $taskSourceMatch[0].Value.Trim().Replace("`r`n","`n")) { throw "Entry input differs: $taskExpectedId" }
    $taskBeforeIds = @([regex]::Matches((Get-Content -LiteralPath $taskReleaseLog -Raw),'(?m)^## D-(\d+) \|') | ForEach-Object { [int]$_.Groups[1].Value })
    if ($taskBeforeIds -contains $taskReplayId) { throw "Do not replay an existing ID: $taskExpectedId" }
    # The existing safe-door independently requires max(live + archive)+1.
    $taskAppendOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $taskSafeDoor -EntryFile $taskEntryFile -RepoRoot $taskReleaseRoot
    if ($LASTEXITCODE -ne 0 -or -not ($taskAppendOutput -match ('^APPENDED: ' + [regex]::Escape($taskExpectedId) + ' \|'))) { throw "Safe-door refused: $taskExpectedId" }
    $taskReplicaEntry = @([regex]::Matches((Get-Content -LiteralPath $taskReleaseLog -Raw),'(?ms)^## D-(?<id>\d{3,}) \|.*?(?=^## D-\d{3,} \||\z)') | Where-Object { [int]$_.Groups['id'].Value -eq $taskReplayId })
    if ($taskReplicaEntry.Count -ne 1 -or $taskReplicaEntry[0].Value.Trim().Replace("`r`n","`n") -cne $taskInput) { throw "Appended entry readback differs: $taskExpectedId" }
}
$taskReplicaBytes = [IO.File]::ReadAllBytes($taskReleaseLog)
if ($taskReplicaBytes.Length -lt $taskOriginalPrefixBytes.Length) { throw 'Decision log truncated' }
for ($taskByteIndex=0; $taskByteIndex -lt $taskOriginalPrefixBytes.Length; $taskByteIndex++) {
    if ($taskReplicaBytes[$taskByteIndex] -ne $taskOriginalPrefixBytes[$taskByteIndex]) { throw 'Existing immutable prefix changed' }
}
if ((Get-FileHash -LiteralPath $taskPrimaryLog -Algorithm SHA256).Hash -ne $taskFrozenSourceHash) { throw 'Primary decision freeze changed during replication' }
$taskReplicaText = Get-Content -LiteralPath $taskReleaseLog -Raw
if ($taskReplicaText.Replace("`r`n","`n") -cne $taskFrozenSourceText.Replace("`r`n","`n")) { throw 'Full normalized decision replica differs' }
$taskDecisionReplicaHash = (Get-FileHash -LiteralPath $taskReleaseLog -Algorithm SHA256).Hash
$taskDecisionReplicationVerified = $true
# Record OWN replica hash, original-prefix hash, all APPENDED outputs/entry IDs
# externally. Only then stage the appender-produced docs/DECISIONS.md with
# other explicitly reviewed records; never Copy-Item/Edit/Set-Content this log.
```

A script refusal, archive sequence mismatch, changed primary freeze, missing real EntryFile or any prefix/entry/full-history mismatch blocks bookkeeping transfer. Preserve all inputs and appended history; diagnose through the legitimate path. No reset/ref move/raw rewrite/manual append/archive bypass is authorized. Official primary history now contains D068-D073. Future replay derives only actual entries through the later frozen maximum, with their exact approval scope and EntryFiles verified; subsequent entries require a fresh freeze. Plan approval and decision replication grant no acceptance or transfer/push authority.

### Updated release status and remaining dependencies

Current frozen D06727 candidate isA7677D95CDBD232A3300EC55C0D507863580D9FDF9A51D8300DFE59232C804EA. Fresh completed source reviews have now finished: SSE BLOCK, Data BLOCK, AI scoped Approve. AI's scoped approval does not clear the other source blockers or constitute formal acceptance. D068 plans are preparing; no D068 source edit or accepted repair is asserted at this boundary. Earlier text saying source reviews were running is historical.

D067 runtime remains exact maker evidence:413tests/368pass/45existing NOT-RUNNABLE skips/0fail/cancel,112pins stable; eight-file rerun plus attributable unaffected D06521scope impact reuse. It is not a fresh whole21, criterion acceptance, independent checker PASS, fullsuite or release-ready result. Keep all14new/11old reached green controls and original RED/BLOCK history intact.

No formal blind acceptance has been dispatched. Root must resolve the independently reported SSE/Data source blockers through concrete approved D068 plan/decision and in-place authorized repair, preserve original protected oracles/deadlines, then freeze any changed candidate and record only actual impacted verification. Fresh completed source closure precedes two fresh blind cycle2 complete B23 coordinators; each owns its evidence/falsification and does not read the other's verdict. Final11types, actual sole primary6c, visible English browser/build/session proof, exact final outgoing-content SAFE, checker-only clean-tree stamp, source-helper push-gate, private-origin/remote-ancestry validation, nonforce push and exact remote readback remain distinct pending gates. Existing27 list remains the last frozen candidate selection, not authorization to transfer unreviewed D068 bytes; any later delta needs new exact inventory.

This owner performed only read-only baseline/decision checks and this append-only QA prose update. No decision replay, source/test/manifest edit, new artifact/helper, runtime/provider/DB operation, transfer/install/stage/commit/ref change or push occurred. Preparation procedure is reviewable; release remains BLOCKED on actual source-review findings and unproved final gates.

## D073 current28 release preparation amendment - no acceptance

This finite documentation amendment supersedes older current/READY wording, historical27 transfer authority, D067-only bookkeeping and D068-absent replay assumptions; historical snapshot names, hashes, runtime results and source BLOCK/FAIL evidence above remain retained. Current official primary maximum is D073; future replay and the exact EntryFile map use every actual missing entry through the later frozen maximum, currently D042-D073. Subsequent actual entries require a fresh freeze and approval-scope verification; no future entry is invented. Release remains no-GO pending actual verification. This docs lane performed no transfer, runtime, test, acceptance review, stamp, commit or push.

D072 added only existing packages/engine/evals/score.ts, SHA2563CDB235C4463EAF19E318826C52CE3C71E2B2E087948A1B9F732607C62CB3849, making the exact source/test allowlist28. Pre-D073 maker inventory1ACD528CF6FF2BA7D4B260AD770705A6F220E45CD21222B0E08FCC117C3D47EE remains historical. All three D073 owners have returned frozen handbacks; none remains described as implementing:

| Owner | Existing path | Frozen handback SHA256 |
|---|---|---|
| resume_graph_d068 | packages/engine/src/scribe/graph.ts | 9AC10E0C1A6FB5B6284DF50A9C7A88C5F71E1FC0D14CA21287A8BF3F8D2C1E2B |
| resume_facts_d068 | packages/db/tests/facts.test.ts | 74ECA5DD4E2FD8CF6DBCA0283CDB05CF1A7516740FD6E4E956642C06513FC6C8 |
| node_fixture_d070 | packages/engine/tests/scribe-per-fact.test.ts | DFADB71FAA6F32F40CB0EF107297A691716D63633B2D2C9625B66203F7252F70 |

These are maker handbacks under D073 and independent PLAN approval A10C1F87E1F21C2034B4E387BF303463E0DF63D0D33B81B26285259583103DEB, not runtime or independent acceptance PASS. Root's sole runtime owner has GO to refresh currentCandidate and run sequential types and affected121 verification; this records assignment, not execution/results. Current affected module closure25CORE+2WEB=27 is separate from28 transferred paths and original128-control obligations; affected121 cannot be relabelled all128 or blind acceptance. Historical19CORE+2WEB=21 and older outputs remain evidence. Current scorer consumers are score-perfect.test.ts, score-fabricator.test.ts, score-lazy.test.ts and score-case-drift.test.ts under packages/engine/evals; root pins the complete current affected module list before runtime, never deriving copy scope from verification reachability.

Recheck whole28candidate hashes/blobs after copy/appends/commit while the actual final source freeze holds. Only that complete post-D073 freeze and attributed terminal verification bind subsequent completed-feature source reviews, both fresh blind PASS outcomes, exact selected outgoing-content SAFE, managed release transfer and sole primary full6c/all11types/visible English browser gates. Lawful decision replay, exact ownership/freshness, clean-tree checker-only stamp and authorized private push/readback remain separate gates. No directory glob/new file/helper/peer evidence/dependency installation is authorized by the28-path correction. Preserve final outputs externally and peer material in primary.

## D076 current release boundary and isolated T038 dispatch - no acceptance

This latest amendment supersedes prior current-maximum and readiness wording while preserving historical pins/snapshots and the exact28 T052 source/test allowlist. Canonical primary DECISIONS currently ends D076: D073 repairs, D074 isolated application-draft authorization, D075 adapter passive diagnostics and D076 helper producer/node witness diagnostics remain separately attributed. Future safe-door replay uses the actual later frozen maximum and exact missing EntryFiles, currently D042-D076; no D077 entry or authority exists.

### T052 remains REPAIRING

Actual D076 evidence is the following existing sealed set beneath D:/vc/qa/evidence/t052-maker-cycle2/:

| Existing artifact | SHA256 |
|---|---|
| d076-node18-helper2-20261014T084455535Z-start.json | BD4B173FF174B630F0F8659C99D6CCA53DBD53B1DFCE2539D42A74D1CCDDFD93 |
| d076-node18-helper2-20261014T084455535Z-end.json | EE264390ACFD82CAD8116784CD74065B76DBFD868F751D1A699B81806C5E68FD |
| d076-node18-helper2-20261014T084455535Z-classification.json | 158815716CE50E58F7D578B9B1C84AD8AEEB13F89A0E5DAF265D083CD2E63E7F |
| d076-node18-helper2-20261014T084455535Z.log | 8E853A4D43675B2337B68B8BD29C9A37CFC9FF4A5718F8F469E943483C88D9EE |

End JSON records exit1,20 collected/15pass/5fail/0cancel/0skip,4966 pins with drift[] and parentLayoutDrift[], absent mutex and noAcceptanceVerdict:true. Classification separates NODE18:15pass/3setup-reachability failures from two public helper controls:0pass/2fail, one reached clean-settlement rejection and one reached native-producer-kind gate. Those three node failures do not prove the remaining semantic aggregate receipt mutation outcome. Genuine captured native WriterDeadline.op FWD and the compiled DOMException root remain distinct, retained settlement identities; unknown origin/provenance stays unknown. These are maker diagnostics, not source acceptance, independent checker verdict or release readiness.

Existing packages/db/src/erasure.ts remains unchanged at SHA25633B6B5946443B1EB3439CE520B7316F3161CBFA75762797759945D3350823CAD. The prior one-hunk timer source plan was independently PLAN REFUSED AS SUBMITTED in initial-persistence-plan-approval.md:624. A revised finite source plan is underway; no approval, source GO or D077 authority is inferred. All original budgets, native companion, provenance/foreign cleanup oracles, nine frozen plans and B23/C1-C7 remain mandatory. T052 completed-source closure, fresh blind dual acceptance and final release6c/types/browser/outgoing-content/stamp/private-push gates remain unperformed/unproved.

### Historical T038 cycle0 ready-for-check dispatch - separate candidate

Read-only verification matched the authoritative existing inline manifest at C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc/docs/plan.md, heading "T-038 bounded application-draft core — authoritative feature manifest", through EOF with original trailing CRLF preserved:

- Whole docs/plan.md SHA256 BF39542146D6C4680EDFD72FE40F50FBF6BBB3BCB4C7CFA3DD3D0DB8C9643F64.
- Exact inline section SHA256 FE7E6BEA1BF06D60F864FB8DBCDD9909C7929AE29EAFB0082F61327483F51FB5.
- Candidate envelope SHA256 CABE9D89F5072A0DF6F22A7A8F0FB2EDED4B5BBD080DA6CCB8258CBCF2199309; all four actual isolated source/test file hashes match its exact {base,root,files} envelope. This is not a Git commit.

Root reports two blind coordinators just dispatched for that isolated T038 candidate. This records dispatch and ready-for-check, not an acceptance result, PASS, transfer, commit, push, deployment or full P2 completion. Neither coordinator reads the other's evidence/verdict. D074's isolated four-file ownership remains separate; T038 source is not added to or copied over the T05228-path bundle. Historical t038 evidence stored beneath the t052-maker-cycle2 folder remains explicitly T038-attributed and grants no T052 verification credit. Preserve the immutable isolated manifest/candidate during matching checks; actual checker outcomes and any later release selection require their own exact identities.

No source/manifest/checker artifact was edited by this docs refresh, no runtime/new file/transfer/commit/push ran, and peer material remains preserved.

## Application cycle1 reconciliation - A scoped PASS, B pending, release held

This latest application-state amendment supersedes the historical cycle0 dispatch/readiness snapshot above while retaining its CABE/BF395/FE7E pins and all T052 release holds. Read-only current isolated verification matched all four source pins in C:/Users/Lenovo/.codex/worktrees/application-draft-core/vc:

| Existing isolated source/test path | SHA256 |
|---|---|
| packages/schemas/src/schemas.ts | 9ED93DDE0CCB545112482B0778218D935645FE1F80A57B5EE69E426B05563882 |
| apps/api/src/server.ts | 7B5EB8BB8F8B3C43013BAF8EED79B498DD541DAFF635F9579AE5E39328989F72 |
| apps/api/src/openapi.ts | 023F25837518C7AB26EA6E044B792ED4BAA99AFB25BF9D9C2851BDCE5FDCF813 |
| apps/api/tests/server.test.ts | 4A81A832F6893A7A5112FD9FBDFF41C6B9440F8E6E9881E86D8CA17E330C186A |

Exact UTF8 compact sorted-key {base,root,files} candidate identity recomputed E4B1031F0AA40D9631D099203020B1E101F293F3C4A33A85104D47EF827C9BE4, base13207bd024e6d5e3e01c07843a12d40a9b53c56c; this is not a Git commit. Current authoritative isolated docs/plan.md whole SHA25678751C08FF0FAB458407CFFD19AE905DB5B97DC40CD99FEE547AC05FC60A3640 and original heading-to-EOF CRLF section SHA256E3DCD2D6784A698839C769E6A2835F3B24886B98DDAA7740CBAB669BF1351B63 matched read-only.

Coordinator A's actual existing isolated qa/verdicts/t038-draft-core.cycle1-a.md is SHA256CAF2F2E6F5EC8DF66D99F38103697D3DDF75C844F80821865EC2747045BA1748. Its current bytes record Cycle checked:1, VERDICT:PASS, matching E4B103 source/manifest identities and bounded stateless generic mapping C1-C4 only. It records4/4 criteria,7/7 required floors, API40/40, schemas63/63 and declared types0/0, with full integration/6c/full P2 explicitly remaining. This documents the actual A verdict, not a new acceptance review or rerun by the docs owner.

Root reports blind coordinator B still live on session24147 and not yet PASS. B private verdict/checkpoint/evidence was not inspected by this docs lane, and A's outcome is not communicated to B here. No dual acceptance, readiness for release, merged state, full T038/P2 completion or publication is inferred. Preserve isolated manifest/source immutability during matching checks; any later B outcome must be reconciled by root against its actual candidate identity.

T052 remains REPAIRING, with no D077 or erasure source GO; complete prospective plan consolidation is ongoing. Canonical maximum remains D076 at this reconciliation. Existing erasure source remains33B6B5946443B1EB3439CE520B7316F3161CBFA75762797759945D3350823CAD; prior refused plan and unproved provenance/native companion boundaries remain retained. The existing28-path T052 source/test allowlist is unchanged. Isolated T038 repairs do not enter or overwrite that bundle.

Full P2 portal/client/authority/five-portal accuracy/zero unintended submission/15-minute outcomes, root coalesced integration, full6c/all applicable types/local browser, exact outgoing-content review/stamp and push capability remain pending. No transfer, source/manifest/checker artifact edit, DECISIONS update, runtime, new file, Git mutation, commit or push was performed by this docs lane; peer material remains preserved.
