#!/usr/bin/env bash
# repin.sh : copy-only E2 repin probe in fz (graph 255->344, nodes 1592->1691, erasure 676->976, 711->1011), then restore
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
Z=$S/fz/packages/engine/tests
cp $Z/scribe-per-fact.test.ts $S/bak-per-fact.test.ts; cp $Z/scribe-persistence.test.ts $S/bak-persistence.test.ts
sed -i 's/graph\\.ts:255:/graph\.ts:344:/g' $Z/scribe-per-fact.test.ts
sed -i 's/nodes\\.ts:1592:/nodes\.ts:1691:/g; s/erasure\\.ts:676:/erasure\.ts:976:/g; s/erasure\\.ts:711:/erasure\.ts:1011:/g' $Z/scribe-persistence.test.ts
echo "== repin at $(date -Iseconds); diff lines: per-fact $(diff $S/bak-per-fact.test.ts $Z/scribe-per-fact.test.ts | grep -c '^>') persistence $(diff $S/bak-persistence.test.ts $Z/scribe-persistence.test.ts | grep -c '^>')"
diff $S/bak-persistence.test.ts $Z/scribe-persistence.test.ts > $S/repin.diff; diff $S/bak-per-fact.test.ts $Z/scribe-per-fact.test.ts >> $S/repin.diff
bash $S/rr.sh $S/fz $S/repin-pins 2 "$(cat $S/pinpat.txt)" packages/db/tests/facts.test.ts packages/db/tests/decisions.test.ts packages/engine/tests/scribe-persistence.test.ts packages/engine/tests/scribe-per-fact.test.ts
cp $S/bak-per-fact.test.ts $Z/scribe-per-fact.test.ts; cp $S/bak-persistence.test.ts $Z/scribe-persistence.test.ts
echo "restored per-fact $(sha256sum < $Z/scribe-per-fact.test.ts | cut -c1-8) persistence $(sha256sum < $Z/scribe-persistence.test.ts | cut -c1-8)"
for i in 1 2; do echo "  run $i not-ok: $(grep -E '^not ok' $S/repin-pins-$i.log | cut -c1-90 | tr '\n' ';')"; done
