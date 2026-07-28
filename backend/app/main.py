"""
PyroScope 33 — FastAPI application entry point.

PHASE 0: health, metrics, structured logging.
PHASE 1+: middleware, routers, scheduled tasks.

🔒 ARCHITECTURE_PROXY.md strict :
  - CORS whitelist (origines autorisées uniquement).
  - slowapi : limitation de débit (CORS ne suffit pas).
  - /api/v1/status : statut public des sources (booléens seulement).
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers import hotspots, tiles, weather  # routers proxy-only, phase 1
from app.settings import get_settings

# ── Structured logging ──────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger()

# ── Rate limiter (ARCHITECTURE_PROXY.md §4) ────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifecycle ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("pyroscope_startup", environment=settings.ENVIRONMENT)

    # Garde-fou : on NE refuse PAS de démarrer si une clé est absente.
    # Le mode dégradé est un comportement attendu et documenté (SPEC §2).
    # L'opérateur voit un warning structuré dans le log.
    status = settings.public_status()
    for source, configured in status.items():
        if not configured:
            logger.warning(
                "source_unconfigured",
                source=source,
                msg="Mode dégradé actif pour cette source",
            )

    yield
    logger.info("pyroscope_shutdown")


# ── App ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PyroScope 33",
    version="0.1.0",
    description=(
        "Suivi et évaluation du risque d'incendie de forêt — Gironde (France). "
        "⚠️ Outil expérimental, sans valeur opérationnelle. "
        "Voir docs/SECURITY.md et le bandeau légal rendu sur toutes les pages."
    ),
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── CORS — whitelist explicite (ARCHITECTURE_PROXY.md §4) ────────────
settings_at_startup = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_at_startup.CORS_ALLOWED_ORIGINS,
    allow_methods=["GET"],  # lecture seule côté public
    allow_headers=["*"],
    allow_credentials=False,
)


# ── Middleware: structured request logging ──────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration_ms, 1),
    )
    return response


# ── Health endpoint ─────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz():
    """Health check. Renvoie OK dès que l'app répond."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": settings_at_startup.ENVIRONMENT,
    }


# ── Public source status (no secrets, only booleans) ───────────────────
@app.get("/api/v1/status")
async def get_status():
    """Statut public des sources — utilisé par le frontend pour adapter l'UI.

    Renvoie UNIQUEMENT des booléens. Aucun token, aucune clé, aucun quota.
    """
    return {
        "version": "0.1.0",
        "sources": settings_at_startup.public_status(),
    }


# ── Metrics scaffold ─────────────────────────────────────────────────
@app.get("/metrics")
async def metrics():
    """Prometheus metrics — stub initial. Voir SPEC §10."""
    return {
        "status": "metrics_stub",
        "note": (
            "5 noyaux non-négociables : data_age_seconds, ingestion_total, "
            "external_api_duration_seconds, fwi_recursion_gap_days, "
            "grid_coverage_ratio. (SPEC §10)"
        ),
    }


# ── Routers proxy (PHASE 1) ───────────────────────────────────────────
app.include_router(hotspots.router)
app.include_router(tiles.router)
app.include_router(weather.router)  # inchangé : Open-Meteo sans clé


# ── BBOX (inchangé — diagnostic pour recherches amont) ────────────────
from app.settings import (  # noqa: E402 — groupé en bas pour visibilité
    BBOX_CALCUL,
    BBOX_DEPARTEMENT,
    BBOX_INGESTION,
)

@app.get("/api/sources")
async def get_sources():
    return {
        "bbox_departement": {
            "lon_min": BBOX_DEPARTEMENT[0],
            "lat_min": BBOX_DEPARTEMENT[1],
            "lon_max": BBOX_DEPARTEMENT[2],
            "lat_max": BBOX_DEPARTEMENT[3],
        },
        "bbox_calcul": {
            "lon_min": BBOX_CALCUL[0],
            "lat_min": BBOX_CALCUL[1],
            "lon_max": BBOX_CALCUL[2],
            "lat_max": BBOX_CALCUL[3],
        },
        "bbox_ingestion": {
            "lon_min": BBOX_INGESTION[0],
            "lat_min": BBOX_INGESTION[1],
            "lon_max": BBOX_INGESTION[2],
            "lat_max": BBOX_INGESTION[3],
        },
    }
