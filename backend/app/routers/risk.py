"""
Risk and simulation endpoints.

GET /api/risk/grid        → current risk across the grid
GET /api/risk/cell/{id}   → full decomposition for one cell
GET /api/spread/grid      → spread ellipses
POST /api/simulate        → start a simulation
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.science.fbp import FBPEngine
from app.science.rothermel import RothermelEngine
from app.science.spread_ellipse import compute_ellipse_geometry, compute_length_breadth_ratio
from app.science.local_coefficient import LocalCoefficient
from app.science.risk_score import RiskScore, classify_risk
from app.science.simulation import FireSimulation
from app.science.cffwis import EFFIS_CLASSES

logger = logging.getLogger("pyroscope.api.risk")
router = APIRouter(prefix="/api", tags=["risk"])

# Cached engines
_local_coeff = LocalCoefficient()
_risk = RiskScore()


@router.get("/risk/grid")
async def get_risk_grid(
    horizon: int = Query(default=0, ge=0, le=48),
    model: str = Query(default="fbp", pattern="^(fbp|rothermel)$"),
):
    """Return risk scores across the grid for the given horizon."""
    # PHASE 4 stub — returns a single cell for demo
    # Real implementation iterates over all grid cells
    return {
        "cells": [
            {
                "cell_id": 0,
                "lat": 44.9,
                "lon": -0.5,
                "ignition_risk": 35.0,
                "spread_risk": 72.0,
                "dominant": "spread",
                "risk_class": "élevé",
                "fuel": {"species": "pin_maritime", "fbp": "C-6", "confidence": "medium"},
                "fwi": 15.2,
                "model": model,
                "horizon_h": horizon,
            }
        ],
        "n_cells": 1,
        "horizon_h": horizon,
        "model": model,
    }


@router.get("/risk/cell/{cell_id}")
async def get_cell_risk(cell_id: int):
    """Full decomposition + quality for a single cell."""
    # DEMO data — replaced with DB query in production
    coeff = _local_coeff.compute(
        cell_id=cell_id,
        dry_days_7d=5.0,
        dry_days_15d=10.0,
        dry_days_30d=18.0,
        heatwave_days=3.0,
        soil_moisture_7cm=15.0,
        vapour_pressure_deficit=2.5,
        pine_percentage=80.0,
        ndmi_anomaly=-0.3,
        forest_density=75.0,
        recent_clear_cut=0.0,
        road_distance=150.0,
        amenity_distance=500.0,
        building_density=0.05,
        seasonality=7.0,
        historic_density=2.0,
        slope=1.5,
        coastal_proximity=25000.0,
        aspect=180.0,
    )

    fbp = FBPEngine("C-6")
    fbp_result = fbp.compute(isi=10.0, bui=20.0, wind_speed_kmh=15.0)

    roth = RothermelEngine()
    roth_result = roth.compute(wind_speed_kmh=15.0)

    risk = _risk.compute(
        fwi=15.2,
        local_coefficient_score=coeff.score,
        local_ignition_score=coeff.ignition_score,
        local_spread_score=coeff.spread_score,
        ros_fbp=fbp_result.ros_m_min,
        ros_rothermel=roth_result.ros_m_min,
        fire_type=fbp_result.fire_type,
        fuel_confidence="medium",
    )

    return {
        "cell_id": cell_id,
        "lat": 44.9,
        "lon": -0.5,
        "ignition_risk": risk.ignition_risk,
        "spread_risk": risk.spread_risk,
        "combined": risk.combined_score,
        "dominant_regime": risk.dominant_regime,
        "risk_class": risk.risk_class,
        "fwi": 15.2,
        "fbp": {
            "ros_m_min": fbp_result.ros_m_min,
            "intensity_kw_m": fbp_result.intensity_kw_m,
            "flame_length_m": fbp_result.flame_length_m,
            "fire_type": fbp_result.fire_type,
            "fuel_consumed_kg_m2": fbp_result.fuel_consumed_kg_m2,
        },
        "rothermel": {
            "ros_m_min": roth_result.ros_m_min,
            "intensity_kw_m": roth_result.intensity_kw_m,
            "flame_length_m": roth_result.flame_length_m,
        },
        "local_coefficient": {
            "score": coeff.score,
            "ignition_score": coeff.ignition_score,
            "spread_score": coeff.spread_score,
            "n_available_factors": coeff.n_available,
            "n_total_factors": coeff.n_factors,
            "renormalized": coeff.renormalized,
        },
        "contributions": [
            {"name": c.name, "value": c.value, "contribution": c.contribution, "pct": c.contribution_pct}
            for c in risk.contributions
        ],
        "quality": risk.quality,
    }


@router.get("/spread/grid")
async def get_spread_grid(
    horizon: int = Query(default=6, ge=1, le=12),
):
    """Return spread ellipses for the given horizon."""
    # DEMO — single ellipse
    ws = 15.0 + horizon * 2  # wind increases through the day
    ros = 5.0 + horizon * 1.5  # ROS grows with wind
    lb = compute_length_breadth_ratio(ws)

    ellipse = compute_ellipse_geometry(
        head_ros_m_min=ros,
        duration_min=horizon * 60,
        wind_direction_deg=225,
        lb=lb,
    )

    return {
        "ellipses": [
            {
                "horizon_h": horizon,
                "center_lon": ellipse.center_lon,
                "center_lat": ellipse.center_lat,
                "semi_major_m": ellipse.semi_major_m,
                "semi_minor_m": ellipse.semi_minor_m,
                "orientation_deg": ellipse.orientation_deg,
                "area_ha": ellipse.area_ha,
                "head_ros_m_min": ellipse.head_ros_m_min,
                "flank_ros_m_min": ellipse.flank_ros_m_min,
                "back_ros_m_min": ellipse.back_ros_m_min,
                "wind_speed_kmh": ws,
                "wind_direction_deg": 225,
            }
        ],
        "n_ellipses": 1,
    }


@router.post("/simulate")
async def run_simulation(
    lat: float = Query(...),
    lon: float = Query(...),
    datetime_str: str = Query(default="", alias="datetime"),
    duration_h: int = Query(default=6, ge=1, le=24),
    isi: float = Query(default=10.0, ge=0),
    bui: float = Query(default=20.0, ge=0),
    mc_runs: int = Query(default=1, ge=1, le=100),
):
    """Run a fire simulation from the given ignition point."""
    sim = FireSimulation()
    result = sim.simulate(
        ignition_lat=lat,
        ignition_lon=lon,
        duration_h=duration_h,
        start_time=datetime_str or datetime.now(timezone.utc).isoformat(),
        isi=isi,
        bui=bui,
        mc_runs=mc_runs,
    )

    return {
        "ignition": {"lat": result.ignition_lat, "lon": result.ignition_lon},
        "start_time": result.start_time,
        "duration_h": result.duration_h,
        "n_burned_cells": result.n_burned,
        "total_area_ha": result.total_area_ha,
        "max_ros_m_min": result.max_ros_m_min,
        "fire_type": result.fire_type,
        "epochs": result.epochs,
        "n_mc_runs": result.n_mc_runs,
        "n_warning": "Simulation à but pédagogique, en propagation libre, sans intervention des secours.",
    }
