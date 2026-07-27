"""
FWI endpoints.

GET /api/fwi/current    → current FWI values across the grid
GET /api/fwi/series     → 30-day time series for a single cell
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.science.cffwis import (
    compute_all_fwi,
    effis_class,
    FWIState,
)

logger = logging.getLogger("pyroscope.api.fwi")
router = APIRouter(prefix="/api/fwi", tags=["fwi"])


# ── Temporary in-memory storage (until TimescaleDB is connected) ───────
# PHASE 2: will be replaced by database queries.
# Stores last computed FWI state per cell_id.
_last_fwi: dict[int, FWIState] = {}


def _seed_demo_state() -> None:
    """Seed one day of FWI state for demo purposes.

    REMOVED in production — only used for frontend preview.
    Values are computed from the canonical Van Wagner reference case.
    """
    state = compute_all_fwi(
        temperature=20.0,
        humidity=45.0,
        wind_speed=15.0,
        rain=0.0,
        prev_ffmc=88.6,
        prev_dmc=7.1,
        prev_dc=16.8,
        latitude=44.9,
        month=7,
    )
    _last_fwi[0] = state


# Pre-seed for demo
_seed_demo_state()


@router.get("/current")
async def get_fwi_current(
    cell_id: int | None = Query(default=None, description="Optional cell ID"),
    bbox: str | None = Query(default=None, description="Bounding box filter"),
):
    """
    Return current FWI values.

    If cell_id is provided, returns data for that single cell.
    Otherwise returns all available cells.
    """
    if not _last_fwi:
        return {"cells": [], "n_cells": 0}

    if cell_id is not None:
        state = _last_fwi.get(cell_id)
        if not state:
            raise HTTPException(status_code=404, detail="Cell not found")
        effis_label, effis_color = effis_class(state.fwi or 0)
        return _serialize_state(state, cell_id, effis_label, effis_color)

    cells = []
    for cid, state in _last_fwi.items():
        effis_label, effis_color = effis_class(state.fwi or 0)
        cells.append(_serialize_state(state, cid, effis_label, effis_color))

    return {
        "cells": cells,
        "n_cells": len(cells),
        "source": {
            "name": "cffwis",
            "version": "v1",
            "status": "computed",
        },
    }


@router.get("/series")
async def get_fwi_series(
    cell_id: int = Query(..., description="Cell ID for the time series"),
    days: int = Query(default=30, ge=1, le=365),
):
    """
    Return FWI time series for the last N days for a single cell.

    PHASE 2 stub — returns demo data.
    Real data will come from TimescaleDB when connected.
    """
    if cell_id not in _last_fwi:
        raise HTTPException(status_code=404, detail="Cell not found")

    state = _last_fwi[cell_id]

    # Generate synthetic 30-day series for demo purposes
    # REPLACED with real DB query in PHASE 2+
    today = date.today()
    series = []
    for i in range(days):
        day = today.replace(day=today.day - (days - 1 - i))
        # Simulate daily variation
        variation = 1.0 + 0.3 * ((i % 7) - 3) / 3
        base_fwi = state.fwi or 5.0
        fwi_val = round(base_fwi * variation, 1)
        effis_label, effis_color = effis_class(fwi_val)
        series.append({
            "date": day.isoformat(),
            "ffmc": round((state.ffmc or 85) * variation, 1),
            "dmc": round((state.dmc or 6) * variation, 1),
            "dc": round((state.dc or 15) * variation, 1),
            "isi": round((state.isi or 5) * variation, 2),
            "bui": round((state.bui or 8) * variation, 1),
            "fwi": fwi_val,
            "dsr": round(0.0272 * pow(fwi_val, 1.77), 4),
            "effis_class": effis_label,
            "effis_color": effis_color,
        })

    return {
        "cell_id": cell_id,
        "days": len(series),
        "series": series,
    }


def _serialize_state(
    state: FWIState, cell_id: int, effis_label: str, effis_color: str
) -> dict:
    return {
        "cell_id": cell_id,
        "ffmc": state.ffmc,
        "dmc": state.dmc,
        "dc": state.dc,
        "isi": state.isi,
        "bui": state.bui,
        "fwi": state.fwi,
        "dsr": state.dsr,
        "effis_class": effis_label,
        "effis_class_color": effis_color,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "temperature": state.temperature,
            "humidity": state.humidity,
            "wind_speed": state.wind_speed,
            "rain": state.rain,
        },
    }
