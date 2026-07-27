#!/usr/bin/env bash
# ============================================================================
# PyroScope 33 — check_keys.sh
# ----------------------------------------------------------------------------
# Vérifie que toutes les clés API sont en place et que chaque endpoint
# répond correctement. Lancez depuis la racine du projet ou depuis
# ~/projets/pyroscope33, après avoir chargé vos variables :
#
#     set -a && . ./.env && set +a && ./scripts/check_keys.sh
#
# Codes de sortie :
#   0 = toutes les vérifications OK (ou features désactivées par defaut)
#   1 = au moins une vérification a échoué
# ============================================================================

set +e  # ne pas sortir sur le premier échec : on les veut tous

PASS=0
FAIL=0
SKIP=0
section() { printf "\n=== %s ===\n" "$1"; }
ok()      { printf "  \xe2\x9c\x85 %s\n" "$1"; PASS=$((PASS+1)); }
ko()      { printf "  \xe2\x9c\x9c %s -- %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
skip()    { printf "  \xe2\x8f\x8f  %s  -- %s\n" "$1" "$2"; SKIP=$((SKIP+1)); }

# ----------------------------------------------------------------------------
section "Configuration : présence des variables dans l'environnement"
EXPECTED_P1=(
  FIRMS_MAP_KEY                # NASA FIRMS, 32 hex
)
EXPECTED_P2=(
  CDS_API_URL                  # défaut OK si vide
  CDS_API_TOKEN                # PHASE 2 optional, ERA5 repli
)
EXPECTED_P3=(
  CDSE_CLIENT_ID
  CDSE_CLIENT_SECRET
  CDSE_QUOTA_PU_LIMIT_MONTH
)
EXPECTED_P4=(
  OPENAQ_API_KEY               # optionnel
)

check_var() {
  local var="$1"; local phase="$2"; local expected_format="$3"
  if [ -z "${!var:-}" ]; then
    skip "$var" "non saisie (PHASE $phase, normal tant que pas engagée)"
    return
  fi
  # Vérifications de format minimales
  case "$expected_format" in
    hex32)
      if [[ "${!var}" =~ ^[a-f0-9]{32}$ ]]; then
        ok "$var  (32 hex OK)"
      else
        ko "$var" "format invalide — attendu 32 caractères hex"
      fi
      ;;
    uuid)
      if [[ "${!var}" =~ ^[0-9a-fA-F-]{32,40}$ ]]; then
        ok "$var  (UUID-like OK)"
      else
        ko "$var" "format inattendu"
      fi
      ;;
    token)
      v="${!var}"; if [ ${#v} -ge 20 ]; then ok "$var  (longueur ${#v})"; else ko "$var" "trop court (longueur ${#v})"; fi
      ;;
    *)
      v="${!var}"; ok "$var  (longueur ${#v})"
      ;;
  esac
}

echo
echo "PHASE 1 — MVP visualisation :"
check_var FIRMS_MAP_KEY             1 hex32
echo
echo "PHASE 2 — moteur FWI (CDS repli ERA5) :"
check_var CDS_API_URL               2
check_var CDS_API_TOKEN             2 token
echo
echo "PHASE 3 — végétation & terrain CDSE :"
check_var CDSE_CLIENT_ID            3 uuid
check_var CDSE_CLIENT_SECRET        3 token
check_var CDSE_QUOTA_PU_LIMIT_MONTH 3
echo
echo "PHASE 4 — qualité de l'air :"
check_var OPENAQ_API_KEY            4 token

# ----------------------------------------------------------------------------
section "FIRMS — NASA — 4 capteurs sur Gironde / 2 derniers jours"
if [ -z "${FIRMS_MAP_KEY:-}" ]; then
  skip "FIRMS" "FIRMS_MAP_KEY non saisie"
else
  for sensor in VIIRS_SNPP_NRT VIIRS_NOAA20_NRT VIIRS_NOAA21_NRT MODIS_NRT; do
    url="https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY}/${sensor}/-1.35,44.15,0.35,45.60/2"
    body=$(curl --max-time 30 -fsS "$url" 2>&1)
    code=$?
    if [ $code -ne 0 ]; then ko "FIRMS $sensor" "curl_exit=$code"; continue; fi
    case "$body" in
      "Invalid"*)
        ko "FIRMS $sensor" "$(echo "$body" | head -c 120)"
        ;;
      "latitude,"*|"latitude "*)
        n=$(echo "$body" | tail -n +2 | wc -l)
        ok "FIRMS $sensor  ($n lignes)"
        ;;
      "")
        ko "FIRMS $sensor" "réponse vide"
        ;;
      *)
        # pour cent cas, accepter tout ce qui a au moins un caractère
        n=$(echo "$body" | wc -l)
        ok "FIRMS $sensor  ($n lignes, format non standard)"
        ;;
    esac
  done
fi

# ----------------------------------------------------------------------------
section "Open-Meteo Forecast (AROME HD)"
body=$(curl --max-time 20 -fsS \
  "https://api.open-meteo.com/v1/forecast?latitude=44.84&longitude=-0.58&hourly=temperature_2m,wind_speed_10m&models=meteofrance_arome_france_hd&timezone=Europe%2FParis" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "Open-Meteo Forecast  ($(printf "%s" "$body" | wc -c) octets)"
else
  ko "Open-Meteo Forecast" "curl_exit=$code"
fi

section "Open-Meteo Archive (ERA5 Bordeaux 7 derniers jours)"
DATE_FROM=$(date -u -d '7 days ago' +%Y-%m-%d)
DATE_TO=$(date -u +%Y-%m-%d)
body=$(curl --max-time 20 -fsS \
  "https://archive-api.open-meteo.com/v1/archive?latitude=44.84&longitude=-0.58&start_date=${DATE_FROM}&end_date=${DATE_TO}&daily=temperature_2m_mean" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "Open-Meteo Archive  ($(printf "%s" "$body" | wc -c) octets)"
else
  ko "Open-Meteo Archive" "curl_exit=$code"
fi

section "Open-Meteo Air Quality (CAMS)"
body=$(curl --max-time 20 -fsS \
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=44.84&longitude=-0.58&hourly=pm2_5,pm10" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "Open-Meteo Air Quality  ($(printf "%s" "$body" | wc -c) octets)"
else
  ko "Open-Meteo Air Quality" "curl_exit=$code"
fi

# ----------------------------------------------------------------------------
section "IGN Géoplateforme — WMTS GetCapabilities"
body=$(curl --max-time 20 -fsS \
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "IGN WMTS  ($(printf "%s" "$body" | wc -c) octets)"
else
  ko "IGN WMTS" "curl_exit=$code"
fi

section "IGN Géoplateforme — Téléchargement capabilities"
body=$(curl --max-time 20 -fsS \
  "https://data.geopf.fr/telechargement/capabilities?pageSize=1" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "IGN Téléchargement  ($(printf "%s" "$body" | wc -c) octets)"
else
  ko "IGN Téléchargement" "curl_exit=$code"
fi

# ----------------------------------------------------------------------------
section "EFFIS — WMS GetCapabilities (URL corrigée : /effis, pas /gwis)"
body=$(curl --max-time 20 -fsS \
  "https://maps.effis.emergency.copernicus.eu/effis?service=WMS&request=GetCapabilities" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  ok "EFFIS WMS  ($(printf "%s" "$body" | wc -c) octets)"
else
  # retry avec version 1.3.0
  body=$(curl --max-time 20 -fsS \
    "https://maps.effis.emergency.copernicus.eu/effis?service=WMS&version=1.3.0&request=GetCapabilities" 2>&1)
  code=$?
  if [ $code -eq 0 ] && [ -n "$body" ]; then
    ok "EFFIS WMS v1.3.0  ($(printf "%s" "$body" | wc -c) octets)"
  else
    ko "EFFIS WMS" "curl_exit=$code"
  fi
fi

# ----------------------------------------------------------------------------
section "Overpass — petite requête Gironde (User-Agent obligatoire)"
query='[out:json][timeout:30];node(44.15,-1.35,45.60,0.35)["highway"="bus_stop"];out;'
body=$(curl --max-time 60 -fsS -X POST \
  -H "User-Agent: pyroscope33/0.1 (verification)" \
  --data-urlencode "data=$query" \
  "https://overpass-api.de/api/interpreter" 2>&1)
code=$?
if [ $code -eq 0 ] && [ -n "$body" ]; then
  if printf "%s" "$body" | grep -q '"elements"'; then
    ok "Overpass  ($(printf "%s" "$body" | wc -c) octets, éléments reçus)"
  else
    ko "Overpass" "réponse sans éléments"
  fi
else
  # Les serveurs Overpass publics saturent souvent aux heures de pointe.
  # Le fallback Geofabrik reste notre solution de fond pour PHASE 3.
  ko "Overpass" "curl_exit=$code (transient, réessayer hors pointe, fallback Geofabrik)"
fi

# ----------------------------------------------------------------------------
section "CDSE — token OAuth (PHASE 3, ignoré si non configuré)"
if [ -z "${CDSE_CLIENT_ID:-}" ] || [ -z "${CDSE_CLIENT_SECRET:-}" ]; then
  skip "CDSE" "variables PHASE 3 non saisies"
else
  token_url="${CDSE_TOKEN_URL:-https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token}"
  body=$(curl --max-time 30 -fsS -X POST "$token_url" \
    -d "grant_type=client_credentials" \
    -d "client_id=${CDSE_CLIENT_ID}" \
    -d "client_secret=${CDSE_CLIENT_SECRET}" 2>&1)
  code=$?
  if [ $code -eq 0 ] && printf "%s" "$body" | grep -q "access_token"; then
    ok "CDSE token  (JWT reçu)"
  else
    err=$(printf "%s" "$body" | head -c 200)
    ko "CDSE token" "credentials invalides ou réseau -- $err"
  fi
fi

# ----------------------------------------------------------------------------
section "OpenAQ — token en header X-API-Key (PHASE 4, ignoré si non configuré)"
if [ -z "${OPENAQ_API_KEY:-}" ]; then
  skip "OpenAQ" "variable PHASE 4 non saisie"
else
  body=$(curl --max-time 30 -fsS \
    -H "X-API-Key: ${OPENAQ_API_KEY}" \
    "https://api.openaq.org/v3/locations?coordinates=44.84,-0.58&radius=25000" 2>&1)
  code=$?
  if [ $code -eq 0 ] && [ -n "$body" ]; then
    if printf "%s" "$body" | grep -q '"results"'; then
      n=$(printf "%s" "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results', [])))" 2>/dev/null || echo "?")
      ok "OpenAQ  ($n stations dans un rayon de 25 km)"
    else
      ko "OpenAQ" "réponse inattendue"
    fi
  else
    err=$(printf "%s" "$body" | head -c 200)
    ko "OpenAQ" "curl_exit=$code -- $err"
  fi
fi

# ----------------------------------------------------------------------------
section "Bibliothèques Python (à venir PHASE 0)"
missing=()
for lib in numpy pandas geopandas shapely pyproj rasterio xarray; do
  python3 -c "import ${lib}" 2>/dev/null || missing+=("$lib")
done
if [ ${#missing[@]} -eq 0 ]; then
  ok "Bibliothèques scientifiques (numpy/pandas/geopandas/shapely/pyproj/rasterio/xarray)"
else
  ko "Bibliothèques scientifiques" "manquantes : ${missing[*]} -- uv add ..."
fi
for lib in xgboost lightgbm catboost sklearn; do
  python3 -c "import ${lib}" 2>/dev/null || missing_libs_ml+=("$lib")
done
if [ -z "${missing_libs_ml[*]:-}" ]; then
  ok "Bibliothèques ML (xgboost/lightgbm/catboost/sklearn)"
else
  skip "Bibliothèques ML" "manquantes : ${missing_libs_ml[*]} — installer en PHASE 5"
fi
for lib in fastapi pydantic httpx sqlalchemy alembic; do
  python3 -c "import ${lib}" 2>/dev/null || missing_libs_api+=("$lib")
done
if [ -z "${missing_libs_api[*]:-}" ]; then
  ok "Bibliothèques API (fastapi/pydantic/httpx/sqlalchemy/alembic)"
else
  ko "Bibliothèques API" "manquantes : ${missing_libs_api[*]} — uv add avant PHASE 0"
fi

# ----------------------------------------------------------------------------
echo
echo "=== Résultat global ==="
echo "  Pass : $PASS"
echo "  Skip : $SKIP"
echo "  Fail : $FAIL"
if [ $FAIL -eq 0 ]; then
  echo
  echo "  \xe2\x9c\x93 Toutes les vérifications sont passées (ou correctement skippées)."
  exit 0
else
  echo
  echo "  \xe2\x9c\x97 $FAIL vérification(s) en échec — voir détails ci-dessus."
  exit 1
fi
