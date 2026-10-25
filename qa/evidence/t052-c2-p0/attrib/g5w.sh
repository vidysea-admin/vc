#!/usr/bin/env bash
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
G=$S/fz/packages/engine/src/scribe/graph.ts
cp $S/fz-graph-ad60624.bak $G; node $S/g5w.js $G
echo "== g5w graph.ts LF sha $(tr -d '\r' < $G | sha256sum | cut -c1-16) at $(date -Iseconds)"
bash $S/rr.sh $S/fz $S/g5w-128 1 "$(cat $S/pattern.txt)" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-checkpointer.test.ts packages/engine/tests/scribe-per-fact.test.ts
cp $S/fz-graph-ad60624.bak $G; echo "restored $(tr -d '\r' < $G | sha256sum | cut -c1-16)"
grep -E '^not ok' $S/g5w-128-1.log | cut -c1-110
