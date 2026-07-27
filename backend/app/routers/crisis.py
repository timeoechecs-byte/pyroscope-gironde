"""
Crisis mode API endpoints.

GET /api/v1/crisis/status   → current crisis mode state
POST /api/v1/crisis/toggle  → activate / deactivate crisis mode
GET /api/v1/crisis/layers   → list degraded layers

When crisis mode is active:
- Backend reduces API call frequency for non-critical sources
- Frontend shows crisis banner (CrisisBanner.tsx)
- Simulation, propagation ellipses, and zone alerts are disabled
- Push notification delivery is blocked
- Prometheus metric pyroscope_crisis_active is set to 1
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum

from fastapi import APIRouter, HTTPException

logger = logging.getLogger("pyroscope.api.crisis")
router = APIRouter(prefix="/api/v1/crisis", tags=["crisis"])

# ── In-memory state (until Redis-backed store) ─────────────────────────
_crisis_active = False
_crisis_activated_at: str | None = None

DEGRADED_LAYERS = [
    "simulation",
    "ellipses",
    "hotspots",
    "alerts",
]


class CrisisMode(str, Enum):
    activate = "activate"
    deactivate = "deactivate"


@router.get("/status")
async def get_crisis_status():
    """Return current crisis mode state and active degraded layers."""
    return {
        "active": _crisis_active,
        "activated_at": _crisis_activated_at,
        "degraded_layers": DEGRADED_LAYERS if _crisis_active else [],
        "n_degraded_layers": len(DEGRADED_LAYERS) if _crisis_active else 0,
        "note": "Le mode crise désactive les fonctionnalités non essentielles. "
        "Les canaux officiels (18/112, SDIS 33, Préfecture) restent seuls référents.",
    }


@router.post("/toggle")
async def toggle_crisis(mode: CrisisMode):
    """Activate or deactivate crisis mode."""
    global _crisis_active, _crisis_activated_at

    if mode == CrisisMode.activate:
        if _crisis_active:
            raise HTTPException(status_code=409, detail="Crisis mode already active")
        _crisis_active = True
        _crisis_activated_at = datetime.now(timezone.utc).isoformat()
        logger.warning("crisis.activated", layers=DEGRADED_LAYERS)
        return {
            "status": "activated",
            "activated_at": _crisis_activated_at,
            "degraded_layers": DEGRADED_LAYERS,
        }
    else:
        if not _crisis_active:
            raise HTTPException(status_code=409, detail="Crisis mode not active")
        _crisis_active = False
        logger.info("crisis.deactivated")
        return {
            "status": "deactivated",
            "degraded_layers": [],
        }


@router.get("/layers")
async def get_degraded_layers():
    """Return the list of layers degraded during crisis mode."""
    return {
        "degraded_layers": DEGRADED_LAYERS,
        "n_degraded": len(DEGRADED_LAYERS),
        "descriptions": {
            "simulation": "Simulation de propagation (coûteuse en calcul)",
            "ellipses": "Ellipses de propagation (rafraîchissement toutes les 15 min)",
            "hotspots": "Points chauds satellite (rafraîchissement suspendu)",
            "alerts": "Alertes cellulaires et notifications push",
        },
    }


@router.get("/metrics")
async def get_crisis_metrics():
    """Prometheus-style metrics for crisis mode."""
    return {
        "pyroscope_crisis_active": 1 if _crisis_active else 0,
        "pyroscope_crisis_activated_at": _crisis_activated_at or "never",
    }
