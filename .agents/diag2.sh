#!/bin/bash
echo "============================================================"
echo "PARTIE 2 : BUNDLE VITE + COMPOSANTS + RUNTIME PATTERNS"
echo "============================================================"
echo ""

echo "### 2.1 Tous les fichiers transformes par Vite : grep erreurs ###"
for path in /src/main.tsx /src/pages/Dashboard.tsx /src/components/LegalBanner.tsx /src/config/api-keys.ts /src/convex/cdse.ts; do
  body=$(curl -s "http://localhost:5173$path" --max-time 5 2>/dev/null)
  if [ -z "$body" ]; then
    echo "  $path: NO RESPONSE (verifier dev server)"
  else
    if echo "$body" | grep -q "Internal server error"; then
      echo "  $path: VITE INTERNAL ERROR"
      echo "$body" | head -10
    else
      size=$(echo "$body" | wc -c)
      echo "  $path: OK ($size bytes)"
    fi
  fi
done
echo ""

echo "### 2.2 Recherche des anti-patterns runtime courants ###"
echo ""
echo "-- useEffect/callback avec setState sans deps --"
grep -rn -E "useEffect\(\(\) => \{[^}]*set[A-Z]" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
echo ""

echo "-- useMemo/useCallback avec dependances vides [] ou sans deps --"
grep -rn -E "use(Memo|Callback)\([^)]*\)" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
echo ""

echo "-- component defini dans une autre fonction (anti-pattern) --"
# Cherche 'function NomXxx' apres une fonction export default, ou en debut de fonction
python3 << 'PY'
import re, pathlib
files = list(pathlib.Path("src").rglob("*.tsx"))
for f in files:
    text = f.read_text(encoding="utf-8", errors="ignore")
    if "function Dashboard" in text or "export default function" in text:
        # Chercher pattern : 'function Nom...' A L'INTERIEUR d'une autre fonction
        idx = text.find("export default function Dashboard")
        if idx < 0: continue
        rest = text[idx:]
        # Compter les accolades ouvrantes apres Dashboard, les "function ":
        depth = 0
        in_dash = False
        for m in re.finditer(r"(function\s+([A-Z]\w*)|\{|\})", rest):
            if m.group(0) == "{":
                depth += 1
            elif m.group(0) == "}":
                depth -= 1
            elif m.group(2):
                if depth > 0:
                    print(f"  {f}: INNER FUNCTION '{m.group(2)}' depth={depth} (possible anti-pattern)")
PY
echo ""

echo "### 2.3 console.error / console.warn dans le code ###"
grep -rn -E "console\.(error|warn)" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
echo ""

echo "### 2.4 TODO / FIXME / XXX ###"
grep -rn -E "TODO|FIXME|XXX|HACK" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15
