"""
Weather endpoints — Open-Meteo AROME HD.

GET /api/weather/grid   — grille régulière d'une variable météo
GET /api/weather/point  — série temporelle pour un point unique
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.settings import BBOX_CALCUL
from app.sources.open_meteo import (
    WEATHER_VARIABLES,
    get_open_meteo_source,
)

logger = logging.getLogger("pyroscope.api.weather")
router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/grid")
async def get_weather_grid(
    variable: str = Query(default="temperature_2m", description="Weather variable"),
    model: str = Query(
        default="meteofrance_arome_france_hd",
        description="Forecast model (see Open-Meteo docs)",
    ),
    bbox: str = Query(
        default=f"{BBOX_CALCUL[0]},{BBOX_CALCUL[1]},{BBOX_CALCUL[2]},{BBOX_CALCUL[3]}",
        description="Bounding box: lon_min,lat_min,lon_max,lat_max",
    ),
    forecast_hours: int = Query(default=48, ge=1, le=168),
):
    """Return a weather variable on the calculation grid."""
    if variable not in WEATHER_VARIABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown variable '{variable}'. Choose from: {', '.join(WEATHER_VARIABLES)}",
        )

    try:
        parts = [float(x.strip()) for x in bbox.split(",")]
        parsed_bbox = (parts[0], parts[1], parts[2], parts[3])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid bbox format")

    try:
        om = get_open_meteo_source()
        grid = await om.fetch_grid(
            bbox=parsed_bbox,
            variable=variable,
            model=model,
            forecast_hours=forecast_hours,
        )
    except Exception as e:
        logger.error("weather.grid_error", error=str(e))
        raise HTTPException(status_code=503, detail="Weather data unavailable")

    # Group points by location for compact response
    locations: dict[str, dict] = {}
    for pt in grid.points:
        key = f"{pt.latitude},{pt.longitude}"
        if key not in locations:
            locations[key] = {
                "lat": pt.latitude,
                "lon": pt.longitude,
                "timestamps": [],
                "values": [],
            }
        locations[key]["timestamps"].append(pt.timestamp.isoformat())
        locations[key]["values"].append(pt.variables.get(variable))

    return {
        "variable": variable,
        "model": model,
        "locations": list(locations.values()),
        "n_locations": len(locations),
        "source": {
            "name": "open_meteo",
            "available": grid.source.available,
        },
    }


@router.get("/point")
async def get_weather_point(
    latitude: float = Query(..., ge=40, le=50),
    longitude: float = Query(..., ge=-5, le=5),
    variable: str = Query(default="temperature_2m"),
    model: str = Query(default="meteofrance_arome_france_hd"),
    forecast_hours: int = Query(default=48, ge=1, le=168),
    past_days: int = Query(default=0, ge=0, le=30),
):
    """Return hourly weather series for a single point."""
    if variable not in WEATHER_VARIABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown variable '{variable}'",
        )

    try:
        om = get_open_meteo_source()
        series = await om.fetch_point_series(
            latitude=latitude,
            longitude=longitude,
            variable=variable,
            model=model,
            forecast_hours=forecast_hours,
            past_days=past_days,
        )
    except Exception as e:
        logger.error("weather.point_error", error=str(e))
        raise HTTPException(status_code=503, detail="Weather data unavailable")

    return {
        "latitude": latitude,
        "longitude": longitude,
        "variable": variable,
        "model": model,
        "timestamps": [t.isoformat() for t in series.timestamps],
        "values": series.values,
        "n_points": len(series.timestamps),
        "source": {
            "name": "open_meteo",
            "available": series.source.available,
        },
    }
