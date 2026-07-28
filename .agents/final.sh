#!/bin/bash
echo "=== TYPECHECK FINAL ==="
bun tsc -b --noEmit 2>&1 | head -30
echo ""
echo "=== ESLint FINAL - uniquement les fichiers edits ==="
for f in src/components/MapContainer.tsx \
         src/pages/Dashboard.tsx \
         src/pages/Landing.tsx \
         src/components/ExportPanel.tsx \
         src/components/ui/sidebar.tsx; do
  out=$(bun eslint "$f" 2>&1)
  err_count=$(echo "$out" | grep -cE "error" || true)
  warn_count=$(echo "$out" | grep -cE "warning" || true)
  echo "--- $f ---  errors=$err_count warnings=$warn_count"
  if [ "$err_count" -gt 0 ] || [ "$warn_count" -gt 0 ]; then
    echo "$out" | grep -E "error|warning" | grep -v "Fast refresh" | head -10
  fi
done
echo ""
echo "=== RESUME GLOBAL ==="
total_err=$(bun eslint "src/**/*.{ts,tsx}" 2>&1 | grep -E "error" | grep -v "Fast refresh" | wc -l)
total_warn=$(bun eslint "src/**/*.{ts,tsx}" 2>&1 | grep -E "warning" | grep -v "Fast refresh" | wc -l)
echo "Erreurs P1+P2 restantes dans le projet : $total_err"
echo "Warnings P1+P2 restants dans le projet : $total_warn"
