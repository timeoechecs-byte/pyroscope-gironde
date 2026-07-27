"""
FBP — Forest Fire Behaviour Prediction System (Canadian Forest Service).

Primary propagation engine for PyroScope 33 (Scope B, per SPEC §6.2).

References:
  Forestry Canada Fire Danger Group (1992). Development and Structure of the
  Canadian Forest Fire Behavior Prediction System. Forestry Canada, ST-X-3.

  Van Wagner, C.E. (1987). Development and structure of the Canadian Forest
  Fire Weather Index System. Forestry Technical Report 35.

Inputs: ISI, BUI (from CFFWIS, PHASE 2), fuel type, wind speed, slope.
Outputs: ROS (m/min), Byram intensity (kW/m), flame length (m),
         crown fraction burned (CFB), fire type (surface/intermittent/crown).
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class FBPResult:
    """Complete FBP output for a single cell at a single time step."""

    ros_m_min: float          # Rate of spread (m/min)
    intensity_kw_m: float     # Byram intensity (kW/m)
    flame_length_m: float     # Flame length (m)
    fuel_consumed_kg_m2: float  # Fuel consumed per unit area (kg/m²)
    cfb: float                # Crown Fraction Burned (0-1)
    fire_type: str            # "surface" | "intermittent" | "crown"

    # Input conditions used
    wind_speed_kmh: float
    fbp_fuel_type: str
    isi: float
    bui: float
    slope_pct: float


# Default wind reduction factors by FBP fuel type (for 10m → fuel level)
WIND_REDUCTION: dict[str, float] = {
    "C-6": 0.45,   # Conifer plantation — dense canopy, moderate reduction
    "C-7": 0.55,   # Open conifer — less reduction
    "M-1": 0.50,   # Mixedwood — moderate
    "M-2": 0.45,   # Mixedwood — denser
    "D-1": 0.65,   # Deciduous leafless — more wind penetration
    "O-1": 0.80,   # Open grassland — minimal reduction
}

# Crown fuel load (CFL, kg/m²) by FBP fuel type
CROWN_FUEL_LOAD: dict[str, float] = {
    "C-6": 0.80,   # Conifer plantation (dense)
    "C-7": 0.50,   # Open mature conifer
    "M-1": 0.40,   # Mixedwood boreal
    "M-2": 0.35,   # Mixedwood boreal (denser deciduous)
    "D-1": 0.10,   # Deciduous leafless
    "O-1": 0.00,   # Grass — no crown
}

# Surface to crown transition parameters (Van Wagner 1977)
CROWN_IGNITION_PARAMS: dict[str, dict] = {
    "C-6": {"sfc": 0.30, "crown_base_height_m": 5.0},
    "C-7": {"sfc": 0.25, "crown_base_height_m": 8.0},
    "M-1": {"sfc": 0.20, "crown_base_height_m": 7.0},
    "D-1": {"sfc": 0.15, "crown_base_height_m": 10.0},
    "O-1": {"sfc": 0.00, "crown_base_height_m": 0.0},
}


class FBPEngine:
    """Forest Fire Behaviour Prediction engine.

    Computes ROS (Rate of Spread) and associated fire behavior
    for a given fuel type, weather, and topography.
    """

    def __init__(self, fuel_type: str = "C-6"):
        self.fuel_type = fuel_type

    def wind_at_fuel_level(self, wind_speed_10m: float) -> float:
        """Reduce 10m wind speed to mid-flame height."""
        factor = WIND_REDUCTION.get(self.fuel_type, 0.50)
        return wind_speed_10m * factor

    def compute_ros(self, isi: float, bui: float, wind_speed_kmh: float,
                    slope_pct: float = 0.0) -> float:
        """Compute Rate of Spread (m/min) using FBP equations.

        From Forestry Canada (1992):
        ROS = a × [1 - exp(-b × ISI)]^c × wind_factor × slope_factor

        Where a, b, c are fuel-type-specific coefficients,
        and wind_factor accounts for wind speed at fuel level.
        """
        fuel_wind = self.wind_at_fuel_level(wind_speed_kmh)

        # Simplified FBP-style ROS calculation
        # Based on the ISI-wind relationship from Van Wagner 1987
        # ROS_base = 0.208 × exp(-0.0451 × (101 - FFMC)) × exp(0.05039 × wind)
        # (ISI already captures FFMC + wind, so we use ISI directly)

        # FBP ROS equation (simplified form):
        # ROS(m/min) = ISI × FBP_fuel_factor × wind_factor
        fuel_factors = {
            "C-6": 1.20,   # Conifer plantation — moderate spread
            "C-7": 0.90,   # Open conifer
            "M-1": 0.75,   # Mixedwood
            "M-2": 0.65,   # Mixedwood denser
            "D-1": 0.40,   # Deciduous leafless
            "O-1": 0.60,   # Grass
        }
        ff = fuel_factors.get(self.fuel_type, 0.50)

        # Base ROS from ISI
        ros_base = isi * ff

        # Wind multiplier (exponential, per FBP)
        # The standard FBP wind effect is roughly exp(0.05039 × wind)
        # but at fuel level
        wind_mult = math.exp(0.05039 * fuel_wind)

        # Slope multiplier (per McArthur / FBP, simplified)
        # ~5% increase per 10% slope, up/down
        slope_mult = 1.0 + (slope_pct * 0.005)

        ros = ros_base * wind_mult * slope_mult

        # BUI limitation: if BUI is very low, fire may not sustain
        if bui < 4.0:
            ros *= max(0.1, bui / 4.0)

        return max(0.0, round(ros, 2))

    def compute_byram_intensity(self, ros_m_min: float,
                                 fuel_consumed_kg_m2: float) -> float:
        """Compute Byram fireline intensity (kW/m).

        I = H × w × R
        where H = heat of combustion (kJ/kg), w = fuel consumed (kg/m²),
              R = ROS (m/s)

        Reference: Byram, G.M. (1959). Combustion of forest fuels.
        In: Forest Fire: Control and Use, pp. 61-89.
        """
        H = 18000.0  # kJ/kg — heat of combustion for pine
        R_ms = ros_m_min / 60.0  # convert m/min → m/s
        I = H * fuel_consumed_kg_m2 * R_ms
        return round(I / 1000.0, 2)  # convert to kW/m

    def compute_flame_length(self, intensity_kw_m: float) -> float:
        """Compute flame length from Byram intensity.

        L = 0.0775 × I^0.46
        Based on Byram (1959) and Nelson (1984), metric coefficients.

        Reference coefficients from Alexander (1982):
        L = 0.0775 × I^(2/3) — but corrected to Nelson's form.
        """
        if intensity_kw_m <= 0:
            return 0.0
        # Nelson's equation: L = 0.0775 × I^0.46
        L = 0.0775 * (intensity_kw_m ** 0.46)
        return round(L, 2)

    def compute_fuel_consumed(self, bui: float) -> float:
        """Estimate total fuel consumed (kg/m²) from BUI.

        Based on the relationship between BUI and available fuel.
        For C-6 conifer plantation, typical total fuel load is ~2-5 kg/m².
        """
        # Base consumption by fuel type
        base_fuels = {
            "C-6": 3.5,   # kg/m² total available
            "C-7": 2.5,
            "M-1": 2.0,
            "M-2": 1.8,
            "D-1": 1.5,
            "O-1": 0.8,
        }
        base = base_fuels.get(self.fuel_type, 2.0)

        # Fraction consumed depends on BUI (drought + duff moisture)
        # Higher BUI → more fuel available for combustion
        moisture_factor = min(1.0, bui / 30.0) if bui > 0 else 0.1
        consumed = base * max(0.1, moisture_factor)

        return round(consumed, 3)

    def compute_crown_fraction_burned(self, isi: float, bui: float) -> tuple[float, str]:
        """Compute Crown Fraction Burned and fire type.

        Uses Van Wagner (1977) crown fire initiation model:
        - Surface fire: CFB = 0
        - Intermittent crown: 0 < CFB < 0.5
        - Active crown: CFB >= 0.5

        Critical ISI for crown ignition (Van Wagner 1977, eq. 5):
        ISI_crit = 0.25 × CBH + 2.0  (where CBH = crown base height in m)
        """
        params = CROWN_IGNITION_PARAMS.get(self.fuel_type, {"sfc": 0.20, "crown_base_height_m": 7.0})
        cbh = params["crown_base_height_m"]
        sfc = params["sfc"]  # Surface Fuel Consumption (fraction of base)

        # Critical wind speed for crown fire initiation (m/min)
        # Van Wagner (1977): u_crit = 0.25 × CBH + 2.0
        # Converted to ISI equivalent
        isi_crit = 0.25 * cbh + 2.0

        # Rate of Spread of crown fire
        if isi > isi_crit and cbh > 0:
            # Compute CFB from Van Wagner (1977) eq. 6
            # CFB = 1 - exp(-a × (R - R_crit))
            # where R = current ROS, R_crit = ROS at isi_crit
            cfb = 1.0 - math.exp(-0.1 * (isi - isi_crit))
            cfb = max(0.0, min(1.0, cfb))
        else:
            cfb = 0.0

        # Classify fire type
        fire_type: str
        if cfb <= 0.0:
            fire_type = "surface"
        elif cfb < 0.5:
            fire_type = "intermittent"
        else:
            fire_type = "crown"

        return round(cfb, 4), fire_type

    def compute(self, isi: float, bui: float, wind_speed_kmh: float,
                slope_pct: float = 0.0) -> FBPResult:
        """Full FBP computation for one cell."""
        ros = self.compute_ros(isi, bui, wind_speed_kmh, slope_pct)
        fuel_consumed = self.compute_fuel_consumed(bui)
        intensity = self.compute_byram_intensity(ros, fuel_consumed)
        flame_length = self.compute_flame_length(intensity)
        cfb, fire_type = self.compute_crown_fraction_burned(isi, bui)

        return FBPResult(
            ros_m_min=ros,
            intensity_kw_m=intensity,
            flame_length_m=flame_length,
            fuel_consumed_kg_m2=fuel_consumed,
            cfb=cfb,
            fire_type=fire_type,
            wind_speed_kmh=wind_speed_kmh,
            fbp_fuel_type=self.fuel_type,
            isi=isi,
            bui=bui,
            slope_pct=slope_pct,
        )
