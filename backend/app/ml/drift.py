"""
Détection de dérive — surveille la distribution des variables d'entrée.

En climat changeant, un modèle appris sur 2006-2020 vieillit vite.
Métrique Prometheus dédiée, alerte lorsque la dérive dépasse un seuil.
Réentraînement annuel après publication BDIFF validée.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Any


@dataclass
class DriftReport:
    """Report of feature drift between training and current data."""

    n_features: int
    n_drifted: int
    mean_drift_score: float
    max_drift_feature: str
    max_drift_value: float
    drifted_features: list[str]
    alert: bool  # True if drift exceeds threshold


class DriftDetector:
    """Detects feature drift using population stability index (PSI).

    PSI measures how much a feature's distribution has shifted
    from the training reference to the current production data.

    Threshold: PSI > 0.2 → alert (significant drift)
    """

    def __init__(self, reference_data: np.ndarray | None = None,
                 feature_names: list[str] | None = None,
                 psi_threshold: float = 0.2,
                 n_bins: int = 10):
        self.reference = reference_data
        self.feature_names = feature_names or []
        self.psi_threshold = psi_threshold
        self.n_bins = n_bins

    def set_reference(self, data: np.ndarray, feature_names: list[str] | None = None):
        """Set the training data distribution as reference."""
        self.reference = data
        if feature_names:
            self.feature_names = feature_names

    def _compute_psi(self, ref: np.ndarray, current: np.ndarray) -> float:
        """Compute Population Stability Index for a single feature."""
        bins = np.linspace(0, 100, self.n_bins + 1)
        percentiles = np.percentile(ref, bins)
        percentiles[-1] = max(percentiles[-1], np.max(current) + 1e-6)

        ref_counts, _ = np.histogram(ref, bins=percentiles)
        curr_counts, _ = np.histogram(current, bins=percentiles)

        ref_pct = ref_counts / max(ref_counts.sum(), 1)
        curr_pct = curr_counts / max(curr_counts.sum(), 1)

        # Avoid division by zero
        ref_pct = np.clip(ref_pct, 0.001, None)
        curr_pct = np.clip(curr_pct, 0.001, None)

        psi = np.sum((curr_pct - ref_pct) * np.log(curr_pct / ref_pct))
        return float(psi)

    def check(self, current_data: np.ndarray) -> DriftReport:
        """Check drift between reference and current data."""
        if self.reference is None:
            return DriftReport(
                n_features=0, n_drifted=0, mean_drift_score=0.0,
                max_drift_feature="", max_drift_value=0.0,
                drifted_features=[], alert=False,
            )

        drifted = []
        psi_values = []

        for i in range(min(current_data.shape[1], self.reference.shape[1])):
            ref_col = self.reference[:, i]
            curr_col = current_data[:, i]

            # Skip constant columns
            if np.std(ref_col) < 1e-6 or np.std(curr_col) < 1e-6:
                continue

            psi = self._compute_psi(ref_col, curr_col)
            psi_values.append((i, psi, self.feature_names[i] if i < len(self.feature_names) else f"f{i}"))

            if psi > self.psi_threshold:
                drifted.append(self.feature_names[i] if i < len(self.feature_names) else f"f{i}")

        if not psi_values:
            return DriftReport(
                n_features=0, n_drifted=0, mean_drift_score=0.0,
                max_drift_feature="", max_drift_value=0.0,
                drifted_features=[], alert=False,
            )

        max_drift = max(psi_values, key=lambda x: x[1])
        mean_psi = np.mean([v[1] for v in psi_values])

        return DriftReport(
            n_features=len(psi_values),
            n_drifted=len(drifted),
            mean_drift_score=round(mean_psi, 4),
            max_drift_feature=max_drift[2],
            max_drift_value=round(max_drift[1], 4),
            drifted_features=drifted,
            alert=mean_psi > self.psi_threshold,
        )
