# Checkpoint (coordinator B) - t-046-canonical-edit-provenance - cycle 0
Head checked: ba47d821b025a22b4ec8ad667da07af004cd00a6 (git archive copy). Env: Windows, node + tsx 4.23, pnpm junction node_modules, in-process fake Mongo. Lock: scripts/vc-testlock.sh slot 0.
Code hash: packages/engine/src/scribe/nodes.ts blob 808027a63712a2ff3f36fe50396b0ae95b5f82be.
Completed checks (command -> result):
- tsx --test tests/fact-source.test.ts (packages/schemas) -> 13/13
- tsx --test tests/facts.test.ts (packages/db) -> 59/59
- tsx --test tests/scribe-per-fact.test.ts tests/scribe.test.ts tests/b18-suppression-outcome.test.ts (packages/engine) -> 205 tests, 160 pass, 0 fail, 45 skip
- tsx --test tests/server.test.ts (apps/api) -> 34/34; tests/api.test.ts (apps/web) -> 14/14
- tsc --noEmit -p tsconfig.json for schemas, db, engine, api, web -> exit 0 each
- own probe tests/zz-probe-t046b.test.ts (apps/api, copy only) -> 6/6
- falsifications m1a m1b m2a m3b m4a m5a m6a -> green/red/green each; m3a survived on probe P1 and is carried by m3b
Scratch: C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t046b/
