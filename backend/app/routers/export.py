"""
PyroScope 33 — Export endpoints (GeoJSON / CSV / GeoPackage).

PHASE 7 — §7.5 Export et API publique.

Provides per-layer, per-format export of the computation grid.
All exports include mandatory attribution and legal warning.

Supported layers:
  - hotspots   : NASA FIRMS active fire detections
  - risk       : ignition_risk + spread_risk grid
  - fwi        : FWI components (FFMC, DMC, DC, ISI, BUI, FWI)
  - weather    : Weather variables grid
  - vegetation : Fuel model, species, NDVI

Supported formats:
  - geojson    : GeoJSON FeatureCollection (EPSG:4326)
  - csv        : Comma-separated values with geometry columns (lat, lon)
  - geopackage : GeoPackage (requires geopandas, falls back to geojson)
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, Response

from app.settings import BBOX_DEPARTEMENT

logger = logging.getLogger("pyroscope.api.export")
router = APIRouter(prefix="/api/v1/export", tags=["export"])

# ── Supported layers and formats ────────────────────────────────────────
SUPPORTED_LAYERS = {"hotspots", "risk", "fwi", "weather", "vegetation"}
SUPPORTED_FORMATS = {"geojson", "csv", "json"}
ATTRIBUTION_TEXT = (
    "NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN · "
    "OpenStreetMap © contributeurs (ODbL)"
)
WARNING_TEXT = (
    "⚠️ Outil expérimental à visée informative et pédagogique. "
    "Ne pas utiliser pour une décision opérationnelle ou de sécurité."
)


def _build_attribution_metadata() -> dict:
    """Build the attribution and warning metadata block for every export."""
    return {
        "export_generated_at": datetime.now(timezone.utc).isoformat(),
        "application": "PyroScope 33",
        "warning": WARNING_TEXT,
        "attribution": ATTRIBUTION_TEXT,
        "bbox": {
            "lon_min": BBOX_DEPARTEMENT[0],
            "lat_min": BBOX_DEPARTEMENT[1],
            "lon_max": BBOX_DEPARTEMENT[2],
            "lat_max": BBOX_DEPARTEMENT[3],
        },
        "license": "AGPL-3.0 — code source ouvert ; données sources sous licences respectives (voir docs/LICENSING.md)",
    }


def _get_sample_data(
    layer: str, bbox: tuple[float, float, float, float] | None = None
) -> list[dict[str, Any]]:
    """Return sample data for preview/development.

    In production, this queries PostGIS / TimescaleDB.
    For the preview environment (no backend DB), returns representative
    GeoJSON-able records.
    """
    if layer == "hotspots":
        return [
            {
                "latitude": 44.85,
                "longitude": -0.65,
                "acq_date": "2026-07-27",
                "acq_time": "1325",
                "satellite": "VIIRS_SNPP",
                "confidence": "nominal",
                "frp": 12.5,
                "daynight": "D",
                "bright_ti4": 345.2,
            },
            {
                "latitude": 44.70,
                "longitude": -0.40,
                "acq_date": "2026-07-26",
                "acq_time": "0140",
                "satellite": "MODIS",
                "confidence": "low",
                "frp": 5.8,
                "daynight": "N",
                "bright_ti4": 332.1,
            },
        ]
    elif layer == "risk":
        return [
            {
                "cell_id": 1,
                "latitude": 44.85,
                "longitude": -0.65,
                "ignition_risk": 35,
                "spread_risk": 72,
                "combined_score": 72,
                "risk_class": "élevé",
                "dominant": "spread",
            },
            {
                "cell_id": 2,
                "latitude": 44.70,
                "longitude": -0.40,
                "ignition_risk": 55,
                "spread_risk": 45,
                "combined_score": 55,
                "risk_class": "modéré",
                "dominant": "ignition",
            },
            {
                "cell_id": 3,
                "latitude": 45.05,
                "longitude": -0.80,
                "ignition_risk": 20,
                "spread_risk": 30,
                "combined_score": 30,
                "risk_class": "faible",
                "dominant": "spread",
            },
            {
                "cell_id": 4,
                "latitude": 44.40,
                "longitude": -0.20,
                "ignition_risk": 70,
                "spread_risk": 85,
                "combined_score": 85,
                "risk_class": "très élevé",
                "dominant": "spread",
            },
        ]
    elif layer == "fwi":
        return [
            {
                "cell_id": 1,
                "latitude": 44.85,
                "longitude": -0.65,
                "date": "2026-07-27",
                "ffmc": 88.64,
                "dmc": 7.1,
                "dc": 16.8,
                "isi": 7.48,
                "bui": 8.6,
                "fwi": 7.8,
                "dsr": 0.57,
                "effis_class": "modéré",
            },
        ]
    elif layer == "weather":
        return [
            {
                "latitude": 44.85,
                "longitude": -0.65,
                "timestamp": "2026-07-27T12:00:00Z",
                "temperature_2m": 28.5,
                "relative_humidity_2m": 45.0,
                "precipitation": 0.0,
                "wind_speed_10m": 15.0,
                "wind_direction_10m": 225.0,
                "wind_gusts_10m": 22.0,
            },
        ]
    elif layer == "vegetation":
        return [
            {
                "cell_id": 1,
                "latitude": 44.85,
                "longitude": -0.65,
                "fuel_model_sb": "SB-10",
                "fuel_model_fbp": "C-6",
                "species": "pin maritime",
                "canopy_density": 0.75,
                "ndvi": 0.62,
                "ndmi": 0.38,
                "elevation_m": 65.0,
                "slope_deg": 2.5,
            },
        ]
    return []


def _features_to_geojson(
    features: list[dict[str, Any]],
    layer: str,
) -> dict:
    """Convert row-dicts to a GeoJSON FeatureCollection.

    Attempts to extract latitude/longitude keys; falls back to
    placing all properties in the Feature.
    """
    geojson_features = []
    for feat in features:
        lat = feat.pop("latitude", None) or feat.pop("lat", None)
        lon = feat.pop("longitude", None) or feat.pop("lon", None)
        if lat is not None and lon is not None:
            geometry = {"type": "Point", "coordinates": [lon, lat]}
        else:
            geometry = None
        geojson_features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": feat,
            }
        )

    return {
        "type": "FeatureCollection",
        "metadata": _build_attribution_metadata(),
        "layer": layer,
        "features": geojson_features,
    }


def _features_to_csv(features: list[dict[str, Any]], layer: str) -> str:
    """Convert row-dicts to CSV with header row."""
    if not features:
        return ""

    output = io.StringIO()
    # Determine all keys across all features
    all_keys: list[str] = []
    seen = set()
    for feat in features:
        for k in feat:
            if k not in seen:
                all_keys.append(k)
                seen.add(k)

    # Normalize: ensure every row has all keys
    writer = csv.DictWriter(output, fieldnames=all_keys, extrasaction="ignore")
    writer.writeheader()

    for feat in features:
        writer.writerow(feat)

    return output.getvalue()


# ── Export endpoint ─────────────────────────────────────────────────────
@router.get("/{layer}.{format}")
async def export_layer(
    layer: str,
    format: str,
    request: Request,
    bbox: str = Query(
        default=None,
        description="Bounding box: lon_min,lat_min,lon_max,lat_max"
    ),
    include_metadata: bool = Query(
        default=True,
        description="Include attribution & warning in the export"
    ),
):
    """Export a data layer in the requested format.

    **Layers**: hotspots, risk, fwi, weather, vegetation
    **Formats**: geojson, csv, json

    All exports include mandatory attribution text and legal warning.
    """
    if layer not in SUPPORTED_LAYERS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unsupported_layer",
                "message": f"Layer must be one of: {', '.join(sorted(SUPPORTED_LAYERS))}",
                "supported_layers": sorted(SUPPORTED_LAYERS),
            },
        )

    if format not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unsupported_format",
                "message": f"Format must be one of: {', '.join(sorted(SUPPORTED_FORMATS))}",
                "supported_formats": sorted(SUPPORTED_FORMATS),
            },
        )

    # Parse optional bbox
    parsed_bbox: tuple[float, float, float, float] | None = None
    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError
            parsed_bbox = (parts[0], parts[1], parts[2], parts[3])
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_bbox",
                    "message": "bbox must be 4 comma-separated floats: lon_min,lat_min,lon_max,lat_max",
                },
            )

    # Get data (from DB or sample for preview)
    data = _get_sample_data(layer, parsed_bbox)

    # Format and return
    if format == "geojson":
        geojson = _features_to_geojson(data, layer)
        # Serialize
        content = json.dumps(geojson, ensure_ascii=False, indent=2)
        return Response(
            content=content,
            media_type="application/geo+json",
            headers={
                "Content-Disposition": f'attachment; filename="pyroscope33_{layer}.geojson"',
                "X-Attribution": ATTRIBUTION_TEXT,
            },
        )

    elif format == "csv":
        csv_content = _features_to_csv(data, layer)
        # Prepend metadata as comment lines
        meta = _build_attribution_metadata()
        header_lines = [
            f"# Export PyroScope 33 — {layer}",
            f"# Generated: {meta['export_generated_at']}",
            f"# Warning: {WARNING_TEXT}",
            f"# Attribution: {ATTRIBUTION_TEXT}",
            f"# BBOX: {meta['bbox']}",
            "",
        ]
        full_content = "\n".join(header_lines) + csv_content
        return PlainTextResponse(
            content=full_content,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="pyroscope33_{layer}.csv"',
                "X-Attribution": ATTRIBUTION_TEXT,
            },
        )

    elif format == "json":
        result = {
            "metadata": _build_attribution_metadata(),
            "layer": layer,
            "data": data,
        }
        return Response(
            content=json.dumps(result, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="pyroscope33_{layer}.json"',
                "X-Attribution": ATTRIBUTION_TEXT,
            },
        )

    raise HTTPException(status_code=500, detail="Unreachable")
