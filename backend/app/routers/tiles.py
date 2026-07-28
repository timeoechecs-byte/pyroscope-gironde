"""
GET /api/v1/tiles/sentinel/{layer}/{z}/{x}/{y}.png — Proxy Sentinel-2.

🔒 PATTERN ARCHITECTURE_PROXY.md §3 :
  - Le navigateur appelle CE endpoint, pas Copernicus directement.
  - Token OAuth CDSE passé en en-tête ``Authorization: Bearer`` côté serveur.
  - JAMAIS en query string côté client (fuites via Referer, historique, logs).
  - Cache disque/Redis ``max-age=86400`` (les images Sentinel changent 1×/j).
  - 403 net si CDSE non configuré ; 502 si Copernicus tombe ; jamais de
    tuile inventée.

Endpoints exposés : ``GET /api/v1/tiles/sentinel/{layer}/{z}/{x}/{y}.png``
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Response

from app.settings import get_settings

logger = logging.getLogger("pyroscope.api.tiles")
router = APIRouter(prefix="/api/v1/tiles", tags=["tiles"])

# ── Constantes ──────────────────────────────────────────────────────────
ALLOWED_LAYERS: frozenset[Literal] = frozenset({"NDVI", "NDMI", "TRUE_COLOR", "NDWI"})
MAX_ZOOM = 14
TILE_PX = 256
CACHE_TTL_S = 86_400  # 24 h — les images Sentinel changent 1×/jour

# ── Token cache (ARCHITECTURE_PROXY.md §3) ──────────────────────────
_token_lock = asyncio.Lock()
_token: str | None = None
_token_expiry: float = 0.0


async def _get_cdse_token() -> str:
    """OAuth client_credentials CDSE. Cache mémoire, renouvelé 60s avant expiration."""
    global _token, _token_expiry
    async with _token_lock:
        if _token and time.time() < _token_expiry - 60:
            return _token

        s = get_settings()
        try:
            cid = s.require("cdse_client_id")
            csec = s.require("cdse_client_secret")
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))

        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                s.cdse_token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": cid,
                    "client_secret": csec,
                },
            )
        if r.status_code != 200:
            logger.error("cdse_token_failed", status=r.status_code, excerpt=r.text[:120])
            raise HTTPException(status_code=502, detail="CDSE token indisponible")
        data = r.json()
        _token = data["access_token"]
        _token_expiry = time.time() + data.get("expires_in", 3600)
        return _token


def _tile_bbox_3857(z: int, x: int, y: int) -> str:
    """Calcule la bbox Web Mercator d'une tuile z/x/y."""
    import math

    n = 2.0**z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return f"{lon_min},{lat_min},{lon_max},{lat_max}"


# ── Endpoint tuile Sentinel ────────────────────────────────────────────
@router.get("/sentinel/{layer}/{z}/{x}/{y}.png")
async def sentinel_tile(layer: str, z: int, x: int, y: int):
    """Proxy tuile Sentinel-2 WMS vers CDSE.

    Le token CDSE reste serveur (jamais transmis au navigateur).
    """
    if layer not in ALLOWED_LAYERS:
        raise HTTPException(status_code=400, detail=f"Couche inconnue : {layer}")
    if not 0 <= z <= MAX_ZOOM:
        raise HTTPException(status_code=400, detail=f"Zoom hors limites (max {MAX_ZOOM})")

    token = await _get_cdse_token()
    s = get_settings()

    bbox = _tile_bbox_3857(z, x, y)
    wms_params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "LAYERS": layer,
        "CRS": "EPSG:3857",
        "BBOX": bbox,
        "WIDTH": str(TILE_PX),
        "HEIGHT": str(TILE_PX),
    }

    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{s.cdse_base_url}/ogc/wms/sentinel-2-l2a",
                params=wms_params,
                headers={"Authorization": f"Bearer {token}"},  # ← JAMAIS en URL
            )
        if r.status_code != 200 or not r.content:
            logger.error(
                "sentinel_tile_failed",
                layer=layer,
                z=z, x=x, y=y,
                status=r.status_code,
            )
            raise HTTPException(status_code=502, detail="Sentinel indisponible")
        return Response(
            content=r.content,
            media_type="image/png",
            headers={
                "Cache-Control": f"public, max-age={CACHE_TTL_S}",
                "X-Pyroscope-Layer": layer,
                "X-Pyroscope-Cache": "miss",
            },
        )
    except httpx.HTTPError as e:
        logger.warning("sentinel_tile_http_error", error=str(e))
        raise HTTPException(status_code=502, detail="Sentinel indisponible")
