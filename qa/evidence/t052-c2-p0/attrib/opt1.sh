#!/usr/bin/env bash
# opt1.sh : run 128 controls, pin rows and the AR erasure test under base/1a/1b erasure variants in the fz copy
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
E=$S/fz/packages/db/src/erasure.ts
for v in base opt1a opt1b; do
  case $v in base) cp $S/fz-erasure-ad60624.ts $E;; opt1a) cp $S/erasure-opt1a.ts $E;; opt1b) cp $S/erasure-opt1b.ts $E;; esac
  echo "== $v erasure.ts LF sha $(tr -d '\r' < $E | sha256sum | cut -c1-16) at $(date -Iseconds)"
  bash $S/rr.sh $S/fz $S/o1-$v-128 1 "$(cat $S/pattern.txt)" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-checkpointer.test.ts packages/engine/tests/scribe-per-fact.test.ts
  bash $S/rr.sh $S/fz $S/o1-$v-pins 1 "$(cat $S/pinpat.txt)" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-per-fact.test.ts
  bash $S/rr.sh $S/fz $S/o1-$v-ar 1 '^D-016 deadline: the post-check runs AT the abort.*$' packages/db/tests/erasure.test.ts
done
cp $S/fz-erasure-ad60624.ts $E; echo "restored $(tr -d '\r' < $E | sha256sum | cut -c1-16)"
