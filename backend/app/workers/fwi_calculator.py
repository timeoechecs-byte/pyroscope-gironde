"""
FWI Calculator — Daily CFFWIS computation worker.

Responsibilities:
1. Initialise l'historique FWI (≥ 60 jours d'ERA5) au premier démarrage.
2. Calcule le FWI quotidien à midi pour chaque cellule de la grille.
3. Persiste l'état dans TimescaleDB.
4. Métrique Prometheus : fwi_recursion_gap_days.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.science.cffwis import compute_all_fwi, FWIState

logger = logging.getLogger("pyroscope.worker.fwi")

# ── Grid configuration ─────────────────────────────────────────────────
# BBOX_CALCUL: lon [-1.55, 0.60] × lat [43.97, 45.78]
# Grille: 250 m → ~ 270 km² / 0.0625 km² ≈ ~4300 cells
GRID_LON_MIN = -1.55
GRID_LAT_MIN = 43.97
GRID_LON_MAX = 0.60
GRID_LAT_MAX = 45.78
GRID_CELL_SIZE_DEG = 0.00225  # ~250m at 45°N

REF_LATITUDE = 44.9  # Gironde center ~45°N


def generate_grid_cells() -> list[tuple[int, float, float]]:
    """Generate (cell_id, lon, lat) for all grid cells in BBOX_CALCUL."""
    cells: list[tuple[int, float, float]] = []
    cell_id = 0
    lon = GRID_LON_MIN
    while lon < GRID_LON_MAX:
        lat = GRID_LAT_MIN
        while lat < GRID_LAT_MAX:
            cells.append((cell_id, round(lon, 4), round(lat, 4)))
            cell_id += 1
            lat += GRID_CELL_SIZE_DEG
        lon += GRID_CELL_SIZE_DEG
    return cells


class FWICalculator:
    """
    Computes daily CFFWIS for all grid cells.

    Maintains the recursive state (FFMC, DMC, DC) in memory,
    persists completed days to configured storage.
    """

    def __init__(self):
        self._state: dict[int, FWIState] = {}
        self._initialized = False

    async def initialize_history(self, days: int = 60) -> None:
        """
        Initialise FWI state with at least `days` of historical data.

        Requires ERA5 reanalysis data loaded in weather_series table.
        Falls back to Open-Meteo Historical API if ERA5 unavailable.
        """
        logger.info("fwi.history_init", days=days)
        # PHASE 2 stub — loads from database when available
        self._initialized = True
        logger.info("fwi.history_done")

    async def compute_day(
        self,
        temperature: float,
        humidity: float,
        wind_speed: float,
        rain: float,
        cell_id: int,
        month: int,
    ) -> FWIState:
        """Compute today's FWI for a single cell."""
        prev = self._state.get(cell_id)
        prev_ffmc = prev.ffmc if prev else 85.0
        prev_dmc = prev.dmc if prev else 6.0
        prev_dc = prev.dc if prev else 15.0

        state = compute_all_fwi(
            temperature=temperature,
            humidity=humidity,
            wind_speed=wind_speed,
            rain=rain,
            prev_ffmc=prev_ffmc,
            prev_dmc=prev_dmc,
            prev_dc=prev_dc,
            latitude=REF_LATITUDE,
            month=month,
        )
        state.cell_id = cell_id
        self._state[cell_id] = state
        return state

    async def compute_all_cells(self, weather_data: dict[int, dict]) -> list[FWIState]:
        """Compute FWI for all cells given weather data dict."""
        results = []
        today = date.today()
        month = today.month

        for cell_id, w in weather_data.items():
            state = await self.compute_day(
                temperature=w["temperature"],
                humidity=w["humidity"],
                wind_speed=w["wind_speed"],
                rain=w.get("rain", 0.0),
                cell_id=cell_id,
                month=month,
            )
            results.append(state)

        return results

    def get_latest(self, cell_id: int) -> FWIState | None:
        """Get latest FWI state for a cell."""
        return self._state.get(cell_id)

    def get_recursion_gap_days(self) -> int:
        """
        Check for gaps in the recursive chain.

        A gap > 1 day means the FFMC/DMC/DC chain is broken and
        should be flagged via Prometheus metric fwi_recursion_gap_days.
        """
        # PHASE 2 stub — queries TimescaleDB in production
        return 0


# ── Scheduled task runner ──────────────────────────────────────────────

_fwi_calculator: FWICalculator | None = None


def get_fwi_calculator() -> FWICalculator:
    global _fwi_calculator
    if _fwi_calculator is None:
        _fwi_calculator = FWICalculator()
    return _fwi_calculator


async def daily_fwi_job():
    """Scheduled job: run at noon each day to calculate FWI."""
    logger.info("fwi.daily_job_start")
    calc = get_fwi_calculator()

    if not calc._initialized:
        await calc.initialize_history()

    # PHASE 2: fetch weather data from database for all cells
    # then compute FWI for each and persist to TimescaleDB

    logger.info("fwi.daily_job_done")
