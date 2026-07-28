#!/bin/bash
echo "=== Tous les composants Pollut* ou autres non listés ==="
grep -n -E "^function [A-Z]" src/pages/Dashboard.tsx | head -30
echo ""
echo "=== HTML rendu racine par dev server ==="
curl -s http://localhost:5173/ --max-time 5 | head -30
echo ""
echo "=== Page / via dev server : premier composant importe ==="
curl -s "http://localhost:5173/" --max-time 5 2>/dev/null | grep -oE "src=\"[^\"]*main\.tsx[^\"]*\"" | head -3
