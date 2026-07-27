"""
Open-Meteo Forecast API — gratuite, sans clé, usage non commercial (CC BY 4.0).

Modèle principal : meteofrance_arome_france_hd (~1.5 km).
Variables horaires par SPEC §5.2.
Échantillonnage sur BBOX_INGESTION (~40-60 points), interpolation spatiale.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.sources.base import BaseSource, SourceStatus

# ── Weather variables (SPEC §5.2) ───────────────────────────────────────
WEATHER_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "soil_moisture_0_to_7cm",
    "soil_temperature_0_to_7cm",
    "vapour_pressure_deficit",
    "et0_fao_evapotranspiration",
]

# Open-Meteo models available for comparison
FORECAST_MODELS = [
    "meteofrance_arome_france_hd",
    "meteofrance_arome_france",
    "icon_d2",
    "ecmwf_ifs025",
    "gfs_seamless",
]


# ── Data models ─────────────────────────────────────────────────────────


@dataclass
class WeatherPoint:
    """Weather data at a single grid point."""

    latitude: float
    longitude: float
    timestamp: datetime
    variables: dict[str, float | None]


@dataclass
class WeatherGrid:
    """Grid of weather data for the Gironde."""

    points: list[WeatherPoint]
    variable: str
    model: str
    source: SourceStatus


@dataclass
class WeatherSeries:
    """Time series for a single point."""

    latitude: float
    longitude: float
    variable: str
    timestamps: list[datetime]
    values: list[float | None]
    source: SourceStatus


# ── Grid sampling helpers ───────────────────────────────────────────────


def _sample_grid(
    lon_min: float,
    lat_min: float,
    lon_max: float,
    lat_max: float,
    n_points: int = 50,
) -> list[tuple[float, float]]:
    """Generate a regular grid of sampling points.

    Aims for ~40-60 points over the Gironde bbox for multi-coordinate queries.
    """
    import math

    area = (lon_max - lon_min) * (lat_max - lat_min)
    n_cols = max(5, int(math.sqrt(n_points * (lon_max - lon_min) / area)))
    n_rows = max(5, n_points // n_cols)

    points: list[tuple[float, float]] = []
    for i in range(n_rows):
        for j in range(n_cols):
            lon = lon_min + (j + 0.5) * (lon_max - lon_min) / n_cols
            lat = lat_min + (i + 0.5) * (lat_max - lat_min) / n_rows
            points.append((round(lon, 4), round(lat, 4)))
    return points


# ── Connector ────────────────────────────────────────────────────────────


class OpenMeteoSource(BaseSource):
    """Open-Meteo Forecast API connector."""

    def __init__(self):
        super().__init__(
            name="open_meteo",
            base_url="https://api.open-meteo.com/v1",
            cache_ttl=3600,  # 1 hour — matches ingestion cadence
            rate_per_second=10.0,
        )
        self._quota_limit = 10000  # Open-Meteo: 10k req/day free

    async def fetch_grid(
        self,
        bbox: tuple[float, float, float, float],
        variable: str = "temperature_2m",
        model: str = "meteofrance_arome_france_hd",
        forecast_hours: int = 48,
    ) -> WeatherGrid:
        """
        Fetch a weather variable on a regular grid covering the bbox.

        Uses Open-Meteo's multi-coordinate endpoint to batch points.
        """
        lon_min, lat_min, lon_max, lat_max = bbox
        grid_points = _sample_grid(lon_min, lat_min, lon_max, lat_max)

        # Open-Meteo multi-coordinate: join lats/lons with comma
        lats_str = ",".join(str(p[1]) for p in grid_points)
        lons_str = ",".join(str(p[0]) for p in grid_points)

        params: dict[str, Any] = {
            "latitude": lats_str,
            "longitude": lons_str,
            "hourly": variable,
            "models": model,
            "forecast_days": forecast_hours // 24 + 1,
            "timezone": "auto",
        }

        try:
            data = await self._request("GET", "forecast", params=params)
        except Exception as e:
            raise

        # Parse response
        points: list[WeatherPoint] = []
        expected_hours = forecast_hours + 1

        if isinstance(data, dict) and "hourly" in data:
            hourly = data["hourly"]
            times = hourly.get("time", [])
            values = hourly.get(variable, [])

            # The response can be 2D (n_points × n_timesteps) or flat
            if isinstance(times, list) and isinstance(values, list):
                n_timesteps = len(times)
                n_locations = len(values) // n_timesteps if n_timesteps > 0 else 0

                if n_locations > 0 and len(grid_points) >= n_locations:
                    for i in range(min(n_locations, len(grid_points))):
                        lat, lon = grid_points[i]
                        point_values = values[
                            i * n_timesteps : (i + 1) * n_timesteps
                        ]
                        timestamps = [
                            datetime.fromisoformat(t.replace("Z", "+00:00"))
                            for t in times[:len(point_values)]
                        ]
                        for ts, val in zip(timestamps, point_values):
                            points.append(
                                WeatherPoint(
                                    latitude=lat,
                                    longitude=lon,
                                    timestamp=ts,
                                    variables={variable: val},
                                )
                            )

        return WeatherGrid(
            points=points,
            variable=variable,
            model=model,
            source=self._build_status(available=len(points) > 0, latency=0),
        )

    async def fetch_point_series(
        self,
        latitude: float,
        longitude: float,
        variable: str = "temperature_2m",
        model: str = "meteofrance_arome_france_hd",
        forecast_hours: int = 48,
        past_days: int = 0,
    ) -> WeatherSeries:
        """Fetch hourly weather series for a single point."""
        params: dict[str, Any] = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": variable,
            "models": model,
            "forecast_days": forecast_hours // 24 + 1,
            "past_days": past_days,
            "timezone": "auto",
        }

        try:
            data = await self._request("GET", "forecast", params=params)
        except Exception as e:
            raise

        timestamps: list[datetime] = []
        values: list[float | None] = []

        if isinstance(data, dict) and "hourly" in data:
            hourly = data["hourly"]
            times = hourly.get("time", [])
            vals = hourly.get(variable, [])
            timestamps = [
                datetime.fromisoformat(t.replace("Z", "+00:00"))
                for t in times
            ]
            values = vals

        return WeatherSeries(
            latitude=latitude,
            longitude=longitude,
            variable=variable,
            timestamps=timestamps,
            values=values,
            source=self._build_status(available=len(values) > 0, latency=0),
        )

    async def fetch(self, **kwargs) -> Any:
        """Generic fetch — delegates to grid or point."""
        if "latitude" in kwargs and "longitude" in kwargs:
            return await self.fetch_point_series(
                kwargs["latitude"],
                kwargs["longitude"],
                kwargs.get("variable", "temperature_2m"),
                kwargs.get("model", "meteofrance_arome_france_hd"),
                kwargs.get("forecast_hours", 48),
            )
        return await self.fetch_grid(
            kwargs.get("bbox", (-1.35, 44.15, 0.35, 45.60)),
            kwargs.get("variable", "temperature_2m"),
            kwargs.get("model", "meteofrance_arome_france_hd"),
            kwargs.get("forecast_hours", 48),
        )


# ── Module-level factory ────────────────────────────────────────────────
_open_meteo_instance: OpenMeteoSource | None = None


def get_open_meteo_source() -> OpenMeteoSource:
    """Singleton factory."""
    global _open_meteo_instance
    if _open_meteo_instance is None:
        _open_meteo_instance = OpenMeteoSource()
    return _open_meteo_instance
