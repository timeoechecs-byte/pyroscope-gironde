"""
Public API v1 — endpoints documentés, versionnés, avec rate limiting.

GET /api/v1/docs          → OpenAPI 3.1 HTML (Swagger UI)
GET /api/v1/openapi.json  → OpenAPI 3.1 spec
GET /api/v1/health        → public health check
GET /api/v1/version       → API version

All /api/v1/ endpoints are rate-limited (100 req/min default).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.settings import settings

logger = logging.getLogger("pyroscope.api.public")
router = APIRouter(prefix="/api/v1", tags=["public"])

# ── Rate limiting (in-memory, simple sliding window) ────────────────────
_rate_limit_window: dict[str, list[float]] = {}
_RATE_LIMIT_REQUESTS = 100  # requests per window
_RATE_LIMIT_WINDOW_S = 60   # 1 minute


def _check_rate_limit(client_ip: str) -> bool:
    """Check if the request is within the rate limit. Returns True if allowed."""
    now = time.monotonic()
    window = _rate_limit_window.get(client_ip, [])

    # Remove entries outside the window
    window = [t for t in window if now - t < _RATE_LIMIT_WINDOW_S]

    if len(window) >= _RATE_LIMIT_REQUESTS:
        _rate_limit_window[client_ip] = window
        return False

    window.append(now)
    _rate_limit_window[client_ip] = window
    return True


def _rate_limit_dep(request: Request):
    """Dependency for rate limiting."""
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        logger.warning("rate_limit.exceeded", ip=client_ip)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": f"Rate limit: {_RATE_LIMIT_REQUESTS} requests per {_RATE_LIMIT_WINDOW_S}s. "
                           "Pour un accès sans limite, installez le projet sur votre propre serveur.",
                "retry_after_s": _RATE_LIMIT_WINDOW_S,
            },
        )


# ── OpenAPI documentation ──────────────────────────────────────────────
OPENAPI_SPEC: dict = {
    "openapi": "3.1.0",
    "info": {
        "title": "PyroScope 33 API",
        "version": "1.0.0",
        "description": (
            "**PyroScope 33** — API de suivi et d'évaluation du risque d'incendie "
            "de forêt sur le département de la Gironde (France).\n\n"
            "⚠️ **AVERTISSEMENT** : Cette API est expérimentale et fournit des "
            "informations à visée pédagogique. **Ne pas utiliser pour une décision "
            "opérationnelle ou de sécurité.**\n\n"
            "Sources : NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · "
            "IGN · OpenStreetMap © contributeurs (ODbL)\n\n"
            "En cas d'incendie : **18 / 112** — SDIS 33 / Préfecture de la Gironde"
        ),
        "termsOfService": "https://github.com/username/pyroscope33",
        "contact": {
            "url": "https://github.com/username/pyroscope33",
        },
        "license": {
            "name": "MIT",
            "url": "https://opensource.org/licenses/MIT",
        },
    },
    "servers": [
        {"url": "/", "description": "Instance locale (auto-hébergée)"},
    ],
    "paths": {
        "/api/v1/health": {
            "get": {
                "summary": "Santé de l'API",
                "description": "Retourne l'état de santé public de l'API.",
                "responses": {
                    "200": {
                        "description": "API opérationnelle",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string"},
                                        "version": {"type": "string"},
                                        "timestamp": {"type": "string"},
                                    },
                                }
                            }
                        },
                    }
                },
            }
        },
        "/api/v1/hotspots": {
            "get": {
                "summary": "Points chauds satellite (feux actifs)",
                "description": "Retourne les points chauds détectés par les satellites NASA FIRMS "
                               "dans l'emprise de la Gironde.",
                "parameters": [
                    {
                        "name": "period_hours",
                        "in": "query",
                        "description": "Période de recherche (heures)",
                        "schema": {"type": "integer", "default": 48},
                    },
                    {
                        "name": "min_confidence",
                        "in": "query",
                        "description": "Confiance minimale (low, nominal, high)",
                        "schema": {"type": "string", "default": "low"},
                    },
                    {
                        "name": "min_frp",
                        "in": "query",
                        "description": "FRP minimum (MW)",
                        "schema": {"type": "number", "default": 0},
                    },
                ],
                "responses": {
                    "200": {"description": "Liste des points chauds"},
                    "503": {"description": "Source de données indisponible"},
                },
            }
        },
        "/api/v1/risk/grid": {
            "get": {
                "summary": "Grille de risque",
                "description": "Retourne les scores de risque pour l'ensemble de la grille.",
                "parameters": [
                    {
                        "name": "horizon",
                        "in": "query",
                        "description": "Horizon de prévision (heures)",
                        "schema": {"type": "integer", "default": 6},
                    },
                ],
                "responses": {
                    "200": {"description": "Grille de risque"},
                },
            }
        },
        "/api/v1/fwi/current": {
            "get": {
                "summary": "Indice FWI actuel",
                "description": "Retourne les indices FWI (Fire Weather Index) pour la grille.",
                "responses": {"200": {"description": "Indices FWI"}},
            }
        },
        "/api/v1/weather/grid": {
            "get": {
                "summary": "Grille météo",
                "description": "Retourne les données météo sur la grille de calcul.",
                "parameters": [
                    {
                        "name": "variable",
                        "in": "query",
                        "description": "Variable météo (temperature_2m, wind_speed_10m, etc.)",
                        "schema": {"type": "string", "default": "temperature_2m"},
                    },
                ],
                "responses": {"200": {"description": "Grille météo"}},
            }
        },
        "/api/v1/crisis/status": {
            "get": {
                "summary": "État du mode crise",
                "description": "Retourne l'état actuel du mode crise.",
                "responses": {"200": {"description": "État du mode crise"}},
            }
        },
    },
}


# ── Info Router ─────────────────────────────────────────────────────────
@router.get("/version")
async def get_version():
    """Return API version."""
    return {
        "api_version": "1.0.0",
        "app_version": "0.1.0",
        "environment": settings.ENVIRONMENT,
        "documentation": "/api/v1/docs",
    }


@router.get("/health")
async def public_health():
    """Public health check with timestamp."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "bbox_departement": {
            "lon_min": -1.35, "lat_min": 44.15,
            "lon_max": 0.35, "lat_max": 45.60,
        },
        "warning": "Outil expérimental. Ne pas utiliser pour une décision opérationnelle.",
    }


@router.get("/openapi.json")
async def get_openapi_json():
    """Return the OpenAPI 3.1 specification as JSON."""
    return JSONResponse(content=OPENAPI_SPEC)


@router.get("/docs", include_in_schema=False)
async def get_swagger_ui():
    """Serve a minimal Swagger UI for the API."""
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>PyroScope 33 — API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        body {{ margin: 0; background: #0a1a0d; }}
        .swagger-ui .topbar {{ display: none; }}
        .swagger-ui .info .title {{ color: #f97316 !important; }}
        .swagger-ui .scheme-container {{ background: #0d2210; }}
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({{
            url: '/api/v1/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            defaultModelsExpandDepth: -1,
            docExpansion: 'list',
        }});
    </script>
</body>
</html>"""
    return HTMLResponse(content=html)
