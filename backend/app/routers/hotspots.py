"""
GET /api/hotspots — Fire detection points from NASA FIRMS.

Query params:
  bbox=lon_min,lat_min,lon_max,lat_max  (default: BBOX_DEPARTEMENT)
  period_hours=24|48|168                 (default: 48)
  min_confidence=low|nominal|high        (default: low)
  min_frp=float                          (default: 0)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.settings import BBOX_DEPARTEMENT
from app.sources.firms import Hotspot, get_firms_source

logger = logging.getLogger("pyroscope.api.hotspots")
router = APIRouter(prefix="/api", tags=["hotspots"])


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    parts = [float(x.strip()) for x in bbox.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be 4 comma-separated floats")
    return (parts[0], parts[1], parts[2], parts[3])


@router.get("/hotspots")
async def get_hotspots(
    bbox: str = Query(
        default=f"{BBOX_DEPARTEMENT[0]},{BBOX_DEPARTEMENT[1]},{BBOX_DEPARTEMENT[2]},{BBOX_DEPARTEMENT[3]}",
        description="Bounding box: lon_min,lat_min,lon_max,lat_max",
    ),
    period_hours: int = Query(default=48, ge=1, le=168),
    min_confidence: str = Query(default="low", pattern="^(low|nominal|high)$"),
    min_frp: float = Query(default=0.0, ge=0.0),
):
    """Return FIRMS hotspots matching the filters."""
    try:
        parsed_bbox = parse_bbox(bbox)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    days = max(1, period_hours // 24 + 1)

    try:
        firms = get_firms_source()
        response = await firms.fetch(bbox=parsed_bbox, days=days)
    except Exception as e:
        logger.error("hotspots.fetch_error", error=str(e))
        raise HTTPException(status_code=503, detail="Data source unavailable")

    # Apply filters
    filtered = []
    now = datetime.now(timezone.utc)
    for h in response.hotspots:
        if h.frp < min_frp:
            continue
        if h.age_hours > period_hours:
            continue
        # Confidence level filtering: "high" only, "nominal" includes nominal+high
        if min_confidence == "high" and h.confidence != "high":
            continue
        if min_confidence == "nominal" and h.confidence not in ("nominal", "high"):
            continue

        filtered.append(
            {
                "lat": h.latitude,
                "lon": h.longitude,
                "acq_date": h.acq_date,
                "acq_time": h.acq_time,
                "satellite": h.satellite,
                "confidence": h.confidence,
                "frp": round(h.frp, 2),
                "daynight": h.daynight,
                "age_hours": round(h.age_hours, 1),
                "bright_ti4": round(h.bright_ti4, 1) if h.bright_ti4 else None,
                "bright_ti5": round(h.bright_ti5, 1) if h.bright_ti5 else None,
            }
        )

    return {
        "hotspots": filtered,
        "count": len(filtered),
        "source": {
            "name": "firms",
            "available": response.source.available,
            "quota_used": response.source.quota_used,
            "quota_limit": response.source.quota_limit,
        },
        "bbox": list(parsed_bbox),
    }
