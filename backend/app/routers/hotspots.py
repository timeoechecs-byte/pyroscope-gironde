"""
GET /api/v1/hotspots — Détections satellite NASA FIRMS via proxy backend.

🔒 PATTERN ARCHITECTURE_PROXY.md §2.1–§2.2 :
  - Backend détient la clé FIRMS (`Settings.firms_map_key`).
  - Liste blanche de capteurs ("sensor" est validé).
  - Cache Redis ``last_good`` fall-back quand NASA tombe.
  - Aucun secret loggé : jamais ``log.info("url", url=url)`` car la clé
    apparaît dans le path.

Endpoints exposés : ``GET /api/v1/hotspots``
"""

from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timezone
from io import StringIO

import httpx
from fastapi import APIRouter, HTTPException, Query
from redis.asyncio import Redis

from app.settings import BBOX_INGESTION, get_settings

logger = logging.getLogger("pyroscope.api.hotspots")
router = APIRouter(prefix="/api/v1/hotspots", tags=["hotspots"])

# ── Constantes métier ──────────────────────────────────────────────────
SENSORS = frozenset(
    {"VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"}
)
DEFAULT_TTL_SEC = 900  # 15 min — matches FIRMS useful refresh cadence
FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
TIMEOUT_S = 30


# ── Connector HTTP (ARCHITECTURE_PROXY.md §2.1) ────────────────────────
async def _fetch_firms_csv(
    sensor: str, bbox: tuple[float, float, float, float], days: int
) -> list[dict]:
    """Appel HTTP vers NASA FIRMS.

    ⚠️ L'URL contient la clé dans le path → JAMAIS ``log.info(url=...)``.
    """
    s = get_settings()
    key = s.require("firms_map_key")  # RuntimeError si absent
    w, so, e, n = bbox

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(f"{FIRMS_URL}/{key}/{sensor}/{w},{so},{e},{n}/{days}")

    if r.status_code != 200 or not r.text.lstrip().lower().startswith("country_id"):
        # On logge un extrait SANS l'URL (qui contient la clé).
        logger.error(
            "firms_invalid_response",
            sensor=sensor,
            status=r.status_code,
            excerpt=r.text[:120],
        )
        raise httpx.HTTPError("Réponse FIRMS invalide")

    return list(csv.DictReader(StringIO(r.text)))


# ── Cache helpers ───────────────────────────────────────────────────────
def _get_redis() -> Redis:
    s = get_settings()
    return Redis.from_url(s.REDIS_URL, decode_responses=True)


def _cache_key(sensor: str, bbox: tuple[float, float, float, float], days: int) -> str:
    return f"hotspots:{sensor}:{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}:{days}"


# ── Endpoint ────────────────────────────────────────────────────────────
@router.get("")
async def get_hotspots(
    days: int = Query(default=1, ge=1, le=7),
    sensor: str = Query(default="VIIRS_SNPP_NRT"),
    bbox: str = Query(
        default=f"{BBOX_INGESTION[0]},{BBOX_INGESTION[1]},{BBOX_INGESTION[2]},{BBOX_INGESTION[3]}",
        description="Bounding box: lon_min,lat_min,lon_max,lat_max",
    ),
):
    """Détections FIRMS via le proxy backend.

    - Capteur en liste blanche (``SENSORS``) : anti-SSRF.
    - Cache Redis ``TTL=15 min``.
    - Cache secondaire ``last_good`` sans expiration : si NASA tombe, on
      sert la dernière valeur connue avec ``quality="stale"``.
    - Mode dégradé explicite : jamais de valeur inventée.
    """
    if sensor not in SENSORS:
        raise HTTPException(status_code=400, detail=f"Capteur inconnu : {sensor}")

    try:
        parts = [float(x.strip()) for x in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError
        parsed_bbox = (parts[0], parts[1], parts[2], parts[3])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="bbox invalide (4 flottants)")

    cache_key = _cache_key(sensor, parsed_bbox, days)
    redis = _get_redis()

    # 1) Hit cache frais
    if cached := await redis.get(cache_key):
        payload = json.loads(cached)
        payload["cache"] = "hit"
        payload["quality"] = "fresh"
        return payload

    # 2) Sinon, fetch upstream. En cas d'échec, desservir ``last_good``.
    try:
        rows = await _fetch_firms_csv(sensor, parsed_bbox, days)
    except Exception as e:
        logger.warning("firms_fetch_failed", sensor=sensor, error=str(e))
        if stale := await redis.get(f"{cache_key}:last_good"):
            payload = json.loads(stale)
            payload["cache"] = "miss"
            payload["quality"] = "stale"
            return payload
        raise HTTPException(
            status_code=503, detail="Source FIRMS indisponible, pas de cache"
        )

    # 3) Normalisation réponse
    now = datetime.now(timezone.utc)
    hotspots = []
    for row in rows:
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            if not (44.15 <= lat <= 45.60 and -1.35 <= lon <= 0.35):
                # Filtre de sécurité : on ne renvoie pas les hotspots hors
                # BBOX_DEPARTEMENT même si FIRMS les inclut dans la requête.
                continue
            hotspots.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "acq_date": row["acq_date"],
                    "acq_time": int(row["acq_time"]),
                    "satellite": row.get("satellite", sensor),
                    "confidence": row.get("confidence", "low"),
                    "frp": round(float(row.get("frp", 0)), 2),
                    "daynight": row.get("daynight", "D"),
                    "bright_ti4": _safe_float(row.get("bright_ti4")),
                    "bright_ti5": _safe_float(row.get("bright_ti5")),
                }
            )
        except (KeyError, ValueError):
            continue

    hotspots.sort(key=lambda h: h["frp"], reverse=True)
    payload = {
        "count": len(hotspots),
        "hotspots": hotspots,
        "sensor": sensor,
        "bbox": list(parsed_bbox),
        "source": {"name": "firms", "quota_remaining": "unknown"},
    }
    body = json.dumps(payload)

    # 4) Persistance cache frais + cache permanent (last_good)
    await redis.setex(cache_key, DEFAULT_TTL_SEC, body)
    await redis.set(f"{cache_key}:last_good", body)  # sans TTL

    payload_out = dict(payload)
    payload_out["cache"] = "miss"
    payload_out["quality"] = "fresh"
    return payload_out


def _safe_float(value: str | None) -> float | None:
    """Parse un nombre FIRMS, retourne ``None`` si absent ou invalide."""
    if value is None or value == "":  # noqa: PLC0415
        return None
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None
