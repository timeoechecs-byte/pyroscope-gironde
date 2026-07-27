"""
Zone alerts API endpoints.

GET  /api/v1/alerts/cells       → list watched cells
POST /api/v1/alerts/cells       → add a watched cell
PUT  /api/v1/alerts/cells/{id}  → update thresholds
DELETE /api/v1/alerts/cells/{id} → remove watched cell
GET  /api/v1/alerts/feed         → RSS feed stub
GET  /api/v1/alerts/history      → alert history

⚠️ AVERTISSEMENT (SPEC §6) :
Les notifications NE DOIVENT PAS être présentées comme un canal d'alerte
de sécurité. L'UI doit afficher : « notifications informatives, sans
garantie de délivrance — pour l'alerte, 18/112 et les canaux officiels ».
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("pyroscope.api.alerts")
router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

# ── In-memory store (until TimescaleDB) ─────────────────────────────────
_watched_cells: list[dict] = []
_alert_history: list[dict] = []


# ── Schemas ─────────────────────────────────────────────────────────────
class WatchedCellCreate(BaseModel):
    lat: float = Field(..., ge=44.0, le=46.0)
    lon: float = Field(..., ge=-2.0, le=1.0)
    label: str = ""
    threshold_ignition: float = Field(default=50.0, ge=0, le=100)
    threshold_spread: float = Field(default=70.0, ge=0, le=100)
    threshold_fwi: float = Field(default=20.0, ge=0, le=100)
    push_enabled: bool = True


class WatchedCellUpdate(BaseModel):
    threshold_ignition: Optional[float] = None
    threshold_spread: Optional[float] = None
    threshold_fwi: Optional[float] = None
    push_enabled: Optional[bool] = None
    label: Optional[str] = None


class AlertRecord(BaseModel):
    cell_id: str
    cell_lat: float
    cell_lon: float
    triggered_at: str
    ignition_risk: float
    spread_risk: float
    fwi: float
    message: str
    acknowledged: bool = False


# ── Endpoints ───────────────────────────────────────────────────────────
@router.get("/cells")
async def list_watched_cells():
    """Return all watched cells with current thresholds."""
    return {
        "cells": _watched_cells,
        "n_cells": len(_watched_cells),
    }


@router.post("/cells", status_code=201)
async def add_watched_cell(cell: WatchedCellCreate):
    """Add a new cell to watch."""
    # Validate bbox Gironde
    if not (44.15 <= cell.lat <= 45.60 and -1.35 <= cell.lon <= 0.35):
        raise HTTPException(
            status_code=400,
            detail="Cell outside Gironde department bounding box"
        )

    new_cell = {
        "id": f"cell_{len(_watched_cells) + 1}_{datetime.now(timezone.utc).timestamp()}",
        "lat": cell.lat,
        "lon": cell.lon,
        "label": cell.label or f"{cell.lat:.3f}, {cell.lon:.3f}",
        "threshold_ignition": cell.threshold_ignition,
        "threshold_spread": cell.threshold_spread,
        "threshold_fwi": cell.threshold_fwi,
        "push_enabled": cell.push_enabled,
        "last_alert": None,
        "triggered": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _watched_cells.append(new_cell)
    logger.info("alert.cell_added", cell_id=new_cell["id"], lat=cell.lat, lon=cell.lon)
    return {"status": "added", "cell": new_cell}


@router.put("/cells/{cell_id}")
async def update_watched_cell(cell_id: str, update: WatchedCellUpdate):
    """Update thresholds for a watched cell."""
    for cell in _watched_cells:
        if cell["id"] == cell_id:
            if update.threshold_ignition is not None:
                cell["threshold_ignition"] = update.threshold_ignition
            if update.threshold_spread is not None:
                cell["threshold_spread"] = update.threshold_spread
            if update.threshold_fwi is not None:
                cell["threshold_fwi"] = update.threshold_fwi
            if update.push_enabled is not None:
                cell["push_enabled"] = update.push_enabled
            if update.label is not None:
                cell["label"] = update.label
            return {"status": "updated", "cell": cell}

    raise HTTPException(status_code=404, detail="Cell not found")


@router.delete("/cells/{cell_id}")
async def delete_watched_cell(cell_id: str):
    """Remove a watched cell."""
    for i, cell in enumerate(_watched_cells):
        if cell["id"] == cell_id:
            _watched_cells.pop(i)
            logger.info("alert.cell_removed", cell_id=cell_id)
            return {"status": "removed", "cell_id": cell_id}

    raise HTTPException(status_code=404, detail="Cell not found")


@router.get("/feed")
async def get_alert_feed():
    """RSS feed stub for zone alerts.

    Returns an RSS 2.0 XML string of recent alerts.
    PHASE 6 stub — real RSS feed when alerts are triggered.
    """
    rss_items = ""
    for alert in _alert_history[-20:]:
        rss_items += f"""
        <item>
            <title>{alert['message']}</title>
            <description>Risque ignition: {alert['ignition_risk']:.0f}, propagation: {alert['spread_risk']:.0f}</description>
            <pubDate>{alert['triggered_at']}</pubDate>
            <guid>pyroscope-alert-{alert['cell_id']}</guid>
        </item>"""

    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>PyroScope 33 — Alertes cellulaires</title>
    <link>/api/v1/alerts/feed</link>
    <description>⚠️ Notifications informatives uniquement. En cas d'incendie : 18 / 112.</description>
    <language>fr-FR</language>
    <lastBuildDate>{datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>
    <atom:link href="/api/v1/alerts/feed" rel="self" type="application/rss+xml"/>
    <item>
        <title>Aucune alerte récente</title>
        <description>Les alertes apparaîtront ici lorsqu'elles seront déclenchées.</description>
        <pubDate>{datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>
        <guid>pyroscope-no-alert</guid>
    </item>
    {rss_items}
</channel>
</rss>"""
    return rss.strip()


@router.get("/history")
async def get_alert_history(
    limit: int = Query(default=50, ge=1, le=500),
    acknowledged: bool | None = None,
):
    """Return alert history."""
    filtered = _alert_history
    if acknowledged is not None:
        filtered = [a for a in filtered if a["acknowledged"] == acknowledged]

    return {
        "alerts": filtered[-limit:],
        "n_alerts": min(len(filtered), limit),
        "total": len(_alert_history),
    }


@router.post("/check")
async def check_alerts():
    """Check all watched cells against current risk values.

    Called by the scheduler or on demand.
    PHASE 6 stub — evaluates thresholds and triggers alerts.
    """
    triggered = []
    for cell in _watched_cells:
        # Placeholder: check against actual risk values from DB
        # In production, this queries /api/risk/cell/{cell_id}
        if cell["threshold_ignition"] < 50:  # demo threshold
            alert = {
                "cell_id": cell["id"],
                "cell_lat": cell["lat"],
                "cell_lon": cell["lon"],
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "ignition_risk": cell["threshold_ignition"] + 5,
                "spread_risk": cell["threshold_spread"] + 10,
                "fwi": cell["threshold_fwi"] + 3,
                "message": f"Alerte seuil : risque ignition > {cell['threshold_ignition']:.0f} à {cell['label']}",
                "acknowledged": False,
            }
            _alert_history.append(alert)
            cell["last_alert"] = alert["triggered_at"]
            cell["triggered"] = True
            triggered.append(alert)
            logger.info(
                "alert.triggered",
                cell_id=cell["id"],
                ignition=cell["threshold_ignition"],
                spread=cell["threshold_spread"],
            )

    return {
        "checked": len(_watched_cells),
        "triggered": len(triggered),
        "alerts": triggered,
        "warning": "Notifications informatives uniquement. En cas d'incendie : 18 / 112.",
    }
