#!/usr/bin/env bash
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
G=$S/fz/packages/engine/src/scribe/graph.ts; T=$S/fz/packages/engine/tests/scribe-checkpointer.test.ts
cp $T $S/bak-checkpointer.test.ts
cp $S/fz-graph-ad60624.bak $G; node $S/g5w.js $G; node $S/g5o.js $T
echo "== g5o at $(date -Iseconds) graph $(tr -d '\r' < $G | sha256sum | cut -c1-16) test $(tr -d '\r' < $T | sha256sum | cut -c1-16)"
bash $S/rr.sh $S/fz $S/g5o-adp 1 '^D068 Mongo adapter original observation .+$' packages/engine/tests/scribe-checkpointer.test.ts
cp $S/fz-graph-ad60624.bak $G; cp $S/bak-checkpointer.test.ts $T
echo "restored graph $(tr -d '\r' < $G | sha256sum | cut -c1-16) test $(tr -d '\r' < $T | sha256sum | cut -c1-16)"
grep -E '^not ok' $S/g5o-adp-1.log | cut -c1-100
