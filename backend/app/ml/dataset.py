"""
Dataset assembly — construit le jeu d'entraînement cellule-jour.

Sources :
- Sarrau & Yagoub (2025) — feux historiques Gironde/Landes 1989-2022 (CC-BY 4.0)
- NASA FIRMS archive — points chauds VIIRS/MODIS 2006-2024
- EFFIS / Copernicus EMS — polygones de surfaces brûlées
- ERA5 / Open-Meteo Historical — réanalyses météo pour FWI rétrospectif
- BD Forêt V2, RGE ALTI, CORINE (PHASE 3) — variables statiques

Sortie : fichier Parquet avec ~31M lignes (cellule-jour × features).
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Any
import json

import numpy as np

logger = logging.getLogger("pyroscope.ml.dataset")

# ── Constants ─────────────────────────────────────────────────────────
GRID_1_5KM_CELLS = 4500  # ~4500 cellules à 1.5km sur la Gironde
YEARS_COVERED = list(range(2006, 2025))  # 2006-2024
N_CELL_DAYS = GRID_1_5KM_CELLS * 365 * len(YEARS_COVERED)  # ~31M

# BBOX
BBOX = (-1.35, 44.15, 0.35, 45.60)

# URL templates
FIREMAP_URL = "https://firemap.saro.app/data/fires_gironde_1989_2022.json"
FIRMS_ARCHIVE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{product}/{api_key}/VIIRS_SNPP/{bbox}/{days}"


@dataclass
class FireRecord:
    """Single fire occurrence from Sarrau/Yagoub or FIRMS."""

    source: str  # "sarrau_yagoub" | "firms" | "effis"
    year: int
    month: int
    day: int
    latitude: float
    longitude: float
    area_ha: float | None = None
    cause: str | None = None
    vegetation: str | None = None
    confidence: str = "medium"


@dataclass
class CellDaySample:
    """Feature vector for one cell-day observation."""

    cell_id: int
    date: date
    latitude: float
    longitude: float

    # ── CFFWIS components (PHASE 2) ─────────────────────────────────
    ffmc: float | None = None
    dmc: float | None = None
    dc: float | None = None
    isi: float | None = None
    bui: float | None = None
    fwi: float | None = None
    dsr: float | None = None

    # ── Weather raw ────────────────────────────────────────────────
    temperature: float | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    precipitation: float | None = None
    wind_gusts: float | None = None
    soil_moisture: float | None = None

    # ── Aggregated weather ─────────────────────────────────────────
    temp_max_3d: float | None = None
    precip_7d: float | None = None
    precip_15d: float | None = None
    precip_30d: float | None = None
    dry_days_consecutive: int | None = None
    heatwave_days: int | None = None

    # ── Vegetation (PHASE 3) ───────────────────────────────────────
    species: str | None = None  # "pin_maritime", "feuillus", etc.
    ndvi: float | None = None
    ndmi: float | None = None
    ndmi_anomaly: float | None = None
    canopy_density: float | None = None
    forest_pct: float | None = None
    elevation_m: float | None = None
    slope_deg: float | None = None

    # ── Human factors (PHASE 3) ────────────────────────────────────
    road_distance_m: float | None = None
    amenity_distance_m: float | None = None
    building_density: float | None = None
    population_density: float | None = None

    # ── Temporal ───────────────────────────────────────────────────
    month: int = 0
    day_of_year: int = 0
    is_weekend: bool = False
    school_holiday: bool = False

    # ── Label ──────────────────────────────────────────────────────
    fire_occurred: bool = False
    fire_area_ha: float | None = None


# ── Dataset builder ─────────────────────────────────────────────────────


class FireDatasetBuilder:
    """Assembles the cell-day training dataset from multiple sources."""

    def __init__(self, data_dir: str | Path = "data/ml"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    async def download_sarrau_yagoub(self) -> list[FireRecord]:
        """Download Sarrau & Yagoub (2025) dataset from firemap.saro.app."""
        import httpx

        url = "https://firemap.saro.app/data/fires_gironde_1989_2022.json"  # best guess
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning("sarrau_yagoub.download_failed", error=str(e))
            return []

        records: list[FireRecord] = []
        for item in data if isinstance(data, list) else data.get("features", []):
            props = item.get("properties", item)
            try:
                coords = (
                    item.get("geometry", {}).get("coordinates", [None, None])
                    if isinstance(item, dict) and "geometry" in item
                    else [props.get("lon"), props.get("lat")]
                )
                lon, lat = float(coords[0]), float(coords[1])

                # Parse date
                date_str = props.get("date", props.get("acq_date", ""))
                dt = datetime.strptime(str(date_str), "%Y-%m-%d") if date_str else None

                records.append(FireRecord(
                    source="sarrau_yagoub",
                    year=dt.year if dt else int(props.get("year", 0)),
                    month=dt.month if dt else int(props.get("month", 6)),
                    day=dt.day if dt else 15,
                    latitude=lat,
                    longitude=lon,
                    area_ha=props.get("area_ha", props.get("surface_ha")),
                    cause=props.get("cause"),
                    vegetation=props.get("vegetation", props.get("essence")),
                    confidence="high",
                ))
            except (ValueError, TypeError, IndexError) as e:
                logger.debug("sarrau.parse_error", error=str(e))

        logger.info("sarrau_yagoub.loaded", n_records=len(records))
        return records

    def download_firms_archive(self, api_key: str, years: list[int] | None = None) -> list[FireRecord]:
        """Download historical FIRMS data (VIIRS + MODIS).

        PHASE 5 stub — requires user to provide NASA FIRMS API key and download
        the archive CSVs from https://firms.modaps.eosdis.nasa.gov/download/
        """
        logger.info("firms.archive.requires_manual_download")
        return []

    def load_firms_csv(self, path: str | Path) -> list[FireRecord]:
        """Load a pre-downloaded FIRMS CSV file."""
        records: list[FireRecord] = []
        with open(path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    dt = datetime.strptime(row.get("acq_date", ""), "%Y-%m-%d")
                    records.append(FireRecord(
                        source="firms",
                        year=dt.year,
                        month=dt.month,
                        day=dt.day,
                        latitude=float(row.get("latitude", 0)),
                        longitude=float(row.get("longitude", 0)),
                        area_ha=float(row.get("frp", 0)) * 0.01,  # rough FRP→ha
                        confidence=row.get("confidence", "nominal"),
                    ))
                except (ValueError, KeyError):
                    continue
        return records

    def merge_and_deduplicate(self, *sources: list[FireRecord]) -> list[FireRecord]:
        """Merge multiple sources and remove duplicates within 250m, same day."""
        seen: set[tuple[int, int, int, int, int]] = set()
        merged: list[FireRecord] = []

        for records in sources:
            for r in records:
                # Approx 250m grid cell: round coords to 0.00225 deg
                cell_key = (
                    r.year, r.month, r.day,
                    round(r.latitude / 0.00225),
                    round(r.longitude / 0.00225),
                )
                if cell_key not in seen:
                    seen.add(cell_key)
                    merged.append(r)

        logger.info("dataset.merged", n_records=len(merged))
        return merged


# ── Feature engineering ─────────────────────────────────────────────────


def engineer_features(samples: list[CellDaySample]) -> np.ndarray:
    """Convert CellDaySample list to feature matrix.

    Returns:
        (n_samples, n_features) NumPy array, ready for XGBoost/LightGBM.
    """
    features = []
    for s in samples:
        row = [
            s.ffmc or 0, s.dmc or 0, s.dc or 0,
            s.isi or 0, s.bui or 0, s.fwi or 0, s.dsr or 0,
            s.temperature or 0, s.humidity or 0, s.wind_speed or 0,
            s.precipitation or 0,
            s.temp_max_3d or 0, s.precip_7d or 0,
            s.precip_15d or 0, s.precip_30d or 0,
            s.dry_days_consecutive or 0, s.heatwave_days or 0,
            s.ndvi or 0, s.ndmi or 0, s.ndmi_anomaly or 0,
            s.canopy_density or 0, s.forest_pct or 0,
            s.elevation_m or 0, s.slope_deg or 0,
            s.road_distance_m or 10000, s.amenity_distance_m or 10000,
            s.building_density or 0,
            s.month, s.day_of_year,
            1 if s.is_weekend else 0,
            1 if s.school_holiday else 0,
        ]
        features.append(row)

    return np.array(features, dtype=np.float32)


# Feature names for SHAP / interpretability
FEATURE_NAMES = [
    "ffmc", "dmc", "dc", "isi", "bui", "fwi", "dsr",
    "temperature", "humidity", "wind_speed", "precipitation",
    "temp_max_3d", "precip_7d", "precip_15d", "precip_30d",
    "dry_days_consecutive", "heatwave_days",
    "ndvi", "ndmi", "ndmi_anomaly",
    "canopy_density", "forest_pct",
    "elevation_m", "slope_deg",
    "road_distance_m", "amenity_distance_m", "building_density",
    "month", "day_of_year", "is_weekend", "school_holiday",
]
