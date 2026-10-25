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
echo "#### F3 3a at $(date -Iseconds)"
cp $F/erasure-3a.ts $E; cp $F/erasure.test.base.ts $ET; node $F/ar4p.js $ET; h erasure.ts $E; h erasure.test.ts $ET; h graph.ts $G
(cd $Z/packages/db && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json > $L/3a-tsc-db.log 2>&1; echo "tsc db exit=$?")
(cd $Z/packages/engine && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json > $L/3a-tsc-engine.log 2>&1; echo "tsc engine exit=$?")
echo "-- 128"; R $Z $L/3a-128 1 "$(cat $S/pattern.txt)" $FILES128; grep '^not ok' $L/3a-128-1.log | cut -c1-12 | tr '\n' ' '; echo
echo "-- rows 5-7 x3"; R $Z $L/3a-r57 3 "$P57" packages/db/tests/decisions.test.ts
echo "-- rows 64-66 x5"; R $Z $L/3a-r6466 5 "$P6466" packages/engine/tests/scribe-per-fact.test.ts
for i in 1 2 3 4 5; do echo "   run $i not-ok: $(grep '^not ok' $L/3a-r6466-$i.log | cut -c1-80 | tr '\n' ';')"; done
echo "-- erasure.test.ts full"; R $Z $L/3a-erasure-full 1 '.*' packages/db/tests/erasure.test.ts
echo "-- AR (D-016 deadline callback: AR-1/AR-4'/AR-5)"; R $Z $L/3a-ar 1 "$PAR" packages/db/tests/erasure.test.ts
for m in m39 m43 m44; do
  cp $F/erasure-3a-$m.ts $E; echo "#### $m $(h erasure.ts $E)"
  case $m in
    m39) R $Z $L/3a-$m-ar 1 "$PAR" packages/db/tests/erasure.test.ts; R $Z $L/3a-$m-start 1 "$PSTART" packages/engine/tests/scribe-checkpointer.test.ts;;
    m43) R $Z $L/3a-$m-r57 1 "$P57" packages/db/tests/decisions.test.ts;;
    m44) R $Z $L/3a-$m-ar 1 "$PAR" packages/db/tests/erasure.test.ts;;
  esac
done
for f in $L/3a-m*-*.log; do echo "   $(basename $f): $(grep -E '^not ok' $f | cut -c1-70 | tr '\n' ';') | $(grep -m2 -E "AR-4|error: " $f | tr -s ' ' | cut -c1-160 | tr '\n' ' ')"; done
cp $S/fz-erasure-ad60624.ts $E; cp $F/bak-erasure.test.ts $ET
echo "#### F5/F8/F7a on ad60624 (base erasure) at $(date -Iseconds)"
node $F/diagpatch2.js $G; node $F/t046dump.js $PF
sed -i 's/nodes\\.ts:1592:/nodes\.ts:1691:/g; s/erasure\\.ts:676:/erasure\.ts:976:/g; s/erasure\\.ts:711:/erasure\.ts:1011:/g' $PS; node $F/d055dump.js $PS
h erasure.ts $E; h graph.ts $G; h per-fact $PF; h persistence $PS
R $Z $L/f5-r43 1 '^D068 Mongo adapter original observation resume checkpoint primary reject$' packages/engine/tests/scribe-checkpointer.test.ts
R $Z $L/f8-r116 1 '^D068 PUBLIC nested summary settlement: actual late undo registers new raw successful read before graph closes$' packages/engine/tests/scribe-persistence.test.ts
R $Z $L/f7a-z-t046 1 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
R $Z $L/f7a-z-d055 1 '^D055 prompt original deadline: actual early rollback rejects observably after every cleanup$' $FILES128
cp $S/fz-graph-ad60624.bak $G; cp $F/bak-per-fact.test.ts $PF; cp $F/bak-persistence.test.ts $PS
echo "restored fz: $(h erasure.ts $E) $(h graph.ts $G) $(h erasure.test $ET) $(h per-fact $PF) $(h persistence $PS)"
echo "#### F7a on frozen fr at $(date -Iseconds)"
FPF=$S/fr/packages/engine/tests/scribe-per-fact.test.ts; FPS=$S/fr/packages/engine/tests/scribe-persistence.test.ts
cp $FPF $F/bak-fr-per-fact.test.ts; cp $FPS $F/bak-fr-persistence.test.ts
node $F/t046dump.js $FPF; node $F/d055dump.js $FPS
R $S/fr $L/f7a-r-t046 1 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
R $S/fr $L/f7a-r-d055 1 '^D055 prompt original deadline: actual early rollback rejects observably after every cleanup$' $FILES128
cp $F/bak-fr-per-fact.test.ts $FPF; cp $F/bak-fr-persistence.test.ts $FPS
echo "#### F7b T046 private on 36bae79 at $(date -Iseconds); node $(node --version)"
for f in packages/engine/src/scribe/graph.ts packages/engine/tests/scribe-per-fact.test.ts; do h $f $S/f36/$f; done
R $S/f36 $L/f7b-36-t046 3 '^T046 private invocation metadata cannot authorize nested second graph sharing DB student and thread$' packages/engine/tests/scribe-per-fact.test.ts
echo "#### done $(date -Iseconds)"
