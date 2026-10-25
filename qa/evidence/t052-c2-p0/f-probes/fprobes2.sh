#!/usr/bin/env bash
# fprobes.sh : review-delta-3 F3 (3a), F5/F8 (leaf DIAGT rows 43/116), F7a (T046 private + D055 rr dumps, ad60624 and frozen), F7b (T046 private on 36bae79). Copies only.
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2; F=$S/f; L=$F/logs; mkdir -p $L
Z=$S/fz; E=$Z/packages/db/src/erasure.ts; ET=$Z/packages/db/tests/erasure.test.ts; G=$Z/packages/engine/src/scribe/graph.ts
PF=$Z/packages/engine/tests/scribe-per-fact.test.ts; PS=$Z/packages/engine/tests/scribe-persistence.test.ts
h(){ echo "$1 LF sha $(tr -d '\r' < $2 | sha256sum | cut -c1-16)"; }
R(){ bash $S/rr.sh "$@"; }
FILES128="packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-checkpointer.test.ts packages/engine/tests/scribe-per-fact.test.ts"
P57='^D068 recordRejectReasons actual direct-op receipt: .+$'; P6466='^D068 writeApproved actual local aggregate receipt rejects .+$'
PAR='^D-016 deadline: the post-check runs AT the abort.*$'; PSTART='^D068 Mongo adapter original observation start .+$'
cp $ET $F/bak-erasure.test.ts; cp $PF $F/bak-per-fact.test.ts; cp $PS $F/bak-persistence.test.ts
cp $ET $F/bak-erasure.test.ts; cp $PF $F/bak-per-fact.test.ts; cp $PS $F/bak-persistence.test.ts
echo "#### F5/F8/F7a on ad60624 (base erasure) at $(date -Iseconds)"
node $F/diagpatch2.js $G; node $F/t046dump.js $PF
sed -i 's/nodes\\.ts:1592:/nodes\.ts:1691:/g; s/erasure\\.ts:676:/erasure\.ts:976:/g; s/erasure\\.ts:711:/erasure\.ts:1011:/g' $PS; node $F/d055dump.js $PS
h erasure.ts $E; h graph.ts $G; h per-fact $PF; h persistence $PS
R $Z $L/v2-f5-r43 1 '^D068 Mongo adapter original observation resume checkpoint primary reject$' packages/engine/tests/scribe-checkpointer.test.ts
R $Z $L/v2-f8-r116 1 '^D068 PUBLIC nested summary settlement: actual late undo registers new raw successful read before graph closes$' packages/engine/tests/scribe-persistence.test.ts
R $Z $L/v2-f7a-z-t046 1 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
R $Z $L/v2-f7a-z-d055 1 '^D055 prompt original deadline: actual early rollback rejects observably after every cleanup$' $FILES128
cp $S/fz-graph-ad60624.bak $G; cp $F/bak-per-fact.test.ts $PF; cp $F/bak-persistence.test.ts $PS
echo "restored fz: $(h erasure.ts $E) $(h graph.ts $G) $(h erasure.test $ET) $(h per-fact $PF) $(h persistence $PS)"
echo "#### F7a on frozen fr at $(date -Iseconds)"
FPF=$S/fr/packages/engine/tests/scribe-per-fact.test.ts; FPS=$S/fr/packages/engine/tests/scribe-persistence.test.ts
cp $FPF $F/bak-fr-per-fact.test.ts; cp $FPS $F/bak-fr-persistence.test.ts
node $F/t046dump.js $FPF; node $F/d055dump.js $FPS
R $S/fr $L/v2-f7a-r-t046 1 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
R $S/fr $L/v2-f7a-r-d055 1 '^D055 prompt original deadline: actual early rollback rejects observably after every cleanup$' $FILES128
cp $F/bak-fr-per-fact.test.ts $FPF; cp $F/bak-fr-persistence.test.ts $FPS
echo "#### done $(date -Iseconds)"
