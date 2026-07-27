"""
PyroScope 33 — FastAPI application entry point.

PHASE 0: health endpoint, metrics scaffold.
PHASE 1+: middleware, routers, scheduled tasks.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routers import fwi, hotspots, weather
from app.settings import BBOX_CALCUL, BBOX_DEPARTEMENT, BBOX_INGESTION, settings

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


# ── Lifecycle ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup & shutdown."""
    logger.info("pyroscope_startup", environment=settings.ENVIRONMENT)
    yield
    logger.info("pyroscope_shutdown")


# ── App ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PyroScope 33",
    version="0.1.0",
    description=(
        "Suivi et évaluation du risque d'incendie de forêt — Gironde (France)."
        " ⚠️ Outil expérimental, sans valeur opérationnelle."
    ),
    lifespan=lifespan,
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
    """Health check. Returns OK when DB & Redis respond (PHASE 0 stub)."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }


# ── Metrics scaffold (PHASE 0: 5 core metrics at zero) ─────────────────
@app.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint.

    PHASE 0 stub — 5 core metrics registered at zero.
    Real instrumentation in PHASE 1 via prometheus_fastapi_instrumentator.
    """
    return {
        "status": "metrics_stub",
        "note": "5 core metrics registered at zero until PHASE 1 instrumentator",
        "metrics": [
            "# HELP data_age_seconds Age of the most recent data per source.",
            "# TYPE data_age_seconds gauge",
            'data_age_seconds{source="firms"} 0',
            'data_age_seconds{source="open_meteo"} 0',
            "# HELP ingestion_total Successful/errored ingestions per source.",
            "# TYPE ingestion_total counter",
            'ingestion_total{source="firms",status="success"} 0',
            'ingestion_total{source="firms",status="error"} 0',
            'ingestion_total{source="open_meteo",status="success"} 0',
            'ingestion_total{source="open_meteo",status="error"} 0',
            "# HELP external_api_duration_seconds API call duration per source.",
            "# TYPE external_api_duration_seconds histogram",
            'external_api_duration_seconds{source="firms"} 0',
            'external_api_duration_seconds{source="open_meteo"} 0',
            "# HELP external_api_quota_used Quota used per source.",
            "# TYPE external_api_quota_used gauge",
            'external_api_quota_used{source="firms"} 0',
            'external_api_quota_used{source="open_meteo"} 0',
            "# HELP external_api_quota_limit Quota limit per source.",
            "# TYPE external_api_quota_limit gauge",
            'external_api_quota_limit{source="firms"} 0',
            'external_api_quota_limit{source="open_meteo"} 0',
            "# HELP grid_coverage_ratio Fraction of cells with valid data.",
            "# TYPE grid_coverage_ratio gauge",
            'grid_coverage_ratio{layer="hotspots"} 0',
            'grid_coverage_ratio{layer="weather"} 0',
        ],
    }


# ── Register routers (PHASE 1) ─────────────────────────────────────────
app.include_router(hotspots.router)
app.include_router(weather.router)
app.include_router(fwi.router)


# ── Endpoint: source configuration (BBOX) ──────────────────────────────
@app.get("/api/sources")
async def get_sources():
    """Return bounding boxes and configuration for each source."""
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
        "sources": {
            "firms": {"status": "not_configured", "quota_used": 0},
            "open_meteo": {"status": "not_configured", "quota_used": 0},
        },
    }
