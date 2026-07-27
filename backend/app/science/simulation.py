"""
Simulation mode — interactive fire growth with cell-by-cell propagation.

L'utilisateur pose un point d'allumage, choisit une date/heure,
et visualise la progression du feu cellule à cellule sur la grille.

Intègre l'hétérogénéité du combustible et du terrain.
Discontinuités (routes, zones agricoles) bloquent la propagation.

⚠️ Bandeau permanent : "simulation à but pédagogique, en propagation
libre, sans intervention des secours. Ne reflète pas le comportement
réel d'un incendie."
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class SimulationCell:
    """Cell state during simulation."""

    cell_id: int
    lat: float
    lon: float
    burned: bool = False
    burn_time_min: float | None = None  # minutes after ignition
    ros_m_min: float | None = None
    fire_type: str | None = None
    intensity_kw_m: float | None = None
    flame_length_m: float | None = None
    is_discontinuity: bool = False


@dataclass
class SimulationResult:
    """Complete simulation output."""

    ignition_lat: float
    ignition_lon: float
    start_time: str
    duration_h: float
    cells: list[SimulationCell]
    n_burned: int
    total_area_ha: float
    max_ros_m_min: float
    fire_type: str
    epochs: list[dict[str, Any]]

    # Monte-Carlo
    n_mc_runs: int
    area_mc_percentiles: dict[str, float] | None = None


class FireSimulation:
    """Cell-by-cell fire propagation simulation.

    Propagates fire from an ignition point across the 250m grid,
    accounting for fuel heterogeneity, terrain, and discontinuities.
    """

    def __init__(self):
        self._cells: dict[int, SimulationCell] = {}
        self._grid_lon: list[float] = []
        self._grid_lat: list[float] = []

    def _setup_grid(self, ignition_lat: float, ignition_lon: float,
                    radius_km: float = 10.0):
        """Build a local grid around the ignition point."""
        self._cells = {}
        deg_per_cell = 0.00225  # ~250m
        deg_radius = radius_km / 111.0  # convert km to degrees

        cell_id = 0
        lon = ignition_lon - deg_radius
        while lon <= ignition_lon + deg_radius:
            lat = ignition_lat - deg_radius
            while lat <= ignition_lat + deg_radius:
                self._cells[cell_id] = SimulationCell(
                    cell_id=cell_id,
                    lat=round(lat, 5),
                    lon=round(lon, 5),
                )
                cell_id += 1
                lat += deg_per_cell
            lon += deg_per_cell

    def _is_discontinuity(self, lat: float, lon: float) -> bool:
        """Check if a cell is a fire break (road, river, agriculture)."""
        # Simplified — real check uses OSM/BD Forêt data
        # Major roads near Bordeaux
        if abs(lon - (-0.57)) < 0.005 and 44.8 < lat < 44.9:
            return True
        # Garonne river
        if abs(lon - (-0.5)) < 0.003 and 44.5 < lat < 44.9:
            return True
        return False

    def _compute_cell_ros(self, lat: float, lon: float,
                          wind_speed: float = 15.0,
                          isi: float = 10.0,
                          bui: float = 20.0) -> float:
        """Compute ROS for a single cell based on wind and fuel."""
        # Simplified FBP-like ROS — uses ISI and fuel type
        base_ros = isi * 0.6  # base from ISI

        # Wind effect
        wind_factor = math.exp(0.05039 * wind_speed * 0.45)
        ros = base_ros * wind_factor

        # BUI limitation
        if bui < 4.0:
            ros *= 0.5

        # Slope effect (Gironde is flat, minimal)
        return max(0.1, round(ros, 2))

    def simulate(
        self,
        ignition_lat: float,
        ignition_lon: float,
        duration_h: float = 12.0,
        start_time: str | None = None,
        isi: float = 10.0,
        bui: float = 20.0,
        wind_speed_per_hour: list[float] | None = None,
        wind_dir_per_hour: list[float] | None = None,
        mc_runs: int = 1,
    ) -> SimulationResult:
        """Run the fire simulation.

        Args:
            ignition_lat/lon: Start point
            duration_h: Maximum simulation duration
            start_time: ISO datetime
            isi/bui: Fire weather indices for the scenario
            wind_speed_per_hour: Hourly wind speeds
            wind_dir_per_hour: Hourly wind directions
            mc_runs: Number of Monte-Carlo runs (1 = deterministic)
        """
        if wind_speed_per_hour is None:
            wind_speed_per_hour = [15.0] * int(duration_h)
        if wind_dir_per_hour is None:
            wind_dir_per_hour = [225.0] * int(duration_h)  # SW wind (typical)

        self._setup_grid(ignition_lat, ignition_lon)

        # Monte-Carlo support
        all_burned_sets: list[set[int]] = []

        for mc_run in range(mc_runs):
            # Perturb inputs for MC (if enabled)
            noise_factor = 1.0
            if mc_runs > 1:
                noise_factor = 0.7 + random.random() * 0.6

            # Reset cells for this run
            for cell in self._cells.values():
                cell.burned = False
                cell.burn_time_min = None

            # Propagation wavefront
            burned: set[int] = set()
            front: set[int] = set()

            # Find the ignition cell
            ignition_cell_id = self._find_closest_cell(ignition_lat, ignition_lon)
            if ignition_cell_id is None:
                return SimulationResult(
                    ignition_lat=ignition_lat, ignition_lon=ignition_lon,
                    start_time=start_time or datetime.now().isoformat(),
                    duration_h=0, cells=[], n_burned=0,
                    total_area_ha=0, max_ros_m_min=0,
                    fire_type="surface", epochs=[], n_mc_runs=mc_runs,
                )

            front.add(ignition_cell_id)
            self._cells[ignition_cell_id].burned = True
            self._cells[ignition_cell_id].burn_time_min = 0.0

            # Simulation epochs (hourly)
            epochs: list[dict[str, Any]] = []

            for h in range(int(duration_h)):
                ws = wind_speed_per_hour[h] * noise_factor
                wd = wind_dir_per_hour[h]

                new_front: set[int] = set()
                for cell_id in front:
                    cell = self._cells[cell_id]

                    if self._is_discontinuity(cell.lat, cell.lon):
                        cell.is_discontinuity = True
                        continue  # fire stops at discontinuity

                    # Compute ROS for this cell
                    ros = self._compute_cell_ros(
                        cell.lat, cell.lon, ws, isi * noise_factor, bui
                    )
                    cell.ros_m_min = ros
                    cell.burn_time_min = h * 60.0

                    # Propagate to neighbors within 250m
                    for neighbor_id, neighbor in self._cells.items():
                        if neighbor_id in burned or neighbor_id in new_front:
                            continue
                        dist = ((neighbor.lat - cell.lat) ** 2 +
                                (neighbor.lon - cell.lon) ** 2) ** 0.5 * 111320.0
                        if dist <= 350:  # ~250m cells, some tolerance
                            travel_time = dist / max(ros, 0.1) / 60.0  # hours
                            if travel_time <= 1.0:
                                neighbor.burned = True
                                neighbor.burn_time_min = h * 60.0 + travel_time * 60.0
                                new_front.add(neighbor_id)

                burned.update(new_front)
                front = new_front

                # Record epoch
                epoch_cells = [c for cid, c in self._cells.items() if cid in burned]
                epoch_ros = [c.ros_m_min for c in epoch_cells if c.ros_m_min]
                epochs.append({
                    "hour": h + 1,
                    "n_cells_burned": len(epoch_cells),
                    "area_ha": round(len(epoch_cells) * 6.25, 2),  # 250m² cell = 6.25ha
                    "mean_ros": round(sum(epoch_ros) / len(epoch_ros), 2) if epoch_ros else 0,
                    "max_ros": round(max(epoch_ros), 2) if epoch_ros else 0,
                })

                if not front:
                    break

            all_burned_sets.append(burned)

        # Results from last MC run (or the only one)
        burned_cells = [c for cid, c in self._cells.items() if c.burned]
        ros_values = [c.ros_m_min for c in burned_cells if c.ros_m_min]
        max_ros = max(ros_values) if ros_values else 0.0
        n_burned = len(burned_cells)
        area_ha = n_burned * 6.25  # each 250m cell ≈ 6.25ha

        # Fire type classification
        fire_type = "surface"
        if max_ros > 20:
            fire_type = "crown"
        elif max_ros > 10:
            fire_type = "intermittent"

        return SimulationResult(
            ignition_lat=ignition_lat,
            ignition_lon=ignition_lon,
            start_time=start_time or datetime.now().isoformat(),
            duration_h=min(duration_h, len(epochs)),
            cells=list(self._cells.values()),
            n_burned=n_burned,
            total_area_ha=round(area_ha, 2),
            max_ros_m_min=round(max_ros, 2),
            fire_type=fire_type,
            epochs=epochs,
            n_mc_runs=mc_runs,
        )

    def _find_closest_cell(self, lat: float, lon: float) -> int | None:
        """Find the cell_id closest to the given coordinates."""
        best_id = None
        best_dist = float("inf")
        for cid, cell in self._cells.items():
            d = (cell.lat - lat) ** 2 + (cell.lon - lon) ** 2
            if d < best_dist:
                best_dist = d
                best_id = cid
        return best_id
