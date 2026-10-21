#!/usr/bin/env bash
export TMP=D:/tmp-chk/tmp TEMP=D:/tmp-chk/tmp VC_TESTLOCK_TIMEOUT_SECS=7200
W=/d/vc/.worktrees/p1-grounding-hardening; F=/d/tmp-chk/c1/fal2; L=/d/tmp-chk/c1/logs
mkdir -p $F
mk() { id=$1; d=$F/$id; mkdir -p $d
  git -C $W archive bc07790 tsconfig.base.json package.json skills mcp packages/engine packages/providers packages/schemas packages/db packages/observability apps/api | tar -x -C $d
  for q in packages/engine packages/providers packages/schemas packages/db packages/observability apps/api; do if [ -d $W/$q/node_modules ]; then ln -s $W/$q/node_modules $d/$q/node_modules; fi; done; }
lt() { bash D:/vc/scripts/vc-testlock.sh timeout 600 "$@"; }
# id pkg file marker old new testfile pattern
fal() { id=$1; pkg=$2; file=$3; marker=$4; old=$5; new=$6; tf=$7; pat=$8
  mk $id; d=$F/$id/$pkg
  echo "##### $id green-before $(date -Iseconds)" >> $L/fals2.txt
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" $tf ) > $L/fal-$id-green.log 2>&1; echo "green rc=$? $(grep -E '^ℹ (pass|fail)' $L/fal-$id-green.log | tr '\n' ' ')" >> $L/fals2.txt
  python D:/tmp-chk/c1/mutate.py "$d/$file" "$marker" "$old" "$new" >> $L/fals2.txt 2>&1
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" $tf ) > $L/fal-$id-red.log 2>&1; echo "red rc=$? $(grep -E '^ℹ (pass|fail)' $L/fal-$id-red.log | tr '\n' ' ')" >> $L/fals2.txt
  grep -E "^✖" $L/fal-$id-red.log | sort -u | head -6 >> $L/fals2.txt
  # restore: re-extract the original file from the commit and rerun
  git -C $W show bc07790:$pkg/$file > $d/$file.orig 2>/dev/null; cp $d/$file.orig $d/$file; rm $d/$file.orig
  ( cd $d && lt npx tsx --test --test-name-pattern="$pat" $tf ) > $L/fal-$id-restored.log 2>&1; echo "restored rc=$? $(grep -E '^ℹ (pass|fail)' $L/fal-$id-restored.log | tr '\n' ' ')" >> $L/fals2.txt
}
fal F1name packages/engine src/student/lang.ts 'INTRO_I_AM_RE, (_m, intro: string, run: string)' 'redactNameRun(run, false)' 'redactNameRun(run, true)' tests/lang.test.ts "H1 F1"
fal F1pin packages/engine src/student/lang.ts 'const PIN_TRAILING_RE' '(?:is|was)\s+(?:my|the' '(?:IS|WAS)\s+(?:my|the' tests/lang.test.ts "H1 F1"
fal F2 packages/providers src/index.ts 'keys.set(key, used + 1);' 'keys.set(key, used + 1);' 'if (!this.#spend) keys.set(key, used + 1);' tests/index.test.ts "H6 F2"
fal F3 apps/api src/anonymous.ts 'limiter.keyOf(rawKey' 'limiter.keyOf(rawKey || undefined)' 'rawKey || "unknown"' tests/anonymous-route.test.ts "H6 F3"
fal F4fraud packages/engine src/student/lang.ts 'if (FRAUD_ASK_RES.some' 'FRAUD_ASK_RES.some((re) => re.test(t))' 'false' tests/lang.test.ts "H4 F4"
fal F4inj packages/engine src/student/lang.ts '(?=\s*(?:$|[.,;:!?]|and\b' '(?=\s*(?:$|[.,;:!?]|and\b' '(?=\s*(?:ZZNEVER|and\b' tests/lang.test.ts "H4 F4"
fal F5 packages/engine src/student/lang.ts 'const DOT_THEN_SPACE_RE = ' '"giu");' '"gu");' tests/lang.test.ts "H5 F5"
echo "FALSDONE $(date -Iseconds)" >> $L/fals2.txt
