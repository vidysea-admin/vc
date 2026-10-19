#!/usr/bin/env bash
export TMP=D:/chk-lk1w/tmp TEMP=D:/chk-lk1w/tmp
EV=/d/chk-lk1w/evidence; O=/d/vc/.worktrees/lk1w; C=/d/chk-lk1w/copy; S=$EV/run3-summary.txt
: > $S; echo "start $(date -Iseconds)" >> $S
export EVID=D:/chk-lk1w/evidence/outcome.jsonl
rm -f $EVID
# 1. the outcome proof against the real bound tree
cd $O/apps/api
timeout 600 npx tsx --test D:/chk-lk1w/outcome.test.ts > $EV/outcome-run.txt 2>&1; echo "outcome exit=$? $(date -Iseconds)" >> $S
# 2. falsifications in the copy
export EVID=D:/chk-lk1w/evidence/fals-outcome.jsonl
run() { # dir testfile pattern outfile
  (cd $C/$1 && WT=D:/chk-lk1w/copy timeout 600 npx tsx --test --test-name-pattern="$3" $2 > $4 2>&1; echo $?)
}
row() { # id dir testfile pattern relfile old new occ
  id=$1; dir=$2; tf=$3; pat=$4; rel=$5; old=$6; new=$7; occ=$8
  b=$(run $dir "$tf" "$pat" $EV/fals-$id-before.txt)
  python D:/chk-lk1w/mut.py $C/$rel "$old" "$new" $occ >> $S 2>&1
  a=$(run $dir "$tf" "$pat" $EV/fals-$id-after.txt)
  cp $O/$rel $C/$rel
  cmp -s $O/$rel $C/$rel && r=restored || r=NOT-RESTORED
  echo "FALS[$id] green-before exit=$b | red-after exit=$a | $r | $(date -Iseconds)" >> $S
}
row C2crisis-outcome apps/api D:/chk-lk1w/outcome.test.ts "O6" packages/engine/src/student/graph.ts 'if (guard.level === "none") return {};' 'if (true) return {};' 1
row C2crisis-maker apps/api tests/anonymous-route.test.ts "LK1w: VC_TEXT_CHAIN set -> an anonymous question" packages/engine/src/student/graph.ts 'if (guard.level === "none") return {};' 'if (true) return {};' 1
echo "end $(date -Iseconds)" >> $S
