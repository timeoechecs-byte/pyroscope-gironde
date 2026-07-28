#!/bin/bash
echo "============================================================"
echo "PARTIE 1 : TYPECHECK + ESLINT + IMPORTS"
echo "============================================================"
echo ""
echo "### 1.1 Typecheck complet ###"
bun tsc -b --noEmit 2>&1 | head -60
echo "(fin typecheck)"
echo ""

echo "### 1.2 ESLint sur tout le projet (sans node_modules, .convex, _generated) ###"
bun eslint "src/**/*.{ts,tsx}" "src/convex/**/*.ts" 2>&1 | grep -E "error|warning" | head -60
echo "(fin ESLint)"
echo ""

echo "### 1.3 Imports fantomes (fichiers qui n'existent pas) ###"
# Extrait tous les imports @/..., relatifs, et verifie que les fichiers existent
python3 << 'PY'
import re, os, pathlib, sys
errors = []
src = pathlib.Path("src")
files = list(src.rglob("*.ts")) + list(src.rglob("*.tsx"))
for f in files:
    ftext = f.read_text(encoding="utf-8", errors="ignore")
    for line_num, line in enumerate(ftext.splitlines(), 1):
        # Imports @/...
        for m in re.finditer(r'from\s+["\']@/([^"\']+)["\']', line):
            p = src / f"{m.group(1)}.tsx"
            if not p.exists():
                p2 = src / f"{m.group(1)}.ts"
                if not p2.exists():
                    p3 = src / m.group(1) / "index.tsx"
                    if not p3.exists():
                        p4 = src / m.group(1) / "index.ts"
                        if not p4.exists():
                            errors.append(f"MISSING: {f}:{line_num} -> @/{m.group(1)}")
print(f"Total imports @ casses: {len(errors)}")
for e in errors[:20]:
    print(f"  {e}")
PY
echo ""
