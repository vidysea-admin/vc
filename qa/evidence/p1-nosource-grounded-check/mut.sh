#!/usr/bin/env bash

export TMP=D:/tmp-chk-nosource TEMP=D:/tmp-chk-nosource VC_TESTLOCK_TIMEOUT_SECS=7200
SRC=/d/tmp-chk-nosource/copy
mk() { g=$1; M=/d/tmp-chk-nosource/mut/$g; rm -rf $M; mkdir -p $M/packages; cp -r $SRC/skills $M/skills; mkdir -p $M/packages/engine; (cd $SRC/packages/engine && tar --exclude=node_modules -cf - .) | tar -xf - -C $M/packages/engine; }
run() { g=$1; pat=$2; M=/d/tmp-chk-nosource/mut/$g/packages/engine
  echo "== $g green-before(unmutated) and red-after" 
  (cd $M && bash D:/vc/scripts/vc-testlock.sh timeout 600 npx tsx --test --test-name-pattern "$pat" tests/chk-proof.test.ts > /d/tmp-chk-nosource/out/mut-$g-before.log 2>&1); echo "before exit=$? $(grep -E '^ℹ (pass|fail)' /d/tmp-chk-nosource/out/mut-$g-before.log | tr '\n' ' ')"
}
mutate() { g=$1; file=$2; from=$3; to=$4; M=/d/tmp-chk-nosource/mut/$g/packages/engine
  python - "$M/$file" "$from" "$to" <<'PY'
import sys
p,a,b=sys.argv[1:4]
s=open(p,encoding='utf8',newline='').read()
assert s.count(a)==1,(a,s.count(a))
open(p,'w',encoding='utf8',newline='').write(s.replace(a,b))
PY
}
after() { g=$1; pat=$2; M=/d/tmp-chk-nosource/mut/$g/packages/engine
  (cd $M && bash D:/vc/scripts/vc-testlock.sh timeout 600 npx tsx --test --test-name-pattern "$pat" tests/chk-proof.test.ts > /d/tmp-chk-nosource/out/mut-$g-after.log 2>&1); echo "after exit=$? $(grep -E '^ℹ (pass|fail)' /d/tmp-chk-nosource/out/mut-$g-after.log | tr '\n' ' ') :: $(grep -E '^✖' /d/tmp-chk-nosource/out/mut-$g-after.log | head -3 | tr '\n' '|')"
}
[ "$1" = prep ] && { for g in g1 g2 g3 g4 g5; do mk $g; done; exit 0; }
run g1 "^G1"; run g2 "^G2"; run g3 "^G3"; run g4 "^G4 both"; run g5 "^G5"
mutate g1 src/student/graph.ts 'function webQuestion(text: string): string {' 'function webQuestion(text: string): string {
    return text;'
mutate g2 src/student/graph.ts 'const message = guardedGuidance(grounded.text, input, priorFlag, replyLang);
        if (message !== undefined)' 'const message = `${fixedText(replyLang, "guidanceDisclaimer")} ${grounded.text}`;
        if (message !== undefined)'
mutate g3 src/student/lang.ts '  return hasBareDomain(t);' '  return false;'
mutate g4 src/student/lang.ts 'export function isOutOfScopeQuestion(text: string): boolean {' 'export function isOutOfScopeQuestion(text: string): boolean {
  return false;'
mutate g5 src/student/graph.ts '      if ((await screen).verdict === "possible") return reply(refusal);
    } else if (input.mode === "anonymous" && screenCfg?.anonymous === "no_source") {' '    } else if (false) {'
after g1 "^G1"; after g2 "^G2"; after g3 "^G3"; after g4 "^G4 both"; after g5 "^G5"
