# usage: mut-run.sh   (runs all mutants against the clean copy tree)
set -u
S=C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad
C=$S/p1-u8r-B-clean; W=$S/p1-u8r; E=$W/qa/evidence/p1-u8r-B-c2; M=$C/apps/api/.b-mut
export VC_TESTLOCK_TIMEOUT_SECS=7200
rm -rf $M; mkdir -p $M/db $M/redact
cp -r $C/apps/api/src $M/src; cp -r $C/apps/api/tests $M/tests
sed -i 's#\.\./\.\./\.\./skills#../../../../skills#' $M/tests/anonymous-fixtures.ts
sed -i 's#\.\./\.\./\.\./qa/gates#../../../../qa/gates#' $M/src/anonymous.ts
for f in probe-b probe-c2; do
  sed -e 's#"../../../packages/db/src/index.js"#"@vc/db"#' -e 's#"../../../packages/schemas/src/redact.js"#"@vc/schemas"#' -e 's#"../../../apps/api/tests/#"./#' $E/$f.test.ts > $M/tests/$f.test.ts
done
cp $C/packages/schemas/src/redact.ts $M/redact/redact.orig.ts; cp $M/redact/redact.orig.ts $M/redact/redact.ts
cp $C/packages/schemas/tests/redact.test.ts $M/redact/redact.test.ts; sed -i 's#"../src/redact.js"#"./redact.js"#' $M/redact/redact.test.ts
cp $E/probe-redact.test.ts $M/redact/
sed -e 's#from "\./#from "../../../../packages/db/src/#' $C/packages/db/src/profile-facts.ts > $M/db/profile-facts.orig.ts; cp $M/db/profile-facts.orig.ts $M/db/profile-facts.ts
cp $E/probe-c6.test.ts $M/db/
cp $M/src/chat.ts $M/chat.orig.ts
MUT() { python $E/mutate.py "$@"; }
CHAT_TESTS="$M/tests/chat-privacy.test.ts $M/tests/probe-c2.test.ts $M/tests/probe-b.test.ts"
REDACT_TESTS="$M/redact/redact.test.ts $M/redact/probe-redact.test.ts"
DB_TESTS="$M/db/probe-c6.test.ts"
runm() { # id kind file edits...
  id=$1; kind=$2; file=$3; shift 3
  case " ${ONLY:-$id} " in *" $id "*) ;; *) return;; esac
  echo "##### MUTANT $id"
  cp $file.orig.ts $file 2>/dev/null || cp ${file%.ts}.orig.ts $file
  MUT $file "$@" || { echo "##### $id MUTATION-NOT-APPLIED"; return; }
  case $kind in chat) T="$CHAT_TESTS";; redact) T="$REDACT_TESTS";; db) T="$DB_TESTS";; esac
  bash D:/vc/scripts/vc-testlock.sh pnpm -C $C/apps/api exec tsx --test --test-timeout=90000 $T > $E/mut-$id.log 2>&1; grep -E "^✖|^ℹ (tests|pass|fail|cancelled)" $E/mut-$id.log | grep -v "failing tests" | sort -u | head -12
  echo "##### $id DONE"
  cp ${file%.ts}.orig.ts $file 2>/dev/null; [ "$file" = "$M/src/chat.ts" ] && cp $M/chat.orig.ts $M/src/chat.ts
}
CH=$M/src/chat.ts; RD=$M/redact/redact.ts; PF=$M/db/profile-facts.ts
cp $M/chat.orig.ts $M/src/chat.orig.ts
runm C1 chat $CH 'if (profileDown && !crisis) return fail(503, "profile_unavailable");' ''
runm C2 chat $CH 'rank <= active.rank) return { holds: false, slot: active };' 'rank < 0) return { holds: false, slot: active };'
runm C4 chat $CH 'const allNames = [...knownNames, ...stated];' 'const allNames = [...knownNames];'
runm C5 chat $CH 'for (const candidate of [r.full(raw), r.minimal(raw)])' 'for (const candidate of [raw])'
runm C7 chat $CH 'if (active !== undefined && rank <= active.rank) return' 'if (active !== undefined) return'
runm C8 chat $CH 'if (quiet && clientTurnId !== undefined && consentOk && !overlong && !profileDown) {' 'if (false) {'
runm C11a chat $CH 'redactors.escalated === true && ' ''
runm C11b chat $CH 'const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;' 'const slotRank = LEVEL_RANK[level];'
runm C11ab chat $CH 'redactors.escalated === true && ' '' 'const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;' 'const slotRank = LEVEL_RANK[level];'
runm C11d chat $CH 'variant === "full" && redactors.escalated === true && ' ''
runm C11e chat $CH 'variant === "full" && redactors.escalated === true && ' '' 'const slotRank = consentOk && !overlong ? LEVEL_RANK[level] : 0;' 'const slotRank = LEVEL_RANK[level];'
runm C11f chat $CH 'variant === "full" && ' ''
runm C12 chat $CH ' && !found.released ? found : undefined' ' ? found : undefined' 'prev !== undefined && !prev.released && prev.until > nowMs()' 'prev !== undefined && prev.until > nowMs()'
runm C13 chat $CH 'if (slot.confirmed) return true;' 'return slot.confirmed;'
runm C3 redact $RD 'const lowerOk = LOWER_OK_LEAD.test(lead);' 'const lowerOk = false;'
runm C9 redact $RD '[...trimTail(tok)].length > 1 && !TITLES.has(trimTail(tok).toLowerCase())) break;' '[...trimTail(tok)].length > 1) break;'
runm C10a redact $RD '!input.includes("@")' 'false'
runm C10b redact $RD '[A-Za-z0-9._%+-]{1,64}@' '[A-Za-z0-9._%+-]+@'
runm C10ab redact $RD '!input.includes("@")' 'false' '[A-Za-z0-9._%+-]{1,64}@' '[A-Za-z0-9._%+-]+@'
runm C14 redact $RD '(?:${NAME_PREFIX}\s+)*' ''
runm C6 db $PF 'const key = redactPii(input.key).text;' 'const key = input.key;'
echo "##### ALL-DONE"
