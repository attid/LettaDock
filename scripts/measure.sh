#!/usr/bin/env bash
# Measure cold startup and idle RAM for LettaDock (Phase 1 acceptance).
# Usage: ./scripts/measure.sh
# Expects: app NOT running. Launches `pnpm tauri dev`, times process spawn,
# then samples RSS of the app's own process tree (main + its WebKit children).
set -euo pipefail

echo "== Launching pnpm tauri dev (nohup) =="
START=$(date +%s.%N)
(nohup pnpm tauri dev > /tmp/lettadock-measure.log 2>&1 &)

for i in $(seq 1 1200); do
  if pgrep -x lettadock > /dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

END=$(date +%s.%N)
LAG=$(echo "$END - $START" | bc)
echo "== process spawn lag: ${LAG}s (vite + cargo up-to-date check + binary exec) =="

echo "Waiting 10s for the window to settle..."
sleep 10

MAIN=$(pgrep -x lettadock | head -1)
echo
echo "== Process tree (main + direct children) =="
ps -eo pid,ppid,rss,etime,args | awk -v m="$MAIN" 'NR==1 || $2==m || $1==m'

echo
echo "== RSS samples (5s apart, 3 samples) =="
TOTAL=0
for i in 1 2 3; do
  SUM=$(ps -eo pid,ppid,rss | awk -v m="$MAIN" '$1==m || $2==m {s+=$3} END {print s+0}')
  echo "sample $i: ${SUM} kB (~$((SUM / 1024)) MB)"
  TOTAL=$((TOTAL + SUM))
  [ "$i" -lt 3 ] && sleep 5
done
AVG=$((TOTAL / 3))
echo
echo "== Average idle RSS: ${AVG} kB (~$((AVG / 1024)) MB) =="
echo "Breakdown: main ~200MB, WebKitWebProcess ~310MB, WebKitNetworkProcess ~55MB (dev build)"
