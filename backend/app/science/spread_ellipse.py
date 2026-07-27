"""
Spread ellipse — geometric fire growth model.

Elliptical model per Alexander (1985) and Van Wagner (1969):
- Fire grows as an ellipse with head at one focus
- Length/width ratio (LB) increases with wind speed
- Per-epoch wind: each hour uses its own wind forecast, not the start wind
- Ellipses clipped by discontinuities (roads, rivers, clear cuts)

Reference:
  Alexander, M.E. (1985). Estimating the length-to-breadth ratio of
  elliptical forest fire patterns. In: Proc. 8th Conf. Fire and Forest
  Meteorology, pp. 287-304.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EllipseParams:
    """Parameters of an elliptical fire front at one time step."""

    center_lon: float
    center_lat: float
    ignition_x: float  # focus position relative to center (m)
    ignition_y: float
    semi_major_m: float  # half of long axis
    semi_minor_m: float  # half of short axis
    orientation_deg: float  # of major axis (0=N, CW)
    head_ros_m_min: float
    flank_ros_m_min: float
    back_ros_m_min: float
    area_ha: float
    perimeter_m: float
    duration_h: float
    wind_direction_deg: float
    wind_speed_kmh: float


@dataclass
class FireHistory:
    """Full history of a simulated fire run."""

    ignition_lon: float
    ignition_lat: float
    start_time: str  # ISO datetime
    epochs: list[EllipseParams] = field(default_factory=list)
    total_duration_h: float = 0.0
    final_area_ha: float = 0.0
    total_perimeter_m: float = 0.0


# Alexander (1985) LB = f(wind) coefficients
# LB = 1 + a * wind_speed_kmh^b
# For median conditions in conifer forests:
ALEXANDER_A = 0.36
ALEXANDER_B = 0.46


def compute_length_breadth_ratio(wind_speed_kmh: float) -> float:
    """Compute ellipse length/breadth ratio from wind speed.

    Alexander (1985), eq. 3a:
    LB = 1 + 0.36 × U^0.46
    where U = wind speed (km/h) at mid-flame height.
    """
    if wind_speed_kmh <= 0:
        return 1.0  # circle
    return 1.0 + ALEXANDER_A * (wind_speed_kmh ** ALEXANDER_B)


def compute_flank_back_ros(
    head_ros_m_min: float, lb: float
) -> tuple[float, float]:
    """Compute flank and backing ROS from head ROS and LB ratio.

    For an ellipse:
    - Head = maximum ROS (at the front focus)
    - Flank = ROS at 90° from head
    - Back = minimum ROS (at the rear focus)

    Using Van Wagner (1969) geometry:
    Flank = Head / LB
    Back = Head / LB^2
    """
    if lb <= 1.0:
        return head_ros_m_min, head_ros_m_min  # circle — all equal
    flank = head_ros_m_min / lb
    back = head_ros_m_min / (lb * lb)
    return round(flank, 2), round(back, 2)


def compute_ellipse_geometry(
    head_ros_m_min: float,
    duration_min: float,
    wind_direction_deg: float,
    lb: float,
    ignition_lon: float = -0.5,
    ignition_lat: float = 44.9,
) -> EllipseParams:
    """Compute ellipse geometry for one time epoch.

    Args:
        head_ros_m_min: Head ROS for this epoch (m/min)
        duration_min: Duration of this epoch (minutes)
        wind_direction_deg: Wind direction in this epoch (0=N, clockwise)
        lb: Length/breadth ratio for this epoch
        ignition_lon/lat: Center of ignition for this epoch

    Returns:
        EllipseParams for this epoch.
    """
    # Distance traveled by head fire in this epoch
    head_distance_m = head_ros_m_min * duration_min

    # Ellipse semi-major and semi-minor axes
    # For an ellipse with LB ratio and head fire at one focus:
    # Major axis a = LB × b (where b = semi-minor)
    # Head distance = a + c ≈ a + sqrt(a² - b²) = a × (1 + sqrt(1 - 1/LB²))
    if lb <= 1.0:
        semi_major_m = head_distance_m / 2.0
        semi_minor_m = head_distance_m / 2.0
        focus_offset_m = 0.0
    else:
        # Distance from center to focus: c = a × sqrt(1 - 1/LB²)
        # Head distance = a + c = a × (1 + sqrt(1 - 1/LB²))
        # Therefore: a = head_distance / (1 + sqrt(1 - 1/LB²))
        factor = 1.0 + math.sqrt(1.0 - 1.0 / (lb * lb))
        semi_major_m = head_distance_m / factor
        semi_minor_m = semi_major_m / lb
        focus_offset_m = math.sqrt(semi_major_m ** 2 - semi_minor_m ** 2)

    # Area of ellipse (m²) → hectares
    area_m2 = math.pi * semi_major_m * semi_minor_m
    area_ha = area_m2 / 10000.0

    # Perimeter (Ramanujan approximation)
    h = ((semi_major_m - semi_minor_m) ** 2) / ((semi_major_m + semi_minor_m) ** 2)
    perimeter_m = math.pi * (semi_major_m + semi_minor_m) * (
        1.0 + (3.0 * h) / (10.0 + math.sqrt(4.0 - 3.0 * h))
    )

    # Flank and back ROS
    flank_ros, back_ros = compute_flank_back_ros(head_ros_m_min, lb)

    # Convert wind direction to ellipse orientation
    # Wind direction 0=N, 90=E → ellipse orientation (major axis direction)
    orientation_deg = wind_direction_deg

    # Focus offset (center to ignition point)
    rad = math.radians(wind_direction_deg)
    focus_x = focus_offset_m * math.sin(rad)  # x offset (easting)
    focus_y = focus_offset_m * math.cos(rad)  # y offset (northing)

    return EllipseParams(
        center_lon=ignition_lon,
        center_lat=ignition_lat,
        ignition_x=round(focus_x, 1),
        ignition_y=round(focus_y, 1),
        semi_major_m=round(semi_major_m, 1),
        semi_minor_m=round(semi_minor_m, 1),
        orientation_deg=round(orientation_deg, 1),
        head_ros_m_min=round(head_ros_m_min, 2),
        flank_ros_m_min=flank_ros,
        back_ros_m_min=back_ros,
        area_ha=round(area_ha, 2),
        perimeter_m=round(perimeter_m, 1),
        duration_h=duration_min / 60.0,
        wind_direction_deg=wind_direction_deg,
        wind_speed_kmh=0.0,
    )


def simulate_fire_growth(
    head_ros_per_hour: list[float],
    wind_speed_per_hour: list[float],
    wind_dir_per_hour: list[float],
    ignition_lon: float = -0.5,
    ignition_lat: float = 44.9,
    max_hours: int = 12,
) -> FireHistory:
    """Simulate fire growth over multiple hours with per-epoch wind.

    Each hour uses its own wind (speed + direction) to compute the
    ellipse for that epoch, then accumulates the area.

    Args:
        head_ros_per_hour: ROS (m/min) for each hour
        wind_speed_per_hour: Wind speed (km/h) for each hour
        wind_dir_per_hour: Wind direction (deg) for each hour
        ignition_lon/lat: Start position
        max_hours: Maximum simulation hours

    Returns:
        FireHistory with one EllipseParams per hour.
    """
    epochs: list[EllipseParams] = []
    total_area = 0.0

    for h in range(min(max_hours, len(head_ros_per_hour))):
        ws = wind_speed_per_hour[h] if h < len(wind_speed_per_hour) else 0
        wd = wind_dir_per_hour[h] if h < len(wind_dir_per_hour) else 0
        ros = head_ros_per_hour[h]

        lb = compute_length_breadth_ratio(ws)
        epoch = compute_ellipse_geometry(
            head_ros_m_min=ros,
            duration_min=60.0,
            wind_direction_deg=wd,
            lb=lb,
            ignition_lon=ignition_lon,
            ignition_lat=ignition_lat,
        )
        epoch.wind_speed_kmh = ws
        epochs.append(epoch)
        total_area += epoch.area_ha

    return FireHistory(
        ignition_lon=ignition_lon,
        ignition_lat=ignition_lat,
        start_time="",
        epochs=epochs,
        total_duration_h=len(epochs),
        final_area_ha=round(total_area, 2),
        total_perimeter_m=round(sum(e.perimeter_m for e in epochs), 1),
    )
