# Architecture proxy cible — Gestion sécurisée des clés API

> **Statut au 2026-07-28** : cible architecturale, **pas implémentée**.
> Le backend FastAPI / Redis décrit ci-dessous n'existe pas dans ce dépôt
> Freebuff. Le frontend actuel fonctionne en mode dégradé compatible avec
> cette cible : direct-fetch des API publiques (FIRMS, OpenAQ, Open-Meteo),
> secret OAuth2 CDSE lu côté serveur Convex, et tuiles Sentinel marquées
> stop-gap (cf. `src/lib/sentinel.ts`).
>
> **Implémenter cette cible exige** : (a) trancher l'architecture (FastAPI ?
> Convex HTTP actions ? Functions serverless ?), (b) déployer le backend
> quelque part, (c) écrire les fichiers Python / TS correspondants, (d)
> activer CI avec les hooks gitleaks / detect-secrets. Tant que ces quatre
> préalables ne sont pas acquis, ce document reste une référence de design
> — non une description de l'état réel.

---

## Le principe en une phrase

**Une clé API ne franchit jamais la frontière du serveur.**

Tout ce qui arrive dans le navigateur est public : bundle JavaScript, variables `VITE_*`, `localStorage`, en-têtes de requête, URL. Il n'existe aucune technique d'obfuscation, de chiffrement côté client ou de « clé masquée » qui change cela. La seule question qui vaille est donc : *où se trouve la frontière ?*

```
┌─────────────┐                    ┌──────────────────┐              ┌──────────────┐
│  Navigateur │ ── GET /api/... ──►│  Backend FastAPI │ ── clé ────► │ NASA / CDSE  │
│  AUCUN      │                    │  détient les     │              │ IGN / OpenAQ │
│  secret     │◄── GeoJSON ────────│  secrets + cache │◄─────────────│              │
└─────────────┘                    └──────────────────┘              └──────────────┘
```

Cette architecture apporte trois bénéfices d'un coup :
1. **la clé n'est jamais exposée** ;
2. **le quota est protégé** — 100 visiteurs simultanés déclenchent 1 appel externe, pas 100 ;
3. **tu contrôles le format** — tu peux normaliser, filtrer hors périmètre, ajouter les drapeaux de qualité.

---

## Niveau 1 — Les secrets dans le backend

### 1.1 Configuration typée avec `pydantic-settings`

`backend/app/settings.py` :

```python
from functools import lru_cache
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Secrets ────────────────────────────────────────────────
    # SecretStr empêche la valeur d'apparaître dans un repr(),
    # un log structuré ou une trace d'exception.
    firms_map_key: SecretStr
    openaq_api_key: SecretStr | None = None
    cdse_client_id: SecretStr | None = None
    cdse_client_secret: SecretStr | None = None
    cds_api_token: SecretStr | None = None

    # ── Configuration publique (pas des secrets) ───────────────
    cdse_token_url: str = (
        "https://identity.dataspace.copernicus.eu"
        "/auth/realms/CDSE/protocol/openid-connect/token"
    )
    cdse_base_url: str = "https://sh.dataspace.copernicus.eu"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    bbox_ingestion: tuple[float, float, float, float] = (-1.70, 43.80, 0.95, 45.95)

    # ── Garde-fou de démarrage ─────────────────────────────────
    def require(self, name: str) -> str:
        value: SecretStr | None = getattr(self, name)
        if value is None or not value.get_secret_value().strip():
            raise RuntimeError(
                f"Secret manquant : {name.upper()}. "
                f"Définis-le dans .env ou dans l'environnement."
            )
        return value.get_secret_value()


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Deux points qui comptent :

- **`SecretStr`** : `print(settings)` affichera `SecretStr('**********')`. C'est ce qui empêche une clé de fuir dans Sentry, dans un log JSON ou dans une page d'erreur FastAPI en mode debug — un vecteur de fuite au moins aussi fréquent que le commit accidentel.
- **`require()`** : l'application refuse de démarrer si un secret nécessaire manque, plutôt que d'échouer silencieusement au premier appel et de renvoyer une carte vide.

### 1.2 Interdire structurellement la fuite côté client

Ajoute un test qui échoue si un secret réapparaît dans le frontend :

`backend/tests/test_no_secrets_in_frontend.py`

```python
import re
from pathlib import Path

FRONTEND = Path(__file__).parents[2] / "src"

# Motifs de secrets, pas de valeurs réelles
PATTERNS = [
    re.compile(r"[a-f0-9]{32}"),                       # clé FIRMS
    re.compile(r"[a-f0-9]{64}"),                       # clé OpenAQ
    re.compile(r"sh-[0-9a-f-]{36}"),                   # client id CDSE
    re.compile(r"VITE_\w*(KEY|SECRET|TOKEN|PASSWORD)"), # variable exposée
]


def test_frontend_contient_aucun_secret():
    coupables = []
    for f in FRONTEND.rglob("*.ts*"):
        texte = f.read_text(encoding="utf-8", errors="ignore")
        for p in PATTERNS:
            if p.search(texte):
                coupables.append(f"{f.relative_to(FRONTEND)} — motif {p.pattern}")
    assert not coupables, "Secret potentiel dans le frontend :\n" + "\n".join(coupables)
```

Ce test dans la CI est ce qui empêche la situation de se reproduire dans six mois, quand tu auras oublié la règle.

---

## Niveau 2 — Le proxy backend

### 2.1 Client FIRMS côté serveur

`backend/app/sources/firms.py` :

```python
import httpx
import structlog
from io import StringIO
import csv
from tenacity import retry, stop_after_attempt, wait_exponential

from app.settings import get_settings

log = structlog.get_logger()
BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


class FirmsError(RuntimeError):
    pass


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def fetch_hotspots(sensor: str, days: int = 1) -> list[dict]:
    s = get_settings()
    key = s.require("firms_map_key")
    w, so, e, n = s.bbox_ingestion
    url = f"{BASE}/{key}/{sensor}/{w},{so},{e},{n}/{days}"

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)

    # FIRMS renvoie ses erreurs en HTTP 200 avec du texte brut.
    if r.status_code != 200 or not r.text.lstrip().lower().startswith("country_id,latitude"):
        # On journalise SANS la clé : jamais log(url)
        log.error("firms_reponse_inattendue", sensor=sensor, status=r.status_code,
                  extrait=r.text[:120])
        raise FirmsError("Réponse FIRMS invalide")

    return list(csv.DictReader(StringIO(r.text)))
```

⚠️ **Ne journalise jamais l'URL.** Ici la clé est dans le chemin : un `log.info("appel", url=url)` la recopie dans tous tes logs, qui sont souvent moins bien protégés que ton `.env`.

### 2.2 Endpoint public, avec cache

`backend/app/routers/hotspots.py` :

```python
import json
from fastapi import APIRouter, Query, HTTPException
from redis.asyncio import Redis

from app.settings import get_settings
from app.sources.firms import fetch_hotspots, FirmsError

router = APIRouter(prefix="/api/v1/hotspots", tags=["hotspots"])
SENSORS = {"VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"}
TTL = 900  # 15 min — cadence réelle de rafraîchissement utile


@router.get("")
async def get_hotspots(
    days: int = Query(1, ge=1, le=7),
    sensor: str = Query("VIIRS_SNPP_NRT"),
):
    if sensor not in SENSORS:          # jamais de paramètre libre vers l'amont
        raise HTTPException(400, "Capteur inconnu")

    redis = Redis.from_url(get_settings().redis_url)
    cache_key = f"hotspots:{sensor}:{days}"

    if cached := await redis.get(cache_key):
        payload = json.loads(cached)
        payload["cache"] = "hit"
        return payload

    try:
        rows = await fetch_hotspots(sensor, days)
    except FirmsError:
        # Mode dégradé : on sert la dernière valeur connue plutôt que de tomber
        if stale := await redis.get(f"{cache_key}:last_good"):
            payload = json.loads(stale)
            payload["quality"] = "stale"
            return payload
        raise HTTPException(503, "Source FIRMS indisponible")

    payload = {"count": len(rows), "hotspots": rows, "quality": "fresh", "cache": "miss"}
    body = json.dumps(payload)
    await redis.setex(cache_key, TTL, body)
    await redis.set(f"{cache_key}:last_good", body)  # sans expiration
    return payload
```

Trois choses valent d'être notées :
- **Liste blanche de capteurs.** Ne construis jamais une URL amont à partir d'un paramètre utilisateur libre : ce serait une SSRF.
- **`last_good` sans expiration.** Quand la NASA tombe, ton app affiche la dernière donnée connue avec `quality: "stale"` plutôt qu'un écran vide.
- **Le cache protège ton quota**, qui devient un non-sujet même en pic de trafic.

### 2.3 Le frontend, désormais trivial

```typescript
// src/lib/api.ts — plus aucun secret
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function fetchHotspots(days = 1, sensor = "VIIRS_SNPP_NRT") {
  const r = await fetch(`${API}/api/v1/hotspots?days=${days}&sensor=${sensor}`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
```

`VITE_API_URL` est publique par nature — c'est l'adresse de ton propre service. C'est le **seul** usage légitime du préfixe `VITE_`.

Supprime `src/config/api-keys.ts`, et purge aussi `localStorage` chez les utilisateurs qui ont déjà chargé l'ancienne version. La migration correspondante (`src/lib/migrations/v1-purge-stale-secrets.ts`) est déjà en place depuis l'audit du 2026-07-28 — elle sera redondante une fois ce proxy déployé, et pourra être supprimée à ce moment-là.

---

## Niveau 3 — Le cas difficile : les tuiles Sentinel

C'est le vrai piège du projet, et celui qui a probablement motivé le contournement.

MapLibre a besoin d'une URL de tuile qu'il appelle **directement depuis le navigateur**. Le flux actuel (`src/lib/sentinel.ts`) place le token CDSE dans l'URL WMS. Même si ce token expire en une heure, il fuite par l'historique de navigation, l'en-tête `Referer`, les logs de proxy et les outils de développement — et pendant une heure, n'importe qui peut consommer tes unités de traitement Copernicus.

**La solution : proxifier les tuiles.**

`backend/app/routers/tiles.py` :

```python
import time
import httpx
from fastapi import APIRouter, HTTPException, Response

from app.settings import get_settings

router = APIRouter(prefix="/api/v1/tiles", tags=["tiles"])
ALLOWED_LAYERS = {"NDVI", "NDMI", "TRUE_COLOR", "NDWI"}

_token: str | None = None
_expiry: float = 0.0


async def _get_cdse_token() -> str:
    """Token OAuth CDSE, mis en cache et renouvelé 60 s avant expiration."""
    global _token, _expiry
    if _token and time.time() < _expiry - 60:
        return _token

    s = get_settings()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(s.cdse_token_url, data={
            "grant_type": "client_credentials",
            "client_id": s.require("cdse_client_id"),
            "client_secret": s.require("cdse_client_secret"),
        })
    r.raise_for_status()
    data = r.json()
    _token = data["access_token"]
    _expiry = time.time() + data.get("expires_in", 3600)
    return _token


@router.get("/sentinel/{layer}/{z}/{x}/{y}.png")
async def sentinel_tile(layer: str, z: int, x: int, y: int):
    if layer not in ALLOWED_LAYERS:
        raise HTTPException(400, "Couche inconnue")
    if not 0 <= z <= 14:                    # borne le coût : pas de zoom infini
        raise HTTPException(400, "Zoom hors limites")

    token = await _get_cdse_token()
    s = get_settings()

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{s.cdse_base_url}/ogc/wms/sentinel-2-l2a",
            params={
                "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
                "FORMAT": "image/png", "TRANSPARENT": "true",
                "LAYERS": layer, "CRS": "EPSG:3857",
                "BBOX": _tile_bbox_3857(z, x, y),
                "WIDTH": 256, "HEIGHT": 256,
            },
            headers={"Authorization": f"Bearer {token}"},  # jamais dans l'URL
        )
    if r.status_code != 200:
        raise HTTPException(502, "Source Sentinel indisponible")

    return Response(
        content=r.content,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},  # imagerie quotidienne
    )
```

Côté MapLibre :

```typescript
map.addSource("sentinel-ndmi", {
  type: "raster",
  tiles: [`${API}/api/v1/tiles/sentinel/NDMI/{z}/{x}/{y}.png`],
  tileSize: 256,
});
```

Le token est passé en **en-tête `Authorization`**, jamais en paramètre d'URL. Et comme les tuiles Sentinel changent une fois par jour au mieux, un cache disque ou Redis d'une journée réduit drastiquement ta consommation d'unités de traitement Copernicus.

---

## Niveau 4 — Protéger ton propre proxy

Un proxy ouvert est une clé publique avec une étape de plus. Ajoute une limitation de débit :

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.get("")
@limiter.limit("60/minute")
async def get_hotspots(...):
    ...
```

Et pour les endpoints coûteux — tuiles Sentinel, simulation — descends à `10/minute`. Complète par un CORS strict :

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ton-domaine.fr", "http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

⚠️ **Le CORS n'est pas une mesure de sécurité** — il protège le navigateur, pas ton serveur ; `curl` l'ignore complètement. La vraie protection, c'est la limitation de débit et le cache.

---

## Niveau 5 — Où vivent les secrets selon l'environnement

| Environnement | Support | Remarque |
|---|---|---|
| **Développement local** | fichier `.env`, `chmod 600`, dans `.gitignore` | jamais commité, jamais partagé par messagerie |
| **Docker Compose** | `env_file:` ou `secrets:` | ⚠️ n'utilise **jamais** `ARG`/`ENV` dans un Dockerfile : la valeur reste dans les couches de l'image |
| **VPS simple** | variables d'environnement systemd (`EnvironmentFile=`), fichier en `0600` root | le plus simple et suffisant pour ce projet |
| **Kubernetes** | `Secret` monté en volume + chiffrement au repos | surdimensionné ici |
| **Cloud managé** | AWS Secrets Manager, GCP Secret Manager, Infisical, Doppler | intéressant surtout pour la rotation automatique |

Docker Compose avec de vrais secrets :

```yaml
services:
  api:
    build: ./backend
    secrets: [firms_key, cdse_secret]
    environment:
      FIRMS_MAP_KEY_FILE: /run/secrets/firms_key
      CDSE_CLIENT_SECRET_FILE: /run/secrets/cdse_secret

secrets:
  firms_key:
    file: ./secrets/firms_key.txt      # dans .gitignore
  cdse_secret:
    file: ./secrets/cdse_secret.txt
```

Le suffixe `_FILE` est une convention répandue : ton code lit le contenu du fichier plutôt que la variable, ce qui évite que le secret apparaisse dans `docker inspect` ou dans `/proc/<pid>/environ`.

---

## Niveau 6 — Empêcher la récidive

### 6.1 Détection automatique avant chaque commit

```bash
pip install pre-commit detect-secrets
```

`.pre-commit-config.yaml` :

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks: [{ id: gitleaks }]

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ["--baseline", ".secrets.baseline"]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: detect-private-key
      - id: check-added-large-files
```

```bash
detect-secrets scan > .secrets.baseline
pre-commit install
```

Ajoute aussi **GitHub Secret Scanning + Push Protection** dans les réglages du dépôt : GitHub refusera alors le push d'un commit contenant une clé reconnue. C'est gratuit et c'est le filet de sécurité le plus efficace.

### 6.2 `.gitignore` complet

Un `.gitignore` minimaliste ignore `.env.local` mais oublie souvent `.env`,
`.env.*` non exemptés, les clés `*.pem`, le fichier `.cdsapirc` propre au
client Copernicus, ou le dossier `secrets/` quand le backend utilise
Docker Compose `secrets:`. La version appliquée à ce dépôt le 2026-07-28
couvre tout cela (cf. `.gitignore` à la racine).

### 6.3 Rotation

Prévois de régénérer les clés tous les six mois, et systématiquement après un incident. L'architecture ci-dessus rend l'opération indolore : tu changes une valeur dans `.env`, tu redémarres le conteneur, rien d'autre ne bouge. C'est précisément l'inverse d'une clé compilée dans un bundle, où la rotation impose un redéploiement complet du frontend — et où les utilisateurs gardent l'ancienne version en cache.

---

## Et si tu n'as pas de backend ?

Si un jour tu veux héberger le frontend seul (Netlify, GitHub Pages, Cloudflare Pages), la réponse n'est pas d'embarquer la clé, mais d'ajouter une **fonction serverless** de quelques lignes :

```javascript
// netlify/functions/hotspots.js
export default async (req) => {
  const key = Netlify.env.get("FIRMS_MAP_KEY");   // secret côté plateforme
  const bbox = "-1.70,43.80,0.95,45.95";
  const r = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${bbox}/1`
  );
  return new Response(await r.text(), {
    headers: { "content-type": "text/csv", "cache-control": "public, max-age=900" },
  });
};
```

Même principe, coût nul, dix lignes. **Il n'existe aucune situation où embarquer une clé dans un frontend est la bonne réponse.**

---

## Checklist de la cible

**Aujourd'hui (déjà fait, 2026-07-28)**
- [x] quatre clés révoquées et régénérées — *action utilisateur requise, voir [SECURITY.md](./SECURITY.md) §Procédure de rotation*
- [x] `src/config/api-keys.ts` purgé des secrets en clair — *ne contient plus que des getters env-only*
- [x] `.gitignore` complété
- [x] migration `v1-purge-stale-secrets` en place pour purger les anciens secrets côté navigateur
- [x] action Convex `cdse.getToken` lisant le secret exclusivement depuis `process.env`

**Cette semaine (à faire)**
- [ ] trancher FastAPI vs Convex vs serverless (réponse à l'urgence 3 de l'audit)
- [ ] `backend/app/settings.py` avec `SecretStr` et garde-fou de démarrage
- [ ] proxy FIRMS avec cache Redis et `last_good` fallback
- [ ] `src/lib/api.ts` avec `VITE_API_URL` et remplacement des direct-fetch
- [ ] test CI « aucun secret dans le frontend » (cf. §1.2)
- [ ] `pre-commit` avec gitleaks + Push Protection GitHub

**Avant la phase 3 (Copernicus Sentinel-2)**
- [ ] proxy de tuiles Sentinel, token en en-tête `Authorization`, cache 24 h
- [ ] limitation de débit sur tous les endpoints, renforcée sur les coûteux
- [ ] CORS restreint aux origines connues
- [ ] suppression du `🛑 STOP-GAP` dans `src/lib/sentinel.ts` une fois le proxy en place

---

**La règle à retenir :** si la question « comment sécuriser une clé dans le frontend ? » se pose, c'est que la clé est au mauvais endroit. Il n'y a pas de réponse à cette question — seulement une réponse à celle d'à côté : *comment faire pour que le frontend n'ait pas besoin de clé du tout ?*
