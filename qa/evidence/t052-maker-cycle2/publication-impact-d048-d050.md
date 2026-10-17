# T052 D048-D050 publication-content impact audit

Status: SAFE within the inspected incremental snapshot. No supported secret or actual student-data publication finding; no redaction or privacy-driven exclusion required for inspected files. This is publication-impact evidence only, not feature acceptance, checker PASS, release approval, or authority to push.

Inspection time (UTC): 2026-10-13 20:26:48 UTC.

Bound candidate: qa/evidence/t052-maker-cycle2/d048-d050-candidate-typefix3.json.
Candidate manifest SHA-256: 17c3584b56aaeba384d07790b189e7d5cea4666f3a9cfb8139336329ed7e2460. All 23 candidate path hashes matched at inspection.

Incremental snapshot: 56 paths / 1339329 bytes; SHA-256 e2083a13e72252a8c519ea4a7816b546eae0f123ef4423df8381f42ab4a3cd5a. The digest is SHA-256 of sorted relative-path + space + per-file SHA-256 lines joined by LF (no terminal LF). Every inspected hash matched again before this artifact was written.

Compared with the prior 52-path publication/configuration audit, 14 current source/test paths changed or entered this scope, 40 evidence paths were new or altered, and two bookkeeping paths changed. Nine unchanged candidate bodies and two unchanged bookkeeping files (docs/plan.md and TASKS.md) are excluded from the incremental result. The earlier committed history, T054, and unchanged old evidence were not content-rescanned. Old baseline JSON was read only to compare path/hash identity.

Privately compared the configured GEMINI_API_KEY and MONGODB_URL values against all inspected bytes: zero matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox, and personal-record-marker searches produced no candidate findings. No binary file or archive entered this incremental subset. UUIDs, lifecycle admission values, rejection reasons, and test-driver errors are synthetic fixture material, not operational credentials or production records.

Executable helper boundaries:

- No new standalone executable helper was found in the evidence delta; new evidence is source identity, runtime metadata, compiler/test logs, and plan prose.
- packages/db/tests/fakes.ts remains an in-process fake Mongo surface, using Map-backed fake documents/indexes. It imports BSON value types, not a MongoClient constructor or a production connector.
- packages/engine/tests/scribe-fixtures.ts:134-163 creates fake DB/client instances and MockProvider objects. Held-driver tests monkeypatch fake collection methods in memory, restore methods and open/await held operations in finally; no source-file mutation, deletion, process launch, dotenv load, or production connector call was found in the changed test paths.
- apps/web/demo/seed.ts:175-238 uses VC_SKILLS_DIR only to locate local skill files, creates a fake Mongo client, and constructs MockProvider / synthetic FlakyOnceProvider graphs. It does not load an operational .env or call an external provider.
- apps/web/tests/session-api.test.ts invokes the demo runtime and local handler functions directly. API tests use synthetic fake DB/provider dependencies and local HTTP endpoints; local server cleanup is in finally.
- Existing command records retain the mutex wrapper and explicit node --test-timeout=120000. This audit did not execute those commands or certify test success. Earlier completed runtime records are inspected as disclosure content, not reused as proof for the active typefix-3 run.

Explicit nonterminal/current-run exclusions:

- qa/evidence/t052-maker-cycle2/affected-initial-core.log - active typefix3 run has no terminal end manifest at inspection.
- qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix3-start.json - active typefix3 run has no terminal end manifest at inspection.
- qa/evidence/t052-maker-cycle2/d048-d050-types-api.log - active typefix3 run has no terminal end manifest at inspection.
- qa/evidence/t052-maker-cycle2/d048-d050-types-engine-corrected1.log - active typefix3 run has no terminal end manifest at inspection.
- qa/evidence/t052-maker-cycle2/d048-d050-types-web.log - active typefix3 run has no terminal end manifest at inspection.

These exclusions are outside the stable impact result even where a compiler output may already be closed. Their actual final publication bytes need a later terminal-subset audit. Logs created after this inventory, or subsequent source/bookkeeping changes, are outside the recorded snapshot. No raw log was edited or redacted.

Inspected path hashes:

| Path | Bytes | SHA-256 |
|---|---:|---|
| apps/api/tests/server.test.ts | 74613 | ce584e9259054bde3edfc4c1332a3053c208e24019877f86df531754cbab21e5 |
| apps/web/demo/seed.ts | 14601 | abcf55eaab452e0da6fadc65630456adc5ec9760c941ddc8bd05eb7d4a727026 |
| apps/web/tests/session-api.test.ts | 7324 | 07b008f501314cb40eeaa3c464416d3be9267b019c2302b2ecacb996fb1abb0a |
| docs/DECISIONS.md | 89485 | d1d55473773bc98f9dd355e8afa1828583765e667829942803998cc42b481080 |
| packages/db/src/collections.ts | 14050 | 6c66da00f0dedfc58442807956f8f3b6f17f51f058cc7802fa75207e3572f1c1 |
| packages/db/src/erasure.ts | 118378 | 09bb0126d0ba39c896545612aff3803bc0e16f41724a955193e96ac36d85a6c9 |
| packages/db/src/facts.ts | 128535 | 9a721c47357b971e0633896b659efe3753f8b478fc71edbfbed966af0015a8dc |
| packages/db/tests/erasure.test.ts | 149454 | b9c76e133ea45f9e12f941ac8fa768b5c7c0c1d9592dcb27628acd4d3c0e5340 |
| packages/db/tests/facts.test.ts | 132444 | 6cf6a45c44f4385527330fdb11c86f16dee25ef6f370f022101834c50cce0b94 |
| packages/db/tests/fakes.ts | 26916 | d4a7bab922fb83557da9c45f6d093d64994003530ae7ba92349c8059f82c0cd9 |
| packages/engine/src/scribe/graph.ts | 118755 | 5b3385608b0f3a484af50079174d76bf7d8c4fc26306dc0c620ade9f136368f5 |
| packages/engine/src/scribe/nodes.ts | 91421 | c66f07e41af56bcd4be4ba547061cfc0bdc9d37022190a8f3311c6eab5030bd7 |
| packages/engine/tests/scribe-erasure-fence.test.ts | 29066 | d4eba6717ae899444ec24a03443f56406b9a50529f5bc049bb3fcba5a9099bb4 |
| packages/engine/tests/scribe-fixtures.ts | 7125 | b7ebd80212a61236f9b5282832767e36980606794ef80e04883d22093af89f90 |
| packages/engine/tests/scribe-persistence.test.ts | 118441 | 3fe36c9dd9b515a352eea37117de4a0fd6d850c4630a9ab1eeb566faabc9abb9 |
| qa/evidence/t052-maker-cycle2/commands-and-results.txt | 9315 | 6337bdcc40ff490b829241d1136066c5257b0f1dc27a5740bed5085e12efedad |
| qa/evidence/t052-maker-cycle2/d045-after-validation-hashes.json | 765 | 0ff1caca8bb42cd9fd106d10c6774de2bb3753eca365206b18d9ea65032d5dce |
| qa/evidence/t052-maker-cycle2/d045-corrected-source-hashes.json | 448 | d22b37fab1b1c86d09266fe7c8222929ad5324d93bb3cf4df0f709cd5fab47d4 |
| qa/evidence/t052-maker-cycle2/d045-owned-deadline-fenced-regressions.log | 5910 | 7d1fe225c4a3a4bc74df012fe8a1371b78ed3771473c44bf9147aa8e340b3a60 |
| qa/evidence/t052-maker-cycle2/d045-red-baseline-hashes.json | 448 | aad713d185072b7551450c9db913024b6919d94292ac487165361c55049e6a5a |
| qa/evidence/t052-maker-cycle2/d045-review-closure-corrected.log | 1865 | 5c50dec7c8ca4893b677b80b43f02c5ceaaf4d1477882a1444e5edff00d504b2 |
| qa/evidence/t052-maker-cycle2/d045-review-closure-red.log | 11639 | de5283c1af0d930b26b41a15242ef2d0676a0936763b107b66058b1333873288 |
| qa/evidence/t052-maker-cycle2/d046-lineage-absent-baseline-red.log | 2555 | 6172e4a4d16a9bfb7202dc08ddee06cfc3c867f6f428981918a57a6a7433a3d1 |
| qa/evidence/t052-maker-cycle2/d047-profile-original-green.log | 2017 | 83aa67c212a21ba4725060e8a033145de99bed77ce795714eb6610503088092e |
| qa/evidence/t052-maker-cycle2/d047-profile-original-red-corrected.log | 2711 | bcbdd91c54bcc5f9200bbf9e8d2921c734256444dc11ef6d630f7b4494585f14 |
| qa/evidence/t052-maker-cycle2/d047-profile-original-red.log | 3299 | 6700271b93dcf3e2b4ef452ae70f4e956af0ac5124b29143f735834d7e341b3f |
| qa/evidence/t052-maker-cycle2/d047-types-api.log | 470 | 58ab471c93e49b8918f2a4aefc2a7da6c07ac0e1f3e06034fb2a24928bd2e4d7 |
| qa/evidence/t052-maker-cycle2/d047-types-engine.log | 477 | 921e0967cca5fa00dbc9ef9d4e2ebfc369bc4c28a80daa31d6586f53e59914fd |
| qa/evidence/t052-maker-cycle2/d048-d050-candidate-frozen.json | 4672 | 93ac98fc0765a60f1d0f131de14cd0de9e8f11fa0778266d3ec02f8bbd2de6c3 |
| qa/evidence/t052-maker-cycle2/d048-d050-candidate-typefix1.json | 4672 | 66e4fa989a2e3c8086b263b1dc3b3d5250ad55387c3bed78181d9d4b4e9d1e6a |
| qa/evidence/t052-maker-cycle2/d048-d050-candidate-typefix2.json | 4672 | ecdb3cd89014d99c3d650b3653e336d099e9b3f04965c3e575fe59e0b3abab0d |
| qa/evidence/t052-maker-cycle2/d048-d050-candidate-typefix3.json | 4672 | 17c3584b56aaeba384d07790b189e7d5cea4666f3a9cfb8139336329ed7e2460 |
| qa/evidence/t052-maker-cycle2/d048-d050-machine-note.log | 228 | 49bba7dbc98d625e01a8c0500876f48ad2a7040443c911b8e4907e33f877ee71 |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-initial-typefail-end.json | 6634 | 157fd1a66991a9aebb466b342f8caac60b8b771394a622ff7371808366075002 |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-start.json | 5682 | 48c2e9d93d2b532c231ea00a5ced08b143a9de1cc7911695a0c7019bc121dc0f |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix1-end.json | 6636 | 4ba67fc132804ef12443b95cf8f7b5bbc9752f55aaca4046b9bc3ef4a2af032c |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix1-start.json | 5692 | 8f3f6cf30e4c48162e1665670cb44c2b37049fcbb0a71defec0d4b6e3ce84b06 |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix2-end.json | 6656 | 739b92afbbed280321a3553b0dd9cd7c0a7fad9a185bf2ac6673affa06be676d |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix2-start.json | 5618 | bdb074fda09cafca891cec129b426e181d64080588b1d653ab472b1b1b2240be |
| qa/evidence/t052-maker-cycle2/d048-d050-typefix1-machine.log | 83 | 28adcb94e872c992c73bd2209e542d07ac7f605df225fdc35b6aa2cccd31b87c |
| qa/evidence/t052-maker-cycle2/d048-d050-typefix2-machine.log | 80 | 37b4282f8c6c7ea744c864a455cec8828efee40a7267fab7ff5d806a7a2f4c67 |
| qa/evidence/t052-maker-cycle2/d048-d050-types-db-corrected1.log | 440 | dcffa5e56185ab182f19aeb119fb3f61920fce378624f956bf8fffc1ef63048c |
| qa/evidence/t052-maker-cycle2/d048-d050-types-db-corrected2.log | 269 | d699e9695e8f98db971afd49774f74cbc1d78083cd4ed275ac183f69b02900d0 |
| qa/evidence/t052-maker-cycle2/d048-d050-types-db.log | 1816 | 4222c442db01c1cdc1ce56fa0552703b358a3dc247b1885bcc1da3d4dffa7387 |
| qa/evidence/t052-maker-cycle2/d048-d050-types-engine.log | 936 | 026c4325a873eac7328a655c5b0a6ccaf47e589920414b679f4a7cb80109e01e |
| qa/evidence/t052-maker-cycle2/d048-legacy-hold-baseline-hashes.json | 710 | 360a25d6bcadba301adc08cb964860a0c080ec156afd45c9919f96ccd1746eec |
| qa/evidence/t052-maker-cycle2/d048-legacy-hold-baseline-ownership.json | 154 | 322ebf45398e9b002174613ae627f0ce06330712f11305bab5378a62c6454d38 |
| qa/evidence/t052-maker-cycle2/d048-legacy-hold-baseline-red.log | 1462 | 698cc5e5a3447cb5510c5d271f85476edce6e9f6c9e2311c343b71142f307ef7 |
| qa/evidence/t052-maker-cycle2/summary-fresh-admission-plan.md | 21416 | ca9355412e32975c210f3e5adcb58beb3e271d41cb5876ac4e0de66c3238766f |
| qa/evidence/t052-maker-cycle2/summary-graph-publication-plan.md | 20796 | 24d7173d2136376900ead694a3731e25dbfdc5a3c00ff3835716a0c0ccf6ab10 |
| qa/evidence/t052-maker-cycle2/summary-lineage-plan.md | 13810 | 06a3391a1296393848dfd6ce35b60d771727b16e64ad9ca797cea122a0b6263c |
| qa/evidence/t052-maker-cycle2/summary-public-history-plan.md | 15805 | 9a70f65734948e25a1f2d89b93ae0d5073c3fc55577b1a0b37568918302f492c |
| qa/evidence/t052-maker-cycle2/types-api-d045.log | 118 | 0386c2f90faaf46ff716f5fe967ffaf7b9be4be1539692b2563767089fa5d136 |
| qa/evidence/t052-maker-cycle2/types-db-d045.log | 121 | d9665b01330b65dff0913fce1a7358fad39bd70d6d7d2d1d98fdd254438d5b2a |
| qa/evidence/t052-maker-cycle2/types-engine-d045.log | 125 | 3a039b005f86269000de7fcead4a6d8a8fa2a5f9a0f0005f06f6d0dbce2f46d4 |
| qa/manifests/t-052-session-lifecycle.md | 42827 | 6811d76474c1419b05d6b4a000be6aff22684b5486f9bce0a89371e08cdd07b3 |

Unchanged candidate bodies excluded:

- apps/api/src/openapi.ts
- apps/api/src/server.ts
- packages/db/scripts/db-init.ts
- packages/db/src/decisions.ts
- packages/db/tests/consent.test.ts
- packages/db/tests/db-init.test.ts
- packages/db/tests/decisions.test.ts
- packages/engine/src/scribe/checkpointer.ts
- packages/engine/tests/scribe-checkpointer.test.ts

Audit operations were read-only file/hash/content inspection plus creation of this audit artifact. No tests, providers, DB connections, network calls, installations, runtime process inspection/killing, source/docs edits, commits, or pushes were performed.

## D051-D055 publication-impact DELTA preparation

Inspection time (UTC): 2026-10-13 21:42:39 UTC.

Status: SAFE for the exact observed disclosure content; NOT FINAL for changing paths and final publication selection. No concrete secret or actual student-data finding was found. This section is preparation evidence only, not feature acceptance, intermediate checker approval, release approval, or permission to publish.

Input frozen26 manifest: qa/evidence/t052-maker-cycle2/d053-d055-candidate-frozen1.json; SHA-256 30fa3fc88299f5ade3cd780703abe4c678b29e7f9e51febb7d122bf111f0177a. Its historical identity must not be confused with a final identity after importer/probe repairs.

Incremental content inspected: 65 paths / 1960653 bytes (11 source/test paths, 52 new/changed QA artifacts, 2 changed bookkeeping paths). Observed-byte snapshot SHA-256: 0481f499204422e001ef9a96fa7a19b8a862676ba5e8db4f612793c4d2cff7ea. This hash pins the bytes actually read, including earlier bytes of paths later marked NOT FINAL.

Stable-at-readback subset: 58 paths / 1621117 bytes; SHA-256 feb529409918c29ed17eecf6d9d9901ae76a7616949f37fd253c6fd096d99a97. The three active source/test paths and four subsequently changed QA prose paths are excluded from this stable subset. All digests use sorted relative-path + space + per-file SHA-256 lines joined by LF, without a terminal LF.

Disclosure checks: privately compared GEMINI_API_KEY and MONGODB_URL values against inspected bytes; zero exact matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox and personal-record-marker scans had no findings. No binary or archive was introduced in this delta. Synthetic grant/lifecycle IDs, mocked rejection reasons, test driver's errors and generated fixture UUIDs are not treated as operational credentials or actual student records. Raw logs remain intact.

Executable surfaces: no new standalone executable QA helper was added in the inspected artifact delta. New importer tests use MockProvider and the existing fake/harness DB; inspected importer paths contain no production connector, dotenv load, runtime process launch or source-file mutation. New plans are inert prose. Held-driver method overrides operate in memory and existing finally/release boundaries remain the relevant local cleanup boundary; this audit did not execute or accept those tests. Previous runtime end records are disclosure-inspected metadata, not proof for repaired current bytes.

NOT FINAL source/test paths (parent-reported active repairs or differing frozen identity):

- packages/engine/tests/scribe-persistence.test.ts - Parent reports active importer/probe repair; not final even if observed bytes currently match frozen1.
- packages/engine/tests/b18-suppression-outcome.test.ts - Parent reports active importer/probe repair; not final even if observed bytes currently match frozen1.
- packages/engine/tests/scribe-per-fact.test.ts - Bytes differ from frozen1 manifest.

QA prose that changed after its inspected bytes (new current bytes have NOT been accepted by this section):

- qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md - inspected 91232d0cd71c5d281eadd1236102952707b51f0473c7cd25670dde4d0f632922; subsequently observed e675ac7e369c24ddea3f7c627e9eb32ca65198c97518fc09c59affccf7090099.
- qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md - inspected eba0de04cb59f644aea0fecd151e9fe5078449fc852326ca7b759249cd0f89d4; subsequently observed 14f5908b281778f05cec724f8d3f997cb2fad7fd6e2dbfbc613ce1f2dc66fefc.
- qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md - inspected 5a389f1797d5b4d5947823e36eb390685d3767fb56bdf4f44e79918a29862f4d; subsequently observed b30513898474a40272fca0053cf4cfd987cf2e66a35f050f9a469867908fb103.
- qa/evidence/t052-maker-cycle2/release-transfer-proposed.md - inspected fac48b7c35cc73b0cf05501a4b0b48c3a658c1b53385f6440886f861735e47cd; subsequently observed 58f9ed0d2763560e4a4ef0da569d1b7e8103f162e528abecbb6b2dfe035dacff.

Final follow-up delta: inspect refreshed bytes of the three active source/test paths and the four changed QA prose paths; inspect any subsequently produced terminal logs/runtime JSON/commands/ownership records and the final publication subset; pin the refreshed candidate identity before applying this preparation to publication. New files or later changes are outside this section. No disclosure-motivated redaction/exclusion is required for bytes actually inspected, but NOT FINAL content is not covered by the stable result.

Inspected bytes and status:

| Path | Bytes | SHA-256 | Status |
|---|---:|---|---|
| apps/api/tests/server.test.ts | 74668 | fa157885e95456f2e58d5096230603e9321f983b94862fc9f32ab0dfd88ea777 | OBSERVED SNAPSHOT |
| docs/DECISIONS.md | 106785 | a57a644ca51e07d0dcf6e951ffa39d1d15b293ae6f0fb6e75f1392c3adb4d6ef | OBSERVED SNAPSHOT |
| packages/db/src/erasure.ts | 118564 | 7e31ad7dfb9527d2b5c485d56da6fdb9d7c16e5af947f7eb0a61bf1e56ad0129 | OBSERVED SNAPSHOT |
| packages/db/src/facts.ts | 134051 | 2dafc0c6c452394e167230f02f8053c943a81ab293c956ded41e26744ddb7afc | OBSERVED SNAPSHOT |
| packages/db/tests/erasure.test.ts | 155795 | 272ba1fbf0ff4436bc6408bb7381afb8161a1ae13fbe61928845f0265735da72 | OBSERVED SNAPSHOT |
| packages/db/tests/facts.test.ts | 168664 | bd75e22eee42dc2b1cb31eb64eeba474753a5bd0abdb04f44d2304fff2dd3dd7 | OBSERVED SNAPSHOT |
| packages/engine/src/scribe/graph.ts | 118331 | 2bc9ce281101b1eb5a122ea97eae7fa6794215bad86be6b4ca60fc1b3222e91b | OBSERVED SNAPSHOT |
| packages/engine/src/scribe/nodes.ts | 92535 | ed46b42a36463eff0de435ea952d8996efc8ce8668e1ab5644d53488a5942e2e | OBSERVED SNAPSHOT |
| packages/engine/tests/b18-suppression-outcome.test.ts | 78802 | a8d74fb86583d127e44290413f3e8e1ce35a06c3d45680bebbddf828cdcc0209 | NOT FINAL |
| packages/engine/tests/crisis-escalation.test.ts | 54266 | d43eecae2a7c34260957c9e2c3877c0463a4ba25ecfbdc05cb3b794d62d05e95 | OBSERVED SNAPSHOT |
| packages/engine/tests/scribe-per-fact.test.ts | 64529 | 864f30899a0631a08e90c55ed2a31ca9424882837c13989a15b0a5c94576328f | NOT FINAL |
| packages/engine/tests/scribe-persistence.test.ts | 139032 | 5063a8e9121347ed71751ffc4b24de3cf3178bdc3ec50fc2bc5dcf168da9e558 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/affected-api-fixture1.log | 5428 | d778159bd3410f944054820ab863a603d5cba0af568369da861c35c8db03283d | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-initial-core.log | 132306 | 56387e85cd68b83a211e10b1c6810e783857119f280c218dfcb3e2c0dabf2548 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-initial-web.log | 2577 | 3ede84e2d7d3e9328c34df7c2bd6215201da00688c4284309d3a1f189d715615 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/browser-acceptance-proposed.md | 21157 | c18b26ceb60ef8c0a712efec5f7d857fb25409d24ca0ad99f0511759f4824eaa | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-affected-initial-failures.log | 11988 | a7cd24e7047eddd4417fdf59b71f42c963083688f1fe240a44b9b00de2df2a3d | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-candidate-api-fixture1.json | 4672 | 4dbeeb2659841cc8b7e60aadd6f5f74f42baaf4d353a7c69456948ee796014f4 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-api-fixture1-end.json | 6553 | 416c22cf79242c8c008bdf9ca1f1558733ffec35a0961fa2797fce4205edc728 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-api-fixture1-start.json | 5504 | 0aaa5a6b795b2be37107754f0a0f72fcd7d3571d36a9a2b78a01fb21f383aa85 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix3-end.json | 6906 | 974945856a22cdc0ce015599bf8895e93b960cc3e26b477b8b76b7a7b1600f11 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-runtime-typefix3-start.json | 5549 | 6af4d0d0ff94c4f1097cc2ed8b1444de9fabdb0412a32754fade750ae7f81086 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-types-api.log | 264 | ee996fa50f1d400c233f1449285a3695a3a3a4ba7f5ca3154cbb0ed1e01861f1 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-types-engine-corrected1.log | 278 | 46566d28a538468624895cbb5e35db869bea14b35344a935c0ae43caa192a240 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d048-d050-types-web.log | 264 | 6a83f98c699a6ff8972ea289e242df66d17227a819febeef238d08bb5f4ae658 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d051-candidate-closure1.json | 4672 | e5e254d3f66f65a2ec573a04002e8d852048da9f90f2c44b1a79e66203af6c65 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d051-failed-touched1.log | 1977 | 6c6d20f1f274dc95d4a95dd5397f7143492ac7dc54ace0ec315c20697973e317 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d051-runtime-closure1-end.json | 6693 | a6d5a542c2d162be372d85143c05215976433fbec528c23664a9bfb458bfac40 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d051-runtime-closure1-start.json | 5501 | cf1f7eb9a0908d508d604fdd42332f489beb9567e0860bb434d6be235b31d1c0 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d051-types-engine.log | 277 | a99d28cdd37c881601ffa14ee90059e20550d866054f044feb0c65633c01d597 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-candidate-closure1.json | 4672 | c6c13712125aee5cae691a236f6ed644c1f6353c3fb281cf0a66235d6d48eb83 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-candidate-typefix1.json | 4672 | 5ccef42a1af9bfce5e0e8ac1180fabd999fbeddc9e4ba050ca5238749e79d38d | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-failed-touched1.log | 25802 | 7c6dbff1e0c6d311cbcfad8a8c0b5ff3ef52f12fdccd2b28abd428abe9ff0c70 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-runtime-closure1-end.json | 6551 | bbc0f03d3cebfa95fd8c85606a2277bf018884a63596e74bc4584db8745b6d75 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-runtime-closure1-start.json | 5590 | 641cfc3105ca1a9040f65a854ce3256eb5ab99e8c407a810bdb49d4718cc1573 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-runtime-typefix1-end.json | 6696 | 3d35fa6395be43c2e93b009744e401a417514276079a492868aa3a580d89fa76 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-runtime-typefix1-start.json | 5474 | ffb507077fb611b76168cd20efffe5d7232b0fff93bf90d91914d8671eb9628d | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-types-db-corrected1.log | 269 | 96a3e9a0e1394a82921b82bf6fafd5029c96a5d0b1ec913df77552e48f9dccda | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-types-db.log | 4899 | c92af7ebe585d6b4a10e06929fdeca3394f71b50020961aa05a1918300cc97d7 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d052-types-engine.log | 277 | 7ea4430972f1d3006abb02e5fb6694e5d42225e6b3270a2ebf7ea56638db9fbe | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-candidate-frozen1.json | 5327 | 30fa3fc88299f5ade3cd780703abe4c678b29e7f9e51febb7d122bf111f0177a | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-failed-touched1-failures.log | 2370 | f686c522801088140edfda8d56d7dc8190f08bc0c1482b014d23c33e6bf5bd42 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-failed-touched1.log | 88315 | 5626de7aff208d15b87706f43f8570436e36970e850320594e7ba178c3959205 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-runtime-frozen1-end.json | 7309 | 71c27ed011ee9bf84cccdaf359715882a178081c251445c15ebc5e71159719be | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-runtime-frozen1-start.json | 6057 | 353b496e95fbd4aefbf021db060f18c60a1d94766426ded9b8879c9d3b9abcb7 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-types-api.log | 262 | 44e0474032671dd7a83c00e0b97d8875aee6a2475adc22d7c3e3585c4095f887 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-types-db.log | 269 | 4610fc00508ba9557468fa61abb106f4fe3642eced6bc6a2e63d991f9ddc5485 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-types-engine.log | 277 | 5e9742ce78cae124f7618ac9d64c43b4a8862c5e3fa4d71e2e55f4d8cf85fa56 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-types-web.log | 263 | 9cfff1048138e53bd337b890122056594af7d68602e14ec485aeefc7b6d35164 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d054-control-reachability-proposed.md | 11366 | bb25f0a3f1e351fb63a10cebb632ac5ec0f575a05cb1f8bc6e704bb26d45403e | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md | 11024 | 91232d0cd71c5d281eadd1236102952707b51f0473c7cd25670dde4d0f632922 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/immediate-summary-compensation-proposed.md | 15689 | 57ba5ace9a2ed73ebd927575063f1b6ffac61fbfdf4aa9cdcda884f9e2e36583 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/importer-release-hook-proposed.md | 6352 | 4a96445d339a7bbd7b45684612b3582435527b0fc24bf7defab973b42823759c | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-db-closure-proposed.md | 18641 | 2cc5fa288a31322329bacf168bd0a5cadfb4f5123d3e0da39faf71b4c11e3bce | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-db-concurrency-tests-proposed.md | 21804 | 8e1b8145aa803ab02f91aabf61c4ded47497381ece8c1cfe006095ac1ed91404 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-facts-oracle-proposed.md | 6067 | c4662e54013e23a4396c7487277b7413429807b3c2e48517a140dd518722dfc8 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md | 8982 | 12a94e9ca0594551f4e98134f8f40fcc38715b76b364c068f1eceb45210dc682 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-importer-oracles-proposed.md | 22663 | 52be66e4cea9e6f7cd0d130901b57ca1da613e384a18c901827f880b93124bdd | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-importer-plan-approval.md | 19412 | 4eb52afc79e466b9c011576aa545801cb5ae3a9dca5ec7c3a612a032a710b894 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-persistence-oracles-proposed.md | 10506 | 7ef9b7fa44d14177bb2c36736b1226fad4fedc74fdfc3a686833546bfce716be | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md | 9509 | eba0de04cb59f644aea0fecd151e9fe5078449fc852326ca7b759249cd0f89d4 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md | 23254 | 5a389f1797d5b4d5947823e36eb390685d3767fb56bdf4f44e79918a29862f4d | NOT FINAL |
| qa/evidence/t052-maker-cycle2/release-transfer-proposed.md | 13386 | fac48b7c35cc73b0cf05501a4b0b48c3a658c1b53385f6440886f861735e47cd | NOT FINAL |
| qa/evidence/t052-maker-cycle2/resource-measurement-20261014.json | 943 | 4fe31f0e9a20ac3f85badca7bb81e73508d63c25e2f1d39207cab30874f737d5 | OBSERVED SNAPSHOT |
| qa/manifests/t-052-session-lifecycle.md | 57116 | 9e95ae1ae56987c7f2f09ed2d19832ed3780dfd8f1f5f87caa15772b68ea7c8a | OBSERVED SNAPSHOT |

Unchanged source/test bodies excluded from this incremental scan:

- apps/api/src/openapi.ts
- apps/api/src/server.ts
- apps/web/demo/seed.ts
- apps/web/tests/session-api.test.ts
- packages/db/scripts/db-init.ts
- packages/db/src/collections.ts
- packages/db/src/decisions.ts
- packages/db/tests/consent.test.ts
- packages/db/tests/db-init.test.ts
- packages/db/tests/decisions.test.ts
- packages/db/tests/fakes.ts
- packages/engine/src/scribe/checkpointer.ts
- packages/engine/tests/scribe-checkpointer.test.ts
- packages/engine/tests/scribe-erasure-fence.test.ts
- packages/engine/tests/scribe-fixtures.ts

No 593-commit or whole-history scan, provider/DB/network/runtime process activity, Git mutation, source edits, new files, or raw-log rewriting was performed. The only write is this append to the previously owned audit artifact.

## D056-D057 terminal publication disclosure DELTA

Inspection time (UTC): 2026-10-13 22:16:20 UTC.

Status: SAFE for the exact inspected source/QA disclosure bytes; final bookkeeping and publication selection remain NOT FINAL. No concrete secret or actual student-data publication finding was identified. This section is not feature acceptance, a checker PASS, whole-goal completion, release approval, or authority to commit/push.

Frozen input: qa/evidence/t052-maker-cycle2/d057-candidate-scopefix1.json; SHA-256 f1bbf801a864c3f6a22d12559e9a7c132c392d3c4f5fdc8186b6bde0642607cc. All 26 current source/test hashes matched this input when inspected. Only five changed or previously NOT FINAL source/test bodies were content-inspected; the other 21 candidate bodies were excluded from content rescanning.

Exact inspected delta: 42 paths / 1440246 bytes: 5 source/test, 35 new/changed QA artifacts, 2 changed bookkeeping. Observed-byte snapshot SHA-256: 22b5490c8ebb3df7969e1773c8df0c9af969d620370e1365cb1f0aef99e8749c.

Stable source/QA disclosure subset: 40 paths / 1256917 bytes; SHA-256 9eac728275be30b03bbb5292120041f1ee1115792e2cd7cd2f068935297d5b21. docs/DECISIONS.md and qa/manifests/t-052-session-lifecycle.md are excluded from that stable subset because root readiness/bookkeeping may still append. Digests use sorted relative-path + space + per-file SHA-256 lines joined by LF, without a terminal LF.

The prior seven NOT FINAL paths have now been re-inspected at their current pinned bytes: the three frozen test repairs and four QA prose paths have no disclosure findings. Graph is pinned to 4ec6bfe68a979f2548c1d7ddcf17ac3e3567b5138a153bc33aa8f57201c5188e and facts to 13a8a7a325955d64b6bec531cb4f3962722c2ec9e1ab3fdcf794e9b5b897f7d8. Their technical acceptance is outside this audit.

Privately exact-compared configured GEMINI_API_KEY and MONGODB_URL values against every inspected byte: zero matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox and personal-record-marker scans had no findings. Test failure reasons, lifecycle/ownership UUIDs and mock grant authority remain synthetic fixture evidence rather than operational credentials or actual student records. Earlier failed logs were retained unchanged; no redaction or replacement was performed.

No new standalone executable QA helper was found. This delta's added QA content is source identity, runtime metadata, type/test logs and plan/approval prose. Current importer/probe repairs retain the fake DB/MockProvider attribution established in the previous scoped inspection. This audit performed no tests, providers, DB/network/runtime processes, source/test changes or Git action.

The D057 run became terminal while this inspection was in progress. Its end record reports typesTerminal=e5cb96, typesExit=0, testTerminal=e2a8b8, testExit=0 and mutexPresent=false at 2026-10-13T22:14:02.6699012Z. The complete d057-failed-touched1.log and runtime-scopefix1-end.json were subsequently included in disclosure scanning. These are read-back record facts, not an independently executed acceptance verdict.

Small final follow-up: inspect the final selected bytes of docs/DECISIONS.md and qa/manifests/t-052-session-lifecycle.md; include any later final readiness, commands/ownership, byte/hash manifests or other newly selected publication artifacts; confirm the final publication subset against these pinned paths. Later additions or changed bytes are outside this section. No disclosure-motivated exclusion/redaction is required for bytes actually inspected.

Inspected current bytes:

| Path | Bytes | SHA-256 | Status |
|---|---:|---|---|
| docs/DECISIONS.md | 112438 | 0de38775772a49e4aa8a10d324a33f40ffd3911b8219afa74758f88a9a50a660 | NOT FINAL |
| packages/db/src/facts.ts | 134069 | 13a8a7a325955d64b6bec531cb4f3962722c2ec9e1ab3fdcf794e9b5b897f7d8 | OBSERVED SNAPSHOT |
| packages/engine/src/scribe/graph.ts | 118374 | 4ec6bfe68a979f2548c1d7ddcf17ac3e3567b5138a153bc33aa8f57201c5188e | OBSERVED SNAPSHOT |
| packages/engine/tests/b18-suppression-outcome.test.ts | 78802 | a8d74fb86583d127e44290413f3e8e1ce35a06c3d45680bebbddf828cdcc0209 | OBSERVED SNAPSHOT |
| packages/engine/tests/scribe-per-fact.test.ts | 64529 | 864f30899a0631a08e90c55ed2a31ca9424882837c13989a15b0a5c94576328f | OBSERVED SNAPSHOT |
| packages/engine/tests/scribe-persistence.test.ts | 149419 | fa65878086a2d93c0a6fa03fcd6fd851b86b376c15a41984e670f00d79e79628 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-final-core-d056.log | 97352 | 77e5c4553940a81b706cb30f18985bfa7dd5daac2725aef264bf38016003cdf9 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-final-d056-runtime-end.json | 7757 | 1fb8ed6dde066455f527b570fa14a2cfdbe08717aae0c2ac2983f456c5a3cbdb | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-final-d056-runtime-start.json | 6185 | 5ea099d5ad69a8db079101651535e8646eb3771a4605113cb57d99af62af0c38 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/affected-final-web-d056.log | 2539 | 630b68668800bcc57f0c64a5a8dcdc49fd625942565fcf02c0d385172fd15daa | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d053-d055-candidate-harnessfix1.json | 5327 | 320106965eb22e4d4f87077abadaf638ece705d679659bc25ae84f98cb97a990 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d054-importer-failed-touched2.log | 33210 | 2bd976faa273ba3410da9693629a43f4fa963a0b742b23eca0196ae347ae8030 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d054-importer-runtime2-end.json | 7078 | 719c951aea15642462c8721e9755b8489368874ab7b1f6168243013cbed7a576 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d054-importer-runtime2-start.json | 6066 | db3f2a4e6de627fd624980f6c78b90483c13e77de91898ce6bae7522a0dfc992 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md | 20806 | 6bf482736b19863333019260b8acc18913d307ea84cf68ad2878d8a34ccc64fd | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-failed-touched2-failures.log | 3046 | b73ab7abd94af11ab159a4f5a38ed060f438854ed698e1e3a4ef0cbe9bb5750d | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-failed-touched2.log | 245682 | 27aa2947b5f90564a7e2c05347c9f65da70ea11d12570577a1f51b56ed4572e7 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-failed-touched3.log | 1358 | 250a80201744778576cac4a0ac08be0d5546b41a3c1f802c6303f26280d76ee4 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-runtime2-end.json | 7656 | 28a93c9ac20889149123682a90bb41337ae692c6472f35fef7ae3fe631cd626a | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-runtime2-start.json | 6163 | 712a12a978285ac7d88d423973fd38c88d0a5b0f982a7bd33c326b47a6bcf47f | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-runtime3-end.json | 7260 | 250ae3dc5444426cec95082a3a862cef37fca1bcea7739867ff204a3293454d1 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d055-persistence-runtime3-start.json | 6288 | 4f6632d2cbc189f231242357ef4b59a6d446e5a6f12431d27e1e289e07ad927c | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-candidate-claimfix1.json | 5327 | 65fd4bb834e6b3aacd713f4838dbe7c075751e1633e945df5ce5c97f5a49fbcb | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-candidate-persistencefix1.json | 5327 | f595da0283c32d3acf0eb3463199397009fa784662bea87a9fd3dc4c649e3b4c | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-per-fact-failed-touched1.log | 5701 | 3c4e5c33edce85f89e94ee499d80bf7234f0ca5488352d745ef9e206ce027d66 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-runtime-claimfix1-end.json | 7160 | e8a8cf1c16da53f0e2adefa3d7c88e69c1970b3beaf13a295ba3696c352f19ac | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-runtime-claimfix1-start.json | 5972 | b4cbb1d721c9ef4896df5b7c38bc6b4055753ebf679143d25af6675e4ab462e4 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d056-types-engine.log | 277 | 20b8d0bfde2c23e69b55d3cb093782999e013cd31072ba7ff529264a6e3d638f | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-candidate-scopefix1.json | 5327 | f1bbf801a864c3f6a22d12559e9a7c132c392d3c4f5fdc8186b6bde0642607cc | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-failed-touched1.log | 25253 | a400534df27809f278febfacf971412dd207729d8cd6eee75759ee7a608c2302 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-runtime-scopefix1-end.json | 7767 | 82d29c8aa8cb58c3e719887a36f46654535dae5198bc6dc9c8429dfeccefe207 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-runtime-scopefix1-start.json | 6305 | b52efbf4c51abfe187a1f403834afcf4ead9fd226e2b6c67df96d24ce055a556 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-types-api.log | 263 | a229ea18d4f587aeae373f376799e9925193275a74cae8decaa0b236484c79e1 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/d057-types-db.log | 269 | a1b7436d67f197086307fad33107398aec9a76b948a09114f559d9422820069b | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/immediate-summary-compensation-proposed.md | 21708 | 76e414a445374b2510e993b41536aa5f14c85b0a1fe5886a3ecc139ce7bfe4be | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-db-closure-proposed.md | 24831 | bce845d6b92439cbb6baefb0872779fbad1c77ee73c91b296593e3549a54bde5 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md | 16059 | 6eb82b347536fa489e0cad7e973d68e51b948fd1d3a18105ad50753185cdc255 | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-importer-plan-approval.md | 25200 | 697c3406c7eb517403f14d49f6ea40e111d0809b114dad0c7907b76ba88ad44e | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md | 21797 | d7ed525cad7abb93f2b5dc3124af6005ced71c93af77030380b89ac5f67abeda | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md | 36544 | a0e8c713ea86fd7734e31f58e47124da8ac38657c960d0b3ccf5bf6bd2b0c4ec | OBSERVED SNAPSHOT |
| qa/evidence/t052-maker-cycle2/release-transfer-proposed.md | 26864 | 9361c1c4c2d79e7e9a3b68c36d3248443d8d928ff7732cc1d14c7d614335b6eb | OBSERVED SNAPSHOT |
| qa/manifests/t-052-session-lifecycle.md | 70891 | db61139077dfedb1e8385be496e4da8cd0a273505b696de8cc2b5f57f34a11f5 | NOT FINAL |

Unchanged candidate bodies excluded from content inspection:

- apps/api/src/openapi.ts
- apps/api/src/server.ts
- apps/api/tests/server.test.ts
- apps/web/demo/seed.ts
- apps/web/tests/session-api.test.ts
- packages/db/scripts/db-init.ts
- packages/db/src/collections.ts
- packages/db/src/decisions.ts
- packages/db/src/erasure.ts
- packages/db/tests/consent.test.ts
- packages/db/tests/db-init.test.ts
- packages/db/tests/decisions.test.ts
- packages/db/tests/erasure.test.ts
- packages/db/tests/facts.test.ts
- packages/db/tests/fakes.ts
- packages/engine/src/scribe/checkpointer.ts
- packages/engine/src/scribe/nodes.ts
- packages/engine/tests/scribe-checkpointer.test.ts
- packages/engine/tests/scribe-erasure-fence.test.ts
- packages/engine/tests/scribe-fixtures.ts
- packages/engine/tests/crisis-escalation.test.ts

All earlier audit sections are preserved byte-for-byte. The only write for this task is this appended section in the existing artifact.

### D057 final artifact-readback amendment

At final artifact readback, qa/evidence/t052-maker-cycle2/release-transfer-proposed.md had changed from inspected SHA-256 9361c1c4c2d79e7e9a3b68c36d3248443d8d928ff7732cc1d14c7d614335b6eb to newly observed SHA-256 1ce403d9eb62700e88799ab63ace1624067a9118579de0cb829179e2687076e7. The newer content is NOT FINAL / not disclosure-inspected by this section.

The stable disclosure subset is therefore narrowed to 39 paths / 1230053 bytes; SHA-256 94c1ca0fcec470590d9bd1602ef106ae4d8f06ff7f05aed08d2fbd210e5d0885. The earlier 40-path number remains a record of the earlier inspection only. Remaining bounded follow-up is the final bytes of docs/DECISIONS.md, qa/manifests/t-052-session-lifecycle.md and release-transfer-proposed.md, plus any subsequently selected final readiness/commands/ownership/identity artifacts. All inspected source and test hashes remained unchanged at this readback.

## D058-D059 sealed disclosure DELTA and follow-up

Inspection time (UTC): 2026-10-13 23:19:12 UTC.

Status: SAFE for the exact selected sealed disclosure bytes; mutable plans/bookkeeping and unsealed leaf/inspection tests remain outside final-safe scope. No durable credential or actual student-data disclosure finding was identified. This is private-publication impact evidence only, not feature acceptance, a PASS verdict, a whole-candidate freeze, transfer approval, or authority to push.

Selected incremental source bodies: facts 69b825424a1d344f5a5ebe32ae32294885ac0421b1519ef5cd6f8ed56f4a7d3d; graph 988812684d1211a4ec3a13bda9a29ab46ef016981cf9660f99a5219fe60a7bbc; OpenAPI 81ca377bcbed1f0f6e6d5b52bac0d710cba00039c44b2fecb87eb45aae1ad651; collections 984c3cfc4ef3f3adcff1541872a0986ebe7556a165a0c77ce5498c43d6ecf480; erasure 33b6b5946443b1eb3439ce520b7316f3161cbfa75762797759945d3350823cad; erasure test 4d204921455bcb4b2464c2a6652bf6d22175fa7fbc88659f77b0c9698368f683. Every selected source prefix matches the identity supplied for this lane.

Inspected scope: 34 paths / 1266424 bytes (6 selected source/test bodies, 19 D058/D059 terminal QA artifacts, 7 changed plan/approval prose paths, 2 bookkeeping paths). Observed-byte digest: 6e4ab6aec4b1b0c5b9ff03ddd20dd7e54aa1e06f27c0a6e7146d0903cd52fa7b.

Sealed selected disclosure subset: 25 paths / 688906 bytes; SHA-256 64be47528549988d0d444caf722e0d0bef8a8e913f1656149b477d373cde2b0b. These are only the six selected source/test paths and nineteen selected terminal artifacts. The nine prose/bookkeeping paths are NOT FINAL even though their inspected bytes showed no disclosure findings. All inspected hashes matched again before appending this section. Digests use sorted relative-path + space + per-file SHA-256 lines joined by LF, without a terminal LF.

Privately exact-compared configured GEMINI_API_KEY and MONGODB_URL values against all inspected bytes: zero matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox and personal-record-marker scans had no candidates. No redaction is required for bytes actually inspected, so no raw test marker or log was removed, masked or overwritten. If later selected bytes expose durable secret material, report the location/value hash with the material represented only as [REDACTED_SECRET], and hold those bytes from publication.

Synthetic attribution and executable boundary: parent designated the selected terminal runs as synthetic. Failed facts/persistence baseline logs are assertion diagnostics with test markers and no serialized personal-record marker or URL. The selected D059 erasure test imports createFakeDb, has no production connector, dotenv load, process launch or source-file mutation, and uses in-process fake collections. Existing seeded lifecycle/receipt/ownership UUIDs and rejection markers remain fixture evidence, not operational credentials. No new standalone executable QA helper appears in this selected artifact set. Unsealed leaf or inspection test bodies were deliberately not read for final-safe assessment.

Read-back terminal facts, without an acceptance claim:

- D058 focused end record: terminalChunk ecfb86, exit 0, mutexPresent false.
- D058 facts baseline end record: terminalChunk 67da7e, exit 1, mutexPresent false; the original failed log is retained.
- D058 persistence baseline end record: terminalChunk 27515d, exit 1, mutexPresent false; the original failed log is retained.
- D058 clear concern/type aggregate end metadata is present with mutexPresent false; its original selected logs are included.
- D059 projection end record: testTerminal 270887/testExit 0 and dbTypesTerminal 91f33e/dbTypesExit 0, mutexPresent false. This does not expand disclosure scope to unloaded tests or the whole candidate.

Unsealed / unloaded test boundaries:

- packages/db/tests/facts.test.ts - runtime metadata identifies this as active/unloaded; source body excluded from this inspection.
- packages/db/tests/decisions.test.ts - runtime metadata identifies this as active/unloaded; source body excluded from this inspection.
- packages/engine/tests/b18-suppression-outcome.test.ts - runtime metadata identifies this as active/unloaded; source body excluded from this inspection.
- apps/api/tests/server.test.ts - runtime metadata identifies this as active/unloaded; source body excluded from this inspection.
- Any other leaf/inspection tests outside the six explicitly selected source/test paths are likewise excluded; no earlier private release checkout was transferred or treated as a final candidate.

Future final follow-up: inspect final selected bytes of the nine NOT FINAL plan/bookkeeping paths listed below, any newly produced terminal readiness/commands/ownership/candidate manifests, and any unsealed source/test bytes that are later selected for publication. Confirm the actual selected publication subset against these exact inspected hashes. Later source edits, prose appends, artifacts or identities are not covered by this sealed subset.

Inspected current path hashes:

| Path | Bytes | SHA-256 | Status |
|---|---:|---|---|
| apps/api/src/openapi.ts | 14562 | 81ca377bcbed1f0f6e6d5b52bac0d710cba00039c44b2fecb87eb45aae1ad651 | SEALED DISCLOSURE BYTES |
| docs/DECISIONS.md | 124213 | 68124920d189b21ad921e97e0379d0021db37b2ffbae88aad136e1543aed0b84 | NOT FINAL |
| packages/db/src/collections.ts | 14195 | 984c3cfc4ef3f3adcff1541872a0986ebe7556a165a0c77ce5498c43d6ecf480 | SEALED DISCLOSURE BYTES |
| packages/db/src/erasure.ts | 118588 | 33b6b5946443b1eb3439ce520b7316f3161cbfa75762797759945d3350823cad | SEALED DISCLOSURE BYTES |
| packages/db/src/facts.ts | 134329 | 69b825424a1d344f5a5ebe32ae32294885ac0421b1519ef5cd6f8ed56f4a7d3d | SEALED DISCLOSURE BYTES |
| packages/db/tests/erasure.test.ts | 162080 | 4d204921455bcb4b2464c2a6652bf6d22175fa7fbc88659f77b0c9698368f683 | SEALED DISCLOSURE BYTES |
| packages/engine/src/scribe/graph.ts | 118756 | 988812684d1211a4ec3a13bda9a29ab46ef016981cf9660f99a5219fe60a7bbc | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d054-control-reachability-proposed.md | 38732 | c6b9aa0f85876a2c7fb2b237458d6e1153ef372e019a75cb8fe28ffbd6179ba7 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md | 45109 | b36d79920f4500fce6b6e434df55fe7cb5c1022ba570823115c66e005293ee59 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d058-clear-candidate.json | 5327 | da093b7cea681b33397dd7392177e834e0e45af40423346aa0f6027f23cf712e | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-focused-green.log | 1638 | 62085a38c8aea4d4522ffa1ab868d9b70af104ed923ef67b4fb5ba14c1fea593 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-focused-runtime-end.json | 13756 | 4269923b9314b35b6a45a589001ffcad95c7c8ebcbbd3449538084d67da2cc68 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-runtime-end.json | 16055 | 797e7d4e1f00b8794c9dab864db244c05be51fd69da259fc20d4c0e473b9005f | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-runtime-start.json | 11895 | 3183eea86d8802a88a4ebd9d80c3f9eea6172d15e49694285920c11e0a12692f | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-scribe-concern.log | 1938 | 586dac85899e254ad0cd2d620ea61ee572113dd1e16d6c25b5b5e7c0f863dca3 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-types-api.log | 263 | 78b7cef8b6c96ffb019ee392d50897fd5a41df69d212e4c91d35fc7655b7bff3 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-types-db.log | 269 | a61772176c418fb39a9ec4ce5e9b7847cb663fd909b4fbdd45305819e2074f3a | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-clear-types-engine.log | 277 | 76f7f8f337025c08372d23cce647a66429b3f4f78597c8eb6ca33f4e87b381de | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-facts-baseline-red.log | 2983 | 48b6149d0482b1f79aad43fc5b116ae6ac42e394dd9484a7a4cf24c7adef55f0 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-facts-runtime-baseline-end.json | 12346 | 623a6023537f30b95d49b4c0bc8c05d5e258ade6370ee812d5dee9a53c242651 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-facts-runtime-baseline-start.json | 10250 | 976470519fa9157718078b20d89c501850dbbf09422fbb4af2d5346a6bc0f525 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-persistence-baseline-red.log | 2529 | e7269f202d294d308de5a2227b3a703dce4aa83bc40d173ad1353d8623013547 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-persistence-runtime-baseline-end.json | 12372 | cad534cc093ffed71b97b35295af713853d2e5044255c0b36e4ddb2679b74ea1 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d058-persistence-runtime-baseline-start.json | 10425 | 03c26b20bd211ae5ea870c65e99d42147f1cd1c46eb7089dd66c471306ea4596 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-projection-focused.log | 911 | e1275a940c4789500f3df7dc48f1b19ed03b0536f11c65b9069f21bc43db51f6 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-projection-runtime-end.json | 12498 | 4b10c35fdafa38d302081c7fe6c2e1e4a8035255964b6e3e86c4b7738552f579 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-projection-runtime-start.json | 10395 | 793969546a428b98f414c2676736dac649ac08ca76b320fdcfb35192712e0321 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-projection-types-db.log | 269 | 25f58a3253df0aed1263182714c0074e8fb3d9c8cfde48911e0c70600c1982f4 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/initial-db-closure-proposed.md | 65557 | a033af9890ce0ebf0d68c9c55f4e8bca09a67ab61ba25f1d08b393ccdc120eac | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-facts-oracle-proposed.md | 55428 | 55c13ff6934f963339955edabe25cdc36a15efebbf7ef5141137d15029db1fc6 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md | 58910 | 3d2b00c068588600cc04c89ba2abe3cedc5aea84b0bf9526e9c112b479033cb0 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md | 61049 | 9507dd01d5a6d84210df6be93de69826be252ada618ea673ca80b7c5537e2dcc | NOT FINAL |
| qa/evidence/t052-maker-cycle2/release-transfer-proposed.md | 37043 | d6d247261e5f2bb33ee137234b8c51e2836e894482c9e1184f1c7574660d0623 | NOT FINAL |
| qa/manifests/t-052-session-lifecycle.md | 91477 | fe57af6dc7a8b407aa24a30dcb91005dcfe30ac02365043feb8e2e86218b9102 | NOT FINAL |

No old 593-commit/52-path content rescan, source changes, runtime/test/provider/DB/network action, Git mutation, acceptance verdict, push or checkout transfer was performed. Only this existing audit artifact was appended; every prior section is preserved.

## D060-D063 sealed source and completed-runtime disclosure DELTA

Inspection time (UTC): 2026-10-14 00:07:31 UTC.

Status: SAFE for the exact sealed disclosure subset; mutable prose/bookkeeping and future selected publication bytes remain NOT FINAL. No real credential or student-data disclosure finding was identified. This is disclosure preparation only, not feature/source acceptance, a PASS verdict, full-release approval or authority to push.

Input: qa/evidence/t052-maker-cycle2/d063-narrowing-candidate.json; SHA-256 da856c9371305030949694019fda4e04d2c94f38adc429dcdb564e47ecc25610. All 26 current candidate path hashes matched this identity at inspection. Eight changed source/test bodies were inspected; eighteen unchanged bodies were excluded from content rescanning.

Exact selected content: 29 paths / 1560999 bytes; observed-byte digest 422f6b3803eb003b980e1b24c6b623e543ab439d36e5b479ceed466b5302a885. Sealed disclosure subset: 23 paths / 1093570 bytes; SHA-256 d9fcfe8aea75f069499535bb6dfdad1fc46750608799309d592f67f611aa0817. That subset comprises eight changed source/test bodies and fifteen completed QA/identity artifacts. Six inspected prose/bookkeeping paths remain NOT FINAL; four unchanged prior NOT FINAL prose paths are carried forward without content rescanning. Digests use sorted relative-path + space + per-file SHA-256 lines joined by LF, without a terminal LF.

Privately compared configured GEMINI_API_KEY and MONGODB_URL values against the inspected bytes: zero exact matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox, personal-record-marker and generic credential-assignment searches had no candidates. Raw failed logs and synthetic test markers are retained unchanged. No durable secret material needed redaction. No new executable QA helper appeared in the selected delta.

Changed tests use existing fake/harness DB and MockProvider paths; inspected changed test bodies had no production connector, dotenv loading, source-file write or runtime process launch. Lifecycle receipts, grant IDs, fake-driver failures and checkpoint data remain synthetic fixture evidence; no real student input or configured credential was found. No runtime tests, provider calls or DB connections were performed by this audit.

Terminal read-back chronology: the D059/D060 graph baseline end record reports terminalChunk 3d309a, exit 1, mutexPresent false; the original failed log is preserved. The earlier D063 repaired end record reports terminalChunk 726193, exit 2, dbTypesExit 0, engineTypesExit 2, mutexPresent false; its compiler failure is preserved. The narrowing run was active at the first inventory, so its five active files were initially excluded. It became terminal during this audit, and those files plus its final end record were then disclosure-inspected. The narrowing record reports types terminalChunk 9c8bd1/exit 0 and tests terminalChunk 5e07e8/exit 1, mutexPresent false at 2026-10-14T00:04:25.4671676Z. These are record facts, not an independently executed acceptance verdict. The narrowed failed test exit remains a failure.

Mutable paths that changed after their inspected bytes (their newer content is outside the sealed result):

- qa/evidence/t052-maker-cycle2/d054-control-reachability-proposed.md - inspected f95a9ac2a5f1b1030a8d87cf4aa4cf3d55f3d9ad8b2b4726fe47e32f35ec8c60; later observed 70444125d899fc394fda83fdac17136f7fe77a34cb9afc566f95c9470d555cf9.
- qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md - inspected 4d9d83f92f742cbb471525bd5c03c5264346be327ff1a02cfa1b3dcb2ca8045d; later observed b27fa9de8af7eaff8b79ea01094ca7b237e8eb875012ab552a71ac1134ab71bf.
- qa/manifests/t-052-session-lifecycle.md - inspected b035e945fb32350b27b15699d1bd4e724d9fc183182b41b11256e84c6177568a; later observed f7a1299a7fbf5c84db58022982a64125bbb2449ebf5ad241adeff129cc0e2d62.

Unchanged prior NOT FINAL prose carried forward without content rescan:

- qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md
- qa/evidence/t052-maker-cycle2/initial-db-closure-proposed.md
- qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md
- qa/evidence/t052-maker-cycle2/release-transfer-proposed.md

Final follow-up: inspect final selected bytes of the six current NOT FINAL table paths and four carried NOT FINAL prose paths; include later terminal/readiness/commands/ownership/candidate artifacts and any source/test bytes selected after this frozen identity. Pin the actual final private-publication subset. Subsequent additions or changes are not covered by this section. No disclosure-based exclusion or redaction is required for bytes actually inspected.

Inspected path hashes:

| Path | Bytes | SHA-256 | Status |
|---|---:|---|---|
| apps/api/tests/server.test.ts | 86047 | bf67a760a59c41f844cc422594fb246b6fd241ae3fa3ea4715b1c39f314f933c | SEALED DISCLOSURE BYTES |
| docs/DECISIONS.md | 132360 | f3b91ab93d553818d5c86c522790476fa45e4f31be72e466b50469ce9df6ab70 | NOT FINAL |
| packages/db/src/decisions.ts | 15897 | 22ba5180def3aefea89faf69ae5481e2914324d9c337cbc67418d92114571c86 | SEALED DISCLOSURE BYTES |
| packages/db/src/facts.ts | 148353 | 726c38a26bec907e9e581250764f9439fe77d55eda385da60c379613aff390cf | SEALED DISCLOSURE BYTES |
| packages/db/tests/decisions.test.ts | 45329 | e811d121f3755e57683d74da9b4f4a66a914ca47fbe7a31928a1a341679be47a | SEALED DISCLOSURE BYTES |
| packages/db/tests/facts.test.ts | 219821 | 8681eadedb6b4fe695881c3c6951b763ce54013b0df2def1c0e2b581d8ee593b | SEALED DISCLOSURE BYTES |
| packages/engine/src/scribe/graph.ts | 129064 | ad3863d2d2f1c8478067562ed65499311b9e290dd27ea69a73093a8bb8179416 | SEALED DISCLOSURE BYTES |
| packages/engine/tests/b18-suppression-outcome.test.ts | 109162 | 6f73f6fff1128f28022c3f2ae71e6ef61522e1193f7e0311cb6b9f3c729169b5 | SEALED DISCLOSURE BYTES |
| packages/engine/tests/scribe-persistence.test.ts | 185949 | 2e0026ce9d3e627d00cf80aeca51103168e0d77790ac90599d4ec96b5a708291 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d054-control-reachability-proposed.md | 43541 | f95a9ac2a5f1b1030a8d87cf4aa4cf3d55f3d9ad8b2b4726fe47e32f35ec8c60 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d059-d060-graph-baseline-red.log | 41399 | 95291f92f3dc0f8902d88c2266655d4ed01e972ae7ed1cb20565fca56b52b300 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-d060-graph-baseline-runtime-end.json | 15287 | d80531dc0c492b70a63f4f37949e61491f77f833717de6746bb9820caf9c05d4 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d059-d060-graph-baseline-runtime-start.json | 11923 | 2f4a901bacb80e7b6624733cede90e335eaa8475e0c33465fc902cc291eae4bd | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-candidate.json | 5327 | da856c9371305030949694019fda4e04d2c94f38adc429dcdb564e47ecc25610 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-focused.log | 16920 | d92d1bfe47f87045dcf7e6fcce55340d62362497f18e11039991c06c862647cb | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-runtime-end.json | 16045 | d1cd87ed12f8db38c682a9fccde93fb8e6ba8b2c94b0eb44521a458a8c1e8b43 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-runtime-start.json | 12119 | e14cbf5323325e49174f1a39796c11a6f281f573c513baad09e6851a36fa14c3 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-types-api.log | 348 | bb673a444f4e8324fcc66e231bbd8ec8ccda72a2884e517d166b070ad71eff77 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-types-db.log | 354 | 06b7147185cf7f64947241e1c2b19ceb9b81a3ad50d5dbb92fe335c26fdbe689 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-narrowing-types-engine.log | 361 | bbb8cec4ecaa29ea4af06ebcf4e762414fd12fec9d53fb9296e980222056425a | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-repaired-candidate.json | 5327 | 605e353d21e9f5f2649db165ce5ea6427a23f17965690fa0b1947f97be4dbbde | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-repaired-runtime-end.json | 14517 | 55a3f335bdd97d836cd3ac20a118eb08827a43791e2cd3ec25653d03c93c80e5 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-repaired-runtime-start.json | 12198 | 59d37e606743c2cbe10ab9d4cf1627eb88bfb10f56c8094f3cf586eee0d24790 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-repaired-types-db.log | 354 | bb75bbcf630b686e9881f3143bc38d1368cce146258103c4f76702abf53a9226 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d063-repaired-types-engine.log | 1469 | b6bfdcea8f7cc87d85b2eba2392f5a1647eda683ebace347e930fd769a55f42d | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/initial-facts-oracle-proposed.md | 67175 | 77cde1b8e9e6958dc967f20cb3c743050ea195db9249e5a4fdc72c62a4761cac | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md | 76914 | 04928099326a32fc34a16c5140a9019fe72dcba3a99722166ddd965d06f269cd | NOT FINAL |
| qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md | 53772 | 4d9d83f92f742cbb471525bd5c03c5264346be327ff1a02cfa1b3dcb2ca8045d | NOT FINAL |
| qa/manifests/t-052-session-lifecycle.md | 93667 | b035e945fb32350b27b15699d1bd4e724d9fc183182b41b11256e84c6177568a | NOT FINAL |

Unchanged candidate source/test bodies excluded:

- apps/api/src/openapi.ts
- apps/api/src/server.ts
- apps/web/demo/seed.ts
- apps/web/tests/session-api.test.ts
- packages/db/scripts/db-init.ts
- packages/db/src/collections.ts
- packages/db/src/erasure.ts
- packages/db/tests/consent.test.ts
- packages/db/tests/db-init.test.ts
- packages/db/tests/erasure.test.ts
- packages/db/tests/fakes.ts
- packages/engine/src/scribe/checkpointer.ts
- packages/engine/src/scribe/nodes.ts
- packages/engine/tests/scribe-checkpointer.test.ts
- packages/engine/tests/scribe-erasure-fence.test.ts
- packages/engine/tests/scribe-fixtures.ts
- packages/engine/tests/crisis-escalation.test.ts
- packages/engine/tests/scribe-per-fact.test.ts

No full 593-commit/history rescan, product/runtime/source acceptance, source/test/manifest change, test/provider/DB/network/process activity, Git mutation, push, new helper/file or checkout transfer was performed. Only this section was appended to the existing audit artifact, preserving every prior byte.

## D064-D067 frozen candidate private-publication disclosure DELTA

Inspection time (UTC): 2026-10-14 01:12:15 UTC.

Status: SAFE for exact sealed disclosure bytes; mutable prose/bookkeeping, pending source reviews and eventual formal checker evidence remain separate. No concrete durable-credential or actual student-data disclosure finding was identified. This is not source/product/feature acceptance, a PASS verdict, whole-goal completion, release approval or authority to push.

Current frozen input: qa/evidence/t052-maker-cycle2/d067-candidate.json; SHA-256 a7677d95cdbd232a3300ec55c0d507863580d9fdf9a51d8300dfe59232c804ea. All 27 current source/test path hashes matched that input. Six bodies changed or entered this selected disclosure scope: graph and five tests, including the existing scribe-rules-e2e.test.ts as the sole added existing path. Twenty-one unchanged bodies were excluded from content rescanning. The prior broad/history audit is not repeated.

Exact inspected incremental content: 41 paths / 1747502 bytes (6 source/test bodies, 25 completed D064-D067 QA/identity artifacts, 8 changed prose/approval paths, 2 changed bookkeeping paths). Observed-byte digest: 5f99535c0a736127bb0a468f0864b75bece3c6be3d717076de49b7d2adc24075.

Sealed disclosure subset: 31 paths / 1066614 bytes; SHA-256 77090a73ac0a633036ad9f4ca019d22f016a76ced56b0637b9c156e1e0e3b684. All selected sealed hashes matched again before this append. Ten inspected prose/bookkeeping paths remain NOT FINAL, and two unchanged prior NOT FINAL prose paths are carried forward without content rescanning. Digests use sorted relative-path + space + per-file SHA-256 lines joined by LF, without a terminal LF.

Privately exact-compared configured GEMINI_API_KEY and MONGODB_URL values against all inspected bytes: zero matches. Private-key, provider-key, serialized-JWT, credential-URI, personal-mailbox, personal-record-marker and generic credential-assignment scans had no candidates. Synthetic lifecycle/grant/receipt IDs and test-driver markers remain fixture evidence, not real student input or operational authority. No durable secret required redaction, and all original raw logs remain unchanged.

Newly selected Rules test boundary: packages/engine/tests/scribe-rules-e2e.test.ts uses RulesProvider and fake/harness data; inspected code contains no production connector, dotenv load, network fetch/listen call, source-file write or runtime process launch. No standalone executable QA helper was added in this artifact delta. This is a publication-content boundary assessment, not acceptance of the test's technical claims.

Read-back terminal facts (preserved rather than interpreted as a disclosure-lane PASS):

- D064 API end record: terminalChunk 256e94, exit 1, mutexPresent false; its original failed log is retained.
- D065 API end record: b0940b/exit 0; affected-core record: 2a74cc/exit 1 and web 99a3ed/exit 0; mutexPresent false.
- D066 diagnostic record: engine types 915dfd/exit 0 and tests d4676c/exit 0; importer record 5177ec/exit 0; mutexPresent false.
- D067 affected end record: core d7b352/exit 0 and web 9d0cbc/exit 0 at 2026-10-14T01:05:08.5380997Z; mutexPresent false. Selected test totals, NOTRUNNABLE skips, runtime pin counts, pending fresh source reviews and formal acceptance are owned by their separate evidence lanes. This audit does not convert them into source/feature acceptance.

Unchanged prior NOT FINAL prose carried without content rescan:

- qa/evidence/t052-maker-cycle2/initial-db-closure-proposed.md
- qa/evidence/t052-maker-cycle2/initial-facts-oracle-proposed.md

Future final follow-up: inspect final selected bytes of the ten current NOT FINAL table paths and two carried NOT FINAL prose paths; audit any later source-review/checker/readiness/commands/ownership/identity artifacts selected for publication; confirm the final actual publication subset against the pinned sealed paths. Later byte changes or additions are outside this section. No disclosure-driven exclusion/redaction is required for bytes actually inspected.

Inspected current path hashes:

| Path | Bytes | SHA-256 | Status |
|---|---:|---|---|
| apps/api/tests/server.test.ts | 86876 | eb9031e164a52ba8d75ecbb839f2a9319a3a45fbe590ee3ef2b4db44262f1481 | SEALED DISCLOSURE BYTES |
| docs/DECISIONS.md | 143473 | 7dae5e668a63222edfc868593053332e38648463e3d019d476a15adfa826f863 | NOT FINAL |
| packages/engine/src/scribe/graph.ts | 129905 | 19f12d1688d66351e166768e284d6816f8be853dd048b178a7ee1c3cf3041700 | SEALED DISCLOSURE BYTES |
| packages/engine/tests/b18-suppression-outcome.test.ts | 133352 | 6fdfba042c84d62da6b2b5ec359965547068267eedfd51f04d492d6e16cc08dc | SEALED DISCLOSURE BYTES |
| packages/engine/tests/scribe-erasure-fence.test.ts | 30769 | f57b8b6e35ac13148fdb86d2776f6eab22624c3d3d2c99938f5aa8d4531f6327 | SEALED DISCLOSURE BYTES |
| packages/engine/tests/scribe-persistence.test.ts | 188969 | e18cf904e6f7a520488062bc2af84b2de202a805692dbc37cc13ef3d25b25cea | SEALED DISCLOSURE BYTES |
| packages/engine/tests/scribe-rules-e2e.test.ts | 6695 | 73cf6cb8bcc29ba541bb72f0d6b7d4bcf59b5c455ed362afa3ae3df55fa36308 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/browser-acceptance-proposed.md | 28674 | 7e582d441b0b01a4d4b5f229f880cbcbe46b7e2fbe3a997a7aaebdc7c30f2c32 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d054-control-reachability-proposed.md | 73529 | 3ee5947575ecfbdde7771fef27ac4ab9eb4a62e706f2c868d69ddf64a0b4c47c | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d055-control-reachability-proposed.md | 49612 | df739040092001ee66f21cfcaa3ad22477d5ed7deb4b0c2061ff69935a1a7ffd | NOT FINAL |
| qa/evidence/t052-maker-cycle2/d064-api-focused.log | 4842 | fa979a393b10215deefa635ed0d9e46de456b7385027ed39e20eb5666b8a44ed | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d064-api-runtime-end.json | 15022 | 6158bcd5e86c902109d7c8fdb88f4857d72798e458cd37b76b39e06e75d0d69d | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d064-api-runtime-start.json | 11970 | b521a7c0fa1a1327fde88a8c6756719f1d28cc98634486a19e3a1ab4638f0f13 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d064-candidate.json | 5327 | 0626903b7eb3a499ac78d882061d60b25632efa4f178fafa6855ca9da5ec862f | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-affected-core.log | 188568 | 8f62e6bfdd9f57326b91ea6d03b02a103170481e478ce49a94663ab4a1b45e14 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-affected-runtime-end.json | 23302 | 7144c911b704f9700a3728add4707b09568df44bf1b4ba04a1d46d1ef40bda2c | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-affected-runtime-start.json | 18654 | b3c0c9364c4dad3c079c5d5b12d07076f9912c40adca595e15db327f968e9175 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-affected-web.log | 2522 | 4272423d0e4f02a536e09699c25b48083dea1c345db341b22e0064420ee3c1bc | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-api-focused.log | 1144 | b47f250796f0601da0c2218c56bd514d246726bdfa57fd1bc48429c92ccde635 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-api-runtime-end.json | 14580 | 8a7f81b9c7d2db541dfaa012ba542ef46653b649ffb2bf22d1aa656da51ae959 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-api-runtime-start.json | 11970 | fac4e6abf6a3ce9c860ced59aced295d287f1b87ff3c06c79810d78c62960d58 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d065-candidate.json | 5327 | 075e1fad80c46bd1bbf558f3f92ef45678bb691518927e37d699c04d8f337245 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-candidate.json | 5543 | 4fea62ed94aadfbc30421e4dbc1d72e72849025a1a59ccb89e82b4b48d274091 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-diagnostics-focused.log | 1269 | a15d792383c7d904d5628f3214f941c7f150a0d5e600701341cc08d8de875ab2 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-diagnostics-runtime-end.json | 18652 | 8d37a619d342bf242764a888e8b3ada73cff47b3396ded97a71e093a756a52df | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-diagnostics-runtime-start.json | 15533 | 88b060cc54b9016a252e1f39e2033a819b87d9339605c2cb1a99c7cf3506559f | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-diagnostics-types-engine.log | 293 | c214f0f2b429b4463948b41ac0b67a9861f40a0067e8436e0923daee1da0fa4c | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-importers-runtime-end.json | 18570 | 30dc9d3c86f748f10a9ee0896350f944da6d1d76f30d30305f3f9f715e328527 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-importers-runtime-start.json | 15538 | 90b78f259e5d79609f77603c6088a247a1152d2abbe8c39227903d8888dcc6fe | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d066-importers.log | 3158 | 6708017231b84d60b33e0e5347bc60faf46a93d82a45de6c83f5aba38520a49a | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d067-affected-core.log | 56603 | 85a051ff3e47c55ce7b59a7264963ecdb6dea0408c148fb579cd826f16073671 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d067-affected-runtime-end.json | 25632 | 6b154d17f158f847af9224c19c0ee4692846693d477f6d951fd5fdc166caa1fc | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d067-affected-runtime-start.json | 17963 | 3bff2e35e33f4f8d677f77264ca0c7b9e46e5461e67eeaf2e42a1e5c00801ac1 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d067-affected-web.log | 2523 | ca28ed81cab7ad82dd3a78ff0329288ddd6a8c884fe5a2fb8aaa1e7b072d2477 | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/d067-candidate.json | 5543 | a7677d95cdbd232a3300ec55c0d507863580d9fdf9a51d8300dfe59232c804ea | SEALED DISCLOSURE BYTES |
| qa/evidence/t052-maker-cycle2/initial-graph-closure-proposed.md | 67255 | 26fe23112eda7a0c72e3dc11a66790fae1c48e7bb9d257b7772c85c448f809d5 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-persistence-oracles-proposed.md | 16554 | b48bdb5ab30f8423cc6bd312d6322bc8ddbcb78072d343fe6aa15fbbcaa83360 | NOT FINAL |
| qa/evidence/t052-maker-cycle2/initial-persistence-plan-approval.md | 95342 | 349ed06dfe0bba7838cb46ad46a1f8d19af4870c838de8a7650d80931bdbc4cb | NOT FINAL |
| qa/evidence/t052-maker-cycle2/readiness-mapping-proposed.md | 62311 | b27fa9de8af7eaff8b79ea01094ca7b237e8eb875012ab552a71ac1134ab71bf | NOT FINAL |
| qa/evidence/t052-maker-cycle2/release-transfer-proposed.md | 46959 | 2158f1b73e8cf640cec478532807374268b9662d65efd73437ced69107c2b696 | NOT FINAL |
| qa/manifests/t-052-session-lifecycle.md | 97179 | 64c74b5d32a5224e316741628e0f2c508afd33c4cd41e3919e251b00a799796f | NOT FINAL |

Unchanged candidate source/test bodies excluded from content scan:

- apps/api/src/openapi.ts
- apps/api/src/server.ts
- apps/web/demo/seed.ts
- apps/web/tests/session-api.test.ts
- packages/db/scripts/db-init.ts
- packages/db/src/collections.ts
- packages/db/src/decisions.ts
- packages/db/src/erasure.ts
- packages/db/src/facts.ts
- packages/db/tests/consent.test.ts
- packages/db/tests/db-init.test.ts
- packages/db/tests/decisions.test.ts
- packages/db/tests/erasure.test.ts
- packages/db/tests/facts.test.ts
- packages/db/tests/fakes.ts
- packages/engine/src/scribe/checkpointer.ts
- packages/engine/src/scribe/nodes.ts
- packages/engine/tests/crisis-escalation.test.ts
- packages/engine/tests/scribe-checkpointer.test.ts
- packages/engine/tests/scribe-fixtures.ts
- packages/engine/tests/scribe-per-fact.test.ts

No source/test/manifest edits, runtime/provider/actual-student-DB/network activity, whole 593-commit history scan, acceptance verdict, Git mutation, push, checkout transfer or new file/helper was performed. Only this existing audit artifact was appended, preserving every prior byte.
