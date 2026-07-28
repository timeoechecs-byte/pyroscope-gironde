#!/bin/bash
echo "=== ESLint par fichier - erreurs uniquement ==="
for f in src/pages/Dashboard.tsx src/pages/Landing.tsx src/pages/Auth.tsx \
         src/components/MapContainer.tsx src/components/SimulationMapLayer.tsx \
         src/components/FirePerimeterLayer.tsx src/components/HotspotLayer.tsx \
         src/components/SentinelMapLayer.tsx src/components/WindParticlesLayer.tsx \
         src/components/IsothermLayer.tsx src/components/SimulationPanel.tsx \
         src/components/FWICurve.tsx src/components/ExportPanel.tsx \
         src/components/ui/sidebar.tsx; do
  out=$(bun eslint "$f" 2>&1 | grep -E "error|warning" | grep -v "Fast refresh" | head -10)
  if [ -n "$out" ]; then
    echo "--- $f ---"
    echo "$out" | head -10
  fi
done

echo ""
echo "=== Localiser exactement les 3 'Unused eslint-disable' ==="
bun eslint "src/**/*.{ts,tsx}" 2>&1 | grep -B1 -A2 "Unused eslint-disable" | head -30
