"""
Vegetation and terrain endpoints.

GET /api/vegetation/fuel?lat=...&lon=...   → fuel model for a cell
GET /api/vegetation/species?lat=...&lon=... → BD Forêt V2 species
GET /api/vegetation/elevation?lat=...&lon=... → RGE ALTI elevation/slope/aspect
GET /api/vegetation/ndvi?lat=...&lon=...   → Sentinel-2 NDVI/NDMI status
GET /api/vegetation/human?lat=...&lon=...  → Overpass human factors
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.science.fuel_models import get_fuel_model
from app.sources.ign_geoplateforme import get_ign_source
from app.sources.corine import get_corine_source
from app.sources.copernicus import get_copernicus_source
from app.sources.overpass import get_overpass_source

logger = logging.getLogger("pyroscope.api.vegetation")
router = APIRouter(prefix="/api/vegetation", tags=["vegetation"])


@router.get("/fuel")
async def get_fuel(
    latitude: float = Query(..., ge=44.0, le=46.0),
    longitude: float = Query(..., ge=-2.0, le=1.0),
):
    """Get fuel model for a cell based on BD Forêt / CORINE classification."""
    try:
        ign = get_ign_source()
        forest = await ign.get_forest_species(latitude, longitude)
    except Exception as e:
        logger.warning("fuel.forest_error", error=str(e))
        forest = None

    species = forest.species if forest else "non_foret"
    fuel = get_fuel_model(species)

    return {
        "cell": {"lat": latitude, "lon": longitude},
        "species": species,
        "fuel_model": {
            "sb_code": fuel.sb_code,
            "sb_name": fuel.sb_name,
            "fbp_code": fuel.fbp_code,
            "fbp_name": fuel.fbp_name,
        },
        "fuel_characteristics": {
            "fuel_load_1h_t_ha": fuel.fuel_load_1h,
            "fuel_load_10h_t_ha": fuel.fuel_load_10h,
            "fuel_load_100h_t_ha": fuel.fuel_load_100h,
            "savr_m2_m3": fuel.savr,
            "fuel_depth_cm": fuel.fuel_depth_cm,
            "moisture_of_extinction_pct": fuel.moisture_of_extinction,
        },
        "confidence": fuel.confidence,
        "source": fuel.source,
    }


@router.get("/species")
async def get_species(
    latitude: float = Query(..., ge=44.0, le=46.0),
    longitude: float = Query(..., ge=-2.0, le=1.0),
):
    """Get BD Forêt V2 forest species at a point."""
    try:
        ign = get_ign_source()
        forest = await ign.get_forest_species(latitude, longitude)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"IGN unavailable: {e}")

    return {
        "lat": latitude,
        "lon": longitude,
        "species": forest.species,
        "canopy_density_pct": forest.canopy_density,
        "quality": forest.quality,
        "source": "ign_bd_foret_v2",
    }


@router.get("/elevation")
async def get_elevation(
    latitude: float = Query(..., ge=44.0, le=46.0),
    longitude: float = Query(..., ge=-2.0, le=1.0),
):
    """Get terrain elevation, slope, aspect from RGE ALTI."""
    try:
        ign = get_ign_source()
        terrain = await ign.get_elevation(latitude, longitude)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"IGN unavailable: {e}")

    return {
        "lat": latitude,
        "lon": longitude,
        "elevation_m": terrain.elevation_m,
        "slope_deg": terrain.slope_deg,
        "aspect_deg": terrain.aspect_deg,
        "source": "ign_rge_alti",
    }


@router.get("/ndvi")
async def get_ndvi(
    latitude: float = Query(..., ge=44.0, le=46.0),
    longitude: float = Query(..., ge=-2.0, le=1.0),
):
    """Get Sentinel-2 vegetation index status for a cell."""
    cdse = get_copernicus_source()
    veg = await cdse.fetch_vegetation_indices(
        cell_lat=latitude, cell_lon=longitude
    )

    return {
        "lat": latitude,
        "lon": longitude,
        "ndvi": veg.ndvi,
        "ndmi": veg.ndmi,
        "nbr": veg.nbr,
        "cloud_cover_pct": veg.cloud_cover,
        "scene_date": veg.scene_date,
        "available": veg.valid,
        "error": veg.error,
        "source": "copernicus_sentinel2_l2a",
    }


@router.get("/human")
async def get_human_factors(
    latitude: float = Query(..., ge=44.0, le=46.0),
    longitude: float = Query(..., ge=-2.0, le=1.0),
):
    """Get human factors (roads, amenities) from OpenStreetMap."""
    try:
        osm = get_overpass_source()
        factors = await osm.get_human_factors(latitude, longitude)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Overpass unavailable: {e}")

    return {
        "lat": latitude,
        "lon": longitude,
        "nearest_road": {
            "distance_m": factors.nearest_road_distance_m,
            "type": factors.nearest_road_type,
        },
        "nearest_amenity": {
            "distance_m": factors.nearest_amenity_distance_m,
            "type": factors.nearest_amenity_type,
        },
        "amenities_1km": factors.n_amenities_1km,
        "source": "openstreetmap_overpass",
    }
