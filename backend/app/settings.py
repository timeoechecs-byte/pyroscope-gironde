"""
PyroScope 33 — Settings and configuration.

Loaded from environment variables with Pydantic Settings.
All BBOX constants are defined here per SPEC §1.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── Bounding boxes (SPEC §1) ──────────────────────────────────────
    # BBOX_DEPARTEMENT — display, attribution, announced perimeter
    BBOX_DEPARTEMENT_LON_MIN: float = -1.35
    BBOX_DEPARTEMENT_LAT_MIN: float = 44.15
    BBOX_DEPARTEMENT_LON_MAX: float = 0.35
    BBOX_DEPARTEMENT_LAT_MAX: float = 45.60

    # BBOX_CALCUL — scientific computation (departement + ~20 km margin)
    BBOX_CALCUL_LON_MIN: float = -1.55
    BBOX_CALCUL_LAT_MIN: float = 43.97
    BBOX_CALCUL_LON_MAX: float = 0.60
    BBOX_CALCUL_LAT_MAX: float = 45.78

    # BBOX_INGESTION — ingestion wide (+ ~45 km margin)
    BBOX_INGESTION_LON_MIN: float = -1.70
    BBOX_INGESTION_LAT_MIN: float = 43.80
    BBOX_INGESTION_LON_MAX: float = 0.95
    BBOX_INGESTION_LAT_MAX: float = 45.95

    # ── Grid ──────────────────────────────────────────────────────────
    GRID_SIZE_M: int = 250
    GRID_EPSG: int = 2154  # Lambert-93
    DISPLAY_EPSG: int = 4326

    # ── Environment ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"  # development | production
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Database ──────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql://pyroscope:pyroscope@localhost:5432/pyroscope"
    )

    # ── Redis ─────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── API keys ──────────────────────────────────────────────────────
    NASA_FIRMS_API_KEY: str = ""
    CDSE_CLIENT_ID: str = ""
    CDSE_CLIENT_SECRET: str = ""

    # ── Prometheus ────────────────────────────────────────────────────
    METRICS_ENABLED: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

# Convenience tuples for API responses
BBOX_DEPARTEMENT = (
    settings.BBOX_DEPARTEMENT_LON_MIN,
    settings.BBOX_DEPARTEMENT_LAT_MIN,
    settings.BBOX_DEPARTEMENT_LON_MAX,
    settings.BBOX_DEPARTEMENT_LAT_MAX,
)
BBOX_CALCUL = (
    settings.BBOX_CALCUL_LON_MIN,
    settings.BBOX_CALCUL_LAT_MIN,
    settings.BBOX_CALCUL_LON_MAX,
    settings.BBOX_CALCUL_LAT_MAX,
)
BBOX_INGESTION = (
    settings.BBOX_INGESTION_LON_MIN,
    settings.BBOX_INGESTION_LAT_MIN,
    settings.BBOX_INGESTION_LON_MAX,
    settings.BBOX_INGESTION_LAT_MAX,
)
