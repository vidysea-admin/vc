#!/usr/bin/env bash
# rep.sh : 5 runs of rows 64-66 + 116 under base and opt1b erasure in fz
S=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2
E=$S/fz/packages/db/src/erasure.ts
PAT='^D068 (?:writeApproved actual local aggregate receipt rejects .+|PUBLIC nested summary settlement: actual late undo registers new raw successful read before graph closes)$'
for v in base opt1b; do
  case $v in base) cp $S/fz-erasure-ad60624.ts $E;; opt1b) cp $S/erasure-opt1b.ts $E;; esac
  echo "== $v $(tr -d '\r' < $E | sha256sum | cut -c1-16) $(date -Iseconds)"
  bash $S/rr.sh $S/fz $S/rep-$v 5 "$PAT" packages/engine/tests/scribe-per-fact.test.ts packages/engine/tests/scribe-persistence.test.ts
  for i in 1 2 3 4 5; do echo "  run $i not-ok: $(grep '^not ok' $S/rep-$v-$i.log | sed 's/ - D068 / /' | cut -c1-70 | tr '\n' ';')"; done
done
cp $S/fz-erasure-ad60624.ts $E; echo "restored $(tr -d '\r' < $E | sha256sum | cut -c1-16)"
