#!/usr/bin/env bash
export TMP=D:/tmp-chk/c2/tmp TEMP=D:/tmp-chk/c2/tmp VC_TESTLOCK_TIMEOUT_SECS=7200
W=/d/vc/.worktrees/p1-grounding-hardening; F=/d/tmp-chk/c2/fal; L=/d/tmp-chk/c2/logs; OUT=$L/fals2.txt
mkdir -p $F
rc_line() { grep -E '^ℹ (pass|fail)' "$1" | tr '\n' ' '; }
mk() { id=$1; d=$F/$id; rm -rf $d; mkdir -p $d
  git -C $W archive d0810f0 tsconfig.base.json package.json skills mcp packages/engine packages/providers packages/schemas packages/db packages/observability apps/api | tar -x -C $d
  for q in packages/engine packages/providers packages/schemas packages/db packages/observability apps/api; do [ -d $W/$q/node_modules ] && ln -s $W/$q/node_modules $d/$q/node_modules; done; }
lt() { bash D:/vc/scripts/vc-testlock.sh timeout 600 "$@"; }
# id label sedexpr  (applied to packages/engine/src/student/lang.ts)
fal() { id=$1; sedexpr=x; pat=$3
  mk $id; d=$F/$id/packages/engine; f=$d/src/student/lang.ts
  echo "##### $id green-before $(date -Iseconds)" >> $OUT
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/lang.test.ts ) > $L/fal-$id-lang-green.log 2>&1; echo "lang green rc=$? $(rc_line $L/fal-$id-lang-green.log)" >> $OUT
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/student-graph.test.ts ) > $L/fal-$id-graph-green.log 2>&1; echo "graph green rc=$? $(rc_line $L/fal-$id-graph-green.log)" >> $OUT
  cp $f $f.orig; node D:/tmp-chk/c2/mutate.js $f "$4" "$5" >> $OUT


  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/lang.test.ts ) > $L/fal-$id-lang-red.log 2>&1; echo "lang red rc=$? $(rc_line $L/fal-$id-lang-red.log)" >> $OUT
  grep -E "^✖" $L/fal-$id-lang-red.log | sort -u | head -4 >> $OUT
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/student-graph.test.ts ) > $L/fal-$id-graph-red.log 2>&1; echo "graph red rc=$? $(rc_line $L/fal-$id-graph-red.log)" >> $OUT
  grep -E "^✖" $L/fal-$id-graph-red.log | sort -u | head -4 >> $OUT
  git -C $W show d0810f0:packages/engine/src/student/lang.ts > $f; rm $f.orig
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/lang.test.ts ) > $L/fal-$id-lang-rest.log 2>&1; echo "lang restored rc=$? $(rc_line $L/fal-$id-lang-rest.log)" >> $OUT
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" tests/student-graph.test.ts ) > $L/fal-$id-graph-rest.log 2>&1; echo "graph restored rc=$? $(rc_line $L/fal-$id-graph-rest.log)" >> $OUT
}
fal M2qty x "H1 F2" '|\b(?:rs\.?|inr|usd|eur|gbp|rank(?:ed)?|air|score[ds]?|marks?|percentile|budget|fees?|' '|\b(?:ZZNEVER|'
fal M3naam x "H1 F2" '|naam\s*[:=–-]' ''
fal M4age x "H1 F2" '(\s*,?\s*\(?\s*)\d{1,2}' '(\s*,?\s*)\d{1,2}'
echo "FALSDONE $(date -Iseconds)" >> $OUT
