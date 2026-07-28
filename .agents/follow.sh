#!/bin/bash
echo "=== 1) Toutes les setStates synchrones restantes dans load() Dashboard ==="
awk '/const load = useCallback/,/^  }, \[\]/' src/pages/Dashboard.tsx 2>/dev/null | grep -n -E "set[A-Z][a-z]" | head -20
echo ""
echo "=== 2) ESLint par fichier - loc. precise des warnings/errors ==="
for f in src/pages/Dashboard.tsx src/components/ExportPanel.tsx src/components/ui/sidebar.tsx; do
  echo "--- $f ---"
  bun eslint "$f" 2>&1 | grep -E "error|warning" | grep -v "Fast refresh"
done
echo ""
echo "=== 3) Toutes directives eslint-disable actuellement dans ExportPanel ==="
grep -n "eslint-disable" src/components/ExportPanel.tsx
echo ""
echo "=== 4) Lignes 330-345 actuelles dans ExportPanel.tsx ==="
awk 'NR>=330 && NR<=345 {print NR": "$0}' src/components/ExportPanel.tsx
echo ""
echo "=== 5) Reste de la sidebar (ligne 605-625) ==="
awk 'NR>=605 && NR<=625 {print NR": "$0}' src/components/ui/sidebar.tsx
