#!/bin/bash
echo "============================================================"
echo "PARTIE 3 : CONVEX + HOOKS + API-KEYS + CONFIG"
echo "============================================================"
echo ""

echo "### 3.1 Convex : exports et types ###"
grep -rn -E "^export (default |const |function |async )" src/convex/ --include="*.ts" 2>/dev/null | head -20
echo ""

echo "### 3.2 _generated manquant (cdse.ts l importe ?) ###"
ls -la src/convex/_generated/ 2>&1 | head -5
echo ""

echo "### 3.3 Imports croises casses entre src/ et src/convex/ ###"
grep -rn -E "from\s+[\"']\.\.\/convex|from\s+[\"']@\/convex" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
echo ""

echo "### 3.4 api-keys.ts : cles hardcodees valides ? ###"
grep -n -E 'openaq|cdseClient|cdseBase|firms|cdsApi' src/config/api-keys.ts
echo ""

echo "### 3.5 Hooks React utilises hors composants (anti-pattern) ###"
python3 << 'PY'
import re, pathlib
files = list(pathlib.Path("src/components").rglob("*.tsx")) + list(pathlib.Path("src/pages").rglob("*.tsx"))
hooks = ["useState", "useEffect", "useMemo", "useCallback", "useContext", "useRef", "useReducer", "useAuth"]
for f in files:
    text = f.read_text(encoding="utf-8", errors="ignore")
    # Si on est dans un fichier qui n a pas de 'function Component' ou 'export default',
    # chaque hook trouve est suspect
    has_component = bool(re.search(r"function\s+[A-Z]\w*\s*\(", text)) or bool(re.search(r"export\s+default", text))
    if not has_component:
        for h in hooks:
            if h in text:
                print(f"  {f}: hook {h} hors composant")
PY
echo ""

echo "### 3.6 Auth + RequireAuth flux incomplet ? ###"
grep -n -E "returnTo|redirectAfterAuth|/auth" src/main.tsx src/pages/Auth.tsx src/pages/Dashboard.tsx src/components/RequireAuth.tsx 2>/dev/null | head -10
echo ""

echo "### 3.7 Variable d'environnement requise utilisee mais non declaree ###"
grep -rn -E "import\.meta\.env\.VITE_" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20
