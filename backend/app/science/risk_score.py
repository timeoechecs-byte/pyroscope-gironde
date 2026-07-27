"""
Score de risque final — deux scores séparés.

ignition_risk: dominé par facteur humain + sécheresse combustibles fins
spread_risk:   dominé par vent, intensité potentielle, continuité combustible

Agrégation via max(ignition, spread) avec source dominante.
Échelle 0-100, classe qualitative. Aucun pourcentage de probabilité.

Reference: docs/RISK_SCORE.md
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RiskFactorContribution:
    """Single factor contribution to the risk score."""

    name: str
    value: float
    weight: float
    contribution: float
    contribution_pct: float  # relative to total
    confidence: str


@dataclass
class RiskScoreResult:
    """Complete risk score output."""

    ignition_risk: float  # 0-100
    spread_risk: float   # 0-100
    combined_score: float  # max
    dominant_regime: str  # "ignition" | "spread" | "equal"

    # Decomposition
    contributions: list[RiskFactorContribution]

    # Class
    risk_class: str
    risk_class_color: str

    # Quality
    quality: dict[str, Any]


# FWI → normalized [0, 100] (EFFIS scale)
# FWI=0→0, FWI=50→100
def normalize_fwi(fwi: float) -> float:
    """Normalize FWI to 0-100 scale."""
    if fwi <= 0:
        return 0.0
    return min(100.0, fwi * 2.0)


# ROS → spread score contribution
def normalize_ros(ros_m_min: float) -> float:
    """Normalize ROS to 0-100 scale."""
    if ros_m_min <= 0:
        return 0.0
    # ROS < 1 → low, 1-10 → moderate, 10-50 → high, > 50 → extreme
    return min(100.0, ros_m_min * 2.0)


RISK_CLASSES: list[tuple[float, str, str]] = [
    (0.0, "très faible", "text-green-700 bg-green-100"),
    (20.0, "faible", "text-yellow-700 bg-yellow-100"),
    (40.0, "modéré", "text-orange-700 bg-orange-100"),
    (60.0, "élevé", "text-red-700 bg-red-100"),
    (80.0, "très élevé", "text-red-800 bg-red-200"),
    (100.0, "extrême", "text-red-900 bg-red-300"),
]


def classify_risk(score: float) -> tuple[str, str]:
    """Classify a 0-100 risk score."""
    for threshold, label, color in RISK_CLASSES:
        if score <= threshold:
            return label, color
    return "extrême", "text-red-900 bg-red-300"


class RiskScore:
    """Computes the final risk score (ignition + spread separate)."""

    def compute(
        self,
        fwi: float,
        local_coefficient_score: float,
        local_ignition_score: float,
        local_spread_score: float,
        ros_fbp: float,
        ros_rothermel: float | None = None,
        fire_type: str = "surface",
        fuel_confidence: str = "low",
    ) -> RiskScoreResult:
        """Compute risk scores from all inputs.

        Args:
            fwi: Fire Weather Index (from CFFWIS, PHASE 2)
            local_coefficient_score: Combined local coefficient [0, 1]
            local_ignition_score: Ignition sub-score [0, 1]
            local_spread_score: Spread sub-score [0, 1]
            ros_fbp: FBP ROS (m/min)
            ros_rothermel: Rothermel ROS (m/min), optional
            fire_type: "surface", "intermittent", "crown"
            fuel_confidence: Confidence in fuel model assignment

        Returns:
            RiskScoreResult with separated scores.
        """
        # ── Normalize inputs ────────────────────────────────────────
        fwi_norm = normalize_fwi(fwi) / 100.0  # [0, 1]
        ros_norm = normalize_ros(ros_fbp) / 100.0  # [0, 1]

        # Spread dispersion (if both models available)
        ros_dispersion = 0.0
        if ros_rothermel is not None and ros_fbp > 0:
            ros_dispersion = abs(ros_fbp - ros_rothermel) / max(ros_fbp, ros_rothermel)

        # ── Ignition risk ───────────────────────────────────────────
        # Dominated by human factor, fine fuel dryness, local conditions
        ignition_components = {
            "FWI (combustibles fins)": (fwi_norm * 0.20),
            "Coefficient local — facteur humain": (local_ignition_score * 0.40),
            "Coefficient local — sécheresse": (local_coefficient_score * 0.25),
            "Type de feu": (0.10 if fire_type != "surface" else 0.0),
        }
        ignition_raw = sum(ignition_components.values())
        ignition_risk = round(min(100.0, ignition_raw * 100.0), 1)

        # ── Spread risk ─────────────────────────────────────────────
        # Dominated by wind, ROS potential, fuel continuity
        spread_components = {
            "FWI normalisé": (fwi_norm * 0.25),
            "ROS potentielle (FBP)": (ros_norm * 0.30),
            "Coefficient local — combustible": (local_spread_score * 0.25),
            "Type de feu (cime)": (0.15 if fire_type in ("intermittent", "crown") else 0.0),
            "Pente/terrain": (local_coefficient_score * 0.05),
        }
        spread_raw = sum(spread_components.values())
        spread_risk = round(min(100.0, spread_raw * 100.0), 1)

        # ── Combined score ──────────────────────────────────────────
        combined_score = max(ignition_risk, spread_risk)
        if ignition_risk > spread_risk + 5:
            dominant = "ignition"
        elif spread_risk > ignition_risk + 5:
            dominant = "spread"
        else:
            dominant = "equal"

        # ── Decomposition ───────────────────────────────────────────
        all_components = {
            **{f"ignition.{k}": v for k, v in ignition_components.items()},
            **{f"spread.{k}": v for k, v in spread_components.items()},
        }
        total = sum(all_components.values()) or 1.0

        contributions = [
            RiskFactorContribution(
                name=key,
                value=val,
                weight=round(val / total, 3),
                contribution=round(val * 100.0, 1),
                contribution_pct=round(val / total * 100.0, 1),
                confidence=fuel_confidence,
            )
            for key, val in sorted(all_components.items(), key=lambda x: -x[1])
        ]

        # ── Class ───────────────────────────────────────────────────
        ignition_class, ignition_color = classify_risk(ignition_risk)
        spread_class, spread_color = classify_risk(spread_risk)

        quality = {
            "fwi_available": fwi >= 0,
            "ros_fbp_available": ros_fbp > 0,
            "ros_rothermel_available": ros_rothermel is not None and ros_rothermel > 0,
            "ros_dispersion_ratio": round(ros_dispersion, 3),
            "fuel_confidence": fuel_confidence,
            "local_coefficient_available": local_coefficient_score > 0,
        }

        return RiskScoreResult(
            ignition_risk=ignition_risk,
            spread_risk=spread_risk,
            combined_score=round(combined_score, 1),
            dominant_regime=dominant,
            contributions=contributions,
            risk_class=f"{ignition_class} / {spread_class}",
            risk_class_color=f"{ignition_color} / {spread_color}",
            quality=quality,
        )
