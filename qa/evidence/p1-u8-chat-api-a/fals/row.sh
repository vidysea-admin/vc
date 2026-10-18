#!/usr/bin/env bash
# usage: row.sh ID  (reads $F/rows/ID.conf: FILE, OLD, NEW, GROUPS array)
ID=$1; F=/c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/chk-a/fals
R=$F/$ID; mkdir -p $R/logs; cd $R
. $F/rows/$ID.conf
sumline() { # label logfile
  local t p f ff
  t=$(grep -m1 -E '^ℹ tests ' $2 | awk '{print $3}'); p=$(grep -m1 -E '^ℹ pass ' $2 | awk '{print $3}'); f=$(grep -m1 -E '^ℹ fail ' $2 | awk '{print $3}')
  ff=$(grep -m1 '^✖' $2 | sed 's/ ([0-9.]*ms)$//')
  echo "$1 tests=${t:-NA} pass=${p:-NA} fail=${f:-NA} first_fail=[${ff}]" | tee -a $R/summary.txt
}
runall() { # phase
  local i=0 g dir files
  for g in "${GROUPS_[@]}"; do
    dir=${g%%|*}; files=${g#*|}; i=$((i+1))
    ( cd $R/$dir && pnpm exec tsx --test $files ) > $R/logs/$1_$i.log 2>&1
    sumline "$1 group$i ($dir: $files)" $R/logs/$1_$i.log
  done
}
: > $R/summary.txt
echo "start $(date -Iseconds)" >> $R/summary.txt
runall before
node $F/edit.cjs "$FILE" "$OLD" "$NEW" 2>&1 | tee -a $R/summary.txt
runall after
cp $F/tpl/$FILE $R/$FILE && cmp $F/tpl/$FILE $R/$FILE && echo "restored byte-identical to HEAD: $FILE" | tee -a $R/summary.txt
runall restored
echo "end $(date -Iseconds)" >> $R/summary.txt
