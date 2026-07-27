"""
Coefficient de danger local Gironde.

Score borné [0, 1] agrégeant 14 facteurs en 4 catégories.
Tous les poids sont chargés depuis config/local_coefficient.yaml.
Un facteur indisponible → exclusion + renormalisation automatique.
"""

from __future__ import annotations

import math
import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class FactorScore:
    """Score for a single factor."""

    name: str
    value: float  # raw value
    normalized: float  # [0, 1]
    weight: float  # factor weight
    contribution: float  # normalized × weight
    available: bool
    confidence: str  # "high" | "medium" | "low"


@dataclass
class LocalCoefficientResult:
    """Complete local coefficient computation."""

    score: float  # [0, 1]
    ignition_score: float  # ignition-specific sub-score
    spread_score: float  # spread-specific sub-score
    factors: list[FactorScore]
    n_factors: int
    n_available: int
    renormalized: bool
    quality: dict[str, Any]


class LocalCoefficient:
    """Gironde-specific fire danger coefficient (14 factors)."""

    # Default YAML path
    CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "local_coefficient.yaml"

    def __init__(self, config_path: str | Path | None = None):
        self.config_path = Path(config_path or self.CONFIG_PATH)
        self.config = self._load_config()

    def _load_config(self) -> dict[str, Any]:
        """Load coefficient configuration from YAML."""
        if not self.config_path.exists():
            return self._default_config()
        with open(self.config_path) as f:
            return yaml.safe_load(f) or self._default_config()

    def _default_config(self) -> dict[str, Any]:
        """Fallback hardcoded config if YAML is missing."""
        return {
            "version": "1.0",
            "categories": {
                "secheresse_climat": {"weight": 0.30, "factors": {
                    "dry_days_7d": {"weight": 0.15, "confidence": "high", "func": "linear", "params": {"x0": 0, "x1": 7}},
                    "dry_days_15d": {"weight": 0.20, "confidence": "high", "func": "linear", "params": {"x0": 0, "x1": 15}},
                    "dry_days_30d": {"weight": 0.15, "confidence": "high", "func": "linear", "params": {"x0": 0, "x1": 30}},
                    "heatwave_days": {"weight": 0.15, "confidence": "medium", "func": "threshold", "params": {"x0": 0, "x1": 5}},
                    "soil_moisture_7cm": {"weight": 0.15, "confidence": "high", "func": "inverse_linear", "params": {"x0": 0, "x1": 100}},
                    "vapour_pressure_deficit": {"weight": 0.20, "confidence": "high", "func": "linear", "params": {"x0": 0, "x1": 5}},
                }},
                "combustible": {"weight": 0.25, "factors": {
                    "pine_percentage": {"weight": 0.30, "confidence": "medium", "func": "linear", "params": {"x0": 0, "x1": 100}},
                    "ndmi_anomaly": {"weight": 0.25, "confidence": "low", "func": "inverse_linear", "params": {"x0": -2, "x1": 2}},
                    "forest_density": {"weight": 0.25, "confidence": "medium", "func": "linear", "params": {"x0": 0, "x1": 100}},
                    "recent_clear_cut": {"weight": 0.20, "confidence": "low", "func": "binary", "params": {"x0": 0, "x1": 1}},
                }},
                "facteur_humain": {"weight": 0.30, "factors": {
                    "road_distance": {"weight": 0.20, "confidence": "high", "func": "inverse_linear", "params": {"x0": 0, "x1": 2000}},
                    "amenity_distance": {"weight": 0.15, "confidence": "high", "func": "inverse_linear", "params": {"x0": 0, "x1": 5000}},
                    "building_density": {"weight": 0.15, "confidence": "medium", "func": "linear", "params": {"x0": 0, "x1": 0.5}},
                    "seasonality": {"weight": 0.25, "confidence": "high", "func": "seasonal", "params": {}},
                    "historic_density": {"weight": 0.25, "confidence": "low", "func": "linear", "params": {"x0": 0, "x1": 10}},
                }},
                "terrain": {"weight": 0.15, "factors": {
                    "slope": {"weight": 0.35, "confidence": "medium", "func": "linear", "params": {"x0": 0, "x1": 10}},
                    "coastal_proximity": {"weight": 0.30, "confidence": "low", "func": "inverse_linear", "params": {"x0": 0, "x1": 30000}},
                    "aspect": {"weight": 0.35, "confidence": "low", "func": "aspect_south", "params": {"x0": 0, "x1": 180}},
                }},
            },
        }

    def _normalize(self, func: str, value: float, params: dict) -> float:
        """Normalize a raw value to [0, 1] using the configured function."""
        x0 = params.get("x0", 0)
        x1 = params.get("x1", 1)

        if func == "linear":
            # Linear interpolation from x0→0 to x1→1
            if x1 == x0:
                return 0.0
            return max(0.0, min(1.0, (value - x0) / (x1 - x0)))

        elif func == "inverse_linear":
            # Higher value → lower score
            if x1 == x0:
                return 0.0
            return max(0.0, min(1.0, (x1 - value) / (x1 - x0)))

        elif func == "threshold":
            # 0 until x0, linear to 1 at x1
            if value <= x0:
                return 0.0
            if value >= x1:
                return 1.0
            return (value - x0) / (x1 - x0)

        elif func == "binary":
            return 1.0 if value >= x0 else 0.0

        elif func == "seasonal":
            # Summer months (June-August) → highest risk
            month = int(value) if 1 <= value <= 12 else 1
            if month in (6, 7, 8):
                return 0.9
            elif month in (5, 9):
                return 0.6
            elif month in (4, 10):
                return 0.3
            else:
                return 0.1

        elif func == "aspect_south":
            # South-facing slopes (180°) → higher risk
            # value in degrees, normalize so 180 → 1, 0 → 0
            return 1.0 - abs(value - 180) / 180.0

        return 0.0

    def compute(
        self,
        cell_id: int = 0,
        dry_days_7d: float | None = None,
        dry_days_15d: float | None = None,
        dry_days_30d: float | None = None,
        heatwave_days: float | None = None,
        soil_moisture_7cm: float | None = None,
        vapour_pressure_deficit: float | None = None,
        pine_percentage: float | None = None,
        ndmi_anomaly: float | None = None,
        forest_density: float | None = None,
        recent_clear_cut: float | None = None,
        road_distance: float | None = None,
        amenity_distance: float | None = None,
        building_density: float | None = None,
        seasonality: float | None = None,
        historic_density: float | None = None,
        slope: float | None = None,
        coastal_proximity: float | None = None,
        aspect: float | None = None,
    ) -> LocalCoefficientResult:
        """Compute the local coefficient for a single cell.

        Factors are normalized, weighted, and aggregated.
        Missing factors are excluded with renormalization.
        """
        factors: list[FactorScore] = []
        total_weight = 0.0
        total_ignition_weight = 0.0
        total_spread_weight = 0.0
        weighted_sum = 0.0
        ignition_weighted_sum = 0.0
        spread_weighted_sum = 0.0

        # Map function parameters to input values
        input_map: dict[str, float | None] = {
            "dry_days_7d": dry_days_7d,
            "dry_days_15d": dry_days_15d,
            "dry_days_30d": dry_days_30d,
            "heatwave_days": heatwave_days,
            "soil_moisture_7cm": soil_moisture_7cm,
            "vapour_pressure_deficit": vapour_pressure_deficit,
            "pine_percentage": pine_percentage,
            "ndmi_anomaly": ndmi_anomaly,
            "forest_density": forest_density,
            "recent_clear_cut": recent_clear_cut,
            "road_distance": road_distance,
            "amenity_distance": amenity_distance,
            "building_density": building_density,
            "seasonality": seasonality,
            "historic_density": historic_density,
            "slope": slope,
            "coastal_proximity": coastal_proximity,
            "aspect": aspect,
        }

        # Factors contributing mainly to ignition risk
        ignition_factors = {"dry_days_7d", "dry_days_15d", "heatwave_days",
                            "road_distance", "amenity_distance", "seasonality",
                            "historic_density", "recent_clear_cut"}

        # Factors contributing mainly to spread risk
        spread_factors = {"dry_days_30d", "soil_moisture_7cm",
                          "vapour_pressure_deficit", "pine_percentage",
                          "ndmi_anomaly", "forest_density",
                          "slope", "coastal_proximity", "aspect"}

        for cat_name, category in self.config.get("categories", {}).items():
            cat_weight = category.get("weight", 0.0)
            for f_name, f_config in category.get("factors", {}).items():
                f_weight = f_config.get("weight", 0.0) * cat_weight
                raw_value = input_map.get(f_name)

                if raw_value is not None:
                    norm = self._normalize(
                        f_config.get("func", "linear"),
                        raw_value,
                        f_config.get("params", {}),
                    )
                    available = True
                else:
                    norm = 0.0
                    available = False

                factor = FactorScore(
                    name=f_name,
                    value=raw_value if raw_value is not None else 0.0,
                    normalized=norm,
                    weight=round(f_weight, 4),
                    contribution=round(norm * f_weight, 4),
                    available=available,
                    confidence=f_config.get("confidence", "low"),
                )
                factors.append(factor)

                if available:
                    total_weight += f_weight
                    weighted_sum += norm * f_weight
                    if f_name in ignition_factors:
                        total_ignition_weight += f_weight
                        ignition_weighted_sum += norm * f_weight
                    if f_name in spread_factors:
                        total_spread_weight += f_weight
                        spread_weighted_sum += norm * f_weight

        # Renormalize if some factors are missing
        renormalized = False
        if total_weight > 0 and total_weight < 1.0:
            renormalized = True
            score = weighted_sum / total_weight
            ignition_score = (ignition_weighted_sum / total_ignition_weight
                              if total_ignition_weight > 0 else 0.0)
            spread_score = (spread_weighted_sum / total_spread_weight
                            if total_spread_weight > 0 else 0.0)
        else:
            score = weighted_sum
            ignition_score = ignition_weighted_sum
            spread_score = spread_weighted_sum

        n_available = sum(1 for f in factors if f.available)

        return LocalCoefficientResult(
            score=round(score, 4),
            ignition_score=round(ignition_score, 4),
            spread_score=round(spread_score, 4),
            factors=factors,
            n_factors=len(factors),
            n_available=n_available,
            renormalized=renormalized,
            quality={
                "n_factors_expected": len(factors),
                "n_factors_available": n_available,
                "all_factors_available": n_available == len(factors),
                "renormalized": renormalized,
            },
        )
