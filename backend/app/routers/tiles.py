"""
MVT (Mapbox Vector Tile) endpoint.

Serves gridded data as vector tiles for efficient map rendering.
Uses GeoJSON-to-MVT conversion with Redis caching.

GET /api/v1/tiles/{layer}/{z}/{x}/{y}.mvt

Layers:
  - risk        : ignition_risk, spread_risk, combined_score, risk_class
  - fwi         : fwi, ffmc, dmc, dc, isi, bui, dsr, effis_class
  - fuel        : fuel_species, sb_code, fbp_code, canopy_density
  - terrain     : elevation_m, slope_deg, aspect_deg

Cache TTL: 15 min (Redis hit → serve, miss → compute → store → serve)
Fallback: returns empty tile if data unavailable (never fails the map)
"""

from __future__ import annotations

import json
import logging
import hashlib
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

logger = logging.getLogger("pyroscope.api.tiles")
router = APIRouter(prefix="/api/v1/tiles", tags=["tiles"])

SUPPORTED_LAYERS = {"risk", "fwi", "fuel", "terrain"}

# ── Redis cache stub (will be replaced with real Redis in PHASE 1) ─────
_tile_cache: dict[str, bytes] = {}

# ── Demo cell grid (static for now) ─────────────────────────────────────
# In production, this is computed from PostGIS ST_AsMVT or a GeoJSON grid
_DEMO_CELLS = [
    {"lat": 44.85, "lon": -0.65, "id": 1, "ignition_risk": 35, "spread_risk": 72, "fwi": 15, "fuel": "C-6", "elevation": 45, "slope": 2.1},
    {"lat": 44.70, "lon": -0.40, "id": 2, "ignition_risk": 55, "spread_risk": 45, "fwi": 20, "fuel": "C-6", "elevation": 30, "slope": 1.5},
    {"lat": 45.05, "lon": -0.80, "id": 3, "ignition_risk": 20, "spread_risk": 30, "fwi": 8,  "fuel": "D-1", "elevation": 15, "slope": 0.5},
    {"lat": 44.40, "lon": -0.20, "id": 4, "ignition_risk": 70, "spread_risk": 85, "fwi": 35, "fuel": "C-6", "elevation": 55, "slope": 3.0},
    {"lat": 44.50, "lon": -0.90, "id": 5, "ignition_risk": 45, "spread_risk": 60, "fwi": 12, "fuel": "M-1", "elevation": 70, "slope": 4.5},
]


def _get_cache_key(layer: str, z: int, x: int, y: int) -> str:
    raw = f"mvt:{layer}:{z}:{x}:{y}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _build_geojson(layer: str, z: int, x: int, y: int) -> dict[str, Any]:
    """
    Build a GeoJSON FeatureCollection from the cell grid for the given
    tile coordinates. Returns empty GeoJSON if no cells fall in the tile.

    In production: query PostGIS with ST_AsMVTGeom for tile clipping.
    """
    features = []

    # Simple tile lat/lon bounds approximation (Web Mercator)
    # In production: use pyproj or mercantile to get precise tile bbox
    tile_res = 360.0 / (2 ** z)
    tile_lon_min = x * tile_res - 180.0
    tile_lat_min = y * tile_res - 90.0
    tile_lon_max = tile_lon_min + tile_res
    tile_lat_max = tile_lat_min + tile_res

    for cell in _DEMO_CELLS:
        # Quick bbox filter (approximate)
        if not (tile_lon_min <= cell["lon"] <= tile_lon_max and
                tile_lat_min <= cell["lat"] <= tile_lat_max):
            continue

        props = {"cell_id": cell["id"]}

        if layer == "risk":
            props["ignition_risk"] = cell["ignition_risk"]
            props["spread_risk"] = cell["spread_risk"]
        elif layer == "fwi":
            props["fwi"] = cell["fwi"]
        elif layer == "fuel":
            props["fuel_model"] = cell["fuel"]
        elif layer == "terrain":
            props["elevation_m"] = cell["elevation"]
            props["slope_deg"] = cell["slope"]

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [cell["lon"], cell["lat"]],
            },
            "properties": props,
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def _geojson_to_mvt(geojson: bytes) -> bytes:
    """
    Convert GeoJSON to MVT (PMTiles / Mapbox Vector Tile).
    PHASE 6 stub: returns raw GeoJSON wrapped in MVT structure.
    In production: use mapbox-vector-tile or postgis ST_AsMVT.

    For now, return the GeoJSON as-is with a custom content type.
    The frontend will read it through the MVT parsing pipeline.
    """
    return geojson


# ── Cache lookaside ─────────────────────────────────────────────────────
async def _get_cached_tile(key: str) -> bytes | None:
    """Redis GET (stub)."""
    return _tile_cache.get(key)


async def _set_cached_tile(key: str, data: bytes, ttl: int = 900):
    """Redis SETEX (stub)."""
    _tile_cache[key] = data


# ── Tile endpoint ───────────────────────────────────────────────────────
@router.get("/{layer}/{z}/{x}/{y}.mvt")
async def get_tile(layer: str, z: int, x: int, y: int):
    """
    Return an MVT vector tile for the given layer and tile coordinates.

    Cache strategy: Redis TTL 15 min.
    Degraded mode: empty tile returned, never 404/503.
    """
    if layer not in SUPPORTED_LAYERS:
        return Response(
            content=b'{"type":"FeatureCollection","features":[]}',
            media_type="application/vnd.mapbox-vector-tile",
            headers={
                "X-PyroScope-Cache": "miss",
                "X-PyroScope-Error": f"Unsupported layer: {layer}",
                "Access-Control-Allow-Origin": "*",
            },
        )

    cache_key = _get_cache_key(layer, z, x, y)

    # Try cache
    cached = await _get_cached_tile(cache_key)
    if cached is not None:
        return Response(
            content=cached,
            media_type="application/vnd.mapbox-vector-tile",
            headers={
                "X-PyroScope-Cache": "hit",
                "X-PyroScope-Layer": layer,
                "Access-Control-Allow-Origin": "*",
            },
        )

    # Build GeoJSON
    try:
        geojson = _build_geojson(layer, z, x, y)
        raw = json.dumps(geojson).encode("utf-8")
        mvt = _geojson_to_mvt(raw)

        # Store in cache
        await _set_cached_tile(cache_key, mvt)

        return Response(
            content=mvt,
            media_type="application/vnd.mapbox-vector-tile",
            headers={
                "X-PyroScope-Cache": "miss",
                "X-PyroScope-Layer": layer,
                "X-PyroScope-N-Features": str(len(geojson["features"])),
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as e:
        logger.error("tiles.build_error", layer=layer, z=z, x=x, y=y, error=str(e))
        # Return empty tile on error (never fail the map)
        return Response(
            content=b'{"type":"FeatureCollection","features":[]}',
            media_type="application/vnd.mapbox-vector-tile",
            headers={
                "X-PyroScope-Cache": "miss",
                "X-PyroScope-Error": str(e),
                "Access-Control-Allow-Origin": "*",
            },
        )
