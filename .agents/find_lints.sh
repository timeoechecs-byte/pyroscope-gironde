#!/bin/bash
echo "=== Localiser Eye, Grip, stagger inutilises ==="
for f in src/pages/*.tsx src/components/*.tsx src/components/ui/*.tsx; do
  if [ -f "$f" ]; then
    if grep -l -E "(Eye|Grip|stagger)" "$f" >/dev/null 2>&1; then
      echo "--- $f ---"
      grep -n -E "(Eye|Grip|stagger)" "$f" | head -10
    fi
  fi
done

echo ""
echo "=== Localiser Date.now() et Math.random() en dehors des hooks/effects ==="
grep -rn -E "Date\.now\(\)|Math\.random\(\)|new Date\(\)" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -30

echo ""
echo "=== Localiser tous les eslint-disable nexline ==="
grep -rn "eslint-disable-next-line" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== Date.now ou Math.random dans un .tsx render body (lignes qui ne sont pas dans useEffect/useCallback) ==="
python3 << 'PY'
import re, pathlib
for f in pathlib.Path("src").rglob("*.tsx"):
    text = f.read_text(errors="ignore")
    lines = text.splitlines()
    # Identifier useEffect blocks (approximativement)
    in_hook = False
    brace_depth = 0
    for i, line in enumerate(lines, 1):
        if re.search(r"=\s*use(Effect|Memo|Callback|State|Reducer)\(", line):
            in_hook = True
            brace_depth = 0
        if in_hook:
            brace_depth += line.count("{") - line.count("}")
            if brace_depth <= 0 and line.strip() in ("})", "})") or line.strip().endswith("})"):
                in_hook = False
                continue
            if in_hook and not line.strip().startswith("//"):
                continue
        # Check impure call in render body
        if re.search(r"\b(Date\.now\(\)|Math\.random\(\))", line) and "useState" not in line:
            print(f"  {f}:{i}: {line.strip()}")
PY
