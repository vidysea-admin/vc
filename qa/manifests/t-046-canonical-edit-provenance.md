# Manifest — t-046-canonical-edit-provenance

**Contract:** qa/contracts/counselling-engine.md (B2/B3/B5/B14/B21), ARCHITECTURE.md, approved T046 refinements in root docs/plan.md
**Goal task:** T-046
**Date:** 2026-09-30
**Fix cycle:** 0 of max 3
**Dual check:** required; root orchestrator dispatches independent checker
**Base:** f7d168151859d94d7ecf1b2fc2083f1d66d58ad1
**Branch:** codex/t046-canonical
**Bound root:** D:/vc/.worktrees/t046-canonical

## What changed

Canonical bounded counsellor-edit provenance stores actual trusted actor/time and original citation. Real edits require invocation-private approval identity before a durable claim; actor/time are captured once in the winning claim and retained through replay/recovery. AsyncLocalStorage is bound to the exact compiled graph, tenant, student, thread and winner. Serialized configurable/body fields cannot grant authority. Genuine edits preserve authoritative proposal metadata and remove obsolete citation verification; unchanged structured values retain exact source, and whole-batch structured/subset compatibility remains.

Model envelope/candidate/transcript-source metadata is refused before projection rather than stripped. API passes verified JWT identity; webhook uses the shared canonical source. Demo only supplies fixed synthetic identity at its returned trusted engine wrapper and reads actual source back. Existing synthetic tests use explicit trusted actors; missing/blank/forged identities remain negatives. T045 consent, snapshot, deadlines, original driver promises, checkpoint continuity, compensation and token CAS are preserved.

## How to verify

Heavy checks must use elevated/trusted process visibility and D:/vc/scripts/vc-testlock.sh, with Git usr/bin on PATH. No installs/external calls. Individual immutable third-party junctions are reused; every @vc import resolves to this checkout. Actual consumer loader9fa653 resolved local db/providers/schemas/observability source exports100/29/36/6. Root-level eval cannot resolve consumer-only links and is not evidence.

Engine: node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 over every *.test.ts in packages/engine/tests AND packages/engine/evals. Eight siblings use package cwd and their declared tests/*.test.ts, plus web tests/*.test.tsx. Web must use its package JSX configuration.

Typecheck all eleven configs: packages/db; packages/engine; packages/engine/evals; packages/engine/scripts; packages/observability; packages/providers; packages/schemas; apps/api; apps/web; mcp/student-profile; mcp/university-kb, each tsconfig.json via local tsc --noEmit -p.

Independent controls/mutants must cover exact graph binding, concurrent different actors, winner/recovery/replay metadata, structured whole-batch unchanged/changed/subset, unknown/duplicate/reforged metadata, model provenance injection before projection, clean-neighbor survival, exact JWT identity/API/webhook/history, blank/missing actor, original versus new/retired durable values, and preserved authority/deadline/CAS privacy controls.

## Actual outputs (maker only)

- Initial RED0dae26:10 intended failures; GREEN9d0f55:10/10.
- Same-DB second graph RED562e43:1/0/1; binding repair GREEN2680d8:1/1.
- Model envelope/candidate/transcript source injections RED67e33c:3/0/3; boundary repair GREENe7dc52:3/3.
- Expanded core/schema/JWT5b7e5b:24/24 pass, zero failures/cancellations/skips. Log TEMP/t046-expanded-green-2af78023c946408fa04fbf11b2e643b0.log.
- Broken wrapper3326 had wrong author cwd and missing bash date/sleep; manually stopped actualexit1. Zero assertion credit.
- Demo RED92fe0a:1/0/1 intended400!==200; wrapper/readback repair full demo API f63f7a:14/14. TEMP/t046-demo-green-b663c1c067674a609d0b143c75e049fc.log.
- Full engine50271 terminal1:793/742pass/6fail/45skip/0cancel. Six independently approved authoritative-proposal/actor fixture corrections GREEN2f3770:6/6, preserving different actors and recovery winner metadata. TEMP/t046-six-green-24213d5bdacc4d0bb5c4f886735cbf58.log.
- Durable repeat control RED37621:793/747pass/1fail/45skip; expected activefalse contradicted established D013 unsetactive. Independently approved absentactive+hasOwn+validTo/oldvalue/source correction. Final pre-actor engine13014 terminal0:793/748pass/0fail/0cancel/45skip,82425ms. TEMP/t046-engine-finalgreen-d0c280efdf064bc9a4f06d1e4bd247c8.log.
- Eight siblings48122 terminal0: DB253/schema62/providers60/observability59/API48/web39/MCPprofile12/MCPkb29;562/562. All logs retained under TEMP/t046-<package>-default-<id>.log.
- Eleven pre-actor configs11558 actualeach0; TEMP/t046-types-9e632906aa40463f95ee654511f0742d.log.
- Exact actor REDddf465:2/0/2 intentional trimming mismatches. Byte-preserving graph/schema repair actor GREEN18136f/a08d74:4/4 including JWT claim/fact/profile/webhook, history and blank-refusal; TEMP/t046-actor-green-1c5a3877413d4037b21831b6d09846bc.log.
- Malformed durable winner REDa08d74:1/0/1 actualTypeError rather than ApprovalResponseError; TEMP/t046-winner-red-61b15b414f004ec0aa9f2394dacf9a79.log. Subsequently repaired and verified below.
- Contract verifier250f70 exit0: no frozen contracts, PASS by vacuity. No runtime semantic credit.

## Live browser evidence

SKIP — no maker browser/server run yet. Demo/JWT/package checks are synthetic offline evidence, not visible browser delivery. Independent checker must drive actual UI bindings and assess this gap; no browser, live model accuracy, production delivery or full-goal completion claimed.

## Scope limits

No dedicated doNotAsk/destination policy, cards, voice/avatar or application completion; no production/provider/network/push/deploy. Source-only review is not completion. Existing45 engine skips preserved. No ledger or checker verdict written by maker.

## Final repaired outputs

- Approved decisionFromResponse guard validates typed nonblank actor/exact bytes, string ISO timestamp and existing canonical source shape before output. All malformed winner metadata returns fixed raw-free ApprovalResponseError, with zero actual invokes/facts.
- Final controls1cc6bd terminal0:28/28pass/0fail/0cancel/0skip; TEMP/t046-final-controls-fab18a7f05ae426b9b510ae9e59ac333.log.
- Final wrapper17765 terminal0(cd1321): engine794/749pass/0fail/0cancel/45skip; schemas63/API48/web39 allpass. All11 named typeconfigs EXIT0. Index C:/Users/Lenovo/AppData/Local/Temp/t046-final-index-061daf667d6e49e69441252035c26fef.log.
- Complete final engine log C:/Users/Lenovo/AppData/Local/Temp/t046-engine-postrepair-86adf6c99e834511b706d9748a2ed079.log. Schema log875a99f392cb4429911368369f44738e; API9a0ab20c616a45889fd7480491dbb973; weba80e2cdff28b4f15b63f94ec0b1fba83 (same TEMP/t046-postrepair-<package>-<id>.log pattern).
- Observed final nine defaults across serial runs:1357tests/1312pass/45skip/0fail/0cancel. This is not one monolithic run or an independent verdict.

## Frozen SHA256 inventory
- apps/api/src/server.ts SHA256=d4612a0df35570e1e496f68edf343990e426952a21e5b931167c0d9a91cbaf22
- apps/api/tests/server.test.ts SHA256=24cf1d28c7c7feea09dfbf1ad883b17592292f8e2e3f4521125ccd35af47625d
- apps/web/demo/seed.ts SHA256=91b73859ebe5e31069a7da1ef7d6aa6274583753445a2019cb682621a22852c9
- apps/web/tests/api.test.ts SHA256=6dfd2889934b4164059802c13829bda59ca92ef4cb6d03d1912faa5009566d85
- packages/db/src/collections.ts SHA256=7b9befdf3451130f1c79ef64636c18e9fc02def2567376daf37d32bca3615936
- packages/db/src/facts.ts SHA256=940d915a9368c2c56f9f18204b36707563c5adc7246c8c96cf645975f1b927a2
- packages/db/tests/facts.test.ts SHA256=7da1c4936e31c786504419dc05eb38c15be084c1d1b0cefc43f6ad44f0837e9f
- packages/engine/src/scribe/graph.ts SHA256=c1502bcdc72b95ec6b81e627095dd07d5d5cb105fdc481ebf5745294fb4aff49
- packages/engine/src/scribe/nodes.ts SHA256=1e68af5ffa7b4ee5ffa69a0fce72f4dbfed0781ea075fee7ca7a363e8503292e
- packages/engine/src/scribe/schemas.ts SHA256=8c425a28c527a1cb08315ac88027be9114dd5648e885445f3b9fe3dbb0d8e9a0
- packages/engine/src/webhooks/schemas.ts SHA256=cc81bfb8f24675ec4ea963dfd5e24fa6d4cc5cd5a882865b719f407b999aa89c
- packages/engine/tests/b18-suppression-outcome.test.ts SHA256=cbf3177e941775c7937d234808d8c5915a79eb774a2a350c1d4ab5e93859212b
- packages/engine/tests/scribe-per-fact.test.ts SHA256=89d01f96798e41dd4c82a261b5101b12e4ddef4680ea376e1cf869ab49d0ae56
- packages/engine/tests/scribe.test.ts SHA256=4621de455b5401f8d9e914ee3a57cfcc9bdf951ff55121d8e3d4bfe7f72d3806
- packages/schemas/src/schemas.ts SHA256=7d1598ccd58576387c76e1ea83128a00d76d3eeb7c749f0abc0ed201da620437
- packages/schemas/tests/fact-source.test.ts SHA256=02f5aa96538f6289eb690b90f771b740b1abe4edc6bf525cdd52d34b75c9fe34

## Status: checked-PASS (verdict qa/verdicts/t-046-canonical-edit-provenance.md, cycle 0)

## Closeout reconciliation — 2026-10-13
Historical cycle0 bounded PASS qa/verdicts/t-046-canonical-edit-provenance.md on f61ce5d; actual current git diff f61ce5d 4e71afe across16 product paths returned0 differences, integrated4e71afe is ancestorofHEAD. Actual source commit is4e71afe; TASKS source/hash spacing normalized. Later T052 graph/DB changes require currentrelease acceptance; this closeout is not a new execution PASS.
Current full release remains FAIL under qa/verdicts/vc-release-t052-2026-10-13.md and .b.md; no push, deployment or additional acceptance claimed.
