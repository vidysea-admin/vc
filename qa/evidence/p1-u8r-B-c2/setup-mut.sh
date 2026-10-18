set -e
W=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u8r
E=$W/qa/evidence/p1-u8r-B-c2
M=$W/apps/api/.b-mut
rm -rf $M; mkdir -p $M/db $M/redact
cp -r $W/apps/api/src $M/src; cp -r $W/apps/api/tests $M/tests
sed -i 's#\.\./\.\./\.\./skills#../../../../skills#' $M/tests/anonymous-fixtures.ts
sed -i 's#\.\./\.\./\.\./qa/gates#../../../../qa/gates#' $M/src/anonymous.ts
# probes: import from local copies
for f in probe-b probe-c2; do
  sed -e 's#"../../../packages/db/src/index.js"#"@vc/db"#' -e 's#"../../../packages/schemas/src/redact.js"#"@vc/schemas"#' -e 's#"../../../apps/api/tests/#"./#' $E/$f.test.ts > $M/tests/$f.test.ts
done
# redact harness
cp $W/packages/schemas/src/redact.ts $M/redact/redact.orig.ts
cp $W/packages/schemas/tests/redact.test.ts $M/redact/redact.test.ts
sed -i 's#"../src/redact.js"#"./redact.js"#' $M/redact/redact.test.ts
# db harness
sed -e 's#from "\./#from "../../../../packages/db/src/#' $W/packages/db/src/profile-facts.ts > $M/db/profile-facts.orig.ts
cp $M/src/chat.ts $M/chat.orig.ts
echo setup-ok
