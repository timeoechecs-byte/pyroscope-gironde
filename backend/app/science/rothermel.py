"""
Rothermel (1972) surface fire spread model — secondary engine.

Reference:
  Rothermel, R.C. (1972). A mathematical model for predicting fire spread
  in wildland fuels. USDA Forest Service, INT-115.

  Andrews, P.L. (2018). The Rothermel surface fire spread model and
  associated developments: A comprehensive explanation.
  USDA Forest Service, RMRS-GTR-371.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.science.fuel_models import FuelModel


@dataclass
class RothermelResult:
    """Complete Rothermel output for a single cell."""

    ros_m_min: float
    intensity_kw_m: float
    flame_length_m: float
    fuel_consumed_kg_m2: float
    wind_speed_kmh: float
    sb_fuel_code: int
    sb_fuel_name: str


class RothermelEngine:
    """Rothermel surface fire spread model.

    Uses Scott & Burgan (2005) 40 fire behavior fuel models.
    """

    def __init__(self, fuel_model: FuelModel | None = None):
        self.fuel_model = fuel_model

    def wind_at_fuel_level(self, wind_speed_10m: float) -> float:
        """Reduce 10m wind speed to mid-flame height.

        Standard reduction: wind speed at 6m ≈ 0.5 × wind_10m
        For Rothermel, the effective wind speed at mid-flame height
        depends on fuel bed depth and canopy cover.
        """
        if self.fuel_model and self.fuel_model.fuel_depth_cm > 30:
            return wind_speed_10m * 0.40  # deep fuel → less wind penetration
        return wind_speed_10m * 0.55

    def compute_ros(self, wind_speed_kmh: float, slope_pct: float = 0.0) -> float:
        """Compute Rate of Spread (m/min) using Rothermel equations.

        Simplified implementation based on the Scott & Burgan fuel models.
        The full Rothermel model requires:
        - Reaction intensity I_R (kJ/m²/min)
        - Propagating flux ratio ξ
        - Heat of pre-ignition Q_ig (kJ/kg)
        - Bulk density ρ_b (kg/m³)
        - Effective heating number ε
        - Wind coefficient φ_w
        - Slope coefficient φ_s

        For this implementation, we use the fuel model parameters
        to estimate a representative ROS.
        """
        if not self.fuel_model:
            return 1.0  # default low spread

        # Fuel bed characteristics from the assigned model
        load_1h = self.fuel_model.fuel_load_1h
        savr = self.fuel_model.savr
        depth = self.fuel_model.fuel_depth_cm / 100.0  # convert cm → m
        mo_ext = self.fuel_model.moisture_of_extinction

        # Base ROS from fuel model (empirical relationship)
        # Higher SAVR + higher load → faster spread
        # Simplified from Rothermel's reaction intensity equations
        base_ros = 0.5 + (load_1h * savr * depth) / 5000.0
        if savr > 0:
            base_ros = min(base_ros, 30.0)

        # Wind multiplier (exponential, per Rothermel φ_w)
        fuel_wind = self.wind_at_fuel_level(wind_speed_kmh)
        wind_mult = 1.0 + 0.15 * (fuel_wind ** 0.5)  # simplified φ_w

        # Slope multiplier (Rothermel φ_s ~ 5.3 × tan(slope))
        slope_mult = 1.0 + 5.3 * math.tan(slope_pct / 100.0)

        ros = base_ros * wind_mult * slope_mult
        return max(0.1, round(ros, 2))

    def compute_intensity(self, ros_m_min: float) -> float:
        """Compute Byram fireline intensity (kW/m)."""
        if not self.fuel_model:
            return 0.0

        H = 18000.0  # kJ/kg
        w = self.fuel_model.fuel_load_1h  # kg/m²
        R_ms = ros_m_min / 60.0
        I = H * w * R_ms
        return round(I / 1000.0, 2)

    def compute_flame_length(self, intensity_kw_m: float) -> float:
        """Flame length from Byram intensity (Rothermel secondary)."""
        if intensity_kw_m <= 0:
            return 0.0
        L = 0.0775 * (intensity_kw_m ** 0.46)
        return round(L, 2)

    def compute(self, wind_speed_kmh: float, slope_pct: float = 0.0) -> RothermelResult:
        """Full Rothermel computation."""
        ros = self.compute_ros(wind_speed_kmh, slope_pct)
        intensity = self.compute_intensity(ros)
        flame_length = self.compute_flame_length(intensity)

        fuel_consumed = 0.0
        if self.fuel_model:
            fuel_consumed = self.fuel_model.fuel_load_1h

        return RothermelResult(
            ros_m_min=ros,
            intensity_kw_m=intensity,
            flame_length_m=flame_length,
            fuel_consumed_kg_m2=fuel_consumed,
            wind_speed_kmh=wind_speed_kmh,
            sb_fuel_code=self.fuel_model.sb_code if self.fuel_model else 99,
            sb_fuel_name=self.fuel_model.sb_name if self.fuel_model else "default",
        )
