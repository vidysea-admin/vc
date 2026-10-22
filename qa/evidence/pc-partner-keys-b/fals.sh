#!/bin/bash
SP=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/pckB
SRC=/d/vc/.worktrees/pc-partner-keys/apps/api
export VC_TESTLOCK_TIMEOUT_SECS=7200
declare -A PAT FILE FROM TO
PAT[K1]="K1: rotating the page key"
FILE[K1]=src/partners.ts
FROM[K1]='const keys = { ...existing.keys, [scope]: record } as Record<KeyScope, PartnerKeyRecord>;'
TO[K1]='const keys = { ...existing.keys } as Record<KeyScope, PartnerKeyRecord>;'
PAT[K2]="K2: a partner revoked while a widget page is open"
FILE[K2]=src/partners.ts
FROM[K2]='if (!doc || !equal || doc.status !== "active" || parsed.scope !== scope) return undefined;'
TO[K2]='if (!doc || !equal || parsed.scope !== scope) return undefined;'
PAT[K3]="K3: Pathlynks. backend sends a key for another"
FILE[K3]=src/chat.ts
FROM[K3]='tenantId: partner.partnerId,'
TO[K3]='tenantId: "shared-tenant",'
PAT[K4]="K4: a preflight from any other origin"
FILE[K4]=src/partners.ts
FROM[K4]='doc.status === "active" && doc.allowedOrigins.includes(origin)'
TO[K4]='doc.status === "active" && doc.allowedOrigins.some((o) => origin.startsWith(o))'
PAT[K5]="K5: a partner developer fetches"
FILE[K5]=src/partners.ts
FROM[K5]='if (pathname === PARTNER_OPENAPI_PATH) {'
TO[K5]='if (false) {'
for k in "$@"; do
  R=$SP/fals-$k/apps/api
  cd $R || exit 9
  lock() { bash D:/vc/scripts/vc-testlock.sh timeout 600 node node_modules/tsx/dist/cli.mjs --test "--test-name-pattern=${PAT[$k]}" tests/partners.test.ts; }
  echo "##### $k green-before (copy) $(date -Iseconds)" >> $SP/fals-$k.log
  lock >> $SP/fals-$k.log 2>&1; echo "exit=$?" >> $SP/fals-$k.log
  # apply the single-hunk edit in the COPY
  node -e '
const fs=require("fs");const [f,from,to]=process.argv.slice(1);
const s=fs.readFileSync(f,"utf8");const n=s.split(from).length-1;
if(n!==1){console.error("hunk matches",n);process.exit(3);}
fs.writeFileSync(f,s.replace(from,()=>to.replace(/\&/g,"&")));' "${FILE[$k]}" "${FROM[$k]}" "${TO[$k]}" >> $SP/fals-$k.log 2>&1 || { echo "EDIT-FAILED" >> $SP/fals-$k.log; continue; }
  diff <(cat $SRC/${FILE[$k]}) ${FILE[$k]} >> $SP/fals-$k.log
  echo "##### $k red-after (copy) $(date -Iseconds)" >> $SP/fals-$k.log
  lock >> $SP/fals-$k.log 2>&1; echo "exit=$?" >> $SP/fals-$k.log
  cp $SRC/${FILE[$k]} ${FILE[$k]}; cmp $SRC/${FILE[$k]} ${FILE[$k]} && echo "restored: identical to worktree" >> $SP/fals-$k.log
done
echo FALS-DONE "$@" >> $SP/fals-done.log
