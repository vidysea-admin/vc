#!/bin/bash
# Quiet gate Q sampler: up to 30 attempts 60s apart; stop after 3 consecutive passing samples.
L=/c/Users/Lenovo/AppData/Local/Temp/claude/vc-testlock
ok=0
for i in $(seq 1 31); do
  ts=$(date -Iseconds)
  lock=absent; { [ -e "$L" ] || [ -e "$L.slot-1" ]; } && lock=present
  nodes=$(tasklist //FI "IMAGENAME eq node.exe" 2>/dev/null | grep -c node.exe)
  read cpu ram < <(powershell -NoProfile -Command "\$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; \$r=[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2); Write-Output \"\$c \$r\"" | tr -d '\r')
  ll=$(powershell -NoProfile -ExecutionPolicy Bypass -File "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/t052c2/ll.ps1" | tr -d "\r")
  cfree=$(df -BG /c | tail -1 | awk '{print $4}' | tr -d G)
  pass=1
  [ "$lock" = absent ] || pass=0; [ "$nodes" -le 12 ] || pass=0
  awk "BEGIN{exit !($cpu<=25)}" || pass=0; awk "BEGIN{exit !($ram>=6)}" || pass=0; [ "$cfree" -ge 15 ] || pass=0
  if [ $pass = 1 ]; then ok=$((ok+1)); else ok=0; fi
  echo "$ts sample=$i lock=$lock node=$nodes cpu=$cpu freeRAMG=$ram Cfree=${cfree}G longLivedPre0908=$ll pass=$pass consecutive=$ok"
  [ $ok -ge 3 ] && { echo "Q HOLDS"; exit 0; }
  sleep 60
done
echo "Q NEVER HELD in 30 min"; exit 3
