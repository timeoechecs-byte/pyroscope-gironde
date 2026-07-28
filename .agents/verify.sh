#!/bin/bash
echo "=== 1) Typecheck ==="
bun tsc -b --noEmit 2>&1 | head -20
echo ""
echo "=== 2) Fichier Dashboard.tsx ==="
wc -l src/pages/Dashboard.tsx
echo ""
echo "=== 3) Sous-composants au niveau module ==="
grep -n -E "^(function|const) (Section|LayerCard|PollutantCard|WeatherCard|SafetyCard|StatChip)" src/pages/Dashboard.tsx
echo ""
echo "=== 4) Sticky + z-index ==="
grep -n -E "sticky top|z-.999|fixed" src/pages/Dashboard.tsx src/components/LegalBanner.tsx
echo ""
echo "=== 5) Dev server health ==="
for port in 5173 4173 3000 8080; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/" --max-time 3 2>/dev/null || echo "000")
  echo "localhost:$port -> HTTP $status"
done
