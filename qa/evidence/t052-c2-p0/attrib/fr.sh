#!/usr/bin/env bash
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
F=$S/fr
echo "== fr = git archive 28bb3bc at $(date -Iseconds)"
for f in packages/db/src/facts.ts packages/db/src/decisions.ts packages/db/src/erasure.ts packages/engine/src/scribe/graph.ts packages/engine/src/scribe/nodes.ts; do [ -f $F/$f ] && echo "  $f LF sha $(tr -d '\r' < $F/$f | sha256sum | cut -c1-16)"; done
bash $S/rr.sh $F $S/fr-pins 1 "$(cat $S/pinpat.txt)" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-per-fact.test.ts
bash $S/rr.sh $F $S/fr-t046p 3 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
bash $S/rr.sh $F $S/fr-d055rr 3 '^D055 prompt original deadline: actual early rollback rejects observably after every cleanup$' packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-per-fact.test.ts
for p in fr-pins-1 fr-t046p-1 fr-d055rr-1; do echo "  $p not-ok: $(grep -E '^not ok' $S/$p.log | cut -c1-90 | tr '\n' ';')"; done
